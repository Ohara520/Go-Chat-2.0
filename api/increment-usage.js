import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  try {
    // 先查当前用量
    const { data, error } = await supabase
      .from('subscriptions')
      .select('used_count, monthly_quota, status, period_end, total_used')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error || !data) {
      return res.status(200).json({ ok: false, reason: 'no_subscription' });
    }

    // 检查过期
    if (new Date(data.period_end) < new Date() || data.status !== 'active') {
      return res.status(200).json({ ok: false, reason: 'expired' });
    }

    // 检查额度
    if (data.used_count >= data.monthly_quota) {
      return res.status(200).json({ ok: false, reason: 'quota_exceeded', remaining: 0 });
    }

    // 扣减一条
    await supabase
      .from('subscriptions')
      .update({
        used_count: data.used_count + 1,
        total_used: (data.total_used || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('email', email.toLowerCase().trim());

    return res.status(200).json({
      ok: true,
      remaining: data.monthly_quota - data.used_count - 1,
    });
  } catch (err) {
    console.error('Increment usage error:', err);
    return res.status(500).json({ error: 'server error' });
  }
}
