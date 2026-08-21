/*
 * QiblaSensor Cordova plugin (com.rn0x.qibla) — JS bridge.
 *
 * Streams a tilt-compensated compass azimuth (0..360, 0 = North) from the
 * Android SensorManager at ~16 Hz so the Qibla screen can rotate its needle
 * smoothly without a GPS or any runtime permission.
 *
 * Usage:
 *   cordova.plugins.QiblaSensor.isSupported(function (res) {
 *     res.supported ? start() : onError({ code: 'sensor-unavailable' })
 *   })
 *   cordova.plugins.QiblaSensor.start({}, function (res) {
 *     res.ok -> { azimuth, accuracy, level, calibrated }
 *     !res.ok -> { code }  (stream ended with an error)
 *   }, onError)
 *   cordova.plugins.QiblaSensor.stop(onOk, onErr)
 */
var exec = require('cordova/exec')

/** Begin streaming readings via the (success) callback, kept alive. */
exports.start = function (opts, onReading, onError) {
  exec(
    onReading || function () {},
    onError || function () {},
    'QiblaSensor',
    'start',
    [opts || {}]
  )
}

/** Stop streaming and release the sensors. */
exports.stop = function (onOk, onErr) {
  exec(
    onOk || function () {},
    onErr || function () {},
    'QiblaSensor',
    'stop',
    []
  )
}

/** Whether the device exposes a usable compass source. */
exports.isSupported = function (onOk, onErr) {
  exec(
    onOk || function () {},
    onErr || function () {},
    'QiblaSensor',
    'isSupported',
    []
  )
}