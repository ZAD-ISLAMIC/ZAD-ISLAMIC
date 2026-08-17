/**
 * Gregorian → Hijri (Umm al-Qura) via the ECMA‑402 Islamic calendar.
 *
 * `Intl` ships a full Umm al‑Qura calendar table in every modern engine
 * (JSCore/V8 — which covers both iOS and the Android WebView), so we get
 * the exact official Sadhi date used by prayer apps — fully local, no
 * network, no drift. We only read the date parts and re-render them with
 * Arabic month names ourselves.
 */
import { arabicDigits } from './arabic.mjs'

const MONTHS_AR = [
  'محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر',
  'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان',
  'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة',
]

const uq = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

const uqParts = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', {
  month: 'long',
})

function parts(date) {
  const out = {}
  for (const p of uq.formatToParts(date)) out[p.type] = p.value
  return out
}

/**
 * @returns { { y:number, m:number, d:number, label:string, monthAr:string } }
 */
export function toHijri(date) {
  const p = parts(date)
  const y = Number(p.year)
  const m = Number(p.month)
  const d = Number(p.day)
  const monthAr = MONTHS_AR[Math.max(1, Math.min(12, m)) - 1]
  return { y, m, d, monthAr, label: `${d} ${monthAr} ${y} هـ` }
}

/** e.g. "15 رمضان 1445 هـ" */
export function formatHijri(date, withArabicDigits = true) {
  const h = toHijri(date)
  const day = withArabicDigits ? arabicDigits(h.d) : String(h.d)
  const year = withArabicDigits ? arabicDigits(h.y) : String(h.y)
  return `${day} ${h.monthAr} ${year} هـ`
}

/** Numeric short form, e.g. "1445/9/15" (used by the native notification). */
export function formatHijriShort(date) {
  const h = toHijri(date)
  return `${h.y}/${h.m}/${h.d}`
}