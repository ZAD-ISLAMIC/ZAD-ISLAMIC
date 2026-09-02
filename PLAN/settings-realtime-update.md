# خطة إصلاح: تحديث الصلاحيات وحالة الصوت في الوقت الفعلي

## الجزء الأول: تحديث عند العودة من إعدادات النظام ✅ مُنفَّذ
إضافة `visibilitychange` للـ event listeners الموجودة مسبقًا.

## الجزء الثاني: تحديث حالة الصوت عند تغيير شريط الصوت

### المشكلة
`changeAdhanVolume` (سطر 159-163) يستدعي `setAdhanVolume(value)` الذي يحدّث native plugin، لكنه لا يُحدّث state الـ `audio` المحلي.
لذلك مربع "الحالة الآن" لا ينعكس عند تحريك الشريط.

### السبب
`getAudioState()` يُستدعى فقط في `useEffect` عند mount وعلى `resume`/`focus`/`visibilitychange`.
عند تحريك الشريط لا يُعاد استدعاؤها.

### الحل
إضافة `getAudioState().then(setAudio)` داخل `changeAdhanVolume` بعد تحديث native volume.

### الكود المطلوب (سطور 159-163):
```js
// قبل
const changeAdhanVolume = (v) => {
  const value = v / 100
  setConfig((c) => ({ ...c, adhanVolume: value }))
  setAdhanVolume(value)
}

// بعد
const changeAdhanVolume = (v) => {
  const value = v / 100
  setConfig((c) => ({ ...c, adhanVolume: value }))
  setAdhanVolume(value)
  getAudioState().then(setAudio)
}
```

### الملاحظات
- `getAudioState()` lightweight (استدعاء native plugin واحد)
- لا يوجد polling — فقط عند التفاعل المباشر مع الشريط
- لا يوجد تسريب ذاكرة (state setter مستخدم داخل useEffect existing)
