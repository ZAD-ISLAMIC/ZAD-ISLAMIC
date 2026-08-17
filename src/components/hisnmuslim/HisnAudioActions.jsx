import React from 'react'
import { usePlayer } from '../../hooks/usePlayer.mjs'
import { useHisnDownloads, useHisnDoorStats } from '../../hooks/useHisnDownloads.mjs'
import {
  downloadDoor,
  downloadItem,
  cancelRef,
  cancelDoor,
  removeFile,
  hasFile,
} from '../../services/hisnDownload.mjs'
import {
  HISN_NS,
  itemRef,
  toDoorTrack,
  doorFiles,
} from '../../services/hisnmuslim.mjs'
import { Icon } from '../ui/Icon.jsx'

/* ------------------------------------------------------------------ *
 * Play button — pushes the track (inside its queue) to the shared
 * player so it shows in the PlayerBar with next/prev.
 * ------------------------------------------------------------------ */

export function HisnPlayButton({ queue, index, track, compact = false }) {
  const player = usePlayer()
  const isActive = player.track && player.track.ref === track.ref
  const playing = isActive && player.playing

  const onToggle = (event) => {
    event?.stopPropagation()
    if (isActive) {
      player.toggle()
    } else {
      player.play(queue, index)
    }
  }

  return (
    <button
      className={
        'hisn-act__btn' +
        (playing ? ' hisn-act__btn--playing' : '') +
        (compact ? ' hisn-act__btn--compact' : '')
      }
      onClick={onToggle}
      aria-label={playing ? 'إيقاف التشغيل' : 'تشغيل الذكر'}
      title={playing ? 'إيقاف' : 'تشغيل'}
    >
      {playing ? <Icon name="pause" size={15} /> : <Icon name="play" size={15} />}
      <span>{playing ? 'إيقاف' : 'تشغيل'}</span>
    </button>
  )
}

/* ------------------------------------------------------------------ *
 * Single-file download button (one dhikr).
 * Resolves stored-file → live task → idle.
 * ------------------------------------------------------------------ */

export function HisnDownloadButton({ catId, itemId }) {
  const downloads = useHisnDownloads()
  const file = itemRef(catId, itemId)
  const ref = file.ref
  const fileName = file.fileName
  const task = downloads[ref]

  const isStored = (fileName && hasFile(HISN_NS, fileName)) || task?.state === 'done'
  const busy = task?.state === 'pending' || task?.state === 'running'
  const error = task?.state === 'error' ? task.error : null

  const onToggle = async (event) => {
    event?.stopPropagation()
    if (isStored) {
      await removeFile(ref, fileName)
      return
    }
    if (busy) {
      cancelRef(ref)
      return
    }
    downloadItem(catId, itemId)
  }

  const percent =
    task && Number.isFinite(task.progress) && task.progress >= 0
      ? Math.round(task.progress * 100)
      : 0

  let label
  if (isStored) label = 'محفوظ'
  else if (error) label = 'إعادة'
  else if (busy) label = percent > 0 ? `${percent}٪` : 'جاري'
  else label = 'تحميل'

  return (
    <button
      className={
        'hisn-act__btn' +
        (isStored ? ' hisn-act__btn--stored' : '') +
        (busy ? ' hisn-act__btn--busy' : '') +
        (error ? ' hisn-act__btn--error' : '')
      }
      onClick={onToggle}
      aria-label={label}
      title={error ? error.message : undefined}
    >
      {isStored ? (
        <Icon name="check" size={15} />
      ) : busy ? (
        <span className="hisn-act__spin" aria-hidden="true" />
      ) : error ? (
        <Icon name="refresh" size={15} />
      ) : (
        <Icon name="download" size={15} />
      )}
      <span>{label}</span>
    </button>
  )
}

/* ------------------------------------------------------------------ *
 * Door-level actions — play the whole door + aggregate download/clear.
 * ------------------------------------------------------------------ */

