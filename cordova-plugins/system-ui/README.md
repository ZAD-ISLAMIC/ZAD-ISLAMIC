# SystemUI — Cordova Status Bar + Navigation Bar Theming

Syncs the Android **status bar**, **navigation bar** and their **icon appearance** (light/dark icons) with your app's theme, directly from JavaScript. Works on every Android version (API 24+).

**Plugin ID:** `com.rn0x.systemui` • **Author:** rn0x • **License:** MIT

---

## English

### Why you need this

- On modern devices (Android 10+) calling `window.setStatusBarColor()` / `window.setNavigationBarColor()` is **ignored** — the system bars are transparent and the app draws behind them (edge-to-edge). That is why the classic `cordova-plugin-statusbar` stops working on new Android versions.
- `cordova-android` has a built-in `SystemBarPlugin` that recolours the bars, but it only reacts to `config.xml` preferences and the device's own dark/light mode (`uiMode`). It does **not** know about an in-app theme toggle.
- This plugin colours the surfaces that are actually visible behind the bars **and** mirrors the colours into the shared Cordova preferences, so the framework keeps applying *your* colours on resume / configuration changes instead of the launcher defaults.

### What it does

|                                   | Before this plugin     | After applying `style({...})`       |
| --------------------------------- | ---------------------- | ----------------------------------- |
| Status bar background             | fixed pref color       | your theme color                    |
| Navigation bar background         | system / default color | your theme color                    |
| Status bar icons                  | fixed                  | dark icons on light bg, light on dark |
| Navigation bar icons              | fixed                  | dark icons on light bg, light on dark |

### Requirements

- Cordova Android platform — tested with `cordova-android` 12/13/14/15 (edge-to-edge aware).
- Android min SDK 24 (Android 7.0). Applies correct behaviour from API 21 up.
- AndroidX (already present in every current Cordova Android project via `androidx.core`).

### Installation

From a local folder (recommended while developing):

```bash
# npm link the plugin into your project (package.json devDependency)
npm install "file:./path/to/system-ui"  # or "file:cordova-plugins/system-ui"
cordova plugin add com.rn0x.systemui
```

From npm:

```bash
cordova plugin add com.rn0x.systemui
```

### Usage

Call `style()` every time the theme changes (and once at startup / on `deviceready`).

```js
// Same colour for both bars, icons auto-derived from the background:
cordova.plugins.SystemUI.style({ barColor: '#0a1428', isLight: false })

// Full per-bar control:
cordova.plugins.SystemUI.style({
  statusBarColor: '#101f3c',
  navBarColor: '#0a1428',
  statusBarIcons: 'light',
  navBarIcons: 'dark',
})
  .then(() => console.log('bars updated'))
  .catch((err) => console.warn('bars update failed', err))
```

**Options** — every option is optional; missing values fall back to `barColor` / `isLight` / the plugin default (`#0a1428`, light icons).

| Option          | Type    | Meaning                                                                 |
| --------------- | ------- | ----------------------------------------------------------------------- |
| `barColor`      | String  | Background colour for **both** bars as `#rrggbb` / `#aarrggbb`. Shortcut. |
| `isLight`       | Boolean | Shortcut: `true` → both bars get a *light* background (dark icons).       |
| `statusBarColor`| String  | Background of the **status bar only** (overrides `barColor` for it).     |
| `navBarColor`   | String  | Background of the **navigation bar only** (overrides `barColor` for it). |
| `statusBarIcons`| `'light'` \| `'dark'` | Icon colour of the status bar.           |
| `navBarIcons`   | `'light'` \| `'dark'` | Icon colour of the navigation bar.      |

Icon resolution precedence per bar: explicit `statusBarIcons`/`navBarIcons` → `isLight` shortcut → automatic from the effective background colour's luminance (light background ⇒ dark icons).

### Full example with a theme toggle

```js
const THEMES = { dark: '#0a1428', light: '#f2f6fc' }

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme          // your CSS switching
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEMES[theme])              // browser UI color

  if (window.cordova?.plugins?.SystemUI) {
    window.cordova.plugins.SystemUI.style({
      barColor: THEMES[theme],
      isLight: theme === 'light',
    })
  }
}

// startup: apply before deviceready fires (exec calls are queued automatically)
applyTheme(localStorage.getItem('theme') || 'dark')

// inside your toggle handler
document.getElementById('toggle-theme').addEventListener('click', () => {
  const next = localStorage.getItem('theme') === 'light' ? 'dark' : 'light'
  localStorage.setItem('theme', next)
  applyTheme(next)
})
```

### Android version behaviour matrix

| Android version (API)             | Behaviour                                                                 |
| --------------------------------- | ------------------------------------------------------------------------- |
| 7.0 – 8.0 (24–26)                 | Status bar fully themed. Navigation bar colour on 26+; icons stay light (pre-O limitation), dark background is used so they stay readable. |
| 8.1 – 9 (27–28)                   | Both bars coloured, both icon sets switchable.                            |
| 10 – 14 (29–34)                   | Bars follow theme, icon contrast switchable via insets controller.        |
| 15+ (35+, gesture nav)            | Bars are transparent (edge-to-edge); the app's own background is shown through — this plugin colours exactly that region. |

