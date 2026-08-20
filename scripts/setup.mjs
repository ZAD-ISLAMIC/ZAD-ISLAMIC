import { execSync } from 'node:child_process'

function run(command) {
  console.log(`\n> ${command}`)
  execSync(command, { stdio: 'inherit' })
}

// Build the Moonshine STT native engine from the vendored source first, so
// the plugin's <source-file> entries (libs/arm64-v8a/*.so) exist when cordova
// copies them during `platform add` / `prepare`.
run('node cordova-plugins/moonshine-stt/src/android/native/build.mjs')

run('cordova platform add android')
run('cordova prepare')

console.log('\nSetup complete. You can now run: npm run build:apk')