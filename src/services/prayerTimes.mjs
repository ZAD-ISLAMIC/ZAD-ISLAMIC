/**
 * Prayer times calculation engine — fully local, no network.
 *
 * Algorithm: PrayTimes v2.3 (PrayTimes.org) — Copyright (C) 2007-2011
 * Hamid Zarrabi-Zadeh, GNU LGPL v3.0, converted to an ES module.
 *   https://praytimes.org/  |  http://praytimes.org/calculation
 *
 * Reference values are verified against the adhan-js library (MIT) in
 * tests/prayerTimes.test.mjs for a grid of dates/cities/methods.
 */

/* ------------------------------------------------------------------ *
 * Degree-based math
 * ------------------------------------------------------------------ */

const dtr = (d) => (d * Math.PI) / 180
const rtd = (r) => (r * 180.0) / Math.PI
const sin = (d) => Math.sin(dtr(d))
const cos = (d) => Math.cos(dtr(d))
const tan = (d) => Math.tan(dtr(d))
const arcsin = (d) => rtd(Math.asin(d))
const arccos = (d) => rtd(Math.acos(d))
const arctan = (d) => rtd(Math.atan(d))
const arccot = (x) => rtd(Math.atan(1 / x))
const arctan2 = (y, x) => rtd(Math.atan2(y, x))

function fix(a, b) {
  a = a - b * Math.floor(a / b)
  return a < 0 ? a + b : a
}
const fixAngle = (a) => fix(a, 360)
const fixHour = (a) => fix(a, 24)

/* ------------------------------------------------------------------ *
 * Calculation methods
 * ------------------------------------------------------------------ */

/**
 * id         stable key
 * label      Arabic label shown in the UI
 * params     PrayTimes params: fajr/isha angles (degrees), or 'N min'
 *            intervals, optional maghrib angle and midnight mode.
 * ishaMin    convenience flag derived from params (interval after maghrib)
 */
export const METHODS = [
  { id: 'mwsl', label: 'رابطة العالم الإسلامي (MWL)', params: { fajr: 18, isha: 17 } },
  { id: 'isna', label: 'الجمعية الإسلامية لأمريكا الشمالية (ISNA)', params: { fajr: 15, isha: 15 } },
  { id: 'egypt', label: 'الهيئة المصرية العامة للمساحة', params: { fajr: 19.5, isha: 17.5 } },
  { id: 'makkah', label: 'أم القرى – مكة المكرمة', params: { fajr: 18.5, isha: '90 min' } },
  { id: 'diyanet', label: 'الرئاسة التركية للشؤون الدينية', params: { fajr: 18, isha: 17 } },
  { id: 'kuwait', label: 'وزارة الأوقاف الكويتية', params: { fajr: 18, isha: 17.5 } },
  { id: 'karachi', label: 'جامعة العلوم الإسلامية – كراتشي', params: { fajr: 18, isha: 18 } },
  { id: 'tehran', label: 'معهد الجيوفيزياء – جامعة طهران', params: { fajr: 17.7, isha: 14, maghrib: 4.5, midnight: 'Jafari' } },
]

export const CUSTOM_METHOD = { id: 'custom', label: 'مخصص', params: {} }

export const METHOD_BY_ID = Object.fromEntries(
  [...METHODS, CUSTOM_METHOD].map((m) => [m.id, m])
)

/** Asr juristic methods (shadow factor 1 = شافعي, 2 = حنفي). */
export const ASR_FACTORS = { shafi: 1, hanafi: 2 }
export const ASR_LABELS = { shafi: 'شافعي (معيار)', hanafi: 'حنفي' }

/** Higher-latitude adjustment rules. */
export const HIGHLAT_RULES = [
  { id: 'NightMiddle', label: 'منتصف الليل' },
  { id: 'AngleBased', label: 'نسبة الزاوية' },
  { id: 'OneSeventh', label: 'سُبع الليل' },
  { id: 'None', label: 'بدون تصحيح' },
]

const DEFAULT_PARAMS = { maghrib: '0 min', midnight: 'Standard' }

function isMin(arg) {
  return (arg + '').indexOf('min') !== -1
}

function evalNum(str) {
  const parsed = 1 * (str + '').split(/[^0-9.+-]/)[0]
  return Number.isFinite(parsed) ? parsed : 0
}

