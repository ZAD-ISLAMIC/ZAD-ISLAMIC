import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCategoryBySlug, loadCategory } from '../services/fatwas.mjs'
import { setDynamicTitle } from '../utils/headerTitle.mjs'
import { Loader } from '../components/ui/Loader.jsx'
import { Icon } from '../components/ui/Icon.jsx'
import { FatwaDetail } from '../components/fatwas/FatwaDetail.jsx'

function scrollToTop() {
  const el = document.querySelector('.shell__main')
  if (el) el.scrollTop = 0
}

export default function FatwaDetailScreen() {
  const { slug, id } = useParams()
  const navigate = useNavigate()
  const category = getCategoryBySlug(slug)

  const [list, setList] = useState(null)
  const [status, setStatus] = useState('loading')
  // طابع إعادة المحاولة
  const [, force] = useState(0)

  useEffect(() => {
    let alive = true
    setStatus('loading')
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

  // عند التنقل بين الفتاوى إعادة التمرير لأعلى.
  useEffect(() => {
    scrollToTop()
  }, [id, slug])

  // عنوان الهيدر = عنوان الفتوى الحالية (يُمسح عند مغادرة الصفحة فيعود
  // للفئة المذكورة في getHeaderMeta).
  useEffect(() => () => setDynamicTitle(null), [])
  useEffect(() => {
    if (status !== 'ready' || !list) return
    const f = list.find((x) => String(x.id) === String(id))
    if (f) setDynamicTitle(f.title || f.question)
  }, [list, status, id])

  if (status === 'loading') {
    return (
      <section className="screen fat-det-screen">
        <Loader label="جارِ تحميل الفتوى…" />
      </section>
    )
  }

  if (status === 'error' || !category || !list) {
    return (
      <section className="screen fat-det-screen">
        <div className="fat-cat-screen__error">
          <Icon name="alert" size={20} />
          تعذّر تحميل هذه الفتوى
          <button onClick={() => navigate(`/fatwas/${slug || ''}`)}>
            العودة للفئة
          </button>
        </div>
      </section>
    )
  }

  const index = list.findIndex((f) => String(f.id) === String(id))
  const fatwa = index === -1 ? null : list[index]
  const prevFatwa = index > 0 ? list[index - 1] : null
  const nextFatwa = index >= 0 && index < list.length - 1 ? list[index + 1] : null

  if (!fatwa) {
    return (
      <section className="screen fat-det-screen">
        <div className="fat-cat-screen__error">
          <Icon name="alert" size={20} />
          الفتوى غير موجودة
          <button onClick={() => navigate(`/fatwas/${slug}`)}>
            العودة للفئة
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="screen fat-det-screen">
      <FatwaDetail
        fatwa={fatwa}
        category={category}
        prevFatwa={prevFatwa}
        nextFatwa={nextFatwa}
        onNavigate={(nextId) => navigate(`/fatwas/${slug}/${nextId}`)}
      />
    </section>
  )
}