// أقساطي — landing page (/). Marketing + a live «أقدر أشتريه؟» demo (pure calc, nothing saved),
// the 3D hero (lazy, SVG fallback), a phone mockup of «لوحتي» (example numbers, or the visitor's own),
// a pausable providers marquee, the 4-step "how it works" with a connector traced on scroll, the 40% band,
// and small "try it" buttons for theme / language / install.
// Uses only the core.js API. CSP-safe: no inline styles or handlers; dynamic text via textContent / esc();
// runtime styles only through the CSSOM (style.setProperty).

import {
  initPage, registerStrings, t, getLang, setLang, store, fmt, fx, esc,
  resolvedTheme, setTheme, toast, $, $$,
} from '../core.js';
import * as C from '../../calc.js';

registerStrings({
  ar: {
    'home.title': 'كل أقساطك بمكان واحد',
    'home.eyebrow': 'تابي · تمارا · ديما · البنك · البطاقة — بشاشة وحدة',
    'home.h1a': 'كل أقساطك',
    'home.h1b': 'بمكان واحد',
    'home.h1c': 'وتعرف قبل لا تقسّط إذا تقدر.',
    'home.lead': 'اجمع أقساطك من كل الجهات، وشوف كم تاخذ من راتبك، واعرف موعد كل قسط قبل لا يفاجئك. وقبل لا تشتري شي جديد بالتقسيط، نقولك إذا يناسب ميزانيتك ولا لا.',
    'home.ctaStart': 'ابدأ مجاناً — سوّ حسابك',
    'home.ctaContinue': 'كمّل من وين وقفت',
    'home.ctaDash': 'افتح لوحتي',
    'home.ctaLogin': 'دخول',
    'home.ctaAccount': 'حسابي',
    'home.trustLabel': 'ليش تثق باقصادي؟',
    'home.trust1': 'ما نطلب حسابك البنكي ولا بطاقتك',
    'home.trust2': 'كلمة السر مشفرة',
    'home.trust3': 'بالدينار الكويتي',
    'home.trust4': 'عربي · English',
    'home.scrollCue': 'انزل وشوف لوحتك',

    'home.chipRatio': 'نسبتك من الراتب',
    'home.chipTotal': 'مجموع أقساطك بالشهر',
    'home.chipNext': 'القسط الجاي · {when}',
    'home.chipEx': '⁦24%⁩ · مريح',

    'home.fb1p': 'تابي',
    'home.fb1a': '45.500 د.ك',
    'home.fb1s': 'قسط 2 من 4',
    'home.fb2p': 'تمارا',
    'home.fb2a': '62.250 د.ك',
    'home.fb3p': 'قرض بنك',
    'home.fb3a': '180.000 د.ك',

    'home.peekKicker': 'لوحتي',
    'home.peekTitle': 'شهرك كله بشاشة وحدة',
    'home.peekDesc': 'أول ما تضيف أقساطك تتعبى لوحتك: نسبتك من الراتب، والتزامك الشهري، وكم يبقى لك، وأقرب المواعيد.',
    'home.peek1t': 'نسبتك بحلقة وحدة',
    'home.peek1d': 'لونها أخضر وأنت مرتاح، وتصفرّ إذا قربت من حدك الآمن، وتحمرّ إذا تعديته.',
    'home.peek2t': 'التزامك وكم يبقى لك',
    'home.peek2d': 'مجموع أقساطك بالشهر، والي يبقى من راتبك بعدها — يتحسب لحاله.',
    'home.peek3t': 'الأقساط الجاية بالترتيب',
    'home.peek3d': 'أقرب موعد فوق، وكم يوم باقي عليه، وكم قسط باقي لين تخلص.',
    'home.peekCta': 'سوّ حسابك وشوف لوحتك',
    'home.phKicker': 'لوحة {month}',
    'home.phMonthly': 'التزامك الشهري',
    'home.phFree': 'يبقى لك من الراتب',
    'home.phUp': 'الأقساط الجاية',
    'home.phAll': 'كل أقساطي',
    'home.phFreeTitle': 'العد التنازلي للحرية',
    'home.phFreeBy': 'بتخلص من كل أقساطك بـ',
    'home.phCapEx': 'مثال توضيحي — لوحتك تتعبى بأرقامك أنت.',
    'home.phCapYou': 'هذي أرقامك أنت من لوحتك ✓',
    'home.pcLimit': 'حدك الآمن {limit}',
    'home.pcPaid': 'علّمته «دفعت»',

    'home.mqPause': 'أوقف الشريط المتحرك',
    'home.lvl.ok': 'مريح',
    'home.lvl.warn': 'قريب من حدك',
    'home.lvl.over': 'فوق حدك',

    'home.provTitle': 'يجمع أقساطك من:',
    'home.pv1': 'تابي',
    'home.pv2': 'تمارا',
    'home.pv3': 'ديما',
    'home.pv4': 'قروض البنوك',
    'home.pv5': 'البطاقات الائتمانية',
    'home.pv6': 'أي جهة ثانية',
    'home.pvT': 'ت',
    'home.pvD': 'د',
    'home.pvB': 'ب',
    'home.pvC': 'ب',

    'home.factsTitle': 'اقصادي بالأرقام',
    'home.fact1': 'ربط بحسابك البنكي أو بطاقتك',
    'home.fact2': 'حد آمن افتراضي، وتقدر تغيّره',
    'home.fact3': 'ميزات بتطبيق واحد',
    'home.fact4': 'شهر من سجل التزامك محفوظ',
    'home.fact5': 'لغتين: عربي و English',

    'home.howKicker': 'كيف يشتغل؟',
    'home.howTitle': 'أربع خطوات، وتعرف وين واقف',
    'home.step0Title': 'سجّل حسابك',
    'home.step0Desc': 'إيميل وكلمة سر بس، وحسابك جاهز بثواني. كلمة السر تنحفظ مشفّرة، وما نطلب حسابك البنكي ولا بطاقتك.',
    'home.howDesc': 'بدون ربط حسابات، وبدون أرقام بطاقات. أنت تكتب، ونحن نحسب.',
    'home.step1Title': 'أضف أقساطك',
    'home.step1Desc': 'تابي، تمارا، ديما، قرض البنك، البطاقة… حط المبلغ الشهري ويوم الاستحقاق وكم قسط باقي. أو الصق رسالة البنك ونعبّيها لك.',
    'home.step2Title': 'شوف نسبتك من الراتب',
    'home.step2Desc': 'كم تاخذ الأقساط من راتبك، وكم يبقى لك، والي باقي تدفعه هالشهر. وتنبيه إذا قربت من حدك الآمن.',
    'home.step3Title': 'افحص قبل لا تقسّط',
    'home.step3Desc': 'تحط السعر وعدد الأقساط، ونقولك نسبتك الجديدة، وإذا بتتعدى حدك نقترح أقل عدد أقساط يخليك مرتاح.',
    'home.ilOfSalary': 'من راتبك',
    'home.ilComfy': 'مريح ✓',
    'home.ilPrice': '360 د.ك',

    'home.limKicker': 'الحد الآمن',
    'home.limLine': 'الحد الآمن المقترح لأقساطك من الراتب — كم نسبتك أنت؟',
    'home.limNote': 'هذا الحد الافتراضي باقصادي، مو قانون ولا شرط من بنك. تقدر تغيّره من «حسابي» على راحتك، ونحذّرك إذا قربت منه.',
    'home.limCta': 'احسب نسبتك الحين',
    'home.limScale': 'نسبة أقساطك من الراتب',
    'home.limMark': 'حدك ⁦40%⁩',
    'home.limOk': 'مريح — أقل من ⁦30%⁩',
    'home.limWarn': 'قريب من حدك — من ⁦30%⁩ إلى ⁦40%⁩',
    'home.limOver': 'فوق حدك — أكثر من ⁦40%⁩',
    'home.limFoot': '«قريب من حدك» يبدأ من ثلاث أرباع حدك، فلو غيّرت حدك تتغيّر الألوان معاه.',

    'home.demoKicker': 'جرّبها الحين',
    'home.demoTitle': 'أقدر أشتريه؟ اعرف بثواني',
    'home.demoDesc': 'حط راتبك وأقساطك الحالية وسعر الشي الي تبيه. الحساب يصير بجهازك، وما ينحفظ شي.',
    'home.dSalary': 'راتبك الشهري',
    'home.dCurrent': 'أقساطك الحالية بالشهر',
    'home.dPrice': 'سعر الشي الجديد',
    'home.dCount': 'على كم قسط؟',
    'home.dMonths': 'شهر',
    'home.dQuick': 'عدد أقساط سريع',
    'home.dOfSalary': 'من راتبك',
    'home.dNewMonthly': 'القسط الجديد بالشهر',
    'home.dTotal': 'مجموع أقساطك بعده',
    'home.dLeft': 'يبقى من راتبك',
    'home.dOpenCheck': 'افتح «أقدر أشتريه؟» مع «ماذا لو؟»',
    'home.dLimit': 'حدك الآمن {limit} من الراتب = {amount} بالشهر.',
    'home.dPrefilled': 'عبّينا راتبك وأقساطك من بياناتك ✓',
    'home.eSalary': 'حط راتب أكبر من صفر',
    'home.eCurrent': 'حط مبلغ صحيح (0 إذا ما عندك)',
    'home.ePrice': 'حط سعر أكبر من صفر',
    'home.eCount': 'عدد من 1 إلى 360',
    'home.vOkTitle': 'تقدر ✓',
    'home.vWarnTitle': 'تقدر، بس قربت من حدك',
    'home.vOverTitle': 'بتتعدى حدك الآمن',
    'home.vOkBody': 'نسبتك بتصير {pct} من راتبك، وحدك الآمن {limit}.',
    'home.vOverBody': 'بتزيد عن حدك بـ {amount} بالشهر.',
    'home.vSuggest': 'قسّطه على {n} شهر أو أكثر عشان تظل ضمن حدك.',
    'home.vAlready': 'أقساطك الحالية متعدية حدك أصلاً — الأفضل تأجل الشراء.',
    'home.vInvalid': 'كمّل الأرقام فوق عشان نحسب لك.',

    'home.featKicker': 'كل الي تحتاجه',
    'home.featTitle': 'عشر ميزات تخليك مسيطر على أقساطك',
    'home.featDesc': 'من لوحة الشهر لين التقرير PDF — كلها مجانية، وتشتغل على الجوال مثل التطبيق.',
    'home.fOpen': 'افتح',
    'home.f1Title': 'لوحة الشهر',
    'home.f1Desc': 'مجموع أقساطك ونسبتها من راتبك بحلقة وحدة، وكم يبقى لك، والقسط الجاي بعد كم يوم — كل شي يتحسب لحاله.',
    'home.f2Title': 'أقدر أشتريه؟ + ماذا لو؟',
    'home.f2Desc': 'قبل لا تقسّط: نسبتك الجديدة، وهل بتتعدى حدك الآمن، وأقل عدد أقساط يريحك. وجرّب سيناريوهات «ماذا لو؟» قبل لا تقرر.',
    'home.f2Ok': 'تقدر — ⁦33%⁩',
    'home.f2Warn': 'قسّطه على 6 أشهر',
    'home.f3Title': 'التقويم والتذكير',
    'home.f3Desc': 'كل مواعيدك على تقويم الشهر، وصدّرها لتقويم جوالك (ics) عشان يذكرك قبل الموعد.',
    'home.f4Title': 'التحليل وخطة السداد',
    'home.f4Desc': 'توزيع أقساطك حسب الجهة، ومتى تخلص منها، وخطة سداد ترتب لك وش تسدد أول.',
    'home.f5Title': 'دفعت ✓ وسجل الالتزام',
    'home.f5Desc': 'علّم كل قسط «دفعت» أول ما تسدده، وشوف التزامك شهر بشهر.',
    'home.f6Title': 'لصق رسالة البنك',
    'home.f6Desc': 'انسخ رسالة البنك أو تابي والصقها، ونطلع لك المبلغ والتاريخ تلقائياً.',
    'home.f7Title': 'التقرير الشهري PDF',
    'home.f7Desc': 'تقرير مرتب لشهرك تطبعه أو تحفظه PDF بضغطة وحدة.',
    'home.f8Title': 'الوضع الليلي',
    'home.f8Desc': 'ألوان مريحة للعين بالليل، أو خله يتبع إعداد جهازك.',
    'home.f8Try': 'جرّب الوضع الليلي',
    'home.f8Back': 'رجّع الوضع الفاتح',
    'home.f9Title': 'يشتغل كتطبيق',
    'home.f9Desc': 'ثبّته على شاشة جوالك، ويفتح بسرعة حتى لو النت ضعيف.',
    'home.f9Install': 'ثبّت التطبيق',
    'home.f9Hint': 'من قائمة المتصفح اختار «أضف إلى الشاشة الرئيسية».',
    'home.f9HintIos': 'من زر المشاركة اختار «أضف إلى الشاشة الرئيسية».',
    'home.f9Installed': 'مثبّت على جهازك ✓',
    'home.f9Done': 'تم التثبيت ✓',
    'home.f10Title': 'عربي / English',
    'home.f10Desc': 'الواجهة كلها بالعربي، وبضغطة وحدة تصير بالإنجليزي.',
    'home.f10Btn': 'Switch to English',

    'home.privKicker': 'الخصوصية والأمان',
    'home.privTitle': 'فلوسك سرك، وبياناتك لك بس',
    'home.priv1': 'ما نطلب حسابك البنكي ولا بطاقتك — أنت تكتب الأرقام بنفسك.',
    'home.priv2': 'كلمة السر مشفرة (scrypt)، وما نقدر نشوفها حتى نحن.',
    'home.priv3': 'بياناتك مربوطة بحسابك بس، ومحد غيرك يشوفها.',
    'home.priv4': 'صدّر بياناتك CSV، أو احذف حسابك وكل بياناته متى ما تبي.',
    'home.priv5': 'بدون إعلانات، وما نبيع بياناتك لأي أحد.',
    'home.privCta': 'إعدادات الخصوصية بحسابي',

    'home.faqKicker': 'أسئلة تتكرر',
    'home.faqTitle': 'عندك سؤال؟',
    'home.q1': 'لازم أسجّل عشان أستخدمه؟',
    'home.a1': 'إي، عشان أقساطك تنحفظ بأمان بحسابك وتفتحها من أي جهاز. التسجيل ياخذ ثواني: إيميل وكلمة سر بس، وكلمة السر تنحفظ مشفّرة.',
    'home.q2': 'تربطون حسابي البنكي أو تابي؟',
    'home.a2': 'أبداً. ما نطلب أي رقم حساب أو بطاقة ولا كلمة سر بنك. أنت تكتب المبلغ ويوم الاستحقاق، أو تلصق رسالة البنك ونطلع منها الأرقام.',
    'home.q3': 'وش يعني «الحد الآمن»؟',
    'home.a3': 'هو أعلى نسبة من راتبك تبي أقساطك ما تتعداها. الافتراضي ⁦40%⁩، وتقدر تغيّره من «حسابي». إذا قربت منه نحذّرك، وإذا تعديته نقولك.',
    'home.q4': 'أقدر أثبّته على جوالي؟',
    'home.a4': 'إي. افتح الموقع من الجوال واختار «أضف إلى الشاشة الرئيسية»، ويصير مثل التطبيق ويفتح حتى لو النت ضعيف.',
    'home.q5': 'هل اقصادي نصيحة مالية؟',
    'home.a5': 'لا. اقصادي أداة تنظيم وحساب تساعدك تشوف الصورة كاملة. القرار النهائي لك، ولو تحتاج استشارة كلّم مختص.',

    'home.finalKicker': 'مجاني · عربي و English',
    'home.finalTitle': 'جاهز تعرف وين واقف؟',
    'home.finalDesc': 'دقيقتين وتضيف أقساطك، وتعرف نسبتك من راتبك على طول.',
    'home.finalSignup': 'سوّ حساب مجاني',

    'home.footTagline': 'كل أقساطك بمكان واحد، وتعرف قبل لا تقسّط إذا تقدر.',
    'home.footApp': 'التطبيق',
    'home.footAccount': 'حسابك',
    'home.footSignup': 'حساب جديد',
    'home.footMore': 'أكثر',
    'home.footCopy': '© 2026 اقصادي · صُنع بالكويت',
    'home.footNote': 'اقصادي أداة تنظيم وحساب، مو نصيحة مالية.',
  },
  en: {
    'home.title': 'All your installments in one place',
    'home.eyebrow': 'Tabby · Tamara · Deema · Bank · Card — one screen',
    'home.h1a': 'All your installments',
    'home.h1b': 'in one place',
    'home.h1c': 'and know if you can afford it before you buy.',
    'home.lead': 'Bring every installment together, see how much of your salary they take, and know each due date before it surprises you. Before you buy anything new on installments, we tell you whether it fits your budget.',
    'home.ctaStart': 'Start free — create your account',
    'home.ctaContinue': 'Pick up where you left off',
    'home.ctaDash': 'Open my dashboard',
    'home.ctaLogin': 'Log in',
    'home.ctaAccount': 'My account',
    'home.trustLabel': 'Why you can trust Aqsati',
    'home.trust1': 'We never ask for your bank account or card',
    'home.trust2': 'Passwords are encrypted',
    'home.trust3': 'In Kuwaiti dinars',
    'home.trust4': 'العربية · English',
    'home.scrollCue': 'Scroll down to see the dashboard',

    'home.chipRatio': 'Share of your salary',
    'home.chipTotal': 'Your monthly total',
    'home.chipNext': 'Next payment · {when}',
    'home.chipEx': '24% · Comfortable',

    'home.fb1p': 'Tabby',
    'home.fb1a': 'KWD 45.500',
    'home.fb1s': 'Payment 2 of 4',
    'home.fb2p': 'Tamara',
    'home.fb2a': 'KWD 62.250',
    'home.fb3p': 'Bank loan',
    'home.fb3a': 'KWD 180.000',

    'home.peekKicker': 'Your dashboard',
    'home.peekTitle': 'Your whole month on one screen',
    'home.peekDesc': 'As soon as you add your installments, your dashboard fills in: your share of salary, your monthly commitment, what is left, and the next due dates.',
    'home.peek1t': 'Your ratio in one ring',
    'home.peek1d': 'Green while you are comfortable, amber as you near your safe limit, red once you go over it.',
    'home.peek2t': 'Your commitment and what is left',
    'home.peek2d': 'Your monthly installment total and what remains of your salary after it — calculated for you.',
    'home.peek3t': 'Upcoming payments, in order',
    'home.peek3d': 'The nearest due date first, how many days are left, and how many payments remain.',
    'home.peekCta': 'Sign up and see your dashboard',
    'home.phKicker': '{month} dashboard',
    'home.phMonthly': 'Monthly commitment',
    'home.phFree': 'Left from salary',
    'home.phUp': 'Upcoming',
    'home.phAll': 'All plans',
    'home.phFreeTitle': 'Debt-free countdown',
    'home.phFreeBy': 'Installment-free by',
    'home.phCapEx': 'Illustrative example — your dashboard fills in with your own numbers.',
    'home.phCapYou': 'These are your own numbers from your dashboard ✓',
    'home.pcLimit': 'Safe limit {limit}',
    'home.pcPaid': 'Marked “paid”',

    'home.mqPause': 'Pause the moving strip',
    'home.lvl.ok': 'Comfortable',
    'home.lvl.warn': 'Near your limit',
    'home.lvl.over': 'Over your limit',

    'home.provTitle': 'Brings your installments together from:',
    'home.pv1': 'Tabby',
    'home.pv2': 'Tamara',
    'home.pv3': 'Deema',
    'home.pv4': 'Bank loans',
    'home.pv5': 'Credit cards',
    'home.pv6': 'Any other lender',
    'home.pvT': 'T',
    'home.pvD': 'D',
    'home.pvB': 'B',
    'home.pvC': 'C',

    'home.factsTitle': 'Aqsati in numbers',
    'home.fact1': 'links to your bank account or card',
    'home.fact2': 'default safe limit — yours to change',
    'home.fact3': 'features in one app',
    'home.fact4': 'months of payment history kept',
    'home.fact5': 'languages: Arabic & English',

    'home.howKicker': 'How it works',
    'home.howTitle': 'Four steps to know where you stand',
    'home.step0Title': 'Create your account',
    'home.step0Desc': 'Just an email and a password — ready in seconds. Your password is stored encrypted, and we never ask for your bank account or card.',
    'home.howDesc': 'No linked accounts, no card numbers. You type, we do the math.',
    'home.step1Title': 'Add your installments',
    'home.step1Desc': 'Tabby, Tamara, Deema, a bank loan, a card… enter the monthly amount, the due day and how many payments are left — or paste the bank SMS and we fill it in.',
    'home.step2Title': 'See your share of salary',
    'home.step2Desc': 'How much of your salary goes to installments, what is left, and what you still owe this month — with a heads-up when you near your safe limit.',
    'home.step3Title': 'Check before you buy',
    'home.step3Desc': 'Enter the price and the number of payments. We show your new ratio and, if it goes over, the fewest payments that keep you comfortable.',
    'home.ilOfSalary': 'of salary',
    'home.ilComfy': 'Comfy ✓',
    'home.ilPrice': 'KWD 360',

    'home.limKicker': 'Safe limit',
    'home.limLine': 'The suggested safe share of your salary for installments — what is yours?',
    'home.limNote': 'This is Aqsati’s default limit — not a law or a bank rule. Change it any time in your account, and we warn you as you get close.',
    'home.limCta': 'Work out your ratio now',
    'home.limScale': 'Installments as a share of salary',
    'home.limMark': 'Limit 40%',
    'home.limOk': 'Comfortable — under 30%',
    'home.limWarn': 'Near your limit — 30% to 40%',
    'home.limOver': 'Over your limit — above 40%',
    'home.limFoot': '“Near your limit” starts at three quarters of it, so if you change your limit the colours move with it.',

    'home.demoKicker': 'Try it now',
    'home.demoTitle': 'Can I afford it? Find out in seconds',
    'home.demoDesc': 'Enter your salary, your current installments and the price. It is calculated on your device and nothing is saved.',
    'home.dSalary': 'Monthly salary',
    'home.dCurrent': 'Current installments per month',
    'home.dPrice': 'Price of the new item',
    'home.dCount': 'Number of payments',
    'home.dMonths': 'months',
    'home.dQuick': 'Quick payment count',
    'home.dOfSalary': 'of salary',
    'home.dNewMonthly': 'New monthly payment',
    'home.dTotal': 'Installments after',
    'home.dLeft': 'Left from salary',
    'home.dOpenCheck': 'Open “Can I afford it?” with What-if',
    'home.dLimit': 'Your safe limit is {limit} of your salary = {amount} a month.',
    'home.dPrefilled': 'We filled in your salary and installments ✓',
    'home.eSalary': 'Enter a salary above zero',
    'home.eCurrent': 'Enter a valid amount (0 if none)',
    'home.ePrice': 'Enter a price above zero',
    'home.eCount': 'A number from 1 to 360',
    'home.vOkTitle': 'You can afford it ✓',
    'home.vWarnTitle': 'You can — but it is close to your limit',
    'home.vOverTitle': 'This goes over your safe limit',
    'home.vOkBody': 'Your ratio becomes {pct} of your salary; your safe limit is {limit}.',
    'home.vOverBody': 'You would be {amount} a month over your limit.',
    'home.vSuggest': 'Spread it over {n} months or more to stay within your limit.',
    'home.vAlready': 'Your current installments are already over your limit — better to wait.',
    'home.vInvalid': 'Fill in the numbers above to see the result.',

    'home.featKicker': 'Everything you need',
    'home.featTitle': 'Ten features that keep you in control',
    'home.featDesc': 'From the month dashboard to the PDF report — all free, and it runs on your phone like an app.',
    'home.fOpen': 'Open',
    'home.f1Title': 'Month dashboard',
    'home.f1Desc': 'Your installment total and its share of your salary in one ring, what is left, and how many days until the next payment — all calculated for you.',
    'home.f2Title': 'Can I afford it? + What-if',
    'home.f2Desc': 'Before you buy: your new ratio, whether it crosses your safe limit, and the fewest payments that keep you comfortable. Try what-if scenarios before you decide.',
    'home.f2Ok': 'You can — 33%',
    'home.f2Warn': 'Spread over 6 months',
    'home.f3Title': 'Calendar & reminders',
    'home.f3Desc': 'Every due date on a monthly calendar — export it to your phone calendar (.ics) so it reminds you in time.',
    'home.f4Title': 'Insights & payoff plan',
    'home.f4Desc': 'Your installments by provider, when each one ends, and a payoff plan that tells you what to clear first.',
    'home.f5Title': 'Paid ✓ & payment history',
    'home.f5Desc': 'Mark each payment “paid” as soon as you make it and track your record month by month.',
    'home.f6Title': 'Paste a bank SMS',
    'home.f6Desc': 'Copy a message from your bank or Tabby, paste it, and we pick out the amount and the date.',
    'home.f7Title': 'Monthly PDF report',
    'home.f7Desc': 'A clean report of your month — print it or save it as a PDF in one tap.',
    'home.f8Title': 'Dark mode',
    'home.f8Desc': 'Easy on the eyes at night, or let it follow your device setting.',
    'home.f8Try': 'Try dark mode',
    'home.f8Back': 'Back to light mode',
    'home.f9Title': 'Works like an app',
    'home.f9Desc': 'Install it on your home screen; it opens fast even on a weak connection.',
    'home.f9Install': 'Install the app',
    'home.f9Hint': 'Open your browser menu and choose “Add to Home Screen”.',
    'home.f9HintIos': 'Tap Share, then “Add to Home Screen”.',
    'home.f9Installed': 'Installed on this device ✓',
    'home.f9Done': 'Installed ✓',
    'home.f10Title': 'العربية / English',
    'home.f10Desc': 'The whole interface is in Arabic, and one tap switches it to English.',
    'home.f10Btn': 'حوّل للعربي',

    'home.privKicker': 'Privacy & security',
    'home.privTitle': 'Your money is your business',
    'home.priv1': 'We never ask for your bank account or card — you type the numbers yourself.',
    'home.priv2': 'Passwords are hashed with scrypt; not even we can read them.',
    'home.priv3': 'Your data is tied to your account only — no one else can see it.',
    'home.priv4': 'Export your data to CSV, or delete your account and all its data whenever you like.',
    'home.priv5': 'No ads, and we never sell your data to anyone.',
    'home.privCta': 'Privacy settings in my account',

    'home.faqKicker': 'Questions',
    'home.faqTitle': 'Got a question?',
    'home.q1': 'Do I have to sign up?',
    'home.a1': 'Yes — so your installments are stored safely in your account and open on any device. Signing up takes seconds: just an email and a password, and the password is stored encrypted.',
    'home.q2': 'Do you connect to my bank or Tabby?',
    'home.a2': 'Never. We do not ask for any account or card number, or any bank password. You type the amount and due day, or paste a bank SMS and we read the numbers from it.',
    'home.q3': 'What is the “safe limit”?',
    'home.a3': 'It is the highest share of your salary you want installments to take. The default is 40% and you can change it in your account. We warn you as you get close and tell you when you go over.',
    'home.q4': 'Can I install it on my phone?',
    'home.a4': 'Yes. Open the site on your phone and choose “Add to Home Screen” — it then works like an app, even on a weak connection.',
    'home.q5': 'Is Aqsati financial advice?',
    'home.a5': 'No. Aqsati is an organising and calculation tool that shows you the full picture. The final decision is yours; for advice, talk to a professional.',

    'home.finalKicker': 'Free · Arabic & English',
    'home.finalTitle': 'Ready to see where you stand?',
    'home.finalDesc': 'Add your installments in two minutes and see your salary ratio right away.',
    'home.finalSignup': 'Create a free account',

    'home.footTagline': 'All your installments in one place — and know before you buy.',
    'home.footApp': 'App',
    'home.footAccount': 'Your account',
    'home.footSignup': 'Sign up',
    'home.footMore': 'More',
    'home.footCopy': '© 2026 Aqsati · Made in Kuwait',
    'home.footNote': 'Aqsati is an organising and calculation tool, not financial advice.',
  },
});

