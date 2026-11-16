// اقصادي — rule-based reader for Kuwaiti bank / BNPL text messages (Arabic or English, Arabic or Latin digits).
// Pure (no DOM, no network): the installments page shows what we understood and lets the user confirm.
//
//   parseSms(text) → {
//     ok,                 // true when an amount was found
//     amount,             // monthly / payment amount in KWD (3 decimals) or null
//     provider,           // one of calc.PROVIDERS ('تابي' | 'تمارا' | 'ديما' | 'قرض بنك' | 'بطاقة ائتمانية' | 'أخرى') or null
//     brand, brandName,   // 'tabby' | 'nbk' | … and { ar, en } (the bank / app that sent it) or null
//     title,              // { ar, en } suggestion for the installment description or null
//     remaining,          // installments left after this message (null when unknown)
//     index, total,       // «installment n of m» when present
//     dueDay, date,       // day of month (1..31) and the date found ('YYYY-MM-DD' when the year is known) or null
//     status,             // 'due' (reminder) | 'paid' (confirmation) | 'unknown'
//     confidence, level,  // 0..1 and 'high' | 'medium' | 'low'
//   }

import { round3 } from '../../calc.js';

// ---------- normalising ----------

const EASTERN_DIGITS = /[٠-٩۰-۹]/g;

