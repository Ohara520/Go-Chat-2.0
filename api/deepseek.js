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

    // 先读文本再解析，避免HTML响应导致JSON报错
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch(e) {
      console.error('DeepSeek non-JSON response:', text.slice(0, 200));
      return res.status(500).json({ error: 'Invalid response', raw: text.slice(0, 200) });
    }

    if (!response.ok) {
      console.error('DeepSeek API error:', response.status, JSON.stringify(data));
      return res.status(500).json({ error: `API error ${response.status}`, detail: data });
    }

    const result = data.choices?.[0]?.message?.content?.trim() || '';
    res.status(200).json({ text: result });
  } catch (err) {
    console.error('DeepSeek handler error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
