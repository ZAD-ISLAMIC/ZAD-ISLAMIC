import React, { useEffect, useRef, useState } from 'react'
import { Icon } from '../ui/Icon.jsx'

/**
 * يعرض الإنجازات المكتشفة حديثًا (أو تنبيهات عامة) واحدة تلو الأخرى في منبثق علوي.
 * `queue`: مصفوفة عناصر `{ id, icon, title, description, label }` — `label`
 * يُستبدل تلقائيًا بـ"إنجاز جديد" إن لم يُمرَّر. `description` اختياري.
 * `onDone`: يُستدعى عند انتهاء عرض كل القائمة.
 */
export function AchievementToast({ queue = [], onDone }) {
  const [index, setIndex] = useState(0)
  const timer = useRef(null)

  useEffect(() => {
    if (!queue.length) return
    if (index >= queue.length) {
      onDone?.()
      return
    }
    timer.current = setTimeout(() => setIndex((i) => i + 1), 2800)
    return () => clearTimeout(timer.current)
  }, [queue, index, onDone])

  if (!queue.length || index >= queue.length) return null
  const achievement = queue[index]

  return (
    <div className="quiz-ach" role="status" aria-live="polite">
      <span className="quiz-ach__icon">
        <Icon name={achievement.icon || 'check'} size={16} />
      </span>
      <span className="quiz-ach__body">
        <span className="quiz-ach__label">{achievement.label || 'إنجاز جديد'}</span>
        <strong className="quiz-ach__title">{achievement.title}</strong>
        {achievement.description ? (
          <span className="quiz-ach__desc">{achievement.description}</span>
        ) : null}
      </span>
      <button
        className="quiz-ach__close"
        aria-label="إغلاق"
        onClick={() => setIndex((i) => i + 1)}
      >
        <Icon name="close" size={15} />
      </button>
    </div>
  )
}