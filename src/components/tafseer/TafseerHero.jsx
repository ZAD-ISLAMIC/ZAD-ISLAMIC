import React from 'react'
import { totalStats } from '../../services/tafseer.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

export function TafseerHero() {
  const stats = totalStats()

  return (
    <div className="tafseer-hero">
      <div className="tafseer-hero__badge" aria-hidden="true">
        <Icon name="book-open" size={26} />
      </div>
      <h2 className="tafseer-hero__name">التفسير الميسر</h2>
      <p className="tafseer-hero__subtitle">
        تفسير كتاب الله بأسلوب سهل قريب
      </p>
      <p className="tafseer-hero__short">
        نص كل آية بخط المصحف يليه بيان معناها — من إصدار مجمع الملك فهد
        لطباعة المصحف الشريف، متاح دون إنترنت.
      </p>

      <div className="tafseer-hero__stats" role="group" aria-label="إحصاءات التفسير">
        <span className="tafseer-hero__stat">
          <strong>{arabicDigits(stats.surahs)}</strong>
          <em>سورة</em>
        </span>
        <span className="tafseer-hero__stat">
          <strong>{arabicDigits(stats.count)}</strong>
          <em>آية</em>
        </span>
        <span className="tafseer-hero__stat">
          <strong>{arabicDigits(stats.jozz)}</strong>
          <em>جزءاً</em>
        </span>
      </div>
    </div>
  )
}