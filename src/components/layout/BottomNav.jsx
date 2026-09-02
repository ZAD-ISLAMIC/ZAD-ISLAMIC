import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { BOTTOM_NAV_ITEMS } from '../../constants/app.mjs'
import { Icon } from '../ui/Icon.jsx'

function isItemActive(pathname, itemPath) {
  return pathname === itemPath || pathname.startsWith(itemPath + '/')
}

export const BottomNav = React.memo(function BottomNav() {
  const { pathname } = useLocation()

  const onMenu = BOTTOM_NAV_ITEMS.some((item) => isItemActive(pathname, item.path))

  return (
    <nav className="bottomnav" aria-label="التنقل الرئيسي">
      {BOTTOM_NAV_ITEMS.map((item) => {
        const isActive = onMenu ? isItemActive(pathname, item.path) : item.path === '/home'
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={'bottomnav__item' + (isActive ? ' bottomnav__item--active' : '')}
          >
            <Icon name={item.icon} size={18} />
            <span>{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
})