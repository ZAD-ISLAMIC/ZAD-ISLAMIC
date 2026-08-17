# خطة المسبحة الإلكترونية — تطبيق التقوى

## 1) الهدف

صفحة «المسبحة الإلكترونية» كاملة في `TasbihScreen.jsx` تضم:

- 3 أذكار أساسية (سبحان الله، الحمد لله، الله أكبر) بعداد افتراضي **33** لكل منها، مع **تعديل التكرار** بحرية لكل ذكر.
- **إضافة أذكار مخصصة** (نص + تكرار) مع تعديل/حذف.
- **عد يدوي** بزر مسبحة كبير مع **صوت ومعنى** لكل ضغطة.
- **وضع الاستماع بالميكروفون**: يتلو المستخدم الذكر ويعدّ التطبيق تلقائيًا، باستخدام **Moonshine-Tiny كنسخة العربية** ويعمل 100% محليًا.
- **إشعار نظام Android + صوت + اهتزاز** عند إتمام العدد.

## 2) القرارات التقنية (بعد أسئلة المستخدم)

| البند | القرار |
|---|---|
| الموديل | `onnx-community/moonshine-tiny-ar-ONNX` — يدعم العربية فعلًا |
| النسخة المضغوطة | **int8**: `encoder_model_int8.onnx` (8.0MB) + `decoder_model_merged_int8.onnx` (20.4MB) |
| طريقة التشغيل | **JS/WASM أولًا** داخل WebView (قابل للترقية لأصلي لخص بعجانه) |
| الإشعار | إشعار نظام + صوت — وأنيق داخل التطبيق كاحتياطي |
| العدد الافتراضي | 33 لكل ذكر (قابل للتعديل) |

## 3) الحزمة التقنية

| المكتبة | الدور | المصدر |
|---|---|---|
| `@huggingface/transformers` (transformers.js web build) | تشغيل موديل Moonshine AR (فك التشفير، التوكينايزر العربي، توليد النص) عبر ONNX + WASM | npm / jsdelivr |
| `@ricky0123/vad-web@0.0.24` | كشف الكلام (Silero VAD) لتقسيم كل نطق على حدة | npm |
| `onnxruntime-web` | محرك WASM (لكليهما) محمّل محليًا | npm |

### لماذا هذه الحزمة وليست `@moonshine-ai/moonshine-js`؟
- مكتبة `moonshine-js` مبرمجة بتوكينايزر **إنجليزي ثابت** فقط (`model.ts` يستدعي `llama-tokenizer-js`) ولا تفك العربية، وتحمّل موديلاتها من CDN.
- متبضر نستخدم **transformers.js** لأنه يدعم الموديل العربي رسميًا (الريبو مكتوب `library_name: transformers.js`) مع معالج mel والتوكينايزر العربي وقراءة الملفات الصحيحة.
- **vad-web** لكشف الكلام/الشرائح كما تستخدمه moonshine-js داخليًا.

## 4) الأصول المدمجة محليًا (تُنسخ كما هي إلى `www/`)

نستخدم مجلد `public/` في Vite لضمان أسماء ثابتة تُستدعى أثناء التشغيل:

```
public/stt/
├── transformers.web.min.js                        ~432 KB
├── vad-web/bundle.min.js                          ~500 KB
├── silero/silero_vad_v5.onnx                      ~1.7 MB
├── onnxruntime/ort-wasm-simd-threaded.wasm        ~11 MB
│   └── (+ ort-wasm-simd-threaded.jsep.wasm        ~22 MB اختياري)
└── models/onnx-community/moonshine-tiny-ar-ONNX/
    ├── tokenizer.json                             ~3.7 MB
    ├── config.json
    ├── generation_config.json
    ├── preprocessor_config.json
    └── onnx/
        ├── encoder_model_int8.onnx                ~8.0 MB
        └── decoder_model_merged_int8.onnx         ~20.4 MB
```

