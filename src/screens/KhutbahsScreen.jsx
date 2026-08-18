import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchGlobal } from '../services/khutbah.mjs'
import { arabicDigits } from '../utils/arabic.mjs'
import { Icon } from '../components/ui/Icon.jsx'
import { KhutbahsHero } from '../components/khutbah/KhutbahsHero.jsx'
import { KhutbahCategoryGrid } from '../components/khutbah/KhutbahCategoryGrid.jsx'

export default function KhutbahsScreen() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const searchTimer = useRef(null)

  const trimmed = query.trim()

  // بحث عام مؤجّل (debounce) — فهرس يُحمَّل لازيًا عند أول ضغط.
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
        const found = await searchGlobal(trimmed)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, attempt])

  const isSearching = trimmed.length >= 2

  const summary = useMemo(() => results?.length ?? null, [results])

  return (
    <section className="screen khutbahs">
      <KhutbahsHero />

      <label className="kht-search">
        <Icon name="search" size={18} />
        <input
          type="search"
          enterKeyHint="search"
          placeholder="ابحث في الخطب عن عنوان، كاتب، أو فئة…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="بحث عام في الخطب"
        />
        {trimmed && (
          <button
            className="kht-search__clear"
            aria-label="مسح البحث"
            onClick={() => setQuery('')}
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </label>

      {isSearching ? (
        <div className="kht-search-results">
          <p className="kht-search-results__count">
            {searching
              ? 'جارِ البحث…'
              : error
                ? ''
                : summary !== null
                  ? `${arabicDigits(summary)} نتيجة`
                  : ''}
          </p>
          {error && (
            <div className="kht-search-results__error">
              <Icon name="alert" size={16} />
              تعذّر تحميل فهرس البحث
              <button onClick={() => setAttempt((v) => v + 1)}>
                <Icon name="refresh" size={15} />
                إعادة المحاولة
              </button>
            </div>
          )}
          {!searching && !error && results !== null && results.length === 0 && (
            <p className="kht-search-results__empty">
              لا توجد نتيجة لـ «{trimmed}»
            </p>
          )}
          <ul className="kht-search-results__list">
            {(results || []).map((r) => (
              <li key={r.id}>
                <button
                  className="kht-search-result"
                  onClick={() => navigate(`/khutbah/${r.slug}/${r.id}`)}
                >
                  <span className="kht-search-result__body">
                    <strong>{r.title}</strong>
                    <em>
                      {r.author && `${r.author} • `}
                      {r.category}
                    </em>
                  </span>
                  <Icon name="arrow-right" size={17} className="kht-search-result__arrow" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <KhutbahCategoryGrid onOpen={(slug) => navigate(`/khutbah/${slug}`)} />
      )}
    </section>
  )
}
