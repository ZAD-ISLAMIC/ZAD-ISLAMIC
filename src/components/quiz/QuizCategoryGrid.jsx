import React from 'react'
import {
  accentForCategory,
  categoryLevelKeys,
  PASS_RATIO,
} from '../../services/quiz.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

/** عدد المستويات المجتازة (نسبة ≥ 60%) داخل مجال. */
function passedCount(category, progress) {
  return categoryLevelKeys(category).filter((key) => {
    const record = progress?.levels?.[key]
    return record && record.ratio >= PASS_RATIO
  }).length
}

/** مجموع نجوم مجال كامل. */
function starsCount(category, progress) {
  return categoryLevelKeys(category).reduce(
    (sum, key) => sum + ((progress?.levels?.[key] || {}).stars || 0),
    0
  )
}

export function QuizCategoryGrid({ categories, progress, onOpen }) {
  if (!categories.length) {
    return <p className="quiz-empty">لا توجد مجالات متاحة حالياً</p>
  }

  return (
    <div className="quiz-cats">
      {categories.map((category) => {
        const accent = accentForCategory(category.englishName)
        const totalLevels = categoryLevelKeys(category).length
        const done = passedCount(category, progress)
        const stars = starsCount(category, progress)
        const percentile = totalLevels ? Math.round((done / totalLevels) * 100) : 0
        return (
          <button
            key={category.englishName}
            className="quiz-cat"
            style={{ '--cat-accent': accent }}
            onClick={() => onOpen(category)}
            aria-label={`مجال ${category.arabicName}`}
          >
            <span className="quiz-cat__head">
              <span className="quiz-cat__name">{category.arabicName}</span>
              <Icon name="star" size={15} />
            </span>
            {category.description ? (
              <span className="quiz-cat__desc">{category.description}</span>
            ) : null}
            <span className="quiz-cat__progress">
              <span className="quiz-cat__progress-bar">
                <span style={{ width: `${percentile}%` }} />
              </span>
              <span className="quiz-cat__progress-label">
                {arabicDigits(category.topics?.length || 0)} موضوع •{' '}
                {arabicDigits(done)}/{arabicDigits(totalLevels)} مستوى •{' '}
                {arabicDigits(stars)} نجوم
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function QuizCategoryProgressSummary({ category, progress }) {
  const totalLevels = categoryLevelKeys(category).length
  const done = passedCount(category, progress)
  const stars = starsCount(category, progress)
  return (
    <span className="quiz-topbar__summary">
      {arabicDigits(done)}/{arabicDigits(totalLevels)} مستوى • {arabicDigits(stars)} نجوم
    </span>
  )
}