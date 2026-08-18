# خطة إنشاء صفحة «فتاوى ابن باز» رحمه الله

## الوضع الحالي (المستخلَص)
- `fatwas.json`: **19,727 فتوى** / **215 فئة** / **19,672 صوتية** (55 فتوى بلا صوت، كل فتوى لها `link` إلى `binbaz.org.sa`). حجم JSON ~25MB — لا يجوز استيراده دفعة واحدة.
- يوجد نظام مشغّل موحّد (`player.mjs` + `PlayerBar`) يدعم الأنواع سورة/راديو/`hisn`، ونظام تخزين صوتيات عام (`reciterStorage.mjs`: `openFileSink`/`localUrlFor`/`markStoredByFile`/`removeFileBy`/`hasFile`) وخدمة تحميل لكل ملف (`hisnDownload.mjs`) — يُعاد استخدامها بنفس النمط لنوع `fatwa` دون أي تثبيت جديدة.
- أدوات جاهزة: `device.copyText` للنسخ، `device.openExternal` للروابط الخارجية (InAppBrowser `_system`)، `utils/arabic.mjs` للأرقام العربية.
- قواعد المشروع: JavaScript فقط (بدون TypeScript)، `.mjs` للخدمات، `.jsx` للمكونات، HashRouter، lazy لكل شاشة، dynamic import للبيانات الثقيلة (نمط `quiz`/`geo`).

## قرارات المستخدم
1. عرض الفتوى: **صفحة تفاصيل منفصلة** لكل فتوى (المشكلة عرض السؤال فقط، والضغط يفتح الجواب كاملاً).
2. تنظيم الفئات: **قائمة/شبكة كل الفئات + بحث في الفئات** (لا تجميع في أقسام).
3. التحميل: **تحميل فردي فقط لكل فتوى** (زر تحميل/حذف)، دون زر «تحميل فئة كاملة».
4. البحث: **بحث عام في كل الفتاوى** عبر فهرس خفيف يُحمَّل lazily، يعمل دون إنترنت.

---

## 1) طبقة البيانات — سكربت التقسيم `scripts/split-fatwas.mjs` (جديد)
يقرأ `src/resources/data/fatwas.json` مرّة ويولّد:
- `src/resources/data/fatwas/index.json` (~25KB يُستورد **ثابت**): `[{ slug, name, count, audioCount }]`
- `src/resources/data/fatwas/cat-<slug>.json` لكل فئة (أكبر فئة ~1.8MB) → **dynamic import** عند الدخول
- `src/resources/data/fatwas/index-search.json` (~3MB **lazily**): `[{ id, slug, t, q }]` للبحث العام (عنوان+سؤال مقصوصان)

الـ slug من اسم الفئة بعد trim وتطبيع عربي؛ يُضمن عدم تعارض الأسماء. يُضاف `npm run gen:fatwas`.

## 2) الخدمة `src/services/fatwas.mjs` (جديد)
- `getCategories()` + `searchCategories(query)` بتطبيع عربي (نمط adhkar/hisn).
- `loadCategory(slug)` → `import('../resources/data/fatwas/cat-<slug>.json')` مع cache في الذاكرة.
- `loadSearchIndex()` + `searchGlobal(query)` → `[{ id, slug, category, title, question }]`.
- `getFatwa(slug,id)`, `trackFor(fatwa)` → `{ kind:'fatwa', name, sub, url, fileName, ref }`.
- `audioFileNameOf(url)` — basename + هاش قصير لضمان التفرد (يُدمج الأصوات المكررة).
- `BIOS`: سيرة مختصرة للشيخ (المولد/التعليم/المناصب/الوفاة) + نقاط يمثّلانية + رابط الموقع الرسمي.
- `stripAnswerLabel(answer)` لحذف بادئة «الجواب:»، و`buildShareText(fatwa)` لصيغة النسخ.
- `FATWA_NS = 'fatwa'`.

## 3) التحميل/الحذف — `src/services/fatwaDownload.mjs` + `src/hooks/useFatwaDownloads.mjs`
نسخة مطابقة لـ `hisnDownload.mjs`: `FATWA_NS`، مهام per-file (`MAX_CONCURRENCY=1`، 3 محاولات، backoff، snapshot عبر `useSyncExternalStore`)، `downloadFatwa(fatwa)` / `removeAudio(ref,fileName)` / `cancelRef(ref)`، `fatwaState(fileName)`. يعتمد على `markStoredByFile`/`hasFile`/`removeFileBy` الموجودة.

