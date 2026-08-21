#!/usr/bin/env bash
# Build the altaqwaa APK the way F-Droid builds it, entirely from released
# source (no committed binaries). Used by f-droid metadata build step.
#
# Runs with cwd = repo root, and `npm ci` already performed (metadata init).
# Requires: Android SDK (sdkmanager/platform-tools), NDK 27, Node 20, JDK 21.

set -euo pipefail

echo "==> [1/5] Build native STT engine (transcribe.cpp + ggml + JNI) from source"
npm run build:native

echo "==> [2/5] Generate web assets (www/) so cordova recognizes the project"
npm run build

echo "==> [2b] Materialize local plugins into node_modules (cordova needs copies, not symlinks)"
for d in com.rn0x.prayerlocation com.rn0x.prayerwatch com.rn0x.qibla com.rn0x.systemui com.altaqwaa.moonshinestt; do
  src="cordova-plugins/$d"
  # resolve the actual folder behind each file: reference in package.json
  case "$d" in
    com.altaqwaa.moonshinestt) p=cordova-plugins/moonshine-stt ;;
    com.rn0x.systemui) p=cordova-plugins/system-ui ;;
    *) p="cordova-plugins/$d" ;;
  esac
  rm -rf "node_modules/$d"
  cp -r "$p" "node_modules/$d"
done

echo "==> [3/5] Add cordova android platform (clean platforms/plugins)"
rm -rf plugins platforms
npx cordova platform add android

echo "==> [4/5] Sync native libs + plugin Java onto the platform"
node scripts/sync-plugins.mjs
npx cordova prepare

echo "==> [5/5] Assemble release APK (unsigned; F-Droid signs with its key)"
# Ensure no local signing config leaks into the build: F-Droid must never see
# build.json/keystore (they are gitignored and absent on the build server).
if [ -f build.json ]; then
  mv build.json build.json.bak
  trap 'mv -f build.json.bak build.json 2>/dev/null || true' EXIT
fi
FDROID_BUILD=1 node scripts/build.mjs --release --skip-native

echo "Build complete."
