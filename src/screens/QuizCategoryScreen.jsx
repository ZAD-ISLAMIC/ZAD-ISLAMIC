import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { QuizCategoryProgressSummary } from '../components/quiz/QuizCategoryGrid.jsx'
import { QuizTopicGrid } from '../components/quiz/QuizTopicGrid.jsx'
import { Loader } from '../components/ui/Loader.jsx'
import { Icon } from '../components/ui/Icon.jsx'
import { useQuiz } from '../hooks/useQuiz.mjs'
import { accentForCategory, loadQuiz } from '../services/quiz.mjs'

export default function QuizCategoryScreen() {
  const { categoryEnglish } = useParams()
  const navigate = useNavigate()
  const progress = useQuiz()
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

  if (!category) {
    return (
      <section>
        <div className="quiz">
          <p className="quiz-empty">هذا المجال غير موجود</p>
          <div className="quiz-actions">
            <button className="btn btn--md btn--primary" onClick={() => navigate('/quiz')}>
              العودة للأسئلة
            </button>
          </div>
        </div>
      </section>
    )
  }

  const accent = accentForCategory(category.englishName)

  return (
    <section style={{ '--cat-accent': accent }}>
      <div className="quiz" style={{ '--quiz-accent': accent }}>
        <div className="quiz-topbar">
          <button className="quran-reader__back" onClick={() => navigate('/quiz')}>
            <Icon name="arrow-right" size={20} />
            <span>المجالات</span>
          </button>
          <QuizCategoryProgressSummary category={category} progress={progress} />
        </div>

        <div className="quiz-cat-head">
          <span className="quiz-cat-head__badge">
            <Icon name="star" size={24} />
          </span>
          <div className="quiz-cat-head__meta">
            <h2>{category.arabicName}</h2>
            {category.description ? <p>{category.description}</p> : null}
          </div>
        </div>

        <div className="quiz-section-title">
          <h3>الأبواب — اجتز باباً لتفتح التالي</h3>
        </div>
        <QuizTopicGrid
          category={category}
          progress={progress}
          onOpenLevel={(topic, level) =>
            navigate(`/quiz/${category.englishName}/${topic.slug}/${level}`)
          }
        />
      </div>
    </section>
  )
}