import React, { useMemo, useState } from 'react'
import { getCategories, searchCategories } from '../../services/fatwas.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

export function CategoryGrid({ onOpen }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('alpha')

  const visible = useMemo(() => {
    const list = searchCategories(query)
    const sorted = [...list].sort((a, b) =>
      sort === 'popular'
        ? b.count - a.count || a.name.localeCompare(b.name, 'ar')
        : a.name.localeCompare(b.name, 'ar')
    )
    return sorted
  }, [query, sort])

  const total = getCategories().length

  return (
    <div className="fat-cat">
      <div className="fat-cat__toolbar">
        <label className="fat-cat__search">
          <Icon name="search" size={17} />
          <input
            type="search"
            enterKeyHint="search"
            placeholder="ابحث عن فئة…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="بحث في الفئات"
          />
          {query && (
            <button
              className="fat-cat__clear"
              aria-label="مسح البحث"
              onClick={() => setQuery('')}
            >
              <Icon name="close" size={15} />
            </button>
          )}
        </label>

        <div className="fat-cat__sort" role="group" aria-label="ترتيب الفئات">
          <button
            className={sort === 'alpha' ? 'fat-cat__sort-btn fat-cat__sort-btn--on' : 'fat-cat__sort-btn'}
            onClick={() => setSort('alpha')}
          >
            أبجدي
          </button>
          <button
            className={sort === 'popular' ? 'fat-cat__sort-btn fat-cat__sort-btn--on' : 'fat-cat__sort-btn'}
            onClick={() => setSort('popular')}
          >
            الأكثر
          </button>
        </div>
      </div>

      <p className="fat-cat__count">
        {query
          ? `${arabicDigits(visible.length)} فئة مطابقة`
          : `${arabicDigits(total)} فئة فقهية`}
      </p>

      {visible.length === 0 && (
        <p className="fat-cat__empty">لا توجد فئة يطابق «{query}»</p>
      )}

      <ul className="fat-cat__list">
        {visible.map((cat) => (
          <li key={cat.slug}>
            <button className="fat-cat__card" onClick={() => onOpen(cat.slug)}>
              <span className="fat-cat__badge" aria-hidden="true">
                <Icon name="feather" size={15} />
              </span>
              <span className="fat-cat__body">
                <strong className="fat-cat__name">{cat.name}</strong>
                <span className="fat-cat__meta">
                  {arabicDigits(cat.count)} فتوى
                  {cat.audioCount > 0
                    ? ` • ${arabicDigits(cat.audioCount)} صوتية`
                    : ' • بلا صوتيات'}
                </span>
              </span>
              <Icon name="arrow-right" size={18} className="fat-cat__arrow" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}