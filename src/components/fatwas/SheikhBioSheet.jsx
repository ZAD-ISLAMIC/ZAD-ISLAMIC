import React, { useEffect } from 'react'
import { SHEIKH_BIO } from '../../services/fatwas.mjs'
import { openExternal } from '../../services/device.mjs'
import { Icon } from '../ui/Icon.jsx'

export function SheikhBioSheet({ onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="bio-sheet" role="dialog" aria-modal="true" aria-label="نبذة عن الشيخ ابن باز">
      <div className="bio-sheet__backdrop" onClick={onClose} />
      <div className="bio-sheet__card">
        <div className="bio-sheet__head">
          <strong className="bio-sheet__title">
            <Icon name="feather" size={17} />
            {SHEIKH_BIO.name}
          </strong>
          <button
            className="bio-sheet__close"
            aria-label="إغلاق"
            onClick={onClose}
          >
            <Icon name="close" size={17} />
          </button>
        </div>

        <div className="bio-sheet__body">
          <p className="bio-sheet__full">{SHEIKH_BIO.paragraph}</p>

          <ul className="bio-sheet__facts">
            {SHEIKH_BIO.facts.map((fact) => (
              <li key={fact.label}>
                <span className="bio-sheet__fact-label">{fact.label}</span>
                <span className="bio-sheet__fact-value">{fact.value}</span>
              </li>
            ))}
          </ul>

          <p className="bio-sheet__note">{SHEIKH_BIO.note}</p>

          <a
            className="bio-sheet__link"
            href={SHEIKH_BIO.sourceUrl}
            onClick={(e) => {
              e.preventDefault()
              openExternal(SHEIKH_BIO.sourceUrl)
            }}
          >
            <Icon name="external" size={15} />
            الموقع الرسمي للشيخ
          </a>
        </div>
      </div>
    </div>
  )
}