export default async function handler(req, res) {
  try {
    const body = { ...req.body };

    // 按站长写法：把 system prompt 作为 messages 第一条，加 cache_control
    if (body.system && body.messages) {
      const systemText = typeof body.system === 'string' ? body.system : body.system[0]?.text;
      body.messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: systemText, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: body.messages[0]?.content || '' }
          ]
        },
        ...body.messages.slice(1)
      ];
      delete body.system;
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
