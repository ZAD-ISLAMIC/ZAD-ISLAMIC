import { storage } from './storage.mjs'
import { playSound, vibrate } from './sound.mjs'
import { notifyComplete } from './notifications.mjs'
import { analyzeTranscript } from './recognition.mjs'

const STORE_KEY = 'tasbih:data'
const COUNTS_KEY = 'tasbih:counts'
const SETTINGS_KEY = 'tasbih:settings'

export const DEFAULT_TARGETS = [33, 33, 33]
export const QUICK_TARGETS = [7, 33, 100, 500, 1000]

const DEFAULT_DHIKRS = [
  { id: 'dhikr:subhanallah', text: 'سُبْحَانَ اللَّهِ', target: 33, custom: false },
  { id: 'dhikr:alhamdulillah', text: 'الْحَمْدُ لِلَّهِ', target: 33, custom: false },
  { id: 'dhikr:allahu-akbar', text: 'اللَّهُ أَكْبَرُ', target: 33, custom: false },
]

/**
 * Fixed dhikr set for the automatic (AI) section. No repetition targets —
 * the recognizer simply tallies how many times each phrase is spoken while
 * listening. Longer phrases sort first so multi-word dhikr win over their
 * short prefixes during matching.
 */
export const AI_DHIKRS = [
  { id: 'ai:subhanallah', text: 'سُبْحَانَ اللَّهِ' },
  { id: 'ai:alhamdulillah', text: 'الْحَمْدُ لِلَّهِ' },
  { id: 'ai:allahu-akbar', text: 'اللَّهُ أَكْبَرُ' },
  { id: 'ai:la-ilaha-illa-allah', text: 'لَا إِلَهَ إِلَّا اللَّهُ' },
  { id: 'ai:astaghfirullah', text: 'أَسْتَغْفِرُ اللَّهَ' },
  { id: 'ai:subhanallah-wa-bihamdihi', text: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ' },
]

export { normalizeArabic, normalizesEqual } from './recognition.mjs'

function uid() {
  return 'dhikr:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/* ------------------------------ settings ------------------------------ */

export function getSettings() {
  const s = storage.get(SETTINGS_KEY, {})
  return {
    aiEnabled: s.aiEnabled !== false,
    sound: s.sound !== false,
    vibration: s.vibration !== false,
    countEveryUtterance: s.countEveryUtterance === true,
    matchTolerance: s.matchTolerance === 'strict' ? 'strict' : 'loose',
    fuzzyThreshold: s.fuzzyThreshold === undefined ? 2 : Number(s.fuzzyThreshold),
    vadThreshold: s.vadThreshold === undefined ? 0.005 : Number(s.vadThreshold),
    noiseRatio: s.noiseRatio === undefined ? 4 : Number(s.noiseRatio),
    minSnrDb: s.minSnrDb === undefined ? 6 : Number(s.minSnrDb),
    minSpeechMs: s.minSpeechMs === undefined ? 150 : Number(s.minSpeechMs),
    endSilenceMs: s.endSilenceMs === undefined ? 200 : Number(s.endSilenceMs),
    maxGapMs: s.maxGapMs === undefined ? 2500 : Number(s.maxGapMs),
    duplicateWindowMs: s.duplicateWindowMs === undefined ? 700 : Number(s.duplicateWindowMs),
    stitchWindowMs: s.stitchWindowMs === undefined ? 1800 : Number(s.stitchWindowMs),
    showDiag: s.showDiag === true,
  }
}

export function saveSettings(patch) {
  storage.set(SETTINGS_KEY, { ...getSettings(), ...patch })
  return getSettings()
}

/* ------------------------------- dhikrs ------------------------------- */

export function getDhikrs() {
  const data = storage.get(STORE_KEY, { dhikrs: null })
  let dhikrs = Array.isArray(data) ? data : data?.dhikrs
  if (!Array.isArray(dhikrs) || dhikrs.length === 0) {
    dhikrs = DEFAULT_DHIKRS.map((d) => ({ ...d }))
  }
  return dhikrs.map((d) => ({
    id: d.id,
    text: d.text,
    target: Math.max(1, Math.min(10000, Number(d.target) || 33)),
    custom: !!d.custom,
  }))
}

function saveDhikrs(dhikrs) {
  storage.set(STORE_KEY, { dhikrs, updatedAt: Date.now() })
}

export function addDhikr(text, target) {
  const clean = String(text || '').trim()
  if (!clean) throw new Error('empty')
  const dhikr = {
    id: uid(),
    text: clean,
    target: Math.max(1, Math.min(10000, Number(target) || 33)),
    custom: true,
  }
  saveDhikrs([...getDhikrs(), dhikr])
  return dhikr
}

export function updateDhikr(id, patch) {
  const dhikrs = getDhikrs()
  const idx = dhikrs.findIndex((d) => d.id === id)
  if (idx === -1) return null
  const next = { ...dhikrs[idx] }
  if (patch.text !== undefined) {
    const clean = String(patch.text).trim()
    if (clean) next.text = clean
  }
  if (patch.target !== undefined) {
    next.target = Math.max(1, Math.min(10000, Number(patch.target) || 33))
  }
  dhikrs[idx] = next
  saveDhikrs(dhikrs)
  return next
}

export function removeDhikr(id) {
  saveDhikrs(getDhikrs().filter((d) => d.id !== id || !d.custom))
  resetCount(id)
}

/* ------------------------------- counts ------------------------------- */

function countsStore() {
  const counts = storage.get(COUNTS_KEY, {})
  const today = new Date().toISOString().slice(0, 10)
  const day = counts[today] || {}
  return {
    today,
    day,
    save(nextDay) {
      counts[today] = nextDay
      storage.set(COUNTS_KEY, counts)
    },
  }
}

/** All of today's counts as a plain `{ dhikrId: number }` map. */
export function getTodayCounts() {
  return countsStore().day
}

export function setCount(id, value) {
  const store = countsStore()
  store.day[id] = Math.max(0, Number(value) || 0)
  store.save(store.day)
}

export function addCount(id, amount = 1) {
  const store = countsStore()
  store.day[id] = (Number(store.day[id]) || 0) + amount
  store.save(store.day)
}

export function resetCount(id) {
  const store = countsStore()
  delete store.day[id]
  store.save(store.day)
}

export function resetTodayCounts() {
  const store = countsStore()
  store.save({})
}

/* ------------------------------ matching ------------------------------ */

export function recognizeDhikr(text, dhikrs, settings) {
  const norm = normalizeArabic(text)
  if (!norm) return null
  const { matches } = analyzeTranscript(text, dhikrs, settings)
  return matches.length > 0 ? matches[0].dhikr : null
}

/**
 * Resolve a transcript against the dhikr list, counting every occurrence.
 *
 * - Word-level constrained matching tolerates ASR spelling errors while
 *   respecting word boundaries (handles "سمحان الله", "سبحان اللة"…).
 * - Repetition detection counts repeated phrases in one breath:
 *   "سبحان الله سبحان الله سبحان الله" → count 3.
 * - Confidence gating rejects phantom matches (noise → dhikr).
 *
 * Returns [{ dhikr, count }] entries; null when nothing matched.
 */
export function resolveDhikrCounts(text, dhikrs, settings) {
  if (!text || !Array.isArray(dhikrs) || dhikrs.length === 0) return null
  const { matches } = analyzeTranscript(text, dhikrs, settings)
  const countable = matches.filter((m) =>
    m.confidence === 'high' || m.confidence === 'medium' || settings.countEveryUtterance
  )
  if (countable.length === 0 && settings.countEveryUtterance && matches.length === 0) {
    const first = dhikrs[0]
    if (first) return [{ dhikr: first, count: 1 }]
  }
  if (countable.length === 0) return null
  return countable
    .map((m) => ({ dhikr: m.dhikr, count: m.count }))
    .filter((r) => r.count > 0)
}

export function celebrate(dhikr, target) {
  playSound('done')
  vibrate([0, 60, 40, 60, 40, 90])
  notifyComplete({ ...dhikr, target })
}
