export function getPrefix() {
  return 'altaqwaa:'
}

export const storage = {
  get(key, fallback = null) {
    try {
      const raw = window.localStorage.getItem(getPrefix() + key)
      return raw === null ? fallback : JSON.parse(raw)
    } catch {
      return fallback
    }
  },

  set(key, value) {
    try {
      window.localStorage.setItem(getPrefix() + key, JSON.stringify(value))
    } catch (error) {
      console.warn('storage.set failed', key, error)
    }
  },

  remove(key) {
    try {
      window.localStorage.removeItem(getPrefix() + key)
    } catch (error) {
      console.warn('storage.remove failed', key, error)
    }
  },

  /** كل المفاتيح المحفوظة (بدون بادئة التطبيق). */
  keys() {
    try {
      const prefix = getPrefix()
      return Object.keys(window.localStorage)
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length))
    } catch {
      return []
    }
  },

  clear() {
    const keys = Object.keys(window.localStorage).filter((k) =>
      k.startsWith(getPrefix())
    )
    keys.forEach((k) => window.localStorage.removeItem(k))
  },
}