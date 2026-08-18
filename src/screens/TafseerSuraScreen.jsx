import React, { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getSurahByNo, loadSurah } from '../services/tafseer.mjs'
import { Loader } from '../components/ui/Loader.jsx'
import { Icon } from '../components/ui/Icon.jsx'
import { TafseerSuraReader } from '../components/tafseer/TafseerSuraReader.jsx'

function scrollToTop() {
  const el = document.querySelector('.shell__main')
  if (el) el.scrollTop = 0
}

export default function TafseerSuraScreen() {
  const { surahIndex } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const n = Number(surahIndex)
  const surah = getSurahByNo(n)

  const verseParam = Number(searchParams.get('verse'))
  const initialVerse =
    Number.isInteger(verseParam) && verseParam > 0 ? verseParam : undefined

  const [records, setRecords] = useState(null)
  const [status, setStatus] = useState('loading')
  const [, force] = useState(0)

  useEffect(() => {
    let alive = true
    setStatus('loading')
    setRecords(null)
    loadSurah(n)
      .then((data) => {
        if (!alive) return
        if (!data) {
          setStatus('error')
          return
        }
        setRecords(data)
        setStatus('ready')
      })
      .catch(() => {
        if (alive) setStatus('error')
      })
    return () => {
      alive = false
    }
  }, [n])

  useEffect(() => {
    if (!initialVerse) scrollToTop()
  }, [n, initialVerse])

  if (status === 'loading') {
    return (
      <section className="tafseer-sura-screen">
        <Loader label="جارِ تحميل التفسير…" />
      </section>
    )
  }

  if (status === 'error' || !surah || !records) {
    return (
      <section className="tafseer-sura-screen">
        <div className="fat-cat-screen__error">
          <Icon name="alert" size={20} />
          تعذّر تحميل تفسير هذه السورة
          <button onClick={() => navigate('/tafseer')}>
            العودة للتفسير
          </button>
        </div>
      </section>
    )
  }

  const prevSurah = getSurahByNo(n - 1)
  const nextSurah = getSurahByNo(n + 1)

  return (
    <section className="tafseer-sura-screen">
      <TafseerSuraReader
        key={n}
        surah={surah}
        records={records}
        initialVerse={initialVerse}
        onPrev={prevSurah ? () => navigate(`/tafseer/${prevSurah.n}`) : null}
        onNext={nextSurah ? () => navigate(`/tafseer/${nextSurah.n}`) : null}
        onOpenMushaf={(verse) => navigate(`/quran/${n - 1}?verse=${verse}`)}
      />
    </section>
  )
}