import { createClient } from '@supabase/supabase-js';

// 对旧会话执行服务端实时状态核查，不能信任客户端传来的 userId。
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const header = req.headers.authorization || '';
  const token = /^Bearer (.+)$/i.exec(header)?.[1];
  if (!token) return res.status(401).json({ ok: false, reason: 'missing_token' });
  try {
    const { data: identity, error: identityError } = await supabase.auth.getUser(token);
    if (identityError || !identity?.user) return res.status(401).json({ ok: false, reason: 'invalid_session' });
    const { data, error } = await supabase.auth.admin.getUserById(identity.user.id);
    if (error || !data?.user) return res.status(503).json({ ok: false, reason: 'status_unavailable' });
    const banned = Boolean(data.user.banned_until &&
      Date.parse(data.user.banned_until) > Date.now());
    return res.status(banned ? 403 : 200).json({ ok: !banned, banned, reason: banned ? 'account_frozen' : undefined });
  } catch (error) {
    console.error('[account-status]', error);
    return res.status(503).json({ ok: false, reason: 'status_unavailable' });
  }
}
