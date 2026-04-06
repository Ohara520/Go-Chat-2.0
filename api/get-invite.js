import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function generateCode(email) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = () => chars[Math.floor(Math.random() * chars.length)];
  const part1 = Array.from({length: 4}, rand).join('');
  const part2 = Array.from({length: 4}, rand).join('');
  return `GC-${part1}-${part2}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email } = req.body;
  if (!email) return res.status(400).json({ ok: false });

  const normalizedEmail = email.toLowerCase().trim();

  try {
    // 查是否已有该用户创建的未使用邀请码
    const { data: existing } = await supabase
      .from('invite_codes')
      .select('code')
      .eq('created_by', normalizedEmail)
      .eq('is_used', false)
      .limit(1)
      .maybeSingle();

    if (existing?.code) {
      return res.status(200).json({ ok: true, code: existing.code });
    }

    // 没有就生成一个新的
    let code, attempts = 0;
    while (attempts < 5) {
      code = generateCode(normalizedEmail);
      const { error } = await supabase
        .from('invite_codes')
        .insert({ code, created_by: normalizedEmail, is_used: false });
      if (!error) break;
      attempts++;
    }

    return res.status(200).json({ ok: true, code });
  } catch (err) {
    console.error('[get-invite]', err.message);
    return res.status(500).json({ ok: false });
  }
}
