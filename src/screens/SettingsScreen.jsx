import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SettingsSearch } from '../components/settings/SettingsSearch.jsx'
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
import { METHOD_BY_ID } from '../services/prayerTimes.mjs'
import { getTotalStorageBytes, formatBytes } from '../services/settingsStorage.mjs'
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

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

export default function SettingsScreen() {
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const [query, setQuery] = useState('')

  const config = useMemo(() => loadConfig(), [])
  const location = useMemo(() => getCurrentLocation(), [])
  const tasbih = useMemo(() => getTasbihSettings(), [])
  const [playerRate, setPlayerRate] = useState(() => storage.get('player.rate', 1))

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
    await refreshWatch({ config: next })
  }

  const changePlayerRate = (rate) => {
    setPlayerRate(rate)
    player.setRate(rate)
  }

  const groups = useMemo(() => {
    const q = normalize(query)
    const show = (keywords) => !q || keywords.some((k) => normalize(k).includes(q))

    return [
      {
        id: 'appearance',
        title: 'المظهر والقراءة',
        keywords: ['المظهر', 'القراءة', 'الثيم', 'ليلي', 'نهاري', 'تلقائي', 'الخطوط', 'المصحف', 'التفسير'],
        hidden: !show(['المظهر', 'الثيم', 'ليلي', 'نهاري', 'تلقائي', 'القراءة', 'الخطوط']),
        body: (
          <>
            <SettingsSelect
              icon={<Icon name="moon" size={20} />}
              label="المظهر"
              description="نمط العرض: تلقائي حسب النظام، أو ليلي/نهاري"
              options={THEME_OPTIONS}
              value={theme}
              onChange={setTheme}
            />
            <SettingsNavRow
              icon={<Icon name="book-open" size={20} />}
              label="القراءة والخطوط"
              description="حجم خط المصحف والتفسير والاستمرار من آخر قراءة"
              value="تخصيص"
              onClick={() => navigate('/settings/reading')}
            />
          </>
        ),
      },
      {
        id: 'prayer',
        title: 'المواقيت والأذان',
        keywords: ['المواقيت', 'الأذان', 'الموقع', 'طريقة الحساب', 'المذهب', 'التوقيت', 'الصلاة', 'الصلوات', 'التنبيهات', 'الإشعارات', 'الصوت', 'المدينة', 'الاذان'],
        hidden: !show(['المواقيت', 'الأذان', 'الموقع', 'طريقة الحساب', 'الصلاة', 'التنبيهات']),
        body: (
          <>
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
          </>
        ),
      },
      {
        id: 'sound',
        title: 'الصوت والمشغّل',
        keywords: ['الصوت', 'المشغل', 'السرعة', 'المسبحة', 'الاهتزاز', 'العد', 'التسبيح', 'المشغّل'],
        hidden: !show(['الصوت', 'المشغل', 'المسبحة', 'الاهتزاز', 'السرعة']),
        body: (
          <>
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
              onChange={(v) => saveTasbihSettings({ sound: v })}
            />
            <SettingsSwitch
              icon={<Icon name="bolt" size={20} />}
              label="اهتزاز المسبحة"
              description="اهتزاز خفيف عند كل تسبيحة"
              checked={tasbih.vibration}
              onChange={(v) => saveTasbihSettings({ vibration: v })}
            />
          </>
        ),
      },
      {
        id: 'downloads',
        title: 'التنزيلات والتخزين',
        keywords: ['التنزيلات', 'التخزين', 'التحميل', 'المساحة', 'القرآن', 'القراء', 'حصن', 'الفتاوى', 'الخطب', 'الاستماع دون إنترنت'],
        hidden: !show(['التنزيلات', 'التخزين', 'التحميل', 'المساحة']),
        body: (
          <SettingsNavRow
            icon={<Icon name="download" size={20} />}
            label="التنزيلات والتخزين"
            description="إدارة الصوتيات المحمّلة ومساحتها لكل قسم"
            value={totalBytes}
            onClick={() => navigate('/settings/downloads')}
          />
        ),
      },
      {
        id: 'data',
        title: 'البيانات والخصوصية',
        keywords: ['البيانات', 'الخصوصية', 'تصفير', 'التقدم', 'الكويز', 'الأسئلة', 'الإحصائيات', 'الذكار', 'مسح'],
        hidden: !show(['البيانات', 'الخصوصية', 'تصفير', 'التقدم', 'مسح']),
        body: (
          <SettingsNavRow
            icon={<Icon name="trash" size={20} />}
            label="تصفير التقدم والبيانات"
            description="تصفير تقدم الأسئلة وحصن المسلم وإحصائيات الأذكار"
            value="إدارة"
            danger
            onClick={() => navigate('/settings/data')}
          />
        ),
      },
      {
        id: 'support',
        title: 'الدعم والتواصل',
        keywords: ['الدعم', 'التواصل', 'التبرع', 'التحويل', 'البنكي', 'الايبان', 'الصدقة', 'البريد', 'الراجحي'],
        hidden: !show(['الدعم', 'التواصل', 'التبرع', 'التحويل', 'الصدقة']),
        body: (
          <SettingsNavRow
            icon={<Icon name="star" size={20} />}
            label="الدعم والتبرع"
            description="دعم تطبيق التقوى ومراسلة المطوّر"
            value="صدقة جارية"
            onClick={() => navigate('/settings/support')}
          />
        ),
      },
      {
        id: 'about',
        title: 'حول التطبيق',
        keywords: ['حول', 'النسخة', 'الإصدار', 'المعلومات', 'نبذة', 'المحتوى', 'المصادر'],
        hidden: !show(['حول', 'النسخة', 'المعلومات', 'نبذة']),
        body: (
          <SettingsNavRow
            icon={<Icon name="info" size={20} />}
            label="حول التقوى"
            description="نسخة التطبيق والمحتوى والمصادر"
            value="v3.0.0"
            onClick={() => navigate('/settings/about')}
          />
        ),
      },
    ]
  }, [query, theme, setTheme, config, locationText, tasbih.sound, tasbih.vibration, playerRate, methodLabel, adhanVoice, totalBytes, toggleAdhan, changePlayerRate, navigate])

  return (
    <section className="screen settings-screen">
      <SettingsSearch onQuery={setQuery} />
      {groups
        .filter((g) => !g.hidden)
        .map((g) => (
          <SettingsGroup key={g.id} title={g.title}>
            {g.body}
          </SettingsGroup>
        ))}
      {query && groups.every((g) => g.hidden) && (
        <p className="settings-note">لا توجد إعدادات مطابقة لبحثك «{query}».</p>
      )}
    </section>
  )
}