/** Point an element at another i18n key (so later language switches keep it right) and fill it now. */
function setKey(el, key) {
  if (!el) return;
  el.setAttribute('data-i18n', key);
  el.textContent = t(key);
}

const today = () => C.todayISO();
const safeLimitOf = (st) => Number(st.profile?.safe_limit) || C.DEFAULT_SAFE_LIMIT;

function summaryOf(st) {
  if (!st.installments.length) return null;
  try {
    return C.monthSummary(st.installments, Number(st.profile?.salary) || 0, safeLimitOf(st), today());
  } catch {
    return null;
  }
}

// ---------- hero: CTAs follow the visitor (guest / guest with data / logged in) ----------

function renderCtas() {
  const st = store.state;
  const startLabel = $('#cta-start > span');
  const login = $('#cta-login');
  const finalStart = $('#final-start');
  const finalSignup = $('#final-signup');
  const peek = $('#peek-cta');
  if (peek) {
    peek.href = st.user ? '/app' : '/login?mode=signup&next=/app';
    setKey(peek, st.user ? 'home.ctaDash' : 'home.peekCta');
  }
  if (st.user) {
    // Logged in: every «افتح لوحتي» goes straight to the dashboard (not via the sign-up page).
    const start = $('#cta-start');
    if (start) start.href = '/app';
    if (finalStart) finalStart.href = '/app';
    setKey(startLabel, 'home.ctaDash');
    setKey(finalStart, 'home.ctaDash');
    if (login) { login.href = '/account'; setKey(login, 'home.ctaAccount'); }
    if (finalSignup) { finalSignup.href = '/account'; setKey(finalSignup, 'home.ctaAccount'); }
  } else {
    // The app needs an account: «ابدأ» goes straight to sign-up, then on to the dashboard.
    const start = $('#cta-start');
    if (start) start.href = '/login?mode=signup&next=/app';
    if (finalStart) finalStart.href = '/login?mode=signup&next=/app';
    setKey(startLabel, 'home.ctaStart');
    setKey(finalStart, 'home.ctaStart');
    if (login) { login.href = '/login'; setKey(login, 'home.ctaLogin'); }
    if (finalSignup) { finalSignup.href = '/login?mode=signup'; setKey(finalSignup, 'home.finalSignup'); }
  }
}

