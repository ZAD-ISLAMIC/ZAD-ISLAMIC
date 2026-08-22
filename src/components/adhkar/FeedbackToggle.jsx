import React from 'react'
import { Icon } from '../ui/Icon.jsx'
import {
  isSoundEnabled,
  setSoundEnabled,
  isVibrationEnabled,
  setVibrationEnabled,
} from '../../services/feedback.mjs'

/**
 * أزرار سريعة لكتم ملاحظات العدّ (الصوت والاهتزاز) داخل شاشة الأذكار/حصن المسلم.
 * المكوّن قابل لإعادة الاستخدام ويُربَط بحالة الأب (controlled) لتظل الأزرار
 * والمنطق الفعلي (التشغيل) متزامنين في نفس الشاشة.
 */
export function FeedbackToggle({ soundOn, vibrationOn, onToggleSound, onToggleVibration }) {
  const sound = soundOn ?? isSoundEnabled()
  const vibration = vibrationOn ?? isVibrationEnabled()

  const toggleSound = () => {
    const next = !sound
    setSoundEnabled(next)
    onToggleSound?.(next)
  }

  const toggleVibration = () => {
    const next = !vibration
    setVibrationEnabled(next)
    onToggleVibration?.(next)
  }

  return (
    <div className="adhkar-feedback">
      <button
        type="button"
        className={'adhkar-feedback__btn' + (sound ? '' : ' adhkar-feedback__btn--off')}
        onClick={toggleSound}
        aria-pressed={!sound}
        aria-label={sound ? 'كتم صوت العدّ' : 'تشغيل صوت العدّ'}
      >
        <Icon name={sound ? 'volume' : 'volume-off'} size={16} />
        <span>{sound ? 'الصوت' : 'كتم'}</span>
      </button>

      <button
        type="button"
        className={'adhkar-feedback__btn' + (vibration ? '' : ' adhkar-feedback__btn--off')}
        onClick={toggleVibration}
        aria-pressed={!vibration}
        aria-label={vibration ? 'إيقاف اهتزاز العدّ' : 'تشغيل اهتزاز العدّ'}
      >
        <Icon name={vibration ? 'bolt' : 'bolt-off'} size={16} />
        <span>{vibration ? 'اهتزاز' : 'بدون'}</span>
      </button>
    </div>
  )
}
