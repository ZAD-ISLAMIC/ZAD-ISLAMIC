import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HISN_DATA,
  accentFor,
  categoryProgress,
  completedCount,
  decrementProgress,
  doorFiles,
  doorRef,
  getCategoryById,
  getItem,
  getProgress,
  groupBySections,
  incrementProgress,
  itemRef,
  itemTrackList,
  normalizeArabic,
  normalizeHttps,
  resetProgress,
  saveProgress,
  searchCategories,
  sectionFor,
  todayKey,
  toDoorTrack,
  toItemTrack,
} from '../src/services/hisnmuslim.mjs'
import {
  fileRegistrySummary,
  hasFile,
  markStoredByFile,
  removeFileBy,
} from '../src/services/reciterStorage.mjs'

/* ------------------------------------------------------------------ *
 * Data integrity — the source JSON ships inline http:// links and both
 * door-level and per-dhikr audio.
 * ------------------------------------------------------------------ */

test('hisnmuslim.json parses with 132 doors covering all odds', () => {
  assert.equal(HISN_DATA.length, 132)
  const ids = new Set(HISN_DATA.map((c) => c.id))
  assert.equal(ids.size, 132)
  const items = HISN_DATA.flatMap((c) => c.array)
  assert.equal(items.length, 267)
})

test('every door and dhikr has a name, text, count and audio file', () => {
  for (const category of HISN_DATA) {
    assert.ok(String(category.id).length > 0)
    assert.ok(category.category.length > 0, `category ${category.id}`)
    assert.ok(category.array.length > 0, `array of ${category.id}`)
    assert.ok(category.filename.length > 0, `door filename ${category.id}`)
    assert.ok(category.audio.length > 0, `door audio ${category.id}`)
    for (const item of category.array) {
      assert.equal(typeof item.id, 'number')
      assert.ok(item.text.length > 0, `text of ${category.id}:${item.id}`)
      assert.ok(item.count >= 1, `count of ${category.id}:${item.id}`)
      assert.ok(item.filename.length > 0, `filename of ${category.id}:${item.id}`)
      assert.ok(item.audio.length > 0, `audio of ${category.id}:${item.id}`)
    }
  }
})

test('file names are unique keys for playback and storage', () => {
  const seen = new Set()
  for (const category of HISN_DATA) {
    for (const name of [category.filename, ...category.array.map((i) => i.filename)]) {
      seen.add(name)
    }
  }
  assert.equal(seen.size, 397)
  // Shared physical files: two pairs of doors cite the same audio, which
  // the `hisn` namespace registry happily deduplicates under one fileName.
  const registry = new Map()
  for (const category of HISN_DATA) {
    for (const name of [category.filename, ...category.array.map((i) => i.filename)]) {
      registry.set(name, (registry.get(name) || 0) + 1)
    }
  }
  const shared = [...registry.entries()].filter(([, n]) => n > 1)
  assert.equal(shared.length, 2)
})

/* ------------------------------------------------------------------ *
 * Lookups
 * ------------------------------------------------------------------ */

test('getCategoryById resolves by number or string and misses gracefully', () => {
  const first = getCategoryById(1)
  assert.equal(first.category, 'أذكار الصباح والمساء')
  assert.equal(getCategoryById('1').id, 1)
  assert.equal(getCategoryById(9999), null)
  assert.equal(getCategoryById('nope'), null)
})

test('getItem resolves and returns null for unknown dhikrs', () => {
  const item = getItem(1, 1)
  assert.ok(item)
  assert.equal(item.id, 1)
  assert.ok(
    normalizeArabic(item.text).startsWith(normalizeArabic('أَعُوذُ بِاللَّهِ')),
    `text "${item.text.slice(0, 20)}" starts with أَعُوذُ بِاللَّهِ`
  )
  assert.equal(getItem(1, 9999), null)
  assert.equal(getItem(9999, 1), null)
})

/* ------------------------------------------------------------------ *
 * HTTPS normalisation — avoids mixed content from the https://localhost
 * WebView shell and Android cleartext blocking.
 * ------------------------------------------------------------------ */

