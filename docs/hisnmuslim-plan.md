# خطة إنشاء صفحة «حصن المسلم»

## الوضع الحالي (المستخلَص)
- `hisnmuslim.json`: 132 فئة / 267 ذكرًا — **كل** باب وكل ذكر له ملف صوتي (روابط `http://www.hisnmuslim.com/...` عن بُعد، 397 ملفًا فريدًا).
- الروابط تعمل على `https` أيضًا (تم اختبارها مباشرةً) — مهم لأن التطبيق يُحمَّل من `https://localhost` والـ Manifest الحالي لا يسمح بـ cleartext، فنجنّب Mixed Content بتحويل الروابط إلى https.
- يوجد نظام مشغّل موحّد (`player.mjs` + `PlayerBar`) ونظام تخزين صوتيات + تحميل للقراء (`reciterStorage.mjs` + `downloadManager.mjs`) — سيُعاد استخدامهما بنفس النمط.
- قواعد المشروع: JavaScript فقط (بدون TypeScript)، `.mjs` للخدمات، `.jsx` للمكونات، HashRouter، lazy لكل شاشة.

## قرارات المستخدم
1. مدخل الصفحة: **بطاقة في الصفحة الرئيسية فقط** (تضاف إلى `NAV_ITEMS` — لا عنصر جديد في الشريط السفلي).
2. تنظيم الفئات: **تجميع في أقسام منطقية + صندوق بحث**.
3. إبقاء الأذكار الحالية (`azkar.json`) كما هي، وحصن المسلم صفحة مستقلة.
4. الصوتيات: **تشغيل من الإنترنت + تحميل المداخل للاستماع دون إنترنت** (بنفس نظام تحميل القراء).

---

## 1) طبقة البيانات والمنطق — `src/services/hisnmuslim.mjs` (جديد)
- استيراد JSON وتصدير `HISN_DATA` + دوال `getCategoryById(id)`, `getItem(catId,itemId)`, `flatCategories`.
- `normalizeHttps(url)` — تحويل أي رابط `http://www.hisnmuslim.com` إلى `https://`.
- **الأقسام + البحث**: مصنّف كلمات قائم على regex على اسم الفئة (مرتّب بأولوية) → الأقسام: أذكار اليوم، النوم، الطهارة، اللباس والمنزل، المسجد والأذان، الصلاة، الفطر والطعام، السفر، العيادة والجنائز، الطقس والمواسم، الحج والعمرة، الذكر المطلق، السلام والمناسبات، وأخيرًا fallback «أدعية متفرقة». + `searchCategories(query)` بتطبيع عربي.
- **Refs للملفات**: `doorRef(catId)` و `itemRef(catId,itemId)` → `{ fileName, url }` (من `filename` الأصلي لأنه فريد).
- **تقدم اليومي**: `recordCompletion(catId,itemId)` و `progressForCategory(catId)` و `progressForDay()` بمفتاح `hisn.progress` — كل بداخل `try/catch`.

## 2) تعميم التخزين المحلي — `src/services/reciterStorage.mjs` (تعديل داخلي)
- استخراج نواة عامة: `openFileSink(ns, fileName)`, `localUrlFor(ns, fileName)`, `markStoredByFile(ns,fileName,bytes)`, `removeFileBy(ns,fileName)`, `hasFile(ns,fileName)`.
- الإبقاء على API السورة الحالي كغلاف فوق النواة (لا كسر لتحميلات القرآن/الراديو).
- دليل جديد `altaqwaa-audios/hisn/` مع نفس الـ backend الذكي (Cordova file API → IndexedDB fallback).

## 3) خدمة التحميل — `src/services/hisnDownload.mjs` (جديد)
- نموذج مطابق لـ `downloadManager.mjs` (jobs + subscribers + snapshot، `MAX_CONCURRENCY=1`, 3 محاولات، backoff).
- `downloadDoor(catId)` — يحمّل ملف الباب ثم أذكاره تسلسليًا، `downloadItem(catId,itemId)`, `cancel()`, `removeCategory(catId)`, `stats()`.
- أخطاء عربية: انقطاع، quota، إذن تخزين، ملف تالف.

