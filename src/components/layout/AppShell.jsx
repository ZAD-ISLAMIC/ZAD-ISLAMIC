import React, { useSyncExternalStore, useState, useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Header } from './Header.jsx'
import { BottomNav } from './BottomNav.jsx'
import { PlayerBar } from '../player/PlayerBar.jsx'
import { AdhanModal } from '../prayer/AdhanModal.jsx'
import { Icon } from '../ui/Icon.jsx'
import * as player from '../../services/player.mjs'
import { onAdhan, onSilentAdhan } from '../../services/prayerWatch.mjs'
import { vibrate } from '../../services/sound.mjs'
import { openExternal, exitApp } from '../../services/device.mjs'
import { PLAY_STORE_URL } from '../../constants/app.mjs'
import '../../styles/settings.css'

const TOP_ROUTES = ['/', '/home', '/quran', '/tafseer', '/adhkar', '/hisn', '/fatwas', '/prayer', '/tasbih', '/radio', '/reciters', '/quiz', '/settings', '/history', '/khutbah']

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const hasPlayer = useSyncExternalStore(
    player.subscribePresence,
    player.getPresenceSnapshot
  )
  const [adhan, setAdhan] = useState(null)
  const [showExit, setShowExit] = useState(false)

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

  // Android back button: go back a step inside the app, and when already at a
  // top-level screen ask for confirmation before exiting.
  useEffect(() => {
    const onBack = (event) => {
      if (event) event.preventDefault()
      const isTop = TOP_ROUTES.includes(location.pathname)
      if (!isTop) {
        navigate(-1)
        return
      }
      setShowExit(true)
    }
    document.addEventListener('backbutton', onBack, false)
    return () => document.removeEventListener('backbutton', onBack, false)
  }, [location.pathname, navigate])

  const closeExit = () => setShowExit(false)

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
      {showExit && (
        <div className="settings-confirm" role="dialog" aria-modal="true" aria-label="تأكيد الخروج">
          <div className="settings-confirm__backdrop" onClick={closeExit} />
          <div className="settings-confirm__card">
            <div className="settings-confirm__icon settings-confirm__icon--gold" aria-hidden="true">
              <Icon name="close" size={22} />
            </div>
            <h3 className="settings-confirm__title">هل بالفعل تريد الخروج من التطبيق؟</h3>
            <p className="settings-confirm__msg">
              تقييمك للتطبيق يساعدنا على تحسينه ونشره، وإذا أعجبك فقيمة بـ5 نجوم
            </p>
            <div className="settings-confirm__actions">
              <button
                className="settings-confirm__btn settings-confirm__btn--gold"
                onClick={() => {
                  closeExit()
                  openExternal(PLAY_STORE_URL)
                }}
                type="button"
              >
                <Icon name="star-fill" size={15} />
                تقييم التطبيق
              </button>
              <button
                className="settings-confirm__btn settings-confirm__btn--danger"
                onClick={() => {
                  closeExit()
                  exitApp()
                }}
                type="button"
              >
                <Icon name="close" size={15} />
                خروج
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}