function timeDiff(time1, time2) {
  return fixHour(time2 - time1)
}

/* ------------------------------------------------------------------ *
 * Astronomy (PrayTimes v2.3)
 * ------------------------------------------------------------------ */

function sunPosition(jd) {
  const D = jd - 2451545.0
  const g = fixAngle(357.529 + 0.98560028 * D)
  const q = fixAngle(280.459 + 0.98564736 * D)
  const L = fixAngle(q + 1.915 * sin(g) + 0.020 * sin(2 * g))

  const R = 1.00014 - 0.01671 * cos(g) - 0.00014 * cos(2 * g)
  const e = 23.439 - 0.00000036 * D

  const RA = arctan2(cos(e) * sin(L), cos(L)) / 15
  const equation = q / 15 - fixHour(RA)
  const declination = arcsin(sin(e) * sin(L))

  return { declination, equation }
}

/** Convert Gregorian date to Julian day (Meeus). */
function julian(year, month, day) {
  if (month <= 2) {
    year -= 1
    month += 12
  }
  const A = Math.floor(year / 100)
  const B = 2 - A + Math.floor(A / 4)
  return (
    Math.floor(365.25 * (year + 4716)) +
    Math.floor(30.6001 * (month + 1)) +
    day +
    B -
    1524.5
  )
}

/* ------------------------------------------------------------------ *
 * Prayer time computation
 * ------------------------------------------------------------------ */

/**
 * @param {Date}   date             local calendar date (only y/m/d used)
 * @param {Array}  coords           [latitude, longitude, altitude(m)?]
 * @param {number} timeZoneOffset   combined (std + DST) offset in hours
 * @param {Object} params           { fajr, isha, maghrib, midnight } (PrayTimes)
 * @param {number} asrFactor        shadow factor 1 (شافعي) or 2 (حنفي)
 * @param {string} highLats         'NightMiddle' | 'AngleBased' | 'OneSeventh' | 'None'
 * @returns {{ fajr:number, sunrise:number, dhuhr:number, asr:number,
 *             maghrib:number, isha:number, sunset:number, imsak:number,
 *             midnight:number }}   hours (float, 0..24)
 */
