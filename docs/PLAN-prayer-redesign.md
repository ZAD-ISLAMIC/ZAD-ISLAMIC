# خطة إعادة تصميم مواقيت الصلاة والأذان

## المشكلة الأصلية (Issue #49)

> اشعار الاذان لا يتوقف مهما حذفت الاشعار — تكرار دائما — بيأذن قبل الاذان بفترة — يرجع يأذن تاني وتالت — والاشعارات فيها تكرار عجيب — الاذان يعمل أثناء المكالمات الصوتية ولا يفصل

---

## تحليل جذور المشكلة

### 1. تكرار الإشعارات — أسباب محتملة

| السبب | الملف | التوضيح |
|-------|-------|---------|
| **Backup timer يكرر الأذان** | `prayerWatch.mjs:595-612` | إذا لم يصل push من Native خلال 60 ثانية، ي fired locally. لكن قد يصل Native push متأخرًا في従مها payloads |
| **_tick chain لا يتوقف** | `PrayerAlarmScheduler.java:171-193` | الـ tick يجدول نفسه كل دقيقة لمدة 5 دقائق. إذا أُلغي الإشعار يدويًا但 ticks لا يزال يعمل |
| **multiple `nm.notify(NOTIF_ID)`** | `AdhanPlayback.java:513` | كل `refresh()` يستدعي `notify()` — قد يحدث تكرار بصرى |
| **WorkManager + AlarmManager** | `PrayerWatchWorker.java` + `PrayerAlarmScheduler.java` | كلاهما يعيد جدولة alarms — قد يتداخلان |

### 2. الأذان قبل الوقت

| السبب | الملف | التوضيح |
|-------|-------|---------|
| **手动时间模式** | `PrayerAlarmScheduler.java:116` | في الوضع اليدوي، إذا مرّ وقت الصلاة خلال النافذة، يُجدول خلال ثانيتين |
| **Doze delay** | `PrayerAlarmScheduler.java:129` | `setExactAndAllowWhileIdle` قد تتأخر في Doze |

### 3. مكالمات الهاتف

| الحالة | الملف | التوضيح |
|--------|-------|---------|
| **IsInCall يتحقق** | `AdhanPlayback.java:186` | يمنع الصوت إذا كانت المكالمة نشطة عند `start()` |
| **لا يتحقق أثناء التشغيل** | `AdhanPlayback.java:302-313` | `FOCUS_CB` يتوقف عند `AUDIOFOCUS_LOSS` — قد لا يلتقط مكالمة تبدأ بعد بدء الأذان |

---

## الخطة المقترحة

### المرحلة 1: إصلاح تكرار الإشعارات

#### 1.1 إصلاح Backup Timer التكراري
**الملف:** `src/services/prayerWatch.mjs`

```javascript
// المشكلة: backupFiredKey يُعاد تعيينه عندما يتحرك النافذة لصلاة جديدة
// لكن لا يزال هناك ثغرة عندما يصل Native push متأخرًا

// الحل: إضافة dedupe globalifetime للمصلية
let lastBackupFireKey = null

// في checkTransitions() — قبل fireAdhan():
if (backupFiredKey === dayPrayerKey || lastBackupFireKey === dayPrayerKey) {
  continue // لا تكرر
}
```

#### 1.2 إصلاح Tick Chain
**الملف:** `cordova-plugins/com.rn0x.prayerwatch/src/android/com/rn0x/prayerwatch/PrayerAlarmScheduler.java`

```java
// إضافة تحقق: إذا تم إلغاء الإشعار، أوقف الـ tick chain
public static void cancelAdhanTicks(Context c) {
    // الحالي: يلغي PendingIntent واحد
    // المُحسَّن: يلغي جميع الـ ticks ويُعيّر عداد remaining
    String fired = peekFired(c);
    if (fired == null || fired.isEmpty()) return;
    try {
        long ts = new JSONObject(fired).optLong("ts", 0L);
        if (ts == 0) return;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        // إلغاء الـ tick الحالي
        Intent i = new Intent(c, PrayerAdhanReceiver.class)
                .setAction(ACTION_ADHAN_TICK)
                .putExtra(EXTRA_PRAYER_ID, "")
                .putExtra(EXTRA_LABEL, "")
                .putExtra(EXTRA_TS, ts)
                .putExtra(EXTRA_REMAINING, 0);
        PendingIntent pi = PendingIntent.getBroadcast(
                c, tickRequestCode(ts), i, flags());
        am.cancel(pi);
    } catch (Exception ignored) {}
}
```

