import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  analyzeTranscript,
  normalizeArabic,
  createRecognizer,
  tokenJaccard,
  detectSpokenNumber,
  phoneticKey,
  wordScore,
} from '../src/services/recognition.mjs'

const DHIKRS = [
  { id: 'subhan', text: 'سُبْحَانَ اللَّهِ', target: 33 },
  { id: 'hamd', text: 'الْحَمْدُ لِلَّهِ', target: 33 },
  { id: 'akbar', text: 'اللَّهُ أَكْبَرُ', target: 33 },
]

const SETTINGS = {
  matchTolerance: 'loose',
  fuzzyThreshold: 2,
  countEveryUtterance: false,
  duplicateWindowMs: 700,
  stitchWindowMs: 1800,
}

/** Stateless resolve: return [[dhikrId, count]] for countable matches. */
function resolve(text, dhikrs = DHIKRS, settings = SETTINGS) {
  const { matches } = analyzeTranscript(text, dhikrs, settings)
  return matches
    .filter((m) => m.confidence !== 'low')
    .map((m) => [m.dhikr.id, m.count])
}

function findCount(matches, id) {
  const m = matches.find((x) => x.dhikr.id === id)
  return m ? m.count : 0
}

/* --------------------------- normalization --------------------------- */

test('normalizeArabic strips diacritics and unifies letters', () => {
  assert.equal(normalizeArabic('سُبْحَانَ اللَّهِ'), 'سبحان الله')
  assert.equal(normalizeArabic('سُبْحَانَ اللّٰه'), 'سبحان الله')
  assert.equal(normalizeArabic('أَلْحَمْدُ لِلَّهِ'), 'الحمد لله')
  assert.equal(normalizeArabic('سبحان الله.'), 'سبحان الله')
  assert.equal(normalizeArabic('سبحان الله؟'), 'سبحان الله')
})

/* ------------------------- repetition cases -------------------------- */

test('CASE 1: single utterance → count 1', () => {
  assert.deepEqual(resolve('سبحان الله'), [['subhan', 1]])
})

test('CASE 2: two repeats → count 2', () => {
  assert.deepEqual(resolve('سبحان الله سبحان الله'), [['subhan', 2]])
})

test('CASE 3: three repeats → count 3', () => {
  assert.deepEqual(resolve('سبحان الله سبحان الله سبحان الله'), [['subhan', 3]])
})

test('CASE 4: ten repeats → count 10', () => {
  const text = Array(10).fill('سبحان الله').join(' ')
  assert.deepEqual(resolve(text), [['subhan', 10]])
})

test('CASE 5: 33 repeats → count 33', () => {
  const text = Array(33).fill('سبحان الله').join(' ')
  assert.deepEqual(resolve(text), [['subhan', 33]])
})

test('CASE 6: 100 repeats → count 100', () => {
  const text = Array(100).fill('سبحان الله').join(' ')
  assert.deepEqual(resolve(text), [['subhan', 100]])
})

test('CASE 7: fast speech, concatenated repetitions (no space between repeats)', () => {
  // ASR merged repetitions without the space between them but kept the
  // space inside each phrase.
  assert.deepEqual(resolve('سبحان اللهسبحان اللهسبحان الله'), [['subhan', 3]])
  assert.deepEqual(resolve('سبحان اللهسبحان الله'), [['subhan', 2]])
})

test('CASE 8: slow repeats with pauses → each counted once (session recognizer)', () => {
  let t = 0
  const r = createRecognizer({ dhikrs: DHIKRS, settings: SETTINGS, now: () => t })
  let total = 0
  for (const ms of [0, 1000, 2100]) {
    t = ms
    total += findCount(r.push('سبحان الله').matches, 'subhan')
  }
  assert.equal(total, 3)
})

/* ----------------------- ASR variants (CASE 11) ---------------------- */

test('CASE 11a: "سمحان الله" → count 1', () => {
  assert.deepEqual(resolve('سمحان الله'), [['subhan', 1]])
})

