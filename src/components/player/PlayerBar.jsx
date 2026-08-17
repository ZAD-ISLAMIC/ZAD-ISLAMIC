import React, { useEffect, useRef, useState } from 'react'
import { arabicDigits } from '../../utils/arabic.mjs'
import { hasSurah } from '../../services/reciterStorage.mjs'
import { usePlayer } from '../../hooks/usePlayer.mjs'
import { Icon } from '../ui/Icon.jsx'

const RATES = [1, 1.25, 1.5, 0.75, 2]

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function PlayerBar() {
  const player = usePlayer()
  const [expanded, setExpanded] = useState(false)
  const sliderRef = useRef(null)

  const { track, queue, index } = player

  // Collapse the sheet when the active track disappears.
  useEffect(() => {
    if (!track) setExpanded(false)
  }, [track])

  if (!track) return null

  const isLive = track.kind === 'radio'
  const stored = isLive ? false : hasSurah(track.reciterId, track.surahNumber)
  const percent =
    player.duration > 0
      ? Math.min(100, (player.time / player.duration) * 100)
      : 0

  const onSeek = (e) => {
    const value = Number(e.target.value)
    player.seek(value)
  }

  const nextRate = () => {
    const current = RATES.indexOf(player.rate)
    player.setRate(RATES[(current + 1) % RATES.length])
  }

  return (
    <div className="player">
      <div
        className={`player-mini${expanded ? ' player-mini--active' : ''}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`player-mini__badge${isLive ? ' player-mini__badge--live' : ''}`}>
          {isLive ? <Icon name="radio" size={22} /> : arabicDigits(track.surahNumber)}
        </span>
        <span className="player-mini__body">
          <strong className="player-mini__surah">{track.name || track.surahName}</strong>
          <span className="player-mini__reciter">
            {track.category || track.reciterName}
            {!isLive && track.rewaya ? ` • ${track.rewaya}` : ''}
          </span>
        </span>
        {isLive ? (
          <span className="player-mini__live" aria-hidden="true">
            <span className="player-mini__live-dot" />
            مباشر
          </span>
        ) : (
          <span
            className="player-mini__progress"
            style={{ '--player-progress': `${percent}%` }}
            aria-hidden="true"
          />
        )}
        <span className="player-mini__actions">
          <button
            className="player-mini__iconbtn"
            aria-label={player.playing ? 'إيقاف مؤقت' : 'تشغيل'}
            onClick={(e) => {
              e.stopPropagation()
              player.toggle()
            }}
          >
            <Icon name={player.playing ? 'pause' : 'play'} size={20} />
          </button>
          <button
            className="player-mini__iconbtn player-mini__iconbtn--close"
            aria-label="إغلاق المشغّل"
            onClick={(e) => {
              e.stopPropagation()
              player.close()
            }}
          >
            <Icon name="close" size={18} />
          </button>
        </span>
        <button
          className="player-mini__chevron"
          aria-label={expanded ? 'تصغير المشغّل' : 'تكبير المشغّل'}
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
        >
          <Icon name={expanded ? 'chevron-down' : 'chevron-up'} size={18} />
        </button>
      </div>

      {expanded && (
        <div className="player-full">
          <div
            className="player-full__backdrop"
            onClick={() => setExpanded(false)}
          />
          <div className="player-full__panel">
            <div className="player-full__topbar">
              <button
                className="player-full__iconbtn"
                aria-label="تصغير"
                onClick={() => setExpanded(false)}
              >
                <Icon name="chevron-down" size={24} />
              </button>
              <span className="player-full__label">المشغّل</span>
              <button
                className="player-full__iconbtn"
                aria-label="إغلاق المشغّل"
                onClick={() => player.close()}
              >
                <Icon name="close" size={22} />
              </button>
            </div>

            <div className="player-full__art">
              <span className="player-full__badge">
                <Icon name={isLive ? 'radio' : 'note'} size={34} />
                {!isLive && (
                  <span className="player-full__badge-num">
                    {arabicDigits(track.surahNumber)}
                  </span>
                )}
              </span>
            </div>

            <div className="player-full__meta">
              <h2 className="player-full__surah">{track.name || track.surahName}</h2>
              <p className="player-full__reciter">
                {isLive ? track.category || 'بث مباشر' : track.reciterName}
                {!isLive && track.rewaya ? ` • ${track.rewaya}` : ''}
              </p>
              {isLive && (
                <p className="player-full__live-badge">
                  <span className="player-full__live-dot" aria-hidden="true" />
                  بث مباشر الآن
                </p>
              )}
            </div>

            {player.status === 'error' ? (
              <div className="player-full__error">
                <Icon name={!navigator.onLine ? 'wifi-off' : 'alert'} size={16} />
                <span>{player.error}</span>
                <button className="player-full__retry" onClick={player.retry}>
                  <Icon name="refresh" size={16} />
                  إعادة المحاولة
                </button>
              </div>
            ) : (
              !isLive && (
                <div className="player-full__time">
                  <span>{formatTime(player.time)}</span>
                  <span>{formatTime(player.duration)}</span>
                </div>
              )
            )}

            {!isLive && (
              <input
                ref={sliderRef}
                className="player-full__slider"
                type="range"
                min={0}
                max={player.duration || 0}
                step={0.5}
                value={Math.min(player.time, player.duration || 0)}
                onChange={onSeek}
                style={{ '--seek-progress': `${percent}%` }}
                aria-label="شريط التقدم"
              />
            )}

            <div className="player-full__controls">
              {!isLive && (
                <button
                  className="player-full__ctl"
                  aria-label="السابق"
                  disabled={!player.hasPrev}
                  onClick={player.prev}
                >
                  <Icon name="arrow-right" size={26} />
                </button>
              )}
              <button
                className="player-full__play"
                aria-label={player.playing ? 'إيقاف مؤقت' : 'تشغيل'}
                onClick={player.toggle}
              >
                <Icon name={player.playing ? 'pause' : 'play'} size={34} />
              </button>
              {!isLive && (
                <button
                  className="player-full__ctl"
                  aria-label="التالي"
                  disabled={!player.hasNext}
                  onClick={player.next}
                >
                  <Icon name="arrow-left" size={26} />
                </button>
              )}
            </div>

            <div className="player-full__footer">
              {isLive ? (
                <span className="player-full__live-note">
                  <Icon name="wifi-off" size={14} />
                  بث مباشر — يتطلب اتصالاً بالإنترنت
                </span>
              ) : (
                <>
                  <button className="player-full__rate" onClick={nextRate}>
                    السرعة {player.rate.toFixed(2).replace(/0$/, '')}×
                  </button>
                  {stored ? (
                    <span className="player-full__stored">
                      <Icon name="check" size={14} />
                      محفوظة — تعمل دون إنترنت
                    </span>
                  ) : (
                    <span className="player-full__stored player-full__stored--live">
                      <Icon name="wifi-off" size={14} />
                      تُشغَّل من الإنترنت
                    </span>
                  )}
                </>
              )}
            </div>

            {!isLive && queue.length > 1 && (
              <p className="player-full__queue">
                {arabicDigits(index + 1)} من {arabicDigits(queue.length)}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}