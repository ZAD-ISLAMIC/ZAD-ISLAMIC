import React from 'react'
import { arabicDigits } from '../../utils/arabic.mjs'

/**
 * Full-width slider row (نمط M3): title/desc on top, native track below.
 */
export function SettingsSlider({ icon, label, description, value, min = 0, max = 100, step = 1, onChange, format }) {
  const display = format ? format(value) : `${arabicDigits(value)}%`
  return (
    <div className="settings-slider-row">
      <div className="settings-slider-row__head">
        {icon && <span className="settings-slider-row__icon" aria-hidden="true">{icon}</span>}
        <span className="settings-slider-row__info">
          <span className="settings-slider-row__label">{label}</span>
          {description && <span className="settings-slider-row__desc">{description}</span>}
        </span>
        <span className="settings-slider-row__badge">{display}</span>
      </div>
      <input
        className="settings-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}