import tickSound from '../resources/audio/ui/tick.wav'
import doneSound from '../resources/audio/ui/done.wav'
import correctSound from '../resources/audio/ui/correct.wav'
import wrongSound from '../resources/audio/ui/wrong.wav'
import winSound from '../resources/audio/ui/win.wav'
import loseSound from '../resources/audio/ui/lose.wav'
import starSound from '../resources/audio/ui/star.wav'
import { loadConfig } from './prayerConfig.mjs'
import azanBasset from '../resources/audio/الأذان/عبد_الباسط.mp3'
import azanIslamSobhi from '../resources/audio/الأذان/إسلام_صبحي.mp3'
import azanNaqshbandi from '../resources/audio/الأذان/سيد_النقشبندي.mp3'
import azanSraihi from '../resources/audio/الأذان/عبدالمجيد_السريحي.mp3'
import azanMaher from '../resources/audio/الأذان/ماهر_المعيقلي.mp3'
import azanQatami from '../resources/audio/الأذان/ناصر_القطامي.mp3'
import azanToubar from '../resources/audio/الأذان/نصر_الدين_طوبار.mp3'
import azanDossari from '../resources/audio/الأذان/ياسر_الدوسري.mp3'

/**
 * Bundled adhan voices. `file` is the storage key used in the config
 * (config.adhanSound); `label` is what the settings sheet shows.
 * The default is عبد الباسط عبد الصمد.
 */
export const ADHAN_VOICES = [
  { file: 'عبد_الباسط.mp3', label: 'عبد الباسط عبد الصمد', url: azanBasset },
  { file: 'إسلام_صبحي.mp3', label: 'إسلام صبحي', url: azanIslamSobhi },
  { file: 'سيد_النقشبندي.mp3', label: 'سيد النقشبندي', url: azanNaqshbandi },
  { file: 'عبدالمجيد_السريحي.mp3', label: 'عبد المجيد السريحي', url: azanSraihi },
  { file: 'ماهر_المعيقلي.mp3', label: 'ماهر المعيقلي', url: azanMaher },
  { file: 'ناصر_القطامي.mp3', label: 'ناصر القطامي', url: azanQatami },
  { file: 'نصر_الدين_طوبار.mp3', label: 'نصر الدين طوبار', url: azanToubar },
  { file: 'ياسر_الدوسري.mp3', label: 'ياسر الدوسري', url: azanDossari },
]

export const DEFAULT_ADHAN = 'عبد_الباسط.mp3'
export const CUSTOM_ADHAN = '__custom__'

/** @returns {string} the selected voice file (config key), with a fallback. */
export function getAdhanSound() {
  const selected = loadConfig().adhanSound
  if (selected === CUSTOM_ADHAN) return CUSTOM_ADHAN
  return ADHAN_VOICES.some((v) => v.file === selected) ? selected : DEFAULT_ADHAN
}

/** @returns {string} a playable URL for a bundled adhan voice. */
export function getAdhanUrl() {
  const selected = getAdhanSound()
  const voice = ADHAN_VOICES.find((v) => v.file === selected)
  return voice ? voice.url : azanBasset
}

/* ------------------------------------------------------------------ *
 * User-imported adhan (IndexedDB, so multi-MB files survive restarts)
 * ------------------------------------------------------------------ */

const IDB_NAME = 'altaqwaa-custom-adhan'
const IDB_STORE = 'audios'
const CUSTOM_KEY = 'custom-adhan'

function openIdb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB unavailable'))
      return
    }
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Persist the user's audio file as a blob so it survives app restarts. */
export async function saveCustomAdhan(file) {
  const db = await openIdb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(file, CUSTOM_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

/** @returns {Promise<Blob|null>} the stored user audio file, if any. */
export async function getCustomAdhanBlob() {
  try {
    const db = await openIdb()
    const blob = await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get(CUSTOM_KEY)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => resolve(null)
    })
    db.close()
    return blob
  } catch {
    return null
  }
}

export async function clearCustomAdhan() {
  try {
    const db = await openIdb()
    await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).delete(CUSTOM_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
    db.close()
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ *
 * Playback
 * ------------------------------------------------------------------ */

let activeAzan = null
const audioPool = new Map()

/** Stop any adhan currently playing (used when testing voices / closing). */
export function stopAzan() {
  if (activeAzan) {
    try {
      activeAzan.pause()
    } catch {
      /* ignore */
    }
    activeAzan = null
  }
  for (const a of audioPool.get('azan') || []) {
    try {
      a.pause()
    } catch {
      /* ignore */
    }
  }
}

/** @returns {Promise<HTMLAudioElement|null>} playing adhan, or null. */
export async function playAzan() {
  stopAzan()
  try {
    let url = null
    if (getAdhanSound() === CUSTOM_ADHAN) {
      const blob = await getCustomAdhanBlob()
      if (blob) url = URL.createObjectURL(blob)
    }
    if (!url) url = getAdhanUrl()
    const audio = new Audio(url)
    audio.volume = 0.9
    audio.play().catch(() => {})
    activeAzan = audio
    return audio
  } catch (error) {
    console.warn('azan failed', error)
    return null
  }
}

const SOUNDS = {
  tick: tickSound,
  done: doneSound,
  correct: correctSound,
  wrong: wrongSound,
  win: winSound,
  lose: loseSound,
  star: starSound,
  azan: azanBasset,
}

function getAudio(kind) {
  let pool = audioPool.get(kind)
  if (!pool) {
    pool = []
    audioPool.set(kind, pool)
  }
  const free = pool.find((a) => a.ended || a.paused)
  if (free) return free
  const audio = new Audio(SOUNDS[kind])
  audio.volume = 0.85
  pool.push(audio)
  return audio
}

export function playSound(kind) {
  try {
    if (kind === 'azan') {
      stopAzan()
    }
    const audio = getAudio(kind)
    audio.currentTime = 0
    audio.play().catch(() => {})
  } catch (error) {
    console.warn('sound failed', kind, error)
  }
}

export function vibrate(pattern) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern)
    }
  } catch {
    /* ignore */
  }
}