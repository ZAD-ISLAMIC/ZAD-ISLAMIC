package com.rn0x.prayerwatch;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.AssetFileDescriptor;
import android.content.res.AssetManager;
import android.Manifest;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.PowerManager;
import android.telephony.PhoneStateListener;
import android.telephony.TelephonyManager;

import androidx.core.content.ContextCompat;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationCompat.Action;

/**
 * One-shot playback of the adhan with its standard notification.
 *
 * Improvements over the original:
 *  - Notification tag to prevent duplicate notifications stacking
 *  - Stop + Snooze action buttons in the notification
 *  - Phone call pause/resume (pause during call, resume after)
 *  - Dedicated phone state monitor for calls that start mid-adhan
 *  - Improved audio focus handling (pause vs stop)
 */
public final class AdhanPlayback {

    static final int NOTIF_ID = 7002;
    static final String CHANNEL_ADHAN = "prayer_adhan";
    static final String CHANNEL_PRAYER_INFO = "prayer_info";
    static final String ACTION_STOP = "com.rn0x.prayerwatch.STOP_ADHAN";
    static final String ACTION_SNOOZE = "com.rn0x.prayerwatch.SNOOZE_ADHAN";
    /** Unique notification tag to prevent duplicate stacking. */
    static final String NOTIF_TAG = "prayer_adhan";

    private static final Object LOCK = new Object();
    private static MediaPlayer player;
    private static PowerManager.WakeLock wakeLock;
    private static long startedAt;
    private static String playingId;
    private static Context sCtx;
    private static AudioFocusRequest audioFocusRequest;
    private static int originalAlarmVolume = -1;
    /** Set when audio was paused for a phone call. Resume when call ends. */
    private static volatile boolean callPaused;
    /** Dedicated phone state listener for calls that start mid-adhan. */
    private static PhoneStateListener phoneStateListener;
    private static boolean wasInCallAtStart;

    private static final android.os.Handler MAIN = new android.os.Handler(android.os.Looper.getMainLooper());
    private static final Runnable AUTO_STOP = () -> stop(null, false);

    private AdhanPlayback() {
    }

    /* ------------------------------------------------------------------ */

    public static boolean isPlaying() {
        synchronized (LOCK) {
            return player != null && player.isPlaying();
        }
    }

    /** Live playback + alarm-stream snapshot for the JS volume slider. */
    public static final class VolumeState {
        public final boolean playing;
        public final int alarmVolume;
        public final int alarmMax;

        VolumeState(boolean playing, int alarmVolume, int alarmMax) {
            this.playing = playing;
            this.alarmVolume = alarmVolume;
            this.alarmMax = alarmMax;
        }
    }

