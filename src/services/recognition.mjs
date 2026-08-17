/* ------------------------------------------------------------------ *
 * Constrained dhikr recognition engine.
 *
 * The question is not "what text did the user say?" but
 *   "does the transcript match one of the known dhikrs, and how many
 *    times was it repeated?"
 *
 * This module is deliberately pure (no window / localStorage / native
 * imports) so the whole matching/repetition/confidence/dedup logic is
 * unit-testable under `node:test` and shared between the app and tests.
 *
 * Pipeline (per transcript):
 *   1. Arabic normalization (diacritics, alef/taa/yaa unification,
 *      lam-alef ligatures, punctuation strip).
 *   2. Word-level constrained matching: each candidate dhikr is a token
 *      sequence; a sliding window scores it word-by-word with an exact /
 *      known-variant / bounded-edit-distance ladder. Non-overlapping
 *      windows are greedily consumed to detect repetition.
 *   3. Character-level fallback for concatenated transcripts (ASR merged
 *      words with no spaces).
 *   4. Confidence classification (high / medium / low) + false-positive
 *      guards (≥1 exact/variant word, length floors, per-word edit caps).
 *
 * `createRecognizer()` additionally adds the temporal layer used by the
 * live counter: duplicate-segment suppression and short-segment stitching,
 * so duplicate decodes and VAD-split phrases are handled correctly.
 * ------------------------------------------------------------------ */

export const DEFAULT_DUPLICATE_WINDOW_MS = 3000
export const DEFAULT_STITCH_WINDOW_MS = 1800
export const DEFAULT_MIN_SNR_DB = 6
export const DEFAULT_MIN_SPEECH_MS = 150
export const MAX_REPEATS_PER_SEGMENT = 200

/* ------------------------------ Arabic ------------------------------ */

const DIACRITICS = /[\u064B-\u0655\u0670\u0640]/g
const ALEF_VARIANTS = /[أإآٱ\u0671]/g
const LAM_ALEF = /[\uFEF5\uFEF6\uFEF7\uFEF8]/g
const PUNCTUATION = /[\u060C\u061B\u061F.,!؟?;:()\[\]{}\u2018\u2019\u201C\u201D\u00AB\u00BB\u0022\u0027\u2013\u2014\u2026\\\/\-_]+/g

/**
 * Normalize Arabic text for matching:
 * - strip diacritics, tatweel and dagger alef
 * - unify أ إ آ ٱ → ا, ة → ه, ى → ي
 * - map Urdu heh (اللہ) to Arabic heh
 * - expand lam-alef ligatures
 * - strip punctuation (Moonshine frequently appends `.`, `؟`, `،`, quotes)
 * - collapse whitespace
 */
export function normalizeArabic(text) {
  return String(text || '')
    .replace(DIACRITICS, '')
    .replace(ALEF_VARIANTS, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u06C1\u06BE]/g, 'ه')
    .replace(LAM_ALEF, 'لا')
    .replace(PUNCTUATION, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizesEqual(a, b) {
  return normalizeArabic(a) === normalizeArabic(b)
}

/** Split normalized text into word tokens. */
export function tokenize(norm) {
  if (!norm) return []
  return norm.split(' ').filter(Boolean)
}

/**
 * Merge standalone Arabic conjunction "و" (and) with the following word.
 * ASR models frequently output "و X" as two tokens instead of "وX".
 * Returns a new token array with و prefixed to the next word.
 */
export function mergeWaw(tokens) {
  const out = []
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === 'و' && i + 1 < tokens.length) {
      out.push('و' + tokens[i + 1])
      i++
    } else {
      out.push(tokens[i])
    }
  }
  return out
}

/** Token-level Jaccard similarity of two normalized strings (for dedup). */
export function tokenJaccard(a, b) {
  const ta = tokenize(a)
  const tb = tokenize(b)
  if (ta.length === 0 && tb.length === 0) return 1
  const sa = new Set(ta)
  const sb = new Set(tb)
  let inter = 0
  for (const w of sa) if (sb.has(w)) inter++
  const union = sa.size + sb.size - inter
  return union === 0 ? 0 : inter / union
}

