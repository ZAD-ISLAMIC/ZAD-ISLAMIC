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
import { SettingsGroup } from '../../components/settings/SettingsGroup.jsx'
import '../../styles/settings.css'

const TABS = [
  { id: 'gps', label: 'تحديد موقعي' },
  { id: 'list', label: 'اختر مدينة' },
  { id: 'manual', label: 'إدخال يدوي' },
]

export default function SettingsLocationScreen() {
  const [tab, setTab] = useState('gps')
  const [current, setCurrent] = useState(() => getCurrentLocation())

  const currentText =
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
      <SettingsGroup title="الموقع الحالي">
        <div className="settings-dl-total">
          <span className="settings-dl-total__label">
            <span style={{ display: 'inline-block', marginInlineEnd: 6, verticalAlign: '-3px' }}>
              <Icon name="landmark" size={16} />
            </span>
            {currentText}
          </span>
        </div>
        <div className="settings-loc-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`settings-loc-tab${tab === t.id ? ' settings-loc-tab--active' : ''}`}
              onClick={() => setTab(t.id)}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </div>
      </SettingsGroup>

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
    <SettingsGroup title="تحديد موقعي تلقائيًا">
      <p className="settings-note">حدد موقعك تلقائيًا باستخدام GPS للحصول على مواقيت دقيقة لمدينتك.</p>
      <div style={{ padding: '14px 14px 0' }}>
        <button className="settings-action settings-action--primary" onClick={start} disabled={busy} type="button">
          <Icon name="target" size={16} />
          {busy ? 'جارٍ التحديد…' : 'تحديد موقعي'}
        </button>
        {done && <p className="settings-note">تم تحديث الموقع بنجاح.</p>}
        {error && (
          <p className="settings-loc-err">
            {error}
            {showOpen && (
              <button className="settings-mini-btn" style={{ marginInlineStart: 8 }} onClick={openSettings} type="button">
                فتح الإعدادات
              </button>
            )}
          </p>
        )}
      </div>
    </SettingsGroup>
  )
}

function ListTab({ applyLocation }) {
  const [countries, setCountries] = useState([])
  const [code, setCode] = useState('')
  const [cities, setCities] = useState([])

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
    await applyLocation(loc)
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
    <SettingsGroup title="اختيار من القائمة">
      <div style={{ padding: '14px 14px 0' }}>
        <label className="settings-loc-field">
          <span>الدولة</span>
          <select value={code} onChange={onCountry}>
            <option value="">اختر الدولة…</option>
            {countryList}
          </select>
        </label>
        {code && (
          <div className="settings-loc-cities">
            {cities.map((c, i) => (
              <button key={i} className="settings-loc-city" onClick={() => pick(c)} type="button">
                <span>{c.ar}</span>
                <small>{c.en}</small>
              </button>
            ))}
            {!cities.length && <p className="settings-note">لا توجد مدن لهذه الدولة.</p>}
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
    <SettingsGroup title="إدخال يدوي">
      <p className="settings-note">أدخل الإحداثيات يدويًا (يمكنك استخدام خرائط Google للحصول عليها).</p>
      <div style={{ padding: '14px 14px 0' }}>
        <label className="settings-loc-field">
          <span>خط العرض (Latitude)</span>
          <input type="number" inputMode="decimal" dir="ltr" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="21.4225" />
        </label>
        <label className="settings-loc-field">
          <span>خط الطول (Longitude)</span>
          <input type="number" inputMode="decimal" dir="ltr" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="39.8262" />
        </label>
        <label className="settings-loc-field">
          <span>اسم الموقع (اختياري)</span>
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مكة المكرمة" />
        </label>
        {error && <p className="settings-loc-err">{error}</p>}
        {done && <p className="settings-note">تم حفظ الموقع بنجاح.</p>}
        <button className="settings-action settings-action--primary" onClick={submit} type="button">
          <Icon name="check" size={16} />
          حفظ الموقع
        </button>
      </div>
    </SettingsGroup>
  )
}
