/**
 * Qibla direction service.
 *
 * Single store for the Qibla screen, consumed via useSyncExternalStore
 * (mirrors player.mjs's subscribe/getSnapshot pattern). It owns:
 *   - the compass stream (native com.rn0x.qibla plugin, or the WebView
 *     deviceorientation fallback for browser preview),
 *   - the resolved location + Qibla bearing/distance (recomputed when the
 *     user changes their location),
 *   - a compact status state-machine so the UI can render precise,
 *     actionable error/empty states.
 *
 * The sensor is only subscribed while `start()` is active; the screen's
 * effect (and visibility handling) calls `stop()` to release it — the only
 * consumer, so no battery is spent in the background.
 */

import {
  isCordova,
} from './device.mjs'
import {
  loadLocation,
  detectCurrentPosition,
  locationFromCoords,
  saveLocation,
  messageFor,
  watchCurrentPosition,
  clearWatch,
} from './location.mjs'
import {
  qiblaBearing,
  signedDelta,
  distanceKm,
  normalizeDeg,
  magneticDeclination,
} from '../utils/qiblaMath.mjs'
import { webCompassSupported, startWebCompass } from './compassWeb.mjs'

/* Smoothing/tuning — single EWMA over the raw magnetic heading, applied in
 * JS so the native stream needs no smoothing of its own, plus guard rails. */
const EWMA_ALPHA = 0.3
const JUMP_REJECT_DEG = 90        // a single reading >90° away is a magnetic spike
const HEADING_EPS = 0.3           // min change that re-renders React
const CALIB_READINGS = 2          // consecutive reads needed to flip calib state
const ALIGN_ENTER = 2             // |delta| ≤ 2° → show "متجه نحو القبلة"
const ALIGN_EXIT = 3.5            // |delta| > 3.5° → leave aligned (hysteresis)

// Continuous location tracking (foreground only, while the Qibla screen is
// visible). The native side filters by distance/time, so updates only arrive
// when the device actually moves — this is event-driven, not a polling loop.
const WATCH_MIN_DISTANCE_M = 200  // OS delivers a fix only after moving ~200m
const WATCH_MIN_TIME_MS = 10000   // …or at most every 10s
const COALESCE_M = 25             // skip GPS jitter smaller than this before recompute
const PERSIST_MS = 5000           // throttle storage writes while traveling

const IDLE_STATE = {
  status: 'idle', // idle | starting | running | calib-required | sensor-unavailable | websensor-unavailable
  sensor: null, // 'native' | 'webview' | null
  heading: null, // smoothed true-north heading (0..360) or null before first fix
  aligned: false, // hysteresis-gated "you are facing the Kaaba" flag
  qiblaBearing: null, // null until a GPS location is resolved
  delta: null,
  distanceKm: null,
  headingAccuracy: null, // { level: 0..3|null, calibrated: bool }
  location: null,
  locationStatus: 'ok', // ok | error | locating
  locationError: null, // { code, message } | null
  watching: false, // true while a continuous location watch is live
  error: null, // { code, message } | null (sensor-level)
}

let state = { ...IDLE_STATE }
let listeners = new Set()
let lastPayload = null

let stopNative = null
let stopWeb = null
let raf = 0
let pendingHeading = null
let pendingAccuracy = null
let streamSource = null // 'native' | 'webview' | null — chosen stream
let streamWatchdog = 0
let declinationDeg = 0 // local magnetic declination, applied to true-north heading
let smoothedRaw = null // single EWMA output on the raw (magnetic) heading
let calibStreak = 0 // consecutive calibrated readings
let uncalibStreak = 0 // consecutive uncalibrated readings
let alignedState = false // sticky aligned flag (hysteresis)
let autoLocating = false
let autoLocatedOnce = false // only once per app session

let watchId = null // active continuous-location watch handle (or null)
let lastFixLat = null // last applied fix, for jitter coalescing
let lastFixLon = null
let lastPersistTs = 0 // throttle for saveLocation while traveling

