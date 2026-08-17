export function formatNumber(value, useArabicDigits = true) {
  const formatted = String(Math.round(value * 100) / 100)
  if (!useArabicDigits) return formatted
  return formatted.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d])
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function debounce(fn, delay = 300) {
  let timer = null
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

export function formatTime(date, withSeconds = false) {
  return new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  }).format(date)
}