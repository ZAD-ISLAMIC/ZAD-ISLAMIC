import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HISTORY_APP_CREDIT,
  buildShareText,
  eventDateChips,
  formatEventDate,
  getEraByKey,
  getEras,
  getEvent,
  loadEra,
  normalizeArabic,
  parseEventDate,
  searchHistory,
  totalStats,
} from '../src/services/history.mjs'
import historyIndex from '../src/resources/data/history/index.json' with { type: 'json' }
import { HISTORY_TOTAL_COUNT } from '../src/resources/data/history/chunks.mjs'

/* ------------------------------------------------------------------ *
 * Data integrity — the generated index must cover the full source file
 * with unique era keys and consistent counts.
 * ------------------------------------------------------------------ */

test('history index.json has 16 eras with unique keys matching the source count', () => {
  assert.equal(historyIndex.length, 16)
  const keys = historyIndex.map((e) => e.key)
  assert.equal(new Set(keys).size, keys.length, 'era keys must be unique')
  let total = 0
  for (const era of historyIndex) {
    assert.ok(typeof era.key === 'string' && era.key.length > 0)
    assert.ok(typeof era.title === 'string' && era.title.length > 0)
    assert.ok(Number.isInteger(era.count) && era.count > 0)
    total += era.count
  }
  assert.equal(total, HISTORY_TOTAL_COUNT)
})

test('totalStats() matches the generated index', () => {
  const stats = totalStats()
  assert.equal(stats.count, HISTORY_TOTAL_COUNT)
  assert.equal(stats.eras, historyIndex.length)
})

/* ------------------------------------------------------------------ *
 * Arabic normalization — shared pattern with adhkar/hisn/fatwas.
 * ------------------------------------------------------------------ */

test('normalizeArabic strips tashkeel and folds variants', () => {
  assert.equal(normalizeArabic('الفتْـحُ المبينُ'), 'الفتح المبين')
  assert.equal(normalizeArabic('إبراهيم وأحمد'), 'ابراهيم واحمد')
  assert.equal(normalizeArabic('  غزوةُ بدرٍ  '), 'غزوه بدر')
})

/* ------------------------------------------------------------------ *
 * Era lookups — static index only, no heavy chunk loaded.
 * ------------------------------------------------------------------ */

test('getEraByKey returns matching row or null', () => {
  const before = getEraByKey('before')
  assert.ok(before)
  assert.equal(before.title, 'ما قبل الهجرة')
  assert.equal(getEraByKey('لا-يوجد'), null)
  assert.ok(getEras().length === 16)
})

/* ------------------------------------------------------------------ *
 * Lazy per-era loading
 * ------------------------------------------------------------------ */

test('loadEra caches the promise (repeated calls resolve the same array)', async () => {
  const a = await loadEra('c1')
  const b = await loadEra('c1')
  assert.equal(a, b)
  assert.ok(Array.isArray(a) && a.length > 100)
})

test('getEvent finds by id and each event keeps a stable shape', async () => {
  const events = await loadEra('before')
  for (const e of events) {
    assert.ok(Number.isInteger(e.id))
    assert.ok(typeof e.title === 'string' && e.title.length > 0)
    assert.ok(Array.isArray(e.date) && e.date.length > 0)
    assert.ok(typeof e.text === 'string' && e.text.length > 0)
  }
  const ids = events.map((e) => e.id)
  assert.equal(new Set(ids).size, ids.length, 'ids must be unique within an era')
  const first = events[0]
  const byId = await getEvent('before', first.id)
  assert.deepEqual(byId, first)
  assert.equal(await getEvent('لا-يوجد', 1), null)
})

/* ------------------------------------------------------------------ *
 * Date parsing and formatting
 * ------------------------------------------------------------------ */

test('parseEventDate handles pre-hijra (ق هـ), month and gregorian year', () => {
  const parsed = parseEventDate(['العام الهجري :53ق هـ', 'العام الميلادي :571'])
  assert.deepEqual(parsed, { hijri: 53, beforeHijra: true, month: null, gregorian: 571 })
})

test('formatEventDate renders an Arabic summary string', () => {
  assert.equal(
    formatEventDate({ date: ['العام الهجري :8', 'الشهر القمري : محرم', 'العام الميلادي :629'] }),
    'سنة ٨هـ — ٦٢٩م'
  )
  assert.equal(
    formatEventDate({ date: ['العام الهجري :53ق هـ', 'العام الميلادي :571'] }),
    '٥٣ق هـ — ٥٧١م'
  )
})

test('eventDateChips lists month, hijri and gregorian chips', () => {
  const chips = eventDateChips({ date: ['العام الهجري :8', 'الشهر القمري : رمضان', 'العام الميلادي :629'] })
  assert.deepEqual(chips, ['رمضان', '٨ هـ', '٦٢٩ م'])
})

/* ------------------------------------------------------------------ *
 * Global offline search
 * ------------------------------------------------------------------ */

test('searchHistory finds a known event with Arabic tie-ins stripped', async () => {
  const results = await searchHistory('بدر')
  assert.ok(results.length >= 1)
  const hit = results.find((r) => normalizeArabic(r.title).includes('بدر'))
  assert.ok(hit, 'expected at least one Badr-related event')
  assert.ok(hit.id && hit.era)
})

test('searchHistory returns empty array for empty or no-match queries', async () => {
  assert.deepEqual(await searchHistory(''), [])
  assert.deepEqual(await searchHistory('xyzzzq'), [])
})

/* ------------------------------------------------------------------ *
 * Share text
 * ------------------------------------------------------------------ */

test('buildShareText concatenates title, date, text and app credit', () => {
  const event = {
    title: 'غزوة بدر',
    date: ['العام الهجري :2', 'العام الميلادي :624'],
    text: 'نص الحدث',
  }
  const text = buildShareText(event, 'القرن ٢ الهجري')
  assert.ok(text.includes('الحدث: غزوة بدر'))
  assert.ok(text.includes('التاريخ: سنة ٢هـ'))
  assert.ok(text.includes('نص الحدث'))
  assert.ok(text.includes('الحقبة: القرن ٢ الهجري'))
  assert.ok(text.includes(HISTORY_APP_CREDIT))
})