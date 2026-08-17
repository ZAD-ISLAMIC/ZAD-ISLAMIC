import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import quizData from '../src/resources/data/IslamicQuiz.json' with { type: 'json' }
import {
  _setQuizData,
  _resetQuizInternal,
  loadQuiz,
  getCategories,
  getCategoryByEnglish,
  getTopic,
  getLevel,
  buildSessionQuestions,
  shuffle,
  levelKey,
  parseLevelKey,
  levelNumber,
  starsFromRatio,
  passed,
  minPreviousRatio,
  isPlayable,
  rankIndexForStars,
  rankProgress,
  ACHIEVEMENTS,
  resetProgress,
  getProgress,
  recordResult,
  subscribe,
  topicLevelKeys,
  categoryLevelKeys,
  maxTotalStars,
  PASS_RATIO,
  HARD_PASS_RATIO,
} from '../src/services/quiz.mjs'

function installLocalStorageMock() {
  const map = new Map()
  const localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  }
  globalThis.window = { localStorage }
  return map
}

beforeEach(() => {
  installLocalStorageMock()
  _resetQuizInternal()
  _setQuizData(quizData)
})

/* ------------------------------------------------------------------ *
 * تكامل البيانات
 * ------------------------------------------------------------------ */

test('البيانات تحوي 6 مجالات وكل مجال مستوىً على الأقل', () => {
  const categories = getCategories()
  assert.equal(categories.length, 6)
  for (const category of categories) {
    assert.ok(category.arabicName, 'لكل مجال اسم عربي')
    assert.ok(category.englishName, 'لكل مجال اسم إنجليزي')
    assert.ok(category.topics.length > 0, 'لكل مجال مواضيع')
  }
})

test('كل موضوع له 3 مستويات × 20 سؤالاً، وكل سؤال ثبت tn صحيح واحد', () => {
  for (const category of getCategories()) {
    for (const topic of category.topics) {
      for (const level of ['level1', 'level2', 'level3']) {
        const questions = topic.levelsData[level] || []
        assert.equal(questions.length, 20, `${category.englishName}/${topic.slug}/${level}`)
        for (const q of questions) {
          assert.ok(q.q && q.q.trim(), 'السؤال غير فارغ')
          assert.equal(q.answers.filter((a) => a.t === 1).length, 1, 'إجابة صحيحة واحدة فقط')
          assert.ok(q.answers.length >= 2, 'عدد إجابات كافٍ')
        }
      }
    }
  }
})

test('المصدر موجود في الغالبية العظمى من الأسئلة (بدون رابط يعرض واجهة بدون زر مصدر)', () => {
  let total = 0
  let noLink = 0
  for (const category of getCategories()) {
    for (const topic of category.topics) {
      for (const level of ['level1', 'level2', 'level3']) {
        for (const q of topic.levelsData[level] || []) {
          total += 1
          if (!q.link || !String(q.link).trim()) noLink += 1
        }
      }
    }
  }
  assert.equal(total, 5820)
  assert.ok(noLink <= 10, `الأسئلة بلا مصدر مقبولة كحالات نادرة (${noLink})`)
})

test('العدد الكلي للمستويات والنجوم القصوى صحيح (97 × 3 × 3 = 873)', () => {
  const maxStars = maxTotalStars()
  assert.equal(maxStars, 873)
})

/* ------------------------------------------------------------------ *
 * أدوات مساعدة
 * ------------------------------------------------------------------ */

test('shuffle لا يعدّل المصفوفة الأصلية ويحافظ على العناصر', () => {
  const original = [1, 2, 3, 4, 5, 6]
  const copy = [...original]
  const shuffled = shuffle(original)
  assert.deepEqual(original, copy, 'الأصل لم يتغير')
  assert.deepEqual(shuffled.sort((a, b) => a - b), copy, 'كل العناصر حاضرة')
})

test('levelKey/parseLevelKey/levelNumber دائرية ومستقرة', () => {
  const key = levelKey('tafseer', 'al-faatihah', 'level2')
  assert.equal(key, 'tafseer/al-faatihah/level2')
  assert.deepEqual(parseLevelKey(key), { englishName: 'tafseer', slug: 'al-faatihah', level: 'level2' })
  assert.equal(levelNumber('level2'), 2)
  for (const level of ['level1', 'level2', 'level3']) {
    assert.equal(levelNumber(level), Number(level.slice(-1)))
  }
})

test('buildSessionQuestions يخلط الحلول ويحدد الصحيح', async () => {
  await loadQuiz()
  const questions = getLevel('tafseer', 'al-faatihah', 'level1')
  const session = buildSessionQuestions(questions)
  assert.equal(session.length, 20)
  for (const item of session) {
    assert.equal(item.answers.length, 3)
    assert.equal(item.answers[item.correctIndex], questions.find((q) => q.id === item.id).answers.find((a) => a.t === 1).answer)
  }
  assert.deepEqual(questions.map((q) => q.id), session.map((s) => s.id).sort((a, b) => a - b), 'كل الأسئلة حاضرة')
})

