import React from 'react'
import { useNavigate } from 'react-router-dom'
import { APP_NAME } from '../../constants/app.mjs'
import { useTheme } from '../../hooks/useTheme.mjs'
import { Icon } from '../ui/Icon.jsx'
import appIcon from '../../resources/icons/icon.png'

export function Header() {
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()

  return (
    <header className="header">
      <div className="header__brand">
        <span className="header__logo-mark" aria-hidden="true">
          <img src={appIcon} alt="" width={36} height={36} />
        </span>
        <span className="header__title">{APP_NAME}</span>
      </div>

      <div className="header__actions">
        <button
          className="header__action"
          aria-label={theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}
          onClick={toggle}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={20} />
        </button>
        <button
          className="header__action"
          aria-label="الإعدادات"
          onClick={() => navigate('/settings')}
        >
          <Icon name="gear" size={20} />
        </button>
      </div>
    </header>
  )
}