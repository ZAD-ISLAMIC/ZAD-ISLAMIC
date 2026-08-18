import React from 'react'

/**
 * Hero identity card (ناتف): big icon tile + title/sub + large value or body.
 * Variants: default (primary), gold, danger. Optional action slot.
 */
export function SettingsHero({
  icon,
  title,
  sub,
  value,
  text,
  bless,
  children,
  variant = '',
}) {
  return (
    <div className={`settings-hero${variant ? ` settings-hero--${variant}` : ''}`}>
      <span className="settings-hero__head">
        {icon && <span className="settings-hero__icon" aria-hidden="true">{icon}</span>}
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {title && <span className="settings-hero__title">{title}</span>}
          {sub && <span className="settings-hero__sub">{sub}</span>}
        </span>
      </span>
      {value != null && value !== '' && <span className="settings-hero__value">{value}</span>}
      {text && <p className="settings-hero__text">{text}</p>}
      {bless && <span className="settings-hero__bless">{bless}</span>}
      {children && <div className="settings-hero__actions">{children}</div>}
    </div>
  )
}