/* ------------------------- spoken numbers --------------------------- */
//
// The user may ANNOUNCE the count aloud after reciting, e.g. "سبحان الله
// سبحان الله ثلاثة" (2 repeats + "three") or "سبحان الله مرتين". The
// announced number is authoritative for the total, so the recognizer takes
// max(repetitions, announced number) for the dominant dhikr instead of
// adding them (that would over-count).
//
// Number words are matched on the NORMALIZED transcript (diacritics
// stripped, ة→ه, أإآ→ا, ى→ي), so both forms are accepted.

const SIMPLE_AR_NUMBERS = {
  صفر: 0,
  واحد: 1, واحده: 1, احد: 1, احدا: 1,
  اثنان: 2, اثنين: 2, اثنتان: 2, اثنتين: 2,
  ثلاثه: 3, ثلاث: 3, ثلاثا: 3, ثلاثة: 3,
  اربعه: 4, اربع: 4, اربعا: 4, اربعة: 4,
  خمسه: 5, خمس: 5, خمسا: 5, خمسة: 5,
  سته: 6, ست: 6, ستا: 6, ستة: 6,
  سبعه: 7, سبع: 7, سبعا: 7, سبعة: 7,
  ثمانيه: 8, ثمان: 8, ثماني: 8, ثمانية: 8,
  تسعه: 9, تسع: 9, تسعا: 9, تسعة: 9,
  عشره: 10, عشر: 10, عشرة: 10,
  احدعشر: 11, 'احد وعشر': 11, 'احد عشر': 11,
  اثناعشر: 12, 'اثنا عشر': 12, 'اثني عشر': 12,
  ثلاثهعشر: 13, 'ثلاثة عشر': 13, ثلاثعشر: 13,
  اربعهعشر: 14, 'اربعة عشر': 14, اربععشر: 14,
  خمسهعشر: 15, 'خمسة عشر': 15, خمسعشر: 15,
  ستهعشر: 16, 'ستة عشر': 16, ستعشر: 16,
  سبعهعشر: 17, 'سبعة عشر': 17, سبععشر: 17,
  ثمانيهعشر: 18, 'ثمانية عشر': 18, ثمانعشر: 18,
  تسعهعشر: 19, 'تسعة عشر': 19, تسععشر: 19,
  عشرون: 20, عشرين: 20,
  ثلاثون: 30, ثلاثين: 30,
  اربعون: 40, اربعين: 40,
  خمسون: 50, خمسين: 50,
  ستون: 60, ستين: 60,
  سبعون: 70, سبعين: 70,
  ثمانون: 80, ثمانين: 80,
  تسعون: 90, تسعين: 90,
  مئه: 100, مائه: 100, مئة: 100, مائة: 100,
}

