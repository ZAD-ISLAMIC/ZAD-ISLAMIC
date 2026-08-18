import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dayOfYear,
  verseByRef,
  todayVerse,
  todayDhikr,
  hourOf,
  pickAdhkarCategory,
  todayHomeStats,
} from '../src/services/daily.mjs'
import quranData from '../src/resources/data/quran.json' with { type: 'json' }
import { SURAH_META } from '../src/services/surahsMeta.mjs'

const FIXED_DATES = [
  '2026-01-01T12:00:00',
  '2026-03-15T12:00:00',
  '2026-08-18T12:00:00',
  '2026-12-31T12:00:00',
  '2027-05-05T12:00:00',
]

test('same gregorian day always yields the same verse of the day', () => {
  for (const iso of FIXED_DATES) {
    const date = new Date(iso)
    const a = todayVerse(date)
    const b = todayVerse(new Date(iso))
    assert.deepEqual(a, b)
  }
})

test('same gregorian day always yields the same dhikr of the day', () => {
  for (const iso of FIXED_DATES) {
    const date = new Date(iso)
    const a = todayDhikr(date)
    const b = todayDhikr(new Date(iso))
    assert.deepEqual(a, b)
  }
})

test('every verse-of-the-day reference is within its surah bounds', () => {
  const seen = new Map()
  // probe todayVerse across a full year to walk the entire rotation
  for (let doy = 0; doy < 366; doy++) {
    const date = new Date(Date.UTC(2026, 0, 1) + doy * 86400000)
    const v = todayVerse(date)
    if (!v) continue
    if (seen.has(v.surahIndex + ':' + v.verse)) continue
    seen.set(v.surahIndex + ':' + v.verse, true)
    const meta = SURAH_META[v.surahIndex]
    assert.ok(meta, `سورة مفقودة في SURAH_META للفهرس ${v.surahIndex}`)
    assert.ok(
      v.verse >= 1 && v.verse <= meta.v,
      `الآية ${v.verse} خارج حدود سورة ${meta.name} (${meta.v} آية)`
    )
  }
  assert.ok(seen.size >= 40, 'expected the full rotation of ~40 references')
})

test('verseByRef resolves the exact ayah text from the bundled mushaf', () => {
  const v = verseByRef(1, 255) // آية الكرسي
  assert.ok(v)
  assert.equal(v.surahName, 'البقرة')
  const normalized = v.text.normalize('NFC')
  assert.ok(normalized.startsWith('ٱللَّهُ'.normalize('NFC')))
  assert.ok(normalized.includes('إِلَٰهَ إِلَّا هُوَ'.normalize('NFC')))
})

test('verseByRef returns null for an out-of-range verse', () => {
  assert.equal(verseByRef(1, 9999), null)
  assert.equal(verseByRef(999, 1), null)
})

test('dayOfYear is stable and sequential', () => {
  assert.equal(dayOfYear(new Date('2026-01-01T00:00:00')), 1)
  assert.equal(dayOfYear(new Date('2026-01-02T00:00:00')), 2)
  const a = dayOfYear(new Date('2026-06-15T10:00:00'))
  const b = dayOfYear(new Date('2026-06-15T22:00:00'))
  assert.equal(a, b)
  assert.equal(a, dayOfYear(new Date('2026-06-15T12:00:00')))
})

test('morning/evening split around the dhuhr boundary', () => {
  assert.equal(pickAdhkarCategory({ now: new Date('2026-08-18T09:00:00') }), 'morning')
  assert.equal(pickAdhkarCategory({ now: new Date('2026-08-18T11:59:00') }), 'morning')
  assert.equal(pickAdhkarCategory({ now: new Date('2026-08-18T12:01:00') }), 'evening')
  assert.equal(pickAdhkarCategory({ now: new Date('2026-08-18T21:00:00') }), 'evening')
})

test('asr hour overrides the noon boundary when provided', () => {
  const asrHour = 15.5
  assert.equal(pickAdhkarCategory({ now: new Date('2026-08-18T12:30:00'), asrHour }), 'morning')
  assert.equal(pickAdhkarCategory({ now: new Date('2026-08-18T16:00:00'), asrHour }), 'evening')
})

test('hourOf computes fractional hours', () => {
  assert.equal(hourOf(new Date('2026-08-18T00:30:00')), 0.5)
  assert.equal(hourOf(new Date('2026-08-18T12:00:00')), 12)
  assert.equal(hourOf(new Date('2026-08-18T23:45:00')), 23.75)
})

test('todayDhikr yields a plausible short dhikr with its source category', () => {
  const d = todayDhikr(new Date('2026-08-18T12:00:00'))
  assert.ok(d)
  assert.ok(typeof d.text === 'string' && d.text.length > 0)
  assert.ok(typeof d.category === 'string' && d.category.length > 0)
  assert.equal(d.count, 1)
})

test('todayHomeStats returns numeric counters and a streak', () => {
  const s = todayHomeStats()
  assert.equal(typeof s.tasbih, 'number')
  assert.equal(typeof s.adhkarToday, 'number')
  assert.equal(typeof s.streak, 'number')
  assert.ok(Number.isFinite(s.tasbih))
  assert.ok(Number.isFinite(s.adhkarToday))
  assert.ok(Number.isFinite(s.streak))
  assert.ok(s.streak >= 0)
})