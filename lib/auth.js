// أقساطي — email + password accounts using only node:crypto (no extra packages).
//
// users          { _id: uuid, email (trimmed, lowercased), passwordHash, createdAt }   unique index on email
// sessions       { _id: sha256hex(cookie token), userId, createdAt, expiresAt (+30 days) } TTL index on expiresAt
// login_attempts { _id: 'e:'+email | 'i:'+ip, count, expiresAt (+15 min) }              TTL index on expiresAt
//   Every login/signup attempt is counted atomically ($inc via findOneAndUpdate) BEFORE the password
//   work, and the request is refused when its own position passes the limit — so parallel bursts can't
//   get extra tries. A correct login clears the email counter and gives back its IP attempt.
//
// Passwords: scrypt (N=16384, r=8, p=1, 64-byte key, random 16-byte salt), stored as
//   'scrypt$16384$8$1$<saltB64>$<hashB64>' and checked with timingSafeEqual.
// The cookie holds a random 32-byte token; the database only ever sees its SHA-256, so a leaked
// sessions collection cannot be replayed as cookies. TTL deletion is lazy, so expiresAt is checked in code.
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { InputError } from './store.js';

const scrypt = promisify(scryptCallback);

export const SESSION_COOKIE = 'aqsati_session';
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // seconds (2592000)
const SESSION_TTL_MS = SESSION_MAX_AGE * 1000;
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILS_PER_EMAIL = 8;
export const MAX_FAILS_PER_IP = 30;
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 200;
const MAX_EMAIL = 254;

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const SESSION_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes as base64url

const SCRYPT_COST = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

// Hash of a random password nobody knows: verified when the email has no account, so a login for a
// missing account costs the same scrypt work as one for a real account (no timing hint either way).
const DUMMY_HASH = 'scrypt$16384$8$1$YuxezGMtADb0Y70tDYhdLQ==$zGglkJRh4sNUBJ+s1qUAJbWfUb4OytMZXJqk9Ehj8gAk/pNobEK+xdyEzXnfPPJjA81uL593sNiHUi+kVUJDlA==';

export const sha256hex = (s) => createHash('sha256').update(s).digest('hex');

/** Trimmed + lowercased email, or InputError('invalid email'). */
export function normalizeEmail(value) {
  if (typeof value !== 'string') throw new InputError('invalid email');
  const email = value.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL || CONTROL_RE.test(email) || !EMAIL_RE.test(email)) {
    throw new InputError('invalid email');
  }
  return email;
}

function checkNewPassword(value) {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD || value.length > MAX_PASSWORD) {
    throw new InputError('weak password');
  }
}

