import { useSyncExternalStore } from 'react'
import * as quranCardDownload from '../services/quranCardDownload.mjs'

export function useQuranCardDownloads() {
  const snapshot = useSyncExternalStore(
    quranCardDownload.subscribe,
    quranCardDownload.getSnapshot
  )
  return snapshot || {}
}
