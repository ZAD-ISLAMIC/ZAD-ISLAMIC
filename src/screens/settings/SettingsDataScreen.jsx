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

  const actions = [
    {
      id: 'quiz',
      title: 'تصفير تقدم الأسئلة',
      description: 'إعادة ضبط النجوم والإنجازات وفتح المستويات في قسم الأسئلة',
      run: () => resetAllProgress(),
      message: 'سيتم مسح كل تقدمك في قسم الأسئلة (النجوم والمستويات والإنجازات). لا يمكن التراجع.',
    },
    {
      id: 'hisn',
      title: 'تصفير إحصائيات حصن المسلم',
      description: 'مسح سجل إكمال أذكار حصن المسلم',
      run: () => storage.remove('hisn.progress'),
      message: 'سيتم مسح سجل إكمال أذكار حصن المسلم من الجهاز. لا يمكن التراجع.',
    },
    {
      id: 'adhkar',
      title: 'تصفير إحصائيات الأذكار',
      description: 'مسح عدّادات إكمال الأذكار اليومية',
      run: () => storage.remove('adhkar.stats'),
      message: 'سيتم مسح عدّادات إكمال الأذكار اليومية. لا يمكن التراجع.',
    },
    {
      id: 'reading',
      title: 'مسح موضع القراءة',
      description: 'إعادة المصحف من أول سورة',
      run: () => storage.remove('quran.reading'),
      message: 'سيبدأ المصحف من أول سورة في المرة القادمة.',
    },
    {
      id: 'all',
      title: 'مسح كل بيانات التطبيق',
      description: 'حذف كل الإعدادات والتقدم والبيانات المحفوظة',
      run: () => storage.clear(),
      message: 'سيتم حذف كل بيانات التطبيق من هذا الجهاز: الإعدادات، التقدم، مواضع القراءة، وأرقام المسبحة.',
      danger: true,
    },
  ]

  return (
    <section className="screen settings-page">
      <SettingsGroup title="إعادة تعيين">
        {actions.map((a) => (
          <SettingsRow
            key={a.id}
            icon={<Icon name="trash" size={20} />}
            label={a.title}
            description={a.description}
            danger={a.danger}
            onClick={() => setConfirm(a)}
            trailing={<span className="settings-mini-btn">تنفيذ</span>}
          />
        ))}
      </SettingsGroup>

      <p className="settings-note settings-note--danger">
        جميع البيانات محفوظة محليًا على جهازك فقط، ولا تُرسل إلى أي خادم. هذه الإجراءات لا يمكن التراجع عنها.
      </p>

      {confirm && (
        <SettingsConfirm
          title={confirm.title}
          message={confirm.message}
          confirmLabel="مسح"
          onConfirm={() => confirm.run()}
          onClose={() => setConfirm(null)}
        />
      )}
    </section>
  )
}
