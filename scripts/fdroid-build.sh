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

echo "==> [2b/5] Hide local plugins from cordova during platform add (avoid broken restore)"
# Remove any leftover plugin dirs so cordova won't discover them.
rm -rf plugins
for d in com.rn0x.prayerlocation com.rn0x.prayerwatch com.rn0x.qibla com.rn0x.systemui com.altaqwaa.moonshinestt; do
  rm -rf "node_modules/$d"
done
# temporarily remove local plugin entries (cordova.plugins AND file: devDeps)
# so cordova platform add does not discover/install them (avoids the
# missing-www ENOENT bug inside the fdroid builder); they are added manually below.
node -e '
const fs=require("fs");
const p=JSON.parse(fs.readFileSync("package.json","utf8"));
const LOCAL=["com.altaqwaa.moonshinestt","com.rn0x.prayerlocation","com.rn0x.prayerwatch","com.rn0x.qibla","com.rn0x.systemui"];
for(const k of Object.keys(p.cordova.plugins)){ if(LOCAL.includes(k)) delete p.cordova.plugins[k]; }
for(const k of Object.keys(p.devDependencies||{})){ if(LOCAL.includes(k)) delete p.devDependencies[k]; }
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