/* ------------------------------------------------------------------ *
 * Store (useSyncExternalStore-compatible)
 * ------------------------------------------------------------------ */

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getSnapshot() {
  return lastPayload || recreate()
}

/** Lightweight presence toggle so other screens can re-render cheaply. */
let lastActive = false
const activeListeners = new Set()

export function subscribeActive(fn) {
  activeListeners.add(fn)
  return () => activeListeners.delete(fn)
}

export function getActive() {
  return !!lastActive
}

function recreate() {
  lastPayload = clip(state)
  return lastPayload
}

function clip(src) {
  return {
    ...src,
    heading: src.heading,
    headingAccuracy: src.headingAccuracy ? { ...src.headingAccuracy } : null,
    location: src.location ? { ...src.location } : null,
    locationError: src.locationError ? { ...src.locationError } : null,
    watching: src.watching,
    error: src.error ? { ...src.error } : null,
  }
}

function emit() {
  const active = state.status !== 'idle'
  if (active !== lastActive) {
    lastActive = active
    for (const fn of activeListeners) fn()
  }
  lastPayload = clip(state)
  for (const fn of listeners) fn()
}

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

export function isActive() {
  return getActive()
}

/** Stop everything and return to idle. Safe to call when already idle. */
export function stop() {
  if (raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
  clearTimeout(streamWatchdog)
  streamWatchdog = 0
  pendingHeading = null
  pendingAccuracy = null
  if (stopNative) {
    try {
      stopNative()
    } catch {
      /* ignore */
    }
    stopNative = null
  }
  if (stopWeb) {
    try {
      stopWeb()
    } catch {
      /* ignore */
    }
    stopWeb = null
  }
  stopWatching()
  autoLocating = false
  autoLocatedOnce = false // retry a soft GPS failure on the next visit
  state = { ...IDLE_STATE, location: state.location }
  emit()
}

/** Reset the per-stream smoothing/filters so a new start is clean. */
function resetStreamFilters() {
  smoothedRaw = null
  calibStreak = 0
  uncalibStreak = 0
  alignedState = false
}

/** Begin the compass stream + resolve location. Idempotent. */
export function start() {
  if (state.status === 'starting' || state.status === 'running' || state.status === 'calib-required') {
    return
  }
  cancelPending()
  streamSource = null
  resetStreamFilters()
  state = { ...IDLE_STATE, location: state.location, status: 'starting' }
  refreshLocation(false)
  maybeAutoLocate()
  beginStream()
  armWatchdog()
  startWatching()
  emit()
}

/* ------------------------------------------------------------------ *
 * Compass
 * ------------------------------------------------------------------ */

function cancelPending() {
  if (raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
  pendingHeading = null
  pendingAccuracy = null
}

function beginStream() {
  if (isCordova() && window.cordova?.plugins?.QiblaSensor) {
    try {
      window.cordova.plugins.QiblaSensor.isSupported(
        (res) => {
          streamSource = res?.supported ? 'native' : 'webview'
          if (res?.supported) startNativeStream()
          else startWebStream()
        },
        () => {
          streamSource = 'webview'
          startWebStream()
        }
      )
      return
    } catch {
      /* fall through to web */
    }
  }
  streamSource = 'webview'
  startWebStream()
}

/**
 * If the chosen source never delivers a first reading (e.g. a browser
 * without a magnetometer that never fires deviceorientation), surface a
 * clear state instead of an eternal spinner.
 */
function armWatchdog() {
  clearTimeout(streamWatchdog)
  streamWatchdog = setTimeout(() => {
    streamWatchdog = 0
    if (state.status !== 'starting') return
    if (streamSource === 'webview') setStatus('websensor-unavailable')
    else {
      state.error = { code: 'timeout', message: sensorMessage('timeout') }
      setStatus('sensor-unavailable')
    }
  }, 6000)
}

function disarmWatchdog() {
  if (streamWatchdog) {
    clearTimeout(streamWatchdog)
    streamWatchdog = 0
  }
}

function startNativeStream() {
  const plugin = window.cordova.plugins.QiblaSensor
  try {
    plugin.start(
      {},
      (res) => {
        if (res && res.ok) nativeReading(res)
        else onStreamEnd(res?.code)
      },
      () => {}
    )
    stopNative = () => {
      try {
        plugin.stop(() => {}, () => {})
      } catch {
        /* ignore */
      }
    }
  } catch {
    startWebStream()
  }
}

function nativeReading(res) {
  if (state.status === 'idle') return
  pendingAccuracy = {
    level: typeof res.accuracy === 'number' ? res.accuracy : null,
    calibrated: res.calibrated !== false,
  }
  pendingHeading = Number.isFinite(res.azimuth) ? normalizeDeg(res.azimuth) : null
  scheduleCommit()
}

function startWebStream() {
  if (!webCompassSupported()) {
    setStatus('websensor-unavailable')
    return
  }
  try {
    stopWeb = startWebCompass(
      (az) => {
        if (state.status === 'idle') return
        if (state.sensor !== 'webview') {
          state.sensor = 'webview'
          pendingAccuracy = { level: null, calibrated: true }
        }
        pendingHeading = Number.isFinite(az) ? normalizeDeg(az) : null
        scheduleCommit()
      },
      () => {
        setStatus('websensor-unavailable')
      }
    )
  } catch {
    setStatus('websensor-unavailable')
  }
}

function onStreamEnd(code) {
  disarmWatchdog()
  if (!code || code === 'stopped') return
  if (code === 'sensor-unavailable') {
    // Graceful fallback to the WebView when the device lacks the sensors.
    streamSource = 'webview'
    startWebStream()
    armWatchdog()
    return
  }
  state.error = { code, message: sensorMessage(code) }
  setStatus('error')
}

/** Commit the latest reading once per animation frame (≤ display rate). */
function scheduleCommit() {
  disarmWatchdog()
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    const h = pendingHeading
    pendingHeading = null
    if (h == null) return

    // Jump rejection: a single reading 90°+ away from the smoothed value is
    // a magnetic spike (e.g. a passing magnet), not a real rotation — skip it.
    if (smoothedRaw != null && Math.abs(wrapSigned(h - smoothedRaw)) > JUMP_REJECT_DEG) {
      return
    }

    // Single EWMA across both native and WebView streams.
    smoothedRaw =
      smoothedRaw == null ? h : normalizeDeg(smoothedRaw + EWMA_ALPHA * wrapSigned(h - smoothedRaw))

    // Sensor azimuths point at magnetic north; add the local declination so
    // the needle and delta match the geodetic (true-north) qiblaBearing.
    const trueHeading = normalizeDeg(smoothedRaw + declinationDeg)
    const changed = state.heading == null || Math.abs(wrapSigned(trueHeading - state.heading)) >= HEADING_EPS
    state.heading = trueHeading

    if (pendingAccuracy) {
      state.headingAccuracy = pendingAccuracy
      pendingAccuracy = null
    }
    recomputeDelta()

    // Calibration needs two consecutive reads to flip state, so a single
    // glitchy reading never flickers the callout.
    const calibrated = state.headingAccuracy?.calibrated !== false
    if (calibrated) {
      calibStreak += 1
      uncalibStreak = 0
    } else {
      uncalibStreak += 1
      calibStreak = 0
    }
    if (uncalibStreak >= CALIB_READINGS && state.status !== 'calib-required') {
      state.status = 'calib-required'
      emit()
      return
    }
    if (calibStreak >= CALIB_READINGS && state.status !== 'running') {
      state.status = 'running'
      emit()
      return
    }
    if (changed) emit()
  })
}

