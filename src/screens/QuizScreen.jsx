import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AchievementToast } from '../components/quiz/AchievementToast.jsx'
import { QuizCategoryGrid } from '../components/quiz/QuizCategoryGrid.jsx'
import { QuizStats } from '../components/quiz/QuizStats.jsx'
import { Loader } from '../components/ui/Loader.jsx'
import { Icon } from '../components/ui/Icon.jsx'
import { useQuiz } from '../hooks/useQuiz.mjs'
import {
  levelNumber,
  loadQuiz,
  MAX_TOTAL_STARS,
  PASS_RATIO,
  rankForStars,
  rankProgress,
} from '../services/quiz.mjs'
import { arabicDigits } from '../utils/arabic.mjs'

export default function QuizScreen() {
  const navigate = useNavigate()
  const progress = useQuiz()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [welcomeToast, setWelcomeToast] = useState(false)

  useEffect(() => {
    let alive = true
    setError(false)
    loadQuiz()
      .then((loaded) => {
        if (alive) setData(loaded)
      })
      .catch(() => {
        if (alive) setError(true)
      })
    return () => {
      alive = false
    }
  }, [retrying])

  // تحية أول مرة فقط.
  useEffect(() => {
    if (!data || progress?.stats?.gamesPlayed > 0) return
    const timer = setTimeout(() => setWelcomeToast(true), 700)
    return () => clearTimeout(timer)
  }, [data, progress?.stats?.gamesPlayed])

  if (error) {
    return (
      <section>
        <div className="quiz">
          <p className="quiz-empty">تعذّر تحميل بيانات الأسئلة</p>
          <div className="quiz-actions">
            <button className="btn btn--md btn--primary" onClick={() => setRetrying((r) => !r)}>
              <Icon name="refresh" size={16} />
              إعادة المحاولة
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (!data) {
    return (
      <section>
        <Loader label="جارِ تجهيز الأسئلة…" />
      </section>
    )
  }

  const totalStars = Object.values(progress?.levels || {}).reduce(
    (sum, record) => sum + (record.stars || 0),
    0
  )
  const rank = rankForStars(totalStars)
  const rankLine = rankProgress(totalStars)
  const passedLevels = Object.values(progress?.levels || {}).filter(
    (record) => record.ratio >= PASS_RATIO
  ).length
  const totalLevels = Math.round(MAX_TOTAL_STARS / 3)
  const overall = totalLevels ? Math.round((passedLevels / totalLevels) * 100) : 0
  const achievementsCount = progress?.achievements?.length || 0
  const lastSession = progress?.lastSession || null

  const continueLabel = lastSession
    ? (() => {
        const category = data.mainCategories?.find(
          (c) => c.englishName === lastSession.categoryEnglish
        )
        const topic = category?.topics?.find((t) => t.slug === lastSession.slug)
        if (!topic) return null
        return `${topic.name} — المستوى ${arabicDigits(levelNumber(lastSession.level))}`
      })()
    : null

  return (
    <section style={{ '--quiz-accent': 'var(--gold)' }}>
      {showStats && <QuizStats onClose={() => setShowStats(false)} />}
      <AchievementToast
        queue={welcomeToast ? [{ id: 'welcome', icon: 'star', title: 'سلسلة الأبواب', description: 'أجب، اجمع النجوم، وافتح الأبواب واحداً تلو الآخر' }] : []}
        onDone={() => setWelcomeToast(false)}
      />

      <div className="quiz">
        <div className="quiz-hero">
          <div className="quiz-hero__top">
            <span className="quiz-hero__rank-badge">
              <Icon name={rank.icon} size={26} />
            </span>
            <div className="quiz-hero__info">
              <div className="quiz-hero__rank-name">رتبتك: {rank.name}</div>
              <span className="quiz-hero__stars">
                <Icon name="star" size={15} />
                {arabicDigits(totalStars)}/{arabicDigits(MAX_TOTAL_STARS)} نجمة
              </span>
            </div>
            <button
              className="header__action"
              aria-label="الإحصاءات"
              onClick={() => setShowStats(true)}
            >
              <Icon name="chart" size={20} />
            </button>
          </div>

          <div className="quiz-hero__rankline">
            <span className="quiz-hero__rankline-label">
              <span>
                {rankLine.next ? `الرتبة التالية: ${rankLine.next.name}` : 'أعلى رتبة 🏆'}
              </span>
              <span>{overall}% من الأبواب اُفتحت</span>
            </span>
            <span className="quiz-hero__rankline-bar">
              <span style={{ width: `${Math.round(rankLine.ratio * 100)}%` }} />
            </span>
          </div>

          <div className="quiz-hero__stats">
            <div className="quiz-hero__stat">
              <b>{arabicDigits(passedLevels)}/{arabicDigits(totalLevels)}</b>
              <span>مستويات مجتازة</span>
            </div>
            <div className="quiz-hero__stat">
              <b>{arabicDigits(achievementsCount)}/{arabicDigits(8)}</b>
              <span>إنجازات</span>
            </div>
            <div className="quiz-hero__stat">
              <b>{arabicDigits(progress?.stats?.bestCombo || 0)}</b>
              <span>أفضل سلسلة</span>
            </div>
          </div>
        </div>

        {lastSession && continueLabel && (
          <button
            className="quiz-continue"
            onClick={() =>
              navigate(
                `/quiz/${lastSession.categoryEnglish}/${lastSession.slug}/${lastSession.level}`
              )
            }
          >
            <span className="quiz-continue__play">
              <Icon name="play" size={20} />
            </span>
            <span className="quiz-continue__body">
              <strong>متابعة الجلسة السابقة</strong>
              <span>{continueLabel}</span>
            </span>
            <Icon name="arrow-left" size={18} />
          </button>
        )}

        <div className="quiz-section-title">
          <h3>المجالات</h3>
        </div>
        <QuizCategoryGrid
          categories={data.mainCategories}
          progress={progress}
          onOpen={(category) => navigate(`/quiz/${category.englishName}`)}
        />
      </div>
    </section>
  )
}