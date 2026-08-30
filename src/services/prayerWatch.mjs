/**
 * Prayer watch — the glue layer between the local calculator, the UI and
 * the native persistent notification service.
 *
 * Responsibilities:
 *   - build an 8-day schedule of the six prayer times (fully local)
 *   - keep a live snapshot (next/current prayer + countdown) for the UI
 *   - detect prayer-time transitions and emit adhan events (in-app modal)
 *   - push the schedule + next-prayer info to the native foreground
 *     service (com.rn0x.prayerwatch) and refresh it whenever the app
 *     resumes, the location/method changes, or config changes.
 */

import { computeTimes, hourToDate, formatDate } from './prayerTimes.mjs'
import { loadConfig, updateConfig, getPrayerLabels, correctedNow } from './prayerConfig.mjs'
import { getCurrentLocation } from './location.mjs'
import { civilDateInTz, offsetHoursForDate } from './timezone.mjs'
import { isCordova, onDeviceReady } from './device.mjs'
import { storage } from './storage.mjs'
import { formatHijri, formatHijriShort } from '../utils/hijri.mjs'

export const PRAYERS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']
export const ADHAN_PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']
export const FIRE_WINDOW_MS = 6 * 60 * 1000 // a prayer stays "current" for 6 min
// In-app detection window: widened from 2→5 min so the watcher has more
// chances to catch a late native alarm (some OEMs delay setExactAndAllowWhileIdle
// by several minutes under Doze).
const ADHAN_WINDOW_MS = 5 * 60 * 1000
const WATCH_INTERVAL_MS = 30 * 1000
// After the app becomes active/visible, nothing rings during this grace
// period: opening the app — even exactly when a prayer is due — must never
// start the call to prayer by itself. The native notification announces it
// while the app is closed. A prayer only rings if the app was already up and
// watching for at least this long before its time arrived.
const ACTIVATION_GRACE_MS = 3 * WATCH_INTERVAL_MS
// If the native alarm is delayed beyond this many seconds past the exact
// prayer time AND the in-app watcher hasn't seen any push from native,
// the watcher assumes native failed and fires the adhan locally.
const NATIVE_BACKUP_DELAY_MS = 60 * 1000

const FIRED_KEY = 'prayer:fired'
const HIJRI_KEY = 'prayer:hijri-shift'

const FALLBACK_ADHAN_FILE = 'عبد_الباسط.mp3'

/** Bundled adhan file key for the native layer (custom/imported → default). */
function selectedAdhanFile() {
  const s = loadConfig().adhanSound
  if (!s || s === '__custom__') return FALLBACK_ADHAN_FILE
  return s
}

/* ------------------------------------------------------------------ *
 * Schedule computation
 * ------------------------------------------------------------------ */

/**
 * @param {{ lat, lon, tz }} location
 * @param {object} config
 * @param {Date} now
 */
