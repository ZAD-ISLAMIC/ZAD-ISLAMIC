var exec = require('cordova/exec')

var SERVICE = 'FileOpener'

/**
 * Open a file with the appropriate app.
 *
 * @param {Object}   opts
 * @param {string}   opts.path       - Absolute file path on the device
 * @param {string}   [opts.mimeType] - MIME type (auto-detected if omitted)
 * @param {Function} [onSuccess]     - Called on success
 * @param {Function} [onError]       - Called with error object
 * @returns {Promise} Resolves when the file is opened
 */
exports.open = function (opts, onSuccess, onError) {
  return new Promise(function (resolve, reject) {
    var ok = function (result) {
      if (onSuccess) onSuccess(result)
      resolve(result)
    }
    var fail = function (err) {
      if (onError) onError(err)
      reject(err)
    }
    exec(ok, fail, SERVICE, 'open', [opts])
  })
}

/**
 * Open a file with a specific app.
 *
 * @param {Object}   opts
 * @param {string}   opts.path        - Absolute file path on the device
 * @param {string}   opts.packageName - Android package name of the app
 * @param {string}   [opts.mimeType]  - MIME type (auto-detected if omitted)
 * @param {Function} [onSuccess]
 * @param {Function} [onError]
 * @returns {Promise}
 */
exports.openWith = function (opts, onSuccess, onError) {
  return new Promise(function (resolve, reject) {
    var ok = function (result) {
      if (onSuccess) onSuccess(result)
      resolve(result)
    }
    var fail = function (err) {
      if (onError) onError(err)
      reject(err)
    }
    exec(ok, fail, SERVICE, 'openWith', [opts])
  })
}

/**
 * Get the MIME type for a file path.
 *
 * @param {string}   path       - Absolute file path
 * @param {Function} [onSuccess] - Called with the detected MIME type string
 * @param {Function} [onError]
 * @returns {Promise<string>} The detected MIME type
 */
exports.getMimeType = function (path, onSuccess, onError) {
  return new Promise(function (resolve, reject) {
    var ok = function (mimeType) {
      if (onSuccess) onSuccess(mimeType)
      resolve(mimeType)
    }
    var fail = function (err) {
      if (onError) onError(err)
      reject(err)
    }
    exec(ok, fail, SERVICE, 'getMimeType', [path])
  })
}