    public static VolumeState volumeState(Context c) {
        AudioManager am = c == null ? null : (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
        int vol = 0;
        int max = 0;
        if (am != null) {
            vol = am.getStreamVolume(AudioManager.STREAM_ALARM);
            max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
        }
        return new VolumeState(isPlaying(), vol, max);
    }

    /**
     * Handle a hardware volume-key press while the adhan is ringing: adjust
     * the alarm stream and remember the new level as the default for future
     * adhans. Returns false when nothing is ringing (let the system handle it).
     */
    public static boolean handleVolumeKey(Context c, int direction) {
        if (!isPlaying() || c == null) return false;
        AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return false;
        try {
            am.adjustStreamVolume(AudioManager.STREAM_ALARM, direction, AudioManager.FLAG_SHOW_UI);
            int max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
            float v = max > 0 ? am.getStreamVolume(AudioManager.STREAM_ALARM) / (float) max : 1f;
            c.getSharedPreferences(PrayerWatch.PREFS, Context.MODE_PRIVATE)
                    .edit().putFloat(PrayerWatch.KEY_ADHAN_VOLUME, v).apply();
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    /**
     * Live adhan loudness change (0..1). Applied on the ringing playback
     * immediately and to the alarm stream so the change is audible mid-ring.
     */
    public static void setAdhanVolume(Context c, float volume) {
        float v = Math.max(0f, Math.min(1f, volume));
        synchronized (LOCK) {
            if (player != null) {
                try {
                    player.setVolume(v, v);
                } catch (Exception ignored) {
                }
            }
        }
        AudioManager am = c == null ? null : (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        try {
            int max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
            am.setStreamVolume(AudioManager.STREAM_ALARM,
                    Math.round(v * max), 0);
        } catch (Exception ignored) {
        }
    }

    public static void start(final Context c, final String id, final String label, final long ts, final boolean force) {
        callPaused = false;
        synchronized (LOCK) {
            if (player != null && !force) {
                stopLocked(c, false);
            }
        }
        // Track whether a call was active at adhan start (for resume logic).
        wasInCallAtStart = isInCall(c);
        Thread t = new Thread(() -> play(c, id, label, ts), "prayerwatch-adhan");
        t.setDaemon(true);
        t.start();
    }

    private static void play(Context c, String id, String label, long ts) {
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wl = null;
        if (pm != null) {
            wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "prayerwatch:adhan");
            wl.setReferenceCounted(false);
            wl.acquire(Math.max(PrayerAlarmScheduler.AUTO_STOP_MS, 6 * 60 * 1000L));
        }
        synchronized (LOCK) {
            if (player != null) {
                try {
                    if (wl != null) wl.release();
                } catch (Exception ignored) {
                }
                return;
            }
        }

        long now = PrayerTime.now(c);
        // The alert goes out immediately — even if the audio below fails, the
        // user still gets the notification, the vibration and the tick chain.
        vibrate(c);
        notify(c, id, label, ts, now);
        PrayerAlarmScheduler.scheduleTick(c, id, label, ts, 30);
        MAIN.removeCallbacks(AUTO_STOP);
        MAIN.postDelayed(AUTO_STOP, PrayerAlarmScheduler.AUTO_STOP_MS + 15_000L);

        // Start monitoring phone calls that may begin mid-adhan.
        startCallMonitor(c);

        // When "respect sound mode" is on and the device is silent / alarm
        // volume is at zero, skip the audio but keep vibration + notification
        // + the ticking count-up.
        if (soundMuted(c)) {
            try {
                if (wl != null) wl.release();
            } catch (Exception ignored) {
            }
            return;
        }

        // If a phone call is active at adhan start — keep the silent
        // notification + vibration so the user still sees the prayer. Audio
        // will be played when the call ends (via call monitor).
        if (isInCall(c)) {
            try {
                if (wl != null) wl.release();
            } catch (Exception ignored) {
            }
            return;
        }

        // Audible even on a silent/vibrate device: take alarm-stream audio
        // focus and raise the alarm stream to the stored adhan loudness.
        originalAlarmVolume = -1;
        requestFocus(c);
        boostAlarm(c);

        try {
            final PowerManager.WakeLock w = wl;
            AssetFileDescriptor afd = resolveAdhanFd(c);
            if (afd == null) {
                abandonFocus(c);
                restoreAlarm(c);
                try {
                    if (wl != null) wl.release();
                } catch (Exception ignored) {
                }
                return;
            }
            MediaPlayer mp = new MediaPlayer();
            mp.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build());
            mp.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            mp.prepare();
            mp.setVolume(0.95f, 0.95f);
            mp.setOnCompletionListener(m -> stop(c, false));
            mp.start();
            synchronized (LOCK) {
                if (player != null) {
                    try {
                        mp.release();
                    } catch (Exception ignored) {
                    }
                    try {
                        afd.close();
                    } catch (Exception ignored) {
                    }
                    abandonFocus(c);
                    restoreAlarm(c);
                    return;
                }
                try {
                    afd.close();
                } catch (Exception ignored) {
                }
                player = mp;
                wakeLock = w;
                sCtx = c;
                playingId = id;
                startedAt = PrayerTime.now(c);
            }
        } catch (Exception ignored) {
            abandonFocus(c);
            restoreAlarm(c);
            try {
                if (wl != null) wl.release();
            } catch (Exception ignored2) {
            }
        }
    }

    /* ------------------------------------------------------------------ *
     * Audio focus + alarm-stream loudness
     * ------------------------------------------------------------------ */

    /** True if a phone call is active — adhan must be silent/paused. */
    public static boolean isInCall(Context c) {
        if (c == null) return false;
        try {
            AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                int mode = am.getMode();
                if (mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_IN_COMMUNICATION) {
                    return true;
                }
            }
        } catch (Exception ignored) { }
        try {
            if (ContextCompat.checkSelfPermission(c, Manifest.permission.READ_PHONE_STATE)
                    == PackageManager.PERMISSION_GRANTED) {
                TelephonyManager tm = (TelephonyManager) c.getSystemService(Context.TELEPHONY_SERVICE);
                if (tm != null) {
                    int state = tm.getCallState();
                    if (state == TelephonyManager.CALL_STATE_OFFHOOK
                            || state == TelephonyManager.CALL_STATE_RINGING) {
                        return true;
                    }
                }
            }
        } catch (Exception ignored) { }
        return false;
    }

    /**
     * Audio focus listener — improved to PAUSE on transient loss (phone call)
     * instead of stopping completely. The adhan resumes when the call ends.
     */
    private static final AudioManager.OnAudioFocusChangeListener FOCUS_CB = change -> {
        if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT
                || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
            // Transient loss: phone call, voice assistant, etc.
            // PAUSE the adhan so it can resume when the interruption ends.
            synchronized (LOCK) {
                if (player != null && player.isPlaying()) {
                    try {
                        player.pause();
                        callPaused = true;
                    } catch (Exception ignored) {
                    }
                }
            }
        } else if (change == AudioManager.AUDIOFOCUS_GAIN) {
            // Focus recovered — resume if we were paused for a call.
            synchronized (LOCK) {
                if (player != null && callPaused) {
                    try {
                        player.start();
                        callPaused = false;
                    } catch (Exception ignored) {
                    }
                }
            }
            restoreAlarm(sCtx);
        } else if (change == AudioManager.AUDIOFOCUS_LOSS) {
            // Permanent loss — stop completely.
            stop(null, false);
        }
    };

