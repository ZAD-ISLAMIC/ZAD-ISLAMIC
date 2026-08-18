import React, { useMemo, useState } from 'react'
import { getCategories, searchCategories } from '../../services/khutbah.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

export function KhutbahCategoryGrid({ onOpen }) {
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
    <div className="kht-cat">
      <div className="kht-cat__toolbar">
        <label className="kht-cat__search">
          <Icon name="search" size={17} />
          <input
            type="search"
            enterKeyHint="search"
            placeholder="ابحث عن فئة…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="بحث في فئات الخطب"
          />
          {query && (
            <button
              className="kht-cat__clear"
              aria-label="مسح البحث"
              onClick={() => setQuery('')}
            >
              <Icon name="close" size={15} />
            </button>
          )}
        </label>

        <div className="kht-cat__sort" role="group" aria-label="ترتيب الفئات">
          <button
            className={sort === 'alpha' ? 'kht-cat__sort-btn kht-cat__sort-btn--on' : 'kht-cat__sort-btn'}
            onClick={() => setSort('alpha')}
          >
            أبجدي
          </button>
          <button
            className={sort === 'popular' ? 'kht-cat__sort-btn kht-cat__sort-btn--on' : 'kht-cat__sort-btn'}
            onClick={() => setSort('popular')}
          >
            الأكثر
          </button>
        </div>
      </div>

      <p className="kht-cat__count">
        {query
          ? `${arabicDigits(visible.length)} فئة مطابقة`
          : `${arabicDigits(total)} فئة للخطب`}
      </p>

      {visible.length === 0 && (
        <p className="kht-cat__empty">لا توجد فئة يطابق «{query}»</p>
      )}

      <ul className="kht-cat__list">
        {visible.map((cat) => (
          <li key={cat.slug}>
            <button className="kht-cat__card" onClick={() => onOpen(cat.slug)}>
              <span className="kht-cat__badge" aria-hidden="true">
                <Icon name="minbar" size={15} />
              </span>
              <span className="kht-cat__body">
                <strong className="kht-cat__name">{cat.name}</strong>
                <span className="kht-cat__meta">
                  {arabicDigits(cat.count)} خطبة
                </span>
              </span>
              <Icon name="arrow-right" size={18} className="kht-cat__arrow" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
