import React from 'react'
import { arabicDigits } from '../../utils/arabic.mjs'
import { openExternal } from '../../services/device.mjs'
import { Icon } from '../ui/Icon.jsx'

/**
 * بطاقة سؤال واحدة + الأزرار الثلاثة + تعقيب (صواب/خطأ) + زر التالي.
 * `locked`: السؤال استُجيب — تُعطَّل الأزرار ويُكشف الصحيح.
 * `selected`: فهرس إجابة المستخدم (أو null إن انتهى المؤقت).
 */
export function QuizQuestionCard({
  question,
  index,
  total,
  accent,
  locked,
  selected,
  onAnswer,
  onNext,
  onLinkFail,
}) {
  if (!question) return null
  const answeredRight = locked && selected !== null && selected === question.correctIndex
  const timedOut = locked && selected === null

  const answerClass = (i) => {
    if (!locked) return ''
    if (i === question.correctIndex) {
      return answeredRight && i === selected ? ' quiz-answer--correct' : ' quiz-answer--reveal'
    }
    if (i === selected) return ' quiz-answer--wrong'
    return ''
  }

  return (
    <div>
      <div className="quiz-card" style={{ '--quiz-accent': accent }}>
        <p className="quiz-card__q">{question.q}</p>
        <div className="quiz-answers">
          {question.answers.map((answer, i) => (
            <button
              key={i}
              className={'quiz-answer' + answerClass(i)}
              disabled={locked}
              onClick={() => onAnswer(i)}
            >
              <span className="quiz-answer__marker">{['أ', 'ب', 'ج'][i] || arabicDigits(i + 1)}</span>
              <span>{answer}</span>
            </button>
          ))}
        </div>

        {locked && (
          <div className="quiz-feedback">
            <span className={'quiz-feedback__text' + (answeredRight ? ' quiz-feedback__text--ok' : ' quiz-feedback__text--bad')}>
              <Icon name={answeredRight ? 'check' : 'close'} size={16} />
              {answeredRight
                ? 'أحسنت! إجابة صحيحة'
                : timedOut
                  ? 'انتهى الوقت!'
                  : 'إجابة غير صحيحة'}
            </span>
            {!answeredRight && question.correctIndex >= 0 && (
              <span className="quiz-feedback__text quiz-feedback__text--ok">
                <Icon name="star" size={14} />
                الصحيح: {question.answers[question.correctIndex]}
              </span>
            )}
          </div>
        )}

        {locked && (
          <div className="quiz-feedback" style={{ justifyContent: 'flex-end' }}>
            {question.link ? (
              <a
                className="quiz-feedback__link"
                href={question.link}
                onClick={(event) => {
                  event.preventDefault()
                  if (!openExternal(question.link)) onLinkFail?.()
                }}
              >
                <Icon name="book" size={14} />
                المصدر
              </a>
            ) : null}
            <button className="quiz-next" onClick={onNext}>
              {index + 1 >= total ? 'عرض النتيجة' : 'السؤال التالي'}
              <Icon name="arrow-left" size={16} />
            </button>
          </div>
        )}
      </div>
      <p className="quiz-session__counter">
        السؤال {arabicDigits(index + 1)} من {arabicDigits(total)}
      </p>
    </div>
  )
}