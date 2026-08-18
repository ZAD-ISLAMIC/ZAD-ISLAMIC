import React, { useMemo, useState } from 'react'
import { useLocalStorage } from '../../hooks/useLocalStorage.mjs'
import { storage } from '../../services/storage.mjs'
import { SURAH_META } from '../../services/surahsMeta.mjs'
import { arabicDigits } from '../../utils/arabic.mjs'
import { SettingsGroup } from '../../components/settings/SettingsGroup.jsx'
import { SettingsStepper } from '../../components/settings/SettingsStepper.jsx'
import { SettingsRow } from '../../components/settings/SettingsRow.jsx'
import { SettingsConfirm } from '../../components/settings/SettingsConfirm.jsx'
import { Icon } from '../../components/ui/Icon.jsx'
import '../../styles/settings.css'

const QURAN_MIN = 18
const QURAN_MAX = 40
const QURAN_STEP = 2
const TAFSEER_MIN = 16
const TAFSEER_MAX = 38
const TAFSEER_STEP = 2

const QURAN_PREVIEW = 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ'
const TAFSEER_PREVIEW = 'قوله تعالى: (الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ) الحمدُ هو الثناءُ على الله بجميل صفاته.'

export default function SettingsReadingScreen() {
  const [quranSize, setQuranSize] = useLocalStorage('quran.fontSize', 26)
  const [tafseerSize, setTafseerSize] = useLocalStorage('tafseer.fontSize', 16)
  const [reading, setReading] = useState(() => storage.get('quran.reading', null))
  const [confirm, setConfirm] = useState(false)

  const continuation = useMemo(() => {
    if (!reading || typeof reading.surah !== 'number') return null
    const meta = SURAH_META[reading.surah]
    return meta ? `سورة ${meta.name} — الآية ${arabicDigits(reading.verse || 1)}` : null
  }, [reading])

  return (
    <section className="screen settings-page">
      <SettingsGroup title="حجم خط المصحف">
        <div className="settings-preview">
          <span className="settings-preview__label">معاينة</span>
          <span className="settings-preview__text settings-preview__text--quran" style={{ fontSize: `${quranSize}px` }}>
            {QURAN_PREVIEW}
          </span>
        </div>
        <SettingsStepper
          icon={<Icon name="book-open" size={20} />}
          label="حجم خط المصحف"
          description={`من ${QURAN_MIN} إلى ${QURAN_MAX}`}
          value={quranSize}
          min={QURAN_MIN}
          max={QURAN_MAX}
          step={QURAN_STEP}
          onChange={setQuranSize}
        />
      </SettingsGroup>

      <SettingsGroup title="حجم خط التفسير">
        <div className="settings-preview">
          <span className="settings-preview__label">معاينة</span>
          <span className="settings-preview__text settings-preview__text--tafseer" style={{ fontSize: `${tafseerSize}px` }}>
            {TAFSEER_PREVIEW}
          </span>
        </div>
        <SettingsStepper
          icon={<Icon name="feather" size={20} />}
          label="حجم خط التفسير"
          description={`من ${TAFSEER_MIN} إلى ${TAFSEER_MAX}`}
          value={tafseerSize}
          min={TAFSEER_MIN}
          max={TAFSEER_MAX}
          step={TAFSEER_STEP}
          onChange={setTafseerSize}
        />
      </SettingsGroup>

      <SettingsGroup title="الاستمرار في القراءة">
        <SettingsRow
          icon={<Icon name="bookmark" size={20} />}
          label="آخر موضع قراءة"
          description={continuation ? 'عند فتح المصحف يستكمل من هذا الموضع' : 'لا يوجد موضع محفوظ بعد'}
          value={continuation}
        />
        {continuation && (
          <div style={{ padding: '12px 14px', borderTop: '1px solid color-mix(in srgb, var(--border) 55%, transparent)' }}>
            <button className="settings-action settings-action--danger" onClick={() => setConfirm(true)} type="button">
              <Icon name="trash" size={16} />
              مسح موضع القراءة
            </button>
          </div>
        )}
      </SettingsGroup>

      {confirm && (
        <SettingsConfirm
          title="مسح موضع القراءة؟"
          message="سيبدأ المصحف من أول سورة في المرة القادمة."
          confirmLabel="مسح"
          onConfirm={() => {
            storage.remove('quran.reading')
            setReading(null)
          }}
          onClose={() => setConfirm(false)}
        />
      )}
    </section>
  )
}
