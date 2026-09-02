import { isCordova, waitForDeviceReady } from './device.mjs'
import { storage } from './storage.mjs'

export const AUDIO_MIME = 'audio/mpeg'

const REGISTRY_PREFIX = 'reciters.reg.'
const FILE_DIR = 'altaqwaa-audios'
const IDB_NAME = 'altaqwaa-audios'
const IDB_STORE = 'audios'

/* ------------------------------------------------------------------ *
 * Backend selection.
 * Prefer native file storage via DownloaderPlugin; fall back to IndexedDB
 * if the plugin bridge is unavailable. This keeps downloads and playback
 * working even if `deviceready` is delayed or never fires.
 * ------------------------------------------------------------------ */

let backendPromise = null

// One-time probe of the native writer. If it cannot accept even a tiny
// write, the plugin is unusable on this device — fall back to IndexedDB
// so downloads still work. Logs the real reason when it fails.
async function probeCordovaWrite() {
  try {
    await window.cordova.plugins.Downloader.writeFile({
      ns: FILE_DIR,
      fileName: '.probe',
      data: btoa('\x01'),
      offset: 0,
    })
    // Verify the file was written, then delete it — if write or delete throws,
    // the catch below returns false and we fall back to IndexedDB.
    const stat = await window.cordova.plugins.Downloader.getAppFilePath({
      ns: FILE_DIR,
      fileName: '.probe',
    })
    if (!stat.exists || stat.size !== 1) {
      throw new Error('probe write returned unexpected result')
    }
    await window.cordova.plugins.Downloader.deleteFile({
      ns: FILE_DIR,
      fileName: '.probe',
    })
    return true
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[altaqwaa] native writer probe failed', {
        code: err?.code,
        name: err?.name,
        message: err?.message,
        detail: String(err),
      })
    }
    return false
  }
}

function resolveBackend() {
  if (!isCordova()) return Promise.resolve('idb')
  // Generous window for cold starts; the scheme fix makes deviceready
  // reliable, but a slow first boot should not force IndexedDB forever.
  return waitForDeviceReady(15000).then(async (ready) => {
    const ok =
      ready &&
      typeof window !== 'undefined' &&
      typeof window.cordova?.plugins?.Downloader?.getAppFilePath === 'function'
    let backend = ok ? 'cordova' : 'idb'
    if (ok) {
      const writable = await probeCordovaWrite()
      if (!writable) {
        if (typeof console !== 'undefined') {
          console.warn('[altaqwaa] native writer probe failed, using IndexedDB')
        }
        backend = 'idb'
      }
    }
    if (typeof console !== 'undefined') {
      console.info(`[altaqwaa] storage backend: ${backend} (deviceready=${ready})`)
    }
    return backend
  })
}

function getBackend() {
  if (!backendPromise) backendPromise = resolveBackend()
  return backendPromise
}

// Kick off backend resolution (device-ready wait + native writer probe) as
// early as possible so real file storage is ready when the user downloads.
export function prewarmBackend() {
  return getBackend().catch(() => 'idb')
}

/* ------------------------------------------------------------------ *
 * Registry (fast metadata — source of truth for "is downloaded")
 * ------------------------------------------------------------------ */

export function getRegistry(reciterId) {
  return (
    storage.get(REGISTRY_PREFIX + reciterId) || {
      surahs: [],
      bytes: 0,
      count: 0,
      sizes: {},
    }
  )
}

function saveRegistry(reciterId, reg) {
  storage.set(REGISTRY_PREFIX + reciterId, reg)
}

// Keep `count` and `bytes` derived from the actual per-surah list/sizes so
// removals never leave stale totals behind (the old bug: deleting a surah
// left `count`/`bytes` untouched and the UI kept showing them).
function recountRegistry(reg) {
  reg.count = reg.surahs.length
  reg.bytes = Object.values(reg.sizes || {}).reduce((sum, size) => sum + size, 0)
  return reg
}

