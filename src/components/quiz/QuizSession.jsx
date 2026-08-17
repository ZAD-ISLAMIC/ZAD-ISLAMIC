import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  accentForCategory,
  buildSessionQuestions,
  categoryLevelKeys,
  clearLastSession,
  FAST_ANSWER_MS,
  getLevel,
  getProgress,
  levelKey,
  levelNumber,
  passed,
  QUESTION_TIME_MS,
  recordResult,
  saveLastSession,
  starsFromRatio,
  topicLevelKeys,
} from '../../services/quiz.mjs'
import { playSound, vibrate } from '../../services/sound.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'
import { AchievementToast } from './AchievementToast.jsx'
import { QuizQuestionCard } from './QuizQuestionCard.jsx'
import { QuizResult } from './QuizResult.jsx'

/**
 * محرك جلسة المستوى: مؤقت، خلط، سلاسل، مكافأة سرعة، حفظ النتائج
 * وكشف الإنجازات ثم عرض شاشة النتيجة. يتيح الخروج المبكر بلا حفظ.
 */
export function QuizSession({ category, topic, level, onExit, onPlayLevel }) {
  const accent = accentForCategory(category.englishName)
  const questions = useRef(
    buildSessionQuestions(getLevel(category.englishName, topic.slug, level) || [])
  ).current

  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState(null)
  const [locked, setLocked] = useState(false)
  const [phase, setPhase] = useState('session')
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME_MS)
  const [combo, setCombo] = useState(0)
  const [bump, setBump] = useState(false)
  const [result, setResult] = useState(null)
  const [toastQueue, setToastQueue] = useState([])
  const [confirmExit, setConfirmExit] = useState(false)
  const scoreRef = useRef({ correct: 0, wrong: 0, fast: 0, bestCombo: 0 })
  const reviewRef = useRef([])
  const finishedRef = useRef(false)
  const bumpTimer = useRef(null)

  useEffect(
    () => () => {
      clearTimeout(bumpTimer.current)
    },
    []
  )

  useEffect(() => {
    saveLastSession({ categoryEnglish: category.englishName, slug: topic.slug, level })
    return () => {
      if (!finishedRef.current) saveLastSession({ categoryEnglish: category.englishName, slug: topic.slug, level })
    }
  }, [category.englishName, topic.slug, level])

  const timeoutRef = useRef(null)
  useEffect(() => {
    if (phase !== 'session' || locked) return
    timeoutRef.current = setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 100))
    }, 100)
    return () => clearInterval(timeoutRef.current)
  }, [phase, locked])

  const handleTimeout = useCallback(() => {
    if (locked) return
    setLocked(true)
    setSelected(null)
    playSound('wrong')
    vibrate([70, 50, 70])
    const q = questions[index]
    scoreRef.current.wrong += 1
    scoreRef.current.bestCombo = Math.max(scoreRef.current.bestCombo, combo)
    setCombo(0)
    if (q) {
      reviewRef.current.push({
        q: q.q,
        your: 'انتهى الوقت',
        correct: q.answers[q.correctIndex] || '',
        link: q.link,
      })
    }
  }, [locked, questions, index, combo])

  useEffect(() => {
    if (phase === 'session' && !locked && timeLeft <= 0) handleTimeout()
  }, [timeLeft, locked, phase, handleTimeout])

  const finish = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    clearInterval(timeoutRef.current)
    const { correct, wrong, fast, bestCombo } = scoreRef.current
    const key = levelKey(category.englishName, topic.slug, level)
    const previous = getProgress()?.levels?.[key] || null
    const saved = recordResult({
      key,
      correct,
      total: questions.length,
      wrong,
      combo: bestCombo,
      topicKeys: topicLevelKeys(category.englishName, topic.slug),
      categoryKeys: categoryLevelKeys(category),
    })
    const ratio = questions.length ? (correct / questions.length) : 0
    const isNewBest = !previous || ratio > previous.ratio
    clearLastSession()
    setResult({
      correct,
      wrong,
      fast,
      total: questions.length,
      ratio,
      stars: starsFromRatio(ratio),
      bestCombo: bestCombo,
      passed: passed(ratio),
      isNewBest,
      rankBefore: saved.rankBefore,
      rankAfter: saved.rankAfter,
      review: reviewRef.current,
    })
    setToastQueue(saved.newAchievements)
    setPhase('result')
    if (passed(ratio)) {
      playSound('win')
      vibrate([30, 50, 30, 50, 120])
    } else {
      playSound('lose')
      vibrate([90, 60, 90])
    }
  }, [category, topic.slug, level, questions.length])

  const handleAnswer = useCallback(
    (i) => {
      if (locked) return
      const q = questions[index]
      setLocked(true)
      setSelected(i)
      const isRight = i === q.correctIndex
      const isFast = timeLeft > QUESTION_TIME_MS - FAST_ANSWER_MS
      const score = scoreRef.current
      if (isRight) {
        score.correct += 1
        if (isFast) score.fast += 1
        const nextCombo = combo + 1
        setCombo(nextCombo)
        setBump(true)
        clearTimeout(bumpTimer.current)
        bumpTimer.current = setTimeout(() => setBump(false), 320)
        score.bestCombo = Math.max(score.bestCombo, nextCombo)
        playSound('correct')
        vibrate(18)
      } else {
        score.wrong += 1
        score.bestCombo = Math.max(score.bestCombo, combo)
        setCombo(0)
        playSound('wrong')
        vibrate([70, 50, 70])
        reviewRef.current.push({
          q: q.q,
          your: q.answers[i],
          correct: q.answers[q.correctIndex],
          link: q.link,
        })
      }
    },
    [locked, questions, index, timeLeft, combo]
  )

  const handleNext = useCallback(() => {
    if (index + 1 >= questions.length) {
      finish()
      return
    }
    setIndex((i) => i + 1)
    setSelected(null)
    setLocked(false)
    setTimeLeft(QUESTION_TIME_MS)
    setBump(false)
  }, [index, questions.length, finish])

  const handleExit = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    clearInterval(timeoutRef.current)
    clearTimeout(bumpTimer.current)
    clearLastSession()
    setConfirmExit(false)
    onExit()
  }, [onExit])

  if (phase === 'result' && result) {
    return (
      <div className="quiz" style={{ '--quiz-accent': accent }}>
        <AchievementToast queue={toastQueue} onDone={() => setToastQueue([])} />
        <QuizResult
          result={result}
          accent={accent}
          category={category}
          topic={topic}
          level={level}
          onRetry={() => {
            finishedRef.current = false
            reviewRef.current = []
            scoreRef.current = { correct: 0, wrong: 0, fast: 0, bestCombo: 0 }
            setIndex(0)
            setSelected(null)
            setLocked(false)
            setPhase('session')
            setCombo(0)
            setTimeLeft(QUESTION_TIME_MS)
            setResult(null)
            setToastQueue([])
            saveLastSession({ categoryEnglish: category.englishName, slug: topic.slug, level })
          }}
          onNextLevel={() => {
            if (levelNumber(level) < 3) {
              onPlayLevel(`level${levelNumber(level) + 1}`)
            }
          }}
          onExit={() => onExit()}
        />
      </div>
    )
  }

  if (!questions.length) {
    return (
      <div className="quiz" style={{ '--quiz-accent': accent }}>
        <p className="quiz-empty">هذا المستوى لا يحتوي أسئلة بعد</p>
        <div className="quiz-actions">
          <button className="btn btn--md btn--primary" onClick={() => onExit()}>
            العودة
          </button>
        </div>
      </div>
    )
  }

  const comboOn = combo >= 2
  const timerPercent = Math.round((timeLeft / QUESTION_TIME_MS) * 100)

  return (
    <div className="quiz-session" style={{ '--quiz-accent': accent, '--cat-accent': accent }}>
      <div className="quiz-session__head">
        <button className="quiz-exit" onClick={() => setConfirmExit(true)} aria-label="إنهاء الاختبار">
          <Icon name="close" size={15} />
          إنهاء
        </button>
        <div className="quiz-session__meta">
          <span className="quiz-session__counter">
            {topic.name} — المستوى {arabicDigits(levelNumber(level))}
          </span>
          <div className="quiz-progress">
            <span style={{ width: `${(index / questions.length) * 100}%` }} />
          </div>
        </div>
        <div
          className={'quiz-timer' + (timerPercent <= 25 ? ' quiz-timer--danger' : '')}
          style={{ '--p': timerPercent }}
          aria-hidden="true"
        >
          <span className="quiz-timer__num">{arabicDigits(Math.ceil(timeLeft / 1000))}</span>
        </div>
      </div>

      {comboOn && (
        <span className={'quiz-combo' + (bump ? ' quiz-combo--bump' : '')}>
          <Icon name="flame" size={16} />
          سلسلة {arabicDigits(combo)}
        </span>
      )}

      <QuizQuestionCard
        question={questions[index]}
        index={index}
        total={questions.length}
        accent={accent}
        locked={locked}
        selected={selected}
        onAnswer={handleAnswer}
        onNext={handleNext}
        onLinkFail={() =>
          setToastQueue((q) => [
            ...q,
            {
              id: `link-${Date.now()}`,
              icon: 'alert',
              label: 'تنبيه',
              title: 'تعذّر فتح المصدر',
              description: 'لا يوجد متصفح على هذا الجهاز',
            },
          ])
        }
      />

      {confirmExit && (
        <div className="quiz-modal" role="dialog" aria-modal="true" aria-label="إنهاء الاختبار">
          <div className="quiz-modal__card">
            <span className="quiz-modal__icon">
              <Icon name="alert" size={22} />
            </span>
            <h3 className="quiz-modal__title">إنهاء الاختبار؟</h3>
            <p className="quiz-modal__text">أنت في منتصف الاختبار — نتيجة هذا المستوى لن تُحفظ.</p>
            <div className="quiz-modal__actions">
              <button className="btn btn--md btn--ghost" onClick={() => setConfirmExit(false)}>
                إلغاء
              </button>
              <button className="btn btn--md btn--danger" onClick={handleExit}>
                إنهاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}