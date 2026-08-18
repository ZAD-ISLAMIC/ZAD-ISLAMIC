import React from 'react'

/**
 * Base settings row: leading icon tile + label/description + trailing control.
 * Renders as a full-width button when `onClick` is provided.
 */
export function SettingsRow({
  icon,
  label,
  description,
  value,
  trailing,
  onClick,
  danger = false,
  disabled = false,
}) {
  const className = [
    'settings-row',
    danger ? 'settings-row--danger' : '',
    onClick ? 'settings-row--clickable' : '',
    disabled ? 'settings-row--disabled' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const content = (
    <>
      {icon && (
        <span className="settings-row__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="settings-row__text">
        <span className="settings-row__label">{label}</span>
        {description && <span className="settings-row__desc">{description}</span>}
      </span>
      <span className="settings-row__trailing">
        {value && <span className="settings-row__value">{value}</span>}
        {trailing}
      </span>
    </>
  )

  if (onClick) {
    return (
      <button
        className={className}
        onClick={onClick}
        type="button"
        disabled={disabled}
      >
        {content}
      </button>
    )
  }
  return <div className={className}>{content}</div>
}