// ---------- hero chips: the visitor's own numbers when there are some, otherwise an example ----------

function renderChips() {
  const s = summaryOf(store.state);
  const ico = $('.chip-a .chip-ico');
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  let level = 'ok';
  if (s && s.active.length) {
    if (s.ratio !== null) {
      level = s.level === 'none' ? 'ok' : s.level;
      set('chip-a-label', t('home.chipRatio'));
      set('chip-a-value', `${fmt.pct(s.ratio)} · ${t(`home.lvl.${level}`)}`);
    } else {
      set('chip-a-label', t('home.chipTotal'));
      set('chip-a-value', fmt.money(s.monthlyTotal));
    }
    const next = s.active[0];
    set('chip-b-label', t('home.chipNext', { when: fmt.daysLeft(next.daysLeft) }));
    set('chip-b-value', fmt.money(next.monthly));
  } else {
    set('chip-a-label', t('home.chipRatio'));
    set('chip-a-value', t('home.chipEx'));
    set('chip-b-label', t('home.chipNext', { when: fmt.daysLeft(1) }));
    set('chip-b-value', fmt.money(45.5));
  }
  if (ico) {
    ico.className = `chip-ico ${level}`;
    ico.textContent = level === 'ok' ? '✓' : '!';
  }
}

// ---------- phone mockup: a mini «لوحتي» (the visitor's own numbers when there are some) ----------

