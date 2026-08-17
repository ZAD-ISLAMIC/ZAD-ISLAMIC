# خطة التنفيذ النهائية — الأذان في التطبيق بدون Foreground Service

## القرار المعتمد (بعد التشخيص والتجارب)

- **لا** Foreground Service، **لا** إشعار دائم. الصوت يبدأ من **مستقبل المنبّه** عبر `MediaPlayer` + `WakeLock` — أقصر وأضمن على جميع إصدارات أندرويد (خصوصًا 13/14/15).
- إشعار **عادي واحد** يظهر عند وقت الأذان فقط: زر «إيقاف الأذان» + الضغط يفتح التطبيق على نافذة الأذان الداخلية.
- إذا كان التطبيق مفتوحًا وقت الأذان → **النافذة الداخلية فقط** (لا إشعار نظام).
- نافذة داخلية: عدّاد حي (+/− ملون)، أزرار إيقاف/تصغير/إغلاق، تُغلق تلقائيًا بعد نافذة 30 دقيقة، وتظهر **بصمت** عند فتح التطبيق داخل نافذة أذان سابقة.
- مفتاح واحد شامل «تفعيل الأذان والتنبيهات» + صوت + زر «جرّب الآن».
- لوحة صلاحيات: الإشعارات، المنبّهات الدقيقة، تحسين البطارية (فتح إعدادات النظام مباشرة — بدون أذونات مرفوضة في Play).

## التشغيل التقني

| الفضاء | الوصف |
|---|---|
| JS يحسب الجدول (8 أيام) | `prayerWatch.mjs → syncNativeWatch` ترسل `events` + `adhanSound` إلى plugin. |
| جدولة منبّهات دقيقة | `PrayerAlarmScheduler.scheduleAlarms` — `setExactAndAllowWhileIdle` لصلوات اليومين القادمين (fallback غير دقيق عند عدم الإذن). |
| وقت الأذان | `PrayerAdhanReceiver` → `AdhanPlayback.start` يشتغل الصوت (خيط عادي + WakeLock ~6 دقائق) + إشعار بأزرار + داخل ويعرّف «فتح التطبيق» بـ `EXTRA_SCREEN`. |
| تحديث + | منبّه كل دقيقة (`ACTION_ADHAN_TICK`) يحدّث نص الإشعار `+0:04:33 منذ الأذان` لـ 30 دقيقة. |
| إيقاف | زر الإشعار / سحب الإشعار / `stopAdhan` من التطبيق → يوقف الصوت ويلغي سلسلة التحديث. |
| إعادة الجدولة | `PrayerWatchBootReceiver` (BOOT/MY_PACKAGE_REPLACED/TIME_SET/TIMEZONE) + `PrayerWatchWorker` (WorkManager كل 15 دقيقة). |
| فتح الإشعار | `PendingIntent` → `EXTRA_SCREEN` → `consumeScreen`/`subscribe` (قناة دفع) → `navigateTo('/prayer')` + `getWindow` → النافذة الصامتة. |
| جرّب الآن | `testNow` → منبّه بعد ~20 ثانية بـ `force` → يجرب كل شيء فورًا. |

## الملفات

- حذف: `PrayerWatchService.java`, `PrayerAdhanService.java` (الخدمات الأمامية).
- جديد: `PrayerAlarmScheduler.java`, `AdhanPlayback.java`.
- تعديل: `PrayerWatch.java` (بدون service؛ status/settings/getWindow/testNow)، `PrayerAdhanReceiver.java`، `BootReceiver`، `Worker`، `prayerwatch.js`، `plugin.xml`، `patch-manifest.mjs` (hook before_compile)، `prayerWatch.mjs`، `prayerConfig.mjs`، `SettingsSheet.jsx`، `AdhanModal.jsx`، `AppShell.jsx`.

## اختبار على الجهاز

1. `adb uninstall com.altaqwaa.app` (مرة واحدة — توقيع قديم).
2. `npm run run:android`.
3. الإعدادات → فعّل «تفعيل الأذان» → «جرّب الآن» → سماح الإشعارات.
4. فتح التطبيق/إغلاقه عند وقت الصلاة (+التحقق من «منذ: الصلاحيات»).

## التحسينات اللاحقة (Aug 2026)

- **حجم صوت الأذان والتحكم أثناء الرنين** (`adhanVolume` 0..1): يخزّن على الجهاز (نيتيف + إعدادات) ويُمرَّر مع الجدولة. عند الرنين ومع `respectSoundMode` **معطّل** يرفع التطبيق تيار المنبّه (`STREAM_ALARM`) لمستوى الحجم المخزّن ولو كان الهاتف صامتًا، ويعيده لأصله عند الإيقاف. يطلب `AudioFocusRequest` بـ `USAGE_ALARM` كي تتحكم أزرار الصوت بالأذان أصلًا؛ `MainActivity.onKeyDown` يعدّل تيار المنبّه مباشرة أثناء الرنين ويحفظ النتيجة كالافتراضي القادم. نافذة الأذان الداخلية فيها منزلق حي + الإعدادات فيها قسم «حجم صوت الأذان». الجسر: `setAdhanVolume/getAdhanVolume`، صلاحية عادية `MODIFY_AUDIO_SETTINGS`.
- **احترام وضع الصوت** (`respectSoundMode`): اختياري. عند التفعيل إذا كان الهاتف صامتًا أو في وضع الاهتزاز أو مستوى صوت المنبّه صفر → يُكتفى بالاهتزاز والإشعار بلا صوت. افتراضيًا **معطّل** (يرنّ دائمًا كمنبّه عبر `USAGE_ALARM`). الجسر: `getAudioState()` يقرأ `ringerMode` + مستوى المنبّه (بدون أذونات).
- **إشعار محسّن**: `BigTextStyle` (توقيت + منذ الأذان)، `CATEGORY_ALARM`، `VISIBILITY_PUBLIC`. عند انتهاء نافذة ٣٠ دقيقة يُلغى الإشعار تلقائيًا.
- **أتمتة adb**: `npm run test:adhan` → `scripts/adhantest.mjs` يثبّت، يمنح إذن الإشعارات، يشغّل أذانًا تجريبيًا عبر `PrayerDebugReceiver` (يتجاهل كل بث في نسخة الريليز بفحص `FLAG_DEBUGGABLE`)، ويتحقق من الإشعار ثم إيقافه.
- **Xiaomi/MIUI**: تلميح إرشادي لإعداد «التحكم في البطارية = لا قيود» + «التشغيل التلقائي».