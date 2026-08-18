import khutbahIndex from '../resources/data/khutbah/index.json' with { type: 'json' }
import {
  KHUTBAH_BATCH_SIZE,
  KHUTBAH_BATCH_COUNT,
  KHUTBAH_UNIQUE_COUNT,
  KHUTBAH_ATTACHMENT_COUNT,
  KHUTBAH_AUTHOR_COUNT,
  KHUTBAH_CATEGORY_CHUNKS,
  KHUTBAH_CHUNKS,
} from '../resources/data/khutbah/batches.mjs'

export const KHUTBAH_NS = 'khutbah'

export const KHUTBAA_URL = 'https://khutabaa.com'

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
 * الفهرس الخفيف (يُستورد بشكل ثابت — لا بيانات ثقيلة هنا)
 * ------------------------------------------------------------------ */

const CATEGORY_BY_SLUG = new Map(khutbahIndex.map((c) => [c.slug, c]))

// الاسم الخام → slug (فهرس البحث قد يخزّن الاسم أو الـ slug حسب الإصدار).
const SLUG_BY_NAME = new Map(khutbahIndex.map((c) => [c.name, c.slug]))

/** يرجّع الـ slug الصحيح لفئة ما — يقبل الاسم الخام أو slug صالحاً. */
export function slugForCategory(nameOrSlug) {
  return SLUG_BY_NAME.get(nameOrSlug) || String(nameOrSlug)
}

export function getCategories() {
  return [...khutbahIndex]
}

export function getCategoryBySlug(slug) {
  return CATEGORY_BY_SLUG.get(slug) || null
}

export function searchCategories(query) {
  const q = normalizeArabic(query)
  if (!q) return getCategories()
  return khutbahIndex.filter((c) => normalizeArabic(c.name).includes(q))
}

export function totalStats() {
  return {
    count: KHUTBAH_UNIQUE_COUNT,
    categories: khutbahIndex.length,
    authors: KHUTBAH_AUTHOR_COUNT,
    attachments: KHUTBAH_ATTACHMENT_COUNT,
    batches: KHUTBAH_BATCH_COUNT,
  }
}

/* ------------------------------------------------------------------ *
 * تحميل فئة (صفوف خفيفة) لازيًا مع cache في الذاكرة
 * ------------------------------------------------------------------ */

const categoryCache = new Map()

