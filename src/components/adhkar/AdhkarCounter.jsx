import React from 'react'
import { arabicDigits } from '../../services/quran.mjs'
import { Icon } from '../ui/Icon.jsx'

export function AdhkarCounter({ total, done, accent, onCount, onReset }) {
  const isDone = done >= total
  const remaining = Math.max(0, total - done)

  return (
    <span className="adhkar-count">
      <button
        className={'adhkar-count__btn' + (isDone ? ' adhkar-count__btn--done' : '')}
        style={{ '--count-accent': accent }}
        onClick={(event) => {
          event.stopPropagation()
          if (!isDone) onCount()
        }}
        aria-label={isDone ? 'تم الذكر' : `اضغط للعد، تبقى ${remaining}`}
      >
        {isDone ? (
          <>
            <Icon name="check" size={20} />
            <span className="adhkar-count__label">تم</span>
          </>
        ) : (
          <>
            <strong>{arabicDigits(remaining)}</strong>
            <span className="adhkar-count__label">
              {remaining > 1 ? 'مرات' : 'مرة'}
            </span>
          </>
        )}
      </button>
      {isDone && (
        <button
          className="adhkar-count__reset"
          onClick={(event) => {
            event.stopPropagation()
            onReset()
          }}
          aria-label="إعادة التسبيح"
        >
          <Icon name="refresh" size={14} />
        </button>
      )}
    </span>
  )
}