test('CASE 11b: "سبحان اللة" → count 1', () => {
  assert.deepEqual(resolve('سبحان اللة'), [['subhan', 1]])
})

test('CASE 11c: "سبحن الله" → count 1', () => {
  assert.deepEqual(resolve('سبحن الله'), [['subhan', 1]])
})

test('CASE 11d: repeat with spelling errors → count 3', () => {
  const text = 'سمحان الله سبحان اللة سبحن الله'
  assert.deepEqual(resolve(text), [['subhan', 3]])
})

/* -------------------- false positives (CASE 12) ---------------------- */

test('CASE 12a: "الحمد لله" only matches hamd, not subhan', () => {
  const res = resolve('الحمد لله')
  assert.deepEqual(res, [['hamd', 1]])
})

test('CASE 12b: "الله أكبر" only matches akbar, not subhan', () => {
  const res = resolve('الله أكبر')
  assert.deepEqual(res, [['akbar', 1]])
})

test('CASE 12c: "سبحان الله" never matches hamd/akbar', () => {
  const res = resolve('سبحان الله')
  assert.deepEqual(res, [['subhan', 1]])
})

test('CASE 12d: unrelated speech does not match any dhikr', () => {
  assert.deepEqual(resolve('بليب بليب ززز'), [])
  assert.deepEqual(resolve('حمد الله كثيرا'), [])
})

test('CASE 12e: near-but-wrong single word does not match short dhikrs', () => {
  // "أكبر" vs "الله" must not collide with subhan.
  assert.deepEqual(resolve('الله'), [])
})

/* ------------------- noise / confidence (CASE 10) -------------------- */

test('CASE 10: noise/garbage yields no phantom count', () => {
  const r = createRecognizer({ dhikrs: DHIKRS, settings: SETTINGS, now: () => 0 })
  assert.equal(r.push('x y z').matches.length, 0)
  assert.equal(r.push('طن طن طن').matches.length, 0)
})

test('garbage is not forced into a dhikr', () => {
  const { matches } = analyzeTranscript('قبل قبل قبل', DHIKRS, SETTINGS)
  assert.equal(matches.length, 0)
})

/* --------------------------- noise gate ------------------------------ */

test('noise gate rejects faint segments (low snr)', () => {
  const r = createRecognizer({ dhikrs: DHIKRS, settings: SETTINGS, now: () => 0 })
  assert.equal(r.push('سبحان الله', { snr: 2, speechMs: 400 }).matches.length, 0)
})

test('noise gate rejects too-short segments (low speechMs)', () => {
  const r = createRecognizer({ dhikrs: DHIKRS, settings: SETTINGS, now: () => 0 })
  assert.equal(r.push('سبحان الله', { snr: 25, speechMs: 80 }).matches.length, 0)
})

test('noise gate passes real speech', () => {
  const r = createRecognizer({ dhikrs: DHIKRS, settings: SETTINGS, now: () => 0 })
  assert.equal(findCount(r.push('سبحان الله', { snr: 25, speechMs: 800 }).matches, 'subhan'), 1)
})

test('noise gate is skipped when no diagnostics present', () => {
  const r = createRecognizer({ dhikrs: DHIKRS, settings: SETTINGS, now: () => 0 })
  assert.equal(findCount(r.push('سبحان الله').matches, 'subhan'), 1)
})

test('noise gate honors minSnrDb/minSpeechMs overrides', () => {
  const custom = { ...SETTINGS, minSnrDb: 10, minSpeechMs: 300 }
  const r = createRecognizer({ dhikrs: DHIKRS, settings: custom, now: () => 0 })
  assert.equal(r.push('سبحان الله', { snr: 8, speechMs: 400 }).matches.length, 0)
  assert.equal(r.push('سبحان الله', { snr: 12, speechMs: 500 }).matches.length, 1)
})

/* ----------------------- duplicates (CASE 13) ------------------------ */

test('CASE 13a: exact duplicate decode within window is suppressed', () => {
  let t = 0
  const r = createRecognizer({ dhikrs: DHIKRS, settings: SETTINGS, now: () => t })
  assert.equal(findCount(r.push('سبحان الله').matches, 'subhan'), 1)
  t = 100
  assert.equal(r.push('سبحان الله').matches.length, 0)
  t = 100
  assert.equal(r.push('سبحان الله').matches.length, 0)
})

