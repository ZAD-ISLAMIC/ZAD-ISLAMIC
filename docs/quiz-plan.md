# خطة إنشاء نظام «الأسئلة الإسلامية» التفاعلي

## الوضع الحالي (المستخلَص)
- `IslamicQuiz.json` (2.4MB) **غير مستخدَم**: 6 مجالات (`tafseer`, `akida`, `hadith`, `figh`, `history`, `arabia`) → 97 موضوعًا → 3 مستويات/موضوع (`level1..3`) → 20 سؤالًا/مستوى = **5820 سؤالًا**.
- كل سؤال: `{ id, q, link (dorar.net)، answers[3] }` مع `t:1` للإجابة الصحيحة الوحيدة — **الصحيحة دائمًا أولًا**، لذا يجب الخلط عند العرض.
- لا يوجد أي كود Quiz حالي. المطلوب بناء كامل من الصفر بالأعراف: JS فقط، `.mjs` للخدمات، `.jsx` للمكونات، HashRouter + lazy، CSS في `global.css` بمتغيرات `theme.css`، أصوات عبر `sound.mjs`، تخزين عبر `storage.mjs`، اختبارات `node --test`.

## قرارات المستخدم (المعتمدة)
1. **الفتح**: اجتياز المستوى بنسبة ≥60% يفتح المستوى التالي؛ المستوى 3 يتطلب ≥70% على المستوى 2.
2. **المؤقّت**: 35ث لكل سؤال + مكافأة سرعة إضافية للإجابة خلال 10ث.
3. **الأصوات**: توليد WAV برمجيًا بسكربت node (correct / wrong / win / lose / star) + تسجيلها في `sound.mjs`.

---

## 1) طبقة البيانات والمنطق — `src/services/quiz.mjs` (جديد)
- تحميل **lazy** للـ JSON (نمط `geo.mjs`): `loadQuiz()` يخزّن وعدًا مشتركًا لتجنّب التحميل المتكرر.
- دوال جلب نقيّة: `getCategories()`, `getCategoryByEnglish(englishName)`, `getTopic(cat, slug)`, `getLevel(cat, slug, level)`, `levelKey(…)/parseLevelKey`.
- **الخلط**: `shuffle(array)` في نسخة جديدة (لا تعديل للـ data الأصلية).
- **النجوم**: 3★ ≥90%، 2★ ≥75%، 1★ ≥50%، أقل = 0. `starsFromRatio`.
- **الرتب**: مبتدئ 0، طالب علم 10، مجتهد 30، ذاكر 60، متقن 120، عالِم 200، قدوة 291 (كامل). `rankForStars` + شريط تقدم الرتبة التالية.
- **الإنجازات** (~8): أول إجابة صحيحة، سلسلة 5، سلسلة 10، مستوى مثالي (20/20)، باب كامل (3★ في المستويات الثلاثة)، إكمال مجال كامل، 100 سؤال صحيح، تحقيق رتبة عالِم.
- **التخزين** مفتاح `quiz.progress`: `{ stars, bestRatio, stats, achievements, lastSession }` + **مخزن subscribe/emit** (`subscribe/getSnapshot/notify`) كـ `player.mjs` ليُحدَّث كل الشاشات لحظيًا، مع `try/catch` على كل عمليات التخزين.
- `openExternal(url)` — فتح المصدر بأمان (inappbrowser ← window.open ← location) داخل `device.mjs`.

## 2) الاختبارات — `tests/quiz.test.mjs` (جديد)
- تكامل البيانات: 6 مجالات، كل موضوع 3 مستويات × 20 سؤالًا، كل سؤال إجابة صحيحة واحدة بالضبط، `q/link` غير فارغين، استقرار `levelKey`.
- منطق: `shuffle` لا يغيّر الأصلي، حدود النجوم، `canUnlock`, علاقة الفتح (60/70)، `rankForStars`, دمج أفضل نتيجة، اكتشاف الإنجازات، تخزين عبر `installLocalStorageMock` (نمط `hisnmuslim.test.mjs`).

