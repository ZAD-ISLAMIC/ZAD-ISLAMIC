import React from 'react'
import { SettingsRow } from './SettingsRow.jsx'
import { arabicDigits } from '../../utils/arabic.mjs'

export function SettingsStepper({
  icon,
  label,
  description,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix = '',
}) {
  const canMinus = value - step >= min
  const canPlus = value + step <= max
  return (
    <SettingsRow
      icon={icon}
      label={label}
      description={description}
      value={`${arabicDigits(value)}${suffix}`}
      trailing={
        <div className="settings-stepper" role="group" aria-label={label}>
          <button
            className="settings-stepper__btn"
            aria-label="نقص"
            disabled={!canMinus}
            onClick={(e) => {
              e.stopPropagation()
              onChange(Math.min(max, Math.max(min, value - step)))
            }}
            type="button"
          >
            −
          </button>
          <span className="settings-stepper__value">{arabicDigits(value)}</span>
          <button
            className="settings-stepper__btn"
            aria-label="زيادة"
            disabled={!canPlus}
            onClick={(e) => {
              e.stopPropagation()
              onChange(Math.min(max, Math.max(min, value + step)))
            }}
            type="button"
          >
            +
          </button>
        </div>
      }
    />
  )
}
