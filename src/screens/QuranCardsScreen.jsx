import React from 'react'
import { useNavigate } from 'react-router-dom'
import { QuranCardsList } from '../components/qurancards/QuranCardsList.jsx'
import { Icon } from '../components/ui/Icon.jsx'

export default function QuranCardsScreen() {
  const navigate = useNavigate()

  return (
    <section className="qcards">
      <div className="qcards-hero">
        <span className="qcards-hero__badge">
          <Icon name="bookmark" size={22} />
        </span>
        <h2>بطاقات القرآن الكريم</h2>
        <p>114 بطاقة شاملة لكل سورة — آياتها، معنى اسمها، فضلها، مناسباتها، واستماع صوتي</p>
      </div>
      <QuranCardsList onOpen={(number) => navigate(`/quran-cards/${number}`)} />
    </section>
  )
}
