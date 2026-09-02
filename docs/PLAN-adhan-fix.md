# خطة إصلاح مشكلة الأذان المتكرر بدون إشعارات

## المشكلة
أذان الفجر يعمل بشكل طبيعي وينتهي، ثم بعد ~10 دقائق يعمل صوت أذان ثانٍ **بدون إشعارات** ولا تظهر نافذة داخلية.

---

## السبب الجذري (تم العثور عليه عبر ADB)

**تطبيقان مثبتان على الجهاز بنفس الكود:**
- `com.almoshaf.alelectrony` (تطبيق قديم)
- `com.rn0x.altaqwaa` (التطبيق الجديد)

كل تطبيق يملك `SharedPreferences` و `AlarmManager` مستقلين. عند وقت الفجر:
1. التطبيق القديم يشغل الأذان ← المستخدم يسمعه
2. سلسلة الـ tick القديمة تعمل كل دقيقة لمدة 5 دقائق
3. بعد ~10 دقائق، أحد الـ ticks المتبقية من التطبيق القديم يُشغّل صوتاً **بدون إشعار** لأن Notification Manager الخاص بالتطبيق القديم مختلف

**خطأ إضافي في الكود (Bug في ترتيب الدوال):**
في `AdhanPlayback.java` داخل `stop(c, true)`:
```java
// ❌ ترتيب خاطئ:
PrayerAlarmScheduler.clearFired(c);      // يُمحى lastFired أولاً
PrayerAlarmScheduler.cancelAdhanTicks(c); // يبحث عن lastFired → يجد فارغ → يخرج مبكراً دون إلغاء!
```
هذا يجعل `cancelAdhanTicks()` يفشل في إلغاء الـ ticks المتبقية حتى مع تثبيت التطبيق الصحيح.

---

## الإصلاحات المطبقة

### ✅ إصلاح 1: إلغاء تثبيت التطبيق القديم
```bash
adb shell pm uninstall -k --user 0 com.almoshaf.alelectrony
```
نتيجة: `com.almoshaf.alelectrony` اختفى بالكامل. 0 Alarm متبقٍ له.

### ✅ إصلاح 2: تصحيح ترتيب إلغاء الـ ticks في Java (`AdhanPlayback.java`)
**قبل (خطأ):**
```java
PrayerAlarmScheduler.clearFired(c);
PrayerAlarmScheduler.cancelAdhanTicks(c);
```
**بعد (صحيح):**
```java
PrayerAlarmScheduler.cancelAdhanTicks(c);  // يُلغى أولاً بينما lastFired لا يزال موجوداً
PrayerAlarmScheduler.clearFired(c);        // يُمحى afterwards
```

### ✅ إصلاح 3: `stop(c, true)` يُنفّذ نظافة كاملة عند انتهاء MediaPlayer
غيّرنا `setOnCompletionListener` من `stop(c, false)` إلى `stop(c, true)` ليُطلق الإجراء التصحيحي أعلاه تلقائياً.

### ✅ إصلاح 4: `start()` يوقف أي MediaPlayer يعمل مسبقاً دائماً
منع الصوت المزدوج عند Snooze أو testNow أو notification tap.

### ✅ إصلاح 5: `handleTick` يتحقق من `isPlaying()` + تطابق الـ ts
يمنع استمرار سلسلة الـ tick بعد انتهاء الصوت أو عند وجود tick لصلاة مختلفة.

### ✅ إصلاح 6: إضافة `isPlaying` bridge للـ JS
`PrayerWatch.java` + `prayerwatch.js` + `prayerWatch.mjs` — دالة `getNativeIsPlaying()`.

### ✅ إصلاح 7: JS backup timer يتحقق من Native قبل التشغيل
يمنع تشغيل HTML5 Audio مزدوج مع Native MediaPlayer.

### ✅ إصلاح 8: `AdhanModal.jsx` يُوقف Native قبل `playAzan()`
حماية إضافية ضد الصوت المزدوج.

---

## التحقق النهائي (بعد الإصلاح)

| الفحص | قبل | بعد |
|-------|------|-----|
| `com.almoshaf.alelectrony` | مثبت ✓ | **غير مثبت** ✓ |
| تنبيهات ADHAN_TICK المكررة | 44 | **0** ✓ |
| تنبيهات ADHAN_FIRED للمتصفح الجديد | مزدوجة | **30 فقط** ✓ |
| lastFired بعد انتهاء الأذان | يبقى ≠ فارغ | **يُمحى** ✓ |
| إلغاء الـ ticks عند انتهاء الصوت | **يفشل** (bug) | **يعمل** ✓ |
| الاختبارات | 236/236 | **236/236** ✓ |
