import React, { useState } from 'react'
import { APP_NAME } from '../../constants/app.mjs'
import { copyText } from '../../services/device.mjs'
import { Icon } from '../../components/ui/Icon.jsx'
import { SettingsGroup } from '../../components/settings/SettingsGroup.jsx'
import { SettingsRow } from '../../components/settings/SettingsRow.jsx'
import { SettingsHero } from '../../components/settings/SettingsHero.jsx'
import '../../styles/settings.css'

const IBAN = 'SA5980000201608016047562'
const SWIFT = 'RJHISARI'
const ACCOUNT_NAME = 'ريان المالكي'
const EMAIL = 'rn0x.me@gmail.com'

function CopyButton({ text, label = 'نسخ' }) {
  const [copied, setCopied] = useState(false)

  const copy = async (e) => {
    e.stopPropagation()
    const ok = await copyText(text)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      className={`settings-copy${copied ? ' settings-copy--ok' : ''}`}
      onClick={copy}
      aria-label={copied ? 'تم النسخ' : label}
      type="button"
    >
      <Icon name={copied ? 'check' : 'copy'} size={15} />
    </button>
  )
}

export default function SettingsSupportScreen() {
  const openMail = () => {
    const href = `mailto:${EMAIL}?subject=${encodeURIComponent(`دعم تطبيق ${APP_NAME}`)}`
    try {
      window.location.href = href
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="screen settings-page">
      <SettingsHero
        variant="gold"
        icon={<Icon name="star" size={24} />}
        title="صدقة جارية"
        sub="ساهم في نشر الخير"
        text={`تطبيق ${APP_NAME} صدقة جارية لكل مسلم ساهم أو دعم أو نشر هذا التطبيق. الدعم ليس إجباريًا — الدعاء لنا بالتوفيق يكفي، ولكن إذا أردت دعمنا ماديًا يمكنك التبرع عبر التحويل البنكي.`}
        bless="جزى الله كل من ساهم أو دعا أو نشر خيرًا."
      />

      <SettingsGroup title="التحويل البنكي — مصرف الراجحي">
        <div className="settings-bank">
          <div className="settings-bank__head">
            <span className="settings-bank__icon">
              <Icon name="feather" size={20} />
            </span>
            <span className="settings-bank__title">حساب التبرعات</span>
          </div>
          <div className="settings-bank__row">
            <span className="settings-bank__label">اسم المستفيد</span>
            <span className="settings-bank__value">{ACCOUNT_NAME}</span>
            <CopyButton text={ACCOUNT_NAME} label="نسخ الاسم" />
          </div>
          <div className="settings-bank__row">
            <span className="settings-bank__label">الآيبان IBAN</span>
            <span className="settings-bank__value">{IBAN}</span>
            <CopyButton text={IBAN} label="نسخ الآيبان" />
          </div>
          <div className="settings-bank__row">
            <span className="settings-bank__label">السويفت SWIFT</span>
            <span className="settings-bank__value">{SWIFT}</span>
            <CopyButton text={SWIFT} label="نسخ السويفت" />
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup title="التواصل">
        <SettingsRow
          icon={<Icon name="external" size={20} />}
          label="البريد الإلكتروني"
          description="للملاحظات والاقتراحات والدعم"
          value={EMAIL}
          onClick={openMail}
        />
      </SettingsGroup>
    </section>
  )
}