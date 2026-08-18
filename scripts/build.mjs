import { execSync } from 'node:child_process'

const release = process.argv.includes('--release')

function run(command) {
  console.log(`\n> ${command}`)
  execSync(command, { stdio: 'inherit' })
}

// Patch cordova-android's SystemWebChromeClient (IllegalStateException fix)
run('node scripts/patch-cordova.mjs')

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

// `cordova build` re-runs prepare, so the manifest cleanup happens in the
// before_compile hook (config.xml) — just before javac/d8/packaging.

run(`cordova build android${release ? ' --release --buildConfig build.json' : ''}`)

console.log('\nBuild complete. APK output:')
console.log(release ? 'platforms/android/app/build/outputs/apk/release/' : 'platforms/android/app/build/outputs/apk/debug/')