export function HisnDoorActions({ category }) {
  const player = usePlayer()
  const stats = useHisnDoorStats(category.id)
  const doorTrack = toDoorTrack(category)
  const isActive = player.track && player.track.ref === doorTrack.ref
  const playing = isActive && player.playing

  const onPlay = (event) => {
    event?.stopPropagation()
    if (isActive) {
      player.toggle()
    } else {
      player.play([doorTrack], 0)
    }
  }

  const onDownload = (event) => {
    event?.stopPropagation()
    if (stats.busy) return
    downloadDoor(category.id)
  }

  const onCancel = (event) => {
    event?.stopPropagation()
    cancelDoor(category.id)
  }

  const onClear = async (event) => {
    event?.stopPropagation()
    if (stats.busy) return
    for (const file of doorFiles(category.id)) {
      if (hasFile(HISN_NS, file.fileName)) {
        await removeFile(file.ref, file.fileName)
      }
    }
  }

  return (
    <div className="hisn-door">
      <div className="hisn-door__bar" style={{ '--door-progress': `${stats.percent}%` }}>
        <span className="hisn-door__label">
          <Icon name={stats.busy ? 'download' : stats.errorCount > 0 ? 'refresh' : 'check'} size={15} />
          {stats.busy
            ? `جاري الحفظ ${stats.doneCount}/${stats.total}`
            : stats.errorCount > 0
              ? `تعطّل حفظ ${stats.errorCount} ${stats.errorCount === 1 ? 'ملف' : 'ملفات'} — أعد المحاولة`
              : stats.allStored
                ? 'الباب محفوظ بالكامل — استمع دون إنترنت'
                : `محفوظ ${stats.doneCount} من ${stats.total}`}
        </span>
        <span className="hisn-door__percent">{stats.percent}٪</span>
      </div>
      <div className="hisn-door__actions">
        <button
          className={'hisn-act__btn hisn-act__btn--lg' + (playing ? ' hisn-act__btn--playing' : '')}
          onClick={onPlay}
          aria-label={playing ? 'إيقاف تشغيل الباب' : 'تشغيل الباب كاملاً'}
        >
          {playing ? <Icon name="pause" size={16} /> : <Icon name="play" size={16} />}
          {playing ? 'إيقاف' : 'تشغيل الباب'}
        </button>
        {stats.busy ? (
          <button
            className="hisn-act__btn hisn-act__btn--lg hisn-act__btn--cancel"
            onClick={onCancel}
            aria-label="إلغاء حفظ الباب"
          >
            <Icon name="close" size={15} />
            إلغاء الحفظ
          </button>
        ) : stats.allStored ? (
          <button className="hisn-act__btn hisn-act__btn--lg hisn-act__btn--stored" onClick={onClear}>
            <Icon name="trash" size={15} />
            مسح المحفوظ
          </button>
        ) : (
          <button
            className={'hisn-act__btn hisn-act__btn--lg' + (stats.errorCount > 0 ? ' hisn-act__btn--error' : '')}
            onClick={onDownload}
            aria-label="حفظ الباب للاستماع دون إنترنت"
          >
            {stats.errorCount > 0 ? <Icon name="refresh" size={15} /> : <Icon name="download" size={15} />}
            {stats.errorCount > 0 ? 'إكمال الحفظ' : 'حفظ الباب'}
          </button>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Compact door actions for the category cards.
 * ------------------------------------------------------------------ */

export function HisnDoorMiniActions({ category }) {
  const player = usePlayer()
  const stats = useHisnDoorStats(category.id)
  const doorTrack = toDoorTrack(category)
  const playing = player.track && player.track.ref === doorTrack.ref && player.playing

  const onPlay = (event) => {
    event?.stopPropagation()
    if (playing || (player.track && player.track.ref === doorTrack.ref)) {
      player.toggle()
    } else {
      player.play([doorTrack], 0)
    }
  }

  const onSave = async (event) => {
    event?.stopPropagation()
    if (stats.busy) {
      cancelDoor(category.id)
      return
    }
    if (stats.allStored) {
      for (const file of doorFiles(category.id)) {
        await removeFile(file.ref, file.fileName)
      }
    } else {
      downloadDoor(category.id)
    }
  }

  return (
    <span className="hisn-card-acts" role="group">
      <button
        className={'hisn-card-acts__btn' + (playing ? ' hisn-card-acts__btn--playing' : '')}
        onClick={onPlay}
        aria-label={playing ? 'إيقاف تشغيل الباب' : 'تشغيل الباب'}
      >
        {playing ? <Icon name="pause" size={14} /> : <Icon name="play" size={14} />}
      </button>
      <button
        className={
          'hisn-card-acts__btn' +
          (stats.allStored ? ' hisn-card-acts__btn--stored' : '') +
          (stats.busy ? ' hisn-card-acts__btn--busy' : '')
        }
        onClick={onSave}
        aria-label={stats.busy ? 'إلغاء تحميل الباب' : stats.allStored ? 'مسح تحميلات الباب' : 'حفظ الباب'}
      >
        {stats.allStored ? (
          <Icon name="check" size={14} />
        ) : stats.busy ? (
          <Icon name="close" size={14} />
        ) : (
          <Icon name="download" size={14} />
        )}
      </button>
    </span>
  )
}
