import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getEraByKey, loadEra } from '../services/history.mjs'
import { arabicDigits } from '../utils/arabic.mjs'
import { Loader } from '../components/ui/Loader.jsx'
import { Icon } from '../components/ui/Icon.jsx'
import { EventListItem } from '../components/history/EventListItem.jsx'

const PAGE_SIZE = 30

export default function HistoryEraScreen() {
  const { eraKey } = useParams()
  const navigate = useNavigate()
  const era = getEraByKey(eraKey)

  const [events, setEvents] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [visible, setVisible] = useState(PAGE_SIZE)
  const sentinelRef = useRef(null)

  useEffect(() => {
    let alive = true
    setStatus('loading')
    setEvents(null)
    setVisible(PAGE_SIZE)

    loadEra(eraKey)
      .then((data) => {
        if (!alive) return
        if (!data) {
          setStatus('error')
          return
        }
        setEvents(data)
        setStatus('ready')
      })
      .catch(() => {
        if (alive) setStatus('error')
      })

    return () => {
      alive = false
    }
  }, [eraKey])

  useEffect(() => {
    if (status !== 'ready') return undefined
    const node = sentinelRef.current
    if (!node) return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible((v) => v + PAGE_SIZE)
        }
      },
      { rootMargin: '400px 0px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [status, events])

  if (status === 'loading') {
    return (
      <section className="screen hist-era-screen">
        <Loader label="جارِ تحميل الأحداث…" />
      </section>
    )
  }

  if (status === 'error' || !era) {
    return (
      <section className="screen hist-era-screen">
        <div className="hist-era-screen__error">
          <Icon name="alert" size={20} />
          تعذّر تحميل هذه الحقبة
          <button onClick={() => navigate('/history')}>العودة للحقبات</button>
        </div>
      </section>
    )
  }

  const shown = events.slice(0, visible)
  const hasMore = visible < events.length

  return (
    <section className="screen hist-era-screen">
      <div className="hist-era-screen__topbar">
        <div>
          <h2>{era.title}</h2>
          <p>{arabicDigits(era.count)} حدث</p>
        </div>
        <span className="hist-era-screen__badge">
          <Icon name="scroll" size={14} />
        </span>
      </div>

      <ul className="hist-list">
        {shown.map((event, index) => (
          <li key={event.id}>
            <EventListItem
              event={event}
              index={index}
              onOpen={(id) => navigate(`/history/${eraKey}/${id}`)}
            />
          </li>
        ))}
      </ul>

      {hasMore && (
        <div ref={sentinelRef} className="hist-list__more" aria-hidden="true">
          <span className="hist-list__spinner" />
        </div>
      )}

      {!hasMore && events.length > 0 && (
        <p className="hist-list__end">
          انتهت أحداث هذه الحقبة — يمكنك الانتقال إلى حقبة أخرى
        </p>
      )}
    </section>
  )
}