### How it works

1. **Colours the real surfaces:** the synthetic `statusBarView` strip (`tag="statusBarView"`) added by cordova-android, plus the root `android.R.id.content` background that is visible behind the transparent navigation bar.
2. **Native window calls:** `Window.setStatusBarColor()` / `setNavigationBarColor()` for platforms where they still apply.
3. **Modern icon contrast:** `WindowInsetsControllerCompat.setAppearanceLightStatusBars/NavigationBars` (AndroidX) — works on API 23+, safely ignored below.
4. **Framework alignment:** mirrors the colours into the shared `CordovaPreferences` (`StatusBarBackgroundColor` + `BackgroundColor`), so cordova-android's built-in `SystemBarPlugin` applies the *same* theme colours on `onResume` / `onConfigurationChanged` instead of resetting to launcher defaults.
5. **State cached natively** and re-applied on `onResume` / `onConfigurationChanged`, so the bars survive returning to the app or a dark/light mode toggle of the OS.

### Performance / safety

- The plugin only touches the UI on theme changes, resume and configuration changes — zero per-frame work.
- No static references to `Activity` or `Context` are kept, so there are no activity/memory leaks.
- Guards against posting to a finishing/destroyed activity (wrapped in `try/catch` on a shared handler queue), and coalesces redundant apply passes.
- Failing to update the bars never crashes the app; it is a best-effort cosmetic operation.

### Publish it

```bash
cd system-ui
npm publish --access public   # publishes com.rn0x.systemui to the npm registry
```

After publishing you can install it in any project with:

```bash
cordova plugin add com.rn0x.systemui
```

### License

MIT — free to use in any project, personal or commercial.

---

## العربية

### لماذا تحتاجه

- على الأجهزة الحديثة (أندرويد 10+) **يتم تجاهل** استدعاءات `window.setStatusBarColor()` و `window.setNavigationBarColor()` — الأشرطة أصبحت شفافة والتطبيق يرسم خلفها (وضع edge-to-edge)، ولذلك يتوقف `cordova-plugin-statusbar` القديم عن العمل.
- `cordova-android` يحتوي على `SystemBarPlugin` مدمج يلوّن الأشرطة لكنه يتفاعل فقط مع إعدادات `config.xml` والوضع الليلي/النهاري للنظام (`uiMode`)، ولا يعلم عن تغيير الثيم داخل التطبيق.
- هذا البلجن يلوّن **الأسطح الفعلية** الظاهرة خلف الأشرطة، **ويعكس** الألوان في إعدادات Cordova المشتركة ليستمر الإطار بتطبيق *ألوانك* عند العودة للتطبيق أو تغيّر إعدادات النظام بدل القيم الافتراضية.

### ميزات

- لون شريط الحالة + شريط التنقل تابعان للثيم.
- لون الأيقونات (فاتح/داكن) يُضبط تلقائياً حسب خلفية الثيم.
- يعمل على كل إصدارات أندرويد من API 24 فما فوق (وهو آمن من API 21).
- بدون تسريب ذاكرة، وبدون إمكانية تسببه في تعطّل التطبيق.
- مدمج مع بنية cordova-android الجديدة (edge-to-edge) وليس ضدها.

### التثبيت

من مجلد محلي (أثناء التطوير):

```bash
npm install "file:./path/to/system-ui"
cordova plugin add com.rn0x.systemui
```

من npm مباشرة:

```bash
cordova plugin add com.rn0x.systemui
```

### الاستخدام

نادي `style()` عند كل تغيير للثيم، ومرة عند بدء التشغيل / وصول `deviceready`.

```js
// لون واحد للشريطين مع اشتقاق تلقائي للايقونات حسب الخلفية:
cordova.plugins.SystemUI.style({ barColor: '#0a1428', isLight: false })

// تحكم كامل بكل شريط على حدة:
cordova.plugins.SystemUI.style({
  statusBarColor: '#101f3c',
  navBarColor: '#0a1428',
  statusBarIcons: 'light',
  navBarIcons: 'dark',
})
  .then(() => console.log('تم تحديث الأشرطة'))
  .catch((err) => console.warn('فشل تحديث الأشرطة', err))
```

**الخيارات** — كل خيار اختياري؛ القيم الناقصة تعود لـ `barColor` / `isLight` / الافتراضي (`#0a1428` وأيقونات فاتحة).

| الخيار           | النوع    | الوصف                                                             |
| ---------------- | -------- | ----------------------------------------------------------------- |
| `barColor`       | String   | لون خلفية الشريطين معاً بصيغة `#rrggbb` / `#aarrggbb`. اختصار.      |
| `isLight`        | Boolean  | اختصار: `true` → الشريطان بخلفية *فاتحة* (أيقونات داكنة).           |
| `statusBarColor` | String   | خلفية **شريط الحالة فقط** (يغلب `barColor` له).                     |
| `navBarColor`    | String   | خلفية **شريط التنقل فقط** (يغلب `barColor` له).                     |
| `statusBarIcons` | `'light'` \| `'dark'` | لون أيقونات شريط الحالة.                                  |
| `navBarIcons`    | `'light'` \| `'dark'` | لون أيقونات شريط التنقل.                                 |