const REPETITION_WORDS = {
  مره: 1, مرة: 1, مرتين: 2,
  ثلاثمرات: 3,
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

/**
 * Detect the largest spoken/announced number in a normalized Arabic string.
 * Returns an integer, or null when no number is mentioned. Handles simple
 * cardinals (1–100), digit strings (Arabic-Indic and Western), and "مرة /
 * مرتين / ثلاث مرات" repetition words. Compounds like "خمسة وعشرين" are
 * summed when both parts appear.
 */
export function detectSpokenNumber(norm) {
  if (!norm) return null
  const tokens = tokenize(norm)
  let best = null

  const consider = (v) => {
    if (v != null && Number.isFinite(v) && v > 0) {
      best = best == null ? v : Math.max(best, v)
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]

    if (/^\d+$/.test(t)) {
      consider(parseInt(t, 10))
      continue
    }
    if (/^[٠-٩]+$/.test(t)) {
      let v = 0
      for (const ch of t) v = v * 10 + ARABIC_DIGITS.indexOf(ch)
      consider(v)
      continue
    }

    consider(SIMPLE_AR_NUMBERS[t])
    consider(REPETITION_WORDS[t])

    // "خمسة وعشرين" → a small number followed by و + tens word
    if (SIMPLE_AR_NUMBERS[t] && SIMPLE_AR_NUMBERS[t] < 20) {
      const next = tokens[i + 1]
      if (next === 'و' || next === 'وهم' || next === 'ون' || next === 'واو') {
        const tens = SIMPLE_AR_NUMBERS[tokens[i + 2]]
        if (tens && tens >= 20) consider(SIMPLE_AR_NUMBERS[t] + tens)
      } else if (/^و/.test(next || '')) {
        const tens = SIMPLE_AR_NUMBERS[next.replace(/^و/, '')]
        if (tens && tens >= 20) consider(SIMPLE_AR_NUMBERS[t] + tens)
      }
    }

    // "أربعون وخمسة" → a tens word followed by و + small number
    if (SIMPLE_AR_NUMBERS[t] && SIMPLE_AR_NUMBERS[t] >= 20 && SIMPLE_AR_NUMBERS[t] % 10 === 0) {
      const next = tokens[i + 1]
      if (next === 'و' || next === 'وهم' || next === 'ون' || next === 'واو') {
        const unit = SIMPLE_AR_NUMBERS[tokens[i + 2]]
        if (unit && unit > 0 && unit < 20) consider(SIMPLE_AR_NUMBERS[t] + unit)
      } else if (/^و/.test(next || '')) {
        const unit = SIMPLE_AR_NUMBERS[next.replace(/^و/, '')]
        if (unit && unit > 0 && unit < 20) consider(SIMPLE_AR_NUMBERS[t] + unit)
      }
    }
  }
  return best
}

/* --------------------------- edit distance -------------------------- */

export function editDistance(a, b) {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = new Uint16Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const temp = dp[j]
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost)
      prev = temp
    }
  }
  return dp[n]
}

/* --------------------------- word matching -------------------------- */

/**
 * Known spelling / ASR-confusion variants for common dhikr words.
 * These cover substitutions that are frequent enough that relying on
 * raw edit distance alone is brittle (e.g. س→ص, م→ب, extra lam).
 *
 * Comprehensive coverage for all AI dhikrs and common 99-name words.
 */