## 3) الأصوات — `scripts/generate-ui-sounds.mjs` (جديد) + `sound.mjs` (تعديل)
- سكربت node خالص يولّد WAV: `correct.wav` (نغمتان صاعدتان)، `wrong.wav` (طنين منخفض)، `win.wav` (آربيجيو فوز)، `lose.wav` (هابطة)، `star.wav` (نقرة).
- `scripts`: إضافة `"gen:ui-sounds": "node scripts/generate-ui-sounds.mjs"`.
- `sound.mjs`: إضافة الأسماء إلى `SOUNDS` + `playSound('correct'|'wrong'|'win'|'lose'|'star')`.

## 4) الأيقونات + التصميم
- `Icon.jsx`: إضافة `trophy, star, star-fill, lock, flame, medal, bolt, target, roster`.
- `global.css`: قسم `.quiz-*` — لوحات رئيسية، أبواب مقفلة/مفتوحة، مؤقّت دائري، نجوم متوهجة، confetti CSS، toasts إنجاز، حالات فارغة، ألوان مجالات عبر `--cat-accent` inline (نمط الأقسام الحالية).

## 5) المكونات — `src/components/quiz/`
- `QuizCategoryGrid.jsx` — شبكة المجالات الستة مع إكمال كل مجال.
- `QuizTopicGrid.jsx` — أبواب (مواضيع) المجال: قفلة/نجوم/أفضل نسبة + شريط تقدم.
- `QuizLevelDoor.jsx` — بطاقة باب/مستوى (مقفل، متاح، مكتمل، still قياسي).
- `QuizSession.jsx` — محرك الجلسة: خلط الأسئلة والإجابات، مؤقّت 35ث، كومبو 🔥، مكافأة سرعة، حفظ النتائج، مراجعة الأخطاء.
- `QuizQuestionCard.jsx` — بطاقة السؤال + الأزرار + حلقة المؤقّت.
- `QuizResult.jsx` — رقم متحرك، نجوم، confetti، تفصيل، مراجعة الأخطاء + المصدر، أزرار (إعادة/التالي/عودة).
- `QuizStats.jsx` — إحصاءات دائمة (صحيح/خطأ/دقة/أفضل سلسلة/جلسات اليوم).
- `AchievementToast.jsx` — منبثق إنجاز.
- `src/hooks/useQuiz.mjs` — `useQuiz()` عبر `useSyncExternalStore`.

## 6) الشاشات والتوجيه
- `src/screens/QuizScreen.jsx` (`/quiz`) — لوحة رتبة/نجوم/إكمال + «متابعة» + إحصاءات + شبكة المجالات.
- `src/screens/QuizCategoryScreen.jsx` (`/quiz/:categoryEnglish`) — أبواب المجال.
- `src/screens/QuizSessionScreen.jsx` (`/quiz/:categoryEnglish/:topicSlug/:level`) — الجلسة.
- `src/App.jsx`: lazy + 3 مسارات. `constants/app.mjs`: دخول `{ path:'/quiz', label:'الأسئلة', icon:'trophy' }` في `NAV_ITEMS` (لا بوتوم ناف) + `SCREENS_META.quiz`.

## 7) معالجة الأخطاء
| الخطأ | المعالجة |
|---|---|
| فشل تحميل الـ JSON | try/catch + شاشة إعادة محاولة |
| مسار غير صالح (مجال/موضوع/مستوى) | شاشة «غير موجود» ودية + زر عودة |
| سؤال بدون إجابة صحيحة | يُتخطّى بأمان (الاختبارات تضمن سلامة البيانات) |
| خروج وسط الجلسة | `lastSession` → زر «متابعة» |
| تخزين محظور/ممتلئ | نتم الجلسة + تنبيه «النتيجة لم تُحفظ» |
| فتح المصدر خارجيًا | `openExternal` آمن (inappbrowser ← window.open) |
| فشل الصوت | `playSound` محمية try/catch أصلًا |
| ضغطة مزدوجة | تعطيل الأزرار بعد الاختيار |

## 8) ترتيب التنفيذ
1. `quiz.mjs` → 2. الاختبارات → 3. الأصوات → 4. الأيقونات/CSS → 5. المكونات → 6. الشاشات/التوجيه → 7. فحص `npm run dev` ثم `npm run build`.