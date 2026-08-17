/**
 * Timezone helpers: resolve an IANA timezone string (or the device's own)
 * to a numeric UTC offset for a specific civil date, and map an instant
 * into a civil (y,m,d) in that timezone. Used to keep the fully-local
 * prayer calculator in sync with IANA zones from geo.json without any
 * network access.
 */

function offsetFromIntl(timeZone, utcMs) {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    const parts = {}
    for (const p of dtf.formatToParts(new Date(utcMs))) parts[p.type] = p.value
    const asUTC = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute) % 60,
      Number(parts.second) % 60
    )
    return (asUTC - utcMs) / 1000 / 60
  } catch {
    return null
  }
}

/** Device IANA timezone, falling back to null when Intl lacks `timeZone`. */
export function getDeviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

/**
 * UTC offset (minutes, east-positive) of `timeZone` at the given instant.
 * Falls back to the device offset when the zone is missing or unsupported.
 *
 * @param {string|null|undefined} timeZone IANA name
 * @param {number} utcMs
 * @returns {number} offset in minutes
 */
export function offsetAtMin(timeZone, utcMs) {
  if (timeZone) {
    const off = offsetFromIntl(timeZone, utcMs)
    if (off !== null) return off
  }
  return -new Date(utcMs).getTimezoneOffset()
}

/**
 * Combined offset (hours, signed, includes any DST) of `timeZone` for a
 * specific civil date. Probe at ~12:00 UTC of that date as an offset
 * approximation (DST transitions near midnight are the only edge case and
 * move a single day's times by exactly one hour, still self-consistent).
 *
 * @param {number} y @param {number} m (1..12) @param {number} d
 * @param {string|null} timeZone
 */
export function offsetHoursForDate(y, m, d, timeZone) {
  const probe = Date.UTC(y, m - 1, d, 12, 0, 0, 0)
  return offsetAtMin(timeZone, probe) / 60
}

/**
 * Civil date (y, m, d) in `timeZone` at an instant.
 * Falls back to the device-local date when the zone is invalid.
 */
export function civilDateInTz(utcMs, timeZone) {
  const dtf =
    timeZone &&
    (() => {
      try {
        return new Intl.DateTimeFormat('en-US', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
      } catch {
        return null
      }
    })()
  if (dtf) {
    const parts = {}
    for (const p of dtf.formatToParts(new Date(utcMs))) parts[p.type] = p.value
    return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) }
  }
  const dt = new Date(utcMs)
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() }
}