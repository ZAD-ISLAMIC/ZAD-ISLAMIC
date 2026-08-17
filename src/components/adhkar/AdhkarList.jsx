import React, { useCallback, useRef, useState } from 'react'
import {
  CATEGORY_ICONS,
  CATEGORY_STYLES,
  findAudio,
  formatCount,
  recordCompletion,
} from '../../services/adhkar.mjs'
import { copyText } from '../../services/device.mjs'
import { playSound, vibrate } from '../../services/sound.mjs'
import { Icon } from '../ui/Icon.jsx'
import { AdhkarCounter } from './AdhkarCounter.jsx'

let currentAudio = null

export function AdhkarAudioButton({ item }) {
  const audio = findAudio(item.title)
  const [playing, setPlaying] = useState(false)

  const toggle = useCallback(
    (event) => {
      event.stopPropagation()
      if (!audio) return
      if (currentAudio && !currentAudio.paused) {
        currentAudio.pause()
        currentAudio.currentTime = 0
        currentAudio = null
        setPlaying(false)
        return
      }
      const player = new Audio(audio.src)
      player.onended = () => {
        setPlaying(false)
        currentAudio = null
      }
      player.play().catch(() => {})
      currentAudio = player
      setPlaying(true)
    },
    [audio]
  )

  if (!audio) return null

  return (
    <button
      className={'adhkar-act__btn' + (playing ? ' adhkar-act__btn--playing' : '')}
      onClick={toggle}
      aria-label={playing ? 'إيقاف التشغيل' : 'تشغيل الصوت'}
    >
      {playing ? <Icon name="pause" size={15} /> : <Icon name="play" size={15} />}
      {playing ? 'إيقاف' : 'تشغيل'}
    </button>
  )
}

export function AdhkarList({ category, onBack, onComplete }) {
  const accent = CATEGORY_STYLES[category.key]?.accent || '#10b981'
  const [counts, setCounts] = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)

  const showToast = useCallback((message) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = setTimeout(() => setToast(''), 1800)
  }, [])

  const countFor = useCallback(
    (progressKey, item, total) => {
      const current = counts[progressKey] || 0
      if (current >= total) return
      const next = current + 1
      setCounts((prev) => ({ ...prev, [progressKey]: next }))
      if (next >= total) {
        playSound('done')
        vibrate([40, 50, 90])
        recordCompletion(category.key, item.id)
        onComplete?.()
      } else {
        playSound('tick')
        vibrate(12)
      }
    },
    [counts, category.key, onComplete]
  )

  const resetFor = useCallback((progressKey) => {
    setCounts((prev) => ({ ...prev, [progressKey]: 0 }))
    playSound('tick')
    vibrate(12)
  }, [])

  const copy = useCallback(
    async (event, item) => {
      event.stopPropagation()
      const ok = await copyText(item.adhkar)
      showToast(ok ? 'تم نسخ الذكر' : 'تعذر النسخ')
    },
    [showToast]
  )

  return (
    <div className="adhkar-list">
      <div className="adhkar-list__topbar">
        <button className="quran-reader__back" onClick={onBack}>
          <Icon name="arrow-right" size={22} />
          <span>الأقسام</span>
        </button>
        <span className="adhkar-list__title" style={{ color: accent }}>
          <Icon name={CATEGORY_ICONS[category.key]} size={18} />
          {category.category}
        </span>
        <span className="adhkar-list__count">
          {formatCount(category.array.length)} ذكر
        </span>
      </div>

      {toast && <p className="adhkar-toast">{toast}</p>}

      <ul className="adhkar-list__items">
        {category.array.map((item, i) => {
          const progressKey = `${category.key}:${item.id}`
          const total = item.repetition || 1
          const done = counts[progressKey] || 0
          const isDone = done >= total
          const isExpanded = expandedId === item.id

          return (
            <li key={item.id}>
              <article
                className={'adhkar-card' + (isDone ? ' adhkar-card--done' : '')}
                style={{ '--cat-accent': accent }}
                onClick={() => countFor(progressKey, item, total)}
              >
                <div className="adhkar-card__head">
                  <span className="adhkar-card__num" style={{ color: accent }}>
                    {formatCount(i + 1)}
                  </span>
                  {/* <h3 className="adhkar-card__title">{item.title}</h3> */}
                  <h3 className="adhkar-card__title"></h3>
                  <AdhkarCounter
                    total={total}
                    done={done}
                    accent={accent}
                    onCount={() => countFor(progressKey, item, total)}
                    onReset={() => resetFor(progressKey)}
                  />
                </div>

                <p className="adhkar-card__text">{item.adhkar}</p>

                {item.description && (
                  <button
                    className="adhkar-card__toggle"
                    onClick={(event) => {
                      event.stopPropagation()
                      setExpandedId((current) =>
                        current === item.id ? null : item.id
                      )
                    }}
                  >
                    <span
                      className={
                        'adhkar-card__toggle-caret' +
                        (isExpanded ? ' adhkar-card__toggle-caret--open' : '')
                      }
                    />
                    الفضل والشرح
                  </button>
                )}
                {isExpanded && (
                  <p className="adhkar-card__desc">{item.description}</p>
                )}

                <p className="adhkar-card__source">
                  <span className="adhkar-card__source-label">المصدر</span>
                  {item.source}
                </p>

                <div className="adhkar-card__actions">
                  <AdhkarAudioButton item={item} />
                  <button className="adhkar-act__btn" onClick={(e) => copy(e, item)}>
                    <Icon name="copy" size={15} />
                    نسخ الذكر
                  </button>
                </div>
              </article>
            </li>
          )
        })}
      </ul>
    </div>
  )
}