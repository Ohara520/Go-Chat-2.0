import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export async function requireActiveAccount(req, res) {
  const match = /^Bearer (.+)$/i.exec(req.headers.authorization || '');
  if (!match) { res.status(401).json({ error: 'Login required', code: 'auth_required' }); return false; }
  try {
    const { data, error } = await admin.auth.getUser(match[1]);
    if (error || !data?.user) {
      res.status(401).json({ error: 'Invalid session', code: 'invalid_session' });
      return false;
    }
    const { data: account, error: lookupError } = await admin.auth.admin.getUserById(data.user.id);
    if (lookupError || !account?.user) {
      res.status(503).json({ error: 'Account status unavailable', code: 'status_unavailable' });
      return false;
    }
    const banned = account.user.banned_until && Date.parse(account.user.banned_until) > Date.now();
    if (banned) {
      res.status(403).json({ error: 'Account frozen', code: 'account_frozen' });
      return false;
    }
    return true;
  } catch (error) {
    console.error('[active-account]', error);
    res.status(503).json({ error: 'Account status unavailable', code: 'status_unavailable' });
    return false;
  }
}
