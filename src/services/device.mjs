import { APP_NAME } from '../constants/app.mjs'

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

/* ------------------------------------------------------------------ *
 * مشاركة التطبيق: تفتح نافذة المشاركة الأصلية على الجهاز
 * (SocialSharing plugin عند توفّره، وإلا Web Share API) وتعيد `true`
 * عند نجاح الفتح. لو لم تتوفر أي قناة نافذة نظامية يرجع `false`
 * ليتولّى المتصل النسخ يدويًا.
 * ------------------------------------------------------------------ */

export function shareApp({ title = APP_NAME, text = '' } = {}) {
  const social = window.plugins?.socialsharing
  if (social?.share) {
    try {
      social.share(
        text,
        title,
        null,
        null,
        (ok) => ok,
        () => {}
      )
      return true
    } catch {
      /* fall through to Web Share API */
    }
  }
  if (navigator.share) {
    try {
      navigator.share({ title, text }).catch(() => {})
      return true
    } catch {
      return false
    }
  }
  return false
}

/* ------------------------------------------------------------------ *
 * فتح الرابط الخارجي (مصدر الأسئلة) بأمان:
 * - على الجهاز: متصفح النظام خارج التطبيق (InAppBrowser _system).
 * - على الويب: تبويب جديد (window.open _blank).
 * لا ينتقل التنقّل داخل التطبيق أبدًا — يعيد `false` عند تعذّر الفتح.
 * ------------------------------------------------------------------ */

export function openExternal(url) {
  try {
    const target = String(url || '').trim()
    if (!target) return false
    if (window.cordova?.InAppBrowser?.open) {
      window.cordova.InAppBrowser.open(target, '_system')
      return true
    }
    if (window.open) {
      const win = window.open(target, '_blank', 'noopener,noreferrer')
      if (win) return true
    }
    console.warn('openExternal failed (no browser available)', target)
    return false
  } catch (error) {
    console.warn('openExternal failed', error)
    return false
  }
}

/* ------------------------------------------------------------------ *
 * إغلاق التطبيق (زر الرجوع عند طلب الخروج). تعمل على Cordova فقط —
 * على الويب ترجع `false` ليتصرّف المتصل كما يشاء.
 * ------------------------------------------------------------------ */

export function exitApp() {
  try {
    if (window.cordova?.App?.exitApp) {
      window.cordova.App.exitApp()
      return true
    }
    if (window.navigator?.app?.exitApp) {
      window.navigator.app.exitApp()
      return true
    }
  } catch (error) {
    console.warn('exitApp failed', error)
  }
  return false
}
