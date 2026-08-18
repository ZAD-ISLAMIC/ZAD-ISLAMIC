import React from 'react'
import { useNavigate } from 'react-router-dom'
import { storage } from '../../services/storage.mjs'
import { SURAH_META } from '../../services/surahsMeta.mjs'
import { todayHomeStats } from '../../services/daily.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

function ContinueRead() {
  const navigate = useNavigate()
  const reading = storage.get('quran.reading', null)
  const hasReading = reading && typeof reading.surah === 'number'
  const meta = hasReading ? SURAH_META[reading.surah] : null

  return (
    <button
      className="home-continue__read"
      onClick={() =>
        navigate(hasReading ? `/quran/${reading.surah}?verse=${reading.verse || 1}` : '/quran')
      }
      type="button"
    >
      <span className="home-continue__icon">
        <Icon name={hasReading ? 'book-open' : 'book'} size={18} />
      </span>
      <span className="home-continue__body">
        <b>{hasReading ? 'أكمل قراءتك' : 'ابدأ القراءة'}</b>
        <small>
          {hasReading
            ? `سورة ${meta ? meta.name : ''} — الآية ${arabicDigits(reading.verse || 1)}`
            : 'من المصحف الشريف'}
        </small>
      </span>
      <Icon name="arrow-left" size={16} className="home-continue__arrow" />
    </button>
  )
}

function Stat({ icon, label, value }) {
  return (
    <div className="home-continue__stat">
      <span className="home-continue__stat-icon">
        <Icon name={icon} size={15} />
      </span>
      <b>{value}</b>
      <small>{label}</small>
    </div>
  )
}

export function ContinueRow() {
  const stats = todayHomeStats()

  return (
    <section className="home-continue">
      <ContinueRead />
      <div className="home-continue__stats">
        <Stat icon="bead" label="تسبيح اليوم" value={arabicDigits(stats.tasbih)} />
        <Stat icon="hand" label="أذكار اليوم" value={arabicDigits(stats.adhkarToday)} />
        <Stat icon="flame" label="أيام السلسلة" value={arabicDigits(stats.streak)} />
      </div>
    </section>
  )
}