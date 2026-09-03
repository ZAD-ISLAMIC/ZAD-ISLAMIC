import React, { createContext, useContext, useState, useCallback } from 'react'

const SheetContext = createContext(null)

export function SheetProvider({ children }) {
  const [showSettings, setShowSettings] = useState(false)
  const [showLocation, setShowLocation] = useState(false)

  const openSettings = useCallback(() => setShowSettings(true), [])
  const closeSettings = useCallback(() => setShowSettings(false), [])
  const openLocation = useCallback(() => setShowLocation(true), [])
  const closeLocation = useCallback(() => setShowLocation(false), [])

  return (
    <SheetContext.Provider value={{
      showSettings,
      showLocation,
      openSettings,
      closeSettings,
      openLocation,
      closeLocation,
    }}>
      {children}
    </SheetContext.Provider>
  )
}

export function useSheets() {
  return useContext(SheetContext)
}
