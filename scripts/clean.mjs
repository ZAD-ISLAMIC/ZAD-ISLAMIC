import { rmSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const all = process.argv.includes('--all')

const targets = ['www']
if (all) {
  targets.push('platforms', 'plugins')
}

for (const target of targets) {
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true })
    console.log(`removed ${target}/`)
  }
}

if (all) {
  execSync('cordova platform rm android --nosave', { stdio: 'inherit' }).catch?.(() => {})
  console.log('clean:all done')
} else {
  console.log('clean done (www/)')
}