// The same example as the 3D cards: salary 1,200 · Tabby 45.500 + Tamara 62.250 + bank loan 180.000 a month.
// The bank loan is on payment 14 of 48, so the example is installment-free 34 months after its next due date.
const EXAMPLE = {
  salary: 1200,
  rows: [
    { provider: 'تابي', monthly: 45.5, daysLeft: 1 },
    { provider: 'تمارا', monthly: 62.25, daysLeft: 6 },
    { provider: 'قرض بنك', monthly: 180, daysLeft: 12 },
  ],
  lastInDays: 12,
  lastAfterMonths: 34,
};

/** 'YYYY-MM' of (today + days) moved on by `months`. */
function monthAfter(days, months) {
  const [y, m, d] = today().split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + days));
  const shifted = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + months, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The dashboard's colour for a provider (same hash as /app, so the avatars match the real list). */
function providerHue(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 6;
}

const phone = { lastPct: 0 };

function renderPhone() {
  const st = store.state;
  const s = summaryOf(st);
  const mine = !!(s && s.active.length);
  const limit = mine ? safeLimitOf(st) : C.DEFAULT_SAFE_LIMIT;
  let monthly;
  let ratio;
  let free;
  let rows;
  let lastMonth;
  if (mine) {
    monthly = s.monthlyTotal;
    ratio = s.ratio;
    free = s.freeAfter;
    rows = s.active.slice(0, 3).map((i) => ({ provider: i.provider, monthly: i.monthly, daysLeft: i.daysLeft }));
    lastMonth = s.active.reduce((max, i) => (i.lastDue && i.lastDue > max ? i.lastDue : max), '').slice(0, 7);
  } else {
    monthly = C.round3(EXAMPLE.rows.reduce((sum, r) => sum + r.monthly, 0));
    ratio = (monthly / EXAMPLE.salary) * 100;
    free = C.round3(EXAMPLE.salary - monthly);
    rows = EXAMPLE.rows;
    lastMonth = monthAfter(EXAMPLE.lastInDays, EXAMPLE.lastAfterMonths);
  }
  const level = C.levelFor(ratio, limit);
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

  set('ph-kicker', t('home.phKicker', { month: fmt.month(today()) }));
  set('ph-monthly', fmt.money(monthly));
  set('ph-free', free === null ? '—' : fmt.money(free));
  set('pc-limit', t('home.pcLimit', { limit: fmt.pct(limit) }));
  set('ph-free-month', lastMonth ? fmt.month(lastMonth) : '—');

  const pctEl = $('#ph-pct');
  if (pctEl) {
    pctEl.className = `lvl-${level}`;
    pctEl.textContent = ratio === null ? '—' : fmt.pct(ratio);
  }
  const ring = $('#ph-ring');
  if (ring) {
    ring.setAttribute('class', `ph-fill lvl-${level}`);
    const pct = ratio === null ? 0 : Math.min(100, Math.max(0, ratio));
    fx.setRing(ring, pct, phone.lastPct);
    phone.lastPct = pct;
  }
  $('#ph-tick')?.setAttribute('transform', `rotate(${(Math.min(100, limit) * 3.6).toFixed(1)} 60 60)`);

  const lvl = $('#ph-level');
  if (lvl) {
    lvl.hidden = level === 'none';
    lvl.className = `ph-level lvl-${level}`;
    set('ph-level-text', level === 'none' ? '' : t(`home.lvl.${level}`));
  }

  const list = $('#ph-list');
  if (list) {
    list.innerHTML = rows.map((r) => {
      const name = fmt.provider(r.provider);
      return `<li><span class="pv pv-${providerHue(r.provider)}">${esc([...name.trim()][0] || '؟')}</span>`
        + `<span class="ph-li-main"><b dir="auto">${esc(name)}</b><small>${esc(fmt.daysLeft(r.daysLeft))}</small></span>`
        + `<span class="ph-li-amt">${esc(fmt.money(r.monthly))}</span></li>`;
    }).join('');
  }
  setKey($('#phone-cap'), mine ? 'home.phCapYou' : 'home.phCapEx');
}