export function buildSchedule(location, config, now = new Date()) {
  const tz = location.tz
  const coords = [location.lat, location.lon, 0]
  const params =
    location.params ||
    (config.methodId === 'custom'
      ? customParams(config)
      : (() => {
          // resolveParams lives in prayerConfig; inline to avoid a cycle here
          const method = config.methodId
          return methodParams(method, config)
        })())
  const labels = getPrayerLabels()
  const asrFactor = config.asrMadhab === 'hanafi' ? 2 : 1

  const events = []
  let today = null
  for (let i = 0; i < 8; i++) {
    const dayMs = now.getTime() + i * 86400000
    const civil = civilDateInTz(dayMs, tz)
    const offsetH = offsetHoursForDate(civil.y, civil.m, civil.d, tz)
    const hours = computeTimes(
      new Date(civil.y, civil.m - 1, civil.d, 12, 0, 0),
      coords,
      offsetH,
      params,
      asrFactor,
      config.highLatRule
    )
    if (i === 0) today = { civil, offsetH, hours }
    for (const key of PRAYERS) {
      const adjMin = config.adjustments?.[key] || 0
      const date = hourToDate(civil, offsetH, hours[key] + adjMin / 60)
      if (!date) continue
      events.push({
        key,
        name: labels[key],
        isPrayer: ADHAN_PRAYERS.includes(key),
        at: date.getTime(),
        atIso: date.toISOString(),
      })
    }
  }
  events.sort((a, b) => a.at - b.at)

  const nowMs = now.getTime()
  // Next *adhan-prayer* only (fajr..isha). sunrise/shuruq is a time marker,
  // not a prayer, so the countdown must never show "الشروق" as next.
  const next = events.find((e) => e.isPrayer && e.at > nowMs)
    || events.find((e) => e.isPrayer)
    || null

  // Current prayer: the most recent event whose window has begun and which
  // is still *adhan-relevant* (fajr..isha). Between isha and fajr the marker
  // falls back to the last started event so the countdown card stays sane.
  const current = [...events]
      .reverse()
      .find((e) => e.isPrayer && nowMs >= e.at && nowMs - e.at < FIRE_WINDOW_MS)
    || (() => {
      const lastStarted = [...events]
        .filter((e) => e.isPrayer)
        .reverse()
        .find((e) => e.at <= nowMs)
      return lastStarted || events.find((e) => e.isPrayer) || null
    })()

  return {
    events,
    nowMs,
    next,
    current,
    today,
    tz,
    coords,
    nextInMs: next ? Math.max(0, next.at - nowMs) : 0,
  }
}

const METHODS_PARAMS = {
  mwsl: { fajr: 18, isha: 17 },
  isna: { fajr: 15, isha: 15 },
  egypt: { fajr: 19.5, isha: 17.5 },
  makkah: { fajr: 18.5, isha: '90 min' },
  diyanet: { fajr: 18, isha: 17 },
  kuwait: { fajr: 18, isha: 17.5 },
  karachi: { fajr: 18, isha: 18 },
  tehran: { fajr: 17.7, isha: 14, maghrib: 4.5, midnight: 'Jafari' },
}

function methodParams(id, config) {
  if (id && METHODS_PARAMS[id]) return { ...METHODS_PARAMS[id] }
  // custom / unknown — reuse the same custom-param resolution
  return customParams(config)
}

function customParams(config) {
  const c = config.custom || {}
  const params = {}
  if (Number.isFinite(c.fajrAngle)) params.fajr = c.fajrAngle
  if (Number.isFinite(c.ishaAngle)) params.isha = c.ishaAngle
  if (Number.isFinite(c.maghribAngle) && c.maghribAngle > 0) params.maghrib = c.maghribAngle
  if (Number.isFinite(c.ishaInterval) && c.ishaInterval > 0) params.isha = `${c.ishaInterval} min`
  if (Number.isFinite(c.maghribInterval) && c.maghribInterval > 0) params.maghrib = `${c.maghribInterval} min`
  if (!params.maghrib) params.maghrib = '0 min'
  return params
}

/* ------------------------------------------------------------------ *
 * Native bridge (com.rn0x.prayerwatch) + sound/fallback
 * ------------------------------------------------------------------ */

function watchPlugin() {
  if (
    isCordova() &&
    typeof window !== 'undefined' &&
    window.cordova?.plugins?.PrayerWatch &&
    typeof window.cordova.plugins.PrayerWatch.start === 'function'
  ) {
    return window.cordova.plugins.PrayerWatch
  }
  return null
}

export function hasNativeWatch() {
  return !!watchPlugin()
}

/**
 * On Android 13+ the persistent notification needs POST_NOTIFICATIONS.
 * Request it before starting the foreground service so the banner is
 * actually visible; resolves quietly when it's already granted or on
 * older platforms.
 */
export function requestNotificationPermission() {
  const plugin = watchPlugin()
  if (!plugin || typeof plugin.requestPermission !== 'function') return Promise.resolve(false)
  return new Promise((resolve) => {
    try {
      plugin.requestPermission(
        () => resolve(true),
        () => resolve(false)
      )
    } catch {
      resolve(false)
    }
  })
}

/**
 * Push the current schedule to the native alarm service.
 * Includes an 8-day event list so the service keeps the next-prayer alarms
 * armed even when the WebView is closed.
 * @returns {Promise<boolean>}
 */
