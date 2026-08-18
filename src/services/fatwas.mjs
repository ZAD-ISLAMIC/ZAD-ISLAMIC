import fatwasIndex from '../resources/data/fatwas/index.json' with { type: 'json' }
import {
  FATWA_CHUNKS,
  FATWA_UNIQUE_COUNT,
  FATWA_AUDIO_COUNT,
} from '../resources/data/fatwas/chunks.mjs'

export const FATWA_NS = 'fatwa'

export const SHEIKH_SOURCE_URL = 'https://binbaz.org.sa'

const TASHKEEL_RE =
  /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06dc\u06df-\u06e8\u06ea-\u06ed]/g

/** تطبيع نصوص عربية للبحث والمطابقة (نمط adhkar/hisnmuslim). */
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
 * الفهرس الخفيف (يُستورد بشكل ثابت — لا بيانات ثقيلة هنا)
 * ------------------------------------------------------------------ */

export const FATWAS_INDEX = fatwasIndex

const CATEGORY_BY_SLUG = new Map(fatwasIndex.map((c) => [c.slug, c]))

export function getCategories() {
  return [...fatwasIndex]
}

export function getCategoryBySlug(slug) {
  return CATEGORY_BY_SLUG.get(slug) || null
}

export function searchCategories(query) {
  const q = normalizeArabic(query)
  if (!q) return getCategories()
  return fatwasIndex.filter((c) => normalizeArabic(c.name).includes(q))
}

export function totalStats() {
  return {
    count: FATWA_UNIQUE_COUNT,
    audioCount: FATWA_AUDIO_COUNT,
    categories: fatwasIndex.length,
  }
}

/* ------------------------------------------------------------------ *
 * تحميل الفئة لازيًا (chunk واحد لكل فئة مع cache في الذاكرة)
 * ------------------------------------------------------------------ */

const categoryCache = new Map()

export function loadCategory(slug) {
  if (categoryCache.has(slug)) return categoryCache.get(slug)
  const loader = FATWA_CHUNKS[slug]
  if (!loader) return Promise.resolve(null)
  const p = loader()
    .then((mod) => mod.default)
    .catch((err) => {
      categoryCache.delete(slug)
      throw err
    })
  categoryCache.set(slug, p)
  return p
}

export async function getFatwa(slug, id) {
  const fatwas = await loadCategory(slug)
  if (!fatwas) return null
  return fatwas.find((f) => String(f.id) === String(id)) || null
}

/* ------------------------------------------------------------------ *
 * فهرس البحث العام (يُحمَّل لازيًا عند أول بحث)
 * ------------------------------------------------------------------ */

let searchPromise = null

export function loadSearchIndex() {
  if (searchPromise) return searchPromise
  searchPromise = import('../resources/data/fatwas/index-search.mjs')
    .then((mod) => mod.default)
    .catch((err) => {
      searchPromise = null
      throw err
    })
  return searchPromise
}

/** بحث عام في كل الفتاوى (عنوان+سؤال) — يُشغَّل دون إنترنت بعد أول تحميل. */
export async function searchGlobal(query, { limit = 60 } = {}) {
  const q = normalizeArabic(query)
  if (!q) return []
  const index = await loadSearchIndex()
  const results = []
  for (const entry of index) {
    if (
      normalizeArabic(entry.t).includes(q) ||
      normalizeArabic(entry.q).includes(q)
    ) {
      const category = CATEGORY_BY_SLUG.get(entry.slug)
      results.push({
        id: entry.id,
        slug: entry.slug,
        category: category?.name || '',
        title: entry.t || entry.q,
      })
      if (results.length >= limit) break
    }
  }
  return results
}

/* ------------------------------------------------------------------ *
 * مرجع الصوت — اسم ملف مستقر وفريد على الجهاز
 * ------------------------------------------------------------------ */

