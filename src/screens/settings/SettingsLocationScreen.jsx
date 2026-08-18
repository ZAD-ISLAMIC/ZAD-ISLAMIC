import React, { useEffect, useMemo, useState } from 'react'
import { getCountries, getCities } from '../../services/geo.mjs'
import {
  detectCurrentPosition,
  locationFromCoords,
  saveLocation,
  getCurrentLocation,
  messageFor,
} from '../../services/location.mjs'
import { isCordova } from '../../services/device.mjs'
import { refreshWatch } from '../../services/prayerWatch.mjs'
import { Icon } from '../../components/ui/Icon.jsx'
import { SettingsHero } from '../../components/settings/SettingsHero.jsx'
import { SettingsGroup } from '../../components/settings/SettingsGroup.jsx'
import '../../styles/settings.css'

const TABS = [
  { id: 'gps', label: 'تحديد موقعي' },
  { id: 'list', label: 'اختر مدينة' },
  { id: 'manual', label: 'إدخال يدوي' },
]

function formatCoords(loc) {
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return ''
  const lat = `${Math.abs(loc.lat).toFixed(3)}° ${loc.lat >= 0 ? 'شمال' : 'جنوب'}`
  const lon = `${Math.abs(loc.lon).toFixed(3)}° ${loc.lon >= 0 ? 'شرق' : 'غرب'}`
  return `خط العرض ${lat} — خط الطول ${lon}`
}

export default function SettingsLocationScreen() {
  const [tab, setTab] = useState('gps')
  const [current, setCurrent] = useState(() => getCurrentLocation())

  const currentName =
    (current && (current.cityAr || current.countryAr))
      ? [current.cityAr, current.countryAr].filter(Boolean).join('، ')
      : (current?.label || 'غير محدد')

  const applyLocation = async (loc) => {
    saveLocation(loc)
    setCurrent(loc)
    await refreshWatch()
  }

  return (
    <section className="screen settings-page">
      <SettingsHero
        icon={<Icon name="landmark" size={24} />}
        title="الموقع الحالي"
        sub={formatCoords(current)}
        value={currentName}
      />

      <div className="settings-tabs" role="tablist" aria-label="طريقة تحديد الموقع">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`settings-tabs__tab${tab === t.id ? ' settings-tabs__tab--active' : ''}`}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'gps' && <GpsTab applyLocation={applyLocation} />}
      {tab === 'list' && <ListTab applyLocation={applyLocation} />}
      {tab === 'manual' && <ManualTab applyLocation={applyLocation} />}
    </section>
  )
}

function GpsTab({ applyLocation }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showOpen, setShowOpen] = useState(false)
  const [done, setDone] = useState(false)

  const start = async () => {
    setBusy(true)
    setError('')
    setDone(false)
    const res = await detectCurrentPosition()
    setBusy(false)
    if (!res.ok) {
      setError(messageFor(res.code))
      setShowOpen(res.code === 'permission-denied' || res.code === 'permission-permanent' || res.code === 'gps-off')
      return
    }
    const loc = await locationFromCoords(res.coords.lat, res.coords.lon, 'gps')
    await applyLocation(loc)
    setDone(true)
  }

  const openSettings = () => {
    if (isCordova() && window.cordova?.plugins?.PrayerLocation?.openSettings) {
      window.cordova.plugins.PrayerLocation.openSettings(() => {}, () => {})
    }
  }

  return (
    <SettingsGroup title="الموقع">
      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button className="settings-btn settings-btn--primary settings-btn--block" onClick={start} disabled={busy} type="button">
          <Icon name="target" size={18} />
          {busy ? 'جارٍ التحديد…' : 'تحديد موقعي تلقائيًا'}
        </button>
        <p className="settings-note settings-note--flush">
          يستخدم تحديد الموقع إحداثيات GPS للحصول على مواقيت دقيقة لمدينتك. لا تُرسل بياناتك في أي مكان.
        </p>
        {done && (
          <span className="settings-chip settings-chip--ok">
            <Icon name="check" size={13} />
            تم تحديث الموقع بنجاح
          </span>
        )}
        {error && (
          <div className="settings-status" style={{ color: 'var(--danger-text)' }}>
            <Icon name="alert" size={16} />
            <span style={{ flex: 1 }}>{error}</span>
            {showOpen && (
              <button className="settings-link settings-link--danger" onClick={openSettings} type="button">
                فتح الإعدادات
              </button>
            )}
          </div>
        )}
      </div>
    </SettingsGroup>
  )
}

