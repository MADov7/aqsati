// One small JSON endpoint for the page: POST /api/rpc { fn, args }.
//
// The app requires an account. A valid "aqsati_session" cookie (HttpOnly, set here on signup/login) makes the
// account 'u:<userId>' the owner of every data call. Without a session, aqsati_state returns the empty signed-out
// STATE (the public landing page reads it) and every other data call is 400 'not logged in'.
// args.p_token is only used once: on signup/login, data an old guest token still holds is merged into the account.
// Every data/auth call answers with STATE: { profile, installments, payments, user: { email } | null }.
// Account-only calls (auth_change_password, auth_delete_account) need a live session → else 400 'not logged in'.
import {
  createStore, ensureIndexes, getDb, InputError, userOwner,
} from './store.js';
import { createAuth, SESSION_COOKIE, SESSION_MAX_AGE } from './auth.js';
import { createMemoryDb } from './memorydb.js';

const MAX_BODY = 8 * 1024;
const LOGOUT_CLEANUP_MS = 3000;
const DATA_FNS = new Set(['aqsati_state', 'aqsati_save', 'aqsati_add', 'aqsati_update', 'aqsati_remove', 'aqsati_mark_paid']);
const signedOut = () => ({ profile: null, installments: [], payments: [], user: null });

const installmentInput = (a) => ({
  provider: a.p_provider,
  title: a.p_title,
  monthly: a.p_monthly,
  dueDay: a.p_due_day,
  remaining: a.p_remaining,
  firstDue: a.p_first_due,
});

function runData(store, fn, owner, a) {
  switch (fn) {
    case 'aqsati_state': return store.state(owner);
    case 'aqsati_save': return store.save(owner, { salary: a.p_salary, safeLimit: a.p_safe_limit, salaryDay: a.p_salary_day });
    case 'aqsati_add': return store.add(owner, installmentInput(a));
    case 'aqsati_update': return store.update(owner, a.p_id, installmentInput(a));
    case 'aqsati_remove': return store.remove(owner, a.p_id);
    case 'aqsati_mark_paid': return store.markPaid(owner, a.p_id, a.p_month, a.p_paid);
    default: throw new InputError('unknown function');
  }
}

// The signed-in user of this request, or 400 'not logged in' (a dead cookie is cleared on the way out).
async function requireUser(auth, sessionToken, setSession) {
  const user = sessionToken ? await auth.sessionUser(sessionToken) : null;
  if (!user) {
    if (sessionToken) setSession(null);
    throw new InputError('not logged in');
  }
  return user;
}

/**
 * Runs one call. ctx = { store, auth, sessionToken?, ip?, setSession?(token | null) }.
 * setSession(token) asks the HTTP layer to set the cookie; setSession(null) asks it to clear it.
 */
export async function handleRpc(body, ctx = {}) {
  const { store, auth, sessionToken = null, ip = 'unknown', setSession = () => {} } = ctx;
  const { fn, args } = body && typeof body === 'object' ? body : {};
  const a = args && typeof args === 'object' ? args : {};

  if (fn === 'auth_signup' || fn === 'auth_login') {
    const { user, token } = fn === 'auth_signup'
      ? await auth.signup(a.email, a.password, ip)
      : await auth.login(a.email, a.password, ip);
    if (sessionToken) await auth.logout(sessionToken).catch(() => {}); // replace any older session
    setSession(token);
    const owner = userOwner(user.id);
    try {
      await store.mergeGuest(a.p_token, owner);
    } catch (err) {
      // The account works either way; the guest data simply stays where it was.
      console.error('guest merge failed:', err?.name, err?.message);
    }
    await ensureAccountAlive(auth, store, user, owner, setSession);
    return { ...(await store.state(owner)), user: { email: user.email } };
  }

  if (fn === 'auth_logout') {
    // Clear the cookie first: even if the database is down, this browser must be able to sign out.
    setSession(null);
    if (sessionToken) {
      await Promise.resolve()
        .then(() => auth.logout(sessionToken))
        .catch((err) => console.error('logout cleanup failed:', err?.name, err?.message));
    }
    return signedOut();
  }

  if (fn === 'auth_change_password') {
    const user = await requireUser(auth, sessionToken, setSession);
    await auth.changePassword(user.id, sessionToken, a.current_password, a.new_password, ip);
    return { ...(await store.state(userOwner(user.id))), user: { email: user.email } };
  }

  if (fn === 'auth_delete_account') {
    const user = await requireUser(auth, sessionToken, setSession);
    await auth.confirmPassword(user.id, a.password, ip);
    const owner = userOwner(user.id);
    // Sign out every device first so no new request can start writing, then purge the data, delete the
    // user and purge once more for writes that were already in flight. If anything fails half-way the
    // account still exists (signed out) and the user can sign in and retry.
    await auth.revokeSessions(user.id);
    await store.purge(owner);
    await auth.deleteUser(user.id);
    await store.purge(owner);
    setSession(null);
    return signedOut();
  }

  if (!DATA_FNS.has(fn)) throw new InputError('unknown function');
  const user = sessionToken && auth ? await auth.sessionUser(sessionToken) : null;
  if (sessionToken && !user) setSession(null); // expired / logged-out cookie → drop it
  // The app requires an account: a visitor without a session only gets the empty signed-out STATE
  // (the public landing page reads it); every other data call needs login.
  if (!user) {
    if (fn === 'aqsati_state') return signedOut();
    throw new InputError('not logged in');
  }
  const owner = userOwner(user.id);
  const s = await runData(store, fn, owner, a);
  if (fn !== 'aqsati_state') await ensureAccountAlive(auth, store, user, owner, setSession);
  return { ...s, user: { email: user.email } };
}

