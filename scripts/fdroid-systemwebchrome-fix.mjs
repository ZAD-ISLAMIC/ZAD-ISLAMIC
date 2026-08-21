import { readFileSync, writeFileSync, existsSync } from 'node:fs'

// F-Droid before_compile hook: cordova-android 15's SystemWebChromeClient uses
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
const MARKER = 'platforms/android/.fdroid_build'
if (!existsSync(MARKER)) {
  process.exit(0)
}

const target =
  'platforms/android/CordovaLib/src/org/apache/cordova/engine/SystemWebChromeClient.java'

if (!existsSync(target)) {
  console.log('[fdroid-fix] target not found — nothing to patch')
  process.exit(0)
}

let s = readFileSync(target, 'utf8')
if (!s.includes('androidx.activity.result')) {
  console.log('[fdroid-fix] already free of androidx.activity.result — skip')
  process.exit(0)
}

const lines = s.split('\n')
const out = []
let skipBlock = false
for (const line of lines) {
  // Replace the `permissionLauncher` field with an inline CordovaPlugin that
  // resolves pending PermissionListeners when cordova returns the result.
  if (line.includes('private final ActivityResultLauncher<String[]> permissionLauncher;')) {
    out.push('    private final CordovaPlugin permissionPlugin = new CordovaPlugin() {')
    out.push('        @Override')
    out.push('        public void onRequestPermissionResult(int requestCode, String[] permissions, int[] grantResults) throws JSONException {')
    out.push('            boolean granted = true;')
    out.push('            for (int r : grantResults) { if (r != PackageManager.PERMISSION_GRANTED) granted = false; }')
    out.push('            java.util.List<PermissionListener> listeners;')
    out.push('            synchronized (pendingPermissionListeners) {')
    out.push('                listeners = new ArrayList<>(pendingPermissionListeners);')
    out.push('                pendingPermissionListeners.clear();')
    out.push('            }')
    out.push('            for (PermissionListener listener : listeners) {')
    out.push('                try { listener.onPermissionSelect(granted); } catch (Exception ignored) {}')
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

// Ensure CordovaPlugin + JSONException are imported.
if (!s.includes('import org.apache.cordova.CordovaPlugin;')) {
  s = s.replace(
    'import org.apache.cordova.engine.SystemWebViewEngine;',
    'import org.apache.cordova.engine.SystemWebViewEngine;\nimport org.apache.cordova.CordovaPlugin;\nimport org.json.JSONException;'
  )
}

writeFileSync(target, s)
console.log('[fdroid-fix] rewired SystemWebChromeClient permission flow to cordova core (no androidx.activity)')
