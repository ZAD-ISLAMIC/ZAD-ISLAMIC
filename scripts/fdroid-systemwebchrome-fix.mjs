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
// The exact shape of the upstream file differs between cordova-android builds
// (sometimes `permissionListener` is a field, sometimes a local `PermissionListener
// listener`), so we key everything off `permissionLauncher` (present in all
// variants) and rewrite that into a self-contained CordovaPlugin + a
// `permissionListener` field, preserving the original onPermissionSelect flow.
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
  // Replace the `permissionLauncher` field with a `permissionListener` field plus
  // an inline CordovaPlugin that, on result, forwards to the original callback.
  if (line.includes('ActivityResultLauncher<String[]> permissionLauncher;')) {
    out.push('    private PermissionListener permissionListener;')
    out.push('    private final org.apache.cordova.CordovaPlugin permissionPlugin = new org.apache.cordova.CordovaPlugin() {')
    out.push('        @Override')
    out.push('        public void onRequestPermissionResult(int requestCode, String[] permissions, int[] grantResults) throws org.json.JSONException {')
    out.push('            boolean granted = true;')
    out.push('            for (int r : grantResults) { if (r != PackageManager.PERMISSION_GRANTED) granted = false; }')
    out.push('            if (permissionListener != null) permissionListener.onPermissionSelect(granted);')
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
s = s.split('permissionLauncher.launch(permissions);').join(
  'parentEngine.cordova.requestPermissions(permissionPlugin, 0, permissions);'
)

// Remove the unavailable androidx.activity.result imports.
s = s
  .replace('import androidx.activity.result.ActivityResultLauncher;\n', '')
  .replace('import androidx.activity.result.contract.ActivityResultContracts;\n', '')

// Ensure the upstream PermissionListener interface is present (some builds name
// the local var `permissionListener` and rely on this interface being declared).
if (!s.includes('interface PermissionListener')) {
  s = s.replace(
    'public class SystemWebChromeClient extends WebChromeClient {',
    'public class SystemWebChromeClient extends WebChromeClient {\n\n    private interface PermissionListener {\n        void onPermissionSelect(Boolean isGranted);\n    }'
  )
}

writeFileSync(target, s)
console.log('[fdroid-fix] rewired SystemWebChromeClient permission flow to cordova core (no androidx.activity)')
