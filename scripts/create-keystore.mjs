#!/usr/bin/env node
/**
 * create-keystore.mjs — إنشاء keystore توقيع الأندرويد + ملف build.json محلي.
 *
 * يعمل على جميع الأنظمة (Windows / macOS / Linux) عبر keytool المرفق مع JDK.
 * الملف الناتج build.json مُتجاهل في git حسب التصميم (أسرار توقيع).
 *
 * الاستعمال المباشر:
 *   node scripts/create-keystore.mjs
 *   node scripts/create-keystore.mjs --alias rn0x_Altaqwaa --validity 10000 --name "Rayan Almalki"
 *   node scripts/create-keystore.mjs --output keystores/altaqwaa.keystore --storepass s3cret --keypass s3cret
 *
 * عبر npm:
 *   npm run keystore
 *
 * كلمات المرور تُمرَّر بثلاث طرق (بالأولوية): وسم سطر الأوامر → متغير بيئة → إدخال تفاعلي مخفي.
 */

import { execSync } from 'node:child_process'
import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)

function hasFlag(flag) {
  return args.includes(`--${flag}`)
}

function valueOf(flag, def) {
  const i = args.indexOf(`--${flag}`)
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : def
}

function printHelp() {
  console.log(`
create-keystore.mjs — توليد keystore توقيع الأندرويد + build.json محلي

الاستعمال:
  node scripts/create-keystore.mjs [خيارات]

الخيارات:
  --output <مسار>        مسار ملف keystore الناتج      (افتراضي: altaqwaa.keystore)
  --alias <اسم>          اسم المفتاح داخل الـ keystore  (افتراضي: rn0x_Altaqwaa)
  --validity <أيام>      صلاحية المفتاح بالأيام         (افتراضي: 10000)
  --storepass <كلمة>     كلمة مرور الـ keystore         (أو متغير KEYSTORE_STORE_PASS)
  --keypass <كلمة>       كلمة مرور المفتاح              (أو متغير KEYSTORE_KEY_PASS)
  --name <اسم>           الاسم الكامل CN                (افتراضي: إدخال تفاعلي)
  --org <قسم>            الوحدة OU                      (افتراضي: Altaqwaa)
  --city <مدينة>         المدينة L                      (افتراضي: Riyadh)
  --state <منطقة>        المنطقة ST                     (افتراضي: Riyadh)
  --country <رمز>        الدولة C برمز مكوّن من حرفين  (افتراضي: SA)
  --help                 عرض هذه التعليمات

مثال:
  npm run keystore -- --alias rn0x_Altaqwaa --name "Rayan Almalki"
`)
}

if (hasFlag('help') || hasFlag('h')) {
  printHelp()
  process.exit(0)
}

/* ---------------- تحديد keytool ---------------- */

function findKeytool() {
  const candidates = []
  const javaHome = process.env.JAVA_HOME
  if (javaHome) candidates.push(resolve(javaHome, 'bin', 'keytool'))
  candidates.push('keytool')
  for (const c of candidates) {
    try {
      execSync(`"${c}" -help`, { stdio: 'ignore' })
      return c
    } catch {
      /* جرّب التالي */
    }
  }
  return null
}

/* ---------------- إدخال تفاعلي ---------------- */

let rl
function getRl() {
  if (!rl) rl = createInterface({ input: stdin, output: stdout })
  return rl
}

async function promptVisible(question, fallback) {
  const interface_ = getRl()
  const suffix = fallback ? ` [${fallback}]` : ''
  const answer = await interface_.question(`${question}${suffix}: `)
  return answer.trim() || fallback || ''
}

async function promptHidden(question) {
  const interface_ = getRl()
  process.stdout.write(question)
  const originalWrite = interface_._writeToOutput
  interface_._writeToOutput = () => {}
  try {
    return await interface_.question('')
  } finally {
    interface_._writeToOutput = originalWrite
    process.stdout.write('\n')
  }
}

/* ---------------- تجميع القيم ---------------- */