export function computeTimes(date, coords, timeZoneOffset, params, asrFactor, highLats = 'NightMiddle') {
  const lat = 1 * coords[0]
  const lng = 1 * coords[1]
  const elv = coords[2] ? 1 * coords[2] : 0

  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()

  // longitude-adjusted julian date (PrayTimes v2.3)
  const jDate = julian(y, m, d) - lng / (15 * 24)

  const settings = {
    fajr: params.fajr,
    isha: params.isha,
    maghrib: typeof params.maghrib === 'undefined' ? DEFAULT_PARAMS.maghrib : params.maghrib,
    midnight: params.midnight || DEFAULT_PARAMS.midnight,
    imsak: params.imsak || 10,
    dhuhr: params.dhuhr || 0,
    asr: asrFactor === 2 ? 'Hanafi' : 'Standard',
    highLats,
  }

  const midDay = (time) => fixHour(12 - sunPosition(jDate + time).equation)

  const sunAngleTime = (angle, time, direction) => {
    const { declination } = sunPosition(jDate + time)
    const noon = midDay(time)
    const t =
      (1 / 15) *
      arccos(
        (-sin(angle) - sin(declination) * sin(lat)) /
          (cos(declination) * cos(lat))
      )
    return noon + (direction === 'ccw' ? -t : t)
  }

  const asrTime = (factor, time) => {
    const { declination } = sunPosition(jDate + time)
    const angle = -arccot(factor + tan(Math.abs(lat - declination)))
    return sunAngleTime(angle, time, 'cw')
  }

  const riseSetAngle = () => 0.833 + 0.0347 * Math.sqrt(elv)

  // default initial guesses
  let times = {
    imsak: 5, fajr: 5, sunrise: 6, dhuhr: 12,
    asr: 13, sunset: 18, maghrib: 18, isha: 18,
  }

  // one iteration is sufficient for all standard locations
  const portions = {}
  for (const k of Object.keys(times)) portions[k] = times[k] / 24

  times = {
    imsak: sunAngleTime(settings.imsak, portions.imsak, 'ccw'),
    fajr: sunAngleTime(settings.fajr, portions.fajr, 'ccw'),
    sunrise: sunAngleTime(riseSetAngle(), portions.sunrise, 'ccw'),
    dhuhr: midDay(portions.dhuhr),
    asr: asrTime(settings.asr === 'Hanafi' ? 2 : 1, portions.asr),
    sunset: sunAngleTime(riseSetAngle(), portions.sunset, 'cw'),
    maghrib: sunAngleTime(evalNum(settings.maghrib), portions.maghrib, 'cw'),
    isha: sunAngleTime(evalNum(settings.isha), portions.isha, 'cw'),
  }

  // convert the longitude-corrected solar times into local civil hours
  for (const k of Object.keys(times)) times[k] += timeZoneOffset - lng / 15

  // higher-latitude adjustments
  if (settings.highLats !== 'None') {
    const nightTime = timeDiff(times.sunset, times.sunrise)
    const adjustHLTime = (time, base, angle, night, direction) => {
      let portion
      const method = settings.highLats
      if (method === 'AngleBased') portion = (1 / 60) * angle
      else if (method === 'OneSeventh') portion = 1 / 7
      else portion = 1 / 2
      portion *= night

      const diff = direction === 'ccw' ? timeDiff(time, base) : timeDiff(base, time)
      if (Number.isNaN(time) || diff > portion) {
        return base + (direction === 'ccw' ? -portion : portion)
      }
      return time
    }
    times.imsak = adjustHLTime(times.imsak, times.sunrise, settings.imsak, nightTime, 'ccw')
    times.fajr = adjustHLTime(times.fajr, times.sunrise, settings.fajr, nightTime, 'ccw')
    times.isha = adjustHLTime(times.isha, times.sunset, evalNum(settings.isha), nightTime, 'cw')
    times.maghrib = adjustHLTime(times.maghrib, times.sunset, evalNum(settings.maghrib), nightTime, 'cw')
  }

  // fixed offsets (minute-based params)
  if (isMin(settings.imsak)) times.imsak = times.fajr - evalNum(settings.imsak) / 60
  if (isMin(settings.maghrib)) times.maghrib = times.sunset + evalNum(settings.maghrib) / 60
  if (isMin(settings.isha)) times.isha = times.maghrib + evalNum(settings.isha) / 60
  times.dhuhr += evalNum(settings.dhuhr) / 60

  // Jafari midnight (Tehran) — else middle of sunset→sunrise
  times.midnight =
    settings.midnight === 'Jafari'
      ? times.sunset + timeDiff(times.sunset, times.fajr) / 2
      : times.sunset + timeDiff(times.sunset, times.sunrise) / 2

  return times
}

/* ------------------------------------------------------------------ *
 * Formatting / helpers
 * ------------------------------------------------------------------ */

/** Round a float hour to HH:MM (24h). */
export function toHourMinute(hours) {
  if (!Number.isFinite(hours) || hours < 0) return null
  const total = Math.round(hours * 60)
  const h = ((Math.floor(total / 60) % 24) + 24) % 24
  const m = total % 60
  return { h, m }
}

/** Format an hour float as 'HH:MM' (24h) or 'h:mm ص/م'. */
export function formatHour(hours, format12 = false) {
  const hm = toHourMinute(hours)
  if (!hm) return '—'
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  if (!format12) return `${pad(hm.h)}:${pad(hm.m)}`
  const suffix = hm.h < 12 ? 'ص' : 'م'
  const h12 = hm.h % 12 === 0 ? 12 : hm.h % 12
  return `${h12}:${pad(hm.m)} ${suffix}`
}

/**
 * Build an absolute Date for a local prayer hour.
 * @param {Object} greg  { y, m, d } local civil date
 * @param {number} offsetHours combined tz offset for that date
 * @param {number} hours  float hour of day (0..24)
 */
export function hourToDate(greg, offsetHours, hours) {
  const { h, m } = toHourMinute(hours)
  if (!h && !m) return null
  const local = Date.UTC(greg.y, greg.m - 1, greg.d, h, m, 0, 0)
  return new Date(local - offsetHours * 3600 * 1000)
}

/** Format a JS Date as HH:MM in the device's local timezone. */
export function formatDate(date, format12 = false) {
  return formatHour(date.getHours() + date.getMinutes() / 60, format12)
}