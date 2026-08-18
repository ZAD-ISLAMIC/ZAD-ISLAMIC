import React from 'react'
import { Icon } from '../ui/Icon.jsx'

/**
 * Single-choice list row with a Material radio indicator.
 * Used for methods, voices, and other "pick one of many" lists.
 */
export function SettingsRadioRow({ icon, label, description, active = false, onClick, showCheck = true }) {
  return (
    <button
      className={`settings-radio__row${active ? ' settings-radio__row--active' : ''}`}
      onClick={onClick}
      type="button"
    >
      {icon && (
        <span className="settings-row__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="settings-radio__dot" aria-hidden="true" />
      <span className="settings-radio__info">
        <span className="settings-radio__label">{label}</span>
        {description && <span className="settings-radio__desc">{description}</span>}
      </span>
      {showCheck && active && <Icon name="check" size={16} className="settings-radio__check" />}
    </button>
  )
}