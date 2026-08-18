import React from 'react'
import { useNavigate } from 'react-router-dom'
import { NAV_ITEMS } from '../../constants/app.mjs'
import { Icon } from '../ui/Icon.jsx'

export function FeatureGrid() {
  const navigate = useNavigate()
  const items = NAV_ITEMS.filter((item) => item.path !== '/home')

  return (
    <section className="home-features">
      <h3 className="home-section-title">
        <Icon name="sliders" size={15} />
        أقسام التطبيق
      </h3>
      <div className="home-features__grid">
        {items.map((item) => (
          <button
            className="home-feature"
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{ '--acc': item.accent || 'var(--primary)' }}
            type="button"
          >
            <span className="home-feature__icon">
              <Icon name={item.icon} size={20} />
            </span>
            <span className="home-feature__label">{item.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}