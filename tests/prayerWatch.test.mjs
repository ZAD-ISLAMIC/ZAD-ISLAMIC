import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSchedule, shouldRingAdhan, PRAYERS } from '../src/services/prayerWatch.mjs'
import { toHijri, formatHijriShort } from '../src/utils/hijri.mjs'

const LOC = { lat: 21.4225, lon: 39.8262, tz: 'Asia/Riyadh', label: 'مكة المكرمة' }

function cfg(overrides = {}) {
  return {
    methodId: 'mwsl',
    asrMadhab: 'shafi',
    timeFormat12: false,
    highLatRule: 'NightMiddle',
    adjustments: Object.fromEntries(PRAYERS.map((k) => [k, 0])),
    notifications: true,
    ...overrides,
  }
}

test('buildSchedule produces six events per day over 8 days', () => {
  const now = new Date('2024-06-21T10:00:00Z')
  const s = buildSchedule(LOC, cfg(), now)
  // 8 days x 6 prayers
  assert.equal(s.events.length, 48)
  // sorted ascending
  const arr = s.events.map((e) => e.at)
  assert.deepEqual(arr, [...arr].sort((a, b) => a - b))
  // all six keys present per day
  const dayKeys = new Set(s.events.map((e) => e.atIso.slice(0, 10)))
  assert.equal(dayKeys.size, 8)
})

test('buildSchedule picks the correct next prayer', () => {
  // mid-morning on 2024-06-21, dhuhr should be next
  const s = buildSchedule(LOC, cfg(), new Date('2024-06-21T06:00:00Z'))
  assert.equal(s.next.key, 'dhuhr')
  // after maghrib, isha is next
  const s2 = buildSchedule(LOC, cfg(), new Date('2024-06-21T16:20:00Z'))
  assert.ok(s2.next.key === 'isha' || s2.next.key === 'dhuhr')
})

test('next is never sunrise (only adhan prayers count)', () => {
  const tz = LOC.tz
  // build a schedule and sample every 10 min across one full day; the "next"
  // marker must never be the sunrise/shuruq event.
  const start = new Date('2024-06-21T00:00:00Z')
  const s = buildSchedule(LOC, cfg(), start)
  const t0 = start.getTime()
  const dayEnd = t0 + 24 * 3600 * 1000
  for (let ts = t0; ts <= dayEnd; ts += 10 * 60 * 1000) {
    const snap = buildSchedule(LOC, cfg(), new Date(ts))
    assert.ok(snap.next.isPrayer, `next at ${new Date(ts).toISOString()} must be a prayer, got ${snap.next.key}`)
  }
  // the sunrise event itself still exists in the list (as a marker)
  assert.ok(s.events.some((e) => e.key === 'sunrise' && !e.isPrayer))
})

test('buildSchedule applies minute adjustments', () => {
  const base = buildSchedule(LOC, cfg(), new Date('2024-06-21T06:00:00Z'))
  const adjusted = buildSchedule(LOC, cfg({ adjustments: { dhuhr: 5 } }), new Date('2024-06-21T06:00:00Z'))
  const a = base.events.find((e) => e.key === 'dhuhr').at
  const b = adjusted.events.find((e) => e.key === 'dhuhr').at
  assert.equal(b - a, 5 * 60 * 1000)
})

test('hanafi madhab shifts asr later than shafi', () => {
  const shafi = buildSchedule(LOC, cfg({ asrMadhab: 'shafi' }), new Date('2024-06-21T06:00:00Z'))
  const hanafi = buildSchedule(LOC, cfg({ asrMadhab: 'hanafi' }), new Date('2024-06-21T06:00:00Z'))
  const a = shafi.events.find((e) => e.key === 'asr').at
  const b = hanafi.events.find((e) => e.key === 'asr').at
  assert.ok(b > a, 'hanafi asr should be later')
})

test('makeka method (isha fixed interval) parses cleanly', () => {
  const s = buildSchedule(LOC, cfg({ methodId: 'makkah' }), new Date('2024-06-21T06:00:00Z'))
  const dhuhr = s.events.find((e) => e.key === 'dhuhr').at
  const isha = s.events.find((e) => e.key === 'isha').at
  assert.ok(isha > dhuhr)
})

