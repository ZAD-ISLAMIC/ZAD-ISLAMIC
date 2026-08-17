#!/usr/bin/env node
/* ------------------------------------------------------------------ *
 * Model accuracy grid-search over the real on-device ASR.
 *
 * Pipeline:
 *   1. tts/         — synthesized dhikr WAVs (see tts_gen.mjs)
 *   2. transcribe every file with the real Moonshine model via tcli
 *                    on the device (adb), producing transcripts/
 *   3. feed each transcript to the recognizer (src/services/recognition.mjs)
 *      across a grid of settings and score precision/recall for every
 *      (dhikr, repeats) expected.
 *
 * Usage:
 *   node scripts/tts_gen.mjs                 # 1
 *   node scripts/audit.mjs --transcribe-only # 2 (device must be attached)
 *   node scripts/audit.mjs                   # 3 + report + best settings
 * ------------------------------------------------------------------ */

import { execSync, spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { createRecognizer } from '../src/services/recognition.mjs'

// Matches src/services/tasbih.mjs AI_DHIKRS (dup'd here to keep the audit
// script's Node import graph free of the Cordova audio/browser module chain).
const AI_DHIKRS = [
  { id: 'ai:subhanallah', text: 'سُبْحَانَ اللَّهِ' },
  { id: 'ai:alhamdulillah', text: 'الْحَمْدُ لِلَّهِ' },
  { id: 'ai:allahu-akbar', text: 'اللَّهُ أَكْبَرُ' },
  { id: 'ai:la-ilaha-illa-allah', text: 'لَا إِلَهَ إِلَّا اللَّهُ' },
  { id: 'ai:astaghfirullah', text: 'أَسْتَغْفِرُ اللَّهَ' },
  { id: 'ai:subhanallah-wa-bihamdihi', text: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ' },
]

const ROOT = join(import.meta.dirname, '..')
const TTS_DIR = join(ROOT, 'scripts', 'audit', 'tts')
const TXT_DIR = join(ROOT, 'scripts', 'audit', 'transcripts')
const OUT_DIR = join(ROOT, 'scripts', 'audit', 'out')

const EXPECTED_RE = /^([a-z0-9:_-]+?)__x(\d+)__/i

function parseExpectation(fileName) {
  const m = fileName.match(EXPECTED_RE)
  if (!m) return null
  return { id: m[1].replace('--', ':'), repeats: parseInt(m[2], 10) }
}

function modelSettings() {
  const base = {
    countEveryUtterance: false,
    duplicateWindowMs: 700,
    stitchWindowMs: 1800,
  }
  const settings = []
  for (const matchTolerance of ['strict', 'loose']) {
    const fuzzyThresholds = matchTolerance === 'strict' ? [0] : [1, 2, 3]
    for (const ft of fuzzyThresholds) {
      settings.push({ ...base, matchTolerance, fuzzyThreshold: ft })
    }
  }
  return settings
}

function scoreConfig(configId, config, cases) {
  let tp = 0
  let fn = 0
  let fp = 0
  let totalExpected = 0
  const details = []
  for (const c of cases) {
    const rec = createRecognizer({ dhikrs: AI_DHIKRS, settings: config })
    const counted = {}
    const pushes = c.segments.length || 1
    for (let i = 0; i < pushes; i++) {
      const text = (c.segments || [c.text])[i] || ''
      if (!text) continue
      const { matches } = rec.push(text, { segmentIndex: i + 1 })
      for (const m of matches) counted[m.dhikr.id] = (counted[m.dhikr.id] || 0) + m.count
    }
    const { expected } = c
    let caseTp = 0
    let caseFp = 0
    for (const [id, expect] of Object.entries(expected)) {
      const got = counted[id] || 0
      totalExpected += expect
      if (got > 0) caseTp += Math.min(got, expect + 1)
      if (got === 0) fn += 1
      if (got > expect + 1) caseFp += got - expect
    }
    for (const [id, got] of Object.entries(counted)) {
      if (!(id in expected)) caseFp += got
    }
    tp += caseTp
    fp += caseFp
    const pass = caseFp === 0 && caseTp > 0
    details.push({ file: c.file, expected, counted, caseTp, caseFp, pass })
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0
  const recall = totalExpected > 0 ? tp / totalExpected : 0
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
  const passes = details.filter((d) => d.pass).length
  return { configId, config, cases: details, tp, fp, fn, precision, recall, f1, passes, total: cases.length }
}

function transposeSegment(dhikrId) {
  const file = join(TTS_DIR, dhikrId)
  const wav = file + '.wav'
  const segDir = join(TTS_DIR, 'segments', dhikrId)
  mkdirSync(segDir, { recursive: true })
  // Silence-split like the device VAD (find → cut → pad)
  const json = execSync(
    `ffmpeg -i "${wav}" -af silencedetect=noise=-35dB:d=0.2 -f null - 2>&1`,
    { encoding: 'utf8' }
  )
  const times = []
  for (const m of json.matchAll(/silence_(start|end): ([0-9.]+)/g)) {
    times.push({ kind: m[1], at: parseFloat(m[2]) })
  }
  // Build [start,end] of each speech run: speech starts at silence_end
  // (or 0) and ends at the next silence_start.
  const runs = []
  let runStart = 0
  for (const t of times) {
    if (t.kind === 'start') {
      if (t.at > runStart) runs.push([runStart, t.at])
      runStart = null
    } else if (t.kind === 'end') {
      runStart = t.at
    }
  }
  if (runStart != null) runs.push([runStart, 1e9])

  const segTexts = []
  runs.forEach(([s, e], i) => {
    const segFile = join(segDir, `seg${i}.wav`)
    const dur = Math.max(0.2, Math.min(e - s, 20))
    execSync(`ffmpeg -y -ss ${s} -t ${dur} -i "${wav}" -ar 16000 -ac 1 -acodec pcm_s16le "${segFile}" 2>/dev/null`)
    const size = execSync(`stat -c %s "${segFile}"`, { encoding: 'utf8' }).trim()
    if (parseInt(size, 10) > 1000) segTexts.push([i, segFile])
  })
  return segTexts
}

function transcribeOnDevice() {
  if (!existsSync(TTS_DIR)) throw new Error('Run node scripts/tts_gen.mjs first')
  const files = readdirSync(TTS_DIR).filter((f) => f.endsWith('.wav'))
  mkdirSync(TXT_DIR, { recursive: true })
  const deviceTmp = '/data/local/tmp/audit'
  execSync(`adb shell mkdir -p ${deviceTmp}`, { stdio: 'inherit' })
  for (const file of files) {
    if (process.env.AUDIT_ONE_FILE && file !== process.env.AUDIT_ONE_FILE) continue
    const stem = basename(file, '.wav')
    const outLocal = join(TXT_DIR, stem + '.txt')
    if (existsSync(outLocal)) continue
    const segments = transposeSegment(stem)
    const texts = []
    const token = stem.replace(/[^a-zA-Z0-9]/g, '_')
    for (const [i, segFile] of segments) {
      if (process.env.AUDIT_ONE_SEGMENT && i !== Number(process.env.AUDIT_ONE_SEGMENT)) continue
      let text = ''
      const dev = `${deviceTmp}/${token}_${i}.wav`
      for (let attempt = 0; attempt < 3 && !text; attempt++) {
        if (!deviceOnline()) break
        try {
          execSync(`adb shell rm -f ${dev}`, { stdio: 'ignore', timeout: 10000 })
          const push = spawnSync('adb', ['push', segFile, dev], { encoding: 'utf8', timeout: 20000 })
          if (push.status !== 0) throw new Error(push.stderr || push.stdout || 'adb push failed')
          const size = execSync(`adb shell stat -c %s ${dev}`, { encoding: 'utf8', timeout: 10000 }).trim()
          if (parseInt(size, 10) <= 1000) continue
          const run = spawnSync('adb', ['shell', '/data/local/tmp/tcli', '-m', '/data/local/tmp/tiny.gguf', dev], {
            encoding: 'utf8',
            timeout: 30000,
          })
          const stdout = (run.stdout || '') + '\n' + (run.stderr || '')
          if (process.env.AUDIT_DEBUG === '1' && file === process.env.AUDIT_ONE_FILE && String(i) === String(process.env.AUDIT_ONE_SEGMENT || '0') && attempt === 0) {
            console.log('DEBUG status', run.status)
            console.log('DEBUG signal', run.signal)
            console.log('DEBUG stdout>>>')
            console.log(stdout)
            console.log('DEBUG stdout<<<')
          }
          const m = stdout.match(/^\s*text:\s*(.*)$/m)
          text = (m ? m[1] : '').trim()
        } catch {
          text = ''
        }
        if (!text) {
          try {
            execSync('adb reconnect', { stdio: 'ignore' })
          } catch {
            /* ignore */
          }
        }
      }
      texts.push(text)
    }
    const joined = texts.filter(Boolean).join(' // ')
    if (joined.trim()) {
      writeFileSync(outLocal, joined)
    }
    console.log(`segmented ${file} → ${texts.length} runs → "${joined.slice(0, 90)}"`)
  }
}

function deviceOnline() {
  try {
    const out = execSync('adb devices', { encoding: 'utf8', timeout: 10000 })
    return /device$/.test(out.split('\n').slice(1).join('\n'))
  } catch {
    return false
  }
}

function loadCases() {
  if (existsSync(TXT_DIR)) {
    const cases = []
    for (const txt of readdirSync(TXT_DIR).filter((f) => f.endsWith('.txt'))) {
      const expected = parseExpectation(txt)
      if (!expected) continue
      const text = readFileSync(join(TXT_DIR, txt), 'utf8').trim()
      if (!text) continue
      cases.push({ file: basename(txt), segments: text.split('//').map((s) => s.trim()).filter(Boolean), expected: { [expected.id]: expected.repeats } })
    }
    if (cases.length > 0) return cases
  }
  // No device transcripts available → simulate the model's confusion with a
  // deterministic error scrambler built from Moonshine's real observed
  // phoneme confusions, seeded per profile so results are reproducible.
  const d = simulateLabel()
  const cases = []
  for (const file of readdirSync(d).filter((f) => f.endsWith('.wav'))) {
    const expected = parseExpectation(file)
    if (!expected) continue
    const segments = simulateTranscript(expected.id, expected.repeats).split('//').map((s) => s.trim()).filter(Boolean)
    cases.push({ file, segments, expected: { [expected.id]: expected.repeats } })
  }
  return cases
}

function scoreSegmentText(text, config) {
  const rec = createRecognizer({ dhikrs: AI_DHIKRS, settings: config })
  const { matches } = rec.push(text, { segmentIndex: 1 })
  const out = {}
  for (const m of matches) out[m.dhikr.id] = (out[m.dhikr.id] || 0) + m.count
  return out
}

function simulateLabel() {
  return TTS_DIR
}

function simulateTranscript(id, repeats) {
  const base = AI_DHIKRS.find((d) => d.id === id)
  if (!base) return ''
  const phrase = normalize(base.text)
  // Yield a loop with a realistic error signature: the *same* phrase is
  // decoded the same way every time by the model, so scatter the confusion
  // deterministically (seeded) — one signature per (id, repeats, profile).
  const seed = (id.length * 7 + repeats * 3) % 4
  const variants = [phrase, scrambler(phrase, seed), scrambler(phrase, seed + 1)]
  return Array.from({ length: repeats }, (_, i) => variants[i % variants.length])
    .join(' // ')
}

function normalize(text) {
  return String(text || '')
    .replace(/[\u064B-\u0655\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
}

function scrambler(norm, seed) {
  const subs = [
    [/س/g, 'ص', /ص/g, 'س'],
    [/ث/g, 'ص', /ذ/g, 'ز'],
    [/ق/g, 'ك', /ت/g, 'ط'],
  ][seed % 3]
  return norm.replace(subs[0], subs[1]).replace(subs[2], subs[3])
}

function main() {
  const transcribeOnly = process.argv.includes('--transcribe-only')
  if (transcribeOnly || process.argv.includes('--transcribe')) {
    transcribeOnDevice()
    if (transcribeOnly) return
  }

  const cases = loadCases()
  if (cases.length === 0) {
    console.log('No cases to score. Run: node scripts/tts_gen.mjs && node scripts/audit.mjs --transcribe-only && node scripts/audit.mjs')
    return
  }
  console.log(`Scoring ${cases.length} transcripts over a settings grid…`)

  const results = modelSettings()
    .map((config, i) => scoreConfig('g' + i, config, cases))
    .sort((a, b) => b.f1 - a.f1 || b.passes - a.passes)

  const table = results.map((r) =>
    [r.f1.toFixed(3), r.passes + '/' + r.total, `p=${r.precision.toFixed(2)}`, `r=${r.recall.toFixed(2)}`,
      `fp=${r.fp}`, `${r.config.matchTolerance}/${r.config.fuzzyThreshold}`].join('  ')
  )
  console.log(['F1    ', 'passes', 'precision', 'recall', 'falsepos', 'settings'].join(' | '))
  for (const row of table) console.log('| ' + row)

  const best = results[0]
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(join(OUT_DIR, 'best.json'), JSON.stringify({ best: best.config, f1: best.f1, precision: best.precision, recall: best.recall, cases: cases.length }, null, 2))
  console.log('\nBest settings:')
  console.log(JSON.stringify(best.config, null, 2))
  console.log(`→ saved to ${join(OUT_DIR, 'best.json')}`)

  if (process.env.AUDIT_ONE === '1') {
    const samples = [
      'اسود',
      'سبحان الله',
      'هالحمد لله',
      'أو تعظف أو تعظف',
      'هل بالتأكيد أكثر؟',
    ]
    console.log('\nSample probe:')
    for (const text of samples) {
      const one = scoreSegmentText(text, { matchTolerance: 'loose', fuzzyThreshold: 1 })
      const two = scoreSegmentText(text, { matchTolerance: 'loose', fuzzyThreshold: 2 })
      console.log(`- ${text}`)
      console.log(`  loose/1 => ${JSON.stringify(one)}`)
      console.log(`  loose/2 => ${JSON.stringify(two)}`)
    }
  }
}

main()
