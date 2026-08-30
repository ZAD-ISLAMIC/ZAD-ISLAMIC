import { useEffect, useState } from 'react'
import { getNowMs, onConfigChange } from '../services/prayerConfig.mjs'

function format12(date) {
  const h = date.getHours()
  const h12 = h % 12 === 0 ? 12 : h % 12
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h12}:${m} ${h < 12 ? 'ص' : 'م'}`
}

/**
 * ساعة حالية بنظام 12 ساعة (أرقام لاتينية، ص/م بالعربية).
 * تتحدَّث عند بداية كل دقيقة عبر setTimeout مضبوط لحدّ الدقيقة التالية
 * فلا انحراف ولا عمل زمني زائد بين التحديثات.
 * تراعى إزاحة التوقيت المخصصة في الإعدادات، وتتغيّر فوراً عند التعديل.
 */
export function useClock() {
  const [tick, setTick] = useState(getNowMs())

  useEffect(() => {
    // تحديث فوري عند تغيير الإعدادات (مصدر الوقت)
    const unsub = onConfigChange(() => setTick(getNowMs()))

    let timer = 0
    const schedule = () => {
      const next = new Date(getNowMs())
      next.setSeconds(0, 0)
      next.setMilliseconds(0)
      next.setMinutes(next.getMinutes() + 1)
      timer = window.setTimeout(() => {
        setTick(getNowMs())
        schedule()
      }, next.getTime() - getNowMs())
    }

    schedule()
    return () => {
      unsub()
      window.clearTimeout(timer)
    }
  }, [])

  return format12(new Date(tick))
}