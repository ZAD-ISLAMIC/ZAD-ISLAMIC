import React, { useState } from 'react'
import { useQuiz } from '../../hooks/useQuiz.mjs'
import { ACHIEVEMENTS, resetProgress } from '../../services/quiz.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

/** لوحة إحصاءات دائمة + إنجازات + إعادة التعيين. */
export function QuizStats({ onClose }) {
  const progress = useQuiz()
  const [confirming, setConfirming] = useState(false)
  const stats = progress?.stats || {}
  const correct = stats.correct || 0
  const wrong = stats.wrong || 0
  const totalAnswered = correct + wrong
  const accuracy = totalAnswered ? Math.round((correct / totalAnswered) * 100) : 0
  const done = new Set(progress?.achievements || [])

  const reset = () => {
    if (!confirming) {
      setConfirming(true)
      return
    }
    resetProgress()
    setConfirming(false)
    onClose()
  }

  const statsCells = [
    { value: correct, label: 'إجابات صحيحة' },
    { value: wrong, label: 'إجابات خاطئة' },
    { value: arabicDigits(totalAnswered), label: 'إجمالي الإجابات' },
    { value: `${arabicDigits(accuracy)}٪`, label: 'نسبة الدقة' },
    { value: stats.gamesPlayed || 0, label: 'مستويات لعبتها' },
    { value: stats.bestCombo || 0, label: 'أفضل سلسلة' },
    { value: stats.perfects || 0, label: 'مستويات مثالية' },
    { value: done.size, label: 'إنجازات مكتسبة' },
  ]

  return (
    <div className="quiz-stats-overlay" onClick={onClose} role="presentation">
      <div
        className="quiz-stats-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="الإحصاءات"
      >
        <div className="quiz-stats-panel__head">
          <h3>
            <Icon name="chart" size={19} />
            إحصاءات الأسئلة
          </h3>
          <button className="quiz-stats-panel__close" onClick={onClose} aria-label="إغلاق">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="quiz-stats-grid">
          {statsCells.map((cell) => (
            <div className="quiz-stats-cell" key={cell.label}>
              <b>{cell.value}</b>
              <span>{cell.label}</span>
            </div>
          ))}
        </div>

        <div className="quiz-stats-ach">
          <h4 className="quiz-review__title">
            <Icon name="trophy" size={16} />
            الإنجازات
          </h4>
          {ACHIEVEMENTS.map((achievement) => {
            const unlocked = done.has(achievement.id)
            return (
              <div className={'quiz-stats-ach__row' + (unlocked ? ' quiz-stats-ach__row--done' : ' quiz-stats-ach__row--todo')} key={achievement.id}>
                <Icon name={achievement.icon} size={18} />
                <span className="quiz-stats-ach__meta">
                  <strong>{achievement.title}</strong>
                  <span>{achievement.description}</span>
                </span>
                {unlocked ? <Icon name="check" size={16} /> : <Icon name="lock" size={15} />}
              </div>
            )
          })}
        </div>

        <button className="quiz-stats-reset" onClick={reset}>
          <Icon name="trash" size={15} />
          {confirming ? 'اضغط مرة أخرى للتأكيد' : 'إعادة تعيين كل التقدم'}
        </button>
      </div>
    </div>
  )
}