/** Keep delta fresh and gate the "aligned" flag with hysteresis. */
function recomputeDelta() {
  if (state.heading != null && Number.isFinite(state.qiblaBearing)) {
    state.delta = signedDelta(state.qiblaBearing, state.heading)
    const abs = Math.abs(state.delta)
    if (!alignedState) alignedState = abs <= ALIGN_ENTER
    else if (abs > ALIGN_EXIT) alignedState = false
    state.aligned = alignedState
  } else {
    state.delta = null
    state.aligned = false
  }
}

function setStatus(status) {
  state.status = status
  emit()
}

/* ------------------------------------------------------------------ *
 * Location (GPS-only)
 * ------------------------------------------------------------------ */

/** True only for a location captured via the GPS fix (never a manual city). */
function isGpsLocation(loc) {
  return Boolean(
    loc &&
    loc.method === 'gps' &&
    Number.isFinite(loc.lat) &&
    Number.isFinite(loc.lon)
  )
}

/**
 * Re-read the persisted location. The Qibla honours only GPS-derived fixes;
 * a manually picked city (prayer-times settings) is ignored so the compass
 * always demands its own GPS location.
 */
export function refreshLocation(emitChange = true) {
  const stored = loadLocation()
  const loc = isGpsLocation(stored) ? stored : null
  state.location = loc
  state.locationStatus = 'ok'
  state.locationError = null
  applyLocation(loc)
  if (emitChange) emit()
}

