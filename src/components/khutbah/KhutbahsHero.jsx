import React from 'react'
import { totalStats } from '../../services/khutbah.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

export function KhutbahsHero() {
  const stats = totalStats()

  return (
    <div className="kht-hero">
      <div className="kht-hero__badge" aria-hidden="true">
        <Icon name="minbar" size={26} />
      </div>
      <h2 className="kht-hero__name">الخطب</h2>
      <p className="kht-hero__subtitle">خطب منبرية مختارة من موقع ملتقى الخطباء</p>
      <p className="kht-hero__short">
        خطب مكتوبة بفئاتها ومرفقاتها (PDF/Word) — يمكنك تحميل المرفقات وقراءتها في
        أي قارئ خارجي دون إنترنت.
      </p>

      <div className="kht-hero__stats" role="group" aria-label="إحصاءات الخطب">
        <span className="kht-hero__stat">
          <strong>{arabicDigits(stats.count)}</strong>
          <em>خطبة</em>
        </span>
        <span className="kht-hero__stat">
          <strong>{arabicDigits(stats.categories)}</strong>
          <em>فئة</em>
        </span>
        <span className="kht-hero__stat">
          <strong>{arabicDigits(stats.authors)}</strong>
          <em>كاتباً</em>
        </span>
        <span className="kht-hero__stat">
          <strong>{arabicDigits(stats.attachments)}</strong>
          <em>مرفقاً</em>
        </span>
      </div>
    </div>
  )
}