/** The phone drifts a little against the scroll (desktop and phones; never with reduced motion). */
function startPhoneParallax() {
  const par = $('#phone-par');
  const fig = $('#phone-fig');
  if (!par || !fig || fx.reducedMotion() || !('IntersectionObserver' in window)) return;
  let inView = false;
  let ticking = false;
  const update = () => {
    ticking = false;
    if (fx.reducedMotion()) { par.style.setProperty('--py', '0px'); return; }
    const r = fig.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    const c = Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / vh));
    // Only drift up (away from the «مثال توضيحي» caption under the phone), never down over it.
    par.style.setProperty('--py', `${Math.min(0, c * -40).toFixed(1)}px`);
  };
  const onScroll = () => {
    if (!inView || ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };
  new IntersectionObserver((entries) => {
    inView = entries.some((e) => e.isIntersecting);
    if (inView) onScroll();
  }, { rootMargin: '120px 0px' }).observe(fig);
  window.addEventListener('scroll', onScroll, { passive: true });
  fx.onMotionChange((reduce) => { if (reduce) par.style.setProperty('--py', '0px'); });
}

// ---------- providers marquee: endless, pauses on hover / focus / button, still with reduced motion ----------

function startMarquee() {
  const box = $('#marquee');
  const track = $('#mq-track');
  const group = $('#mq-group');
  const btn = $('#mq-toggle');
  if (!box || !track || !group) return;
  let lastWidth = 0;

  const build = () => {
    track.querySelectorAll('.mq-clone').forEach((n) => n.remove());
    if (fx.reducedMotion()) {
      box.classList.remove('is-moving');
      if (btn) btn.hidden = true;
      return;
    }
    box.classList.add('is-moving'); // one row, no wrapping → measurable
    const gw = group.getBoundingClientRect().width;
    lastWidth = box.clientWidth;
    if (!gw) return;
    // half of the track must be at least as wide as the strip, so the loop never shows a gap
    const copies = Math.max(1, Math.ceil(box.clientWidth / gw));
    for (let i = 1; i < copies * 2; i += 1) {
      const c = group.cloneNode(true);
      c.removeAttribute('id');
      c.classList.add('mq-clone');
      c.setAttribute('aria-hidden', 'true');
      track.append(c);
    }
    track.style.setProperty('--mq-dur', `${Math.max(14, (gw * copies) / 36).toFixed(1)}s`);
    if (btn) btn.hidden = false;
  };

  btn?.addEventListener('click', () => {
    const paused = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(paused));
    box.classList.toggle('is-paused', paused);
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      box.classList.toggle('is-off', !entries.some((e) => e.isIntersecting));
    }).observe(box);
  }
  if ('ResizeObserver' in window) {
    let frame = 0;
    new ResizeObserver(() => {
      if (Math.abs(box.clientWidth - lastWidth) < 2) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(build);
    }).observe(box);
  }
  fx.onMotionChange(build);
  window.addEventListener('langchange', () => requestAnimationFrame(build));
  document.fonts?.ready?.then(() => requestAnimationFrame(build)).catch(() => {});
  build();
}

