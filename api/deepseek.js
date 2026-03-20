export default async function handler(req, res) {
  try {
    const { system, user, max_tokens = 300 } = req.body;

    const response = await fetch('https://api.yunjintao.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ANTHROPIC_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('DeepSeek API error:', response.status, JSON.stringify(data));
      return res.status(500).json({ error: `API error ${response.status}`, detail: data });
    }

    const text = data.choices?.[0]?.message?.content?.trim() || '';
    res.status(200).json({ text });
  } catch (err) {
    console.error('DeepSeek handler error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
