import React from 'react'
import { useNavigate } from 'react-router-dom'
import { todayVerse, todayDhikr } from '../../services/daily.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

export function DailyVerse() {
  const navigate = useNavigate()
  const verse = todayVerse()
  const dhikr = verse ? null : todayDhikr()

  return (
    <section className="home-verse">
      <header className="home-verse__head">
        <h3 className="home-section-title">
          <Icon name="book-open" size={15} />
          {verse ? 'آية اليوم' : 'ذكر اليوم'}
        </h3>
      </header>

      <p className="home-verse__text">{verse ? verse.text : dhikr?.text || ''}</p>

      <div className="home-verse__foot">
        <p className="home-verse__ref">
          {verse
            ? `سورة ${verse.surahName} — الآية ${arabicDigits(verse.verse)}`
            : dhikr?.category || ''}
        </p>

        {verse && (
          <div className="home-verse__actions">
            <button
              onClick={() => navigate(`/tafseer/${verse.surahIndex + 1}?verse=${verse.verse}`)}
              type="button"
            >
              <Icon name="feather" size={14} />
              التفسير
            </button>
            <button
              onClick={() => navigate(`/quran/${verse.surahIndex}?verse=${verse.verse}`)}
              type="button"
            >
              <Icon name="book" size={14} />
              المصحف
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
