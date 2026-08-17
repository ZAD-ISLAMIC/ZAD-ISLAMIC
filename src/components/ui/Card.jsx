import React from 'react'

export function Card({ className = '', children, onClick }) {
  const classes = ['card', onClick ? 'card--pressable' : '', className]
    .filter(Boolean)
    .join(' ')

  if (onClick) {
    return (
      <button className={classes} onClick={onClick} type="button">
        {children}
      </button>
    )
  }
  return <div className={classes}>{children}</div>
}