export const WORD_VARIANTS = {
  // --- Core tasbih words ---
  سبحان: [
    'سبحان', 'سبحن', 'سبحا', 'سبحانا', 'سبحانن',
    'صبحان', 'صبحن', 'صبحا',
    'سمحان', 'سمحن', 'سمحا',
    'سحبان', 'سحب', 'سحان',
    'سجان', 'سجحان',
  ],
  الله: [
    'الله', 'اللة', 'اللا', 'اللاه', 'الللاه', 'الاله',
    'لله', 'الل', 'الاه', 'للا', 'اللنا', 'اللاهو',
    'اللهم',
  ],
  الحمد: [
    'الحمد', 'الحمده', 'الحمدالله', 'لحمد', 'لحمدالله',
    'الحمدلله', 'الحمدل',
  ],
  اكبر: [
    'اكبر', 'اكبار', 'اكبور', 'اكبيرة', 'اكبرا',
    'كبر', 'كبير', 'كبار', 'كبور',
    'اكبر', 'اكبره',
  ],
  استغفر: [
    'استغفر', 'استغفار', 'استغفور', 'استغر',
    'استغفرالله', 'استغفارالله', 'استغفورالله', 'استغفرال',
    'استغفرلي', 'استغفارلي',
    'ستغفر', 'سغفر', 'استغف', 'استغرو', 'استغفره',
    'غفر', 'غفار', 'غفور', 'يغفر', 'تغفر', 'اغفر',
    'اسغفر', 'اسغفرالله', 'اسغفار', 'اسغفور',
    'استغف', 'استغفرال', 'استغفرله', 'استغفره',
    'استغفران', 'استغفره',
  ],
  العظيم: [
    'العظيم', 'العضيم', 'العظييم', 'العظي', 'العظم',
    'العظيمه', 'العضيمه', 'العظيما',
    'العزيم', 'العزم',
  ],

  // --- Subhanallah wa bihamdihi ---
  وبحمده: [
    'وبحمده', 'وبحمدة', 'وبحمد', 'وبحمده',
    'وبمده', 'وبمدة', 'وبمد',
    'وباحمده', 'وباحمد', 'وباحمدة',
    'وابحمده', 'وابحمد', 'وابمده',
    'وبح', 'وبحمد',
  ],
  بحمده: [
    'بحمده', 'بحمدة', 'بحمد', 'بمده', 'بمدة', 'بمد',
    'باحمده', 'باحمد', 'باحمدة',
    'ابحمده', 'ابحمد', 'ابمده',
    'بحم',
  ],

  // --- Shahada / Tawheed ---
  لا: ['لا', 'لاء', 'لاا'],
  اله: ['اله', 'الاه', 'الا', 'االله', 'لله', 'الله', 'الاهه', 'الهي', 'الاهي', 'لاه', 'الاه'],
  الا: ['الا', 'لا', 'ال', 'اﻻ', 'الاء', 'الاه'],

  // --- 99 Names of Allah ---
  الرحمن: ['الرحمن', 'الرحمان', 'رحمن', 'رحمان'],
  الرحيم: ['الرحيم', 'رحيم'],
  الكريم: ['الكريم', 'كريم'],
  الحكيم: ['الحكيم', 'حكيم'],
  السميع: ['السميع', 'سميع'],
  العليم: ['العليم', 'عليم', 'العلييم'],
  الغفور: ['الغفور', 'غفور', 'الغفار', 'غفار'],

  // --- Other common dhikr words ---
  اعوذ: ['اعوذ', 'اعوض', 'اعو', 'اعويذ', 'اعوذبالله'],
  بسم: ['بسم', 'باسم', 'بس', 'بسمالله', 'باسمالله'],
  الليل: ['الليل', 'ليل'],
  النهار: ['النهار', 'نهار'],
  الرزاق: ['الرزاق', 'رزاق'],
  الشكور: ['الشكور', 'شكور'],
  التواب: ['التواب', 'تواب'],
  الاحد: ['الاحد', 'احد'],
  الصمد: ['الصمد', 'صمد'],
}

const variantIndex = new Map()
for (const [canonical, variants] of Object.entries(WORD_VARIANTS)) {
  for (const v of variants) {
    if (!variantIndex.has(v)) variantIndex.set(v, [])
    variantIndex.get(v).push(canonical)
  }
}

/* --------------------------- phonetic classes ------------------------- */

/**
 * Arabic sound classes: letters Moonshine (tiny-ar, WER ≈ 27%) routinely
 * confuses with one another. Words that differ only *within* a class are
 * phonetically identical, so they are treated like known spelling variants
 * instead of being penalized by the edit distance. Applied to the already-
 * normalized transcript (diacritics stripped, أإآ→ا, ى→ي, ة→ه).
 *
 *   ث س ص  → sibilants
 *   ذ ز ظ ض → interdental/emphatic voiced
 *   ت ط    → dental stops
 *   ق ك    → velar/uvular stops
 *   ب م    → bilabials
 *   ه ح    → h-like (both produced as /h/ by many speakers)
 */
export const PHONETIC_CLASSES = {
  ث: 'س', س: 'س', ص: 'س',
  ذ: 'ز', ز: 'ز', ظ: 'ز', ض: 'ز',
  ت: 'ت', ط: 'ت',
  ق: 'ك', ك: 'ك',
  ب: 'ب', م: 'ب',
  ه: 'ه', ح: 'ه',
}

/**
 * Reduce a normalized Arabic word to its phonetic signature: every letter
 * is replaced by its sound-class representative (unchanged letters are kept
 * as-is). Two words with equal signatures are pronounced the same to the
 * model and may freely substitute for one another.
 */
