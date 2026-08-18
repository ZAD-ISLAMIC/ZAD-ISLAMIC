import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getEraByKey, loadEra } from '../services/history.mjs'
import { setDynamicTitle } from '../utils/headerTitle.mjs'
import { Loader } from '../components/ui/Loader.jsx'
import { Icon } from '../components/ui/Icon.jsx'
import { EventDetail } from '../components/history/EventDetail.jsx'

function scrollToTop() {
  const el = document.querySelector('.shell__main')
  if (el) el.scrollTop = 0
}

export default function HistoryEventScreen() {
  const { eraKey, id } = useParams()
  const navigate = useNavigate()
  const era = getEraByKey(eraKey)

  const [list, setList] = useState(null)
  const [status, setStatus] = useState('loading')
  const [, force] = useState(0)

  useEffect(() => {
    let alive = true
    setStatus('loading')
    loadEra(eraKey)
      .then((data) => {
        if (!alive) return
        if (!data) {
          setStatus('error')
          return
        }
        setList(data)
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
    scrollToTop()
  }, [id, eraKey])

  useEffect(() => () => setDynamicTitle(null), [])
  useEffect(() => {
    if (status !== 'ready' || !list) return
    const e = list.find((x) => String(x.id) === String(id))
    if (e) setDynamicTitle(e.title)
  }, [list, status, id])

  if (status === 'loading') {
    return (
      <section className="screen hist-event-screen">
        <Loader label="جارِ تحميل الحدث…" />
      </section>
    )
  }

  if (status === 'error' || !era || !list) {
    return (
      <section className="screen hist-event-screen">
        <div className="hist-event-screen__error">
          <Icon name="alert" size={20} />
          تعذّر تحميل هذا الحدث
          <button onClick={() => navigate(`/history/${eraKey || ''}`)}>
            العودة للحقبة
          </button>
        </div>
      </section>
    )
  }

  const index = list.findIndex((e) => String(e.id) === String(id))
  const event = index === -1 ? null : list[index]
  const prevEvent = index > 0 ? list[index - 1] : null
  const nextEvent = index >= 0 && index < list.length - 1 ? list[index + 1] : null

  if (!event) {
    return (
      <section className="screen hist-event-screen">
        <div className="hist-event-screen__error">
          <Icon name="alert" size={20} />
          الحدث غير موجود
          <button onClick={() => navigate(`/history/${eraKey}`)}>
            العودة للحقبة
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="screen hist-event-screen">
      <EventDetail
        event={event}
        era={era}
        prevEvent={prevEvent}
        nextEvent={nextEvent}
        onNavigate={(nextId) => navigate(`/history/${eraKey}/${nextId}`)}
      />
    </section>
  )
}