export async function syncNativeWatch(schedule) {
  const plugin = watchPlugin()
  if (!plugin || !schedule) return false
  try {
    const adhanEnabled = schedule.config?.adhanEnabled !== false
    // The native side only powers the background adhan — fully alarm based
    // (no foreground service, no persistent notification).
    if (!adhanEnabled || !schedule.events?.length) {
      await new Promise((resolve, reject) => plugin.stop(resolve, reject))
      nativeArmed = false
      return true
    }
    const payload = {
      enabled: true,
      adhanEnabled: true,
      respectSoundMode: schedule.config?.respectSoundMode === true,
      adhanVolume: schedule.config?.adhanVolume ?? 1,
      timeFormat12: schedule.config?.timeFormat12 !== false,
      city: schedule.location?.cityAr || schedule.location?.label || '',
      hijri: formatHijriShort(new Date()),
      // native resolves the bundled asset by this file name; a custom/imported
      // voice falls back to the default inside the native layer.
      adhanSound: selectedAdhanFile(),
      events: schedule.events.map((e) => ({
        key: e.key,
        name: e.name,
        isPrayer: e.isPrayer,
        atIso: e.atIso,
        ts: e.at,
      })),
    }
    await requestNotificationPermission()
    await new Promise((resolve, reject) => {
      plugin.start(payload, resolve, reject)
    })
    nativeArmed = true
    return true
  } catch (error) {
    console.warn('[prayerwatch] native sync failed', error)
    nativeArmed = false
    return false
  }
}

