import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// 用 service_role key，可以绕过 RLS（只在后端用，前端永远拿不到）
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

// 验证密码
function verifyPassword(password) {
  if (!password || typeof password !== 'string') return false;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;
  if (!expectedHash) {
    console.error('[admin-action] ADMIN_PASSWORD_HASH env not set');
    return false;
  }
  return hashPassword(password) === expectedHash;
}

// 老套餐 ID 列表
const OLD_PLAN_IDS = [
  '6c9cd46425d211f1964152540025c377',
  '6e82f4a225d211f1b43e52540025c377',
  '6f7c680225d211f19aca52540025c377',
  '新婚', '蜜月', '金婚'
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false });
  }

  const { password, action, payload } = req.body || {};

  // 每个请求都校验密码
  if (!verifyPassword(password)) {
    // 故意延迟 1 秒，防止暴力破解
    await new Promise(r => setTimeout(r, 1000));
    return res.status(401).json({ ok: false, reason: 'unauthorized' });
  }

  try {
    switch (action) {
      // ───────── 查询用户 ─────────
      case 'query_user': {
        const email = (payload?.email || '').trim().toLowerCase();
        if (!email) return res.status(400).json({ ok: false, reason: 'no_email' });

        const { data, error } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('email', email)
          .maybeSingle();

        if (error) {
          console.error('[admin-action query_user]', error);
          return res.status(500).json({ ok: false, reason: 'db_error' });
        }

        return res.status(200).json({ ok: true, data });
      }

      // ───────── 套餐充值（固定套餐）─────────
      case 'topup': {
        const email = (payload?.email || '').trim().toLowerCase();
        const quota = parseInt(payload?.quota);
        const planName = payload?.plan_name || '套餐充值';
        const note = payload?.note || '手动充值';

        if (!email || !quota || quota <= 0) {
          return res.status(400).json({ ok: false, reason: 'invalid_input' });
        }

        // 查现有数据
        const { data: ex } = await supabase
          .from('subscriptions')
          .select('monthly_quota,used_count,total_used')
          .eq('email', email)
          .maybeSingle();

        const curRem = ex ? Math.max(0, ex.monthly_quota - ex.used_count) : 0;
        const newQ = curRem + quota;
        const newTotalUsed = (ex?.total_used || 0) + (ex?.used_count || 0);

        // upsert
        const { error } = await supabase
          .from('subscriptions')
          .upsert({
            email,
            plan_id: 'permanent',
            plan_name: planName,
            monthly_quota: newQ,
            used_count: 0,
            total_used: newTotalUsed,
            memory_limit: 20,
            period_start: new Date().toISOString(),
            period_end: '2099-12-31T23:59:59.000Z',
            status: 'active',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'email' });

        if (error) {
          console.error('[admin-action topup]', error);
          return res.status(500).json({ ok: false, reason: 'db_error', message: error.message });
        }

        // 写入日志
        await supabase.from('topup_logs').insert({
          email,
          plan_name: planName,
          quota_added: quota,
          note: note,
          created_at: new Date().toISOString(),
        }).then(() => {}, () => {});

        return res.status(200).json({
          ok: true,
          curRem,
          added: quota,
          newQ,
        });
      }

      // ───────── 自定义充值 ─────────
      case 'topup_custom': {
        const email = (payload?.email || '').trim().toLowerCase();
        const quota = parseInt(payload?.quota);
        const note = payload?.note || '自定义充值';

        if (!email || !quota || quota <= 0) {
          return res.status(400).json({ ok: false, reason: 'invalid_input' });
        }

        const { data: ex } = await supabase
          .from('subscriptions')
          .select('monthly_quota,used_count,total_used')
          .eq('email', email)
          .maybeSingle();

        const curRem = ex ? Math.max(0, ex.monthly_quota - ex.used_count) : 0;
        const newQ = curRem + quota;
        const newTotalUsed = (ex?.total_used || 0) + (ex?.used_count || 0);

        const { error } = await supabase
          .from('subscriptions')
          .upsert({
            email,
            plan_id: 'permanent',
            plan_name: '自定义',
            monthly_quota: newQ,
            used_count: 0,
            total_used: newTotalUsed,
            memory_limit: 20,
            period_start: new Date().toISOString(),
            period_end: '2099-12-31T23:59:59.000Z',
            status: 'active',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'email' });

        if (error) {
          console.error('[admin-action topup_custom]', error);
          return res.status(500).json({ ok: false, reason: 'db_error', message: error.message });
        }

        await supabase.from('topup_logs').insert({
          email,
          plan_name: '自定义',
          quota_added: quota,
          note,
          created_at: new Date().toISOString(),
        }).then(() => {}, () => {});

        return res.status(200).json({
          ok: true,
          curRem,
          added: quota,
          newQ,
        });
      }

      // ───────── 老套餐继承（保留 50% 转永久）─────────
      case 'inherit': {
        const email = (payload?.email || '').trim().toLowerCase();
        if (!email) return res.status(400).json({ ok: false, reason: 'no_email' });

        const { data: cur } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('email', email)
          .maybeSingle();

        if (!cur) return res.status(400).json({ ok: false, reason: 'user_not_found' });

        const rem = Math.max(0, cur.monthly_quota - cur.used_count);
        const inh = Math.floor(rem * 0.5);

        const { error } = await supabase
          .from('subscriptions')
          .update({
            monthly_quota: inh,
            used_count: 0,
            total_used: (cur.total_used || 0) + (cur.used_count || 0),
            plan_id: 'permanent',
            plan_name: '永久套餐（继承）',
            period_end: '2099-12-31T23:59:59.000Z',
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('email', email);

        if (error) {
          console.error('[admin-action inherit]', error);
          return res.status(500).json({ ok: false, reason: 'db_error', message: error.message });
        }

        await supabase.from('topup_logs').insert({
          email,
          plan_name: '老套餐继承50%',
          quota_added: inh,
          note: `原${rem}条`,
          created_at: new Date().toISOString(),
        }).then(() => {}, () => {});

        return res.status(200).json({ ok: true, rem, inh });
      }

      // ───────── 加载充值日志 ─────────
      case 'load_logs': {
        const limit = Math.min(parseInt(payload?.limit) || 30, 100);
        const { data, error } = await supabase
          .from('topup_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) {
          console.error('[admin-action load_logs]', error);
          return res.status(500).json({ ok: false, reason: 'db_error' });
        }

        return res.status(200).json({ ok: true, data: data || [] });
      }

      default:
        return res.status(400).json({ ok: false, reason: 'unknown_action' });
    }
  } catch (err) {
    console.error('[admin-action]', err);
    return res.status(500).json({ ok: false, reason: 'server_error' });
  }
}
