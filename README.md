# اقصادي

كل أقساطك بمكان واحد، وتعرف قبل لا تقسّط إذا تقدر.

مشروع FinTech (CODED · UniCODE · Web with AI — المشروع النهائي): تطبيق ويب عربي أولاً (وفيه إنجليزي) للموظف الشاب بالكويت،
يجمع أقساط تابي وتمارا وديما وقروض البنك والبطاقات، ويوريك مجموعها مقابل راتبك، ويفحص «أقدر أشتريه؟» قبل أي قسط جديد.

**الموقع:** https://aqsati-three.vercel.app

## المشكلة

الموظف الشاب عنده أقساط من كذا جهة (تابي، تمارا، قرض البنك، البطاقة)، وكل تطبيق يوريه أقساطه هو بس.
فما يدري كم مجموعها ولا متى تستحق، فيتأخر وتنخصم عليه غرامات، أو يقسّط شي جديد ما يقدر عليه.

## الصفحات

كل صفحة ملف HTML وحده ورابط وحده (`cleanUrls` على Vercel، و `server.mjs` يسوي نفس الشي على جهازك):

| الرابط | الملف | وش فيها |
|---|---|---|
| `/` | `public/index.html` | الصفحة التعريفية: هيرو ثلاثي الأبعاد (three.js)، تجربة حية للحاسبة، الميزات والأسئلة الشائعة |
| `/login` | `public/login.html` | دخول / حساب جديد (قوة الباسوورد، `?mode=signup` يفتح التسجيل، `?next=` يرجعك لنفس الصفحة) |
| `/app` | `public/app.html` | **لوحتي:** مجموع الشهر ونسبته من الراتب (عداد دائري)، الي يبقى لك، تنبيه «قبل الراتب»، الأقساط الجاية، تاريخ الخلاص، نصايح ذكية، أوسمة، وجولة تعريفية أول مرة |
| `/installments` | `public/installments.html` | **أقساطي:** إضافة / تعديل / حذف مع «تراجع» 5 ثواني، «دفعت ✓» لكل شهر، سلسلة الالتزام 🔥، تبويب نشطة / خلصت، ولصق رسالة البنك (SMS) يعبي النموذج |
| `/check` | `public/check.html` | **أقدر أشتريه؟** النسبة الجديدة والحكم وأقل عدد أقساط آمن و«أضفه لأقساطي»، و**ماذا لو؟** (الراتب −30%..+50%، تخليص قسط بدري) |
| `/calendar` | `public/calendar.html` | **التقويم:** شبكة الشهر بمواعيد كل جهة، يوم الراتب، لوحة اليوم، قائمة الشهر، وتصدير المواعيد ملف `.ics` لتقويم الجوال |
| `/insights` | `public/insights.html` | **التحليل:** كيف تخف أقساطك خلال السنة، التوزيع حسب الجهة، تاريخ الخلاص من الديون، وخطة سداد بمبلغ إضافي (أي قسط تخلصه أول) |
| `/report` | `public/report.html` | **التقرير الشهري:** كشف الشهر (مدفوع / باقي / متأخر) جاهز للطباعة ← PDF، وتصدير CSV |
| `/account` | `public/account.html` | **حسابي:** الراتب والحد الآمن ويوم الراتب، المظهر (فاتح / داكن / حسب الجهاز) واللغة، تغيير الباسوورد، تصدير بياناتك CSV، وحذف الحساب |

- عربي (RTL) وإنجليزي (LTR) بزر واحد (ع / EN)، وثيم فاتح وداكن مصمم مو مقلوب. اللغة والثيم ينحطون قبل أول رسمة للصفحة (`public/js/boot.js`)، فما فيه وميض.
- Mobile-first: شريط تبويب تحت بالجوال، بدون تمرير أفقي على 360px، خانات الإدخال 16px، أزرار 44px، تركيز واضح، وتباين AA بالثيمين، ويحترم `prefers-reduced-motion`.
- الأرقام تنكتب بالعربي أو بالإنجليزي (١٢٠٠ أو 1200)، والمبالغ بالدينار لين 3 خانات (فلس).
- **بدون حساب** كل شي يشتغل (ضيف)، وأول ما تسوي حساب بياناتك تنتقل له.