- إجمالي الإضافة للحزمة ≈ **46–68 MB** (حسب تضمين ملف jsep).
- المسارات الجذرية `/stt/...` تعمل في التطوير (`localhost:5173`) والإنتاج (`http://localhost` عبر Cordova).
- تعديل `env.backends.onnx.wasm.wasmPaths` / `onnxWASMBasePath` للمجلدات المحلية لتعمل **بدون إنترنت كليًا**.

## 5) إضافة Cordova المخصصة — `cordova-plugins/tasbih-sr/`

سببها: إضافة `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS` للـ Manifest، وإدارة تجربة الصلاحية (تكمّل معالجة `SystemWebChromeClient` الموجود في Cordova الذي يمنح طلب الميكروفون تلقائيًا عند توفر الصلاحية).

- `plugin.xml`: يدمج الصلاحيتين في AndroidManifest.
- `TasbihPlugin.java`:
  - `hasPermission()` / `requestPermission()` لـ `RECORD_AUDIO`.
  - تمييز **«رفض نهائيًا»** عبر `shouldShowRequestPermissionRationale` وإرجاع حالة `permanent` للواجهة.
  - `openSettings()` — فتح إعدادات النظام عند الرفض الدائم.
  - `setKeepScreenOn(boolean)` — إبقاء الشاشة مضاءة أثناء الاستماع.
- `www/tasbih.js` — غلاف JS آمن (يعمل أيضًا إن غابت الإضافة = وضع متصفح).
- التسجيل: `cordova plugin add cordova-plugins/tasbih-sr` + توثيق في README.

## 6) مكونات الصفحة (`src/components/tasbih/`)

- **`TasbihCounter.jsx`**: عداد دائري كبير (شكل مسبحة) + رقم عربي ضخم + حلقة تقدم + عد يدوي (منطقة اضغط) + إعادة ضبط. عند الضغط: `playSound('tick')` + `vibrate(8)`.
- **`TasbihDhikrList.jsx`**: كروت الأذكار (الأساسية + المخصصة) مع محرر التكرار `[−][33][+]` وخيارات سريعة (7/33/100/500/1000) وحذف المخصص.
- **`TasbihEditor.jsx`**: نافذة إضافة/تعديل ذكر (النص + العدد، مع تحقق من الصحة).
- **`ListeningPanel.jsx`**: زر ميكروفون وبحالات:
  1. طلب الصلاحية (مع رسالة شرح عربية).
  2. تحميل الموديل أول مرة (حالة تحميل).
  3. استماع (مؤشر نابض + النص المكتشف لايف).
  4. أخطاء: رفض مؤقت / رفض دائم (زر فتح الإعدادات) / تعطل أو غير مدعوم / انتهاء مهلة.

## 7) المنطق والخدمات

- **`src/services/tasbih.mjs`** — مخزن البيانات (localStorage `altaqwaa:tasbih:*`):
  - `[{ id, text, target, custom }]` مع 3 أساسية افتراضية، وعدّادات اليوم محفوظة لكل ذكر.
  - تنسيق الاستماع: `startListening(dhikr)` / `stopListening()`، وتطبيع النص العربي (إزالة الضبط + توحيد أ/إ/آ=ا، ة=ه، ى=ي) ومطابقة الذكر، والإتمام.
- **`src/services/stt.mjs`** — غلاف STT:
  - `import()` ديناميكي لـ transformers.js و vad-web، وتوجيه مسارات الأصول المحلية.
  - بناء `AudioContext` + `AudioNodeVAD` (v5) → على نهاية كل نطق → تمرير `Float32Array` إلى `MoonshineForConditionalGeneration` → نص عربي.
  - `onSpeechEnd / onError / onLatency` مع تصنيف أخطاء عربية.
- **`src/services/notifications.mjs`** — إشعار نظام عبر `cordova-plugin-local-notification`، مع fallback تنبيه داخل التطبيق + اهتزاز عند غياب الإضافة.

