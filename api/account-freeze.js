import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// 管理员专用接口：只处理指定账号，不自动批量冻结。
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const CUTOFF = Date.parse('2026-07-01T00:00:00+08:00');
const INACTIVE_MS = 14 * 24 * 60 * 60 * 1000;
const BAN_DURATION = '876000h'; // Supabase Auth 管理端支持的长期禁用时长

function authorized(password) {
  const expected = process.env.ADMIN_PASSWORD_HASH;
  if (typeof password !== 'string' || !expected || !/^[a-f0-9]{64}$/i.test(expected)) return false;
  const actual = crypto.createHash('sha256').update(password).digest();
  const target = Buffer.from(expected, 'hex');
  return crypto.timingSafeEqual(actual, target);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  const { password, action, userId, confirm } = req.body || {};
  if (!authorized(password)) return res.status(401).json({ ok: false, reason: 'unauthorized' });
  if (!['preview', 'freeze', 'unfreeze'].includes(action) ||
      typeof userId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return res.status(400).json({ ok: false, reason: 'invalid_input' });
  }
  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data?.user) return res.status(404).json({ ok: false, reason: 'user_not_found' });
    const user = data.user;
    const created = Date.parse(user.created_at || '');
    const lastActive = Date.parse(user.last_sign_in_at || user.created_at || '');
    // last_sign_in_at 不等于最后活跃时间：持久登录用户仍可能每天聊天。
    const { data: archive, error: archiveError } = await supabase.from('user_data')
      .select('updated_at,chat_updated_at').eq('user_id', userId).maybeSingle();
    if (archiveError) return res.status(500).json({ ok: false, reason: 'activity_check_failed' });
    const recentActivity = [archive?.updated_at, archive?.chat_updated_at]
      .map(value => Date.parse(value || '')).filter(Number.isFinite);
    const latestActivity = Math.max(lastActive, ...recentActivity);
    const eligible = Number.isFinite(created) && Number.isFinite(latestActivity) &&
      created < CUTOFF && latestActivity < Date.now() - INACTIVE_MS;
    const banned = Boolean(user.banned_until && Date.parse(user.banned_until) > Date.now());
    // 有充值记录的账号默认禁止自动规则冻结；避免误伤仍有权益的老用户。
    const { data: subscription, error: subscriptionError } = await supabase
      .from('subscriptions').select('email,plan_id,monthly_quota,used_count')
      .eq('email', (user.email || '').trim().toLowerCase()).maybeSingle();
    if (subscriptionError) return res.status(500).json({ ok: false, reason: 'subscription_check_failed' });
    const hasSubscription = Boolean(subscription);
    const summary = { userId: user.id, email: user.email || null, createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at || null, lastActivityAt: new Date(latestActivity).toISOString(), eligible, banned, hasSubscription };

    if (action === 'preview') return res.status(200).json({ ok: true, ...summary });
    if (confirm !== 'CONFIRM_ACCOUNT_STATUS_CHANGE') {
      return res.status(400).json({ ok: false, reason: 'confirmation_required', ...summary });
    }
    if (action === 'freeze' && hasSubscription) return res.status(409).json({ ok: false, reason: 'subscription_protected', ...summary });
    if (action === 'freeze' && !eligible) {
      return res.status(409).json({ ok: false, reason: 'not_eligible', ...summary });
    }
    if (action === 'freeze' && banned) return res.status(200).json({ ok: true, unchanged: true, ...summary });
    if (action === 'unfreeze' && !banned) return res.status(200).json({ ok: true, unchanged: true, ...summary });

    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: action === 'freeze' ? BAN_DURATION : 'none'
    });
    if (updateError) {
      console.error('[account-freeze] update failed:', updateError.message);
      return res.status(500).json({ ok: false, reason: 'update_failed' });
    }
    const { data: verified, error: verifyError } = await supabase.auth.admin.getUserById(userId);
    if (verifyError || !verified?.user) return res.status(500).json({ ok: false, reason: 'verify_failed' });
    const nowBanned = Boolean(verified.user.banned_until &&
      Date.parse(verified.user.banned_until) > Date.now());
    if (nowBanned !== (action === 'freeze')) {
      return res.status(500).json({ ok: false, reason: 'status_mismatch' });
    }
    return res.status(200).json({ ok: true, userId, banned: nowBanned });
  } catch (error) {
    console.error('[account-freeze] unexpected error:', error);
    return res.status(500).json({ ok: false, reason: 'server_error' });
  }
}
