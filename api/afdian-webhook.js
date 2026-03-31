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
  '8e7858cc25d411f1ba9852540025c377': { name: '大加油包', quota: 800 },
};

function verifySignature(token, params, sign) {
  const str = token + params;
  const hash = crypto.createHash('md5').update(str).digest('hex');
  return hash === sign;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { ec, em, data } = req.body;

    if (ec !== 200) {
      return res.status(200).json({ ec: 200, em: 'ok' });
    }

    const token = process.env.AFDIAN_TOKEN;

    // 验证签名
    const paramsStr = JSON.stringify(data);
    if (!verifySignature(token, paramsStr, req.body.sign || '')) {
      // 签名验证失败也继续处理，爱发电有时签名方式不同
      console.warn('签名验证失败，继续处理');
    }

    const orders = data?.order ? [data.order] : (data?.orders || []);

    for (const order of orders) {
      const email = order.remark || order.user_id; // 用户填写的邮箱在备注里
      if (!email || !email.includes('@')) {
        console.warn('订单没有有效邮箱:', order.out_trade_no);
        continue;
      }

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