test('CASE 13b: legitimate repeat after the window is counted', () => {
  let t = 0
  const r = createRecognizer({ dhikrs: DHIKRS, settings: SETTINGS, now: () => t })
  assert.equal(findCount(r.push('سبحان الله').matches, 'subhan'), 1)
  t = 900
  assert.equal(findCount(r.push('سبحان الله').matches, 'subhan'), 1)
})

test('CASE 13c: identical fast segments with distinct segmentIndex are counted', () => {
  let t = 0
  const r = createRecognizer({ dhikrs: DHIKRS, settings: SETTINGS, now: () => t })
  let total = 0
  for (const idx of [1, 2, 3]) {
    t = idx * 100
    total += findCount(r.push('سبحان الله', { segmentIndex: idx }).matches, 'subhan')
  }
  assert.equal(total, 3)
})

test('CASE 13d: a re-reported segment (same segmentIndex) is suppressed', () => {
  let t = 0
  const r = createRecognizer({ dhikrs: DHIKRS, settings: SETTINGS, now: () => t })
  assert.equal(findCount(r.push('سبحان الله', { segmentIndex: 5 }).matches, 'subhan'), 1)
  t = 150
  assert.equal(r.push('سبحان الله', { segmentIndex: 5 }).matches.length, 0)
  t = 300
  assert.equal(findCount(r.push('سبحان الله', { segmentIndex: 6 }).matches, 'subhan'), 1)
})

/* ------------------------ stitching (CASE 14) ------------------------ */

test('CASE 14: VAD split phrase is stitched into one count', () => {
  let t = 0
  const r = createRecognizer({ dhikrs: DHIKRS, settings: SETTINGS, now: () => t })
  assert.equal(r.push('سبحان').matches.length, 0) // too short → pending
  t = 500
  const second = r.push('الله')
  assert.equal(findCount(second.matches, 'subhan'), 1)
})

test('CASE 14b: fragments that never combine are not counted', () => {
  let t = 0
  const r = createRecognizer({ dhikrs: DHIKRS, settings: SETTINGS, now: () => t })
  assert.equal(r.push('سبحان').matches.length, 0)
  t = 500
  assert.equal(r.push('الجبل').matches.length, 0)
})

test('CASE 14c: stitched fragment with mild ASR error is tolerated', () => {
  let t = 0
  const r = createRecognizer({ dhikrs: DHIKRS, settings: SETTINGS, now: () => t })
  assert.equal(r.push('سبحان').matches.length, 0)
  t = 500
  const res = r.push('الملك')
  assert.equal(res.matches[0]?.dhikr.id, 'subhan')
  assert.equal(res.matches[0]?.count, 1)
})

/* ------------------- multiple dhikrs (CASE 15) ----------------------- */

test('CASE 15: different dhikrs in one utterance are distinguished', () => {
  const res = resolve('سبحان الله الحمد لله الله أكبر')
  assert.deepEqual(res, [
    ['subhan', 1],
    ['hamd', 1],
    ['akbar', 1],
  ])
})

test('mixed repeats of two dhikrs count independently', () => {
  const res = resolve('سبحان الله سبحان الله الحمد لله الحمد لله الحمد لله')
  assert.deepEqual(res, [
    ['subhan', 2],
    ['hamd', 3],
  ])
})

/* ------------------------ overlapping spans -------------------------- */

test('longer dhikr wins over shorter overlapping span', () => {
  const custom = [
    { id: 'subhan', text: 'سبحان الله', target: 33 },
    { id: 'subhan_azim', text: 'سبحان الله العظيم', target: 33 },
  ]
  const res = resolve('سبحان الله العظيم', custom)
  // "سبحان الله العظيم" matches the longer dhikr once (tokens consumed),
  // so "سبحان الله" must NOT also match inside it.
  assert.deepEqual(res, [['subhan_azim', 1]])
})

