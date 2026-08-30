import React from 'react'
import { todayHijri, getWatchSnapshot } from '../../services/prayerWatch.mjs'
import { correctedNow } from '../../services/prayerConfig.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

function gregorianArabic(ts = correctedNow()) {
  const d = new Date(ts)
  const weekday = WEEKDAYS[d.getDay()]
  const day = arabicDigits(d.getDate())
  const month = MONTHS[d.getMonth()]
  const year = arabicDigits(d.getFullYear())
  return `${weekday}، ${day} ${month} ${year}`
}

export function HomeHero() {
  const snapshot = getWatchSnapshot()
  const location = snapshot?.location || {}
  const locationText =
    location.cityAr || location.countryAr
      ? [location.cityAr, location.countryAr].filter(Boolean).join('، ')
      : null

  return (
    <div className="home-hero">
      <p className="home-hero__greeting">بسم الله الرحمن الرحيم</p>
      <h2 className="home-hero__hijri">{todayHijri()}</h2>
      <p className="home-hero__gregorian">{gregorianArabic()}</p>
      <p className="home-hero__location">
        <span className="home-hero__dot" aria-hidden="true" />
        {locationText || 'مواقيت الصلاة حسب موقعك'}
      </p>
    </div>
  )
}