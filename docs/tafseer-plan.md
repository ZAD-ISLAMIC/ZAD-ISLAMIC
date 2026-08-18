# خطة إنشاء صفحة «التفسير الميسر»

## الوضع الحالي (المستخلَص)
- `src/resources/data/tafseerMouaser.json` (~6MB على القرص): **6,236 سجلًا** — كل آيات القرآن (114 سورة) بدون نصوص فارغة.
- كل سجل: `{ id, sura_no (1-114), aya_no (رقم الآية داخل السورة), aya_text (نص المصحف بخط عثماني), aya_text_emlaey (نص واضح), aya_tafseer (نص التفسير الميسر), jozz (1-30), page }`.
- المطابقة مع `quran.json`: **موضعية** (سورة رقم + آية رقم) وليست نصية — آيات الفاتحة مرقّمة من البسملة، وسورة التوبة بلا بسملة، والعدادات مطابقة تمامًا لـ `Number_Verses`.
- نص التفسير يبدأ بوسم مرجعي مثل `[1]`، وبعضه متعدد `[33، 34]` (تفسير يغطي آيتين) وبعضه مكسور `99]` — يحتاج معالجة عند العرض.
- لا توجد أي ميزة تفسير حاليًا؛ الأنماط الجاهزة للتكرار: `scripts/split-history.mjs`، `src/services/history.mjs`، مكوّنات الفتاوى (هيرو/بطاقة/toast)، و`QuranReader` (عدّاد خط + حفظ موضع).

## قرارات المستخدم
1. الدخول: **صفحة مستقلة `/tafseer`** + **زر تنقّل داخل قارئ المصحف**.
2. العرض: **بطاقات قابلة للتوسيع** (الآية بخط المصحف، الضغط يوسّع تفسيرها).
3. الأدوات: تكبير/تصغير الخط، نسخ التفسير، الانتقال لآية المصحف بالاتجاهين، حفظ آخر موضع، بحث في نصوص الآيات والتفسير.

---

## 1) سكربت تقسيم البيانات — `scripts/split-tafseer.mjs` (جديد) + `npm run gen:tafseer`
يقسم `tafseerMouaser.json` (+ `quran.json` للعدادات/الصفات) إلى `src/resources/data/tafseer/`:
- `index.json` (ثابت خفيف): `[{ n, name, nameAr, descent, verses, jozz:[بداية،نهاية], pages:[بداية،نهاية] }]` — 114 سورة.
- `sura-<n>.mjs` لكل سورة: `export default [records]` (أكبرها البقرة ≈ 228KB) — تحميل لازي عند الدخول.
- `index-search.mjs` (لازي): `[{ id, s, a, at: نص الآية مُطبّعًا, dt: نص التفسير مُطبّعًا }]` للبحث العام.
- `chunks.mjs`: `TAFSEER_TOTAL = 6236` + خريطة `n → () => import('./sura-n.mjs')` + تنظيف الملفات القديمة.
- احتياطي: عدّاد آيات مستخلص من `quran.json` لكل سورة؛ أي تعارض = خطأ.

## 2) الخدمة — `src/services/tafseer.mjs` (جديد)
- `normalizeArabic` (نمط history/fatwas) + `TAFSEER_SURAHS` / `getSurahByNo(n)` / `totalStats()`.
- `loadSurah(n)` — dynamic import مع cache في الذاكرة (Promise واحد، نمط `loadEra`).
- `stripLeadingMarker(text, ayaNo)` — يحذف وسم `[N]` المُطابق لرقم الآية فقط، ويُبقي الأوسمة الأخرى (`[33، 34]`، `99]`) لأنها تحمل معلومات.
- `searchTafseer(query, { limit })` — بحث مُطبّع في `at`/`dt`، يعيد `[{ n, a }]`.
- `buildShareText(record)` — «سورة … — الآية …» + نص الآية الإملائي + التفسير + «من تطبيق التقوى».