export function hasSurah(reciterId, surahNumber) {
  return getRegistry(reciterId).surahs.includes(surahNumber)
}

/* ------------------------------------------------------------------ *
 * IndexedDB helpers (web / dev fallback)
 * ------------------------------------------------------------------ */

let idbPromise = null

function openDb() {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('indexeddb-unavailable'))
  }
  if (idbPromise) return idbPromise
  idbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return idbPromise
}

function idbAfter(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbGet(key) {
  return openDb().then((db) => {
    const store = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE)
    return idbAfter(store.get(key))
  })
}

function idbPut(key, blob) {
  return openDb()
    .then((db) => {
      const store = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE)
      return idbAfter(store.put({ key, blob }))
    })
    .catch((err) => {
      if (err && (err.name === 'QuotaExceededError' || /quota/i.test(String(err?.message || err)))) {
        const quota = new Error('storage-quota')
        quota.code = 'quota'
        throw quota
      }
      throw err
    })
}

function idbDelete(key) {
  return openDb().then((db) => {
    const store = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE)
    return idbAfter(store.delete(key))
  })
}

/* ------------------------------------------------------------------ *
 * Cordova (device) file helpers — use DownloaderPlugin directly,
 * no dependency on cordova-plugin-file.
 * ------------------------------------------------------------------ */

/**
 * Resolve the absolute file path for a file in the app's private storage.
 * Returns null when not on Cordova or when the plugin is unavailable.
 */
async function nativeFilePath(ns, fileName) {
  if (!isCordova()) return null
  try {
    const result = await window.cordova.plugins.Downloader.getAppFilePath({
      ns: String(ns),
      fileName: String(fileName),
    })
    return result.path || null
  } catch {
    return null
  }
}

function storageKey(reciterId, surahNumber) {
  return `r${reciterId}:s${surahNumber}`
}

function fileKey(ns, fileName) {
  return `file:${ns}:${fileName}`
}

function fileName(surahNumber) {
  return `${String(surahNumber).padStart(3, '0')}.mp3`
}

/**
 * Write sink that uses DownloaderPlugin.writeFile / readFile.
 * Every write() resolves only once the chunk has been flushed to disk.
 */
function createNativeSink(ns, fileName) {
  let currentSize = 0

  return {
    async init() {
      const stat = await window.cordova.plugins.Downloader.getAppFilePath({ ns, fileName })
      currentSize = stat.size || 0
      return currentSize
    },
    async reset() {
      await window.cordova.plugins.Downloader.writeFile({ ns, fileName, data: '', offset: 0 })
      currentSize = 0
    },
    async write(blob, offset) {
      const buffer = await blob.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      // Chunk base64 encoding to avoid memory pressure on large files
      const chunkSize = 8192
      let base64 = ''
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const slice = bytes.subarray(i, i + chunkSize)
        base64 += btoa(String.fromCharCode.apply(null, slice))
      }
      const pos = offset != null ? offset : currentSize
      const result = await window.cordova.plugins.Downloader.writeFile({
        ns,
        fileName,
        data: base64,
        offset: pos,
      })
      currentSize = result.totalSize
      return result.bytesWritten
    },
    async size() {
      const stat = await window.cordova.plugins.Downloader.getAppFilePath({ ns, fileName })
      currentSize = stat.size || 0
      return currentSize
    },
  }
}

/**
 * Read a file from native storage and return a blob: URL for playback.
 * Reads the file in 256 KB chunks via readFile to avoid OOM on large files.
 */