/* ------------------------- confidence levels ------------------------- */

test('exact match is HIGH confidence', () => {
  const { matches } = analyzeTranscript('سبحان الله', DHIKRS, SETTINGS)
  assert.equal(matches[0].confidence, 'high')
})

test('spelling-error match is at least MEDIUM (countable)', () => {
  const { matches } = analyzeTranscript('سمحان الله', DHIKRS, SETTINGS)
  assert.ok(matches.length > 0)
  assert.ok(matches[0].confidence === 'high' || matches[0].confidence === 'medium')
})

/* ---------------------- count every utterance ------------------------ */

test('countEveryUtterance fallback counts the first dhikr', () => {
  const r = createRecognizer({
    dhikrs: DHIKRS,
    settings: { ...SETTINGS, countEveryUtterance: true },
    now: () => 0,
  })
  const { matches } = r.push('شيء غير مفهوم')
  assert.equal(matches.length, 1)
  assert.equal(matches[0].dhikr.id, 'subhan')
})

/* ---------------------------- custom dhikrs -------------------------- */

test('custom dhikr with hamza spelling is matched', () => {
  const custom = [{ id: 'custom', text: 'لا إله إلا الله', target: 33 }]
  const res = resolve('لا اله الا الله', custom)
  assert.deepEqual(res, [['custom', 1]])
})

test('custom dhikr repeated is counted', () => {
  const custom = [{ id: 'custom', text: 'لا إله إلا الله', target: 33 }]
  const res = resolve('لا اله الا الله لا اله الا الله', custom)
  assert.deepEqual(res, [['custom', 2]])
})

/* ------------------------- phonetic classes -------------------------- */

test('phoneticKey maps sound classes', () => {
  assert.equal(phoneticKey('سبحان'), phoneticKey('صبحان'))
  assert.equal(phoneticKey('سبحان'), phoneticKey('سمحان'))
  assert.equal(phoneticKey('الظالم'), phoneticKey('الضالم'))
  assert.equal(phoneticKey('الحمد'), phoneticKey('الهمد'))
})

test('phoneticKey keeps distinct sounds distinct', () => {
  assert.notEqual(phoneticKey('سبحان'), phoneticKey('زبحان'))
  assert.notEqual(phoneticKey('بحر'), phoneticKey('سهر'))
})

test('wordScore: phonetic variants score like known variants', () => {
  assert.equal(wordScore('صبحان', 'سبحان', 2), 0.92)
  assert.equal(wordScore('سمحان', 'سبحان', 2), 0.92)
  assert.equal(wordScore('الحمد', 'الهمد', 2), 0.92)
})

test('wordScore: phonetic equivalence does not boost arbitrary words', () => {
  assert.ok(wordScore('زبحان', 'سبحان', 2) < 0.92)
  assert.ok(wordScore('بحر', 'سبحان', 2) < 0.92)
})

test('phonetic ASR spelling ("صبحان الله") matches subhan', () => {
  assert.deepEqual(resolve('صبحان الله'), [['subhan', 1]])
})

test('phonetic ASR spelling ("سمحان الله") matches subhan', () => {
  assert.deepEqual(resolve('سمحان الله'), [['subhan', 1]])
})

test('phonetic ASR spelling ("الهمد لله") matches hamd', () => {
  assert.deepEqual(resolve('الهمد لله'), [['hamd', 1]])
})

test('phonetic spelling across 3 repeats is counted', () => {
  const res = resolve('صبحان الله سمحان الله سبحان الله')
  assert.deepEqual(res, [['subhan', 3]])
})

/* ----------------------------- utilities ----------------------------- */

test('tokenJaccard works', () => {
  assert.equal(tokenJaccard('سبحان الله', 'سبحان الله'), 1)
  assert.equal(tokenJaccard('سبحان الله', 'الحمد لله'), 0)
  assert.equal(tokenJaccard('سبحان الله', 'سبحان الله العظيم'), 2 / 3)
})

/* --------------------------- spoken numbers -------------------------- */

