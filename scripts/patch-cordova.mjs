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

import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

const NODE_MODULES_FILE = resolve(
  'node_modules/cordova-android/framework/src/org/apache/cordova/engine/SystemWebChromeClient.java'
)
const PLATFORM_FILE = resolve(
  'platforms/android/CordovaLib/src/org/apache/cordova/engine/SystemWebChromeClient.java'
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
    .replace(
      [
        'permissionLauncher = parentEngine.cordova.getActivity().registerForActivityResult(',
        '    new ActivityResultContracts.RequestMultiplePermissions(), isGranted -> {',
        '        if (permissionListener != null) {',
        '            boolean granted = true;',
      ].join('\n'),
      [
        'permissionLauncher = parentEngine.cordova.getActivity().registerForActivityResult(',
        '    new ActivityResultContracts.RequestMultiplePermissions(), isGranted -> {',
        '        boolean granted = true;',
      ].join('\n')
    )
    .replace(
      [
        '            for (Map.Entry<String, Boolean> permission : isGranted.entrySet()) {',
        '                if (!permission.getValue()) granted = false;',
        '            }',
        '            permissionListener.onPermissionSelect(granted);',
        '        }',
      ].join('\n'),
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
    // 3. Replace onPermissionRequest body
    .replace(
      [
        '        String[] permissions = permissionList.toArray(new String[0]);',
        '        permissionListener = (isGranted) -> {',
        '            if (isGranted) {',
        '                request.grant(request.getResources());',
        '            } else {',
        '                request.deny();',
        '            }',
        '        };',
        '        permissionLauncher.launch(permissions);',
      ].join('\n'),
      [
        '        String[] permissions = permissionList.toArray(new String[0]);',
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

// ---- 2. Sync the patched framework into the platform's CordovaLib ----
if (existsSync(PLATFORM_FILE)) {
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
