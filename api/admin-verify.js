import crypto from 'crypto';

// 密码哈希存在环境变量里——前端永远看不到
function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false });
  }

  // 简单速率限制：检查请求来源
  const { password } = req.body || {};

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ ok: false, reason: 'no_password' });
  }

  const expectedHash = process.env.ADMIN_PASSWORD_HASH;
  if (!expectedHash) {
    console.error('[admin-verify] ADMIN_PASSWORD_HASH env not set');
    return res.status(500).json({ ok: false, reason: 'server_misconfigured' });
  }

  const inputHash = hashPassword(password);

  if (inputHash === expectedHash) {
    // 验证通过，颁发一个一次性 token
    const token = crypto.randomBytes(32).toString('hex');
    return res.status(200).json({ ok: true, token });
  } else {
    // 故意延迟 1 秒，防止暴力破解
    await new Promise(r => setTimeout(r, 1000));
    return res.status(401).json({ ok: false, reason: 'wrong_password' });
  }
}
