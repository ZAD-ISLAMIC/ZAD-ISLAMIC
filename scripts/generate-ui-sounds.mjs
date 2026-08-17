#!/usr/bin/env node
/**
 * يولّد أصوات واجهة نظام الأسئلة (WAV) بصوت مُولَّد برمجيًا.
 * النتائج: correct.wav، wrong.wav، win.wav، lose.wav، star.wav
 * التشغيل: npm run gen:ui-sounds
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'resources', 'audio', 'ui')
const SAMPLE_RATE = 44100

/** توليد موجات بصيغة PCM 16-bit mono. */
function synth({ tones, type = 'sine', amp = 0.32, fade = 0.03 }) {
  const total = tones.reduce((sum, t) => sum + Math.max(0, t.tone?.duration || t.duration), 0)
  const samples = new Float32Array(Math.ceil(total * SAMPLE_RATE))
  let cursor = 0
  for (const step of tones) {
    const { freq, duration, gain = 1, when = 0 } = step
    const start = Math.floor(when * SAMPLE_RATE)
    const n = Math.floor(duration * SAMPLE_RATE)
    for (let i = 0; i < n; i += 1) {
      const t = i / SAMPLE_RATE
      let v = 0
      if (type === 'sine') v = Math.sin(2 * Math.PI * freq * t)
      else if (type === 'square') v = Math.sin(2 * Math.PI * freq * t) > 0 ? 1 : -1
      else if (type === 'triangle') v = 2 / Math.PI * Math.asin(Math.sin(2 * Math.PI * freq * t))
      else if (type === 'saw') v = 2 * (t * freq - Math.floor(t * freq + 0.5))
      // هجوم وانطفاء سلس لتجنّب «نقرات» مفاجئة
      const attack = Math.min(i / (fade * SAMPLE_RATE), 1)
      const release = Math.min((n - i) / (fade * SAMPLE_RATE), 1)
      const env = Math.min(attack, Math.max(release, 0))
      samples[start + i] += v * amp * gain * env
    }
    cursor = Math.max(cursor, start + n)
  }
  // كبح التشبع
  const max = Math.max(0.001, ...samples.map(Math.abs))
  const scale = Math.min(1, 0.95 / max)
  return samples.map((s) => s * scale)
}

function toWav(floats) {
  const n = floats.length
  const bytesPerSample = 2
  const dataSize = n * bytesPerSample
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24)
  buffer.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28)
  buffer.writeUInt16LE(bytesPerSample, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  let offset = 44
  for (const s of floats) {
    const v = Math.max(-1, Math.min(1, s))
    buffer.writeInt16LE(Math.round(v * 32767), offset)
    offset += bytesPerSample
  }
  return buffer
}

const SOUNDS = {
  'correct.wav': synth({
    type: 'sine',
    tones: [
      { freq: 523.25, duration: 0.12, when: 0 }, // C5
      { freq: 659.25, duration: 0.2, when: 0.1 }, // E5
    ],
  }),
  'wrong.wav': synth({
    type: 'square',
    amp: 0.22,
    tones: [{ freq: 155, duration: 0.18 }, { freq: 118, duration: 0.24, when: 0.16 }],
  }),
  'win.wav': synth({
    type: 'sine',
    amp: 0.3,
    tones: [
      { freq: 523.25, duration: 0.14, when: 0 }, // C5
      { freq: 659.25, duration: 0.14, when: 0.14 }, // E5
      { freq: 783.99, duration: 0.14, when: 0.28 }, // G5
      { freq: 1046.5, duration: 0.34, when: 0.42 }, // C6
    ],
  }),
  'lose.wav': synth({
    type: 'triangle',
    tones: [
      { freq: 392, duration: 0.22, when: 0 }, // G4
      { freq: 261.63, duration: 0.3, when: 0.22 }, // C4
    ],
  }),
  'star.wav': synth({
    type: 'sine',
    amp: 0.26,
    fade: 0.02,
    tones: [{ freq: 880, duration: 0.09, gain: 0.8 }, { freq: 1174.66, duration: 0.12, when: 0.08 }],
  }),
}

mkdirSync(OUT_DIR, { recursive: true })
let wrote = 0
for (const [name, floats] of Object.entries(SOUNDS)) {
  const file = join(OUT_DIR, name)
  writeFileSync(file, toWav(floats))
  wrote += 1
  const kb = Math.round(statSync(file).size / 1024)
  console.log(`✓ ${name} — ${(floats.length / SAMPLE_RATE).toFixed(2)}ث / ${kb}KB`)
}
console.log(`تم توليد ${wrote} ملفات صوت في ${OUT_DIR}`)