#### 1.3 إضافة `FLAG_CANCEL_CURRENT` للـ PendingIntents
**الملف:** `AdhanPlayback.java`

```java
// 현재: FLAG_UPDATE_CURRENT — يحديث نفس الـ PendingIntent
// المُحسَّن: FLAG_CANCEL_CURRENT + FLAG_UPDATE_CURRENT
// لضمان عدم تداخل notifications قديمة مع جديدة
static int dpiFlags() {
    return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_CANCEL_CURRENT
            : PendingIntent.FLAG_UPDATE_CURRENT;
}
```

#### 1.4 إضافة Dedupe Key في Notification
**الملف:** `AdhanPlayback.java`

```java
// إضافة tag فريد لكل إشعار لمنع التداخل
nm.notify("adhan_" + id, NOTIF_ID, b.build());
// بدلاً من:
nm.notify(NOTIF_ID, b.build());
```

---

### المرحلة 2: إيقاف مؤقت أثناء المكالمات

#### 2.1 تعليق الأذان أثناء المكالمة ثم استئنافه
**الملف:** `AdhanPlayback.java`

```java
// 현재: FOCUS_CB يتوقف عند AUDIOFOCUS_LOSS
// المُحسَّن: تعليق (pause) بدلاً من إيقاف (stop) عند مكالمة

private static boolean callPaused = false;

private static final AudioManager.OnAudioFocusChangeListener FOCUS_CB = change -> {
    if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
        // مكالمة مؤقتة — أوقف الصوت مؤقتاً
        synchronized (LOCK) {
            if (player != null && player.isPlaying()) {
                player.pause();
                callPaused = true;
            }
        }
    } else if (change == AudioManager.AUDIOFOCUS_GAIN) {
        // المكالمة انتهت — استئناف الصوت
        synchronized (LOCK) {
            if (player != null && callPaused) {
                player.start();
                callPaused = false;
            }
        }
        restoreAlarm(sCtx);
    } else if (change == AudioManager.AUDIOFOCUS_LOSS) {
        // خسارة نهائية — أوقف تماماً
        stop(null, false);
    }
};
```

#### 2.2 كشف المكالمة أثناء التشغيل
**الملف:** `AdhanPlayback.java`

```java
// إضافة listener لتغيير وضع الهاتف
private static PhoneStateListener phoneStateListener;
private static boolean wasInCall = false;

private static void startCallMonitor(Context c) {
    if (phoneStateListener != null) return;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        // Android 12+ يستخدم PhoneStateListener بشكل مختلف
        return;
    }
    try {
        TelephonyManager tm = (TelephonyManager) c.getSystemService(Context.TELEPHONY_SERVICE);
        if (tm == null) return;
        phoneStateListener = new PhoneStateListener() {
            @Override
            public void onCallStateChanged(int state, String phoneNumber) {
                boolean inCall = (state == TelephonyManager.CALL_STATE_OFFHOOK
                        || state == TelephonyManager.CALL_STATE_RINGING);
                if (inCall && !wasInCall) {
                    // بدأت مكالمة — أوقف مؤقتاً
                    pauseForCall();
                } else if (!inCall && wasInCall) {
                    // انتهت المكالمة — استئناف
                    resumeAfterCall();
                }
                wasInCall = inCall;
            }
        };
        tm.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE);
    } catch (Exception ignored) {}
}

private static void pauseForCall() {
    synchronized (LOCK) {
        if (player != null && player.isPlaying()) {
            player.pause();
            callPaused = true;
        }
    }
}

private static void resumeAfterCall() {
    synchronized (LOCK) {
        if (player != null && callPaused) {
            player.start();
            callPaused = false;
        }
    }
}
```

---

### المرحلة 3: أزرار الإشعار

