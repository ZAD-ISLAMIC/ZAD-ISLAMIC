import React from 'react'
import { useNavigate } from 'react-router-dom'
import { storage } from '../services/storage.mjs'
import { QuranSurahList } from '../components/quran/QuranSurahList.jsx'

const READING_KEY = 'quran.reading'

export default function QuranScreen() {
  const navigate = useNavigate()

  return (
    <QuranSurahList
      reading={storage.get(READING_KEY)}
      onOpen={(index, verse) =>
        navigate(verse ? `/quran/${index}?verse=${verse}` : `/quran/${index}`)
      }
    />
  )
}