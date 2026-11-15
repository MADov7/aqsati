// One small JSON endpoint for the page: POST /api/rpc { fn, args }.
// Same function names the page already used, so the browser code barely changed.
import { createStore, getDb, InputError } from './store.js';

const MAX_BODY = 8 * 1024;

export async function handleRpc(body, store) {
  const { fn, args } = body && typeof body === 'object' ? body : {};
  const a = args && typeof args === 'object' ? args : {};
  switch (fn) {
    case 'aqsati_state':
      return store.state(a.p_token);
    case 'aqsati_save':
      return store.save(a.p_token, { salary: a.p_salary, safeLimit: a.p_safe_limit });
    case 'aqsati_add':
      return store.add(a.p_token, {
        provider: a.p_provider,
        title: a.p_title,
        monthly: a.p_monthly,
        dueDay: a.p_due_day,
        remaining: a.p_remaining,
        firstDue: a.p_first_due,
      });
    case 'aqsati_remove':
      return store.remove(a.p_token, a.p_id);
    default:
      throw new InputError('unknown function');
  }
}

async function readBody(req) {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8') || '{}');
    return req.body;
  }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw new InputError('body too large');
  }
  return JSON.parse(raw || '{}');
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
  let body;
  try {
    body = await readBody(req);
  } catch {
    send(400, { message: 'invalid json' });
    return;
  }
  try {
    const store = createStore(await getDb());
    send(200, await handleRpc(body, store));
  } catch (err) {
    if (err instanceof InputError) send(400, { message: err.message });
    else if (err?.code === 'missing_env') send(500, { message: 'config' });
    else {
      console.error('rpc error:', err?.name, err?.message);
      send(503, { message: 'db_unavailable' });
    }
  }
}