/** Latin digits, '.' decimals, no bidi marks, single spaces. */
export function normalizeSms(text) {
  return String(text ?? '')
    .replace(EASTERN_DIGITS, (ch) => {
      const code = ch.charCodeAt(0);
      return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    })
    .replace(/٫/g, '.')
    .replace(/٬/g, ',')
    .replace(/[‎‏‪-‮⁦-⁩؜]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- who sent it ----------

const BRANDS = [
  // BNPL apps first: «KNET payment to Tabby» or «NBK card … Tamara» is a Tabby / Tamara installment.
  { id: 'tabby', kind: 'bnpl', provider: 'تابي', re: /tabby|تابي/i, name: { ar: 'تابي', en: 'Tabby' } },
  { id: 'tamara', kind: 'bnpl', provider: 'تمارا', re: /tamara|تمارا/i, name: { ar: 'تمارا', en: 'Tamara' } },
  { id: 'deema', kind: 'bnpl', provider: 'ديما', re: /deema|ديما/i, name: { ar: 'ديما', en: 'Deema' } },
  // banks
  { id: 'nbk', kind: 'bank', re: /(?<![a-z])NBK(?![a-z])|national bank of kuwait|بنك الكويت الوطني|الوطني/i, name: { ar: 'الوطني', en: 'NBK' } },
  { id: 'kfh', kind: 'bank', re: /(?<![a-z])KFH(?![a-z])|kuwait finance house|بيت التمويل الكويتي|بيتك/i, name: { ar: 'بيتك', en: 'KFH' } },
  { id: 'boubyan', kind: 'bank', re: /boubyan|بوبيان/i, name: { ar: 'بوبيان', en: 'Boubyan' } },
  { id: 'warba', kind: 'bank', re: /warba|وربة/i, name: { ar: 'وربة', en: 'Warba' } },
  { id: 'gulf', kind: 'bank', re: /gulf\s*bank|بنك الخليج|الخليج/i, name: { ar: 'بنك الخليج', en: 'Gulf Bank' } },
  { id: 'burgan', kind: 'bank', re: /burgan|برقان/i, name: { ar: 'برقان', en: 'Burgan' } },
  { id: 'cbk', kind: 'bank', re: /(?<![a-z])CBK(?![a-z])|commercial bank of kuwait|البنك التجاري/i, name: { ar: 'التجاري', en: 'CBK' } },
  // payment network (tells us it was paid by card, not who the installment is with)
  { id: 'knet', kind: 'network', re: /(?<![a-z])K-?NET(?![a-z])|كي\s?نت/i, name: { ar: 'كي نت', en: 'KNET' } },
];

const RE_CARD = /credit\s*card|بطاق[ةت]\S*\s+(?:ال)?ائتمان|الائتمانية|ائتمانية|(?<![a-z])visa(?![a-z])|master\s*card|card\s+installment/i;
const RE_LOAN = /قرض|القرض|(?<![a-z])loans?(?![a-z])|تمويل(?!\s*الكويتي)|financing|personal finance|مرابحة|murabaha/i;
const RE_INSTALLMENT = /قسط|القسط|أقساط|اقساط|installments?|instalments?|دفعة|دفعات/i;

// ---------- money ----------

const NUM = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d{1,3})?|\d+(?:\.\d{1,3})?)`;
const CUR = String.raw`(?:(?<![a-z])KWD(?![a-z])|(?<![a-z])K\.?D(?![a-z])\.?|د\s?\.\s?ك\.?|دينار(?:اً|ا)?(?:\s*كويتي)?|(?<![a-z])dinars?(?![a-z]))`;
const RE_AMOUNT_AFTER = new RegExp(`${CUR}\\s?${NUM}`, 'gi'); // «KWD 25.500»
const RE_AMOUNT_BEFORE = new RegExp(`${NUM}\\s?${CUR}`, 'gi'); // «25.500 د.ك»

// What sits right before an amount tells us if it is the installment or something else (balance, order total…).
const RE_GOOD = /installments?|instalments?|payments?|قسط|القسط|دفعة|الدفعة|دفعات|amount|مبلغ|المبلغ|بمبلغ|each|monthly|شهري|الشهري|due|مستحق|deduct|debit|خصم|paid|دفع|سداد/gi;
const RE_BAD = /balance|رصيد|الرصيد|المتاح|available|limit|الحد|total|الإجمالي|اجمالي|إجمالي|المجموع|مجموع|order|الطلب|purchase|مشتريات|مشترياتك|price|السعر/gi;

const toNumber = (s) => Number(String(s).replace(/,/g, ''));

function lastHit(re, text) {
  re.lastIndex = 0;
  let at = -1;
  let m;
  while ((m = re.exec(text))) at = m.index + m[0].length;
  return at;
}

function overlaps(a, spans) {
  return spans.some((s) => a.start < s.end && s.start < a.end);
}

function findAmount(text, blocked) {
  const found = [];
  for (const re of [RE_AMOUNT_AFTER, RE_AMOUNT_BEFORE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const value = toNumber(m[1]);
      const numStart = m.index + m[0].indexOf(m[1]);
      const span = { start: numStart, end: numStart + m[1].length };
      if (!(value > 0) || value >= 1e6 || overlaps(span, blocked)) continue;
      if (found.some((f) => f.start === span.start)) continue;
      found.push({ value, start: span.start, end: span.end, matchStart: m.index });
    }
  }
  if (found.length) {
    for (const f of found) {
      const before = text.slice(Math.max(0, f.matchStart - 36), f.matchStart);
      const good = lastHit(RE_GOOD, before);
      const bad = lastHit(RE_BAD, before);
      // the keyword closest to the amount decides
      f.score = bad > good ? -2 : good > -1 ? 2 : 0;
    }
    found.sort((a, b) => b.score - a.score || a.start - b.start);
    return { value: round3(found[0].value), tagged: true };
  }
  // no currency at all: a number right after «قسط / مبلغ / amount / installment»
  const loose = /(?:مبلغ|المبلغ|قسط|القسط|amount|installment|instalment|payment)\D{0,12}?(\d+(?:\.\d{1,3})?)(?![\d/-])/i.exec(text);
  if (loose) {
    const value = toNumber(loose[1]);
    const start = loose.index + loose[0].lastIndexOf(loose[1]);
    if (value > 0 && value < 1e6 && !overlaps({ start, end: start + loose[1].length }, blocked)) {
      return { value: round3(value), tagged: false };
    }
  }
  return null;
}

// ---------- dates ----------

const MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTHS_AR = [
  ['يناير', 'كانون الثاني'], ['فبراير', 'شباط'], ['مارس', 'آذار'], ['أبريل', 'ابريل', 'إبريل', 'نيسان'], ['مايو', 'أيار'],
  ['يونيو', 'يونيه', 'حزيران'], ['يوليو', 'يوليه', 'تموز'], ['أغسطس', 'اغسطس', 'آب'], ['سبتمبر', 'أيلول'],
  ['أكتوبر', 'اكتوبر', 'تشرين الأول'], ['نوفمبر', 'تشرين الثاني'], ['ديسمبر', 'كانون الأول'],
];
const AR_MONTH_RE = MONTHS_AR.flat().sort((a, b) => b.length - a.length).join('|');
const RE_DUE_WORD = /due|استحقاق|الاستحقاق|يستحق|مستحق|next|القادم|القادمة|will be|سيتم|(?<![a-z])on(?![a-z])|بتاريخ|يوم/gi;

const pad = (n) => String(n).padStart(2, '0');
const validDay = (d) => Number.isInteger(d) && d >= 1 && d <= 31;
const validMonth = (m) => Number.isInteger(m) && m >= 1 && m <= 12;
const fullYear = (y) => (y < 100 ? 2000 + y : y);

function findDates(text) {
  const out = [];
  const push = (index, length, day, month = null, year = null) => {
    if (!validDay(day) || (month !== null && !validMonth(month))) return;
    if (out.some((d) => index < d.index + d.length && d.index < index + length)) return;
    const date = year && month ? `${year}-${pad(month)}-${pad(day)}` : null;
    out.push({ index, length, day, month, year, date });
  };
  let m;
  const iso = /(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g;
  while ((m = iso.exec(text))) push(m.index, m[0].length, Number(m[3]), Number(m[2]), Number(m[1]));
  const dmy = /(?<![\d.,])(\d{1,2})([/-])(\d{1,2})\2(\d{2}|\d{4})(?!\d)/g;
  while ((m = dmy.exec(text))) push(m.index, m[0].length, Number(m[1]), Number(m[3]), fullYear(Number(m[4])));
  const dmyDots = /(?<![\d.,])(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/g;
  while ((m = dmyDots.exec(text))) push(m.index, m[0].length, Number(m[1]), Number(m[2]), Number(m[3]));
  const dm = /(?<![\d.,])(\d{1,2})\/(\d{1,2})(?![\d/])/g; // «15/12» without a year
  while ((m = dm.exec(text))) push(m.index, m[0].length, Number(m[1]), Number(m[2]));
  const enDayMonth = /(?<![\d.,])(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?/gi;
  while ((m = enDayMonth.exec(text))) push(m.index, m[0].length, Number(m[1]), MONTHS_EN.indexOf(m[2].toLowerCase()) + 1, m[3] ? Number(m[3]) : null);
  const enMonthDay = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?!\d)(?!\.\d)(?:,?\s+(\d{4}))?/gi;
  while ((m = enMonthDay.exec(text))) push(m.index, m[0].length, Number(m[2]), MONTHS_EN.indexOf(m[1].toLowerCase()) + 1, m[3] ? Number(m[3]) : null);
  const arDayMonth = new RegExp(`(?<![\\d.,])(\\d{1,2})\\s*(?:من\\s+)?(${AR_MONTH_RE})(?:\\s+(\\d{4}))?`, 'g');
  while ((m = arDayMonth.exec(text))) {
    const month = MONTHS_AR.findIndex((names) => names.includes(m[2])) + 1;
    push(m.index, m[0].length, Number(m[1]), month, m[3] ? Number(m[3]) : null);
  }
  // «يوم 15 من كل شهر» / «on the 15th of every month» / «day 15»
  const dayOnly = /(?:يوم|اليوم|day|on the)\s+(\d{1,2})(?:st|nd|rd|th)?(?![\d,/-])(?!\.\d)/gi;
  while ((m = dayOnly.exec(text))) push(m.index, m[0].length, Number(m[1]));
  return out.sort((a, b) => a.index - b.index);
}

function pickDate(text, dates) {
  if (!dates.length) return null;
  // prefer a date announced as the due / next date
  for (const d of dates) {
    const before = text.slice(Math.max(0, d.index - 24), d.index);
    if (lastHit(RE_DUE_WORD, before) > -1) return d;
  }
  return dates[0];
}

// ---------- counts ----------

const RE_FUTURE = /will be|سيتم|سوف|due on|due date|is due|are due|يستحق|تاريخ الاستحقاق|تذكير|reminder|upcoming|القادم|القادمة|tomorrow|غدا|غداً|باچر|باكر/i;
const RE_DONE = /has been paid|was paid|were paid|paid successfully|successfully paid|payment received|received successfully|was successful|successful|تم\s*(?:دفع|سداد|خصم|استلام|الدفع|السداد|الخصم)|دفعت|تم بنجاح|(?<![a-z])paid(?![a-z])|deducted|debited|charged/i;

function findStatus(text) {
  const done = RE_DONE.exec(text);
  const future = RE_FUTURE.exec(text);
  if (done && future) {
    // «… 2 of 4 has been paid. Next payment due on …» → paid; «will be debited» → due
    if (/will be|سيتم|سوف/i.test(text.slice(Math.max(0, done.index - 12), done.index + done[0].length))) return 'due';
    return done.index < future.index ? 'paid' : 'due';
  }
  if (done) return /will be|سيتم|سوف/i.test(text) ? 'due' : 'paid';
  if (future) return 'due';
  return 'unknown';
}

function findCounts(text, status) {
  let m;
  // «installment 2 of 4», «القسط 3 من 6», «payment #2 of 4», «2/4» right after an installment word
  const nOfM = /(?:(installments?|instalments?|payments?|قسط|القسط|الدفعة|دفعة)\s*(?:no\.?|number|#|رقم)?\s*)?(?<![\d.,])(\d{1,3})\s*(of|out of|من أصل|من|\/)\s*(\d{1,3})(?![\d,/-])(?!\.\d)/gi;
  while ((m = nOfM.exec(text))) {
    const n = Number(m[2]);
    const total = Number(m[4]);
    if (m[3] === '/' && !m[1]) continue; // «15/12» is a date, not «15 of 12»
    if (!(n >= 1 && total >= n && total <= 360)) continue;
    const remaining = status === 'paid' ? total - n : total - n + 1;
    return { index: n, total, remaining, span: { start: m.index, end: m.index + m[0].length } };
  }
  // «باقي 3 أقساط», «Remaining: 8», «3 installments remaining»
  const left1 = /(?:remaining|left|متبقي[ةه]?|المتبقي[ةه]?|باقي|الباقي|يتبقى|تبقى|بقي)\s*(?:installments?|instalments?|payments?|أقساط|اقساط|دفعات)?\s*[:：-]?\s*(?:لك\s+|عليك\s+)?(\d{1,3})(?![\d,])(?!\.\d)(?!\s*(?:KWD|KD|K\.D|د\s?\.|دينار|dinar))/i.exec(text);
  if (left1) {
    const r = Number(left1[1]);
    if (r >= 0 && r <= 360) return { remaining: r, span: { start: left1.index, end: left1.index + left1[0].length } };
  }
  const left2 = /(?<![\d.,])(\d{1,3})\s*(?:more\s+)?(?:installments?|instalments?|payments?|أقساط|اقساط|دفعات|قسط)\s*(?:remaining|left|متبقي[ةه]?|باقي[ةه]?|متبقيه|متبقية)/i.exec(text);
  if (left2) {
    const r = Number(left2[1]);
    if (r >= 0 && r <= 360) return { remaining: r, span: { start: left2.index, end: left2.index + left2[0].length } };
  }
  // «split into 4 payments», «على 4 دفعات» → a new plan of m payments
  const split = /(?:split\s+(?:into|in)|divided\s+into|(?<![a-z])(?:into|in|over)|على|مقسم[ةه]?\s+على|مقسّم[ةه]?\s+على)\s*(\d{1,3})\s*(?:monthly\s+)?(?:payments?|installments?|instalments?|دفعات|أقساط|اقساط|شهور|أشهر)/i.exec(text);
  if (split) {
    const total = Number(split[1]);
    if (total >= 1 && total <= 360) {
      const firstPaid = status === 'paid' && /first|الأولى|الاولى|أول|اول/i.test(text);
      return { total, remaining: firstPaid ? total - 1 : total, span: { start: split.index, end: split.index + split[0].length } };
    }
  }
  return null;
}

// ---------- main ----------

export function parseSms(raw) {
  const text = normalizeSms(raw);
  const empty = {
    ok: false, amount: null, provider: null, brand: null, brandName: null, title: null,
    remaining: null, index: null, total: null, dueDay: null, date: null, status: 'unknown', confidence: 0, level: 'low',
  };
  if (!text) return empty;

  const status = findStatus(text);
  const counts = findCounts(text, status);
  // a date never sits inside «installment 2/4»
  const dates = findDates(text).filter((d) => !counts?.span || !overlaps({ start: d.index, end: d.index + d.length }, [counts.span]));
  const blocked = [...dates.map((d) => ({ start: d.index, end: d.index + d.length })), ...(counts?.span ? [counts.span] : [])];
  const amount = findAmount(text, blocked);
  const dateHit = pickDate(text, dates);

  // provider: a BNPL app wins, then a bank (credit card or loan), then the kind of message alone
  const hits = BRANDS.filter((b) => b.re.test(text));
  const bnpl = hits.find((b) => b.kind === 'bnpl');
  const bank = hits.find((b) => b.kind === 'bank');
  const network = hits.find((b) => b.kind === 'network');
  const isCard = RE_CARD.test(text);
  const isLoan = RE_LOAN.test(text);
  let provider = null;
  let brand = null;
  let providerScore = 0;
  if (bnpl) {
    provider = bnpl.provider;
    brand = bnpl;
    providerScore = 0.3;
  } else if (bank) {
    provider = isCard && !isLoan ? 'بطاقة ائتمانية' : 'قرض بنك';
    brand = bank;
    providerScore = isCard || isLoan || RE_INSTALLMENT.test(text) ? 0.3 : 0.22;
  } else if (isCard) {
    provider = 'بطاقة ائتمانية';
    providerScore = 0.18;
  } else if (isLoan) {
    provider = 'قرض بنك';
    providerScore = 0.18;
  } else if (network) {
    brand = network;
    providerScore = 0.08;
  }

  let title = null;
  if (brand && brand.kind === 'bank') {
    const kindAr = provider === 'بطاقة ائتمانية' ? 'بطاقة' : 'قرض';
    const kindEn = provider === 'بطاقة ائتمانية' ? 'card' : 'loan';
    title = { ar: `${kindAr} ${brand.name.ar}`, en: `${brand.name.en} ${kindEn}` };
  }

  let confidence = 0;
  if (amount) confidence += amount.tagged ? 0.45 : 0.25;
  confidence += providerScore;
  if (counts && counts.remaining != null) confidence += 0.15;
  if (dateHit) confidence += 0.1;
  if (!amount) confidence = Math.min(confidence, 0.4);
  confidence = Math.round(Math.min(1, confidence) * 100) / 100;

  return {
    ok: Boolean(amount),
    amount: amount ? amount.value : null,
    provider,
    brand: brand ? brand.id : null,
    brandName: brand ? { ...brand.name } : null,
    title,
    remaining: counts && counts.remaining != null ? counts.remaining : null,
    index: counts?.index ?? null,
    total: counts?.total ?? null,
    dueDay: dateHit ? dateHit.day : null,
    date: dateHit?.date ?? null,
    status,
    confidence,
    level: confidence >= 0.75 ? 'high' : confidence >= 0.45 ? 'medium' : 'low',
  };
}

/** Ready-made examples (the «جرّب مثال» button cycles through them). */
export const SAMPLE_MESSAGES = [
  'Tabby: Your payment of KWD 25.500 for SHEIN is due on 15/12/2026. Installment 2 of 4.',
  'تمارا: تذكير، القسط ٣ من ٦ بقيمة ١٢٫٧٥٠ د.ك مستحق بتاريخ ٢٠٢٦-١٢-٠٥',
  'بنك الكويت الوطني: تم خصم قسط القرض بمبلغ 150.000 د.ك من حسابك بتاريخ 25/11/2026. الرصيد المتاح 1,230.450 د.ك',
  'KFH: Your credit card installment of KWD 60.250 will be debited on 10 Dec. Remaining: 8',
  'Deema: Payment of 40.000 KD received successfully. 3 installments remaining.',
];
