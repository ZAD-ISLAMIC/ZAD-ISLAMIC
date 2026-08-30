import React from 'react'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

export function QuranCardItem({ card, onOpen, onPlay, isPlaying, isPaused }) {
  const onPlayClick = (e) => {
    e.stopPropagation()
    onPlay(card.number)
  }

  const showPause = isPlaying || isPaused

  return (
    <button className="qcards-item" type="button" onClick={() => onOpen(card.number)}>
      <span className="qcards-item__num">{arabicDigits(card.number)}</span>
      <span className="qcards-item__body">
        <strong className="qcards-item__name">{card.name_arabic}</strong>
        <span className="qcards-item__english">{card.name_english}</span>
        <span className="qcards-item__meta">
          {arabicDigits(card.ayahs_count)} آية • {card.revelation_type}
        </span>
      </span>
      <span
        className={
          'qcards-item__play' +
          (isPlaying ? ' qcards-item__play--active' : '') +
          (isPaused ? ' qcards-item__play--paused' : '')
        }
        onClick={onPlayClick}
        role="button"
        tabIndex={-1}
        aria-label={isPlaying ? `إيقاف ${card.name_arabic}` : `تشغيل ${card.name_arabic}`}
      >
        <Icon name={showPause ? 'pause' : 'play'} size={16} />
      </span>
      <span className="qcards-item__arrow" aria-hidden="true">
        <Icon name="chevron-down" size={14} />
      </span>
    </button>
  )
}
