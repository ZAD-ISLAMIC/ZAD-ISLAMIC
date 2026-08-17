package com.altaqwaa.moonshinestt;

import android.Manifest;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.core.content.ContextCompat;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaInterface;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.CordovaWebView;
import org.apache.cordova.PluginResult;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Moonshine STT plugin.
 *
 * Runs the Moonshine-tiny-ar ASR model (27M params, bundled GGUF in app
 * assets) on transcribe.cpp (ggml) for fully-local, fast Arabic speech
 * recognition. Moonshine is a whole-utterance encoder-decoder model, so
 * this plugin performs voice-activity detection (VAD) on the native side:
 * continuous audio is buffered and each detected speech segment is decoded
 * and reported via the `result` event.
 *
 * VAD design (v2):
 *  - Adaptive noise floor learned from confirmed-silence frames only, so
 *    quiet rooms and modest background noise both work without manual
 *    threshold tuning, and speech never inflates the floor.
 *  - Start hangover (require N consecutive speech frames) prevents noise
 *    blips from starting an utterance, while the hangover frames THEMSELVES
 *    are buffered (the true onset is never dropped).
 *  - Pre-roll: a short window of leading silence is prepended so the ASR
 *    sees the attack of the first syllable.
 *  - End hangover keeps trailing silence; the utterance is finalized once
 *    the trailing silence exceeds min(endSilenceMs, maxGapMs).
 *  - minSpeechMs is judged on ACTUAL speech frames (not total duration),
 *    so short noise bursts are rejected.
 *  - Every result carries an audio diagnostics payload (sampleRate, RMS,
 *    peak, noise floor, SNR, speech/silence durations, segment index) for
 *    debugging without any performance impact.
 *  - Lifecycle-aware: capture is paused on onPause() and resumed on
 *    onResume(), and mic interruptions self-recover where possible.
 */
public class MoonshineSTT extends CordovaPlugin {
    private static final String TAG = "MoonshineSTT";
    private static final int SAMPLE_RATE = 16000;
    private static final int PCM_FRAME = 320; // 20ms @ 16kHz

    private static final int PRE_ROLL_FRAMES = 4;          // 80ms leading silence
    private static final int MAX_UTTERANCE_SAMPLES = 20 * SAMPLE_RATE; // 20s hard buffer cap

    // Live feedback: decode a GROWING window (from utterance start) while the
    // user is still speaking. Each partial is a superset of the last.
    // DISABLED: the app's counting is strictly pause-based (each finalized
    // segment is decoded once), and growing-window decodes of fast speech
    // produced gibberish on screen while stealing decode budget from the
    // final counts. Partials are kept off to leave the worker free.
    private static final boolean PARTIALS_ENABLED = false;
    private static final int PARTIAL_EVERY_FRAMES = 20;        // every 400ms
    private static final int PARTIAL_MAX_SAMPLES = 6 * SAMPLE_RATE; // up to 6s growing
    private static final int MIN_PARTIAL_SAMPLES = SAMPLE_RATE / 2; // 0.5s

    // Final decode: the whole utterance (up to maxSpeechMs) is decoded, so no
    // repetition spoken early in a long recitation is ever lost to a tail
    // window. maxSpeechMs (5s default) bounds the decode cost.
    private static final int TAIL_FINAL_SAMPLES = MAX_UTTERANCE_SAMPLES;

    // Models are downloaded at runtime (see src/services/models.mjs). The
    // engine loads any transcribe.cpp-compatible GGUF from a path, so the
    // engine is model-agnostic. MODEL_FILE only names the legacy model that
    // older builds extracted from the bundle — kept for a graceful upgrade.
    private static final String MODEL_FILE = "moonshine-tiny-ar-Q8_0.gguf";
    private String currentModelPath = "";

    private CallbackContext listenCallback;
    private Handler mainHandler;
    private ExecutorService worker;

    // Downloads run on their own executor (never the decode worker) and
    // stream straight from the network to a file on disk, so they are
    // immune to the Android WebView HTTP-cache bugs that break `fetch`
    // on large files (net::ERR_CACHE_MISS).
    private ExecutorService downloadExecutor;
    private final AtomicBoolean downloadCancelled = new AtomicBoolean(false);
    private volatile HttpURLConnection currentConnection;
    private volatile boolean downloading = false;

    private AudioRecord audioRecord;
    private Thread recordingThread;
    private final AtomicBoolean listening = new AtomicBoolean(false);

    // VAD state
    private final ShortBuffer utteranceBuffer = new ShortBuffer(MAX_UTTERANCE_SAMPLES);
    private final Deque<short[]> preRoll = new ArrayDeque<>();
    private final ShortBuffer hangoverBuffer = new ShortBuffer(MAX_UTTERANCE_SAMPLES / 4);
    private boolean inSpeech = false;
    private int silenceFrames = 0;
    private int speechFrames = 0;       // frames of actual speech in current utterance
    private int speechCount = 0;        // consecutive speech frames during start hangover
    private long utteranceStartMs = 0;
    private double noiseFloor = 0.001;
    private double utteranceRmsAcc = 0; // Σ rms² for diagnostics
    private short utterancePeak = 0;
    private double noiseFloorAtStart = 0.001;
    private final AtomicInteger segmentIndex = new AtomicInteger(0);

