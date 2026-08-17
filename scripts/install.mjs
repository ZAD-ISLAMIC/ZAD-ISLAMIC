import { execSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const release = process.argv.includes('--release')

const dir = release
  ? 'platforms/android/app/build/outputs/apk/release'
  : 'platforms/android/app/build/outputs/apk/debug'

let files
try {
  files = readdirSync(dir).filter((f) => f.endsWith('.apk'))
} catch {
  files = []
}

if (files.length === 0) {
  console.error(`No APK found in ${dir}. Build first: npm run build:apk${release ? ':release' : ''}`)
  process.exit(1)
}

const latest = files
  .map((f) => ({ path: f, mtime: statSync(resolve(dir, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)[0]

const apk = resolve(dir, latest.path)
console.log(`Installing: ${apk}`)
execSync(`adb install -r "${apk}"`, { stdio: 'inherit' })
console.log('Installed successfully.')