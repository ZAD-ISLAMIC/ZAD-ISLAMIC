import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchHistory } from '../../services/history.mjs'
import { getEraByKey } from '../../services/history.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

export function HistorySearch({ onOpen }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const searchTimer = useRef(null)

  const trimmed = query.trim()

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (trimmed.length < 2) {
      setResults(null)
      setSearching(false)
      setError(false)
      return undefined
    }
    setSearching(true)
    setError(false)
    searchTimer.current = setTimeout(async () => {
      try {
        const found = await searchHistory(trimmed)
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
  const summary = useMemo(() => (results ? results.length : null), [results])

  return (
    <div className="hist-search">
      <label className="hist-search__field">
        <Icon name="search" size={18} />
        <input
          type="search"
          enterKeyHint="search"
          placeholder="ابحث في الأحداث عن حدث أو وفاة أو غزوة…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="بحث عام في الموسوعة التاريخية"
        />
        {trimmed && (
          <button
            className="hist-search__clear"
            aria-label="مسح البحث"
            onClick={() => setQuery('')}
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </label>

      {isSearching && (
        <div className="hist-search-results">
          <p className="hist-search-results__count">
            {searching
              ? 'جارِ البحث…'
              : error
                ? ''
                : summary
                  ? `${arabicDigits(summary)} نتيجة`
                  : ''}
          </p>
          {error && (
            <div className="hist-search-results__error">
              <Icon name="alert" size={16} />
              تعذّر تحميل فهرس البحث
              <button onClick={() => setAttempt((v) => v + 1)}>
                <Icon name="refresh" size={15} />
                إعادة المحاولة
              </button>
            </div>
          )}
          {!searching && !error && results !== null && results.length === 0 && (
            <p className="hist-search-results__empty">
              لا توجد نتيجة لـ «{trimmed}»
            </p>
          )}
          <ul className="hist-search-results__list">
            {(results || []).map((r) => {
              const era = getEraByKey(r.era)
              return (
                <li key={r.id}>
                  <button
                    className="hist-search-result"
                    onClick={() => onOpen(r.era, r.id)}
                  >
                    <span className="hist-search-result__body">
                      <strong>{r.title}</strong>
                      <em>{era ? era.title : r.era}</em>
                    </span>
                    <Icon
                      name="arrow-right"
                      size={17}
                      className="hist-search-result__arrow"
                    />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}