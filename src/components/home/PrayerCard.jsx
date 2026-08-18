import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  onWatchSnapshot,
  getWatchSnapshot,
  formatPrayerDate,
} from '../../services/prayerWatch.mjs'
import { getPrayerLabels, loadConfig } from '../../services/prayerConfig.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

const CARD_PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']

export function PrayerCard() {
  const navigate = useNavigate()
  const [snapshot, setSnapshot] = useState(() => getWatchSnapshot())
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
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
    <button className="home-prayer" onClick={() => navigate('/prayer')} type="button">
      <div className="home-prayer__top">
        <span className="home-prayer__label">
          <Icon name="landmark" size={14} />
          مواقيت الصلاة
        </span>
        <span className="home-prayer__more">
          التفاصيل
          <Icon name="arrow-left" size={12} />
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
    </button>
  )
}