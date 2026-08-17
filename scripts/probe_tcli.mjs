#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const [, , wavPath, modelPath = '/data/local/tmp/tiny.gguf'] = process.argv

if (!wavPath) {
  console.error('usage: node scripts/probe_tcli.mjs <wav-path> [model-path]')
  process.exit(1)
}

if (!existsSync(wavPath)) {
  console.error(`missing wav: ${wavPath}`)
  process.exit(1)
}

const devPath = '/data/local/tmp/probe.wav'
const push = spawnSync('adb', ['push', wavPath, devPath], { encoding: 'utf8' })
if (push.status !== 0) {
  console.error(push.stdout || '')
  console.error(push.stderr || '')
  process.exit(push.status || 1)
}

const run = spawnSync('adb', ['shell', '/data/local/tmp/tcli', '-m', modelPath, devPath], {
  encoding: 'utf8',
  timeout: 30000,
})

if (run.stdout) process.stdout.write(run.stdout)
if (run.stderr) process.stderr.write(run.stderr)
process.exit(run.status || 0)
