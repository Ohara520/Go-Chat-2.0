import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆字符
  const part1 = Array.from({length:4}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
  const part2 = Array.from({length:4}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
  return `GC-${part1}-${part2}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { code, email, confirm } = req.body;
  if (!code) return res.status(400).json({ ok: false, reason: 'no_code' });

  const normalizedCode = code.trim().toUpperCase();

  try {
    const { data, error } = await supabase
      .from('invite_codes')
      .select('*')
      .eq('code', normalizedCode)
      .maybeSingle();

    if (error || !data) {
      return res.status(200).json({ ok: false, reason: 'invalid' });
    }

    if (data.is_used) {
      return res.status(200).json({ ok: false, reason: 'used' });
    }

    // 仅验证模式（confirm 未传或为 false）：只检查有效性，不消耗邀请码
    if (!confirm) {
      return res.status(200).json({ ok: true, validated: true });
    }

    // 确认消耗模式（注册成功后调用）：标记为已使用并生成新邀请码
    await supabase
      .from('invite_codes')
      .update({
        is_used: true,
        used_by: email || null,
        used_at: new Date().toISOString(),
      })
      .eq('code', normalizedCode);

    // 新用户注册成功后自动生成1个邀请码给邀请人
    if (data.created_by) {
      await supabase.from('invite_codes').insert({
        code: genCode(),
        created_by: data.created_by,
        is_used: false,
        created_at: new Date().toISOString(),
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[check-invite]', err.message);
    return res.status(500).json({ ok: false, reason: 'server_error' });
  }
}
