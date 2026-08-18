#!/usr/bin/env node
/**
 * يقسم khutbah.json إلى ملفات صغيرة حسب الفئة + دفعات النص الكامل + فهرس.
 * النتائج (تحت src/resources/data/khutbah/):
 *   index.json           — [{ slug, name, count }] (استيراد ثابت)
 *   cat-<slug>.mjs       — صفوف خفيفة لكل فئة (تحميل لازي عند الدخول)
 *   kh-<batch>.mjs       — النص الكامل مقسّماً بدفعات حسب id (تحميل لازي عند الفتح)
 *   batches.mjs          — ثوابت الحجم/العدد + خريطة لوادر ثابتة
 *   index-search.mjs     — [{ id, slug, t, a, c }] للبحث العام (تحميل لازي)
 *
 * التشغيل: npm run gen:khutbah
 */
import { mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(ROOT, 'src', 'resources', 'data')
const OUT_DIR = join(DATA_DIR, 'khutbah')

const TASHKEEL_RE =
  /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06dc\u06df-\u06e8\u06ea-\u06ed]/g

function normalizeArabic(text) {
  return String(text)
    .normalize('NFKC')
    .replace(TASHKEEL_RE, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[\u0640]/g, '')
    .trim()
    .toLowerCase()
}

function slugify(name) {
  const clean = normalizeArabic(String(name)).replace(/\s+/g, '-')
  return clean || 'متنوعة'
}

/** ضغط المحتوى مع الحفاظ على أسطر العناوين: قصّ أطراف كل سطر وتوحيد
 *  الفراغات المتتالية داخل السطر، ثم حذف الأسطر الفارغة فقط. */
function minifyContent(raw) {
  return String(raw || '')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0\u200b]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

