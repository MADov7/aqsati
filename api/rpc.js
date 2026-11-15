// Vercel serverless function → POST /api/rpc. The logic lives in lib/rpc.js (shared with server.mjs):
// session cookie + guest token ownership, email/password auth (lib/auth.js) and the MongoDB store.
export { default } from '../lib/rpc.js';
