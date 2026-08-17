import React from 'react'
import { useParams } from 'react-router-dom'
import { HisnCategoryList } from '../components/hisnmuslim/HisnCategoryList.jsx'

export default function HisnMuslimCategoryScreen() {
  const { categoryId } = useParams()

  return (
    <section className="adhkar">
      <HisnCategoryList categoryId={categoryId} />
    </section>
  )
}