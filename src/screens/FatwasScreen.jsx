import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchGlobal } from '../services/fatwas.mjs'
import { arabicDigits } from '../utils/arabic.mjs'
import { Icon } from '../components/ui/Icon.jsx'
import { FatwasHero } from '../components/fatwas/FatwasHero.jsx'
import { SheikhBioSheet } from '../components/fatwas/SheikhBioSheet.jsx'
import { CategoryGrid } from '../components/fatwas/CategoryGrid.jsx'

export default function FatwasScreen() {
  const navigate = useNavigate()
  const [showBio, setShowBio] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const searchTimer = useRef(null)

  const trimmed = query.trim()

  // بحث عام مؤجّل (debounce) في كل الفتاوى — فهرس يُحمَّل لازيًا عند أول ضغط.
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

  const summary = useMemo(() => {
    if (!results) return null
    return results.length
  }, [results])

  return (
    <section className="screen fatwas">
      <FatwasHero onOpenBio={() => setShowBio(true)} />

      <label className="fat-search">
        <Icon name="search" size={18} />
        <input
          type="search"
          enterKeyHint="search"
          placeholder="ابحث في ١٩٧٢٧ فتوى عن سؤال أو عنوان…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="بحث عام في الفتاوى"
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
          <p className="fat-search-results__count">
            {searching
              ? 'جارِ البحث…'
              : error
                ? ''
                : summary
                  ? `${arabicDigits(summary)} نتيجة`
                  : ''}
          </p>
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
          {!searching && !error && results !== null && results.length === 0 && (
            <p className="fat-search-results__empty">
              لا توجد نتيجة لـ «{trimmed}»
            </p>
          )}
          <ul className="fat-search-results__list">
            {(results || []).map((r) => (
              <li key={r.id}>
                <button
                  className="fat-search-result"
                  onClick={() => navigate(`/fatwas/${r.slug}/${r.id}`)}
                >
                  <span className="fat-search-result__body">
                    <strong>{r.title}</strong>
                    <em>{r.category}</em>
                  </span>
                  <Icon name="arrow-right" size={17} className="fat-search-result__arrow" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <CategoryGrid onOpen={(slug) => navigate(`/fatwas/${slug}`)} />
      )}

      {showBio && <SheikhBioSheet onClose={() => setShowBio(false)} />}
    </section>
  )
}