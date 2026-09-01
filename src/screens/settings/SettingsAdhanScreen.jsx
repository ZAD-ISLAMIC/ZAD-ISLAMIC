import React, { useEffect, useRef, useState } from 'react'
import { loadConfig, updateConfig } from '../../services/prayerConfig.mjs'
import {
  refreshWatch,
  hasNativeWatch,
  getWatchStatus,
  getAudioState,
  openSystemSetting,
  testAdhanNow,
  setAdhanVolume,
} from '../../services/prayerWatch.mjs'
import { ADHAN_VOICES, CUSTOM_ADHAN, saveCustomAdhan, getCustomAdhanBlob, playAzan, stopAzan } from '../../services/sound.mjs'
import { Icon } from '../../components/ui/Icon.jsx'
import { SettingsGroup } from '../../components/settings/SettingsGroup.jsx'
import { SettingsSwitch } from '../../components/settings/SettingsSwitch.jsx'
import { SettingsSlider } from '../../components/settings/SettingsSlider.jsx'
import { SettingsRow } from '../../components/settings/SettingsRow.jsx'
import { SettingsRadioRow } from '../../components/settings/SettingsRadioRow.jsx'
import { SettingsHero } from '../../components/settings/SettingsHero.jsx'
import { arabicDigits } from '../../utils/arabic.mjs'
import '../../styles/settings.css'

export default function SettingsAdhanScreen() {
  const [config, setConfig] = useState(() => loadConfig())
  const [nativeOk, setNativeOk] = useState(hasNativeWatch())
  const [hasCustom, setHasCustom] = useState(false)
  const [status, setStatus] = useState(null)
  const [testMsg, setTestMsg] = useState('')
  const [audio, setAudio] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    getCustomAdhanBlob().then((blob) => setHasCustom(!!blob))
    getWatchStatus().then(setStatus)
    getAudioState().then(setAudio)
    return () => stopAzan()
  }, [])

  const refreshStatus = () => getWatchStatus().then(setStatus)

  const apply = async (partial) => {
    const next = updateConfig(partial)
    setConfig(next)
    await refreshWatch({ config: next })
    refreshStatus()
  }

  const importAdhan = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await saveCustomAdhan(file)
    setHasCustom(true)
    await apply({ adhanSound: CUSTOM_ADHAN })
  }

  const handlePreview = async () => {
    if (previewing) {
      stopAzan()
      setPreviewing(false)
      return
    }
    const sound = await playAzan()
    if (sound) {
      setPreviewing(true)
      const done = () => setPreviewing(false)
      sound.addEventListener('ended', done)
      sound.addEventListener('error', done)
    }
  }

  const handleTest = () => {
    const ok = testAdhanNow()
    setTestMsg(
      ok
        ? 'سيُرنّ أذان تجريبي خلال ثوانٍ وتظهر نافذة الأذان داخل التطبيق مع إشعار'
        : 'الأداة غير متوفرة هنا — شغّل التطبيق على جهاز Android'
    )
    setTimeout(() => setTestMsg(''), 7000)
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
    <section className="screen settings-page">
      <SettingsHero
        icon={<Icon name="volume" size={24} />}
        title={config.adhanEnabled ? 'الأذان مفعّل' : 'الأذان متوقف'}
        sub="يرنّ الأذان عند دخول وقت الصلاة حتى مع إغلاق التطبيق"
        variant={config.adhanEnabled ? '' : ''}
      >
        <button
          className={`switch${config.adhanEnabled ? ' switch--on' : ''}`}
          role="switch"
          aria-checked={!!config.adhanEnabled}
          aria-label="تبديل الأذان والتنبيهات"
          onClick={(e) => {
            e.stopPropagation()
            setConfig((c) => ({ ...c, adhanEnabled: !c.adhanEnabled }))
            apply({ adhanEnabled: !config.adhanEnabled })
            setNativeOk(hasNativeWatch())
          }}
          type="button"
        >
          <i />
        </button>
        <button className="settings-btn settings-btn--surface settings-btn--sm" onClick={handleTest} type="button">
          <Icon name="play" size={13} />
          جرّب الآن
        </button>
      </SettingsHero>

      {testMsg && <p className="settings-note" style={{ marginTop: -10, marginBottom: 14 }}>{testMsg}</p>}
      {audioStateText && <p className="settings-note" style={{ marginTop: -10, marginBottom: 14 }}>{audioStateText}</p>}

      <SettingsGroup title="صوت الأذان">
        {ADHAN_VOICES.map((v) => (
          <SettingsRadioRow
            key={v.file}
            icon={<Icon name="mic" size={20} />}
            label={v.label}
            active={config.adhanSound === v.file}
            showCheck={false}
            onClick={() => apply({ adhanSound: v.file })}
          />
        ))}
        {hasCustom && (
          <SettingsRadioRow
            key={CUSTOM_ADHAN}
            icon={<Icon name="file" size={20} />}
            label="صوت مخصص (من جهازك)"
            active={config.adhanSound === CUSTOM_ADHAN}
            showCheck={false}
            onClick={() => apply({ adhanSound: CUSTOM_ADHAN })}
          />
        )}
        <div className="settings-azchooser">
          <button className="settings-azchooser__btn settings-azchooser__btn--play" onClick={handlePreview} type="button">
            <Icon name={previewing ? 'pause' : 'play'} size={14} />
            {previewing ? 'إيقاف التجربة' : 'تجربة الصوت المحدد'}
          </button>
          <button className="settings-azchooser__btn" onClick={() => fileRef.current?.click()} type="button">
            <Icon name={hasCustom ? 'refresh' : 'plus'} size={14} />
            {hasCustom ? 'استبدال الصوت المخصص' : 'إضافة صوت من جهازك'}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          style={{ display: 'none' }}
          onChange={importAdhan}
          aria-label="اختر ملف صوت للأذان"
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
          onChange={(v) => apply({ respectSoundMode: v })}
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
        {nativeOk === false && (
          <p className="settings-note" style={{ margin: '12px 14px 14px' }}>
            الإضافة غير متوفرة — الأذان يظهر داخل التطبيق فقط.
          </p>
        )}
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