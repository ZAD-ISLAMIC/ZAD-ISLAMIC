import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'resources',
  'audio',
  'ui'
)
const SAMPLE_RATE = 44100

function encodeWav(samples) {
  const n = samples.length
  const buffer = Buffer.alloc(44 + n * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + n * 2, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(SAMPLE_RATE, 24)
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    buffer.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2)
  }
  return buffer
}

function envelope(i, n, attack = 0.01, release = 0.6) {
  const a = Math.min(1, i / (attack * SAMPLE_RATE))
  const r = Math.max(0, 1 - i / (release * SAMPLE_RATE))
  return a * r
}

function pluck(freq, seconds, harmonicMix = 0.25) {
  const n = Math.floor(seconds * SAMPLE_RATE)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    let s =
      Math.sin(2 * Math.PI * freq * t) +
      harmonicMix * Math.sin(2 * Math.PI * freq * 2 * t) +
      harmonicMix * 0.5 * Math.sin(2 * Math.PI * freq * 3.6 * t)
    s *= envelope(i, n, 0.002, seconds * 0.9)
    s *= Math.exp(-3.2 * t)
    out[i] = s
  }
  return out
}

function normalize(samples, peak = 0.85) {
  let max = 0
  for (const s of samples) max = Math.max(max, Math.abs(s))
  const scale = max > 0 ? peak / max : 1
  return samples.map((s) => s * scale)
}

function tickSound() {
  const base = pluck(1850, 0.14, 0.3)
  const wood = pluck(520, 0.11, 0.4)
  const n = Math.max(base.length, wood.length)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    out[i] = base[i] * 0.55 + wood[i] * 0.45
  }
  return normalize(out)
}

function doneSound() {
  const noteA = pluck(880, 0.5, 0.18)
  const noteB = pluck(1174.66, 0.55, 0.18)
  const noteC = pluck(1567.98, 0.7, 0.12)
  const n = Math.max(noteA.length, noteB.length, noteC.length)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    out[i] = noteA[i] * 0.7 + noteB[i] * 0.7 + (i > 0.08 * SAMPLE_RATE ? noteC[i] : 0) * 0.8
  }
  return normalize(out)
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(join(OUT_DIR, 'tick.wav'), encodeWav(tickSound()))
writeFileSync(join(OUT_DIR, 'done.wav'), encodeWav(doneSound()))
console.log('ui sounds generated in', OUT_DIR)
