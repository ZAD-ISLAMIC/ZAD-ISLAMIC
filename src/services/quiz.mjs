import { storage } from './storage.mjs'

/* ------------------------------------------------------------------ *
 * بيانات الأسئلة — تُحمَّل بتكاسل (lazy) لأن الملف ~2.4MB حتى لا
 * يدخل الحزمة الحرجة، بنفس نمط geo.mjs.
 * ------------------------------------------------------------------ */

let dataCache = null
let dataLoading = null

export async function loadQuiz() {
  if (dataCache) return dataCache
  if (!dataLoading) {
    dataLoading = import('../resources/data/IslamicQuiz.json').then((mod) => {
      dataCache = mod.default
      return dataCache
    })
  }
  return dataLoading
}

/** للاختبارات فقط: إعادة تعيين الحالة الداخلية. */
export function _resetQuizInternal() {
  dataCache = null
  dataLoading = null
  cached = null
  listeners = new Set()
}

/** للاختبارات فقط: حقن البيانات دون تحميل الملف الكبير. */
export function _setQuizData(data) {
  dataCache = data
}

/* ------------------------------------------------------------------ *
 * ثوابت اللعبة
 * ------------------------------------------------------------------ */

export const QUIZ_NS = 'quiz'
export const PROGRESS_KEY = 'quiz.progress'
export const LEVEL_KEYS = ['level1', 'level2', 'level3']

/** اجتياز المستوى يفتح الباب التالي. */
export const PASS_RATIO = 0.6
/** بوابة العبور إلى المستوى الثالث. */
export const HARD_PASS_RATIO = 0.7

export const QUESTION_TIME_MS = 35000
export const FAST_ANSWER_MS = 10000

/** عتبة النسبة لأعداد النجمة الثلاث (ترتيب تنازلي). */
export const STAR_RATIOS = [0.9, 0.75, 0.5]

export const RANKS = [
  { stars: 0, name: 'مبتدئ', icon: 'star' },
  { stars: 20, name: 'طالب علم', icon: 'book' },
  { stars: 60, name: 'مجتهد', icon: 'bolt' },
  { stars: 150, name: 'ذاكر', icon: 'beads' },
  { stars: 300, name: 'متقن', icon: 'medal' },
  { stars: 500, name: 'عالِم', icon: 'trophy' },
  { stars: 873, name: 'قدوة', icon: 'crown' },
]

/** الحد الأقصى للنجوم الفعلية حسب البيانات (97 موضوع × 3 مستويات × 3 نجوم). */
export const MAX_TOTAL_STARS = 873

export const CATEGORY_STYLES = {
  tafseer: '#d4af37',
  akida: '#2dd4bf',
  hadith: '#7c9cff',
  figh: '#4ade80',
  history: '#b48cff',
  arabia: '#fb7185',
}

/* ------------------------------------------------------------------ *
 * أدوات مساعدة عامة
 * ------------------------------------------------------------------ */

/** خلط نسخة جديدة — لا يعدّل المصفوفة الأصلية (Fisher–Yates). */
export function shuffle(items) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** مفتاح مستقر لمستوى ما: `englishName/slug/levelN`. */
export function levelKey(categoryEnglish, slug, level) {
  return `${categoryEnglish}/${slug}/${level}`
}

export function parseLevelKey(key) {
  const [englishName, slug, level] = String(key || '').split('/')
  return { englishName, slug, level }
}

/** رقم المستوى من 'levelN'. */
export function levelNumber(level) {
  const n = parseInt(String(level || '').replace(/\D/g, ''), 10)
  return Number.isFinite(n) ? n : 1
}

export function accentForCategory(englishName) {
  return CATEGORY_STYLES[englishName] || '#10b981'
}

/* ------------------------------------------------------------------ *
 * فهارس البيانات (تُستدعى بعد تحميل البيانات)
 * ------------------------------------------------------------------ */

export function getCategories() {
  return dataCache ? dataCache.mainCategories : []
}

export function getCategoryByEnglish(englishName) {
  if (!dataCache) return null
  return dataCache.mainCategories.find((c) => c.englishName === englishName) || null
}

export function getTopic(categoryEnglish, slug) {
  const category = getCategoryByEnglish(categoryEnglish)
  if (!category) return null
  return category.topics.find((t) => t.slug === slug) || null
}

export function getLevel(categoryEnglish, slug, level) {
  const topic = getTopic(categoryEnglish, slug)
  if (!topic) return null
  return topic.levelsData[level] || null
}

/** كل مفاتيح مستويات موضوع ما. */
export function topicLevelKeys(categoryEnglish, slug) {
  return LEVEL_KEYS.map((level) => levelKey(categoryEnglish, slug, level))
}

