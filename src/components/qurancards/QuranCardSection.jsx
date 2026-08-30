import React from 'react'

export function QuranCardSection({ section }) {
  if (!section) return null

  return (
    <div className="qcards-section">
      <h3 className="qcards-section__title">{section.title}</h3>
      <p className="qcards-section__content">{section.content}</p>
    </div>
  )
}
