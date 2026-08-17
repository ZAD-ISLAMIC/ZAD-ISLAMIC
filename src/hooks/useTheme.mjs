import { useEffect } from 'react'
import { storage } from '../services/storage.mjs'
import { useLocalStorage } from './useLocalStorage.mjs'

export const THEME_KEY = 'app.theme'

export const THEME_COLORS = {
  dark: '#0a1428',
  light: '#f2f6fc',
}

export const STATUS_BAR_COLORS = {
  dark: '#0a1428',
  light: '#ffffff',
}

export function syncSystemBars(theme) {
  const navColor = THEME_COLORS[theme] || THEME_COLORS.dark
  const statusBarColor = STATUS_BAR_COLORS[theme] || STATUS_BAR_COLORS.dark
  const opts = { statusBarColor, navBarColor: navColor }

  try {
    const plugin = window.cordova?.plugins?.SystemUI
    if (plugin?.style) {
      plugin.style(opts)
      return
    }
    // Fallback: call the native service directly even if the plugin's JS
    // module did not load (e.g. broken plugin-loader wiring).
    const exec = window.cordova?.exec
    if (exec) exec(null, null, 'SystemUI', 'style', [opts])
  } catch {
    /* native bridge not available */
  }
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta && THEME_COLORS[theme]) {
    meta.setAttribute('content', THEME_COLORS[theme])
  }
  syncSystemBars(theme)
}

export function getInitialTheme() {
  return storage.get(THEME_KEY, 'dark')
}

export function useTheme() {
  const [theme, setTheme] = useLocalStorage(THEME_KEY, 'dark')

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return { theme, toggle }
}