// ---------- «كيف يشتغل؟»: a curved line through the step numbers, traced as the section scrolls by ----------

/** Offset of el inside ancestor, ignoring transforms (so reveal / tilt animations never skew the path). */
function offsetIn(el, ancestor) {
  let x = 0;
  let y = 0;
  let node = el;
  while (node && node !== ancestor) {
    x += node.offsetLeft;
    y += node.offsetTop;
    const parent = node.offsetParent;
    if (!parent || !ancestor.contains(parent) && parent !== ancestor) break;
    node = parent;
  }
  return { x: x + el.offsetWidth / 2, y: y + el.offsetHeight / 2 };
}

function startSteps() {
  const wrap = $('#steps-wrap');
  const svg = $('#steps-line');
  const base = $('#sl-base');
  const draw = $('#sl-draw');
  const nodes = $$('#steps-wrap .step-node');
  if (!wrap || !svg || !base || !draw || nodes.length < 2) return;
  let len = 0;
  let fracs = [];
  let inView = false;
  let ticking = false;

  const paint = () => {
    ticking = false;
    let p = 1;
    if (!fx.reducedMotion()) {
      const vh = window.innerHeight || 1;
      const r = wrap.getBoundingClientRect();
      p = Math.max(0, Math.min(1, (vh * 0.82 - r.top) / (r.height + vh * 0.25)));
    }
    draw.style.strokeDashoffset = (len * (1 - p)).toFixed(1);
    nodes.forEach((n, i) => n.classList.toggle('is-lit', p > 0 && p >= fracs[i] - 0.002));
  };

  const layout = () => {
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (!w || !h) return;
    const pts = nodes.map((n) => offsetIn(n, wrap));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    const across = Math.abs(pts[1].x - pts[0].x) > Math.abs(pts[1].y - pts[0].y);
    const f = (v) => v.toFixed(1);
    let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
    const partials = [];
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1];
      const b = pts[i];
      const side = i % 2 ? 1 : -1;
      if (across) {
        const dx = b.x - a.x;
        const lift = 30 * side;
        d += ` C${f(a.x + dx * 0.42)} ${f(a.y - lift)} ${f(b.x - dx * 0.42)} ${f(b.y - lift)} ${f(b.x)} ${f(b.y)}`;
      } else {
        const dy = b.y - a.y;
        const bend = 14 * side;
        d += ` C${f(a.x + bend)} ${f(a.y + dy * 0.4)} ${f(b.x + bend)} ${f(b.y - dy * 0.4)} ${f(b.x)} ${f(b.y)}`;
      }
      partials.push(d);
    }
    const lengths = [0];
    for (const part of partials) {
      base.setAttribute('d', part);
      lengths.push(base.getTotalLength());
    }
    len = lengths[lengths.length - 1] || 1;
    fracs = lengths.map((l) => l / len);
    base.setAttribute('d', d);
    draw.setAttribute('d', d);
    draw.style.strokeDasharray = `${len.toFixed(1)} ${len.toFixed(1)}`;
    wrap.classList.add('has-line');
    paint();
  };

  const onScroll = () => {
    if (!inView || ticking) return;
    ticking = true;
    requestAnimationFrame(paint);
  };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      inView = entries.some((e) => e.isIntersecting);
      if (inView) onScroll();
    }, { rootMargin: '200px 0px' }).observe(wrap);
  } else {
    inView = true;
  }
  if ('ResizeObserver' in window) {
    let frame = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    }).observe(wrap);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('langchange', () => requestAnimationFrame(layout));
  fx.onMotionChange(paint);
  document.fonts?.ready?.then(() => requestAnimationFrame(layout)).catch(() => {});
  try {
    layout();
  } catch {
    // no SVG geometry API: the steps simply show without the line
  }
}