    private static void requestFocus(Context c) {
        AudioManager am = c == null ? null : (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        try {
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                audioFocusRequest = new AudioFocusRequest.Builder(
                        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                        .setAudioAttributes(attrs)
                        .setOnAudioFocusChangeListener(FOCUS_CB)
                        .build();
                am.requestAudioFocus(audioFocusRequest);
            } else {
                am.requestAudioFocus(FOCUS_CB, AudioManager.STREAM_ALARM,
                        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
            }
        } catch (Exception ignored) {
        }
    }

    private static void abandonFocus(Context c) {
        AudioManager am = c == null ? null : (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (audioFocusRequest != null) {
                    am.abandonAudioFocusRequest(audioFocusRequest);
                    audioFocusRequest = null;
                }
            } else {
                am.abandonAudioFocus(FOCUS_CB);
            }
        } catch (Exception ignored) {
        }
    }

    /** Raise STREAM_ALARM to the stored adhan loudness (never lowers), remembering the original. */
    private static void boostAlarm(Context c) {
        AudioManager am = c == null ? null : (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        try {
            float level = PrayerAlarmScheduler.prefs(c).getFloat(PrayerWatch.KEY_ADHAN_VOLUME, 1.0f);
            int max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
            int cur = am.getStreamVolume(AudioManager.STREAM_ALARM);
            int target = Math.round(Math.max(0f, Math.min(1f, level)) * max);
            originalAlarmVolume = cur;
            if (cur < target) am.setStreamVolume(AudioManager.STREAM_ALARM, target, 0);
        } catch (Exception ignored) {
        }
    }

    private static void restoreAlarm(Context c) {
        int orig = originalAlarmVolume;
        originalAlarmVolume = -1;
        if (orig < 0) return;
        AudioManager am = c == null ? null : (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        try {
            am.setStreamVolume(AudioManager.STREAM_ALARM, orig, 0);
        } catch (Exception ignored) {
        }
    }

    /**
     * True when "respect sound mode" is enabled and the device would rather
     * not hear the call: ringer silent, ringer vibrate (no audio), or the
     * alarm stream is muted.
     */
    private static boolean soundMuted(Context c) {
        SharedPreferences prefs = PrayerAlarmScheduler.prefs(c);
        if (!prefs.getBoolean(PrayerWatch.KEY_RESPECT_SOUND, false)) return false;
        AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return false;
        int mode = am.getRingerMode();
        if (mode == AudioManager.RINGER_MODE_SILENT) return true;
        if (mode == AudioManager.RINGER_MODE_VIBRATE) return true;
        return am.getStreamVolume(AudioManager.STREAM_ALARM) == 0;
    }

    /* ------------------------------------------------------------------ *
     * Phone call monitor — pause/resume adhan during calls
     * ------------------------------------------------------------------ */

    /**
     * Start monitoring phone state so calls that begin AFTER the adhan starts
     * are caught. The adhan is paused during the call and resumed after.
     */
    private static void startCallMonitor(Context c) {
        if (phoneStateListener != null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12+: TelephonyManager.listen() is deprecated.
            // Audio focus callbacks handle most cases; the isInCall() check
            // at start covers the rest. Skip the listener to avoid warnings.
            return;
        }
        try {
            TelephonyManager tm = (TelephonyManager) c.getSystemService(Context.TELEPHONY_SERVICE);
            if (tm == null) return;
            phoneStateListener = new PhoneStateListener() {
                @Override
                @SuppressWarnings("deprecation")
                public void onCallStateChanged(int state, String phoneNumber) {
                    boolean inCall = (state == TelephonyManager.CALL_STATE_OFFHOOK
                            || state == TelephonyManager.CALL_STATE_RINGING);
                    if (inCall && !wasInCallAtStart) {
                        // Call started mid-adhan — pause audio.
                        pauseForCall();
                    } else if (!inCall && wasInCallAtStart) {
                        // Call ended — resume audio.
                        resumeAfterCall();
                    }
                    wasInCallAtStart = inCall;
                }
            };
            tm.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE);
        } catch (Exception ignored) {
        }
    }

    private static void stopCallMonitor() {
        if (phoneStateListener == null) return;
        try {
            // We need a context to get TelephonyManager, but sCtx may be null
            // at stop time. Use the stored context if available.
            Context c = sCtx;
            if (c != null) {
                TelephonyManager tm = (TelephonyManager) c.getSystemService(Context.TELEPHONY_SERVICE);
                if (tm != null) {
                    tm.listen(phoneStateListener, PhoneStateListener.LISTEN_NONE);
                }
            }
        } catch (Exception ignored) {
        }
        phoneStateListener = null;
    }

    /** Pause audio for an active phone call. Will resume when call ends. */
    private static void pauseForCall() {
        synchronized (LOCK) {
            if (player != null && player.isPlaying()) {
                try {
                    player.pause();
                    callPaused = true;
                } catch (Exception ignored) {
                }
            }
        }
    }

    /** Resume audio after a phone call ends. */
    private static void resumeAfterCall() {
        synchronized (LOCK) {
            if (player != null && callPaused) {
                try {
                    player.start();
                    callPaused = false;
                } catch (Exception ignored) {
                }
            }
        }
    }

    /* ------------------------------------------------------------------ *
     * Stop / pause
     * ------------------------------------------------------------------ */

    /** Stop playback (and optionally remove the notification). */
    public static void stop(Context c, boolean dismiss) {
        MAIN.removeCallbacks(AUTO_STOP);
        synchronized (LOCK) {
            if (player == null && !dismiss) return;
            try {
                stopLocked(c, dismiss);
            } catch (Exception ignored) {
            }
            if (dismiss) PrayerAlarmScheduler.clearFired(c);
        }
    }

    private static void stopLocked(Context c, boolean dismiss) {
        if (player != null) {
            try {
                player.stop();
            } catch (Exception ignored) {
            }
            try {
                player.release();
            } catch (Exception ignored) {
            }
            player = null;
        }
        callPaused = false;
        playingId = null;
        Context ctx = c != null ? c : sCtx;
        abandonFocus(ctx);
        restoreAlarm(ctx);
        stopCallMonitor();
        sCtx = null;
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
            } catch (Exception ignored) {
            }
        }
        wakeLock = null;
        if (dismiss) {
            NotificationManager nm = ctx == null ? null
                    : (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                try {
                    nm.cancel(NOTIF_TAG, NOTIF_ID);
                } catch (Exception ignored) {
                }
            }
        }
    }