test('normalizeHttps upgrades http and leaves others untouched', () => {
  assert.equal(
    normalizeHttps('http://www.hisnmuslim.com/audio/ar/ar_7esn_AlMoslem_by_Doors_028.mp3'),
    'https://www.hisnmuslim.com/audio/ar/ar_7esn_AlMoslem_by_Doors_028.mp3'
  )
  assert.equal(normalizeHttps('https://example.com/a.mp3'), 'https://example.com/a.mp3')
  assert.equal(normalizeHttps('//example.com/a.mp3'), '//example.com/a.mp3')
  assert.equal(normalizeHttps(''), '')
  assert.equal(normalizeHttps(null), '')
})

/* ------------------------------------------------------------------ *
 * Search — Arabic-aware, tashkeel-insensitive
 * ------------------------------------------------------------------ */

test('normalizeArabic folds alef/hamza and strips tashkeel', () => {
  assert.equal(normalizeArabic('أَذْكَارَ الصَّبَاحِ'), normalizeArabic('اذكار الصباح'))
  assert.equal(
    normalizeArabic('الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ'),
    normalizeArabic('الحمد لله رب العالمين')
  )
  assert.equal(normalizeArabic('إِذًا'), normalizeArabic('اذا'))
})

test('searchCategories matches partial names despite diacritics', () => {
  assert.equal(searchCategories('').length, HISN_DATA.length)
  const morning = searchCategories('أَذْكَارَ الصَّبَاحِ')
  assert.equal(morning.length, 1)
  assert.ok(morning.some((c) => c.category.includes('أذكار الصباح')))
  const sleep = searchCategories('النوم')
  assert.ok(sleep.length >= 1)
  assert.equal(searchCategories('xyz لا يوجد').length, 0)
})

/* ------------------------------------------------------------------ *
 * File/player references
 * ------------------------------------------------------------------ */

test('doorRef and itemRef produce unique refs with https urls', () => {
  const door = doorRef(1)
  assert.equal(door.ref, 'hisn:d:1')
  assert.equal(door.fileName, 'ar_7esn_AlMoslem_by_Doors_028')
  assert.ok(door.url.startsWith('https://'))

  const item = itemRef(1, 1)
  assert.equal(item.ref, 'hisn:i:1:1')
  assert.ok(item.url.startsWith('https://'))
})

test('doorFiles lists the door audio first then every dhikr', () => {
  const files = doorFiles(1)
  const door = getCategoryById(1)
  assert.equal(files.length, door.array.length + 1)
  assert.equal(files[0].fileName, door.filename)
  for (const file of files) {
    assert.ok(file.fileName && file.url.startsWith('https://'))
  }
})

test('kind:hisn tracks carry name/sub/url for the shared player', () => {
  const category = getCategoryById(1)
  const doorTrack = toDoorTrack(category)
  assert.equal(doorTrack.kind, 'hisn')
  assert.equal(doorTrack.ref, 'hisn:d:1')
  assert.ok(doorTrack.url.startsWith('https://'))

  const itemTrack = toItemTrack(category, category.array[0])
  assert.equal(itemTrack.kind, 'hisn')
  assert.equal(itemTrack.ref, 'hisn:i:1:1')
  assert.equal(itemTrack.sub, category.category)

  const queue = itemTrackList(category)
  assert.equal(queue.length, category.array.length)
  assert.equal(queue[0].name.length > 0, true)
})

/* ------------------------------------------------------------------ *
 * Sections — regex classifier without orphan doors
 * ------------------------------------------------------------------ */

test('every door maps to a named section and nothing is dropped', () => {
  const groups = groupBySections(HISN_DATA)
  const assigned = new Set()
  for (const group of groups) {
    for (const category of group.categories) assigned.add(category.id)
  }
  assert.equal(assigned.size, HISN_DATA.length)
  assert.ok(groups.some((g) => g.key === 'day' && g.title.includes('الصباح')))
  assert.ok(groups.some((g) => g.title === 'الجنائز'))
})

test('sectionFor prefers the specific keyword and falls back to أدعية متفرقة', () => {
  assert.equal(sectionFor('ما يقول عند الذبح أو النحر').key, 'food')
  assert.equal(sectionFor('الدعاء لمن عرض عليك ماله').key, 'manners')
  assert.equal(sectionFor('أذكار الصباح والمساء').key, 'day')
})

