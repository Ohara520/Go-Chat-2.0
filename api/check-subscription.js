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
    const isExpired = periodEnd < now || data.status !== 'active';

    // 老套餐过期 → 自动继承50%转永久
    const OLD_PLAN_IDS = [
      '6c9cd46425d211f1964152540025c377',
      '6e82f4a225d211f1b43e52540025c377',
      '6f7c680225d211f19aca52540025c377',
      '新婚', '蜜月', '金婚', 'topup',
    ];
    const isOldPlan = OLD_PLAN_IDS.includes(data.plan_id) || (data.plan_id && data.plan_id.length > 20);

    if (isExpired && isOldPlan) {
      const remaining = Math.max(0, data.monthly_quota - data.used_count);
      const inherited = Math.floor(remaining * 0.5);
      await supabase.from('subscriptions').update({
        monthly_quota: inherited,
        used_count: 0,
        total_used: (data.total_used || 0) + (data.used_count || 0),
        plan_id: 'permanent',
        plan_name: '永久套餐（到期继承）',
        period_end: '2099-12-31T23:59:59.000Z',
        status: 'active',
        updated_at: now.toISOString(),
      }).eq('email', email.toLowerCase().trim());

      return res.status(200).json({
        subscribed: true,
        plan_name: '永久套餐（到期继承）',
        plan_id: 'permanent',
        monthly_quota: inherited,
        used_count: 0,
        remaining: inherited,
        memory_limit: 20,
        period_end: '2099-12-31T23:59:59.000Z',
      });
    }

    // 其他情况过期（free等）
    if (isExpired) {
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
    // 数据库超时：返回503让前端继续用缓存，不重置条数
    return res.status(503).json({ error: 'timeout', message: 'use cached subscription data' });
  }
}
