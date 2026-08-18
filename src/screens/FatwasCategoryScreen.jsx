import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getCategoryBySlug,
  loadCategory,
} from '../services/fatwas.mjs'
import { arabicDigits } from '../utils/arabic.mjs'
import { Loader } from '../components/ui/Loader.jsx'
import { Icon } from '../components/ui/Icon.jsx'
import { FatwaListItem } from '../components/fatwas/FatwaListItem.jsx'
import { FatwaAudioActions } from '../components/fatwas/FatwaAudioActions.jsx'

const PAGE_SIZE = 30

export default function FatwasCategoryScreen() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const category = getCategoryBySlug(slug)

  const [fatwas, setFatwas] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [visible, setVisible] = useState(PAGE_SIZE)
  const sentinelRef = useRef(null)

  useEffect(() => {
    let alive = true
    setStatus('loading')
    setFatwas(null)
    setVisible(PAGE_SIZE)

    loadCategory(slug)
      .then((data) => {
        if (!alive) return
        if (!data) {
          setStatus('error')
          return
        }
        setFatwas(data)
        setStatus('ready')
      })
      .catch(() => {
        if (alive) setStatus('error')
      })

    return () => {
      alive = false
    }
  }, [slug])

  // ترقيم تعشيري: نزيد عدد الصفوف المعروضة عند الوصول لنهاية القائمة.
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
  }, [status, fatwas])

  if (status === 'loading') {
    return (
      <section className="screen fat-cat-screen">
        <Loader label="جارِ تحميل الفتاوى…" />
      </section>
    )
  }

  if (status === 'error' || !category) {
    return (
      <section className="screen fat-cat-screen">
        <div className="fat-cat-screen__error">
          <Icon name="alert" size={20} />
          تعذّر تحميل هذه الفئة
          <button onClick={() => navigate('/fatwas')}>
            العودة للفئات
          </button>
        </div>
      </section>
    )
  }

  const shown = fatwas.slice(0, visible)
  const hasMore = visible < fatwas.length

  return (
    <section className="screen fat-cat-screen">
      <div className="fat-cat-screen__topbar">
        <div>
          <h2>{category.name}</h2>
          <p>
            {arabicDigits(category.count)} فتوى
            {category.audioCount > 0
              ? ` • ${arabicDigits(category.audioCount)} صوتية`
              : ''}
          </p>
        </div>
        <span className="fat-cat-screen__badge">
          <Icon name="feather" size={14} />
        </span>
      </div>

      <ul className="fatwa-list">
        {shown.map((fatwa, index) => (
          <li key={fatwa.id}>
            <div className="fatwa-row">
              <FatwaListItem fatwa={fatwa} index={index} onOpen={(id) => navigate(`/fatwas/${slug}/${id}`)} />
              <FatwaAudioActions fatwa={fatwa} categoryName={category.name} compact />
            </div>
          </li>
        ))}
      </ul>

      {hasMore && (
        <div ref={sentinelRef} className="fatwa-list__more" aria-hidden="true">
          <span className="fatwa-list__spinner" />
        </div>
      )}

      {!hasMore && fatwas.length > 0 && (
        <p className="fatwa-list__end">
          انتهت فتاوى هذه الفئة — نرجو المتابعة في قسم آخر
        </p>
      )}
    </section>
  )
}