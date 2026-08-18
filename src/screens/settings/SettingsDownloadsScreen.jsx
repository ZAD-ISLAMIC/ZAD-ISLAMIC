import React, { useCallback, useEffect, useState } from 'react'
import {
  getStorageStats,
  resetDownloadSection,
  formatBytes,
} from '../../services/settingsStorage.mjs'
import { Icon } from '../../components/ui/Icon.jsx'
import { SettingsGroup } from '../../components/settings/SettingsGroup.jsx'
import { SettingsHero } from '../../components/settings/SettingsHero.jsx'
import { SettingsConfirm } from '../../components/settings/SettingsConfirm.jsx'
import { arabicDigits } from '../../utils/arabic.mjs'
import '../../styles/settings.css'

export default function SettingsDownloadsScreen() {
  const [stats, setStats] = useState(() => getStorageStats())
  const [target, setTarget] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const refresh = useCallback(() => setStats(getStorageStats()), [])

  useEffect(() => refresh(), [refresh])

  const totalBytes = stats.reduce((sum, s) => sum + (s.bytes || 0), 0)

  const remove = async (section) => {
    setBusyId(section.id)
    try {
      await resetDownloadSection(section.id)
    } finally {
      setBusyId(null)
      setTarget(null)
      refresh()
    }
  }

  return (
    <section className="screen settings-page">
      <SettingsHero
        icon={<Icon name="download" size={24} />}
        title="التخزين المستخدم"
        sub="المحتوى المحمّل على جهازك"
        value={formatBytes(totalBytes)}
      />

      <SettingsGroup title="الأقسام المحمّلة">
        {stats.map((s) => {
          const empty = (s.count || 0) === 0
          return (
            <div className="settings-dl-row" key={s.id}>
              <span className="settings-dl-row__icon">
                <Icon name={s.icon} size={20} />
              </span>
              <span className="settings-dl-row__text">
                <span className="settings-dl-row__label">{s.label}</span>
                <span className="settings-dl-row__meta">
                  {empty
                    ? 'لا يوجد محتوى محمّل'
                    : `${arabicDigits(s.count)} ${s.countLabel}${s.reciters ? ` — ${arabicDigits(s.reciters)} قرّاء` : ''}`}
                </span>
              </span>
              {!empty && <span className="settings-dl-row__size">{formatBytes(s.bytes)}</span>}
              {empty ? (
                <Icon name="check" size={18} className="settings-dl-row__check" />
              ) : (
                <button
                  className="settings-dl-del"
                  aria-label={`حذف ${s.label}`}
                  disabled={busyId === s.id}
                  onClick={() => setTarget(s)}
                  type="button"
                >
                  {busyId === s.id ? <Icon name="refresh" size={17} /> : <Icon name="trash" size={17} />}
                </button>
              )}
            </div>
          )
        })}
      </SettingsGroup>

      <p className="settings-note settings-note--flush">
        حذف المحتوى المحمّل يحرّر مساحة الجهاز فقط، ولا يؤثر على المحتوى عبر الإنترنت — يمكنك إعادة تحميله
        في أي وقت.
      </p>

      {target && (
        <SettingsConfirm
          title={`حذف ${target.label}؟`}
          message={`سيتم حذف ${arabicDigits(target.count)} ${target.countLabel} (${formatBytes(target.bytes)}) من الجهاز نهائيًا.`}
          confirmLabel="حذف"
          onConfirm={() => remove(target)}
          onClose={() => setTarget(null)}
        />
      )}
    </section>
  )
}