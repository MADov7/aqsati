// Vercel Cron → GET /api/cron-reminders once a day (vercel.json "crons"): emails tomorrow's installment reminders.
export { cronRemindersHandler as default } from '../lib/rpc.js';
