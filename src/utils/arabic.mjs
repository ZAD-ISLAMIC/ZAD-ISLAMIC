import { storage } from '../services/storage.mjs'

export const DIGITS_KEY = 'app.digits'
export const DIGIT_STYLE_EASTERN = 'eastern'
export const DIGIT_STYLE_WESTERN = 'western'

export const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

let digitsStyle = null
const digitsListeners = new Set()

function hasStorage() {
  return typeof window !== 'undefined' && !!window.localStorage
}

/**
 * نمط الأرقام الحالي — يُقرأ من التخزين مرة واحدة ثم يُخزَّن مؤقتًا.
 * في بيئة غير المتصفح (اختبارات Node) يعود للمشرقية الافتراضية.
 */
export function getDigitsStyle() {
  if (digitsStyle === null) {
    digitsStyle = hasStorage() ? storage.get(DIGITS_KEY, DIGIT_STYLE_EASTERN) : DIGIT_STYLE_EASTERN
    if (digitsStyle !== DIGIT_STYLE_WESTERN) digitsStyle = DIGIT_STYLE_EASTERN
  }
  return digitsStyle
}

export function setDigitsStyle(style) {
  const next = style === DIGIT_STYLE_WESTERN ? DIGIT_STYLE_WESTERN : DIGIT_STYLE_EASTERN
  if (next === digitsStyle) return
  digitsStyle = next
  if (hasStorage()) storage.set(DIGITS_KEY, next)
  for (const fn of digitsListeners) fn()
}

export function subscribeDigits(fn) {
  digitsListeners.add(fn)
  return () => {
    digitsListeners.delete(fn)
  }
}

export function arabicDigits(value) {
  const digits = String(value)
  if (getDigitsStyle() === DIGIT_STYLE_WESTERN) return digits
  return digits.replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)])
}