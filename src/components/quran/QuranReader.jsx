import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocalStorage } from '../../hooks/useLocalStorage.mjs'
import { storage } from '../../services/storage.mjs'
import {
  BASMALA,
  SURAHS,
  arabicDigits,
  hasBasmala,
  parseSurah,
} from '../../services/quran.mjs'
import { Icon } from '../ui/Icon.jsx'

const READING_KEY = 'quran.reading'
const FONT_SIZE_KEY = 'quran.fontSize'

const FONT_MIN = 18
const FONT_MAX = 40
const FONT_STEP = 2

function getScrollRoot() {
  return document.querySelector('.shell__main')
}

export function QuranReader({ surahIndex, initialVerse, onPrev, onNext, onTafseer, onCards }) {
  const surah = useMemo(() => parseSurah(surahIndex), [surahIndex])
  const [fontSize, setFontSize] = useLocalStorage(FONT_SIZE_KEY, 26)
  const [reading, setReading] = useLocalStorage(READING_KEY, null)
  const [current, setCurrent] = useState(initialVerse || 1)
  const [savedFlash, setSavedFlash] = useState(false)

  const currentRef = useRef(current)
  const verseEls = useRef(new Map())
  const saveTimer = useRef(null)
  const scrollRaf = useRef(null)
  // While the programmatic anchor-scroll settles, ignore scroll tracking so
  // the centred verse keeps its highlight instead of being corrected to the
  // one above (the 45% tracking line is not the 50% centre line).
  const suppressTrackRef = useRef(false)

  const persist = useCallback(
    (verse) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        setReading((prev) => ({
          ...(prev || {}),
          surah: surahIndex,
          verse,
          at: Date.now(),
        }))
      }, 350)
    },
    [surahIndex, setReading]
  )

  const updateCurrent = useCallback(
    (verse) => {
      if (currentRef.current === verse) return
      currentRef.current = verse
      setCurrent(verse)
      persist(verse)
    },
    [persist]
  )

  const trackCurrent = useCallback(() => {
    if (suppressTrackRef.current) return
    const root = getScrollRoot()
    if (!root || verseEls.current.size === 0) return
    const rootRect = root.getBoundingClientRect()
    const mid = rootRect.top + rootRect.height * 0.45
    let best = null
    let bestDist = Infinity
    for (const [num, el] of verseEls.current) {
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
    if (!initialVerse || !verseEls.current.has(initialVerse)) return
    const el = verseEls.current.get(initialVerse)
    // Pin the anchor verse explicitly so the highlight matches the deep link.
    currentRef.current = initialVerse
    setCurrent(initialVerse)
    suppressTrackRef.current = true
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'center' })
    })
    const release = setTimeout(() => {
      suppressTrackRef.current = false
    }, 500)
    return () => clearTimeout(release)
  }, [initialVerse])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      storage.set(READING_KEY, {
        surah: surahIndex,
        verse: currentRef.current,
        at: Date.now(),
      })
    }
  }, [surahIndex])

  const changeFontSize = useCallback(
    (delta) =>
      setFontSize((size) =>
        Math.min(FONT_MAX, Math.max(FONT_MIN, size + delta))
      ),
    [setFontSize]
  )

  const saveNow = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setReading((prev) => ({
      ...(prev || {}),
      surah: surahIndex,
      verse: currentRef.current,
      at: Date.now(),
    }))
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
  }, [surahIndex, setReading])

  const hasSavedHere = reading?.surah === surahIndex && reading?.verse === current

  return (
    <div
      className="quran-reader"
      style={{ '--quran-size': `${fontSize}px` }}
    >
      <div className="quran-reader__topbar">
        <div className="quran-reader__topbar-row">
          <div className="quran-reader__surah">
            <span className="quran-reader__surah-meta">
              {surah.Descent} • {arabicDigits(surah.Number_Verses)} آية
            </span>
          </div>

          <div className="quran-reader__controls">
            {onCards && (
              <button
                className="quran-reader__btn quran-reader__btn--cards"
                aria-label="فتح البطاقات القرآنية"
                onClick={() => onCards(surahIndex + 1)}
              >
                <Icon name="bookmark" size={14} />
                <span>البطاقات</span>
              </button>
            )}
            {onTafseer && (
              <button
                className="quran-reader__btn quran-reader__btn--tafseer"
                aria-label="فتح تفسير هذه الآية"
                onClick={() => onTafseer(current)}
              >
                <Icon name="book-open" size={14} />
                <span>التفسير</span>
              </button>
            )}
            <button
              className="quran-reader__btn"
              aria-label="تصغير الخط"
              disabled={fontSize <= FONT_MIN}
              onClick={() => changeFontSize(-FONT_STEP)}
            >
              <Icon name="minus" size={18} />
            </button>
            <span className="quran-reader__size">{arabicDigits(fontSize)}</span>
            <button
              className="quran-reader__btn"
              aria-label="تكبير الخط"
              disabled={fontSize >= FONT_MAX}
              onClick={() => changeFontSize(FONT_STEP)}
            >
              <Icon name="plus" size={18} />
            </button>
            <button
              className={`quran-reader__btn${hasSavedHere ? ' quran-reader__btn--active' : ''}`}
              aria-label="حفظ الموضع"
              onClick={saveNow}
            >
              <Icon name={hasSavedHere ? 'bookmark-fill' : 'bookmark'} size={18} />
            </button>
          </div>
        </div>

        {(onPrev || onNext) && (
          <div className="quran-reader__nav">
            <button
              className="quran-reader__nav-btn"
              disabled={!onPrev}
              onClick={onPrev}
            >
              <Icon name="arrow-right" size={16} />
              <span className="quran-reader__nav-name">
                {onPrev ? SURAHS[surahIndex - 1].Name : ''}
              </span>
            </button>
            <button
              className="quran-reader__nav-btn"
              disabled={!onNext}
              onClick={onNext}
            >
              <span className="quran-reader__nav-name">
                {onNext ? SURAHS[surahIndex + 1].Name : ''}
              </span>
              <Icon name="arrow-left" size={16} />
            </button>
          </div>
        )}
      </div>

      {hasBasmala(surahIndex) && (
        <p className="quran-basmala">{BASMALA}</p>
      )}

      {savedFlash && <p className="quran-reader__saved">تم حفظ الموضع</p>}

      <p className="quran-mushaf">
        {surah.verses.map((verse) => (
          <span
            key={verse.number}
            ref={(el) => {
              if (el) verseEls.current.set(verse.number, el)
              else verseEls.current.delete(verse.number)
            }}
            className={`quran-ayah${current === verse.number ? ' quran-ayah--current' : ''}`}
            data-verse={verse.number}
            onClick={() => updateCurrent(verse.number)}
          >
            {verse.text}
            <span className="quran-ayah__marker">
              <span className="quran-ayah__marker-ring">۝</span>
              <span className="quran-ayah__marker-num">
                {arabicDigits(verse.number)}
              </span>
            </span>
          </span>
        ))}
      </p>
    </div>
  )
}