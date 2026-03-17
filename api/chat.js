export default async function handler(req, res) {
  try {
    const body = { ...req.body };

    // 把 system 改成 caching 格式
    if (body.system && typeof body.system === 'string') {
      body.system = [{ type: 'text', text: body.system, cache_control: { type: 'ephemeral' } }];
    }

    const response = await fetch('https://api.yunjintao.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2025-11-01',
      },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
