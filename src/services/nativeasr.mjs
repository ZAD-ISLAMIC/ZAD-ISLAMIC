/**
 * Native moonshine ASR engine — wraps the MoonshineSTT Cordova plugin.
 *
 * Strategy: CONTINUOUS LISTENING with plugin-internal VAD segmentation.
 * ----------------------------------------------------------
 * The native plugin runs a continuous AudioRecord loop and segments the
 * stream itself: an utterance ends on leading silence (`endSilenceMs`) or
 * the `maxSpeechMs` hard cap, then decodes on the worker thread WHILE the
 * mic stays open for the next utterance.
 *
 * We deliberately do NOT rotate the mic on a fixed timer from JS:
 *   - No artificial gap where the mic is closed (no flicker / click).
 *   - A phrase is never cut mid-word at an artificial chunk boundary,
 *     which previously made recognition *miss* dhikrs intermittently.
 * The plugin decodes each utterance in FULL (its tail window only applies
 * above the 20s buffer cap), and `maxSpeechMs` (5s) bounds the decode
 * cost so even no-pause recitation stays incremental and low-latency.
 *
 * Lifecycle safety:
 *   - `stopNativeAsr()` is idempotent and safe to call at any time.
 *   - Each start captures a session id; callbacks from a superseded
 *     session are ignored, so a stale start can never poison a new one.
 */

let initialized = false
let active = false
let sessionId = 0

export function isNativeAsrAvailable() {
  return !!(
    typeof window !== 'undefined' &&
    window.cordova?.plugins?.MoonshineSTT &&
    typeof window.cordova.plugins.MoonshineSTT.initialize === 'function'
  )
}

/**
 * Initialize the native engine (loads the bundled Arabic model).
 * Resolves when the model is ready.
 */
export async function ensureNativeAsr() {
  if (initialized) return true
  if (!isNativeAsrAvailable()) return false

  try {
    const result = await window.cordova.plugins.MoonshineSTT.initialize()
    if (result && result.success === true) {
      initialized = true
      return true
    }
    return false
  } catch (err) {
    console.warn('MoonshineSTT init failed:', err)
    initialized = false
    return false
  }
}

/**
 * Start the continuous listening loop.
 *
 * @param {object} opts
 * @param {(text: string, diag?: object) => void} opts.onFinal
 * @param {(text: string) => void} opts.onInterim
 * @param {(err: {type:string, message:string}) => void} opts.onError
 * @param {() => void} opts.onReady
 * @returns {Promise<() => void>} cleanup
 */
export async function startNativeAsr({ onFinal, onInterim, onError, onReady } = {}) {
  // Force-stop any stale session (navigation-away race etc.)
  stopNativeAsr()

  if (!isNativeAsrAvailable()) {
    onError?.({ type: 'unsupported', message: 'المحرك المحلي غير متاح' })
    return () => {}
  }

  const ready = await ensureNativeAsr()
  if (!ready) {
    onError?.({ type: 'model-error', message: 'فشل تحميل نموذج التعرف المحلي.' })
    return () => {}
  }

  const id = ++sessionId
  active = true

  // VAD settings for the continuous session:
  //   - endSilenceMs 300 → a deliberate pause between repetitions ends the
  //     utterance and reports it immediately (each dhikr counts fast).
  //   - maxSpeechMs 5000 → safety cap only. It bounds the decode cost of a
  //     no-pause recitation: the plugin decodes the WHOLE utterance (the tail
  //     window only kicks in above 20s), so keeping this near the plugin's
  //     own "5s default" note keeps each decode short and per-utterance
  //     counts incremental instead of one slow giant decode.
  const VAD = {
    vadThreshold: 0.005,
    noiseRatio: 4,
    endSilenceMs: 300,
    maxGapMs: 1500,
    minSpeechMs: 100,
    maxSpeechMs: 5000,
  }

  try {
    await window.cordova.plugins.MoonshineSTT.setSettings(VAD)

    await new Promise((resolve, reject) => {
      if (!active || id !== sessionId) {
        resolve()
        return
      }
      window.cordova.plugins.MoonshineSTT.startListening({
        onResult: (text, diag) => {
          if (id === sessionId && active && text) onFinal?.(text, diag || null)
        },
        onPartial: (text) => {
          if (id === sessionId && active && text) onInterim?.(text)
        },
        onError: (err) => {
          if (id !== sessionId) return
          active = false
          onError?.({ type: 'engine', message: String(err) })
        },
        onStart: () => {
          resolve()
        },
        onEnd: () => {
          // Mic session closed by the plugin (stop/lifecycle) — nothing to
          // reopen; `startListening` is not called with a new chunk.
        },
      })
    })
    onReady?.()
  } catch (err) {
    active = false
    onError?.({ type: 'mic-error', message: String(err) })
  }

  // Return cleanup function
  return stopNativeAsr
}

/** Stop the continuous loop and native engine (idempotent). */
export function stopNativeAsr() {
  active = false
  sessionId++
  try {
    window.cordova.plugins.MoonshineSTT.stopListening()
  } catch { /* ignore */ }
}

/** Free the native model. */
export function unloadNativeModel() {
  initialized = false
  active = false
  sessionId++
  try {
    window.cordova.plugins.MoonshineSTT.close()
  } catch { /* ignore */ }
}