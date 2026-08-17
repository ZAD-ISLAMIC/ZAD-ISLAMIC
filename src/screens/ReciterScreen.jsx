import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ReciterDetail } from '../components/reciters/ReciterDetail.jsx'
import { getReciter as lookupReciter } from '../services/reciters.mjs'

export default function ReciterScreen() {
  const { reciterId } = useParams()
  const navigate = useNavigate()
  const id = Number(reciterId)
  const reciter = lookupReciter(id)

  if (!reciter) {
    return (
      <div className="placeholder">
        <h1>قارئ غير موجود</h1>
        <p>ربما تمت إزالة هذا القارئ من القائمة</p>
        <button className="btn btn--md btn--outline" onClick={() => navigate('/reciters')}>
          العودة إلى القرّاء
        </button>
      </div>
    )
  }

  return <ReciterDetail reciter={reciter} onBack={() => navigate('/reciters')} />
}