export function phoneticKey(word) {
  let out = ''
  for (const ch of word) out += PHONETIC_CLASSES[ch] || ch
  return out
}

/**
 * Score transcript word `input` against dhikr word `target` in [0,1]:
 * 1.0 exact, 0.92 known variant, 0 < fuzzy < 1 via bounded edit distance,
 * 0 when too far. Variants map in both directions so user-typed dhikrs
 * and Moonshine output can exchange spellings.
 */
export function wordScore(input, target, editCap) {
  if (input === target) return 1
  const variants = WORD_VARIANTS[target]
  if (variants && variants.includes(input)) return 0.92
  const reverse = variantIndex.get(input)
  if (reverse && reverse.includes(target)) return 0.92
  // Same sound signature → pronounced identically to the model even though
  // the spelling differs (e.g. س↔ص, ذ↔ز). As strong as a listed variant.
  if (phoneticKey(input) === phoneticKey(target)) return 0.92
  if (editCap <= 0) return 0
  const cap = Math.min(editCap, target.length <= 3 ? 1 : 3)
  const d = editDistance(input, target)
  if (d === 0) return 1
  if (d <= cap) {
    return 1 - d / Math.max(input.length, target.length)
  }
  return 0
}

/* ------------------------- phrase matching -------------------------- */

function defaultEditCap(settings) {
  const tolerance = settings.matchTolerance === 'strict' ? 0 : Number(settings.fuzzyThreshold ?? 2)
  return tolerance
}

/**
 * Match `dWords` (dhikr token sequence) against `tWords` starting at
 * token index `start`. Returns { score, exactCount, end } or null if the
 * window overruns the transcript or any word scores 0 (word missing).
 */
function scoreWindow(dWords, tWords, start, editCap) {
  if (start + dWords.length > tWords.length) return null
  let sum = 0
  let exact = 0
  for (let i = 0; i < dWords.length; i++) {
    const s = wordScore(tWords[start + i], dWords[i], editCap)
    if (s === 0) return null
    sum += s
    if (s >= 0.92) exact++
  }
  return { score: sum / dWords.length, exact, end: start + dWords.length }
}

/**
 * Word-level repetition scan. Greedily consumes non-overlapping windows
 * that score above the acceptance floor. Returns array of matched spans.
 */
function scanWords(dWords, tWords, editCap) {
  const floor = editCap <= 0 ? 1 : editCap <= 1 ? 0.6 : editCap <= 2 ? 0.55 : 0.5
  const needExact = dWords.length === 1 ? 1 : Math.max(1, Math.ceil(dWords.length * 0.4))
  const spans = []
  let pos = 0
  while (pos < tWords.length) {
    let best = null
    for (let start = pos; start < tWords.length; start++) {
      const m = scoreWindow(dWords, tWords, start, editCap)
      if (!m) continue
      if (m.score < floor || m.exact < needExact) continue
      best = { start, ...m }
      break
    }
    if (!best) break
    spans.push(best)
    pos = best.end
  }
  return spans
}

/**
 * Character-level fallback for concatenated transcripts (no spaces).
 * Counts non-overlapping fuzzy occurrences of the dhikr phrase with a
 * length-proportional tolerance. Bounded edits and a minimum phrase
 * length protect against noise.
 */
function scanChars(phrase, norm, editCap) {
  if (phrase.length < 4 || editCap <= 0) return []
  const tolerance = Math.max(1, Math.min(3, Math.floor(phrase.length * 0.15)))
  const spans = []
  let pos = 0
  let guard = 0
  while (pos + phrase.length <= norm.length && guard++ < MAX_REPEATS_PER_SEGMENT) {
    let best = -1
    let bestDist = Infinity
    for (let i = pos; i + phrase.length <= norm.length; i++) {
      const d = editDistance(norm.slice(i, i + phrase.length), phrase)
      if (d <= tolerance && d < bestDist) {
        best = i
        bestDist = d
      }
    }
    if (best === -1) break
    spans.push({ start: best, end: best + phrase.length, dist: bestDist })
    pos = best + phrase.length
  }
  return spans
}

