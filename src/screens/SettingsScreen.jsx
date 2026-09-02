import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { SettingsGroup } from '../components/settings/SettingsGroup.jsx'
import { SettingsSwitch } from '../components/settings/SettingsSwitch.jsx'
import { SettingsNavRow } from '../components/settings/SettingsNavRow.jsx'
import { SettingsSelect } from '../components/settings/SettingsSelect.jsx'
import { SettingsSlider } from '../components/settings/SettingsSlider.jsx'
import { SettingsRow } from '../components/settings/SettingsRow.jsx'
import { Icon } from '../components/ui/Icon.jsx'
import { useTheme } from '../hooks/useTheme.mjs'
import * as player from '../services/player.mjs'
import { storage } from '../services/storage.mjs'
import { loadConfig, updateConfig, getNowMs, setTimeSource } from '../services/prayerConfig.mjs'
import { refreshWatch, getWatchStatus, getAudioState, openSystemSetting, setAdhanVolume } from '../services/prayerWatch.mjs'
import { getCurrentLocation } from '../services/location.mjs'
import { arabicDigits } from '../utils/arabic.mjs'
import { getSettings as getTasbihSettings, saveSettings as saveTasbihSettings } from '../services/tasbih.mjs'
import { isSoundEnabled, setSoundEnabled, isVibrationEnabled, setVibrationEnabled } from '../services/feedback.mjs'
import { METHOD_BY_ID } from '../services/prayerTimes.mjs'
import { getTotalStorageBytes, formatBytes } from '../services/settingsStorage.mjs'
import {
  subscribeDigits,
  getDigitsStyle,
  setDigitsStyle,
  DIGIT_STYLE_EASTERN,
  DIGIT_STYLE_WESTERN,
} from '../utils/arabic.mjs'
import '../styles/settings.css'

const PLAYER_RATES = [
  { value: 0.75, label: '¾×' },
  { value: 1, label: '1×' },
  { value: 1.25, label: '1.25×' },
  { value: 1.5, label: '1.5×' },
  { value: 2, label: '2×' },
]

const THEME_OPTIONS = [
  { value: 'system', label: 'تلقائي' },
  { value: 'dark', label: 'ليلي' },
  { value: 'light', label: 'نهاري' },
]

const DIGITS_OPTIONS = [
  { value: DIGIT_STYLE_EASTERN, label: '٠-٩ مشرقية' },
  { value: DIGIT_STYLE_WESTERN, label: '0-9 عادية' },
]

