import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://api.yunjintao.com',
});

export default async function handler(req, res) {
  try {
    const { model, max_tokens, system, systemParts, messages } = req.body;

    // 如果有systemParts，用缓存格式；否则用普通字符串
    let systemPayload;
    if (systemParts && systemParts.fixed) {
      // 缓存格式：fixed部分加cache_control，dynamic部分不加
      systemPayload = [
        {
          type: 'text',
          text: systemParts.fixed,
          cache_control: { type: 'ephemeral' }
        },
        ...(systemParts.dynamic ? [{
          type: 'text',
          text: systemParts.dynamic
        }] : [])
      ];
    } else {
      systemPayload = system;
    }

    const response = await client.messages.create({
      model,
      max_tokens,
      system: systemPayload,
      messages,
    }, {
      headers: {
        'anthropic-beta': 'prompt-caching-2024-07-31'
      }
    });

    res.status(200).json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
