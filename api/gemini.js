import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: 'https://api.yunjintao.com/v1',
});

export default async function handler(req, res) {
  try {
    const { system, user, max_tokens = 300 } = req.body;

    const response = await client.chat.completions.create({
      model: 'gemini-1.5-flash',
      max_tokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    const text = response.choices?.[0]?.message?.content?.trim() || '';
    res.status(200).json({ text });
  } catch (err) {
    console.error('D老师 error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
