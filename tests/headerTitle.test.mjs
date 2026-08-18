import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getDynamicTitle,
  getHeaderMeta,
  setDynamicTitle,
  subscribeHeader,
} from '../src/utils/headerTitle.mjs'

/* ------------------------------------------------------------------ *
 * Header meta — Arabic slugs arrive percent-encoded via location.pathname
 * ------------------------------------------------------------------ */

test('getHeaderMeta resolves percent-encoded Arabic fatwa slug', () => {
  const meta = getHeaderMeta('/fatwas/' + encodeURIComponent('احكام-التعزيه'))
  assert.equal(meta.title, 'أحكام التعزية')
  assert.equal(meta.back, 'history')
})

test('getHeaderMeta keeps the umbrella title on the fatwas root', () => {
  assert.equal(getHeaderMeta('/fatwas').title, 'فتاوى ابن باز')
  assert.equal(getHeaderMeta('/fatwas').back, '/home')
})

test('getHeaderMeta resolves the decoded adhkar key too', () => {
  const meta = getHeaderMeta('/adhkar/' + encodeURIComponent('الصباح'))
  assert.ok(meta.title)
  assert.equal(meta.back, 'history')
})

test('getHeaderMeta resolves settings sub-pages back to /settings', () => {
  assert.equal(getHeaderMeta('/settings/reading').title, 'القراءة والخطوط')
  assert.equal(getHeaderMeta('/settings/reading').back, '/settings')
  assert.equal(getHeaderMeta('/settings/support').title, 'الدعم والتبرع')
  assert.equal(getHeaderMeta('/settings/unknown').title, 'الإعدادات')
  assert.equal(getHeaderMeta('/settings/unknown').back, '/settings')
})

/* ------------------------------------------------------------------ *
 * Dynamic title store — the fatwa detail screen feeds its own title
 * ------------------------------------------------------------------ */

test('setDynamicTitle/getDynamicTitle round-trip and clears with null', () => {
  setDynamicTitle('حكم التعزية؟')
  assert.equal(getDynamicTitle(), 'حكم التعزية؟')
  setDynamicTitle(null)
  assert.equal(getDynamicTitle(), null)
})

test('setDynamicTitle notifies subscribers only on actual change', () => {
  let calls = 0
  let last = null
  const off = subscribeHeader(() => {
    calls += 1
    last = getDynamicTitle()
  })
  setDynamicTitle('سؤال جديد')
  assert.equal(calls, 1)
  assert.equal(last, 'سؤال جديد')
  setDynamicTitle('سؤال جديد')
  assert.equal(calls, 1, 'identical title must not re-emit')
  setDynamicTitle(null)
  assert.equal(calls, 2)
  off()
  setDynamicTitle('بعد الإلغاء')
  assert.equal(calls, 2, 'unsubscribed listener must not fire')
  setDynamicTitle(null)
})