## تطبيق PWA

- `public/manifest.webmanifest`: ينزل على الشاشة الرئيسية (`start_url` = `/app`) مع اختصارات (أقدر أشتريه؟ / أقساطي / التقويم) وأيقونات عادية و maskable.
- `public/sw.js` (Service Worker):
  - وقت التثبيت يحفظ كل الصفحات، وكل JS/CSS تربطه الصفحة، **وكل موديول تستورده هالسكربتات (يتتبعها لين آخرها)**، فكل الصفحات تفتح بدون إنترنت.
  - الصفحات و JS/CSS: الشبكة أول (فأي نشر جديد يوصل كامل من أول تحميل)، والنسخة المحفوظة بس إذا ما فيه إنترنت. الأيقونات والصور: الكاش أول.
  - `/api/*` ما ينحفظ أبداً: بياناتك تحتاج اتصال، والصفحة تتحدث بروحها أول ما يرجع الإنترنت.
  - غيّر `VERSION` بكل نشر يغيّر الملفات؛ الكاش القديم ينمسح، ويطلع لك تنبيه «فيه تحديث جديد».
  - على `localhost` كل شي من الشبكة، فالتعديل يبين على طول.

## التقنيات

- **الواجهة:** صفحات HTML + CSS + JavaScript modules بدون أي مكتبة ولا build (`public/`). three.js r170 (من jsDelivr) للهيرو بس.
  - `public/css/base.css` (نظام التصميم: tokens للثيمين، الهيدر، شريط التبويب، الكروت، النماذج، النوافذ…) و `public/css/pages/<page>.css`.
  - `public/js/core.js` (الهيدر والتبويب، STATE والأكشنز، `rpc`، الترجمة، الثيم، toast / banner / dialogs، التنسيق) — كل صفحة تستورد منه بس.
  - `public/js/pages/<page>.js` موديول لكل صفحة، و `public/js/logic/*.js` منطق صافي (SMS، الجدول، .ics، خطة السداد، النصايح، الأوسمة، السلسلة…) وله اختبارات.
  - `public/calc.js` حسابات الأقساط والنسب (مشترك بين الواجهة والسيرفر).
  - CSP صارم: بدون `<script>` أو `style=""` أو أحداث داخل الـ HTML.
- **السيرفر:** Node بدون إطار عمل. نقطة وحدة `POST /api/rpc` (`lib/rpc.js`) تتكلم مع **MongoDB Atlas** (`lib/store.js`).
  - على **Vercel**: `api/rpc.js` (Serverless Function).
  - على جهازك: `server.mjs` (نفس الكود).
- **البيانات بـ MongoDB:** `profiles` و `installments` و `payments` (البيانات)، و `users` و `sessions` و `login_attempts` (الحسابات). ولا مفتاح يوصل للمتصفح.
  - `profiles { _id: owner, salary, safeLimit, salaryDay: 1..31 | null }`
  - `installments { _id: uuid, token: owner, provider, title, monthlyAmount, dueDay, firstDueDate, remainingMode: 'count' | 'amount' | 'open', remainingCount: 1..360 | null, lastAmount: KWD | null }`
    - «كم باقي؟» اختياري، والمستخدم يختار وش يعرف: `'count'` عدد الأقساط (الافتراضي، والمستندات القديمة بدون `remainingMode` تنقرا كذا) · `'amount'` المبلغ الباقي (السيرفر يحسب العدد = ceil(المبلغ ÷ الشهري) و `lastAmount` = آخر دفعة إذا أقل من الشهري) · `'open'` بدون نهاية (`remainingCount: null`، ينحسب كل شهر وما يدخل بالدين ولا بتاريخ الخلاص).
  - `payments { _id: '<owner>|<installmentId>|<YYYY-MM>', token: owner, installmentId, month, paidAt }` — صف = «هالقسط مدفوع لهالشهر»، والـ `_id` يخلي التعليم idempotent. فهرس `{ token: 1, month: 1 }`.
  - `owner` = token الضيف (uuid) أو `u:<userId>` للحساب. كل استعلام مربوط بالـ owner، فما أحد يشوف أو يعدّل بيانات غيره.
