# رفع التطبيق على F-Droid — خارطة الطريق

يرتبط بالطلب [#9](https://github.com/rn0x/altaqwaa-android/issues/9).

> **مبدأ مهم:** F-Droid لا يستضيف الـ APK الجاهز — بل **يعيد بناء التطبيق من سورس
> المصدر** (من مستودعنا) ويوقّعه بمفتاحه الخاص. المتطلب الجوهري: المشروع
> **قابل للبناء من المقطَع** بلا ملفات ثنائية جاهزة دون مصدر.

## ما نُفِّذ بالفعل في الريبو

- أُزيل `"private": true`، وأُضيف `"license": "GPL-3.0"` في `package.json`.
- أُنشئ `CHANGELOG.md`، والريبو يمتلك `LICENSE` GPL-3.0.
- **حُل المانع الثنائي الأكبر** (إضافة Moonshine STT):
  - نُشر مصدر النواة بالكامل داخل الريبو:
    `cordova-plugins/moonshine-stt/src/android/native/transcribe.cpp` (نسخة `v0.2.0` من
    `handy-computer/transcribe.cpp` + ggml، MIT) + طبقة JNI `native/jni/moonshine_jni.cpp`.
  - أُزيلت مكتبات `.so` المبنية مسبقًا من git (كانت بلا مصدر)، وأصبحت **مُنتجة وقت
    البناء** عبر `npm run build:apk` (build.mjs يبنيها بـ NDK ثم ينسخها داخل plugin).
  - بقي `libs/` مولّدًا ومُتجاهلًا؛ لا تُرفع ثنائيات.
- `package-lock.json` ملتزم الآن لبناء npm قابل للتكرار.
- دليل بناء مفصل: `docs/fdroid-build.md`.

## ما تبقى لفتح الـ PR في `f-droid/fdroiddata`

1. **كتابة `metadata/com.rn0x.altaqwaa.yml`** (أو ملف build.go على النمط السياقي) يحدد:
   - `Builds` بإصدار الوسم (`vX.Y.Z`).
   - أمر البناء بموجب `docs/fdroid-build.md`:
     `npm ci` → `node cordova-plugins/moonshine-stt/src/android/native/build.mjs`
     → إضافة منصة android → `cordova compile` (أو استحداث APK حسب خريطة Cordova).
   - تحديد NDK 27 للتهيئة، وإزالة توقيع release المحلي.
2. **إعداد Flask-build environment** في الفُروع: تقديم ترخيص NDK/التحقق من `ovr`-معتمد
   (سماح F-Droid بتحميل NDK أو التناسق عبر `build-gradle` النظامي). الحالات كثيرها تستخدم `gradle.properties`.
3. **رفع PR** في `f-droid/fdroiddata` بعنوان «Add com.rn0x.altaqwaa»، مع 담ة الميتاداتا
   والسماح للفقط.

## حالة الإصدارات للصيانة

- بكل إصدار جديد: نرافع سطر الإصدار (`config.xml`, `package.json`,
  `src/constants/app.mjs`, وموضع `SettingsScreen.jsx`)، ثم `npm run build:apk:release`
  ورفع الـ APK إلى GitHub Releases؛ فيُحدَّث الموقع تلقائيًا من `releases/latest`.
- عند الدمج في F-Droid، يُغلى تحديث الريبو بمزج كل نسخة تلقائيًا.