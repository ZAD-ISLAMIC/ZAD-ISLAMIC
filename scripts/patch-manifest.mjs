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