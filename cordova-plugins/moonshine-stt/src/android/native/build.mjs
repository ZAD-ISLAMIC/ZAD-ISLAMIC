#!/usr/bin/env node
/**
 * Build the Moonshine STT native engine (transcribe.cpp v0.2.0 + ggml) from
 * the vendored source with the Android NDK, and the JNI wrapper linking it.
 *
 * Outputs (all arm64-v8a, matching the historically shipped binaries):
 *   libtranscribe.so  libggml.so  libggml-base.so  libggml-cpu.so
 *   libmoonshine_stt.so
 * into cordova-plugins/moonshine-stt/src/android/libs/arm64-v8a/
 *
 * Requires:
 *   - ANDROID_HOME (or ANDROID_SDK_ROOT) with a 27.x NDK installed
 *   - cmake + ninja on PATH
 *
 * Usage:
 *   node scripts/build-native.mjs            # from repo root, or
 *   node cordova-plugins/moonshine-stt/src/android/native/build.mjs
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------
const NATIVE = __dirname
const TSC = path.join(NATIVE, 'transcribe.cpp')          // vendored upstream
const BUILD = path.join(NATIVE, 'build')               // intermediate build dir
const OUT_DIR = path.join(NATIVE, '..', 'libs', 'arm64-v8a') // final jniLibs (plugin libs dir)
const ABI = 'arm64-v8a'

// ---------------------------------------------------------------------
// Toolchain detection
// ---------------------------------------------------------------------
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
if (!sdk) {
  console.error('ANDROID_HOME is not set. Point it at the Android SDK root.')
  process.exit(1)
}
const ndkDir = path.join(sdk, 'ndk')
if (!fs.existsSync(ndkDir)) {
  console.error(`No NDK found under ${ndkDir}. Install NDK 27.x (r27b).`)
  process.exit(1)
}
const ndks = fs.readdirSync(ndkDir).filter((n) => /^\d+\.\d+\.\d+/.test(n)).sort()
if (ndks.length === 0) {
  console.error(`No NDK version dirs under ${ndkDir}.`)
  process.exit(1)
}
const NDK = path.join(ndkDir, ndks[ndks.length - 1])
const TOOLCHAIN = path.join(NDK, 'build', 'cmake', 'android.toolchain.cmake')

console.log(`* NDK:     ${NDK}`)
console.log(`* ABI:     ${ABI} (android-24)`)

const run = (args, cwd) => {
  console.log(`\n> ${args.join(' ')}`)
  execFileSync(args[0], args.slice(1), {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ANDROID_NDK: NDK },
  })
}

// Common cmake configure args (shared libtranscribe + ggml, CPU-only).
const common = [
  `-DCMAKE_TOOLCHAIN_FILE=${TOOLCHAIN}`,
  `-DANDROID_ABI=${ABI}`,
  '-DANDROID_PLATFORM=android-24',
  `-DANDROID_NDK=${NDK}`,
  '-DCMAKE_BUILD_TYPE=Release',
  '-DTRANSCRIBE_BUILD_SHARED=ON',
  '-DTRANSCRIBE_BUILD_TESTS=OFF',
  '-DTRANSCRIBE_BUILD_EXAMPLES=OFF',
  '-DTRANSCRIBE_BUILD_TOOLS=OFF',
  '-DTRANSCRIBE_INSTALL=OFF',
  '-DTRANSCRIBE_USE_SYSTEM_BLAS=OFF',
  '-DGGML_OPENMP=OFF',
]

fs.mkdirSync(path.join(BUILD, 'engine'), { recursive: true })
fs.mkdirSync(path.join(BUILD, 'wrapper'), { recursive: true })

// ---- 1. transcribe.cpp + ggml engine ---------------------------------
console.log('\n=== [1/3] Configuring transcribe.cpp engine ===')
run(['cmake', '-S', TSC, '-B', path.join(BUILD, 'engine'), ...common], NATIVE)

console.log('\n=== [2/3] Building engine (libtranscribe + libggml*) ===')
run(['cmake', '--build', path.join(BUILD, 'engine'), '-j', String(os.cpus().length)], NATIVE)

// ---- 2. JNI wrapper -----------------------------------------------------------------
console.log('\n=== [3/3] Building libmoonshine_stt wrapper ===')
run(['cmake', '-S', path.join(NATIVE, 'jni'), '-B', path.join(BUILD, 'wrapper'), ...common], NATIVE)
run(['cmake', '--build', path.join(BUILD, 'wrapper'), '-j', String(os.cpus().length)], NATIVE)

// ---- 3. Copy artifacts -----------------------------------------------------------------
console.log('\n=== Copying libraries to plugin libs ===')
fs.mkdirSync(OUT_DIR, { recursive: true })

const engineLib = (name) => {
  const paths = [
    path.join(BUILD, 'engine', 'src', name),
    path.join(BUILD, 'engine', 'ggml', 'src', name),
    path.join(BUILD, 'engine', 'ggml', 'src', 'ggml-cpu', name),
  ]
  const found = paths.find((p) => fs.existsSync(p))
  if (!found) console.error(`Engine library not produced: ${name}`)
  return found
}

for (const name of ['libtranscribe.so', 'libggml.so', 'libggml-base.so', 'libggml-cpu.so']) {
  const from = engineLib(name)
  if (!from) process.exit(1)
  fs.copyFileSync(from, path.join(OUT_DIR, name))
}
const wrapSrc = path.join(BUILD, 'wrapper', 'libmoonshine_stt.so')
if (!fs.existsSync(wrapSrc)) {
  console.error('libmoonshine_stt.so not produced')
  process.exit(1)
}
fs.copyFileSync(wrapSrc, path.join(OUT_DIR, 'libmoonshine_stt.so'))

// libc++_shared.so comes from the NDK toolchain itself (C++ runtime).
const cxxShared = path.join(NDK, 'toolchains', 'llvm', 'prebuilt', 'linux-x86_64', 'sysroot', 'usr', 'lib', 'aarch64-linux-android', 'libc++_shared.so')
if (!fs.existsSync(cxxShared)) {
  console.error(`libc++_shared.so not found in NDK: ${cxxShared}`)
  process.exit(1)
}
fs.copyFileSync(cxxShared, path.join(OUT_DIR, 'libc++_shared.so'))

console.log('\nDone. Libraries in:')
for (const f of fs.readdirSync(OUT_DIR)) console.log('  -', path.join(OUT_DIR, f))