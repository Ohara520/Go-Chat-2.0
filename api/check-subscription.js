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
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error || !data) {
      return res.status(200).json({ subscribed: false });
    }

    // 检查是否过期
    const now = new Date();
    const periodEnd = new Date(data.period_end);
    if (periodEnd < now || data.status !== 'active') {
      return res.status(200).json({ subscribed: false, expired: true });
    }

    // 剩余条数
    const remaining = Math.max(0, data.monthly_quota - data.used_count);

    return res.status(200).json({
      subscribed: true,
      plan_name: data.plan_name,
      plan_id: data.plan_id,
      monthly_quota: data.monthly_quota,
      used_count: data.used_count,
      remaining,
      memory_limit: data.memory_limit,
      period_end: data.period_end,
    });
  } catch (err) {
    console.error('Check subscription error:', err);
    return res.status(500).json({ error: 'server error' });
  }
}