export async function stopNativeWatch() {
  const plugin = watchPlugin()
  nativeArmed = false
  if (!plugin) return false
  try {
    await new Promise((resolve, reject) => plugin.stop(resolve, reject))
    return true
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ *
 * Singleton watcher — live snapshot + adhan detection
 * ------------------------------------------------------------------ */

const listeners = new Set()
const adhanListeners = new Set()
let snapshot = null
let timer = null
let lastDayKey = ''
// True while the native layer is actually armed with alarms. When armed, the
// native alarm is the single authoritative firer (it rings + pushes the event
// back), so the in-app watcher only consumes — it never replays a ring.
let nativeArmed = false
// `activeAt` is the last instant the app became foreground-visible (cold
// start, resume, or a wake-up from the background freeze detector). Any
// prayer whose adhan window was already open at that instant is presumed
// announced (or missed) elsewhere and must NEVER ring on entry.
let activeAt = correctedNow()
// `prevTickAt` is the timestamp of the previous watch tick within the current
// foreground session (0 = right after activation). A prayer may only ring if
// it *became due during this live watching interval* — i.e. first observed
// inside its 2-min window on a tick that follows a live previous tick. The
// first tick after an activation always has prevTickAt === 0, so merely
// opening/resuming the app can never auto-play the adhan.
let prevTickAt = 0
// When the app is backgrounded, Cordova suspends the WebView timers and the
// OS may freeze the whole JS engine. The tick gap — how long since the last
// `checkTransitions` actually ran — is the reliable signal for "we just woke
// up from a background freeze": a healthy foreground app ticks every
// WATCH_INTERVAL_MS, so a gap beyond a few intervals can only mean the page
// was frozen. On wake we reset the foreground boundary so nothing rings,
// and every prayer still inside its window was missed while hidden → dedupe.
const RESUME_GAP_MS = 3 * WATCH_INTERVAL_MS + 5_000
let lastTickAt = 0
// Track the last prayer time the native layer pushed (via announceNativeAdhan
// or checkSilentAdhan). If no push arrives within NATIVE_BACKUP_DELAY_MS of
// the exact prayer time while nativeArmed, the watcher fires locally.
let nativePushReceived = false
let nativePushPrayerKey = null
// Prevents the backup timer from firing a second time for the same prayer.
// Reset when the prayer window moves to a new prayer.
let backupFiredKey = null
// Tracks the last known clockOffsetMin so we can detect offset changes.
// When the user changes the offset, fired prayers that are now within the
// corrected window are reset so the adhan fires at the new corrected time.
let lastClockOffsetMin = null

/** Establish/refresh the foreground boundary: nothing already due may ring. */
function markActive() {
  activeAt = correctedNow()
  prevTickAt = 0 // next tick only backfills — never rings
  // DO NOT reset nativePushReceived here: if native already announced the
  // adhan before the app was backgrounded, we must not fire again on resume.
  // nativePushReceived is only reset when the window moves to a new prayer.
}

function emit() {
  for (const cb of listeners) {
    try {
      cb(snapshot)
    } catch (err) {
      console.warn('[prayerwatch] listener error', err)
    }
  }
}

function dayKeyOf(now) {
  // Key the "fired" map by the *location's local* civil day, not the UTC day
  // from toISOString(). Keying off UTC breaks dedupe for anyone ahead of (or
  // behind) UTC around midnight — the same prayer would be filed under a new
  // day and re-fire on the next app open.
  const loc = snapshot?.location
  if (loc && loc.tz) {
    const c = civilDateInTz(now.getTime(), loc.tz)
    return `${c.y}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`
  }
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Load the fired-adhan map, migrating the corrupt shape early builds wrote:
 * a plain `{ <prayerKey>: {...} }` object (the day sub-map stored as the
 * whole map). New code keys by day first, so `fires[day]` would be undefined
 * and the same adhan would re-fire on every app open. Detect and discard it.
 */
function firedMap() {
  const raw = storage.get(FIRED_KEY)
  if (!raw || typeof raw !== 'object') return {}
  const keys = Object.keys(raw)
  if (keys.length === 0) return raw
  const isDateKey = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k)
  if (keys.some((k) => !isDateKey(k))) {
    // At least one key is a prayer name, not a date → legacy corruption.
    const clean = {}
    for (const k of keys) if (isDateKey(k)) clean[k] = raw[k]
    storage.set(FIRED_KEY, clean)
    return clean
  }
  return raw
}

/** Read-only snapshot for UI consumers. */
export function getWatchSnapshot() {
  return snapshot
}

export function onWatchSnapshot(cb) {
  listeners.add(cb)
  if (snapshot) cb(snapshot)
  return () => listeners.delete(cb)
}

export function onAdhan(cb) {
  adhanListeners.add(cb)
  return () => adhanListeners.delete(cb)
}

/**
 * Refresh the snapshot + native service.
 * @param {{ location?: object, config?: object }} [opts]
 */
export async function refreshWatch(opts = {}) {
  const location = opts.location || getCurrentLocation()
  const config = opts.config || loadConfig()
  const now = new Date(correctedNow())
  const schedule = buildSchedule(location, config, now)
  const day = dayKeyOf(now)
  snapshot = {
    ...schedule,
    location,
    config,
    nowMs: correctedNow(),
    hijri: formatHijri(now),
    dayKey: day,
  }
  emit()
  await syncNativeWatch({ ...schedule, config, location, hijri: snapshot.hijri, dayKey: day })
  return snapshot
}

/** Persist that a prayer's adhan has been consumed (rung or deliberately skipped). */
function markFired(fires, day, e) {
  fires[day] = fires[day] || {}
  if (fires[day][e.key]) return // idempotent — avoid redundant storage writes
  fires[day][e.key] = { at: e.atIso }
  storage.set(FIRED_KEY, fires)
}

/**
 * Decide whether the in-app adhan should actually ring for an event.
 *
 * A prayer rings only when it transitions into its live 2-minute window while
 * the app is watching from the foreground — i.e. it became due strictly after
 * `prevTick` (a live previous tick), after the last activation boundary
 * (`activeAt`) plus an activation grace period. A fresh open or resume always
 * evaluates with prevTick === 0, so entering the app can never auto-play the
 * call to prayer — not even when the prayer time lands moments after opening.
 */
export function shouldRingAdhan({ e, nowMs, prevTick, activeAt, graceMs, hidden, fires, day }) {
  if (!e || !e.isPrayer) return false
  const within = nowMs >= e.at && nowMs < e.at + ADHAN_WINDOW_MS
  if (!within) return false
  if (hidden) return false
  // Wait for a live tick so opening the app doesn't ring an already-open window
  if (!(prevTick > 0 && e.at >= prevTick && e.at >= activeAt + (graceMs || 0))) return false
  if (fires?.[day]?.[e.key]) return false
  return true
}

function fireAdhan(prayer, fires, day) {
  markFired(fires, day, prayer)
  if (typeof window !== 'undefined' && window.__PRAYER_DEBUG__) {
    console.debug('[prayerwatch] adhan fired', prayer.key, prayer.atIso)
  }
  for (const cb of adhanListeners) cb(prayer)
}

function checkTransitions() {
  if (!snapshot) return
  const now = new Date(correctedNow())
  const nowMs = now.getTime()

  // re-roll the snapshot when we're more than ~12 min stale (also covers the
  // "tomorrow has arrived" case, refreshing both schedule and day key)
  if (nowMs - (snapshot.nowMs || 0) > 12 * 60 * 1000) {
    refreshWatch().catch(() => {})
  }

  // Wake-up detection: while the app was backgrounded, Android paused the
  // WebView timers, so this tick arrives with a gap far larger than the
  // healthy WATCH_INTERVAL_MS cadence. Treat that as a fresh foreground
  // boundary — prayers that came due while hidden were missed and must be
  // deduped, never rung on return. Deterministic, unlike event ordering.
  if (lastTickAt !== 0 && nowMs - lastTickAt > RESUME_GAP_MS) {
    markActive()
  }
  lastTickAt = nowMs

  const fires = firedMap()
  const day = dayKeyOf(now)
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'

  // WIDE_WINDOW: wider than ADHAN_WINDOW_MS so the backup timer can catch
  // prayers that were shifted into the past by a clock-offset adjustment.
  // Without this, a ±5-minute offset push would land the prayer outside the
  // tight 5-minute window and nothing — native or in-app — would ring it.
  const WIDE_WINDOW_MS = 15 * 60 * 1000

  // When the user changes clockOffsetMin, prayers that were already fired
  // in this session should re-fire at the new corrected time.  Reset their
  // entry in the fires map so the backup timer can pick them up again.
  const currentOffset = snapshot.config?.clockOffsetMin ?? 0
  if (lastClockOffsetMin !== null && currentOffset !== lastClockOffsetMin) {
    for (const e of snapshot.events) {
      if (e.isPrayer && nowMs >= e.at && nowMs < e.at + WIDE_WINDOW_MS) {
        if (fires?.[day]?.[e.key]) {
          delete fires[day][e.key]
          storage.set(FIRED_KEY, fires)
        }
      }
    }
    // Also reset native-push trackers so the backup timer can fire again.
    nativePushReceived = false
    nativePushPrayerKey = null
    backupFiredKey = null
  }
  lastClockOffsetMin = currentOffset

  const prevTick = prevTickAt
  prevTickAt = nowMs

  for (const e of snapshot.events) {
    if (nativeArmed) {
      if (e.isPrayer && nowMs >= e.at && nowMs < e.at + WIDE_WINDOW_MS) {
        const dayPrayerKey = day + ':' + e.key
        const alreadyFired = !!fires?.[day]?.[e.key]

        // Reset trackers when the window moves to a new prayer.
        if (backupFiredKey && backupFiredKey !== dayPrayerKey) {
          backupFiredKey = null
          nativePushReceived = false
          nativePushPrayerKey = null
        }

        // Mark as consumed so a repeat open never re-triggers.
        markFired(fires, day, e)

        // BACKUP TIMER: if the native push never arrived and we are past the
        // grace delay, fire the adhan locally so the user hears it even when
        // the native alarm was delayed by Doze / OEM quirks or missed by a
        // clock-offset adjustment.
        if (!nativePushReceived || nativePushPrayerKey !== e.key) {
          // alreadyFired is checked BEFORE markFired above — once a prayer
          // is marked (by native push, backup timer, or manual close), it
          // never re-fires in the same day.
          if (!hidden && !alreadyFired) {
            // Stop any native sound that might be playing (even if the push
            // failed, the native MediaPlayer could still be ringing). This
            // prevents two sounds playing simultaneously.
            stopNativeAdhan()
            backupFiredKey = dayPrayerKey
            fireAdhan(e, fires, day)
            break
          }
        }
      }
      continue
    }
    if (shouldRingAdhan({ e, nowMs, prevTick, activeAt, graceMs: ACTIVATION_GRACE_MS, hidden, fires, day })) {
      fireAdhan(e, fires, day)
      break
    }
    // Anything else currently inside its window (already due before we became
    // active, already fired, hidden, or first tick after open) is consumed so
    // a repeat open inside the same window can never ring it either.
    if (e.isPrayer && nowMs >= e.at && nowMs < e.at + ADHAN_WINDOW_MS) {
      markFired(fires, day, e)
    }
  }

  // prune stale days
  if (lastDayKey && lastDayKey !== day) {
    const fresh = { ...fires }
    for (const k of Object.keys(fresh)) if (k !== day) delete fresh[k]
    storage.set(FIRED_KEY, fresh)
  }
  lastDayKey = day
}

export function startWatchLoop() {
  if (timer) return
  refreshWatch().then(() => checkSilentAdhan()).catch(() => {})
  subscribeNotificationOpen()
  // The first refresh runs at module load — before deviceready the native
  // bridges (PrayerWatch/PrayerLocation) do not exist yet, so re-sync once
  // the platform is ready to request permissions and arm the background.
  onDeviceReady(() => {
    refreshWatch().then(() => checkSilentAdhan()).catch(() => {})
    subscribeNotificationOpen()
    consumeNotificationScreen()
  })
  timer = setInterval(checkTransitions, WATCH_INTERVAL_MS)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('resume', onVisibility)
  }
}

function onVisibility() {
  if (typeof document === 'undefined') return
  if (document.visibilityState === 'hidden') return
  // a resume is a fresh foreground boundary: prayers that came due while the
  // app was backgrounded must not ring on return
  markActive()
  // Re-subscribe the push channel — Cordova may have invalidated the old
  // callback context while the app was backgrounded.
  subscribeNotificationOpen()
  refreshWatch().then(() => checkSilentAdhan()).catch(() => {})
  consumeNotificationScreen()
}

/** Read (and clear) the route the native notification asked us to open. */
function consumeNotificationScreen() {
  const plugin = watchPlugin()
  if (!plugin || typeof plugin.consumeScreen !== 'function') return Promise.resolve('')
  return new Promise((resolve) => {
    try {
      plugin.consumeScreen((v) => resolve(v || ''), () => resolve(''))
    } catch (err) {
      console.warn('[prayerwatch] consumeScreen failed', err)
      resolve('')
    }
  })
}

let openCancel = null

/**
 * Subscribe to the native push channel. The native layer delivers two kinds
 * of messages:
 *   - an adhan event (JSON) right when a prayer fires so the in-app window
 *     opens immediately — no notification tap needed;
 *   - a route string after a notification tap / cold resume (surface the
 *     fired window at the current screen instead of navigating away).
 */
export function subscribeNotificationOpen() {
  if (openCancel) openCancel()
  openCancel = null
  const plugin = watchPlugin()
  if (!plugin || typeof plugin.subscribe !== 'function') return null
  openCancel = plugin.subscribe(
    (payload) => handleNativePush(payload),
    (err) => {
      if (typeof err !== 'string' || !err.includes('cancel')) {
        console.warn('[prayerwatch] subscribe failed', err)
      }
    }
  )
  return openCancel
}

function handleNativePush(payload) {
  if (typeof payload === 'string') {
    const trimmed = payload.trim()
    if (trimmed.startsWith('{')) {
      try {
        const o = JSON.parse(trimmed)
        if (o && o.t === 'adhan') {
          announceNativeAdhan(o)
          return
        }
      } catch (err) {
        console.warn('[prayerwatch] bad push payload', err)
      }
    }
  }
  // Route push / notification tap / cold resume: surface the fired adhan
  // window (silent — the native layer already rang it). Deduped inside.
  checkSilentAdhan().catch(() => {})
}

/**
 * A prayer fired by the native alarm while the app was on screen. The native
 * layer is the single audio source, so this only opens the in-app window in
 * SILENT mode (never replays the adhan). Marking the day's fired map keeps
 * the watcher and later opens from re-surfacing the same prayer.
 */
export function announceNativeAdhan({ key, name, ts } = {}) {
  if (!key) return
  const at = Number(ts) || correctedNow()
  const day = dayKeyOf(new Date(at))
  const dedupe = day + ':' + key
  if (silentShownKey === dedupe) return
  const fires = firedMap()
  markFired(fires, day, { key, atIso: new Date(at).toISOString() })
  silentShownKey = dedupe
  // Record that native successfully pushed — prevents the backup timer
  // from firing a duplicate in-app adhan.
  nativePushReceived = true
  nativePushPrayerKey = key
  // If the backup timer already fired a LIVE adhan for this prayer, don't
  // emit a second SILENT event — the modal is already showing and the
  // sound is already playing.
  if (backupFiredKey === dedupe) return
  emitSilent({
    key,
    name: name || key,
    isPrayer: true,
    at,
    atIso: new Date(at).toISOString(),
    silent: true,
  })
}

/** Stop a background adhan the native side may be playing. */
export function stopNativeAdhan() {
  const plugin = watchPlugin()
  if (!plugin || typeof plugin.stopAdhan !== 'function') return
  try {
    plugin.stopAdhan()
  } catch (err) {
    console.warn('[prayerwatch] stopAdhan failed', err)
  }
}

/**
 * Pull the currently-fired adhan window the native side recorded (within its
 * 30-minute window). Resolves `{ key, name, ts }` or `{}`.
 */
export function getCurrentAdhanWindow() {
  const plugin = watchPlugin()
  if (!plugin || typeof plugin.getWindow !== 'function') return Promise.resolve({})
  return new Promise((resolve) => {
    try {
      plugin.getWindow(
        (w) => resolve(w && typeof w === 'object' ? w : {}),
        () => resolve({})
      )
    } catch (err) {
      console.warn('[prayerwatch] getWindow failed', err)
      resolve({})
    }
  })
}

/** Schedule a demo adhan ~20s from now (plays even while the app is open). */
export function testAdhanNow() {
  const plugin = watchPlugin()
  if (!plugin || typeof plugin.testNow !== 'function') return false
  try {
    plugin.testNow()
    return true
  } catch (err) {
    console.warn('[prayerwatch] testNow failed', err)
    return false
  }
}

/** Aggregate native runtime status for the settings panel. */
export function getWatchStatus() {
  const plugin = watchPlugin()
  if (!plugin || typeof plugin.status !== 'function') return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      plugin.status((s) => resolve(s || {}), () => resolve(null))
    } catch {
      resolve(null)
    }
  })
}