    // Tunable settings (configurable from JS)
    private double vadThreshold = 0.005;      // base RMS energy threshold
    private double noiseRatio = 4.0;          // speech must exceed noiseFloor * noiseRatio
    private int startSpeechFrames = 4;        // consecutive speech frames to begin utterance (80ms)
    private int endSilenceFrames = 10;        // frames of silence to end utterance (200ms)
    private int maxGapBetweenRepeats = 2500;  // max trailing silence before splitting (ms)
    private int minSpeechMs = 150;            // minimum actual-speech duration to accept
    private int maxSpeechMs = 2500;           // hard cap per utterance

    private boolean modelReady = false;
    private boolean pausedByLifecycle = false;

    // Concurrency guards for the single worker thread: partial decodes must
    // never delay a final decode, and at most one partial is in flight.
    private final AtomicBoolean decodeBusy = new AtomicBoolean(false);
    private final AtomicBoolean finalQueued = new AtomicBoolean(false);
    private int partialFrameCounter = 0;

    // Noise floor is learned briefly at session start then frozen, so the
    // speaker's own playback / background audio can never ratchet the VAD
    // threshold upward over time (the "gets dumb after a while" failure).
    private long sessionStartMs = 0;
    private boolean noiseFloorLearned = false;

    @Override
    public void initialize(CordovaInterface cordova, CordovaWebView webView) {
        super.initialize(cordova, webView);
        this.mainHandler = new Handler(Looper.getMainLooper());
        this.worker = Executors.newSingleThreadExecutor();
        this.downloadExecutor = Executors.newSingleThreadExecutor();
        Log.d(TAG, "MoonshineSTT initialized");
    }

    @Override
    public boolean execute(String action, JSONArray args, CallbackContext callbackContext) throws JSONException {
        switch (action) {
            case "initialize":
                initialize(args, callbackContext);
                return true;
            case "startListening":
                startListening(args, callbackContext);
                return true;
            case "stopListening":
                stopListening(callbackContext);
                return true;
            case "getModelInfo":
                getModelInfo(callbackContext);
                return true;
            case "close":
                close(callbackContext);
                return true;
            case "deleteModel":
                deleteModel(args, callbackContext);
                return true;
            case "downloadModel":
                downloadModel(args, callbackContext);
                return true;
            case "cancelDownload":
                cancelDownload(callbackContext);
                return true;
            case "setSettings":
                setSettings(args, callbackContext);
                return true;
            default:
                return false;
        }
    }

    /* ------------------------------ initialize ------------------------------ */

    private void initialize(JSONArray args, CallbackContext callbackContext) {
        final CallbackContext cb = callbackContext;
        JSONObject options = args.optJSONObject(0);
        applySettings(options);
        final String modelPath = options != null ? options.optString("modelPath", "") : "";

        worker.execute(() -> {
            try {
                File modelFile = resolveModel(modelPath);
                currentModelPath = modelFile.getAbsolutePath();
                MoonshineSTTNative.nativeInit(currentModelPath, 4);
                modelReady = true;
                mainHandler.post(() -> {
                    try {
                        sendInitResult(createResultJson(true, "Model loaded successfully"), false, cb);
                    } catch (JSONException e) {
                        Log.e(TAG, "JSON error", e);
                        if (cb != null) cb.error("Init result error");
                    }
                });
            } catch (Throwable t) {
                Log.e(TAG, "Initialization failed", t);
                modelReady = false;
                mainHandler.post(() -> {
                    if (cb != null) cb.error("Initialization failed: " + t.getMessage());
                });
            }
        });
    }

    /**
     * Resolves the model file to load. Prefers the runtime-downloaded model
     * the JS side hands over via `modelPath`; falls back to a previously
     * extracted bundled model; and finally copies the bundled model from
     * APK assets (if present) so the app works offline without a download.
     */
    private File resolveModel(String modelPath) throws IOException {
        if (modelPath != null && !modelPath.isEmpty()) {
            String clean = modelPath.replaceFirst("^file://", "");
            File file = new File(clean);
            if (file.isFile() && file.length() > 1_000_000) {
                return file;
            }
            throw new IOException("Model file not found or too small: " + clean);
        }
        File dir = new File(cordova.getActivity().getFilesDir(), "moonshine");
        File target = new File(dir, MODEL_FILE);
        if (target.isFile() && target.length() > 1_000_000) {
            return target;
        }
        // Try to copy the bundled model from APK assets
        try {
            if (!dir.exists() && !dir.mkdirs()) {
                throw new IOException("Cannot create model directory");
            }
            InputStream in = cordova.getActivity().getAssets().open("models/" + MODEL_FILE);
            OutputStream out = new FileOutputStream(target);
            byte[] buffer = new byte[65536];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            out.close();
            in.close();
            if (target.isFile() && target.length() > 1_000_000) {
                return target;
            }
            throw new IOException("Bundled model extraction failed");
        } catch (IOException e) {
            throw new IOException("No speech model available. Download one from the app settings.");
        }
    }

