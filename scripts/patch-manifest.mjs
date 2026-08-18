#!/usr/bin/env node
/**
 * Post-`cordova prepare` manifest cleanup for the prayerwatch plugin.
 *
 * cordova only ever ADDS manifest entries from plugins — it never removes
 * entries that a previous plugin.xml contained. When we dropped the
 * foreground services, the stale <service>/uses-permission nodes would linger
 * in the built APK, so this step idempotently strips them plus any leftover
 * FGS permission lines.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = process.cwd()
const MANIFEST = resolve(ROOT, 'platforms/android/app/src/main/AndroidManifest.xml')

const SERVICES_TO_REMOVE = [
  'com.rn0x.prayerwatch.PrayerWatchService',
  'com.rn0x.prayerwatch.PrayerAdhanService',
]

const PERMISSIONS_TO_REMOVE = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
]

function removeNode(manifest, node) {
  const re = new RegExp(`[ \\t]*<${node.split(' ')[0]}[^>]*${escapeRegExp(node)}[^>]*>\\n?`, 'gm')
  return manifest.replace(re, '')
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

let manifest = readFileSync(MANIFEST, 'utf-8')
let changed = false

for (const name of SERVICES_TO_REMOVE) {
  // match the full <service ... android:name="X" ... /> or <service ...>...</service>
  const re = new RegExp(
    `<service[^>]*android:name="${escapeRegExp(name)}"[^>]*>\\s*</service>|<service[^>]*android:name="${escapeRegExp(name)}"[^>]*/>`,
    'g'
  )
  const next = manifest.replace(re, '')
  if (next !== manifest) changed = true
  manifest = next
}

for (const perm of PERMISSIONS_TO_REMOVE) {
  const re = new RegExp(`<uses-permission android:name="${escapeRegExp(perm)}"[^>]*/\\s*>\\s*\\n?`, 'g')
  const next = manifest.replace(re, '')
  if (next !== manifest) changed = true
  manifest = next
}

if (changed) {
  writeFileSync(MANIFEST, manifest)
  console.log('[patch-manifest] removed leftover foreground-service entries')
} else {
  console.log('[patch-manifest] already clean (no FGS entries)')
}

// Also make sure the essential alarm permissions still exist.
const REQUIRED = [
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.WAKE_LOCK',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.VIBRATE',
  // normal permission, auto-granted — lets the adhan boost the alarm stream
  'android.permission.MODIFY_AUDIO_SETTINGS',
]
let step2 = manifest
let changed2 = false
for (const p of REQUIRED) {
  if (step2.includes(`android:name="${p}"`)) continue
  const m = /(\n\s*<application[^>]*>)/.exec(step2)
  if (!m) continue
  step2 = step2.replace(m[1], `\n    <uses-permission android:name="${p}" />${m[1]}`)
  changed2 = true
}
if (changed2) {
  writeFileSync(MANIFEST, step2)
  console.log('[patch-manifest] ensured core alarm permissions present')
}

// The debug receiver only lands in the manifest via `cordova plugin add`.
// Updated plugin.xml edits are NOT re-merged by `cordova prepare`, so inject
// the receiver here (it self-guards on FLAG_DEBUGGABLE → inert in release).
const DEBUG_RECEIVER = 'com.rn0x.prayerwatch.PrayerDebugReceiver'
let step3 = step2
if (!step3.includes(DEBUG_RECEIVER)) {
  const anchor = /(\n\s*<receiver android:exported="false" android:name="com\.rn0x\.prayerwatch\.PrayerAdhanReceiver" \/>)/.exec(step3)
  if (anchor) {
    step3 = step3.replace(
      anchor[1],
      `${anchor[1]}\n        <receiver android:exported="true" android:name="${DEBUG_RECEIVER}" />`
    )
    writeFileSync(MANIFEST, step3)
    console.log('[patch-manifest] injected PrayerDebugReceiver')
  }
}

// The white flash between the native splash and the WebView's first paint
// comes from cordova's default `cdv_background_color` (#FAF8FF light, or the
// v34/system variants). The app is always navy (#0a1428), so pin the color in
// every cdv_colors.xml bucket. cordova prepare rewrites values/cdv_colors.xml
// on each run; the -v34 / -night files come from the platform template and are
// only present after `platform add`. This hook runs after prepare, so both
// cases are caught and this is idempotent.
const COLORS_DIR = resolve(ROOT, 'platforms/android/app/src/main/res')
const NAVY = '#0a1428'
const colorsFiles = [
  resolve(COLORS_DIR, 'values/cdv_colors.xml'),
  resolve(COLORS_DIR, 'values-v34/cdv_colors.xml'),
  resolve(COLORS_DIR, 'values-night/cdv_colors.xml'),
  resolve(COLORS_DIR, 'values-night-v34/cdv_colors.xml'),
]

for (const file of colorsFiles) {
  let xml
  try {
    xml = readFileSync(file, 'utf-8')
  } catch {
    continue
  }
  const next = xml.replace(
    /(<color name="cdv_background_color">)([^<]*)(<\/color>)/,
    `$1${NAVY}$3`
  )
  if (next !== xml) {
    writeFileSync(file, next)
    console.log(`[patch-manifest] pinned cdv_background_color → ${NAVY} in ${file.split('/res/')[1]}`)
  }
}