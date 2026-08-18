import React from 'react'
import { Icon } from '../ui/Icon.jsx'
import { normalizeDeg } from '../../utils/qiblaMath.mjs'

const TICKS = Array.from({ length: 24 }, (_, i) => i * 15)

const CARDINALS = [
  { deg: 0, label: 'شمال' },
  { deg: 90, label: 'شرق' },
  { deg: 180, label: 'جنوب' },
  { deg: 270, label: 'غرب' },
]

// Small degree labels every 30 on the rotating dial.
const DEG_LABELS = [30, 60, 120, 150, 210, 240, 300, 330]

function polar(deg, r) {
  const a = (deg * Math.PI) / 180
  return { x: 150 + r * Math.sin(a), y: 150 - r * Math.cos(a) }
}

// Dial radii (viewBox 300×300, center 150,150): outer ring 132, inner ring 124,
// tick outer 125, minor inner 118, major inner 106, degree label 97, letter 80.

/**
 * The compass: a rotating dial (cardinal letters + degree ticks) counter-rotated
 * by `-heading` so its North marks real north, a fixed pointer at the top that
 * tracks the device's facing direction, and a Kaaba needle rotated by
 * `qiblaBearing - heading` so it lands under the top pointer when aligned.
 */
export function QiblaCompass({ status, heading, qiblaBearing, delta, aligned }) {
  const h = heading == null ? 0 : heading
  const haveBearing = Number.isFinite(qiblaBearing)
  const needleRot = haveBearing ? normalizeDeg(qiblaBearing - h) : 0
  const calib = status === 'calib-required'

  const cls = [
    'qibla-dial',
    aligned ? 'qibla-dial--aligned' : '',
    calib ? 'qibla-dial--calib' : '',
    status === 'starting' ? 'qibla-dial--starting' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls}>
      <svg
        className="qibla-dial__svg"
        viewBox="0 0 300 300"
        role="img"
        aria-label="بوصلة اتجاه القبلة"
      >
        <circle cx="150" cy="150" r="132" className="qibla-dial__ring" />
        <circle cx="150" cy="150" r="124" className="qibla-dial__ring-inner" />

        {/* Rotating dial: ticks + degree labels + cardinal letters */}
        <g
          className="qibla-dial__rotor"
          style={{ transform: `rotate(${-h}deg)`, transformOrigin: '150px 150px' }}
        >
          {TICKS.map((a) => {
            const major = a % 90 === 0
            const p1 = polar(a, major ? 106 : 118)
            const p2 = polar(a, 125)
            return (
              <line
                key={a}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                className={major ? 'qibla-dial__tick qibla-dial__tick--major' : 'qibla-dial__tick'}
              />
            )
          })}
          {DEG_LABELS.map((a) => {
            const p = polar(a, 97)
            return (
              <text key={a} x={p.x} y={p.y + 3.5} className="qibla-dial__num" textAnchor="middle">
                {a}
              </text>
            )
          })}
          {CARDINALS.map(({ deg, label }) => {
            const p = polar(deg, 80)
            return (
              <text
                key={deg}
                x={p.x}
                y={p.y + 4.5}
                className="qibla-dial__card"
                textAnchor="middle"
              >
                {label}
              </text>
            )
          })}
        </g>

        {/* Fixed heading marker at the top (the device's facing direction) */}
        <polygon points="150,4 143,16 157,16" className="qibla-dial__index" />

        {/* Kaaba needle — points at the Qibla relative to the device top */}
        {heading != null && haveBearing && (
          <g
            className="qibla-dial__needle"
            style={{ transform: `translate(150px, 150px) rotate(${needleRot}deg)` }}
          >
            <line x1="0" y1="24" x2="0" y2="-116" className="qibla-dial__shaft" />
            <polygon points="0,-134 7,-118 -7,-118" className="qibla-dial__head" />
            <g transform="translate(-15,-96)">
              <Icon name="kaaba" size={30} />
            </g>
          </g>
        )}

        {/* Center hub */}
        <circle cx="150" cy="150" r="13" className="qibla-dial__hub" />
        <circle cx="150" cy="150" r="4.5" className="qibla-dial__dot" />
      </svg>

      {status === 'starting' && (
        <div className="qibla-dial__state">
          <span className="qibla-dial__spinner" aria-hidden="true" />
          <span>جارٍ قراءة المستشعر…</span>
        </div>
      )}
    </div>
  )
}