async function applyLocation(loc) {
  const lat = loc?.lat
  const lon = loc?.lon
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    // No usable GPS location: clear the bearing until one is resolved.
    state.qiblaBearing = null
    state.distanceKm = null
    declinationDeg = 0
    recomputeDelta()
    return
  }
  state.qiblaBearing = qiblaBearing(lat, lon)
  state.distanceKm = distanceKm(lat, lon)
  declinationDeg = magneticDeclination(lat, lon)
  recomputeDelta()
}

/**
 * First time the Qibla screen opens in a session with no GPS location, try a
 * one-shot GPS fix so the compass works out of the box. Fails softly: on
 * denial/GPS-off/timeout an actionable error is surfaced on the location card.
 */
async function maybeAutoLocate() {
  if (autoLocating || autoLocatedOnce) return
  // لا تضع العلامة هنا — نضعها فقط بعد اكتمال المحاولة حتى لا نمنع إعادة المحاولة
  if (isGpsLocation(loadLocation())) {
    autoLocatedOnce = true
    return // GPS location already saved
  }
  autoLocating = true
  autoLocatedOnce = true // الآن نسمح فقط بمحاولة واحدة
  state.locationStatus = 'locating'
  emit()
  const res = await detectCurrentPosition()
  autoLocating = false
  if (!res.ok || !Number.isFinite(res.coords?.lat) || !Number.isFinite(res.coords?.lon)) {
    const code = res.code || 'error'
    state.locationStatus = 'error'
    state.locationError = { code, message: res.message || messageFor(code) }
    // Transient failures (denied/GPS-off/timeout) are worth retrying on the
    // next visit once the user fixes them; permanent denial is handled via
    // the open-settings affordance instead of nagging on every entry.
    if (code !== 'permission-permanent') autoLocatedOnce = false
    emit()
    return
  }
  const loc = await locationFromCoords(res.coords.lat, res.coords.lon, 'gps', { exact: true })
  saveLocation(loc)
  state.location = loc
  state.locationStatus = 'ok'
  state.locationError = null
  await applyLocation(loc)
  emit()
}

/**
 * Begin continuous, foreground-only location tracking. The first fix comes
 * from the OS only after the device moves past WATCH_MIN_DISTANCE_M /
 * WATCH_MIN_TIME_MS (event-driven, no polling loop). Each fix coalesces tiny
 * GPS jitter and re-resolves the Qibla bearing; storage writes are throttled.
 */
