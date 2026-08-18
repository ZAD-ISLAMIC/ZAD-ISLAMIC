import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getCategoryBySlug,
  getKhutbahById,
  loadCategory,
} from '../services/khutbah.mjs'
import { setDynamicTitle } from '../utils/headerTitle.mjs'
import { Loader } from '../components/ui/Loader.jsx'
import { Icon } from '../components/ui/Icon.jsx'
import { KhutbahDetail } from '../components/khutbah/KhutbahDetail.jsx'

function scrollToTop() {
  const el = document.querySelector('.shell__main')
  if (el) el.scrollTop = 0
}

export default function KhutbahDetailScreen() {
  const { slug, id } = useParams()
  const navigate = useNavigate()
  const category = getCategoryBySlug(slug)

  const [record, setRecord] = useState(null)
  const [list, setList] = useState(null)
  const [status, setStatus] = useState('loading')
  // طابع إعادة المحاولة
  const [, force] = useState(0)

  useEffect(() => {
    let alive = true
    setStatus('loading')
    setRecord(null)
    setList(null)

    Promise.all([getKhutbahById(id), loadCategory(slug)])
      .then(([found, rows]) => {
        if (!alive) return
        if (!found) {
          setStatus('error')
          return
        }
        setRecord(found)
        setList(rows || [])
        setStatus('ready')
      })
      .catch(() => {
        if (alive) setStatus('error')
      })

    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, slug, force])

  // عند التنقل بين الخطب إعادة التمرير لأعلى.
  useEffect(() => {
    scrollToTop()
  }, [id, slug])

  // عنوان الهيدر = عنوان الخطبة الحالية (يُمسح عند المغادرة فيعود للفئة).
  useEffect(() => () => setDynamicTitle(null), [])
  useEffect(() => {
    if (status === 'ready' && record) setDynamicTitle(record.title)
  }, [status, record])

  if (status === 'loading') {
    return (
      <section className="screen kht-det-screen">
        <Loader label="جارِ تحميل الخطبة…" />
      </section>
    )
  }

  if (status === 'error' || !category || !record) {
    return (
      <section className="screen kht-det-screen">
        <div className="kht-cat-screen__error">
          <Icon name="alert" size={20} />
          تعذّر تحميل هذه الخطبة
          <button onClick={() => navigate(`/khutbah/${slug || ''}`)}>
            العودة للفئة
          </button>
        </div>
      </section>
    )
  }

  const index = list.findIndex((k) => String(k.id) === String(id))
  const prevKhutbah = index > 0 ? list[index - 1] : null
  const nextKhutbah =
    index >= 0 && index < list.length - 1 ? list[index + 1] : null

  return (
    <section className="screen kht-det-screen">
      <KhutbahDetail
        khutbah={record}
        category={category}
        prevKhutbah={prevKhutbah}
        nextKhutbah={nextKhutbah}
        onNavigate={(nextId) => navigate(`/khutbah/${slug}/${nextId}`)}
      />
    </section>
  )
}
