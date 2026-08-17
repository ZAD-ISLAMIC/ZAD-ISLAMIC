import { useEffect, useState } from 'react'

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
 */
export function useClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timer = 0

    const schedule = () => {
      const next = new Date()
      next.setSeconds(0, 0)
      next.setMilliseconds(0)
      next.setMinutes(next.getMinutes() + 1)
      timer = window.setTimeout(() => {
        setNow(new Date())
        schedule()
      }, next.getTime() - Date.now())
    }

    schedule()
    return () => window.clearTimeout(timer)
  }, [])

  return format12(now)
}