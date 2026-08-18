import { useEffect, useCallback, useSyncExternalStore } from 'react'
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

function systemPrefersDark() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

function subscribeSystemTheme(fn) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {}
  }
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', fn)
  return () => mq.removeEventListener('change', fn)
}

function getSystemThemeSnapshot() {
  return systemPrefersDark() ? 'dark' : 'light'
}

/** Resolve the effective theme: "system" follows the OS preference. */
export function resolveTheme(theme) {
  return theme === 'system' ? getSystemThemeSnapshot() : theme
}

export function syncSystemBars(theme) {
  const resolved = resolveTheme(theme)
  const navColor = THEME_COLORS[resolved] || THEME_COLORS.dark
  const statusBarColor = STATUS_BAR_COLORS[resolved] || STATUS_BAR_COLORS.dark
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
  const resolved = resolveTheme(theme)
  document.documentElement.dataset.theme = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta && THEME_COLORS[resolved]) {
    meta.setAttribute('content', THEME_COLORS[resolved])
  }
  syncSystemBars(resolved)
}

export function getInitialTheme() {
  return storage.get(THEME_KEY, 'dark')
}

/** The currently configured theme preference ("system" | "dark" | "light"). */
export function useTheme() {
  const [theme, setTheme] = useLocalStorage(THEME_KEY, 'dark')

  // Re-resolve "system" whenever the OS scheme flips.
  const systemTheme = useSyncExternalStore(subscribeSystemTheme, getSystemThemeSnapshot)

  useEffect(() => {
    applyTheme(theme)
  }, [theme, systemTheme])

  const set = useCallback(
    (next) => setTheme(next),
    [setTheme]
  )

  const toggle = useCallback(
    () =>
      setTheme((t) => {
        const resolved = resolveTheme(t)
        return resolved === 'dark' ? 'light' : 'dark'
      }),
    [setTheme]
  )

  return { theme, setTheme: set, toggle, resolved: resolveTheme(theme) }
}
