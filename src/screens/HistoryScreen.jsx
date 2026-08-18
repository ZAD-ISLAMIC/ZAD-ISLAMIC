import React from 'react'
import { useNavigate } from 'react-router-dom'
import { HistoryHero } from '../components/history/HistoryHero.jsx'
import { HistorySearch } from '../components/history/HistorySearch.jsx'
import { EraGrid } from '../components/history/EraGrid.jsx'

export default function HistoryScreen() {
  const navigate = useNavigate()

  return (
    <section className="screen history">
      <HistoryHero />
      <HistorySearch
        onOpen={(eraKey, id) => navigate(`/history/${eraKey}/${id}`)}
      />
      <EraGrid onOpen={(eraKey) => navigate(`/history/${eraKey}`)} />
    </section>
  )
}