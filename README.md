# تطبيق التقوى — React + Cordova

تطبيق إسلامي مفتوح المصدر يعمل على أجهزة اندرويد سهل الإستخدام و جامع للكثير من الميزات التي يحتاجها المسلم في يومه

## المتطلبات

| الأداة | النسخة |
|--------|--------|
| Node.js | >= 20.19 |
| JDK | 21 |
| Android SDK | ANDROID_HOME مفروض |
| Gradle | 8.14.2 (يوجد رابط symlink في `~/.local/bin/gradle`) |

## الأوامر الجاهزة

### التطوير (معاينة المتصفح — HMR)
```bash
npm run dev          # خادم التطوير على http://localhost:5173
```

### البناء
```bash
npm run build             # بناء الـ web assets فقط إلى www/
npm run build:apk         # بناء APK Debug كامل (vite + cordova)
npm run build:apk:release # بناء APK Release موقّع عبر build.json
```

### التوقيع (keystore)
```bash
npm run keystore          # توليد مفتاح توقيع جديد + build.json (بيانات حقيقية محلياً)
```
> الشرح الكامل في [`docs/signing.md`](docs/signing.md). النموذج: `build.example.json`.

### التثبيت والتشغيل على الجهاز
```bash
npm run install:apk            # تثبيت آخر APK Debug (adb install -r)
npm run install:apk -- --release   # تثبيت آخر APK Release
npm run run:android            # بناء Debug + تثبيت
npm run run:android:release    # بناء Release + تثبيت
```

### التنظيف
```bash
npm run clean        # حذف www/ فقط
npm run clean:all    # حذف www/ + platforms/ + plugins/ (إعادة بناء كاملة)
```

### إعداد جديد من الصفر (أول مرة فقط)
```bash
npm install
npm run cordova:setup   # cordova platform add android + prepare
npm run build:apk
```

## هيكل المشروع

```
├── config.xml          # إعدادات Cordova (id, name, permissions, ...)
├── build.example.json  # قالب build.json بمعلومات وهمية (مرفوع في git)
├── build.json          # إعداد توقيع الـ keystore — محلي فقط، غير مرفوع (صرّفه: npm run keystore)
├── tqw.keystore        # مفتاح التوقيع — محلي فقط، غير مرفوع
├── vite.config.mjs     # إعداد Vite (سكربت إعداد — JSX يتم عبر امتداد .jsx الأصلي)
├── index.html          # نقطة الدخول
├── src/
│   ├── main.jsx        # تشغيل React (createRoot + HashRouter)
│   ├── App.jsx         # الـ Routes (تقسيم تأخيري لكل شاشة)
│   ├── constants/app.mjs   # ثوابت التطبيق (التنقل، وصف الشاشات)
│   ├── components/
│   │   ├── layout/     # AppShell - Header - BottomNav (.jsx)
│   │   └── ui/         # Button - Card - Icon - Loader - ScreenPlaceholder (.jsx)
│   ├── screens/        # الشاشات (كل شاشة ملف .jsx مستقل + lazy)
│   ├── services/       # storage - device (.mjs — غلاف Cordova APIs)
│   ├── hooks/          # useLocalStorage (.mjs)
│   ├── utils/          # دوال مساعدة (.mjs)
│   └── styles/         # theme.css (المتغيرات) + global.css (الأنماط)
├── scripts/            # سكربتات node (.mjs) — build - install - clean - setup
└── www/                # مخرجات vite (يُبدأ منها Cordova)
```

## قواعد التطوير (Scalable)

1. **بدون TypeScript نهائياً** — JavaScript عادي فقط.
2. **مكوّن React جديد**: ملف `.jsx` في `src/components/` — يتعامل معه Vite تلقائياً.
3. **شاشة جديدة**: أنشئ `.jsx` في `src/screens/` ثم أضف سطر lazy واحد في `src/App.jsx` — يصير bundle مستقل.
4. **مكوّن واجهة جديد**: في `src/components/ui/` + صنف في `global.css`.
5. **الخدمات**: غلافات Cordova في `src/services/` (مثل `device.mjs` يستخدم `window.cordova` بأمان حتى في المتصفح).
6. **التخزين**: `storage.mjs` يحفظ في localStorage بمفتاح بادئة `altaqwaa:`.
7. **الـ Router**: `HashRouter` لأن Cordova يحمّل من `file://` (لا يدعم التاريخ الحقيقي).
8. **سكربت أو وحدة منطقية**: `.mjs` فقط.


## إضافة إضافات Cordova
```bash
npx cordova plugin add cordova-plugin-xxx
```

## ملاحظات بناء معروفة

- `build.json` و `*.keystore` غير مرفوعين إلى git (أسرار التوقيع). على جهاز جديد شغّل `npm run keystore` أو انسخ `build.example.json` → `build.json` وقيمها. التفاصيل في `docs/signing.md`.
- `cordova-android` يحتاج أن يكون `gradle` في PATH؛ أنشئنا symlink:
  `ln -s ~/.gradle/wrapper/dists/gradle-8.14.2-bin/*/gradle-8.14.2/bin/gradle ~/.local/bin/gradle`
- لا تستخدم `cordova-plugin-compat` — يسبب تكرار فئة `BuildHelper` مع cordova-android 15.
- `optimizeDeps.entries: ['index.html']` في `vite.config.mjs` يمنع Vite من فحص ملفات HTML داخل `platforms/` عند تشغيل `npm run dev`.