import Anthropic from '@anthropic-ai/sdk';

// 节点列表：主站优先，国内加速节点备用
const BASE_URLS = [
  'https://api.yunjintao.com',
  'http://43.99.79.59:8001',
  'http://47.243.4.252:8001',
  'http://43.99.4.123:8001',
];

export default async function handler(req, res) {
  try {
    const { model, max_tokens, system, messages } = req.body;

    let lastErr = null;

    for (const baseURL of BASE_URLS) {
      try {
        const client = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
          baseURL,
        });
        const response = await client.messages.create(
          { model, max_tokens, system, messages },
          { headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' } }
        );
        return res.status(200).json(response);
      } catch (err) {
        console.warn(`[api/chat] 节点失败 ${baseURL}:`, err.message);
        lastErr = err;
        // 继续尝试下一个节点
      }
    }

    // 所有节点都失败
    console.error('[api/chat] 所有节点均失败:', lastErr?.message);
    res.status(500).json({ error: lastErr?.message || '所有节点均失败' });

  } catch (err) {
    console.error('[api/chat] 失败:', err.message);
    res.status(500).json({ error: err.message });
  }
}