/** كل مفاتيح مستويات مجال كامل. */
export function categoryLevelKeys(category) {
  const keys = []
  for (const topic of category.topics || []) {
    keys.push(...topicLevelKeys(category.englishName, topic.slug))
  }
  return keys
}

/** جاهزية أسئلة المستوى للاعب: يسردها بالترتيب مع خلط الحلول. */
export function buildSessionQuestions(questions) {
  return shuffle(questions).map((question) => {
    const shuffledAnswers = shuffle(question.answers)
    return {
      id: question.id,
      q: question.q,
      link: question.link,
      answers: shuffledAnswers.map((a) => a.answer),
      correctIndex: shuffledAnswers.findIndex((a) => a.t === 1),
    }
  })
}

export function maxTotalStars() {
  if (!dataCache) return 0
  let stars = 0
  for (const category of dataCache.mainCategories) {
    for (const topic of category.topics || []) {
      stars += LEVEL_KEYS.filter((level) => (topic.levelsData[level] || []).length > 0).length * 3
    }
  }
  return stars
}

/* ------------------------------------------------------------------ *
 * حساب النجوم والفتح والرتب
 * ------------------------------------------------------------------ */

export function starsFromRatio(ratio) {
  const r = Number(ratio) || 0
  if (r >= STAR_RATIOS[0]) return 3
  if (r >= STAR_RATIOS[1]) return 2
  if (r >= STAR_RATIOS[2]) return 1
  return 0
}

export function passed(ratio) {
  return (Number(ratio) || 0) >= PASS_RATIO
}

/** الحد الأدنى المطلوب على المستوى السابق لفتح المستوى `levelNumber`. */
export function minPreviousRatio(levelNumber) {
  if (levelNumber <= 1) return 0
  return levelNumber === 2 ? PASS_RATIO : HARD_PASS_RATIO
}

export function unlockHint(levelNumber) {
  if (levelNumber <= 1) return ''
  if (levelNumber === 2) return 'أنجِز المستوى الأول بنسبة 60%'
  return 'أنجِز المستوى الثاني بنسبة 70%'
}

/** هل المستوى قابل للّعب بناءً على أفضل نتائج المحفوظة؟ */
export function isPlayable(progress, key) {
  const parsed = parseLevelKey(key)
  const n = levelNumber(parsed.level)
  if (n <= 1) return true
  const prevKey = levelKey(parsed.englishName, parsed.slug, LEVEL_KEYS[n - 2])
  const prev = progress?.levels?.[prevKey]
  return Boolean(prev && prev.ratio >= minPreviousRatio(n))
}

export function rankIndexForStars(stars) {
  const total = Number(stars) || 0
  let idx = 0
  for (let i = 0; i < RANKS.length; i += 1) {
    if (total >= RANKS[i].stars) idx = i
  }
  return idx
}

export function rankForStars(stars) {
  return RANKS[rankIndexForStars(stars)]
}

/** تقدم الرتبة الحالية نحو التالية: { current, next, ratio }. */
export function rankProgress(stars) {
  const total = Number(stars) || 0
  const idx = rankIndexForStars(total)
  const current = RANKS[idx]
  const next = RANKS[idx + 1] || null
  if (!next) return { current, next: null, ratio: 1 }
  const span = next.stars - current.stars
  return { current, next, ratio: Math.min((total - current.stars) / span, 1) }
}

/* ------------------------------------------------------------------ *
 * الإنجازات
 * ------------------------------------------------------------------ */

export const ACHIEVEMENTS = [
  { id: 'first-correct', icon: 'check', title: 'بداية الطريق', description: 'أجبْتَ عن أول سؤال صحيح' },
  { id: 'combo-5', icon: 'flame', title: 'وقود مستمر', description: 'سلسلة ٥ إجابات صحيحة متتالية' },
  { id: 'combo-10', icon: 'flame', title: 'شعلة لا تنطفئ', description: 'سلسلة ١٠ إجابات صحيحة متتالية' },
  { id: 'perfect-level', icon: 'star-fill', title: 'تام', description: 'مستوى كامل: ٢٠/٢٠ إجابات صحيحة' },
  { id: 'question-100', icon: 'target', title: 'الوصول إلى العلم', description: 'بلغتَ ١٠٠ إجابة صحيحة' },
  { id: 'topic-master', icon: 'medal', title: 'سيّد الموضوع', description: '٣ نجوم في مستويات موضوع كامل' },
  { id: 'category-done', icon: 'trophy', title: 'فاتح الأبواب', description: 'اجتزت كل مستويات مجال كامل' },
  { id: 'rank-scholar', icon: 'trophy', title: 'عالِم', description: 'أن تتسمى رتبة «عالِم»' },
]

export function unclaimedAchievements(progress) {
  const achieved = new Set(progress?.achievements || [])
  return ACHIEVEMENTS.filter((a) => !achieved.has(a.id))
}

