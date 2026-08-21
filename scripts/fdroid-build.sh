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

echo "==> [2b/5] Materialize local plugins + drop them from cordova.plugins (avoid broken restore during platform add)"
mkdir -p plugins
for d in com.rn0x.prayerlocation com.rn0x.prayerwatch com.rn0x.qibla com.rn0x.systemui com.altaqwaa.moonshinestt; do
  case "$d" in
    com.altaqwaa.moonshinestt) p=cordova-plugins/moonshine-stt ;;
    com.rn0x.systemui) p=cordova-plugins/system-ui ;;
    *) p="cordova-plugins/$d" ;;
  esac
  rm -rf "node_modules/$d" "plugins/$d"
  cp -r "$p" "node_modules/$d"
  cp -r "$p" "plugins/$d"
done
# temporarily remove local plugin entries so cordova platform add does not try
# to restore them (and hit the missing-www bug); they are added manually below.
node -e '
const fs=require("fs");
const p=JSON.parse(fs.readFileSync("package.json","utf8"));
const keep={}
for(const k in p.cordova.plugins){ if(["com.altaqwaa.moonshinestt","com.rn0x.prayerlocation","com.rn0x.prayerwatch","com.rn0x.qibla","com.rn0x.systemui"].includes(k)) continue; keep[k]=p.cordova.plugins[k] }
p.cordova.plugins=keep;
fs.writeFileSync("package.json", JSON.stringify(p,null,2)+"\n");
'

echo "==> [3/5] Add cordova android platform"
rm -rf platforms
npx cordova platform add android

echo "==> [3b] Install local plugins explicitly (bypasses broken automatic restore)"
npx cordova plugin add ./cordova-plugins/moonshine-stt ./cordova-plugins/com.rn0x.prayerlocation ./cordova-plugins/com.rn0x.prayerwatch ./cordova-plugins/com.rn0x.qibla ./cordova-plugins/system-ui

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
