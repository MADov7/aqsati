// أقساطي local server: serves public/ and POST /api/rpc (the same handler Vercel runs as api/rpc.js).
// Reads MONGODB_URI from the environment or from .env.local when present.
//
//   node server.mjs            → real MongoDB (MONGODB_URI)
//   node server.mjs --memory   → no MongoDB at all: an in-memory database (same as AQSATI_MEMORY_DB=1).
//                                Data and accounts vanish when the server stops. Local development only.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicDir = resolve(root, 'public');

try {
  const text = await readFile(join(root, '.env.local'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch {
  // no .env.local — settings come from the environment
}

if (process.argv.slice(2).includes('--memory')) process.env.AQSATI_MEMORY_DB = '1';

const { default: rpcHandler, isMemoryMode } = await import('./lib/rpc.js');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.statusCode = 400;
    res.end('Bad request');
    return;
  }

  if (pathname === '/api/rpc') {
    await rpcHandler(req, res);
    return;
  }

  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(publicDir, `.${pathname}`);
  if (!file.startsWith(publicDir + sep)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, '0.0.0.0', () => {
  console.log(`أقساطي running on http://localhost:${port}`);
  if (isMemoryMode()) {
    console.warn('WARNING: memory mode — no MongoDB; accounts and installments are kept in RAM and lost on restart.');
  } else if (!process.env.MONGODB_URI) {
    console.warn('MONGODB_URI is not set — /api/rpc will answer 500 config. Use `node server.mjs --memory` to try the app without MongoDB.');
  }
});
