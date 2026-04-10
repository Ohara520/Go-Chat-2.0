import OpenAI from 'openai';

const BASE_URLS = [
  'https://api.yunjintao.com/v1',
  'http://43.99.79.59:8001/v1',
  'http://47.243.4.252:8001/v1',
  'http://43.99.4.123:8001/v1',
];

async function createWithFailover(messages, max_tokens, model = 'deepseek-v3.2') {
  let lastErr = null;
  for (const baseURL of BASE_URLS) {
    try {
      const client = new OpenAI({ apiKey: process.env.GEMINI_API_KEY, baseURL });
      const response = await client.chat.completions.create({ model, max_tokens, messages });
      return response;
    } catch (err) {
      console.warn(`[deepseek] 节点失败 ${baseURL}:`, err.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error('所有节点均失败');
}

export default async function handler(req, res) {
  try {
    const { system, user, max_tokens = 200 } = req.body;

    if (!user || typeof user !== 'string') {
      return res.status(400).json({ error: 'Invalid user input' });
    }

    const messages = [];
    if (system && typeof system === 'string') {
      messages.push({ role: 'system', content: system });
    }
    messages.push({ role: 'user', content: user });

    const response = await createWithFailover(messages, max_tokens);
    const text = response.choices?.[0]?.message?.content?.trim() || '';
    res.status(200).json({ text });
  } catch (err) {
    console.error('[deepseek] error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
