import React from 'react'
import {
  accentForCategory,
  isPlayable,
  levelKey,
  levelNumber,
  unlockHint,
} from '../../services/quiz.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'
import { QuizLevelDoor } from './QuizLevelDoor.jsx'

/** أبواب (مواضيع) المجال: كل موضوع يعرض مستوياته مع قفل التقدم. */
export function QuizTopicGrid({ category, progress, onOpenLevel }) {
  if (!category.topics?.length) {
    return <p className="quiz-empty">لا توجد مواضيع في هذا المجال بعد</p>
  }

  return (
    <div>
      {category.topics.map((topic) => {
        const topicStars = ['level1', 'level2', 'level3'].reduce(
          (sum, level) => sum + ((progress?.levels?.[levelKey(category.englishName, topic.slug, level)] || {}).stars || 0),
          0
        )
        return (
          <div className="quiz-topic" key={topic.slug} style={{ '--cat-accent': accentForCategory(category.englishName) }}>
            <div className="quiz-topic__head">
              <span className="quiz-topic__name">{topic.name}</span>
              {topicStars > 0 ? (
                <span className="quiz-topic__stars">
                  <Icon name="star" size={14} />
                  {arabicDigits(topicStars)}
                </span>
              ) : null}
            </div>
            <div className="quiz-topic__doors">
              {['level1', 'level2', 'level3'].map((level) => {
                const key = levelKey(category.englishName, topic.slug, level)
                const record = progress?.levels?.[key]
                return (
                  <QuizLevelDoor
                    key={key}
                    accent={accentForCategory(category.englishName)}
                    levelNumber={levelNumber(level)}
                    playable={isPlayable(progress, key)}
                    record={record}
                    onClick={() => onOpenLevel(topic, level)}
                  />
                )
              })}
            </div>
            {!isPlayable(progress, levelKey(category.englishName, topic.slug, 'level2')) && (
              <span className="quiz-topic__hint">
                <Icon name="lock" size={12} />
                {unlockHint(2)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}