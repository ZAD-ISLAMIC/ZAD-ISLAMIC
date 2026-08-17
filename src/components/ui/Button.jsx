import React from 'react'

const SIZES = ['sm', 'md', 'lg']
const VARIANTS = ['primary', 'ghost', 'outline', 'danger']

export function Button({ variant = 'primary', size = 'md', className = '', ...props }) {
  const classes = [
    'btn',
    VARIANTS.includes(variant) ? `btn--${variant}` : 'btn--primary',
    SIZES.includes(size) ? `btn--${size}` : 'btn--md',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return <button className={classes} {...props} />
}