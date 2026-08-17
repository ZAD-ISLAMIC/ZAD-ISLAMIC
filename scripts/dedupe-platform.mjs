#!/usr/bin/env node
/**
 * Platform hygiene: remove any Cordova *core* class that was mistakenly
 * copied into the app module (app/src/main/java/org/apache/cordova/*.java)
 * when it also exists in CordovaLib.
 *
 * Background: the platform's app module must only contain plugin classes
 * (org/apache/cordova/device, /file, /statusbar, ...). Old cordova-android
 * templates used to copy core classes (BuildHelper, PermissionHelper) into
 * the app module too; D8 then reports "Type X is defined multiple times"
 * when merging dex for release builds. CordovaLib is the single source of
 * truth for core classes, so the app-module duplicates are always wrong.
 */

import { existsSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const APP_CORE = join(
  process.cwd(),
  'platforms/android/app/src/main/java/org/apache/cordova'
)
const LIB_CORE = join(
  process.cwd(),
  'platforms/android/CordovaLib/src/org/apache/cordova'
)

if (!existsSync(APP_CORE) || !existsSync(LIB_CORE)) {
  console.log('[dedupe-platform] platform core dirs not found — skipping.')
  process.exit(0)
}

const libFiles = new Set(readdirSync(LIB_CORE).filter((f) => f.endsWith('.java')))

let removed = 0
for (const f of readdirSync(APP_CORE).filter((f) => f.endsWith('.java'))) {
  if (libFiles.has(f)) {
    unlinkSync(join(APP_CORE, f))
    console.log(`[dedupe-platform] removed duplicate: ${f}`)
    removed++
  }
}

console.log(
  removed
    ? `[dedupe-platform] ${removed} duplicate core class(es) removed.`
    : '[dedupe-platform] no duplicate core classes — clean.'
)