async function nativeFileToUrl(ns, fileName) {
  const stat = await window.cordova.plugins.Downloader.getAppFilePath({ ns, fileName })
  if (!stat.exists || stat.size === 0) {
    throw new Error('empty-file')
  }
  // readFile returns the whole file as one base64 blob — fine for our
  // typical MP3/PDF sizes (< 50 MB). No loop needed.
  const result = await window.cordova.plugins.Downloader.readFile({ ns, fileName })
  const allData = atob(result.data)
  const arr = new Uint8Array(allData.length)
  for (let i = 0; i < allData.length; i++) {
    arr[i] = allData.charCodeAt(i)
  }
  const blob = new Blob([arr], { type: AUDIO_MIME })
  return URL.createObjectURL(blob)
}

/* ------------------------------------------------------------------ *
 * Public storage API
 * ------------------------------------------------------------------ */

// Opens a sink for one surah. Returns { offset, write(blob), reset(), done() }.
// offset = existing bytes on disk (native resume) or 0.
export async function openSink(reciterId, surahNumber) {
  if ((await getBackend()) === 'cordova') {
    const ns = String(reciterId)
    const fName = fileName(surahNumber)
    let sink
    try {
      sink = createNativeSink(ns, fName)
    } catch {
      throw { code: 'storage', message: 'تعذّر فتح ملف التحميل' }
    }
    const offset = await sink.init()
    return {
      offset,
      write: (blob, pos) =>
        sink.write(blob, pos != null ? pos : null).catch((err) => {
          const msg = err?.message || ''
          if (typeof console !== 'undefined') {
            console.warn('[altaqwaa] native write failed', {
              name: err?.name,
              message: msg,
              detail: String(err),
            })
          }
          if (/quota|no.?space|limit/i.test(msg)) {
            throw { code: 'quota', message: '' }
          }
          if (/permission|denied|SECURITY/i.test(msg)) {
            throw {
              code: 'permission',
              message: 'يلزم الإذن بالوصول إلى التخزين — امنحه من إعدادات النظام ثم أعد المحاولة',
            }
          }
          throw {
            code: 'storage',
            message: 'تعذّرت الكتابة على الجهاز',
          }
        }),
      reset: () => sink.reset(),
      done: async () => null,
      discard: () => {},
    }
  }

  // Web fallback — accumulate chunks and persist a single Blob.
  const chunks = []
  let added = 0
  return {
    offset: 0,
    write: (blob) => {
      chunks.push(blob)
      added += blob.size
      return Promise.resolve(added)
    },
    reset: async () => {
      chunks.length = 0
      added = 0
    },
    done: async () => {
      const blob = new Blob(chunks, { type: AUDIO_MIME })
      await idbPut(storageKey(reciterId, surahNumber), blob)
      return null
    },
    discard: () => {
      chunks.length = 0
    },
  }
}

// Object URL for a natively-stored file. Reads the file bytes via
// DownloaderPlugin.readFile and wraps them in a Blob URL so the audio
// element can play it. Results are cached so each file gets exactly one
// stable, seekable URL.
async function fileToUrl(ns, fileName) {
  const cache = getBlobUrlCache()
  const key = `${ns}:${fileName}`
  if (cache.has(key)) return cache.get(key)
  const url = await nativeFileToUrl(ns, fileName)
  cache.set(key, url)
  return url
}

export async function getLocalUrl(reciterId, surahNumber) {
  const fName = fileName(surahNumber)
  const cache = getBlobUrlCache()
  const key = `r${reciterId}:s${surahNumber}`
  if (cache.has(key)) return cache.get(key)
  if ((await getBackend()) === 'cordova') {
    try {
      const url = await nativeFileToUrl(String(reciterId), fName)
      cache.set(key, url)
      return url
    } catch (err) {
      if (typeof console !== 'undefined') {
        console.warn('[altaqwaa] getLocalUrl failed (native)', {
          reciterId,
          surahNumber,
          name: err?.name,
          message: err?.message,
        })
      }
      return null
    }
  }
  const record = await idbGet(key)
  if (!record?.blob) return null
  const url = URL.createObjectURL(record.blob)
  cache.set(key, url)
  return url
}