## 4) المشغّل — `src/services/player.mjs` (تعديل)
- `resolveTrackUrl` لأنواع: `kind:'hisn'` → `localUrlFor('hisn', fileName) || track.url (https)`.
- رسالة خطأ مخصصة: أوفلاين → «لا يوجد اتصال ولا نسخة محفوظة لهذا الذكر/الباب» + زر إعادة المحاولة.
- Media Session: `artist: 'حصن المسلم'`.
- `PlayerBar.jsx`: معالجة `kind==='hisn'` — شارة أيقونة درع بدل رقم السورة، عنوان `track.name`، سطر ثاني «حصن المسلم»، مؤشر «محفوظة/تُشغَّل من الإنترنت` عبر `hasFile` بدل `hasSurah`.

## 5) المكونات الجديدة (ضمن `src/components/hisnmuslim/`)
- `HisnSectionGrid.jsx` — Hero ذهبي «حصن المسلم» + بحث (debounce) + أقسام قابلة للطي + بطاقة فئة (أيقونة/حرف، عدد الأذكار، زر تشغيل الباب، زر تحميل الباب).
- `HisnCategoryList.jsx` — topbar ثابت (رجوع، عنوان الفئة، «X/Y أُنجز اليوم»)، صف «تشغيل الباب» و«تحميل الباب»، قائمة البطاقات.
- `HisnItemCard.jsx` — نص الذكر بخط `Quran`، عداد تكرار (اهتزاز + صوت)، أزرار تشغيل/تحميل/نسخ، تمييز «تمّ».
- `HisnCounter.jsx` — عداد دائري مستقل.
- `HisnAudioActions.jsx` — زر تشغيل (يدفع trackًا إلى `player.play`) + زر تحميل بحالات (spin/نسبة/تم).

## 6) الشاشات والتوجيه
- `src/screens/HisnMuslimScreen.jsx` (route `/hisnmuslim`) — الفئات + البحث + الأقسام.
- `src/screens/HisnMuslimCategoryScreen.jsx` (route `/hisnmuslim/:categoryId`).
- `src/App.jsx`: lazy + routes.
- `constants/app.mjs`: إضافة `{ path:'/hisnmuslim', label:'حصن المسلم', icon:'shield' }` إلى `NAV_ITEMS` + `SCREENS_META`.
- `Icon.jsx`: إضافة مسار `shield`.

## 7) التصميم — `global.css` (قسم جديد «حصن المسلم»)
- Hero ذهبي مع نقش هندسي (gradient + repeating pattern) بجوار الهوية الحالية، دعم dark/light.
- بطاقات فئات بأسلوب `adhkar-cat` بلهجة مميزة، رؤوس أقسام لاصقة، عداد دائري متحرك، أزرار تحميل بحالات، toast، بحث، حالات فارغة أنيقة.

## 8) معالجة الأخطاء
| الخطأ | المعالجة |
|---|---|
| No internet + غير محفوظ | رسالة عربية + إعادة محاولة، تعطيل التشغيل |
| رابط معطّل | تحويل https؛ حالة error في PlayerBar مع `retry()` |
| JSON تالف / فئة غير موجودة | حالة فارغة وليس crash |
| Storage quota | قبض + رسالة عربية |
| `audio.play()` مرفوض | تحول لحالة paused عند الضغط (موجود) |
| نسخ فاشل | toast «تعذّر النسخ» |
| unmount أثناء تشغيل | cleanup للمؤقّت والصوت |

## 9) الاختبارات والتحقق
- `tests/hisnmuslim.test.mjs` (node --test): سلامة JSON، تغطية كل فئة بقسم، بحث بتشكيل، HTTPS normalization، تقدم يومي.
- ثم: `npm run test` + `npm run build` + مراجعة يدوية عبر `npm run dev`.