import React, { useEffect, useRef, useState } from 'react'
import { playAzan } from '../../services/sound.mjs'
import { stopNativeAdhan, setAdhanVolume, getAdhanVolume } from '../../services/prayerWatch.mjs'
import { correctedNow } from '../../services/prayerConfig.mjs'

/** The in-app adhan stays live (showing the + count-up) for 30 minutes. */
const ADHAN_WINDOW_MS = 30 * 60 * 1000

/**
 * Doc:
 *  - Live window (app open at the time of the adhan — `silent` false):
 *    plays the adhan automatically, shows the "+ since" clock, and offers
 *    minimize / close.
 *  - Silent window (app re-opened inside an adhan window after the native
 *    ring — `silent: true`): never auto-plays; shows only minimize / close
 *    so the background adhan is never doubled.
 * Both minimize into a non-blocking floating pill and auto-close after the
 * 30-minute adhan window.
 */
export function AdhanModal({ prayer, onClose }) {
  const audioRef = useRef(null)
  const [minimized, setMinimized] = useState(false)
  const [tick, setTick] = useState(() => correctedNow())
  const [volume, setVolume] = useState(90)

  // The slider starts at the stored adhan loudness (native) and picks up the
  // live state once the bridge answers; plain-web defaults to 90%.
  useEffect(() => {
    let alive = true
    getAdhanVolume().then((s) => {
      if (!alive) return
      if (s && Number.isFinite(s.volume)) {
        setVolume(Math.round(Math.min(1, Math.max(0, s.volume)) * 100))
      } else if (audioRef.current) {
        setVolume(Math.round((audioRef.current.volume || 0.9) * 100))
      }
    })
    return () => {
      alive = false
    }
  }, [prayer?.key])

  // Auto-play only for a live fire. A silent window surfaces an adhan the
  // native layer already rang in the background — replaying it here would
  // create the double-adhan confusion.
  const silent = !prayer || prayer.silent === true
  useEffect(() => {
    if (!prayer || silent) return undefined
    let alive = true
    playAzan().then((audio) => {
      if (!alive) {
        try {
          audio?.pause?.()
        } catch {
          /* ignore */
        }
        return
      }
      audioRef.current = audio
    })
    return () => {
      alive = false
      try {
        audioRef.current?.pause?.()
        audioRef.current = null
      } catch {
        /* ignore */
      }
    }
  }, [prayer?.key, silent])

  // Live clock (also while minimized).
  useEffect(() => {
    if (!prayer) return undefined
    const t = setInterval(() => setTick(correctedNow()), 1000)
    return () => clearInterval(t)
  }, [prayer?.at])

  // Auto-close when the adhan window (30 min) elapses.
  useEffect(() => {
    if (!prayer) return undefined
    const elapsed = correctedNow() - prayer.at
    const remaining = Math.max(0, ADHAN_WINDOW_MS - elapsed)
    if (remaining === 0) {
      onClose()
      return undefined
    }
    const t = setTimeout(onClose, remaining)
    return () => clearTimeout(t)
  }, [prayer?.at])

  if (!prayer) return null

  const elapsedMs = Math.max(0, tick - prayer.at)
  const clock = formatClock(elapsedMs)

  const close = () => {
    try {
      audioRef.current?.pause?.()
    } catch {
      /* ignore */
    }
    stopNativeAdhan()
    onClose()
  }

  // Live loudness: drives the native playback and the WebView fallback alike,
  // and remembers the value as the default for the next adhan.
  const changeVolume = (e) => {
    const v = Number(e.target.value)
    setVolume(v)
    const gain = v / 100
    try {
      if (audioRef.current) audioRef.current.volume = gain
    } catch {
      /* ignore */
    }
    setAdhanVolume(gain)
  }

  if (minimized) {
    return (
      <button
        className="adhan-pill"
        onClick={() => setMinimized(false)}
        aria-label={`صلاة ${prayer.name} — توسيع`}
        type="button"
      >
        <span className="adhan-pill__icon" aria-hidden="true">🕌</span>
        <span className="adhan-pill__name">{prayer.name}</span>
        <span className="adhan-pill__clock">+{clock}</span>
      </button>
    )
  }

  return (
    <div className="adhan-modal" role="dialog" aria-modal="true" aria-label={`حان وقت صلاة ${prayer.name}`}>
      <div className="adhan-modal__backdrop" onClick={close} />
      <div className="adhan-modal__card">
        <div className="adhan-modal__glow" aria-hidden="true" />
        <span className="adhan-modal__icon" aria-hidden="true">🕌</span>
        <h3 className="adhan-modal__title">حان وقت صلاة</h3>
        <p className="adhan-modal__prayer">{prayer.name}</p>
        {prayer.at && (
          <p className="adhan-modal__since">
            منذ الأذان <b className="adhan-modal__clock adhan-modal__clock--plus">+{clock}</b>
          </p>
        )}
        <div className="adhan-modal__volume" dir="rtl">
          <span className="adhan-modal__volume-label">الصوت</span>
          <input
            className="adhan-modal__volume-slider"
            type="range"
            min="0"
            max="100"
            step="1"
            value={volume}
            onChange={changeVolume}
            aria-label="مستوى صوت الأذان"
          />
          <span className="adhan-modal__volume-value" aria-hidden="true">{volume}%</span>
        </div>
        <div className="adhan-modal__actions">
          <button className="adhan-modal__btn adhan-modal__btn--min" onClick={() => setMinimized(true)} type="button">
            تصغير
          </button>
          <button className="adhan-modal__btn adhan-modal__btn--close adhan-modal__btn--primary" onClick={close} type="button">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  )
}

/** Clock "H:MM:SS" zero-padded minutes/seconds, like the native notification. */
function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n) => String(n).padStart(2, '0')
  return `${h}:${pad(m)}:${pad(s)}`
}