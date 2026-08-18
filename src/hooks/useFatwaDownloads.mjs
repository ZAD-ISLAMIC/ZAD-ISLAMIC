import { useSyncExternalStore } from 'react'
import * as fatwaDownload from '../services/fatwaDownload.mjs'

/** صورة حيّة لمهام تحميل الفتاوى: { ref -> {state, progress, error} }. */
export function useFatwaDownloads() {
  const snapshot = useSyncExternalStore(
    fatwaDownload.subscribe,
    fatwaDownload.getSnapshot
  )
  return snapshot || {}
}