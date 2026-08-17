import React, { useCallback, useMemo, useRef, useState } from 'react'
import { accentFor, getCategoryById } from '../../services/hisnmuslim.mjs'
import { copyText } from '../../services/device.mjs'
import { playSound, vibrate } from '../../services/sound.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'
import { HisnDoorActions } from './HisnAudioActions.jsx'
import { HisnItemCard } from './HisnItemCard.jsx'

export function HisnCategoryList({ categoryId, onBack }) {
  const category = getCategoryById(categoryId)
  const accent = category ? accentFor(category.category) : undefined
  const [counts, setCounts] = useState({})
  const [toast, setToast] = useState('')
  const [toastError, setToastError] = useState(false)
  const toastTimer = useRef(null)

  const showToast = useCallback((message, isError = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(message)
    setToastError(isError)
    toastTimer.current = setTimeout(() => setToast(''), 1600)
  }, [])

  // يُحسب من العدّ الجاري في الذاكرة فقط — لا يُحفظ عند الخروج من الصفحة.
  const doneTotal = useMemo(() => {
    if (!category) return 0
    return category.array.filter((item) => (counts[item.id] || 0) >= (item.count || 1)).length
  }, [counts, category])

  if (!category) {
    return (
      <div className="hisn-list">
        <p className="hisn-empty">الباب غير موجود</p>
      </div>
    )
  }

  const countFor = (item) => {
    const total = item.count || 1
    if ((counts[item.id] || 0) >= total) return
    const next = (counts[item.id] || 0) + 1
    setCounts((prev) => ({ ...prev, [item.id]: next }))
    if (next >= total) {
      playSound('done')
      vibrate([40, 50, 90])
    } else {
      playSound('tick')
      vibrate(12)
    }
  }

  const resetFor = (item) => {
    setCounts((prev) => {
      const next = { ...prev }
      delete next[item.id]
      return next
    })
    playSound('tick')
    vibrate(12)
  }

  const undoFor = (item) => {
    const current = counts[item.id] || 0
    if (current <= 0) return
    setCounts((prev) => ({ ...prev, [item.id]: Math.max((prev[item.id] || 0) - 1, 0) }))
    playSound('tick')
    vibrate(12)
  }

  const copy = async (event, item) => {
    event.stopPropagation()
    const ok = await copyText(item.text)
    showToast(ok ? 'تم النسخ' : 'تعذر النسخ', !ok)
  }

  return (
    <div className="hisn-list">
      <div className="hisn-list__topbar">
        <button className="quran-reader__back" onClick={onBack}>
          <Icon name="arrow-right" size={22} />
          <span>الأقسام</span>
        </button>
        <span className="hisn-list__title" style={{ color: accent }}>
          {category.category}
        </span>
        <span className="hisn-list__count">{arabicDigits(category.array.length)} ذكر</span>
      </div>

      {toast && (
        <p
          className={'hisn-toast' + (toastError ? ' hisn-toast--error' : '')}
          role="status"
          aria-live="polite"
        >
          {toastError ? <Icon name="alert" size={15} /> : <Icon name="check" size={15} />}
          {toast}
        </p>
      )}

      <HisnDoorActions category={category} />

      <div className="hisn-list__progress" style={{ '--hisn-accent': accent }}>
        <span className="hisn-list__progress-label">
          <Icon name="check" size={15} />
          أنجزت اليوم {arabicDigits(doneTotal)} من {arabicDigits(category.array.length)} أذكار
        </span>
        <span className="hisn-list__progress-bar">
          <span style={{ width: `${category.array.length ? (doneTotal / category.array.length) * 100 : 0}%` }} />
        </span>
      </div>

      <ul className="hisn-list__items">
        {category.array.map((item, index) => (
          <li key={item.id}>
            <HisnItemCard
              category={category}
              item={item}
              index={index}
              accent={accent}
              count={counts[item.id] || 0}
              onCount={() => countFor(item)}
              onReset={() => resetFor(item)}
              onUndo={() => undoFor(item)}
              onCopy={(event) => copy(event, item)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}