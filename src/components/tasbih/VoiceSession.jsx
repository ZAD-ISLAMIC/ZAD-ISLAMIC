import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../ui/Icon.jsx'
import { arabicDigits } from '../../utils/arabic.mjs'
import { startNativeAsr, stopNativeAsr, isNativeAsrAvailable } from '../../services/nativeasr.mjs'
import { createRecognizer } from '../../services/recognition.mjs'
import { getSettings, AI_DHIKRS } from '../../services/tasbih.mjs'
import { playSound, vibrate } from '../../services/sound.mjs'

const STATUS = {
  IDLE: 'idle',
  LISTENING: 'listening',
  ERROR: 'error',
}

/**
 * Voice session running on the local moonshine engine only.
 *
 * The continuous listening loop lives in the native plugin: the mic stays
 * open for the whole session and utterances are segmented internally by VAD
 * (silence-pause ends + reports each dhikr fast, 5s cap bounds decode cost).
 */
export function VoiceSession({ showDiag }) {
  const [status, setStatus] = useState(STATUS.IDLE)
  const [error, setError] = useState(null)
  const [interim, setInterim] = useState('')
  const [lastHit, setLastHit] = useState(null)
  const [tallies, setTallies] = useState({})
  const [sessionTotal, setSessionTotal] = useState(0)
  const [supported] = useState(() => isNativeAsrAvailable())

  /* ---- refs ---- */
  const sessionRecognizerRef = useRef(null)
  const cleanupRef = useRef(null)
  const talliesRef = useRef({})
    const totalRef = useRef(0)
    const activeRef = useRef(false)
    const sessionStartRef = useRef(0)

  /* ---- session recognizer ---- */
  const getSessionRecognizer = useCallback(() => {
    if (!sessionRecognizerRef.current) {
      sessionRecognizerRef.current = createRecognizer({
        getDhikrs: () => AI_DHIKRS,
        getSettings: () => getSettings(),
      })
    }
    return sessionRecognizerRef.current
  }, [])

  const resetSession = useCallback(() => {
    talliesRef.current = {}
    totalRef.current = 0
    setTallies({})
    setSessionTotal(0)
    setLastHit(null)
    setInterim('')
    getSessionRecognizer().reset()
  }, [getSessionRecognizer])

  /* ---- final-text handler ---- */
  const handleFinal = useCallback(
    (text, nativeDiag) => {
      if (!text || !activeRef.current) return

      // Reject straggler results flushed right after a restart (worker
      // thread race): the plugin attaches a monotonic `segmentIndex`, and
      // the shared session recognizer dedups on that identity.
      if (nativeDiag?.segmentIndex != null) {
        const now = Date.now()
        if (now - sessionStartRef.current < 500) return
      }

      setInterim('')

      // Pass native diagnostics (segmentIndex, snr, speechMs) so the session
      // recognizer can do index-based dedup and noise rejection.
      const result = getSessionRecognizer().push(text, nativeDiag || null)
      const matches = result?.matches || []
      if (matches.length === 0) return

      const settingsNow = getSettings()
      const next = { ...talliesRef.current }
      let added = 0
      let top = null
      for (const m of matches) {
        if (!m || m.count <= 0) continue
        next[m.dhikr.id] = (next[m.dhikr.id] || 0) + m.count
        added += m.count
        if (!top || m.count > top.count) top = m
      }
      if (added === 0) return

      talliesRef.current = next
      totalRef.current += added
      setTallies(next)
      setSessionTotal(totalRef.current)
      if (top) setLastHit({ text: top.dhikr.text, count: top.count })

      if (settingsNow.sound) playSound('tick')
      if (settingsNow.vibration) vibrate(10)
    },
    [getSessionRecognizer]
  )

  /* =================== Core control =================== */

  /* ---- launch ---- */
  const launchNative = useCallback(async () => {
    const cleanup = await startNativeAsr({
      onFinal: (text) => handleFinal(text),
      onInterim: (text) => { if (activeRef.current) setInterim(text) },
      onError: (err) => {
        if (!activeRef.current) return
        setError(err)
        setStatus(STATUS.ERROR)
        activeRef.current = false
      },
      onReady: () => { if (activeRef.current) setStatus(STATUS.LISTENING) },
    })

    cleanupRef.current = cleanup
  }, [handleFinal])

  const stopEngine = useCallback(() => {
    activeRef.current = false
    if (cleanupRef.current) {
      try { cleanupRef.current() } catch { /* ignore */ }
      cleanupRef.current = null
    }
  }, [])

  const startListening = useCallback(async () => {
    if (activeRef.current) return
    stopEngine()

    setError(null)
    resetSession()

    if (!isNativeAsrAvailable()) {
      setStatus(STATUS.IDLE)
      return
    }

    activeRef.current = true
    sessionStartRef.current = Date.now()

    try {
      setStatus(STATUS.LISTENING)
      await launchNative()
    } catch (err) {
      stopEngine()
      setError({ type: 'engine', message: err?.message || 'تعذّر تشغيل محرك التعرف' })
      setStatus(STATUS.ERROR)
    }
  }, [resetSession, handleFinal, stopEngine, launchNative])

  const stopListening = useCallback(() => {
    stopEngine()
    setStatus(STATUS.IDLE)
    setInterim('')
  }, [stopEngine])

  /* ---- cleanup ---- */
  useEffect(() => {
    return () => { stopEngine() }
  }, [stopEngine])

  /* ---- toggle ---- */
  const toggle = () => {
    if (status === STATUS.LISTENING) stopListening()
    else startListening()
  }

  /* =================== Render =================== */

  const isListening = status === STATUS.LISTENING
  const hasError = status === STATUS.ERROR && error

  return (
    <div className="voice">
      <div className={'voice-stage' + (isListening ? ' voice-stage--live' : '')}>
        {hasError ? (
          <div className="voice-error">
            <div className="voice-error__icon">
              <Icon name="alert" size={26} />
            </div>
            <p className="voice-error__title">تعذّر الاستماع</p>
            <p className="voice-error__desc">{error.message}</p>
            <div className="voice-error__actions">
              <button className="voice-btn voice-btn--solid" onClick={startListening}>
                <Icon name="refresh" size={15} />
                إعادة المحاولة
              </button>
            </div>
          </div>
        ) : !supported ? (
          <div className="voice-error">
            <div className="voice-error__icon">
              <Icon name="mic-off" size={26} />
            </div>
            <p className="voice-error__title">التعرف الصوتي غير مدعوم</p>
            <p className="voice-error__desc">
              هذا الجهاز لا يدعم التعرف الصوتي. استخدم العد اليدوي.
            </p>
          </div>
        ) : (
          <>
            <button
              className={'voice-orb' + (isListening ? ' voice-orb--live' : '')}
              onClick={toggle}
              aria-label={isListening ? 'إيقاف الاستماع' : 'بدء الاستماع'}
              aria-pressed={isListening}
            >
              {isListening && <span className="voice-orb__ring voice-orb__ring--1" />}
              {isListening && <span className="voice-orb__ring voice-orb__ring--2" />}
              <Icon name={isListening ? 'pause' : 'mic'} size={44} />
            </button>

            <p className="voice-stage__status">
              {isListening
                ? 'أستمع الآن — قل الأذكار'
                : 'اضغط لبدء الاستماع'}
            </p>

            <div className="voice-badge voice-badge--offline">
              <span className="voice-badge__dot" />
              المحرك المحلي (بدون إنترنت)
            </div>

            <div className="voice-stage__total">
              <span className="voice-stage__total-label">حصيلة الجلسة</span>
              <strong className="voice-stage__total-value">{arabicDigits(sessionTotal)}</strong>
            </div>

            <div className="voice-stage__live" aria-live="polite">
              {isListening ? (
                interim ? (
                  <span className="voice-stage__live-text">«{interim}»</span>
                ) : (
                  <span className="voice-stage__live-wait">
                    <span className="voice-stage__dot" />
                    <span className="voice-stage__dot" />
                    <span className="voice-stage__dot" />
                  </span>
                )
              ) : (
                <span className="voice-stage__hint">
                  سيظهر هنا ما نسمعه، وستُعدّ الأذكار تلقائيًا
                </span>
              )}
            </div>

            {lastHit && (
              <div className="voice-stage__last">
                <span className="voice-stage__last-badge">آخر ما أُحصي</span>
                <strong>{lastHit.text}</strong>
                <span className="voice-stage__last-times">× {arabicDigits(lastHit.count)}</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="voice-grid" role="list" aria-label="الأذكار المُعدّة">
        {AI_DHIKRS.map((dhikr) => {
          const count = tallies[dhikr.id] || 0
          const isHit = lastHit && lastHit.text === dhikr.text
          return (
            <div
              key={dhikr.id}
              role="listitem"
              className={
                'voice-chip' +
                (isHit ? ' voice-chip--hit' : '') +
                (count > 0 ? ' voice-chip--counted' : '')
              }
            >
              <span className="voice-chip__text">{dhikr.text}</span>
              <span key={count} className="voice-chip__count">
                {arabicDigits(count)}
              </span>
            </div>
          )
        })}
      </div>

      {showDiag && (
        <p className="voice-note">
          المحرك المحلي (بدون إنترنت)
          {isListening && interim && ' — نسمعك'}
        </p>
      )}
    </div>
  )
}