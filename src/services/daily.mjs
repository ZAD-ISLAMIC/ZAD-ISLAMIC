/**
 * Daily content picker — آية اليوم / ذكر اليوم / أذكار الصباح-المساء /
 * إحصاءات اليوم. كل شيء مشتق محلياً من بيانات التطبيق نفسها (مصحف، حصن،
 * أذكار) بدون شبكة وبلا حالة عابرة: نفس اليوم الميلادي → نفس المحتوى.
 */

import quranData from '../resources/data/quran.json' with { type: 'json' }
import hisnData from '../resources/data/hisnmuslim.json' with { type: 'json' }

/* ------------------------------------------------------------------ *
 * آية اليوم — مراجع مصوّنات شهيرة (سورة بفهرس مصحف التطبيق 0-أساس،
 * آية برقمها). النص يُسحب من المصحف المدمج نفسه = مصدر موثوق.
 * ------------------------------------------------------------------ */

const VERSE_REFS = [
  { s: 0, v: 5 },     // الفاتحة 5
  { s: 1, v: 152 },   // البقرة 152
  { s: 1, v: 153 },   // البقرة 153
  { s: 1, v: 186 },   // البقرة 186
  { s: 1, v: 255 },   // آية الكرسي
  { s: 1, v: 286 },   // لا يكلف الله نفساً
  { s: 2, v: 139 },   // لا تهنوا ولا تحزنوا
  { s: 2, v: 173 },   // حسبنا الله ونعم الوكيل
  { s: 3, v: 86 },    // وإذا حييتم بتحية
  { s: 4, v: 35 },    // ابتغوا إليه الوسيلة
  { s: 5, v: 32 },    // الحياة الدنيا لعب ولهو
  { s: 6, v: 199 },   // خذ العفو وأمر بالعرف
  { s: 8, v: 51 },    // لن يصيبنا إلا ما كتب الله لنا
  { s: 9, v: 57 },    // يا أيها الناس قد جاءتكم موعظة
  { s: 12, v: 28 },   // ألا بذكر الله تطمئن القلوب
  { s: 13, v: 7 },    // لئن شكرتم لأزيدنكم
  { s: 15, v: 97 },   // من عمل صالحاً فلنحيينه حياة طيبة
  { s: 16, v: 80 },   // رب أدخلني مدخل صدق
  { s: 17, v: 46 },   // المال والبنون زينة الحياة الدنيا
  { s: 19, v: 14 },   // إنني أنا الله لا إله إلا أنا
  { s: 23, v: 35 },   // الله نور السماوات والأرض
  { s: 24, v: 74 },   // ربنا هب لنا من أزواجنا
  { s: 26, v: 40 },   // هذا من فضل ربي
  { s: 27, v: 24 },   // رب إني لما أنزلت إلي من خير فقير
  { s: 28, v: 69 },   // والذين جاهدوا فينا لنهدينهم سبلنا
  { s: 29, v: 21 },   // ومن آياته أن خلق لكم من أنفسكم أزواجاً
  { s: 30, v: 13 },   // يا بني لا تشرك بالله
  { s: 38, v: 53 },   // لا تقنطوا من رحمة الله
  { s: 39, v: 60 },   // ادعوني أستجب لكم
  { s: 40, v: 30 },   // إن الذين قالوا ربنا الله ثم استقاموا
  { s: 41, v: 30 },   // وما أصابكم من مصيبة فبما كسبت أيديكم
  { s: 50, v: 56 },   // وما خلقت الجن والإنس إلا ليعبدون
  { s: 54, v: 13 },   // فبأي آلاء ربكما تكذبان
  { s: 58, v: 18 },   // اتقوا الله ولتنظر نفس ما قدمت لغد
  { s: 60, v: 4 },    // إن الله يحب الذين يقاتلون في سبيله صفاً
  { s: 61, v: 9 },    // إذا نودي للصلاة من يوم الجمعة فاسعوا إلى ذكر الله
  { s: 92, v: 5 },    // ولسوف يعطيك ربك فترضى
  { s: 93, v: 5 },    // فإن مع العسر يسرا
  { s: 98, v: 7 },    // فمن يعمل مثقال ذرة خيرا يره
  { s: 111, v: 1 },   // قل هو الله أحد
]

/** ثابت يوم السنة (1..366) حسب التقويم الميلادي الموقّع. */
export function dayOfYear(date = new Date()) {
  const start = Date.UTC(date.getFullYear(), 0, 0)
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.floor((day - start) / 86400000)
}

