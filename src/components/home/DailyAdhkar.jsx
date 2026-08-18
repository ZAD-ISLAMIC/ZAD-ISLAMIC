import React from 'react'
import { useNavigate } from 'react-router-dom'
import { getWatchSnapshot } from '../../services/prayerWatch.mjs'
import { pickAdhkarCategory } from '../../services/daily.mjs'
import { Icon } from '../ui/Icon.jsx'

function asrHourOf(snapshot) {
  const day = snapshot?.dayKey
  const e = (snapshot?.events || []).find(
    (x) => x.key === 'asr' && x.atIso.slice(0, 10) === day
  )
  if (!e) return null
  const d = new Date(e.at)
  return d.getHours() + d.getMinutes() / 60
}

export function DailyAdhkar() {
  const navigate = useNavigate()
  const category = pickAdhkarCategory({ asrHour: asrHourOf(getWatchSnapshot()) })
  const isMorning = category === 'morning'
  const path = isMorning ? '/adhkar/morning' : '/adhkar/evening'
  const title = isMorning ? 'أذكار الصباح' : 'أذكار المساء'
  const hint = isMorning ? 'ابدأ يومك بذكر الله' : 'اختم يومك بذكر الله'

  return (
    <button className={`home-adhkar home-adhkar--${isMorning ? 'morning' : 'evening'}`} onClick={() => navigate(path)} type="button">
      <span className="home-adhkar__icon">
        <Icon name={isMorning ? 'sun' : 'moon'} size={20} />
      </span>
      <span className="home-adhkar__body">
        <b>{title}</b>
        <small>{hint}</small>
      </span>
      <span className="home-adhkar__arrow">
        <Icon name="arrow-left" size={16} />
      </span>
    </button>
  )
}