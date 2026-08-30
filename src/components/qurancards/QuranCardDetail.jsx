import React, { useState } from 'react'
import { cardSections, getCardByNumber } from '../../services/quranCards.mjs'
import { QuranCardMedia } from './QuranCardMedia.jsx'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

export function QuranCardDetail({ number, onNavigate, onReader }) {
  const card = getCardByNumber(number)
  if (!card) return null

  const sections = cardSections(card)
  const hasPrev = number > 1
  const hasNext = number < 114

  return (
    <div className="qcards-det">
      <div className="qcards-det__header">
        <div className="qcards-det__header-bg" />
        <div className="qcards-det__header-content">
          <span className="qcards-det__num">{arabicDigits(card.number)}</span>
          <h2 className="qcards-det__name">{card.name_arabic}</h2>
          <span className="qcards-det__english">{card.name_english}</span>
          <div className="qcards-det__meta">
            <span className="qcards-det__meta-item">
              <Icon name="book" size={12} />
              {arabicDigits(card.ayahs_count)} آية
            </span>
            <span className="qcards-det__meta-sep" />
            <span className="qcards-det__meta-item">
              <Icon name="star" size={12} />
              {card.revelation_type}
            </span>
            {onReader && (
              <span className="qcards-det__meta-sep" />
            )}
            {onReader && (
              <button
                className="qcards-det__reader-link"
                onClick={() => onReader(number - 1)}
                type="button"
              >
                <Icon name="book" size={11} />
                <span>المصحف</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <QuranCardMedia number={number} />

      <div className="qcards-det__sections">
        {sections.map((section, i) => (
          <QuranCardSection key={i} section={section} index={i} />
        ))}
      </div>

      <div className="qcards-det__nav">
        <button
          className="qcards-det__nav-btn qcards-det__nav-btn--prev"
          disabled={!hasPrev}
          onClick={() => onNavigate(number - 1)}
          type="button"
          aria-label="السورة السابقة"
        >
          <Icon name="arrow-right" size={18} />
          <span>السابقة</span>
        </button>
        <span className="qcards-det__nav-counter">
          {arabicDigits(number)} / {arabicDigits(114)}
        </span>
        <button
          className="qcards-det__nav-btn qcards-det__nav-btn--next"
          disabled={!hasNext}
          onClick={() => onNavigate(number + 1)}
          type="button"
          aria-label="السورة التالية"
        >
          <span>التالية</span>
          <Icon name="arrow-left" size={18} />
        </button>
      </div>
    </div>
  )
}

function QuranCardSection({ section, index }) {
  const [open, setOpen] = useState(true)

  if (!section) return null

  return (
    <div
      className={'qcards-section' + (open ? ' qcards-section--open' : '')}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <button
        className="qcards-section__header"
        onClick={() => setOpen(!open)}
        type="button"
        aria-expanded={open}
      >
        <span className="qcards-section__dot" />
        <h3 className="qcards-section__title">{section.title}</h3>
      </button>
      <div className="qcards-section__body">
        <p className="qcards-section__content">{section.content}</p>
      </div>
    </div>
  )
}
