import { audioUrl } from './reciters.mjs'
import { getLocalUrl, localUrlFor } from './reciterStorage.mjs'
import { HISN_NS } from './hisnmuslim.mjs'
import { FATWA_NS } from './fatwas.mjs'
import { storage } from './storage.mjs'

const LAST_KEY = 'player.last'
const RATE_KEY = 'player.rate'

let audio = null
let listeners = new Set()
let raf = 0
let lastPayload = null

function createState() {
  return {
    track: null,
    queue: [],
    index: -1,
    playing: false,
    time: 0,
    duration: 0,
    rate: 1,
    status: 'idle', // idle | loading | playing | paused | ended | error
    error: null,
    hasPrev: false,
    hasNext: false,
  }
}

let state = createState()

function emit() {
  lastPayload = {
    ...state,
    track: state.track ? { ...state.track } : null,
    queue: state.queue.map((t) => ({ ...t })),
  }
  for (const fn of listeners) fn()
  emitPresence()
}

// Lightweight subscription — only fires when the player becomes
// (un)occupied, so AppShell re-renders without following the time clock.
let lastPresence = null
const presenceListeners = new Set()

export function subscribePresence(fn) {
  presenceListeners.add(fn)
  return () => presenceListeners.delete(fn)
}

export function getPresenceSnapshot() {
  return !!state.track
}