test('accentFor returns a hex accent for every door', () => {
  for (const category of HISN_DATA) {
    const accent = accentFor(category.category)
    assert.match(accent, /^#[0-9a-f]{6}$/i)
  }
})

/* ------------------------------------------------------------------ *
 * Daily progress — localStorage-backed per-day tap counts
 * ------------------------------------------------------------------ */

function installLocalStorageMock() {
  const map = new Map()
  const localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  }
  globalThis.window = { localStorage }
  return map
}

test('todayKey is a zero-padded YYYY-MM-DD', () => {
  assert.match(todayKey(new Date(2026, 4, 3)), /^2026-05-03$/)
  assert.match(todayKey(new Date(2026, 0, 9)), /^2026-01-09$/)
})

test('daily progress increments, caps at the count, resets cleanly', () => {
  installLocalStorageMock()
  const category = getCategoryById(1)
  // Pick a dhikr repeated several times so the mid-way assertion is valid.
  const item = category.array.find((i) => i.count >= 3) || category.array[0]
  const itemId = item.id
  const total = item.count

  const first = incrementProgress(category.id, itemId, total)
  assert.equal(first, 1)
  assert.equal(categoryProgress(category.id)[itemId], 1)
  assert.equal(completedCount(category.id), 0, 'one tap is not a finish')

  for (let i = 0; i < total + 5; i += 1) incrementProgress(category.id, itemId, total)
  assert.equal(categoryProgress(category.id)[itemId], total, 'never exceeds the count')
  assert.equal(completedCount(category.id), 1, 'door counts the finished dhikr')

  resetProgress(category.id, itemId)
  assert.equal(categoryProgress(category.id)[itemId], undefined)
  assert.equal(completedCount(category.id), 0)
})

test('progress is scoped per day so yesterdays taps do not leak', () => {
  installLocalStorageMock()
  const category = getCategoryById(1)
  const itemId = category.array[0].id
  // Simulate a previous day by writing through the registry directly.
  saveProgress({ '2000-01-01': { [category.id]: { [itemId]: 5 } } })
  assert.equal(categoryProgress(category.id)[itemId], undefined)
  assert.equal(completedCount(category.id), 0)
  assert.equal(getProgress()['2000-01-01'][category.id][itemId], 5, 'old day is still stored')
})

test('decrementProgress undoes one tap, never goes negative and reopens a done dhikr', () => {
  installLocalStorageMock()
  const category = getCategoryById(1)
  const item = category.array[0]
  const itemId = item.id

  incrementProgress(category.id, itemId, item.count)
  assert.equal(categoryProgress(category.id)[itemId], item.count)
  assert.equal(completedCount(category.id), 1)

  decrementProgress(category.id, itemId)
  assert.equal(completedCount(category.id), 0, 'one undo reopens the finished dhikr')

  decrementProgress(category.id, itemId)
  assert.equal(categoryProgress(category.id)[itemId], undefined, 'key removed at zero')
  assert.equal(decrementProgress(category.id, itemId), 0, 'undo on empty stays zero')
  assert.equal(categoryProgress(category.id)[itemId], undefined, 'never negative')
})

/* ------------------------------------------------------------------ *
 * Generic file storage — the حصن المسلم namespace on the same backend
 * ------------------------------------------------------------------ */

test('markStoredByFile/hasFile/removeFileBy keep the registry accurate', async () => {
  installLocalStorageMock()
  const ns = 'hisn'
  const name = '75'

  assert.equal(hasFile(ns, name), false)
  markStoredByFile(ns, name, 1024)
  assert.equal(hasFile(ns, name), true)
  assert.deepEqual(fileRegistrySummary(ns), { count: 1, bytes: 1024 })

  markStoredByFile(ns, name, 2048)
  assert.equal(fileRegistrySummary(ns).count, 1, 'same file is not double-counted')

  await removeFileBy(ns, name)
  assert.equal(hasFile(ns, name), false)
  assert.deepEqual(fileRegistrySummary(ns), { count: 0, bytes: 0 })
})