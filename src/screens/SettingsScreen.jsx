import React, { useMemo, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { SettingsGroup } from '../components/settings/SettingsGroup.jsx'
import { SettingsSwitch } from '../components/settings/SettingsSwitch.jsx'
import { SettingsNavRow } from '../components/settings/SettingsNavRow.jsx'
import { SettingsSelect } from '../components/settings/SettingsSelect.jsx'
import { Icon } from '../components/ui/Icon.jsx'
import { useTheme } from '../hooks/useTheme.mjs'
import * as player from '../services/player.mjs'
import { storage } from '../services/storage.mjs'
import { loadConfig, updateConfig } from '../services/prayerConfig.mjs'
import { refreshWatch } from '../services/prayerWatch.mjs'
import { getCurrentLocation } from '../services/location.mjs'
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
  }

  const changePlayerRate = (rate) => {
    setPlayerRate(rate)
    player.setRate(rate)
  }

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
          description="اختيار المؤذن وحجم الصوت والصلاحيات"
          value={adhanVoice}
          onClick={() => navigate('/settings/adhan')}
        />
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
          value="v3.0.1"
          onClick={() => navigate('/settings/about')}
        />
      </SettingsGroup>
    </section>
  )
}