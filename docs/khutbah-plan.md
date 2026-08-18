# خطة بناء صفحة «الخطب» — ملتقى الخطباء

## الوضع الحالي (المستخلَص)
- `khutbah.json` (في `src/resources/data/`): **4,531 خطبة** بأسماء متسلسلة `1..4531` — المصدر: `khutabaa.com`.
- لكل خطبة: `title`, `slug`, `author` (prefix/first/last), `rawContent` (النص الكامل)، `attachments` (أسماء الملفات + `path` خادمي غير قابل للاستخدام + `link` للتحميل)، `mainCategories` (أسماء + روابط)، `subCategories`، `url`، `created_at`.
- **72 فئة رئيسية** (متوسط 1–2 فئة للخطبة) + **5 خطب بلا فئة** → تُجمع في فئة افتراضية «الخطب المتنوعة».
- **238 كاتباً** · **7,264 مرفقاً** على 4,498 خطبة: 4,704 doc + 2,559 pdf + 1 docx (إمتدادات: pdf/doc/docx).
- حجم المصدر ~87MB؛ النص الخام ~45MB حرفاً وبعد ضغط الفراغات ~**44MB** سجلّات مختزلة.
- قواعد المشروع: JavaScript فقط (بدون TypeScript)، `.mjs` للخدمات، `.jsx` للمكونات، HashRouter، lazy لكل شاشة، dynamic import للبيانات الثقيلة (نمط `fatwas`).

## قرارات المستخدم
1. **تضمين نص الخطبة كاملاً** داخل التطبيق (قراءة دون إنترنت بلا تحميل) — يُضاف ~44MB للحزمة.
2. **إضافة `cordova-plugin-file-opener2`** لفتح المرفقات المحمّلة (PDF/DOC) في مشغّل خارجي عبر قائمة «فتح بواسطة» (content://).

---

## 1) سكربت التقسيم `scripts/split-khutbah.mjs` (جديد + `npm run gen:khutbah`)
يقرأ `src/resources/data/khutbah.json` مرّة ويولّد `src/resources/data/khutbah/`:
- `index.json` (ثابت، صغير): `[{ slug, name, count }]` من `mainCategories[].name` + فئة «الخطب المتنوعة».
- `cat-<slug>.mjs` (lazy لكل فئة): صفوف **خفيفة** `[{ id, slug, title, author, year, excerpt, attachments }]` — الخطبة تظهر في كل فئاتها (نسخ خفيف ~250B فقط، لا تكرار للنص).
- `kh-<batch>.mjs` (lazy): النص الكامل بدفعات **512 خطبة** (~5MB × 9 دفعات)، كل خطبة مرة واحدة، بسجلّات مختزلة `{id,title,slug,author,content,attachments,categories,url,created_at}`.
- `batches.mjs`: `KHUTBAH_BATCH_SIZE`, `KHUTBAH_BATCH_COUNT`, `KHUTBAH_UNIQUE_COUNT`, `KHUTBAH_CHUNKS` (خريطة لوادر ثابتة).
- `index-search.mjs` (lazy، ~0.2MB): `[{ id, slug, t, a, c }]` لبحث العنوان/الكاتب/الفئة.

## 2) الخدمة `src/services/khutbah.mjs` (جديد)
- `normalizeArabic` (نفس نمط fatwas) · `KHUTBAH_NS = 'khutbah'`
- `getCategories()` / `getCategoryBySlug()` / `searchCategories()`
- `loadCategory(slug)` → صفوف خفيفة (cache) · `getKhutbahById(id)` → دفعة حسب id ثم بحث
- `loadSearchIndex()` + `searchGlobal(query)` → `[{ id, slug, category, title, author }]`
- `totalStats()` · `authorName(author)` · `parseKhutbah(content)` → `[{type:'header'|'para', text}]`
- أدوات المرفقات: `attachmentFileName()` (هاش + اسم أصلي بالامتداد)، `attachmentRef()`، `mimeOf(ext)`، `buildShareText(khutbah)`

## 3) مدير التحميل `src/services/khutbahDownload.mjs` + `src/hooks/useKhutbahDownloads.mjs`
نسخة بنمط `fatwaDownload.mjs` بنفس السلسلة `khutbah`:
- `openFileSink`/`markStoredByFile`/`hasFile`/`removeFileBy` من `reciterStorage.mjs` (بلا تثبيت جديد) — دعم استئناف + محاولات + snapshot عبر `useSyncExternalStore`.
- `downloadAttachment()` / `removeAttachment()` / `cancelRef()` / `isStored()` / `openAttachment()`.
- إضافة مساعد صغير في `reciterStorage.mjs`: `localFileUrlFor(ns, fileName)` → مسار `file://` الفعلي.

## 4) فتح المرفقات خارجياً — `cordova-plugin-file-opener2`
- تثبيت: `cordova plugin add cordova-plugin-file-opener2` (4.0.0 — يوافق targetSdk 35/AndroidX، يضيف FileProvider تلقائياً).
- `openAttachment()`: محفوظ → `localFileUrlFor` + `fileOpener2.open(path, mimeOf(ext))` · ويب → blob URL + `window.open` · غير محفوظ → زر «فتح المصدر» عبر `device.openExternal(att.link)`.

## 5) الشاشات والتوجيه
- `KhutbahsScreen` (`/khutbah`) — هيرو بإحصاءات + بحث عام (debounce) + شبكة فئات (أبجدي/الأكثر).
- `KhutbahCategoryScreen` (`/khutbah/:slug`) — lazy + تعشير 30/دفعة عبر IntersectionObserver؛ صفوف برقم/عنوان/كاتب/سنة/شارات PDF/DOC.
- `KhutbahDetailScreen` (`/khutbah/:slug/:id`) — دفعة حسب id؛ محتوى مقسّم + بطاقات مرفقات (تحميل/حذف/فتح) + فئات/كاتب/تاريخ + نسخ + مصدر + prev/next + banner أوفلاين.
- `App.jsx`: lazy routes · `constants/app.mjs`: `NAV_ITEMS` + `SCREENS_META.khutbah` · `Icon.jsx`: أيقونة `minbar` · `headerTitle.mjs`: فئات + عنوان ديناميكي.

## 6) المكونات `src/components/khutbah/`
`KhutbahsHero` · `KhutbahCategoryGrid` · `KhutbahListItem` · `AttachmentCard` · `KhutbahDetail` · `KhutbahContent`.

## 7) التصميم `src/styles/global.css`
هوية بلون `--primary` (زمردي) بأيقونة منبر، شبكة فئات بنمط `adhkar-cat`، خط محتوى بسطور مريحة وعناوين أقسام بارزة، بطاقات مرفقات مميزة بصيغتها، `content-visibility:auto`، دعم dark/light.

## 8) معالجة الأخطاء
أوفلاين + غير محفوظ (تعطيل الفتح + رسالة) · رابط معطّل/HTTP · تعذّر تحميل شظية (إعادة) · فئة/خطبة غير موجودة (حالة فارغة) · quota/permission (رسائل عربية) · انقطاع تحميل (استئناف + استعادة عند `online`).

## 9) الاختبارات `tests/khutbah.test.mjs`
سلامة الفهرس (72 فئة + المتنوعة، slugs فريدة، أعداد مطابقة) · `getKhutbahById` عبر الدفعات · `parseKhutbah` · أسماء ملفات ثابتة/فريدة · `searchGlobal` · `mimeOf`. ثم `npm run gen:khutbah` → `npm run test` → `npm run build` → تثبيت plugin → `npm run build:apk`.
