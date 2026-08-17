import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AdhkarCategoryGrid } from '../components/adhkar/AdhkarCategoryGrid.jsx'
import { AdhkarStats } from '../components/adhkar/AdhkarStats.jsx'

export default function AdhkarScreen() {
  const [tab, setTab] = useState('adhkar')
  const navigate = useNavigate()

  return (
    <section className="screen adhkar">
      <div className="adhkar-hero">
        <p>وردك اليومي من أذكار الصباح والمساء والنوم والطعام والتسبيح</p>
      </div>

      <div className="adhkar-tabs" role="tablist">
        <button
          className={'adhkar-tab' + (tab === 'adhkar' ? ' adhkar-tab--active' : '')}
          onClick={() => setTab('adhkar')}
        >
          الأقسام
        </button>
        <button
          className={'adhkar-tab' + (tab === 'stats' ? ' adhkar-tab--active' : '')}
          onClick={() => setTab('stats')}
        >
          الإحصائية
        </button>
      </div>

      {tab === 'adhkar' ? (
        <AdhkarCategoryGrid onOpen={(categoryKey) => navigate(`/adhkar/${categoryKey}`)} />
      ) : (
        <AdhkarStats />
      )}
    </section>
  )
}