/**
 * Read the device audio state (ringer mode + alarm volume) from the native
 * layer — used to hint the "respect sound mode" setting. Read-only, no
 * permission needed. Resolves { ringerMode, alarmVolume, alarmMax } or null.
 */
export function getAudioState() {
  const plugin = watchPlugin()
  if (!plugin || typeof plugin.getAudioState !== 'function') return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      plugin.getAudioState(
        (s) => resolve(s && typeof s === 'object' ? s : null),
        () => resolve(null)
      )
    } catch {
      resolve(null)
    }
  })
}

/**
 * Set the adhan loudness (0..1) live: applies to a ringing adhan right away
 * and persists it as the default for future ones. Mirrors the config value.
 */
export function setAdhanVolume(volume) {
  const v = Math.min(1, Math.max(0, Number(volume) || 0))
  try {
    updateConfig({ adhanVolume: v })
  } catch {
    /* storage-only — ignore */
  }
  const plugin = watchPlugin()
  if (!plugin || typeof plugin.setAdhanVolume !== 'function') return false
  try {
    plugin.setAdhanVolume(v)
    return true
  } catch {
    return false
  }
}

/**
 * Current adhan volume + live playback state from native.
 * Resolves { volume: 0..1, alarmVolume, alarmMax, playing } or null.
 */