/**
 * نص آية من مصحف التطبيق المصححي (حفص) بالرسم العثماني.
 * @returns {{ text:string, surahIndex:number, surahName:string, verse:number } | null}
 */
export function verseByRef(surahIndex, verse) {
  const surah = quranData[surahIndex]
  if (!surah) return null
  const verses = Array.isArray(surah.Array_Verses)
    ? surah.Array_Verses.flat()
    : []
  const v = verses.find((x) => Number(x.id) === Number(verse))
  if (!v || !v.ar) return null
  return {
    text: v.ar,
    surahIndex,
    surahName: surah.Name,
    verse: Number(verse),
  }
}

/** آية اليوم — تتغير يومياً عبر VERSE_REFS. */
export function todayVerse(date = new Date()) {
  const ref = VERSE_REFS[dayOfYear(date) % VERSE_REFS.length]
  return verseByRef(ref.s, ref.v)
}

/* ------------------------------------------------------------------ *
 * ذكر اليوم — تناوب عبر أذكار حصن المسلم الحقيقية (بأسانيدها).
 * نختار فقط الأذكار القصيرة المتناسبة مع باقة يوم واحد.
 * ------------------------------------------------------------------ */

const DHIKR_MIN_LENGTH = 6
const DHIKR_MAX_LENGTH = 320

function flattableDhikrs() {
  const out = []
  for (const category of hisnData) {
    if (!Array.isArray(category.array)) continue
    for (const item of category.array) {
      const text = String(item.text || '').replace(/\s+/g, ' ').trim()
      const len = text.length
      if (len >= DHIKR_MIN_LENGTH && len <= DHIKR_MAX_LENGTH) {
        out.push({ category: category.category, text })
      }
    }
  }
  return out
}

/** ذكر اليوم مع موضعه في حصن المسلم وعدد تكراره (1) للعرض. */
export function todayDhikr(date = new Date()) {
  const list = flattableDhikrs()
  if (list.length === 0) return null
  const item = list[dayOfYear(date) % list.length]
  return { text: item.text, category: item.category, count: 1 }
}

/* ------------------------------------------------------------------ *
 * أذكار الصباح / المساء حسب الوقت.
 * قبل «الظهر» (أو قبل العصر إن مُرِّرت ساعته) = صباح، بعده = مساء.
 * ------------------------------------------------------------------ */

export function hourOf(date) {
  return date.getHours() + date.getMinutes() / 60
}

/**
 * @param {object} [opts]
 * @param {Date} [opts.now]
 * @param {number} [opts.asrHour]  ساعة بداية العصر (أقوى من الظهر) إن توفرت
 * @returns {'morning'|'evening'}
 */
export function pickAdhkarCategory({ now = new Date(), asrHour = null } = {}) {
  const hour = hourOf(now)
  const boundary = Number.isFinite(asrHour) ? asrHour : 12
  return hour < boundary ? 'morning' : 'evening'
}

/** إحصاءات اليوم: تسبيح اليوم + أذكار اليوم + السلسلة. */
export function todayHomeStats() {
  return {
    tasbih: tasbihToday(),
    adhkarToday: adhkarTodayAndStreak().today,
    streak: adhkarTodayAndStreak().streak,
  }
}

const STORAGE_PREFIX = 'altaqwaa:'

function readJSON(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key)
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

/* التسبيح: مفاتيح التخزين من tasbih.mjs — counts مخزّنة ببداية اليوم
 * بصيغة `{ 'YYYY-MM-DD': { dhikrId: count } }` (بـ toISOString). */
function tasbihToday() {
  const counts = readJSON('tasbih:counts', {}) || {}
  const today = new Date().toISOString().slice(0, 10)
  const day = counts[today] || {}
  return Object.values(day).reduce((sum, n) => sum + (Number(n) || 0), 0)
}

/* الأذكار: مفاتيح من adhkar.mjs — stats بصيغة
 * `{ 'YYYY-M-D': { categoryKey: count } }` بأرقام غير مبطّنة. */
function adhkarStats() {
  return readJSON('adhkar.stats', {}) || {}
}

function statsDayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function adhkarTodayAndStreak() {
  const stats = adhkarStats()
  const now = new Date()
  const today = statsDayKey(now)
  const dayTotal = (day) =>
    Object.values(stats[day] || {}).reduce((sum, n) => sum + (Number(n) || 0), 0)

  const todayCount = dayTotal(today)
  let streak = 0
  const cursor = new Date(now)
  if (todayCount > 0) {
    streak = 1
    cursor.setDate(cursor.getDate() - 1)
  }
  while (dayTotal(statsDayKey(cursor)) > 0) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return { today: todayCount, streak }
}