    /* ---------------------------- start/stop ---------------------------- */

    private void startListening(JSONArray args, CallbackContext callbackContext) {
        if (!modelReady) {
            callbackContext.error("Engine not initialized");
            return;
        }
        if (listening.get()) {
            // Idempotent: already capturing — signal the JS side to refresh
            // callbacks but keep the current session going.
            this.listenCallback = callbackContext;
            sendEvent("start", "");
            sendEvent("listening", "");
            return;
        }

        this.listenCallback = callbackContext;
        JSONObject options = args.optJSONObject(0);
        applySettings(options);

        if (ContextCompat.checkSelfPermission(cordova.getActivity(), Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            cordova.requestPermission(this, 100, Manifest.permission.RECORD_AUDIO);
            return;
        }

        startCapture();
    }

    private void startCapture() {
        worker.execute(() -> {
            if (!listening.get()) {
                resetUtterance();
                preRoll.clear();
                noiseFloor = 0.001;
                noiseFloorLearned = false;
                sessionStartMs = System.currentTimeMillis();
            }
            try {
                int bufferSize = AudioRecord.getMinBufferSize(
                        SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
                if (bufferSize == AudioRecord.ERROR || bufferSize == AudioRecord.ERROR_BAD_VALUE) {
                    sendError("AudioRecord buffer size error");
                    return;
                }

                audioRecord = new AudioRecord(
                        MediaRecorder.AudioSource.VOICE_RECOGNITION,
                        SAMPLE_RATE,
                        AudioFormat.CHANNEL_IN_MONO,
                        AudioFormat.ENCODING_PCM_16BIT,
                        Math.max(4096, bufferSize * 4)
                );

                if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                    sendError("AudioRecord initialization failed");
                    return;
                }

                listening.set(true);
                audioRecord.startRecording();
                recordingThread = new Thread(this::recordingLoop, "moonshine-vad");
                recordingThread.start();

                sendEvent("start", "");
            } catch (Exception e) {
                Log.e(TAG, "Start recording failed", e);
                sendError("Start recording failed: " + e.getMessage());
            }
        });
    }

    private void stopCapture() {
        if (audioRecord != null) {
            try {
                audioRecord.stop();
                audioRecord.release();
            } catch (Exception e) {
                Log.e(TAG, "Error stopping audio record", e);
            }
            audioRecord = null;
        }
        if (recordingThread != null) {
            try {
                recordingThread.join(2000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            recordingThread = null;
        }
    }

    /**
     * Audio capture + VAD loop. Runs on its own thread. PCM is buffered per
     * detected utterance; when an utterance ends (silence or max length) the
     * buffer is handed to the worker for decoding, and the loop keeps going.
     */
    private void recordingLoop() {
        short[] frame = new short[PCM_FRAME];
        int readErrors = 0;

        while (listening.get()) {
            int read;
            try {
                read = audioRecord.read(frame, 0, PCM_FRAME);
            } catch (Exception e) {
                break;
            }
            if (read == AudioRecord.ERROR_DEAD_OBJECT || read == AudioRecord.ERROR_INVALID_OPERATION) {
                if (++readErrors > 20) {
                    Log.e(TAG, "Microphone interrupted (repeated read errors)");
                    sendError("Microphone interrupted");
                    break;
                }
                try {
                    Thread.sleep(10);
                } catch (InterruptedException ignored) {
                    break;
                }
                continue;
            }
            if (read <= 0) continue;
            readErrors = 0;
            if (read < PCM_FRAME) {
                // pad the last frame
                for (int i = read; i < PCM_FRAME; i++) frame[i] = 0;
            }

            double rms = rms(frame, PCM_FRAME);
            boolean isSpeech = rms >= activeThreshold();
            long now = System.currentTimeMillis();

            if (isSpeech) {
                if (!inSpeech) {
                    // start hangover: require a few consecutive speech frames so a
                    // single noise blip cannot start an utterance.
                    speechCount++;
                    if (speechCount == 1) {
                        utteranceRmsAcc = 0;
                        utterancePeak = 0;
                    }
                    appendHangover(frame, rms);
                    if (speechCount >= startSpeechFrames) {
                        beginUtterance(now);
                    }
                } else {
                    speechFrames++;
                    silenceFrames = 0;
                    if (!appendUtterance(frame, rms)) {
                        // buffer cap reached — finalize and start fresh
                        finalizeCurrent();
                        beginUtterance(now);
                        appendUtterance(frame, rms);
                        continue;
                    }
                    if (PARTIALS_ENABLED && ++partialFrameCounter >= PARTIAL_EVERY_FRAMES) {
                        partialFrameCounter = 0;
                        maybeDecodePartial();
                    }
                    if ((now - utteranceStartMs) >= maxSpeechMs) {
                        finalizeCurrent();
                    }
                }
            } else {
                if (inSpeech) {
                    silenceFrames++;
                    // keep a small trailing window of silence in the buffer
                    if (!appendUtterance(frame, rms)) {
                        finalizeCurrent();
                        resetUtterance();
                        continue;
                    }
                    int effectiveEnd = effectiveEndSilenceFrames();
                    boolean silenceLong = silenceFrames >= effectiveEnd;
                    boolean maxReached = (now - utteranceStartMs) >= maxSpeechMs;
                    if (silenceLong || maxReached) {
                        finalizeCurrent();
                    }
                } else {
                    speechCount = 0;
                    hangoverBuffer.clear();
                    updateNoiseFloor(rms);
                    pushPreRoll(frame);
                }
            }
        }

        // flush remaining utterance on stop
        if (inSpeech && !utteranceBuffer.isEmpty()) {
            finalizeCurrent();
        }
    }

    /** Frames of trailing silence that end an utterance (bounded by maxGapMs). */
    private int effectiveEndSilenceFrames() {
        int gapFrames = Math.max(5, maxGapBetweenRepeats / 20);
        return Math.max(5, Math.min(endSilenceFrames, gapFrames));
    }

    private double activeThreshold() {
        double quiet = vadThreshold * 0.4; // allow detecting below the fixed threshold in quiet rooms
        double threshold = Math.max(noiseFloor * noiseRatio, quiet);
        return Math.max(0.0003, Math.min(0.1, threshold));
    }

    /**
     * Tracks a slowly-adapting noise floor. Called on confirmed-silence
     * frames ONLY so speech energy can never inflate the floor.
     *
     * The floor is only allowed to settle during a short learning window at
     * session start; afterwards it may only drift DOWN. This keeps playback
     * audio / ambient noise from inflating the VAD threshold over time (the
     * "becomes dumb after a while" failure when reciting along with audio).
     */
    private void updateNoiseFloor(double rms) {
        if (rms > 0) {
            if (!noiseFloorLearned) {
                if (rms > noiseFloor) {
                    noiseFloor += (rms - noiseFloor) * 0.05;
                } else {
                    noiseFloor += (rms - noiseFloor) * 0.15;
                }
                if (System.currentTimeMillis() - sessionStartMs > 2000) {
                    noiseFloorLearned = true;
                }
            } else if (rms < noiseFloor) {
                noiseFloor += (rms - noiseFloor) * 0.15;
            }
            if (noiseFloor < 0.0003) noiseFloor = 0.0003;
            if (noiseFloor > 0.012) noiseFloor = 0.012;
        }
    }

    private void pushPreRoll(short[] frame) {
        if (preRoll.size() >= PRE_ROLL_FRAMES) preRoll.removeFirst();
        preRoll.addLast(frame.clone());
    }

    private void appendHangover(short[] frame, double rms) {
        hangoverBuffer.add(frame, PCM_FRAME);
        utteranceRmsAcc += rms * rms;
        updatePeak(frame);
    }

    /** Start an utterance with pre-roll silence + the hangover speech frames. */
    private void beginUtterance(long now) {
        inSpeech = true;
        silenceFrames = 0;
        speechFrames = Math.max(startSpeechFrames, speechCount);
        utteranceBuffer.clear();
        for (short[] f : preRoll) {
            utteranceBuffer.add(f, PCM_FRAME);
        }
        utteranceBuffer.add(hangoverBuffer.data, hangoverBuffer.size);
        hangoverBuffer.clear();
        // approximate time of the first speech frame
        utteranceStartMs = now - (speechCount * 20L);
        noiseFloorAtStart = noiseFloor;
    }

    /** Append one frame; returns false if the utterance buffer cap was reached. */
    private boolean appendUtterance(short[] frame, double rms) {
        if (utteranceBuffer.size + PCM_FRAME > MAX_UTTERANCE_SAMPLES) return false;
        utteranceBuffer.add(frame, PCM_FRAME);
        utteranceRmsAcc += rms * rms;
        updatePeak(frame);
        return true;
    }

    private void updatePeak(short[] frame) {
        for (short s : frame) {
            short a = (short) Math.abs(s);
            if (a > utterancePeak) utterancePeak = a;
        }
    }

    private void finalizeCurrent() {
        int n = utteranceBuffer.size;
        if (n < SAMPLE_RATE / 10) { // ignore < 100ms total
            resetUtterance();
            return;
        }
        long speechMs = speechFrames * 20L;
        long totalMs = n * 1000L / SAMPLE_RATE;
        if (speechMs < minSpeechMs) { // ignore if not enough REAL speech
            resetUtterance();
            return;
        }

        // Decode only the recent tail of long utterances so the count lands
        // quickly after the speaker stops. Short utterances decode in full.
        int decodeFrom = 0;
        if (n > TAIL_FINAL_SAMPLES) decodeFrom = n - TAIL_FINAL_SAMPLES;
        final int dn = n - decodeFrom;
        final short[] samples = new short[dn];
        utteranceBuffer.copyTo(samples, decodeFrom, dn);

        final double rms = Math.sqrt(utteranceRmsAcc / Math.max(1, speechFrames));
        final double peak = utterancePeak / 32768.0;
        final double noise = noiseFloorAtStart;
        final double snr = 20.0 * Math.log10((rms + 1e-9) / (noise + 1e-9));
        final long silentMs = Math.max(0, totalMs - speechMs);
        final int idx = segmentIndex.incrementAndGet();

        resetUtterance();

        finalQueued.set(true);
        worker.execute(() -> {
            try {
                decodeAndReport(samples, rms, peak, noise, snr, speechMs, silentMs, totalMs, idx);
            } finally {
                finalQueued.set(false);
            }
        });
    }

    private void resetUtterance() {
        inSpeech = false;
        silenceFrames = 0;
        speechFrames = 0;
        speechCount = 0;
        utteranceBuffer.clear();
        hangoverBuffer.clear();
        utteranceRmsAcc = 0;
        utterancePeak = 0;
        partialFrameCounter = 0;
    }

    /**
     * Decode one utterance on the worker thread and report the transcript
     * together with the audio diagnostics.
     */
    private void decodeAndReport(short[] samples, double rms, double peak, double noise,
                                 double snr, long speechMs, long silentMs, long totalMs, int idx) {
        if (!listening.get()) return;
        try {
            float[] pcm = new float[samples.length];
            for (int i = 0; i < samples.length; i++) {
                pcm[i] = samples[i] / 32768.0f;
            }
            long t0 = System.currentTimeMillis();
            byte[] raw = MoonshineSTTNative.nativeTranscribe(pcm, pcm.length);
            long decodeMs = System.currentTimeMillis() - t0;
            String text = decodeText(raw);
            if (text != null && !text.trim().isEmpty()) {
                sendResultEvent(text.trim(), rms, peak, noise, snr, speechMs, silentMs, totalMs, idx, decodeMs);
            }
        } catch (Throwable t) {
            Log.e(TAG, "Decode failed", t);
        }
    }

    /**
     * Schedule a live partial decode of the sliding tail window. Guarded so
     * at most one partial runs at a time and never while a final is queued —
     * partials are display-only and must never delay the authoritative count.
     */
    private void maybeDecodePartial() {
        if (!listening.get() || !inSpeech) return;
        if (decodeBusy.get() || finalQueued.get()) return;
        int n = utteranceBuffer.size;
        if (n < MIN_PARTIAL_SAMPLES) return;
        // Growing window: decode from utterance start up to PARTIAL_MAX_SAMPLES,
        // so consecutive partials are supersets (monotonic transcript).
        int window = Math.min(n, PARTIAL_MAX_SAMPLES);
        final short[] samples = new short[window];
        utteranceBuffer.copyTo(samples, 0, window);
        decodeBusy.set(true);
        worker.execute(() -> {
            try {
                decodePartial(samples);
            } catch (Throwable t) {
                Log.e(TAG, "Partial decode failed", t);
            } finally {
                decodeBusy.set(false);
            }
        });
    }

    private void decodePartial(short[] samples) {
        if (!listening.get() || finalQueued.get()) return;
        try {
            float[] pcm = new float[samples.length];
            for (int i = 0; i < samples.length; i++) {
                pcm[i] = samples[i] / 32768.0f;
            }
            long t0 = System.currentTimeMillis();
            byte[] raw = MoonshineSTTNative.nativeTranscribe(pcm, pcm.length);
            long decodeMs = System.currentTimeMillis() - t0;
            String text = decodeText(raw);
            if (text != null && !text.trim().isEmpty()) {
                sendPartialEvent(text.trim(), decodeMs);
            }
        } catch (Throwable t) {
            Log.e(TAG, "Partial decode failed", t);
        }
    }

    private void stopListening(CallbackContext callbackContext) {
        worker.execute(() -> {
            listening.set(false);
            stopCapture();
            mainHandler.post(() -> {
                sendEvent("end", "");
                if (callbackContext != null) callbackContext.success();
            });
        });
    }

    /* ------------------------------- settings ------------------------------- */

    private void setSettings(JSONArray args, CallbackContext callbackContext) {
        JSONObject options = args.optJSONObject(0);
        applySettings(options);
        callbackContext.success();
    }

    private void applySettings(JSONObject options) {
        if (options == null) return;
        vadThreshold = clamp(options.optDouble("vadThreshold", vadThreshold), 0.0005, 0.1);
        noiseRatio = clamp(options.optDouble("noiseRatio", noiseRatio), 1.0, 12.0);
        endSilenceFrames = (int) clamp(options.optDouble("endSilenceMs", endSilenceFrames * 20.0) / 20.0, 5, 40);
        maxGapBetweenRepeats = (int) clamp(options.optDouble("maxGapMs", maxGapBetweenRepeats), 200, 6000);
        minSpeechMs = (int) clamp(options.optDouble("minSpeechMs", minSpeechMs), 100, 1000);
        maxSpeechMs = (int) clamp(options.optDouble("maxSpeechMs", maxSpeechMs), 2000, 30000);
        Log.d(TAG, "settings: threshold=" + vadThreshold + " ratio=" + noiseRatio
                + " endSilenceMs=" + (endSilenceFrames * 20)
                + " maxGap=" + maxGapBetweenRepeats);
    }

    private static double clamp(double v, double min, double max) {
        return Math.max(min, Math.min(max, v));
    }

    private static double rms(short[] frame, int len) {
        double sum = 0;
        for (int i = 0; i < len; i++) {
            double s = frame[i] / 32768.0;
            sum += s * s;
        }
        return Math.sqrt(sum / len);
    }

    /* ------------------------------- helpers ------------------------------- */

    private void getModelInfo(CallbackContext callbackContext) {
        try {
            JSONObject info = new JSONObject();
            info.put("initialized", modelReady);
            info.put("engine", "transcribe.cpp");
            info.put("version", MoonshineSTTNative.nativeVersion());
            info.put("modelPath", currentModelPath != null ? currentModelPath : "");
            info.put("modelFile", currentModelPath != null ? new File(currentModelPath).getName() : "");
            callbackContext.success(info);
        } catch (Exception e) {
            callbackContext.error(e.getMessage());
        }
    }

    /**
     * Closes the native session so a different model can be loaded, and
     * stops any active capture. Used when switching models at runtime.
     */
    private void close(CallbackContext callbackContext) {
        worker.execute(() -> {
            if (listening.get()) {
                listening.set(false);
                stopCapture();
            }
            MoonshineSTTNative.nativeClose();
            modelReady = false;
            mainHandler.post(() -> {
                if (callbackContext != null) callbackContext.success();
            });
        });
    }

    /**
     * Deletes a downloaded model file. The file name is validated (plain
     * gguf name, no path separators) to keep it inside the models dir.
     */
    private void deleteModel(JSONArray args, CallbackContext callbackContext) {
        String fileName = args.optString(0, "");
        if (fileName == null || !fileName.matches("[A-Za-z0-9._-]+\\.gguf")) {
            callbackContext.error("invalid file name");
            return;
        }
        worker.execute(() -> {
            File dir = new File(cordova.getActivity().getFilesDir(), "moonshine");
            File target = new File(dir, fileName);
            if (!target.exists() || target.delete()) {
                mainHandler.post(() -> callbackContext.success());
            } else {
                mainHandler.post(() -> callbackContext.error("delete failed: " + fileName));
            }
        });
    }

    /* ------------------------------ download ------------------------------- */

    /**
     * Downloads a GGUF model from the catalog straight to disk. Bypasses the
     * WebView HTTP stack entirely (Android WebView cannot stream large files
     * reliably via fetch — net::ERR_CACHE_MISS) and reports progress through
     * keep-callback events so the JS UI can show a real percentage.
     *
     * Args: { url, fileName, expectedSize }
     */
    private void downloadModel(JSONArray args, CallbackContext callbackContext) {
        JSONObject options = args.optJSONObject(0);
        if (options == null) {
            callbackContext.error("invalid arguments");
            return;
        }
        final String url = options.optString("url", "");
        final String fileName = options.optString("fileName", "");
        final long expectedSize = options.optLong("expectedSize", 0);

        if (url == null || !url.startsWith("https://")) {
            callbackContext.error("invalid url");
            return;
        }
        if (fileName == null || !fileName.matches("[A-Za-z0-9._-]+\\.gguf")) {
            callbackContext.error("invalid file name");
            return;
        }
        if (downloading) {
            sendDownloadError(callbackContext, "busy", 0, "download already in progress");
            return;
        }

        downloading = true;
        downloadCancelled.set(false);

        downloadExecutor.execute(() -> {
            try {
                File dir = new File(cordova.getActivity().getFilesDir(), "moonshine");
                if (!dir.exists() && !dir.mkdirs()) {
                    sendDownloadError(callbackContext, "permission", 0, "cannot create model directory");
                    return;
                }
                File part = new File(dir, fileName + ".part");
                File target = new File(dir, fileName);
                long received = 0;
                long from = part.exists() ? part.length() : 0;
                HttpURLConnection conn = openDownload(url, from);
                currentConnection = conn;
                try {
                    int status = conn.getResponseCode();
                    if (status < 200 || status >= 300) {
                        sendDownloadError(callbackContext, "http", status, "HTTP " + status);
                        return;
                    }
                    long contentLength = conn.getContentLengthLong();
                    long total = expectedSize > 0 ? expectedSize : 0;
                    if (status == 206) {
                        // server honoured the Range request — continue appending
                        if (contentLength > 0) total = from + contentLength;
                        received = from;
                    } else {
                        // server ignored Range (or fresh start) — begin from zero
                        from = 0;
                        received = 0;
                        if (contentLength > 0) total = contentLength;
                        if (part.exists()) {
                            //noinspection ResultOfMethodCallIgnored
                            part.delete();
                        }
                    }

                    try (InputStream in = new BufferedInputStream(conn.getInputStream());
                         OutputStream out = new BufferedOutputStream(
                                 new FileOutputStream(part, from > 0))) {
                        byte[] buffer = new byte[65536];
                        int read;
                        long lastEmit = 0;
                        while ((read = in.read(buffer)) != -1) {
                            if (downloadCancelled.get()) {
                                sendDownloadError(callbackContext, "cancelled", 0, "cancelled");
                                return;
                            }
                            out.write(buffer, 0, read);
                            received += read;
                            long now = System.currentTimeMillis();
                            if (now - lastEmit > 150 || received >= total) {
                                lastEmit = now;
                                sendDownloadProgress(callbackContext, received, total);
                            }
                        }
                        out.flush();
                    }
                } finally {
                    conn.disconnect();
                    currentConnection = null;
                }

                if (expectedSize > 0 && Math.abs(received - expectedSize) > 65536) {
                    //noinspection ResultOfMethodCallIgnored
                    part.delete();
                    sendDownloadError(callbackContext, "incomplete", 0, "size mismatch");
                    return;
                }
                if (target.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    target.delete();
                }
                if (!part.renameTo(target)) {
                    sendDownloadError(callbackContext, "storage", 0, "rename failed");
                    return;
                }

                JSONObject result = new JSONObject();
                result.put("success", true);
                result.put("nativePath", target.getAbsolutePath());
                result.put("size", received);
                sendDownloadResult(result, callbackContext);
            } catch (SocketTimeoutException e) {
                sendDownloadError(callbackContext, "timeout", 0, "connection timed out");
            } catch (IOException e) {
                if (downloadCancelled.get()) {
                    sendDownloadError(callbackContext, "cancelled", 0, "cancelled");
                } else {
                    sendDownloadError(callbackContext, "network", 0, e.getMessage());
                }
            } catch (JSONException e) {
                Log.e(TAG, "Download result JSON error", e);
                sendDownloadError(callbackContext, "network", 0, "result error");
            } finally {
                downloading = false;
                currentConnection = null;
            }
        });
    }

    private void cancelDownload(CallbackContext callbackContext) {
        downloadCancelled.set(true);
        HttpURLConnection conn = currentConnection;
        if (conn != null) {
            conn.disconnect();
        }
        if (callbackContext != null) callbackContext.success();
    }

    /**
     * Opens a connection following redirects manually (Hugging Face resolves
     * to a CDN), re-attaching the Range header on each hop so resumed
     * downloads keep working.
     */
    private HttpURLConnection openDownload(String url, long from) throws IOException {
        String current = url;
        for (int i = 0; i < 10; i++) {
            HttpURLConnection conn = (HttpURLConnection) new URL(current).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(20000);
            conn.setRequestProperty("User-Agent", "AlTaqwaa/1.0 (Cordova; Android)");
            conn.setRequestProperty("Accept", "*/*");
            if (from > 0) {
                conn.setRequestProperty("Range", "bytes=" + from + "-");
            }
            int code = conn.getResponseCode();
            if (code >= 300 && code < 400) {
                String location = conn.getHeaderField("Location");
                conn.disconnect();
                if (location == null) throw new IOException("redirect without location");
                current = location.startsWith("http") ? location
                        : new URL(new URL(current), location).toString();
                continue;
            }
            return conn;
        }
        throw new IOException("too many redirects");
    }

    private void sendDownloadProgress(CallbackContext cb, long loaded, long total) {
        if (cb == null) return;
        try {
            JSONObject json = new JSONObject();
            json.put("event", "progress");
            json.put("loaded", loaded);
            json.put("total", total);
            PluginResult result = new PluginResult(PluginResult.Status.OK, json);
            result.setKeepCallback(true);
            cb.sendPluginResult(result);
        } catch (JSONException e) {
            Log.e(TAG, "Progress JSON error", e);
        }
    }

    private void sendDownloadResult(JSONObject payload, CallbackContext cb) {
        if (cb != null) {
            PluginResult result = new PluginResult(PluginResult.Status.OK, payload);
            cb.sendPluginResult(result);
        }
    }

    private void sendDownloadError(CallbackContext cb, String code, int httpStatus, String message) {
        if (cb == null) return;
        try {
            JSONObject json = new JSONObject();
            json.put("success", false);
            json.put("code", code);
            json.put("httpStatus", httpStatus);
            json.put("message", message);
            PluginResult result = new PluginResult(PluginResult.Status.OK, json);
            cb.sendPluginResult(result);
        } catch (JSONException e) {
            Log.e(TAG, "Download error JSON error", e);
        }
    }

    /**
     * Decodes the raw UTF-8 bytes the native engine returns. Uses a lenient
     * decoder so a truncated mid-character sequence (a partial decode sliced
     * mid-phrase) becomes U+FFFD instead of crashing the app with a JNI
     * Modified-UTF-8 abort.
     */
    private static String decodeText(byte[] raw) {
        if (raw == null) return null;
        if (raw.length == 0) return "";
        try {
            return new String(raw, "UTF-8");
        } catch (Exception e) {
            Log.e(TAG, "Decode failed", e);
            return null;
        }
    }

    private void sendEvent(String event, String text) {
        if (listenCallback == null) return;
        try {
            JSONObject json = new JSONObject();
            json.put("event", event);
            if (text != null && !text.isEmpty()) {
                json.put("text", text);
            }
            PluginResult result = new PluginResult(PluginResult.Status.OK, json);
            result.setKeepCallback(true);
            listenCallback.sendPluginResult(result);
        } catch (JSONException e) {
            Log.e(TAG, "Error sending event", e);
        }
    }

    private void sendResultEvent(String text, double rms, double peak, double noise, double snr,
                                 long speechMs, long silentMs, long totalMs, int idx, long decodeMs) {
        if (listenCallback == null) return;
        try {
            JSONObject diag = new JSONObject();
            diag.put("sampleRate", SAMPLE_RATE);
            diag.put("channels", 1);
            diag.put("durationMs", totalMs);
            diag.put("speechMs", speechMs);
            diag.put("silenceMs", silentMs);
            diag.put("rms", rms);
            diag.put("peak", peak);
            diag.put("noiseFloor", noise);
            diag.put("snr", snr);
            diag.put("segmentIndex", idx);
            diag.put("decodeMs", decodeMs);

            JSONObject json = new JSONObject();
            json.put("event", "result");
            json.put("text", text);
            json.put("diag", diag);
            PluginResult result = new PluginResult(PluginResult.Status.OK, json);
            result.setKeepCallback(true);
            listenCallback.sendPluginResult(result);
        } catch (JSONException e) {
            Log.e(TAG, "Error sending result", e);
        }
    }

    private void sendPartialEvent(String text, long decodeMs) {
        if (listenCallback == null) return;
        try {
            JSONObject diag = new JSONObject();
            diag.put("sampleRate", SAMPLE_RATE);
            diag.put("channels", 1);
            diag.put("decodeMs", decodeMs);

            JSONObject json = new JSONObject();
            json.put("event", "partial");
            json.put("text", text);
            json.put("diag", diag);
            PluginResult result = new PluginResult(PluginResult.Status.OK, json);
            result.setKeepCallback(true);
            listenCallback.sendPluginResult(result);
        } catch (JSONException e) {
            Log.e(TAG, "Error sending partial", e);
        }
    }

    private void sendError(String message) {
        if (listenCallback != null) {
            mainHandler.post(() -> {
                if (listenCallback != null) {
                    listenCallback.error(message);
                    listenCallback = null;
                }
            });
        }
    }

    private void sendInitResult(JSONObject payload, boolean keepCallback, CallbackContext cb) {
        if (cb != null) {
            PluginResult result = new PluginResult(PluginResult.Status.OK, payload);
            result.setKeepCallback(keepCallback);
            cb.sendPluginResult(result);
        }
    }

    private JSONObject createResultJson(boolean success, String message) throws JSONException {
        JSONObject json = new JSONObject();
        json.put("success", success);
        json.put("message", message);
        return json;
    }

    @Override
    public void onRequestPermissionResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == 100) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startCapture();
            } else {
                if (listenCallback != null) {
                    listenCallback.error("Microphone permission denied");
                    listenCallback = null;
                }
            }
        }
    }

    @Override
    public void onPause(boolean multitasking) {
        super.onPause(multitasking);
        if (listening.get() && audioRecord != null) {
            pausedByLifecycle = true;
            stopCapture();
            Log.d(TAG, "capture paused (lifecycle)");
        }
    }

    @Override
    public void onResume(boolean multitasking) {
        super.onResume(multitasking);
        if (pausedByLifecycle) {
            pausedByLifecycle = false;
            if (listening.get() && modelReady) {
                startCapture();
                Log.d(TAG, "capture resumed (lifecycle)");
            }
        }
    }

    @Override
    public void onDestroy() {
        listening.set(false);
        stopCapture();
        downloadCancelled.set(true);
        HttpURLConnection conn = currentConnection;
        if (conn != null) {
            conn.disconnect();
        }
        if (downloadExecutor != null) {
            downloadExecutor.shutdown();
        }
        worker.execute(MoonshineSTTNative::nativeClose);
        super.onDestroy();
    }
}

/**
 * Growable primitive short buffer for the VAD audio path.
 *
 * The real-time capture loop appends every PCM sample. An autoboxed
 * {@code List<Short>} allocates 16,384 boxed Short objects per second of
 * audio (320 samples/frame × 50 frames/s) → needless GC pressure. This
 * primitive array grows in place and reuses its backing array in steady
 * state, keeping the audio + decode pipeline allocation-free.
 */
final class ShortBuffer {
    short[] data;
    int size;

    ShortBuffer(int initialCapacity) {
        data = new short[Math.max(32, initialCapacity)];
    }

    void add(short[] src, int len) {
        if (size + len > data.length) grow(size + len);
        System.arraycopy(src, 0, data, size, len);
        size += len;
    }

    void copyTo(short[] dst, int from, int len) {
        System.arraycopy(data, from, dst, 0, len);
    }

    void clear() {
        size = 0;
    }

    boolean isEmpty() {
        return size == 0;
    }

    private void grow(int minCap) {
        int newCap = Math.max(Math.max(minCap, size * 2), 32);
        data = java.util.Arrays.copyOf(data, newCap);
    }
}