#### 3.1 إضافة أزرار "إيقاف" و "أَجّلْ 10 دقائق"
**الملف:** `AdhanPlayback.java`

```java
// إضافة action buttons في الإشعار
// 1. زر "إيقاف الأذان"
Intent stopIntent = new Intent(c, PrayerAdhanReceiver.class).setAction(ACTION_STOP);
stopIntent.putExtra("dismissed", false);
PendingIntent stopPi = PendingIntent.getBroadcast(c, 8, stopIntent, dpiFlags());
Action stopAction = new Action.Builder(
        smallIcon, "إيقاف الأذان", stopPi)
        .build();

// 2. زر "أَجّلْ 10 دقائق"
Intent snoozeIntent = new Intent(c, PrayerAdhanReceiver.class)
        .setAction("com.rn0x.prayerwatch.SNOOZE_ADHAN")
        .putExtra(EXTRA_PRAYER_ID, id)
        .putExtra(EXTRA_LABEL, label)
        .putExtra(EXTRA_TS, ts);
PendingIntent snoozePi = PendingIntent.getBroadcast(c, 9, snoozeIntent, dpiFlags());
Action snoozeAction = new Action.Builder(
        smallIcon, "أَجّلْ 10 دقائق", snoozePi)
        .build();

b.addAction(stopAction);
b.addAction(snoozeAction);
```

#### 3.2 معالجة السНООЗ
**الملف:** `PrayerAdhanReceiver.java`

```java
// إضافة case في onReceive:
if ("com.rn0x.prayerwatch.SNOOZE_ADHAN".equals(action)) {
    handleSnooze(c, intent);
    return;
}

private void handleSnooze(Context c, Intent intent) {
    String id = intent.getStringExtra(EXTRA_PRAYER_ID);
    String label = intent.getStringExtra(EXTRA_LABEL);
    long ts = intent.getLongExtra(EXTRA_TS, PrayerTime.now(c));
    
    // أوقف الأذان الحالي
    AdhanPlayback.stop(c, true);
    PrayerAlarmScheduler.cancelAdhanTicks(c);
    
    // جدول أذان جديد بعد 10 دقائق
    long snoozeAt = System.currentTimeMillis() + 10 * 60 * 1000L;
    Intent i = PrayerAlarmScheduler.adhanIntent(c, id + "_snooze", label, ts);
    i.putExtra("force", true);
    PendingIntent pi = PendingIntent.getBroadcast(c, 
            (int) ((snoozeAt + 2_000_000L) % Integer.MAX_VALUE), 
            i, PrayerAlarmScheduler.dpiFlags());
    
    AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
    if (am != null) {
        try {
            if (PrayerWatch.canScheduleExactAlarms(c)) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, snoozeAt, pi);
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, snoozeAt, pi);
            }
        } catch (Exception ignored) {}
    }
}
```

---

### المرحلة 4: تحذير البطارية وتحسينات OEM

#### 4.1 كشف مشكلة البطارية
**الملف:** `PrayerWatch.java`

```java
// إضافة دالة كشف OEM
private static String detectOEM() {
    String manufacturer = Build.MANUFACTURER.toLowerCase();
    if (manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco")) {
        return "xiaomi";
    }
    if (manufacturer.contains("samsung")) {
        return "samsung";
    }
    if (manufacturer.contains("oppo") || manufacturer.contains("realme") || manufacturer.contains("oneplus")) {
        return "oppo";
    }
    if (manufacturer.contains("huawei") || manufacturer.contains("honor")) {
        return "huawei";
    }
    if (manufacturer.contains("vivo")) {
        return "vivo";
    }
    return "other";
}

// إضافة إلى status():
o.put("oem", detectOEM());
o.put("autoStartEnabled", isAutoStartEnabled(c));
```

#### 4.2 فحص AutoStart (Xiaomi/Huawei)
**الملف:** `PrayerWatch.java`

```java
private static boolean isAutoStartEnabled(Context c) {
    try {
        if (Build.MANUFACTURER.toLowerCase().contains("xiaomi")) {
            // Xiaomi AutoStart manager
            Intent intent = new Intent();
            intent.setComponent(new ComponentName("com.miui.securitycenter",
                    "com.miui.permcenter.autostart.AutoStartManagementActivity"));
            // لا يمكن فحص الحالة بدون فتح الشاشة
            return true; // افتراضي
        }
    } catch (Exception ignored) {}
    return true; // غير معروف — لا نحذف
}
```

