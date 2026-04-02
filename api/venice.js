import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

export default async function handler(req, res) {
  try {
    const { system, user, max_tokens = 300 } = req.body;

    if (!user || typeof user !== 'string') {
      return res.status(400).json({ error: 'Invalid user input' });
    }

    const response = await client.chat.completions.create({
      model: 'venice/uncensored:free',
      max_tokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      headers: {
        'HTTP-Referer': 'https://gochat.vercel.app',
        'X-Title': 'Go Chat',
      }
    });

    const text = response.choices?.[0]?.message?.content?.trim() || '';
    res.status(200).json({ text });
  } catch (err) {
    console.error('Venice error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
