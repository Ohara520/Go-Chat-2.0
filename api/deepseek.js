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
        stream: false,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    const rawText = await response.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch(e) {
      console.error('DeepSeek non-JSON:', rawText.slice(0, 300));
      return res.status(500).json({ error: 'Invalid response', raw: rawText.slice(0, 300) });
    }

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
