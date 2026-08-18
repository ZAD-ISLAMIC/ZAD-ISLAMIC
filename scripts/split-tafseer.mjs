#!/usr/bin/env node
/**
 * يقسم tafseerMouaser.json إلى شظايا حسب السورة + فهرس + فهرس بحث.
 * النتائج (تحت src/resources/data/tafseer/):
 *   index.json           — [{ n, name, nameAr, descent, verses, jozz, pages }] (استيراد ثابت)
 *   sura-<n>.mjs         — سجلات السورة كاملة كوحدة JS (تحميل لازي عند الدخول)
 *   index-search.mjs     — [{ id, s, a, at, dt }] للبحث العام (تحميل لازي)
 *   chunks.mjs           — خريطة أرقام السور → لوادر ثابتة (Vite + Node)
 *
 * التشغيل: npm run gen:tafseer
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(ROOT, 'src', 'resources', 'data')
const OUT_DIR = join(DATA_DIR, 'tafseer')

mkdirSync(OUT_DIR, { recursive: true })

const raw = JSON.parse(readFileSync(join(DATA_DIR, 'tafseerMouaser.json'), 'utf8').replace(/^\uFEFF/, ''))
if (!Array.isArray(raw)) throw new Error('tafseerMouaser.json ليس مصفوفة')

const quran = JSON.parse(readFileSync(join(DATA_DIR, 'quran.json'), 'utf8').replace(/^\uFEFF/, ''))
if (!Array.isArray(quran)) throw new Error('quran.json ليس مصفوفة')

/** تطبيع عربي للبحث/المطابقة (مطابق للنمط في services). */
const TASHKEEL_RE =
  /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06dc\u06df-\u06e8\u06ea-\u06ed]/g
function normalizeArabic(text) {
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

/** أشكال العرض العربية (وسوم نهاية الآية والتزيين) — يُحذف من نصوص الآيات. */
const PRESENTATION_RE = /[\uFB50-\uFDFF\uFE70-\uFEFF]/g

/** ينظّف نص الآية (يزيل وسم نهاية الآية المُلوّن و NBSP). */
function cleanAyaText(text) {
  return String(text)
    .replace(PRESENTATION_RE, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/** ينظّف نص التفسير (يحذف وسوم <span> وعلامتي ﵡ ﵠ والمسافات الرفيعة). */
function cleanTafseer(text) {
  return String(text)
    .replace(/<span[^>]*>/g, '')
    .replace(/<\/span>/g, '')
    .replace(/[\uFD60\uFD61]/g, '')
    .replace(/[\u200A\u202F\u00A0\u200B\u200E\u200F]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

// تجميع السجلات حسب رقم السورة (1-114) مع مراقبة تسلسل أرقام الآيات.
const bySura = new Map()
for (const record of raw) {
  const n = Number(record.sura_no)
  if (!Number.isInteger(n) || n < 1 || n > quran.length) {
    throw new Error(`سجل مع رقم سورة خارج النطاق: ${n}`)
  }
  if (!bySura.has(n)) bySura.set(n, [])
  bySura.get(n).push(record)
}

const index = []
const searchIndex = []

for (let n = 1; n <= quran.length; n++) {
  const records = bySura.get(n) || []
  records.sort((a, b) => Number(a.aya_no) - Number(b.aya_no))

  const expected = quran[n - 1]?.Number_Verses
  if (records.length !== expected) {
    throw new Error(
      `سورة ${n} «${quran[n - 1]?.Name}» — توقّع ${expected} آية، حصل ${records.length}`
    )
  }
  for (let a = 1; a <= records.length; a++) {
    if (Number(records[a - 1].aya_no) !== a) {
      throw new Error(
        `سورة ${n} — الآية رقم ${records[a - 1].aya_no} في الموضع ${a} غير متسلسلة`
      )
    }
  }

  const jozz = [...new Set(records.map((r) => Number(r.jozz)))].sort((x, y) => x - y)
  const pages = [...new Set(records.map((r) => Number(r.page)))].sort((x, y) => x - y)

  const q = quran[n - 1]
  index.push({
    n,
    name: String(q.Name || '').trim(),
    nameAr: String(records[0].sura_name_ar || q.Name || '').trim(),
    descent: String(q.Descent || '').trim(),
    verses: records.length,
    jozz: [jozz[0], jozz[jozz.length - 1]],
    pages: [pages[0], pages[pages.length - 1]],
  })

  writeFileSync(
    join(OUT_DIR, `sura-${n}.mjs`),
    `// مولّدة آلياً بواسطة scripts/split-tafseer.mjs — لا تُعدَّل يدوياً.\nexport default ` +
      JSON.stringify(records.map((r) => ({ ...r, aya_text: cleanAyaText(r.aya_text), aya_tafseer: cleanTafseer(r.aya_tafseer) }))) +
      '\n',
    'utf8'
  )

  for (const r of records) {
    searchIndex.push({
      id: r.id,
      s: Number(r.sura_no),
      a: Number(r.aya_no),
      at: normalizeArabic(cleanAyaText(r.aya_text_emlaey || r.aya_text)),
      dt: normalizeArabic(cleanTafseer(r.aya_tafseer)),
    })
  }
}

// تنظيف ملفات مُولّدة قديمة.
const validNames = new Set(index.map((e) => `sura-${e.n}`))
const stale = readdirSync(OUT_DIR).filter((f) => {
  if (!f.startsWith('sura-')) return false
  const base = f.replace(/\.(mjs|json)$/, '')
  return f.endsWith('.json') || !validNames.has(base)
})
for (const f of stale) rmSync(join(OUT_DIR, f))

writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8')
writeFileSync(
  join(OUT_DIR, 'index-search.mjs'),
  `// مولّدة آلياً بواسطة scripts/split-tafseer.mjs — لا تُعدَّل يدوياً.\nexport default ` +
    JSON.stringify(searchIndex) +
    '\n',
  'utf8'
)

const chunkLines = index
  .map((e) => `  ${e.n}: () => import('./sura-${e.n}.mjs')`)
  .join(',\n')
writeFileSync(
  join(OUT_DIR, 'chunks.mjs'),
  `// مولّدة آلياً بواسطة scripts/split-tafseer.mjs — لا تُعدَّل يدوياً.\n` +
    `export const TAFSEER_TOTAL = ${raw.length}\n` +
    `export const TAFSEER_CHUNKS = {\n${chunkLines},\n}\n`,
  'utf8'
)

console.log(
  `[tafseer] تم تقسيم ${raw.length} آية عبر ${index.length} سورة ` +
    `→ ${index.length} ملفات sura-*.mjs + chunks.mjs + index-search.mjs ` +
    `(${(JSON.stringify(searchIndex).length / 1024).toFixed(0)}KB search index)`
)