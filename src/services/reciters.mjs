import mp3quranData from '../resources/data/mp3quran.json'
import { SURAH_META } from './surahsMeta.mjs'

const TASHKEEL =
  /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06dc\u06df-\u06e8\u06ea-\u06ed]/g

const ARABIC_COLLATOR = new Intl.Collator('ar', {
  sensitivity: 'base',
  ignorePunctuation: true,
})

function normalizeArabic(text) {
  return String(text)
    .replace(TASHKEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function sortKeyFor(name) {
  return normalizeArabic(String(name).replace(/^ال/, ''))
}

function parseSurahs(raw) {
  return String(raw || '')
    .split(',')
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 114)
}

const RAW_RECITERS = mp3quranData.map((item) => ({
  id: item.id,
  name: String(item.name || '').trim(),
  rewaya: String(item.rewaya || '').trim(),
  server: String(item.Server || '').trim(),
  count: Number(item.count) || 0,
  suras: parseSurahs(item.suras),
}))

export const RECITERS = RAW_RECITERS.filter(
  (r) => r.name && r.server && r.suras.length > 0
).sort((a, b) => ARABIC_COLLATOR.compare(sortKeyFor(a.name), sortKeyFor(b.name)))

export const RECITER_BY_ID = new Map(RECITERS.map((r) => [r.id, r]))

export function getReciter(id) {
  return RECITER_BY_ID.get(id) || null
}

export function audioUrl(reciter, surahNumber) {
  const base = reciter.server.replace(/\/+$/, '')
  return `${base}/${String(surahNumber).padStart(3, '0')}.mp3`
}

export function surahNameOf(number) {
  return SURAH_META[number - 1]?.name || ''
}

export function surahMetaOf(number) {
  const s = SURAH_META[number - 1]
  return s ? `${s.desc} • ${s.v} آية` : ''
}

// Normalized first letter used for alphabetical grouping (أ/إ/آ → ا).
export function firstLetterFor(name) {
  const c = String(name).trim().charAt(0) || '؟'
  const n = normalizeArabic(c)
  if (n === 'ا') return 'ا'
  return c
}

export function searchReciters(query) {
  const q = normalizeArabic(query)
  if (!q) return RECITERS
  return RECITERS.filter((r) => {
    if (normalizeArabic(r.name).includes(q)) return true
    if (normalizeArabic(r.rewaya).includes(q)) return true
    return normalizeArabic(r.name)
      .split(' ')
      .some((word) => word.startsWith(q))
  })
}

export function groupByLetter(reciters) {
  const map = new Map()
  for (const reciter of reciters) {
    const letter = firstLetterFor(reciter.name)
    if (!map.has(letter)) map.set(letter, [])
    map.get(letter).push(reciter)
  }
  return [...map.entries()]
}

export function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0'
  const units = ['بايت', 'ك.ب', 'م.ب', 'ج.ب']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = unit === 0 ? String(Math.round(value)) : value.toFixed(1)
  return `${digits} ${units[unit]}`
}