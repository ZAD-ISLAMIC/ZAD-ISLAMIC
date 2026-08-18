# خطة التنفيذ — صفحة اتجاه القبلة (Qibla)

## الهدف

صفحة بوصلة دقيقة تعرض اتجاه القبلة من موقع المستخدم الحالي، مع معالجة كاملة للصلاحيات والأخطاء (رفض/رفض نهائي/GPS معطّل/مستشعر غير متاح/معايرة)، وتصميم UI/UX موحّد مع بقية شاشات التطبيق (React + Cordova + Vite).

## القرارات المعتمدة

| القرار | الاختيار |
|---|---|
| مصدر البوصلة | **Plugin ناتيف** `com.rn0x.qibla` (SensorManager `TYPE_ROTATION_VECTOR` مع تعويض ميل وانسيابية) + **Fallback WebView** `deviceorientation(.absolute)` للمتصفح/التطوير |
| الموقع | إعادة استخدام `location.mjs` + `com.rn0x.prayerlocation` (تصنيف `permission-denied/permission-permanent/gps-off/timeout` جاهز) |
| موضع الصفحة | شاشة مستقلة `/qibla` تُضاف إلى `NAV_ITEMS` (تظهر في شبكة «أقسام التطبيق») + زر/بطاقة في صفحة المواقيت — **بدون** الشريط السفلي |
| الحالة | خدمة `qibla.mjs` بنمط `subscribe/getSnapshot` (مطابق `player.mjs`) عبر `useSyncExternalStore` |
| الحساب | دوال نقية في `utils/qiblaMath.mjs` + اختبارات مرجعية |

## مكونات الحل

### 1. Plugin ناتيف `com.rn0x.qibla`

```
cordova-plugins/com.rn0x.qibla/
├── plugin.xml                         # uses-feature compass required=false (لا صلاحية runtime)
├── package.json
├── www/qibla.js                       # start/stop/isSupported — بنمط prayerlocation.js
└── src/android/com/rn0x/qibla/QiblaSensor.java
```

- `TYPE_ROTATION_VECTOR` أساسي (يعطي `quaternion` → `getRotationMatrixFromVector` → `remapCoordinateSystem(AXIS_X, AXIS_Z)` للوضع العمودي → `getOrientation`).
- Fallback عند عدم توفر rotation vector: `TYPE_MAGNETIC_FIELD + TYPE_ACCELEROMETER` مع `lowPassFilter` ثم `getRotationMatrix` + `remap` + `getOrientation`.
- بث مستمر عبر `PluginResult.setKeepCallback(true)` بمعدل SENSOR_DELAY_UI (~60ms) مع انسيابية `exponential moving average (alpha=0.2)` معالِجةً طيّ 360°.
- يمرّر `accuracy` من المستشعر (`SENSOR_STATUS_UNRELIABLE/LOW/MEDIUM/HIGH`) كي يُظهر الواجهة نداء «حرّك الجهاز بشكل 8».
- `isSupported()` يقرأ `PackageManager.hasSystemFeature(FEATURE_SENSOR_COMPASS)` + Fallback sensor.
- لا يحتاج أذونات تشغيل إطلاقًا (المغناطيسومتر لا يطلبها).

### 2. الرياضيات `src/utils/qiblaMath.mjs`

- `KAABA = { lat: 21.4225, lon: 39.8262 }` (نفس إحداثيات `location.mjs`).
- `qiblaBearing(lat, lon)` = زاوية الدائرة العظمى الأولية:
  `θ = atan2( sin Δλ·cos φ2 , cos φ1·sin φ2 − sin φ1·cos φ2·cos Δλ )` ثم `(θ°+360) mod 360`.
- `signedDelta(target, heading)` ∈ [−180, 180] (الإيجابي = انعطاف لليمين).
- `cardinalName(deg)` (شمال/شمال شرق/…).
- `directionName(delta)` (يمينك/يسارك/أمامك).
- `distanceKm(lat, lon)` = هافرساين للكعبة.
- `formatDistance(km)` بالعربية.

مراجع الاختبار (`tests/qibla.test.mjs`) بتحمّل ±0.1°:
- مكة → مكة = 0.0000، القاهرة → 136.1373، الرياض → 243.7979، جاكرتا → 295.1517، إسطنبول → 151.6206، دبي → 258.2312، لندن → 118.9872، نيويورك → 58.4817.

### 3. الخدمات

