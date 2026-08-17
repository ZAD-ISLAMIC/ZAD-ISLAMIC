import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button.jsx'

export default function NotFoundScreen() {
  const navigate = useNavigate()

  return (
    <section className="placeholder">
      <h1>الصفحة غير موجودة</h1>
      <p>عذراً، الصفحة التي تبحث عنها غير متوفرة</p>
      <Button onClick={() => navigate('/home')}>العودة للرئيسية</Button>
    </section>
  )
}