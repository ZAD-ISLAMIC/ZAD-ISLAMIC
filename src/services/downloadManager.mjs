import { audioUrl } from './reciters.mjs'
import { storage } from './storage.mjs'
import {
  AUDIO_MIME,
  getLocalUrl,
  getRegistry,
  hasSurah,
  markStored,
  openSink,
  removeAudio as storageRemoveAudio,
  resetRegistry,
} from './reciterStorage.mjs'

const MAX_CONCURRENCY = 1
const MAX_ATTEMPTS = 3
const IDLE_TIMEOUT_MS = 30000
const EMIT_INTERVAL_MS = 120
const RETRY_STEP_MS = 900

const JOB_ACTIVE_KEY = 'reciters.jobActive.'

const jobs = new Map()
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
  for (const [reciterId, job] of jobs) {
    let done = 0
    const items = {}
    const failed = []
    for (const task of job.items.values()) {
      items[task.n] = {
        state: task.state,
        progress: task.progress,
        error: task.error ? { code: task.error.code, message: task.error.message } : null,
      }
      if (task.state === 'done') done += 1
      if (task.state === 'error') failed.push(task.n)
    }
    next[reciterId] = {
      reciterId,
      reciterName: job.reciter.name,
      active: job.state === 'running',
      currentSurah: job.currentSurah,
      done,
      total: job.items.size,
      progress: job.items.size ? done / job.items.size : 0,
      items,
      failed,
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

export function getReciterSummary(reciterId) {
  rebuildSafe()
  return snapshot ? snapshot[reciterId] || null : null
}

// Materialise a job (with stored statuses) for a reciter without starting
// any downloads — used so a screen can render live statuses synchronously.
export function ensureJob(reciter) {
  const job = getOrCreateJob(reciter)
  flush()
  return job
}

function rebuildSafe() {
  if (emitTimer) {
    clearTimeout(emitTimer)
    emitTimer = null
  }
  rebuild()
}

/* ------------------------------------------------------------------ *
 * Active-job persistence (to auto-resume after app restart)
 * Persists the exact set of queued surah numbers so a single-surah
 * download is never resumed as a full-reciter download.
 * ------------------------------------------------------------------ */

// Persist the exact queued set plus the ORIGINAL user choice ('single' or
// 'full'). `mode` matters so resume continues the same kind of job the user
// started — never a different one. If no mode is given, the previous
// record's mode is kept (resume must not flip a single-surah download into
// a whole-mushaf download).
function setJobActive(reciterId, queued, mode) {
  const surahs = [...new Set(queued)]
  if (surahs.length) {
    const prev = storage.get(JOB_ACTIVE_KEY + reciterId)
    storage.set(JOB_ACTIVE_KEY + reciterId, {
      at: Date.now(),
      mode: mode || prev?.mode || 'full',
      surahs,
    })
  } else {
    storage.remove(JOB_ACTIVE_KEY + reciterId)
  }
}

// Returns the persisted { mode, surahs }. `surahs: null` for legacy boolean
// records (treated as "resume everything"), `null` when nothing is active.
function getActiveQueue(reciterId) {
  const rec = storage.get(JOB_ACTIVE_KEY + reciterId)
  if (!rec) return null
  if (Array.isArray(rec.surahs)) return { surahs: rec.surahs, mode: rec.mode || 'full' }
  return { surahs: null, mode: 'full' }
}

export function isJobActive(reciterId) {
  return getActiveQueue(reciterId) !== null
}

// Derive the persisted queued set from the job's in-memory state.
function syncActive(reciterId, job) {
  const queued = []
  for (const task of job.items.values()) {
    if (task.state === 'pending' || task.state === 'running') queued.push(task.n)
  }
  setJobActive(reciterId, queued)
}

/* ------------------------------------------------------------------ *
 * Job/task lifecycle
 * ------------------------------------------------------------------ */

function getOrCreateJob(reciter) {
  let job = jobs.get(reciter.id)
  if (!job) {
    const items = new Map()
    for (const n of reciter.suras) {
      const stored = hasSurah(reciter.id, n)
      items.set(n, {
        n,
        // 'idle' = not queued (downloaded/pending only after explicit request).
        state: stored ? 'done' : 'idle',
        progress: stored ? 1 : 0,
        attempts: 0,
        retryAt: 0,
        error: null,
        localUrl: null,
      })
    }
    job = {
      reciterId: reciter.id,
      reciter,
      state: 'idle',
      currentSurah: null,
      items,
      controllers: new Map(),
    }
    jobs.set(reciter.id, job)
    if (stockAllDone(items)) maybeFinish(job)
  }
  return job
}

function stockAllDone(items) {
  for (const task of items.values()) {
    if (task.state !== 'done') return false
  }
  return true
}

function markPending(job, n) {
  const task = job.items.get(n)
  if (!task || task.state === 'running' || task.state === 'done') return false
  if (task.state === 'pending' && task.retryAt > Date.now()) return false
  job.state = 'running'
  task.state = 'pending'
  task.attempts = 0
  task.error = null
  task.progress = 0
  task.retryAt = 0
  return true
}

function maybeFinish(job) {
  if (job.state !== 'running') return
  for (const task of job.items.values()) {
    if (task.state === 'pending' || task.state === 'running') return
  }
  job.state = 'idle'
  syncActive(job.reciterId, job)
}

function nextTask() {
  for (const job of jobs.values()) {
    if (job.state !== 'running') continue
    for (const task of job.items.values()) {
      if (task.state !== 'pending') continue
      if (task.retryAt && task.retryAt > Date.now()) continue
      return { job, task }
    }
  }
  return null
}

function pump() {
  let minRetry = Infinity
  while (runningCount < MAX_CONCURRENCY) {
    const next = nextTask()
    if (!next) break
    runningCount += 1
    runTask(next.job, next.task)
  }
  for (const job of jobs.values()) {
    for (const task of job.items.values()) {
      if (task.retryAt > 0) minRetry = Math.min(minRetry, task.retryAt)
    }
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

async function runTask(job, task) {
  const { reciter } = job
  const n = task.n
  const controller = new AbortController()
  job.controllers.set(n, controller)
  job.currentSurah = n
  task.state = 'running'
  markDirty()

  let sink = null
  let start = 0
  try {
    sink = await openSink(job.reciterId, n)
    start = sink.offset

    const res = await fetch(audioUrl(reciter, n), {
      headers: start > 0 ? { Range: `bytes=${start}-` } : undefined,
      signal: controller.signal,
    })

    if (res.status < 200 || res.status >= 400) {
      throw { httpStatus: res.status }
    }

    const contentType = res.headers.get('content-type') || AUDIO_MIME

    // Some servers answer 200 with an HTML error page for missing files.
    if (/text\/html|text\/plain/i.test(contentType)) {
      throw { code: 'badlink' }
    }

    const total = totalFromHeaders(res, start)

    // The server ignored our Range header — restart the partial file.
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

    // The native FileWriter path moves binary data over the Cordova bridge
    // as base64, so keep every write small and predictable. This avoids
    // oversized bridge messages that can fail on Android.
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
        if (controller.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }
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

    const url = (await sink.done()) || (await getLocalUrl(job.reciterId, n))
    markStored(job.reciterId, n, received - start)

    task.state = 'done'
    task.progress = 1
    task.error = null
    task.localUrl = url
    job.controllers.delete(n)
    maybeFinish(job)
    markDirty()
  } catch (err) {
    job.controllers.delete(n)
    task.localUrl = null
    if (err?.name === 'AbortError' || controller.signal.aborted) {
      task.state = 'idle'
      task.attempts = 0
      task.retryAt = 0
      task.error = null
      syncActive(job.reciterId, job)
      markDirty()
      return
    }
    const classified = classifyError(err)
    const retryable =
      classified.retryable !== false && task.attempts < MAX_ATTEMPTS - 1

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
      syncActive(job.reciterId, job)
      markDirty()
    }
  } finally {
    runningCount -= 1
    pump()
  }
}

/* ------------------------------------------------------------------ *
 * Error classification → user-facing messages
 * ------------------------------------------------------------------ */

function classifyError(err) {
  if (!err) return { code: 'unknown', retryable: true, message: 'حدث خطأ غير متوقع' }
  if (err.code === 'timeout') {
    return { code: 'timeout', retryable: true, message: 'استغرق التحميل وقتاً طويلاً — حاول مجدداً' }
  }
  if (err.code === 'storage') {
    return {
      code: 'storage',
      retryable: true,
      message: err.message && err.message !== 'تعذّرت الكتابة على الجهاز'
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
  if (!navigator.onLine) {
    return { code: 'offline', retryable: true, message: 'لا يوجد اتصال بالإنترنت' }
  }
  if (err.code === 'indexeddb-unavailable' || err.code === 'file-plugin-missing') {
    return { code: 'storage', retryable: false, message: 'التخزين المحلي غير متاح على هذا الجهاز' }
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

export function downloadReciter(reciter) {
  const job = getOrCreateJob(reciter)
  job.state = 'running'
  for (const n of reciter.suras) {
    markPending(job, n)
  }
  setJobActive(reciter.id, reciter.suras, 'full')
  maybeFinish(job)
  markDirty()
  pump()
}

export function downloadSurah(reciter, surahNumber) {
  const job = getOrCreateJob(reciter)
  if (markPending(job, surahNumber)) {
    setJobActive(reciter.id, [surahNumber], 'single')
    markDirty()
    pump()
  }
}

export function retryReciter(reciter) {
  const job = getOrCreateJob(reciter)
  job.state = 'running'
  for (const task of job.items.values()) {
    if (task.state === 'error') markPending(job, task.n)
  }
  syncActive(reciter.id, job)
  maybeFinish(job)
  markDirty()
  pump()
}

export function cancelReciter(reciterId) {
  const job = jobs.get(reciterId)
  if (!job) return
  for (const controller of job.controllers.values()) controller.abort()
  job.state = 'idle'
  for (const task of job.items.values()) {
    if (task.state === 'running' || task.state === 'pending') {
      task.state = 'idle'
      task.attempts = 0
      task.retryAt = 0
      task.progress = 0
      task.error = null
    }
  }
  syncActive(reciterId, job)
  flush()
}

export async function removeSurah(reciterId, surahNumber) {
  const job = jobs.get(reciterId)
  const controller = job?.controllers.get(surahNumber)
  if (controller) controller.abort()
  await storageRemoveAudio(reciterId, surahNumber)
  if (job) {
    const task = job.items.get(surahNumber)
    if (task) {
      task.state = 'idle'
      task.progress = 0
      task.error = null
      task.retryAt = 0
      task.attempts = 0
      task.localUrl = null
    }
    syncActive(reciterId, job)
  }
  flush()
}

export async function removeAllSurahs(reciter) {
  // Wipe EVERYTHING for this reciter: in-flight/queued downloads, the whole
  // in-memory job, the persisted resume queue, the files and the registry.
  // Nothing may survive, or the panel would keep reporting stale counts and
  // offer to "resume" downloads the user just deleted.
  const job = jobs.get(reciter.id)
  if (job) {
    for (const controller of job.controllers.values()) controller.abort()
    jobs.delete(reciter.id)
  }
  storage.remove(JOB_ACTIVE_KEY + reciter.id)
  const reg = getRegistry(reciter.id)
  for (const n of [...reg.surahs]) {
    await removeSurah(reciter.id, n)
  }
  // Guarantee a clean slate even if an old registry was inconsistent.
  resetRegistry(reciter.id)
  flush()
}

export function startActiveJob(reciter) {
  const active = getActiveQueue(reciter.id)
  if (!active) return
  const job = getOrCreateJob(reciter)
  const targets = active.surahs === null ? [...job.items.keys()] : active.surahs
  let any = false
  for (const n of targets) {
    const task = job.items.get(n)
    if (task && task.state !== 'done' && task.state !== 'running') {
      if (markPending(job, n)) any = true
    }
  }
  syncActive(reciter.id, job)
  if (any) {
    markDirty()
    pump()
  }
}

// Resume incomplete downloads once the network comes back.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    let anyPending = false
    for (const job of jobs.values()) {
      let changed = false
      for (const task of job.items.values()) {
        if (task.state === 'pending') {
          task.retryAt = 0
          changed = true
        } else if (
          task.state === 'error' &&
          (task.error?.code === 'offline' ||
            task.error?.code === 'network' ||
            task.error?.code === 'timeout')
        ) {
          task.state = 'pending'
          task.retryAt = 0
          task.attempts = 0
          changed = true
        }
      }
      if (changed) {
        job.state = 'running'
        syncActive(job.reciterId, job)
        anyPending = true
      }
    }
    if (anyPending) {
      markDirty()
      pump()
    }
  })
}