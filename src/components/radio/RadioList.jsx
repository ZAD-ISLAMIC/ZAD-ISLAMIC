import React, { useEffect, useMemo, useState } from 'react'
import {
  RADIO_STATIONS,
  getCategories,
  getCategoryStyle,
  searchStations,
  stationSupportNote,
  toRadioTrack,
  DEFAULT_ACCENT,
  DEFAULT_ICON,
} from '../../services/radio.mjs'
import { usePlayer } from '../../hooks/usePlayer.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { Icon } from '../ui/Icon.jsx'

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

export function RadioList() {
  const player = usePlayer()
  const online = useOnline()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')

  const categories = useMemo(() => getCategories(), [])

  const stations = useMemo(
    () => searchStations(query, category),
    [query, category]
  )

  const activeTrack = player.track?.kind === 'radio' ? player.track : null

  const handleCardClick = (station) => {
    if (!online) return
    if (activeTrack && activeTrack.id === station.id) {
      player.toggle()
      return
    }
    player.playRadio(toRadioTrack(station))
  }

  const isActiveStation = (station) => !!activeTrack && activeTrack.id === station.id

  return (
    <section className="screen radio">
      <div className="radio-hero">
        <span className="radio-hero__icon" aria-hidden="true">
          <Icon name="radio" size={30} />
        </span>
        <div className="radio-hero__body">
          <h2>راديو التقوى</h2>
          <p>بث مباشر للقرآن الكريم والبرامج الإسلامية</p>
        </div>
      </div>

      {!online && (
        <div className="radio-offline">
          <Icon name="wifi-off" size={16} />
          <span>لا يوجد اتصال بالإنترنت — البث المباشر يتطلب اتصالاً</span>
        </div>
      )}

      <label className="quran-search radio__search">
        <Icon name="search" size={18} />
        <input
          className="quran-search__input"
          type="search"
          enterKeyHint="search"
          placeholder="ابحث عن إذاعة بالاسم أو التصنيف"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            className="radio__clear"
            aria-label="مسح البحث"
            onClick={() => setQuery('')}
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </label>

      <div className="radio-cats" role="tablist" aria-label="تصنيفات الراديو">
        <button
          className={'radio-cat' + (category === '' ? ' radio-cat--active' : '')}
          onClick={() => setCategory('')}
        >
          الكل
          <span className="radio-cat__count">{arabicDigits(RADIO_STATIONS.length)}</span>
        </button>
        {categories.map((cat) => {
          const style = getCategoryStyle(cat.key)
          const accent = style.accent || DEFAULT_ACCENT
          const active = category === cat.key
          return (
            <button
              key={cat.key}
              className={'radio-cat' + (active ? ' radio-cat--active' : '')}
              style={{ '--cat-accent': accent }}
              onClick={() => setCategory(active ? '' : cat.key)}
            >
              {cat.key}
              <span className="radio-cat__count">{arabicDigits(cat.count)}</span>
            </button>
          )
        })}
      </div>

      <p className="radio__count">
        {arabicDigits(RADIO_STATIONS.length)} إذاعة
        {query ? ` — ${arabicDigits(stations.length)} نتيجة` : ''}
      </p>

      {activeTrack && (
        <div className="radio-now">
          <div className="radio-now__body">
            <span className="radio-now__live">
              <span className="radio-now__dot" aria-hidden="true" />
              يعمل الآن
            </span>
            <strong className="radio-now__name">{activeTrack.name}</strong>
            <span className="radio-now__cat">{activeTrack.category}</span>
          </div>
          <button
            className="radio-now__play"
            aria-label={player.playing ? 'إيقاف مؤقت' : 'تشغيل'}
            onClick={player.toggle}
          >
            <Icon name={player.playing ? 'pause' : 'play'} size={26} />
          </button>
        </div>
      )}

      {player.status === 'error' && activeTrack && (
        <div className="radio-error">
          <Icon name={!online ? 'wifi-off' : 'alert'} size={16} />
          <span>{player.error}</span>
          <div className="radio-error__actions">
            <button className="radio-error__retry" onClick={player.retry}>
              <Icon name="refresh" size={15} />
              إعادة المحاولة
            </button>
          </div>
        </div>
      )}

      {stations.length === 0 ? (
        <p className="quran-empty">لا توجد إذاعة تطابق «{query}»</p>
      ) : (
        <ul className="radio-list">
          {stations.map((station) => {
            const style = getCategoryStyle(station.category)
            const accent = style.accent || DEFAULT_ACCENT
            const icon = style.icon || DEFAULT_ICON
            const active = isActiveStation(station)
            const isPlaying = active && player.playing
            const isLoading = active && player.status === 'loading'
            const note = stationSupportNote(station)
            return (
              <li key={station.id}>
                <button
                  className={`radio-card${active ? ' radio-card--active' : ''}`}
                  style={{ '--cat-accent': accent }}
                  onClick={() => handleCardClick(station)}
                >
                  <span className="radio-card__icon">
                    <Icon name={icon} size={22} />
                  </span>
                  <span className="radio-card__body">
                    <strong className="radio-card__name">{station.name}</strong>
                    <span className="radio-card__meta">
                      {station.category}
                      {station.hls || station.insecure ? ' • قد لا يعمل' : ''}
                    </span>
                    {note && <span className="radio-card__note">{note}</span>}
                  </span>
                  <span
                    className={`radio-card__play${isPlaying ? ' radio-card__play--on' : ''}`}
                    aria-hidden="true"
                  >
                    {isLoading ? (
                      <span className="radio-card__spin" />
                    ) : isPlaying ? (
                      <Icon name="pause" size={20} />
                    ) : (
                      <Icon name="play" size={20} />
                    )}
                  </span>
                  {active && (
                    <span className="radio-card__live" aria-hidden="true">
                      <span className="radio-card__live-dot" />
                      مباشر
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <p className="radio__tip">
        اضغط على أي إذاعة للاستماع مباشرة، أو على الإذاعة المشغّلة لإيقافها مؤقتاً.
      </p>
    </section>
  )
}