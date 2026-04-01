import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, bonus } = req.body;
  if (!email || !bonus || bonus <= 0) {
    return res.status(400).json({ error: 'email and bonus required' });
  }

  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('used_count, monthly_quota, status, period_end')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error || !data) {
      return res.status(200).json({ ok: false, reason: 'no_subscription' });
    }

    if (new Date(data.period_end) < new Date() || data.status !== 'active') {
      return res.status(200).json({ ok: false, reason: 'expired' });
    }

    // 减少 used_count（相当于退还条数），最小为0
    const newUsed = Math.max(0, data.used_count - bonus);
    await supabase
      .from('subscriptions')
      .update({
        used_count: newUsed,
        updated_at: new Date().toISOString(),
      })
      .eq('email', email.toLowerCase().trim());

    const remaining = data.monthly_quota - newUsed;
    return res.status(200).json({ ok: true, remaining });
  } catch (err) {
    console.error('Checkin bonus error:', err);
    return res.status(200).json({ ok: false, reason: 'server_error' });
  }
}
