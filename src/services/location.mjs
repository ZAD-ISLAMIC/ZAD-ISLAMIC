/**
 * Location for prayer times — three user-chosen sources:
 *   1. GPS (native plugin, falls back to the WebView geolocation API)
 *   2. geo.json picker (country → city)
 *   3. Manual (country + city, or raw lat/lon)
 *
 * The last used location is persisted (AsyncStorage-style wrapper over the
 * app's persistent store) so a cold start restores it instantly.
 */

import { storage } from './storage.mjs'
import { onDeviceReady, isCordova } from './device.mjs'
import { getDeviceTimeZone } from './timezone.mjs'
import { findNearestCity } from './geo.mjs'

const KEY = 'prayer:location'
const FALLBACK = {
  method: 'manual',
  lat: 21.4225,
  lon: 39.8262,
  label: 'مكة المكرمة',
  countryAr: 'السعودية',
  cityAr: 'مكة المكرمة',
  tz: 'Asia/Riyadh',
}

/* ------------------------------------------------------------------ *
 * Persistence (AsyncStorage-like promise wrapper over storage.mjs)
 * ------------------------------------------------------------------ */

export async function getItem(key) {
  return storage.get(key)
}

export async function setItem(key, value) {
  return storage.set(key, value)
}

export function loadLocation() {
  return storage.get(KEY) || null
}

export function saveLocation(loc) {
  storage.set(KEY, loc)
  return loc
}

export function getCurrentLocation() {
  return loadLocation() || FALLBACK
}

/* ------------------------------------------------------------------ *
 * Native bridge (custom plugin com.rn0x.prayerlocation)
 * ------------------------------------------------------------------ */

function hasLocationPlugin() {
  return (
    isCordova() &&
    typeof window !== 'undefined' &&
    window.cordova?.plugins?.PrayerLocation &&
    typeof window.cordova.plugins.PrayerLocation.getCurrentPosition === 'function'
  )
}

function hasWatchPlugin() {
  return (
    isCordova() &&
    typeof window !== 'undefined' &&
    window.cordova?.plugins?.PrayerLocation &&
    typeof window.cordova.plugins.PrayerLocation.watchPosition === 'function' &&
    typeof window.cordova.plugins.PrayerLocation.clearWatch === 'function'
  )
}

/**
 * طلب صلاحيات الموقع إذا لم تكن ممنوحة بعد.
 * يُستخدم قبل محاولة تحديد الموقع لتجنب timeout بسبب انتظار رد المستخدم.
 */
async function ensureLocationPermission() {
  if (!hasLocationPlugin()) return
  try {
    const status = await new Promise((resolve) => {
      window.cordova.plugins.PrayerLocation.permissionStatus(
        (s) => resolve(s),
        () => resolve({ granted: false })
      )
    })
    if (status?.granted) return

    // طلب الصلاحيات وانتظار رد المستخدم
    await new Promise((resolve) => {
      window.cordova.plugins.PrayerLocation.requestPermission(
        (s) => resolve(s),
        () => resolve({ granted: false })
      )
    })
  } catch {
    // تجاهل الأخطاء — المحاولة ستفشل بشكل أنيق لاحقاً
  }
}

function normalizeCoords({ latitude, longitude, accuracy, provider, altitude }) {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null
  }
  return {
    lat: latitude,
    lon: longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    provider,
    altitude: Number.isFinite(altitude) ? altitude : null,
  }
}

/**
 * Resolve { lat, lon, ... } from the best available provider.
 * Native plugin first (true GPS), then the WebView geolocation API.
 *
 * @returns {Promise<{ ok: true, coords: object, source: string } |
 *                    { ok: false, code: string, message: string }>}
 */
