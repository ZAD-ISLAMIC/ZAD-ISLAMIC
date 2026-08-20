#!/usr/bin/env bash
# Build the altaqwaa APK the way F-Droid builds it, entirely from released
# source (no committed binaries). Used by f-droid metadata build step.
#
# Runs with cwd = repo root, and `npm ci` already performed (metadata init).
# Requires: Android SDK (sdkmanager/platform-tools), NDK 27, Node 20, JDK 21.

set -euo pipefail

echo "==> [1/4] Build native STT engine (transcribe.cpp + ggml + JNI) from source"
npm run build:native

echo "==> [2/4] Add cordova android platform if missing"
if [ ! -d platforms/android ]; then
  npx cordova platform add android --nofetch
fi

echo "==> [3/4] Sync plugins onto platform (Java + built .so)"
node scripts/sync-plugins.mjs

echo "==> [4/4] Assemble release APK (unsigned; F-Droid signs with its key)"
# Ensure no local signing config leaks into the build: F-Droid must never see
# build.json/keystore (they are gitignored and absent on the build server).
if [ -f build.json ]; then
  mv build.json build.json.bak
  trap 'mv -f build.json.bak build.json 2>/dev/null || true' EXIT
fi
FDROID_BUILD=1 node scripts/build.mjs --release --skip-native

echo "Build complete."