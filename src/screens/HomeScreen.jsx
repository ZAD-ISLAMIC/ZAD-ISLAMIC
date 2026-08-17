import React from 'react'
import { useNavigate } from 'react-router-dom'
import { NAV_ITEMS } from '../constants/app.mjs'
import { Card } from '../components/ui/Card.jsx'
import { Icon } from '../components/ui/Icon.jsx'

export default function HomeScreen() {
  const navigate = useNavigate()
  const features = NAV_ITEMS.filter((item) => item.path !== '/home')

  return (
    <section className="screen home">
      <div className="home__hero">
        <h2>بسم الله الرحمن الرحيم</h2>
        <p>تطبيقك الشامل للعبادات والقرآن الكريم</p>
      </div>

      <div className="home__grid">
        {features.map((item) => (
          <Card
            key={item.path}
            className="feature"
            onClick={() => navigate(item.path)}
          >
            <span className="feature__icon">
              <Icon name={item.icon} size={26} />
            </span>
            <span className="feature__label">{item.label}</span>
          </Card>
        ))}
      </div>
    </section>
  )
}