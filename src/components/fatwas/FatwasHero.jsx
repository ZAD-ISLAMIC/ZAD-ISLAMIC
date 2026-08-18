import React from 'react'
import { totalStats } from '../../services/fatwas.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

export function FatwasHero({ onOpenBio }) {
  const stats = totalStats()

  return (
    <div className="fat-h">
      <div className="fat-hero">
        <div className="fat-hero__badge" aria-hidden="true">
          <Icon name="feather" size={26} />
        </div>
        <h2 className="fat-hero__name">الشيخ عبد العزيز بن باز</h2>
        <p className="fat-hero__subtitle">رحمه الله — مفتي عام المملكة العربية السعودية سابقاً</p>
        <p className="fat-hero__short">
          فتاوى شرعية موثّقة من موقع الشيخ الرسمي، مكتوبة ومسموعة.
        </p>

        <div className="fat-hero__stats" role="group" aria-label="إحصاءات الفتاوى">
          <span className="fat-hero__stat">
            <strong>{arabicDigits(stats.count)}</strong>
            <em>فتوى</em>
          </span>
          <span className="fat-hero__stat">
            <strong>{arabicDigits(stats.audioCount)}</strong>
            <em>صوتية</em>
          </span>
          <span className="fat-hero__stat">
            <strong>{arabicDigits(stats.categories)}</strong>
            <em>فئة</em>
          </span>
        </div>

        <button className="fat-hero__bio" onClick={onOpenBio}>
          <Icon name="info" size={16} />
          نبذة عن الشيخ
        </button>
      </div>
    </div>
  )
}