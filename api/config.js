// Vercel serverless function: hands the browser the public Supabase settings from
// Environment Variables, so neither value is hard-coded in the repository.
export default function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  res.setHeader('Cache-Control', 'no-store');
  if (!url || !key) {
    res.status(500).json({ error: 'missing_env', need: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'] });
    return;
  }
  res.status(200).json({ url, key });
}
