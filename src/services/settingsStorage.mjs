/**
 * Settings hub — storage & downloads management.
 *
 * Aggregates download statistics from the two registry families:
 *   - reciter surahs  → keys `reciters.reg.<id>` (per-reciter)
 *   - generic files   → keys `hisn.files.<ns>` (hisn / fatwa / khutbah)
 *
 * All sections expose `bytes` + `count` so the downloads screen can render
 * live totals, and `reset()` deletes every artifact + resets the registry.
 */

import { storage } from './storage.mjs'
import {
  getFileRegistry,
  removeFileBy,
  resetFileRegistry,
  getRegistry,
  removeAudio,
  resetRegistry,
} from './reciterStorage.mjs'

const REGISTRY_PREFIX = 'reciters.reg.'

export const DOWNLOAD_SECTIONS = [
  {
    id: 'reciters',
    label: 'القرآن الكريم (القرّاء)',
    icon: 'book',
    countLabel: 'سورة',
    kind: 'reciters',
  },
  {
    id: 'hisn',
    label: 'حصن المسلم',
    icon: 'shield',
    countLabel: 'ملف',
    kind: 'files',
    ns: 'hisn',
  },
  {
    id: 'fatwa',
    label: 'فتاوى ابن باز',
    icon: 'feather',
    countLabel: 'ملف',
    kind: 'files',
    ns: 'fatwa',
  },
  {
    id: 'khutbah',
    label: 'الخطب',
    icon: 'minbar',
    countLabel: 'ملف',
    kind: 'files',
    ns: 'khutbah',
  },
]

function keyList(prefix) {
  return storage.keys().filter((k) => k.startsWith(prefix))
}

function reciterIdFromKey(key) {
  return key.slice(REGISTRY_PREFIX.length)
}

/** Total bytes + count for a single section. */
function sectionStats(section) {
  if (section.kind === 'reciters') {
    let bytes = 0
    let count = 0
    let reciters = 0
    for (const key of keyList(REGISTRY_PREFIX)) {
      const reg = getRegistry(reciterIdFromKey(key))
      if (reg.count > 0) reciters += 1
      bytes += reg.bytes || 0
      count += reg.count || 0
    }
    return { bytes, count, reciters }
  }
  const reg = getFileRegistry(section.ns)
  return { bytes: reg.bytes || 0, count: reg.count || 0, reciters: 0 }
}

export function getStorageStats() {
  return DOWNLOAD_SECTIONS.map((section) => ({
    ...section,
    ...sectionStats(section),
  }))
}

export function getTotalStorageBytes() {
  return getStorageStats().reduce((sum, s) => sum + (s.bytes || 0), 0)
}

/** Remove every downloaded artifact of a section (leaves registry clean). */
export async function resetDownloadSection(sectionId) {
  const section = DOWNLOAD_SECTIONS.find((s) => s.id === sectionId)
  if (!section) return

  if (section.kind === 'reciters') {
    for (const key of keyList(REGISTRY_PREFIX)) {
      const id = reciterIdFromKey(key)
      const reg = getRegistry(id)
      for (const surah of [...reg.surahs]) {
        try {
          await removeAudio(id, surah)
        } catch {
          /* ignore individual failures */
        }
      }
      resetRegistry(id)
    }
    return
  }

  const reg = getFileRegistry(section.ns)
  for (const name of [...reg.files]) {
    try {
      await removeFileBy(section.ns, name)
    } catch {
      /* ignore individual failures */
    }
  }
  resetFileRegistry(section.ns)
}

/** Human-readable byte formatter (B / K.B / م.ب / ج.ب). */
export function formatBytes(bytes) {
  if (!bytes) return '0'
  const units = [
    { size: 1024 ** 3, label: 'ج.ب' },
    { size: 1024 ** 2, label: 'م.ب' },
    { size: 1024, label: 'ك.ب' },
    { size: 1, label: 'ب' },
  ]
  for (const u of units) {
    if (bytes >= u.size) {
      const value = bytes / u.size
      const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10
      return `${rounded} ${u.label}`
    }
  }
  return '0'
}
