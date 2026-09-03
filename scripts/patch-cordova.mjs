#!/usr/bin/env node
/**
 * Patch cordova-android's SystemWebChromeClient.java to fix
 * IllegalStateException: "Either grant() or deny() has been already called."
 *
 * Root cause: onPermissionRequest() can fire multiple times (e.g. when the
 * native SpeechRecognizer restarts its audio session). Cordova stores all
 * pending listeners in a single shared field, causing the second result to
 * grant() an already-resolved PermissionRequest.
 *
 * Strategy:
 *   1. Patch node_modules/cordova-android/framework (string replacement —
 *      this file is the pristine upstream source).
 *   2. Copy the patched framework file over platforms/android/CordovaLib,
 *      because the platform copy is created once at `platform add` time and
 *      is what actually gets compiled into the APK.
 *
 * This script is idempotent — safe to run multiple times.
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

const NODE_MODULES_FILE = resolve(
  'node_modules/cordova-android/framework/src/org/apache/cordova/engine/SystemWebChromeClient.java'
)
const PLATFORM_FILE = resolve(
  'platforms/android/CordovaLib/src/org/apache/cordova/engine/SystemWebChromeClient.java'
)
const MANIFEST_FILE = resolve(
  'platforms/android/app/src/main/AndroidManifest.xml'
)

const PATCH_MARKER = 'pendingPermissionListeners'
const ORIGINAL_FIELD = 'private PermissionListener permissionListener;'

/** Apply the string replacements to the pristine upstream source. */
function patchSource(content) {
  return content
    // 1. Replace the single listener field → thread-safe list
    .replace(
      'private PermissionListener permissionListener;',
      [
        'private final java.util.List<PermissionListener> pendingPermissionListeners',
        '    = java.util.Collections.synchronizedList(new java.util.ArrayList<>());',
      ].join(' ')
    )
    // 2. Replace the launcher callback: resolve ALL pending listeners
    //    Handles both multi-line and single-line formats
    .replace(
      /permissionLauncher = parentEngine\.cordova\.getActivity\(\)\.registerForActivityResult\(\s*new ActivityResultContracts\.RequestMultiplePermissions\(\), isGranted -> \{\s*if \(permissionListener != null\) \{\s*boolean granted = true;/,
      [
        'permissionLauncher = parentEngine.cordova.getActivity().registerForActivityResult(',
        '    new ActivityResultContracts.RequestMultiplePermissions(), isGranted -> {',
        '        boolean granted = true;',
      ].join('\n')
    )
    .replace(
      /for \(Map\.Entry<String, Boolean> permission : isGranted\.entrySet\(\)\) \{\s*if \(!permission\.getValue\(\)\) granted = false;\s*\}\s*permissionListener\.onPermissionSelect\(granted\);\s*\}/,
      [
        '        for (Map.Entry<String, Boolean> permission : isGranted.entrySet()) {',
        '            if (!permission.getValue()) granted = false;',
        '        }',
        '        java.util.List<PermissionListener> listeners;',
        '        synchronized (pendingPermissionListeners) {',
        '            listeners = new ArrayList<>(pendingPermissionListeners);',
        '            pendingPermissionListeners.clear();',
        '        }',
        '        for (PermissionListener listener : listeners) {',
        '            try {',
        '                listener.onPermissionSelect(granted);',
        '            } catch (Exception ignored) {',
        '                // Request already resolved — safe to ignore.',
        '            }',
        '        }',
      ].join('\n')
    )
    // 3. Replace onPermissionRequest body — handles both formats
    .replace(
      /permissionListener = \(isGranted\) -> \{\s*if \(isGranted\) \{\s*request\.grant\(request\.getResources\(\)\);\s*\} else \{\s*request\.deny\(\);\s*\}\s*\};\s*permissionLauncher\.launch\(permissions\);/,
      [
        '        PermissionListener listener = (isGranted) -> {',
        '            try {',
        '                if (isGranted) {',
        '                    request.grant(request.getResources());',
        '                } else {',
        '                    request.deny();',
        '                }',
        '            } catch (IllegalStateException e) {',
        '                LOG.w(LOG_TAG, "PermissionRequest already resolved: " + e.getMessage());',
        '            }',
        '        };',
        '        synchronized (pendingPermissionListeners) {',
        '            pendingPermissionListeners.add(listener);',
        '        }',
        '        permissionLauncher.launch(permissions);',
      ].join('\n')
    )
}

// ---- 1. Patch node_modules framework (pristine upstream source) ----
if (!existsSync(NODE_MODULES_FILE)) {
  console.error('[patch-cordova] node_modules framework not found.')
  process.exit(1)
}

{
  if (process.env.FDROID_BUILD === '1') {
    console.log('[patch-cordova] FDROID_BUILD detected — leaving framework pristine (platform handles it).')
  } else {
    const content = readFileSync(NODE_MODULES_FILE, 'utf-8')

    if (content.includes(PATCH_MARKER)) {
      console.log('[patch-cordova] node_modules already patched — skipping.')
    } else if (!content.includes(ORIGINAL_FIELD)) {
      console.error('[patch-cordova] Unexpected framework content — cannot patch.')
      process.exit(1)
    } else {
      writeFileSync(NODE_MODULES_FILE, patchSource(content), 'utf-8')
      console.log('[patch-cordova] ✓ node_modules SystemWebChromeClient.java patched.')
    }
  }
}

// ---- 2. Sync the patched framework into the platform's CordovaLib ----
// In the F-Droid build environment the fresh platform file may differ from the
// node_modules framework this patch was written against, so copying a patched
// file that no longer matches would break compilation. In that case skip the
// copy and let the pristine platform file compile.
if (process.env.FDROID_BUILD === '1') {
  console.log('[patch-cordova] FDROID_BUILD detected — using pristine platform file (skip patch sync).')
} else if (existsSync(PLATFORM_FILE)) {
  const framework = readFileSync(NODE_MODULES_FILE, 'utf-8')
  const platform = readFileSync(PLATFORM_FILE, 'utf-8')
  if (framework === platform) {
    console.log('[patch-cordova] platform CordovaLib already in sync — skipping.')
  } else {
    copyFileSync(NODE_MODULES_FILE, PLATFORM_FILE)
    console.log('[patch-cordova] ✓ platform CordovaLib SystemWebChromeClient.java synced from framework.')
  }
} else {
  console.log('[patch-cordova] No platform CordovaLib found — nothing to sync.')
}

// ---- 3. Ensure extractNativeLibs is set in AndroidManifest.xml ----
// The .so native libraries need extraction for Google Play 16KB page-size compatibility.
// cordova prepare may reset the manifest, so we re-apply this flag idempotently.
if (existsSync(MANIFEST_FILE)) {
  const manifest = readFileSync(MANIFEST_FILE, 'utf-8')
  if (!manifest.includes('extractNativeLibs')) {
    const patched = manifest.replace(
      /<application[^>]*android:supportsRtl="true"[^>]*/g,
      (match) => match.replace(/android:supportsRtl="true"/, 'android:supportsRtl="true" android:extractNativeLibs="true"')
    )
    writeFileSync(MANIFEST_FILE, patched, 'utf-8')
    console.log('[patch-cordova] ✓ AndroidManifest.xml: extractNativeLibs ensured.')
  } else {
    console.log('[patch-cordova] AndroidManifest.xml already has extractNativeLibs — skipping.')
  }
} else {
  console.log('[patch-cordova] No AndroidManifest.xml found — skipping manifest patch.')
}

// ---- 4. Post-prepare: restore .so files and plugin Java sources ----
// cordova-android 15 does not auto-copy plugin native libs / Java sources into
// platforms/ when `platforms/` is deleted. We re-inject them idempotently.
const APP_SRC_MAIN = resolve('platforms/android/app/src/main')
const JNI_LIBS_DIR = join(APP_SRC_MAIN, 'jniLibs', 'arm64-v8a')
const JAVA_DIR = join(APP_SRC_MAIN, 'java', 'com', 'rn0x')
const BUILD_GRADLE = resolve('platforms/android/app/build.gradle')
const MOONSHINE_PLUGIN = resolve('cordova-plugins/moonshine-stt/src/android')

// --- 4a. Copy .so files ---
if (existsSync(MOONSHINE_PLUGIN)) {
  mkdirSync(JNI_LIBS_DIR, { recursive: true })
  const srcSoDir = join(MOONSHINE_PLUGIN, 'libs', 'arm64-v8a')
  if (existsSync(srcSoDir)) {
    for (const file of readdirSync(srcSoDir)) {
      if (file.endsWith('.so')) {
        copyFileSync(join(srcSoDir, file), join(JNI_LIBS_DIR, file))
      }
    }
    console.log('[patch-cordova] ✓ .so files copied to jniLibs/arm64-v8a/')
  } else {
    console.log('[patch-cordova] ⚠ moonshine-stt src/android/libs not found — skipping .so copy.')
  }
}

// --- 4b. Copy plugin Java sources (prayerwatch, downloader, fileopener, etc.) ---
// Note: plugin src/android/ contains a 'com/' subdirectory; we scan recursively for .java files.
const PLUGIN_JAVA_SOURCES = [
  { src: 'cordova-plugins/com.rn0x.prayerwatch/src/android', target: 'prayerwatch' },
  { src: 'cordova-plugins/com.rn0x.downloader/src/android', target: 'downloader' },
  { src: 'cordova-plugins/com.rn0x.fileopener/src/android', target: 'fileopener' },
  { src: 'cordova-plugins/com.rn0x.prayerlocation/src/android', target: 'prayerlocation' },
  { src: 'cordova-plugins/com.rn0x.qibla/src/android', target: 'qibla' },
]
for (const { src, target } of PLUGIN_JAVA_SOURCES) {
  const srcDir = resolve(src)
  if (!existsSync(srcDir)) continue
  const destDir = join(JAVA_DIR, target)
  mkdirSync(destDir, { recursive: true })
  // Recursively find all .java files under srcDir
  function findJavaFiles(dir) {
    const results = []
    for (const file of readdirSync(dir)) {
      const full = join(dir, file)
      const st = statSync(full)
      if (st.isDirectory()) {
        results.push(...findJavaFiles(full))
      } else if (file.endsWith('.java')) {
        results.push(full)
      }
    }
    return results
  }
  const javaFiles = findJavaFiles(srcDir)
  for (const file of javaFiles) {
    copyFileSync(file, join(destDir, file.split('/').pop()))
  }
  const count = readdirSync(destDir).filter(f => f.endsWith('.java')).length
  if (count > 0) console.log(`[patch-cordova] ✓ ${target}/.java (${count} files)`)
}

// --- 4c. Ensure androidx.work dependency in build.gradle ---
// Insert AFTER the app-level "dependencies {" block (the one inside android{}),
// which is always the LAST occurrence in cordova-android 15's generated build.gradle.
if (existsSync(BUILD_GRADLE)) {
  let gradle = readFileSync(BUILD_GRADLE, 'utf-8')
  if (!gradle.includes('androidx.work:work-runtime')) {
    const depLine = '    implementation "androidx.work:work-runtime:2.9.1"'
    const marker = 'dependencies {'
    // Use lastIndexOf to find the LAST (app-level) dependencies block
    const lastIdx = gradle.lastIndexOf(marker)
    if (lastIdx > -1) {
      gradle = gradle.slice(0, lastIdx + marker.length).concat('\n', depLine, gradle.slice(lastIdx + marker.length))
      writeFileSync(BUILD_GRADLE, gradle)
      console.log('[patch-cordova] ✓ build.gradle: androidx.work dependency added.')
    }
  } else {
    console.log('[patch-cordova] build.gradle already has work-runtime — skipping.')
  }
}
