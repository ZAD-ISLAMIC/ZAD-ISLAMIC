#!/usr/bin/env node
/* ------------------------------------------------------------------ *
 * Synthesize dhikr WAVs (16kHz mono, same format the device VAD uses)
 * from text, so the real on-device model can be transcription-audited.
 *
 * Each generated file is named `<dhikrId>__x<repeats>__<profile>.wav`,
 * e.g. `ai-subhanallah__x3__fast.wav`, so the audit knows what to expect.
 *
 * Usage:
 *   node scripts/tts_gen.mjs
 * ------------------------------------------------------------------ */

import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const TTS_DIR = join(ROOT, 'scripts', 'audit', 'tts')

const DHIKRS = {
  'ai:subhanallah': 'سُبْحَانَ اللَّهِ',
  'ai:alhamdulillah': 'الْحَمْدُ لِلَّهِ',
  'ai:allahu-akbar': 'اللَّهُ أَكْبَرُ',
  'ai:astaghfirullah': 'أَسْتَغْفِرُ اللَّهَ',
  'ai:la-ilaha-illa-allah': 'لَا إِلَهَ إِلَّا اللَّهُ',
}

// speed (words/min), gaps in ms, short-name
const PROFILES = [
  { speed: 130, gapMs: 500, name: 'slow' },
  { speed: 170, gapMs: 250, name: 'mid' },
  { speed: 210, gapMs: 120, name: 'fast' },
]

const REPEATS = [1, 3, 5]

function buildLine(text, gapMs) {
  // espeak word-gap is in 10ms units
  const wg = Math.max(1, Math.round(gapMs / 10))
  return text.split(' ').join(' ') // keep spacing control simple
}

const EXPECTED_RE = /^([a-z0-9:]+)__x(\d+)__/i

function fileNameFor(id, repeats, name) {
  return `${id.replace(':', '--')}__x${repeats}__${name}.wav`
}

function run() {
  mkdirSync(TTS_DIR, { recursive: true })
  for (const [id, text] of Object.entries(DHIKRS)) {
    for (const repeats of REPEATS) {
      for (const p of PROFILES) {
        const phrase = Array(repeats).fill(text).join(' ')
        const fileName = fileNameFor(id, repeats, p.name)
        const out = join(TTS_DIR, fileName)
        if (existsSync(out)) continue
        const line = buildLine(phrase, p.gapMs)
        execSync(
          `espeak-ng -v ar -s ${p.speed} -g 8 -w "${out}" --stdin`,
          { input: line, stdio: ['pipe', 'inherit', 'inherit'] }
        )
        // Normalize to 16kHz mono PCM (device VAD expects 16k mono shorts)
        execSync(`ffmpeg -y -i "${out}" -ar 16000 -ac 1 -acodec pcm_s16le "${out}.tmp.wav" 2>/dev/null && mv "${out}.tmp.wav" "${out}"`)
        console.log(`generated ${fileName}`)
      }
    }
  }
  console.log(`\n${Object.keys(DHIKRS).length} dhikrs × ${REPEATS.length} repeats × ${PROFILES.length} profiles → ${TTS_DIR}`)
}

run()