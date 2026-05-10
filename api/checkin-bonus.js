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
      // 没有订阅记录 → 往 topup_logs 插一条免费签到奖励
      try {
        await supabase.from('topup_logs').insert({
          email: email.toLowerCase().trim(),
          plan_name: '签到奖励',
          quota_added: bonus,
          note: 'checkin_bonus',
          created_at: new Date().toISOString(),
        });
        return res.status(200).json({ ok: true, remaining: bonus });
      } catch(e) {
        return res.status(200).json({ ok: false, reason: 'insert_failed' });
      }
    }

    // 注意：不再拦截过期用户，签到奖励对所有有订阅记录的用户都生效
    // 原因：套餐过期时加条数，用户才有动力续费继续聊

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
