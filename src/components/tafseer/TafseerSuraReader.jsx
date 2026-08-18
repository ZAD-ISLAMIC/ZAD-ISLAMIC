import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocalStorage } from '../../hooks/useLocalStorage.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'
import { TafseerVerseCard } from './TafseerVerseCard.jsx'

const FONT_SIZE_KEY = 'tafseer.fontSize'

const FONT_MIN = 16
const FONT_MAX = 38
const FONT_STEP = 2

function getScrollRoot() {
  return document.querySelector('.shell__main')
}

export function TafseerSuraReader({ surah, records, initialVerse, onPrev, onNext, onOpenMushaf }) {
  const [fontSize, setFontSize] = useLocalStorage(FONT_SIZE_KEY, 16)
  const [current, setCurrent] = useState(initialVerse || 1)

  const allVerseNos = useMemo(() => records.map((r) => Number(r.aya_no)), [records])

  const [expandedSet, setExpandedSet] = useState(() =>
    new Set(initialVerse ? [initialVerse] : [])
  )
  const [allOpen, setAllOpen] = useState(false)

  const currentRef = useRef(current)
  const cardEls = useRef(new Map())
  const scrollRaf = useRef(null)

  const updateCurrent = useCallback((verse) => {
    if (currentRef.current === verse) return
    currentRef.current = verse
    setCurrent(verse)
  }, [])

  const trackCurrent = useCallback(() => {
    const root = getScrollRoot()
    if (!root || cardEls.current.size === 0) return
    const rootRect = root.getBoundingClientRect()
    const mid = rootRect.top + rootRect.height * 0.4
    let best = null
    let bestDist = Infinity
    for (const [num, el] of cardEls.current) {
      const r = el.getBoundingClientRect()
      if (r.top > mid) break
      const dist = Math.abs(r.top + r.height / 2 - mid)
      if (dist < bestDist) {
        bestDist = dist
        best = num
      }
    }
    if (best !== null && best !== currentRef.current) {
      updateCurrent(best)
    }
  }, [updateCurrent])

  useEffect(() => {
    const root = getScrollRoot()
    if (!root) return
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      scrollRaf.current = requestAnimationFrame(() => {
        ticking = false
        trackCurrent()
      })
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      root.removeEventListener('scroll', onScroll)
      if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current)
    }
  }, [trackCurrent])

  useEffect(() => {
    if (!initialVerse || !cardEls.current.has(initialVerse)) return
    const el = cardEls.current.get(initialVerse)
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'center' })
    })
  }, [initialVerse])

  const changeFontSize = useCallback(
    (delta) =>
      setFontSize((size) =>
        Math.min(FONT_MAX, Math.max(FONT_MIN, size + delta))
      ),
    [setFontSize]
  )

  const toggleVerse = useCallback(
    (verse) => {
      setExpandedSet((prev) => {
        const next = new Set(prev)
        if (next.has(verse)) next.delete(verse)
        else next.add(verse)
        return next
      })
      if (allOpen) {
        setAllOpen(false)
      }
    },
    [allOpen]
  )

  const toggleAll = useCallback(() => {
    if (allOpen) {
      setExpandedSet(new Set())
      setAllOpen(false)
    } else {
      setExpandedSet(new Set(allVerseNos))
      setAllOpen(true)
    }
  }, [allOpen, allVerseNos])

  const registerCard = useCallback((verse, el) => {
    if (el) cardEls.current.set(verse, el)
    else cardEls.current.delete(verse)
  }, [])

  return (
    <div className="tafseer-reader">
      <div className="tafseer-reader__topbar">
        <div className="tafseer-reader__topbar-row">
          <div className="tafseer-reader__surah">
            <span className="tafseer-reader__surah-name">{surah.nameAr}</span>
            <span className="tafseer-reader__surah-meta">
              {surah.descent} • {arabicDigits(surah.verses)} آية • الجزء {arabicDigits(surah.jozz[0])}
            </span>
          </div>

          <div className="tafseer-reader__controls">
            <button
              className="tafseer-reader__btn"
              aria-label={allOpen ? 'طيّ كل التفسير' : 'توسيع كل التفسير'}
              onClick={toggleAll}
            >
              <Icon name={allOpen ? 'chevron-up' : 'chevron-down'} size={18} />
            </button>
            <button
              className="tafseer-reader__btn"
              aria-label="تصغير الخط"
              disabled={fontSize <= FONT_MIN}
              onClick={() => changeFontSize(-FONT_STEP)}
            >
              <Icon name="minus" size={18} />
            </button>
            <span className="tafseer-reader__size">{arabicDigits(fontSize)}</span>
            <button
              className="tafseer-reader__btn"
              aria-label="تكبير الخط"
              disabled={fontSize >= FONT_MAX}
              onClick={() => changeFontSize(FONT_STEP)}
            >
              <Icon name="plus" size={18} />
            </button>
          </div>
        </div>

        {(onPrev || onNext) && (
          <div className="tafseer-reader__nav">
            <button
              className="tafseer-reader__nav-btn"
              disabled={!onPrev}
              onClick={onPrev}
            >
              <Icon name="arrow-right" size={16} />
              <span className="tafseer-reader__nav-name">{onPrev?.nameAr || ''}</span>
            </button>
            <button
              className="tafseer-reader__nav-btn"
              disabled={!onNext}
              onClick={onNext}
            >
              <span className="tafseer-reader__nav-name">{onNext?.nameAr || ''}</span>
              <Icon name="arrow-left" size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="tafseer-reader__list">
        {records.map((record) => {
          const verse = Number(record.aya_no)
          const expanded = expandedSet.has(verse)
          return (
            <TafseerVerseCard
              key={record.id}
              record={record}
              surah={surah}
              expanded={expanded}
              active={current === verse}
              quranSize={fontSize}
              registerRef={(el) => registerCard(verse, el)}
              onToggle={() => toggleVerse(verse)}
              onOpenMushaf={onOpenMushaf}
            />
          )
        })}
      </div>
    </div>
  )
}