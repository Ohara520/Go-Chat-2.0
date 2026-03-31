import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    db: { schema: 'public' },
    global: { fetch: (url, options) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000); // 8秒超时
      return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timeout));
    }}
  }
);

const FREE_QUOTA = 100;

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

    // 没有记录 → 自动创建免费套餐
    if (error || !data) {
      const periodEnd = new Date();
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      const { data: newData, error: insertError } = await supabase
        .from('subscriptions')
        .insert({
          email: email.toLowerCase().trim(),
          plan_id: 'free',
          plan_name: '免费体验',
          monthly_quota: FREE_QUOTA,
          memory_limit: 10,
          used_count: 0,
          period_start: new Date().toISOString(),
          period_end: periodEnd.toISOString(),
          status: 'active',
        })
        .select()
        .single();

      if (insertError || !newData) {
        // 插入失败也给免费额度，不拦截用户
        return res.status(200).json({
          subscribed: true,
          plan_name: '免费体验',
          plan_id: 'free',
          monthly_quota: FREE_QUOTA,
          used_count: 0,
          remaining: FREE_QUOTA,
          memory_limit: 10,
          period_end: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
        });
      }

      return res.status(200).json({
        subscribed: true,
        plan_name: '免费体验',
        plan_id: 'free',
        monthly_quota: FREE_QUOTA,
        used_count: 0,
        remaining: FREE_QUOTA,
        memory_limit: 10,
        period_end: periodEnd.toISOString(),
      });
    }

    // 检查是否过期
    const now = new Date();
    const periodEnd = new Date(data.period_end);
    if (periodEnd < now || data.status !== 'active') {
      return res.status(200).json({ subscribed: false, expired: true });
    }

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
    console.error('Check subscription error:', err.message);
    // 数据库超时时给免费额度，不拦截用户
    return res.status(200).json({
      subscribed: true,
      plan_name: '免费体验',
      plan_id: 'free',
      monthly_quota: FREE_QUOTA,
      used_count: 0,
      remaining: FREE_QUOTA,
      memory_limit: 10,
      period_end: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    });
  }
}
