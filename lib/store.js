// أقساطي — data layer on MongoDB. Pure logic lives in createStore(db) so it can be tested with the
// in-memory stand-in (lib/memorydb.js); getDb() opens the real Atlas connection (cached across invocations).
//
// Every document belongs to an "owner key":
//   - a guest: the random uuid v4 the browser keeps in localStorage (sent as args.p_token), or
//   - an account: 'u:' + the user's uuid (resolved by lib/rpc.js from the session cookie, never from args).
// installments.token, payments.token and profiles._id hold that key, so data saved before accounts existed stays valid.
//
// Collections:
//   profiles     { _id: owner, salary, safeLimit, salaryDay: 1..31 | null, createdAt, updatedAt }
//   installments { _id: uuid, token: owner, provider, title, monthlyAmount, dueDay, remainingCount, firstDueDate, createdAt }
//   payments     { _id: '<owner>|<installmentId>|<YYYY-MM>', token: owner, installmentId, month, paidAt }
//                One row = "this installment is paid for this month". The _id makes marking idempotent.
import { randomUUID } from 'node:crypto';
import {
  validateInstallmentInput, validateProfileInput, parseISO, parseWhole, daysBetween, todayISO,
} from '../public/calc.js';

export const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const OWNER_RE = /^(u:)?[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const MAX_ACTIVE = 50;
/** A payment can be marked for a month from 24 months back up to 1 month ahead; STATE lists the same span. */
export const PAYMENT_MONTHS_BACK = 24;
export const PAYMENT_MONTHS_AHEAD = 1;

/** A client mistake → HTTP 400 (or the given status, e.g. 429) with { message }. */
export class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'InputError';
    this.status = status;
  }
}

/** A browser guest token (uuid v4). Account keys ('u:…') are NOT guest tokens. */
export const isGuestToken = (t) => typeof t === 'string' && TOKEN_RE.test(t);

/** Owner key of an account. */
export const userOwner = (userId) => `u:${String(userId).toLowerCase()}`;

/** E11000 from insertOne/updateOne, or a bulk insert whose every failure is a duplicate key. */
export const isDuplicateKey = (err) => err?.code === 11000
  || (Array.isArray(err?.writeErrors) && err.writeErrors.length > 0 && err.writeErrors.every((e) => e?.code === 11000));

function checkOwner(owner) {
  if (typeof owner !== 'string' || !OWNER_RE.test(owner)) throw new InputError('token required');
  return owner.toLowerCase();
}

function checkId(id) {
  if (typeof id !== 'string' || !TOKEN_RE.test(id)) throw new InputError('token and id required');
  return id.toLowerCase();
}

const isScalar = (x) => typeof x === 'string' || typeof x === 'number';

