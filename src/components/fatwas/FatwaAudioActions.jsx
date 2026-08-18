import React from 'react'
import { usePlayer } from '../../hooks/usePlayer.mjs'
import { useFatwaDownloads } from '../../hooks/useFatwaDownloads.mjs'
import {
  trackFor,
} from '../../services/fatwas.mjs'
import * as fatwaDownload from '../../services/fatwaDownload.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

/* ------------------------------------------------------------------ *
 * أزرار تشغيل/تحميل فتوى واحدة — تدفع track الخاص بالفتوى إلى المشغّل
 * الموحّد (نفس مشغّل صفحة القرّاء) وتدير التحميل/الحذف المحلي.
 * ------------------------------------------------------------------ */

export function FatwaAudioActions({ fatwa, categoryName, compact = false }) {
  const player = usePlayer()
  const downloads = useFatwaDownloads()
  if (!fatwa.audio) return null

  const track = trackFor(fatwa, categoryName)
  const task = downloads[track.ref]
  const stored = fatwaDownload.isStored(track.fileName)
  const busy = task?.state === 'pending' || task?.state === 'running'
  const error = task?.state === 'error' ? task.error : null
  const isActive = player.track && player.track.ref === track.ref
  const playing = isActive && player.playing

  const percent =
    task && Number.isFinite(task.progress) && task.progress >= 0
      ? Math.round(task.progress * 100)
      : 0

  const onPlay = (e) => {
    e?.stopPropagation()
    if (isActive) player.toggle()
    else player.play([track], 0)
  }

  const onDownload = async (e) => {
    e?.stopPropagation()
    if (stored) {
      await fatwaDownload.removeAudio(track.ref, track.fileName)
      return
    }
    if (busy) {
      await fatwaDownload.cancelRef(track.ref)
      return
    }
    fatwaDownload.downloadFatwa(fatwa, categoryName)
  }

  let downloadLabel
  if (stored) downloadLabel = 'حذف'
  else if (error) downloadLabel = 'إعادة'
  else if (busy) downloadLabel = percent > 0 ? `${arabicDigits(percent)}٪` : 'جاري'
  else downloadLabel = 'تحميل'

  return (
    <span className="fatwa-act" role="group" aria-label="التحكم بالصوتية">
      <button
        className={
          'fatwa-act__btn fatwa-act__btn--play' +
          (playing ? ' fatwa-act__btn--playing' : '') +
          (compact ? ' fatwa-act__btn--compact' : '')
        }
        onClick={onPlay}
        aria-label={playing ? 'إيقاف التشغيل' : 'تشغيل الصوتية'}
        title={playing ? 'إيقاف' : 'تشغيل'}
      >
        <Icon name={playing ? 'pause' : 'play'} size={compact ? 14 : 15} />
        {!compact && <span>{playing ? 'إيقاف' : 'تشغيل'}</span>}
      </button>
      <button
        className={
          'fatwa-act__btn' +
          (stored ? ' fatwa-act__btn--delete' : '') +
          (busy ? ' fatwa-act__btn--busy' : '') +
          (error ? ' fatwa-act__btn--error' : '')
        }
        onClick={onDownload}
        aria-label={
          stored
            ? 'حذف الصوتية المحفوظة'
            : busy
              ? 'إلغاء التحميل'
              : 'تحميل الصوتية للاستماع دون إنترنت'
        }
        title={error ? error.message : stored ? 'حذف الصوتية من الجهاز' : undefined}
      >
        {stored ? (
          <Icon name="trash" size={compact ? 14 : 15} />
        ) : busy ? (
          <span className="fatwa-act__spin" aria-hidden="true" />
        ) : error ? (
          <Icon name="refresh" size={compact ? 14 : 15} />
        ) : (
          <Icon name="download" size={compact ? 14 : 15} />
        )}
        {!compact && <span>{downloadLabel}</span>}
      </button>
    </span>
  )
}