function emitPresence() {
  const next = !!state.track
  if (next === lastPresence) return
  lastPresence = next
  for (const fn of presenceListeners) fn()
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getSnapshot() {
  return lastPayload || recreateSnapshot()
}

function recreateSnapshot() {
  lastPayload = {
    ...state,
    track: state.track ? { ...state.track } : null,
    queue: state.queue.map((t) => ({ ...t })),
  }
  return lastPayload
}

function patch(partial) {
  state = { ...state, ...partial }
  emit()
}

/* ------------------------------------------------------------------ *
 * Underlying <audio> element
 * ------------------------------------------------------------------ */

function ensureAudio() {
  if (audio) return audio
  audio = new Audio()
  audio.preload = 'auto'
  audio.addEventListener('playing', () => patch({ playing: true, status: 'playing', error: null }))
  audio.addEventListener('play', () => armTiming())
  audio.addEventListener('pause', () => {
    disarmTiming()
    patch((() => {
      const next = { playing: false }
      if (state.status !== 'error' && state.status !== 'ended') next.status = 'paused'
      return next
    })())
  })
  audio.addEventListener('loadedmetadata', () => {
    patch({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 })
    syncMediaSession()
  })
  audio.addEventListener('waiting', () => {
    if (!audio.paused) patch({ status: 'loading' })
  })
  audio.addEventListener('error', handleAudioError)
  audio.addEventListener('ended', handleEnded)
  return audio
}

// Time clock — throttled rAF loop running only while audio is playing.
let lastTick = 0
const TICK_INTERVAL = 150

function armTiming() {
  if (raf) return
  const tick = () => {
    raf = 0
    if (audio && !audio.paused) {
      const now = performance.now()
      if (now - lastTick >= TICK_INTERVAL) {
        lastTick = now
        state = { ...state, time: audio.currentTime }
        emit()
      }
      raf = requestAnimationFrame(tick)
    }
  }
  raf = requestAnimationFrame(tick)
}

function disarmTiming() {
  if (raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
}

function handleEnded() {
  disarmTiming()
  patch({ playing: false, time: 0, status: 'ended' })
  if (audio) audio.currentTime = 0
}

function handleAudioError() {
  disarmTiming()
  const offline = typeof navigator !== 'undefined' && !navigator.onLine
  const isRadio = state.track?.kind === 'radio'
  const isHisn = state.track?.kind === 'hisn'
  const isFatwa = state.track?.kind === 'fatwa'
  const message = isRadio
    ? offline
      ? 'لا يوجد اتصال بالإنترنت — البث المباشر يتطلب اتصالاً'
      : state.track?.hls
        ? 'هذه الإذاعة تصدر بصيغة لا يدعمها المشغّل المدمج — جرّب إذاعة أخرى'
        : 'تعذّر تشغيل هذه الإذاعة — قد يكون البث متوقفاً أو الرابط معطلاً'
    : isHisn
      ? offline
        ? 'لا يوجد اتصال بالإنترنت ولا نسخة محفوظة لهذا الذكر'
        : 'تعذّر تشغيل هذا المقطع — قد يكون الرابط معطلاً، أو حمّله للاستماع دون إنترنت'
      : isFatwa
        ? offline
          ? 'لا يوجد اتصال بالإنترنت ولا نسخة محفوظة لهذه الفتوى'
          : 'تعذّر تشغيل هذا المقطع — قد يكون الرابط معطلاً، أو حمّله للاستماع دون إنترنت'
        : offline
          ? 'لا يوجد اتصال بالإنترنت ولا نسخة محلية محفوظة لهذه السورة'
          : 'تعذّر تشغيل هذا المقطع — قد يكون الرابط معطلاً'
  patch({ playing: false, status: 'error', error: message })
}

/* ------------------------------------------------------------------ *
 * Public actions
 * ------------------------------------------------------------------ */

export async function play(queue, index) {
  if (!Array.isArray(queue) || !queue[index]) return
  await loadTrack(queue, index, { autoplay: true })
}

export async function playRadio(track) {
  if (!track || !track.url) return
  await loadTrack([track], 0, { autoplay: true })
}

async function loadTrack(queue, index, { autoplay }) {
  const track = queue[index]
  if (!track) return
  disarmTiming()
  patch({
    track,
    queue: queue.map((t) => ({ ...t })),
    index,
    playing: false,
    time: 0,
    duration: 0,
    status: 'loading',
    error: null,
    hasPrev: index > 0,
    hasNext: index < queue.length - 1,
  })

  storage.set(LAST_KEY, {
    queue: queue.map((t) => ({ ...t })),
    index,
    rate: state.rate,
  })

  const element = ensureAudio()
  try {
    // Fully reset the element before swapping sources. Android WebView keeps
    // the previous currentTime, which makes the browser issue a Range header
    // the (often range-less) remote server cannot satisfy → HTTP 416.
    element.pause()
    try {
      element.currentTime = 0
    } catch {
      /* not ready */
    }
    element.removeAttribute('src')
    element.load()

    const isRadio = track.kind === 'radio'
    const isHisn = track.kind === 'hisn'
    const isFatwa = track.kind === 'fatwa'
    const offline = typeof navigator !== 'undefined' && !navigator.onLine
    let url
    if (isRadio) {
      url = track.url
    } else if (isHisn) {
      const local = await localUrlFor(HISN_NS, track.fileName)
      if (local) url = local
      else if (offline) throw new Error('offline-hisn')
      else url = track.url
    } else if (isFatwa) {
      const local = await localUrlFor(FATWA_NS, track.fileName)
      if (local) url = local
      else if (offline) throw new Error('offline-fatwa')
      else url = track.url
    } else {
      const local = await getLocalUrl(track.reciterId, track.surahNumber)
      if (local) url = local
      else if (offline) throw new Error('offline-reciter')
      else url = audioUrl({ server: track.server }, track.surahNumber)
    }
    element.src = url
    element.playbackRate = state.rate
    if (autoplay) {
      try {
        await element.play()
        patch({ playing: true, status: 'playing' })
      } catch {
        patch({ status: 'paused' })
      }
    } else {
      patch({ status: 'paused' })
    }
  } catch (err) {
    const offlineNow = typeof navigator !== 'undefined' && !navigator.onLine
    let message
    if (offlineNow) {
      message =
        track.kind === 'radio'
          ? 'لا يوجد اتصال بالإنترنت — البث المباشر يتطلب اتصالاً'
          : 'لا يوجد اتصال بالإنترنت ولا نسخة محفوظة محلياً — حمّله للاستماع دون إنترنت'
    } else if (track.kind === 'radio') {
      message = 'تعذّر تشغيل هذه الإذاعة — قد يكون البث متوقفاً'
    } else {
      message = 'تعذّر تشغيل هذا المقطع — قد يكون الرابط معطلاً'
    }
    patch({
      playing: false,
      status: 'error',
      error: message,
    })
  }
}

export function toggle() {
  const { track } = state
  if (!track) return
  const element = ensureAudio()
  if (!element.src) {
    loadTrack(state.queue, state.index, { autoplay: true })
    return
  }
  if (element.paused) {
    element
      .play()
      .then(() => patch({ playing: true, status: 'playing', error: null }))
      .catch(() => patch({ playing: false, status: 'paused' }))
  } else {
    element.pause()
  }
}

export function next() {
  const { queue, index } = state
  if (index + 1 < queue.length) loadTrack(queue, index + 1, { autoplay: true })
}

export function prev() {
  const { queue, index, time } = state
  const element = ensureAudio()
  if (time > 3 || index === 0) {
    if (element.currentTime) element.currentTime = 0
    patch({ time: 0 })
  } else if (index - 1 >= 0) {
    loadTrack(queue, index - 1, { autoplay: true })
  }
}

export function seek(seconds) {
  if (!audio || !audio.src) return
  const value = Math.min(Math.max(0, seconds), state.duration || 0)
  audio.currentTime = value
  patch({ time: value })
}

export function setRate(rate) {
  state = { ...state, rate }
  if (audio) audio.playbackRate = rate
  storage.set(RATE_KEY, rate)
  emit()
}

export function retry() {
  if (!state.track) return
  loadTrack(state.queue, state.index, { autoplay: true })
}

export function close() {
  disarmTiming()
  if (audio) {
    try {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    } catch {
      /* ignore */
    }
  }
  syncMediaSession(false)
  state = createState()
  storage.remove(LAST_KEY)
  emit()
}

export function hasActiveTrack() {
  return !!state.track
}

/* ------------------------------------------------------------------ *
 * Media Session (lock screen / notification) — best practice, optional
 * ------------------------------------------------------------------ */

function syncMediaSession(enabled = true) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  const ms = navigator.mediaSession
  try {
    if (!enabled || !state.track) {
      ms.playbackState = 'none'
      return
    }
    const isRadio = state.track.kind === 'radio'
    const isHisn = state.track.kind === 'hisn'
    const isFatwa = state.track.kind === 'fatwa'
    ms.metadata = new MediaMetadata({
      title: isRadio
        ? state.track.name || 'إذاعة'
        : isHisn
          ? state.track.name || 'حصن المسلم'
          : isFatwa
            ? state.track.name || 'فتوى'
            : state.track.surahName || 'سورة',
      artist: isRadio
        ? state.track.category || 'التقوى'
        : isHisn
          ? 'حصن المسلم'
          : isFatwa
            ? 'ابن باز'
            : state.track.reciterName || 'التقوى',
      album: isRadio
        ? 'التقوى — الراديو'
        : isHisn
          ? 'التقوى — حصن المسلم'
          : isFatwa
            ? 'التقوى — الفتاوى'
            : 'التقوى — المصحف',
    })
    ms.setActionHandler('play', () => toggle())
    ms.setActionHandler('pause', () => toggle())
    ms.setActionHandler('seekto', (d) => {
      if (d.seekTime != null) seek(d.seekTime)
    })
    ms.setActionHandler('previoustrack', () => prev())
    ms.setActionHandler('nexttrack', () => next())
    ms.playbackState = state.playing ? 'playing' : 'paused'
  } catch {
    /* media session unsupported */
  }
}

/* ------------------------------------------------------------------ *
 * Initialisation — restore the last listening session
 * ------------------------------------------------------------------ */

export function initPlayer() {
  const rate = storage.get(RATE_KEY, 1)
  const last = storage.get(LAST_KEY)
  state.rate = Number.isFinite(rate) && rate > 0 ? rate : 1
  if (last && Array.isArray(last.queue) && last.queue.length) {
    const index = Number.isInteger(last.index) && last.index < last.queue.length ? last.index : 0
    state.queue = last.queue.map((t) => ({ ...t }))
    state.index = index
    state.track = last.queue[index] ? { ...last.queue[index] } : null
    state.status = 'paused'
    state.hasPrev = index > 0
    state.hasNext = index < last.queue.length - 1
  }
  emit()
}