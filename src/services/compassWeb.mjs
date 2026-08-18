/**
 * WebView fallback for the Qibla compass — used when the native
 * com.rn0x.qibla plugin is unavailable (browser preview / non-Cordova).
 *
 * Sources, in priority order:
 *   1. `webkitCompassHeading` (iOS Safari / legacy WebKit).
 *   2. `e.alpha` from `deviceorientationabsolute` or `deviceorientation`
 *      when the event is `absolute` (Android Chrome WebView reports the
 *      magnetometer-corrected heading here).
 *
 * A heading is only accepted when it is north-referenced; non-absolute
 * samples (which rely on motion without the magnetometer) are ignored so the
 * needle never drifts.
 */

import { normalizeDeg } from '../utils/qiblaMath.mjs'

export function webCompassSupported() {
  return (
    typeof window !== 'undefined' &&
    (typeof window.DeviceOrientationEvent === 'function' ||
      typeof window.DeviceMotionEvent === 'function' ||
      'ondeviceorientationabsolute' in window)
  )
}

function azimuthFromEvent(e) {
  if (typeof e?.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) {
    return normalizeDeg(e.webkitCompassHeading)
  }
  if (e?.alpha == null || Number.isNaN(e.alpha)) return null
  if (e.absolute === false) return null
  return normalizeDeg(e.alpha)
}

/**
 * Start streaming headings from the WebView.
 *
 * @param {Function} onHeading   (azimuth: number) for each accepted sample
 * @param {Function} onError     (message: string) when the API is missing
 * @param {number}   minInterval ms between accepted samples (throttle)
 * @returns {Function} stop() to release the listeners
 */
export function startWebCompass(onHeading, onError, minInterval = 50) {
  if (!webCompassSupported()) {
    onError?.('web-deviceorientation غير متاح على هذا المتصفح.')
    return () => {}
  }

  const handlers = []
  let lastEmit = 0

  const handle = (e) => {
    const az = azimuthFromEvent(e)
    if (az == null) return
    const now = performance.now()
    if (now - lastEmit < minInterval) return
    lastEmit = now
    onHeading(az)
  }

  const attach = (name) => {
    if (typeof window.addEventListener === 'function') {
      window.addEventListener(name, handle, true)
      handlers.push(name)
    }
  }

  attach('deviceorientationabsolute')
  attach('deviceorientation')

  if (!handlers.length) {
    onError?.('حدث اتجاه الجهاز غير مدعوم في هذا المتصفح.')
  }

  return () => {
    for (const name of handlers) window.removeEventListener(name, handle, true)
  }
}