import React from 'react'
import { Icon } from '../ui/Icon.jsx'
import { arabicDigits } from '../../utils/arabic.mjs'

/**
 * Alignment semicircle gauge: a 180° arc whose filled portion grows as the
 * device turns toward the Qibla (delta → 0). Pure decoration, no SVG math
 * beyond a dasharray on a fixed path.
 */
function DeltaArc({ delta }) {
  const abs = Math.min(180, Math.abs(delta))
  const total = 226 // approximate path length of the semicircle
  const pct = Math.max(0, Math.min(1, (180 - abs) / 180))
  return (
    <svg className="qibla-arc" viewBox="0 0 120 60" aria-hidden="true">
      <path
        className="qibla-arc__track"
        d="M 10 54 A 50 50 0 0 1 110 54"
      />
      <path
        className="qibla-arc__fill"
        d="M 10 54 A 50 50 0 0 1 110 54"
        style={{
          strokeDasharray: total,
          strokeDashoffset: total * (1 - pct),
        }}
      />
    </svg>
  )
}

/**
 * The big actionable readout: "turn N° right/left" with a tipped arrow, or a
 * green all-clear when aligned within 2°.
 */
export function QiblaDelta({ delta, aligned }) {
  const abs = Math.round(Math.abs(delta || 0))
  const side = (delta || 0) > 0 ? 'يمينك' : 'يسارك'
  // CSS rotate is clockwise for positive angle → tips the up-arrow right when
  // the Qibla lies to the right.
  const arrowDeg = Math.max(-90, Math.min(90, delta || 0))

  if (aligned) {
    return (
      <div className="qibla-delta qibla-delta--ok">
        <DeltaArc delta={delta} />
        <div className="qibla-delta__ok">
          <span className="qibla-delta__badge">
            <Icon name="check" size={22} />
          </span>
          <strong>أنت متجه نحو القبلة</strong>
        </div>
      </div>
    )
  }

  if (delta == null) {
    // No GPS location yet → the bearing is unknown; don't show a fake 0°.
    return (
      <div className="qibla-delta">
        <DeltaArc delta={null} />
        <div className="qibla-delta__pending">
          <span className="qibla-delta__arrow" style={{ transform: 'rotate(0deg)' }}>
            <Icon name="map-pin" size={24} />
          </span>
          <div className="qibla-delta__turn-text">
            <small>انتظر التحديد…</small>
            <strong>حدّد موقعك عبر GPS</strong>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="qibla-delta">
      <DeltaArc delta={delta} />
      <div className="qibla-delta__turn">
        <span className="qibla-delta__arrow" style={{ transform: `rotate(${arrowDeg}deg)` }}>
          <Icon name="arrow-up" size={30} />
        </span>
        <div className="qibla-delta__turn-text">
          <small>انعطف</small>
          <strong>
            {arabicDigits(abs)}° إلى {side}
          </strong>
        </div>
      </div>
    </div>
  )
}