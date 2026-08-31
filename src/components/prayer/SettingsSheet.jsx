import React, { useState, useEffect } from 'react'
import { METHODS, CUSTOM_METHOD, ASR_LABELS, HIGHLAT_RULES } from '../../services/prayerTimes.mjs'
import { loadConfig, updateConfig, getPrayerLabels, getNowMs } from '../../services/prayerConfig.mjs'
import {
  PRAYERS,
  refreshWatch,
  hasNativeWatch,
  getWatchStatus,
  getAudioState,
  openSystemSetting,
  testAdhanNow,
  setAdhanVolume,
  clearAllFiredToday,
} from '../../services/prayerWatch.mjs'
import { ADHAN_VOICES, CUSTOM_ADHAN, saveCustomAdhan, getCustomAdhanBlob, playAzan } from '../../services/sound.mjs'
import { Icon } from '../ui/Icon.jsx'
import { arabicDigits } from '../../utils/arabic.mjs'

/**
 * Settings sheet for the prayer calculator:
 *  - calculation method (incl. custom angles/minutes)
 *  - asr madhab (شافعي/حنفي)
 *  - 12/24h format, high-lat rule, per-prayer minute adjustments
 *  - adhan voice picker + "جرّب الآن" + background permission panel
 */
export function SettingsSheet({ onClose }) {
  const [config, setConfig] = useState(() => loadConfig())
  const [custom, setCustom] = useState(() => loadConfig().custom || {})
  const [nativeOk, setNativeOk] = useState(hasNativeWatch())
  const [hasCustom, setHasCustom] = useState(false)
  const [status, setStatus] = useState(null)
  const [testMsg, setTestMsg] = useState('')
  const [audio, setAudio] = useState(null)
  const fileRef = React.useRef(null)

  useEffect(() => {
    getCustomAdhanBlob().then((blob) => setHasCustom(!!blob))
    getWatchStatus().then(setStatus)
    getAudioState().then(setAudio)
  }, [])

  const refreshStatus = () => getWatchStatus().then(setStatus)

  const importAdhan = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await saveCustomAdhan(file)
    setHasCustom(true)
    await update((c) => ({ ...c, adhanSound: CUSTOM_ADHAN }))
  }

  const apply = async (partial) => {
    const next = updateConfig(partial)
    setConfig(next)
    if (partial.custom) setCustom(partial.custom)
    await refreshWatch({ config: next })
    refreshStatus()
  }

  const update = async (fn) => {
    const next = fn(config)
    await apply(next)
  }

  const toggleAdhan = async () => {
    const next = updateConfig({ adhanEnabled: !config.adhanEnabled })
    setConfig(next)
    setNativeOk(hasNativeWatch())
    await refreshWatch({ config: next })
    refreshStatus()
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

  // Live + persistent: writes the config (used by the next schedule sync) and
  // pushes it to the native layer so it applies to any ringing adhan right now.
  const changeAdhanVolume = (e) => {
    const v = Number(e.target.value) / 100
    setConfig((c) => ({ ...c, adhanVolume: v }))
    setAdhanVolume(v)
  }

  return (
    <div className="set-sheet" role="dialog" aria-modal="true" aria-label="إعدادات مواقيت الصلاة">
      <div className="set-sheet__backdrop" onClick={onClose} />
      <div className="set-sheet__card">
        <div className="set-sheet__head">
          <h3 className="set-sheet__title">إعدادات المواقيت</h3>
          <button className="set-sheet__close" onClick={onClose} aria-label="إغلاق">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="set-sheet__body">
          <Section title="طريقة الحساب">
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
          </Section>

          {config.methodId === 'custom' && (
            <Section title="زوايا وطرق مخصصة">
              <NumberField label="زاوية الفجر" value={custom.fajrAngle} placeholder="18"
                onChange={(v) => update((c) => ({ ...c, custom: { ...custom, fajrAngle: v } }))} />
              <NumberField label="زاوية العشاء" value={custom.ishaAngle} placeholder="17"
                onChange={(v) => update((c) => ({ ...c, custom: { ...custom, ishaAngle: v } }))} />
              <NumberField label="دقائق بعد المغرب للعشاء" value={custom.ishaInterval} placeholder="—"
                onChange={(v) => update((c) => ({ ...c, custom: { ...custom, ishaInterval: v } }))} />
              <NumberField label="زاوية المغرب" value={custom.maghribAngle} placeholder="—"
                onChange={(v) => update((c) => ({ ...c, custom: { ...custom, maghribAngle: v } }))} />
            </Section>
          )}

          <Section title="المذهب في حساب العصر">
            <ToggleRow
              value={config.asrMadhab}
              options={[
                { value: 'shafi', label: ASR_LABELS.shafi },
                { value: 'hanafi', label: ASR_LABELS.hanafi },
              ]}
              onSelect={(v) => update((c) => ({ ...c, asrMadhab: v }))}
            />
          </Section>

          <Section title="تنسيق الوقت">
            <ToggleRow
              value={config.timeFormat12 ? '12' : '24'}
              options={[
                { value: '24', label: '24 ساعة' },
                { value: '12', label: '12 ساعة (ص/م)' },
              ]}
              onSelect={(v) => update((c) => ({ ...c, timeFormat12: v === '12' }))}
            />
          </Section>

          <Section title="الأماكن ذات خطوط العرض العالية">
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
          </Section>

          <Section title="تعديل دقائق الصلوات">
            <p className="set-sheet__note">اضبط كل صلاة بالدقائق (+ أو −) حسب جهات التوقيت المحلية.</p>
            <AdjustList config={config} update={update} />
          </Section>

          <Section title="مصدر الوقت">
            <p className="set-sheet__note">
              اختر مصدر الوقت: تلقائي (وقت الجهاز) أو يدوي (تحدد التاريخ والوقت كاملاً ويستمر في التقدم).
            </p>
            <div className="set-sheet__list">
              <button
                className={`set-sheet__row${(config.timeSource?.mode || 'auto') === 'auto' ? ' set-sheet__row--active' : ''}`}
                onClick={() => update((c) => ({ ...c, timeSource: { mode: 'auto', manualIso: null, manualSetAt: null } }))}
                type="button"
              >
                <span>تلقائي — وقت الجهاز</span>
                {(config.timeSource?.mode || 'auto') === 'auto' && <Icon name="check" size={16} />}
              </button>
              <button
                className={`set-sheet__row${config.timeSource?.mode === 'manual' ? ' set-sheet__row--active' : ''}`}
                onClick={() => {
                  const nowIso = new Date().toISOString()
                  update((c) => ({ ...c, timeSource: { mode: 'manual', manualIso: nowIso, manualSetAt: Date.now() } }))
                }}
                type="button"
              >
                <span>يدوي — تحديد كامل</span>
                {config.timeSource?.mode === 'manual' && <Icon name="check" size={16} />}
              </button>
            </div>
            {config.timeSource?.mode === 'manual' && (() => {
              const iso = config.timeSource?.manualIso
              const base = iso ? new Date(iso) : new Date()
              const pad = (n) => String(n).padStart(2,'0')
              const dateVal = `${base.getFullYear()}-${pad(base.getMonth()+1)}-${pad(base.getDate())}`
              const timeVal = `${pad(base.getHours())}:${pad(base.getMinutes())}`
              const onDateChange = (e) => {
                const nd = e.target.value
                if (!nd) return
                const newIso = new Date(`${nd}T${timeVal}:00`).toISOString()
                update((c) => ({ ...c, timeSource: { mode: 'manual', manualIso: newIso, manualSetAt: Date.now() } }))
              }
              const onTimeChange = (e) => {
                const nt = e.target.value
                if (!nt) return
                const newIso = new Date(`${dateVal}T${nt}:00`).toISOString()
                update((c) => ({ ...c, timeSource: { mode: 'manual', manualIso: newIso, manualSetAt: Date.now() } }))
              }
              return (
                <div className="set-sheet__time-card">
                  <div className="set-sheet__time-card__head">
                    <span className="set-sheet__time-card__icon"><Icon name="calendar" size={16} /></span>
                    <div>
                      <b>التاريخ والوقت اليدوي</b>
                      <small>قسّم الإدخال ليسهل التعديل — يستمر في التقدم</small>
                    </div>
                  </div>
                  <div className="set-sheet__time-card__grid">
                    <label>
                      <span><Icon name="calendar" size={12} /> التاريخ</span>
                      <div className="custom-date-picker small">
                        <div style={{display:'flex', flexDirection:'column', gap:'2px', flex:1}}>
                          <small style={{fontSize:'9px', color:'var(--text-muted)', textAlign:'center'}}>اليوم</small>
                          <select value={base.getDate()} onChange={(e) => {
                            const d = new Date(base); d.setDate(Number(e.target.value));
                            update((c) => ({ ...c, timeSource: { mode: 'manual', manualIso: d.toISOString(), manualSetAt: Date.now() } }))
                          }} className="custom-select small" aria-label="اليوم">
                            {Array.from({length: 31}, (_, i) => i+1).map(d => <option key={d} value={d}>{arabicDigits(d)}</option>)}
                          </select>
                        </div>
                        <div style={{display:'flex', flexDirection:'column', gap:'2px', flex:1}}>
                          <small style={{fontSize:'9px', color:'var(--text-muted)', textAlign:'center'}}>الشهر</small>
                          <select value={base.getMonth()+1} onChange={(e) => {
                            const d = new Date(base); d.setMonth(Number(e.target.value)-1);
                            update((c) => ({ ...c, timeSource: { mode: 'manual', manualIso: d.toISOString(), manualSetAt: Date.now() } }))
                          }} className="custom-select small" aria-label="الشهر">
                            {['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'].map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
                          </select>
                        </div>
                        <div style={{display:'flex', flexDirection:'column', gap:'2px', flex:1}}>
                          <small style={{fontSize:'9px', color:'var(--text-muted)', textAlign:'center'}}>السنة</small>
                          <select value={base.getFullYear()} onChange={(e) => {
                            const d = new Date(base); d.setFullYear(Number(e.target.value));
                            update((c) => ({ ...c, timeSource: { mode: 'manual', manualIso: d.toISOString(), manualSetAt: Date.now() } }))
                          }} className="custom-select small" aria-label="السنة">
                            {(() => { const cy = new Date().getFullYear(); const start = cy - 60; const end = cy + 40; return Array.from({length: end - start + 1}, (_, i) => start + i).map(y => <option key={y} value={y}>{arabicDigits(y)}</option>) })()}
                          </select>
                        </div>
                      </div>
                    </label>
                    <label>
                      <span><Icon name="clock" size={12} /> الوقت <small style={{fontWeight:400, color:'var(--text-muted)'}}>(24 ساعة)</small></span>
                      <div className="custom-time-picker small">
                        <div style={{display:'flex', flexDirection:'column', gap:'2px', flex:1}}>
                          <small style={{fontSize:'9px', color:'var(--text-muted)', textAlign:'center'}}>دقيقة</small>
                          <select value={pad(base.getMinutes())} onChange={(e) => {
                            const d = new Date(base); d.setMinutes(Number(e.target.value));
                            update((c) => ({ ...c, timeSource: { mode: 'manual', manualIso: d.toISOString(), manualSetAt: Date.now() } }))
                          }} className="custom-select small" aria-label="دقيقة">
                            {Array.from({length: 60}, (_, i) => pad(i)).map(m => <option key={m} value={m}>{arabicDigits(m)}</option>)}
                          </select>
                        </div>
                        <span style={{paddingTop:'14px'}}>:</span>
                        <div style={{display:'flex', flexDirection:'column', gap:'2px', flex:1}}>
                          <small style={{fontSize:'9px', color:'var(--text-muted)', textAlign:'center'}}>ساعة</small>
                          <select value={pad(base.getHours())} onChange={(e) => {
                            const d = new Date(base); d.setHours(Number(e.target.value));
                            update((c) => ({ ...c, timeSource: { mode: 'manual', manualIso: d.toISOString(), manualSetAt: Date.now() } }))
                          }} className="custom-select small" aria-label="ساعة (24)">
                            {Array.from({length: 24}, (_, i) => pad(i)).map(h => <option key={h} value={h}>{arabicDigits(h)}</option>)}
                          </select>
                        </div>
                      </div>
                    </label>
                  </div>
                  <p className="set-sheet__time-card__hint">
                    الوقت الفعّال الآن (كل التطبيق حتى الخلفية): <b dir="ltr">{new Date(getNowMs()).toLocaleString('ar-EG')}</b>
                  </p>
                  <p className="set-sheet__note" style={{marginTop:'6px', color:'#b45309', background:'#fffbeb', padding:'6px 8px', borderRadius:'8px'}}>
                    تنبيه: الوضع اليدوي يطبق على كل التطبيق — الواجهة والمنبهات في الخلفية. تذكر إعادته لتلقائي بعد الاختبار.
                  </p>
                  <button className="set-sheet__test" onClick={() => { clearAllFiredToday(); refreshWatch().then(refreshStatus) }} type="button" style={{marginTop:'6px', width:'100%'}}>
                    إعادة تعيين سجل اليوم للاختبار
                  </button>
                </div>
              )
            })()}
          </Section>

          <Section title="صوت الأذان">
            <div className="set-sheet__list">
              {ADHAN_VOICES.map((v) => (
                <button
                  key={v.file}
                  className={`set-sheet__row${config.adhanSound === v.file ? ' set-sheet__row--active' : ''}`}
                  onClick={() => update((c) => ({ ...c, adhanSound: v.file }))}
                  type="button"
                >
                  <span>{v.label}</span>
                  {config.adhanSound === v.file && <Icon name="check" size={16} />}
                </button>
              ))}
              {hasCustom && (
                <button
                  className={`set-sheet__row${config.adhanSound === CUSTOM_ADHAN ? ' set-sheet__row--active' : ''}`}
                  onClick={() => update((c) => ({ ...c, adhanSound: CUSTOM_ADHAN }))}
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
              <button
                className="set-sheet__test"
                onClick={() => playAzan()}
                type="button"
              >
                تجربة الصوت
              </button>
              <button
                className="set-sheet__test"
                onClick={() => fileRef.current?.click()}
                type="button"
              >
                {hasCustom ? 'استبدال الصوت المخصص' : 'إضافة صوت من جهازك'}
              </button>
            </div>
          </Section>

          <Section title="تفعيل الأذان والتنبيهات">
            <button className="set-sheet__ntoggle" onClick={toggleAdhan} type="button">
              <span className="set-sheet__ntoggle-label">
                {config.adhanEnabled ? 'مفعّل — يرنّ الأذان حتى مع إغلاق التطبيق' : 'متوقف'}
              </span>
              <span className={`set-sheet__switch${config.adhanEnabled ? ' set-sheet__switch--on' : ''}`} aria-hidden="true">
                <i />
              </span>
            </button>
            <p className="set-sheet__note">
              عند وقت الصلاة يظهر إشعار بسيط (بدون أزرار) وتفتح نافذة الأذان داخل التطبيق
              لعرض الصلاة الحالية والتالية — إيقاف الأذان يتم من داخل النافذة فقط.
            </p>
            <div className="set-sheet__row-buttons">
              <button className="set-sheet__test" onClick={handleTest} type="button">
                جرّب الآن (رنين بعد ثوانٍ)
              </button>
            </div>
            {testMsg && <p className="set-sheet__note">{testMsg}</p>}
          </Section>

          <Section title="حجم صوت الأذان">
            <div className="set-sheet__volume">
              <input
                className="adhan-modal__volume-slider"
                type="range"
                min="0"
                max="100"
                step="1"
                value={volumePercent}
                onChange={changeAdhanVolume}
                aria-label="مستوى صوت الأذان"
              />
              <span className="set-sheet__volume-value" dir="ltr">
                {volumePercent}%
              </span>
            </div>
            <p className="set-sheet__note">
              يحدّد مستوى رنين الأذان. عند تعطيل «احترام وضع الصوت» يرنّ الأذان بهذا المستوى حتى لو
              كان الهاتف صامتًا، ويعود مستوى منبّه الهاتف لأصله بعد الانتهاء. أثناء الرنين يمكن تعديله
              من نافذة الأذان أو بأزرار الصوت مباشرة.
            </p>
          </Section>

          <Section title="احترام وضع الصوت">
            <button
              className="set-sheet__ntoggle"
              onClick={() => update((c) => ({ ...c, respectSoundMode: !c.respectSoundMode }))}
              type="button"
            >
              <span className="set-sheet__ntoggle-label">
                {config.respectSoundMode ? 'مفعّل — الصامت/الاهتزاز بلا صوت' : 'متوقف — يرنّ دائمًا كمنبّه'}
              </span>
              <span className={`set-sheet__switch${config.respectSoundMode ? ' set-sheet__switch--on' : ''}`} aria-hidden="true">
                <i />
              </span>
            </button>
            <p className="set-sheet__note">
              عند التفعيل، إذا كان الهاتف صامتًا أو في وضع الاهتزاز أو مستوى صوت المنبّه صفر، يُكتفى
              بالاهتزاز والإشعار — لا يصدر الصوت. عند التعطيل يرنّ الأذان دائمًا بغضّ النظر عن وضع الصوت.
            </p>
            {audio && (
              <p className="set-sheet__note">
                الحالة الآن:{' '}
                {audio.ringerMode === 'silent'
                  ? 'صامت'
                  : audio.ringerMode === 'vibrate'
                    ? 'اهتزاز'
                    : `صوت عادي (منبّه ${arabicDigits(audio.alarmVolume || 0)}/${arabicDigits(audio.alarmMax || 0)})`}
              </p>
            )}
          </Section>

          <Section title="الصلاحيات للعمل في الخلفية">
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
            <p className="set-sheet__note">
              على أجهزة Xiaomi/MIUI افتح أيضًا: الإعدادات ← التطبيقات ← التطبيق ← «التحكم في البطارية» =
              لا قيود، وفعّل «التشغيل التلقائي عند بدء التشغيل» حتى تعود المنبّهات بعد إغلاق التطبيق.
            </p>
            {nativeOk === false && (
              <p className="set-sheet__note">الإضافة غير متوفرة — الأذان يظهر داخل التطبيق فقط.</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

function PermissionRow({ title, desc, hint, onOpen }) {
  return (
    <div className="set-sheet__perm">
      <div className="set-sheet__perm-text">
        <b>{title}</b>
        {desc && <span>{desc}</span>}
        {hint && <em>{hint}</em>}
      </div>
      <button className="set-sheet__perm-btn" onClick={onOpen} type="button">
        فتح الإعدادات
      </button>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="set-sheet__section">
      <h4 className="set-sheet__section-title">{title}</h4>
      {children}
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

function ToggleRow({ value, options, onSelect }) {
  return (
    <div className="set-sheet__toggle-row">
      {options.map((o) => (
        <button
          key={o.value}
          className={`set-sheet__toggle${value === o.value ? ' set-sheet__toggle--active' : ''}`}
          onClick={() => onSelect(o.value)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function AdjustList({ config, update }) {
  const labels = getPrayerLabels()
  return (
    <div className="set-sheet__adjust">
      {PRAYERS.map((k) => (
        <div className="set-sheet__adjust-row" key={k}>
          <span>{labels[k]}</span>
          <div className="set-sheet__stepper">
            <button
              onClick={() => update((c) => ({ ...c, adjustments: { ...c.adjustments, [k]: Math.max(-30, (c.adjustments[k] || 0) - 1) } }))}
              type="button"
              aria-label={`نقص دقيقة من ${labels[k]}`}
            >
              −
            </button>
            <b>{arabicDigits(config.adjustments[k] || 0)}</b>
            <button
              onClick={() => update((c) => ({ ...c, adjustments: { ...c.adjustments, [k]: Math.min(30, (c.adjustments[k] || 0) + 1) } }))}
              type="button"
              aria-label={`إضافة دقيقة إلى ${labels[k]}`}
            >
              +
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}