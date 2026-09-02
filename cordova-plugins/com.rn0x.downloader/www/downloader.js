var exec = require('cordova/exec')

var SERVICE = 'Downloader'
var downloads = new Map()
var nextId = 1

/**
 * Download a file with progress, resume, and cancel support.
 *
 * @param {Object}   opts
 * @param {string}   opts.url         - Remote URL to download
 * @param {string}   opts.fileName    - Local file name
 * @param {string}   [opts.dir]       - Subdirectory inside app files (default: 'downloads')
 * @param {Object}   [opts.headers]   - Additional HTTP headers
 * @param {Function} [opts.onProgress] - Progress callback: ({ loaded, total, percent }) => void
 * @returns {Promise<{ success, path, id }>}
 */
exports.download = function (opts) {
  var id = 'dl_' + (nextId++)
  var onProgress = opts.onProgress || null

  var promise = new Promise(function (resolve, reject) {
    exec(
      function (result) {
        if (!result) return

        // Progress event
        if (result.event === 'progress') {
          if (onProgress) {
            onProgress({
              loaded: result.loaded,
              total: result.total,
              percent: result.total > 0 ? Math.round((result.loaded / result.total) * 100) : null
            })
          }
          return
        }

        // Final success
        if (result.success === true) {
          downloads.delete(id)
          resolve(result)
          return
        }

        // Final error
        if (result.success === false) {
          downloads.delete(id)
          var err = new Error(result.message || 'download failed')
          err.code = result.code || 'unknown'
          err.httpStatus = result.httpStatus || 0
          reject(err)
        }
      },
      function (err) {
        downloads.delete(id)
        reject(err)
      },
      SERVICE,
      'download',
      [{
        id: id,
        url: opts.url,
        fileName: opts.fileName,
        dir: opts.dir || 'downloads',
        headers: opts.headers || {}
      }]
    )
  })

  downloads.set(id, { promise: promise, id: id })
  promise._downloadId = id
  return promise
}

/**
 * Cancel an in-progress download.
 *
 * @param {string} id - Download ID returned by download()
 * @returns {Promise}
 */
exports.cancel = function (id) {
  return new Promise(function (resolve, reject) {
    exec(
      function () {
        downloads.delete(id)
        resolve({ success: true })
      },
      function (err) { reject(err) },
      SERVICE,
      'cancel',
      [{ id: id }]
    )
  })
}

/**
 * Cancel all active downloads.
 *
 * @returns {Promise}
 */
exports.cancelAll = function () {
  return new Promise(function (resolve, reject) {
    exec(
      function () {
        downloads.clear()
        resolve({ success: true })
      },
      function (err) { reject(err) },
      SERVICE,
      'cancelAll',
      []
    )
  })
}

/**
 * List all tracked downloads and their states.
 *
 * @returns {Promise<Array>}
 */
exports.list = function () {
  return new Promise(function (resolve, reject) {
    exec(
      function (result) { resolve(result) },
      function (err) { reject(err) },
      SERVICE,
      'list',
      []
    )
  })
}

/**
 * Get a download URL for a local file (via FileProvider content:// URI).
 *
 * @param {string} path - Absolute file path
 * @returns {Promise<string>} content:// URI
 */
exports.getContentUri = function (path) {
  return new Promise(function (resolve, reject) {
    exec(
      function (result) { resolve(result.uri) },
      function (err) { reject(err) },
      SERVICE,
      'getContentUri',
      [{ path: path }]
    )
  })
}

/**
 * Get the absolute file path for a file in the app's private storage.
 * Does NOT depend on cordova-plugin-file.
 *
 * @param {Object} opts
 * @param {string} opts.ns       - Namespace (e.g. 'reciter-1', 'quran-cards', 'khutbah')
 * @param {string} opts.fileName - File name
 * @returns {Promise<{path, exists, size}>}
 */
exports.getAppFilePath = function (opts) {
  return new Promise(function (resolve, reject) {
    exec(
      function (result) { resolve(result) },
      function (err) { reject(err) },
      SERVICE, 'getAppFilePath',
      [{ ns: opts.ns, fileName: opts.fileName }]
    )
  })
}

/**
 * Write base64-encoded data to a file in the app's private storage.
 * Supports append via `offset`. Creates parent directories automatically.
 *
 * @param {Object} opts
 * @param {string} opts.ns          - Namespace
 * @param {string} opts.fileName    - File name
 * @param {string} opts.data        - Base64-encoded byte data
 * @param {number} [opts.offset]    - Byte offset to write at (0 = overwrite)
 * @returns {Promise<{success, bytesWritten, totalSize}>}
 */
exports.writeFile = function (opts) {
  return new Promise(function (resolve, reject) {
    exec(
      function (result) { resolve(result) },
      function (err) { reject(err) },
      SERVICE, 'writeFile',
      [{ ns: opts.ns, fileName: opts.fileName, data: opts.data, offset: opts.offset || 0 }]
    )
  })
}

/**
 * Delete a file from the app's private storage.
 *
 * @param {Object} opts
 * @param {string} opts.ns       - Namespace
 * @param {string} opts.fileName - File name
 * @returns {Promise<{success}>}
 */
exports.deleteFile = function (opts) {
  return new Promise(function (resolve, reject) {
    exec(
      function (result) { resolve(result) },
      function (err) { reject(err) },
      SERVICE, 'deleteFile',
      [{ ns: opts.ns, fileName: opts.fileName }]
    )
  })
}

/**
 * Read a file from the app's private storage as base64-encoded data.
 *
 * @param {Object} opts
 * @param {string} opts.ns       - Namespace
 * @param {string} opts.fileName - File name
 * @returns {Promise<{success, data (base64), size}>}
 */
exports.readFile = function (opts) {
  return new Promise(function (resolve, reject) {
    exec(
      function (result) { resolve(result) },
      function (err) { reject(err) },
      SERVICE, 'readFile',
      [{ ns: opts.ns, fileName: opts.fileName }]
    )
  })
}

/**
 * Native HTTP GET that bypasses WebView CORS.
 * Uses Java HttpURLConnection with manual redirect following.
 *
 * @param {Object} opts
 * @param {string} opts.url  - URL to fetch
 * @param {string} [opts.dest] - Destination file path (if omitted, only returns metadata)
 * @returns {Promise<{ path, contentType, contentLength }>}
 */
exports.httpGet = function (opts) {
  return new Promise(function (resolve, reject) {
    exec(
      function (result) { resolve(result) },
      function (err) { reject(err) },
      SERVICE,
      'httpGet',
      [{ url: opts.url, dest: opts.dest || null }]
    )
  })
}
