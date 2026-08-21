/*
 * PrayerLocation Cordova plugin (com.rn0x.prayerlocation) — JS bridge.
 *
 * Thin GPS wrapper that classifies failures so the UI can show clear Arabic
 * guidance: permission denied / permanently denied / GPS off / timeout.
 *
 * Usage:
 *   cordova.plugins.PrayerLocation.getCurrentPosition(
 *     { timeoutMs: 15000 },
 *     function (res) { res.ok ? res.coords : res.code },
 *     function (err) {}
 *   )
 *   cordova.plugins.PrayerLocation.requestPermission(onOk, onErr)
 *   cordova.plugins.PrayerLocation.openSettings(onOk, onErr)
 */
var exec = require('cordova/exec')

function call(method, args, onOk, onErr) {
  exec(
    onOk || function () {},
    onErr || function () {},
    'PrayerLocation',
    method,
    args || []
  )
}

/** Resolve a single position fix. */
exports.getCurrentPosition = function (opts, onOk, onErr) {
  call('getCurrentPosition', [opts || {}], onOk, onErr)
}

exports.requestPermission = function (onOk, onErr) {
  call('requestPermission', [], onOk, onErr)
}

exports.permissionStatus = function (onOk, onErr) {
  call('permissionStatus', [], onOk, onErr)
}

exports.isEnabled = function (onOk, onErr) {
  call('isEnabled', [], onOk, onErr)
}

/** Open the relevant system settings (app details or location source). */
exports.openSettings = function (onOk, onErr) {
  call('openSettings', [], onOk, onErr)
}