export async function detectCurrentPosition() {
  if (hasLocationPlugin()) {
    // طلب الصلاحيات أولاً إذا لم تكن ممنوحة
    await ensureLocationPermission()
    try {
      const res = await new Promise((resolve) => {
        let settled = false
        let timeoutId = null
        const done = (v) => {
          if (settled) return
          settled = true
          if (timeoutId) clearTimeout(timeoutId)
          resolve(v)
        }
        timeoutId = setTimeout(() => done({ ok: false, code: 'timeout', message: messageFor('timeout') }), 48000)
        window.cordova.plugins.PrayerLocation.getCurrentPosition(
          { timeoutMs: 45000 },
          (r) => done(r),
          (e) => done({ ok: false, ...(e || {}) })
        )
      })
      if (res && res.ok && res.coords) {
        const normalized = normalizeCoords(res.coords)
        if (normalized) return { ok: true, coords: normalized, source: 'native' }
        return { ok: false, code: 'invalid-coords', message: 'إحداثيات GPS غير صالحة.' }
      }
      const code = res?.code || 'error'
      return { ok: false, code, message: messageFor(code) }
    } catch (err) {
      console.warn('[prayer location] native plugin error', err)
      return { ok: false, code: 'error', message: messageFor('error') }
    }
  }

  // WebView fallback (development / environments without the plugin)
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { ok: false, code: 'unavailable', message: 'خدمة تحديد الموقع غير متاحة على هذا الجهاز.' }
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ ok: false, code: 'timeout', message: messageFor('timeout') })
    }, 20000)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer)
        const coords = normalizeCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          provider: 'webview',
          altitude: pos.coords.altitude,
        })
        if (coords) resolve({ ok: true, coords, source: 'webview' })
        else resolve({ ok: false, code: 'invalid-coords', message: messageFor('invalid-coords') })
      },
      (err) => {
        clearTimeout(timer)
        const map = {
          1: { code: 'permission-denied', message: messageFor('permission-denied') },
          2: { code: 'unavailable', message: messageFor('unavailable') },
          3: { code: 'timeout', message: messageFor('timeout') },
        }
        const fallback = { code: 'error', message: messageFor('error') }
        resolve(map[err.code] || fallback)
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 120000 }
    )
  })
}

/* ------------------------------------------------------------------ *
 * Continuous tracking (event-driven via native watchPosition)
 * ------------------------------------------------------------------ */

// WebView fallback bookkeeping: maps our watchId → the numeric id returned
// by navigator.geolocation.watchPosition so clearWatch can release it.
const webWatches = new Map()
let webWatchSeq = 1

/**
 * Start continuous location tracking. Resolves `{ ok: true, watchId }` once
 * the watch is live; `onUpdate({ lat, lon, accuracy, provider, altitude })`
 * fires for every OS-delivered fix (already distance/time filtered). On a
 * fatal error, resolves `{ ok: false, code, message }` (or calls
 * `onError` for mid-stream failures).
 *
 * This is never a polling loop: the native side uses
 * LocationManager.requestLocationUpdates, so the OS decides when to deliver
 * a reading based on movement.
 */
export function watchCurrentPosition(
  { minDistanceM = 200, minTimeMs = 10000 } = {},
  onUpdate,
  onError
) {
  if (hasWatchPlugin()) {
    return new Promise((resolve) => {
      let settled = false
      const done = (v) => {
        if (settled) return
        settled = true
        resolve(v)
      }
      try {
        window.cordova.plugins.PrayerLocation.watchPosition(
          { minDistanceM, minTimeMs },
          (r) => {
            if (!r) return
            if (r.ok && r.watchId != null) {
              const n = r.coords ? normalizeCoords(r.coords) : null
              if (n) onUpdate && onUpdate(n)
              if (!settled) done({ ok: true, watchId: r.watchId })
              return
            }
            if (!r.ok && r.code) {
              if (!settled) done({ ok: false, code: r.code, message: messageFor(r.code) })
              else onError && onError({ code: r.code, message: messageFor(r.code) })
            }
          },
          (e) => {
            const code = e?.code || 'error'
            if (!settled) done({ ok: false, code, message: messageFor(code) })
            else onError && onError({ code, message: messageFor(code) })
          }
        )
      } catch (err) {
        done({ ok: false, code: 'error', message: messageFor('error') })
      }
    })
  }

  // WebView fallback
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ ok: false, code: 'unavailable', message: messageFor('unavailable') })
  }
  const id = webWatchSeq++
  const nativeId = navigator.geolocation.watchPosition(
    (pos) => {
      const coords = normalizeCoords({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        provider: 'webview',
        altitude: pos.coords.altitude,
      })
      if (coords) onUpdate && onUpdate(coords)
    },
    (err) => {
      const map = {
        1: { code: 'permission-denied', message: messageFor('permission-denied') },
        2: { code: 'unavailable', message: messageFor('unavailable') },
        3: { code: 'timeout', message: messageFor('timeout') },
      }
      const fallback = { code: 'error', message: messageFor('error') }
      onError && onError(map[err.code] || fallback)
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: minTimeMs }
  )
  webWatches.set(id, nativeId)
  return Promise.resolve({ ok: true, watchId: id })
}

