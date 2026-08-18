import React, { useCallback, useRef, useState } from 'react'
import { buildShareText, formatDate, KHUTBAA_URL } from '../../services/khutbah.mjs'
import { copyText, openExternal } from '../../services/device.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'
import { AttachmentCard } from './AttachmentCard.jsx'
import { KhutbahContent } from './KhutbahContent.jsx'

function useOnline() {
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine
  )
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

export function KhutbahDetail({ khutbah, category, prevKhutbah, nextKhutbah, onNavigate }) {
  const online = useOnline()
  const [toast, setToast] = useState('')
  const [toastError, setToastError] = useState(false)
  const toastTimer = useRef(null)

  const showToast = useCallback((message, isError = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(message)
    setToastError(isError)
    toastTimer.current = setTimeout(() => setToast(''), 2200)
  }, [])

  const onCopy = async () => {
    const ok = await copyText(buildShareText(khutbah))
    showToast(ok ? 'تم نسخ الخطبة' : 'تعذّر النسخ', !ok)
  }

  const onSource = () => {
    openExternal(khutbah.url || KHUTBAA_URL)
  }

  if (!khutbah) return null

  const attachments = khutbah.attachments || []
  const date = formatDate(khutbah.created_at)

  return (
    <article className="kht-detail">
      {toast && (
        <p
          className={'kht-toast' + (toastError ? ' kht-toast--error' : '')}
          role="status"
          aria-live="polite"
        >
          {toastError ? <Icon name="alert" size={15} /> : <Icon name="check" size={15} />}
          {toast}
        </p>
      )}

      <div className="kht-detail__meta">
        <span className="kht-detail__cat">
          <Icon name="minbar" size={13} />
          {category?.name || 'خطبة'}
        </span>
        <span className="kht-detail__num"># {arabicDigits(khutbah.id)}</span>
      </div>

      {!online && (
        <div className="kht-offline">
          <Icon name="wifi-off" size={16} />
          <span>
            لا يوجد اتصال بالإنترنت — تُفتح المرفقات المحفوظة فقط، والتحميل يعود تلقائياً عند الاتصال.
          </span>
        </div>
      )}

      <header className="kht-detail__head">
        <h1 className="kht-detail__title">{khutbah.title}</h1>
        <p className="kht-detail__byline">
          {khutbah.author && (
            <span className="kht-detail__author">
              <Icon name="mic" size={14} />
              {khutbah.author}
            </span>
          )}
          {date && (
            <span className="kht-detail__date">
              <Icon name="calendar" size={14} />
              {date}
            </span>
          )}
        </p>
        {khutbah.categories && khutbah.categories.length > 0 && (
          <ul className="kht-detail__cats" aria-label="فئات الخطبة">
            {khutbah.categories.map((c) => (
              <li key={c}>
                <span className="kht-detail__chip">{c}</span>
              </li>
            ))}
          </ul>
        )}
      </header>

      {attachments.length > 0 && (
        <section className="kht-detail__attachments" aria-label="مرفقات الخطبة">
          <h2 className="kht-detail__sub">
            <Icon name="file" size={15} />
            المرفقات
            <span className="kht-detail__sub-note">PDF / Word</span>
          </h2>
          <div className="kht-att-list">
            {attachments.map((att) => (
              <AttachmentCard
                key={att.name}
                khutbah={khutbah}
                attachment={att}
                onMessage={showToast}
              />
            ))}
          </div>
        </section>
      )}

      <section className="kht-detail__body">
        <h2 className="kht-detail__sub">
          <Icon name="book-open" size={15} />
          نص الخطبة
        </h2>
        <KhutbahContent content={khutbah.content} />
      </section>

      <div className="kht-detail__actions">
        <button className="kht-act__btn" onClick={onCopy} aria-label="نسخ الخطبة كاملة مع المصدر">
          <Icon name="copy" size={14} />
          نسخ
        </button>
        <button
          className="kht-act__btn kht-act__btn--source"
          onClick={onSource}
          aria-label="فتح مصدر الخطبة على موقع ملتقى الخطباء"
          title="المصدر على موقع ملتقى الخطباء"
        >
          <Icon name="external" size={14} />
          المصدر
        </button>
      </div>

      {(prevKhutbah || nextKhutbah) && (
        <div className="kht-detail__nav">
          {prevKhutbah ? (
            <button className="kht-detail__nav-btn" onClick={() => onNavigate(prevKhutbah.id)}>
              <Icon name="arrow-right" size={16} />
              <span className="kht-detail__nav-text">
                <em>السابقة</em>
                <strong>{prevKhutbah.title}</strong>
              </span>
            </button>
          ) : (
            <span />
          )}
          {nextKhutbah ? (
            <button className="kht-detail__nav-btn kht-detail__nav-btn--next" onClick={() => onNavigate(nextKhutbah.id)}>
              <span className="kht-detail__nav-text">
                <em>التالية</em>
                <strong>{nextKhutbah.title}</strong>
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
