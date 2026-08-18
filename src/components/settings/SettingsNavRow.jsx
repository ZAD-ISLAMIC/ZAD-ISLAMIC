import React from 'react'
import { SettingsRow } from './SettingsRow.jsx'
import { Icon } from '../ui/Icon.jsx'

export function SettingsNavRow({
  icon,
  label,
  description,
  value,
  onClick,
  danger = false,
}) {
  return (
    <SettingsRow
      icon={icon}
      label={label}
      description={description}
      value={value}
      danger={danger}
      onClick={onClick}
      trailing={<Icon name="arrow-left" size={16} className="settings-row__chevron" />}
    />
  )
}
