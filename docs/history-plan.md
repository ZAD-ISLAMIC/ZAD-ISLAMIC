# خطة إنشاء صفحة «الموسوعة التاريخية»

## الوضع الحالي (المستخلَص)
- `src/resources/data/history.json`: **6,128 حدثًا**، كل حدث `{ id, title, date[], text }` — **منسق زمنيًا** بالفعل، كل حدث له عام هجري + ميلادي (وبعضها شهر قمري).
- الحجم **12MB** — لا يجوز استيراده ثابتًا. الأنسب: تقسيم حسب الحقبة (نمط `split-fatwas.mjs`).
- توزيع الأحداث بالقرون: قبل الهجرة 36، ثم القرن 1هـ وحتى 15هـ (أكبر شظية القرن 14 ≈ 890KB) — كل شظية تعمل **dynamic import**.
- البيانات تحقّق الشروط: أحداث ذات صلة بالإسلام ولو صدرت من غيرهم، عناوين قصيرة، مصادر موثّقة نُقلت في النص (مسلم، الذهبي، ابن كثير…). يبقى النص كما هو — لا يُعدَّل.

## قرارات المستخدم
1. التنظيم: **تصنيف بالقرون الهجرية** (قبل الهجرة + 1هـ–15هـ).
2. التحميل: **تقسيم حسب الحقبة** (شظية لكل قرن، تُحمَّل عند الدخول فقط).

---

## 1) سكربت تقسيم البيانات — `scripts/split-history.mjs` (جديد) + `npm run gen:history`
يقرأ `history.json` ويولّد في `src/resources/data/history/`:
- `index.json` (ثابت، خفيف): `[{ key, title, count, firstYear, lastYear }]` للحقبة، `key` = `before` أو `c1..c15`.
- `era-<key>.mjs` لكل حقبة: `export default [events]` (حتى ~890KB → dynamic import عند الدخول).
- `index-search.mjs` (لازي): `[{ id, t: title مقصَّص، s: snippet من النص }]` للبحث العام.
- `chunks.mjs`: `HISTORY_TOTAL_COUNT` + خريطة `key → loader` (تصلح لـ Vite والاختبارات Node)، مع **تنظيف الملفات القديمة**.

## 2) الخدمة — `src/services/history.mjs` (جديد)
- `normalizeArabic` (نمط fatwas/hisnmuslim) + `getEras()` / `getEraByKey(key)`.
- `loadEra(key)` — dynamic import مع cache في الذاكرة (Promise واحد).
- `getEvent(eraKey, id)` — بحث داخل شظية الحقبة.
- `loadSearchIndex()` + `searchHistory(query, {limit})` — بحث العنوان + snippet النص، يعمل دون إنترنت بعد أول تحميل.
- `formatEventDate(event)` — يفسّر أجزاء `date[]` (مع دعم «ق هـ» قبل الهجرة والشهر القمري).
- `buildShareText(event)` لزر النسخ + `HISTORY_APP_CREDIT`.

## 3) المكونات — `src/components/history/`
- `HistoryHero.jsx` — هيرو ذهبي «الموسوعة التاريخية»: وصف موجز + إحصاءات (عدد الأحداث، عدد القرون).
- `EraGrid.jsx` — شبكة بطاقات الحقبات: عنوان القرن بالأرقام العربية، نطاق السنوات، عدد الأحداث.
- `HistorySearch.jsx` — صندوق بحث debounce (نمط `FatwasScreen`): عدّاد نتائج، حالة فارغة، زر مسح، إعادة محاولة عند فشل الفهرس.
- `EventListItem.jsx` — صف مرقّم: العنوان + شارات التاريخ/المصدر.
- `EventDetail.jsx` — عنوان الحدث + رقائق التواريخ (هجري/شهر/ميلادي) + النص بخط القرآن بمسافات واسعة + أزرار (نسخ، السابق/التالي) + toast.

## 4) الشاشات والتوجيه
| الشاشة | المسار | السلوك |
|---|---|---|
| `HistoryScreen.jsx` | `/history` | هيرو + بحث عام + شبكة الحقبات (فوري) |
| `HistoryEraScreen.jsx` | `/history/:eraKey` | تحميل لازي للحقبة + ترقيم بتعشير (IntersectionObserver، 30/دفعة) |
| `HistoryEventScreen.jsx` | `/history/:eraKey/:id` | تفاصيل الحدث + التنقل سابق/تالي |

- `App.jsx`: 3 lazy routes.
- `constants/app.mjs`: `NAV_ITEMS` + `{ path:'/history', label:'الموسوعة التاريخية', icon:'scroll' }` + `SCREENS_META` (بطاقة على الرئيسية فقط، لا عنصر بـ BottomNav).
- `headerTitle.mjs`: إضافة `/history` وقراءة `history/index.json` لعنوان الحقبة الفرعية (زر رجوع تلقائي عبر `ROOT_BACK_HOME`).
- `Icon.jsx`: إضافة مسار `scroll`.

## 5) التصميم — `global.css` (قسم «الموسوعة التاريخية»)
- هيرو ذهبي بإحساس تراثي (gradient + pattern خفيف)، بطاقات قرون بلهجات لونية، بحث لاصق، `content-visibility:auto` على الصفوف، حالات تحميل/فارغة أنيقة، دعم dark/light بهوية التطبيق الحالية.

## 6) معالجة الأخطاء
| الخطأ | المعالجة |
|---|---|
| فشل تحميل شظية حقبة/فهرس بحث | رسالة عربية + زر إعادة المحاولة |
| حقبة/حدث غير موجود | حالة فارغة «لا توجد حقبة/حدث» مع زر عودة |
| unmount أثناء التحميل | `alive` flag + cleanup للمؤقت والمراقب |
| نسخ فاشل | toast «تعذّر النسخ» |

## 7) الاختبارات — `tests/history.test.mjs` (node --test)
- سلامة `index.json` (16 حقبة، مفاتيح فريدة، counts مطابقة).
- سلامة شظايا: كل حدث له `id/title/date/text` و`id` فريدة.
- `formatEventDate` مع التواريخ قبل الهجرة «ق هـ» والشهر القمري.
- البحث بتطبيع عربي.
- `buildShareText` يتضمن حقوق التطبيق.
- ثم `npm run test` + `npm run build` + مراجعة يدوية عبر `npm run dev`.

---