#### 4.3 رسالة تحذير مخصصة لكل OEM
**الملف:** `src/screens/settings/SettingsAdhanScreen.jsx`

```jsx
// إضافة تحذير مخصص حسب الـ OEM
const oemWarnings = {
  xiaomi: {
    title: 'أجهزة Xiaomi/MIUI',
    steps: [
      'الإعدادات ← التطبيقات ← التطبيق',
      '«التحكم في البطارية» = لا قيود',
      'فعّل «التشغيل التلقائي عند بدء التشغيل»',
      'الإعدادات ← البطارية ← تحسين البطارية ← أوقف تحسين لهذا التطبيق',
    ]
  },
  samsung: {
    title: 'أجهزة Samsung/OneUI',
    steps: [
      'الإعدادات ← التطبيقات ← التطبيق',
      'البطارية ← «غير مقيّد»',
      'الإعدادات ← البطارية ← خيارات أخرى ← «إيقاف تحسين البطارية»',
    ]
  },
  oppo: {
    title: 'أجهزة OPPO/ColorOS/realme',
    steps: [
      'الإعدادات ← البطارية ← ',
      'App management ← Auto-launch ← فعّل لهذا التطبيق',
      ' إعدادات ← التطبيقات ← التطبيق ← البطارية ← التعليق في الخلفية',
    ]
  },
  huawei: {
    title: 'أجهزة Huawei/EMUI',
    steps: [
      'الإعدادات ← البطارية ← ',
      'App launch ← أوقف التحكم التلقائي',
      ' اختر "يدوياً" وفعّل جميع الخيارات',
    ]
  }
}
```

---

### المرحلة 5: تحسينات عامة

#### 5.1 إضافة `DATE_CHANGED` في BootReceiver
**الملف:** `PrayerWatchBootReceiver.java`

```java
// إضافة intent filter جديد
<action android:name="android.intent.action.DATE_CHANGED" />
```

#### 5.2 تحسين canceldAlarms
**الملف:** `PrayerAlarmScheduler.java`

```java
// إضافة دالة لإلغاء كل alarms (للحالات الطارئة)
public static synchronized void cancelAllAlarms(Context c) {
    AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
    if (am == null) return;
    // لا يمكن إلغاء كل PendingIntents بدون معرفة их
    // لكن يمكن إلغاء Worker
    WorkManager.getInstance(c).cancelUniqueWork("prayerwatch");
}
```

#### 5.3 تحسين Notification Channel
**الملف:** `AdhanPlayback.java`

```java
// إضافة قناة ثانية للتنبيهات بدون صوت (للأَجّلْ مثلاً)
static final String CHANNEL_PRAYER_INFO = "prayer_info";

static void createChannels(Context c) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null) return;
    
    // قناة الأذان الأصلية
    NotificationChannel ch1 = new NotificationChannel(
            CHANNEL_ADHAN, "رنين الأذان", NotificationManager.IMPORTANCE_HIGH);
    ch1.setDescription("تنبيه حان وقت الصلاة مع الأذان");
    ch1.enableVibration(true);
    ch1.setVibrationPattern(new long[]{0, 600, 300, 600});
    ch1.setSound(null, null);
    ch1.setShowBadge(false);
    nm.createNotificationChannel(ch1);
    
    // قناة معلوماتية بدون صوت
    NotificationChannel ch2 = new NotificationChannel(
            CHANNEL_PRAYER_INFO, "معلومات الصلاة", NotificationManager.IMPORTANCE_LOW);
    ch2.setDescription("تنبيهات دورية عن مواقيت الصلاة");
    ch2.setSound(null, null);
    ch2.setShowBadge(false);
    nm.createNotificationChannel(ch2);
}
```

#### 5.4 تحسين `shouldStopAudio` أثناء المكالمة
**الملف:** `AdhanPlayback.java`

