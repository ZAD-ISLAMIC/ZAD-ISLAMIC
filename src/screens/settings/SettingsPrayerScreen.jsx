import React, { useState } from 'react'
import { METHODS, CUSTOM_METHOD, ASR_LABELS, HIGHLAT_RULES } from '../../services/prayerTimes.mjs'
import { loadConfig, updateConfig, getPrayerLabels } from '../../services/prayerConfig.mjs'
import { refreshWatch, PRAYERS } from '../../services/prayerWatch.mjs'
import { Icon } from '../../components/ui/Icon.jsx'
import { SettingsGroup } from '../../components/settings/SettingsGroup.jsx'
import { SettingsSelect } from '../../components/settings/SettingsSelect.jsx'
import { SettingsRadioRow } from '../../components/settings/SettingsRadioRow.jsx'
import { arabicDigits } from '../../utils/arabic.mjs'
import '../../styles/settings.css'

const LABELS = getPrayerLabels()

const METHOD_ICONS = {
  mwsl: 'moon',
  isna: 'target',
  egypt: 'landmark',
  makkah: 'landmark',
  diyanet: 'moon',
  kuwait: 'target',
  karachi: 'target',
  tehran: 'target',
  custom: 'gear',
}

export default function SettingsPrayerScreen() {
  const [config, setConfig] = useState(() => loadConfig())
  const [custom, setCustom] = useState(() => loadConfig().custom || {})

  const apply = async (partial) => {
    const next = updateConfig(partial)
    setConfig(next)
    if (partial.custom) setCustom(partial.custom)
    await refreshWatch({ config: next })
  }

  const update = async (fn) => {
    await apply(fn(config))
  }

  return (
    <section className="screen settings-page">
      <SettingsGroup title="طريقة الحساب">
        {[...METHODS, CUSTOM_METHOD].map((m) => (
          <SettingsRadioRow
            key={m.id}
            icon={<Icon name={METHOD_ICONS[m.id] || 'target'} size={20} />}
            label={m.label}
            active={config.methodId === m.id}
            onClick={() => update((c) => ({ ...c, methodId: m.id }))}
          />
        ))}
      </SettingsGroup>

      {config.methodId === 'custom' && (
        <SettingsGroup title="زوايا وطرق مخصصة">
          <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="settings-field__group">
              <NumberField label="زاوية الفجر" value={custom.fajrAngle} placeholder="18"
                onChange={(v) => update((c) => ({ ...c, custom: { ...custom, fajrAngle: v } }))} />
              <NumberField label="زاوية العشاء" value={custom.ishaAngle} placeholder="17"
                onChange={(v) => update((c) => ({ ...c, custom: { ...custom, ishaAngle: v } }))} />
              <NumberField label="دقائق بعد المغرب للعشاء" value={custom.ishaInterval} placeholder="—"
                onChange={(v) => update((c) => ({ ...c, custom: { ...custom, ishaInterval: v } }))} />
              <NumberField label="زاوية المغرب" value={custom.maghribAngle} placeholder="—"
                onChange={(v) => update((c) => ({ ...c, custom: { ...custom, maghribAngle: v } }))} />
            </div>
          </div>
        </SettingsGroup>
      )}

      <SettingsGroup title="المذهب في حساب العصر">
        <SettingsSelect
          icon={<Icon name="target" size={20} />}
          label="حساب العصر"
          options={[
            { value: 'shafi', label: ASR_LABELS.shafi },
            { value: 'hanafi', label: ASR_LABELS.hanafi },
          ]}
          value={config.asrMadhab}
          onChange={(v) => update((c) => ({ ...c, asrMadhab: v }))}
        />
      </SettingsGroup>

      <SettingsGroup title="تنسيق الوقت">
        <SettingsSelect
          icon={<Icon name="calendar" size={20} />}
          label="تنسيق الساعة"
          options={[
            { value: '24', label: '24 ساعة' },
            { value: '12', label: '12 (ص/م)' },
          ]}
          value={config.timeFormat12 ? '12' : '24'}
          onChange={(v) => update((c) => ({ ...c, timeFormat12: v === '12' }))}
        />
      </SettingsGroup>

      <SettingsGroup title="خطوط العرض العالية">
        {HIGHLAT_RULES.map((r) => (
          <SettingsRadioRow
            key={r.id}
            icon={<Icon name="moon" size={20} />}
            label={r.label}
            active={config.highLatRule === r.id}
            onClick={() => update((c) => ({ ...c, highLatRule: r.id }))}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup title="تعديل دقائق الصلوات">
        <p className="settings-note" style={{ margin: '12px 14px 0' }}>
          اضبط كل صلاة بالدقائق (+ أو −) حسب جهات التوقيت المحلية.
        </p>
        {PRAYERS.map((k) => (
          <AdjustRow
            key={k}
            label={LABELS[k]}
            value={config.adjustments[k] || 0}
            onDec={() => update((c) => ({ ...c, adjustments: { ...c.adjustments, [k]: Math.max(-30, (c.adjustments[k] || 0) - 1) } }))}
            onInc={() => update((c) => ({ ...c, adjustments: { ...c.adjustments, [k]: Math.min(30, (c.adjustments[k] || 0) + 1) } }))}
          />
        ))}
      </SettingsGroup>
    </section>
  )
}

function NumberField({ label, value, placeholder, onChange }) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        dir="ltr"
        value={Number.isFinite(value) ? String(value) : ''}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value === '' ? null : Number(e.target.value)
          onChange(Number.isFinite(v) ? v : null)
        }}
      />
    </label>
  )
}

function AdjustRow({ label, value, onDec, onInc }) {
  return (
    <div className="settings-row">
      <span className="settings-row__icon" aria-hidden="true">
        <Icon name="calendar" size={20} />
      </span>
      <span className="settings-row__text">
        <span className="settings-row__label">{label}</span>
      </span>
      <span className="settings-row__trailing">
        <div className="settings-stepper" role="group" aria-label={label}>
          <button className="settings-stepper__btn" aria-label={`نقص دقيقة من ${label}`} onClick={onDec} type="button">−</button>
          <span className="settings-stepper__value">{arabicDigits(value)}</span>
          <button className="settings-stepper__btn" aria-label={`إضافة دقيقة إلى ${label}`} onClick={onInc} type="button">+</button>
        </div>
      </span>
    </div>
  )
}