function authorOf(author) {
  if (!author || typeof author !== 'object') return ''
  return [author.name_prefix, author.first_name, author.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()
}

function yearOf(createdAt) {
  const m = String(createdAt || '').match(/^(\d{4})/)
  return m ? Number(m[1]) : 0
}

function extOf(name) {
  const m = String(name || '').match(/\.([a-zA-Z0-9]+)$/)
  return m ? m[1].toLowerCase() : 'doc'
}

mkdirSync(OUT_DIR, { recursive: true })

const data = JSON.parse(readFileSync(join(DATA_DIR, 'khutbah.json'), 'utf8'))
if (!Array.isArray(data)) throw new Error('khutbah.json ليس مصفوفة')

// محتوى مضغوط لمرة واحدة لكل خطبة.
for (const k of data) {
  k.content = minifyContent(k.rawContent)
}

// تجميع الخطب تحت كل فئة رئيسية (الخطبة قد تتبع أكثر من فئة).
const FALLBACK_CATEGORY = 'الخطب المتنوعة'
const byCategory = new Map()
const primaryOf = new Map()
for (const k of data) {
  const names = (k.mainCategories || []).map((c) => String(c.name || '').trim()).filter(Boolean)
  const final = names.length > 0 ? names : [FALLBACK_CATEGORY]
  primaryOf.set(k.id, final[0])
  for (const name of final) {
    if (!byCategory.has(name)) byCategory.set(name, [])
    byCategory.get(name).push(k)
  }
}

// توليد slugs فريدة مع معالجة التعارض.
const slugCounts = new Map()
const slugByName = new Map()
const index = []
const searchIndex = []

for (const [name, khutbahs] of byCategory) {
  let slug = slugify(name)
  const seen = slugCounts.get(slug) || 0
  slugCounts.set(slug, seen + 1)
  if (seen > 0) slug = `${slug}-${seen + 1}`
  slugByName.set(name, slug)

  khutbahs.sort((a, b) => Number(a.id) - Number(b.id))
  index.push({ slug, name, count: khutbahs.length })

  const rows = khutbahs.map((k) => ({
    id: k.id,
    slug: k.slug,
    title: String(k.title || '').slice(0, 200),
    author: authorOf(k.author),
    year: yearOf(k.created_at),
    excerpt: String(k.content || '').slice(0, 140),
    attachments: (k.attachments || []).map((a) => ({
      name: String(a.name || ''),
      ext: extOf(a.name),
    })),
  }))

  writeFileSync(
    join(OUT_DIR, `cat-${slug}.mjs`),
    `// مولّدة آلياً بواسطة scripts/split-khutbah.mjs — لا تُعدَّل يدوياً.\nexport default ` +
      JSON.stringify(rows) +
      '\n',
    'utf8'
  )
}

// فهرس البحث: كل خطبة مرة واحدة بأول فئة لها (الرئيسية الأولى).
// cat يحمل الـ slug الصالح للفئة (بعد slugify) ليعمل التنقل مباشرة.
for (const k of data) {
  searchIndex.push({
    id: k.id,
    slug: k.slug,
    cat: slugByName.get(primaryOf.get(k.id)) || primaryOf.get(k.id),
    t: String(k.title || '').slice(0, 160),
    a: authorOf(k.author),
    c: (k.mainCategories || []).map((c) => String(c.name || '').trim()).filter(Boolean),
  })
}

index.sort((a, b) => a.name.localeCompare(b.name, 'ar'))

// دفعات النص الكامل — دفعة واحدة لكل 512 خطبة، كل خطبة مرة واحدة فقط.
const BATCH_SIZE = 512
const batchCount = Math.ceil(data.length / BATCH_SIZE)
const batches = []
for (let i = 0; i < batchCount; i += 1) {
  const slice = data.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
  const records = slice.map((k) => ({
    id: k.id,
    title: k.title,
    slug: k.slug,
    author: k.author ? authorOf(k.author) : '',
    content: k.content,
    attachments: (k.attachments || []).map((a) => ({ name: String(a.name || ''), link: String(a.link || '') })),
    categories: (k.mainCategories || []).map((c) => String(c.name || '').trim()).filter(Boolean),
    subCategories: (k.subCategories || []).map((c) => String(c.name || '').trim()).filter(Boolean),
    url: k.url || '',
    created_at: k.created_at || '',
  }))
  batches.push(records)
  writeFileSync(
    join(OUT_DIR, `kh-${i}.mjs`),
    `// مولّدة آلياً بواسطة scripts/split-khutbah.mjs — لا تُعدَّل يدوياً.\nexport default ` +
      JSON.stringify(records) +
      '\n',
    'utf8'
  )
}

// تنظيف ملفات مُولّدة قديمة لم تعد في الفهرس.
const validCat = new Set(index.map((c) => `cat-${c.slug}`))
const stale = readdirSync(OUT_DIR).filter((f) => {
  if (f === 'index-search.json') return true
  if (f.startsWith('cat-')) {
    const base = f.replace(/\.(mjs|json)$/, '')
    return f.endsWith('.json') || !validCat.has(base)
  }
  if (/^kh-\d+\.(json)$/.test(f)) return true
  if (f.startsWith('kh-') && f.endsWith('.mjs')) {
    const n = Number(f.replace(/^kh-/, '').replace(/\.mjs$/, ''))
    return !(Number.isInteger(n) && n >= 0 && n < batchCount)
  }
  return false
})
for (const f of stale) rmSync(join(OUT_DIR, f))

writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8')

writeFileSync(
  join(OUT_DIR, 'index-search.mjs'),
  `// مولّدة آلياً بواسطة scripts/split-khutbah.mjs — لا تُعدَّل يدوياً.\nexport default ` +
    JSON.stringify(searchIndex) +
    '\n',
  'utf8'
)

// خريطة تحميل ثابتة للدفعات — يعمل في Vite وفي Node للاختبارات.
const chunkLines = batches
  .map((_, i) => `  ${JSON.stringify(String(i))}: () => import('./kh-${i}.mjs')`)
  .join(',\n')

// خريطة تحميل الفئات (صفوف خفيفة) — تحميل لازي عند دخول الفئة.
const catLines = index
  .map((c) => `  ${JSON.stringify(c.slug)}: () => import('./cat-${c.slug}.mjs')`)
  .join(',\n')

const attachmentCount = data.reduce(
  (sum, k) => sum + (k.attachments || []).length,
  0
)
const authorCount = new Set(data.map((k) => authorOf(k.author)).filter(Boolean)).size

writeFileSync(
  join(OUT_DIR, 'batches.mjs'),
  `// مولّدة آلياً بواسطة scripts/split-khutbah.mjs — لا تُعدَّل يدوياً.\n` +
    `export const KHUTBAH_BATCH_SIZE = ${BATCH_SIZE}\n` +
    `export const KHUTBAH_BATCH_COUNT = ${batchCount}\n` +
    `export const KHUTBAH_UNIQUE_COUNT = ${data.length}\n` +
    `export const KHUTBAH_ATTACHMENT_COUNT = ${attachmentCount}\n` +
    `export const KHUTBAH_AUTHOR_COUNT = ${authorCount}\n` +
    `export const KHUTBAH_CATEGORY_CHUNKS = {\n${catLines},\n}\n` +
    `export const KHUTBAH_CHUNKS = {\n${chunkLines},\n}\n`,
  'utf8'
)

console.log(
  `[khutbah] تم تقسيم ${data.length} خطبة عبر ${index.length} فئة ` +
    `→ ${index.length} ملفات cat-*.mjs + ${batchCount} دفعات kh-*.mjs ` +
    `(${(JSON.stringify(searchIndex).length / 1024).toFixed(0)}KB search index, ` +
    `${(data.reduce((s, k) => s + k.content.length, 0) / 1024 / 1024).toFixed(0)}MB نص مضغوط)`
)
