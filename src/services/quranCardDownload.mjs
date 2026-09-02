import { QURAN_CARDS_NS } from './quranCards.mjs'
import {
  hasFile,
  markStoredByFile,
  openFileSink,
  removeFileBy,
  localFileUrlFor,
  localUrlFor,
  localFilePathFor,
} from './reciterStorage.mjs'
import { isCordova } from './device.mjs'

const MAX_CONCURRENCY = 1
const MAX_ATTEMPTS = 3
const IDLE_TIMEOUT_MS = 30000
const EMIT_INTERVAL_MS = 120
const RETRY_STEP_MS = 900

const tasks = new Map()
const listeners = new Set()
let snapshot = null
let runningCount = 0
let emitTimer = null
let retryTimer = null

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------------------ *
 * Snapshot + subscriptions
 * ------------------------------------------------------------------ */

function markDirty() {
  if (emitTimer) return
  emitTimer = setTimeout(() => {
    emitTimer = null
    rebuild()
  }, EMIT_INTERVAL_MS)
}

function flush() {
  if (emitTimer) {
    clearTimeout(emitTimer)
    emitTimer = null
  }
  rebuild()
}

function rebuild() {
  const next = {}
  for (const [ref, task] of tasks) {
    next[ref] = {
      ref,
      state: task.state,
      progress: task.progress,
      error: task.error
        ? { code: task.error.code, message: task.error.message }
        : null,
      fileName: task.fileName,
    }
  }
  snapshot = next
  for (const fn of listeners) fn()
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getSnapshot() {
  return snapshot
}

export function isStored(fileName) {
  return hasFile(QURAN_CARDS_NS, fileName)
}

function isOffLine() {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

/* ------------------------------------------------------------------ *
 * Task lifecycle
 * ------------------------------------------------------------------ */

function getOrCreateTask(file) {
  let task = tasks.get(file.ref)
  if (!task) {
    task = {
      ref: file.ref,
      fileName: file.fileName,
      url: file.url,
      state: isStored(file.fileName) ? 'done' : 'idle',
      progress: 0,
      attempts: 0,
      retryAt: 0,
      error: null,
      controller: null,
      bytes: 0,
    }
    tasks.set(file.ref, task)
  }
  return task
}

function markPending(task) {
  if (task.state === 'running' || task.state === 'done') return false
  if (task.state === 'pending' && task.retryAt > Date.now()) return false
  task.state = 'pending'
  task.attempts = 0
  task.error = null
  task.progress = 0
  task.retryAt = 0
  return true
}

function nextTask() {
  for (const task of tasks.values()) {
    if (task.state !== 'pending') continue
    if (task.retryAt && task.retryAt > Date.now()) continue
    return task
  }
  return null
}

function pump() {
  let minRetry = Infinity
  while (runningCount < MAX_CONCURRENCY) {
    const task = nextTask()
    if (!task) break
    runningCount += 1
    runTask(task)
  }
  for (const task of tasks.values()) {
    if (task.retryAt > 0) minRetry = Math.min(minRetry, task.retryAt)
  }
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  if (minRetry < Infinity) {
    const delay = Math.max(0, minRetry - Date.now()) + 50
    retryTimer = setTimeout(pump, delay)
  }
}

/* ------------------------------------------------------------------ *
 * Download task
 * ------------------------------------------------------------------ */

// تحويل رابط archive.org إلى proxy محلي في بيئة التطوير (dev server)
function devProxyUrl(url) {
  if (!url || typeof url !== 'string') return url
  // فقط في بيئة dev server (localhost) وليس على الجهاز
  if (typeof window !== 'undefined' && window.location?.hostname === 'localhost' && !isCordova()) {
    if (url.startsWith('https://archive.org/')) {
      return url.replace('https://archive.org/', '/archive-proxy/')
    }
  }
  return url
}

async function runTask(task) {
  const controller = new AbortController()
  task.controller = controller
  task.state = 'running'
  markDirty()

  let sink = null
  let start = 0
  try {
    // في Cordova: نستخدم HTTP أصلي لتجاوز CORS
    if (isCordova() && window.cordova?.plugins?.Downloader?.httpGet) {
      const filePath = await localFilePathFor(QURAN_CARDS_NS, task.fileName)
      if (!filePath) throw { code: 'storage', message: 'تعذّر الوصول إلى مسار التخزين' }

      task.progress = null
      markDirty()

      const result = await window.cordova.plugins.Downloader.httpGet({
        url: task.url,
        dest: filePath,
      })

      const totalBytes = result.contentLength || 0
      task.bytes = totalBytes
      task.progress = 1
      markStoredByFile(QURAN_CARDS_NS, task.fileName, totalBytes)

      task.state = 'done'
      task.error = null
      task.controller = null
      markDirty()
      return
    }

    // Web / dev: fetch streaming
    sink = await openFileSink(QURAN_CARDS_NS, task.fileName)
    start = sink.offset

    const effectiveUrl = devProxyUrl(task.url)

    // fetch مع streaming
    const fetchRes = await fetch(effectiveUrl, {
      headers: start > 0 ? { Range: `bytes=${start}-` } : undefined,
      redirect: 'follow',
      signal: controller.signal,
    })

    if (!fetchRes.ok) {
      throw { httpStatus: fetchRes.status }
    }

    const total = parseInt(fetchRes.headers?.get('content-range')?.split('/')[1], 10)
      || parseInt(fetchRes.headers?.get('content-length'), 10)
      || 0
    const contentType = fetchRes.headers?.get('content-type') || 'application/pdf'
    if (/text\/html|text\/plain/i.test(contentType)) {
      throw { code: 'badlink' }
    }

    if (start > 0 && fetchRes.status === 200) {
      start = 0
      await sink.reset()
    }

    let received = start
    const reader = fetchRes.body.getReader()
    const MAX_WRITE = 512 * 1024
    const chunks = []

    for (;;) {
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      const bufLen = chunks.reduce((s, c) => s + c.length, 0)
      if (bufLen >= MAX_WRITE) {
        const merged = new Uint8Array(bufLen)
        let offset = 0
        for (const c of chunks) { merged.set(c, offset); offset += c.length }
        chunks.length = 0
        const blob = new Blob([merged], { type: contentType })
        await sink.write(blob, received)
        received += merged.length
        task.bytes = received
        task.progress = total > 0 ? received / total : null
        if (received % (MAX_WRITE * 4) === 0) markDirty()
      }
    }
    if (chunks.length > 0) {
      const merged = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0))
      let offset = 0
      for (const c of chunks) { merged.set(c, offset); offset += c.length }
      const blob = new Blob([merged], { type: contentType })
      await sink.write(blob, received)
      received += merged.length
    }

    await sink.done()
    markStoredByFile(QURAN_CARDS_NS, task.fileName, received - start)

    task.state = 'done'
    task.progress = 1
    task.error = null
    task.controller = null
    markDirty()
  } catch (err) {
    task.controller = null
    if (err?.name === 'AbortError' || controller.signal.aborted) {
      task.state = 'idle'
      task.attempts = 0
      task.retryAt = 0
      task.error = null
      task.progress = 0
      markDirty()
      return
    }
    const classified = classifyError(err)
    const retryable = classified.retryable !== false && task.attempts < MAX_ATTEMPTS - 1
    if (retryable) {
      task.attempts += 1
      task.retryAt = Date.now() + RETRY_STEP_MS * task.attempts
      task.state = 'pending'
      markDirty()
    } else {
      task.state = 'error'
      task.progress = 0
      task.error = classified
      task.retryAt = 0
      markDirty()
    }
  } finally {
    runningCount -= 1
    pump()
  }
}