/* ------------------------------------------------------------------ *
 * التخزين + المخزن الحي (subscribe/emit)
 * ------------------------------------------------------------------ */

let cached = null
let listeners = new Set()

function defaultProgress() {
  return {
    version: 1,
    levels: {},
    stats: { correct: 0, wrong: 0, gamesPlayed: 0, bestCombo: 0, perfects: 0 },
    achievements: [],
    lastSession: null,
  }
}

export function getProgress() {
  if (!cached) {
    cached = readProgress()
  }
  return cached
}

function readProgress() {
  const raw = storage.get(PROGRESS_KEY, null)
  if (!raw || typeof raw !== 'object') return defaultProgress()
  const base = defaultProgress()
  return {
    ...base,
    ...raw,
    levels: { ...(raw.levels || {}) },
    stats: { ...base.stats, ...(raw.stats || {}) },
    achievements: Array.isArray(raw.achievements) ? raw.achievements : [],
  }
}

function persist() {
  storage.set(PROGRESS_KEY, cached)
}

function emit() {
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      /* ignore */
    }
  })
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getSnapshot() {
  return getProgress()
}

/** إعادة تعيين كل تقدم الأسئلة (تُستخدم من الإعدادات والأزرار). */
export function resetProgress() {
  cached = defaultProgress()
  persist()
  emit()
}

/** إعادة تعيين كل تقدم الأسئلة. */
export function resetAllProgress() {
  resetProgress()
}

/** حفظ جلسة غير مكتملة للاستئناف. */
export function saveLastSession(session) {
  cached = getProgress()
  cached.lastSession = session
  persist()
  emit()
}

export function clearLastSession() {
  cached = getProgress()
  cached.lastSession = null
  persist()
  emit()
}

function totalStars() {
  const progress = getProgress()
  return Object.values(progress.levels).reduce((sum, record) => sum + (record.stars || 0), 0)
}

/** دمج نتيجة جلسة، إرجاع { record, newAchievements, rankBefore, rankAfter } */
export function recordResult({ key, correct, total, wrong, combo, topicKeys, categoryKeys }) {
  cached = getProgress()
  const ratio = total > 0 ? correct / total : 0
  const stars = starsFromRatio(ratio)
  const prior = cached.levels[key]
  const rankBefore = rankForStars(totalStars())
  const isBest = !prior || ratio > prior.ratio || (ratio === prior.ratio && correct > prior.correct)

  if (isBest) {
    cached.levels[key] = {
      stars: Math.max(prior?.stars || 0, stars),
      ratio,
      correct,
      plays: (prior?.plays || 0) + 1,
      bestCombo: Math.max(prior?.bestCombo || 0, combo || 0),
    }
  } else {
    cached.levels[key] = {
      ...cached.levels[key],
      plays: (cached.levels[key].plays || 0) + 1,
      bestCombo: Math.max(cached.levels[key].bestCombo || 0, combo || 0),
    }
  }

  cached.stats.correct += correct
  cached.stats.wrong += wrong
  cached.stats.gamesPlayed = (cached.stats.gamesPlayed || 0) + 1
  cached.stats.bestCombo = Math.max(cached.stats.bestCombo || 0, combo || 0)
  if (correct === total && total > 0) cached.stats.perfects = (cached.stats.perfects || 0) + 1

  const newAchievements = resolveAchievements(cached, { key, ratio, stars, topicKeys, categoryKeys })
  cached.lastSession = null
  persist()
  emit()
  return {
    record: cached.levels[key],
    newAchievements,
    rankBefore,
    rankAfter: rankForStars(totalStars()),
  }
}

function resolveAchievements(progress, ctx) {
  const achieved = new Set(progress.achievements)
  const additions = []
  const grant = (id) => {
    if (!achieved.has(id)) {
      achieved.add(id)
      additions.push(id)
    }
  }
  if (progress.stats.correct >= 1) grant('first-correct')
  if (progress.stats.bestCombo >= 5) grant('combo-5')
  if (progress.stats.bestCombo >= 10) grant('combo-10')
  if (progress.stats.perfects >= 1) grant('perfect-level')
  if (progress.stats.correct >= 100) grant('question-100')
  if (rankForStars(totalStars()).stars >= 500) grant('rank-scholar')

  if (ctx.topicKeys?.length) {
    const mastered = ctx.topicKeys.every((k) => (progress.levels[k] || {}).stars >= 3)
    if (mastered) grant('topic-master')
  }
  if (ctx.categoryKeys?.length) {
    const done = ctx.categoryKeys.every((k) => passed((progress.levels[k] || {}).ratio))
    if (done) grant('category-done')
  }

  if (additions.length) progress.achievements = [...progress.achievements, ...additions]
  return additions.map((id) => ACHIEVEMENTS.find((a) => a.id === id))
}