function isRealDate(iso) {
  if (typeof iso !== 'string' || !ISO_RE.test(iso)) return false;
  const { y, m, d } = parseISO(iso);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Months as one integer (year * 12 + month - 1) so "24 months back" is plain subtraction.
const monthIndex = (y, m) => y * 12 + (m - 1);
const monthKey = (idx) => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
// The app's calendar is Kuwait's (Asia/Kuwait = UTC+3, no DST), whatever time zone the server runs in
// (UTC on Vercel), so "this month" here matches the month the user sees in the page.
const APP_TZ_OFFSET_MS = 3 * 60 * 60 * 1000;
function currentMonthIndex(date) {
  const k = new Date(date.getTime() + APP_TZ_OFFSET_MS);
  return monthIndex(k.getUTCFullYear(), k.getUTCMonth() + 1);
}

/**
 * Salary day from the client: undefined → "not sent" (keep what is stored); null or '' → cleared;
 * a whole number 1..31 (number or digit string, Arabic digits too) → that day. Anything else is refused.
 */
function parseSalaryDay(value) {
  if (value === undefined) return undefined;
  if (value === null || (typeof value === 'string' && value.trim() === '')) return null;
  if (!isScalar(value)) throw new InputError('invalid salary day');
  const day = parseWhole(value);
  if (!(day >= 1 && day <= 31)) throw new InputError('invalid salary day');
  return day;
}

const toProfile = (p) => (p
  ? { salary: p.salary, safe_limit: p.safeLimit, salary_day: Number.isInteger(p.salaryDay) ? p.salaryDay : null }
  : null);
const isoOrRaw = (v) => (v instanceof Date ? v.toISOString() : v);
const toInstallment = (i) => ({
  id: i._id,
  provider: i.provider,
  title: i.title,
  monthly_amount: i.monthlyAmount,
  due_day: i.dueDay,
  remaining_count: i.remainingCount,
  first_due_date: i.firstDueDate,
  created_at: isoOrRaw(i.createdAt),
});
const toPayment = (p) => ({ installment_id: p.installmentId, month: p.month, paid_at: isoOrRaw(p.paidAt) });
const paymentId = (owner, installmentId, month) => `${owner}|${installmentId}|${month}`;

export function createStore(db, { now = () => new Date() } = {}) {
  const profiles = db.collection('profiles');
  const installments = db.collection('installments');
  const payments = db.collection('payments');

  /** STATE without the user: { profile, installments, payments (last 24 months, rows of my installments only) }. */
  async function state(owner) {
    const t = checkOwner(owner);
    const since = monthKey(currentMonthIndex(now()) - PAYMENT_MONTHS_BACK);
    const [profile, list, paid] = await Promise.all([
      profiles.findOne({ _id: t }),
      installments.find({ token: t }).sort({ createdAt: 1, _id: 1 }).toArray(),
      payments.find({ token: t, month: { $gte: since } }).sort({ month: 1, installmentId: 1 }).toArray(),
    ]);
    // A row whose installment is gone (only possible after a half-finished remove/merge) is never shown.
    const mine = new Set(list.map((i) => i._id));
    return {
      profile: toProfile(profile),
      installments: list.map(toInstallment),
      payments: paid.filter((p) => mine.has(p.installmentId)).map(toPayment),
    };
  }

  async function save(owner, { salary, safeLimit, salaryDay } = {}) {
    const t = checkOwner(owner);
    if (!isScalar(salary) || !isScalar(safeLimit)) throw new InputError('invalid salary');
    const v = validateProfileInput({ salary: String(salary), limit: String(safeLimit) });
    if (!v.ok) throw new InputError(v.errors.salary ? 'invalid salary' : 'invalid safe limit');
    const day = parseSalaryDay(salaryDay);
    const at = now();
    const set = { salary: v.value.salary, safeLimit: v.value.limit, updatedAt: at };
    if (day !== undefined) set.salaryDay = day;
    await profiles.updateOne({ _id: t }, { $set: set, $setOnInsert: { createdAt: at } }, { upsert: true });
    return state(t);
  }

  // Shared validation for add and update → the stored fields. `keepFirstDue` is the stored first due date of
  // the installment being edited: sending it back unchanged keeps the schedule (no -2..62 day window check).
  function parseInstallment(input, keepFirstDue) {
    if (!input || typeof input.provider !== 'string' || (input.title != null && typeof input.title !== 'string')
        || ![input.monthly, input.dueDay, input.remaining].every(isScalar)) {
      throw new InputError('invalid input');
    }
    const v = validateInstallmentInput({
      provider: input.provider,
      title: input.title,
      monthly: String(input.monthly),
      dueDay: String(input.dueDay),
      remaining: String(input.remaining),
    });
    if (!v.ok) throw new InputError(`invalid ${Object.keys(v.errors)[0]}`);
    const first = input.firstDue;
    const kept = keepFirstDue != null && first === keepFirstDue && isRealDate(first);
    const offset = isRealDate(first) ? daysBetween(todayISO(now()), first) : NaN;
    if (!kept && !(offset >= -2 && offset <= 62)) throw new InputError('invalid first due date');
    return {
      provider: v.value.provider,
      title: v.value.title,
      monthlyAmount: v.value.monthly,
      dueDay: v.value.dueDay,
      remainingCount: v.value.remaining,
      firstDueDate: first,
    };
  }

  async function add(owner, input) {
    const t = checkOwner(owner);
    const fields = parseInstallment(input);
    if ((await installments.countDocuments({ token: t })) >= MAX_ACTIVE) throw new InputError('too many installments');
    await installments.insertOne({ _id: randomUUID(), token: t, ...fields, createdAt: now() });
    return state(t);
  }

  async function update(owner, id, input) {
    const t = checkOwner(owner);
    const iid = checkId(id);
    const current = await installments.findOne({ _id: iid, token: t });
    const fields = parseInstallment(input, current?.firstDueDate);
    await installments.updateOne({ _id: iid, token: t }, { $set: { ...fields, updatedAt: now() } });
    return state(t);
  }

  /** Removes my installment and every payment mark it had (another owner's id changes nothing). */
  async function remove(owner, id) {
    const t = checkOwner(owner);
    const iid = checkId(id);
    await installments.deleteOne({ _id: iid, token: t });
    // Owner-scoped, so it can only ever touch my rows; also sweeps rows left by an earlier half-finished remove.
    await payments.deleteMany({ token: t, installmentId: iid });
    return state(t);
  }

  function parseMonth(month) {
    const m = typeof month === 'string' ? MONTH_RE.exec(month) : null;
    if (!m) throw new InputError('invalid month');
    const idx = monthIndex(Number(m[1]), Number(m[2]));
    const cur = currentMonthIndex(now());
    if (idx < cur - PAYMENT_MONTHS_BACK || idx > cur + PAYMENT_MONTHS_AHEAD) throw new InputError('invalid month');
    return month;
  }

  /**
   * Marks (paid = true) or unmarks (paid = false) one installment as paid for one month 'YYYY-MM'.
   * Idempotent: marking twice keeps the first paidAt; unmarking a month that isn't marked is fine.
   * An id that is not one of MY installments changes nothing (same as update/remove) — the answer is my STATE.
   */
  async function markPaid(owner, id, month, paid) {
    const t = checkOwner(owner);
    const iid = checkId(id);
    const m = parseMonth(month);
    if (typeof paid !== 'boolean') throw new InputError('invalid paid');
    if (await installments.findOne({ _id: iid, token: t })) {
      const _id = paymentId(t, iid, m);
      if (paid) {
        try {
          await payments.updateOne(
            { _id },
            { $set: { token: t, installmentId: iid, month: m }, $setOnInsert: { paidAt: now() } },
            { upsert: true },
          );
        } catch (err) {
          if (!isDuplicateKey(err)) throw err; // a parallel mark inserted the same row first — that's the goal
        }
        // A parallel remove may have deleted the installment after the check above: drop the orphan row.
        if (!(await installments.findOne({ _id: iid, token: t }))) await payments.deleteOne({ _id, token: t });
      } else {
        await payments.deleteOne({ _id, token: t });
      }
    }
    return state(t);
  }

  // Copies the payment rows of the given installments from one owner to another (new _id per owner).
  // Rows the target already has are skipped, so running it twice is harmless. Returns how many rows apply.
  async function copyPayments(from, to, installmentIds) {
    const rows = await payments.find({ token: from, installmentId: { $in: installmentIds } }).toArray();
    if (!rows.length) return 0;
    const docs = rows.map((p) => ({
      _id: paymentId(to, p.installmentId, p.month),
      token: to,
      installmentId: p.installmentId,
      month: p.month,
      paidAt: p.paidAt,
    }));
    const have = new Set((await payments.find({ _id: { $in: docs.map((d) => d._id) } }).toArray()).map((d) => d._id));
    const fresh = docs.filter((d) => !have.has(d._id));
    if (fresh.length) {
      try {
        await payments.insertMany(fresh, { ordered: false });
      } catch (err) {
        if (!isDuplicateKey(err)) throw err; // a parallel merge copied some of them first — same rows
      }
    }
    return docs.length;
  }

  // After signup/login: move the browser's guest data into the account.
  // Installments move oldest first, only as many as fit under MAX_ACTIVE, and their payment marks move with
  // them; the guest profile moves only when the account has none. Whatever moves is gone from the guest key.
  // Never throws for a bad guest token. Payments are copied BEFORE the installments move and deleted after,
  // so a failure half-way never loses a mark (STATE hides rows whose installment isn't there).
  async function mergeGuest(guestToken, owner) {
    const o = checkOwner(owner);
    const result = { installments: 0, payments: 0, profile: false };
    if (!o.startsWith('u:') || !isGuestToken(guestToken)) return result;
    const g = guestToken.toLowerCase();

    const guestList = await installments.find({ token: g }).sort({ createdAt: 1, _id: 1 }).toArray();
    if (guestList.length) {
      const room = Math.max(0, MAX_ACTIVE - (await installments.countDocuments({ token: o })));
      const ids = guestList.slice(0, room).map((i) => i._id);
      if (ids.length) {
        result.payments = await copyPayments(g, o, ids);
        const r = await installments.updateMany({ _id: { $in: ids }, token: g }, { $set: { token: o, updatedAt: now() } });
        result.installments = r?.modifiedCount ?? ids.length;
        if (result.payments) await payments.deleteMany({ token: g, installmentId: { $in: ids } });
      }
    }

    const guestProfile = await profiles.findOne({ _id: g });
    if (guestProfile && !(await profiles.findOne({ _id: o }))) {
      const at = now();
      // $setOnInsert: if the account got a profile in the meantime, keep it (and keep the guest one too).
      const r = await profiles.updateOne(
        { _id: o },
        {
          $setOnInsert: {
            salary: guestProfile.salary,
            safeLimit: guestProfile.safeLimit,
            salaryDay: Number.isInteger(guestProfile.salaryDay) ? guestProfile.salaryDay : null,
            createdAt: guestProfile.createdAt ?? at,
            updatedAt: at,
          },
        },
        { upsert: true },
      );
      if (!r || r.upsertedCount !== 0) {
        await profiles.deleteOne({ _id: g });
        result.profile = true;
      }
    }
    return result;
  }

  /** Deletes every document of one owner (profile, installments, payments) — used by account deletion. */
  async function purge(owner) {
    const t = checkOwner(owner);
    await Promise.all([
      installments.deleteMany({ token: t }),
      payments.deleteMany({ token: t }),
      profiles.deleteOne({ _id: t }),
    ]);
  }

  return { state, save, add, update, remove, markPaid, mergeGuest, purge };
}

/** Every index the app relies on (idempotent). Used by getDb() and by the in-memory dev database. */
export async function ensureIndexes(db) {
  await Promise.all([
    db.collection('installments').createIndex({ token: 1, createdAt: 1 }),
    db.collection('payments').createIndex({ token: 1, month: 1 }),
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    // TTL deletion is lazy (about once a minute) — auth.js always checks expiresAt in code too.
    db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('sessions').createIndex({ userId: 1 }), // "sign out my other devices" / account deletion
    db.collection('login_attempts').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

// ---------- real MongoDB connection ----------

let clientPromise = null;
let indexesReady = null;

export async function getDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    const err = new Error('missing_env');
    err.code = 'missing_env';
    throw err;
  }
  // Assigned synchronously so concurrent cold-start requests share ONE client (no leaked connections).
  if (!clientPromise) {
    const pending = import('mongodb')
      .then(({ MongoClient }) =>
        new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000, appName: 'aqsati' }).connect())
      .catch((err) => {
        if (clientPromise === pending) clientPromise = null;
        throw err;
      });
    clientPromise = pending;
  }
  const client = await clientPromise;
  const db = client.db(process.env.MONGODB_DB || 'aqsati');
  // A failed index build is logged and retried on the next request (signup also pre-checks the email).
  indexesReady ??= ensureIndexes(db).catch((err) => {
    console.error('index setup failed:', err?.name, err?.message);
    indexesReady = null;
  });
  await indexesReady;
  return db;
}
