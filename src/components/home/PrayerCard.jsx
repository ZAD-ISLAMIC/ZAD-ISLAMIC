import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  onWatchSnapshot,
  getWatchSnapshot,
  formatPrayerDate,
} from '../../services/prayerWatch.mjs'
import { getPrayerLabels, loadConfig, getNowMs } from '../../services/prayerConfig.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'
import { useSheets } from '../layout/SheetContext.jsx'

const CARD_PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']

export const PrayerCard = React.memo(function PrayerCard() {
  const navigate = useNavigate()
  const { openSettings } = useSheets()
  const [snapshot, setSnapshot] = useState(() => getWatchSnapshot())
  const [now, setNow] = useState(() => getNowMs())

  useEffect(() => {
    let raf
    let last = 0
    const tick = (ts) => {
      if (ts - last >= 1000) {
        last = ts
        setNow(getNowMs())
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => onWatchSnapshot(setSnapshot), [])

  const config = snapshot?.config || loadConfig()
  const labels = getPrayerLabels()
  const next = snapshot?.next
  const events = snapshot?.events || []
  const dayKey = snapshot?.dayKey || new Date().toISOString().slice(0, 10)

  const remainingMs = next ? Math.max(0, next.at - now) : 0
  const total = Math.floor(remainingMs / 1000)
  const pad = (n) => String(n).padStart(2, '0')
  const countdown = `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`

  return (
    <div className="home-prayer" onClick={() => navigate('/prayer')}>
      <div className="home-prayer__top">
        <span className="home-prayer__label">
          <Icon name="landmark" size={14} />
          مواقيت الصلاة
        </span>
        <span className="home-prayer__actions">
          <button
            className="home-prayer__settings-btn"
            onClick={(e) => { e.stopPropagation(); openSettings(); }}
            aria-label="إعدادات المواقيت"
            type="button"
          >
            <Icon name="gear" size={14} />
          </button>
        </span>
      </div>

      <div className="home-prayer__next">
        <div className="home-prayer__next-info">
          <span className="home-prayer__next-label">الصلاة القادمة</span>
          <h3 className="home-prayer__next-name">{next ? next.name : '—'}</h3>
        </div>
        <time className="home-prayer__count" dir="ltr">
          {arabicDigits(countdown)}
        </time>
      </div>

      <div className="home-prayer__times">
        {CARD_PRAYERS.map((key) => {
          const e = events.find((x) => x.key === key && x.atIso.slice(0, 10) === dayKey)
          return (
            <div className="home-prayer__tile" key={key}>
              <span>{labels[key]}</span>
              <b>{e ? formatPrayerDate(e.atIso, config.timeFormat12) : '—'}</b>
            </div>
          )
        })}
      </div>
    </div>
  )
})
