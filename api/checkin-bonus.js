// 签到赠送聊天条数已停用。保留端点用于拒绝旧客户端及历史待重试请求。
// 不修改任何现有订阅、已到账额度或付费额度。
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  return res.status(410).json({ ok: false, reason: 'checkin_message_bonus_discontinued' });
}
