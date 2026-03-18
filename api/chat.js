import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://api.yunjintao.com',
});

export default async function handler(req, res) {
  try {
    const { model, max_tokens, system, systemParts, messages } = req.body;

    // 如果有分层的 systemParts，用固定层caching+动态层普通
    // 否则退回到完整 system
    let systemParam;
    if (systemParts && systemParts.fixed) {
      systemParam = [
        { type: 'text', text: systemParts.fixed, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: systemParts.dynamic || '' }
      ];
    } else {
      systemParam = [
        { type: 'text', text: system, cache_control: { type: 'ephemeral' } }
      ];
    }

    const response = await client.messages.create({
      model,
      max_tokens,
      system: systemParam,
      messages,
    }, {
      headers: {
        'anthropic-beta': 'prompt-caching-2025-11-01',
      }
    });

    res.status(200).json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
