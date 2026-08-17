import React from 'react'
import { AZKAR_DATA, CATEGORY_ICONS, CATEGORY_STYLES, formatCount } from '../../services/adhkar.mjs'
import { Icon } from '../ui/Icon.jsx'

export function AdhkarCategoryGrid({ onOpen }) {
  return (
    <div className="adhkar-cats">
      {AZKAR_DATA.map((category, i) => {
        const style = CATEGORY_STYLES[category.key] || {}
        const accent = style.accent || '#10b981'
        const reps = category.array.reduce((sum, item) => sum + (item.repetition || 1), 0)
        return (
          <button
            key={category.key}
            className="adhkar-cat"
            style={{ '--cat-accent': accent }}
            onClick={() => onOpen(category.key)}
          >
            <span className="adhkar-cat__icon">
              <Icon name={CATEGORY_ICONS[category.key]} size={26} />
            </span>
            <span className="adhkar-cat__body">
              <strong>{category.category}</strong>
              <span>
                {formatCount(category.array.length)} ذكرًا • {formatCount(reps)} تكرار
              </span>
            </span>
            <Icon name="arrow-left" size={18} className="adhkar-cat__arrow" />
          </button>
        )
      })}
    </div>
  )
}