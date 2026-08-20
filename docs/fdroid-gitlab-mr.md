# تقديم التقوى إلى F-Droid — خطوات فتح الـ MR على GitLab

مستودع البيانات الرئيسي لـ **F-Droid** يعمل على **GitLab** (وليس GitHub):
`https://gitlab.com/fdroid/fdroiddata` — مستودع GitHub (`f-droid/fdroiddata`) هو
mirror للقراءة فقط ولا يقبل PR. لذلك خطوة التقديم النهائية تتم عبر **GitLab Merge Request**.

كل شيء في هذا الريبو جاهز: البناء من المصدر، `scripts/fdroid-build.sh`،
والملف المباشر `metadata/com.rn0x.altaqwaa.yml` (النسخة الرسمية الجاهزة للنسخ).

> **متطلب حاسم**: يجب تنفيذ هذه الخطوات من **حساب GitLab شخصي** (مثل `rn0x`).
> توكنات المشاريع/البوت لا تملك صلاحية إنشاء fork، وGitLab لا يسمح بفتح MR إلا
> من فرعٍ داخل fork صالح لهذا المستودع (Team «fdroid/fdroiddata»).

## قبل البدء — الحسابات

1. سجّل دخولًا بحساب GitLab شخصي (gitlab.com).
2. تأكد أن اسم حسابك يظهر fork سابقًا أو يمكنك الضغط على **Fork** في صفحة
   `fdroid/fdroiddata`.

## الخطوات في GitLab

### 1. Fork المستودع
- افتح `https://gitlab.com/fdroid/fdroiddata`
- زر **Fork** (على كلا «GitLab» كما في GitHub).
- ستحصل على fork باسمك: `https://gitlab.com/<you>/fdroiddata`

ملاحظة: مجلد الـ fork ضخم (تاريخ ضخم) — استخدم الـ fork من web UI وعدّله عبر
web IDE عند الحاجة.

### 2. أضف ملف الـ metadata
المسار المطلوب بالضبط: `metadata/com.rn0x.altaqwaa.yml`

استخدم محتوى الـ `metadata/com.rn0x.altaqwaa.yml` (النظيف) في هذا الريبو مباشرة:
- في Web IDE أنشئ مجلد `metadata` إن لم يوجد.
- أنشئ الملف والصق محتوى الذي بالريبو (أو أنسخ الملف عبر git push).
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

## ملف الـ metadata (محتوى مرجعي)

استخدم `metadata/com.rn0x.altaqwaa.yml` (في جذر هذا الريبو) فهو الملف الجاهز
لوضعه كما هو داخل `metadata/` في الفورك. الحقل `versionCode` في build = 30001
(مطابق لما ينتجه Cordova عن «3.0.1» — تحققنا عبر `aapt`).

## بعد الدمج

- يُبنى التطبيق تلقائيًا ضمن دورة f-droid (كل أسبوع تقريبًا).
- يظهر للجميع في f-droid.org/app/com.rn0x.altaqwaa
- التحديثات تُلتقط تلقائيًا من وسوم `vX.Y.Z` الجديدة في الريبو (AutoUpdateMode).