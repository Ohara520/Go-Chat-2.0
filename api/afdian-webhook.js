import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// 套餐配置
const PLAN_CONFIG = {
  '6c9cd46425d211f1964152540025c377': { name: '新婚', monthly_quota: 1800, memory_limit: 15 },
  '6e82f4a225d211f1b43e52540025c377': { name: '蜜月', monthly_quota: 2500, memory_limit: 20 },
  '6f7c680225d211f19aca52540025c377': { name: '金婚', monthly_quota: 4500, memory_limit: 25 },
};

// 加油包配置
const TOPUP_CONFIG = {
  '9effc14425d411f19ee752540025c377': { name: '小加油包', quota: 300 },
  '8e7858cc25d411f1ba9852540025c377': { name: '大加油包', quota: 1000 },
};

function verifySignature(token, params, ts, sign) {
  // 爱发电签名：md5(token + params + ts)
  const str = token + params + ts;
  const hash = crypto.createHash('md5').update(str).digest('hex');
  return hash === sign;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // 打印完整请求体，方便排查
  console.log('[webhook] 收到请求, body:', JSON.stringify(req.body).slice(0, 500));

  try {
    const { ec, em, data } = req.body;

    console.log('[webhook] ec:', ec, 'em:', em);

    if (ec !== 200) {
      console.warn('[webhook] ec非200，忽略:', ec);
      return res.status(200).json({ ec: 200, em: 'ok' });
    }

    const token = process.env.AFDIAN_TOKEN;
    if (!token) {
      console.error('[webhook] AFDIAN_TOKEN 未设置！');
    }

    // 验证签名（两种方式都试）
    const paramsStr = JSON.stringify(data);
    const ts = req.body.ts || '';
    const signOk1 = verifySignature(token, paramsStr, ts, req.body.sign || '');
    const signOk2 = verifySignature(token, paramsStr, '', req.body.sign || '');
    if (!signOk1 && !signOk2) {
      console.warn('[webhook] 签名验证失败，继续处理');
    } else {
      console.log('[webhook] 签名验证通过');
    }

    const orders = data?.order ? [data.order] : (data?.orders || []);
    console.log('[webhook] 订单数量:', orders.length);

    for (const order of orders) {
      console.log('[webhook] 处理订单:', order.out_trade_no, 'remark:', order.remark, 'plan_id:', order.plan_id);

      // 从备注取邮箱，做更宽松的提取（支持带空格/换行的备注）
      const rawRemark = (order.remark || '').trim();
      const emailMatch = rawRemark.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      const email = emailMatch ? emailMatch[0] : null;

      if (!email) {
        console.warn('[webhook] 订单没有有效邮箱, remark:', rawRemark, 'order_id:', order.out_trade_no);
        continue;
      }
      console.log('[webhook] 邮箱:', email);

      const planId = order.plan_id;
      const itemId = order.sku_detail?.[0]?.sku_id || '';

      // 判断是订阅还是加油包
      if (PLAN_CONFIG[planId]) {
        // 订阅方案
        const plan = PLAN_CONFIG[planId];
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        await supabase.from('subscriptions').upsert({
          email: email.toLowerCase().trim(),
          plan_id: planId,
          plan_name: plan.name,
          monthly_quota: plan.monthly_quota,
          memory_limit: plan.memory_limit,
          used_count: 0, // 续费重置用量
          period_start: now.toISOString(),
          period_end: periodEnd.toISOString(),
          status: 'active',
          afdian_order_id: order.out_trade_no,
          updated_at: now.toISOString(),
        }, { onConflict: 'email' });

      } else if (TOPUP_CONFIG[order.item_id] || TOPUP_CONFIG[itemId]) {
        // 加油包
        const topup = TOPUP_CONFIG[order.item_id] || TOPUP_CONFIG[itemId];
        if (!topup) continue;

        // 给用户增加额度（在现有基础上加）
        const { data: existing } = await supabase
          .from('subscriptions')
          .select('monthly_quota, used_count')
          .eq('email', email.toLowerCase().trim())
          .single();

        if (existing) {
          // 有订阅，增加月额度
          await supabase.from('subscriptions')
            .update({
              monthly_quota: existing.monthly_quota + topup.quota,
              updated_at: new Date().toISOString(),
            })
            .eq('email', email.toLowerCase().trim());
        } else {
          // 没有订阅也能买加油包，给一个临时记录
          const periodEnd = new Date();
          periodEnd.setMonth(periodEnd.getMonth() + 1);
          await supabase.from('subscriptions').insert({
            email: email.toLowerCase().trim(),
            plan_id: 'topup',
            plan_name: '加油包',
            monthly_quota: topup.quota,
            memory_limit: 10,
            used_count: 0,
            period_start: new Date().toISOString(),
            period_end: periodEnd.toISOString(),
            status: 'active',
            afdian_order_id: order.out_trade_no,
          });
        }
      }
    }

    return res.status(200).json({ ec: 200, em: 'ok' });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).json({ ec: 200, em: 'ok' }); // 爱发电要求必须返回200
  }
}
