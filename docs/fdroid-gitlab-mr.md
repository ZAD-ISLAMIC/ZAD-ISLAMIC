# تقديم التقوى إلى F-Droid — خطوات فتح الـ MR على GitLab

مستودع البيانات الرئيسي لـ **F-Droid** يعمل على **GitLab** (وليس GitHub):
`https://gitlab.com/fdroid/fdroiddata` — مستودع GitHub (`f-droid/fdroiddata`) هو
mirror للقراءة فقط ولا يقبل PR. لذلك خطوة التقديم النهائية تتم عبر **GitLab Merge Request**.

كل شيء في هذا الريبو جاهز: البناء من المصدر، `scripts/fdroid-build.sh`،
والملف reference `metadata/com.rn0x.altaqwaa.yml.example`.

## قبل البدء — تثبيت الحسابات

1. أنشئ/امسك حسابًا على GitLab (gitlab.com).
2. (اختياري) وثّق هوية التطبيق عبر:
   - `com.rn0x.altaqwaa` package مطابق لملف التفاصيل في متجر Google Play.
3. (اختياري لكنه يسهّل القبول) أدر `f-droid.org` في ملف `LICENSE` والروابط.

## الخطوات في GitLab

### 1. Fork المستودع
- افتح `https://gitlab.com/fdroid/fdroiddata`
- زر **Fork** (على كلا «GitLab» كما في GitHub).
- ستحصل على fork باسمك: `https://gitlab.com/<you>/fdroiddata`

ملاحظة: مجلد الـ fork ضخم (تاريخ ضخم) — استخدم الـ fork من web UI وعدّله عبر
web IDE أو clone ضحل عند الحاجة.

### 2. أضف ملف الـ metadata
المسار المطلوب بالضبط: `metadata/com.rn0x.altaqwaa.yml`

استخدم محتوى الـ `metadata/com.rn0x.altaqwaa.yml.example` في هذا الريبو
كنموذج، لكن **بلا امتداد `.example`**، وبإعادة طباعته عبر `fdroid rewritemeta`
إن أردت ضبط الصيغة.

باستخدام **Web IDE** من GitLab:
- أنشئ مجلد `metadata` إن لم يكن موجودًا.
- أنشئ الملف وألصق المحتوى (مرفق أدناه نسخة نظيفة).
- Commit إلى فرع جديد مثل `add-com-rn0x-altaqwaa`.

### 3. افتح الـ Merge Request
- من fork، اختر **Create merge request**.
- الهدف: `fdroid/fdroiddata` → فرع `master`.
- المصدر: فرعك `add-com-rn0x-altaqwaa`.
- املأ القالب (انظر أدناه).

### 4. استقبل الردود من الزملاء
- سيرد فريقه عادة بصورة automated (buildtest) ثم مراجع بشرية.
- سيزودونك بتصحيحات صيغة/بناء حتى ينجح.

## محتوى الـ merge request المقترح

عنوان: `Add com.rn0x.altaqwaa (التقوى) — Cordova Islamic app, built from source`

الوصف:
```
التقوى — تطبيق إسلامي مجاني ومفتوح المصدر (GPL-3.0) مبني بـ React + Cordova.
يشمل القرآن والتفسير، الأذكار وحصن المسلم، مواقيت الصلاة مع أذان خلفية،
اتجاه القبلة، المسبحة الإلكترونية (يدوي + صوتي)، راديو، فتاوى ابن باز،
الموسوعة التاريخية والخطب. بلا إعلانات ولا تتبع.

BUILD
- Repo: https://github.com/rn0x/altaqwaa-android (branch v3, وسوم vX.Y.Z)
- config.xml يحمل الإصدار (versionName/versionCode).
- scripts/fdroid-build.sh يبني بالكامل من المصدر:
    * النواة الصوتية (Moonshine STT) = transcribe.cpp v0.2.0 (MIT) مضمّن
      داخل cordova-plugins/.../native، يُجمَّع وقت البناء عبر NDK 27.
    * لا تُرفع أي .so جاهزة؛ كلها مولّدة (متطلب reproducibility محقق).
    * الناتج app-release-unsigned.apk (يوقّعه F-Droid بمفتاحه).
- متطلبات: Node 20, JDK 21, Android SDK + NDK 27, CMake, Ninja.
- التوثيق: docs/fdroid-build.md.

NOTES
- النموذج moonshine-tiny-ar-Q8_0.gguf (CC-BY) محلي على الجهاز.
- لا خدمات شبكة إلزامية.
- UpdateCheckData يقرأ الإصدار من config.xml مع وسوم vX.Y.Z.
```

## ملف الـ metadata (محتوى مرجعي)

انظر `metadata/com.rn0x.altaqwaa.yml.example` في هذا الريبو للنسخة المحدّثة
المطابقة لما سُيقبل. الصيغة قد تتقبل تعديلات صغيرة من `fdroid rewritemeta`.

## بعد الدمج

- يُبنى التطبيق تلقائيًا ضمن دورة f-droid (كل أسبوع تقريبًا).
- يُظهر للجميع في f-droid.org/app/com.rn0x.altaqwaa
- التحديثات تُلتقط تلقائيًا من وسوم `vX.Y.Z` الجديدة في الريبو (AutoUpdateMode).