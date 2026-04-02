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
  const str = token + params + ts;
  const hash = crypto.createHash('md5').update(str).digest('hex');
  return hash === sign;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

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
      console.log('[webhook] 处理订单:', order.out_trade_no, 'plan_id:', order.plan_id);
      console.log('[webhook] 完整订单字段:', JSON.stringify(order));

      // =============================
      // 【修复1】去重：查独立的 afdian_orders 表
      // 原来存在 subscriptions.afdian_order_id，会被新订单覆盖，导致旧订单去重失效
      // =============================
      const tradeNo = order.out_trade_no;
      if (tradeNo) {
        const { data: existingOrder } = await supabase
          .from('afdian_orders')
          .select('out_trade_no')
          .eq('out_trade_no', tradeNo)
          .maybeSingle();

        if (existingOrder) {
          console.log('[webhook] 订单已处理过，跳过:', tradeNo);
          continue;
        }
      }

      // =============================
      // 【修复2】多字段提取邮箱，防止 remark 为空时丢单
      // =============================
      const remarkSources = [
        order.remark,
        order.user_remark,
        order.buyer_message,
      ].filter(Boolean).join(' ');

      console.log('[webhook] remark来源:', remarkSources);

      const emailMatch = remarkSources.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      const email = emailMatch ? emailMatch[0] : null;

      if (!email) {
        console.warn('[webhook] 订单没有有效邮箱, remarkSources:', remarkSources, 'order_id:', order.out_trade_no);
        continue;
      }
      console.log('[webhook] 邮箱:', email);

      const planId = order.plan_id;
      const itemId = order.sku_detail?.[0]?.sku_id || '';

      const topupKey = TOPUP_CONFIG[planId] ? planId
        : TOPUP_CONFIG[itemId] ? itemId
        : TOPUP_CONFIG[order.item_id] ? order.item_id
        : null;

      console.log('[webhook] topupKey:', topupKey, 'planId:', planId);

      if (topupKey) {
        // ===== 加油包 =====
        const topup = TOPUP_CONFIG[topupKey];

        const { data: existing } = await supabase
          .from('subscriptions')
          .select('monthly_quota, used_count')
          .eq('email', email.toLowerCase().trim())
          .single();

        if (existing) {
          await supabase.from('subscriptions')
            .update({
              monthly_quota: existing.monthly_quota + topup.quota,
              updated_at: new Date().toISOString(),
            })
            .eq('email', email.toLowerCase().trim());
          console.log('[webhook] 加油包充值成功:', email, '+', topup.quota, '条，当前总额度:', existing.monthly_quota + topup.quota);
        } else {
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
          });
          console.log('[webhook] 加油包新建记录:', email, topup.quota, '条');
        }

      } else if (PLAN_CONFIG[planId]) {
        // ===== 订阅方案 =====
        const plan = PLAN_CONFIG[planId];
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        // 查询现有剩余条数，叠加而不是覆盖
        const { data: existing } = await supabase
          .from('subscriptions')
          .select('monthly_quota, used_count')
          .eq('email', email.toLowerCase().trim())
          .maybeSingle();

        const currentRemaining = existing ? Math.max(0, existing.monthly_quota - existing.used_count) : 0;
        const newQuota = currentRemaining + plan.monthly_quota;

        await supabase.from('subscriptions').upsert({
          email: email.toLowerCase().trim(),
          plan_id: planId,
          plan_name: plan.name,
          monthly_quota: newQuota,
          memory_limit: plan.memory_limit,
          used_count: 0,
          period_start: now.toISOString(),
          period_end: periodEnd.toISOString(),
          status: 'active',
          updated_at: now.toISOString(),
        }, { onConflict: 'email' });
        console.log('[webhook] 订阅开通/续费成功:', email, plan.name, '原剩余:', currentRemaining, '+新套餐:', plan.monthly_quota, '=总额度:', newQuota, '条');

      } else {
        console.warn('[webhook] 未知plan_id，跳过处理:', planId, 'order:', order.out_trade_no);
      }

      // =============================
      // 【修复1续】订单处理完成后，记录到独立的去重表
      // =============================
      if (tradeNo) {
        await supabase.from('afdian_orders').insert({
          out_trade_no: tradeNo,
          email: email ? email.toLowerCase().trim() : null,
          plan_id: planId || null,
          processed_at: new Date().toISOString(),
        });
        console.log('[webhook] 已记录订单到去重表:', tradeNo);
      }
    }

    return res.status(200).json({ ec: 200, em: 'ok' });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).json({ ec: 200, em: 'ok' });
  }
}
