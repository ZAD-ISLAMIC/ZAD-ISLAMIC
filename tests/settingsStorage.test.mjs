import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  getStorageStats,
  getTotalStorageBytes,
  resetDownloadSection,
  formatBytes,
} from '../src/services/settingsStorage.mjs'

function installLocalStorageMock() {
  const ls = {
    getItem(k) {
      return k in ls && typeof ls[k] !== 'function' ? ls[k] : null
    },
    setItem(k, v) {
      ls[k] = String(v)
    },
    removeItem(k) {
      try {
        delete ls[k]
      } catch {
        /* ignore */
      }
    },
    clear() {
      for (const k of Object.keys(ls)) {
        if (typeof ls[k] !== 'function') delete ls[k]
      }
    },
  }
  globalThis.window = { localStorage: ls }
  return ls
}

beforeEach(() => {
  installLocalStorageMock()
})

test('getStorageStats aggregates reciter + file registries', () => {
  window.localStorage.setItem(
    'altaqwaa:reciters.reg.1',
    JSON.stringify({ surahs: [1, 2], bytes: 1000, count: 2, sizes: { 1: 600, 2: 400 } })
  )
  window.localStorage.setItem(
    'altaqwaa:reciters.reg.5',
    JSON.stringify({ surahs: [3], bytes: 700, count: 1, sizes: { 3: 700 } })
  )
  window.localStorage.setItem(
    'altaqwaa:hisn.files.hisn',
    JSON.stringify({ files: ['a', 'b'], bytes: 500, count: 2, sizes: { a: 200, b: 300 } })
  )

  const stats = getStorageStats()
  const reciters = stats.find((s) => s.id === 'reciters')
  const hisn = stats.find((s) => s.id === 'hisn')

  assert.equal(reciters.bytes, 1700)
  assert.equal(reciters.count, 3)
  assert.equal(reciters.reciters, 2)
  assert.equal(hisn.bytes, 500)
  assert.equal(hisn.count, 2)
  assert.equal(getTotalStorageBytes(), 2200)
})

test('getStorageStats returns zeroed sections when nothing is stored', () => {
  const stats = getStorageStats()
  assert.ok(stats.length >= 4)
  for (const s of stats) {
    assert.equal(s.bytes, 0)
    assert.equal(s.count, 0)
  }
  assert.equal(getTotalStorageBytes(), 0)
})

test('resetDownloadSection clears a file section registry', async () => {
  window.localStorage.setItem(
    'altaqwaa:hisn.files.hisn',
    JSON.stringify({ files: ['a', 'b'], bytes: 500, count: 2, sizes: { a: 200, b: 300 } })
  )
  await resetDownloadSection('hisn')
  const hisn = getStorageStats().find((s) => s.id === 'hisn')
  assert.equal(hisn.bytes, 0)
  assert.equal(hisn.count, 0)
})

test('resetDownloadSection clears all reciter registries', async () => {
  window.localStorage.setItem(
    'altaqwaa:reciters.reg.1',
    JSON.stringify({ surahs: [1, 2], bytes: 1000, count: 2, sizes: { 1: 600, 2: 400 } })
  )
  await resetDownloadSection('reciters')
  const reciters = getStorageStats().find((s) => s.id === 'reciters')
  assert.equal(reciters.bytes, 0)
  assert.equal(reciters.count, 0)
})

test('formatBytes renders Arabic byte units', () => {
  assert.equal(formatBytes(0), '0')
  assert.equal(formatBytes(500), '500 ب')
  assert.equal(formatBytes(1024), '1 ك.ب')
  assert.equal(formatBytes(2 * 1024 * 1024), '2 م.ب')
  assert.equal(formatBytes(1.5 * 1024 * 1024 * 1024), '1.5 ج.ب')
})
