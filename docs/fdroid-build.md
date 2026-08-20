# بناء التطبيق من المصدر (F-Droid)

هذا الدليل يشرح خطوات بناء «التقوى» (APK) من المصدر على بيئة نظيفة —
وهو ما يعتمده F-Droid عند إعادة البناء. كل شيء يوصل بناتج APK قابل للتثبيت.

## المتطلبات

| الأداة | النسخة |
|--------|--------|
| Node.js | ≥ 20.19 |
| JDK | 21 |
| Android SDK | `ANDROID_HOME` مضبوط، مع build-tools 36 |
| Android NDK | 27.x (r27b) — مثبّت تحت `<SDK>/ndk/27.x` |
| CMake | ≥ 3.22 |
| Ninja | متوفر في PATH |

## خطوات البناء

```bash
# 1. تثبيت التبعيات
npm install

# 2. (إن غابت منصة android) إعداد المنصة لأول مرة
npm run cordova:setup      # = build:native ثم platform add + prepare

# 3. بناء APK Debug (أو Release)
npm run build:apk          # debug APK
npm run build:apk:release  # release APK موقّع (يتطلب build.json + keystore محليًا)

# الناتج
# platforms/android/app/build/outputs/apk/{debug,release}/
```

### ماذا يفعل `npm run build:apk` (المسار الكامل)

1. `scripts/patch-cordova.mjs` — إصلاح معروف لـ SystemWebChromeClient.
2. `scripts/sync-plugins.mjs` — يعكس مصادر الإضافات المحلية (Java + `.so`) إلى المنصة. **مهم**: `cordova prepare` لا ينسخ ملفات موجودة مسبقًا، لذا هذا السكربت يضمن وصول مكتبات النواة المبنية حديثًا.
3. `scripts/dedupe-platform.mjs` — تنظيف.
4. **`node cordova-plugins/moonshine-stt/src/android/native/build.mjs`** — يبني نواة التعرف الصوتي (Moonshine STT) **من المصدر** عبر NDK:
   - `transcribe.cpp v0.2.0` (مضمّن في `cordova-plugins/moonshine-stt/src/android/native/transcribe.cpp`) + ggml → `libtranscribe.so`, `libggml.so`, `libggml-base.so`, `libggml-cpu.so`
   - طبقة JNI (`native/jni/moonshine_jni.cpp`) → `libmoonshine_stt.so`
   - `libc++_shared.so` من NDK
   - تُنسخ إلى `cordova-plugins/moonshine-stt/src/android/libs/arm64-v8a/` (وهي **مُتجاهَلة** في git؛ لا تُرفع ثنائيات).
5. `vite build` → `www/`.
6. `python3 scripts/generate-icons.py` → أيقونات/سبلاش.
7. `cordova prepare` ثم `cordova compile android` (أو `--release`).

## ملاحظات F-Droid

- **قابلية التكرار**: لا تُرفع مكتبات `.so` مبنية مسبقًا. البناء يستدعي NDK من السورس المضمّن دائمًا.
- **التوقيع**: F-Droid يهرم ويوقّع بمفتاحه. خطوة release المحلية (build.json/keystore) خاصة بالنشر الذاتي فقط.
- **`package-lock.json`**: ملتزم في الريبو لضمان تثبيت تبعيات محدد.
- لإضافة هذا التطبيق إلى F-Droid يُفتح PR على `f-droid/fdroiddata` بملف metadata/bootstrap ثم بناء وفق هذا الدليل.

## مصدر النواة المضمّن

`cordova-plugins/moonshine-stt/src/android/native/transcribe.cpp` هو نسخة **v0.2.0 (commit 856d7c1)** من [`handy-computer/transcribe.cpp`](https://github.com/handy-computer/transcribe.cpp) مع ggml مضمّن، برخصة MIT. النموذج الصوتي `moonshine-tiny-ar-Q8_0.gguf` (CC-BY) يبقى في `assets/models` (مرخّص استعماله).