- `src/services/compassWeb.mjs`: fallback WebView — `webkitCompassHeading` أولاً وإلا `e.alpha` بشرط `absolute !== false`، مع API اشتراك/إيقاف.
- `src/services/qibla.mjs`: آلة حالات:
  `idle → starting → running | calib-required | sensor-unavailable | websensor-unavailable | error`
  مع `heading, qiblaBearing, delta, location, sensor('native'|'webview'), headingAccuracy, locationStatus, locationError, error`.
  - `start()/stop()`: اشتراك/إلغاء مضبوط بالإطار (rAF ≤ 60fps) وعدم إعادة رندر React إلا عند تغيّر ≥ 0.3°.
  - `refreshLocation()` (من التخزين)، `reDetectLocation()` (GPS) تعيد حساب الزاوية والمسافة.
  - يتوقف تلقائيًا عند إخفاء التطبيق (توفير البطارية).

### 4. الشاشة والواجهة

```
src/screens/QiblaScreen.jsx
src/components/qibla/QiblaCompass.jsx    // SVG الديال الدوّار + سهم الكعبة
src/components/qibla/QiblaDelta.jsx      // قراءة الانحراف الكبيرة + حالة المحاذاة
src/components/qibla/QiblaStatusCard.jsx // الدقة ±° + قراءات رقمية + المسافة
src/components/qibla/QiblaLocationCard.jsx // الموقع + تغيير الموقع (LocationSheet) + GPS
src/components/qibla/QiblaErrorState.jsx // حالات الخطأ/الرفض بإجراءات
src/styles/qibla.css                     // مستورد من الشاشة (نمط settings.css)
```

- البوصلة: `<g>` دوّار بـ `rotate(-heading)` للديال (حروف الجهات + تدرجات + أرقام)، وسهم كعبة ذهبي ثابت الاتجاه بـ `rotate(qiblaBearing - heading)`، وسهم علوي ثابت 12 عالساعة؛ المحاذاة عند ثبات سهم الكعبة تحته.
- حالة خضراء «أنت متجه نحو القبلة» عند `|delta| ≤ 2°`.
- تغيير الموقع عبر `LocationSheet` الموجود، وتحديد موقعي بقسمه يظهر رسائل الصلاحيات (فتح الإعدادات/اختر مدينة).
- تصميم بالمتغيرات الحالية (surface/bg-card/radial ذهبي/radius 20px/shadow) ودعم الثيمين.

### 5. الربط داخل التطبيق

- `constants/app.mjs`: عنصر جديد في `NAV_ITEMS` (`/qibla`, أيقونة `target`, لون `#d4af37`).
- `App.jsx`: `lazy` + `<Route path="/qibla">`.
- `utils/headerTitle.mjs`: `'/qibla': 'اتجاه القبلة'`.
- `components/ui/Icon.jsx`: أيقونات `kaaba`, `arrow-up`.
- `screens/PrayerScreen.jsx`: بطاقة اختصار «اتجاه القبلة».
- `config.xml`: لا صلاحيات جديدة.

### 6. معالجة الأخطاء والصلاحيات

| الحالة | المصدر | الإجراء |
|---|---|---|
| `permission-denied` / `permission-permanent` | location.mjs | رسالة عربية + «فتح الإعدادات» + بديل «اختر مدينة» |
| `gps-off` | location.mjs | تفعيل GPS + بديل يدوي |
| `timeout` / `unavailable` / `error` | location.mjs | الرسائل + إعادة المحاولة |
| لا موقع (fallback مكة) | — | بانر «حدّد موقعك» وتظل الصفحة تعمل (زاوية القبلة 0) |
| `sensor-unavailable` | plugin | بطاقة توضيحية + اتجاه قراءة ثابت من الموقع |
| `calib-required` | accuracy | نداء «حرّك الجهاز بشكل 8» |

## خطوات التنفيذ والتحقق

1. `qiblaMath.mjs` + `tests/qibla.test.mjs` → `npm test`.
2. إنشاء plugin + `cordova plugin add file:cordova-plugins/com.rn0x.qibla` + استكمال `package.json`.
3. `compassWeb.mjs` + `qibla.mjs`.
4. الربط (app.mjs / App.jsx / headerTitle / Icon / PrayerScreen).
5. الشاشة + المكونات + `qibla.css`.
6. `npm test` ثم `npm run build:apk` للتحقق من ترجمة الناتيف.

## ملاحظات

- توقّع الإشارة (sign) للـ azimuth الناتيف = اتجاه أعلى الجهاز في الوضع العمودي؛ تُحتسَب الآن على أن `0 = شمال` والاتجاه في اتجاه عقارب الساعة. عند التجربة على الجهاز: وجّه أعلى الجهاز شمالًا وتأكد أن القراءة ≈ 0/360 — إن انعكست صحّح بإشارة في `QiblaSensor.java` (سطر واحد).