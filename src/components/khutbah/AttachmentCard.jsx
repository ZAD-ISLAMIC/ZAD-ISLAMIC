import React from 'react'
import { useKhutbahDownloads } from '../../hooks/useKhutbahDownloads.mjs'
import { extOf, trackFor } from '../../services/khutbah.mjs'
import * as khutbahDownload from '../../services/khutbahDownload.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

/**
 * بطاقة مرفق واحدة (PDF/DOC): تحميل/حذف للوصول دون إنترنت، وفتح في مشغّل
 * خارجي عبر fileopener plugin بعد الحفظ. تستخدم مدير التحميل العام بنمط الفتاوى.
 */
export function AttachmentCard({ khutbah, attachment, onMessage }) {
  const downloads = useKhutbahDownloads()
  const track = trackFor(khutbah, attachment)
  const task = downloads[track.ref]
  const stored = khutbahDownload.isStored(track.fileName)
  const busy = task?.state === 'pending' || task?.state === 'running'
  const error = task?.state === 'error' ? task.error : null
  const isPdf = extOf(track.fileName) === 'pdf'

  const percent =
    task && Number.isFinite(task.progress) && task.progress >= 0
      ? Math.round(task.progress * 100)
      : 0

  const onDownload = async (e) => {
    e?.stopPropagation()
    if (stored) {
      await khutbahDownload.removeAttachment(track.ref, track.fileName)
      return
    }
    if (busy) {
      await khutbahDownload.cancelRef(track.ref)
      return
    }
    khutbahDownload.downloadAttachment(khutbah, attachment)
  }

  const onOpen = async (e) => {
    e?.stopPropagation()
    const res = await khutbahDownload.openAttachment(khutbah, attachment)
    if (!res.ok && onMessage) onMessage(res.message, true)
  }

  let label
  if (stored) label = 'حذف'
  else if (error) label = 'إعادة'
  else if (busy) label = percent > 0 ? `${arabicDigits(percent)}٪` : 'جاري'
  else label = 'تحميل'

  return (
    <div className="kht-att">
      <span className={'kht-att__file' + (isPdf ? ' kht-att__file--pdf' : '')} aria-hidden="true">
        <Icon name={isPdf ? 'file-pdf' : 'file'} size={22} />
        <em>{isPdf ? 'PDF' : 'DOC'}</em>
      </span>

      <span className="kht-att__body">
        <strong className="kht-att__name">{attachment.name}</strong>
        <em className="kht-att__state">
          {stored
            ? 'محفوظة على الجهاز — تُفتح دون إنترنت'
            : error
              ? error.message
              : busy
                ? `جارِ التحميل… ${arabicDigits(percent)}٪`
                : 'حمّلها لتفتحها في أي قارئ دون إنترنت'}
        </em>
      </span>

      <span className="kht-att__actions" role="group" aria-label="التحكم بالمرفق">
        <button
          className={
            'kht-att__btn kht-att__btn--open' +
            (stored ? ' kht-att__btn--ready' : '')
          }
          onClick={onOpen}
          disabled={!stored}
          aria-label={stored ? 'فتح المرفق في مشغّل خارجي' : 'المرفق غير محمّل بعد'}
          title={stored ? 'فتح في تطبيق خارجي' : 'حمّل المرفق أولاً'}
        >
          <Icon name="external" size={14} />
          <span>{stored ? 'فتح' : 'فتح'}</span>
        </button>
        <button
          className={
            'kht-att__btn' +
            (stored ? ' kht-att__btn--delete' : '') +
            (busy ? ' kht-att__btn--busy' : '') +
            (error ? ' kht-att__btn--error' : '')
          }
          onClick={onDownload}
          aria-label={
            stored
              ? 'حذف المرفق من الجهاز'
              : busy
                ? 'إلغاء التحميل'
                : 'تحميل المرفق للوصول دون إنترنت'
          }
        >
          {stored ? (
            <Icon name="trash" size={14} />
          ) : busy ? (
            <span className="kht-att__spin" aria-hidden="true" />
          ) : error ? (
            <Icon name="refresh" size={14} />
          ) : (
            <Icon name="download" size={14} />
          )}
          <span>{label}</span>
        </button>
      </span>
    </div>
  )
}
