import historyIndex from '../resources/data/history/index.json' with { type: 'json' }
import { HISTORY_TOTAL_COUNT, HISTORY_CHUNKS } from '../resources/data/history/chunks.mjs'

export const HISTORY_NS = 'history'

export const HISTORY_APP_CREDIT =
  'من تطبيق «التقوى» — الموسوعة التاريخية للأحداث المرتبطة بالإسلام والمسلمين'

const TASHKEEL_RE =
  /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06dc\u06df-\u06e8\u06ea-\u06ed]/g

/** تطبيع نصوص عربية للبحث والمطابقة (نمط adhkar/hisn/fatwas). */
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
 * الفهرس الثابت (الحقبات — خفيف ولا يُسحب معه أي حدث)
 * ------------------------------------------------------------------ */

export const HISTORY_INDEX = historyIndex

const ERA_BY_KEY = new Map(historyIndex.map((e) => [e.key, e]))

export function getEras() {
  return [...historyIndex]
}

export function getEraByKey(key) {
  return ERA_BY_KEY.get(key) || null
}

export function totalStats() {
  return {
    count: HISTORY_TOTAL_COUNT,
    eras: historyIndex.length,
  }
}

/* ------------------------------------------------------------------ *
 * تحميل الحقبة لازيًا (chunk واحد لكل حقبة مع cache في الذاكرة)
 * ------------------------------------------------------------------ */

const eraCache = new Map()

export function loadEra(key) {
  if (eraCache.has(key)) return eraCache.get(key)
  const loader = HISTORY_CHUNKS[key]
  if (!loader) return Promise.resolve(null)
  const p = loader()
    .then((mod) => mod.default)
    .catch((err) => {
      eraCache.delete(key)
      throw err
    })
  eraCache.set(key, p)
  return p
}

export async function getEvent(eraKey, id) {
  const events = await loadEra(eraKey)
  if (!events) return null
  return events.find((e) => String(e.id) === String(id)) || null
}

/* ------------------------------------------------------------------ *
 * فهرس البحث العام (يُحمَّل لازيًا عند أول بحث)
 * ------------------------------------------------------------------ */

let searchPromise = null

export function loadSearchIndex() {
  if (searchPromise) return searchPromise
  searchPromise = import('../resources/data/history/index-search.mjs')
    .then((mod) => mod.default)
    .catch((err) => {
      searchPromise = null
      throw err
    })
  return searchPromise
}

/** بحث عام في كل الأحداث (عنوان + snippet النص) — يعمل دون إنترنت. */
export async function searchHistory(query, { limit = 60 } = {}) {
  const q = normalizeArabic(query)
  if (!q) return []
  const index = await loadSearchIndex()
  const results = []
  for (const entry of index) {
    if (
      normalizeArabic(entry.t).includes(q) ||
      normalizeArabic(entry.s).includes(q)
    ) {
      results.push({
        id: entry.id,
        era: entry.era,
        title: entry.t,
      })
      if (results.length >= limit) break
    }
  }
  return results
}

/* ------------------------------------------------------------------ *
 * تفسير التواريخ وعرضها
 * ------------------------------------------------------------------ */

const ARABIC_DIGIT_MAP = Object.fromEntries(
  [...'٠١٢٣٤٥٦٧٨٩'].map((a, i) => [a, String(i)])
)
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
export function arabic(n) {
  return String(n).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)])
}

/** يستخرج أجزاء التاريخ من `event.date` إلى كائن منظم. */
export function parseEventDate(date) {
  const parts = Array.isArray(date) ? date : []
  const out = { hijri: null, beforeHijra: false, month: null, gregorian: null }
  for (const raw of parts) {
    const part = String(raw)
    let m = part.match(/العام الهجري\s*:\s*([0-9٠-٩]+)\s*(ق)?/)
    if (m) {
      out.hijri = Number(m[1].replace(/[٠-٩]/g, (d) => ARABIC_DIGIT_MAP[d]))
      out.beforeHijra = Boolean(m[2])
      continue
    }
    m = part.match(/الشهر القمري\s*:\s*(.+)/)
    if (m) {
      out.month = m[1].trim()
      continue
    }
    m = part.match(/العام الميلادي\s*:\s*([0-9٠-٩]+)/)
    if (m) {
      out.gregorian = Number(m[1].replace(/[٠-٩]/g, (d) => ARABIC_DIGIT_MAP[d]))
    }
  }
  return out
}

/** نص مصغّر للعرض: «شوال ٧هـ — ٦٢٨م». */
export function formatEventDate(event) {
  const d = parseEventDate(event.date)
  const bits = []
  if (d.hijri !== null) {
    bits.push(
      `${d.beforeHijra ? '' : 'سنة '}${arabic(d.hijri)}${d.beforeHijra ? 'ق هـ' : 'هـ'}`
    )
  }
  if (d.gregorian !== null) bits.push(`${arabic(d.gregorian)}م`)
  return bits.join(' — ')
}

/** رقائق التواريخ الكاملة للتفاصيل. */
export function eventDateChips(event) {
  const d = parseEventDate(event.date)
  const chips = []
  if (d.month) chips.push(`${d.month}`)
  if (d.hijri !== null) {
    chips.push(
      d.beforeHijra ? `${arabic(d.hijri)} ق هـ` : `${arabic(d.hijri)} هـ`
    )
  }
  if (d.gregorian !== null) chips.push(`${arabic(d.gregorian)} م`)
  return chips
}

/* ------------------------------------------------------------------ *
 * المشاركة / النسخ
 * ------------------------------------------------------------------ */

export function buildShareText(event, eraTitle) {
  const parts = []
  if (event.title) parts.push(`الحدث: ${event.title}`)
  const date = formatEventDate(event)
  if (date) parts.push(`التاريخ: ${date}`)
  if (event.text) parts.push(event.text)
  if (eraTitle) parts.push(`الحقبة: ${eraTitle}`)
  parts.push('—')
  parts.push(HISTORY_APP_CREDIT)
  return parts.join('\n\n')
}