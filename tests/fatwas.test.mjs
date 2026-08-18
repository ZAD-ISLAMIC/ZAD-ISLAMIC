import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  APP_CREDIT,
  audioFileNameOf,
  buildShareText,
  getCategories,
  getCategoryBySlug,
  getFatwa,
  loadCategory,
  normalizeArabic,
  normalizeHttps,
  refFor,
  searchCategories,
  searchGlobal,
  stripAnswerLabel,
  trackFor,
  totalStats,
} from '../src/services/fatwas.mjs'
import fatwasIndex from '../src/resources/data/fatwas/index.json' with { type: 'json' }

/* ------------------------------------------------------------------ *
 * Data integrity — the generated index must be unique by slug and the
 * stats consistent with the chunk bundles.
 * ------------------------------------------------------------------ */

test('fatwas index.json parses with unique slugs and shaped rows', () => {
  assert.ok(fatwasIndex.length >= 100, 'expect a large category list')
  const slugs = fatwasIndex.map((c) => c.slug)
  assert.equal(new Set(slugs).size, slugs.length, 'slugs must be unique')
  for (const c of fatwasIndex) {
    assert.ok(typeof c.slug === 'string' && c.slug.length > 0)
    assert.ok(typeof c.name === 'string' && c.name.length > 0)
    assert.ok(Number.isInteger(c.count) && c.count > 0)
    assert.ok(Number.isInteger(c.audioCount) && c.audioCount > 0)
  }
})

test('totalStats() matches the generated index', () => {
  const stats = totalStats()
  assert.equal(stats.categories, fatwasIndex.length)
  assert.ok(stats.count >= stats.audioCount >= 1)
})

/* ------------------------------------------------------------------ *
 * Arabic normalization — shared pattern with adhkar/hisn.
 * ------------------------------------------------------------------ */

test('normalizeArabic strips tashkeel and folds variants', () => {
  assert.equal(normalizeArabic('العَـلْفَاءُ'), 'العلفاء')
  assert.equal(normalizeArabic('إبراهيم وأحمد'), 'ابراهيم واحمد')
  assert.equal(normalizeArabic('  مؤمنـة  '), 'مؤمنه')
  assert.equal(normalizeArabic('باللهِ رب العالمين'), 'بالله رب العالمين')
})

/* ------------------------------------------------------------------ *
 * Category lookups
 * ------------------------------------------------------------------ */

test('getCategoryBySlug returns the matching row or null', () => {
  const cat = getCategoryBySlug('احكام-التعزيه')
  assert.ok(cat)
  assert.equal(cat.name, getCategories()[0].name)
  assert.equal(getCategoryBySlug('غير-موجود'), null)
})

test('searchCategories filters by Arabic token (with case/tashkeel insensitivity)', () => {
  const q = searchCategories('الزكاةَ')
  assert.ok(Array.isArray(q))
  assert.ok(q.some((c) => normalizeArabic(c.name).includes('الزكاه')))
})

/* ------------------------------------------------------------------ *
 * Lazy per-category loading
 * ------------------------------------------------------------------ */

test('loadCategory resolves fatwas with stable shape and getFatwa finds by id', async () => {
  const fatwas = await loadCategory('احكام-التعزيه')
  assert.ok(Array.isArray(fatwas) && fatwas.length > 50)
  for (const f of fatwas) {
    assert.ok(Number.isInteger(f.id))
    assert.ok(typeof f.question === 'string' && f.question.length > 0)
  }
  const first = fatwas[0]
  const byId = await getFatwa('احكام-التعزيه', first.id)
  assert.deepEqual(byId, first)
  assert.equal(await getFatwa('غير-موجود', 1), null)
})

test('loadCategory caches the promise (repeated calls resolve the same array)', async () => {
  const a = await loadCategory('احكام-الجمع')
  const b = await loadCategory('احكام-الجمع')
  assert.equal(a, b)
})

/* ------------------------------------------------------------------ *
 * Global offline search
 * ------------------------------------------------------------------ */

test('searchGlobal finds a known fatwa across categories', async () => {
  const results = await searchGlobal('النياحة')
  assert.ok(results.length >= 1)
  const hit = results.find((r) => r.slug === 'احكام-التعزيه')
  assert.ok(hit, 'expected a hit inside احكام-التعزيه')
  assert.ok(hit.title && hit.category)
})

test('searchGlobal returns empty array for empty or no-match queries', async () => {
  assert.deepEqual(await searchGlobal(''), [])
  assert.deepEqual(await searchGlobal('xyzzzq'), [])
})

/* ------------------------------------------------------------------ *
 * Audio refs and download naming
 * ------------------------------------------------------------------ */

test('audioFileNameOf is deterministic and stable across calls', () => {
  const a = audioFileNameOf('http://example.org/fatwa/audio.mp3', 5)
  const b = audioFileNameOf('http://example.org/fatwa/audio.mp3', 5)
  assert.equal(a, b)
  const c = audioFileNameOf('http://example.org/fatwa/other.mp3', 5)
  assert.notEqual(a, c)
})

test('refFor/trackFor build stable storage refs', () => {
  const fatwa = {
    id: 10,
    title: 'حكم كذا',
    question: 'هل يجوز؟',
    audio: 'http://example.org/x/a.mp3',
  }
  const t = trackFor(fatwa, 'فئة اختبار')
  assert.equal(t.kind, 'fatwa')
  assert.equal(t.name, fatwa.title)
  assert.equal(t.sub, 'فئة اختبار')
  assert.equal(t.url, 'https://example.org/x/a.mp3')
  assert.equal(t.ref, refFor(t.fileName))
})

test('normalizeHttps upgrades http and leaves https untouched', () => {
  assert.equal(normalizeHttps('http://binbaz.org.sa/f'), 'https://binbaz.org.sa/f')
  assert.equal(normalizeHttps('https://binbaz.org.sa/f'), 'https://binbaz.org.sa/f')
})

/* ------------------------------------------------------------------ *
 * Answer text helpers
 * ------------------------------------------------------------------ */

test('stripAnswerLabel removes only the leading الجواب: prefix', () => {
  assert.equal(stripAnswerLabel('الجواب: الحمد لله'), 'الحمد لله')
  assert.equal(stripAnswerLabel('  الجواب : نعم، يجوز  '), 'نعم، يجوز')
  assert.equal(stripAnswerLabel('نصّ عادي بلا بادئة'), 'نصّ عادي بلا بادئة')
})

test('buildShareText concatenates question, answer, source and credit', () => {
  const text = buildShareText(
    { title: 'س', question: 'هل؟', answer: 'الجواب: نعم', audio: 'http://e.io/a.mp3', link: 'http://binbaz.org.sa/f' },
    'عقيدة'
  )
  assert.ok(text.includes('السؤال: هل؟'))
  assert.ok(text.includes('الجواب: نعم'))
  assert.ok(text.includes('رابط الصوتية: https://e.io/a.mp3'))
  assert.ok(text.includes('المصدر: http://binbaz.org.sa/f'))
  assert.ok(text.includes('الفئة: عقيدة'))
  assert.ok(text.includes(APP_CREDIT))
})