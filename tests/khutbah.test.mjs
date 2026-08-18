import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  APP_CREDIT,
  attachmentFileName,
  attachmentRef,
  authorName,
  batchIndexFor,
  buildShareText,
  extOf,
  formatDate,
  getCategories,
  getCategoryBySlug,
  getKhutbahById,
  loadBatch,
  loadCategory,
  mimeOf,
  normalizeArabic,
  normalizeHttps,
  parseKhutbah,
  searchCategories,
  searchGlobal,
  slugForCategory,
  totalStats,
  trackFor,
} from '../src/services/khutbah.mjs'
import khutbahIndex from '../src/resources/data/khutbah/index.json' with { type: 'json' }

/* ------------------------------------------------------------------ *
 * Data integrity — the generated index must be unique by slug and the
 * stats consistent with the batch constants.
 * ------------------------------------------------------------------ */

test('khutbah index.json parses with unique slugs and shaped rows', () => {
  assert.ok(khutbahIndex.length >= 70, 'expect a large category list')
  const slugs = khutbahIndex.map((c) => c.slug)
  assert.equal(new Set(slugs).size, slugs.length, 'slugs must be unique')
  for (const c of khutbahIndex) {
    assert.ok(typeof c.slug === 'string' && c.slug.length > 0)
    assert.ok(typeof c.name === 'string' && c.name.length > 0)
    assert.ok(Number.isInteger(c.count) && c.count > 0)
  }
})

test('totalStats() matches the generated constants', () => {
  const stats = totalStats()
  assert.equal(stats.categories, khutbahIndex.length)
  assert.equal(stats.count, 4531)
  assert.equal(stats.batches, 9)
  assert.ok(stats.authors >= 200)
  assert.equal(stats.attachments, 7264)
})

/* ------------------------------------------------------------------ *
 * Arabic normalization — shared pattern with fatwas/adhkar.
 * ------------------------------------------------------------------ */

test('normalizeArabic strips tashkeel and folds variants', () => {
  assert.equal(normalizeArabic('الخطبةُ الأولى'), 'الخطبه الاولى')
  assert.equal(normalizeArabic('إيمان ومؤمنة'), 'ايمان ومؤمنه')
  assert.equal(normalizeArabic('  المسـلمين  '), 'المسلمين')
  assert.equal(normalizeArabic('تطْهيرُ القلوب'), 'تطهير القلوب')
})

/* ------------------------------------------------------------------ *
 * Category lookups
 * ------------------------------------------------------------------ */

test('getCategoryBySlug returns the matching row or null', () => {
  const cat = getCategoryBySlug('الخطب-المتنوعه')
  assert.ok(cat)
  assert.equal(cat.name, 'الخطب المتنوعة')
  assert.equal(getCategoryBySlug('غير-موجود'), null)
})

test('searchCategories filters by Arabic token', () => {
  const q = searchCategories('الجمعة')
  assert.ok(Array.isArray(q))
  assert.ok(q.some((c) => normalizeArabic(c.name).includes('الجمعه')))
})

/* ------------------------------------------------------------------ *
 * Lazy per-category + full-content batches
 * ------------------------------------------------------------------ */

test('loadCategory resolves lightweight rows with stable shape', async () => {
  const rows = await loadCategory('احوال-القلوب')
  assert.ok(Array.isArray(rows) && rows.length > 100)
  for (const r of rows) {
    assert.ok(Number.isInteger(r.id))
    assert.ok(typeof r.title === 'string' && r.title.length > 0)
    assert.ok(typeof r.slug === 'string' && r.slug.length > 0)
    assert.ok(!('content' in r), 'category rows must stay lightweight')
  }
  assert.equal(await loadCategory('غير-موجود'), null)
})

test('loadCategory caches the promise (repeated calls resolve the same array)', async () => {
  const a = await loadCategory('التوحيد')
  const b = await loadCategory('التوحيد')
  assert.equal(a, b)
})

test('batchIndexFor maps contiguous ids across batch size 512', () => {
  assert.equal(batchIndexFor(1), 0)
  assert.equal(batchIndexFor(512), 0)
  assert.equal(batchIndexFor(513), 1)
  assert.equal(batchIndexFor(4531), 8)
  assert.equal(batchIndexFor(0), -1)
  assert.equal(batchIndexFor(4532), -1)
})

test('getKhutbahById resolves a full record from its batch (with attachments)', async () => {
  const k = await getKhutbahById(1)
  assert.ok(k)
  assert.equal(k.id, 1)
  assert.equal(k.title, 'يتخوضون في مال الله')
  assert.ok(typeof k.content === 'string' && k.content.length > 100)
  assert.ok(Array.isArray(k.attachments) && k.attachments.length === 2)
  const pdf = k.attachments.find((a) => a.name.endsWith('.pdf'))
  assert.ok(pdf && pdf.link.includes('khutabaa.com'))
  assert.equal(await getKhutbahById(0), null)
  assert.equal(await getKhutbahById(99999), null)
})

/* ------------------------------------------------------------------ *
 * Global offline search
 * ------------------------------------------------------------------ */

test('searchGlobal finds a known khutbah across categories', async () => {
  const results = await searchGlobal('يتخوضون')
  assert.ok(results.length >= 1)
  const hit = results.find((r) => r.id === 1)
  assert.ok(hit, 'expected a hit for khutbah #1')
  assert.ok(hit.title && hit.category && hit.author)
})

test('searchGlobal returns empty array for empty or no-match queries', async () => {
  assert.deepEqual(await searchGlobal(''), [])
  assert.deepEqual(await searchGlobal('xyzzzq'), [])
})

