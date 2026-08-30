import React, { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCardByNumber } from '../services/quranCards.mjs'
import { setDynamicTitle } from '../utils/headerTitle.mjs'
import { QuranCardDetail } from '../components/qurancards/QuranCardDetail.jsx'
import { Icon } from '../components/ui/Icon.jsx'

function scrollToTop() {
  const el = document.querySelector('.shell__main')
  if (el) el.scrollTop = 0
}

export default function QuranCardDetailScreen() {
  const { number } = useParams()
  const navigate = useNavigate()
  const num = Number(number)
  const card = getCardByNumber(num)

  useEffect(() => {
    scrollToTop()
  }, [num])

  useEffect(() => () => setDynamicTitle(null), [])
  useEffect(() => {
    if (card) setDynamicTitle(card.name_arabic + ' — البطاقات')
  }, [card])

  if (!card) {
    return (
      <section className="qcards-det-screen">
        <div className="qcards-det-screen__error">
          <Icon name="alert" size={20} />
          البطاقة غير موجودة
          <button onClick={() => navigate('/quran-cards')}>
            العودة للقائمة
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="qcards-det-screen">
      <QuranCardDetail
        number={num}
        onNavigate={(n) => navigate(`/quran-cards/${n}`)}
        onReader={(surahIndex) => navigate(`/quran/${surahIndex}`)}
      />
    </section>
  )
}
