import { useState, useCallback } from 'react'
import { storage } from '../services/storage.mjs'

export function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => storage.get(key, defaultValue))

  const set = useCallback(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next
        storage.set(key, resolved)
        return resolved
      })
    },
    [key]
  )

  const remove = useCallback(() => {
    storage.remove(key)
    setValue(defaultValue)
  }, [key, defaultValue])

  return [value, set, remove]
}