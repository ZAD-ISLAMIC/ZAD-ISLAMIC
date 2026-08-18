import React from 'react'
import { totalStats } from '../../services/history.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

export function HistoryHero() {
  const stats = totalStats()

  return (
    <div className="hist-hero">
      <span className="hist-hero__badge" aria-hidden="true">
        <Icon name="scroll" size={26} />
      </span>
      <h2 className="hist-hero__name">الموسوعة التاريخية</h2>
      <p className="hist-hero__subtitle">
        أحداث مرتبطة بالإسلام والمسلمين — مما صدر منهم أو من غيرهم
      </p>
      <p className="hist-hero__short">
        من مصادر موثوقة بعنوان قصير وتحرير علمي دقيق، مع التذكير فقط بوفيات الأعلام المشهورين.
      </p>

      <div className="hist-hero__stats" role="group" aria-label="إحصاءات الموسوعة">
        <span className="hist-hero__stat">
          <strong>{arabicDigits(stats.count)}</strong>
          <em>حدثًا</em>
        </span>
        <span className="hist-hero__stat">
          <strong>{arabicDigits(stats.eras)}</strong>
          <em>حقبة</em>
        </span>
      </div>
    </div>
  )
}