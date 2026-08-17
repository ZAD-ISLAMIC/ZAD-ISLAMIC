import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { QuizSession } from '../components/quiz/QuizSession.jsx'
import { Loader } from '../components/ui/Loader.jsx'
import { Icon } from '../components/ui/Icon.jsx'
import { accentForCategory, loadQuiz } from '../services/quiz.mjs'

export default function QuizSessionScreen() {
  const { categoryEnglish, topicSlug, level } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    let alive = true
    setError(false)
    loadQuiz()
      .then((loaded) => alive && setData(loaded))
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [retrying])

  if (error) {
    return (
      <section>
        <div className="quiz">
          <div className="quiz-empty">تعذّر تحميل البيانات</div>
          <button className="btn btn--md btn--primary" onClick={() => setRetrying((r) => !r)}>
            إعادة المحاولة
          </button>
        </div>
      </section>
    )
  }

  if (!data) {
    return (
      <section>
        <Loader />
      </section>
    )
  }

  const category = data.mainCategories.find((c) => c.englishName === categoryEnglish)
  const topic = category?.topics?.find((t) => t.slug === topicSlug)
  const validLevel = ['level1', 'level2', 'level3'].includes(level)

  if (!category || !topic || !validLevel) {
    return (
      <section>
        <div className="quiz">
          <p className="quiz-empty">هذه الجلسة غير موجودة</p>
          <div className="quiz-actions">
            <button
              className="btn btn--md btn--primary"
              onClick={() => navigate(category ? `/quiz/${category.englishName}` : '/quiz')}
            >
              <Icon name="arrow-right" size={16} />
              العودة للأبواب
            </button>
          </div>
        </div>
      </section>
    )
  }

  const accent = accentForCategory(category.englishName)

  return (
    <section style={{ '--cat-accent': accent }}>
      <QuizSession
        key={`${category.englishName}/${topic.slug}/${level}`}
        category={category}
        topic={topic}
        level={level}
        onExit={() => navigate(`/quiz/${category.englishName}`)}
        onPlayLevel={(nextLevel) =>
          navigate(`/quiz/${category.englishName}/${topic.slug}/${nextLevel}`)
        }
      />
    </section>
  )
}