## 8) الملفات الجديدة/المعدلة

**جديدة**

- `public/stt/**` (الأصول أعلاه) + `public/stt/LICENSE*` لإشاعة MIT.
- `cordova-plugins/tasbih-sr/{plugin.xml, package.json, src/android/TasbihPlugin.java, www/tasbih.js}`
- `src/services/stt.mjs`
- `src/services/tasbih.mjs`
- `src/services/notifications.mjs`
- `src/components/tasbih/{TasbihCounter,TasbihDhikrList,TasbihEditor,ListeningPanel}.jsx`
- `docs/tasbih-plan.md` (هذه الخطة)

**معدّلة**

- `src/screens/TasbihScreen.jsx` — التنفيذ الكامل بدل placeholder.
- `src/styles/global.css` — أنماط المسبحة (ثيم، عداد دائري، حالات الاستماع، رسائل الخطأ).
- `package.json` (إضافة `@huggingface/transformers`, `@ricky0123/vad-web`) + `config.xml` (تسجيل الإضافة) + `README.md`.

## 9) خطوات التنفيذ

1. تنزيل ملفات الموديل العربي (int8) والتوكينايزر والإعدادات من الريبو إلى `public/stt/models/...`.
2. تجهيز `transformers.web.min.js` + `vad-web` + wasm وتوجيه المسارات المحلية في `stt.mjs` (نسختا wasm `1.14`/`1.26` في مجلدين منفصلين لحل تعارض الأسماء).
3. بناء إضافة `tasbih-sr` وتثبيتها عبر `cordova plugin add`.
4. تنفيذ `tasbih.mjs` + `stt.mjs` + `notifications.mjs`.
5. بناء الواجهة + الأنماط + دمج كل شيء في الشاشة.
6. `npm run build:apk` + `npm run install:apk` واختبار على جهاز حقيقي (خصوصًا الاستماع والصلاحيات).
7. قياس الأداء على جهاز ضعيف إن أمكن.

## 10) الاختبار/التحقق

- **وضع الاستماع**: تلاوة كل ذكر عدة مرات والتأكد من تطابق العداد + حالات رفض الصلاحية (مؤقت/دائم/فتح الإعدادات) + سلوك الإيقاف عند مغادرة الصفحة.
- **يدوي**: صوت/اهتزاز عند كل ضغطة + إشعار + صوت عند الإتمام.
- **متعدد**: إضافة/تعديل/حذف ذكر مخصص، بقاء العدادات بعد إعادة فتح التطبيق.
- **بدون إنترنت**: كل الأصول محلية.

## 11) المخاطر والحلول

| الخطر | الحل |
|---|---|
| WASM threaded / SharedArrayBuffer في WebView | تعيين `wasm.numThreads = 1` واختبار على الجهاز؛ الإبقاء على fallback js |
| دقة التعرف العربي على الأجهزة | تطبيع عربي قوي + خيار «مطابقة تقريبية/عد كل نطق» في الإعدادات |
| ضخامة الحزمة ~46–68MB | اختيار int8 + استبعاد ملف jsep إن لم يلزم بعد الفحص |
| رفض الصلاحية | رسائل عربية واضحة + فتح الإعدادات + إعادة المحاولة + fallback داخل المتصفح |
| `sharp`/node deps في transformers.js | استخدام **web build** فقط (تجنب node/onnxruntime-node وsharp)، أو vendor للقرص |
| تأخير الاستدلال على الأجهزة الضعيفة | VAD يقسّم على مستوى النطق (قطعة قصيرة ~1–3s) — زمن ~0.5–2s مقبول مع مؤشر مباشر |

## 12) مخرجات الإنجاز

نسخة APK جديدة مع الصفحة كاملة، واختبار الاستماع على جهاز Android حقيقي، وملخص أداء الموديل على الجهاز المستهدف.