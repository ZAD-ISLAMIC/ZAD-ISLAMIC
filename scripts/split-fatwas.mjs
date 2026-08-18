#!/usr/bin/env node
/**
 * يقسم fatwas.json إلى ملفات صغيرة حسب الفئة + فهرس + فهرس بحث.
 * النتائج (تحت src/resources/data/fatwas/):
 *   index.json           — [{ slug, name, count, audioCount }] (استيراد ثابت)
 *   cat-<slug>.mjs       — فتاوى الفئة كاملة كوحدة JS (تحميل لازي عند الدخول)
 *   index-search.json    — [{ id, slug, t, q }] للبحث العام (تحميل لازي)
 *   chunks.mjs           — خريطة slugs → لوادر ثابتة (Vite + Node)
 *
 * التشغيل: npm run gen:fatwas
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(ROOT, 'src', 'resources', 'data')
const OUT_DIR = join(DATA_DIR, 'fatwas')

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

mkdirSync(OUT_DIR, { recursive: true })

const data = JSON.parse(readFileSync(join(DATA_DIR, 'fatwas.json'), 'utf8'))
if (!Array.isArray(data)) throw new Error('fatwas.json ليس مصفوفة')

// تجميع كل فتوى تحت كل فئة من فئاتها (الفتوى الواحدة قد تتبع أكثر من فئة).
const byCategory = new Map()
for (const fatwa of data) {
  for (const rawName of fatwa.categories || []) {
    const name = String(rawName).trim()
    if (!byCategory.has(name)) byCategory.set(name, [])
    byCategory.get(name).push(fatwa)
  }
}

// توليد slugs فريدة مع معالجة التعارض (أسماء بعد trim قد تتطابق).
const slugCounts = new Map()
const index = []
const searchIndex = []

for (const [name, fatwas] of byCategory) {
  let slug = slugify(name)
  const seen = slugCounts.get(slug) || 0
  slugCounts.set(slug, seen + 1)
  if (seen > 0) slug = `${slug}-${seen + 1}`

  fatwas.sort((a, b) => Number(a.id) - Number(b.id))

  const audioCount = fatwas.filter((f) => f.audio).length
  index.push({ slug, name, count: fatwas.length, audioCount })

  writeFileSync(
    join(OUT_DIR, `cat-${slug}.mjs`),
    `// مولّدة آلياً بواسطة scripts/split-fatwas.mjs — لا تُعدَّل يدوياً.\nexport default ` +
      JSON.stringify(fatwas) +
      '\n',
    'utf8'
  )
}

// فهرس البحث يُضمّن كل فتوى مرّة واحدة فقط (بأول فئة تظهر لها) لتفادي
// تكرار نصوص الفتوى الواحدة عبر فئاتها المتعددة — النص هو نفسه.
const slugByName = new Map(byCategory.keys().map((name) => [name, null]))
for (const { name, slug } of index) slugByName.set(name, slug)
const seenIds = new Set()
for (const [name, fatwas] of byCategory) {
  const finalSlug = slugByName.get(name)
  for (const f of fatwas) {
    if (seenIds.has(f.id)) continue
    seenIds.add(f.id)
    searchIndex.push({
      id: f.id,
      slug: finalSlug,
      t: String(f.title || '').slice(0, 160),
      q: String(f.question || '').slice(0, 200),
    })
  }
}

index.sort((a, b) => a.name.localeCompare(b.name, 'ar'))

// تنظيف ملفات مُولّدة قديمة لم تعد في الفهرس (مثل إعادة تسمية فئة أو
// تحويل من صيغة .json) حتى لا تبقى أثراً عند التطبيق أو الاختبارات.
import { readdirSync, rmSync } from 'node:fs'
const validNames = new Set(index.map((c) => `cat-${c.slug}`))
const stale = readdirSync(OUT_DIR).filter((f) => {
  // فهرس بحث بصيغة JSON قديمة — حذفه
  if (f === 'index-search.json') return true
  if (!f.startsWith('cat-')) return false
  const base = f.replace(/\.(mjs|json)$/, '')
  // صيغة JSON القديمة لم تعد تُولَّد — تُحذف كلها؛ وصيغة mjs فقط للأبقاء.
  return f.endsWith('.json') || !validNames.has(base)
})
for (const f of stale) rmSync(join(OUT_DIR, f))

writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8')
writeFileSync(
  join(OUT_DIR, 'index-search.mjs'),
  `// مولّدة آلياً بواسطة scripts/split-fatwas.mjs — لا تُعدَّل يدوياً.\nexport default ` +
    JSON.stringify(searchIndex) +
    '\n',
  'utf8'
)
// خريطة تحميل ثابتة للفئات — يعمل في Vite (تقسيم تلقائي للحزم) وفي Node
// للاختبارات، على عكس import.meta.glob الذي لا يتوفر في Node.
const chunkLines = index
  .map((c) => `  ${JSON.stringify(c.slug)}: () => import('./cat-${c.slug}.mjs')`)
  .join(',\n')
writeFileSync(
  join(OUT_DIR, 'chunks.mjs'),
  `// مولّدة آلياً بواسطة scripts/split-fatwas.mjs — لا تُعدَّل يدوياً.\n` +
    `export const FATWA_UNIQUE_COUNT = ${data.length}\n` +
    `export const FATWA_AUDIO_COUNT = ${data.filter((f) => f.audio).length}\n` +
    `export const FATWA_CHUNKS = {\n${chunkLines},\n}\n`,
  'utf8'
)

console.log(
  `[fatwas] تم تقسيم ${data.length} فتوى عبر ${index.length} فئة ` +
    `→ ${index.length} ملفات cat-*.mjs + chunks.mjs + index-search.json ` +
    `(${(JSON.stringify(searchIndex).length / 1024).toFixed(0)}KB search index)`
)