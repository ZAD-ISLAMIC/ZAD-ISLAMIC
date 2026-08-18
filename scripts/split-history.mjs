#!/usr/bin/env node
/**
 * يقسم history.json إلى حقبات (قبل الهجرة + قرون هجرية) + فهرس + فهرس بحث.
 * النتائج (تحت src/resources/data/history/):
 *   index.json           — [{ key, title, count, firstYear, lastYear }] (استيراد ثابت)
 *   era-<key>.mjs        — أحداث الحقبة كاملة كوحدة JS (تحميل لازي عند الدخول)
 *   index-search.mjs     — [{ id, t, s }] للبحث العام (تحميل لازي)
 *   chunks.mjs           — خريطة keys → لوادر ثابتة (Vite + Node)
 *
 * التشغيل: npm run gen:history
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(ROOT, 'src', 'resources', 'data')
const OUT_DIR = join(DATA_DIR, 'history')

const ARABIC_DIGIT_MAP = Object.fromEntries(
  [...'٠١٢٣٤٥٦٧٨٩'].map((a, i) => [a, String(i)])
)
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const arabic = (n) => String(n).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)])

/** عدد هجري (سالب إن كان قبل الهجرة) أو null. */
function hijriYearOf(parts) {
  for (const raw of parts || []) {
    const part = String(raw)
    const m = part.match(/العام الهجري\s*:\s*([0-9٠-٩]+)\s*(ق)?/)
    if (!m) continue
    const num = Number(m[1].replace(/[٠-٩]/g, (d) => ARABIC_DIGIT_MAP[d]))
    return m[2] ? -num : num
  }
  return null
}

/** عام ميلادي أو null. */
function gregorianYearOf(parts) {
  for (const raw of parts || []) {
    const part = String(raw)
    const m = part.match(/العام الميلادي\s*:\s*([0-9٠-٩]+)/)
    if (!m) continue
    return Number(m[1].replace(/[٠-٩]/g, (d) => ARABIC_DIGIT_MAP[d]))
  }
  return null
}

mkdirSync(OUT_DIR, { recursive: true })

const data = JSON.parse(readFileSync(join(DATA_DIR, 'history.json'), 'utf8'))
if (!Array.isArray(data)) throw new Error('history.json ليس مصفوفة')

// تجميع الأحداث حسب الحقبة (قبل الهجرة + قرن هجري).
const byEra = new Map()
for (const event of data) {
  const h = hijriYearOf(event.date)
  const key = h === null || h <= 0 ? 'before' : `c${Math.max(1, Math.min(Math.ceil(h / 100), 15))}`
  if (!byEra.has(key)) byEra.set(key, [])
  byEra.get(key).push(event)
}

const ERA_ORDER = [...byEra.keys()].sort((a, b) => {
  if (a === 'before') return -1
  if (b === 'before') return 1
  return Number(a.slice(1)) - Number(b.slice(1))
})

const index = []
const searchIndex = []

for (const key of ERA_ORDER) {
  const events = byEra.get(key)
  events.sort((a, b) => Number(a.id) - Number(b.id))

  const years = events
    .map((e) => hijriYearOf(e.date))
    .filter((y) => y !== null)
    .sort((a, b) => a - b)
  const firstYear = years[0] ?? null
  const lastYear = years[years.length - 1] ?? null

  const title =
    key === 'before' ? 'ما قبل الهجرة' : `القرن ${arabic(Number(key.slice(1)))} الهجري`

  index.push({ key, title, count: events.length, firstYear, lastYear })

  writeFileSync(
    join(OUT_DIR, `era-${key}.mjs`),
    `// مولّدة آلياً بواسطة scripts/split-history.mjs — لا تُعدَّل يدوياً.\nexport default ` +
      JSON.stringify(events) +
      '\n',
    'utf8'
  )

  for (const e of events) {
    searchIndex.push({
      id: e.id,
      era: key,
      t: String(e.title || '').slice(0, 160),
      s: String(e.text || '').slice(0, 400),
    })
  }
}

// تنظيف ملفات مُولّدة قديمة لم تعد في الفهرس.
const validNames = new Set(index.map((e) => `era-${e.key}`))
const stale = readdirSync(OUT_DIR).filter((f) => {
  if (f === 'index-search.json') return true
  if (!f.startsWith('era-')) return false
  const base = f.replace(/\.(mjs|json)$/, '')
  return f.endsWith('.json') || !validNames.has(base)
})
for (const f of stale) rmSync(join(OUT_DIR, f))

writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8')
writeFileSync(
  join(OUT_DIR, 'index-search.mjs'),
  `// مولّدة آلياً بواسطة scripts/split-history.mjs — لا تُعدَّل يدوياً.\nexport default ` +
    JSON.stringify(searchIndex) +
    '\n',
  'utf8'
)
const chunkLines = index
  .map((e) => `  ${JSON.stringify(e.key)}: () => import('./era-${e.key}.mjs')`)
  .join(',\n')
writeFileSync(
  join(OUT_DIR, 'chunks.mjs'),
  `// مولّدة آلياً بواسطة scripts/split-history.mjs — لا تُعدَّل يدوياً.\n` +
    `export const HISTORY_TOTAL_COUNT = ${data.length}\n` +
    `export const HISTORY_CHUNKS = {\n${chunkLines},\n}\n`,
  'utf8'
)

console.log(
  `[history] تم تقسيم ${data.length} حدث عبر ${index.length} حقبة ` +
    `→ ${index.length} ملفات era-*.mjs + chunks.mjs + index-search.mjs ` +
    `(${(JSON.stringify(searchIndex).length / 1024).toFixed(0)}KB search index)`
)