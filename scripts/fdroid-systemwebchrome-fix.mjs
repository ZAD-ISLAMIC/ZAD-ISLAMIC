#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

// F-Droid before_compile hook: cordova-android's SystemWebChromeClient uses
// androidx.activity.result.ActivityResultLauncher / ActivityResultContracts to
// request microphone/camera permissions. The F-Droid build server does not have
// androidx.activity on CordovaLib's compile classpath, so the stock file fails
// to compile ("cannot find symbol"). We rewire the SAME permission flow to use
// cordova core's requestPermissions() (CordovaInterface -> ActivityCompat), which
// is always available and preserves identical runtime behavior. No app feature
// is removed or changed.
//
// Runs as a `before_compile` cordova hook: it executes AFTER `cordova compile`'s
// internal `prepare` (which would otherwise wipe an earlier edit) and right
// before javac. Activated only when the F-Droid marker file exists.
//
// We deliberately avoid the upstream `PermissionListener` type (its exact shape
// differs between cordova-android builds / the F-Droid platform copy) and define
// our own `PermissionCallback` interface so the wiring is self-contained.
const MARKER = 'platforms/android/.fdroid_build'
if (!existsSync(MARKER)) {
  process.exit(0)
}

const src =
  'node_modules/cordova-android/framework/src/org/apache/cordova/engine/SystemWebChromeClient.java'
const target =
  'platforms/android/CordovaLib/src/org/apache/cordova/engine/SystemWebChromeClient.java'

if (!existsSync(target)) {
  console.log('[fdroid-fix] target not found — nothing to patch')
  process.exit(0)
}

// Apply the fix to the PRISTINE framework source (the one cordova itself copies
// into CordovaLib), then overwrite the platform copy. This avoids relying on the
// exact shape of the platform-generated file (which cordova rewrites during
// `platform add` and differs from the framework source).
if (!existsSync(src)) {
  console.log('[fdroid-fix] framework source not found — skipping')
  process.exit(0)
}

let s = readFileSync(src, 'utf8')
if (!s.includes('androidx.activity.result')) {
  console.log('[fdroid-fix] already free of androidx.activity.result — skip')
  process.exit(0)
}

const lines = s.split('\n')
const out = []
let skipBlock = false
for (const line of lines) {
  // Replace the `permissionLauncher` field with an inline CordovaPlugin that
  // resolves pending PermissionCallback callbacks.
  if (line.includes('private final ActivityResultLauncher<String[]> permissionLauncher;')) {
    out.push('    private final org.apache.cordova.CordovaPlugin permissionPlugin = new org.apache.cordova.CordovaPlugin() {')
    out.push('        @Override')
    out.push('        public void onRequestPermissionResult(int requestCode, String[] permissions, int[] grantResults) throws org.json.JSONException {')
    out.push('            boolean granted = true;')
    out.push('            for (int r : grantResults) { if (r != PackageManager.PERMISSION_GRANTED) granted = false; }')
    out.push('            java.util.List<PermissionCallback> listeners;')
    out.push('            synchronized (pendingPermissionListeners) {')
    out.push('                listeners = new ArrayList<>(pendingPermissionListeners);')
    out.push('                pendingPermissionListeners.clear();')
    out.push('            }')
    out.push('            for (PermissionCallback cb : listeners) {')
    out.push('                try { cb.onResult(granted); } catch (Exception ignored) {}')
    out.push('            }')
    out.push('        }')
    out.push('    };')
    continue
  }
  // Drop the registerForActivityResult(...) lambda assignment block.
  if (line.includes('permissionLauncher = parentEngine.cordova.getActivity().registerForActivityResult(')) {
    skipBlock = true
    continue
  }
  if (skipBlock) {
    if (line.trim() === '});') skipBlock = false
    continue
  }
  out.push(line)
}
s = out.join('\n')

// Wire the launch call to cordova core instead of the activity-result launcher.
s = s.replace(
  'permissionLauncher.launch(permissions);',
  'parentEngine.cordova.requestPermissions(permissionPlugin, 0, permissions);'
)

// Remove the unavailable androidx.activity.result imports.
s = s
  .replace('import androidx.activity.result.ActivityResultLauncher;\n', '')
  .replace('import androidx.activity.result.contract.ActivityResultContracts;\n', '')

// Replace any remaining upstream PermissionListener references with our own
// self-contained PermissionCallback interface. Drop its import first so we
// don't end up importing a non-existent org.apache.cordova.PermissionCallback.
s = s.replace(/import .*PermissionListener;\n/, '')
s = s.split('PermissionListener').join('PermissionCallback')
s = s.split('onPermissionSelect').join('onResult')

// Ensure the PermissionCallback interface is declared (only when the upstream
// file did NOT already define a PermissionListener that we renamed to it).
if (!s.includes('interface PermissionCallback')) {
  s = s.replace(
    'public class SystemWebChromeClient extends WebChromeClient {',
    'public class SystemWebChromeClient extends WebChromeClient {\n\n    private interface PermissionCallback {\n        void onResult(boolean granted);\n    }'
  )
}

writeFileSync(target, s)
console.log('[fdroid-fix] rewired SystemWebChromeClient permission flow to cordova core (no androidx.activity)')
