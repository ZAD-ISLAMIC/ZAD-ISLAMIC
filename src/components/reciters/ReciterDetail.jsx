import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  formatSize,
  surahMetaOf,
  surahNameOf,
} from '../../services/reciters.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { getRegistry, hasSurah } from '../../services/reciterStorage.mjs'
import * as downloadManager from '../../services/downloadManager.mjs'
import { useDownloads, usePlayer } from '../../hooks/usePlayer.mjs'
import { Icon } from '../ui/Icon.jsx'

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
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

export function ReciterDetail({ reciter }) {
  const player = usePlayer()
  const summary = useDownloads(reciter.id)
  const online = useOnline()
  const [confirmClear, setConfirmClear] = useState(false)
  const clearTimer = useRef(null)

  const playQueue = useMemo(
    () =>
      reciter.suras.map((n) => ({
        reciterId: reciter.id,
        reciterName: reciter.name,
        rewaya: reciter.rewaya,
        server: reciter.server,
        surahNumber: n,
        surahName: surahNameOf(n),
      })),
    [reciter]
  )

  const registry = getRegistry(reciter.id)
  const storedCount = registry.count
  const total = reciter.suras.length

  // Materialise live job status and auto-resume any interrupted download.
  useEffect(() => {
    downloadManager.ensureJob(reciter)
    downloadManager.startActiveJob(reciter)
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reciter.id])

  const statusOf = (n) => {
    const item = summary?.items?.[n]
    if (item) return item
    return {
      state: hasSurah(reciter.id, n) ? 'done' : 'pending',
      progress: 0,
      error: null,
    }
  }

  const doneCount = summary ? summary.done : storedCount
  const percent = total ? Math.round((doneCount / total) * 100) : 0
  const active = summary?.active || false
  const failed = summary?.failed || []

  const currentIndex = player.track?.reciterId === reciter.id
    ? playQueue.findIndex((t) => t.surahNumber === player.track.surahNumber)
    : -1

  const handleRowClick = (n) => {
    const idx = playQueue.findIndex((t) => t.surahNumber === n)
    if (idx === -1) return
    if (currentIndex === idx) player.toggle()
    else player.play(playQueue, idx)
  }

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true)
      if (clearTimer.current) clearTimeout(clearTimer.current)
      clearTimer.current = setTimeout(() => setConfirmClear(false), 2600)
      return
    }
    if (clearTimer.current) clearTimeout(clearTimer.current)
    setConfirmClear(false)
    downloadManager.removeAllSurahs(reciter)
  }

  return (
    <section className="screen rec-detail">
      <div className="rec-detail__topbar">
        {reciter.rewaya ? <span className="rec-detail__rewaya">{reciter.rewaya}</span> : null}
        <span className="rec-detail__done">
          <Icon name="check" size={14} />
          {arabicDigits(percent)}%
        </span>
      </div>

      {!online && (
        <div className="rec-offline">
          <Icon name="wifi-off" size={16} />
          <span>لا يوجد اتصال بالإنترنت — ستُشغَّل السور المحفوظة فقط</span>
        </div>
      )}

      <div className={`rec-batch${active ? ' rec-batch--active' : ''}`}>
        {active ? (
          <>
            <div className="rec-batch__head">
              <span className="rec-batch__spinner" aria-hidden="true" />
              <span className="rec-batch__title">
                يتم التحميل…
                {summary?.currentSurah
                  ? ` (${surahNameOf(summary.currentSurah)})`
                  : ''}
              </span>
            </div>
            <div className="rec-batch__progress">
              <span style={{ width: `${summary.progress * 100}%` }} />
            </div>
            <div className="rec-batch__row">
              <span>
                {arabicDigits(summary.done)} / {arabicDigits(total)} سورة
              </span>
              <button className="rec-batch__cancel" onClick={() => downloadManager.cancelReciter(reciter.id)}>
                إيقاف
              </button>
            </div>
            <p className="rec-batch__note">
              يمكنك إغلاق التطبيق أو قطع الإنترنت وسيُستأنف التحميل تلقائياً.
            </p>
          </>
        ) : (
          <>
            <div className="rec-batch__head">
              <span className="rec-batch__dl-icon">
                <Icon name="download" size={18} />
              </span>
              <div className="rec-batch__title">
                <strong>
                  {storedCount === 0
                    ? 'تحميل المصحف كاملاً'
                    : storedCount === total
                      ? 'المصحف محفوظ بالكامل'
                      : 'متابعة تحميل المصحف'}
                </strong>
                <span>
                  {storedCount > 0
                    ? `${arabicDigits(storedCount)} / ${arabicDigits(total)} سورة`
                    : `${arabicDigits(total)} سورة للاستماع دون إنترنت`}
                </span>
              </div>
            </div>
            {storedCount < total && (
              <button
                className="rec-batch__start"
                onClick={() => downloadManager.downloadReciter(reciter)}
              >
                <Icon name="download" size={17} />
                {storedCount === 0
                  ? 'تحميل الآن'
                  : downloadManager.isJobActive(reciter.id)
                    ? 'استئناف التحميل'
                    : 'تحميل المتبقي'}
              </button>
            )}
            {storedCount > 0 && (
              <button
                className={`rec-batch__clear${confirmClear ? ' rec-batch__clear--confirm' : ''}`}
                onClick={handleClear}
              >
                <Icon name="trash" size={15} />
                {confirmClear ? 'تأكيد المسح؟' : 'مسح المحفوظ'}
              </button>
            )}
            {registry.bytes > 0 && (
              <span className="rec-batch__bytes">
                المساحة المستخدمة: {formatSize(registry.bytes)}
              </span>
            )}
          </>
        )}
      </div>

      {failed.length > 0 && !active && (
        <div className="rec-failed">
          <Icon name="alert" size={16} />
          <span>
            تعذّر تحميل {arabicDigits(failed.length)} سورة
            {online ? ` — ${summary.failed.map((n) => surahNameOf(n)).join('، ')}` : ' (لا يوجد إنترنت)'}
          </span>
          <button onClick={() => downloadManager.retryReciter(reciter)}>
            <Icon name="refresh" size={15} />
            إعادة المحاولة
          </button>
        </div>
      )}

      <ul className="rec-surahs">
        {reciter.suras.map((n) => {
          const st = statusOf(n)
          const isCurrent = currentIndex !== -1 && playQueue[currentIndex].surahNumber === n
          const isPlaying = isCurrent && player.playing
          const downloading = st.state === 'running'
          const pct = st.progress != null && st.progress > 0 ? Math.round(st.progress * 100) : 0

          return (
            <li key={n}>
              <div
                className={`rec-surah${isCurrent ? ' rec-surah--active' : ''}${downloading ? ' rec-surah--downloading' : ''}`}
                onClick={() => handleRowClick(n)}
              >
                <span className="quran-item__number">{arabicDigits(n)}</span>
                <span className="rec-surah__body">
                  <span className="quran-item__name">{surahNameOf(n)}</span>
                  <span className="quran-item__meta">{surahMetaOf(n)}</span>
                </span>
                <span className="rec-surah__actions">
                  <button
                    className="rec-surah__dl"
                    aria-label={
                      st.state === 'done'
                        ? 'حذف سورة محفوظة'
                        : st.state === 'error'
                          ? st.error?.message || 'فشل التحميل'
                          : 'تحميل السورة'
                    }
                    onClick={(e) => {
                      e.stopPropagation()
                      if (st.state === 'done') downloadManager.removeSurah(reciter.id, n)
                      else if (st.state === 'error' || st.state === 'pending' || st.state === 'idle') {
                        downloadManager.downloadSurah(reciter, n)
                      }
                    }}
                  >
                    {st.state === 'done' ? (
                      <Icon name="check" size={18} />
                    ) : st.state === 'error' ? (
                      <Icon name="alert" size={18} />
                    ) : (
                      <Icon name="download" size={18} />
                    )}
                  </button>
                  <button
                    className={`rec-surah__play${isCurrent ? ' rec-surah__play--on' : ''}`}
                    aria-label={isPlaying ? 'إيقاف مؤقت' : 'تشغيل'}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRowClick(n)
                    }}
                  >
                    <Icon name={isPlaying ? 'pause' : 'play'} size={20} />
                  </button>
                </span>
                {downloading && (
                  <span className="rec-surah__overlay">
                    <em>
                      <span className="rec-surah__spin" aria-hidden="true" />
                      {pct > 0 ? `${arabicDigits(pct)}٪` : 'جارٍ التحميل…'}
                    </em>
                  </span>
                )}
                {st.state === 'error' && (
                  <span className="rec-surah__err">{st.error?.message}</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <p className="rec-detail__tip">
        {active
          ? ''
          : 'اضغط على السورة للاستماع، أو على أيقونة التحميل لحفظها محلياً.'
        }
      </p>
    </section>
  )
}