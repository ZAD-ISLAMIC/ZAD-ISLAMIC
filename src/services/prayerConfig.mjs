import { storage } from './storage.mjs'
import { METHODS, CUSTOM_METHOD } from './prayerTimes.mjs'

const KEY = 'prayer:config'
const PRAYER_IDs = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']

/* ------------------------------------------------------------------ *
 * Config change event — lets hooks (e.g. useClock) react instantly.
 * ------------------------------------------------------------------ */
const configListeners = new Set()

/** Subscribe to config changes. Returns an unsubscribe function. */
export function onConfigChange(cb) {
  configListeners.add(cb)
  return () => configListeners.delete(cb)
}

function emitConfigChange() {
  for (const cb of configListeners) {
    try { cb() } catch { /* ignore */ }
  }
}

const DEFAULT_CONFIG = {
  methodId: 'makkah', // أم القرى
  asrMadhab: 'shafi', // shafi | hanafi
  timeFormat12: true, // true => 12h (ص/م)
  highLatRule: 'NightMiddle',
  adjustments: Object.fromEntries(PRAYER_IDs.map((k) => [k, 0])),
  custom: null, // overwrites method params when methodId === 'custom'
  notifications: true, // legacy compatibility key (see adhanEnabled below)
  adhanEnabled: true, // master switch: ring the adhan in the background + at prayer time
  adhanSound: 'عبد_الباسط.mp3', // adhan voice (ADHAN_VOICES[].file)
  adhanVolume: 1, // adhan loudness 0..1 (of the alarm stream)
  respectSoundMode: false, // true => silent/vibrate device ring only vibrate+notification
  updateMissing: false,
  clockOffsetMin: 0, // تصحيح التوقيت بالدقائق (-60 إلى +60)
}

/**
 * Resolve the effective PrayerTimes params for the current config.
 * Custom params support: fajrAngle, ishaAngle, ishaInterval (min),
 * maghribAngle, maghribInterval (min).
 */
export function resolveParams(config = loadConfig()) {
  if (config.methodId === 'custom') {
    const c = config.custom || {}
    const params = {}
    if (Number.isFinite(c.fajrAngle)) params.fajr = c.fajrAngle
    if (Number.isFinite(c.ishaAngle)) params.isha = c.ishaAngle
    if (Number.isFinite(c.maghribAngle) && c.maghribAngle > 0) params.maghrib = c.maghribAngle
    else params.maghrib = '0 min'
    if (Number.isFinite(c.ishaInterval) && c.ishaInterval > 0) params.isha = `${c.ishaInterval} min`
    if (Number.isFinite(c.maghribInterval) && c.maghribInterval > 0) params.maghrib = `${c.maghribInterval} min`
    return params
  }
  const method = METHODS.find((m) => m.id === config.methodId)
  return method ? { ...method.params } : { ...METHODS[0].params }
}

export function loadConfig() {
  return { ...DEFAULT_CONFIG, ...(storage.get(KEY) || {}) }
}

export function saveConfig(config) {
  storage.set(KEY, config)
  emitConfigChange()
}

export function updateConfig(partial) {
  const next = { ...loadConfig(), ...partial }
  next.adjustments = { ...loadConfig().adjustments, ...(partial.adjustments || {}) }
  saveConfig(next)
  return next
}

export function getPrayerLabels() {
  return {
    fajr: 'الفجر',
    sunrise: 'الشروق',
    dhuhr: 'الظهر',
    asr: 'العصر',
    maghrib: 'المغرب',
    isha: 'العشاء',
    imsak: 'الإمساك',
    midnight: 'منتصف الليل',
  }
}

export { CUSTOM_METHOD }

/**
 * إزاحة التوقيت الحالية بالمللي ثانية من الإعدادات.
 * تُستخدم لتصحيح الساعة عندما يكون وقت الجهاز غير دقيق.
 */
export function getClockOffsetMs() {
  return (loadConfig().clockOffsetMin || 0) * 60 * 1000
}

/**
 * الوقت الحالي مصححاً بالإزاحة المخصصة من الإعدادات.
 * يجب استخدامها في كل مكان يحتاج إلى معرفة الوقت الحالي
 * (المواعيد، العدادات، الساعة المعروضة).
 */
export function correctedNow() {
  return Date.now() + getClockOffsetMs()
}