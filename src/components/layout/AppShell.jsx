import React, { useSyncExternalStore, useState, useEffect, useLayoutEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Header } from './Header.jsx'
import { BottomNav } from './BottomNav.jsx'
import { PlayerBar } from '../player/PlayerBar.jsx'
import { AdhanModal } from '../prayer/AdhanModal.jsx'
import { SettingsSheet } from '../prayer/SettingsSheet.jsx'
import { LocationSheet } from '../prayer/LocationSheet.jsx'
import { Icon } from '../ui/Icon.jsx'
import { SheetProvider, useSheets } from './SheetContext.jsx'
import * as player from '../../services/player.mjs'
import { onAdhan, onSilentAdhan, clearSilentAdhan } from '../../services/prayerWatch.mjs'
import { vibrate } from '../../services/sound.mjs'
import { openExternal, exitApp } from '../../services/device.mjs'
import { PLAY_STORE_URL } from '../../constants/app.mjs'
import '../../styles/settings.css'

const HOME_ROUTES = ['/', '/home']
const TOP_ROUTES = ['/quran', '/tafseer', '/adhkar', '/hisn', '/fatwas', '/prayer', '/tasbih', '/radio', '/reciters', '/quiz', '/settings', '/history', '/khutbah']

function SheetLockers() {
  const { showSettings, showLocation } = useSheets()

  useEffect(() => {
    const anyOpen = showSettings || showLocation
    document.body.style.overflow = anyOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [showSettings, showLocation])

  return null
}

export function AppShell() {
  return (
    <SheetProvider>
      <AppShellInner />
    </SheetProvider>
  )
}

function AppShellInner() {
  const location = useLocation()
  const navigate = useNavigate()
  const hasPlayer = useSyncExternalStore(
    player.subscribePresence,
    player.getPresenceSnapshot
  )
  const [adhan, setAdhan] = useState(null)
  const [showExit, setShowExit] = useState(false)
  const sheets = useSheets()

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

  useEffect(() => onSilentAdhan((p) => setAdhan(p)), [])

  useEffect(() => {
    const onBack = (event) => {
      if (event) event.preventDefault()
      if (sheets.showSettings || sheets.showLocation) {
        if (sheets.showSettings) sheets.closeSettings()
        else sheets.closeLocation()
        return
      }
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
  }, [location.pathname, navigate, sheets])

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
          }}
        />
      )}
      {showExit && (
        <div className="settings-confirm" role="dialog" aria-modal="true" aria-label="تقييم التطبيق">
          <div className="settings-confirm__backdrop" onClick={closeExit} />
          <div className="settings-confirm__card">
            <div className="settings-confirm__icon settings-confirm__icon--gold" aria-hidden="true">
              <Icon name="star" size={22} />
            </div>
            <h3 className="settings-confirm__title">هل بالفعل تريد الخروج من التطبيق؟</h3>
            <p className="settings-confirm__msg">
              إذا نال التطبيق إعجابك، فالرجاء منحنا تقييمًا بخمس نجوم — فإعطَاؤك إياها سببٌ في انتشاره ونشره
            </p>
            <div className="settings-confirm__actions">
              <button
                className="settings-confirm__btn settings-confirm__btn--gold settings-confirm__btn--rate"
                onClick={() => {
                  openExternal(PLAY_STORE_URL)
                  closeExit()
                }}
              >
                <Icon name="star" size={13} />
                قيّمنا
              </button>
              <button
                className="settings-confirm__btn settings-confirm__btn--ghost"
                onClick={() => {
                  exitApp()
                }}
              >
                خروج
              </button>
            </div>
          </div>
        </div>
      )}
      <SheetLockers />
      {sheets.showSettings && <SettingsSheet onClose={sheets.closeSettings} />}
      {sheets.showLocation && <LocationSheet onClose={sheets.closeLocation} />}
    </div>
  )
}
