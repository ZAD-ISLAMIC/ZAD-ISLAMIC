import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCategoryBySlug, loadCategory } from '../services/khutbah.mjs'
import { arabicDigits } from '../utils/arabic.mjs'
import { Loader } from '../components/ui/Loader.jsx'
import { Icon } from '../components/ui/Icon.jsx'
import { KhutbahListItem } from '../components/khutbah/KhutbahListItem.jsx'

const PAGE_SIZE = 30

export default function KhutbahCategoryScreen() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const category = getCategoryBySlug(slug)

  const [list, setList] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [visible, setVisible] = useState(PAGE_SIZE)
  const sentinelRef = useRef(null)

  useEffect(() => {
    let alive = true
    setStatus('loading')
    setList(null)
    setVisible(PAGE_SIZE)

    loadCategory(slug)
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
  }, [slug])

  // ترقيم تعشيري: نزيد الصفوف المعروضة عند الوصول لنهاية القائمة.
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
  }, [status, list])

  if (status === 'loading') {
    return (
      <section className="screen kht-cat-screen">
        <Loader label="جارِ تحميل الخطب…" />
      </section>
    )
  }

  if (status === 'error' || !category) {
    return (
      <section className="screen kht-cat-screen">
        <div className="kht-cat-screen__error">
          <Icon name="alert" size={20} />
          تعذّر تحميل هذه الفئة
          <button onClick={() => navigate('/khutbah')}>العودة للفئات</button>
        </div>
      </section>
    )
  }

  const shown = list.slice(0, visible)
  const hasMore = visible < list.length

  return (
    <section className="screen kht-cat-screen">
      <div className="kht-cat-screen__topbar">
        <div>
          <h2>{category.name}</h2>
          <p>{arabicDigits(category.count)} خطبة</p>
        </div>
        <span className="kht-cat-screen__badge" aria-hidden="true">
          <Icon name="minbar" size={14} />
        </span>
      </div>

      <ul className="kht-list">
        {shown.map((khutbah, index) => (
          <li key={khutbah.id}>
            <KhutbahListItem
              khutbah={khutbah}
              index={index}
              onOpen={(id) => navigate(`/khutbah/${slug}/${id}`)}
            />
          </li>
        ))}
      </ul>

      {hasMore && (
        <div ref={sentinelRef} className="kht-list__more" aria-hidden="true">
          <span className="kht-list__spinner" />
        </div>
      )}

      {!hasMore && list.length > 0 && (
        <p className="kht-list__end">انتهت خطب هذه الفئة — نرجو المتابعة في قسم آخر</p>
      )}
    </section>
  )
}
