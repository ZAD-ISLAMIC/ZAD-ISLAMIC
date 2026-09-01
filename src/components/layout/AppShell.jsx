import React, { useSyncExternalStore, useState, useEffect, useLayoutEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Header } from './Header.jsx'
import { BottomNav } from './BottomNav.jsx'
import { PlayerBar } from '../player/PlayerBar.jsx'
import { AdhanModal } from '../prayer/AdhanModal.jsx'
import { Icon } from '../ui/Icon.jsx'
import * as player from '../../services/player.mjs'
import { onAdhan, onSilentAdhan, clearSilentAdhan } from '../../services/prayerWatch.mjs'
import { vibrate } from '../../services/sound.mjs'
import { openExternal, exitApp } from '../../services/device.mjs'
import { PLAY_STORE_URL } from '../../constants/app.mjs'
import '../../styles/settings.css'

const HOME_ROUTES = ['/', '/home']
const TOP_ROUTES = ['/quran', '/tafseer', '/adhkar', '/hisn', '/fatwas', '/prayer', '/tasbih', '/radio', '/reciters', '/quiz', '/settings', '/history', '/khutbah']

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const hasPlayer = useSyncExternalStore(
    player.subscribePresence,
    player.getPresenceSnapshot
  )
  const [adhan, setAdhan] = useState(null)
  const [showExit, setShowExit] = useState(false)

  // Reset the shared scroll container to the top whenever the route changes so
  // a new screen never inherits the previous screen's scroll offset.
  useLayoutEffect(() => {
    const el = document.querySelector('.shell__main')
    if (el) el.scrollTop = 0
  }, [location.pathname])

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

  // Android back button:
  // - on the home screen → ask for confirmation before exiting
  // - on another top-level tab → go back to the home screen
  // - on any sub-screen → go back one step through the navigation history
  useEffect(() => {
    const onBack = (event) => {
      if (event) event.preventDefault()
      if (HOME_ROUTES.includes(location.pathname)) {
        setShowExit(true)
        return
      }
      if (TOP_ROUTES.includes(location.pathname)) {
        navigate('/home')
        return
      }
      navigate(-1)
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
            clearSilentAdhan()
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