/* ---------------------------- confidence ---------------------------- */

export function classifyConfidence(score, exact, wordCount, mode) {
  if (mode === 'chars') {
    if (score <= 0) return 'low'
    if (score >= 0.9) return 'high'
    if (score >= 0.75) return 'medium'
    return 'low'
  }
  const exactRatio = exact / wordCount
  if (score >= 0.92 && exactRatio >= 0.6) return 'high'
  if (score >= 0.7) return 'medium'
  return 'low'
}

/* --------------------------- analysis ------------------------------ */

/**
 * Analyze one transcript against the dhikr list.
 * Returns { matches, diagnostics } where matches is
 *   [{ dhikr, count, confidence, score }].
 */
export function analyzeTranscript(text, dhikrs, settings = {}) {
  const norm = normalizeArabic(text)
  const tokens = mergeWaw(tokenize(norm))
  const editCap = defaultEditCap(settings)
  const diagnostics = { raw: String(text || ''), normalized: norm, tokens, matches: [] }

  if (!norm || tokens.length === 0) return { matches: [], diagnostics }

  const candidates = dhikrs
    .map((d) => ({ dhikr: d, key: normalizeArabic(d.text), words: tokenize(normalizeArabic(d.text)) }))
    .filter((c) => c.words.length > 0)
    .sort((a, b) => b.words.length - a.words.length || b.key.length - a.key.length)

  const counts = new Map()
  const occupied = new Set()

  // Word-level pass (token sequence matching).
  for (const c of candidates) {
    const tWords = tokens
    const spans = scanWords(c.words, tWords, editCap)
    for (const span of spans) {
      const overlaps = (() => {
        for (let i = span.start; i < span.end; i++) if (occupied.has(i)) return true
        return false
      })()
      if (overlaps) continue
      for (let i = span.start; i < span.end; i++) occupied.add(i)
      const entry = counts.get(c.dhikr.id) || { dhikr: c.dhikr, count: 0, bestScore: 0, mode: 'words' }
      entry.count++
      entry.bestScore = Math.max(entry.bestScore, span.score)
      counts.set(c.dhikr.id, entry)
    }
  }

  // Character-level fallback for concatenated/merged text, only when the
  // token pass found nothing at all.
  if (counts.size === 0) {
    for (const c of candidates) {
      const spans = scanChars(c.key, norm, editCap)
      if (spans.length === 0) continue
      const entry = {
        dhikr: c.dhikr,
        count: spans.length,
        bestScore: 1 - spans[0].dist / c.key.length,
        mode: 'chars',
      }
      counts.set(c.dhikr.id, entry)
    }
  }

  const matches = []
  for (const entry of counts.values()) {
    const wordCount = tokenize(entry.dhikr.text).length
    const confidence = classifyConfidence(entry.bestScore, entry.bestScore >= 0.92 ? wordCount : 0, wordCount, entry.mode)
    const capped = Math.min(entry.count, MAX_REPEATS_PER_SEGMENT)
    matches.push({
      dhikr: entry.dhikr,
      count: capped,
      confidence,
      score: entry.bestScore,
    })
  }

  matches.sort((a, b) => b.score - a.score)
  diagnostics.matches = matches

  // An announced number ("… ثلاثة" / "… مرتين") overrides the repetition
  // count of the dominant dhikr. Only applied when at least one phrase was
  // actually matched, so stray digits in noise never fabricate a count.
  if (matches.length > 0) {
    const announced = detectSpokenNumber(norm)
    if (announced != null && announced > 0) {
      const top = matches[0]
      const boosted = Math.min(Math.max(top.count, announced), MAX_REPEATS_PER_SEGMENT)
      if (boosted !== top.count) {
        top.count = boosted
        top.spokenNumber = announced
        diagnostics.spokenNumber = announced
      }
    }
  }

  return { matches, diagnostics }
}

