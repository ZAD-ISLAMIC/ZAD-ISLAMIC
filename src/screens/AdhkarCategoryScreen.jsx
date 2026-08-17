import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCategory } from '../services/adhkar.mjs'
import { AdhkarList } from '../components/adhkar/AdhkarList.jsx'

export default function AdhkarCategoryScreen() {
  const { categoryKey } = useParams()
  const navigate = useNavigate()
  const category = getCategory(categoryKey)

  if (!category) return null

  return (
    <section className="screen adhkar">
      <AdhkarList category={category} onBack={() => navigate('/adhkar')} />
    </section>
  )
}