function ListTab({ applyLocation }) {
  const [countries, setCountries] = useState([])
  const [code, setCode] = useState('')
  const [cities, setCities] = useState([])
  const [currentLabel, setCurrentLabel] = useState('')

  useEffect(() => {
    getCountries().then(setCountries).catch(() => {})
    const loc = getCurrentLocation()
    setCurrentLabel(loc ? (loc.cityAr || loc.label || '') : '')
  }, [])

  const onCountry = (e) => {
    const c = e.target.value
    setCode(c)
    if (c) getCities(c).then(setCities).catch(() => setCities([]))
    else setCities([])
  }

  const pick = async (city) => {
    const loc = await locationFromCoords(city.lat, city.lon, 'geo')
    await applyLocation(loc)
    setCurrentLabel(city.ar)
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
    <SettingsGroup title="اختر من قائمة المدن">
      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label className="settings-field">
          <span>الدولة</span>
          <select value={code} onChange={onCountry}>
            <option value="">اختر الدولة…</option>
            {countryList}
          </select>
        </label>
        {code && (
          <div className="settings-cities">
            {cities.map((c) => (
              <button
                key={`${c.lat}-${c.lon}`}
                className={`settings-city${currentLabel === c.ar ? ' settings-city--current' : ''}`}
                onClick={() => pick(c)}
                type="button"
              >
                <span>{c.ar}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <small>{c.en}</small>
                  {currentLabel === c.ar && <Icon name="check" size={15} className="settings-city__check" />}
                </span>
              </button>
            ))}
            {!cities.length && <p className="settings-note settings-note--flush">لا توجد مدن لهذه الدولة.</p>}
          </div>
        )}
      </div>
    </SettingsGroup>
  )
}

function ManualTab({ applyLocation }) {
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async () => {
    const la = Number.parseFloat(lat)
    const lo = Number.parseFloat(lon)
    if (!Number.isFinite(la) || Math.abs(la) > 90) return setError('خط عرض غير صالح (من -90 إلى 90).')
    if (!Number.isFinite(lo) || Math.abs(lo) > 180) return setError('خط طول غير صالح (من -180 إلى 180).')
    setError('')
    setDone(false)
    const loc = await locationFromCoords(la, lo, 'manual')
    if (label.trim()) loc.label = label.trim()
    await applyLocation(loc)
    setDone(true)
  }

  return (
    <SettingsGroup title="إدخال الإحداثيات يدويًا">
      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="settings-field__group">
          <label className="settings-field">
            <span>خط العرض (Latitude)</span>
            <input type="number" inputMode="decimal" dir="ltr" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="21.4225" />
          </label>
          <label className="settings-field">
            <span>خط الطول (Longitude)</span>
            <input type="number" inputMode="decimal" dir="ltr" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="39.8262" />
          </label>
          <label className="settings-field">
            <span>اسم الموقع (اختياري)</span>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مكة المكرمة" />
          </label>
        </div>
        {error && <p className="settings-note settings-note--flush" style={{ color: 'var(--danger-text)' }}>{error}</p>}
        {done && (
          <span className="settings-chip settings-chip--ok">
            <Icon name="check" size={13} />
            تم حفظ الموقع بنجاح
          </span>
        )}
        <button className="settings-btn settings-btn--primary settings-btn--block" onClick={submit} type="button">
          <Icon name="check" size={18} />
          حفظ الموقع
        </button>
      </div>
    </SettingsGroup>
  )
}