export default function SettingsScreen() {
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const digitsStyle = useSyncExternalStore(subscribeDigits, getDigitsStyle)

  const [config, setConfig] = useState(() => loadConfig())
  const location = useMemo(() => getCurrentLocation(), [])
  const [tasbih, setTasbih] = useState(() => getTasbihSettings())
  const [playerRate, setPlayerRate] = useState(() => storage.get('player.rate', 1))
  const [adhkarSound, setAdhkarSound] = useState(() => isSoundEnabled())
  const [adhkarVibration, setAdhkarVibration] = useState(() => isVibrationEnabled())
  const [status, setStatus] = useState(null)
  const [audio, setAudio] = useState(null)

  useEffect(() => {
    getWatchStatus().then(setStatus)
    getAudioState().then(setAudio)
  }, [])

  const locationText =
    (location && (location.cityAr || location.countryAr))
      ? [location.cityAr, location.countryAr].filter(Boolean).join('، ')
      : (location?.label || 'تحديد الموقع')

  const methodLabel = METHOD_BY_ID[config.methodId]?.label || 'أم القرى'
  const adhanVoice = config.adhanSound
    ? config.adhanSound === '__custom__'
      ? 'صوت مخصص'
      : String(config.adhanSound).replace('.mp3', '').replaceAll('_', ' ')
    : 'عبد الباسط'

  const totalBytes = useMemo(() => formatBytes(getTotalStorageBytes()), [])

  const toggleAdhan = async () => {
    const next = updateConfig({ adhanEnabled: !config.adhanEnabled })
    setConfig(next)
    await refreshWatch({ config: next })
    getWatchStatus().then(setStatus)
    getAudioState().then(setAudio)
  }

  const applyAdhanSetting = async (partial) => {
    const next = updateConfig(partial)
    setConfig(next)
    await refreshWatch({ config: next })
    getWatchStatus().then(setStatus)
    getAudioState().then(setAudio)
  }

  const changeTimeMode = async (mode) => {
    const updated = setTimeSource(mode, mode === 'manual' ? new Date().toISOString() : null)
    setConfig(updated)
    await refreshWatch({ config: updated })
  }

  const changeManualTime = async (iso) => {
    const updated = setTimeSource('manual', iso)
    setConfig(updated)
    await refreshWatch({ config: updated })
  }

  // Manual time editing — local draft until user presses Save (small button)
  const [editManualBase, setEditManualBase] = useState(() => {
    const iso = loadConfig().timeSource?.manualIso
    return iso ? new Date(iso) : new Date()
  })
  const [manualSaved, setManualSaved] = useState(false)
  const [liveNowMs, setLiveNowMs] = useState(() => getNowMs())
  useEffect(() => {
    const iso = config.timeSource?.manualIso
    if (iso) setEditManualBase(new Date(iso))
  }, [config.timeSource?.manualIso])
  // Live tick so the picker reflects the advancing manual time (3:02 → 3:03)
  useEffect(() => {
    if (config.timeSource?.mode !== 'manual') return
    const t = setInterval(() => setLiveNowMs(getNowMs()), 1000)
    return () => clearInterval(t)
  }, [config.timeSource?.mode, config.timeSource?.manualIso, config.timeSource?.manualSetAt])
  const saveManualTime = async () => {
    if (!editManualBase) return
    await changeManualTime(editManualBase.toISOString())
    setManualSaved(true)
    setTimeout(() => setManualSaved(false), 2000)
  }
  const hasManualChange = (() => {
    const iso = config.timeSource?.manualIso
    if (!iso || !editManualBase) return false
    return new Date(iso).getTime() !== editManualBase.getTime()
  })()

  const changePlayerRate = (rate) => {
    setPlayerRate(rate)
    player.setRate(rate)
  }

  const volumePercent = Math.round(Math.min(1, Math.max(0, config.adhanVolume ?? 1)) * 100)
  const changeAdhanVolume = (v) => {
    const value = v / 100
    setConfig((c) => ({ ...c, adhanVolume: value }))
    setAdhanVolume(value)
  }

  const audioStateText =
    audio && audio.ringerMode === 'silent'
      ? 'الصوت عادي: حاليًا صامت — لن يرنّ الأذان'
      : null

  return (
    <section className="screen settings-screen">
      <SettingsGroup title="المظهر والقراءة">
        <SettingsSelect
          icon={<Icon name="moon" size={20} />}
          label="المظهر"
          description="نمط العرض: تلقائي حسب النظام، أو ليلي/نهاري"
          options={THEME_OPTIONS}
          value={theme}
          onChange={setTheme}
        />
        <SettingsSelect
          icon={<Icon name="hash" size={20} />}
          label="نمط الأرقام"
          description="أرقام مشرقية (٠-٩) أو عادية (0-9) في كل التطبيق"
          options={DIGITS_OPTIONS}
          value={digitsStyle}
          onChange={setDigitsStyle}
        />
        <SettingsNavRow
          icon={<Icon name="book-open" size={20} />}
          label="القراءة والخطوط"
          description="حجم خط المصحف والتفسير والاستمرار من آخر قراءة"
          value="تخصيص"
          onClick={() => navigate('/settings/reading')}
        />
      </SettingsGroup>

      <SettingsGroup title="المواقيت والأذان">
        <SettingsNavRow
          icon={<Icon name="landmark" size={20} />}
          label="الموقع"
          description="تحديد المدينة لحساب المواقيت"
          value={locationText}
          onClick={() => navigate('/settings/location')}
        />
        <SettingsNavRow
          icon={<Icon name="target" size={20} />}
          label="طريقة الحساب"
          description="طريقة حساب أوقات الصلاة والمذهب"
          value={methodLabel}
          onClick={() => navigate('/settings/prayer')}
        />
        <SettingsSelect
          icon={<Icon name="clock" size={20} />}
          label="مصدر الوقت"
          description={config.timeSource?.mode === 'manual' ? 'يدوي — التطبيق يستخدم الوقت الذي حددته' : 'تلقائي — وقت الجهاز'}
          options={[
            { value: 'auto', label: 'تلقائي' },
            { value: 'manual', label: 'يدوي' },
          ]}
          value={config.timeSource?.mode || 'auto'}
          onChange={changeTimeMode}
        />
        {config.timeSource?.mode === 'manual' && (() => {
          const pad = (n) => String(n).padStart(2,'0')
          // Display live time when not editing, draft when user changed
          const displayBase = hasManualChange ? (editManualBase || new Date(liveNowMs)) : new Date(liveNowMs)
          const base = displayBase
          return (
            <div className="settings-time-card">
              <div className="settings-time-card__header">
                <span className="settings-time-card__icon"><Icon name="calendar" size={18} /></span>
                <div className="settings-time-card__title">
                  <b>الوقت اليدوي</b>
                  <small>حدد التاريخ والوقت — ثم اضغط حفظ</small>
                </div>
                <span className="settings-time-card__badge">{arabicDigits(new Date(liveNowMs).toLocaleDateString('ar-EG'))}</span>
              </div>
              <div className="settings-time-card__grid">
                <label className="settings-time-card__field">
                  <span><Icon name="calendar" size={14} /> التاريخ</span>
                  <div className="custom-date-picker">
                    <div style={{display:'flex', flexDirection:'column', gap:'2px', flex:1}}>
                      <small style={{fontSize:'10px', color:'var(--text-muted)', textAlign:'center'}}>اليوم</small>
                      <select value={base.getDate()} onChange={(e) => {
                        const d = new Date(base); d.setDate(Number(e.target.value)); setEditManualBase(d); setManualSaved(false)
                      }} className="custom-select" aria-label="اليوم">
                        {Array.from({length: 31}, (_, i) => i+1).map(d => <option key={d} value={d}>{arabicDigits(d)}</option>)}
                      </select>
                    </div>
                    <div style={{display:'flex', flexDirection:'column', gap:'2px', flex:1}}>
                      <small style={{fontSize:'10px', color:'var(--text-muted)', textAlign:'center'}}>الشهر</small>
                      <select value={base.getMonth()+1} onChange={(e) => {
                        const d = new Date(base); d.setMonth(Number(e.target.value)-1); setEditManualBase(d); setManualSaved(false)
                      }} className="custom-select" aria-label="الشهر">
                        {['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'].map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
                      </select>
                    </div>
                    <div style={{display:'flex', flexDirection:'column', gap:'2px', flex:1}}>
                      <small style={{fontSize:'10px', color:'var(--text-muted)', textAlign:'center'}}>السنة</small>
                      <select value={base.getFullYear()} onChange={(e) => {
                        const d = new Date(base); d.setFullYear(Number(e.target.value)); setEditManualBase(d); setManualSaved(false)
                      }} className="custom-select" aria-label="السنة">
                        {(() => { const cy = new Date().getFullYear(); const start = cy - 60; const end = cy + 40; return Array.from({length: end - start + 1}, (_, i) => start + i).map(y => <option key={y} value={y}>{arabicDigits(y)}</option>) })()}
                      </select>
                    </div>
                  </div>
                </label>
                <label className="settings-time-card__field">
                  <span><Icon name="clock" size={14} /> الوقت <small style={{fontWeight:400, color:'var(--text-muted)'}}>(24 ساعة)</small></span>
                  <div className="custom-time-picker">
                    <div style={{display:'flex', flexDirection:'column', gap:'2px', flex:1}}>
                      <small style={{fontSize:'10px', color:'var(--text-muted)', textAlign:'center'}}>دقيقة</small>
                      <select value={pad(base.getMinutes())} onChange={(e) => {
                        const d = new Date(base); d.setMinutes(Number(e.target.value)); setEditManualBase(d); setManualSaved(false)
                      }} className="custom-select" aria-label="دقيقة">
                        {Array.from({length: 60}, (_, i) => pad(i)).map(m => <option key={m} value={m}>{arabicDigits(m)}</option>)}
                      </select>
                    </div>
                    <span style={{paddingTop:'14px'}}>:</span>
                    <div style={{display:'flex', flexDirection:'column', gap:'2px', flex:1}}>
                      <small style={{fontSize:'10px', color:'var(--text-muted)', textAlign:'center'}}>ساعة</small>
                      <select value={pad(base.getHours())} onChange={(e) => {
                        const d = new Date(base); d.setHours(Number(e.target.value)); setEditManualBase(d); setManualSaved(false)
                      }} className="custom-select" aria-label="ساعة (24)">
                        {Array.from({length: 24}, (_, i) => pad(i)).map(h => <option key={h} value={h}>{arabicDigits(h)}</option>)}
                      </select>
                    </div>
                  </div>
                </label>
              </div>
              <div style={{display:'flex', justifyContent:'flex-end', marginTop:'10px'}}>
                <button onClick={saveManualTime} disabled={!hasManualChange} type="button" style={{fontSize:'10px', padding:'3px 10px', borderRadius:'999px', border:'1px solid var(--border)', background: hasManualChange ? 'var(--primary)' : 'var(--surface)', color: hasManualChange ? 'var(--on-primary)' : 'var(--text-muted)', cursor: hasManualChange ? 'pointer' : 'not-allowed', opacity: hasManualChange ? 1 : 0.7, fontWeight:700}}>
                  {manualSaved ? '✓ تم الحفظ' : 'حفظ'}
                </button>
              </div>
              <p className="settings-time-card__hint">
                الوقت الفعّال: <b dir="ltr">{new Date(liveNowMs).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</b>
                <br />
                وقت الجهاز: <span dir="ltr">{new Date().toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </p>
            </div>
          )
        })()}
        <SettingsSwitch
          icon={<Icon name="volume" size={20} />}
          label="الأذان والتنبيهات"
          description={config.adhanEnabled ? 'مفعّل — يرنّ الأذان حتى مع إغلاق التطبيق' : 'متوقف'}
          checked={!!config.adhanEnabled}
          onChange={toggleAdhan}
        />
        <SettingsNavRow
          icon={<Icon name="mic" size={20} />}
          label="صوت الأذان"
          description="اختيار المؤذن وتجربة الصوت"
          value={adhanVoice}
          onClick={() => navigate('/settings/adhan')}
        />
      </SettingsGroup>

      <SettingsGroup title="حجم صوت الأذان">
        <SettingsSlider
          icon={<Icon name="volume" size={20} />}
          label="مستوى الرنين"
          description="يرنّ الأذان بهذا المستوى حتى لو كان الهاتف صامتًا"
          value={volumePercent}
          onChange={changeAdhanVolume}
        />
      </SettingsGroup>

      <SettingsGroup title="احترام وضع الصوت">
        <SettingsSwitch
          icon={<Icon name="bolt" size={20} />}
          label="احترام الصامت/الاهتزاز"
          description={config.respectSoundMode ? 'مفعّل — الصامت/الاهتزاز بلا صوت' : 'متوقف — يرنّ دائمًا كمنبّه'}
          checked={!!config.respectSoundMode}
          onChange={(v) => applyAdhanSetting({ respectSoundMode: v })}
        />
        {audio && (
          <div className="settings-status">
            <Icon name="volume" size={16} />
            <span>
              الحالة الآن:{' '}
              {audio.ringerMode === 'silent'
                ? 'صامت'
                : audio.ringerMode === 'vibrate'
                  ? 'اهتزاز'
                  : `صوت عادي (منبّه ${arabicDigits(audio.alarmVolume || 0)}/${arabicDigits(audio.alarmMax || 0)})`}
            </span>
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup title="الصلاحيات للعمل في الخلفية">
        <PermissionRow
          title="إشعارات النظام"
          ok={status ? !!status.notifications : null}
          hint={status && status.notifications === false ? 'الإشعارات محجوبة — يجب السماح لإظهار تنبيه الأذان' : ''}
          onOpen={() => openSystemSetting('notifications')}
        />
        <PermissionRow
          title="المنبّهات الدقيقة (أندرويد 12+)"
          ok={status ? !!status.exactAlarms : null}
          hint={
            status && status.exactAlarms === false
              ? 'بدونها قد يتأخر التنبيه حتى ربع ساعة — فعّل لضبط الأذان في وقته'
              : ''
          }
          onOpen={() => openSystemSetting('alarms')}
        />
        <PermissionRow
          title="تحسين البطارية"
          ok={status ? !status.batteryOptimized : null}
          hint={
            status && status.batteryOptimized
              ? 'اضبط "غير محسَّن/غير مقيد" لضمان عمل الخلفية على أجهزة Xiaomi/Oppo/Samsung'
              : ''
          }
          onOpen={() => openSystemSetting('battery')}
        />
      </SettingsGroup>

      {status?.oem && status.oem !== 'other' && (
        <SettingsGroup title={`إرشادات特别 — ${oemLabels[status.oem] || status.oem}`}>
          {(oemWarnings[status.oem] || []).map((step, i) => (
            <div key={i} className="settings-row" style={{ padding: '10px 14px', fontSize: '13px', color: 'var(--text)' }}>
              <span style={{ color: 'var(--primary)', fontWeight: 700, marginInlineEnd: 6 }}>{i + 1}.</span>
              {step}
            </div>
          ))}
        </SettingsGroup>
      )}

      <SettingsGroup title="حالة النظام">
        <div className="settings-row" style={{ padding: '10px 14px', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-muted)' }}>الجهاز:</span>{' '}
          <span style={{ fontWeight: 600 }}>{status?.manufacturer || '—'} {status?.model || ''}</span>
        </div>
        <div className="settings-row" style={{ padding: '10px 14px', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-muted)' }}>نظام Android:</span>{' '}
          <span style={{ fontWeight: 600 }}>{status?.androidVersion ? `API ${status.androidVersion}` : '—'}</span>
        </div>
        <div className="settings-row" style={{ padding: '10px 14px', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-muted)' }}>نوع الشركة:</span>{' '}
          <span style={{ fontWeight: 600 }}>{oemLabels[status?.oem] || '—'}</span>
        </div>
        <div className="settings-row" style={{ padding: '10px 14px', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-muted)' }}>الأذان في الخلفية:</span>{' '}
          <span style={{ fontWeight: 600, color: status?.scheduleArmed ? 'var(--primary)' : 'var(--text-muted)' }}>
            {status?.scheduleArmed ? 'مفعّل' : 'متوقف'}
          </span>
        </div>
      </SettingsGroup>

      <SettingsGroup title="الصوت والمشغّل">
        <SettingsSelect
          icon={<Icon name="play" size={20} />}
          label="سرعة التشغيل"
          description="السرعة الافتراضية لتلاوة القرآن والمحتوى"
          options={PLAYER_RATES}
          value={playerRate}
          onChange={changePlayerRate}
        />
        <SettingsSwitch
          icon={<Icon name="volume" size={20} />}
          label="صوت المسبحة"
          description="نغمة عند كل تسبيحة في المسبحة الإلكترونية"
          checked={tasbih.sound}
          onChange={(v) => setTasbih(saveTasbihSettings({ sound: v }))}
        />
        <SettingsSwitch
          icon={<Icon name="bolt" size={20} />}
          label="اهتزاز المسبحة"
          description="اهتزاز خفيف عند كل تسبيحة"
          checked={tasbih.vibration}
          onChange={(v) => setTasbih(saveTasbihSettings({ vibration: v }))}
        />
        <SettingsSwitch
          icon={<Icon name="volume" size={20} />}
          label="صوت الأذكار"
          description="نغمة عند كل ذكر في الأذكار وحصن المسلم"
          checked={adhkarSound}
          onChange={(v) => {
            setSoundEnabled(v)
            setAdhkarSound(v)
          }}
        />
        <SettingsSwitch
          icon={<Icon name="bolt" size={20} />}
          label="اهتزاز الأذكار"
          description="اهتزاز خفيف عند كل ذكر في الأذكار وحصن المسلم"
          checked={adhkarVibration}
          onChange={(v) => {
            setVibrationEnabled(v)
            setAdhkarVibration(v)
          }}
        />
      </SettingsGroup>

      <SettingsGroup title="التنزيلات والتخزين">
        <SettingsNavRow
          icon={<Icon name="download" size={20} />}
          label="التنزيلات والتخزين"
          description="إدارة الصوتيات المحمّلة ومساحتها لكل قسم"
          value={totalBytes}
          onClick={() => navigate('/settings/downloads')}
        />
      </SettingsGroup>

      <SettingsGroup title="البيانات والخصوصية">
        <SettingsNavRow
          icon={<Icon name="trash" size={20} />}
          label="تصفير التقدم والبيانات"
          description="تصفير تقدم الأسئلة وإحصائيات الأذكار وموضع القراءة"
          value="إدارة"
          danger
          onClick={() => navigate('/settings/data')}
        />
      </SettingsGroup>

      <SettingsGroup title="الدعم والتواصل">
        <SettingsNavRow
          icon={<Icon name="star" size={20} />}
          label="الدعم والتبرع"
          description="دعم تطبيق التقوى ومراسلة المطوّر"
          value="صدقة جارية"
          onClick={() => navigate('/settings/support')}
        />
      </SettingsGroup>

      <SettingsGroup title="حول التطبيق">
        <SettingsNavRow
          icon={<Icon name="info" size={20} />}
          label="حول التقوى"
          description="نسخة التطبيق والمحتوى والمصادر"
          value="v3.0.2"
          onClick={() => navigate('/settings/about')}
        />
      </SettingsGroup>
    </section>
  )
}

function PermissionRow({ title, ok, hint, onOpen }) {
  const chip = ok === null ? (
    <span className="settings-chip">جارٍ الفحص</span>
  ) : ok ? (
    <span className="settings-chip settings-chip--ok">
      <Icon name="check" size={13} />
      مفوّض
    </span>
  ) : (
    <span className="settings-chip settings-chip--warn">
      <Icon name="alert" size={13} />
      ينقص الإذن
    </span>
  )

  return (
    <SettingsRow
      icon={<Icon name="shield" size={20} />}
      label={title}
      description={hint}
      onClick={onOpen}
      trailing={<span className="settings-perm__status">{chip}</span>}
    />
  )
}

const oemLabels = {
  xiaomi: 'Xiaomi / Redmi / Poco',
  samsung: 'Samsung / OneUI',
  oppo: 'OPPO / Realme / OnePlus',
  huawei: 'Huawei / Honor',
  vivo: 'Vivo',
  other: 'أخرى',
}

const oemWarnings = {
  xiaomi: [
    'الإعدادات ← التطبيقات ← التطبيق',
    'البطارية ← 「لا قيود」',
    'الإعدادات ← التطبيقات ← التأذين التلقائي ← فعّل لهذا التطبيق',
    'الإعدادات ← البطارية ← تحسين البطارية ← أوقف تحسين لهذا التطبيق',
  ],
  samsung: [
    'الإعدادات ← التطبيقات ← التطبيق',
    'البطارية ← 「غير مقيّد」',
    'الإعدادات ← البطارية ← خيارات أخرى ← 「إيقاف تحسين البطارية」',
  ],
  oppo: [
    'الإعدادات ← التطبيقات ← إدارة التطبيقات',
    'التشغيل التلقائي ← فعّل لهذا التطبيق',
    'الإعدادات ← البطارية ← تعليق في الخلفية ← اسمح بهذا التطبيق',
  ],
  huawei: [
    'الإعدادات ← البطارية ← بدء التشغيل التلقائي',
    'اختر 「يدوياً」 وفعّل جميع الخيارات',
    'الإعدادات ← البطارية ← حماية البطارية ← اسمح لهذا التطبيق',
  ],
  vivo: [
    'الإعدادات ← البطارية ← إدارة الطاقة',
    'التشغيل التلقائي ← فعّل لهذا التطبيق',
    'الإعدادات ← التطبيقات ← التطبيق ← البطارية ← اسمح بالعمل في الخلفية',
  ],
}