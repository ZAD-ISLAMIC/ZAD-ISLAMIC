import hisnData from '../resources/data/hisnmuslim.json' with { type: 'json' }
import { storage } from './storage.mjs'

export const HISN_DATA = hisnData

export const HISN_NS = 'hisn'

export const PROGRESS_KEY = 'hisn.progress'

export const TASHKEEL_RE = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06dc\u06df-\u06e8\u06ea-\u06ed]/g

/* ------------------------------------------------------------------ *
 * URL helpers — the data ships with http://www.hisnmuslim.com URLs.
 * The WebView serves from https://localhost, so http is blocked as
 * mixed content and Android blocks cleartext by default. HTTPS works
 * (verified) and sidesteps both.
 * ------------------------------------------------------------------ */

export function normalizeHttps(url) {
  const value = String(url || '')
  if (/^https?:\/\//i.test(value)) {
    return value.replace(/^http:\/\//i, 'https://')
  }
  return value
}

export function getCategoryById(id) {
  return HISN_DATA.find((c) => String(c.id) === String(id)) || null
}

export function getItem(categoryId, itemId) {
  const category = getCategoryById(categoryId)
  if (!category) return null
  return category.array.find((i) => String(i.id) === String(itemId)) || null
}

/* ------------------------------------------------------------------ *
 * Arabic-aware search
 * ------------------------------------------------------------------ */

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

export function searchCategories(query) {
  const q = normalizeArabic(query)
  if (!q) return [...HISN_DATA]
  return HISN_DATA.filter((c) => normalizeArabic(c.category).includes(q))
}

/* ------------------------------------------------------------------ *
 * File references — every door and every dhikr maps to one unique
 * remote file (397 in total). `fileName` comes from the source data and
 * doubles as the on-device storage key.
 * ------------------------------------------------------------------ */

export function doorRef(categoryId) {
  const category = getCategoryById(categoryId)
  return {
    ref: `hisn:d:${categoryId}`,
    fileName: category && category.filename ? String(category.filename) : null,
    url: normalizeHttps(category?.audio),
  }
}

export function itemRef(categoryId, itemId) {
  const item = getItem(categoryId, itemId)
  return {
    ref: `hisn:i:${categoryId}:${itemId}`,
    fileName: item && item.filename ? String(item.filename) : null,
    url: normalizeHttps(item?.audio),
  }
}

/** All files belonging to a door: the door audio first, then every dhikr. */
export function doorFiles(categoryId) {
  const category = getCategoryById(categoryId)
  if (!category) return []
  const files = []
  const door = doorRef(categoryId)
  if (door.fileName) files.push(door)
  for (const item of category.array) {
    const ref = itemRef(categoryId, item.id)
    if (ref.fileName) files.push(ref)
  }
  return files
}

export function totalCount(categoryId) {
  const category = getCategoryById(categoryId)
  if (!category) return 0
  return category.array.reduce((sum, item) => sum + (item.count || 1), 0)
}

/* ------------------------------------------------------------------ *
 * Player tracks — the shared player (PlayerBar) understands a
 * `kind: 'hisn'` track that streams from `url` (or the stored file).
 * ------------------------------------------------------------------ */

export function textSnippet(text, max = 28) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max).trim()}…`
}

export function toItemTrack(category, item) {
  const file = itemRef(category.id, item.id)
  return {
    kind: 'hisn',
    name: textSnippet(item.text),
    sub: category.category,
    url: file.url,
    fileName: file.fileName,
    ref: file.ref,
  }
}

export function toDoorTrack(category) {
  const file = doorRef(category.id)
  return {
    kind: 'hisn',
    name: category.category,
    sub: 'حصن المسلم — الباب كاملاً',
    url: file.url,
    fileName: file.fileName,
    ref: file.ref,
  }
}

export function itemTrackList(category) {
  return category.array.map((item) => toItemTrack(category, item))
}

/* ------------------------------------------------------------------ *
 * Sections — the 132 doors are grouped into logical sections by a
 * keyword classifier (first match wins, fallback at the end).
 * ------------------------------------------------------------------ */

export const SECTIONS_ALL = [
  { key: 'day', title: 'أذكار الصباح والمساء', match: /الصباح|المساء/ },
  { key: 'sleep', title: 'الاستيقاظ والنوم والرؤى', match: /الاستيقاظ|النوم|الرؤيا|تقلب ليلا|الوحشة/ },
  { key: 'tahara', title: 'الطهارة', match: /الخلاء|الوضوء/ },
  { key: 'clothes', title: 'اللباس والمنزل', match: /الثوب|ثوب|لبس|المنزل/ },
  { key: 'masjid', title: 'المسجد والأذان', match: /المسجد|الآذان/ },
  { key: 'prayer', title: 'أذكار الصلاة', match: /الاستفتاح|الركوع|السجود|التشهد|بعد السلام|الوتر|الاستخارة|سجود التلاوة|الجلسة/ },
  { key: 'distress', title: 'الهم والكرب والابتلاء', match: /الهم|الحزن|الكرب|مصيبة|استصعب|التعجب|أصيب|أمر/ },
  { key: 'enemy', title: 'الخوف والتحصين', match: /العدو|السلطان|خاف|يعصم/ },
  { key: 'waswasa', title: 'الوسوسة والشيطان', match: /وسوس|الشيطان|الشياطين|وساوس/ },
  { key: 'tawba', title: 'الذنب والاستغفار', match: /أذنب|الذنب|التوبة|الشرك/ },
  { key: 'deen', title: 'الدين والأمانة', match: /الدين|أقرض|القضاء/ },
  { key: 'birth', title: 'المواليد', match: /المولود|المواليد|الأولاد|الولد/ },
  { key: 'sick', title: 'عيادة المرضى', match: /المريض|عياد|يئس|مبتلى|وجع|عين|الجنون/ },
  { key: 'death', title: 'الجنائز', match: /ميت|فرط|المحتضر|التعزية|القبر|دفن|إغماض|زيارة القبور/ },
  { key: 'food', title: 'الطعام والشراب', match: /الطعام|الفطر|الصائم|الشراب|الضيف|الثمر|أفطر|الذبح|النحر/ },
  { key: 'weather', title: 'الطقس والنبات', match: /الريح|الرعد|المطر|الاستسقاء|الاستصحاء/ },
  { key: 'moon', title: 'المواسم الجديدة', match: /الهلال/ },
  { key: 'marriage', title: 'الزواج', match: /متزوج|الزوجة/ },
  { key: 'travel', title: 'السفر', match: /السفر|سفر|مسافر|الركوب|القرية|البلدة|السوق|المركوب/ },
  { key: 'hajj', title: 'الحج والعمرة', match: /الحج|العمرة|المحرم|عرفة|المشعر|الجمار|الركن|الصفا|مروة/ },
  { key: 'tasbih', title: 'الذكر المطلق', match: /التسبيح|التحميد|التهليل|التكبير|الصلاة على النبي|يسبح|الخير والآداب/ },
  { key: 'manners', title: 'السلام والآداب', match: /السلام|المجلس|غفر الله|أحبك في الله|بارك الله|الدجال|الطيرة|الغضب|نباح|صياح|الديك|الكلاب|معروفا|سببته|مدح|زكي|محم|العطاس|عطس|الفزع|عرض عليك ماله/ },
]

export const FALLBACK_SECTION = { key: 'misc', title: 'أدعية متفرقة', match: null }

/** Light fold used by the section classifier: unifies presentation forms
 * (e.g. ﻤﺠلس → مجلس) and strips tashkeel — but keeps ة/أ/آ — so keyword
 * patterns keep matching the vocalized source text. */
export function foldForMatch(text) {
  return String(text || '').normalize('NFKC').replace(TASHKEEL_RE, '')
}

export function sectionFor(categoryName) {
  const name = foldForMatch(categoryName)
  for (const section of SECTIONS_ALL) {
    if (section.match && section.match.test(name)) return section
  }
  return FALLBACK_SECTION
}

export function groupBySections(categories) {
  const list = SECTIONS_ALL.map((s) => ({ ...s, categories: [] }))
  list.push({ ...FALLBACK_SECTION, categories: [] })
  const lookup = new Map(list.map((s) => [s.key, s]))
  for (const category of categories) {
    const section = sectionFor(category.category)
    lookup.get(section.key)?.categories.push(category)
  }
  return list.filter((s) => s.categories.length > 0)
}

/* ------------------------------------------------------------------ *
 * Per-section accent colours (shared with the CSS via --cat-accent)
 * ------------------------------------------------------------------ */

export const SECTION_STYLES = {
  day: '#d4af37',
  sleep: '#b48cff',
  tahara: '#2dd4bf',
  clothes: '#7c9cff',
  masjid: '#ff9d5c',
  prayer: '#4ade80',
  distress: '#f87171',
  enemy: '#fb923c',
  waswasa: '#a78bfa',
  tawba: '#34d399',
  deen: '#f59e0b',
  birth: '#f472b6',
  sick: '#38bdf8',
  death: '#94a3b8',
  food: '#fb7185',
  weather: '#60a5fa',
  moon: '#c084fc',
  marriage: '#ec4899',
  travel: '#fbbf24',
  hajj: '#a3e635',
  tasbih: '#22c55e',
  manners: '#14b8a6',
  misc: '#64748b',
}

export function accentFor(categoryName) {
  const section = sectionFor(categoryName)
  return SECTION_STYLES[section.key] || SECTION_STYLES.misc
}

/* ------------------------------------------------------------------ *
 * Daily progress — per (day, category, item) tap counts so reopening
 * a door shows what was already completed today.
 * ------------------------------------------------------------------ */

export function todayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function getProgress() {
  if (typeof window === 'undefined') return {}
  return storage.get(PROGRESS_KEY, {}) || {}
}

export function saveProgress(progress) {
  if (typeof window === 'undefined') return
  storage.set(PROGRESS_KEY, progress)
}

/** Increment one dhikr's counter for today; returns the new count. */
export function incrementProgress(categoryId, itemId, total) {
  const day = todayKey()
  const progress = getProgress()
  const dayData = progress[day] || {}
  const catData = dayData[categoryId] || {}
  const next = Math.min(Number(catData[itemId] || 0) + 1, Number(total) || 1)
  catData[itemId] = next
  dayData[categoryId] = catData
  progress[day] = dayData
  saveProgress(progress)
  return next
}

/** Reset a single dhikr's counter for today. */
export function resetProgress(categoryId, itemId) {
  const day = todayKey()
  const progress = getProgress()
  const dayData = progress[day] || {}
  const catData = dayData[categoryId]
  if (catData && itemId in catData) {
    delete catData[itemId]
    dayData[categoryId] = catData
    progress[day] = dayData
    saveProgress(progress)
  }
}

/** Undo one tap for a dhikr today; removes the key when it reaches zero. */
export function decrementProgress(categoryId, itemId) {
  const day = todayKey()
  const progress = getProgress()
  const dayData = progress[day] || {}
  const catData = dayData[categoryId]
  if (catData && itemId in catData) {
    const next = Number(catData[itemId] || 0) - 1
    if (next <= 0) {
      delete catData[itemId]
    } else {
      catData[itemId] = next
    }
    dayData[categoryId] = catData
    progress[day] = dayData
    saveProgress(progress)
    return Math.max(next, 0)
  }
  return 0
}

/** Per-item counts for a door today: { itemId: count } */
export function categoryProgress(categoryId) {
  const day = todayKey()
  const dayData = getProgress()[day]
  if (!dayData) return {}
  return dayData[categoryId] || {}
}

/** How many dhikrs of the door were fully repeated today. */
export function completedCount(categoryId) {
  const category = getCategoryById(categoryId)
  if (!category) return 0
  const progress = categoryProgress(categoryId)
  return category.array.filter(
    (item) => (progress[item.id] || 0) >= (item.count || 1)
  ).length
}