import React from 'react'
import { parseKhutbah } from '../../services/khutbah.mjs'

/** عارض نص الخطبة — يفصل العناوين (عناصر/اقتباس/الخطبة الأولى/الثانية/خاتمة)
 *  عن الفقرات بعرض مريح. */
export function KhutbahContent({ content }) {
  const sections = parseKhutbah(content)
  if (sections.length === 0) {
    return <p className="kht-content__empty">لم يُسجَّل نص الخطبة هنا.</p>
  }
  return (
    <div className="kht-content">
      {sections.map((section, i) =>
        section.type === 'header' ? (
          <h3 key={i} className="kht-content__header">
            {section.text}
          </h3>
        ) : (
          <p key={i} className="kht-content__para">
            {section.text}
          </p>
        )
      )}
    </div>
  )
}
