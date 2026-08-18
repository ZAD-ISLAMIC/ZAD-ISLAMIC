import { useSyncExternalStore } from 'react'
import * as khutbahDownload from '../services/khutbahDownload.mjs'

/** صورة حيّة لمهام تحميل مرفقات الخطب: { ref -> {state, progress, error} }. */
export function useKhutbahDownloads() {
  const snapshot = useSyncExternalStore(
    khutbahDownload.subscribe,
    khutbahDownload.getSnapshot
  )
  return snapshot || {}
}
