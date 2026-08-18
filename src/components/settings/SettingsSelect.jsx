import React from 'react'
import { SettingsRow } from './SettingsRow.jsx'

export function SettingsSelect({ icon, label, description, options, value, onChange }) {
  return (
    <SettingsRow
      icon={icon}
      label={label}
      description={description}
      trailing={
        <div className="settings-select" role="radiogroup" aria-label={label}>
          {options.map((o) => (
            <button
              key={o.value}
              className={`settings-select__option${value === o.value ? ' settings-select__option--active' : ''}`}
              role="radio"
              aria-checked={value === o.value}
              onClick={(e) => {
                e.stopPropagation()
                onChange(o.value)
              }}
              type="button"
            >
              {o.label}
            </button>
          ))}
        </div>
      }
    />
  )
}
