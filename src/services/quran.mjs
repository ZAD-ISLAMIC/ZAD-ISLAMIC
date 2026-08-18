import quranData from '../resources/data/quran.json' with { type: 'json' }
import { arabicDigits } from '../utils/arabic.mjs'

export const SURAHS = quranData

export const BASMALA = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'

const SURAH_1_CANONICAL = [
  BASMALA,
  'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ',
  'الرَّحْمَنِ الرَّحِيمِ',
  'مَالِكِ يَوْمِ الدِّينِ',
  'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ',
  'اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ',
  'صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ',
]

export const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

export { arabicDigits }

const VERSE_MARKER = /\((\d{1,3})\)/

export function parseSurah(index) {
  const surah = SURAHS[index]

  // The corpus strips the basmala of Al-Fatiha — which is its numbered
  // verse 1 — so it is rebuilt from the canonical seven verses.
  if (index === 0) {
    return {
      ...surah,
      index,
      verses: SURAH_1_CANONICAL.map((text, i) => ({ number: i + 1, text })),
    }
  }

  const segments = surah.Surah.split(VERSE_MARKER)

  // The leading segment is always verse 1 (in Al-Fatiha its marker is omitted,
  // elsewhere a (1) follows it). Each marker (N) closes verse N, so the segment
  // at even index i is verse (i / 2) + 1; the trailing fragment after the last
  // marker is an empty string and must be skipped.
  const verses = []
  for (let i = 0; i < segments.length; i += 2) {
    const text = (segments[i] ?? '').trim()
    if (!text) continue
    const number = i / 2 + 1
    const tag = segments[i - 1]
    if (tag && tag !== String(number - 1) && tag !== String(number)) {
      console.warn(
        `quran: سورة ${surah.Name} — رقم الآية ${number} لا يطابق الوسم (${tag})`
      )
    }
    verses.push({ number, text })
  }

  if (verses.length !== surah.Number_Verses) {
    console.warn(
      `quran: سورة ${surah.Name} — توقّع ${surah.Number_Verses} آية، حصل ${verses.length}`
    )
  }

  return { ...surah, index, verses }
}

export function hasBasmala(index) {
  // Al-Fatiha: the basmala is its numbered verse 1 (rendered inline).
  // At-Tawbah (index 8): no basmala at all.
  return index !== 0 && index !== 8
}