## 4) المشغّل — `src/services/player.mjs` + `PlayerBar.jsx` (تعديل)
- نوع `kind:'fatwa'`: URL → `localUrlFor(FATWA_NS, fileName) || track.url` (سلوك `hisn`)، ورسالة خطأ أوفلاين عربية + إعادة محاولة.
- MediaSession: `artist:'ابن باز'`، `album:'التقوى — الفتاوى'`.
- `PlayerBar`: شارة أيقونة `feather`، سطر ثانٍ «فتوى ابن باز — الفئة»، مؤشر «محفوظة/تُشغَّل من الإنترنت` عبر `hasFile(FATWA_NS, fileName)`.

## 5) المكونات الجديدة `src/components/fatwas/`
- `FatwasHero.jsx` — هيرو ذهبي: هوية الشيخ، الاسم، السيرة سطر، إحصاءات (فتوى/فئة/صوتية)، زر «نبذة عن الشيخ» ⓘ.
- `SheikhBioSheet.jsx` — منبثق (بأنماط `SettingsSheet`): نبذة + نقاط + رابط الموقع.
- `CategoryGrid.jsx` — شبكة الفئات (اسم، عدد فتاوى، عدد صوتيات) + بحث + فرز + حالة فارغة.
- `FatwaListItem.jsx` — رقم + عنوان السؤال + شارة صوت متاح.
- `FatwaAudioActions.jsx` — تشغيل/تحميل/حذف بحالات (spin/نسبة/محفوظ) بنمط `HisnAudioActions`.
- `FatwaDetail.jsx` — السؤال، الجواب بخط القرآن، شريط أفعال (تشغيل/تحميل/نسخ/مصدر خارجي)، prev/next عبر state، ذيل حقوقي، banner أوفلاين.

## 6) الشاشات والتوجيه
- `FatwasScreen` (`/fatwas`) — هيرو + بحث عام + شبكة الفئات.
- `FatwasCategoryScreen` (`/fatwas/:slug`) — تحميل لازي + ترقيم بتعشير (۲۰–۳۰/دفعة عبر IntersectionObserver).
- `FatwaDetailScreen` (`/fatwas/:slug/:id`).
- `App.jsx`: lazy routes. `constants/app.mjs`: `NAV_ITEMS` + `SCREENS_META`. `headerTitle.mjs`: استيراد `index.json` الخفيف للعناوين.

## 7) التصميم — `global.css` قسم «فتاوى ابن باز»
هوية ذهبية (إعادة استخدام `--gold`), بطاقات فئات بنمط `adhkar-cat`, هيرو بإحصاءات، خط Quran للجواب بمسافات واسعة، toast نسخ، sheet سيرة، حالات فارغة، دعم dark/light، `content-visibility:auto` على الصفوف.

## 8) النسخ + الروابط الخارجية
- زر نسخ → `buildShareText`: السؤال + الجواب + رابط الصوتية + رابط المصدر + تذييل «من تطبيق التقوى — فتاوى الشيخ ابن باز رحمه الله» عبر `device.copyText` + toast.
- زر مصدر صغير (أيقونة external) → `device.openExternal(link)`.

## 9) معالجة الأخطاء
| الخطأ | المعالجة |
|---|---|
| أوفلاين + غير محفوظة | رسالة عربية + إعادة محاولة، تعطيل التشغيل |
| رابط معطّل | تحويل https؛ error في PlayerBar مع `retry()` |
| تعذّر تحميل شظية فئة/فهرس | رسالة + زر إعادة التحميل |
| فئة/فتوى غير موجودة | حالة فارغة وليس crash |
| Storage quota/permission | قبض + رسالة عربية |
| `audio.play()` مرفوض | حالة paused عند الضغط (موجود) |
| نسخ فاشل | toast «تعذّر النسخ» |
| unmount أثناء تشغيل/تحميل | cleanup للمؤقّت والعناصر |

## 10) الاختبارات والتحقق
`tests/fatwas.test.mjs` (node --test): سلامة الملفات المُولّدة (215 فئة والأعداد مطابقة)، slugs فريدة، البحث بالتطبيع، اسم ملف/ref ثابت وفريد، إزالة بادئة الجواب، `buildShareText` يتضمّن حقوق التطبيق. ثم `npm run test` + `npm run build` + مراجعة يدوية عبر `npm run dev`.