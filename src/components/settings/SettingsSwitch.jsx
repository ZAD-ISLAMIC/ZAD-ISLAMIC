import React from 'react'
import { SettingsRow } from './SettingsRow.jsx'
import { Icon } from '../ui/Icon.jsx'

export function SettingsSwitch({
  icon,
  label,
  description,
  checked,
  onChange,
  danger = false,
  disabled = false,
}) {
  return (
    <SettingsRow
      icon={icon}
      label={label}
      description={description}
      danger={danger}
      disabled={disabled}
      trailing={
        <button
          className={`switch${checked ? ' switch--on' : ''}`}
          role="switch"
          aria-checked={checked}
          aria-label={label}
          onClick={(e) => {
            e.stopPropagation()
            if (!disabled) onChange(!checked)
          }}
          type="button"
          disabled={disabled}
        >
          <i />
        </button>
      }
    />
  )
}