/* ------------------------------------------------------------------ *
 * تصنيف الأخطاء → رسائل عربية
 * ------------------------------------------------------------------ */

export function classifyError(err) {
  if (!err) return { code: 'unknown', retryable: true, message: 'حدث خطأ غير متوقع' }
  if (err.code === 'timeout') {
    return { code: 'timeout', retryable: true, message: 'استغرق التحميل وقتاً طويلاً — حاول مجدداً' }
  }
  if (err.code === 'storage') {
    return {
      code: 'storage',
      retryable: true,
      message:
        err.message && err.message !== 'تعذّرت الكتابة على الجهاز'
          ? err.message
          : 'تعذّرت الكتابة على جهازك',
    }
  }
  if (err.code === 'permission') {
    return {
      code: 'permission',
      retryable: true,
      message: 'يلزم الإذن بالوصول إلى التخزين — امنحه من إعدادات النظام ثم أعد المحاولة',
    }
  }
  if (err.code === 'quota') {
    return { code: 'quota', retryable: false, message: 'لا توجد مساحة تخزين كافية على الجهاز' }
  }
  if (err.code === 'badlink') {
    return { code: 'badlink', retryable: false, message: 'الملف غير متاح على الخادم — الرابط لا يعمل' }
  }
  if (typeof err.httpStatus === 'number') {
    if (err.httpStatus === 403 || err.httpStatus === 404 || err.httpStatus === 410) {
      return { code: 'http', retryable: false, message: 'الرابط لا يعمل — هذا الملف غير متاح' }
    }
    if (err.httpStatus === 429) {
      return { code: 'http', retryable: true, message: 'الخادم مشغول — حاول بعد قليل' }
    }
    if (err.httpStatus >= 500) {
      return { code: 'http', retryable: true, message: 'الخادم مشغول مؤقتاً — أعد المحاولة' }
    }
    return { code: 'http', retryable: false, message: `الخادم أعاد خطأ (${err.httpStatus})` }
  }
  if (isOffLine()) {
    return { code: 'offline', retryable: true, message: 'لا يوجد اتصال بالإنترنت' }
  }
  return { code: 'network', retryable: true, message: 'تعذّر الاتصال بالخادم — تحقق من الإنترنت وحاول مجدداً' }
}

