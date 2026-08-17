import React, { useMemo } from 'react'
import {
  AZKAR_DATA,
  CATEGORY_ICONS,
  CATEGORY_STYLES,
  computeStats,
  formatCount,
} from '../../services/adhkar.mjs'
import { Icon } from '../ui/Icon.jsx'

const PERIODS = [
  { key: 'today', label: 'اليوم' },
  { key: 'week', label: 'الأسبوع' },
  { key: 'month', label: 'الشهر' },
  { key: 'year', label: 'السنة' },
]

function dayLabel(day) {
  const [, m, d] = day.split('-')
  return `${d}/${m}`
}

export function AdhkarStats({ refreshTick }) {
  const stats = useMemo(() => computeStats(), [refreshTick])
  const maxMonth = Math.max(1, ...Object.values(stats.byCategory))

  return (
    <div className="adhkar-stats">
      <div className="adhkar-stats__grid">
        {PERIODS.map((period) => (
          <div key={period.key} className="adhkar-stats__card">
            <span className="adhkar-stats__label">{period.label}</span>
            <strong className="adhkar-stats__value">{formatCount(stats[period.key])}</strong>
            <span className="adhkar-stats__unit">ذكر</span>
          </div>
        ))}
      </div>

      <article className="adhkar-stats__panel adhkar-stats__panel--hero">
        <div>
          <span className="adhkar-stats__panel-label">الإجمالي الكلي</span>
          <strong className="adhkar-stats__total">{formatCount(stats.total)}</strong>
        </div>
        <div className="adhkar-stats__streak">
          <span className="adhkar-stats__streak-flame">✦</span>
          <strong>{formatCount(stats.streak)}</strong>
          <span>يوم متتالي</span>
        </div>
      </article>

      {stats.recentDays.length > 0 && (
        <article className="adhkar-stats__panel">
          <span className="adhkar-stats__panel-label">آخر {formatCount(14)} يوم</span>
          <div className="adhkar-stats__days">
            {stats.recentDays.map((entry) => (
              <span key={entry.day} className="adhkar-stats__day">
                <i
                  className="adhkar-stats__day-dot"
                  style={{
                    opacity: Math.min(1, 0.35 + entry.count * 0.22),
                  }}
                />
                <em>{dayLabel(entry.day)}</em>
              </span>
            ))}
          </div>
        </article>
      )}

      <article className="adhkar-stats__panel">
        <span className="adhkar-stats__panel-label">أذكار هذا الشهر حسب القسم</span>
        <ul className="adhkar-stats__cats">
          {AZKAR_DATA.map((category) => {
            const count = stats.byCategory[category.key] || 0
            const style = CATEGORY_STYLES[category.key] || {}
            return (
              <li key={category.key} className="adhkar-stats__cat">
                <span className="adhkar-stats__cat-icon" style={{ color: style.accent }}>
                  <Icon name={CATEGORY_ICONS[category.key]} size={16} />
                </span>
                <span className="adhkar-stats__cat-name">{category.category}</span>
                <span
                  className="adhkar-stats__cat-bar"
                  style={{
                    background: `linear-gradient(90deg, ${style.accent}, ${style.accent}88)`,
                    width: `${Math.max(count ? 4 : 0, Math.round((count / maxMonth) * 100))}%`,
                  }}
                />
                <strong className="adhkar-stats__cat-count">{formatCount(count)}</strong>
              </li>
            )
          })}
        </ul>
      </article>
    </div>
  )
}