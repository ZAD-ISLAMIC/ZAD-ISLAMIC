import { execSync } from 'node:child_process'

const release = process.argv.includes('--release')
const bundle = process.argv.includes('--bundle')
const skipNative = process.argv.includes('--skip-native') || process.env.SKIP_NATIVE_BUILD === '1'

function run(command) {
  console.log(`\n> ${command}`)
  execSync(command, { stdio: 'inherit' })
}

// Patch cordova-android's SystemWebChromeClient (IllegalStateException fix)
run('node scripts/patch-cordova.mjs')

// Build the Moonshine STT native engine from the vendored transcribe.cpp
// source (NDK cross-compile inside the plugin) so the app's native libs are
// reproducible from source (F-Droid requirement). Requires the Android NDK.
// Must run BEFORE sync-plugins so the freshly built .so are mirrored into the
// platform. Skip with --skip-native (e.g. when only building web assets).
if (!skipNative) {
  run('node cordova-plugins/moonshine-stt/src/android/native/build.mjs')
}

// Sync local plugin Java sources into plugins/ and the platform project
// (cordova prepare does not overwrite already-copied Java files, so we
// mirror our edited cordova-plugins sources here directly).
run('node scripts/sync-plugins.mjs')

// Remove any stray Cordova core-class duplicates in the app module that
// would break D8 dex-merging on release builds (platform rot).
run('node scripts/dedupe-platform.mjs')

run('vite build')

// Publish launcher / native splash layers into res/ (Cordova standard source
// folders) and notification icons into the platform; must run before prepare
// so the config.xml <icon>/splash entries see their source files.
run('python3 scripts/generate-icons.py')

// Ensure cordova plugins are synced (copies our modified plugin sources);
// also copies the res/ icon + splash layers into the platform.
run('cordova prepare')

// Force an English JVM locale for Gradle/bundletool. Under an Arabic OS locale
// (ar_SA) bundletool formats dex indices with Arabic-Indic digits (classes٢.dex),
// breaking --packageType=bundle. Must run after `cordova prepare` because prepare
// resets org.gradle.jvmargs to Cordova's default each time.
if (release) run('node scripts/patch-gradle-props.mjs')

// Use `cordova compile` (not build) so the jvmargs patch above survives — build
// re-runs prepare, which would wipe it. The manifest cleanup still runs via the
// before_compile hook (config.xml), just before javac/d8/packaging.
run(`cordova compile android${release ? ' --release --buildConfig build.json' : ''}${bundle ? ' -- --packageType=bundle' : ''}`)

console.log('\nBuild complete. Output:')
console.log(
  bundle
    ? 'platforms/android/app/build/outputs/bundle/release/'
    : release
      ? 'platforms/android/app/build/outputs/apk/release/'
      : 'platforms/android/app/build/outputs/apk/debug/'
)