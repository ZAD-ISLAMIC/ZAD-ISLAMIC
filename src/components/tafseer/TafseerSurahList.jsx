import React, { useMemo, useState } from 'react'
import { TAFSEER_SURAHS } from '../../services/tafseer.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

export function TafseerSurahList({ onOpen }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return TAFSEER_SURAHS
    const numeric = parseInt(q, 10)
    return TAFSEER_SURAHS.filter(
      (s) =>
        s.nameAr.includes(q) ||
        s.name.includes(q) ||
        s.nameAr.toLowerCase().includes(q.toLowerCase()) ||
        s.n === numeric
    )
  }, [query])

  return (
    <div className="tafseer-surah-list">
      <ul className="quran-list">
        {filtered.map((surah) => (
          <li key={surah.n}>
            <button className="quran-item" onClick={() => onOpen(surah.n)}>
              <span className="quran-item__number">{arabicDigits(surah.n)}</span>
              <span className="quran-item__body">
                <span className="quran-item__name">{surah.nameAr}</span>
                <span className="quran-item__meta">
                  {surah.descent} • {arabicDigits(surah.verses)} آية • الجزء {arabicDigits(surah.jozz[0])}
                </span>
              </span>
              <Icon name="arrow-right" size={20} className="quran-item__arrow" />
            </button>
          </li>
        ))}
      </ul>

      {filtered.length === 0 && (
        <p className="quran-empty">لا توجد سورة باسم «{query}»</p>
      )}
    </div>
  )
}