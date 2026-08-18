import React, { useCallback, useRef, useState } from 'react'
import { buildShareText, stripLeadingMarker } from '../../services/tafseer.mjs'
import { copyText } from '../../services/device.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

export function TafseerVerseCard({
  record,
  surah,
  expanded,
  active,
  quranSize,
  registerRef,
  onToggle,
  onOpenMushaf,
}) {
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef(null)

  const onCopy = useCallback(async () => {
    if (copyTimer.current) clearTimeout(copyTimer.current)
    const ok = await copyText(buildShareText(record, surah.nameAr))
    setCopied(ok)
    copyTimer.current = setTimeout(() => setCopied(false), 1400)
  }, [record, surah.nameAr])

  const tafseer = stripLeadingMarker(record.aya_tafseer, record.aya_no)

  return (
    <article
      ref={registerRef}
      className={
        'tverse' +
        (active ? ' tverse--active' : '') +
        (expanded ? ' tverse--expanded' : '')
      }
      data-verse={record.aya_no}
      style={{ '--tafseer-ayah-size': `${quranSize}px` }}
    >
      <button
        className="tverse__head"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="tverse__marker">
          <span className="tverse__marker-ring">۝</span>
          <span className="tverse__marker-num">{arabicDigits(record.aya_no)}</span>
        </span>
        <span className="tverse__ayah">{record.aya_text}</span>
        <span className="tverse__chevron" aria-hidden="true">
          <Icon name="chevron-down" size={18} />
        </span>
      </button>

      <div className="tverse__body">
        <div className="tverse__body-inner">
          <div className="tverse__content">
            <span className="tverse__label">
              <Icon name="book-open" size={13} />
              التفسير الميسر
            </span>
            <p className="tverse__tafseer">{tafseer}</p>
          </div>

          <div className="tverse__actions">
            <button
              className={`tverse__btn${copied ? ' tverse__btn--ok' : ''}`}
              onClick={onCopy}
              aria-label={`نسخ تفسير الآية ${record.aya_no}`}
            >
              <Icon name={copied ? 'check' : 'copy'} size={14} />
              {copied ? 'تم النسخ' : 'نسخ التفسير'}
            </button>
            {onOpenMushaf && (
              <button
                className="tverse__btn tverse__btn--ghost"
                onClick={() => onOpenMushaf(record.aya_no)}
                aria-label={`فتح الآية ${record.aya_no} في المصحف`}
              >
                <Icon name="book" size={14} />
                فتح في المصحف
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}