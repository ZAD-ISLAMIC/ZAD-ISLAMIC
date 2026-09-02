import React, { useEffect, useRef, useState } from 'react'
import { loadConfig, updateConfig } from '../../services/prayerConfig.mjs'
import {
  refreshWatch,
  hasNativeWatch,
  getAudioState,
  testAdhanNow,
} from '../../services/prayerWatch.mjs'
import { ADHAN_VOICES, CUSTOM_ADHAN, saveCustomAdhan, getCustomAdhanBlob, playAzan, stopAzan } from '../../services/sound.mjs'
import { Icon } from '../../components/ui/Icon.jsx'
import { SettingsGroup } from '../../components/settings/SettingsGroup.jsx'
import { SettingsRadioRow } from '../../components/settings/SettingsRadioRow.jsx'
import { SettingsHero } from '../../components/settings/SettingsHero.jsx'
import '../../styles/settings.css'

export default function SettingsAdhanScreen() {
  const [config, setConfig] = useState(() => loadConfig())
  const [hasCustom, setHasCustom] = useState(false)
  const [testMsg, setTestMsg] = useState('')
  const [audio, setAudio] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    getCustomAdhanBlob().then((blob) => setHasCustom(!!blob))
    getAudioState().then(setAudio)
    return () => stopAzan()
  }, [])

  const apply = async (partial) => {
    const next = updateConfig(partial)
    setConfig(next)
    await refreshWatch({ config: next })
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
            apply({ adhanEnabled: !config.adhanEnabled })
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
    </section>
  )
}