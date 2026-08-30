import React, { useMemo, useState } from 'react'
import { getAllCards, searchCards, trackForAudio } from '../../services/quranCards.mjs'
import { usePlayer } from '../../hooks/usePlayer.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { QuranCardItem } from './QuranCardItem.jsx'
import { Icon } from '../ui/Icon.jsx'

export function QuranCardsList({ onOpen }) {
  const [query, setQuery] = useState('')
  const player = usePlayer()

  const cards = useMemo(() => {
    if (!query.trim()) return getAllCards()
    return searchCards(query)
  }, [query])

  const isCardActive = (number) => {
    return player.track?.kind === 'quranCard' && player.track?.number === number
  }

  const playCard = (number) => {
    if (isCardActive(number)) {
      player.toggle()
      return
    }
    const track = trackForAudio(number)
    if (!track) return
    const queue = getAllCards()
      .map((c) => trackForAudio(c.number))
      .filter(Boolean)
    const idx = queue.findIndex((t) => t.number === number)
    player.play(queue, idx >= 0 ? idx : 0)
  }

  return (
    <div className="qcards-list">
      <div className="qcards-search">
        <Icon name="search" size={18} />
        <input
          type="search"
          placeholder="ابحث عن سورة…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          dir="rtl"
        />
        {query && (
          <button
            className="qcards-search__clear"
            onClick={() => setQuery('')}
            aria-label="مسح البحث"
            type="button"
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      <p className="qcards-list__count">
        {arabicDigits(cards.length)} بطاق{cards.length === 1 ? 'ة' : 'ات'}
      </p>

      <ul className="qcards-list__items">
        {cards.map((card) => (
          <li key={card.number}>
            <QuranCardItem
              card={card}
              onOpen={onOpen}
              onPlay={playCard}
              isPlaying={isCardActive(card.number) && player.playing}
              isPaused={isCardActive(card.number) && !player.playing && player.status !== 'idle'}
            />
          </li>
        ))}
      </ul>

      {cards.length === 0 && (
        <div className="qcards-empty">
          <Icon name="search" size={40} />
          <p>لا توجد نتائج لـ &quot;{query}&quot;</p>
        </div>
      )}
    </div>
  )
}
