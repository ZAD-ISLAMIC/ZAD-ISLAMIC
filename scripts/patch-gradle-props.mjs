import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const propsPath = resolve(ROOT, 'platforms/android/gradle.properties')

const FLAGS = ['-Duser.language=en', '-Duser.country=US']

let props = readFileSync(propsPath, 'utf8')
const lines = props.split('\n')
const idx = lines.findIndex((l) => l.startsWith('org.gradle.jvmargs='))

if (idx !== -1) {
  let args = lines[idx].slice('org.gradle.jvmargs='.length)
  for (const flag of FLAGS) {
    if (!args.includes(flag)) args += ` ${flag}`
  }
  lines[idx] = `org.gradle.jvmargs=${args}`
} else {
  lines.push(`org.gradle.jvmargs=-Xmx2048m ${FLAGS.join(' ')}`)
}

const updated = lines.join('\n')
writeFileSync(propsPath, updated)
console.log('patched org.gradle.jvmargs with English JVM locale flags')