// أقساطي — data layer on MongoDB. Pure logic lives in createStore(db) so it can be tested with an
// in-memory fake; getDb() opens the real Atlas connection (cached across serverless invocations).
import { randomUUID } from 'node:crypto';
import {
  validateInstallmentInput, validateProfileInput, parseISO, daysBetween, todayISO,
} from '../public/calc.js';

export const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ACTIVE = 50;

export class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InputError';
  }
}

function checkToken(token) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw new InputError('token required');
  return token.toLowerCase();
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

  async function state(token) {
    const t = checkToken(token);
    const [profile, list] = await Promise.all([
      profiles.findOne({ _id: t }),
      installments.find({ token: t }).sort({ createdAt: 1, _id: 1 }).toArray(),
    ]);
    return { profile: toProfile(profile), installments: list.map(toInstallment) };
  }

  async function save(token, { salary, safeLimit }) {
    const t = checkToken(token);
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

  async function add(token, input) {
    const t = checkToken(token);
    const scalar = (x) => typeof x === 'string' || typeof x === 'number';
    if (typeof input.provider !== 'string' || (input.title != null && typeof input.title !== 'string')
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
    if ((await installments.countDocuments({ token: t })) >= MAX_ACTIVE) throw new InputError('too many installments');
    await installments.insertOne({
      _id: randomUUID(),
      token: t,
      provider: v.value.provider,
      title: v.value.title,
      monthlyAmount: v.value.monthly,
      dueDay: v.value.dueDay,
      remainingCount: v.value.remaining,
      firstDueDate: first,
      createdAt: now(),
    });
    return state(t);
  }

  async function remove(token, id) {
    const t = checkToken(token);
    if (typeof id !== 'string' || !TOKEN_RE.test(id)) throw new InputError('token and id required');
    await installments.deleteOne({ _id: id.toLowerCase(), token: t });
    return state(t);
  }

  return { state, save, add, remove };
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
  indexesReady ??= db.collection('installments').createIndex({ token: 1, createdAt: 1 }).catch(() => {
    indexesReady = null;
  });
  await indexesReady;
  return db;
}
