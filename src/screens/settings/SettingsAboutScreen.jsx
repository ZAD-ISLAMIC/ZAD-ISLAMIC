import React from 'react'
import { APP_NAME, APP_VERSION } from '../../constants/app.mjs'
import { Icon } from '../../components/ui/Icon.jsx'
import { SettingsGroup } from '../../components/settings/SettingsGroup.jsx'
import { SettingsRow } from '../../components/settings/SettingsRow.jsx'
import '../../styles/settings.css'

export default function SettingsAboutScreen() {
  return (
    <section className="screen settings-page">
      <div className="settings-about">
        <span className="settings-about__logo">
          <Icon name="book" size={30} />
        </span>
        <h2 className="settings-about__name">{APP_NAME}</h2>
        <p className="settings-about__version">الإصدار {APP_VERSION}</p>
        <p className="settings-about__desc">
          تطبيق إسلامي شامل يجمع القرآن الكريم، التفسير الميسر، الأذكار، حصن المسلم، مواقيت الصلاة والأذان،
          المسبحة الإلكترونية، أسئلة وفتاوى وخطب — كل ما يحتاجه المسلم في يومه بمكان واحد.
        </p>
      </div>

      <SettingsGroup title="المحتوى والمصادر">
        <SettingsRow
          icon={<Icon name="book" size={20} />}
          label="القرآن الكريم"
          description="مصحف كامل مع تلاوات لأشهر القرّاء"
        />
        <SettingsRow
          icon={<Icon name="book-open" size={20} />}
          label="التفسير الميسر"
          description="تفسير كتاب الله بأسلوب سهل قريب"
        />
        <SettingsRow
          icon={<Icon name="beads" size={20} />}
          label="الأذكار وحصن المسلم"
          description="أذكار النبي ﷺ مكتوبة ومسموعة"
        />
        <SettingsRow
          icon={<Icon name="feather" size={20} />}
          label="فتاوى ابن باز"
          description="فتاوى الشيخ عبد العزيز بن باز رحمه الله"
        />
        <SettingsRow
          icon={<Icon name="minbar" size={20} />}
          label="الخطب"
          description="خطب منبرية من موقع ملتقى الخطباء"
        />
        <SettingsRow
          icon={<Icon name="scroll" size={20} />}
          label="الموسوعة التاريخية"
          description="أحداث مرتبطة بالإسلام والمسلمين من مصادر موثوقة"
        />
      </SettingsGroup>

      <SettingsGroup title="مشاركة">
        <SettingsRow
          icon={<Icon name="share" size={20} />}
          label="شارك التطبيق"
          description="انشر التقوى لتعمّ الفائدة"
          onClick={() => {
            try {
              const text = `تطبيق ${APP_NAME} (الإصدار ${APP_VERSION}) — تطبيقك الشامل للعبادات والقرآن الكريم`
              if (navigator.share) {
                navigator.share({ title: APP_NAME, text }).catch(() => {})
              }
            } catch {
              /* ignore */
            }
          }}
        />
      </SettingsGroup>

      <p className="settings-note">
        جميع البيانات تُخزّن محليًا على جهازك، والمحتوى الصوتي للقراءات والفُتيا والخطب يُحمَّل عند الطلب
        دون الحاجة إلى إنترنت بعد التنزيل.
      </p>
    </section>
  )
}