export async function hashPassword(password, cost = SCRYPT_COST) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LEN, { N: cost, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM });
  return `scrypt$${cost}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  const okCost = Number.isInteger(N) && N >= 2 && N <= 2 ** 20 && (N & (N - 1)) === 0;
  if (!okCost || !Number.isInteger(r) || r < 1 || r > 32 || !Number.isInteger(p) || p < 1 || p > 16) return false;
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (salt.length < 8 || expected.length < 16 || expected.length > 128) return false;
  const actual = await scrypt(password, salt, expected.length, { N, r, p, maxmem: SCRYPT_MAXMEM });
  return timingSafeEqual(actual, expected);
}

const tooMany = () => new InputError('too many attempts', 429);
const ipKey = (ip) => `i:${String(ip || 'unknown').slice(0, 64)}`;

/**
 * Account + session logic over any MongoDB-like db (the real driver or lib/memorydb.js).
 * `scryptCost` exists only so tests can make bulk signups cheap; production uses the default 16384.
 */
export function createAuth(db, { now = () => new Date(), scryptCost = SCRYPT_COST } = {}) {
  const users = db.collection('users');
  const sessions = db.collection('sessions');
  const attempts = db.collection('login_attempts');
  let dummyHash = scryptCost === SCRYPT_COST ? Promise.resolve(DUMMY_HASH) : null;
  const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(24).toString('base64'), scryptCost));

  const nowMs = () => now().getTime();
  const alive = (doc) => doc != null && new Date(doc.expiresAt).getTime() > nowMs();

  // Counts one attempt in the current 15-minute window and returns this attempt's position in it
  // (1, 2, 3 …). The count is added atomically BEFORE any password work, so a burst of parallel
  // requests cannot all slip past the limit: each one gets its own number from the database.
  async function hit(id) {
    const at = now();
    await attempts.deleteOne({ _id: id, expiresAt: { $lte: at } }); // the old window ended → start fresh
    const opts = { upsert: true, returnDocument: 'after', includeResultMetadata: false };
    let doc;
    try {
      doc = await attempts.findOneAndUpdate(
        { _id: id },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(at.getTime() + ATTEMPT_WINDOW_MS) } },
        opts,
      );
    } catch (err) {
      if (err?.code !== 11000) throw err;
      // A parallel request created the window first — just count this attempt in it.
      doc = await attempts.findOneAndUpdate({ _id: id }, { $inc: { count: 1 } }, { ...opts, upsert: false });
    }
    return Number.isFinite(doc?.count) ? doc.count : Number.MAX_SAFE_INTEGER; // unknown → fail closed
  }

  // A correct login gives its IP attempt back, so real users don't use up the shared IP budget.
  const giveBack = (id) => attempts.updateOne({ _id: id, count: { $gt: 0 } }, { $inc: { count: -1 } });

  async function createSession(userId) {
    const token = randomBytes(32).toString('base64url');
    const at = now();
    await sessions.insertOne({
      _id: sha256hex(token),
      userId,
      createdAt: at,
      expiresAt: new Date(at.getTime() + SESSION_TTL_MS),
    });
    return token;
  }

  /** New account + session. Every signup that passes validation counts toward the per-IP limit. */
  async function signup(email, password, ip) {
    const e = normalizeEmail(email);
    checkNewPassword(password);
    if ((await hit(ipKey(ip))) > MAX_FAILS_PER_IP) throw tooMany();
    if (await users.findOne({ email: e })) throw new InputError('email taken');
    const user = { _id: randomUUID(), email: e, passwordHash: await hashPassword(password, scryptCost), createdAt: now() };
    try {
      await users.insertOne(user);
    } catch (err) {
      if (err?.code === 11000) throw new InputError('email taken'); // lost a race with the unique index
      throw err;
    }
    return { user: { id: user._id, email: e }, token: await createSession(user._id) };
  }

  /** Session for a correct email + password. Failures never say whether the email has an account. */
  async function login(email, password, ip) {
    const e = normalizeEmail(email);
    const emailId = `e:${e}`;
    const ipId = ipKey(ip);
    // Count first, then decide — this attempt already holds its place in both windows.
    const [byEmail, byIp] = await Promise.all([hit(emailId), hit(ipId)]);
    if (byEmail > MAX_FAILS_PER_EMAIL || byIp > MAX_FAILS_PER_IP) throw tooMany();

    const user = await users.findOne({ email: e });
    let ok = false;
    if (typeof password === 'string' && password.length >= 1 && password.length <= MAX_PASSWORD) {
      if (user) ok = await verifyPassword(password, user.passwordHash);
      else await verifyPassword(password, await getDummyHash()); // same work, result ignored
    }
    if (!user || !ok) throw new InputError('invalid credentials'); // already counted above
    await Promise.all([attempts.deleteOne({ _id: emailId }), giveBack(ipId)]);
    return { user: { id: user._id, email: user.email }, token: await createSession(user._id) };
  }

  /** { id, email } for a live session cookie value, else null. */
  async function sessionUser(token) {
    if (typeof token !== 'string' || !SESSION_TOKEN_RE.test(token)) return null;
    const id = sha256hex(token);
    const session = await sessions.findOne({ _id: id });
    if (!session) return null;
    if (!alive(session)) {
      await sessions.deleteOne({ _id: id });
      return null;
    }
    const user = await users.findOne({ _id: session.userId });
    return user ? { id: user._id, email: user.email } : null;
  }

  async function logout(token) {
    if (typeof token !== 'string' || !SESSION_TOKEN_RE.test(token)) return;
    await sessions.deleteOne({ _id: sha256hex(token) });
  }

  return { signup, login, sessionUser, logout };
}
