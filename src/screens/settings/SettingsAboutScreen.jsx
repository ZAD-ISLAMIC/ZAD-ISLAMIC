import React, { useState } from 'react'
import { APP_NAME, APP_VERSION, PLAY_STORE_URL, GITHUB_REPO_URL } from '../../constants/app.mjs'
import { APP_SOURCES } from '../../constants/sources.mjs'
import { openExternal, shareApp, copyText } from '../../services/device.mjs'
import { Icon } from '../../components/ui/Icon.jsx'
import { SettingsGroup } from '../../components/settings/SettingsGroup.jsx'
import { SettingsRow } from '../../components/settings/SettingsRow.jsx'
import appIcon from '../../resources/icons/256x256.png'
import '../../styles/settings.css'

const SHARE_TEXT = `تطبيق ${APP_NAME} (الإصدار ${APP_VERSION})

تطبيق إسلامي شامل يجمع القرآن الكريم مع التفسير الميسر، الأذكار وحصن المسلم، مواقيت الصلاة مع الأذان، المسبحة الإلكترونية، الأسئلة والفتاوى والخطب.

مجاني للأبد، بدون إعلانات، ومفتوح المصدر بالكامل.

تحميل من متجر Google Play:
${PLAY_STORE_URL}

المستودع على GitHub:
${GITHUB_REPO_URL}`

export default function SettingsAboutScreen() {
  const [copied, setCopied] = useState(false)

  const handleShare = () => {
    const opened = shareApp({ text: SHARE_TEXT })
    if (!opened) {
      copyText(SHARE_TEXT).then((ok) => {
        if (ok) {
          setCopied(true)
          setTimeout(() => setCopied(false), 2500)
        }
      })
    }
  }

  return (
    <section className="screen settings-page">
      <div className="settings-about">
        <span className="settings-about__logo">
          <img src={appIcon} alt={`شعار ${APP_NAME}`} className="settings-about__appicon" />
        </span>
        <h2 className="settings-about__name">{APP_NAME}</h2>
        <p className="settings-about__version">الإصدار {APP_VERSION}</p>
        <div className="settings-about__chips">
          <span className="settings-about__chip">
            <Icon name="check" size={13} />
            مجاني للأبد
          </span>
          <span className="settings-about__chip">
            <Icon name="lock" size={13} />
            بدون إعلانات
          </span>
          <span className="settings-about__chip">
            <Icon name="github" size={13} />
            مفتوح المصدر
          </span>
        </div>
        <p className="settings-about__desc">
          تطبيق إسلامي شامل يجمع القرآن الكريم، التفسير الميسر، الأذكار، حصن المسلم، مواقيت الصلاة والأذان،
          المسبحة الإلكترونية، أسئلة وفتاوى وخطب — كل ما يحتاجه المسلم في يومه بمكان واحد. تطبيق مفتوح المصدر
          مجاني للأبد وبدون أي إعلانات.
        </p>
      </div>

      <SettingsGroup title="المصادر">
        {APP_SOURCES.map((s) => (
          <div
            key={s.id}
            className="settings-row settings-row--clickable"
            role="button"
            tabIndex={0}
            onClick={() => openExternal(s.url)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openExternal(s.url)
              }
            }}
          >
            <span className="settings-row__icon" aria-hidden="true">
              <Icon name={s.icon} size={20} />
            </span>
            <span className="settings-row__text">
              <span className="settings-row__label">{s.name}</span>
              <span className="settings-row__desc">{s.description}</span>
            </span>
            <span className="settings-source__actions">
              {s.github && (
                <button
                  className="settings-source__github"
                  aria-label={`بيانات ${s.name} على GitHub`}
                  onClick={(e) => {
                    e.stopPropagation()
                    openExternal(s.github)
                  }}
                  type="button"
                >
                  <Icon name="github" size={15} />
                </button>
              )}
              <Icon name="external" size={15} className="settings-row__chevron" />
            </span>
          </div>
        ))}
      </SettingsGroup>

      <SettingsGroup title="ادعم التقوى">
        <SettingsRow
          icon={<Icon name="star-fill" size={20} />}
          label="قيّم التطبيق على المتجر"
          description="تقييمك يساعد الآخرين على اكتشاف التطبيق"
          onClick={() => openExternal(PLAY_STORE_URL)}
          trailing={<Icon name="arrow-left" size={16} className="settings-row__chevron" />}
        />
        <SettingsRow
          icon={<Icon name="github" size={20} />}
          label="أعطِ نجمة على GitHub"
          description="نجمة للمشروع مفتوح المصدر تعني الكثير"
          onClick={() => openExternal(GITHUB_REPO_URL)}
          trailing={<Icon name="star" size={16} className="settings-row__chevron" />}
        />
        <SettingsRow
          icon={<Icon name="share" size={20} />}
          label="شارك التطبيق"
          description={copied ? 'تم نسخ نص المشاركة — شاركه يدويًا' : 'انشر التقوى لتعمّ الفائدة'}
          onClick={handleShare}
          trailing={<Icon name="arrow-left" size={16} className="settings-row__chevron" />}
        />
      </SettingsGroup>

      <p className="settings-note settings-note--flush">
        جميع البيانات تُخزّن محليًا على جهازك، والمحتوى الصوتي للقراءات والفُتيا والخطب يُحمَّل عند الطلب
        دون الحاجة إلى إنترنت بعد التنزيل.
      </p>
    </section>
  )
}