## 3) المكونات — `src/components/tafseer/`
- `TafseerHero.jsx` — هيرو ذهبي بإحساس مصحفي: العنوان + وصف + إحصاءات (سور/آيات/أجزاء).
- `TafseerSurahList.jsx` — بحث (بالاسم/الرقم) + بطاقة «متابعة التفسير» (آخر موضع محفوظ) + شبكة السور (تُعيد استعمال أسلوب `.quran-item`).
- `TafseerVerseCard.jsx` — بطاقة قابلة للتوسيع: رأس = رقم الآية (شارة ذهبية) + نص الآية بخط `Quran`؛ عند التوسيع = نص التفسير بخط Vazirmatn + إجراءات (نسخ، فتح في المصحف) + إبراز عند القدوم عبر `?verse`.
- `TafseerSuraReader.jsx` — توببار لاصق (نمط `quran-reader__topbar`): اسم السورة + صفتها/عدد آياتها + الجزء/الصفحة، عدّاد خط محفوظ (`tafseer.fontSize`)، توسيع/طيّ الكل، السورة السابقة/التالية، حفظ موضع (`tafseer.reading`).

## 4) الشاشات والتوجيه
| الشاشة | المسار | السلوك |
|---|---|---|
| `TafseerScreen.jsx` | `/tafseer` | هيرو + بحث + شبكة السور + متابعة القراءة (فوري) |
| `TafseerSuraScreen.jsx` | `/tafseer/:surahIndex` | تحميل لازي؛ `?verse=N` يوسّع البطاقة ويتمرّر إليها |

- `App.jsx`: مساران lazy.
- `constants/app.mjs`: `NAV_ITEMS` + `SCREENS_META.tafseer` (بطاقة في الرئيسية فقط، بلا BottomNav).
- `headerTitle.mjs`: قراءة `tafseer/index.json` → «سورة البقرة — التفسير».
- `Icon.jsx`: إضافة أيقونة `book-open`.

## 5) تكامل قارئ المصحف
- `QuranReader.jsx`: خاصية `onTafseer` → زر في شريط الأدوات يفتح `/tafseer/<surahIndex>?verse=<current>`.
- `QuranSurahScreen.jsx`: تمرير `onTafseer` عبر `navigate`.

## 6) التصميم — `global.css` (قسم «التفسير الميسر»)
- إعادة استعمال `.quran-search`، `.quran-continue`، `.quran-list/.quran-item` للقوائم.
- `.tverse`: بطاقة بخط فاصل رفيع، رأس = نص المصحف بخط `Quran` + شارة الرقم، توسيع سلس، محتوى التفسير بتباعد مريح ووسم «التفسير الميسر» بلون ذهبي خافت، أزرار إجراءات، toast للنسخ.
- توببار لاصق بخلفية `var(--bg)` وظل، و`content-visibility:auto` للسور الطويلة.

## 7) معالجة الأخطاء
| الخطأ | المعالجة |
|---|---|
| فشل تحميل شظية سورة / فهرس بحث | رسالة عربية + زر إعادة المحاولة |
| سورة غير موجودة / خارج النطاق | حالة فارغة + زر عودة |
| unmount أثناء التحميل | `alive` flag + إلغاء المؤقت/المراقب |
| نسخ فاشل | toast «تعذّر النسخ» |

## 8) الاختبارات — `tests/tafseer.test.mjs` (node --test)
- سلامة `index.json`: 114 سورة، مجموع العدادات 6236، مطابقة `Number_Verses`.
- سلامة الشظايا: `aya_no` متسلسلة، حقول مكتملة، `id` فريدة، المجموع 6236.
- `stripLeadingMarker`.
- `searchTafseer` بتطبيع عربي.
- `buildShareText` يتضمن الآية + التفسير + حق التطبيق.
- ثم `npm run test` + `npm run build` + مراجعة يدوية عبر `npm run dev`.

---