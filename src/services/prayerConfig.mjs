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
  respectSoundMode: true, // true => silent/vibrate device ring only vibrate+notification
  updateMissing: false,
  // مصدر الوقت: تلقائي (وقت الجهاز) أو يدوي (تاريخ/وقت يحدده المستخدم ويستمر في التقدم)
  timeSource: { mode: 'auto', manualIso: null, manualSetAt: null }, // mode: 'auto' | 'manual'
  clockOffsetMin: 0, // مهمل — للتوافق مع الإصدارات القديمة (استخدم timeSource بدلاً منه)
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
 * الوقت الحالي حسب مصدر الوقت المحدد.
 * - auto: وقت الجهاز مباشرة (Date.now())
 * - manual: وقت يدوي حدده المستخدم (manualIso) ويستمر في التقدم منذ لحظة الحفظ
 * هذا هو المصدر الوحيد للوقت في التطبيق — كل الميزات (واجهة + خلفية + مستقبلية)
 * يجب أن تستخدمه بدل Date.now() / System.currentTimeMillis().
 */
export function getNowMs() {
  const cfg = loadConfig()
  const ts = cfg.timeSource
  if (ts && ts.mode === 'manual' && ts.manualIso) {
    const base = Date.parse(ts.manualIso)
    const setAt = Number(ts.manualSetAt)
    if (Number.isFinite(base)) {
      if (Number.isFinite(setAt)) {
        return base + (Date.now() - setAt)
      }
      return base
    }
  }
  return Date.now()
}

/** إزاحة الوقت اليدوي بالمللي ثانية (0 في التلقائي). */
export function getTimeOffsetMs() {
  const ts = loadConfig().timeSource
  if (ts && ts.mode === 'manual' && ts.manualIso && ts.manualSetAt) {
    const base = Date.parse(ts.manualIso)
    const setAt = Number(ts.manualSetAt)
    if (Number.isFinite(base) && Number.isFinite(setAt)) return base - setAt
  }
  return 0
}

export function getTimeSource() {
  return loadConfig().timeSource || { mode: 'auto', manualIso: null, manualSetAt: null }
}

export function isManualTime() {
  return loadConfig().timeSource?.mode === 'manual'
}

/** إنشاء ISO من مكونات محلية (y,m,d,h,min) بشكل صريح لتجنب التباس المنطقة الزمنية. */
export function createManualIsoFromLocal(y, m, d, h, min) {
  const dt = new Date(y, m - 1, d, h, min, 0, 0)
  if (Number.isNaN(dt.getTime())) throw new Error('تاريخ غير صالح')
  return dt.toISOString()
}

/** مهمل — للتوافق فقط، يُرجع 0 دائماً (استخدم getNowMs). */
export function getClockOffsetMs() {
  return 0
}

/** مهمل — استخدم getNowMs بدلاً منه. */
export function correctedNow() {
  return getNowMs()
}

/** تعيين مصدر الوقت. mode: 'auto' | 'manual', manualIso: ISO string أو null */
export function setTimeSource(mode, manualIso = null) {
  if (mode === 'manual' && manualIso) {
    const base = Date.parse(manualIso)
    if (!Number.isFinite(base)) throw new Error('manualIso غير صالح')
    const next = { mode: 'manual', manualIso: new Date(base).toISOString(), manualSetAt: Date.now() }
    return updateConfig({ timeSource: next })
  }
  return updateConfig({ timeSource: { mode: 'auto', manualIso: null, manualSetAt: null } })
}