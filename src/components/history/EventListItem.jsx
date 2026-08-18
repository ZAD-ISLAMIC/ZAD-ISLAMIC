import React from 'react'
import { arabicDigits } from '../../utils/arabic.mjs'
import { formatEventDate } from '../../services/history.mjs'
import { Icon } from '../ui/Icon.jsx'

export function EventListItem({ event, index, onOpen }) {
  const date = formatEventDate(event)

  return (
    <button className="hist-item" onClick={() => onOpen(event.id)}>
      <span className="hist-item__num">{arabicDigits(index + 1)}</span>
      <span className="hist-item__body">
        <span className="hist-item__title">{event.title}</span>
        {date && <span className="hist-item__date">{date}</span>}
      </span>
      <Icon name="arrow-right" size={17} className="hist-item__arrow" />
    </button>
  )
}