/** Stop a watch started by watchCurrentPosition and free its listener. */
export function clearWatch(watchId) {
  if (watchId == null) return
  if (hasWatchPlugin()) {
    try {
      window.cordova.plugins.PrayerLocation.clearWatch({ watchId }, () => {}, () => {})
    } catch {
      /* ignore */
    }
    return
  }
  const nativeId = webWatches.get(watchId)
  if (nativeId != null) {
    try {
      navigator.geolocation.clearWatch(nativeId)
    } catch {
      /* ignore */
    }
    webWatches.delete(watchId)
  }
}

export function messageFor(code) {
  const map = {
    'permission-denied': 'تم رفض إذن الموقع. فعّل إذن الموقع من إعدادات الجهاز أو اختر مدينتك يدوياً.',
    'permission-permanent': 'رفض إذن الموقع بشكل نهائي. افتح إعدادات الجهاز وفعّله، أو اختر مدينتك يدوياً.',
    'gps-off': 'خدمة تحديد الموقع (GPS) معطّلة على الجهاز. فعّلها من الإعدادات أو أدخل مدينتك يدوياً.',
    'gps-weak': 'إشارة GPS ضعيفة. اقترب من نافذة أو جرّب مرة أخرى، أو اختر مدينتك من القائمة.',
    timeout: 'انتهت مهلة تحديد الموقع. تحقق من تفعيل GPS وحاول مرة أخرى، أو اختر مدينتك يدوياً.',
    unavailable: 'خدمة تحديد الموقع غير متاحة على هذا الجهاز.',
    'invalid-coords': 'إحداثيات غير صالحة. اختر مدينتك يدوياً من القائمة.',
    offline: 'لا يتطلب الموقع اتصالاً بالإنترنت، لكن اتصالك الحالي يمنع وصولـ GPS.',
    error: 'تعذّر تحديد الموقع. حاول مرة أخرى أو اختر مدينتك من القائمة.',
  }
  return map[code] || map.error
}

/**
 * Build a full location object from coordinates: best city match + timezone.
 * @returns {Promise<{ lat, lon, method, countryAr, cityAr, label, tz, ... }>}
 */
export async function locationFromCoords(lat, lon, method = 'gps', { exact = false } = {}) {
  const tz = getDeviceTimeZone()
  let matched = null
  if (!exact) {
    // Only the city-snapped path (prayer times) needs reverse geocoding; the
    // Qibla uses the raw GPS fix so it must never block on the geo.json load.
    try {
      matched = await findNearestCity(lat, lon)
    } catch {
      matched = null
    }
  }
  const base = {
    lat,
    lon,
    method,
    tz: matched?.tz || tz,
    countryAr: matched?.countryAr || '',
    cityAr: matched?.cityAr || '',
    countryCode: matched?.countryCode || '',
  }
  if (!exact && matched && (method === 'geo' || method === 'gps')) {
    // use the city's canonical center so times match its official timezone
    base.lat = matched.lat
    base.lon = matched.lon
    base.label = `${matched.cityAr}، ${matched.countryAr}`
  } else {
    const fmtLat = Math.abs(lat).toFixed(3)
    const fmtLon = Math.abs(lon).toFixed(3)
    base.label = matched
      ? `${matched.cityAr}، ${matched.countryAr}`
      : `${fmtLat}°, ${fmtLon}°`
  }
  return base
}