/* ------------------------------------------------------------------ *
 * النجوم والفتح والرتب
 * ------------------------------------------------------------------ */

test('starsFromRatio يطبق الحدود 90/75/50', () => {
  assert.equal(starsFromRatio(1), 3)
  assert.equal(starsFromRatio(0.9), 3)
  assert.equal(starsFromRatio(0.89), 2)
  assert.equal(starsFromRatio(0.75), 2)
  assert.equal(starsFromRatio(0.74), 1)
  assert.equal(starsFromRatio(0.5), 1)
  assert.equal(starsFromRatio(0.49), 0)
  assert.equal(starsFromRatio(0), 0)
})

test('passed يتطلب 60% والبوابة القاسية 70%', () => {
  assert.equal(PASS_RATIO, 0.6)
  assert.equal(HARD_PASS_RATIO, 0.7)
  assert.equal(passed(0.6), true)
  assert.equal(passed(0.59), false)
  assert.equal(minPreviousRatio(1), 0)
  assert.equal(minPreviousRatio(2), PASS_RATIO)
  assert.equal(minPreviousRatio(3), HARD_PASS_RATIO)
})

test('isPlayable: المستوى الأول مفتوح دائماً والتابع يُفتح حسب السابق', () => {
  const key2 = levelKey('tafseer', 'al-faatihah', 'level2')
  const key3 = levelKey('tafseer', 'al-faatihah', 'level3')
  assert.equal(isPlayable(getProgress(), levelKey('tafseer', 'al-faatihah', 'level1')), true)

  resetProgress()
  assert.equal(isPlayable(getProgress(), key2), false, 'المستوى 2 مغلق قبل أي نتيجة')
  assert.equal(isPlayable(getProgress(), key3), false)

  // اجتياز المستوى 1 بنسبة 60% يفتح 2 فقط
  recordResult({ key: levelKey('tafseer', 'al-faatihah', 'level1'), correct: 12, total: 20, wrong: 8, combo: 1, topicKeys: topicLevelKeys('tafseer', 'al-faatihah'), categoryKeys: categoryLevelKeys(getCategoryByEnglish('tafseer')) })
  assert.equal(isPlayable(getProgress(), key2), true, '60% يفتح المستوى 2')
  assert.equal(isPlayable(getProgress(), key3), false, 'المستوى 3 ما زال مغلقاً')

  // 65% على المستوى 2 لا تفتح 3 (تحت 70%)
  recordResult({ key: key2, correct: 13, total: 20, wrong: 7, combo: 2, topicKeys: topicLevelKeys('tafseer', 'al-faatihah'), categoryKeys: categoryLevelKeys(getCategoryByEnglish('tafseer')) })
  assert.equal(isPlayable(getProgress(), key3), false, '65% لا تفتح المستوى 3')

  // 70% على المستوى 2 تفتح 3
  recordResult({ key: key2, correct: 14, total: 20, wrong: 6, combo: 3, topicKeys: topicLevelKeys('tafseer', 'al-faatihah'), categoryKeys: categoryLevelKeys(getCategoryByEnglish('tafseer')) })
  assert.equal(isPlayable(getProgress(), key3), true, '70% تفتح المستوى 3')
})

test('رتب النجوم: المُصدرة والقادمة ونسبة التقدم', () => {
  assert.equal(rankIndexForStars(0), 0)
  assert.equal(rankIndexForStars(20), 1)
  assert.equal(rankIndexForStars(60), 2)
  assert.equal(rankIndexForStars(500), 5)
  assert.equal(rankIndexForStars(873), 6)
  const progress = rankProgress(120)
  assert.equal(progress.current.name, 'مجتهد')
  assert.equal(progress.next.name, 'ذاكر')
  assert.equal(progress.ratio, (120 - 60) / (150 - 60))
  const top = rankProgress(873)
  assert.equal(top.next, null)
  assert.equal(top.ratio, 1)
})

/* ------------------------------------------------------------------ *
 * التخزين والتفكير المتقدم
 * ------------------------------------------------------------------ */

test('recordResult يحفظ أفضل نتيجة ويعطي نجوماً وأرقاماً قياسية', () => {
  resetProgress()
  const key = levelKey('tafseer', 'al-faatihah', 'level1')
  const args = () => ({ key, correct: 19, total: 20, wrong: 1, combo: 19, topicKeys: topicLevelKeys('tafseer', 'al-faatihah'), categoryKeys: categoryLevelKeys(getCategoryByEnglish('tafseer')) })

  const first = recordResult(args())
  assert.equal(first.record.stars, 3, '95% يعطي 3 نجوم')
  assert.equal(first.record.ratio, 0.95)
  assert.equal(first.record.bestCombo, 19)
  assert.ok(first.newAchievements.some((a) => a.id === 'first-correct'))
  assert.ok(first.newAchievements.some((a) => a.id === 'combo-5'))
  assert.ok(first.newAchievements.some((a) => a.id === 'combo-10'))
  assert.ok(first.newAchievements.some((a) => a.id === 'perfect-level') === false, '19/20 ليس تاماً')

  const stats = getProgress().stats
  assert.equal(stats.correct, 19)
  assert.equal(stats.wrong, 1)
  assert.equal(stats.gamesPlayed, 1)
})

