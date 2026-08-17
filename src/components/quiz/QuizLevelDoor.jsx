import React from 'react'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

/**
 * باب مستوى واحد: مقفل (قفل) / متاح (ابدأ) / مكتمل (نجومه).
 * `record`: أفضل نتيجة المستوى إن وجدت. `playable`: هل يُسمح بالدخول؟
 */
export function QuizLevelDoor({ accent, levelNumber, playable, record, onClick }) {
  const stars = record?.stars || 0
  const locked = !playable
  const numeral = arabicDigits(levelNumber)

  if (locked) {
    return (
      <span className="quiz-door--locked" aria-hidden="true">
        <span className="quiz-door__badge">
          <Icon name="lock" size={16} />
        </span>
        <span className="quiz-door__label">المستوى {numeral}</span>
      </span>
    )
  }

  const crown = stars >= 3
  return (
    <button
      className={'quiz-door' + (crown ? ' quiz-door--crown' : '')}
      style={{ '--cat-accent': accent }}
      onClick={onClick}
      aria-label={`اللعب بالمستوى ${numeral}`}
    >
      <span className="quiz-door__badge">
        {stars > 0 ? (
          <span className="quiz-door__stars">
            {[0, 1, 2].map((i) => (
              <Icon
                key={i}
                name="star"
                size={9}
                className={i < stars ? 'quiz-door__star--on' : ''}
              />
            ))}
          </span>
        ) : (
          numeral
        )}
      </span>
      <span className="quiz-door__label">المستوى {numeral}</span>
      {stars > 0 ? (
        <span className="quiz-door__best">{arabicDigits(Math.round((record?.ratio || 0) * 100))}%</span>
      ) : (
        <span className="quiz-door__best">ابدأ</span>
      )}
    </button>
  )
}