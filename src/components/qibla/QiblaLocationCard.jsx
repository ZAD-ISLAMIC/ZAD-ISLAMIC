import React from 'react'
import * as qibla from '../../services/qibla.mjs'
import { isCordova } from '../../services/device.mjs'
import { Icon } from '../ui/Icon.jsx'

function formatCoords(loc) {
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return ''
  const lat = `${Math.abs(loc.lat).toFixed(2)}°`
  const lon = `${Math.abs(loc.lon).toFixed(2)}°`
  const pole = {
    lat: loc.lat >= 0 ? 'شمالاً' : 'جنوباً',
    lon: loc.lon >= 0 ? 'شرقاً' : 'غرباً',
  }
  return `${lat} ${pole.lat} — ${lon} ${pole.lon}`
}

function openAppSettings() {
  if (isCordova() && window.cordova?.plugins?.PrayerLocation?.openSettings) {
    window.cordova.plugins.PrayerLocation.openSettings(() => {}, () => {})
  }
}

const OPENABLE_CODES = ['permission-denied', 'permission-permanent', 'gps-off']

/**
 * Location row (GPS-only): the current fix + coordinates, an inline GPS
 * re-detection, and the full permission/denial affordances from location.mjs.
 * The Qibla always requires its own GPS fix — no manual city picker, no
 * default/fallback location.
 */
export function QiblaLocationCard({ location, locationStatus, locationError }) {
  const name = location?.cityAr || location?.countryAr || location?.label || 'غير محدد'
  const coords = formatCoords(location)
  const busy = locationStatus === 'locating'
  const showOpen = locationError && OPENABLE_CODES.includes(locationError.code)

  const detect = async () => {
    await qibla.reDetectLocation()
  }

  return (
    <div className="qibla-loc">
      <div className="qibla-loc__main">
        <span className="qibla-loc__icon">
          <Icon name="map-pin" size={17} />
        </span>
        <div className="qibla-loc__meta">
          <strong className="qibla-loc__name">{name}</strong>
          {coords && <small className="qibla-loc__coords" dir="ltr">{coords}</small>}
        </div>
      </div>

      <div className="qibla-loc__actions">
        <button className="qibla-loc__btn qibla-loc__btn--primary" onClick={detect} disabled={busy} type="button">
          <Icon name="target" size={15} />
          {busy ? 'جارٍ التحديد…' : 'تحديد موقعي'}
        </button>
      </div>

      {locationStatus === 'error' && locationError && (
        <div className="qibla-loc__error" role="status">
          <Icon name="alert" size={15} />
          <span>{locationError.message}</span>
          {showOpen && (
            <button className="qibla-loc__link" onClick={openAppSettings} type="button">
              فتح الإعدادات
            </button>
          )}
        </div>
      )}
    </div>
  )
}