async function startWatching() {
  if (watchId != null) return
  // Seed the coalescing baseline from the current fix so the first update is
  // measured against where we already are.
  lastFixLat = state.location?.lat ?? null
  lastFixLon = state.location?.lon ?? null
  let res
  try {
    res = await watchCurrentPosition(
      { minDistanceM: WATCH_MIN_DISTANCE_M, minTimeMs: WATCH_MIN_TIME_MS },
      onWatchUpdate,
      onWatchError
    )
  } catch {
    res = { ok: false, code: 'error', message: messageFor('error') }
  }
  if (!res || !res.ok) {
    state.watching = false
    // Don't clobber an already-resolved location; only surface the error if
    // we have nothing usable yet (the compass still works from the saved fix).
    if (state.locationStatus !== 'ok') {
      state.locationStatus = 'error'
      state.locationError = { code: res.code, message: res.message || messageFor(res.code) }
    }
    emit()
    return
  }
  watchId = res.watchId
  state.watching = true
  emit()
}

/** Release the continuous watch. Safe to call when nothing is watching. */
function stopWatching() {
  if (watchId != null) {
    try {
      clearWatch(watchId)
    } catch {
      /* ignore */
    }
    watchId = null
  }
  lastFixLat = null
  lastFixLon = null
  state.watching = false
}

async function onWatchUpdate(coords) {
  const lat = coords?.lat
  const lon = coords?.lon
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return

  // Coalesce GPS jitter below the threshold so we don't recompute the bearing
  // on every few-metre wobble. The OS already filters to ~200m, this is a
  // second guard for the WebView fallback that lacks a distance filter.
  if (lastFixLat != null && lastFixLon != null) {
    if (metersBetween(lastFixLat, lastFixLon, lat, lon) < COALESCE_M) return
  }
  lastFixLat = lat
  lastFixLon = lon

  const loc = await locationFromCoords(lat, lon, 'gps', { exact: true })
  state.location = loc
  state.locationStatus = 'ok'
  state.locationError = null
  state.watching = true
  await applyLocation(loc)

  const now = Date.now()
  if (now - lastPersistTs > PERSIST_MS) {
    lastPersistTs = now
    saveLocation(loc)
  }
  emit()
}

function onWatchError(err) {
  // A mid-stream fatal error (e.g. GPS disabled while traveling): the native
  // watch has ended. Keep the last good fix so the compass still works; just
  // flag the error and let the manual button retry.
  watchId = null
  state.watching = false
  state.locationStatus = 'error'
  state.locationError = {
    code: err?.code || 'error',
    message: err?.message || messageFor(err?.code || 'error'),
  }
  emit()
}

/** Great-circle distance in metres between two coordinates (equirectangular). */
function metersBetween(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const r1 = (lat1 * Math.PI) / 180
  const r2 = (lat2 * Math.PI) / 180
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180 * Math.cos(r1)
  return Math.sqrt(dLat * dLat + dLon * dLon) * R
}

/**
 * Detect the live position via GPS (with permission handling) and persist it.
 * Resolves `true` on success, `false` and a `{ code, message }` error on
 * rejection — the caller may react to permission-denied variants itself.
 */
export async function reDetectLocation() {
  state.locationStatus = 'locating'
  state.locationError = null
  emit()
  const res = await detectCurrentPosition()
  if (!res.ok) {
    state.locationStatus = 'error'
    state.locationError = { code: res.code, message: messageFor(res.code) }
    emit()
    return false
  }
  const loc = await locationFromCoords(res.coords.lat, res.coords.lon, 'gps', { exact: true })
  saveLocation(loc)
  state.location = loc
  state.locationStatus = 'ok'
  state.locationError = null
  lastFixLat = loc.lat
  lastFixLon = loc.lon
  await applyLocation(loc)
  emit()
  return true
}

/* ------------------------------------------------------------------ */

function wrapSigned(deg) {
  let r = deg % 360
  if (r > 180) r -= 360
  if (r < -180) r += 360
  return r
}

export function sensorMessage(code) {
  const map = {
    'sensor-unavailable': 'لا يوجد مستشعر بوصلة على هذا الجهاز.',
    timeout: 'انتهت مهلة القراءة من مستشعر الجهاز. حاول مرة أخرى.',
    error: 'تعذّر قراءة مستشعر الاتجاه. أعد تشغيل الشاشة وحاول.',
  }
  return map[code] || map.error
}