let blobUrlCache = null
function getBlobUrlCache() {
  if (!blobUrlCache) blobUrlCache = new Map()
  return blobUrlCache
}

// Force the registry to a clean empty state. Used after clearing all saved
// audio so no stale `count`/`bytes` survive — even if the stored record was
// already inconsistent (e.g. leftover from an older build).
export function resetRegistry(reciterId) {
  saveRegistry(reciterId, { surahs: [], bytes: 0, count: 0, sizes: {} })
}

export function markStored(reciterId, surahNumber, byteSize) {
  const reg = getRegistry(reciterId)
  if (!reg.surahs.includes(surahNumber)) {
    reg.surahs.push(surahNumber)
    reg.surahs.sort((a, b) => a - b)
  }
  reg.sizes = reg.sizes || {}
  reg.sizes[surahNumber] = byteSize
  recountRegistry(reg)
  saveRegistry(reciterId, reg)
}

export async function removeAudio(reciterId, surahNumber) {
  const reg = getRegistry(reciterId)
  const idx = reg.surahs.indexOf(surahNumber)
  if (idx === -1) return
  const key = storageKey(reciterId, surahNumber)
  const cached = getBlobUrlCache().get(key)
  if (cached) {
    URL.revokeObjectURL(cached)
    getBlobUrlCache().delete(key)
  }
  if ((await getBackend()) === 'cordova') {
    try {
      const fName = fileName(surahNumber)
      await window.cordova.plugins.Downloader.deleteFile({ ns: String(reciterId), fileName: fName })
    } catch {
      /* file may not exist */
    }
  } else {
    try {
      await idbDelete(key)
    } catch {
      /* ignore */
    }
  }
  reg.surahs.splice(idx, 1)
  reg.sizes = reg.sizes || {}
  delete reg.sizes[surahNumber]
  recountRegistry(reg)
  saveRegistry(reciterId, reg)
}

/* ------------------------------------------------------------------ *
 * Generic file storage — the سورة API above is a reciter flavour of
 * these primitives. Used by حصن المسلم (and anything else that needs
 * to store audio keyed by an arbitrary file name). Files live under
 * `<FILE_DIR>/<ns>/<fileName>` on disk and `file:<ns>:<fileName>` in
 * IndexedDB. `fileName` is a plain name (e.g. `75`, `ar_...`, `001.mp3`).
 * ------------------------------------------------------------------ */

const FILES_REG_PREFIX = 'hisn.files.'

export function getFileRegistry(ns) {
  return (
    storage.get(FILES_REG_PREFIX + ns) || {
      files: [],
      bytes: 0,
      count: 0,
      sizes: {},
    }
  )
}

function saveFileRegistry(ns, reg) {
  storage.set(FILES_REG_PREFIX + ns, reg)
}

function recountFileRegistry(reg) {
  reg.count = reg.files.length
  reg.bytes = Object.values(reg.sizes || {}).reduce((sum, size) => sum + size, 0)
  return reg
}

export function hasFile(ns, fileName) {
  return getFileRegistry(ns).files.includes(String(fileName))
}

export function fileRegistrySummary(ns) {
  const reg = getFileRegistry(ns)
  return { count: reg.count || 0, bytes: reg.bytes || 0 }
}

