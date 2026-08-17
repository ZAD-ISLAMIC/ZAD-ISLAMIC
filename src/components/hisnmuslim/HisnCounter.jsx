import React from 'react'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

export function HisnCounter({ total, done, accent, onCount, onReset, onUndo, compact = false }) {
  const isDone = done >= total
  const hasCounted = done > 0
  const remaining = Math.max(0, total - done)
  const pct = total ? Math.min(100, (done / total) * 100) : 0
  const cls = 'hisn-count' + (compact ? ' hisn-count--compact' : '')

  return (
    <span
      className={cls}
      style={{ '--hisn-accent': accent, '--hisn-progress': `${pct}%` }}
    >
      <span className="hisn-count__ring">
        <button
          className={'hisn-count__btn' + (isDone ? ' hisn-count__btn--done' : '')}
          onClick={(event) => {
            event.stopPropagation()
            if (!isDone) onCount()
          }}
          aria-label={isDone ? 'تم الذكر' : `اضغط للعد، تبقى ${remaining}`}
        >
          {isDone ? (
            <>
              <Icon name="check" size={22} />
              <span className="hisn-count__label">تم</span>
            </>
          ) : (
            <>
              <strong>{arabicDigits(remaining)}</strong>
              <span className="hisn-count__label">{remaining > 1 ? 'مرات' : 'مرة'}</span>
            </>
          )}
        </button>
      </span>
      {isDone ? (
        <button
          className="hisn-count__chip"
          onClick={(event) => {
            event.stopPropagation()
            onReset()
          }}
          aria-label="إعادة الذكر من الصفر"
          title="إعادة الذكر"
        >
          <Icon name="refresh" size={13} />
        </button>
      ) : hasCounted ? (
        <button
          className="hisn-count__chip hisn-count__chip--undo"
          onClick={(event) => {
            event.stopPropagation()
            onUndo()
          }}
          aria-label="تراجع خطوة في العدّ"
          title="تراجع خطوة"
        >
          <Icon name="minus" size={13} />
        </button>
      ) : null}
    </span>
  )
}