// دالة hash حتمية (FNV-1a) مبنية على النص كاملًا لتوحيد اسم الملف عبر
// المنصات وتفادي التعارض بين روابط مختلفة، مع دمج الروابط المتكررة.
function hashString(value) {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function basenameOf(url) {
  const clean = String(url || '').replace(/\/+$/, '')
  const last = clean.split('/').pop() || 'fatwa'
  return last.replace(/[^\w.\-]/g, '_').slice(-40).toLowerCase() || 'fatwa'
}

export function audioFileNameOf(url, id = '') {
  const base = basenameOf(url)
  const name = /\.(mp3|m4a|aac|ogg|wav|opus)$/i.test(base)
    ? base
    : `${base}.mp3`
  return `${hashString(String(url))}-${name || 'fatwa'}`
}

export function refFor(fileName) {
  return `fatwa:a:${fileName}`
}

export function trackFor(fatwa, categoryName) {
  const url = normalizeHttps(fatwa.audio)
  const fileName = audioFileNameOf(url, fatwa.id)
  return {
    kind: 'fatwa',
    name: fatwa.title || fatwa.question,
    sub: categoryName || 'فتاوى ابن باز',
    url,
    fileName,
    ref: refFor(fileName),
  }
}

export function normalizeHttps(url) {
  const value = String(url || '')
  if (/^https?:\/\//i.test(value)) {
    return value.replace(/^http:\/\//i, 'https://')
  }
  return value
}

/* ------------------------------------------------------------------ *
 * عرض نص الجواب والنسخ
 * ------------------------------------------------------------------ */

const ANSWER_LABEL_RE = /^\s*(الجواب|جواب)\s*:/i

/** يزيل بادئة «الجواب:» الساكنة في بداية نص الإجابة للعرض النظيف. */
export function stripAnswerLabel(answer) {
  const cleaned = String(answer || '').replace(/\r\n/g, '\n').trim()
  return cleaned.replace(ANSWER_LABEL_RE, '').trim()
}

export const APP_CREDIT = 'من تطبيق «التقوى» — فتاوى الشيخ عبد العزيز بن باز رحمه الله'

/** نص النسخ الكامل: السؤال + الجواب + رابط الصوتية + المصدر + حقوق التطبيق. */
export function buildShareText(fatwa, categoryName) {
  const parts = []
  if (fatwa.title) parts.push(`السؤال: ${fatwa.title}`)
  if (fatwa.question) parts.push(`السؤال: ${fatwa.question}`)
  if (fatwa.answer) parts.push(`الجواب: ${stripAnswerLabel(fatwa.answer)}`)
  if (fatwa.audio) parts.push(`رابط الصوتية: ${normalizeHttps(fatwa.audio)}`)
  if (fatwa.link) parts.push(`المصدر: ${fatwa.link}`)
  if (categoryName) parts.push(`الفئة: ${categoryName}`)
  parts.push('—')
  parts.push(APP_CREDIT)
  return parts.join('\n\n')
}

/* ------------------------------------------------------------------ *
 * سيرة الشيخ (تعرض داخل نافذة المعلومات)
 * ------------------------------------------------------------------ */

export const SHEIKH_BIO = {
  name: 'الشيخ عبد العزيز بن باز',
  fullName: 'عبد العزيز بن عبد الله بن عبد الرحمن بن باز',
  subtitle: 'رحمه الله — مفتي عام المملكة العربية السعودية سابقاً',
  short:
    'عالم جليل من كبار علماء المملكة، خدم العلم والتعليم والإفتاء أكثر من ستين عاماً، وتوفي رحمه الله عام ١٤٢٠هـ.',
  paragraph:
    'ولد عبد العزيز بن عبد الله بن باز رحمه الله في مدينة الرياض عام ١٣٣٠هـ، وحفظ القرآن في صباه، وطلب العلم على كبار علماء الرياض وفي مقدمتهم الشيخ محمد بن إبراهيم آل الشيخ. أصيب بفقدان بصره في سن مبكرة بعد مرض ألمَّ به، لكنه واصل طلب العلم وإفادته حتى تولى المناصب العليا: قضاء وعلمًا ثم مفتياً عاماً للمملكة ورئيساً لهيئة كبار العلماء واللجنة الدائمة للبحوث العلمية والإفتاء من عام ١٣٩٥هـ حتى وفاته عام ١٤٢٠هـ. امتاز بالتواضع والحرص على نشر العلم، وألف وأملى مئات الكتب والرسائل والآلاف من الفتاوى.',
  facts: [
    { label: 'المولد', value: 'الرياض عام ١٣٣٠هـ' },
    { label: 'الوفاة', value: 'الطائف عام ١٤٢٠هـ — ١٣ مايو ١٩٩٩م' },
    { label: 'الطلب', value: 'تلقى العلم على الشيخ محمد بن إبراهيم آل الشيخ وغيره' },
    { label: 'المناصب', value: 'مفتي عام السعودية ورئيس هيئة كبار العلماء واللجنة الدائمة للإفتاء (١٣٩٥–١٤٢٠هـ)' },
    { label: 'المنهج', value: 'العلم بالسنة ونشر الفتاوى والرد على البدع' },
  ],
  note: 'سيرته تُروى اختصاراً من كتب التراجم، والمصادر الكاملة موثَّقة على موقعه الرسمي.',
  sourceUrl: SHEIKH_SOURCE_URL,
}