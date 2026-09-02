import React, { useEffect, useMemo, useState } from 'react'
import { getCountries, getCities } from '../../services/geo.mjs'
import {
  detectCurrentPosition,
  locationFromCoords,
  saveLocation,
  messageFor,
} from '../../services/location.mjs'
import { isCordova } from '../../services/device.mjs'
import { Icon } from '../ui/Icon.jsx'
import { refreshWatch } from '../../services/prayerWatch.mjs'

const TABS = [
  { id: 'gps', label: 'تحديد موقعي' }, // GPS
  { id: 'list', label: 'اختر مدينة' }, // list
  { id: 'manual', label: 'إدخال يدوي' }, // manual
]

/**
 * Bottom sheet to pick a location: GPS, country/city list, or manual
 * coords. Persists via location.saveLocation + refreshes the watch.
 */
export function LocationSheet({ onClose }) {
  const [tab, setTab] = useState('gps')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  return (
    <div className="loc-sheet" role="dialog" aria-modal="true" aria-label="تغيير الموقع">
      <div className="loc-sheet__backdrop" onClick={onClose} />
      <div className="loc-sheet__card">
        <div className="loc-sheet__head">
          <h3 className="loc-sheet__title">تغيير الموقع</h3>
          <button className="loc-sheet__close" onClick={onClose} aria-label="إغلاق">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="loc-sheet__tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`loc-sheet__tab${tab === t.id ? ' loc-sheet__tab--active' : ''}`}
              onClick={() => {
                setTab(t.id)
                setError('')
              }}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="loc-sheet__body">
          {tab === 'gps' && (
            <GpsTab
              busy={busy}
              setBusy={setBusy}
              error={error}
              setError={setError}
              onClose={onClose}
            />
          )}
          {tab === 'list' && <ListTab onClose={onClose} />}
          {tab === 'manual' && <ManualTab onClose={onClose} />}
        </div>
      </div>
    </div>
  )
}

function useApplyLocation() {
  return async (loc) => {
    saveLocation(loc)
    await refreshWatch()
  }
}

function GpsTab({ busy, setBusy, error, setError, onClose }) {
  const [detailsMsg, setDetailsMsg] = useState('')
  const apply = useApplyLocation()

  // طلب الصلاحيات تلقائياً عند فتح التبويب
  useEffect(() => {
    if (isCordova() && window.cordova?.plugins?.PrayerLocation?.requestPermission) {
      window.cordova.plugins.PrayerLocation.requestPermission(
        () => {},
        () => {}
      )
    }
  }, [])

  const start = async () => {
    setBusy(true)
    setError('')
    setDetailsMsg('')
    const res = await detectCurrentPosition()
    setBusy(false)
    if (!res.ok) {
      setError(messageFor(res.code))
      if (res.code === 'permission-denied' || res.code === 'permission-permanent' || res.code === 'gps-off') {
        setDetailsMsg(res.code)
      }
      return
    }
    const loc = await locationFromCoords(res.coords.lat, res.coords.lon, 'gps')
    await apply(loc)
    onClose()
  }

  const openSettings = () => {
    new Promise((resolve) => {
      if (isCordova() && window.cordova?.plugins?.PrayerLocation?.openSettings) {
        window.cordova.plugins.PrayerLocation.openSettings(resolve, () => resolve())
      } else resolve()
    })
  }

  return (
    <div className="loc-gps">
      <p className="loc-gps__hint">
        حدد موقعك تلقائياً باستخدام GPS للحصول على مواقيت دقيقة لمدينتك.
      </p>
      <button className="loc-gps__btn" onClick={start} disabled={busy} type="button">
        {busy ? 'جارٍ التحديد…' : 'تحديد موقعي'}
      </button>
      {error && (
        <p className="loc-gps__error">
          {error}
          {detailsMsg && (
            <button className="loc-gps__link" onClick={openSettings} type="button">
              فتح الإعدادات
            </button>
          )}
          {!busy && (
            <button className="loc-gps__link" onClick={start} type="button" style={{marginRight:'8px'}}>
              إعادة المحاولة
            </button>
          )}
        </p>
      )}
    </div>
  )
}

function ListTab({ onClose }) {
  const [countries, setCountries] = useState([])
  const [code, setCode] = useState('')
  const [cities, setCities] = useState([])
  const apply = useApplyLocation()

  useEffect(() => {
    getCountries().then(setCountries).catch(() => {})
  }, [])

  const onCountry = (e) => {
    const c = e.target.value
    setCode(c)
    if (c) getCities(c).then(setCities).catch(() => setCities([]))
    else setCities([])
  }

  const pick = async (city) => {
    const loc = await locationFromCoords(city.lat, city.lon, 'geo')
    await apply(loc)
    onClose()
  }

  const countryList = useMemo(
    () =>
      countries.map((c) => (
        <option key={c.c} value={c.c}>
          {c.n} — {c.en}
        </option>
      )),
    [countries]
  )

  return (
    <div className="loc-list">
      <label className="loc-list__label">الدولة</label>
      <select className="loc-list__select" value={code} onChange={onCountry}>
        <option value="">اختر الدولة…</option>
        {countryList}
      </select>

      {code && (
        <>
          <label className="loc-list__label">المدينة</label>
          <div className="loc-list__cities">
            {cities.map((c, i) => (
              <button
                key={i}
                className="loc-list__city"
                onClick={() => pick(c)}
                type="button"
              >
                <span>{c.ar}</span>
                <small>{c.en}</small>
              </button>
            ))}
            {!cities.length && <p className="loc-list__none">لا توجد مدن لهذه الدولة.</p>}
          </div>
        </>
      )}
    </div>
  )
}

function ManualTab({ onClose }) {
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')
  const apply = useApplyLocation()

  const submit = async () => {
    const la = Number.parseFloat(lat)
    const lo = Number.parseFloat(lon)
    if (!Number.isFinite(la) || Math.abs(la) > 90) return setError('خط عرض غير صالح (من -90 إلى 90).')
    if (!Number.isFinite(lo) || Math.abs(lo) > 180) return setError('خط طول غير صالح (من -180 إلى 180).')
    setError('')
    const loc = await locationFromCoords(la, lo, 'manual')
    if (label.trim()) loc.label = label.trim()
    await apply(loc)
    onClose()
  }

  return (
    <div className="loc-manual">
      <p className="loc-manual__hint">
        أدخل الإحداثيات يدوياً (يمكنك استخدام خرائط Google للحصول عليها).
      </p>
      <label className="loc-manual__label">خط العرض (Latitude)</label>
      <input
        className="loc-manual__input"
        type="number"
        inputMode="decimal"
        dir="ltr"
        value={lat}
        onChange={(e) => setLat(e.target.value)}
        placeholder="21.4225"
      />
      <label className="loc-manual__label">خط الطول (Longitude)</label>
      <input
        className="loc-manual__input"
        type="number"
        inputMode="decimal"
        dir="ltr"
        value={lon}
        onChange={(e) => setLon(e.target.value)}
        placeholder="39.8262"
      />
      <label className="loc-manual__label">اسم الموقع (اختياري)</label>
      <input
        className="loc-manual__input"
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="مكة المكرمة"
      />
      {error && <p className="loc-manual__error">{error}</p>}
      <button className="loc-manual__btn" onClick={submit} type="button">
        حفظ الموقع
      </button>
    </div>
  )
}