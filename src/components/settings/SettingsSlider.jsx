import React from 'react'
import { SettingsRow } from './SettingsRow.jsx'
import { arabicDigits } from '../../utils/arabic.mjs'

export function SettingsSlider({ icon, label, description, value, min = 0, max = 100, step = 1, onChange, format }) {
  const display = format ? format(value) : `${arabicDigits(value)}%`
  return (
    <SettingsRow
      icon={icon}
      label={label}
      description={description}
      value={display}
      trailing={
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
      }
    />
  )
}
