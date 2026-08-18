import { isCordova, onDeviceReady } from './device.mjs'
import { playSound, vibrate } from './sound.mjs'
import { arabicDigits } from '../utils/arabic.mjs'

let ready = false

onDeviceReady(() => {
  ready = true
})

function hasLocalNotification() {
  return (
    ready &&
    isCordova() &&
    typeof window !== 'undefined' &&
    typeof window.cordova !== 'undefined' &&
    window.cordova.plugins &&
    window.cordova.plugins.notification &&
    typeof window.cordova.plugins.notification.local === 'object' &&
    typeof window.cordova.plugins.notification.local.schedule === 'function'
  )
}

/**
 * Best-effort system notification when the app is backgrounded; otherwise an
 * in-app alert + sound + vibration (the UI also renders a completion overlay).
 */
export function notifyComplete(dhikr) {
  playSound('done')
  vibrate([0, 60, 40, 60, 40, 90])

  if (!hasLocalNotification()) return
  const local = window.cordova.plugins.notification.local
  const id = Number(dhikr?.id?.replace?.(/\D/g, '')?.slice?.(0, 8)) || 1
  const title = dhikr?.text || 'التسبيح'
  const text = `تم إتمام ${arabicDigits(dhikr?.target ?? 33)} تسبيحة`

  try {
    local.schedule({
      id,
      title,
      text,
      foreground: true,
      vibrate: [0, 60, 40, 60, 40, 90],
      sound: undefined,
      icon: 'res://ic_stat_taqwa',
    })
  } catch (error) {
    console.warn('[tasbih] local notification failed', error)
  }
}

export function hasNotificationSupport() {
  return hasLocalNotification()
}
