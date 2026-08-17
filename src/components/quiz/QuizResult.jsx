import React, { useEffect, useMemo, useState } from 'react'
import { useQuiz } from '../../hooks/useQuiz.mjs'
import { isPlayable, levelKey, levelNumber } from '../../services/quiz.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { openExternal } from '../../services/device.mjs'
import { Icon } from '../ui/Icon.jsx'

const CONFETTI_COLORS = ['#d4af37', '#10b981', '#7c9cff', '#fb923c', '#f472b6', '#a78bfa', '#38bdf8']

function makeConfetti(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.7,
    duration: 2.2 + Math.random() * 1.4,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    width: 5 + Math.random() * 6,
    height: 9 + Math.random() * 8,
  }))
}

export function QuizResult({ result, accent, category, topic, level, onRetry, onNextLevel, onExit }) {
  const progress = useQuiz()
  const { correct, total, wrong, fast, stars, bestCombo, passed: didPass, isNewBest, rankBefore, rankAfter, review } = result
  const n = levelNumber(level)

  const [shown, setShown] = useState(0)
  const celebrate = stars >= 3 || isNewBest || (rankAfter.stars > rankBefore.stars)
  const confetti = useMemo(() => (celebrate ? makeConfetti(46) : []), [celebrate])

  const showNext = didPass && n < 3
  const nextLevelKey = showNext ? levelKey(category.englishName, topic.slug, `level${n + 1}`) : ''
  // المستوى التالي يظهر كزر لعب فقط إن كان مفتوحاً فعلاً بعد هذه النتيجة.
  const nextPlayable = showNext && isPlayable(progress, nextLevelKey)

  useEffect(() => {
    setShown(0)
    let raf
    const started = performance.now()
    const duration = 900
    const tick = (now) => {
      const p = Math.min((now - started) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(Math.round(correct * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [correct])

  return (
    <div>
      <div className="quiz-result__card" style={{ '--quiz-accent': accent }}>
        {confetti.length > 0 && (
          <div className="quiz-confetti" aria-hidden="true">
            {confetti.map((piece) => (
              <span
                key={piece.id}
                className="quiz-confetti__piece"
                style={{
                  left: `${piece.left}%`,
                  width: piece.width,
                  height: piece.height,
                  background: piece.color,
                  animationDelay: `${piece.delay}s`,
                  animationDuration: `${piece.duration}s`,
                }}
              />
            ))}
          </div>
        )}

        <h3 className={'quiz-result__status' + (didPass ? ' quiz-result__status--ok' : ' quiz-result__status--bad')}>
          {didPass ? 'أحسنت، اجتزت المستوى!' : 'لم تصل بعد…'}
        </h3>

        <div className="quiz-result__score">{arabicDigits(shown)}</div>
        <div className="quiz-result__score-label">
          صحيحة من {arabicDigits(total)}
        </div>

        <div className="quiz-stars">
          {[0, 1, 2].map((i) => (
            <span key={i} className={'quiz-stars__star' + (i < stars ? ' quiz-stars__star--on' : '')} style={{ '--i': i }}>
              <Icon name={i < stars ? 'star-fill' : 'star'} size={24} />
            </span>
          ))}
        </div>

        <div className="quiz-result__chips">
          <span className="quiz-chip quiz-chip--ok">
            <Icon name="check" size={14} />
            صحيح {arabicDigits(correct)}
          </span>
          <span className="quiz-chip quiz-chip--bad">
            <Icon name="close" size={14} />
            خطأ {arabicDigits(wrong)}
          </span>
          {bestCombo > 1 && (
            <span className="quiz-chip">
              <Icon name="flame" size={14} />
              سلسلة {arabicDigits(bestCombo)}
            </span>
          )}
          {fast > 0 && (
            <span className="quiz-chip">
              <Icon name="bolt" size={14} />
              سريعة {arabicDigits(fast)}
            </span>
          )}
        </div>

        {rankAfter.stars > rankBefore.stars && (
          <span className="quiz-result__rank">
            <Icon name="trophy" size={16} />
            ترقيتك إلى «{rankAfter.name}»
          </span>
        )}

        <div className="quiz-actions">
          <button className="btn btn--md btn--primary" onClick={onRetry}>
            <Icon name="refresh" size={16} />
            إعادة
          </button>
          {nextPlayable ? (
            <button className="btn btn--md btn--outline" onClick={onNextLevel}>
              <Icon name="trophy" size={16} />
              المستوى {arabicDigits(n + 1)}
            </button>
          ) : null}
          <button className="btn btn--md btn--ghost" onClick={onExit}>
            خروج
          </button>
        </div>

        {showNext && !nextPlayable && (
          <span className="quiz-topic__hint">
            <Icon name="lock" size={12} />
            اجتز هذا المستوى بنسبة 70% لفتح المستوى {arabicDigits(n + 1)}
          </span>
        )}
      </div>

      {review.length > 0 && (
        <div className="quiz-review">
          <h4 className="quiz-review__title">
            <Icon name="book" size={16} />
            أخطاؤك — راجعها وتعلّم
          </h4>
          {review.map((item, i) => (
            <div className="quiz-review__item" key={i}>
              <p className="quiz-review__q">{item.q}</p>
              <span className="quiz-review__line quiz-review__line--wrong">
                <Icon name="close" size={14} />
                إجابتك: {item.your || 'لم تُجب'}
              </span>
              <span className="quiz-review__line quiz-review__line--ok">
                <Icon name="check" size={14} />
                الصحيح: {item.correct}
              </span>
              {item.link ? (
                <a
                  className="quiz-review__link"
                  href={item.link}
                  onClick={(event) => {
                    event.preventDefault()
                    openExternal(item.link)
                  }}
                >
                  <Icon name="book" size={13} />
                  قراءة المصدر
                </a>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}