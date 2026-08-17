import React, { useEffect, useRef, useState } from 'react'
import { Icon } from '../ui/Icon.jsx'

/**
 * Professional add/edit dhikr modal.
 *
 * - Backdrop click closes the dialog
 * - Escape key closes the dialog
 * - Focus trapped inside the dialog
 * - Validation with inline errors
 */
export function TasbihEditor({ initial, onSubmit, onClose, onDelete }) {
  const [text, setText] = useState(initial?.text || '')
  const [target, setTarget] = useState(String(initial?.target || 33))
  const [error, setError] = useState('')
  const textareaRef = useRef(null)
  const cardRef = useRef(null)

  // Focus the textarea on open + trap focus in the dialog
  useEffect(() => {
    textareaRef.current?.focus()
    const card = cardRef.current
    if (!card) return

    const handleKeyDown = (event) => {
      // Escape closes
      if (event.key === 'Escape') {
        onClose()
        return
      }
      // Focus trap: keep Tab cycling within the dialog
      if (event.key !== 'Tab') return
      const focusables = card.querySelectorAll(
        'button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const submit = () => {
    const clean = text.trim()
    if (!clean) {
      setError('يرجى إدخال نص الذكر')
      return
    }
    const num = Number(target)
    if (!Number.isFinite(num) || num < 1 || num > 10000) {
      setError('يرجى إدخال عدد صحيح بين 1 و 10000')
      return
    }
    onSubmit(clean, num)
  }

  return (
    <div className="tasbih-modal" role="dialog" aria-modal="true" aria-label={initial ? 'تعديل الذكر' : 'إضافة ذكر'}>
      <div className="tasbih-modal__backdrop" onClick={onClose} />
      <div className="tasbih-modal__card" ref={cardRef}>
        <div className="tasbih-modal__head">
          <h3 className="tasbih-modal__title">
            {initial ? 'تعديل الذكر' : 'إضافة ذكر جديد'}
          </h3>
          <button className="tasbih-modal__close" onClick={onClose} aria-label="إغلاق">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="tasbih-modal__body">
          <label className="tasbih-modal__field">
            <span className="tasbih-modal__label">نص الذكر</span>
            <textarea
              ref={textareaRef}
              className="tasbih-modal__input tasbih-modal__input--area"
              value={text}
              onChange={(event) => {
                setText(event.target.value)
                if (error) setError('')
              }}
              placeholder="مثال: لا إله إلا الله"
              rows={3}
            />
          </label>

          <label className="tasbih-modal__field">
            <span className="tasbih-modal__label">عدد التكرار</span>
            <input
              className="tasbih-modal__input"
              type="number"
              min="1"
              max="10000"
              value={target}
              onChange={(event) => {
                setTarget(event.target.value)
                if (error) setError('')
              }}
              inputMode="numeric"
            />
          </label>

          {error && <p className="tasbih-modal__error">{error}</p>}
        </div>

        <div className="tasbih-modal__actions">
          {onDelete && (
            <button className="tasbih-modal__btn tasbih-modal__btn--danger" onClick={() => onDelete(initial)}>
              <Icon name="trash" size={15} />
              حذف
            </button>
          )}
          <button className="tasbih-modal__btn tasbih-modal__btn--ghost" onClick={onClose}>
            إلغاء
          </button>
          <button className="tasbih-modal__btn tasbih-modal__btn--primary" onClick={submit}>
            {initial ? 'حفظ التعديل' : 'إضافة'}
          </button>
        </div>
      </div>
    </div>
  )
}