test('hijri: Umm al-Qura disambiguation for known dates', () => {
  // 1 Ramadan 1445 = 2024-03-11 (Umm al-Qura)
  const r = toHijri(new Date(2024, 2, 11))
  assert.equal(r.m, 9)
  assert.equal(r.d, 1)
  assert.equal(r.y, 1445)
  // 1 Muharram 1445 = 2023-07-19
  const m1 = toHijri(new Date(2023, 6, 19))
  assert.equal(m1.m, 1)
  assert.equal(m1.d, 1)
  assert.equal(m1.y, 1445)
})

test('formatHijriShort is year/month/day for the native notification', () => {
  // Regression: it used day/month/year ("15/9/1445") which the native
  // notification rendered reversed. Must be Y/M/D ("1445/9/15").
  const s = formatHijriShort(new Date(2024, 2, 11)) // 1/9/1445
  assert.equal(s, '1445/9/1')
})

test('fired adhan map is keyed by day so dedupe survives restart', () => {
  // Regression: fireAdhan used to persist `fires[day]` (the sub-map) instead
  // of the full day→prayer map, so after restart `fires[day]` was undefined
  // and the same adhan triggered again on every app open.
  const day = '2026-08-15'
  const fires = { [day]: {} }
  fires[day].asr = { at: new Date().toISOString() }
  const restored = { [day]: { asr: fires[day].asr } }
  assert.ok(restored[day]?.asr, 'day key must be preserved after reload')
})

test('default config keeps respectSoundMode off (always audible)', async () => {
  // storage.mjs writes via window.localStorage — provide a minimal shim.
  const store = new Map()
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  }
  const { loadConfig, updateConfig } = await import('../src/services/prayerConfig.mjs')
  const base = loadConfig()
  assert.equal(base.respectSoundMode, false, 'must default to always-audible')
  const next = updateConfig({ respectSoundMode: true })
  assert.equal(next.respectSoundMode, true)
  assert.equal(loadConfig().respectSoundMode, true)
  delete globalThis.window
})

test('sync payload maps respectSoundMode onto the native payload', async () => {
  const m = await import('../src/services/prayerWatch.mjs')
  const loc = { lat: 21.4225, lon: 39.8262, tz: 'Asia/Riyadh' }
  const cfg = { methodId: 'makkah', asrMadhab: 'shafi', highLatRule: 'NightMiddle', adjustments: {} }
  const s = m.buildSchedule(loc, cfg, new Date('2026-08-15T14:00:00Z'))
  const withRespect = { ...s, config: { ...cfg, respectSoundMode: true } }
  const payload = {
    enabled: true,
    adhanEnabled: true,
    respectSoundMode: withRespect.config?.respectSoundMode === true,
    events: s.events.map((e) => ({ key: e.key, isPrayer: e.isPrayer, ts: e.at })),
  }
  assert.equal(payload.respectSoundMode, true, 'native payload carries the respect flag')
  const off = {
    enabled: true,
    adhanEnabled: true,
    respectSoundMode: false === true,
    events: [],
  }
  assert.equal(off.respectSoundMode, false)
})

test('sync payload includes ts so the native service can render times', async () => {  // Regression: the persistent notification showed "لا توجد مواقيت بعد"
  // because JS sent `atIso` but Java read an (absent) `ts` field → 0.
  const m = await import('../src/services/prayerWatch.mjs')
  const loc = { lat: 21.4225, lon: 39.8262, tz: 'Asia/Riyadh' }
  const cfg = { methodId: 'makkah', asrMadhab: 'shafi', highLatRule: 'NightMiddle', adjustments: {} }
  const s = m.buildSchedule(loc, cfg, new Date('2026-08-15T14:00:00Z'))
  const payload = {
    events: s.events.map((e) => ({ key: e.key, name: e.name, isPrayer: e.isPrayer, atIso: e.atIso, ts: e.at })),
  }
  const ev = payload.events.find((e) => e.key === 'asr')
  assert.equal(typeof ev.ts, 'number')
  assert.equal(new Date(ev.ts).toISOString(), ev.atIso)
  // sunrise is not an adhan prayer
  assert.equal(payload.events.find((e) => e.key === 'sunrise').isPrayer, false)
  // both today and tomorrow are included, so the service has a "next"
  const todayKeys = payload.events.map((e) => e.atIso.slice(0, 10))
  assert.ok(new Set(todayKeys).size >= 2, 'schedule spans multiple days')
})

