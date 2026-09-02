import { execSync } from 'node:child_process'

const release = process.argv.includes('--release')
const bundle = process.argv.includes('--bundle')
const skipNative = process.argv.includes('--skip-native') || process.env.SKIP_NATIVE_BUILD === '1'
const skipSigning = process.argv.includes('--no-sign')
const isFdroid = process.env.FDROID_BUILD === '1'

const localBin = new URL('../node_modules/.bin', import.meta.url).pathname
process.env.PATH = `${localBin}:${process.env.PATH || ''}`

function run(command) {
  console.log(`\n> ${command}`)
  execSync(command, { stdio: 'inherit' })
}

if (!isFdroid) {
  run('node scripts/patch-cordova.mjs')
}

if (!skipNative) {
  run('node cordova-plugins/moonshine-stt/src/android/native/build.mjs')
}

run('vite build')

run('python3 scripts/generate-icons.py')

run('cordova prepare')

if (isFdroid) {
  const fs = await import('node:fs')
  fs.writeFileSync('platforms/android/.fdroid_build', '')
}

if (release) run('node scripts/patch-gradle-props.mjs')

const signingArgs = isFdroid || skipSigning ? '' : ' --buildConfig build.json'
const pkgTypeArg = bundle ? ' -- --packageType=bundle' : (isFdroid ? ' -- --packageType=apk' : '')
run(`cordova compile android${release ? ' --release' : ''}${release ? signingArgs : ''}${pkgTypeArg}`)

console.log('\nBuild complete. Output:')
console.log(
  bundle
    ? 'platforms/android/app/build/outputs/bundle/release/'
    : release
      ? 'platforms/android/app/build/outputs/apk/release/'
      : 'platforms/android/app/build/outputs/apk/debug/'
)
