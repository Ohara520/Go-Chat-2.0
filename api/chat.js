import Anthropic from '@anthropic-ai/sdk';

// 中转站官方节点列表（来自站长文档）
//   主站：HTTPS 域名，海外/部分国内可达
//   加速子节点 ④：稳定加速，中低并发（国内常驻）
//   全球协同节点 ③：CDN 加速，主要给海外用户兜底
// 顺序：国内最快的优先，海外节点垫底
const BASE_URLS = [
  'https://api.yunjintao.com',      // 主站（域名，HTTPS）
  'http://43.99.79.59:8001',        // 加速子节点
  'http://47.243.4.252:8001',       // 加速子节点
  'http://43.99.4.123:8001',        // 加速子节点
  'http://47.77.225.196:8001',      // 全球协同（兜底）
  'http://8.222.174.125:8001',      // 全球协同（兜底）
];

// 单节点超时：8 秒
// 原因：Sonnet 大部分回复 5-15 秒，但如果 8 秒还没回响应头说明节点本身堵了，立刻切
// SDK 默认超时是 10 分钟，必须显式覆盖
const PER_NODE_TIMEOUT_MS = 8000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { model, max_tokens, system, messages } = req.body || {};

    if (!model || !messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    let lastErr = null;
    let lastStatus = null;

    for (const baseURL of BASE_URLS) {
      try {
        const client = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
          baseURL,
          timeout: PER_NODE_TIMEOUT_MS,
          maxRetries: 0, // SDK 自带重试关掉，避免叠加延迟
        });

        const response = await client.messages.create(
          { model, max_tokens, system, messages },
          { headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' } }
        );

        return res.status(200).json(response);

      } catch (err) {
        // 只记日志到后端，不暴露给用户
        console.warn(`[api/chat] node failed: ${baseURL}`, {
          msg: err.message,
          status: err.status,
        });
        lastErr = err;
        lastStatus = err.status;

        // 如果是认证错误（key 失效），所有节点都救不了，立刻退出
        if (err.status === 401 || err.status === 403) {
          break;
        }

        // 如果是请求格式错误，也立刻退出（重试也是错）
        if (err.status === 400) {
          break;
        }

        // 其他错误：继续尝试下一个节点
      }
    }

    // 所有节点都失败 → 给前端返回脱敏的友好错误
    console.error('[api/chat] all nodes failed:', lastErr?.message);

    let userMessage = '网络繁忙，请稍后再试';
    let statusCode = 500;

    if (lastStatus === 429) {
      userMessage = '请求过于频繁，请稍等几秒再发';
      statusCode = 429;
    } else if (lastStatus === 401 || lastStatus === 403) {
      userMessage = '服务暂不可用，请联系管理员';
      statusCode = 503;
    } else if (lastErr?.message?.includes('timeout') || lastErr?.message?.includes('aborted')) {
      userMessage = '所有节点响应超时，请稍后重试';
      statusCode = 504;
    } else if (lastStatus >= 500) {
      userMessage = '上游服务暂时不稳，请稍后重试';
      statusCode = 502;
    }

    return res.status(statusCode).json({ error: userMessage });

  } catch (err) {
    console.error('[api/chat] handler error:', err.message);
    return res.status(500).json({ error: '请求处理失败' });
  }
}