/**
 * Decide whether a match is allowed to be counted.
 * HIGH always counts; MEDIUM counts (it is a real phrase with a few ASR
 * edits — exactly what the counter must tolerate); LOW is rejected to
 * protect against noise → phantom dhikr. When `countEveryUtterance` is
 * enabled, LOW-confidence matches on the first dhikr are accepted as a
 * best-effort fallback.
 */
export function shouldCount(match, settings = {}) {
  if (match.confidence === 'high' || match.confidence === 'medium') return true
  if (settings.countEveryUtterance === true && match.confidence === 'low') return true
  return false
}

/* ---------------------- session recognizer ------------------------- */

/**
 * Stateful recognizer used by the live counter. Adds the temporal layer
 * on top of `analyzeTranscript`:
 *  - duplicate-segment suppression,
 *  - short-segment stitching (VAD split a phrase into two segments),
 *  - confidence gating (LOW is not counted by default).
 *
 * push(text, nativeDiag?) → { matches, diagnostics }
 *   matches: [{ dhikr, count, confidence }] that the caller should count.
 */
export function createRecognizer({ dhikrs, settings = {}, getDhikrs, getSettings, now } = {}) {
  const clock = now || (() => Date.now())
  const recent = []
  let pending = null // { norm, tokens, t }

  function currentDhikrs() {
    return getDhikrs ? getDhikrs() : dhikrs
  }

  function currentSettings() {
    return getSettings ? getSettings() : settings
  }

  function duplicateWindowMs() {
    return Number(currentSettings().duplicateWindowMs ?? DEFAULT_DUPLICATE_WINDOW_MS)
  }

  function stitchWindowMs() {
    return Number(currentSettings().stitchWindowMs ?? DEFAULT_STITCH_WINDOW_MS)
  }

  function pruneRecent(now) {
    const window = duplicateWindowMs()
    while (recent.length > 0 && now - recent[0].t > window) recent.shift()
  }

  /**
   * Suppress reports of the SAME decoded audio. Handles three patterns:
   *
   * 1. Same segmentIndex → the plugin re-delivered the same segment.
   *
   * 2. No segmentIndex (tests / simulator) → exact text match.
   *
   * 3. Cross-chunk: similar text within a tight window catches the
   *    case where a chunk boundary split one utterance mid-word.
   *    Detected via Jaccard ≥ 0.85 or one being a token-subset of
   *    the other within the tight window.
   */
  function dedupe(norm, matches, now, segmentIndex) {
    pruneRecent(now)
    if (matches.length === 0) return false
    const hasIdx = Number.isFinite(segmentIndex)

    // 1 & 2: segment-index exact match, or text-only fallback
    for (const r of recent) {
      if (hasIdx && r.segmentIndex === segmentIndex) return true
      if (!hasIdx && r.segmentIndex == null && r.norm === norm) return true
    }

    // 3: Cross-chunk — similar text within a tight window catches
    // the split-utterance case (partial in chunk N, full in chunk N+1).
    if (hasIdx) {
      const TIGHT_WINDOW = 1800
      for (const r of recent) {
        if (now - r.t > TIGHT_WINDOW) continue
        if (!r.norm || !norm) continue
        const rTokens = tokenize(r.norm)
        const nTokens = tokenize(norm)
        // Identical text from different segmentIndex → genuine repeat.
        if (JSON.stringify(rTokens) === JSON.stringify(nTokens)) continue
        const isSubset =
          (rTokens.length > 0 && rTokens.every((t) => nTokens.includes(t))) ||
          (nTokens.length > 0 && nTokens.every((t) => rTokens.includes(t)))
        if (tokenJaccard(r.norm, norm) >= 0.85 || isSubset) return true
      }
    }
    return false
  }

  function remember(norm, matches, now, segmentIndex) {
    const counts = {}
    for (const m of matches) counts[m.dhikr.id] = (counts[m.dhikr.id] || 0) + m.count
    recent.push({ norm, counts, t: now, segmentIndex: Number.isFinite(segmentIndex) ? segmentIndex : null })
    if (recent.length > 12) recent.shift()
  }

  function applyGate(matches, settingsNow) {
    return matches.filter((m) => shouldCount(m, settingsNow))
  }

  /**
   * Reject segments whose audio diagnostics show they are NOT speech:
   * too faint (snr below `minSnrDb`) or too little real speech
   * (`speechMs` below `minSpeechMs`).
   */
  function isNoise(nativeDiag, settingsNow) {
    if (!nativeDiag) return false
    const minSnr = Number(settingsNow.minSnrDb ?? DEFAULT_MIN_SNR_DB)
    const minSpeech = Number(settingsNow.minSpeechMs ?? DEFAULT_MIN_SPEECH_MS)
    if (Number.isFinite(nativeDiag.snr) && nativeDiag.snr < minSnr) return true
    if (Number.isFinite(nativeDiag.speechMs) && nativeDiag.speechMs < minSpeech) return true
    return false
  }

  function push(text, nativeDiag) {
    const now = clock()
    const dhikrsNow = currentDhikrs()
    const settingsNow = currentSettings()
    const { matches, diagnostics } = analyzeTranscript(text, dhikrsNow, settingsNow)
    diagnostics.native = nativeDiag || null

    // Reject noise before it can fabricate phantom counts.
    if (isNoise(nativeDiag, settingsNow)) {
      diagnostics.noise = true
      diagnostics.matches = []
      return { matches: [], diagnostics }
    }

    const gateMatches = applyGate(matches, settingsNow)

    // Fast path: current segment produced acceptable matches.
    if (gateMatches.length > 0) {
      if (dedupe(diagnostics.normalized, gateMatches, now, nativeDiag?.segmentIndex)) {
        pending = null
        diagnostics.deduped = true
        diagnostics.matches = []
        return { matches: [], diagnostics }
      }
      remember(diagnostics.normalized, gateMatches, now, nativeDiag?.segmentIndex)
      pending = null
      return { matches: gateMatches, diagnostics }
    }

    // Current segment has no countable match.
    const short = tokensForStitch(text)
    if (pending && now - pending.t <= stitchWindowMs() && short && pending.short) {
      const combinedText = pending.norm + ' ' + diagnostics.normalized
      const combined = analyzeTranscript(combinedText, dhikrsNow, settingsNow)
      const combinedGate = applyGate(combined.matches, settingsNow)
      if (combinedGate.length > 0) {
        const from = pending.norm
        pending = null
        diagnostics.stitched = true
        diagnostics.matches = combinedGate
        diagnostics.stitchFrom = from
        remember(normalizeArabic(combinedText), combinedGate, now, nativeDiag?.segmentIndex)
        return { matches: combinedGate, diagnostics }
      }
      pending = null
    }

    if (short) {
      pending = { norm: diagnostics.normalized, tokens: diagnostics.tokens, t: now, short: true }
    } else {
      pending = null
    }

    // Best-effort fallback: "count every utterance"
    if (settingsNow.countEveryUtterance && dhikrsNow.length > 0) {
      const first = dhikrsNow[0]
      if (first) {
        const fallback = [{ dhikr: first, count: 1, confidence: 'low' }]
        remember(diagnostics.normalized, fallback, now, nativeDiag?.segmentIndex)
        diagnostics.fallback = true
        diagnostics.matches = fallback
        return { matches: fallback, diagnostics }
      }
    }
    return { matches: [], diagnostics }
  }

  function reset() {
    recent.length = 0
    pending = null
  }

  return { push, reset, _reset: reset }
}

/** A segment is "stitchable" when it is too short to be a full dhikr. */
function tokensForStitch(text) {
  const tokens = tokenize(normalizeArabic(text))
  return tokens.length >= 1 && tokens.length <= 3
}