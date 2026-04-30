import OpenAI from 'openai';

const BASE_URLS = [
  'https://api.yunjintao.com/v1',
  'http://43.99.79.59:8001/v1',
  'http://47.243.4.252:8001/v1',
  'http://43.99.4.123:8001/v1',
  'http://47.77.225.196:8001/v1',
  'http://8.222.174.125:8001/v1',
];

const PER_NODE_TIMEOUT_MS = 8000;

async function createWithFailover(messages, max_tokens, model = 'deepseek-v3.2') {
  let lastErr = null;
  let lastStatus = null;

  for (const baseURL of BASE_URLS) {
    try {
      const client = new OpenAI({
        apiKey: process.env.GEMINI_API_KEY,
        baseURL,
        timeout: PER_NODE_TIMEOUT_MS,
        maxRetries: 0,
      });
      const response = await client.chat.completions.create({ model, max_tokens, messages });
      return response;
    } catch (err) {
      console.warn(`[api/deepseek] node failed: ${baseURL}`, { msg: err.message, status: err.status });
      lastErr = err;
      lastStatus = err.status;
      if (err.status === 401 || err.status === 403 || err.status === 400) break;
    }
  }

  const e = new Error(lastErr?.message || 'all nodes failed');
  e.status = lastStatus;
  throw e;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { system, user, max_tokens = 200 } = req.body || {};

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
    return res.status(200).json({ text });

  } catch (err) {
    console.error('[api/deepseek] error:', err.message);

    let userMessage = '网络繁忙，请稍后再试';
    let statusCode = 500;

    if (err.status === 429) {
      userMessage = '请求过于频繁，请稍等几秒再发';
      statusCode = 429;
    } else if (err.message?.includes('timeout') || err.message?.includes('aborted')) {
      userMessage = '请求超时了，再试一次吧';
      statusCode = 504;
    } else if (err.status >= 500) {
      userMessage = '上游服务暂时不稳，请稍后重试';
      statusCode = 502;
    }

    return res.status(statusCode).json({ error: userMessage });
  }
}
