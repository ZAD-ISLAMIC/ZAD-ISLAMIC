import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  RADIO_STATIONS,
  getCategories,
  getCategoryStyle,
  searchStations,
  stationById,
  toRadioTrack,
  stationSupportNote,
  normalizeArabic,
} from '../src/services/radio.mjs'

test('radio.json is fully parsed and cleaned', () => {
  assert.equal(RADIO_STATIONS.length, 177)
})

test('every station has trimmed name, valid http(s) link and a category', () => {
  for (const station of RADIO_STATIONS) {
    assert.equal(typeof station.name, 'string')
    assert.ok(station.name.length > 0, `name of ${station.id}`)
    assert.equal(station.name, station.name.trim())
    assert.ok(
      /^https?:\/\//i.test(station.link),
      `link of "${station.name}" is ${station.link}`
    )
    assert.equal(station.link, station.link.trim())
    assert.ok(station.category.length > 0, `category of ${station.id}`)
    assert.ok(station.id >= 0)
  }
})

test('categories group correctly and total matches all stations', () => {
  const categories = getCategories()
  const names = categories.map((c) => c.key)
  assert.equal(categories.length, 6)
  const total = categories.reduce((sum, c) => sum + c.count, 0)
  assert.equal(total, RADIO_STATIONS.length)
  assert.ok(names.includes('إذاعات القراء'))
  assert.ok(names.includes('منوعات إسلامية'))
  assert.equal(getCategoryStyle('إذاعات القراء').accent, '#2dd4bf')
  assert.deepEqual(getCategoryStyle('غير موجود'), {})
})

test('searchStations matches by partial name and by category', () => {
  const all = searchStations('')
  assert.equal(all.length, RADIO_STATIONS.length)

  const maher = searchStations('ماهر')
  assert.ok(maher.some((s) => s.name.includes('ماهر المعيقلي')))

  const byCat = searchStations('', 'أذكار ورقية')
  assert.equal(byCat.length, 1)
  assert.equal(byCat[0].name.includes('الرقية الشرعية'), true)

  const empty = searchStations('xyz غير موجود')
  assert.equal(empty.length, 0)
})

test('normalizeArabic folds alef forms and removes tashkeel', () => {
  assert.equal(normalizeArabic('إذاعة أحمد'), normalizeArabic('اذاعة احمد'))
  assert.equal(normalizeArabic('مكةَ') , 'مكه')
})

test('stationById resolves and toRadioTrack produces a playable track', () => {
  const station = stationById(128)
  assert.ok(station)
  assert.equal(station.name.includes('القرآن الكريم'), true)

  const track = toRadioTrack(station)
  assert.equal(track.kind, 'radio')
  assert.equal(track.id, 128)
  assert.equal(track.url, station.link)
  assert.ok(track.url.length > 0)
})

test('HLS and insecure http links are flagged', () => {
  const hls = RADIO_STATIONS.filter((s) => s.hls)
  assert.ok(hls.length >= 3)
  for (const s of hls) assert.ok(s.link.includes('m3u8'))

  const insecure = RADIO_STATIONS.filter((s) => s.insecure)
  assert.equal(insecure.length >= 1, true)
  for (const s of insecure)
    assert.ok(s.link.startsWith('http://'))

  const hlsStation = hls[0]
  const note = stationSupportNote(hlsStation)
  assert.ok(note.includes('HLS'))

  const plain = RADIO_STATIONS.find((s) => !s.hls && !s.insecure)
  assert.equal(stationSupportNote(plain), '')
})