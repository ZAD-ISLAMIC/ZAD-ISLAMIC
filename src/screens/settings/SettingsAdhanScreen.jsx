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
import { ADHAN_VOICES, CUSTOM_ADHAN, saveCustomAdhan, getCustomAdhanBlob, playAzan } from '../../services/sound.mjs'
import { Icon } from '../../components/ui/Icon.jsx'
import { SettingsGroup } from '../../components/settings/SettingsGroup.jsx'
import { SettingsSwitch } from '../../components/settings/SettingsSwitch.jsx'
import { SettingsSlider } from '../../components/settings/SettingsSlider.jsx'
import { SettingsRow } from '../../components/settings/SettingsRow.jsx'
import { arabicDigits } from '../../utils/arabic.mjs'
import '../../styles/settings.css'

export default function SettingsAdhanScreen() {
  const [config, setConfig] = useState(() => loadConfig())
  const [nativeOk, setNativeOk] = useState(hasNativeWatch())
  const [hasCustom, setHasCustom] = useState(false)
  const [status, setStatus] = useState(null)
  const [testMsg, setTestMsg] = useState('')
  const [audio, setAudio] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    getCustomAdhanBlob().then((blob) => setHasCustom(!!blob))
    getWatchStatus().then(setStatus)
    getAudioState().then(setAudio)
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

  return (
    <section className="screen settings-page">
      <SettingsGroup title="تفعيل الأذان">
        <SettingsSwitch
          icon={<Icon name="volume" size={20} />}
          label="الأذان والتنبيهات"
          description={config.adhanEnabled ? 'مفعّل — يرنّ الأذان حتى مع إغلاق التطبيق' : 'متوقف'}
          checked={!!config.adhanEnabled}
          onChange={(v) => {
            setConfig((c) => ({ ...c, adhanEnabled: v }))
            apply({ adhanEnabled: v })
            setNativeOk(hasNativeWatch())
          }}
        />
        <p className="settings-note">
          عند وقت الصلاة يظهر إشعار بسيط وتفتح نافذة الأذان داخل التطبيق لعرض الصلاة الحالية والتالية.
        </p>
        <div style={{ padding: '12px 14px', borderTop: '1px solid color-mix(in srgb, var(--border) 55%, transparent)' }}>
          <button className="settings-action settings-action--surface" onClick={handleTest} type="button">
            <Icon name="play" size={16} />
            جرّب الآن (رنين بعد ثوانٍ)
          </button>
          {testMsg && <p className="settings-note">{testMsg}</p>}
        </div>
      </SettingsGroup>

      <SettingsGroup title="صوت الأذان">
        <div className="set-sheet__list">
          {ADHAN_VOICES.map((v) => (
            <button
              key={v.file}
              className={`set-sheet__row${config.adhanSound === v.file ? ' set-sheet__row--active' : ''}`}
              onClick={() => apply({ adhanSound: v.file })}
              type="button"
            >
              <span>{v.label}</span>
              {config.adhanSound === v.file && <Icon name="check" size={16} />}
            </button>
          ))}
          {hasCustom && (
            <button
              className={`set-sheet__row${config.adhanSound === CUSTOM_ADHAN ? ' set-sheet__row--active' : ''}`}
              onClick={() => apply({ adhanSound: CUSTOM_ADHAN })}
              type="button"
            >
              <span>صوت مخصص (من جهازك)</span>
              {config.adhanSound === CUSTOM_ADHAN && <Icon name="check" size={16} />}
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          className="set-sheet__file"
          onChange={importAdhan}
          aria-label="اختر ملف صوت للأذان"
        />
        <div className="set-sheet__row-buttons">
          <button className="set-sheet__test" onClick={() => playAzan()} type="button">
            تجربة الصوت
          </button>
          <button className="set-sheet__test" onClick={() => fileRef.current?.click()} type="button">
            {hasCustom ? 'استبدال الصوت المخصص' : 'إضافة صوت من جهازك'}
          </button>
        </div>
      </SettingsGroup>

      <SettingsGroup title="حجم صوت الأذان">
        <SettingsSlider
          icon={<Icon name="volume" size={20} />}
          label="مستوى الصوت"
          description="مستوى رنين الأذان"
          value={volumePercent}
          onChange={changeAdhanVolume}
        />
        <p className="settings-note">
          يحدّد مستوى رنين الأذان. عند تعطيل «احترام وضع الصوت» يرنّ الأذان بهذا المستوى حتى لو كان الهاتف
          صامتًا، ويعود مستوى منبّه الهاتف لأصله بعد الانتهاء.
        </p>
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
          <p className="settings-note">
            الحالة الآن:{' '}
            {audio.ringerMode === 'silent'
              ? 'صامت'
              : audio.ringerMode === 'vibrate'
                ? 'اهتزاز'
                : `صوت عادي (منبّه ${arabicDigits(audio.alarmVolume || 0)}/${arabicDigits(audio.alarmMax || 0)})`}
          </p>
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
        <p className="settings-note">
          على أجهزة Xiaomi/MIUI افتح أيضًا: الإعدادات ← التطبيقات ← التطبيق ← «التحكم في البطارية» = لا قيود،
          وفعّل «التشغيل التلقائي عند بدء التشغيل».
        </p>
        {nativeOk === false && (
          <p className="settings-note">الإضافة غير متوفرة — الأذان يظهر داخل التطبيق فقط.</p>
        )}
      </SettingsGroup>
    </section>
  )
}

function PermissionRow({ title, desc, hint, onOpen }) {
  return (
    <SettingsRow
      icon={<Icon name="shield" size={20} />}
      label={title}
      description={desc || hint || ''}
      onClick={onOpen}
      trailing={<span className="settings-mini-btn">فتح الإعدادات</span>}
    />
  )
}
