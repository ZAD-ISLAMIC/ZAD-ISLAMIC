import React, { useState } from 'react'
import { METHODS, CUSTOM_METHOD, ASR_LABELS, HIGHLAT_RULES } from '../../services/prayerTimes.mjs'
import { loadConfig, updateConfig, getPrayerLabels } from '../../services/prayerConfig.mjs'
import { refreshWatch, PRAYERS } from '../../services/prayerWatch.mjs'
import { Icon } from '../../components/ui/Icon.jsx'
import { SettingsGroup } from '../../components/settings/SettingsGroup.jsx'
import { SettingsSelect } from '../../components/settings/SettingsSelect.jsx'
import { arabicDigits } from '../../utils/arabic.mjs'
import '../../styles/settings.css'

const LABELS = getPrayerLabels()

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
        <div className="set-sheet__list">
          {[...METHODS, CUSTOM_METHOD].map((m) => (
            <button
              key={m.id}
              className={`set-sheet__row${config.methodId === m.id ? ' set-sheet__row--active' : ''}`}
              onClick={() => update((c) => ({ ...c, methodId: m.id }))}
              type="button"
            >
              <span>{m.label}</span>
              {config.methodId === m.id && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      </SettingsGroup>

      {config.methodId === 'custom' && (
        <SettingsGroup title="زوايا وطرق مخصصة">
          <NumberField label="زاوية الفجر" value={custom.fajrAngle} placeholder="18"
            onChange={(v) => update((c) => ({ ...c, custom: { ...custom, fajrAngle: v } }))} />
          <NumberField label="زاوية العشاء" value={custom.ishaAngle} placeholder="17"
            onChange={(v) => update((c) => ({ ...c, custom: { ...custom, ishaAngle: v } }))} />
          <NumberField label="دقائق بعد المغرب للعشاء" value={custom.ishaInterval} placeholder="—"
            onChange={(v) => update((c) => ({ ...c, custom: { ...custom, ishaInterval: v } }))} />
          <NumberField label="زاوية المغرب" value={custom.maghribAngle} placeholder="—"
            onChange={(v) => update((c) => ({ ...c, custom: { ...custom, maghribAngle: v } }))} />
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
            { value: '12', label: '12 ساعة (ص/م)' },
          ]}
          value={config.timeFormat12 ? '12' : '24'}
          onChange={(v) => update((c) => ({ ...c, timeFormat12: v === '12' }))}
        />
      </SettingsGroup>

      <SettingsGroup title="الأماكن ذات خطوط العرض العالية">
        <div className="set-sheet__list">
          {HIGHLAT_RULES.map((r) => (
            <button
              key={r.id}
              className={`set-sheet__row${config.highLatRule === r.id ? ' set-sheet__row--active' : ''}`}
              onClick={() => update((c) => ({ ...c, highLatRule: r.id }))}
              type="button"
            >
              <span>{r.label}</span>
              {config.highLatRule === r.id && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      </SettingsGroup>

      <SettingsGroup title="تعديل دقائق الصلوات">
        <p className="settings-note">اضبط كل صلاة بالدقائق (+ أو −) حسب جهات التوقيت المحلية.</p>
        <div style={{ padding: '12px 14px' }}>
          <AdjustList config={config} update={update} />
        </div>
      </SettingsGroup>
    </section>
  )
}

function NumberField({ label, value, placeholder, onChange }) {
  return (
    <label className="set-sheet__field">
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

function AdjustList({ config, update }) {
  return (
    <div className="set-sheet__adjust">
      {PRAYERS.map((k) => (
        <div className="set-sheet__adjust-row" key={k}>
          <span>{LABELS[k]}</span>
          <div className="set-sheet__stepper">
            <button
              onClick={() => update((c) => ({ ...c, adjustments: { ...c.adjustments, [k]: Math.max(-30, (c.adjustments[k] || 0) - 1) } }))}
              type="button"
              aria-label={`نقص دقيقة من ${LABELS[k]}`}
            >
              −
            </button>
            <b>{arabicDigits(config.adjustments[k] || 0)}</b>
            <button
              onClick={() => update((c) => ({ ...c, adjustments: { ...c.adjustments, [k]: Math.min(30, (c.adjustments[k] || 0) + 1) } }))}
              type="button"
              aria-label={`إضافة دقيقة إلى ${LABELS[k]}`}
            >
              +
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