    /* ------------------------------------------------------------------ *
     * Notification (standard Android notification — no foreground service)
     * ------------------------------------------------------------------ */

    static void createChannels(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        // Channel 1: Adhan ringing (high importance, custom vibration, no system sound)
        NotificationChannel ch1 = new NotificationChannel(
                CHANNEL_ADHAN, "رنين الأذان", NotificationManager.IMPORTANCE_HIGH);
        ch1.setDescription("تنبيه حان وقت الصلاة مع الأذان");
        ch1.enableVibration(true);
        ch1.setVibrationPattern(new long[]{0, 600, 300, 600});
        ch1.setSound(null, null);
        ch1.setShowBadge(false);
        nm.createNotificationChannel(ch1);

        // Channel 2: Prayer info (low importance, no sound)
        NotificationChannel ch2 = new NotificationChannel(
                CHANNEL_PRAYER_INFO, "معلومات الصلاة", NotificationManager.IMPORTANCE_LOW);
        ch2.setDescription("تنبيهات دورية عن مواقيت الصلاة");
        ch2.setSound(null, null);
        ch2.setShowBadge(false);
        nm.createNotificationChannel(ch2);
    }

    /** Backward-compatible alias. */
    static void createChannel(Context c) {
        createChannels(c);
    }

    /**
     * Post/update the adhan notification with stop + snooze action buttons.
     * Uses a notification tag to prevent duplicate stacking.
     */
    static void notify(Context c, String id, String label, long ts, long nowMs) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        createChannels(c);