// A write under 'u:<id>' that raced an account deletion (it passed sessionUser before the delete and landed
// after the final purge) cleans up after itself: the account is gone, so its rows are purged again.
async function ensureAccountAlive(auth, store, user, owner, setSession) {
  if (typeof auth?.userExists !== 'function' || await auth.userExists(user.id)) return;
  await store.purge(owner);
  setSession(null);
  throw new InputError('not logged in');
}

// ---------- HTTP helpers ----------

/** Cookie header → { name: value } (first value wins; malformed parts are skipped). */
export function parseCookies(header) {
  const out = Object.create(null);
  if (typeof header !== 'string' || header.length > 8192) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    if (!name || name in out) continue;
    let value = part.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      value = decodeURIComponent(value);
    } catch {
      // keep the raw value
    }
    out[name] = value;
  }
  return out;
}

/** Set-Cookie value for the session (token) or for clearing it (null). */
export function sessionCookie(token, secure) {
  const base = token
    ? `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`
    : `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
  return secure ? `${base}; Secure` : base;
}

const header = (req, name) => {
  const v = req.headers?.[name];
  return Array.isArray(v) ? v[0] : v;
};

function isSecure(req) {
  const proto = String(header(req, 'x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  return proto === 'https' || Boolean(process.env.VERCEL) || Boolean(req.socket?.encrypted);
}

function clientIp(req) {
  if (process.env.VERCEL) {
    // Vercel's edge sets these itself, so they can be trusted there (not on a bare local server).
    const ip = header(req, 'x-real-ip') || String(header(req, 'x-forwarded-for') || '').split(',')[0];
    if (ip && String(ip).trim()) return String(ip).trim().slice(0, 64);
  }
  return String(req.socket?.remoteAddress || 'unknown').slice(0, 64);
}

const normHost = (h) => String(h || '').split(',')[0].trim().toLowerCase().replace(/:(80|443)$/, '');

/** CSRF guard: a browser that says where the request came from must say "this same site". */
export function isSameOrigin(req) {
  const site = header(req, 'sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = header(req, 'origin');
  if (origin === undefined || origin === '') return true; // non-browser client (curl, tests)
  let originHost;
  try {
    originHost = new URL(origin).host; // 'null' (sandboxed frames) throws → rejected
  } catch {
    return false;
  }
  const expected = normHost(header(req, 'x-forwarded-host') || header(req, 'host'));
  return Boolean(expected) && normHost(originHost) === expected;
}

// fetch() and the page's sendBeacon(Blob type application/json) both send application/json;
// HTML forms cannot, so a cross-site form post never reaches the handler.
function isJson(req) {
  const type = String(header(req, 'content-type') || '').split(';')[0].trim().toLowerCase();
  return type === 'application/json';
}

async function readBody(req) {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8') || '{}');
    return req.body;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buf.length;
    if (size > MAX_BODY) throw new InputError('body too large');
    chunks.push(buf);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

// ---------- database: MongoDB Atlas, or an in-memory stand-in for local dev ----------

export const isMemoryMode = () => /^(1|true|yes|on)$/i.test(String(process.env.AQSATI_MEMORY_DB || '').trim());

let memoryDbPromise = null;

function database() {
  if (!isMemoryMode()) return getDb();
  memoryDbPromise ??= (async () => {
    console.warn('[aqsati] WARNING: memory mode (AQSATI_MEMORY_DB=1) — no MongoDB; all accounts and data live in RAM and vanish on restart. Local development only.');
    const db = createMemoryDb();
    await ensureIndexes(db);
    return db;
  })();
  return memoryDbPromise;
}

/** Node (req, res) handler — used by Vercel (api/rpc.js) and by server.mjs locally. */
export default async function rpcHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (code, body) => {
    res.statusCode = code;
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    send(405, { message: 'method not allowed' });
    return;
  }
  if (!isSameOrigin(req)) {
    send(403, { message: 'bad origin' });
    return;
  }
  if (!isJson(req)) {
    send(415, { message: 'unsupported content type' });
    return;
  }
  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    send(400, { message: err instanceof InputError ? err.message : 'invalid json' });
    return;
  }
  const secure = isSecure(req);
  if (body?.fn === 'auth_logout') {
    // Signing out never depends on the database: the cookie is cleared even with no MONGODB_URI or
    // an unreachable cluster; deleting the server-side session is best effort.
    res.setHeader('Set-Cookie', sessionCookie(null, secure));
    const sessionToken = parseCookies(header(req, 'cookie'))[SESSION_COOKIE];
    if (sessionToken) {
      let timer;
      const cleanup = (async () => createAuth(await database()).logout(sessionToken))()
        .catch((err) => console.error('logout cleanup failed:', err?.name, err?.message));
      const cap = new Promise((resolve) => { timer = setTimeout(resolve, LOGOUT_CLEANUP_MS); });
      await Promise.race([cleanup, cap]); // a slow cluster must not keep the user signed in
      clearTimeout(timer);
    }
    send(200, signedOut());
    return;
  }
  try {
    const db = await database();
    const result = await handleRpc(body, {
      store: createStore(db),
      auth: createAuth(db),
      sessionToken: parseCookies(header(req, 'cookie'))[SESSION_COOKIE] || null,
      ip: clientIp(req),
      setSession: (token) => res.setHeader('Set-Cookie', sessionCookie(token, secure)),
    });
    send(200, result);
  } catch (err) {
    if (err instanceof InputError) send(err.status || 400, { message: err.message });
    else if (err?.code === 'missing_env') send(500, { message: 'config' });
    else {
      console.error('rpc error:', err?.name, err?.message);
      send(503, { message: 'db_unavailable' });
    }
  }
}