const keytool = findKeytool()
if (!keytool) {
  console.error(`
تعذّر العثور على keytool. تأكد من تثبيت JDK وتفعيل PATH أو ضبط JAVA_HOME.

- macOS : brew install openjdk@21  ثم اضبط JAVA_HOME
- Ubuntu: sudo apt install openjdk-21-jdk
- Windows: ثبّت JDK من https://adoptium.net وضبط JAVA_HOME
`)
  process.exit(1)
}

const outAbs = resolve(ROOT, valueOf('output', 'altaqwaa.keystore'))
const alias = valueOf('alias', 'rn0x_Altaqwaa')
const validity = Number(valueOf('validity', '10000'))
const org = valueOf('org', 'Altaqwaa')
const city = valueOf('city', 'Riyadh')
const state = valueOf('state', 'Riyadh')
const country = valueOf('country', 'SA')
const envStore = process.env.KEYSTORE_STORE_PASS
const envKey = process.env.KEYSTORE_KEY_PASS

if (!isFinite(validity) || validity < 7.3 * 365) {
  console.error('صلاحية غير صالحة — استخدم 10000 يوم على الأقل لتوقيع طويل الأمد.')
  process.exit(1)
}

if (existsSync(outAbs)) {
  console.error(`الملف موجود بالفعل، اختر مساراً آخر أو احذفه: ${outAbs}`)
  process.exit(1)
}

const cn = valueOf('name') || (await promptVisible('الاسم الكامل (CN)', 'Rayan Almalki'))

let storepass = valueOf('storepass', envStore)
let keypass = valueOf('keypass', envKey)

if (!storepass) {
  /* إدخال تفاعلي بدلاً من الحفظ النصي في وسم السطر كأولوية أخيرة */
  storepass = await promptHidden('كلمة مرور الـ keystore (مخفية): ')
}
if (!keypass) {
  keypass = await promptHidden('كلمة مرور المفتاح (مخفية): ')
}

if (storepass.length < 6 || keypass.length < 6) {
  console.error('كلمات المرور يجب ألا تقل عن 6 أحرف.')
  process.exit(1)
}

/* ---------------- التنفيذ ---------------- */

mkdirSync(dirname(outAbs), { recursive: true })

const dname = `CN=${cn}, OU=${org}, O=${org}, L=${city}, ST=${state}, C=${country}`

const cmd =
  `"${keytool}" -genkeypair -v ` +
  `-keystore "${outAbs}" ` +
  `-storetype PKCS12 ` +
  `-keyalg RSA -keysize 2048 ` +
  `-validity ${validity} ` +
  `-alias "${alias}" ` +
  `-storepass "${storepass}" ` +
  `-keypass "${keypass}" ` +
  `-dname "${dname}"`

try {
  execSync(cmd, { stdio: 'inherit' })
} catch {
  console.error('\nفشل توليد الـ keystore. تأكد من صحة المدخلات وتوفر JDK.')
  process.exit(1)
}

/* ---------------- كتابة build.json المحلي ---------------- */

const relKeystore = './' + relative(ROOT, outAbs).split('\\').join('/')

const buildConfig = {
  android: {
    debug: {
      keystore: relKeystore,
      storePassword: storepass,
      alias,
      password: keypass,
      keystoreType: 'pkcs12',
      packageType: 'apk',
    },
    release: {
      keystore: relKeystore,
      storePassword: storepass,
      alias,
      password: keypass,
      keystoreType: 'pkcs12',
      packageType: 'apk',
    },
  },
}

const buildJsonPath = resolve(ROOT, 'build.json')
writeFileSync(buildJsonPath, JSON.stringify(buildConfig, null, 2) + '\n')

console.log(`
تم بنجاح ✓

  keystore   : ${outAbs}
  build.json : ${buildJsonPath}  (محلي فقط، مُتجاهل في git)
  alias      : ${alias}
  validity   : ${validity} يوم

الآن يمكنك البناء والتوقيع:
  npm run build:apk:release

⚠️  احتفظ بالـ keystore وكلمات المرور في مكان آمن، ولا ترفعها إلى git أبداً.
ستحتاج نسخة احتياطية منها لتحديثات التطبيق المستقبلية.
`)