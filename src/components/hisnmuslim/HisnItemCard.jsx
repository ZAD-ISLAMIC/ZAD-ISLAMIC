import React from 'react'
import { arabicDigits } from '../../utils/arabic.mjs'
import { itemTrackList } from '../../services/hisnmuslim.mjs'
import { Icon } from '../ui/Icon.jsx'
import { HisnCounter } from './HisnCounter.jsx'
import { HisnPlayButton, HisnDownloadButton } from './HisnAudioActions.jsx'

export function HisnItemCard({ category, item, index, accent, count, onCount, onReset, onUndo, onCopy }) {
  const total = item.count || 1
  const done = count || 0
  const isDone = done >= total
  const queue = itemTrackList(category)
  const track = queue[index]

  return (
    <article
      className={'hisn-card' + (isDone ? ' hisn-card--done' : '')}
      style={{ '--cat-accent': accent }}
      onClick={() => {
        if (!isDone) onCount()
      }}
    >
      <div className="hisn-card__head">
        <span className="hisn-card__num" style={{ color: accent }}>
          {arabicDigits(index + 1)}
        </span>
        <span className="hisn-card__rep">
          {total > 1 ? `تكرير ${arabicDigits(total)}` : 'مرة واحدة'}
        </span>
        <HisnCounter
          total={total}
          done={done}
          accent={accent}
          onCount={onCount}
          onReset={onReset}
          onUndo={onUndo}
          compact={total > 33}
        />
      </div>

      <p className="hisn-card__text">{item.text}</p>

      <div className="hisn-card__actions">
        {track && <HisnPlayButton queue={queue} index={index} track={track} />}
        <HisnDownloadButton catId={category.id} itemId={item.id} />
        <button className="hisn-act__btn" onClick={onCopy}>
          <Icon name="copy" size={15} />
          نسخ الذكر
        </button>
      </div>
    </article>
  )
}