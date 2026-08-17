import React, { useMemo, useState, useSyncExternalStore } from 'react'
import {
  RECITERS,
  firstLetterFor,
  groupByLetter,
  searchReciters,
} from '../../services/reciters.mjs'
import { getRegistry } from '../../services/reciterStorage.mjs'
import * as downloadManager from '../../services/downloadManager.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

export function RecitersList({ onOpen }) {
  // Re-render on any download/delete activity so per-card counts reflect
  // storage immediately (e.g. after clearing saved audio elsewhere).
  useSyncExternalStore(downloadManager.subscribe, downloadManager.getSnapshot)
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const list = searchReciters(query)
    return groupByLetter(list)
  }, [query])

  const visibleCount = groups.reduce((sum, [, items]) => sum + items.length, 0)

  return (
    <section className="screen reciters">
      <label className="quran-search reciters__search">
        <Icon name="search" size={18} />
        <input
          className="quran-search__input"
          type="search"
          enterKeyHint="search"
          placeholder="ابحث عن قارئ بالاسم أو الرواية"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            className="reciters__clear"
            aria-label="مسح البحث"
            onClick={() => setQuery('')}
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </label>

      <p className="reciters__count">
        {arabicDigits(RECITERS.length)} قارئاً
        {query ? ` — ${arabicDigits(visibleCount)} نتيجة` : ''}
      </p>

      {groups.length === 0 && (
        <p className="quran-empty">لا يوجد قارئ يطابق «{query}»</p>
      )}

      {groups.map(([letter, items]) => (
        <div className="rec-group" key={letter}>
          {!query && <h3 className="rec-group__title">{letter}</h3>}
          <ul className="rec-list">
            {items.map((reciter) => {
              const stored = getRegistry(reciter.id).count
              return (
                <li key={reciter.id}>
                  <button className="rec-card" onClick={() => onOpen(reciter.id)}>
                    <span className="rec-card__avatar">
                      {firstLetterFor(reciter.name)}
                    </span>
                    <span className="rec-card__body">
                      <strong className="rec-card__name">{reciter.name}</strong>
                      <span className="rec-card__meta">
                        {reciter.rewaya} • {arabicDigits(reciter.suras.length)} سورة
                      </span>
                      {stored > 0 && (
                        <span className="rec-card__stored">
                          <Icon name="download" size={12} />
                          {arabicDigits(stored)} محمّلة
                        </span>
                      )}
                    </span>
                    {stored === reciter.suras.length && (
                      <span className="rec-card__complete" title="المصحف كاملاً محفوظاً">
                        <Icon name="check" size={14} />
                      </span>
                    )}
                    <Icon name="arrow-right" size={20} className="rec-card__arrow" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}