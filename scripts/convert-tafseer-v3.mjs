#!/usr/bin/env node
/**
 * يحوّل tafseerMouaser_v03.sql (إصدار مجمع الملك فهد 3.0) إلى
 * src/resources/data/tafseerMouaser.json بنفس بنية الملف السابق.
 *
 * التشغيل: npm run convert:tafseer
 */
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = '/home/rn0x/المستندات/hafs_tafseerMouaser_v3/hafs_tafseerMouaser_v3_data/tafseerMouaser_v03.sql'
const OUT = join(ROOT, 'src', 'resources', 'data', 'tafseerMouaser.json')

const sql = readFileSync(SRC, 'utf8')

const COLS = [
  'id', 'jozz', 'page', 'sura_no', 'sura_name_en', 'sura_name_ar',
  'line_start', 'line_end', 'aya_no', 'aya_text', 'aya_text_emlaey', 'aya_tafseer',
]

function unescapeSqlValue(raw) {
  // يفك هروبات MySQL: \\ → \ ، \' → ' ، \n → newline إلخ.
  return raw.replace(/\\(.)/g, (m, c) => {
    switch (c) {
      case '0': return '\0'
      case 'n': return '\n'
      case 'r': return '\r'
      case 'b': return '\b'
      case 't': return '\t'
      case 'Z': return '\u001a'
      default: return c
    }
  })
}

/** يقرأ قيمة مفردة من sql ابتداءً من i. يرجع [text, nextIndex, isNull]. */
function readValue(sql, i) {
  if (sql[i] === "'") {
    let j = i + 1
    let out = ''
    while (j < sql.length) {
      const ch = sql[j]
      if (ch === '\\') {
        out += '\\' + sql[j + 1]
        j += 2
        continue
      }
      if (ch === "'") {
        return [unescapeSqlValue(out), j + 1, false]
      }
      out += ch
      j++
    }
    throw new Error('قيمة غير مغلقة في الموقع ' + i)
  }
  // أرقام أو NULL
  let j = i
  while (j < sql.length && /[0-9.]/.test(sql[j])) j++
  const tok = sql.slice(i, j)
  return [tok, j, tok.toLowerCase() === 'null']
}

/** يقرأ صفاً كاملاً داخل قوسين (...) ويبني سجلاً. */
function readRow(sql, i) {
  // i عند موضع '('
  if (sql[i] !== '(') throw new Error('توقّع قوس افتتاح في ' + i)
  i++
  const values = []
  while (i < sql.length) {
    // تخطي الفراغات
    while (sql[i] === ' ' || sql[i] === '\n' || sql[i] === '\t' || sql[i] === '\r') i++
    if (sql[i] === "'" || /[0-9Nn]/.test(sql[i])) {
      const [v, next] = readValue(sql, i)
      values.push(v)
      i = next
    } else if (sql[i] === ')') {
      i++
      break
    } else if (sql[i] === ',') {
      i++
      continue
    } else {
      throw new Error('رمز غير متوقّع في ' + i + ': ' + JSON.stringify(sql[i]))
    }
  }
  if (values.length !== COLS.length) {
    throw new Error('عدد الأعمدة غير مطابق: ' + values.length)
  }
  const record = {}
  COLS.forEach((c, k) => { record[c] = values[k] })
  return [record, i]
}

const records = []
let i = sql.indexOf('INSERT INTO')
while (i !== -1 && i < sql.length) {
  const vi = sql.indexOf('VALUES', i)
  if (vi === -1) throw new Error('INSERT بدون VALUES عند ' + i)
  const p = sql.indexOf('(', vi)
  if (p === -1) throw new Error('INSERT بدون صفوف عند ' + i)
  const [rec] = readRow(sql, p)
  records.push(rec)
  i = sql.indexOf('INSERT INTO', i + 1)
}

console.log('سجلات', records.length)
if (records.length !== 6236) throw new Error('عدد السجلات غير المتوقع: ' + records.length)

// تنظيف نص الآية والتفسير من رموز الزخرفة وحشوات المسافات (مطابق لتقسيم الشظايا).
const PRESENTATION_RE = /[\uFB50-\uFDFF\uFE70-\uFEFF]/g
function cleanAyaText(text) {
  return String(text)
    .replace(PRESENTATION_RE, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}
function cleanTafseer(text) {
  return String(text)
    .replace(/<span[^>]*>/g, '')
    .replace(/<\/span>/g, '')
    .replace(/[\uFD60\uFD61]/g, '')
    .replace(/[\u200A\u202F\u00A0\u200B\u200E\u200F]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

// تحويل قيم رقمية إلى نصوص مطابقة للملف القديم (مع تنظيف الآيات والتفسير).
const recordsOut = records.map((r) => {
  const out = {}
  for (const k of COLS) out[k] = String(r[k])
  out.aya_text = cleanAyaText(out.aya_text)
  out.aya_tafseer = cleanTafseer(out.aya_tafseer)
  return out
})

writeFileSync(OUT, JSON.stringify(recordsOut) + '\n', 'utf8')
console.log('[tafseer] كُتب → src/resources/data/tafseerMouaser.json (' + OUT + ')')