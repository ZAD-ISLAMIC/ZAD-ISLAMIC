import React, { useMemo, useState } from 'react'
import {
  HISN_DATA,
  accentFor,
  doorFiles,
  groupBySections,
  searchCategories,
  totalCount,
} from '../../services/hisnmuslim.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'
import { HisnDoorMiniActions } from './HisnAudioActions.jsx'

export function HisnSectionGrid({ onOpen }) {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState({})

  const groups = useMemo(() => {
    const source = query ? searchCategories(query) : HISN_DATA
    return groupBySections(source)
  }, [query])

  const resultsCount = useMemo(() => (query ? searchCategories(query).length : HISN_DATA.length), [query])

  return (
    <div className="hisn-grid">
      <div className="hisn-grid__search">
        <Icon name="search" size={18} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث عن باب… مثل أذكار الصباح"
          aria-label="البحث في أقسام حصن المسلم"
        />
        {query && (
          <button
            className="hisn-grid__clear"
            onClick={() => setQuery('')}
            aria-label="مسح البحث"
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {query && (
        <p className="hisn-grid__meta">
          {arabicDigits(resultsCount)} نتيجة عن «{query}»
        </p>
      )}

      {groups.length === 0 ? (
        <p className="hisn-empty">لا توجد أقسام تطابق بحثك</p>
      ) : (
        groups.map((section) => {
          const accent = accentFor(section.categories[0].category)
          const isCollapsed = collapsed[section.key]
          return (
            <section className="hisn-section" key={section.key}>
              <button
                className="hisn-section__head"
                style={{ '--cat-accent': accent }}
                onClick={() =>
                  setCollapsed((prev) => ({ ...prev, [section.key]: !prev[section.key] }))
                }
                aria-expanded={!isCollapsed}
              >
                <span className="hisn-section__title">{section.title}</span>
                <span className="hisn-section__count" style={{ color: accent }}>
                  {arabicDigits(section.categories.length)} باب
                </span>
                <Icon
                  name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                  size={18}
                  className="hisn-section__caret"
                />
              </button>

              {!isCollapsed && (
                <div className="hisn-section__cats">
                  {section.categories.map((category) => {
                    const catAccent = accentFor(category.category)
                    return (
                      <button
                        key={category.id}
                        className="hisn-cat"
                        style={{ '--cat-accent': catAccent }}
                        onClick={() => onOpen(category.id)}
                      >
                        <span className="hisn-cat__body">
                          <strong>{category.category}</strong>
                          <span>
                            {arabicDigits(category.array.length)} ذكر •{' '}
                            {arabicDigits(totalCount(category.id))} تكرار •{' '}
                            {arabicDigits(doorFiles(category.id).length)} مقطع
                          </span>
                        </span>
                        <HisnDoorMiniActions category={category} />
                        <Icon name="arrow-left" size={18} className="hisn-cat__arrow" />
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })
      )}
    </div>
  )
}