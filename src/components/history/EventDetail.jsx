import React, { useCallback, useRef, useState } from 'react'
import { buildShareText, eventDateChips } from '../../services/history.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { copyText } from '../../services/device.mjs'
import { Icon } from '../ui/Icon.jsx'

export function EventDetail({ event, era, prevEvent, nextEvent, onNavigate }) {
  const [toast, setToast] = useState('')
  const [toastError, setToastError] = useState(false)
  const toastTimer = useRef(null)

  const showToast = useCallback((message, isError = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(message)
    setToastError(isError)
    toastTimer.current = setTimeout(() => setToast(''), 1800)
  }, [])

  const onCopy = async () => {
    const ok = await copyText(buildShareText(event, era?.title))
    showToast(ok ? 'تم نسخ الحدث' : 'تعذّر النسخ', !ok)
  }

  if (!event) return null

  const chips = eventDateChips(event)

  return (
    <article className="hist-detail">
      {toast && (
        <p
          className={'hist-toast' + (toastError ? ' hist-toast--error' : '')}
          role="status"
          aria-live="polite"
        >
          {toastError ? (
            <Icon name="alert" size={15} />
          ) : (
            <Icon name="check" size={15} />
          )}
          {toast}
        </p>
      )}

      <div className="hist-detail__meta">
        <span className="hist-detail__era">{era?.title || 'حدث'}</span>
        <span className="hist-detail__num"># {arabicDigits(event.id)}</span>
      </div>

      <h1 className="hist-detail__title">{event.title}</h1>

      {chips.length > 0 && (
        <div className="hist-detail__chips">
          {chips.map((chip, i) => (
            <span key={i} className="hist-detail__chip">
              <Icon name="calendar" size={13} />
              {chip}
            </span>
          ))}
        </div>
      )}

      <section className="hist-detail__text">
        <p>{event.text}</p>
      </section>

      <div className="hist-detail__actions">
        <button className="hist-act__btn" onClick={onCopy} aria-label="نسخ الحدث">
          <Icon name="copy" size={14} />
          نسخ
        </button>
      </div>

      {(prevEvent || nextEvent) && (
        <div className="hist-detail__nav">
          {prevEvent ? (
            <button
              className="hist-detail__nav-btn"
              onClick={() => onNavigate(prevEvent.id)}
            >
              <Icon name="arrow-right" size={16} />
              <span className="hist-detail__nav-text">
                <em>السابق</em>
                <strong>{prevEvent.title}</strong>
              </span>
            </button>
          ) : (
            <span />
          )}
          {nextEvent ? (
            <button
              className="hist-detail__nav-btn hist-detail__nav-btn--next"
              onClick={() => onNavigate(nextEvent.id)}
            >
              <span className="hist-detail__nav-text">
                <em>التالي</em>
                <strong>{nextEvent.title}</strong>
              </span>
              <Icon name="arrow-left" size={16} />
            </button>
          ) : (
            <span />
          )}
        </div>
      )}
    </article>
  )
}