export function isCordova() {
  return typeof window !== 'undefined' && !!(window.cordova && window.cordova.platformId)
}

export function getPlatform() {
  if (!isCordova()) return 'web'
  return window.cordova.platformId
}

export function isAndroid() {
  return getPlatform() === 'android'
}

export function isIOS() {
  return getPlatform() === 'ios'
}

/* ------------------------------------------------------------------ *
 * Sticky deviceready tracking.
 * Module scripts are deferred, so this listener is registered before
 * deviceready fires in the normal Cordova bootstrap — but we still track
 * the fired state so callbacks added later run immediately.
 * ------------------------------------------------------------------ */

const readyHandlers = new Set()
let readyFired = false

if (typeof document !== 'undefined') {
  document.addEventListener(
    'deviceready',
    () => {
      readyFired = true
      for (const fn of readyHandlers) fn()
      readyHandlers.clear()
    },
    false
  )
}

export function onDeviceReady(callback) {
  if (!isCordova() || readyFired) {
    callback()
    return
  }
  readyHandlers.add(callback)
}

// Resolves `true` when the native bridge is actually usable, or `false`
// after `timeout` ms so callers can degrade gracefully instead of hanging.
export function waitForDeviceReady(timeout = 3000) {
  if (!isCordova() || readyFired) return Promise.resolve(true)
  return new Promise((resolve) => {
    onDeviceReady(() => resolve(true))
    setTimeout(() => resolve(false), timeout)
  })
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* fall through to the legacy path */
    }
  }
  const area = document.createElement('textarea')
  area.value = text
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
  document.body.appendChild(area)
  area.focus()
  area.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    /* ignore */
  }
  document.body.removeChild(area)
  return ok
}
