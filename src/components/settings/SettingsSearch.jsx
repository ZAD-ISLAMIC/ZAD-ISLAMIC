import React, { useEffect, useRef, useState } from 'react'
import { Icon } from '../ui/Icon.jsx'

/**
 * Sticky search field used to filter the settings hub instantly.
 * `getKeys` maps every visible row to a normalized searchable string.
 */
export function SettingsSearch({ placeholder = 'ابحث في الإعدادات…', onQuery }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    onQuery(query.trim())
  }, [query, onQuery])

  return (
    <div className="settings-search">
      <span className="settings-search__icon" aria-hidden="true">
        <Icon name="search" size={18} />
      </span>
      <input
        ref={inputRef}
        className="settings-search__input"
        type="search"
        value={query}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query && (
        <button
          className="settings-search__clear"
          aria-label="مسح البحث"
          onClick={() => {
            setQuery('')
            inputRef.current?.focus()
          }}
          type="button"
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  )
}
