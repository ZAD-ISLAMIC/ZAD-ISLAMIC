/*
 * PrayerWatch Cordova plugin (com.rn0x.prayerwatch) — JS bridge.
 *
 * Alarm-based prayer-times stack (no foreground service, no persistent
 * notification):
 *   - start({ enabled, adhanEnabled, events:[{key,name,isPrayer,atIso,ts}], city, hijri, adhanSound })
 *     -> schedules the exact alarms for the next two days.
 *   - At the alarm time the native side plays the adhan and posts ONE standard
 *     notification with a stop action; tapping it opens the app on the
 *     in-app adhan window.
 */
var exec = require('cordova/exec')

function call(method, args, onOk, onErr) {
  exec(
    onOk || function () {},
    onErr || function () {},
    'PrayerWatch',
    method,
    args || []
  )
}

/** Arm the background adhan stack (stores schedule + reschedules alarms). */
exports.start = function (opts, onOk, onErr) {
  call('start', [opts || {}], onOk, onErr)
}

/** Disarm everything: cancels alarms and silences any ringing adhan. */
exports.stop = function (onOk, onErr) {
  call('stop', [], onOk, onErr)
}

/** Request POST_NOTIFICATIONS on Android 13+; resolves on older too. */
exports.requestPermission = function (onOk, onErr) {
  call('requestNotification', [], onOk, onErr)
}

/** Resolve { granted } without prompting. */
exports.permissionStatus = function (onOk, onErr) {
  call('permissionStatus', [], onOk, onErr)
}

/** Route the notification asked to open, or ''. Clears itself after reading. */
exports.consumeScreen = function (onOk, onErr) {
  call('consumeScreen', [], onOk, onErr)
}

/**
 * Subscribe to push events from the native side (notification taps while the
 * app is already running). Channel stays open (keepCallback). Returns a cancel
 * function.
 */
exports.subscribe = function (onMessage, onErr) {
  var cancelled = false
  exec(
    function (data) {
      if (!cancelled && typeof onMessage === 'function') onMessage(data || '')
    },
    function (err) {
      if (!cancelled && typeof onErr === 'function') onErr(err)
    },
    'PrayerWatch',
    'subscribe',
    [],
    true
  )
  return function cancel() {
    cancelled = true
  }
}

/** Stop a background adhan that is currently playing (audio), if any. */
exports.stopAdhan = function (onOk, onErr) {
  call('stopAdhan', [], onOk, onErr)
}

/** Resolve { granted:boolean } for exact alarm permission (Android 12+). */
exports.exactAlarms = function (onOk, onErr) {
  call('exactAlarms', [], onOk, onErr)
}

/**
 * Aggregate status for the settings UI:
 * { notifications, exactAlarms, batteryOptimized, scheduleArmed }
 */
exports.status = function (onOk, onErr) {
  call('status', [], onOk, onErr)
}

/** Open a system settings screen: "notifications" | "alarms" | "battery". */
exports.openSettings = function (kind, onOk, onErr) {
  call('openSettings', [kind || ''], onOk, onErr)
}

/** Resolve the current fired-adhan window ({ key, name, ts }) or {}. */
exports.getWindow = function (onOk, onErr) {
  call('getWindow', [], onOk, onErr)
}

/**
 * Read-only snapshot of the device audio state:
 * { ringerMode: 'normal'|'vibrate'|'silent', alarmVolume, alarmMax }
 */
exports.getAudioState = function (onOk, onErr) {
  call('getAudioState', [], onOk, onErr)
}

/**
 * Set the adhan loudness (0..1). Applies live to any ringing adhan and is
 * remembered as the default for future ones.
 */
exports.setAdhanVolume = function (volume, onOk, onErr) {
  call('setAdhanVolume', [volume], onOk, onErr)
}

/**
 * Current adhan loudness + live playback info:
 * { volume: 0..1, alarmVolume, alarmMax, playing }
 */
exports.getAdhanVolume = function (onOk, onErr) {
  call('getAdhanVolume', [], onOk, onErr)
}

/** Schedule a demo adhan ~20s from now (force-plays even in the foreground). */
exports.testNow = function (onOk, onErr) {
  call('testNow', [], onOk, onErr)
}