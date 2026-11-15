// SMS reader: Kuwaiti bank + BNPL messages (Arabic / English, Arabic or Latin digits) → what to prefill in the add form.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSms, normalizeSms, SAMPLE_MESSAGES } from '../public/js/logic/sms.js';
import { PROVIDERS } from '../public/calc.js';

const CASES = [
  {
    name: 'Tabby reminder (English, dd/mm/yyyy, n of m)',
    text: 'Tabby: Your payment of KWD 25.500 for SHEIN is due on 15/12/2026. Installment 2 of 4.',
    want: { amount: 25.5, provider: 'تابي', brand: 'tabby', remaining: 3, index: 2, total: 4, dueDay: 15, date: '2026-12-15', status: 'due', level: 'high' },
  },
  {
    name: 'Tamara reminder (Arabic digits, ISO date)',
    text: 'تمارا: تذكير، القسط ٣ من ٦ بقيمة ١٢٫٧٥٠ د.ك مستحق بتاريخ ٢٠٢٦-١٢-٠٥',
    want: { amount: 12.75, provider: 'تمارا', remaining: 4, dueDay: 5, status: 'due', level: 'high' },
  },
  {
    name: 'NBK loan deducted (ignores the balance amount)',
    text: 'بنك الكويت الوطني: تم خصم قسط القرض بمبلغ 150.000 د.ك من حسابك بتاريخ 25/11/2026. الرصيد المتاح 1,230.450 د.ك',
    want: { amount: 150, provider: 'قرض بنك', brand: 'nbk', remaining: null, dueDay: 25, status: 'paid' },
  },
  {
    name: 'KFH credit card (English month name, «Remaining: 8», future tense)',
    text: 'KFH: Your credit card installment of KWD 60.250 will be debited on 10 Dec. Remaining: 8',
    want: { amount: 60.25, provider: 'بطاقة ائتمانية', brand: 'kfh', remaining: 8, dueDay: 10, status: 'due' },
  },
  {
    name: 'Deema paid + «3 installments remaining»',
    text: 'Deema: Payment of 40.000 KD received successfully. 3 installments remaining.',
    want: { amount: 40, provider: 'ديما', remaining: 3, status: 'paid' },
  },
  {
    name: 'Boubyan financing in dinars, «يوم 1 من كل شهر», «باقي 24 قسط»',
    text: 'بوبيان: قسط التمويل الشهري 210 دينار يستحق يوم 1 من كل شهر، باقي 24 قسط',
    want: { amount: 210, provider: 'قرض بنك', brand: 'boubyan', remaining: 24, dueDay: 1 },
  },
  {
    name: 'KNET payment to Tabby (provider wins over the network, balance ignored)',
    text: 'KNET: Payment of 15.000 KWD to Tabby was successful. Available balance KWD 500.000',
    want: { amount: 15, provider: 'تابي', brand: 'tabby', status: 'paid' },
  },
  {
    name: 'Tabby split purchase: picks the per-payment amount, first one paid',
    text: 'تابي: انقسمت مشترياتك بقيمة 200 د.ك على 4 دفعات، كل دفعة 50 د.ك. تم دفع الدفعة الأولى',
    want: { amount: 50, provider: 'تابي', total: 4, remaining: 3, status: 'paid' },
  },
  {
    name: 'Warba loan «5 of 12» before the amount (12 is not the amount)',
    text: 'Warba Bank: loan installment 5 of 12 KWD 95.000 paid on 2026-11-03',
    want: { amount: 95, provider: 'قرض بنك', brand: 'warba', remaining: 7, dueDay: 3, status: 'paid' },
  },
  {
    name: 'Gulf Bank card, «سيتم خصم» is a reminder, Arabic month name',
    text: 'بنك الخليج: سيتم خصم القسط الشهري للبطاقة الائتمانية 33.333 د.ك بتاريخ 28 نوفمبر',
    want: { amount: 33.333, provider: 'بطاقة ائتمانية', brand: 'gulf', dueDay: 28, status: 'due' },
  },
  {
    name: 'Burgan short reminder (KD before the amount)',
    text: 'Burgan Bank: Your installment of KD 75 is due tomorrow.',
    want: { amount: 75, provider: 'قرض بنك', brand: 'burgan', status: 'due' },
  },
  {
    name: 'No currency: a number right after «قسط» still counts, with lower confidence',
    text: 'قسط بيتك 120',
    want: { amount: 120, provider: 'قرض بنك', brand: 'kfh', level: 'medium' },
  },
  {
    name: 'Installment «2/4» is not a date; the real date is',
    text: 'Tamara installment 2/4 of KWD 30.000 due 07/01/2027',
    want: { amount: 30, provider: 'تمارا', remaining: 3, dueDay: 7 },
  },
];

for (const c of CASES) {
  test(`sms: ${c.name}`, () => {
    const r = parseSms(c.text);
    assert.equal(r.ok, true, 'understood an amount');
    for (const [k, v] of Object.entries(c.want)) assert.deepEqual(r[k], v, `${k} for «${c.text}»`);
    assert.ok(r.provider === null || PROVIDERS.includes(r.provider), 'provider is a known option');
    assert.ok(r.confidence > 0 && r.confidence <= 1);
  });
}

test('sms: not a payment message → ok false, low confidence', () => {
  for (const text of ['Hello, your OTP is 123456', '', '   ', null, 'Meeting at 15/12 10:30']) {
    const r = parseSms(text);
    assert.equal(r.ok, false);
    assert.equal(r.amount, null);
    assert.ok(r.confidence <= 0.4);
    assert.equal(r.level, 'low');
  }
});

test('sms: bank names come back as a suggested title in both languages', () => {
  const r = parseSms('KFH: Your credit card installment of KWD 60.250 will be debited on 10 Dec.');
  assert.deepEqual(r.title, { ar: 'بطاقة بيتك', en: 'KFH card' });
  assert.deepEqual(r.brandName, { ar: 'بيتك', en: 'KFH' });
  const loan = parseSms('NBK: loan installment KWD 120.000 deducted');
  assert.deepEqual(loan.title, { ar: 'قرض الوطني', en: 'NBK loan' });
});

test('sms: normalize turns Arabic digits and separators into Latin', () => {
  assert.equal(normalizeSms('١٬٢٥٠٫٥  د.ك'), '1,250.5 د.ك');
  assert.equal(normalizeSms('۱۲'), '12');
});

test('sms: thousands separators and KWD after the number', () => {
  const r = parseSms('NBK loan installment 1,250.750 KWD due 1/12/2026');
  assert.equal(r.amount, 1250.75);
  assert.equal(r.dueDay, 1);
});

test('sms: every built-in sample is understood', () => {
  assert.ok(SAMPLE_MESSAGES.length >= 5);
  for (const text of SAMPLE_MESSAGES) {
    const r = parseSms(text);
    assert.equal(r.ok, true, text);
    assert.ok(r.provider, text);
  }
});
