import quranCardsData from '../resources/data/albitaqat_quran/quran_cards.json' with { type: 'json' }
import quranCardsFullData from '../resources/data/albitaqat_quran/quran_cards_full.json' with { type: 'json' }

export const QURAN_CARDS_NS = 'quran-cards'

const CARDS = quranCardsData.surahs
const CARDS_FULL = quranCardsFullData.surahs

const BY_NUMBER = new Map(CARDS.map((c) => [c.number, c]))
const FULL_BY_NUMBER = new Map(CARDS_FULL.map((c) => [c.number, c]))

const TASHKEEL_RE = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06dc\u06df-\u06e8\u06ea-\u06ed]/g

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

export function getAllCards() {
  return CARDS
}

export function getCardByNumber(number) {
  return BY_NUMBER.get(Number(number)) || null
}

export function getFullCardByNumber(number) {
  return FULL_BY_NUMBER.get(Number(number)) || null
}

export function searchCards(query) {
  const q = normalizeArabic(query)
  if (!q) return [...CARDS]
  return CARDS.filter(
    (c) =>
      normalizeArabic(c.name_arabic).includes(q) ||
      normalizeArabic(c.name_english).includes(q) ||
      String(c.number).includes(q)
  )
}

export function cardAudioUrl(number) {
  const full = getFullCardByNumber(number)
  return full?.downloads?.audio?.url || null
}

export function cardAudioFileName(number) {
  const full = getFullCardByNumber(number)
  return full?.downloads?.audio?.filename || null
}

export function cardPdfUrl(number) {
  const full = getFullCardByNumber(number)
  return full?.downloads?.pdf?.url || null
}

export function cardPdfFileName(number) {
  const full = getFullCardByNumber(number)
  return full?.downloads?.pdf?.filename || null
}

export function cardYouTube(number) {
  const full = getFullCardByNumber(number)
  return full?.downloads?.youtube_video || null
}

export function cardSections(card) {
  if (!card?.card_data) return []
  const order = [
    'ayahs_count',
    'name_meaning',
    'name_reason',
    'other_names',
    'general_purpose',
    'revelation_reason',
    'virtue',
    'occasions',
  ]
  return order.filter((k) => card.card_data[k]).map((k) => card.card_data[k])
}

export function trackForAudio(number) {
  const card = getCardByNumber(number)
  if (!card) return null
  const url = cardAudioUrl(number)
  const fileName = cardAudioFileName(number)
  if (!url || !fileName) return null
  return {
    kind: 'quranCard',
    number: card.number,
    name: card.name_arabic,
    nameEnglish: card.name_english,
    url,
    fileName,
  }
}
