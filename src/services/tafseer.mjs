import tafseerIndex from '../resources/data/tafseer/index.json' with { type: 'json' }
import { TAFSEER_TOTAL, TAFSEER_CHUNKS } from '../resources/data/tafseer/chunks.mjs'

export const TAFSEER_NS = 'tafseer'

export const TAFSEER_APP_CREDIT =
  'من تطبيق «التقوى» — التفسير الميسر للقرآن الكريم'

const TASHKEEL_RE =
  /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06dc\u06df-\u06e8\u06ea-\u06ed]/g

/** تطبيع نصوص عربية للبحث والمطابقة (نمط adhkar/hisn/fatwas/history). */
export function normalizeArabic(text) {
  return String(text)
    .normalize('NFKC')
    .replace(TASHKEEL_RE, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[\u0640]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/* ------------------------------------------------------------------ *
 * الفهرس الثابت (السور — خفيف ولا يُسحب معه أي تفسير)
 * ------------------------------------------------------------------ */

export const TAFSEER_SURAHS = tafseerIndex

const SURA_BY_NO = new Map(tafseerIndex.map((s) => [s.n, s]))

export function getSurahByNo(n) {
  return SURA_BY_NO.get(Number(n)) || null
}

export function totalStats() {
  return {
    count: TAFSEER_TOTAL,
    surahs: tafseerIndex.length,
    jozz: 30,
  }
}

/* ------------------------------------------------------------------ *
 * تحميل شظية سورة لازيًا (chunk واحد لكل سورة مع cache في الذاكرة)
 * ------------------------------------------------------------------ */

const surahCache = new Map()

export function loadSurah(n) {
  const num = Number(n)
  if (surahCache.has(num)) return surahCache.get(num)
  const loader = TAFSEER_CHUNKS[num]
  if (!loader) return Promise.resolve(null)
  const p = loader()
    .then((mod) => mod.default)
    .catch((err) => {
      surahCache.delete(num)
      throw err
    })
  surahCache.set(num, p)
  return p
}

/* ------------------------------------------------------------------ *
 * معالجة نص التفسير
 * ------------------------------------------------------------------ */

/** يحذف وسم المرجع «[N] » المُطابق لرقم الآية فقط. */
export function stripLeadingMarker(text, ayaNo) {
  const trimmed = String(text || '').trim()
  const m = trimmed.match(/^\[?(\d+)\]?/)
  if (!m) return trimmed
  if (Number(m[1]) !== Number(ayaNo)) return trimmed
  const rest = trimmed.slice(m[0].length)
  // نطاق مثل «[33، 34]» يحمل معلومات — لا نحذفه.
  if (/^[\s\u060C\u061B\u061F.,:;-]*\d/.test(rest)) return trimmed
  const cleaned = rest.replace(/^[\s\u060C\u061B\u061F.,:;-]+/, '')
  return cleaned || trimmed
}

/* ------------------------------------------------------------------ *
 * فهرس البحث العام (يُحمَّل لازيًا عند أول بحث)
 * ------------------------------------------------------------------ */

let searchPromise = null

export function loadSearchIndex() {
  if (searchPromise) return searchPromise
  searchPromise = import('../resources/data/tafseer/index-search.mjs')
    .then((mod) => mod.default)
    .catch((err) => {
      searchPromise = null
      throw err
    })
  return searchPromise
}

/** بحث في نصوص الآيات والتفسير — يعمل دون إنترنت. يعيد [{ n, a, snippet, kind }]. */
export async function searchTafseer(query, { limit = 60 } = {}) {
  const q = normalizeArabic(query)
  if (!q) return []
  const index = await loadSearchIndex()
  const results = []
  for (const entry of index) {
    const inAyah = entry.at.includes(q)
    const inTafseer = inAyah ? false : entry.dt.includes(q)
    if (!inAyah && !inTafseer) continue
    results.push({
      n: entry.s,
      a: entry.a,
      kind: inAyah ? 'ayah' : 'tafseer',
      snippet: (inAyah ? entry.at : entry.dt).slice(0, 90),
    })
    if (results.length >= limit) break
  }
  return results
}

/* ------------------------------------------------------------------ *
 * المشاركة / النسخ
 * ------------------------------------------------------------------ */

export function buildShareText(record, surahName) {
  const parts = []
  parts.push(
    `سورة ${surahName || ''} — الآية ${String(record.aya_no).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)])}`
  )
  if (record.aya_text_emlaey) parts.push(record.aya_text_emlaey)
  const tafseer = stripLeadingMarker(record.aya_tafseer, record.aya_no)
  if (tafseer) parts.push(`التفسير: ${tafseer}`)
  parts.push('—')
  parts.push(TAFSEER_APP_CREDIT)
  return parts.join('\n\n')
}