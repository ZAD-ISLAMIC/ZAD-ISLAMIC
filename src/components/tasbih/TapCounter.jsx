import React, { useEffect, useRef, useState } from 'react'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

/**
 * Simplified manual tap counter.
 *
 * Features:
 *  - Big circular tap zone with count + remaining
 *  - Progress ring around the tap zone
 *  - Undo / reset tiny buttons
 *  - Edit / delete buttons for the active (custom) dhikr
 *  - Horizontal pill selector to switch active dhikr
 *  - Done state with celebration
 */
export function TapCounter({
  dhikrs,
  activeId,
  counts,
  onCount,
  onUndo,
  onReset,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const confirmTimer = useRef(null)
  const active = dhikrs.find((d) => d.id === activeId) || dhikrs[0] || null

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
    }
  }, [])

  const requestDelete = () => {
    if (confirmingDelete) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
      confirmTimer.current = null
      setConfirmingDelete(false)
      onDelete(active)
      return
    }
    setConfirmingDelete(true)
    confirmTimer.current = setTimeout(() => setConfirmingDelete(false), 2600)
  }
  if (!active) {
    return (
      <div className="tap-stage tap-stage--empty">
        <p className="tap-stage__empty-text">لا يوجد أذكار بعد</p>
        <button className="tap-pill-add" onClick={onAdd}>
          <Icon name="plus" size={16} />
          إضافة ذكر
        </button>
      </div>
    )
  }

  const current = counts[active.id] || 0
  const target = active.target
  const isDone = current >= target
  const progress = target > 0 ? Math.min(100, (current / target) * 100) : 0
  const circumference = 2 * Math.PI * 122
  const remaining = Math.max(0, target - current)

  return (
    <div className="tap-stage">
      <div className="tap-ring">
        <svg className="tap-ring__svg" viewBox="0 0 270 270" aria-hidden="true">
          <circle
            className="tap-ring__bg"
            cx="135" cy="135" r="122"
            fill="none" strokeWidth="10"
          />
          <circle
            className="tap-ring__fg"
            cx="135" cy="135" r="122"
            fill="none" strokeWidth="10"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - (circumference * progress) / 100}
            strokeLinecap="round"
            transform="rotate(-90 135 135)"
          />
        </svg>

        <button
          className={'tap-btn' + (isDone ? ' tap-btn--done' : '')}
          onClick={onCount}
          aria-label={isDone ? 'تم الهدف' : `اضغط للتسبيح، تبقى ${remaining}`}
        >
          {isDone ? (
            <Icon name="check" size={52} />
          ) : (
            <span className="tap-btn__value">{arabicDigits(current)}</span>
          )}
        </button>
      </div>

      <p className="tap-stage__dhikr">{active.text}</p>

      <p className="tap-stage__meta">
        {isDone ? (
          <span className="tap-stage__done-label">أتممت الذكر، تقبل الله منك 🎉</span>
        ) : (
          <>
            <span>تبقّى </span>
            <strong>{arabicDigits(remaining)}</strong>
            <span> من {arabicDigits(target)}</span>
          </>
        )}
      </p>

      <div className="tap-stage__edit">
        <button className="tap-act" onClick={() => onEdit(active)} aria-label="تعديل الذكر">
          <Icon name="pencil" size={14} />
          تعديل
        </button>
        {active.custom && (
          <button
            className={'tap-act tap-act--danger' + (confirmingDelete ? ' tap-act--confirm' : '')}
            onClick={requestDelete}
            aria-label={confirmingDelete ? 'تأكيد حذف الذكر' : 'حذف الذكر'}
          >
            <Icon name="trash" size={14} />
            {confirmingDelete ? 'تأكيد الحذف؟' : 'حذف'}
          </button>
        )}
      </div>

      <div className="tap-stage__actions">
        <button
          className="tap-act tap-act--undo"
          onClick={onUndo}
          disabled={current === 0}
          aria-label="تراجع"
        >
          <Icon name="minus" size={16} />
        </button>
        <button
          className="tap-act tap-act--reset"
          onClick={() => onReset(active.id)}
          disabled={current === 0}
          aria-label="إعادة تعيين"
        >
          <Icon name="refresh" size={15} />
        </button>
      </div>

      {/* ---- dhikr pills ---- */}
      <div className="tap-pills" role="tablist" aria-label="اختيار الذكر">
        {dhikrs.map((dhikr) => {
          const isActive = activeId === dhikr.id
          const dhikrCurrent = counts[dhikr.id] || 0
          const dhikrDone = dhikrCurrent >= dhikr.target
          return (
            <button
              key={dhikr.id}
              role="tab"
              aria-selected={isActive}
              className={
                'tap-pill' +
                (isActive ? ' tap-pill--active' : '') +
                (dhikrDone ? ' tap-pill--done' : '')
              }
              onClick={() => onSelect(dhikr)}
            >
              <span className="tap-pill__text">{dhikr.text}</span>
              <span className="tap-pill__count">
                {arabicDigits(dhikrCurrent)}/{arabicDigits(dhikr.target)}
              </span>
            </button>
          )
        })}
        <button className="tap-pill-add" onClick={onAdd} aria-label="إضافة ذكر جديد">
          <Icon name="plus" size={16} />
        </button>
      </div>
    </div>
  )
}