// ---------- the 40% band: the number counts up once it is on screen ----------

function startLimitBand() {
  const big = $('#limit-big');
  if (!big || fx.reducedMotion() || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    fx.countUp(big, 0, C.DEFAULT_SAFE_LIMIT, (v) => `${Math.round(v)}%`, 1300);
  }, { threshold: 0.6 });
  io.observe(big);
}

// ---------- 3D hero (lazy; the SVG under the canvas stays when WebGL / the CDN isn't there) ----------

function startScene() {
  const box = $('#scene-box');
  if (!box || navigator.connection?.saveData) return;
  const go = () => import('../scene.js').then((m) => m.mountScene(box)).catch(() => {});
  const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 400));
  if (document.readyState === 'complete') idle(go);
  else window.addEventListener('load', () => idle(go), { once: true });
}

// ---------- facts: count up when they scroll into view ----------

function startFacts() {
  const nums = $$('.fact-num');
  if (fx.reducedMotion() || !('IntersectionObserver' in window)) return;
  const run = (el) => {
    const to = Number(el.dataset.count) || 0;
    const suffix = el.dataset.suffix || '';
    fx.countUp(el, 0, to, (v) => `${Math.round(v)}${suffix}`, 1100);
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      run(e.target);
      io.unobserve(e.target);
    }
  }, { threshold: 0.6 });
  nums.forEach((el) => io.observe(el));
}

// ---------- «أقدر أشتريه؟» demo (pure calc.js; nothing is sent or saved) ----------

const demo = {
  touched: new Set(),
  edited: false,
  lastPct: 0,
  lastShown: null,
};

const FIELDS = ['salary', 'current', 'price', 'count'];
const fieldEl = (name) => document.getElementById(`d-${name}`);

function readDemo() {
  const salary = C.round3(C.parseAmount(fieldEl('salary')?.value ?? ''));
  const rawCurrent = String(fieldEl('current')?.value ?? '').trim();
  const current = rawCurrent === '' ? 0 : C.round3(C.parseAmount(rawCurrent));
  const price = C.round3(C.parseAmount(fieldEl('price')?.value ?? ''));
  const count = C.parseWhole(fieldEl('count')?.value ?? '');
  const errors = {};
  if (!(salary > 0) || salary >= 1e6) errors.salary = 'home.eSalary';
  if (!(current >= 0) || current >= 1e6) errors.current = 'home.eCurrent';
  if (!(price > 0) || price >= 1e7) errors.price = 'home.ePrice';
  if (!(count >= 1 && count <= 360)) errors.count = 'home.eCount';
  return { ok: !Object.keys(errors).length, errors, salary, current, price, count };
}

const VERDICT_ICONS = {
  ok: '<svg class="verdict-ico" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="20" cy="20" r="20"/><path d="M12 20.5l5.5 5.5L28 15"/></svg>',
  warn: '<svg class="verdict-ico" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="20" cy="20" r="20"/><path d="M20 11v11M20 28.5v.5"/></svg>',
  over: '<svg class="verdict-ico" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="20" cy="20" r="20"/><path d="M14 14l12 12M26 14 14 26"/></svg>',
};

