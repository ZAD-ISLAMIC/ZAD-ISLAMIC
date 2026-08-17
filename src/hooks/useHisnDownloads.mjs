import { useSyncExternalStore } from 'react'
import * as hisnDownload from '../services/hisnDownload.mjs'
import { HISN_NS, doorFiles, getCategoryById } from '../services/hisnmuslim.mjs'
import { hasFile } from '../services/reciterStorage.mjs'

/** Live snapshot of حصن المسلم download tasks: { ref -> {state,...} } */
export function useHisnDownloads() {
  const snapshot = useSyncExternalStore(
    hisnDownload.subscribe,
    hisnDownload.getSnapshot
  )
  return snapshot || {}
}

/** Aggregate stored/download state for one door. */
export function useHisnDoorStats(categoryId) {
  const category = getCategoryById(categoryId)
  const downloads = useHisnDownloads()
  if (!category) {
    return { total: 0, doneCount: 0, runningCount: 0, errorCount: 0, allStored: false, percent: 0, busy: false }
  }
  const files = doorFiles(categoryId)
  let doneCount = 0
  let runningCount = 0
  let errorCount = 0
  let resolved = 0
  for (const file of files) {
    if (hasFile(HISN_NS, file.fileName)) {
      doneCount += 1
      resolved += 1
    } else {
      const task = downloads[file.ref]
      if (task?.state === 'done') {
        doneCount += 1
        resolved += 1
      } else if (task?.state === 'pending' || task?.state === 'running') {
        runningCount += 1
        resolved += Number.isFinite(task.progress) && task.progress > 0 ? task.progress : 0
      } else if (task?.state === 'error') {
        errorCount += 1
      }
    }
  }
  const total = files.length
  return {
    total,
    doneCount,
    runningCount,
    errorCount,
    allStored: total > 0 && doneCount === total,
    percent: total ? Math.round((resolved / total) * 100) : 0,
    busy: runningCount > 0,
  }
}