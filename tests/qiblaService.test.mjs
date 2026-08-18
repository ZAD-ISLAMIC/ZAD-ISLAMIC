import { test } from 'node:test'
import assert from 'node:assert/strict'

/**
 * The Qibla service reaches for real sensors/location/storage at runtime;
 * this harness shims window/localStorage/cordova *before* importing the
 * module, so readings can be driven deterministically.
 */

const nativeCb = { current: null }
const webCb = { current: null }

const mem = new Map()
const shimWindow = {
  cordova: { platformId: 'android', plugins: { QiblaSensor: {} } },
}
shimWindow.cordova.plugins.QiblaSensor = {
  isSupported(cb) { cb({ supported: true, source: 'rotation-vector' }) },
  start(_opts, cb) { nativeCb.current = cb },
  stop(cb) { nativeCb.current = null; cb?.() },
}
shimWindow.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  get length() { return mem.size },
}
shimWindow.addEventListener = () => {}
shimWindow.removeEventListener = () => {}

globalThis.window = shimWindow
globalThis.requestAnimationFrame = (cb) => { cb(); return 0 } // synchronous; 0 = no pending frame
globalThis.cancelAnimationFrame = () => {}

let qibla
test.before(async () => {
  qibla = await import('../src/services/qibla.mjs')
})

function seedGpsKaaba() {
  // GPS-method location at the Kaaba → bearing 0, declination ≈ +3.67°.
  mem.set(
    'altaqwaa:prayer:location',
    JSON.stringify({
      method: 'gps',
      lat: 21.4225,
      lon: 39.8262,
      label: '21.423°, 39.826°',
    })
  )
}

function feedNative(azimuth, calibrated = true, accuracy = 3) {
  nativeCb.current?.({ ok: true, azimuth, calibrated, accuracy })
}
function feedWeb(azimuth) {
  webCb.current?.(azimuth)
}

test('service starts, reaches running and reports a heading', () => {
  qibla.stop()
  qibla.start()
  assert.equal(qibla.getSnapshot().status, 'starting')
  feedNative(0, true, 3)
  assert.equal(qibla.getSnapshot().status, 'starting') // needs 2 reads
  feedNative(1, true, 3)
  const s = qibla.getSnapshot()
  assert.equal(s.status, 'running')
  assert.equal(typeof s.heading, 'number')
})

test('EWMA smooths + a single spike is rejected', () => {
  qibla.stop()
  qibla.start()
  // Establish a stable smoothed heading near 340 (magnetic).
  for (let i = 0; i < 3; i++) feedNative(340, true, 3)
  const before = qibla.getSnapshot().heading

  // A 180° spike then a sane reading again — needle must not follow the spike.
  feedNative(160, true, 3)
  feedNative(341, true, 3)
  const after = qibla.getSnapshot().heading
  assert.ok(Math.abs(after - before) < 3, `heading moved ${before} -> ${after}`)
})

test('aligned flag needs hysteresis (enters at ≤2°, leaves at >3.5°)', () => {
  seedGpsKaaba()
  qibla.stop()
  qibla.start()
  assert.equal(qibla.getSnapshot().aligned, false)

  // With the seeded GPS Kaaba location the store's bearing is 0°, and the
  // local declination (≈ +3.67°) shifts the true-north heading. Feeds are
  // therefore expressed in *magnetic* azimuths: 356 → true 359.7° (delta ~0.3°).
  feedNative(356, true, 3)
  assert.equal(qibla.getSnapshot().aligned, true)

  // Drift east to azimuth 5 (true ~8.7°): the EWMA takes two readings to
  // cross the 3.5° exit threshold instead of flickering on one sample.
  feedNative(5, true, 3)
  assert.equal(qibla.getSnapshot().aligned, true) // still inside band
  feedNative(5, true, 3)
  assert.equal(qibla.getSnapshot().aligned, false)
})

test('calibration state needs two consecutive unreliable reads', () => {
  qibla.stop()
  qibla.start()
  feedNative(200, false, 1)
  assert.equal(qibla.getSnapshot().status, 'starting') // 1 unreliable read
  feedNative(201, false, 1)
  assert.equal(qibla.getSnapshot().status, 'calib-required') // 2nd flips it
  feedNative(202, true, 3)
  feedNative(203, true, 3)
  assert.equal(qibla.getSnapshot().status, 'running')
})

test('stop() releases the native stream and returns idle', () => {
  qibla.stop()
  qibla.start()
  feedNative(10, true, 3)
  feedNative(11, true, 3)
  assert.equal(qibla.getSnapshot().status, 'running')
  assert.notEqual(nativeCb.current, null)
  qibla.stop()
  assert.equal(qibla.getSnapshot().status, 'idle')
  assert.equal(nativeCb.current, null)
})

test('auto-locate without saved location surfaces a GPS error, not silent ok', async () => {
  // Ensure no stored location and no prior success so auto-locate runs. In
  // this harness GPS is unavailable (no plugin/geolocation) → 'unavailable'.
  mem.clear()
  qibla.stop()
  qibla.start()
  await new Promise((r) => setTimeout(r, 0)) // let detectCurrentPosition resolve
  const s = qibla.getSnapshot()
  assert.equal(s.locationStatus, 'error')
  assert.ok(s.locationError, 'locationError should be set on GPS failure')
  assert.ok(!s.locationFromFallback || s.location, 'fallback location stays usable')
})