```java
// تحديث shouldStopAudio logic
private static boolean shouldStopAudio(Context c) {
    // 1. احترام وضع الصوت
    if (soundMuted(c)) return true;
    // 2. مكالمة نشطة
    if (isInCall(c)) return true;
    // 3. صوت المنبّه صفر
    AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
    if (am != null && am.getStreamVolume(AudioManager.STREAM_ALARM) == 0) return true;
    return false;
}
```

---

### المرحلة 6: تحسين واجهة المستخدم

#### 6.1 شاشة الإعدادات — إضافة قسم حالة النظام
**الملف:** `src/screens/settings/SettingsAdhanScreen.jsx`

```jsx
// إضافة قسم "حالة النظام" في الأسفل
<SettingsGroup title="حالة النظام">
  <SystemStatusRow 
    icon={<Icon name="cpu" size={20} />}
    label="نوع الجهاز"
    value={status?.oem || 'غير معروف'}
  />
  <SystemStatusRow
    icon={<Icon name="battery" size={20} />}
    label="تحسين البطارية"
    value={status?.batteryOptimized ? 'مفعّل (قد يسبب مشاكل)' : 'معطّل ✓'}
    warning={status?.batteryOptimized}
  />
  <SystemStatusRow
    icon={<Icon name="alarm" size={20} />}
    label="المنبّهات الدقيقة"
    value={status?.exactAlarms ? 'مفعّل ✓' : 'معطّل'}
    warning={!status?.exactAlarms}
  />
</SettingsGroup>
```

#### 6.2 تحسين AdhanModal — إضافة زر "أَجّلْ"
**الملف:** `src/components/prayer/AdhanModal.jsx`

```jsx
// إضافة زر snooze
<div className="adhan-modal__actions">
  <button className="adhan-modal__btn adhan-modal__btn--snooze" onClick={snooze} type="button">
   أَجّلْ 10 دقائق
  </button>
  <button className="adhan-modal__btn adhan-modal__btn--min" onClick={() => setMinimized(true)} type="button">
    تصغير
  </button>
  <button className="adhan-modal__btn adhan-modal__btn--close adhan-modal__btn--primary" onClick={close} type="button">
    إغلاق
  </button>
</div>
```

---

## ملخص التغييرات

### ملفات يتم تعديلها:

| الملف | التغييرات |
|-------|-----------|
| `AdhanPlayback.java` | Dedupe key، أزرار الإشعار، phone call pause/resume، call monitor |
| `PrayerAlarmScheduler.java` | تحسين tick cancellation، `FLAG_CANCEL_CURRENT` |
| `PrayerAdhanReceiver.java` | معالجة snooze action |
| `PrayerWatchBootReceiver.java` | إضافة `DATE_CHANGED` |
| `PrayerWatch.java` | OEM detection، autoStart check، status improvements |
| `prayerWatch.mjs` | تحسين backup timer dedupe |
| `AdhanModal.jsx` | إضافة زر snooze |
| `SettingsAdhanScreen.jsx` | تحذيرات OEM، حالة النظام |
| `SettingsSheet.jsx` | تحذيرات OEM |

### ملفات جديدة:

| الملف | الغرض |
|-------|-------|
| لا يوجد ملفات جديدة | نستخدم الملفات الموجودة |

---

## ترتيب التنفيذ

1. **إصلاح تكرار الإشعارات** (الأولوية القصوى)
2. **إيقاف مؤقت أثناء المكالمات**
3. **أزرار الإشعار (إيقاف +أَجّلْ)**
4. **تحذيرات البطارية وتحسينات OEM**
5. **تحسينات واجهة المستخدم**

---

## اختبارات مقترحة

1. اختبار تكرار الإشعارات: افتح التطبيق، انتظر وقت صلاة، تأكد من إشعار واحد فقط
2. اختبار المكالمات: ابدأ مكالمة صوتية عند وقت الصلاة، تأكد من تعليق الأذان ثم استئنافه
3. اختبار الإشعارات: اضغط "أَجّلْ"، تأكد من ظهور أذان بعد 10 دقائق
4. اختبار Samsung/Xiaomi: اختبار على أجهزة مختلفة مع battery optimization
5. اختبار_boot: أعد تشغيل الجهاز، تأكد من عمل الأذان
