import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TAFSEER_APP_CREDIT,
  buildShareText,
  getSurahByNo,
  loadSurah,
  normalizeArabic,
  searchTafseer,
  stripLeadingMarker,
  totalStats,
} from '../src/services/tafseer.mjs'
import tafseerIndex from '../src/resources/data/tafseer/index.json' with { type: 'json' }
import { TAFSEER_TOTAL } from '../src/resources/data/tafseer/chunks.mjs'
import quranData from '../src/resources/data/quran.json' with { type: 'json' }

/* ------------------------------------------------------------------ *
 * Data integrity — the generated index must cover the full source
 * (114 surahs, 6236 ayahs) with counts matching quran.json.
 * ------------------------------------------------------------------ */

test('tafseer index.json has 114 surahs with unique numbers summing to 6236', () => {
  assert.equal(tafseerIndex.length, 114)
  const numbers = tafseerIndex.map((s) => s.n)
  assert.equal(new Set(numbers).size, numbers.length, 'surah numbers must be unique')
  let total = 0
  for (const surah of tafseerIndex) {
    assert.ok(Number.isInteger(surah.n) && surah.n >= 1 && surah.n <= 114)
    assert.ok(typeof surah.nameAr === 'string' && surah.nameAr.trim().length > 0)
    assert.ok(Number.isInteger(surah.verses) && surah.verses > 0)
    assert.ok(Array.isArray(surah.jozz) && surah.jozz.length === 2)
    assert.ok(Array.isArray(surah.pages) && surah.pages.length === 2)
    total += surah.verses
  }
  assert.equal(total, TAFSEER_TOTAL)
})

test('tafseer per-surah verse counts match quran.json Number_Verses', () => {
  assert.equal(quranData.length, 114)
  for (let i = 0; i < quranData.length; i++) {
    const expected = quranData[i].Number_Verses
    const actual = tafseerIndex[i].verses
    assert.equal(
      actual,
      expected,
      `surah ${i + 1} «${quranData[i].Name}» mismatch: tafseer=${actual} quran=${expected}`
    )
  }
})

test('totalStats() matches the generated index', () => {
  const stats = totalStats()
  assert.equal(stats.count, TAFSEER_TOTAL)
  assert.equal(stats.surahs, tafseerIndex.length)
  assert.equal(stats.jozz, 30)
})

/* ------------------------------------------------------------------ *
 * Arabic normalization
 * ------------------------------------------------------------------ */

test('normalizeArabic strips tashkeel and folds variants', () => {
  assert.equal(normalizeArabic('ٱلرَّحْمَٰنِ ٱلرَّحِيمِ'), 'الرحمن الرحيم')
  assert.equal(normalizeArabic('إبراهيمُ'), 'ابراهيم')
})

/* ------------------------------------------------------------------ *
 * Surah lookups — static index only.
 * ------------------------------------------------------------------ */

test('getSurahByNo resolves metadata or null', () => {
  const first = getSurahByNo(1)
  assert.ok(first)
  assert.equal(first.nameAr, 'الفَاتِحة')
  assert.equal(first.verses, 7)
  assert.equal(getSurahByNo(0), null)
  assert.equal(getSurahByNo(115), null)
})

/* ------------------------------------------------------------------ *
 * Lazy per-surah loading — records keep a stable shape.
 * ------------------------------------------------------------------ */

test('loadSurah caches the promise (repeated calls resolve the same array)', async () => {
  const a = await loadSurah(2)
  const b = await loadSurah(2)
  assert.equal(a, b)
  assert.equal(a.length, 286)
  assert.equal(await loadSurah(999), null)
})

test('every surah chunk has sequential ayah numbers and complete required fields', async () => {
  let total = 0
  for (const surah of tafseerIndex) {
    const records = await loadSurah(surah.n)
    assert.ok(Array.isArray(records), `surah ${surah.n} failed to load`)
    assert.equal(records.length, surah.verses, `surah ${surah.n} count mismatch`)
    const ids = new Set()
    for (let a = 0; a < records.length; a++) {
      const r = records[a]
      assert.equal(Number(r.aya_no), a + 1, `surah ${surah.n} ayah order broken`)
      assert.ok(typeof r.aya_text === 'string' && r.aya_text.length > 0)
      assert.ok(typeof r.aya_tafseer === 'string' && r.aya_tafseer.length > 0)
      assert.ok(!ids.has(r.id), `duplicate id ${r.id} in surah ${surah.n}`)
      ids.add(r.id)
    }
    total += records.length
  }
  assert.equal(total, TAFSEER_TOTAL)
})

