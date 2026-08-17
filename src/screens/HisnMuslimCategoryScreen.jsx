import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { HisnCategoryList } from '../components/hisnmuslim/HisnCategoryList.jsx'

export default function HisnMuslimCategoryScreen() {
  const { categoryId } = useParams()
  const navigate = useNavigate()

  return (
    <section className="screen adhkar">
      <HisnCategoryList categoryId={categoryId} onBack={() => navigate('/hisn')} />
    </section>
  )
}