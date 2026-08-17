import { useSyncExternalStore } from 'react'
import * as player from '../services/player.mjs'
import * as downloadManager from '../services/downloadManager.mjs'

export function usePlayer() {
  const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot)
  return {
    ...snapshot,
    play: player.play,
    playRadio: player.playRadio,
    toggle: player.toggle,
    next: player.next,
    prev: player.prev,
    seek: player.seek,
    setRate: player.setRate,
    close: player.close,
  }
}

export function useDownloads(reciterId) {
  const snapshot = useSyncExternalStore(
    downloadManager.subscribe,
    downloadManager.getSnapshot
  )
  return (snapshot && snapshot[reciterId]) || null
}