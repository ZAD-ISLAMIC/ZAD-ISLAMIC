import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  KAABA,
  bearingTo,
  qiblaBearing,
  signedDelta,
  normalizeDeg,
  cardinalName,
  directionName,
  distanceKm,
  formatDistance,
  magneticDeclination,
  headingFromDeviceTop,
} from '../src/utils/qiblaMath.mjs'

/* Reference vectors computed from the closed-form spherical-bearing formula
   and cross-checked against well-known published Qibla directions
   (Cairo ≈ 137°, Riyadh ≈ 244°, Jakarta ≈ 295°, Istanbul ≈ 152°). */
const VECTORS = [
  ['mecca', 21.4225, 39.8262, 0.0],
  ['cairo', 30.0444, 31.2357, 136.1373],
  ['riyadh', 24.7136, 46.6753, 243.7979],
  ['jakarta', -6.2088, 106.8456, 295.1517],
  ['istanbul', 41.0082, 28.9784, 151.6206],
  ['dubai', 25.2048, 55.2708, 258.2312],
  ['london', 51.5074, -0.1278, 118.9872],
  ['newyork', 40.7128, -74.006, 58.4817],
]

test('qiblaBearing reproduces reference vectors (±0.1°)', () => {
  for (const [name, lat, lon, ref] of VECTORS) {
    const got = qiblaBearing(lat, lon)
    assert.ok(
      Math.abs(got - ref) <= 0.1,
      `${name}: got ${got.toFixed(4)}°, expected ${ref.toFixed(4)}°`
    )
  }
})

test('bearing to the same point is 0 (Kaaba → itself)', () => {
  assert.equal(qiblaBearing(KAABA.lat, KAABA.lon), 0)
})

test('normalizeDeg wraps into [0, 360)', () => {
  assert.equal(normalizeDeg(0), 0)
  assert.equal(normalizeDeg(360), 0)
  assert.equal(normalizeDeg(405), 45)
  assert.equal(normalizeDeg(-90), 270)
})

test('reverse bearing is 180° apart on meridians and the equator', () => {
  // equator: due east → reverse is due west
  assert.equal(bearingTo(0, 0, 0, 90), 90)
  assert.equal(bearingTo(0, 90, 0, 0), 270)
  // meridian: due north → reverse is due south
  assert.equal(bearingTo(0, 0, 90, 0), 0)
  assert.equal(bearingTo(90, 0, 0, 0), 180)
})

test('signedDelta gives shortest signed turn', () => {
  assert.equal(signedDelta(90, 0), 90)
  assert.equal(signedDelta(0, 90), -90)
  assert.equal(signedDelta(350, 10), -20) // wrap around
  assert.equal(signedDelta(10, 350), 20)
  assert.equal(signedDelta(137, 133), 4)
  assert.equal(signedDelta(137, 137), 0)
  assert.equal(signedDelta(180, -180), 0)
})

test('cardinalName maps to Arabic 45° sectors', () => {
  assert.equal(cardinalName(0), 'شمال')
  assert.equal(cardinalName(45), 'شمال شرق')
  assert.equal(cardinalName(90), 'شرق')
  assert.equal(cardinalName(135), 'جنوب شرق')
  assert.equal(cardinalName(180), 'جنوب')
  assert.equal(cardinalName(225), 'جنوب غرب')
  assert.equal(cardinalName(270), 'غرب')
  assert.equal(cardinalName(315), 'شمال غرب')
  assert.equal(cardinalName(359), 'شمال')
  assert.equal(cardinalName(-90), 'غرب')
})

test('directionName phrases right/left/ahead', () => {
  assert.equal(directionName(5), 'يمينك')
  assert.equal(directionName(-5), 'يسارك')
  assert.equal(directionName(0), 'أمامك')
  assert.equal(directionName(2.9), 'أمامك')
})

test('distanceKm sanity for known distances', () => {
  // Mecca → itself
  assert.ok(distanceKm(KAABA.lat, KAABA.lon) < 0.5)
  // Cairo → Mecca ≈ 1260 km
  assert.ok(Math.abs(distanceKm(30.0444, 31.2357) - 1260) < 50)
  // Jakarta → Mecca ≈ 7900 km
  assert.ok(Math.abs(distanceKm(-6.2088, 106.8456) - 7900) < 200)
})

test('magneticDeclination matches NOAA WMM2025 reference values (±0.35°)', () => {
  // From the NOAA/NCEI WMM2025 reference implementation driven at the same
  // coordinates (altitude 0). Truncated at degree 6, so we allow a margin.
  const vectors = [
    ['mecca', 21.4225, 39.8262, 3.517],
    ['riyadh', 24.7136, 46.6753, 3.107],
    ['equator 21E', 0, 21, 1.339],
    ['siberia', 43, 93, 0.578],
    ['australia', -33, 109, -5.47],
    ['pacific 144W', 38, -144, 13.099],
  ]
  for (const [name, lat, lon, ref] of vectors) {
    const got = magneticDeclination(lat, lon)
    assert.ok(
      Math.abs(got - ref) <= 0.35,
      `${name}: got ${got.toFixed(3)}°, expected ~${ref.toFixed(3)}°`
    )
  }
})

test('headingFromDeviceTop reads the device top axis in the Android frame', () => {
  // Rotation matrices map device → world (Android: +X east, +Y north, +Z up),
  // as produced by SensorManager.getRotationMatrixFromVector.
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1] // flat, top pointing north
  assert.equal(headingFromDeviceTop(I), 0)

  const east = [0, 1, 0, 1, 0, 0, 0, 0, 1] // device +Y → world +X
  assert.equal(headingFromDeviceTop(east), 90)

  const west = [0, -1, 0, -1, 0, 0, 0, 0, 1] // device +Y → world −X
  assert.equal(headingFromDeviceTop(west), 270)

  const south = [-1, 0, 0, 0, -1, 0, 0, 0, 1] // device +Y → world −Y
  assert.equal(headingFromDeviceTop(south), 180)

  // 45° clockwise heading on a flat table.
  const c = Math.SQRT1_2
  const fortyFive = [c, c, 0, -c, c, 0, 0, 0, 1]
  assert.equal(headingFromDeviceTop(fortyFive), 45)
})

test('formatDistance renders Arabic-friendly units', () => {
  assert.equal(formatDistance(0), '')
  assert.equal(formatDistance(0.5), '500 م')
  assert.equal(formatDistance(1234), '1234 كم')
  assert.equal(formatDistance(12.34), '12.3 كم')
  assert.equal(formatDistance(Number.NaN), '')
})