import React from 'react'
import { getEras } from '../../services/history.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

const ERA_STYLES = [
  '#d4af37',
  '#2dd4bf',
  '#7c9cff',
  '#b48cff',
  '#ff9d5c',
  '#4ade80',
  '#fb7185',
  '#38bdf8',
  '#fbbf24',
  '#a78bfa',
  '#34d399',
  '#f472b6',
  '#f59e0b',
  '#60a5fa',
  '#ec4899',
  '#22c55e',
]

export function accentForEra(index) {
  return ERA_STYLES[index % ERA_STYLES.length]
}

export function EraGrid({ onOpen }) {
  const eras = getEras()

  return (
    <div className="hist-eras">
      <p className="hist-eras__count">
        {arabicDigits(eras.length)} حقبة — اختر قرنًا للبدء
      </p>
      <ul className="hist-eras__list">
        {eras.map((era, index) => {
          const accent = accentForEra(index)
          return (
            <li key={era.key}>
              <button
                className="hist-era"
                style={{ '--era-accent': accent }}
                onClick={() => onOpen(era.key)}
              >
                <span className="hist-era__icon" aria-hidden="true">
                  <Icon name="scroll" size={16} />
                </span>
                <span className="hist-era__body">
                  <strong className="hist-era__name">{era.title}</strong>
                  <span className="hist-era__meta">
                    {arabicDigits(era.count)} حدث
                    {era.firstYear !== null
                      ? ` • ${era.firstYear <= 0 ? 'قبل الهجرة' : arabicDigits(era.firstYear) + 'هـ'}–${arabicDigits(era.lastYear)}هـ`
                      : ''}
                  </span>
                </span>
                <Icon name="arrow-right" size={17} className="hist-era__arrow" />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}