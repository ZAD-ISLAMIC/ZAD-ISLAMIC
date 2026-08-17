import React from 'react'

export function Loader({ label = 'جارِ التحميل…' }) {
  return (
    <div className="loader" role="status">
      <span className="loader__spinner" />
      <p>{label}</p>
    </div>
  )
}