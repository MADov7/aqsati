// اقصادي — email reminders: «ذكرني بالإيميل قبل موعد القسط».
// email_reminders { _id: userId, on: boolean, updatedAt, lastTestAt }
// email_sent      { _id: userId + '|' + due.key, at }   one row per installment payment already emailed → never twice
// runDaily() is called once a day by the Vercel Cron (api/cron-reminders.js, 06:00 UTC = 9 AM Kuwait):
// for every user who turned it on, it emails the installments due TOMORROW (Kuwait date) that are not marked paid.
// The due logic is the same pure code the browser notifications use (public/js/logic/notify.js).
import { duesToNotify, notificationFor } from '../public/js/logic/notify.js';
import { InputError, userOwner, isDuplicateKey } from './store.js';
import { mailConfig, sendMail } from './mailer.js';

const SITE_URL = 'https://aqsati-three.vercel.app';
const TEST_COOLDOWN_MS = 60 * 1000;
const KUWAIT_OFFSET_MS = 3 * 60 * 60 * 1000; // Asia/Kuwait is UTC+3 all year (no daylight saving)

/** Today's date in Kuwait as 'YYYY-MM-DD'. */
export const kuwaitToday = (now = new Date()) => new Date(now.getTime() + KUWAIT_OFFSET_MS).toISOString().slice(0, 10);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout(title, rowsHtml, footText) {
  return `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f4f1e8;font-family:Tahoma,Arial,sans-serif;color:#13203a">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#13203a;color:#f4f1e8;border-radius:14px 14px 0 0;padding:18px 20px;font-size:22px;font-weight:700">اقصادي <span style="color:#d4a64a">●</span></div>
<div style="background:#fff;border-radius:0 0 14px 14px;padding:20px">
<h1 style="font-size:19px;margin:0 0 14px">${esc(title)}</h1>
${rowsHtml}
<p style="margin:20px 0 0"><a href="${SITE_URL}/installments" style="display:inline-block;background:#d4a64a;color:#13203a;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:999px">افتح اقصادي</a></p>
<p style="margin:18px 0 0;font-size:12px;color:#6b6f7a">${esc(footText)}</p>
</div>
<p style="text-align:center;font-size:12px;color:#6b6f7a;margin:14px 0 0" dir="ltr">Powered by <b>Dirbeel Innovation Technology</b></p>
</div></body></html>`;
}

/** The reminder email for one user's dues (Kuwaiti Arabic). */
export function reminderEmail(dues) {
  const items = dues.map((d) => notificationFor(d, 'ar'));
  const total = dues.reduce((s, d) => s + d.amount, 0);
  const subject = dues.length === 1
    ? items[0].title
    : `باچر عندك ${dues.length} أقساط بمجموع ${total.toFixed(3)} د.ك — لا تنسى`;
  const rows = items.map((n) => `<div style="border:1px solid #ece6d6;border-radius:10px;padding:12px 14px;margin:0 0 10px">
<div style="font-weight:700">${esc(n.title)}</div><div style="color:#4a5163;margin-top:4px">${esc(n.options.body)}</div></div>`).join('\n');
  const foot = 'وصلك هالإيميل لأنك شغّلت «ذكرني بالإيميل» من صفحة حسابي باقصادي. تقدر تطفيه من نفس المكان.';
  const text = `${subject}\n\n${items.map((n) => `• ${n.title}\n  ${n.options.body}`).join('\n')}\n\n${SITE_URL}/installments\n\n${foot}`;
  return { subject, text, html: layout(subject, rows, foot) };
}

export function testEmail() {
  const subject = 'تذكير اقصادي بالإيميل شغّال ✓';
  const body = 'من الحين بنرسل لك إيميل قبل موعد كل قسط بيوم، إذا ما علّمته «دفعت ✓».';
  const foot = 'هذي رسالة تجربة طلبتها من صفحة حسابي باقصادي.';
  return {
    subject,
    text: `${subject}\n\n${body}\n\n${SITE_URL}\n\n${foot}`,
    html: layout(subject, `<p style="margin:0;line-height:1.8">${esc(body)}</p>`, foot),
  };
}

export function createReminders(db, { store, send = sendMail, config = mailConfig, now = () => new Date() } = {}) {
  const prefs = db.collection('email_reminders');
  const sent = db.collection('email_sent');
  const users = db.collection('users');

  async function get(user) {
    const doc = await prefs.findOne({ _id: user.id });
    return { on: doc?.on === true, configured: !!config(), email: user.email };
  }

  async function set(user, on) {
    if (typeof on !== 'boolean') throw new InputError('invalid value');
    await prefs.updateOne({ _id: user.id }, { $set: { on, updatedAt: now() } }, { upsert: true });
    return get(user);
  }

  async function test(user) {
    if (!config()) throw new InputError('email not configured', 503);
    const doc = await prefs.findOne({ _id: user.id });
    const last = doc?.lastTestAt instanceof Date ? doc.lastTestAt.getTime() : Number(doc?.lastTestAt) || 0;
    if (now().getTime() - last < TEST_COOLDOWN_MS) throw new InputError('too many requests', 429);
    await prefs.updateOne({ _id: user.id }, { $set: { lastTestAt: now() } }, { upsert: true });
    try {
      await send({ to: user.email, ...testEmail() });
    } catch (err) {
      console.error('test email failed:', err?.message);
      throw new InputError('email failed', 502);
    }
    return { ...(await get(user)), sent: true };
  }

  async function forget(userId) {
    await prefs.deleteOne({ _id: userId });
    await sent.deleteMany({ _id: { $regex: `^${String(userId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\|` } }).catch(() => {});
  }

  /** Email everyone whose installments are due tomorrow (Kuwait). Safe to call more than once a day. */
  async function runDaily() {
    const today = kuwaitToday(now());
    const out = { today, configured: !!config(), users: 0, emails: 0, failed: 0 };
    if (!out.configured) return out;
    const list = await prefs.find({ on: true }).toArray();
    for (const pref of list) {
      out.users += 1;
      try {
        const user = await users.findOne({ _id: pref._id });
        if (!user) { await prefs.deleteOne({ _id: pref._id }); continue; } // account deleted
        const state = await store.state(userOwner(user._id));
        const fresh = [];
        for (const due of duesToNotify(state, today, 'before')) {
          try {
            await sent.insertOne({ _id: `${user._id}|${due.key}`, at: now() });
            fresh.push(due);
          } catch (err) {
            if (!isDuplicateKey(err)) throw err; // already emailed
          }
        }
        if (!fresh.length) continue;
        try {
          await send({ to: user.email, ...reminderEmail(fresh) });
          out.emails += 1;
        } catch (err) {
          out.failed += 1;
          console.error('reminder email failed:', err?.message);
          await Promise.all(fresh.map((d) => sent.deleteOne({ _id: `${user._id}|${d.key}` }).catch(() => {})));
        }
      } catch (err) {
        out.failed += 1;
        console.error('reminder run failed for one user:', err?.message);
      }
    }
    return out;
  }

  return { get, set, test, forget, runDaily };
}
