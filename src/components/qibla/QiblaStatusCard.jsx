import React from 'react'
import { Icon } from '../ui/Icon.jsx'
import { arabicDigits } from '../../utils/arabic.mjs'
import { cardinalName, formatDistance } from '../../utils/qiblaMath.mjs'

function accuracyLabel(headingAccuracy) {
  if (!headingAccuracy) return { ok: true, label: 'دقة متوسطة ±15°' }
  if (headingAccuracy.calibrated === false) {
    return { ok: false, label: 'عيّر جهازك: حرّكه على شكل 8' }
  }
  switch (headingAccuracy.level) {
    case 3:
      return { ok: true, label: 'دقة عالية ±5°' }
    case 1:
      return { ok: true, label: 'دقة منخفضة ±35°' }
    default:
      return { ok: true, label: 'دقة متوسطة ±15°' }
  }
}

function deg(value) {
  return value == null ? '—' : arabicDigits(Math.round(value))
}

export function QiblaStatusCard({ heading, qiblaBearing, headingAccuracy, distanceKm }) {
  const cal = accuracyLabel(headingAccuracy)

  return (
    <div className="qibla-stats">
      <span className={'qibla-acc' + (cal.ok ? '' : ' qibla-acc--warn')} role="status">
        <Icon name={cal.ok ? 'check' : 'refresh'} size={13} />
        {cal.label}
      </span>

      <ul className="qibla-stats__grid">
        <li>
          <small>قراءة البوصلة</small>
          <b dir="ltr">{deg(heading)}°</b>
          <em>{heading == null ? '' : cardinalName(heading)}</em>
        </li>
        <li>
          <small>اتجاه القبلة</small>
          <b dir="ltr">{deg(qiblaBearing)}°</b>
          <em>{Number.isFinite(qiblaBearing) ? cardinalName(qiblaBearing) : '—'}</em>
        </li>
        <li>
          <small>المسافة إلى الكعبة</small>
          <b>{formatDistance(distanceKm) || '—'}</b>
          <em>على نفس الاتجاه</em>
        </li>
      </ul>
    </div>
  )
}