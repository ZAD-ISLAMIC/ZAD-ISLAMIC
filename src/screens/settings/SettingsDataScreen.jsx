import React, { useState } from 'react'
import { resetAllProgress } from '../../services/quiz.mjs'
import { storage } from '../../services/storage.mjs'
import { Icon } from '../../components/ui/Icon.jsx'
import { SettingsGroup } from '../../components/settings/SettingsGroup.jsx'
import { SettingsRow } from '../../components/settings/SettingsRow.jsx'
import { SettingsConfirm } from '../../components/settings/SettingsConfirm.jsx'
import '../../styles/settings.css'

export default function SettingsDataScreen() {
  const [confirm, setConfirm] = useState(null)

  const progress = [
    {
      id: 'quiz',
      icon: 'trophy',
      title: 'تصفير تقدم الأسئلة',
      description: 'إعادة ضبط النجوم والإنجازات وفتح المستويات في قسم الأسئلة',
      run: () => resetAllProgress(),
      message: 'سيتم مسح كل تقدمك في قسم الأسئلة (النجوم والمستويات والإنجازات). لا يمكن التراجع.',
    },
    {
      id: 'reading',
      icon: 'bookmark',
      title: 'مسح موضع القراءة',
      description: 'إعادة المصحف من أول سورة',
      run: () => storage.remove('quran.reading'),
      message: 'سيبدأ المصحف من أول سورة في المرة القادمة.',
    },
  ]

  const stats = [
    {
      id: 'adhkar',
      icon: 'beads',
      title: 'تصفير إحصائيات الأذكار',
      description: 'مسح عدّادات إكمال الأذكار اليومية',
      run: () => storage.remove('adhkar.stats'),
      message: 'سيتم مسح عدّادات إكمال الأذكار اليومية. لا يمكن التراجع.',
    },
  ]

  const danger = {
    id: 'all',
    icon: 'trash',
    title: 'مسح كل بيانات التطبيق',
    description: 'حذف كل الإعدادات والتقدم والبيانات المحفوظة',
    run: () => storage.clear(),
    message: 'سيتم حذف كل بيانات التطبيق من هذا الجهاز: الإعدادات، التقدم، مواضع القراءة، وأرقام المسبحة.',
  }

  return (
    <section className="screen settings-page">
      <SettingsGroup title="تقدمك في التطبيق">
        {progress.map((a) => (
          <SettingsRow
            key={a.id}
            icon={<Icon name={a.icon} size={20} />}
            label={a.title}
            description={a.description}
            onClick={() => setConfirm(a)}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup title="الإحصاءات">
        {stats.map((a) => (
          <SettingsRow
            key={a.id}
            icon={<Icon name={a.icon} size={20} />}
            label={a.title}
            description={a.description}
            onClick={() => setConfirm(a)}
          />
        ))}
        <p className="settings-note" style={{ margin: '12px 14px' }}>
          بعض الأقسام (مثل حصن المسلم) لا تحفظ إحصائيات على جهازك — أذكارها تُعاد يوميًا دون تخزين.
        </p>
      </SettingsGroup>

      <SettingsGroup title="إدارة البيانات">
        <SettingsRow
          key={danger.id}
          icon={<Icon name={danger.icon} size={20} />}
          label={danger.title}
          description={danger.description}
          danger
          onClick={() => setConfirm(danger)}
        />
      </SettingsGroup>

      <p className="settings-note settings-note--danger settings-note--flush">
        جميع البيانات محفوظة محليًا على جهازك فقط، ولا تُرسل إلى أي خادم. هذه الإجراءات لا يمكن التراجع عنها.
      </p>

      {confirm && (
        <SettingsConfirm
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.id === 'all' ? 'مسح الكل' : 'تنفيذ'}
          onConfirm={() => confirm.run()}
          onClose={() => setConfirm(null)}
        />
      )}
    </section>
  )
}