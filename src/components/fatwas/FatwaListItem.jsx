import React from 'react'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

export function FatwaListItem({ fatwa, index, onOpen }) {
  return (
    <button className="fatwa-item" onClick={() => onOpen(fatwa.id)}>
      <span className="fatwa-item__num">{arabicDigits(index + 1)}</span>
      <span className="fatwa-item__body">
        <span className="fatwa-item__title">
          {fatwa.title || fatwa.question}
        </span>
        {fatwa.audio && (
          <span className="fatwa-item__tag">
            <Icon name="volume" size={12} />
            صوتية
          </span>
        )}
      </span>
      <Icon name="arrow-right" size={17} className="fatwa-item__arrow" />
    </button>
  )
}