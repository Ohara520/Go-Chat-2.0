import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://api.yunjintao.com/v1',
});

export default async function handler(req, res) {
  try {
    const { system, user, max_tokens = 300 } = req.body;

    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    const text = response.choices?.[0]?.message?.content?.trim() || '';
    res.status(200).json({ text });
  } catch (err) {
    console.error('DeepSeek error:', err.message, err.status);
    res.status(500).json({ error: err.message });
  }
}
