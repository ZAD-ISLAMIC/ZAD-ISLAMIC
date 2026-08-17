import { execSync } from 'node:child_process'

function run(command) {
  console.log(`\n> ${command}`)
  execSync(command, { stdio: 'inherit' })
}

run('cordova platform add android')
run('cordova prepare')

console.log('\nSetup complete. You can now run: npm run build:apk')