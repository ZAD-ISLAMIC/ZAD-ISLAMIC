/**
 * In-app splash screen (the static #app-splash overlay printed in index.html).
 * It covers the window from first paint until the app is interactive, then
 * fades out. Pure DOM/CSS on purpose: no React, no state — it must keep
 * rendering even during the JavaScript bootstrap on slow devices.
 */

const SPLASH_ID = 'app-splash'
const MIN_DISPLAY_MS = 1600
const FADE_MS = 500

let dismissed = false

function el() {
  return document.getElementById(SPLASH_ID)
}

function finish() {
  const node = el()
  if (node) node.remove()
}

/** Mark the splash as leaving and drop it after the CSS transition. */
export function hideSplash() {
  if (dismissed) return
  dismissed = true
  const node = el()
  if (!node) return
  node.classList.add('is-leaving')
  window.setTimeout(finish, FADE_MS + 80)
}

/** Wait for the bundle's webfonts + a minimum display time, then hide. */
export function armSplashDismissal(minDisplayMs = MIN_DISPLAY_MS) {
  if (!el()) return
  const startedAt = performance.now()
  let settle = Promise.resolve()
  if (typeof document.fonts !== 'undefined' && document.fonts.ready) {
    settle = Promise.race([
      document.fonts.ready.catch(() => {}),
      new Promise((r) => setTimeout(r, 4000)),
    ]).then(() => {})
  }
  settle.then(() => {
    const wait = Math.max(0, minDisplayMs - (performance.now() - startedAt))
    setTimeout(hideSplash, wait)
  })
}