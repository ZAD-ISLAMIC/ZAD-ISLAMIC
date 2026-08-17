import React from 'react'
import { useNavigate } from 'react-router-dom'
import { HisnSectionGrid } from '../components/hisnmuslim/HisnSectionGrid.jsx'
import { Icon } from '../components/ui/Icon.jsx'

export default function HisnMuslimScreen() {
  const navigate = useNavigate()

  return (
    <section className="hisn">
      <div className="hisn-hero">
        <span className="hisn-hero__badge">
          <Icon name="shield" size={22} />
        </span>
        <h2>حصن المسلم</h2>
        <p>أذكار النبي ﷺ من كتاب حصن المسلم — استمع وحمّل للاستماع دون إنترنت</p>
      </div>
      <HisnSectionGrid onOpen={(categoryId) => navigate(`/hisn/${categoryId}`)} />
    </section>
  )
}