function renderDemo() {
  const r = readDemo();
  const safe = safeLimitOf(store.state);

  for (const name of FIELDS) {
    const input = fieldEl(name);
    const err = document.getElementById(`d-${name}-err`);
    const show = demo.touched.has(name) && r.errors[name];
    if (input) {
      if (show) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
    if (err) err.textContent = show ? t(r.errors[name]) : '';
  }

  const limitLine = $('#demo-limit');
  if (limitLine) {
    limitLine.textContent = r.salary > 0
      ? t('home.dLimit', { limit: fmt.pct(safe), amount: fmt.money((r.salary * safe) / 100) })
      : t('home.dLimit', { limit: fmt.pct(safe), amount: '—' });
  }

  const ring = $('#demo-ring');
  const pctEl = $('#demo-pct');
  const verdict = $('#demo-verdict');
  const tick = $('#demo-tick-rot');
  if (tick) tick.setAttribute('transform', `rotate(${(Math.min(100, safe) * 3.6).toFixed(1)} 60 60)`);
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

  if (!r.ok) {
    if (ring) {
      ring.setAttribute('class', 'ring-fill lvl-none');
      fx.setRing(ring, 0, demo.lastPct);
    }
    demo.lastPct = 0;
    if (pctEl) { pctEl.className = ''; pctEl.textContent = '—'; }
    setText('demo-new', '—');
    setText('demo-total', '—');
    setText('demo-left', '—');
    if (verdict) verdict.innerHTML = `<p class="hint">${esc(t('home.vInvalid'))}</p>`;
    demo.lastShown = null;
    return;
  }

  const a = C.affordability({ price: r.price, count: r.count, salary: r.salary, safeLimit: safe, currentMonthly: r.current });
  const level = C.levelFor(a.newRatio, safe);
  const pct = Math.max(0, a.newRatio);

  if (ring) {
    ring.setAttribute('class', `ring-fill lvl-${level}`);
    fx.setRing(ring, Math.min(100, pct), Math.min(100, demo.lastPct));
  }
  if (pctEl) {
    pctEl.className = `lvl-${level}`;
    fx.countUp(pctEl, demo.lastShown ?? 0, pct, (v) => fmt.pct(v), 600);
  }
  demo.lastPct = pct;
  demo.lastShown = pct;

  setText('demo-new', fmt.money(a.newMonthly));
  setText('demo-total', fmt.money(a.newTotal));
  setText('demo-left', fmt.money(r.salary - a.newTotal));

  if (!verdict) return;
  let tone;
  let title;
  let body;
  if (a.ok) {
    tone = level === 'warn' ? 'warn' : 'ok';
    title = t(tone === 'warn' ? 'home.vWarnTitle' : 'home.vOkTitle');
    body = t('home.vOkBody', { pct: fmt.pct(a.newRatio), limit: fmt.pct(safe) });
  } else {
    tone = 'over';
    title = t('home.vOverTitle');
    body = a.alreadyOver
      ? t('home.vAlready')
      : `${t('home.vOverBody', { amount: fmt.money(a.overBy) })} ${a.minSafeCount ? t('home.vSuggest', { n: a.minSafeCount }) : ''}`.trim();
  }
  verdict.innerHTML = `<div class="verdict ${tone}">${VERDICT_ICONS[tone]}<strong>${esc(title)}</strong><p>${esc(body)}</p></div>`;
}

/** Fill the demo with the visitor's real salary + monthly total (until they type something themselves). */
function prefillDemo() {
  if (demo.edited) return;
  const st = store.state;
  const salary = Number(st.profile?.salary) || 0;
  const note = $('#demo-note');
  if (!(salary > 0)) {
    if (note) note.hidden = true;
    return;
  }
  const s = summaryOf(st);
  fieldEl('salary').value = String(C.round3(salary));
  fieldEl('current').value = String(s ? s.monthlyTotal : 0);
  if (note) {
    note.textContent = t('home.dPrefilled');
    note.hidden = false;
  }
}

function syncQuick() {
  const count = C.parseWhole(fieldEl('count')?.value ?? '');
  $$('#demo-form input[name="quick"]').forEach((radio) => { radio.checked = Number(radio.value) === count; });
}

function bindDemo() {
  const form = $('#demo-form');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    FIELDS.forEach((f) => demo.touched.add(f));
    renderDemo();
    const r = readDemo();
    const firstBad = FIELDS.find((f) => r.errors[f]);
    if (firstBad) fieldEl(firstBad)?.focus();
  });
  form.addEventListener('input', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.name === 'quick') {
      fieldEl('count').value = target.value;
      demo.touched.add('count');
    } else {
      demo.edited = true;
      $('#demo-note')?.setAttribute('hidden', '');
      if (target.name === 'count') syncQuick();
    }
    renderDemo();
  });
  form.addEventListener('focusout', (e) => {
    const target = e.target;
    if (target instanceof HTMLInputElement && FIELDS.includes(target.name)) {
      demo.touched.add(target.name);
      renderDemo();
    }
  });
}

// ---------- "try it" buttons: dark mode, language, install ----------

function renderThemeTry() {
  setKey($('#try-theme'), resolvedTheme() === 'dark' ? 'home.f8Back' : 'home.f8Try');
}

function renderLangTry() {
  const btn = $('#try-lang');
  if (!btn) return;
  btn.textContent = t('home.f10Btn');
  btn.setAttribute('lang', getLang() === 'ar' ? 'en' : 'ar');
}

let installEvent = null;
let installed = false;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function renderInstall() {
  const btn = $('#try-install');
  const hint = $('#install-hint');
  if (!btn || !hint) return;
  if (installed || isStandalone()) {
    btn.hidden = true;
    hint.hidden = false;
    setKey(hint, 'home.f9Installed');
  } else if (installEvent) {
    btn.hidden = false;
    hint.hidden = true;
  } else {
    btn.hidden = true;
    hint.hidden = false;
    setKey(hint, isIOS() ? 'home.f9HintIos' : 'home.f9Hint');
  }
}

function bindTryButtons() {
  $('#try-theme')?.addEventListener('click', () => {
    setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark');
  });
  $('#try-lang')?.addEventListener('click', () => {
    setLang(getLang() === 'ar' ? 'en' : 'ar');
  });
  $('#try-install')?.addEventListener('click', async () => {
    const evt = installEvent;
    if (!evt) return;
    installEvent = null;
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      if (choice?.outcome === 'accepted') installed = true;
    } catch {
      // the browser refused to show it; the hint explains the manual way
    }
    renderInstall();
  });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    renderInstall();
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    installed = true;
    renderInstall();
    toast(t('home.f9Done'), 'ok');
  });
  window.addEventListener('themechange', renderThemeTry);
}

// ---------- boot ----------

/** Run a render step without letting one failure take the rest of the page down with it. */
function safely(fn) {
  try {
    fn();
  } catch (err) {
    console.warn('home:', err?.message || err);
  }
}

function renderAll() {
  renderCtas();
  renderChips();
  safely(renderPhone);
  prefillDemo();
  renderDemo();
}

bindDemo();
bindTryButtons();
renderThemeTry();
renderLangTry();
renderInstall();

store.subscribe(() => renderAll());
window.addEventListener('langchange', () => {
  renderChips();
  safely(renderPhone);
  renderDemo();
  renderThemeTry();
  renderLangTry();
  if (!$('#demo-note')?.hidden) $('#demo-note').textContent = t('home.dPrefilled');
});

renderAll();
startScene();
startFacts();
safely(startMarquee);
safely(startSteps);
safely(startPhoneParallax);
safely(startLimitBand);
initPage({ active: 'home', title: 'home.title' }).catch((err) => console.error(err));