- النسخة الأولى (اليوم السادس) كانت على Supabase: `supabase/schema-day6-supabase.sql`.

## الحسابات (إيميل + كلمة سر)

- **بدون حساب (ضيف):** المتصفح عنده token عشوائي (uuid) بالـ localStorage، وبياناتك مربوطة فيه.
- **بحساب:** `auth_signup` / `auth_login` يرجعون كوكي `aqsati_session` (HttpOnly · SameSite=Lax · Secure على https · 30 يوم).
  بعدها السيرفر ياخذ صاحب البيانات من الكوكي (`u:<userId>`) ويتجاهل token المتصفح، فتشوف أقساطك من أي جهاز.
- **أول ما تسجل أو تدخل:** أقساط الضيف تنتقل لحسابك (الأقدم أول، وبدون ما يتعدى 50 قسط) ومعها علامات «مدفوع» حقتها، والراتب (مع يوم الراتب) ينتقل بس إذا حسابك ما فيه راتب.
- **تغيير كلمة السر** (`auth_change_password`): لازم تكون داخل، وتكتب كلمة السر الحالية (تنحسب على نفس عداد محاولات الدخول). الجهاز الحالي يظل داخل، وكل الأجهزة الثانية تطلع — حتى دخول بالباسوورد القديم كان شغال بنفس اللحظة ما ياخذ جلسة.
- **حذف الحساب** (`auth_delete_account`): لازم تكون داخل + كلمة السر. يطلّع كل الأجهزة أول، بعدين ينحذف الراتب والأقساط والدفعات والحساب (ومسح ثاني لأي طلب كان بالطريق)، وينمسح الكوكي.
- **كلمة السر:** 8 إلى 200 حرف، تنحفظ scrypt (N=16384) مع salt عشوائي، والمقارنة timingSafeEqual. كل هذا بـ `node:crypto` بدون أي مكتبة (`lib/auth.js`).
- **الجلسة:** الكوكي فيه رقم عشوائي 32 بايت، وقاعدة البيانات تحفظ بس الـ SHA-256 حقه. ينتهي بعد 30 يوم (ونتأكد من التاريخ بالكود، مو بس TTL).
- **الحماية:**
  - رسالة الغلط بالدخول وحدة دايماً (`invalid credentials`)، فما تعرف إذا الإيميل مسجل أو لا.
  - بعد 8 محاولات غلط لنفس الإيميل، أو 30 من نفس الـ IP (والتسجيل ينحسب على الـ IP)، يرد `429` لمدة 15 دقيقة.
  - أي طلب جاي من موقع ثاني (Origin / Sec-Fetch-Site مختلف) ينرد بـ `403 bad origin`، ولازم `Content-Type: application/json`.

| `fn` | `args` | يرجع |
|---|---|---|
| `aqsati_state` | `p_token` | STATE |
| `aqsati_save` | `p_salary`, `p_safe_limit`, `p_salary_day` (اختياري: 1..31، أو `null` يمسحه، وإذا ما انرسل يظل نفسه) | STATE |
| `aqsati_add` / `aqsati_update` | `p_provider`, `p_title`, `p_monthly`, `p_due_day`, `p_remaining_mode` (`'count'` / `'amount'` / `'open'`؛ إذا ما انرسل = `'count'` للنسخ القديمة), `p_remaining` (لازم بـ `'count'`: 1..360)، `p_amount_left` (لازم بـ `'amount'`: المبلغ الباقي من `p_first_due` وطالع، والسيرفر يحسب منه العدد وآخر دفعة — ما ياخذ عدد من المتصفح)، و `'open'` ما يحتاج ولا واحد، `p_first_due` (+ `p_id` للتعديل؛ التعديل يقبل `p_first_due` المحفوظ نفسه حتى لو قديم، فتعديل العنوان ما يغيّر الجدول) | STATE |
| `aqsati_remove` | `p_id` — يحذف القسط **وكل دفعاته** | STATE |
| `aqsati_mark_paid` | `p_id`, `p_month` (`'YYYY-MM'`، من 24 شهر ورا لين شهر قدام — بتوقيت الكويت مهما كان توقيت السيرفر), `p_paid` (`true` / `false`) | STATE |
| `auth_signup` / `auth_login` | `email`, `password`, `p_token` | STATE + كوكي |
| `auth_change_password` | `current_password`, `new_password` (لازم جلسة) | STATE |
| `auth_delete_account` | `password` (لازم جلسة) | `{ profile: null, installments: [], payments: [], user: null }` + يمسح الكوكي |
| `auth_logout` | — | `{ profile: null, installments: [], payments: [], user: null }` + يمسح الكوكي |

