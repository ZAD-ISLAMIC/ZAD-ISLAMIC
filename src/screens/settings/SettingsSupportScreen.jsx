import React, { useState } from 'react'
import { APP_NAME } from '../../constants/app.mjs'
import { Icon } from '../../components/ui/Icon.jsx'
import { SettingsGroup } from '../../components/settings/SettingsGroup.jsx'
import { SettingsRow } from '../../components/settings/SettingsRow.jsx'
import '../../styles/settings.css'

const IBAN = 'SA5980000201608016047562'
const SWIFT = 'RJHISARI'
const ACCOUNT_NAME = 'ريان المالكي'
const EMAIL = 'rn0x.me@gmail.com'

function CopyButton({ text, label = 'نسخ' }) {
  const [copied, setCopied] = useState(false)

  const copy = async (e) => {
    e.stopPropagation()
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
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
      <div className="settings-donate">
        <span className="settings-donate__title">صدقة جارية</span>
        <p className="settings-donate__text">
          تطبيق {APP_NAME} صدقة جارية لكل مسلم ساهم أو دعم أو نشر هذا التطبيق. الدعم ليس إجباريًا — الدعاء
          لنا بالتوفيق يكفي، ولكن إذا أردت دعمنا ماديًا يمكنك التبرع عبر التحويل البنكي.
        </p>
        <span className="settings-donate__bless">جزى الله كل من ساهم أو دعا أو نشر خيرًا.</span>
      </div>

      <SettingsGroup title="التحويل البنكي — مصرف الراجحي">
        <div className="settings-bank">
          <div className="settings-bank__head">
            <Icon name="feather" size={20} />
            <b>حساب التبرعات</b>
          </div>
          <div className="settings-bank__row">
            <span>اسم المستفيد</span>
            <b>{ACCOUNT_NAME}</b>
            <CopyButton text={ACCOUNT_NAME} label="نسخ الاسم" />
          </div>
          <div className="settings-bank__row">
            <span>رقم الآيبان (IBAN)</span>
            <b>{IBAN}</b>
            <CopyButton text={IBAN} label="نسخ الآيبان" />
          </div>
          <div className="settings-bank__row">
            <span>رمز السويفت (SWIFT)</span>
            <b>{SWIFT}</b>
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
        <SettingsRow
          icon={<Icon name="share" size={20} />}
          label="شارك التطبيق"
          description="شارك التقوى مع أحبابك لتعمّ الفائدة"
          onClick={() => {
            try {
              const text = `تطبيق ${APP_NAME} — تطبيقك الشامل للعبادات والقرآن الكريم`
              if (navigator.share) {
                navigator.share({ title: APP_NAME, text }).catch(() => {})
              }
            } catch {
              /* ignore */
            }
          }}
        />
      </SettingsGroup>
    </section>
  )
}
