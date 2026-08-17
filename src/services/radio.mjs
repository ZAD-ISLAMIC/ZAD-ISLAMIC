import radioData from '../resources/data/radio.json' with { type: 'json' }

const TASHKEEL =
  /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06dc\u06df-\u06e8\u06ea-\u06ed]/g

const ARABIC_COLLATOR = new Intl.Collator('ar', {
  sensitivity: 'base',
  ignorePunctuation: true,
})

export const CATEGORY_STYLES = {
  'أحاديث وسيرة': { accent: '#d4af37', icon: 'book' },
  'أذكار ورقية': { accent: '#4ade80', icon: 'beads' },
  'إذاعات القراء': { accent: '#2dd4bf', icon: 'mic' },
  'إذاعات رسمية': { accent: '#7c9cff', icon: 'radio' },
  'تفسير وعلوم القرآن': { accent: '#b48cff', icon: 'book' },
  'منوعات إسلامية': { accent: '#ff9d5c', icon: 'circle-dot' },
}

export const DEFAULT_ACCENT = '#10b981'
export const DEFAULT_ICON = 'radio'

const HLS_RE = /\.m3u8(\?|#|$)/i
const HTTP_RE = /^http:\/\//i

export function normalizeArabic(text) {
  return String(text)
    .replace(TASHKEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function cleanRaw(item) {
  const name = String(item?.name || '').trim()
  const link = String(item?.link || '').trim()
  if (!name || !link) return null
  const category = String(item?.category || 'منوعات إسلامية').trim() || 'منوعات إسلامية'
  return {
    id: Number(item.id) || -1,
    name,
    link,
    category,
    hls: HLS_RE.test(link),
    insecure: HTTP_RE.test(link),
  }
}

const RAW_STATIONS = (Array.isArray(radioData) ? radioData : [])
  .map(cleanRaw)
  .filter(Boolean)

function stationKey(link) {
  return link
}

export const RADIO_STATIONS = RAW_STATIONS
  .filter((s) => s.id >= 0)
  .sort((a, b) => {
    const byCategory = ARABIC_COLLATOR.compare(a.category, b.category)
    if (byCategory !== 0) return byCategory
    return ARABIC_COLLATOR.compare(a.name, b.name)
  })

export const RADIO_BY_ID = new Map(RADIO_STATIONS.map((s) => [s.id, s]))
export const RADIO_BY_LINK = new Map(
  RADIO_STATIONS.map((s) => [stationKey(s.link), s])
)

export function getCategories() {
  const order = Object.keys(CATEGORY_STYLES)
  const groups = new Map()
  for (const station of RADIO_STATIONS) {
    if (!groups.has(station.category)) {
      groups.set(station.category, { key: station.category, count: 0 })
    }
    groups.get(station.category).count += 1
  }
  return [...groups.values()].sort(
    (a, b) => order.indexOf(a.key) - order.indexOf(b.key)
  )
}

export function getCategoryStyle(category) {
  return CATEGORY_STYLES[category] || {}
}

export function stationById(id) {
  return RADIO_BY_ID.get(Number(id)) || null
}

export function searchStations(query, category = '') {
  const q = normalizeArabic(query)
  let list = RADIO_STATIONS
  if (category) list = list.filter((s) => s.category === category)
  if (!q) return list
  return list.filter(
    (s) =>
      normalizeArabic(s.name).includes(q) ||
      normalizeArabic(s.category).includes(q) ||
      normalizeArabic(s.name)
        .split(' ')
        .some((word) => word.startsWith(q))
  )
}

export function toRadioTrack(station) {
  return {
    kind: 'radio',
    id: station.id,
    name: station.name,
    url: station.link,
    category: station.category,
    hls: station.hls,
    insecure: station.insecure,
  }
}

export function stationSupportNote(station) {
  if (station.insecure)
    return 'هذه الإذاعة تُبث عبر اتصال غير آمن (http) وقد لا تعمل على بعض الأجهزة'
  if (station.hls)
    return 'هذه الإذاعة تصدر بصيغة HLS وقد لا يدعمها المشغّل المدمج'
  return ''
}