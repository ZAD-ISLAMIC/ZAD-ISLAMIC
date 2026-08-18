import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  onWatchSnapshot,
  getWatchSnapshot,
  PRAYERS,
  formatPrayerDate,
  todayHijri,
} from '../services/prayerWatch.mjs'
import { loadConfig } from '../services/prayerConfig.mjs'
import { getPrayerLabels } from '../services/prayerConfig.mjs'
import { arabicDigits } from '../utils/arabic.mjs'
import { Icon } from '../components/ui/Icon.jsx'
import { LocationSheet } from '../components/prayer/LocationSheet.jsx'
import { SettingsSheet } from '../components/prayer/SettingsSheet.jsx'

const LABELS = getPrayerLabels()

export default function PrayerScreen() {
  const navigate = useNavigate()
  const [snapshot, setSnapshot] = useState(() => getWatchSnapshot())
  const [now, setNow] = useState(() => Date.now())
  const [showLocation, setShowLocation] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const config = (snapshot && snapshot.config) || loadConfig()
  const location = (snapshot && snapshot.location) || { label: '' }
  const locationText =
    (location && (location.cityAr || location.countryAr))
      ? [location.cityAr, location.countryAr].filter(Boolean).join('، ')
      : (location?.label || 'تحديد الموقع')

  // live clock for the countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // snapshot subscription (the global loop in main.jsx keeps it fresh)
  useEffect(() => {
    const off = onWatchSnapshot(setSnapshot)
    return off
  }, [])

  const events = snapshot?.events || []
  const nowMs = now
  const next = snapshot?.next

  /**
   * Match the native notification: find a prayer that fired within the last
   * 30 min. If found, show it counting up (+) from the adhan; otherwise show
   * the next upcoming prayer with a negative (−) countdown until its time.
   */
  const fired = currentFired(events, nowMs)
  const target = fired || next

  const remainingMs = next ? next.at - nowMs : 0
  const elapsedMs = fired ? nowMs - fired.at : 0

  const sign = fired ? '+' : '−'
  const countMs = Math.abs(fired ? elapsedMs : remainingMs)
  const countLabel = formatCountdown(countMs)
  const stateLabel = fired
    ? elapsedMs < 60_000
      ? 'حان وقت الأذان'
      : 'منذ الأذان'
    : 'حتى الأذان'

  const nextPrayerKey = next?.key
  const currentPrayerKey = fired?.key

  const hijri = useMemo(() => todayHijri(), [now, snapshot?.dayKey])
  
  return (
    <section className="screen prayer">
      <div className="prayer__hero">
        <div className="prayer__dates">
          <strong>{hijri}</strong>
          <span>{gregorianArabic(now)}</span>
          <span className="prayer__date-location">
            <Icon name="landmark" size={13} /> {locationText}
          </span>
        </div>

        <button className="prayer__city" onClick={() => setShowLocation(true)} type="button">
          <Icon name="map-pin" size={16} />
          <span>{locationText}</span>
          <Icon name="chevron-down" size={16} />
        </button>

        <div className="prayer__next">
          <span className="prayer__next-label">
            {fired ? 'الصلاة الحالية' : 'الصلاة القادمة'}
          </span>
          <h2 className="prayer__next-name">{target ? target.name : LABELS.fajr}</h2>
          <div className="prayer__countdown" dir="ltr">
            <span className={`prayer__sign${fired ? ' prayer__sign--plus' : ' prayer__sign--minus'}`}>
              {sign}
            </span>
            {Object.entries(countLabel).map(([unit, value]) => (
              <span className="prayer__count-block" key={unit}>
                <b>{arabicDigits(value)}</b>
                <small>{unit}</small>
              </span>
            ))}
          </div>
          <span className={`prayer__state${fired ? ' prayer__state--live' : ''}`}>{stateLabel}</span>
        </div>
      </div>

      <button className="prayer__settings" onClick={() => setShowSettings(true)} type="button">
        <Icon name="gear" size={16} />
        <span>إعدادات الحساب والطريقة</span>
        <Icon name="chevron-down" size={14} />
      </button>

      <button className="prayer__settings qibla-shortcut" onClick={() => navigate('/qibla')} type="button">
        <Icon name="kaaba" size={17} />
        <span>اتجاه القبلة</span>
        <Icon name="arrow-up" size={14} />
      </button>

      <ul className="prayer-list">
        {PRAYERS.map((key) => {
          const e = events.find((x) => x.key === key && x.atIso.slice(0, 10) === (snapshot?.dayKey || todayIso()))
          const isNext = nextPrayerKey === key
          const isCurrent = currentPrayerKey === key
          const timeStr = e
            ? formatPrayerDate(e.atIso, config.timeFormat12)
            : '—'
          return (
            <li key={key}>
              <div
                className={`prayer-row${isCurrent ? ' prayer-row--current' : ''}${isNext ? ' prayer-row--next' : ''}`}
              >
                <span className="prayer-row__name">{LABELS[key]}</span>
                <span className="prayer-row__status">
                  {isCurrent && <em>حالياً</em>}
                  {isNext && <em>التالي</em>}
                </span>
                <time className="prayer-row__time">{timeStr}</time>
              </div>
            </li>
          )
        })}
      </ul>

      {showLocation && <LocationSheet onClose={() => setShowLocation(false)} />}
      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}
    </section>
  )
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0
    ? { 'ساعة': h, 'دقيقة': m, 'ثانية': s }
    : { 'دقيقة': m, 'ثانية': s }
}

/**
 * The most recent prayer that went off, only while there is still a live
 * "since the adhan" window open (30 minutes). Returns null otherwise so the
 * UI falls back to the upcoming-prayer countdown.
 */
function currentFired(events, nowMs) {
  let best = null
  for (const e of events) {
    if (!e.isPrayer) continue // sunrise/shuruq is a time marker, not a prayer
    if (e.at <= nowMs && nowMs - e.at < 30 * 60 * 1000) {
      if (!best || e.at > best.at) best = e
    }
  }
  return best
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function gregorianArabic(ts) {
  const d = new Date(ts)
  const weekdays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
  const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
  return `${weekdays[d.getDay()]}، ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}