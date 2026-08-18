import React, { useCallback, useRef, useState } from 'react'
import {
  buildShareText,
  stripAnswerLabel,
  SHEIKH_SOURCE_URL,
} from '../../services/fatwas.mjs'
import { copyText, openExternal } from '../../services/device.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'
import { FatwaAudioActions } from './FatwaAudioActions.jsx'

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  React.useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

export function FatwaDetail({ fatwa, category, prevFatwa, nextFatwa, onNavigate }) {
  const online = useOnline()
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
    const ok = await copyText(
      buildShareText(fatwa, category?.name)
    )
    showToast(ok ? 'تم نسخ الفتوى' : 'تعذّر النسخ', !ok)
  }

  const onSource = () => {
    openExternal(fatwa.link || SHEIKH_SOURCE_URL)
  }

  if (!fatwa) return null

  return (
    <article className="fat-detail">
      {toast && (
        <p
          className={
            'fat-toast' + (toastError ? ' fat-toast--error' : '')
          }
          role="status"
          aria-live="polite"
        >
          {toastError ? <Icon name="alert" size={15} /> : <Icon name="check" size={15} />}
          {toast}
        </p>
      )}

      <div className="fat-detail__meta">
        <span className="fat-detail__cat">{category?.name || 'فتوى'}</span>
        <span className="fat-detail__num"># {arabicDigits(fatwa.id)}</span>
      </div>

      {!online && (
        <div className="fat-offline">
          <Icon name="wifi-off" size={16} />
          <span>
            لا يوجد اتصال بالإنترنت — تُشغَّل الصوتيات المحفوظة فقط
          </span>
        </div>
      )}

      <section className="fat-detail__qcard">
        {fatwa.title && fatwa.title !== fatwa.question && (
          <p className="fat-detail__qtitle">{fatwa.title}</p>
        )}
        <h1 className="fat-detail__question">{fatwa.question || fatwa.title}</h1>
      </section>

      <section className="fat-detail__answer">
        <span className="fat-detail__answer-label">
          <Icon name="feather" size={13} />
          الجواب
        </span>
        <p className="fat-detail__answer-text">
          {stripAnswerLabel(fatwa.answer) ||
            'لم يرد نص الجواب هنا — يمكنك مراجعة المصدر للحصول على التفاصيل الكاملة.'}
        </p>
      </section>

      <div className="fat-detail__actions">
        <FatwaAudioActions fatwa={fatwa} categoryName={category?.name} />
        <button className="fatwa-act__btn" onClick={onCopy} aria-label="نسخ الفتوى مع رابط الصوتية والمصدر">
          <Icon name="copy" size={14} />
          نسخ
        </button>
        <button
          className="fatwa-act__btn fatwa-act__btn--source"
          onClick={onSource}
          aria-label="فتح مصدر الفتوى على موقع الشيخ الرسمي"
          title="المصدر على موقع الشيخ الرسمي"
        >
          <Icon name="external" size={14} />
          المصدر
        </button>
      </div>

      {(prevFatwa || nextFatwa) && (
        <div className="fat-detail__nav">
          {prevFatwa ? (
            <button
              className="fat-detail__nav-btn"
              onClick={() => onNavigate(prevFatwa.id)}
            >
              <Icon name="arrow-right" size={16} />
              <span className="fat-detail__nav-text">
                <em>السابقة</em>
                <strong>{prevFatwa.title || prevFatwa.question}</strong>
              </span>
            </button>
          ) : (
            <span />
          )}
          {nextFatwa ? (
            <button
              className="fat-detail__nav-btn fat-detail__nav-btn--next"
              onClick={() => onNavigate(nextFatwa.id)}
            >
              <span className="fat-detail__nav-text">
                <em>التالية</em>
                <strong>{nextFatwa.title || nextFatwa.question}</strong>
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