export function getAdhanVolume() {
  const plugin = watchPlugin()
  if (!plugin || typeof plugin.getAdhanVolume !== 'function') return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      plugin.getAdhanVolume(
        (s) => resolve(s && typeof s === 'object' ? s : null),
        () => resolve(null)
      )
    } catch {
      resolve(null)
    }
  })
}

/** Open a system settings screen: "notifications" | "alarms" | "battery". */
export function openSystemSetting(kind) {
  const plugin = watchPlugin()
  if (!plugin || typeof plugin.openSettings !== 'function') return
  try {
    plugin.openSettings(kind)
  } catch (err) {
    console.warn('[prayerwatch] openSettings failed', err)
  }
}

/* ------------------------------------------------------------------ *
 * Silent adhan window — shown when the app (re)opens inside a fired
 * window, without auto-playing (the background already rang).
 * ------------------------------------------------------------------ */

const silentListeners = new Set()
let silentShownKey = null

export function onSilentAdhan(cb) {
  silentListeners.add(cb)
  if (silentShownKey) {
    const e = lastSilentEvent
    if (e) cb(e)
  }
  return () => silentListeners.delete(cb)
}

let lastSilentEvent = null

function emitSilent(event) {
  lastSilentEvent = event
  for (const cb of silentListeners) {
    try {
      cb(event)
    } catch (err) {
      console.warn('[prayerwatch] silent listener error', err)
    }
  }
}

