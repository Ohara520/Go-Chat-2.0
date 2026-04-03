import Anthropic from '@anthropic-ai/sdk';

// 标准版客户端
const clientStandard = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://api.yunjintao.com',
});

// 企业版客户端（更稳定，超时时自动切换）
const clientEnterprise = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY_ENTERPRISE || process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://ccs.yunjintao.com',
});

async function callWithFallback(payload, headers) {
  // 先用标准版，超时或报错自动切企业版
  try {
    const response = await Promise.race([
      clientStandard.messages.create(payload, { headers }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('STANDARD_TIMEOUT')), 25000))
    ]);
    return response;
  } catch (err) {
    // 标准版失败或超时，切企业版重试
    console.warn('[api/chat] 标准版失败，切企业版:', err.message);
    return await clientEnterprise.messages.create(payload, { headers });
  }
}

export default async function handler(req, res) {
  try {
    const { model, max_tokens, system, systemParts, messages } = req.body;

    let systemPayload;
    if (systemParts && systemParts.fixed) {
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

    const response = await callWithFallback(
      { model, max_tokens, system: systemPayload, messages },
      { 'anthropic-beta': 'prompt-caching-2024-07-31' }
    );

    res.status(200).json(response);
  } catch (err) {
    console.error('[api/chat] 两个通道都失败:', err.message);
    res.status(500).json({ error: err.message });
  }
}
