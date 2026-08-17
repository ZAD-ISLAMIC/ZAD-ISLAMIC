import React, { useSyncExternalStore, useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './Header.jsx'
import { BottomNav } from './BottomNav.jsx'
import { PlayerBar } from '../player/PlayerBar.jsx'
import { AdhanModal } from '../prayer/AdhanModal.jsx'
import * as player from '../../services/player.mjs'
import { onAdhan, onSilentAdhan } from '../../services/prayerWatch.mjs'
import { vibrate } from '../../services/sound.mjs'

export function AppShell() {
  const hasPlayer = useSyncExternalStore(
    player.subscribePresence,
    player.getPresenceSnapshot
  )
  const [adhan, setAdhan] = useState(null)

  useEffect(
    () =>
      onAdhan((p) => {
        vibrate([0, 120, 90, 120, 90, 160])
        setAdhan(p)
      }),
    []
  )

  // A background-announced adhan surfaced when the app (re)opened inside its
  // window — plays nothing (AdhanModal respects prayer.silent) so the
  // background adhan is never doubled.
  useEffect(() => onSilentAdhan((p) => setAdhan(p)), [])

  return (
    <div className={'shell' + (hasPlayer ? ' shell--player' : '')}>
      <Header />
      <main className="shell__main">
        <Outlet />
      </main>
      <PlayerBar />
      <BottomNav />
      {adhan && (
        <AdhanModal
          prayer={adhan}
          onClose={() => {
            setAdhan(null)
            // silencing the running azan player happens on unmount
          }}
        />
      )}
    </div>
  )
}