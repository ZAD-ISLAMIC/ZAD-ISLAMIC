import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  getDhikrs,
  getTodayCounts,
  setCount,
  resetCount,
  resetTodayCounts,
  addDhikr,
  updateDhikr,
  removeDhikr,
  getSettings,
  saveSettings,
  celebrate,
} from '../services/tasbih.mjs'
import { VoiceSession } from '../components/tasbih/VoiceSession.jsx'
import { TapCounter } from '../components/tasbih/TapCounter.jsx'
import { TasbihEditor } from '../components/tasbih/TasbihEditor.jsx'
import { Icon } from '../components/ui/Icon.jsx'
import { playSound, vibrate } from '../services/sound.mjs'
import { isNativeAsrAvailable } from '../services/nativeasr.mjs'

const MODES = {
  MANUAL: 'manual',
  VOICE: 'voice',
}

export default function TasbihScreen() {
  const [mode, setMode] = useState(MODES.MANUAL)
  const [dhikrs, setDhikrs] = useState(() => getDhikrs())
  const [counts, setCounts] = useState(() => getTodayCounts())
  const [activeId, setActiveId] = useState(() => getDhikrs()[0]?.id || null)
  const [editor, setEditor] = useState(null)
  const [completedDhikr, setCompletedDhikr] = useState(null)
  const [settings, setSettings] = useState(() => getSettings())

  const activeDhikr = dhikrs.find((d) => d.id === activeId) || dhikrs[0] || null
  const activeCount = activeDhikr ? counts[activeDhikr.id] || 0 : 0

  /* ----- manual logic ----- */

  const persistCounts = useCallback((next) => {
    setCounts(next)
  }, [])

  const handleCount = useCallback(() => {
    if (!activeDhikr) return
    const current = activeCount
    if (current >= activeDhikr.target) return
    const next = current + 1
    setCount(activeDhikr.id, next)
    persistCounts({ ...counts, [activeDhikr.id]: next })
    // Sound + vibration on each manual count (respecting settings)
    if (settings.sound) playSound('tick')
    if (settings.vibration) vibrate(30)
    if (next >= activeDhikr.target) {
      setCompletedDhikr(activeDhikr)
      celebrate(activeDhikr, activeDhikr.target)
    }
  }, [activeDhikr, activeCount, counts, persistCounts, settings.sound, settings.vibration])

  const handleUndo = useCallback(() => {
    if (!activeDhikr) return
    const current = activeCount
    if (current <= 0) return
    const next = current - 1
    setCount(activeDhikr.id, next)
    persistCounts({ ...counts, [activeDhikr.id]: next })
  }, [activeDhikr, activeCount, counts, persistCounts])

  const handleReset = useCallback(
    (id) => {
      if (!id) return
      resetCount(id)
      persistCounts({ ...counts, [id]: 0 })
    },
    [counts, persistCounts]
  )

  const handleResetAll = useCallback(() => {
    resetTodayCounts()
    setCounts(getTodayCounts())
  }, [])

  const handleSelect = useCallback((dhikr) => {
    setActiveId(dhikr.id)
  }, [])

  const handleEditorSubmit = useCallback(
    (text, target) => {
      if (editor?.mode === 'edit') {
        const updated = updateDhikr(editor.dhikr.id, { text, target })
        if (updated) setDhikrs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
      } else {
        const created = addDhikr(text, target)
        setDhikrs((prev) => [...prev, created])
        setActiveId(created.id)
      }
      setEditor(null)
    },
    [editor]
  )

  const handleDelete = useCallback(
    (dhikr) => {
      removeDhikr(dhikr.id)
      setDhikrs(getDhikrs())
      setCounts(getTodayCounts())
      if (activeId === dhikr.id) setActiveId(getDhikrs()[0]?.id || null)
    },
    [activeId]
  )

  const handleEdit = useCallback((dhikr) => {
    setEditor({ mode: 'edit', dhikr })
  }, [])

  /* ----- sound toggle ----- */

  const toggleSound = useCallback(() => {
    const next = saveSettings({ sound: !settings.sound, vibration: !settings.sound })
    setSettings(next)
  }, [settings.sound])

  /* ----- cleanup ----- */

  useEffect(() => {
    return () => {
      // VoiceSession handles its own cleanup via useEffect
    }
  }, [])

  return (
    <section className="screen taz-screen">
      {/* ---- header ---- */}
      <header className="taz-head">
        <div className="taz-head__copy">
          <h1 className="taz-head__title">المسبحة</h1>
          <p className="taz-head__sub">عدّ يدوي أو صوتي — اختر ما يناسبك</p>
        </div>
        <button className="taz-head__gear" onClick={toggleSound} aria-label={settings.sound ? 'كتم الصوت' : 'تشغيل الصوت'}>
          <Icon name={settings.sound ? 'volume' : 'volume-off'} size={20} />
        </button>
      </header>

      {/* ---- mode tabs ---- */}
      <div className="taz-mode" role="tablist" aria-label="وضع التسبيح">
        <button
          role="tab"
          aria-selected={mode === MODES.MANUAL}
          className={'taz-mode__tab' + (mode === MODES.MANUAL ? ' taz-mode__tab--active' : '')}
          onClick={() => setMode(MODES.MANUAL)}
        >
          <Icon name="bead" size={17} />
          يدوي
        </button>
        <button
          role="tab"
          aria-selected={mode === MODES.VOICE}
          className={'taz-mode__tab' + (mode === MODES.VOICE ? ' taz-mode__tab--active' : '')}
          onClick={() => setMode(MODES.VOICE)}
        >
          <Icon name="mic" size={17} />
          صوتي <sup className="taz-mode__beta">βeta</sup>
        </button>
      </div>

      {/* ---- content ---- */}
      {mode === MODES.MANUAL ? (
        <div className="taz-manual">
          <TapCounter
            dhikrs={dhikrs}
            activeId={activeId}
            counts={counts}
            onCount={handleCount}
            onUndo={handleUndo}
            onReset={handleReset}
            onSelect={handleSelect}
            onAdd={() => setEditor({ mode: 'add' })}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </div>
      ) : (
        <div className="taz-voice">
          {!isNativeAsrAvailable() && (
            <p className="taz-engine__note">المحرك المحلي غير متاح على هذا الجهاز</p>
          )}
          <VoiceSession showDiag />
        </div>
      )}

      {/* ---- editor modal ---- */}
      {editor && (
        <TasbihEditor
          initial={editor.mode === 'edit' ? editor.dhikr : null}
          onSubmit={handleEditorSubmit}
          onClose={() => setEditor(null)}
          onDelete={editor.mode === 'edit' ? () => handleDelete(editor.dhikr) : null}
        />
      )}
    </section>
  )
}