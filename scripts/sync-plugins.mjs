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

  // Mirror model assets (.gguf) into the platform's assets directory.
  // cordova prepare only copies these at first `plugin add`, so they go stale
  // otherwise.
  const ggufRegex = /<source-file\s+src="([^"]+\.gguf)"[^>]*target-dir="([^"]+)"/g
  const ggufEntries = []
  let gg
  while ((gg = ggufRegex.exec(xml)) !== null) ggufEntries.push({ srcFile: gg[1], targetDir: gg[2] })
  for (const { srcFile, targetDir } of ggufEntries) {
    const from = join(pluginRoot, srcFile)
    if (!existsSync(from)) continue
    const toPlugins = join(PLUGINS, id, srcFile)
    ensureCopyNative(from, toPlugins)
    // target-dir "app/src/main/assets/models" is relative to platforms/android/
    const toPlatform = join(ROOT, 'platforms/android', targetDir, srcFile.split('/').pop())
    ensureCopyNative(from, toPlatform)
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

// ---- Phase 2: Inject <feature> entries into platform config.xml ----
// cordova prepare regenerates config.xml from config_munge, which is empty for
// local (file:) plugins.  We parse each plugin.xml's <config-file> blocks for
// res/xml/config.xml and inject missing <feature> entries.

const PLATFORM_CONFIG = join(ROOT, 'platforms/android/app/src/main/res/xml/config.xml')
const ANDROID_MANIFEST = join(ROOT, 'platforms/android/app/src/main/AndroidManifest.xml')

if (existsSync(PLATFORM_CONFIG)) {
  let configXml = readFileSync(PLATFORM_CONFIG, 'utf-8')
  let changed = false

  for (const dir of pluginDirs) {
    const pluginRoot = join(SRC, dir)
    const xmlPath = join(pluginRoot, 'plugin.xml')
    const id = pluginId(xmlPath)
    if (!id) continue
    const xml = readFileSync(xmlPath, 'utf-8')

    // Extract <config-file target="res/xml/config.xml"> blocks
    const cfgRe = /<config-file\s+target="res\/xml\/config\.xml"[^>]*>([\s\S]*?)<\/config-file>/g
    let cm
    while ((cm = cfgRe.exec(xml)) !== null) {
      const block = cm[1].trim()
      // Extract feature name to check for duplicates
      const nameMatch = /<feature\s+name="([^"]+)"/.exec(block)
      if (nameMatch) {
        const featureName = nameMatch[1]
        if (!configXml.includes(`name="${featureName}"`)) {
          // Inject before </widget>
          configXml = configXml.replace('</widget>', `    ${block.split('\n').join('\n    ')}\n</widget>`)
          changed = true
          console.log(`[sync-plugins] ✓ injected <feature name="${featureName}"> into config.xml`)
        }
      }
    }
  }

  // Ensure RECORD_AUDIO permission in config.xml
  if (!configXml.includes('android.permission.RECORD_AUDIO')) {
    configXml = configXml.replace(
      '<uses-permission android:name="android.permission.INTERNET" />',
      '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.RECORD_AUDIO" />'
    )
    changed = true
    console.log('[sync-plugins] ✓ injected RECORD_AUDIO permission into config.xml')
  }

  if (changed) {
    writeFileSync(PLATFORM_CONFIG, configXml)
  }
}

// ---- Phase 3: Inject RECORD_AUDIO into AndroidManifest.xml ----
if (existsSync(ANDROID_MANIFEST)) {
  let manifest = readFileSync(ANDROID_MANIFEST, 'utf-8')
  if (!manifest.includes('android.permission.RECORD_AUDIO')) {
    manifest = manifest.replace(
      /(<uses-permission android:name="android.permission.INTERNET"[^/]*\/>)/,
      '$1\n    <uses-permission android:name="android.permission.RECORD_AUDIO" />'
    )
    writeFileSync(ANDROID_MANIFEST, manifest)
    console.log('[sync-plugins] ✓ injected RECORD_AUDIO into AndroidManifest.xml')
  }
}

// ---- Phase 4: Regenerate cordova_plugins.js ----
// Collect all local plugins with JS modules and build a fresh registry.
const PLUGIN_LIST_JS = join(ROOT, 'platforms/android/app/src/main/assets/www/cordova_plugins.js')
const PLUGIN_LIST_PLATFORM = join(ROOT, 'platforms/android/platform_www/cordova_plugins.js')

const pluginEntries = []
const pluginMeta = {}

for (const dir of pluginDirs) {
  const pluginRoot = join(SRC, dir)
  const xmlPath = join(pluginRoot, 'plugin.xml')
  const id = pluginId(xmlPath)
  if (!id) continue
  const xml = readFileSync(xmlPath, 'utf-8')

  const jsRe = /<js-module\s+src="([^"]+)"[^>]*\bname="([^"]+)"/g
  let jm
  while ((jm = jsRe.exec(xml)) !== null) {
    if (!jm[1].startsWith('www/')) continue
    const clobRe = /<clobbers\s+target="([^"]+)"/.exec(xml.slice(jm.index))
    const clobTarget = clobRe ? clobRe[1] : `cordova.plugins.${jm[2]}`
    pluginEntries.push({
      id: `${id}.${jm[2]}`,
      file: `plugins/${id}/${jm[1]}`,
      pluginId: id,
      clobbers: [clobTarget],
    })
  }

  // Version from package.json
  const pkgPath = join(pluginRoot, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      pluginMeta[id] = pkg.version || '1.0.0'
    } catch { pluginMeta[id] = '1.0.0' }
  } else {
    pluginMeta[id] = '1.0.0'
  }
}

const registryJs = `cordova.define('cordova/plugin_list', function(require, exports, module) {
  module.exports = ${JSON.stringify(pluginEntries, null, 2)};
  module.exports.metadata = ${JSON.stringify(pluginMeta, null, 2)};
});
`

for (const target of [PLUGIN_LIST_JS, PLUGIN_LIST_PLATFORM]) {
  if (!existsSync(target)) continue
  const current = readFileSync(target, 'utf-8')
  if (current !== registryJs) {
    writeFileSync(target, registryJs)
    console.log(`[sync-plugins] ✓ regenerated ${target.split('/').pop()}`)
  }
}

console.log('[sync-plugins] done.')