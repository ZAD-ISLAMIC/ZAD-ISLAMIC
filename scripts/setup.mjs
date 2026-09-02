import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const localBin = new URL('../node_modules/.bin', import.meta.url).pathname
process.env.PATH = `${localBin}:${process.env.PATH || ''}`

function run(command) {
  console.log(`\n> ${command}`)
  execSync(command, { stdio: 'inherit' })
}

// Build native first so .so files exist before platform copies them.
run('node cordova-plugins/moonshine-stt/src/android/native/build.mjs')

// Remove + re-add platform so plugins are freshly installed from package.json.
if (existsSync('platforms/android')) {
  run('cordova platform rm android')
}
run('cordova platform add android')

console.log('\nSetup complete. You can now run: npm run build:apk')