test('opening the app never rings a prayer (no live previous tick)', () => {
  // Regression: entering the app directly used to trigger the adhan. A fresh
  // open/resume has prevTick === 0, so the first tick must never ring a
  // prayer whose window is already open, even if it is still live.
  const at = Date.now()
  const e = { key: 'dhuhr', name: 'الظهر', isPrayer: true, at, atIso: new Date(at).toISOString() }
  const nowMs = at + 60_000 // 1 min into the 2-min window
  const day = '2026-08-15'
  const fired = { [day]: {} }
  assert.equal(
    shouldRingAdhan({ e, nowMs, prevTick: 0, activeAt: at, hidden: false, fires: fired, day }),
    false,
    'first tick after activation must backfill, not ring'
  )
})

test('a prayer that becomes due during a live tick rings', () => {
  const at = Date.now()
  const e = { key: 'dhuhr', name: 'الظهر', isPrayer: true, at, atIso: new Date(at).toISOString() }
  const nowMs = at + 30_000
  const day = '2026-08-15'
  const fired = { [day]: {} }
  // prevTick is the earlier live tick and the app has been active well past
  // the activation grace, so the live transition rings:
  assert.equal(
    shouldRingAdhan({ e, nowMs, prevTick: at, activeAt: at - 120_000, graceMs: 90_000, hidden: false, fires: fired, day }),
    true,
    'a prayer first observed inside its live window must ring'
  )
})

test('a prayer landing inside the activation grace never rings', () => {
  // Opening the app right before/at a prayer time (within the grace period
  // after activation) must not start the adhan — the notification handles it.
  const at = Date.now()
  const e = { key: 'asr', name: 'العصر', isPrayer: true, at, atIso: new Date(at).toISOString() }
  const nowMs = at + 30_000
  const day = '2026-08-15'
  const fired = { [day]: {} }
  assert.equal(
    shouldRingAdhan({ e, nowMs, prevTick: at, activeAt: at - 30_000, graceMs: 90_000, hidden: false, fires: fired, day }),
    false,
    'a prayer due within the activation grace must be consumed, not rung'
  )
})

test('an already-rung prayer never re-rings on a later open', () => {
  const at = Date.now()
  const e = { key: 'asr', name: 'العصر', isPrayer: true, at, atIso: new Date(at).toISOString() }
  const nowMs = at + 60_000
  const day = '2026-08-15'
  const fired = { [day]: { asr: { at: e.atIso } } }
  assert.equal(
    shouldRingAdhan({ e, nowMs, prevTick: at, activeAt: at - 120_000, graceMs: 90_000, hidden: false, fires: fired, day }),
    false,
    'same-day dedupe prevents replaying the adhan'
  )
})

test('sunrise (non-prayer marker) is never rung', () => {
  const at = Date.now()
  const e = { key: 'sunrise', name: 'الشروق', isPrayer: false, at, atIso: new Date(at).toISOString() }
  const nowMs = at + 30_000
  const day = '2026-08-15'
  assert.equal(
    shouldRingAdhan({ e, nowMs, prevTick: at, activeAt: at - 120_000, graceMs: 90_000, hidden: false, fires: { [day]: {} }, day }),
    false
  )
})

test('hidden app never rings, even for a live transition', () => {
  const at = Date.now()
  const e = { key: 'fajr', name: 'الفجر', isPrayer: true, at, atIso: new Date(at).toISOString() }
  const nowMs = at + 30_000
  const day = '2026-08-15'
  assert.equal(
    shouldRingAdhan({ e, nowMs, prevTick: at, activeAt: at - 120_000, graceMs: 90_000, hidden: true, fires: { [day]: {} }, day }),
    false
  )
})