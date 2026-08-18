import React from 'react'

export function SettingsGroup({ title, icon, children, className = '' }) {
  return (
    <section className={`settings-group ${className}`}>
      {title && (
        <h3 className="settings-group__title">
          {icon && <span className="settings-group__icon" aria-hidden="true">{icon}</span>}
          {title}
        </h3>
      )}
      <div className="settings-group__card">{children}</div>
    </section>
  )
}