test('slugForCategory resolves raw names to real slugs (or passes through)', () => {
  assert.equal(slugForCategory('التربية'), 'التربيه')
  assert.equal(slugForCategory('الإيمان'), 'الايمان')
  assert.equal(slugForCategory('الأخلاق المذمومة'), 'الاخلاق-المذمومه')
  assert.equal(slugForCategory('التربيه'), 'التربيه')
  assert.equal(slugForCategory(''), '')
})

test('searchGlobal returns results with valid slugs for navigation', async () => {
  const results = await searchGlobal('النفاق')
  assert.ok(results.length >= 1)
  for (const r of results) {
    const cat = getCategoryBySlug(r.slug)
    assert.ok(cat, `slug ${r.slug} must resolve to a real category`)
    assert.ok(cat.name && cat.count > 0)
  }
  const byName = await searchGlobal('التربية')
  assert.ok(byName.length >= 1)
  assert.ok(
    byName.some((r) => r.slug === 'التربيه' && r.category === 'التربية'),
    'expected at least one hit resolving to the التربية category'
  )
  assert.ok(byName.every((r) => getCategoryBySlug(r.slug)))
})

/* ------------------------------------------------------------------ *
 * Content parsing
 * ------------------------------------------------------------------ */

test('parseKhutbah splits known section headers from paragraphs', () => {
  const sections = parseKhutbah('عناصر الخطبة\nنقطة أولى\nنقطة ثانية\nالخطبة الأولى\nالحمد لله\nخاتمة\nاللهم صلِ وسلم')
  const headers = sections.filter((s) => s.type === 'header').map((s) => s.text)
  assert.ok(headers.includes('عناصر الخطبة'))
  assert.ok(headers.includes('الخطبة الأولى'))
  assert.ok(headers.includes('خاتمة'))
  const paras = sections.filter((s) => s.type === 'para')
  assert.ok(paras.some((p) => p.text.includes('الحمد لله')))
})

test('parseKhutbah ignores blank/whitespace-only lines', () => {
  assert.deepEqual(parseKhutbah('  \n\n\n'), [])
  assert.deepEqual(parseKhutbah(''), [])
})

/* ------------------------------------------------------------------ *
 * Authors, dates, http normalization
 * ------------------------------------------------------------------ */

test('authorName/formatDate handle missing values gracefully', () => {
  assert.equal(authorName('  الشيخ فلان  '), 'الشيخ فلان')
  assert.equal(authorName(null), '')
  assert.equal(formatDate('2021-05-03T00:00:00Z'), '03/05/2021م')
  assert.equal(formatDate(''), '')
})

test('normalizeHttps upgrades http and leaves https untouched', () => {
  assert.equal(normalizeHttps('http://khutabaa.com/a'), 'https://khutabaa.com/a')
  assert.equal(normalizeHttps('https://khutabaa.com/a'), 'https://khutabaa.com/a')
})

/* ------------------------------------------------------------------ *
 * Attachment refs and naming
 * ------------------------------------------------------------------ */

test('extOf/mimeOf map the supported file types', () => {
  assert.equal(extOf('خطبة.pdf'), 'pdf')
  assert.equal(mimeOf('خطبة.pdf'), 'application/pdf')
  assert.equal(mimeOf('خطبة.doc'), 'application/msword')
  assert.equal(mimeOf('خطبة.docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  assert.equal(extOf('ملف بدون امتداد'), 'doc')
  assert.equal(mimeOf('ملف بدون امتداد'), 'application/msword')
})

test('attachmentFileName is deterministic, keeps extension and Arabic name', () => {
  const att = { name: 'يتخوضون_في_مال_الله.pdf', link: 'https://khutabaa.com/article/x/download-file/380884' }
  const a = attachmentFileName(att)
  const b = attachmentFileName(att)
  assert.equal(a, b)
  assert.ok(a.endsWith('.pdf'), 'must keep the original extension')
  assert.ok(a.includes('يتخوضون'), 'must keep a readable Arabic fragment')
  const other = attachmentFileName({ ...att, link: att.link + '2' })
  assert.notEqual(a, other, 'different links must produce different names')
})

test('attachmentRef/trackFor build stable storage refs', () => {
  const khutbah = { id: 1, title: 'يتخوضون في مال الله' }
  const att = { name: 'يتخوضون_في_مال_الله.doc', link: 'http://khutabaa.com/a/download-file/380883' }
  const t = trackFor(khutbah, att)
  assert.equal(t.kind, 'khutbah')
  assert.equal(t.name, att.name)
  assert.equal(t.sub, khutbah.title)
  assert.equal(t.url, 'https://khutabaa.com/a/download-file/380883')
  assert.equal(t.ref, attachmentRef(att))
})

/* ------------------------------------------------------------------ *
 * Share text
 * ------------------------------------------------------------------ */

test('buildShareText concatenates title, author, content, source and credit', () => {
  const text = buildShareText({
    title: 'الخطبة الأولى',
    author: 'الشيخ فلان',
    content: 'الحمد لله',
    url: 'http://khutabaa.com/article/x',
  })
  assert.ok(text.includes('الخطبة: الخطبة الأولى'))
  assert.ok(text.includes('الكاتب: الشيخ فلان'))
  assert.ok(text.includes('الحمد لله'))
  assert.ok(text.includes('المصدر: https://khutabaa.com/article/x'))
  assert.ok(text.includes(APP_CREDIT))
})
