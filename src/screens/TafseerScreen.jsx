import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchTafseer, TAFSEER_SURAHS } from '../services/tafseer.mjs'
import { arabicDigits } from '../utils/arabic.mjs'
import { Icon } from '../components/ui/Icon.jsx'
import { TafseerHero } from '../components/tafseer/TafseerHero.jsx'
import { TafseerSurahList } from '../components/tafseer/TafseerSurahList.jsx'

const SURA_BY_NO = new Map(TAFSEER_SURAHS.map((s) => [s.n, s]))

export default function TafseerScreen() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const searchTimer = useRef(null)

  const trimmed = query.trim()

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (trimmed.length < 2) {
      setResults(null)
      setSearching(false)
      setError(null)
      return undefined
    }
    setSearching(true)
    setError(null)
    searchTimer.current = setTimeout(async () => {
      try {
        const found = await searchTafseer(trimmed)
        setResults(found)
      } catch {
        setError(true)
      } finally {
        setSearching(false)
      }
    }, 260)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [trimmed, attempt])

  const isSearching = trimmed.length >= 2

  const surahHits = useMemo(() => {
    if (!isSearching) return []
    const q = trimmed
    const numeric = parseInt(q, 10)
    return TAFSEER_SURAHS.filter(
      (s) =>
        s.nameAr.includes(q) ||
        s.name.includes(q) ||
        s.nameAr.toLowerCase().includes(q.toLowerCase()) ||
        s.n === numeric
    )
  }, [isSearching, trimmed])

  const openSurah = (n, verse) =>
    navigate(verse ? `/tafseer/${n}?verse=${verse}` : `/tafseer/${n}`)

  return (
    <section className="tafseer-screen">
      <TafseerHero />

      <label className="fat-search">
        <Icon name="search" size={18} />
        <input
          type="search"
          enterKeyHint="search"
          placeholder="ابحث في ٦٢٣٦ آية وتفسيرها عن كلمة…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="بحث في نصوص الآيات والتفسير"
        />
        {trimmed && (
          <button
            className="fat-search__clear"
            aria-label="مسح البحث"
            onClick={() => setQuery('')}
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </label>

      {isSearching ? (
        <div className="fat-search-results">
          {surahHits.length > 0 && (
            <>
              <p className="fat-search-results__count">
                سور — {arabicDigits(surahHits.length)}
              </p>
              <ul className="quran-list">
                {surahHits.map((s) => (
                  <li key={s.n}>
                    <button className="quran-item" onClick={() => openSurah(s.n)}>
                      <span className="quran-item__number">{arabicDigits(s.n)}</span>
                      <span className="quran-item__body">
                        <span className="quran-item__name">{s.nameAr}</span>
                        <span className="quran-item__meta">
                          {s.descent} • {arabicDigits(s.verses)} آية
                        </span>
                      </span>
                      <Icon name="arrow-right" size={20} className="quran-item__arrow" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {!error && (
            <p className="fat-search-results__count">
              {searching
                ? 'جارِ البحث…'
                : results !== null
                  ? `آيات — ${arabicDigits(results.length)} نتيجة`
                  : ''}
            </p>
          )}

          {error && (
            <div className="fat-search-results__error">
              <Icon name="alert" size={16} />
              تعذّر تحميل فهرس البحث
              <button onClick={() => setAttempt((v) => v + 1)}>
                <Icon name="refresh" size={15} />
                إعادة المحاولة
              </button>
            </div>
          )}

          {!searching && !error && results !== null && results.length === 0 && surahHits.length === 0 && (
            <p className="fat-search-results__empty">
              لا توجد نتيجة لـ «{trimmed}»
            </p>
          )}

          <ul className="fat-search-results__list">
            {(results || []).map((r) => {
              const surah = SURA_BY_NO.get(r.n)
              return (
                <li key={`${r.n}-${r.a}`}>
                  <button
                    className="fat-search-result"
                    onClick={() => openSurah(r.n, r.a)}
                  >
                    <span className="fat-search-result__body">
                      <strong>
                        {surah?.nameAr || `السورة ${arabicDigits(r.n)}`} — الآية {arabicDigits(r.a)}
                      </strong>
                      <em>
                        {r.kind === 'ayah' ? 'في نص الآية' : 'في التفسير'}: «{r.snippet}»
                      </em>
                    </span>
                    <Icon name="arrow-right" size={17} className="fat-search-result__arrow" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <TafseerSurahList
          onOpen={(n, verse) => openSurah(n, verse)}
        />
      )}
    </section>
  )
}