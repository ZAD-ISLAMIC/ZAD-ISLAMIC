# توقيع تطبيق الأندرويد (keystore + build.json)

دليل إنشاء مفتاح التوقيع وتجهيز ملف `build.json` لبناء نسخ Release موقّعة.

## لماذا نحتاج التوقيع؟

أي APK يُنشر أو يُثبّت يجب أن يكون موقّعاً بمفتاح. **نفس المفتاح** هو ما يسمح
بتحديث التطبيق لاحقاً (Install over نفس التطبيق):

- إذا ضاعت النسخة الاحتياطية من الـ keystore → لا يمكن إصدار تحديث للتطبيق
  المنشور، بل تبدأ بدورة جديدة كتطبيق مختلف.
- إذا تسرّب الـ keystore (مثلاً عبر git) → أي شخص يستطيع نشر "تحديثات" ضارة
  باسم تطبيقك.

لذلك تم تجهيز هذا المشروع بـ:

| الملف | الحالة | السبب |
|-------|--------|-------|
| `tqw.keystore` | 🚫 غير مرفوع (في `.gitignore`) | مفتاح التوقيع الفعلي |
| `build.json` | 🚫 غير مرفوع (في `.gitignore`) | يحتوي كلمات المرور نصاً |
| `build.example.json` | ✅ مرفوع | قالب بمعلومات وهمية |
| `scripts/create-keystore.mjs` | ✅ مرفوع | مولّد keystore تلقائي |

## بسرعة (أسرع طريقة)

```bash
npm run keystore
```

يستفسر عن الاسم وكلمتي المرور (مخفيتان عند الكتابة)، ثم ينشئ:
- `altaqwaa.keystore` (مفتاح التوقيع)
- `build.json` (إعداد البناء بالبيانات الحقيقية)

وبعدها:

```bash
npm run build:apk:release   # بناء APK موقّع
npm install:apk -- --release # التثبيت على الجهاز
```

## السكربت `scripts/create-keystore.mjs`

يعمل على **Windows / macOS / Linux** عبر `keytool` المرفق مع JDK (لم نستخدم أي
مكتبة خارجية). يبحث عن `keytool` تلقائياً في `JAVA_HOME` ثم في `PATH`.

### الخيارات

| الخيار | الافتراضي | الوصف |
|--------|-----------|-------|
| `--output <مسار>` | `altaqwaa.keystore` | مكان حفظ الـ keystore |
| `--alias <اسم>` | `rn0x_Altaqwaa` | اسم المفتاح داخل الملف |
| `--validity <أيام>` | `10000` | صلاحية المفتاح (أيضاً 10000 يوم = لا تنتهي عملياً) |
| `--storepass <كلمة>` | — | كلمة مرور الـ keystore |
| `--keypass <كلمة>` | — | كلمة مرور المفتاح |
| `--name <اسم>` | استفسار | الاسم الكامل CN |
| `--org <قسم>` | `Altaqwaa` | الوحدة OU |
| `--city <مدينة>` | `Riyadh` | المدينة L |
| `--state <منطقة>` | `Riyadh` | المنطقة ST |
| `--country <رمز>` | `SA` | الدولة C (حرفان) |
| `--help` | — | عرض التعليمات |

### كيف تُمرّر كلمات المرور؟ (ثلاث طرق بالأولوية)

1. وسم سطر أوامر:
   ```bash
   npm run keystore -- --storepass "كلمة السر" --keypass "كلمة السر" --name "Rayan Almalki"
   ```
   ⚠️ الحل الأقل أماناً (تظهر في history الطرفية) — للأتمتة فقط.

2. متغيرات بيئة:
   ```bash
   export KEYSTORE_STORE_PASS="كلمة السر"
   export KEYSTORE_KEY_PASS="كلمة السر"
   npm run keystore -- --name "Rayan Almalki"
   ```

3. إدخال تفاعلي (الافتراضي): يُطلب الاسم ثم كلمتا المرور بشكل **مخفي**.

### أمثلة

مثال كامل مع كل الخيارات:
```bash
npm run keystore -- \
  --output keystores/altaqwaa.keystore \
  --alias rn0x_Altaqwaa \
  --validity 10000 \
  --storepass "S3cretSt0re" \
  --keypass "S3cretSt0re" \
  --name "Rayan Almalki" \
  --org "Altaqwaa" \
  --city "Riyadh" \
  --state "Riyadh" \
  --country "SA"
```

### ماذا ينتج؟

بعد توليد المفتاح بنجاح يكتب السكربت `build.json` تلقائياً ببيانات حقيقية —
شكل مطابق لقالب `build.example.json`:

```json
{
  "android": {
    "debug": {
      "keystore": "./altaqwaa.keystore",
      "storePassword": "...",
      "alias": "rn0x_Altaqwaa",
      "password": "...",
      "keystoreType": "pkcs12",
      "packageType": "apk"
    },
    "release": {
      "keystore": "./altaqwaa.keystore",
      "storePassword": "...",
      "alias": "rn0x_Altaqwaa",
      "password": "...",
      "keystoreType": "pkcs12",
      "packageType": "apk"
    }
  }
}
```

> 💡 `keystoreType: "pkcs12"` لأن السكربت يولّد بصيغة PKCS12 الحديثة. لو استخدمت
> `tqw.keystore` القديم (JKS) اترك `keystoreType` فارغاً `""` كما في الملف الأصلي.

## يدوياً بدون السكربت

1. إنشاء المفتاح:
   ```bash
   keytool -genkeypair -v \
     -keystore altaqwaa.keystore -storetype PKCS12 \
     -keyalg RSA -keysize 2048 -validity 10000 \
     -alias rn0x_Altaqwaa \
     -storepass "كلمة" -keypass "كلمة" \
     -dname "CN=Rayan Almalki, OU=Altaqwaa, O=Altaqwaa, L=Riyadh, ST=Riyadh, C=SA"
   ```

2. أنشئ `build.json` نسخة من `build.example.json` واملأ القيم الحقيقية:
   ```bash
   cp build.example.json build.json   # ثم عدّل كلمات المرور والمسار
   ```

3. صالح المفتاح: عرض محتوى الـ keystore (عرض لا تعديل):
   ```bash
   keytool -list -v -keystore altaqwaa.keystore -storepass "كلمة"
   ```

## قواعد أمان لا تتخطى

- **لا ترفع** `*.keystore` أو `build.json` أبداً — متجاهلان أصلاً في `.gitignore`.
- احتفظ بنسخة احتياطية من المفتاح وكلماته في مكان آمن (مدير كلمات مرور، تخزين مشفّر).
- استعمل كلمة مرور قوية (أكثر من 16 حرفاً يُنصح).
- `build.json` يجب أن يكون محلياً فقط قبل البناء؛ أي `cp` أو توليد قبل البناء.

## البناء الموقّع

```bash
npm run build:apk:release
```

مسار APK الناتج:
```
platforms/android/app/build/outputs/apk/release/
```

> يعرض `scripts/build.mjs` على cordova ملف `build.json` (الـ gitignored) عند
> البناء الريليز عبر الوسم `--buildConfig build.json`. على جهاز جديد انسخ
> `build.example.json` → `build.json` أو شغّل `npm run keystore`.