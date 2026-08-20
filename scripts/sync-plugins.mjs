#!/usr/bin/env node
/**
 * Sync local plugin sources (cordova-plugins/<name>) into:
 *   1. plugins/<id>/                                   (cordova's plugin mirror)
 *   2. platforms/android/app/src/main/java/<pkg>/      (actually compiled)
 *
 * Background: `cordova prepare` only copies a plugin's files into the
 * platform the first time the plugin is installed. When we edit a local
 * plugin's Java source afterwards, prepare does NOT overwrite the existing
 * platform copy — so changes would never reach the APK. This script copies
 * the pristine sources from cordova-plugins over both copies, keyed off each
 * plugin's plugin.xml (source-file entries).
 *
 * Idempotent and cheap: only files that differ are copied.
 */

import { existsSync, readFileSync, copyFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { readdirSync } from 'node:fs'

const ROOT = process.cwd()
const SRC = join(ROOT, 'cordova-plugins')
const PLUGINS = join(ROOT, 'plugins')
const APP_JAVA = join(ROOT, 'platforms/android/app/src/main/java')
const PLATFORM_WWW_PLUGINS = join(
  ROOT,
  'platforms/android/platform_www/plugins',
)

function pluginId(pluginXmlPath) {
  const xml = readFileSync(pluginXmlPath, 'utf-8')
  const m = /<plugin[^>]*\bid="([^"]+)"/.exec(xml)
  return m ? m[1] : null
}

function javaPlatformPath(targetDir, file) {
  // plugin.xml target-dir looks like "src/com/altqwaa/..."; the app's java
  // source root is app/src/main/java, and "src/" is already that root.
  return join(APP_JAVA, targetDir.replace(/^src\/?/, ''), file)
}

function ensureCopy(from, to) {
  if (!existsSync(from)) {
    console.warn(`[sync-plugins] missing source: ${from}`)
    return
  }
  const need =
    !existsSync(to) ||
    readFileSync(from, 'utf-8') !== readFileSync(to, 'utf-8')
  if (!need) return
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
  console.log(`[sync-plugins] ✓ ${to}`)
}

/** Binary-safe variant of ensureCopy: compares sizes, not text contents. */
function ensureCopyNative(from, to) {
  if (!existsSync(from)) {
    console.warn(`[sync-plugins] missing binary: ${from}`)
    return
  }
  const need =
    !existsSync(to) ||
    statSync(from).size !== statSync(to).size
  if (!need) return
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
  console.log(`[sync-plugins] ✓ ${to}`)
}

const pluginDirs = readdirSync(SRC).filter((d) =>
  existsSync(join(SRC, d, 'plugin.xml'))
)

for (const dir of pluginDirs) {
  const pluginRoot = join(SRC, dir)
  const xmlPath = join(pluginRoot, 'plugin.xml')
  const id = pluginId(xmlPath)
  if (!id) continue

  const xml = readFileSync(xmlPath, 'utf-8')
  // capture every <source-file ... /> that ends in .java
  const fileRegex = /<source-file\s+src="([^"]+\.java)"[^>]*target-dir="([^"]+)"/g
  const entries = []
  let m
  while ((m = fileRegex.exec(xml)) !== null) {
    entries.push({ srcFile: m[1], targetDir: m[2] })
  }

  for (const { srcFile, targetDir } of entries) {
    const file = srcFile.split('/').pop()
    const from = join(pluginRoot, srcFile)
    const toPlugins = join(PLUGINS, id, srcFile)
    const toPlatform = javaPlatformPath(targetDir, file)
    ensureCopy(from, toPlugins)
    ensureCopy(from, toPlatform)
  }

  // Mirror the plugin manifest + www bridge so `cordova prepare` / the APK
  // bundle the latest JS. cordova only copies a plugin's www into the
  // platform during `plugin add`, so local JS edits go stale otherwise.
  ensureCopy(join(pluginRoot, 'plugin.xml'), join(PLUGINS, id, 'plugin.xml'))
  if (existsSync(join(pluginRoot, 'package.json'))) {
    ensureCopy(join(pluginRoot, 'package.json'), join(PLUGINS, id, 'package.json'))
  }

  // Mirror native libraries (.so) the same way: cordova prepare only copies
  // them at first `plugin add`, so rebuilt binaries (from build:native) would
  // never reach the platform unless we re-sync them here. `libs/arm64-v8a`
  // in plugin.xml maps to app/src/main/jniLibs/arm64-v8a.
  const soRegex = /<source-file\s+src="([^"]+\.so)"[^>]*target-dir="([^"]+)"/g
  const soEntries = []
  let so
  while ((so = soRegex.exec(xml)) !== null) soEntries.push({ srcFile: so[1], targetDir: so[2] })
  for (const { srcFile, targetDir } of soEntries) {
    const from = join(pluginRoot, srcFile)
    if (!existsSync(from)) continue
    const toPlugins = join(PLUGINS, id, srcFile)
    ensureCopyNative(from, toPlugins)
    // plugin.xml target-dir "libs/arm64-v8a" is Cordova's jniLibs staging root.
    const toJni = join(APP_JAVA, '..', 'jniLibs', targetDir.replace(/^libs\//, ''), srcFile.split('/').pop())
    ensureCopyNative(from, toJni)
  }

  const wwwSrc = join(pluginRoot, 'www')
  if (existsSync(wwwSrc)) {
    // cordova-lib wraps each <js-module> as `cordova.define("<pluginId>.<name>",
    // ...)` when it copies a plugin's www into the platform at `plugin add`.
    // Since `cordova prepare` never re-processes plugins/, we must produce the
    // SAME wrapped form ourselves for the deployment copy, otherwise the
    // injected plugin script crashes with "require is not defined".
    const jsModules = {}
    const jsRe = /<js-module\s+src="([^"]+)"[^>]*\bname="([^"]+)"/g
    let jm
    while ((jm = jsRe.exec(xml)) !== null) {
      if (jm[1].startsWith('www/')) {
        jsModules[jm[1].slice('www/'.length)] = `${id}.${jm[2]}`
      }
    }

    const toPluginsWww = join(PLUGINS, id, 'www')
    const toPlatformWww = join(PLATFORM_WWW_PLUGINS, id, 'www')
    // The registry mirror stays pristine so a future `plugin add` wraps once.
    syncDir(wwwSrc, toPluginsWww)
    // The deployment copy is wrapped, matching what cordova-lib would emit.
    syncDir(wwwSrc, toPlatformWww, jsModules)
  }
}

/** Emits the module in cordova-lib's wrapped format. */
function wrapModule(moduleId, content) {
  return `cordova.define("${moduleId}", function(require, exports, module) {\n${content}\n});`
}

function syncDir(fromDir, toDir, jsModules = null) {
  if (!existsSync(fromDir)) return
  for (const f of readdirSync(fromDir)) {
    const from = join(fromDir, f)
    const to = join(toDir, f)
    if (!existsSync(from)) continue
    let content = readFileSync(from, 'utf-8')
    if (jsModules && Object.hasOwn(jsModules, f)) {
      content = wrapModule(jsModules[f], content)
    }
    const need = !existsSync(to) || readFileSync(to, 'utf-8') !== content
    if (!need) continue
    mkdirSync(dirname(to), { recursive: true })
    writeFileSync(to, content)
    console.log(`[sync-plugins] ✓ ${to}`)
  }
}

console.log('[sync-plugins] done.')