أولوية اشتقاق الأيقونات لكل شريط: `statusBarIcons`/`navBarIcons` الصريح → اختصار `isLight` → تلقائي من سطوع لون الخلفية الفعلي (خلفية فاتحة ⇒ أيقونات داكنة).

### مثال كامل مع زر تبديل الثيم

```js
const THEMES = { dark: '#0a1428', light: '#f2f6fc' }

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme        // تبديل CSS الخاص بك
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEMES[theme])            // لون واجهة المتصفح

  if (window.cordova?.plugins?.SystemUI) {
    window.cordova.plugins.SystemUI.style({
      barColor: THEMES[theme],
      isLight: theme === 'light',
    })
  }
}

// عند البدء: طبّق قبل deviceready (الاستدعاءات تُطابَر تلقائياً)
applyTheme(localStorage.getItem('theme') || 'dark')

// داخل متناول زر التبديل
document.getElementById('toggle-theme').addEventListener('click', () => {
  const next = localStorage.getItem('theme') === 'light' ? 'dark' : 'light'
  localStorage.setItem('theme', next)
  applyTheme(next)
})
```

### سلوك النسخ تحت المجهر

| إصدار أندرويد (API)                  | السلوك                                                            |
| ------------------------------------ | ----------------------------------------------------------------- |
| 7.0 – 8.0 (24–26)                    | تلوين كامل لشريط الحالة؛ شريط التنقل من 26+؛ الأيقونات تبقى فاتحة (حدود ما قبل O) مع خلفية داكنة لتبقى واضحة. |
| 8.1 – 9 (27–28)                      | الشريطان ملوّنان وأيقونات كليهما قابلة للتبديل.                     |
| 10 – 14 (29–34)                      | الأشرطة تتبع الثيم وتباين الأيقونات يُضبط عبر insets controller.   |
| 15+ (35+، إيماءات)                   | الأشرطة شفافة (edge-to-edge)؛ يظهر خلفها خلفية التطبيق — وهذا البلجن يلوّن تلك المنطقة بالضبط. |

### كيف يعمل

1. **يلوّن الأسطح الفعلية:** شريط الحالة الاصطناعي `statusBarView` (الوسم `tag="statusBarView"`) الذي يضيفه cordova-android، بالإضافة لخلفية `android.R.id.content` الظاهرة خلف شريط التنقل الشفاف.
2. **استدعاءات النافذة الأصلية:** `Window.setStatusBarColor()` / `setNavigationBarColor()` للمنصات التي ما زالت تدعمها.
3. **تباين الأيقونات الحديث:** `WindowInsetsControllerCompat.setAppearanceLightStatusBars/NavigationBars` (من AndroidX) — يعمل من API 23+ ويُهمَل بأمان فيما قبلها.
4. **مواءمة الإطار:** يعكس الألوان في `CordovaPreferences` المشتركة (`StatusBarBackgroundColor` + `BackgroundColor`) ليواصل `SystemBarPlugin` المدمج تطبيق نفس ألوان الثيم عند `onResume` / `onConfigurationChanged`.
5. **حالة محفوظة أصلياً** تُعاد عند العودة للتطبيق أو عند تبديل وضع الليل/النهار، فتبقى الأشرطة صحيحة دائماً.

### الأداء والأمان

- يلمس البلجن الواجهة فقط عند تغيير الثيم أو العودة أو تغيّر الإعدادات — صفر عمل خلال الإطارات.
- لا يحتفظ بمراجع ثابتة لـ `Activity` أو `Context`، فلا تسريب ذاكرة.
- حماية من النشر على Activity منتهية/محذوفة (داخل `try/catch` وطابور مشترك)، مع دمج الممرات المكررة.
- فشل تحديث الأشرطة لن يعطّل التطبيق؛ العملية تجميلية best-effort.

### النشر المستقل

```bash
cd system-ui
npm publish --access public   # ينشر com.rn0x.systemui في سجل npm
```

ثم ثبّته في أي مشروع:

```bash
cordova plugin add com.rn0x.systemui
```

### الرخصة

MIT — مجاني للاستخدام في أي مشروع شخصي أو تجاري.

---

## Files

```
system-ui/
├── README.md                 # this documentation
├── package.json              # npm package metadata (id com.rn0x.systemui)
├── plugin.xml                # Cordova plugin manifest
├── www/
│   └── systemui.js           # JS bridge (cordova.plugins.SystemUI)
└── src/android/
    └── com/rn0x/systemui/
        └── SystemUI.java     # native implementation (Android only)
```

## Changelog

- **1.1.0** — per-bar control: `statusBarColor`, `navBarColor`, `statusBarIcons`, `navBarIcons`; luminance-based automatic icons; backward compatible with `barColor`/`isLight`.
- **1.0.0** — initial release: sync both bars + icons to one theme colour.