import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../../hooks/useTheme.mjs'
import { useClock } from '../../hooks/useClock.mjs'
import { getHeaderMeta } from '../../utils/headerTitle.mjs'
import { Icon } from '../ui/Icon.jsx'

export function Header() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const time = useClock()
  const { title, back } = getHeaderMeta(pathname)
  const isLight = theme === 'light'

  const goBack = () => (back === 'history' ? navigate(-1) : navigate(back))

  return (
    <header className="header">
      <div className="header__start">
        {back && (
          <button
            className="header__back"
            aria-label="رجوع"
            onClick={goBack}
          >
            <Icon name="arrow-right" size={17} />
          </button>
        )}
        <h1 className="header__title">{title}</h1>
      </div>

      <div className="header__end">
        <span className="header__clock">{time}</span>
        <button
          className={'header__theme' + (isLight ? ' header__theme--day' : '')}
          role="switch"
          aria-checked={isLight}
          aria-label={isLight ? 'تفعيل الوضع الليلي' : 'تفعيل الوضع النهاري'}
          onClick={toggle}
        >
          <span className="header__theme-ghost header__theme-ghost--sun" aria-hidden="true">
            <Icon name="sun" size={9} />
          </span>
          <span className="header__theme-ghost header__theme-ghost--moon" aria-hidden="true">
            <Icon name="moon" size={9} />
          </span>
          <span
            className={
              'header__theme-icon' + (isLight ? ' header__theme-icon--day' : '')
            }
          >
            <Icon name={isLight ? 'sun' : 'moon'} size={13} />
          </span>
        </button>
      </div>
    </header>
  )
}