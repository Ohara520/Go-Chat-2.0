import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// 与 check-subscription.js 保持一致的免费基础额度
const FREE_QUOTA = 100;

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
      // 没有订阅记录 → 插入免费记录，额度 = 免费基础额度 + bonus
      // 注意：必须用免费基础额度(100)+bonus，不能只给 bonus，否则丢掉100基础条数
      const periodEnd = new Date();
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      const { error: insertError } = await supabase.from('subscriptions').insert({
        email: cleanEmail,
        plan_id: 'free',
        plan_name: '免费体验',
        monthly_quota: FREE_QUOTA + bonus,
        memory_limit: 10,
        used_count: 0,
        period_start: new Date().toISOString(),
        period_end: periodEnd.toISOString(),
        status: 'active',
        updated_at: new Date().toISOString(),
      });

      if (!insertError) {
        return res.status(200).json({ ok: true, remaining: FREE_QUOTA + bonus });
      }

      // 插入失败：极可能是 check-subscription 并发创建了同一条记录（唯一键冲突）。
      // 不能假装成功——重新读取后用 UPDATE 把 bonus 加上去，否则 bonus 永久丢失。
      const { data: existing, error: reSelectErr } = await supabase
        .from('subscriptions')
        .select('used_count, monthly_quota')
        .eq('email', cleanEmail)
        .single();
      if (reSelectErr || !existing) {
        // 仍然读不到 → 让前端回滚并存 pending 重试，绝不谎报成功
        return res.status(200).json({ ok: false, reason: 'insert_conflict_reselect_failed' });
      }
      const reQuota = existing.monthly_quota + bonus;
      await supabase
        .from('subscriptions')
        .update({ monthly_quota: reQuota, updated_at: new Date().toISOString() })
        .eq('email', cleanEmail);
      return res.status(200).json({ ok: true, remaining: reQuota - existing.used_count });
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
