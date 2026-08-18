import React from 'react'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

function AttachmentBadges({ attachments }) {
  const list = attachments || []
  if (list.length === 0) return null
  const hasPdf = list.some((a) => a.ext === 'pdf')
  const docs = list.filter((a) => a.ext !== 'pdf').length
  return (
    <span className="kht-item__files" aria-label="المرفقات">
      {hasPdf && (
        <span className="kht-item__file kht-item__file--pdf">
          <Icon name="file-pdf" size={12} />
          PDF
        </span>
      )}
      {docs > 0 && (
        <span className="kht-item__file">
          <Icon name="file" size={12} />
          {arabicDigits(docs)} DOC
        </span>
      )}
    </span>
  )
}

export function KhutbahListItem({ khutbah, index, onOpen }) {
  return (
    <button className="kht-item" onClick={() => onOpen(khutbah.id)}>
      <span className="kht-item__num">{arabicDigits(index + 1)}</span>
      <span className="kht-item__body">
        <span className="kht-item__title">{khutbah.title}</span>
        <span className="kht-item__meta">
          {khutbah.author && <em>{khutbah.author}</em>}
          {khutbah.year > 0 && <em className="kht-item__year">{arabicDigits(khutbah.year)}</em>}
          <AttachmentBadges attachments={khutbah.attachments} />
        </span>
      </span>
      <Icon name="arrow-right" size={17} className="kht-item__arrow" />
    </button>
  )
}
