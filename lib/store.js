// أقساطي — data layer on MongoDB. Pure logic lives in createStore(db) so it can be tested with the
// in-memory stand-in (lib/memorydb.js); getDb() opens the real Atlas connection (cached across invocations).
//
// Every document belongs to an "owner key":
//   - a guest: the random uuid v4 the browser keeps in localStorage (sent as args.p_token), or
//   - an account: 'u:' + the user's uuid (resolved by lib/rpc.js from the session cookie, never from args).
// installments.token and profiles._id hold that key, so data saved before accounts existed stays valid.
import { randomUUID } from 'node:crypto';
import {
  validateInstallmentInput, validateProfileInput, parseISO, daysBetween, todayISO,
} from '../public/calc.js';

export const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const OWNER_RE = /^(u:)?[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_ACTIVE = 50;

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

function checkOwner(owner) {
  if (typeof owner !== 'string' || !OWNER_RE.test(owner)) throw new InputError('token required');
  return owner.toLowerCase();
}

function isRealDate(iso) {
  if (typeof iso !== 'string' || !ISO_RE.test(iso)) return false;
  const { y, m, d } = parseISO(iso);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const toProfile = (p) => (p ? { salary: p.salary, safe_limit: p.safeLimit } : null);
const toInstallment = (i) => ({
  id: i._id,
  provider: i.provider,
  title: i.title,
  monthly_amount: i.monthlyAmount,
  due_day: i.dueDay,
  remaining_count: i.remainingCount,
  first_due_date: i.firstDueDate,
  created_at: i.createdAt instanceof Date ? i.createdAt.toISOString() : i.createdAt,
});

export function createStore(db, { now = () => new Date() } = {}) {
  const profiles = db.collection('profiles');
  const installments = db.collection('installments');

  async function state(owner) {
    const t = checkOwner(owner);
    const [profile, list] = await Promise.all([
      profiles.findOne({ _id: t }),
      installments.find({ token: t }).sort({ createdAt: 1, _id: 1 }).toArray(),
    ]);
    return { profile: toProfile(profile), installments: list.map(toInstallment) };
  }

  async function save(owner, { salary, safeLimit }) {
    const t = checkOwner(owner);
    const scalar = (x) => typeof x === 'string' || typeof x === 'number';
    if (!scalar(salary) || !scalar(safeLimit)) throw new InputError('invalid salary');
    const v = validateProfileInput({ salary: String(salary), limit: String(safeLimit) });
    if (!v.ok) throw new InputError(v.errors.salary ? 'invalid salary' : 'invalid safe limit');
    const at = now();
    await profiles.updateOne(
      { _id: t },
      { $set: { salary: v.value.salary, safeLimit: v.value.limit, updatedAt: at }, $setOnInsert: { createdAt: at } },
      { upsert: true },
    );
    return state(t);
  }

  // Shared validation for add and update → the stored fields.
  function parseInstallment(input) {
    const scalar = (x) => typeof x === 'string' || typeof x === 'number';
    if (!input || typeof input.provider !== 'string' || (input.title != null && typeof input.title !== 'string')
        || ![input.monthly, input.dueDay, input.remaining].every(scalar)) {
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
    const offset = isRealDate(first) ? daysBetween(todayISO(now()), first) : NaN;
    if (!(offset >= -2 && offset <= 62)) throw new InputError('invalid first due date');
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
    if (typeof id !== 'string' || !TOKEN_RE.test(id)) throw new InputError('token and id required');
    const fields = parseInstallment(input);
    await installments.updateOne({ _id: id.toLowerCase(), token: t }, { $set: { ...fields, updatedAt: now() } });
    return state(t);
  }

  async function remove(owner, id) {
    const t = checkOwner(owner);
    if (typeof id !== 'string' || !TOKEN_RE.test(id)) throw new InputError('token and id required');
    await installments.deleteOne({ _id: id.toLowerCase(), token: t });
    return state(t);
  }

  // After signup/login: move the browser's guest data into the account.
  // Installments move oldest first, only as many as fit under MAX_ACTIVE; the guest profile moves only
  // when the account has none. Whatever moves is gone from the guest key. Never throws for a bad guest token.
  async function mergeGuest(guestToken, owner) {
    const o = checkOwner(owner);
    const result = { installments: 0, profile: false };
    if (!o.startsWith('u:') || !isGuestToken(guestToken)) return result;
    const g = guestToken.toLowerCase();

    const guestList = await installments.find({ token: g }).sort({ createdAt: 1, _id: 1 }).toArray();
    if (guestList.length) {
      const room = Math.max(0, MAX_ACTIVE - (await installments.countDocuments({ token: o })));
      const ids = guestList.slice(0, room).map((i) => i._id);
      if (ids.length) {
        const r = await installments.updateMany({ _id: { $in: ids }, token: g }, { $set: { token: o, updatedAt: now() } });
        result.installments = r?.modifiedCount ?? ids.length;
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

  return { state, save, add, update, remove, mergeGuest };
}

/** Every index the app relies on (idempotent). Used by getDb() and by the in-memory dev database. */
export async function ensureIndexes(db) {
  await Promise.all([
    db.collection('installments').createIndex({ token: 1, createdAt: 1 }),
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    // TTL deletion is lazy (about once a minute) — auth.js always checks expiresAt in code too.
    db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
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
