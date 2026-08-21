/*
 * Moonshine STT Cordova plugin — JS bridge.
 * Mirrors the VoskSTT plugin's API so the app's stt.mjs service can
 * switch engines without changes on the JS side.
 */
var exec = require('cordova/exec')

var MoonshineSTT = {
  initialize: function (opts) {
    return new Promise(function (resolve, reject) {
      opts = opts || {}
      var onReady = opts.onReady
      var onProgress = opts.onProgress
      var onError = opts.onError
      exec(
        function (result) {
          if (result && result.progress !== undefined) {
            if (onProgress) onProgress(result.progress)
            return
          }
          if (result && result.success === true) {
            if (onReady) onReady()
            resolve(result)
          } else if (result && result.success === false) {
            reject(result.message || 'init failed')
          } else {
            resolve(result)
          }
        },
        function (err) {
          if (onError) onError(err)
          reject(err)
        },
        'MoonshineSTT',
        'initialize',
        [opts]
      )
    })
  },

  startListening: function (opts) {
    return new Promise(function (resolve, reject) {
      opts = opts || {}
      var onResult = opts.onResult
      var onPartial = opts.onPartial
      var onError = opts.onError
      var onStart = opts.onStart
      var onEnd = opts.onEnd
      var done = false

      exec(
        function (event) {
          if (event && event.event === 'result') {
            if (onResult) onResult(event.text || '', event.diag || null)
          } else if (event && event.event === 'partial') {
            if (onPartial) onPartial(event.text || '')
          } else if (event && event.event === 'start') {
            if (onStart) onStart()
          } else if (event && event.event === 'listening') {
            // engine already listening; treat as start so UI syncs
            if (onStart) onStart()
          } else if (event && event.event === 'end') {
            if (onEnd) onEnd()
            if (!done) {
              done = true
              resolve()
            }
          }
        },
        function (err) {
          if (onError) onError(err)
          if (!done) {
            done = true
            reject(err)
          }
        },
        'MoonshineSTT',
        'startListening',
        [opts]
      )
    })
  },

  stopListening: function () {
    return new Promise(function (resolve, reject) {
      exec(resolve, reject, 'MoonshineSTT', 'stopListening', [])
    })
  },

  close: function () {
    return new Promise(function (resolve, reject) {
      exec(resolve, reject, 'MoonshineSTT', 'close', [])
    })
  },

  deleteModel: function (fileName) {
    return new Promise(function (resolve, reject) {
      exec(resolve, reject, 'MoonshineSTT', 'deleteModel', [fileName || ''])
    })
  },

  downloadModel: function (opts) {
    return new Promise(function (resolve, reject) {
      opts = opts || {}
      var onProgress = opts.onProgress
      exec(
        function (result) {
          if (result && result.event === 'progress') {
            if (onProgress) onProgress({ loaded: result.loaded, total: result.total })
            return
          }
          if (result && result.success === true) {
            resolve(result)
          } else if (result && result.success === false) {
            var err = new Error(result.message || 'download failed')
            err.code = result.code || 'network'
            err.httpStatus = result.httpStatus
            reject(err)
          } else {
            reject(result)
          }
        },
        function (err) {
          reject(err)
        },
        'MoonshineSTT',
        'downloadModel',
        [opts]
      )
    })
  },

  cancelDownload: function () {
    return new Promise(function (resolve, reject) {
      exec(resolve, reject, 'MoonshineSTT', 'cancelDownload', [])
    })
  },

  getModelInfo: function () {
    return new Promise(function (resolve, reject) {
      exec(resolve, reject, 'MoonshineSTT', 'getModelInfo', [])
    })
  },

  setSettings: function (settings) {
    return new Promise(function (resolve, reject) {
      exec(resolve, reject, 'MoonshineSTT', 'setSettings', [settings || {}])
    })
  },
}

module.exports = MoonshineSTT