export function loadCategory(slug) {
  if (categoryCache.has(slug)) return categoryCache.get(slug)
  const loader = KHUTBAH_CATEGORY_CHUNKS[slug]
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

/* ------------------------------------------------------------------ *
 * دفعات النص الكامل — تُحمَّل لازيًا حسب id (أرقام متسلسلة من 1)
 * ------------------------------------------------------------------ */

const batchCache = new Map()

export function loadBatch(index) {
  if (batchCache.has(index)) return batchCache.get(index)
  const loader = KHUTBAH_CHUNKS[String(index)]
  if (!loader) return Promise.resolve(null)
  const p = loader()
    .then((mod) => mod.default)
    .catch((err) => {
      batchCache.delete(index)
      throw err
    })
  batchCache.set(index, p)
  return p
}

export function batchIndexFor(id) {
  const n = Number(id)
  if (!Number.isInteger(n) || n < 1 || n > KHUTBAH_UNIQUE_COUNT) return -1
  return Math.floor((n - 1) / KHUTBAH_BATCH_SIZE)
}

export async function getKhutbahById(id) {
  const index = batchIndexFor(id)
  if (index === -1) return null
  const batch = await loadBatch(index)
  if (!batch) return null
  return batch.find((k) => String(k.id) === String(id)) || null
}

/* ------------------------------------------------------------------ *
 * فهرس البحث العام (يُحمَّل لازيًا عند أول بحث)
 * ------------------------------------------------------------------ */

let searchPromise = null

export function loadSearchIndex() {
  if (searchPromise) return searchPromise
  searchPromise = import('../resources/data/khutbah/index-search.mjs')
    .then((mod) => mod.default)
    .catch((err) => {
      searchPromise = null
      throw err
    })
  return searchPromise
}

/** بحث عام في كل الخطب (عنوان + كاتب + فئات) — يعمل دون إنترنت. */
export async function searchGlobal(query, { limit = 60 } = {}) {
  const q = normalizeArabic(query)
  if (!q) return []
  const index = await loadSearchIndex()
  const results = []
  for (const entry of index) {
    if (
      normalizeArabic(entry.t).includes(q) ||
      normalizeArabic(entry.a).includes(q) ||
      (entry.c || []).some((c) => normalizeArabic(c).includes(q))
    ) {
      const slug = slugForCategory(entry.cat)
      const category = CATEGORY_BY_SLUG.get(slug)
      results.push({
        id: entry.id,
        slug,
        category: category?.name || '',
        title: entry.t,
        author: entry.a,
      })
      if (results.length >= limit) break
    }
  }
  return results
}

/* ------------------------------------------------------------------ *
 * المؤلف والتاريخ
 * ------------------------------------------------------------------ */

export function authorName(author) {
  return String(author || '').trim()
}

export function formatDate(createdAt) {
  const m = String(createdAt || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  const [, y, month, day] = m
  return `${day}/${month}/${y}م`
}

/* ------------------------------------------------------------------ *
 * تحليل نص الخطبة إلى أقسام للعرض
 * ------------------------------------------------------------------ */

const SECTION_HEADERS = [
  'عناصر الخطبة',
  'اقتباس',
  'الخطبة الأولى',
  'الخطبة الثانية',
  'خاتمة',
  'مقدمة',
]

function isSectionHeader(line) {
  const l = String(line).trim()
  for (const h of SECTION_HEADERS) {
    if (l === h) return true
    if (l.startsWith(`${h}:`) || l.startsWith(`${h} :`)) return true
  }
  return false
}

/**
 * يحوّل نص الخطبة الخام إلى أقسام مرتبة:
 * [{ type: 'header', text } | { type: 'para', text }]
 * يفصل العناوين المعروفة (عناصر/اقتباس/الخطبة الأولى/الثانية/خاتمة) عن الفقرات.
 */
export function parseKhutbah(content) {
  const sections = []
  let buffer = []

  const flush = () => {
    if (buffer.length === 0) return
    sections.push({ type: 'para', text: buffer.join(' ') })
    buffer = []
  }

  for (const rawLine of String(content || '').split('\n')) {
    const line = rawLine.replace(/[ \t\u00a0\u200b]+/g, ' ').trim()
    if (!line) continue
    if (isSectionHeader(line)) {
      flush()
      sections.push({ type: 'header', text: line })
    } else {
      buffer.push(line)
    }
  }
  flush()
  return sections
}

/* ------------------------------------------------------------------ *
 * مرجع المرفقات — اسم ملف مستقر وفريد على الجهاز يحافظ على الامتداد
 * ------------------------------------------------------------------ */

// دالة hash حتمية (FNV-1a) على رابط الملف لتفادي التعارض بين المرفقات.
function hashString(value) {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function extOf(fileName) {
  const m = String(fileName || '').match(/\.([a-zA-Z0-9]+)$/)
  return m ? m[1].toLowerCase() : 'doc'
}

export function mimeOf(fileName) {
  const ext = extOf(fileName)
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'doc') return 'application/msword'
  if (ext === 'docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (ext === 'txt') return 'text/plain'
  return 'application/octet-stream'
}

/** اسم ملف محفوظ على الجهاز: هاش الرابط + الاسم الأصلي (عربي آمناً) + الامتداد. */
export function attachmentFileName(attachment) {
  const name = String(attachment.name || 'مرفق')
  const ext = extOf(name)
  const base = name
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w.\-\u0600-\u06FF]/g, '_')
    .slice(-60)
  return `${hashString(String(attachment.link))}-${base || 'khutbah'}.${ext}`
}

export function attachmentRef(attachment) {
  return `khutbah:f:${attachmentFileName(attachment)}`
}

export function trackFor(khutbah, attachment) {
  const fileName = attachmentFileName(attachment)
  return {
    kind: 'khutbah',
    name: String(attachment.name || 'مرفق'),
    sub: khutbah.title || 'خطبة',
    url: normalizeHttps(attachment.link),
    fileName,
    ref: attachmentRef(attachment),
  }
}

export function normalizeHttps(url) {
  const value = String(url || '')
  if (/^https?:\/\//i.test(value)) {
    return value.replace(/^http:\/\//i, 'https://')
  }
  return value
}

export const APP_CREDIT =
  'من تطبيق «التقوى» — خطب من موقع ملتقى الخطباء (khutabaa.com)'

/** نص النسخ الكامل: العنوان + الكاتب + المحتوى + المصدر + حقوق التطبيق. */
export function buildShareText(khutbah) {
  const parts = []
  if (khutbah.title) parts.push(`الخطبة: ${khutbah.title}`)
  if (authorName(khutbah.author)) parts.push(`الكاتب: ${authorName(khutbah.author)}`)
  if (khutbah.categories && khutbah.categories.length) {
    parts.push(`الفئات: ${khutbah.categories.join('، ')}`)
  }
  if (khutbah.content) parts.push(khutbah.content)
  if (khutbah.url) parts.push(`المصدر: ${normalizeHttps(khutbah.url)}`)
  parts.push('—')
  parts.push(APP_CREDIT)
  return parts.join('\n\n')
}