function totalFromHeaders(res, start) {
  const cr = res.headers.get('content-range')
  if (cr) {
    const m = cr.match(/\/(\d+)\s*$/)
    if (m) return parseInt(m[1], 10)
  }
  const cl = res.headers.get('content-length')
  if (cl) {
    const value = parseInt(cl, 10)
    if (Number.isFinite(value)) return start + value
  }
  return 0
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

function refFor(type, number) {
  return `quran-card-${type}-${number}`
}

function fileFor(type, number, url, fileName) {
  return { ref: refFor(type, number), fileName, url }
}

/** تحميل ملف صوتي (MP3) لبطاقة سورة. */
export function downloadAudio(number, url, fileName) {
  const file = fileFor('audio', number, url, fileName)
  if (!file.fileName || !file.url) return
  const task = getOrCreateTask(file)
  if (markPending(task)) {
    markDirty()
    pump()
  }
}

/** تحميل ملف PDF لبطاقة سورة. */
export function downloadPdf(number, url, fileName) {
  const file = fileFor('pdf', number, url, fileName)
  if (!file.fileName || !file.url) return
  const task = getOrCreateTask(file)
  if (markPending(task)) {
    markDirty()
    pump()
  }
}

/** إبطال مهمة جارية أو قيد الانتظار. */
export async function cancelRef(ref) {
  const task = tasks.get(ref)
  if (!task) return
  if (task.state === 'running' && task.controller) task.controller.abort()
  const purgePartial = !isStored(task.fileName)
  task.state = 'idle'
  task.attempts = 0
  task.retryAt = 0
  task.progress = 0
  task.error = null
  markDirty()
  if (purgePartial) {
    await sleep(280)
    await removeFileBy(QURAN_CARDS_NS, task.fileName)
  }
}

/** حذف ملف محفوظ من الجهاز. */
export async function removeFile(ref, fileName) {
  const task = tasks.get(ref)
  if (task?.state === 'running' && task.controller) task.controller.abort()
  if (task) {
    task.state = 'idle'
    task.progress = 0
    task.error = null
    task.retryAt = 0
    task.attempts = 0
  }
  if (fileName || task?.fileName) {
    await removeFileBy(QURAN_CARDS_NS, fileName || task.fileName)
  }
  markDirty()
}

/**
 * فتح ملف PDF محفوظ في مشغّل خارجي:
 * - على الجهاز: fileopener plugin.
 * - على الويب: blob URL في تبويب جديد
 */
export async function openPdf(number) {
  const fullCard = (await import('./quranCards.mjs')).getFullCardByNumber(number)
  const fileName = fullCard?.downloads?.pdf?.filename
  if (!fileName || !isStored(fileName)) {
    return { ok: false, message: 'حمّل الملف أولاً لفتحه دون إنترنت' }
  }
  const mime = 'application/pdf'

  if (isCordova()) {
    const path = await localFileUrlFor(QURAN_CARDS_NS, fileName)
    if (!path) {
      return { ok: false, message: 'تعذّر الوصول إلى الملف المحفوظ' }
    }

    // فتح عبر fileopener plugin
    if (window.cordova?.plugins?.FileOpener) {
      try {
        await window.cordova.plugins.FileOpener.open({ path, mimeType: mime })
        return { ok: true }
      } catch (err) {
        console.warn('[quranCardDownload] FileOpener error', err)
        return { ok: false, message: err?.message || 'تعذّر فتح الملف' }
      }
    }

    return { ok: false, message: 'تعذّر فتح الملف — تأكد من تثبيت تطبيق قارئ PDF' }
  }

  // Web fallback
  const url = await localUrlFor(QURAN_CARDS_NS, fileName)
  if (!url) return { ok: false, message: 'تعذّر الوصول إلى الملف المحفوظ' }
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  return { ok: true }
}

// استئناف التحميلات المنقطعة عند عودة الإنترنت.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    let anyPending = false
    for (const task of tasks.values()) {
      if (task.state === 'pending') {
        task.retryAt = 0
        anyPending = true
      } else if (
        task.state === 'error' &&
        (task.error?.code === 'offline' ||
          task.error?.code === 'network' ||
          task.error?.code === 'timeout')
      ) {
        task.state = 'pending'
        task.retryAt = 0
        task.attempts = 0
        anyPending = true
      }
    }
    if (anyPending) {
      markDirty()
      pump()
    }
  })
}

export { hasFile }
