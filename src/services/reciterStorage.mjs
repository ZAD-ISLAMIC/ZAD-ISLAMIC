import { isCordova, waitForDeviceReady, onDeviceReady } from './device.mjs'
import { storage } from './storage.mjs'

export const AUDIO_MIME = 'audio/mpeg'

const REGISTRY_PREFIX = 'reciters.reg.'
const FILE_DIR = 'altaqwaa-audios'
const IDB_NAME = 'altaqwaa-audios'
const IDB_STORE = 'audios'

/* ------------------------------------------------------------------ *
 * Backend selection.
 * Prefer the Cordova file API when the native bridge is ready; otherwise
 * fall back to IndexedDB. This keeps downloads and playback working even
 * if `deviceready` is delayed or never fires (e.g. a broken plugin).
 * ------------------------------------------------------------------ */

let backendPromise = null

// One-time probe of the native writer. If it cannot accept even a tiny
// write, the plugin is unusable on this device — fall back to IndexedDB
// so downloads still work. Logs the real reason when it fails.
async function probeCordovaWrite() {
  try {
    const fs = await cordovaFs()
    const base = await getDirectory(fs.root, FILE_DIR)
    const entry = await getFile(base, '.probe', true)
    const sink = createCordovaSink(entry)
    await sink.init()
    await sink.write(new Blob([new Uint8Array([1])], { type: AUDIO_MIME }), 0)
    const size = await fileSizeOf(entry)
    await new Promise((resolve, reject) => entry.remove(resolve, reject))
    return size === 1
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
      !!window.requestFileSystem &&
      !!window.LocalFileSystem
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
 * Cordova (device) file helpers
 * ------------------------------------------------------------------ */

let fsPromise = null

function cordovaFs() {
  if (fsPromise) return fsPromise
  fsPromise = new Promise((resolve, reject) => {
    onDeviceReady(() => {
      if (!window.requestFileSystem || !window.LocalFileSystem) {
        reject(new Error('file-plugin-missing'))
        return
      }
      window.requestFileSystem(
        window.LocalFileSystem.PERSISTENT,
        0,
        resolve,
        reject
      )
    })
  })
  return fsPromise
}

function getDirectory(entry, path) {
  return new Promise((resolve, reject) => {
    entry.getDirectory(path, { create: true }, resolve, reject)
  })
}

function getFile(dirEntry, name, create) {
  return new Promise((resolve, reject) => {
    dirEntry.getFile(name, { create: !!create, exclusive: false }, resolve, reject)
  })
}

async function directoryFor(ns) {
  const fs = await cordovaFs()
  const base = await getDirectory(fs.root, FILE_DIR)
  return getDirectory(base, String(ns))
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

async function entryFor(ns, fileName, create) {
  const dir = await directoryFor(ns)
  return getFile(dir, fileName, create)
}

async function cordovaEntry(reciterId, surahNumber, create) {
  return entryFor(reciterId, fileName(surahNumber), create)
}

/* ------------------------------------------------------------------ *
 * Write sink — streams chunks to a durable medium; supports resume.
 * ------------------------------------------------------------------ */

function truncateEntry(entry) {
  return new Promise((resolve, reject) => {
    entry.createWriter(
      (writer) => {
        writer.onerror = () => reject(writer.error || new Error('write' + writer.length))
        writer.onwriteend = () => resolve()
        writer.truncate(0)
      },
      reject
    )
  })
}

function fileSizeOf(entry) {
  return new Promise((resolve, reject) => {
    entry.getMetadata((meta) => resolve(meta.size || 0), reject)
  })
}

// Chunked writer built on the Cordova FileWriter. Every write() resolves
// only once the chunk has been flushed to disk, so the on-disk size always
// equals the number of bytes we have acknowledged.
function createCordovaSink(entry) {
  let writerPromise = null
  function getWriter() {
    if (!writerPromise) {
      writerPromise = new Promise((resolve, reject) => {
        entry.createWriter(resolve, reject)
      })
    }
    return writerPromise
  }

  return {
    async init() {
      // Resume support: keep whatever bytes are already on disk.
      return fileSizeOf(entry)
    },
    async reset() {
      await getWriter()
      await truncateEntry(entry)
    },
    async write(blob, offset) {
      const writer = await getWriter()
      return new Promise((resolve, reject) => {
        writer.onwriteend = () => resolve()
        writer.onerror = () => reject(writer.error || new Error('write-error'))
        writer.seek(offset == null ? writer.length : offset)
        writer.write(blob)
      })
    },
    entry,
  }
}

/* ------------------------------------------------------------------ *
 * Public storage API
 * ------------------------------------------------------------------ */

// Opens a sink for one surah. Returns { offset, write(blob), reset(), done() }.
// offset = existing bytes on disk (Cordova resume) or 0.
export async function openSink(reciterId, surahNumber) {
  if ((await getBackend()) === 'cordova') {
    let entry
    try {
      entry = await cordovaEntry(reciterId, surahNumber, true)
    } catch {
      throw { code: 'storage', message: 'تعذّر فتح ملف التحميل' }
    }
    const sink = createCordovaSink(entry)
    const offset = await sink.init()
    return {
      offset,
      write: (blob, pos) =>
        sink.write(blob, pos != null ? pos : null).catch((err) => {
          // FileError codes: QUOTA_EXCEEDED=10, DOMException QUOTA=22,
          // classic quota=13, NO_MODIFICATION_ALLOWED=6.
          const code = typeof err?.code === 'number' ? err.code : null
          if (typeof console !== 'undefined') {
            console.warn('[altaqwaa] native write failed', {
              code,
              name: err?.name,
              message: err?.message,
              detail: String(err),
            })
          }
          if (
            code === 10 ||
            code === 22 ||
            code === 13 ||
            /quota|no.?space|limit/i.test(String(err))
          ) {
            throw { code: 'quota', message: '' }
          }
          if (code === 18 || /permission|denied|SECURITY/i.test(String(err?.name || err))) {
            throw {
              code: 'permission',
              message: 'يلزم الإذن بالوصول إلى التخزين — امنحه من إعدادات النظام ثم أعد المحاولة',
            }
          }
          throw {
            code: 'storage',
            message: code != null ? `تعذّرت الكتابة على الجهاز (رمز ${code})` : 'تعذّرت الكتابة على الجهاز',
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

// Object URL for a Cordova FileEntry. The WebView blocks `file://` media
// from a page served over https ("Not allowed to load local resource"), and
// `entry.file()` only yields the plugin's metadata-only File shim (not a
// Blob, so createObjectURL rejects it). The reliable way to play a stored
// MP3 is to read the real bytes through the plugin's bridge FileReader
// (256KB slices) and wrap them in a genuine Blob URL. Results are cached so
// each surah gets exactly one stable, seekable URL.
function fileEntryToObjectUrl(entry) {
  return new Promise((resolve, reject) => {
    entry.file(
      (file) => {
        if (typeof file?.size === 'number' && file.size === 0) {
          reject(new Error('empty-file'))
          return
        }
        if (file && typeof file.localURL === 'string') {
          const reader = pluginFileReader()
          if (reader) {
            const r = new reader()
            r.onerror = () => reject(r.error || new Error('file-read-failed'))
            r.onload = () => {
              try {
                resolve(URL.createObjectURL(new Blob([r.result], { type: AUDIO_MIME })))
              } catch (err) {
                reject(err)
              }
            }
            try {
              r.readAsArrayBuffer(file)
            } catch (err) {
              reject(err)
            }
            return
          }
        }
        // Web fallback: entry.file() returns a real File/Blob.
        resolve(URL.createObjectURL(file))
      },
      reject
    )
  })
}

// Resolve the plugin's FileReader shim (bridge-based). Prefer the Cordova
// module mapper; else accept a global only if it is the shim (the native
// FileReader lacks the bridge READ_CHUNK_SIZE marker).
function pluginFileReader() {
  if (typeof cordova !== 'undefined' && typeof cordova.require === 'function') {
    try {
      return cordova.require('cordova-plugin-file.FileReader')
    } catch {
      /* fall through */
    }
  }
  if (
    typeof window !== 'undefined' &&
    typeof window.FileReader === 'function' &&
    typeof window.FileReader.READ_CHUNK_SIZE === 'number'
  ) {
    return window.FileReader
  }
  return null
}

export async function getLocalUrl(reciterId, surahNumber) {
  const key = storageKey(reciterId, surahNumber)
  const cache = getBlobUrlCache()
  if (cache.has(key)) return cache.get(key)
  if ((await getBackend()) === 'cordova') {
    try {
      const entry = await cordovaEntry(reciterId, surahNumber, false)
      const url = await fileEntryToObjectUrl(entry)
      cache.set(key, url)
      return url
    } catch (err) {
      if (typeof console !== 'undefined') {
        console.warn('[altaqwaa] getLocalUrl failed (cordova)', {
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
      const entry = await cordovaEntry(reciterId, surahNumber, false)
      await new Promise((resolve, reject) => entry.remove(resolve, reject))
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

// Same error-wrapping as the surah sink, so download managers get
// consistent `{ code }` failures (quota / permission / storage).
function wrapFileWriteError(err) {
  const code = typeof err?.code === 'number' ? err.code : null
  if (
    code === 10 ||
    code === 22 ||
    code === 13 ||
    /quota|no.?space|limit/i.test(String(err))
  ) {
    throw { code: 'quota', message: '' }
  }
  if (code === 18 || /permission|denied|SECURITY/i.test(String(err?.name || err))) {
    throw {
      code: 'permission',
      message: 'يلزم الإذن بالوصول إلى التخزين — امنحه من إعدادات النظام ثم أعد المحاولة',
    }
  }
  throw {
    code: 'storage',
    message: code != null ? `تعذّرت الكتابة على الجهاز (رمز ${code})` : 'تعذّرت الكتابة على الجهاز',
  }
}

export async function openFileSink(ns, fileName) {
  const name = String(fileName)
  if ((await getBackend()) === 'cordova') {
    let entry
    try {
      entry = await entryFor(ns, name, true)
    } catch {
      throw { code: 'storage', message: 'تعذّر فتح ملف التحميل' }
    }
    const sink = createCordovaSink(entry)
    const offset = await sink.init()
    return {
      offset,
      write: (blob, pos) =>
        sink.write(blob, pos != null ? pos : null).catch(wrapFileWriteError),
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
  const key = fileKey(ns, name)
  const cache = getBlobUrlCache()
  if (cache.has(key)) return cache.get(key)
  if ((await getBackend()) === 'cordova') {
    try {
      const entry = await entryFor(ns, name, false)
      const url = await fileEntryToObjectUrl(entry)
      cache.set(key, url)
      return url
    } catch (err) {
      if (typeof console !== 'undefined') {
        console.warn('[altaqwaa] localUrlFor failed (cordova)', { ns, name, message: err?.message })
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

// مسار file:// الفعلي لملف محفوظ — يُستخدم لفتحه في تطبيق خارجي
// (file-opener2). يعيد null خارج Cordova أو عند غياب الملف.
export async function localFileUrlFor(ns, fileName) {
  const name = String(fileName)
  if ((await getBackend()) !== 'cordova') return null
  try {
    const entry = await entryFor(ns, name, false)
    const url = entry.toURL()
    return typeof url === 'string' && url.startsWith('file://') ? url : null
  } catch {
    return null
  }
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
      const entry = await entryFor(ns, fileName, false)
      if (entry) {
        await new Promise((resolve, reject) => entry.remove(resolve, reject))
      }
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

