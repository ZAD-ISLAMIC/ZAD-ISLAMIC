/**
 * ملاحظات العدّ (الصوت والاهتزاز) للأذكار وحصن المسلم.
 *
 * إعدادان مشتركان يطبّقان على شاشات العدّ في «الأذكار» و«حصن المسلم»:
 *   - zikr:sound      → نغمة التيك/التم عند كل ذكر
 *   - zikr:vibration  → اهتزاز خفيف عند كل ذكر
 *
 * يستطيع المستخدم كتم الصوت وحده، أو الاهتزاز وحده، أو الاثنين معًا —
 * عبر زر سريع داخل شاشة العدّ أو من صفحة الإعدادات.
 */

import { storage } from './storage.mjs'

const SOUND_KEY = 'zikr:sound'
const VIBRATION_KEY = 'zikr:vibration'

export function isSoundEnabled() {
  return storage.get(SOUND_KEY, true) !== false
}

export function setSoundEnabled(enabled) {
  storage.set(SOUND_KEY, !!enabled)
}

export function isVibrationEnabled() {
  return storage.get(VIBRATION_KEY, true) !== false
}

export function setVibrationEnabled(enabled) {
  storage.set(VIBRATION_KEY, !!enabled)
}