test('aya_text is free of ornament glyphs, NBSP and HTML entities', async () => {
  const PRESENTATION = /[\uFB50-\uFDFF\uFE70-\uFEFF]/
  const bad = []
  for (const surah of tafseerIndex) {
    const records = await loadSurah(surah.n)
    for (const r of records) {
      if (
        PRESENTATION.test(r.aya_text) ||
        r.aya_text.includes('\u00A0') ||
        r.aya_text.includes('<') ||
        r.aya_text.includes('&')
      ) {
        bad.push(`sura ${surah.n} aya ${r.aya_no}: ${r.aya_text}`)
        if (bad.length >= 5) break
      }
    }
    if (bad.length >= 5) break
  }
  assert.deepEqual(bad, [])
})

test('aya_tafseer is free of <span> tags and ornament glyphs', async () => {
  const bad = []
  for (const surah of tafseerIndex) {
    const records = await loadSurah(surah.n)
    for (const r of records) {
      if (/<[a-z!]|[\uFD60\uFD61]/.test(r.aya_tafseer)) {
        bad.push(`sura ${surah.n} aya ${r.aya_no}: ${r.aya_tafseer}`)
        if (bad.length >= 5) break
      }
    }
    if (bad.length >= 5) break
  }
  assert.deepEqual(bad, [])
})

/* ------------------------------------------------------------------ *
 * Leading reference marker stripping.
 * ------------------------------------------------------------------ */

test('stripLeadingMarker removes a matching [N] label', () => {
  assert.equal(
    stripLeadingMarker('[2] الثناء على الله تعالى حمداً وشكراً', 2),
    'الثناء على الله تعالى حمداً وشكراً'
  )
})

test('stripLeadingMarker handles markers glued to text or punctuation', () => {
  assert.equal(stripLeadingMarker('[39]ثم ذكر سبحانه الأنبياء', 39), 'ثم ذكر سبحانه الأنبياء')
  assert.equal(stripLeadingMarker('[51]. إنا نرجو أن يغفر لنا ربنا', 51), 'إنا نرجو أن يغفر لنا ربنا')
  assert.equal(stripLeadingMarker('83] إلا مَن أخلصتَه منهم', 83), 'إلا مَن أخلصتَه منهم')
})

test('stripLeadingMarker keeps range and cross-reference labels', () => {
  assert.equal(
    stripLeadingMarker('[33، 34] قال موسى ربي إني قتلت', 33),
    '[33، 34] قال موسى ربي إني قتلت'
  )
  assert.equal(
    stripLeadingMarker('[2] إشارة إلى آية سابقة', 1),
    '[2] إشارة إلى آية سابقة'
  )
})

/* ------------------------------------------------------------------ *
 * Global offline search
 * ------------------------------------------------------------------ */

test('searchTafseer finds known text in ayah and tafsir with kind tag', async () => {
  const rahim = await searchTafseer('الرحيم')
  const ayahHit = rahim.find((r) => r.kind === 'ayah' && r.n === 1 && r.a === 1)
  assert.ok(ayahHit, 'expected basmala ayah hit for «الرحيم»')
  assert.ok(ayahHit.snippet.length > 0)

  const nuh = await searchTafseer('كسفا من السماء')
  assert.ok(nuh.length >= 1)
  assert.ok(nuh.every((r) => r.n >= 1 && r.n <= 114 && r.a >= 1))
})

test('searchTafseer returns empty array for empty or no-match queries', async () => {
  assert.deepEqual(await searchTafseer(''), [])
  assert.deepEqual(await searchTafseer('xyzqqq'), [])
})

/* ------------------------------------------------------------------ *
 * Share text
 * ------------------------------------------------------------------ */

test('buildShareText includes surah, ayah, tafsir and app credit', () => {
  const record = {
    aya_no: '255',
    aya_text_emlaey: 'الله لا إله إلا هو الحي القيوم',
    aya_tafseer: '[255] الله الذي لا إله إلا هو الحي القيوم',
  }
  const text = buildShareText(record, 'البقرة')
  assert.ok(text.includes('سورة البقرة — الآية ٢٥٥'))
  assert.ok(text.includes('الله لا إله إلا هو الحي القيوم'))
  assert.ok(text.includes('التفسير: الله الذي لا إله'))
  assert.ok(text.includes(TAFSEER_APP_CREDIT))
})