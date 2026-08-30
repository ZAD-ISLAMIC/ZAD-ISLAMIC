import React from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { SURAHS } from '../services/quran.mjs'
import { QuranReader } from '../components/quran/QuranReader.jsx'

export default function QuranSurahScreen() {
  const { surahIndex } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const index = Number(surahIndex)
  if (!Number.isInteger(index) || index < 0 || index >= SURAHS.length) return null

  const verseParam = Number(searchParams.get('verse'))
  const initialVerse =
    Number.isInteger(verseParam) && verseParam > 0 ? verseParam : undefined

  return (
    <QuranReader
      key={index}
      surahIndex={index}
      initialVerse={initialVerse}
      onPrev={
        index > 0 ? () => navigate(`/quran/${index - 1}`) : null
      }
      onNext={
        index < SURAHS.length - 1 ? () => navigate(`/quran/${index + 1}`) : null
      }
      onTafseer={(verse) => navigate(`/tafseer/${index + 1}?verse=${verse}`)}
      onCards={(number) => navigate(`/quran-cards/${number}`)}
    />
  )
}