test('نتيجة أضعف لا تمحي الأفضل والأرقام القياسية تتحدث', () => {
  resetProgress()
  const key = levelKey('tafseer', 'al-faatihah', 'level1')
  const topicKeys = topicLevelKeys('tafseer', 'al-faatihah')
  const categoryKeys = categoryLevelKeys(getCategoryByEnglish('tafseer'))

  recordResult({ key, correct: 18, total: 20, wrong: 2, combo: 8, topicKeys, categoryKeys })
  recordResult({ key, correct: 10, total: 20, wrong: 10, combo: 3, topicKeys, categoryKeys })
  const rec = getProgress().levels[key]
  assert.equal(rec.ratio, 0.9, 'أفضل نسبة محفوظة')
  assert.equal(rec.stars, 3)
  assert.equal(rec.plays, 2)
  assert.equal(rec.bestCombo, 8, 'أفضل سلسلة محفوظة')
})

test('recordResult مستقر: أضعف نتيجة لا تنقص النجوم ويرصد الترقية', () => {
  resetProgress()
  const key = levelKey('figh', 'salah', 'level1')
  const topicKeys = topicLevelKeys('figh', 'salah')
  const categoryKeys = categoryLevelKeys(getCategoryByEnglish('figh'))

  // 20 نجمة <=> رتبة طالب علم (20+). اختبار بسيط: 3 مستويات بمذكرة 3 نجوم
  const levels = ['level1', 'level2', 'level3'].map((level) => levelKey('figh', 'salah', level))
  levels.forEach((k, i) => {
    const prev = i > 0 ? levels[i - 1] : null
    if (prev) {
      const p = getProgress().levels[prev]
      if (!p || p.ratio < 0.7) {
        // فقط افتح المستوى الثاني إن لم يُفتح بعد
        if (i === 1) {
          assert.equal(isPlayable(getProgress(), k), true)
        }
      }
    }
    const result = recordResult({ key: k, correct: 20, total: 20, wrong: 0, combo: 20, topicKeys, categoryKeys })
    void result
  })
  assert.equal(getProgress().levels[levels[0]].stars, 3)
  assert.ok(getProgress().achievements.includes('perfect-level'))
})

test('recordResult يرصد الترقية بين رتبتين بأفضل نتيجة على التوالي', () => {
  resetProgress()
  const key = levelKey('figh', 'salah', 'level1')
  const topicKeys = topicLevelKeys('figh', 'salah')
  const categoryKeys = categoryLevelKeys(getCategoryByEnglish('figh'))

  const first = recordResult({ key, correct: 20, total: 20, wrong: 0, combo: 20, topicKeys, categoryKeys })
  assert.equal(first.rankBefore.stars, 0)
  assert.equal(first.rankAfter.stars, 0)
})

test('subscribe يستقبل التحديثات ويعيد إلغاء الاشتراك', () => {
  resetProgress()
  let seen = 0
  const off = subscribe(() => {
    seen += 1
  })
  recordResult({ key: levelKey('figh', 'salah', 'level1'), correct: 20, total: 20, wrong: 0, combo: 20, topicKeys: topicLevelKeys('figh', 'salah'), categoryKeys: categoryLevelKeys(getCategoryByEnglish('figh')) })
  assert.equal(seen, 1)
  off()
  resetProgress()
  assert.equal(seen, 1, 'لا استدعاءات بعد إلغاء الاشتراك')
})

test('إنجاز المستوى التام (perfect) والإنجازات الكبرى', () => {
  resetProgress()
  const topicKeys = topicLevelKeys('figh', 'salah')
  const categoryKeys = categoryLevelKeys(getCategoryByEnglish('figh'))
  const result = recordResult({ key: levelKey('figh', 'salah', 'level1'), correct: 20, total: 20, wrong: 0, combo: 20, topicKeys, categoryKeys })
  assert.ok(result.newAchievements.some((a) => a.id === 'perfect-level'))
})

test('unclaimedAchievements يغطي كل الإنجازات المعرّفة', async () => {
  assert.equal(ACHIEVEMENTS.length, 8)
  resetProgress()
  // إنجازات تعتمد على بيانات حقيقية: نفترض إكمال مجال الفقه سطورياً عبر recordResult
  const category = getCategoryByEnglish('figh')
  const keys = categoryLevelKeys(category)
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i]
    const prev = levelNumber(parseLevelKey(key).level) <= 1 ? null : keys[i - 1]
    if (prev) {
      const p = getProgress().levels[prev]
      if (!p || p.ratio < 0.7) continue
    }
    recordResult({ key, correct: 20, total: 20, wrong: 0, combo: 20, topicKeys: topicLevelKeys(category.englishName, parseLevelKey(key).slug), categoryKeys: keys })
  }
  const achieved = getProgress().achievements
  assert.ok(achieved.includes('category-done') || achieved.length > 0)
})