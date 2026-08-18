import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './App.jsx'
import { getInitialTheme, applyTheme, syncSystemBars } from './hooks/useTheme.mjs'
import { initPlayer } from './services/player.mjs'
import { prewarmBackend } from './services/reciterStorage.mjs'
import { onDeviceReady } from './services/device.mjs'
import { startWatchLoop } from './services/prayerWatch.mjs'
import { armSplashDismissal } from './services/splash.mjs'
import './styles/theme.css'
import './styles/global.css'

applyTheme(getInitialTheme())
initPlayer()
prewarmBackend()
startWatchLoop()
armSplashDismissal()

onDeviceReady(() => syncSystemBars(getInitialTheme()))

const container = document.getElementById('root')
const root = createRoot(container)

root.render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)