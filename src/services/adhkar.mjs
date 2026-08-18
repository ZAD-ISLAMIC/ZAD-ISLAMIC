import azkarData from '../resources/data/azkar.json' with { type: 'json' }
import { storage } from './storage.mjs'
import { arabicDigits } from './quran.mjs'

import aAudioAstaghfir from '../resources/audio/أذكار/أستغفر_الله.mp3'
import aAudioAooth from '../resources/audio/أذكار/أعوذ_بكلمات_الله.mp3'
import aAudioBaqiyat from '../resources/audio/أذكار/الباقيات_الصالحات.mp3'
import aAudioAllahummaAntaRabi from '../resources/audio/أذكار/اللهم_انت_ربي.mp3'
import aAudioHasbiAllah from '../resources/audio/أذكار/حسبي_الله.mp3'
import aAudioIkhlas from '../resources/audio/أذكار/الناس_الفلق_الإخلاص.mp3'
import aAudioRadeet from '../resources/audio/أذكار/رضيت_بالله_ربا.mp3'
import aAudioSalatNabi from '../resources/audio/أذكار/ذكر_الصلاة_علي_النبي.mp3'
import aAudioSubhanAllah from '../resources/audio/أذكار/سبحان_الله_وبحمده.mp3'
import aAudioSubhanak from '../resources/audio/أذكار/سبحانك_اللهم_وبحمدك.mp3'
import aAudioIlmNaf3 from '../resources/audio/أذكار/اللهم_إني_اسألك_علما_نافعا.mp3'
import aAudioLaIlaha from '../resources/audio/أذكار/لا_إله_إلا_الله.mp3'

export const AZKAR_DATA = azkarData

export const STATS_KEY = 'adhkar.stats'

export const CATEGORY_STYLES = {
  morning: { accent: '#d4af37', label: 'الفجر', colorVar: '--cat-morning' },
  evening: { accent: '#7c9cff', label: 'المساء', colorVar: '--cat-evening' },
  sleeping: { accent: '#b48cff', label: 'النوم', colorVar: '--cat-sleeping' },
  food: { accent: '#ff9d5c', label: 'الطعام', colorVar: '--cat-food' },
  prayer: { accent: '#2dd4bf', label: 'بعد الصلاة', colorVar: '--cat-prayer' },
  tasbih: { accent: '#4ade80', label: 'التسبيح', colorVar: '--cat-tasbih' },
}

const AUDIO_RULES = [
  { re: /حسبي الله/, src: aAudioHasbiAllah, label: 'حسبي الله' },
  { re: /اللهم أنت ربي/, src: aAudioAllahummaAntaRabi, label: 'اللهم أنت ربي' },
  { re: /رضيت بالله/, src: aAudioRadeet, label: 'رضيت بالله ربا' },
  { re: /سورة (الإخلاص|الفلق|الناس)/, src: aAudioIkhlas, label: 'الإخلاص والمعوذتين' },
  { re: /الإخلاص و المعوذتين/, src: aAudioIkhlas, label: 'الإخلاص والمعوذتين' },
  { re: /أعوذ بكلمات الله/, src: aAudioAooth, label: 'أعوذ بكلمات الله' },
  { re: /اللهم إني أسألك علما/, src: aAudioIlmNaf3, label: 'اللهم إني أسألك علما نافعا' },
  { re: /سبحانك اللهم وبحمدك/, src: aAudioSubhanak, label: 'سبحانك اللهم وبحمدك' },
  { re: /أستغفر الله/, src: aAudioAstaghfir, label: 'أستغفر الله' },
  { re: /سبحان الله وبحمده/, src: aAudioSubhanAllah, label: 'سبحان الله وبحمده' },
  { re: /لا إله إلا الله/, src: aAudioLaIlaha, label: 'لا إله إلا الله' },
  { re: /الباقيات الصالحات/, src: aAudioBaqiyat, label: 'الباقيات الصالحات' },
  { re: /صلِّ? وسلم وبارك على نبينا محمد/, src: aAudioSalatNabi, label: 'الصلاة على النبي' },
  { re: /اللهم صل وسلم/, src: aAudioSalatNabi, label: 'الصلاة على النبي' },
]

export function findAudio(title) {
  for (const rule of AUDIO_RULES) {
    if (rule.re.test(title)) return rule
  }
  return null
}

export function getCategory(key) {
  return AZKAR_DATA.find((c) => c.key === key) || null
}

export function getItem(categoryKey, itemId) {
  const category = getCategory(categoryKey)
  if (!category) return null
  return category.array.find((i) => String(i.id) === String(itemId)) || null
}

function todayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isSameMonth(date, y, m) {
  return date.getFullYear() === y && date.getMonth() === m
}

export function recordCompletion(categoryKey, itemId) {
  const stats = storage.get(STATS_KEY, {})
  const day = todayKey()
  const daily = stats[day] || {}
  daily[categoryKey] = (daily[categoryKey] || 0) + 1
  stats[day] = daily
  storage.set(STATS_KEY, stats)
}

export function computeStats() {
  const stats = storage.get(STATS_KEY, {})
  const now = new Date()
  const today = todayKey(now)
  const y = now.getFullYear()
  const m = now.getMonth()

  let todayCount = 0
  let weekCount = 0
  let monthCount = 0
  let yearCount = 0
  let totalCount = 0
  const byCategory = {}
  const dayEntries = []

  for (const [day, cats] of Object.entries(stats)) {
    let dayTotal = 0
    for (const cat of Object.values(cats)) dayTotal += cat
    if (dayTotal === 0) continue

    const d = new Date(`${day}T12:00:00`)
    if (Number.isNaN(d.getTime())) continue

    totalCount += dayTotal
    dayEntries.push({ day, count: dayTotal, date: d })

    if (day === today) todayCount = dayTotal
    const diffDays = Math.floor((now - d) / 86400000)
    if (diffDays >= 0 && diffDays < 7) weekCount += dayTotal
    if (isSameMonth(d, y, m)) {
      monthCount += dayTotal
      for (const [cat, count] of Object.entries(cats)) {
        byCategory[cat] = (byCategory[cat] || 0) + count
      }
    }
    if (d.getFullYear() === y) yearCount += dayTotal
  }

  dayEntries.sort((a, b) => a.day.localeCompare(b.day))
  const recentDays = dayEntries.slice(-14).reverse()

  let streak = 0
  const cursor = new Date(now)
  const todayHasCount = dayEntries.some((e) => e.day === today)
  if (todayHasCount) {
    streak = 1
    cursor.setDate(cursor.getDate() - 1)
  }
  while (dayEntries.some((e) => e.day === todayKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  return {
    today: todayCount,
    week: weekCount,
    month: monthCount,
    year: yearCount,
    total: totalCount,
    streak,
    byCategory,
    recentDays,
  }
}

export function formatCount(count) {
  return arabicDigits(count)
}

export const CATEGORY_ICONS = {
  morning: 'sun',
  evening: 'moon',
  sleeping: 'bed',
  food: 'restaurant',
  prayer: 'landmark',
  tasbih: 'circle-dot',
}