test('detectSpokenNumber: simple words', () => {
  assert.equal(detectSpokenNumber('ثلاثة'), 3)
  assert.equal(detectSpokenNumber('خمس وعشرين'), 25)
  assert.equal(detectSpokenNumber('سبعين'), 70)
  assert.equal(detectSpokenNumber('مئة'), 100)
})

test('detectSpokenNumber: digit strings', () => {
  assert.equal(detectSpokenNumber('33'), 33)
  assert.equal(detectSpokenNumber('٧'), 7)
  assert.equal(detectSpokenNumber('مرتين'), 2)
})

test('detectSpokenNumber: no number → null', () => {
  assert.equal(detectSpokenNumber('سبحان الله'), null)
  assert.equal(detectSpokenNumber(''), null)
})

test('announced number boosts the dominant dhikr count', () => {
  const res = analyzeTranscript('سبحان الله سبحان الله ثلاثة', DHIKRS, SETTINGS)
  const subhan = res.matches.find((m) => m.dhikr.id === 'subhan')
  assert.equal(subhan.count, 3)
  assert.equal(subhan.spokenNumber, 3)
  assert.equal(res.diagnostics.spokenNumber, 3)
})

test('announced number takes max, never adds', () => {
  const res = analyzeTranscript('سبحان الله سبحان الله سبحان الله خمسة', DHIKRS, SETTINGS)
  const subhan = res.matches.find((m) => m.dhikr.id === 'subhan')
  assert.equal(subhan.count, 5)
})

test('announced number smaller than repeats keeps repeats', () => {
  const res = analyzeTranscript('سبحان الله سبحان الله سبحان الله اثنين', DHIKRS, SETTINGS)
  const subhan = res.matches.find((m) => m.dhikr.id === 'subhan')
  assert.equal(subhan.count, 3)
})

test('garbage digits alone do not fabricate a count', () => {
  const { matches } = analyzeTranscript('خمسة خمسة خمسة', DHIKRS, SETTINGS)
  assert.deepEqual(matches, [])
})

test('number words alone do not fabricate a count', () => {
  const { matches } = analyzeTranscript('ثلاثة', DHIKRS, SETTINGS)
  assert.deepEqual(matches, [])
})

test('detectSpokenNumber: compound "خمسة وعشرين" summed', () => {
  assert.equal(detectSpokenNumber('خمسة وعشرين'), 25)
  assert.equal(detectSpokenNumber('اربعون وخمسة'), 45)
})

/* ----------------------- pause-based segment counting ---------------------- */

function mkRec(overrides = {}) {
  let t = 1000
  const rec = createRecognizer({ dhikrs: DHIKRS, settings: { ...SETTINGS, ...overrides } })
  return { rec, now: () => (t += 400) }
}

test('same text from DISTINCT segments is counted (per-pause repeats)', () => {
  const { rec } = mkRec()
  const first = rec.push('سبحان الله', { segmentIndex: 1 })
  assert.deepEqual(first.matches.map((m) => [m.dhikr.id, m.count]), [['subhan', 1]])
  const second = rec.push('سبحان الله', { segmentIndex: 2 })
  assert.deepEqual(second.matches.map((m) => [m.dhikr.id, m.count]), [['subhan', 1]])
})

test('a re-reported SAME segment is suppressed', () => {
  const { rec } = mkRec()
  rec.push('سبحان الله', { segmentIndex: 1 })
  const dup = rec.push('سبحان الله', { segmentIndex: 1 })
  assert.deepEqual(dup.matches, [])
})

test('one segment with repeated phrases counts every repeat', () => {
  const { rec } = mkRec()
  const res = rec.push('سبحان الله سبحان الله سبحان الله', { segmentIndex: 1 })
  assert.deepEqual(res.matches.map((m) => [m.dhikr.id, m.count]), [['subhan', 3]])
})

test('noisy segment does not fabricate counts', () => {
  const { rec } = mkRec()
  const res = rec.push('موسوعة طلاسم كلام غير مفهوم', { segmentIndex: 1 })
  assert.deepEqual(res.matches, [])
})
