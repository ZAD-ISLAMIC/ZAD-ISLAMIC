import React from 'react'

export function ScreenPlaceholder({ title, description }) {
  return (
    <section className="placeholder">
      <h1>{title}</h1>
      <p>{description}</p>
      <span className="placeholder__badge">قريباً</span>
    </section>
  )
}