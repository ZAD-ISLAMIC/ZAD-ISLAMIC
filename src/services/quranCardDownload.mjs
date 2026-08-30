import { QURAN_CARDS_NS } from './quranCards.mjs'
import {
  hasFile,
  markStoredByFile,
  openFileSink,
  removeFileBy,
  localFileUrlFor,
  localUrlFor,
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

function nativeHttpGet(url, headers) {
  const http = window.cordova?.plugin?.http
  if (!http) return null
  return new Promise((resolve, reject) => {
    http.sendRequest(
      url,
      { method: 'get', headers: headers || {}, responseType: 'blob' },
      (response) => resolve(response),
      (error) => reject(error)
    )
  })
}

async function runTask(task) {
  const controller = new AbortController()
  task.controller = controller
  task.state = 'running'
  markDirty()

  let sink = null
  let start = 0
  try {
    sink = await openFileSink(QURAN_CARDS_NS, task.fileName)
    start = sink.offset

    const useNative = isCordova() && window.cordova?.plugin?.http
    let res

    if (useNative) {
      const headers = start > 0 ? { Range: `bytes=${start}-` } : {}
      const nativeRes = await nativeHttpGet(task.url, headers)
      const blob = nativeRes.data instanceof Blob
        ? nativeRes.data
        : new Blob([nativeRes.data])
      const status = nativeRes.status || 200

      if (status < 200 || status >= 400) {
        throw { httpStatus: status }
      }

      const contentType = nativeRes.headers?.['content-type'] || 'application/octet-stream'
      if (/text\/html|text\/plain/i.test(contentType)) {
        throw { code: 'badlink' }
      }

      const total = parseInt(nativeRes.headers?.['content-length'], 10) || 0

      if (start > 0 && status === 200) {
        start = 0
        await sink.reset()
      }

      let received = start
      const MAX_WRITE = 512 * 1024
      const buffer = new Uint8Array(await blob.arrayBuffer())

      for (let i = 0; i < buffer.length; i += MAX_WRITE) {
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        const chunk = new Blob([buffer.subarray(i, i + MAX_WRITE)], { type: contentType })
        await sink.write(chunk, received)
        received += chunk.size
        task.bytes = received
        task.progress = total > 0 ? received / total : null
        if (received % (MAX_WRITE * 4) === 0) markDirty()
      }

      await sink.done()
      markStoredByFile(QURAN_CARDS_NS, task.fileName, received - start)

      task.state = 'done'
      task.progress = 1
      task.error = null
      task.controller = null
      markDirty()
    } else {
      res = await fetch(task.url, {
        headers: start > 0 ? { Range: `bytes=${start}-` } : undefined,
        signal: controller.signal,
      })

      if (res.status < 200 || res.status >= 400) {
        throw { httpStatus: res.status }
      }

      const contentType = res.headers.get('content-type') || 'application/octet-stream'

      if (/text\/html|text\/plain/i.test(contentType)) {
        throw { code: 'badlink' }
      }

      const total = totalFromHeaders(res, start)

      if (start > 0 && res.status === 200) {
        start = 0
        await sink.reset()
      }

      let received = start
      let writes = 0
      let lastActivity = Date.now()

      async function flushChunk(blob) {
        await sink.write(blob, received)
        received += blob.size
        task.bytes = received
        task.progress = total > 0 ? received / total : null
        lastActivity = Date.now()
      }

      const MAX_WRITE = 512 * 1024

      function blobFrom(chunks, type) {
        const size = chunks.reduce((acc, c) => acc + c.byteLength, 0)
        const out = new Uint8Array(size)
        let offset = 0
        for (const c of chunks) {
          out.set(c, offset)
          offset += c.byteLength
        }
        return new Blob([out], { type })
      }

      const reader = res.body && res.body.getReader ? res.body.getReader() : null
      if (reader) {
        let pending = []
        let pendingSize = 0
        for (;;) {
          if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
          if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
            throw { code: 'timeout', message: '' }
          }
          const { done, value } = await reader.read()
          if (done) break
          pending.push(value)
          pendingSize += value.byteLength
          if (pendingSize >= MAX_WRITE) {
            await flushChunk(blobFrom(pending, contentType))
            pending = []
            pendingSize = 0
            writes += 1
            if (writes % 4 === 0) markDirty()
          }
        }
        if (pending.length) {
          await flushChunk(blobFrom(pending, contentType))
          writes += 1
          markDirty()
        }
      } else {
        const buffer = new Uint8Array(await res.arrayBuffer())
        for (let i = 0; i < buffer.length; i += MAX_WRITE) {
          await flushChunk(new Blob([buffer.subarray(i, i + MAX_WRITE)], { type: contentType }))
        }
        markDirty()
      }

      await sink.done()
      markStoredByFile(QURAN_CARDS_NS, task.fileName, received - start)

      task.state = 'done'
      task.progress = 1
      task.error = null
      task.controller = null
      markDirty()
    }
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
 * - على الجهاز: cordova-plugin-file-opener2
 * - على الويب: blob URL في تبويب جديد
 */
export async function openPdf(number) {
  const fullCard = (await import('./quranCards.mjs')).getFullCardByNumber(number)
  const fileName = fullCard?.downloads?.pdf?.filename
  if (!fileName || !isStored(fileName)) {
    return { ok: false, message: 'حمّل الملف أولاً لفتحه دون إنترنت' }
  }
  const mime = 'application/pdf'

  if (isCordova() && window.cordova?.plugins?.fileOpener2) {
    const path = await localFileUrlFor(QURAN_CARDS_NS, fileName)
    if (path) {
      return new Promise((resolve) => {
        window.cordova.plugins.fileOpener2.open(
          path,
          mime,
          {
            error: (e) => resolve({ ok: false, message: String(e?.message || 'تعذّر فتح الملف') }),
            success: () => resolve({ ok: true }),
          }
        )
      })
    }
    return { ok: false, message: 'تعذّر الوصول إلى الملف المحفوظ' }
  }

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