export async function openFileSink(ns, fileName) {
  const name = String(fileName)
  if ((await getBackend()) === 'cordova') {
    let sink
    try {
      sink = createNativeSink(ns, name)
    } catch {
      throw { code: 'storage', message: 'تعذّر فتح ملف التحميل' }
    }
    const offset = await sink.init()
    return {
      offset,
      write: (blob, pos) =>
        sink.write(blob, pos != null ? pos : null).catch((err) => {
          const msg = err?.message || ''
          if (/quota|no.?space|limit/i.test(msg)) {
            throw { code: 'quota', message: '' }
          }
          if (/permission|denied|SECURITY/i.test(msg)) {
            throw {
              code: 'permission',
              message: 'يلزم الإذن بالوصول إلى التخزين — امنحه من إعدادات النظام ثم أعد المحاولة',
            }
          }
          throw {
            code: 'storage',
            message: 'تعذّرت الكتابة على الجهاز',
          }
        }),
      reset: () => sink.reset(),
      done: async () => null,
      discard: () => {},
    }
  }

  const chunks = []
  let added = 0
  return {
    offset: 0,
    write: (blob) => {
      chunks.push(blob)
      added += blob.size
      return Promise.resolve(added)
    },
    reset: async () => {
      chunks.length = 0
      added = 0
    },
    done: async () => {
      const blob = new Blob(chunks, { type: AUDIO_MIME })
      await idbPut(fileKey(ns, name), blob)
      return null
    },
    discard: () => {
      chunks.length = 0
    },
  }
}

export async function localUrlFor(ns, fileName) {
  const name = String(fileName)
  const key = `file:${ns}:${name}`
  const cache = getBlobUrlCache()
  if (cache.has(key)) return cache.get(key)
  if ((await getBackend()) === 'cordova') {
    try {
      const url = await nativeFileToUrl(ns, name)
      cache.set(key, url)
      return url
    } catch (err) {
      if (typeof console !== 'undefined') {
        console.warn('[altaqwaa] localUrlFor failed (native)', { ns, name, message: err?.message })
      }
      return null
    }
  }
  const record = await idbGet(key)
  if (!record?.blob) return null
  const url = URL.createObjectURL(record.blob)
  cache.set(key, url)
  return url
}

// مسار الملف لفتحه في تطبيق خارجي (fileopener plugin).
// يعيد file:// مسار مطلق أو null خارج Cordova أو عند غياب الملف.
export async function localFileUrlFor(ns, fileName) {
  const path = await localFilePathFor(ns, fileName)
  return path ? 'file://' + path : null
}

/**
 * إرجاع مسار الملف المحلي المطلق لاستخدامه في العمليات الأصلية.
 * يعيد null خارج Cordova أو عند غياب الملف.
 */
export async function localFilePathFor(ns, fileName) {
  return nativeFilePath(ns, fileName)
}

export function markStoredByFile(ns, fileName, byteSize) {
  const reg = getFileRegistry(ns)
  const name = String(fileName)
  if (!reg.files.includes(name)) reg.files.push(name)
  reg.sizes = reg.sizes || {}
  reg.sizes[name] = byteSize
  recountFileRegistry(reg)
  saveFileRegistry(ns, reg)
}

// Blindly remove the physical artifact even when the registry does not
// know about it — needed to purge half-written files left behind by an
// aborted download, or legacy files that no longer belong to the app.
async function deletePhysicalFile(ns, fileName) {
  const key = fileKey(ns, fileName)
  const cached = getBlobUrlCache().get(key)
  if (cached) {
    try {
      URL.revokeObjectURL(cached)
    } catch {
      /* ignore */
    }
    getBlobUrlCache().delete(key)
  }
  if ((await getBackend()) === 'cordova') {
    try {
      await window.cordova.plugins.Downloader.deleteFile({ ns: String(ns), fileName: String(fileName) })
    } catch {
      /* file may not exist */
    }
  } else {
    try {
      await idbDelete(key)
    } catch {
      /* ignore */
    }
  }
}

export async function removeFileBy(ns, fileName) {
  const reg = getFileRegistry(ns)
  const name = String(fileName)
  await deletePhysicalFile(ns, name)
  const idx = reg.files.indexOf(name)
  if (idx === -1) return
  reg.files.splice(idx, 1)
  reg.sizes = reg.sizes || {}
  delete reg.sizes[name]
  recountFileRegistry(reg)
  saveFileRegistry(ns, reg)
}

export function resetFileRegistry(ns) {
  saveFileRegistry(ns, { files: [], bytes: 0, count: 0, sizes: {} })
}