/**
 * On app start/resume (or after opening from a tapped notification): if the
 * native layer recorded a fired adhan inside its 30-minute window, bring up
 * the in-app adhan window in silent mode (no auto-play — the background
 * already announced it). Deduped to once per fired prayer per session.
 */
export async function checkSilentAdhan() {
  const win = await getCurrentAdhanWindow()
  if (!win || !win.key || !win.ts) {
    silentShownKey = null
    return
  }
  // Dedupe by location-day + prayer, so the same prayer on a different day is
  // never suppressed by a stale marker from an earlier session.
  const dedupe = dayKeyOf(new Date(win.ts)) + ':' + win.key
  if (silentShownKey === dedupe) return
  silentShownKey = dedupe
  // Record that native fired — prevents the backup timer from duplicating.
  nativePushReceived = true
  nativePushPrayerKey = win.key
  // find a matching label via the schedule snapshot
  const ev = (snapshot?.events || []).find((e) => e.key === win.key)
  emitSilent({
    key: win.key,
    name: win.name || ev?.name || win.key,
    isPrayer: true,
    at: win.ts,
    atIso: new Date(win.ts).toISOString(),
    silent: true,
  })
}

/** Forget the dedupe marker when the user closes the window. */
export function clearSilentAdhan() {
  silentShownKey = null
  lastSilentEvent = null
  nativePushReceived = false
  nativePushPrayerKey = null
  backupFiredKey = null
}

/** Navigate a HashRouter app to a route like "/prayer". */
export function navigateTo(route) {
  if (!route || typeof window === 'undefined') return
  const wanted = '#' + route.replace(/^#/, '')
  if (window.location.hash === wanted) return
  window.location.hash = wanted
}

export function stopWatchLoop() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (openCancel) {
    openCancel()
    openCancel = null
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('resume', onVisibility)
  }
}

/** Format a Date as HH:MM in the location's zone. */
export function formatPrayerDate(dateIso, format12 = false) {
  return formatDate(new Date(dateIso), format12)
}

/* ------------------------------------------------------------------ *
 * Hijri (local, no network)
 * ------------------------------------------------------------------ */

export function getHijriShift() {
  return storage.get(HIJRI_KEY, 0)
}

export function setHijriShift(days) {
  storage.set(HIJRI_KEY, days)
}

export function todayHijri(shiftDays = getHijriShift()) {
  const d = new Date(correctedNow() + (shiftDays || 0) * 86400000)
  return formatHijri(d)
}

export { formatHijri }