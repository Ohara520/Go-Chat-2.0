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

  const cleanEmail = email.toLowerCase().trim();

  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('used_count, monthly_quota, status, period_end')
      .eq('email', cleanEmail)
      .single();

    if (error || !data) {
      // 没有订阅记录 → 插入一条免费记录，给予 bonus 条数作为初始额度
      try {
        await supabase.from('subscriptions').insert({
          email: cleanEmail,
          monthly_quota: bonus,
          used_count: 0,
          status: 'free',
          updated_at: new Date().toISOString(),
        });
        return res.status(200).json({ ok: true, remaining: bonus });
      } catch(e) {
        return res.status(200).json({ ok: false, reason: 'insert_failed' });
      }
    }

    // 直接增加 monthly_quota（总额度），无论 used_count 是多少都能生效
    const newQuota = data.monthly_quota + bonus;
    await supabase
      .from('subscriptions')
      .update({
        monthly_quota: newQuota,
        updated_at: new Date().toISOString(),
      })
      .eq('email', cleanEmail);

    const remaining = newQuota - data.used_count;
    return res.status(200).json({ ok: true, remaining });
  } catch (err) {
    console.error('Checkin bonus error:', err);
    return res.status(200).json({ ok: false, reason: 'server_error' });
  }
}