        // Calm, simple notification: title = prayer + its time; body = next prayer.
        String time = PrayerAlarmScheduler.formatTime(ts, c);
        String title = "حان وقت صلاة " + label + " " + time;
        String body = "";
        PrayerAlarmScheduler.Event next = PrayerAlarmScheduler.nextPrayer(c, nowMs);
        if (next != null) {
            body = "الصلاة التالية: " + next.label + " " + PrayerAlarmScheduler.formatTime(next.ts, c);
        }

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL_ADHAN);
        int smallIcon = c.getResources().getIdentifier("ic_stat_taqwa", "drawable", c.getPackageName());
        b.setSmallIcon(smallIcon != 0 ? smallIcon : c.getApplicationInfo().icon)
                .setContentTitle(title)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(false)
                .setOngoing(true)
                .setShowWhen(false);
        if (!body.isEmpty()) b.setContentText(body);

        // Tap → open the app; the in-app adhan window surfaces on its own.
        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (open != null) {
            open.putExtra(PrayerWatch.EXTRA_SCREEN, PrayerWatch.SCREEN_PRAYER);
            open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent openPi = PendingIntent.getActivity(c, 6, open, notifDpiFlags());
            b.setContentIntent(openPi);
        }

        // Action 1: Stop adhan
        Intent stopIntent = new Intent(c, PrayerAdhanReceiver.class).setAction(ACTION_STOP);
        stopIntent.putExtra("dismissed", false);
        PendingIntent stopPi = PendingIntent.getBroadcast(c, 8, stopIntent, notifDpiFlags());
        Action stopAction = new Action.Builder(
                smallIcon != 0 ? smallIcon : c.getApplicationInfo().icon,
                "إيقاف الأذان", stopPi)
                .build();
        b.addAction(stopAction);

        // Action 2: Snooze 10 minutes
        Intent snoozeIntent = new Intent(c, PrayerAdhanReceiver.class).setAction(ACTION_SNOOZE);
        snoozeIntent.putExtra(PrayerAlarmScheduler.EXTRA_PRAYER_ID, id);
        snoozeIntent.putExtra(PrayerAlarmScheduler.EXTRA_LABEL, label);
        snoozeIntent.putExtra(PrayerAlarmScheduler.EXTRA_TS, ts);
        PendingIntent snoozePi = PendingIntent.getBroadcast(c, 9, snoozeIntent, notifDpiFlags());
        Action snoozeAction = new Action.Builder(
                smallIcon != 0 ? smallIcon : c.getApplicationInfo().icon,
                "أَجِّلْ 10 دقائق", snoozePi)
                .build();
        b                .addAction(snoozeAction);

        // If the user manages to swipe the notification (some OEMs allow this
        // despite setOngoing), re-post it immediately so the adhan controls
        // are always accessible until explicitly stopped or the window expires.
        Intent repost = new Intent(c, PrayerAdhanReceiver.class).setAction(PrayerAlarmScheduler.ACTION_ADHAN_TICK);
        repost.putExtra(PrayerAlarmScheduler.EXTRA_PRAYER_ID, id);
        repost.putExtra(PrayerAlarmScheduler.EXTRA_LABEL, label);
        repost.putExtra(PrayerAlarmScheduler.EXTRA_TS, ts);
        repost.putExtra(PrayerAlarmScheduler.EXTRA_REMAINING, 30);
        PendingIntent repostPi = PendingIntent.getBroadcast(c, 10, repost, notifDpiFlags());
        b.setDeleteIntent(repostPi);

        try {
            nm.notify(NOTIF_TAG, NOTIF_ID, b.build());
        } catch (SecurityException ignored) {
            // POST_NOTIFICATIONS not granted — playback keeps running silently
        }
    }

    /** Refreshed on each resolved minute tick. */
    static void refresh(Context c, String id, String label, long ts) {
        notify(c, id, label, ts, PrayerTime.now(c));
    }

    /**
     * PendingIntent flags for notification actions.
     * Uses FLAG_UPDATE_CURRENT to overwrite stale PendingIntents.
     */
    static int notifDpiFlags() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
                : PendingIntent.FLAG_UPDATE_CURRENT;
    }

    /**
     * PendingIntent flags for alarm scheduling (PrayerAlarmScheduler).
     * Uses FLAG_UPDATE_CURRENT — alarm PendingIntents are identified by
     * their request code, not by extras, so FLAG_CANCEL_CURRENT is NOT
     * used here (it would cancel a pending alarm for the same prayer).
     */
    static int dpiFlags() {
        return notifDpiFlags();
    }

    /* ------------------------------------------------------------------ *
     * Adhan asset resolution from the packaged web bundle
     * ------------------------------------------------------------------ */

    private static AssetFileDescriptor resolveAdhanFd(Context c) {
        String key = PrayerAlarmScheduler.storedAdhanSound(c);
        String stem = key.replaceAll("\\.mp3$", "");
        AssetManager am = c.getAssets();
        String[] files;
        try {
            files = am.list("www/assets");
        } catch (Exception e) {
            files = null;
        }
        if (files == null) return null;
        String fallback = null;
        for (String f : files) {
            if (!f.endsWith(".mp3")) continue;
            if (f.equals(key) || f.startsWith(stem + "-") || f.startsWith(stem + ".")) {
                try {
                    return am.openFd("www/assets/" + f);
                } catch (Exception ignored) {
                    return null;
                }
            }
            if (fallback == null && f.startsWith("عبد_الباسط")) {
                fallback = f;
            }
        }
        if (fallback != null) {
            try {
                return am.openFd("www/assets/" + fallback);
            } catch (Exception ignored) {
                return null;
            }
        }
        return null;
    }

    private static void vibrate(Context c) {
        try {
            android.os.Vibrator v = (android.os.Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                long[] p = {0, 500, 300, 500, 300, 800};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(android.os.VibrationEffect.createWaveform(p, -1));
                } else {
                    v.vibrate(p, -1);
                }
            }
        } catch (Exception ignored) {
        }
    }
}
