// اقصادي — sends one email, with no extra packages.
// Configure ONE of these in the environment (Vercel → Settings → Environment Variables); never commit them:
//   SMTP_USER + SMTP_PASS (+ SMTP_HOST, default smtp.gmail.com; SMTP_PORT, default 465 implicit TLS)
//       e.g. a Gmail address + a Gmail "App password" — reaches any inbox.
//   RESEND_API_KEY (+ MAIL_FROM with a domain verified at resend.com) — HTTPS API.
// MAIL_FROM is optional for SMTP (defaults to SMTP_USER). Without any of them mailConfig() is null and no mail is sent.
import tls from 'node:tls';
import { randomUUID } from 'node:crypto';

const CRLF = '\r\n';
const TIMEOUT_MS = 15000;
const LINE_BREAK_RE = /[\r\n]/;

/** The mail transport the environment describes, or null when email is not set up. */
export function mailConfig(env = process.env) {
  const user = String(env.SMTP_USER || '').trim();
  const pass = String(env.SMTP_PASS || '').replace(/\s+/g, ''); // Gmail shows app passwords in groups of four
  if (user && pass) {
    return {
      kind: 'smtp',
      host: String(env.SMTP_HOST || 'smtp.gmail.com').trim(),
      port: Number(env.SMTP_PORT) || 465,
      user,
      pass,
      from: String(env.MAIL_FROM || '').trim() || `اقصادي <${user}>`,
    };
  }
  const key = String(env.RESEND_API_KEY || '').trim();
  if (key) return { kind: 'resend', key, from: String(env.MAIL_FROM || '').trim() || 'اقصادي <onboarding@resend.dev>' };
  return null;
}

const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
const wrap76 = (s) => s.replace(/.{1,76}/g, (m) => m + CRLF);
const encodeWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

/** 'Name <a@b.c>' | 'a@b.c' → { name, address } */
export function parseAddress(from) {
  const m = /^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(from);
  return m ? { name: m[1].replace(/^"|"$/g, ''), address: m[2] } : { name: '', address: String(from).trim() };
}

function checkHeaderSafe(...values) {
  for (const v of values) if (LINE_BREAK_RE.test(String(v))) throw new Error('mail header contains a line break');
}

/** RFC 5322 message (multipart/alternative: text + html, both base64). */
export function buildMessage({ from, to, subject, text, html }) {
  checkHeaderSafe(from, to, subject);
  const sender = parseAddress(from);
  const boundary = `aqsadi-${randomUUID()}`;
  const fromHeader = sender.name ? `${encodeWord(sender.name)} <${sender.address}>` : sender.address;
  const domain = sender.address.split('@')[1] || 'aqsati.local';
  return [
    `From: ${fromHeader}`,
    `To: <${to}>`,
    `Subject: ${encodeWord(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64(text)),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64(html)),
    `--${boundary}--`,
    '',
  ].join(CRLF);
}

function smtpSend(cfg, mail) {
  const message = buildMessage({ ...mail, from: cfg.from });
  const fromAddr = parseAddress(cfg.from).address;
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      if (err) reject(err); else resolve();
    };
    const sock = tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host, ...(cfg.ca ? { ca: cfg.ca } : {}) }); // ca: tests only
    sock.setTimeout(TIMEOUT_MS, () => done(new Error('smtp timeout')));
    sock.on('error', (err) => done(err));
    let buf = '';
    const waiting = [];
    const pump = () => {
      while (waiting.length) {
        const lines = buf.split(CRLF);
        const complete = lines.slice(0, -1); // the last piece has no CRLF yet
        const idx = complete.findIndex((l) => /^\d{3}(?: |$)/.test(l));
        if (idx < 0) return;
        buf = lines.slice(idx + 1).join(CRLF);
        waiting.shift()(Number(complete[idx].slice(0, 3)), complete[idx]);
      }
    };
    sock.on('data', (d) => { buf += d.toString('utf8'); pump(); });
    const expect = (ok) => new Promise((res, rej) => {
      waiting.push((code, line) => (ok.includes(code) ? res(code) : rej(new Error(`smtp ${code}: ${line.slice(0, 160)}`))));
      pump();
    });
    const cmd = (line, ok) => { sock.write(line + CRLF); return expect(ok); };
    (async () => {
      await expect([220]);
      await cmd('EHLO aqsati', [250]);
      await cmd('AUTH LOGIN', [334]);
      await cmd(b64(cfg.user), [334]);
      await cmd(b64(cfg.pass), [235]);
      await cmd(`MAIL FROM:<${fromAddr}>`, [250]);
      await cmd(`RCPT TO:<${mail.to}>`, [250, 251]);
      await cmd('DATA', [354]);
      sock.write(message + CRLF + '.' + CRLF); // base64 bodies never start a line with '.'
      await expect([250]);
      sock.write('QUIT' + CRLF);
    })().then(() => done(), done);
  });
}

async function resendSend(cfg, mail, fetchImpl = globalThis.fetch) {
  checkHeaderSafe(cfg.from, mail.to, mail.subject);
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: cfg.from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}`);
}

/** Send { to, subject, text, html } with the configured transport. Throws when not configured or on failure. */
export async function sendMail(mail, cfg = mailConfig()) {
  if (!cfg) throw new Error('mail not configured');
  if (typeof mail?.to !== 'string' || !/^[^\s@<>]+@[^\s@<>]+$/.test(mail.to)) throw new Error('bad recipient');
  if (cfg.kind === 'smtp') return smtpSend(cfg, mail);
  return resendSend(cfg, mail);
}