كل دوال `aqsati_*` تاخذ `p_token` للضيف (والصفحة تضيفه لحالها)؛ إذا فيه جلسة السيرفر يتجاهله.

STATE = `{ profile: { salary, safe_limit, salary_day: 1..31 | null } | null, installments: [{ id, provider, title, monthly_amount, due_day, remaining_count (null للمفتوح), first_due_date, created_at, remaining_mode: 'count' | 'amount' | 'open', last_amount: number | null }], payments: [{ installment_id, month: 'YYYY-MM', paid_at }] (آخر 24 شهر، دفعات أقساطك بس), user: { email } | null }`.

- `aqsati_mark_paid` idempotent: تعليم نفس الشهر مرتين يخلي صف واحد (و `paid_at` الأول)، وإلغاء شي مو معلّم ما يضر. `p_id` مو لك = ما يتغير شي (مثل التعديل والحذف).
- كل المدخلات لازم تكون نص أو رقم: أي object أو array (مثل `{ "$gt": 0 }`) ينرفض، فما فيه NoSQL injection.

رموز الأخطاء: `token required`، `token and id required`، `invalid input` / `invalid <field>` (منها `invalid remainingMode`، `invalid remaining`، `invalid amountLeft`)، `invalid first due date`، `too many installments`، `invalid salary` / `invalid safe limit`، `invalid salary day`، `invalid month`، `invalid paid`، `not logged in`، `invalid email`، `weak password`، `email taken`، `invalid credentials`، `too many attempts` (429)، `bad origin` (403)، `config` (500)، `db_unavailable` (503). كلها `400` إلا المذكور.

## الإعدادات (بدون أسرار بالكود)

| المكان | وين تحط `MONGODB_URI` |
|---|---|
| Vercel | Settings → Environment Variables |
| جهازك | ملف `.env.local` (انسخ `.env.example`) |

وبـ MongoDB Atlas → Network Access لازم يكون مسموح `0.0.0.0/0`، لأن عناوين سيرفرات Vercel تتغير.

## التشغيل

```bash
npm install     # مكتبة وحدة: mongodb
npm start       # http://localhost:3000
npm test        # كل الاختبارات (node --test "tests/*.test.mjs")
```

### تجربة بدون MongoDB (وضع الذاكرة)

```bash
node server.mjs --memory          # أو: AQSATI_MEMORY_DB=1 node server.mjs
PORT=3499 node server.mjs --memory   # على بورت ثاني
```

يشغّل التطبيق كامل (كل الصفحات + الحسابات + الأقساط) بقاعدة بيانات بالذاكرة (`lib/memorydb.js`)، وما يحتاج مكتبة `mongodb` ولا `MONGODB_URI`.
كل شي ينمسح أول ما توقف السيرفر، وبيطلع لك تحذير بالـ console. **للتجربة على جهازك بس، لا تفعّله على Vercel.**

### الاختبارات

`tests/*.test.mjs` بـ `node:test` (بدون مكتبات): الحسابات والجلسات، قاعدة البيانات والدفعات، حالات التسابق (تغيير الباسوورد وسط دخول، كتابة وسط حذف الحساب)، شهر الكويت، `calc.js`، وكل ملفات `public/js/logic/`.

## الرؤية (الجاي)

تأكيد الإيميل واسترجاع كلمة السر، إشعارات Push قبل موعد كل قسط، قراءة رسايل البنك تلقائي (بدل اللصق)، نسخة محفوظة من البيانات للتصفح بدون إنترنت، وربط مع البنوك وتطبيقات التقسيط.
