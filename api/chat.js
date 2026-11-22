import { requireActiveAccount } from './_active-account.js';
import Anthropic from '@anthropic-ai/sdk';

// 中转站节点（Anthropic 原生协议）
// baseURL 不加 /v1，SDK 自动拼接 /v1/messages
const BASE_URLS = [
  'https://api.yunjintao.com',
];

// 单节点超时：Haiku 8秒快速切换，Sonnet 20秒匹配主聊天前端调用（Vercel maxDuration=45s）
const PER_NODE_TIMEOUT_HAIKU = 8000;
const PER_NODE_TIMEOUT_SONNET = 20000;

// Haiku 与 Sonnet 在中转站不能共用同一分组，按模型名分流 Key：
//   claude-haiku-*  → HAIKU_API_KEY（独立，未配置时直接报错，绝不回退到主聊天 Key）
//   其他 Claude 模型 → ANTHROPIC_API_KEY（原有主聊天 Key）
function _isHaikuModel(model) {
  return typeof model === 'string' && model.toLowerCase().startsWith('claude-haiku-');
}

export default async function handler(req, res) {
  if (!(await requireActiveAccount(req, res))) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { model, max_tokens, system, messages, timeout_ms } = req.body || {};

    if (!model || !messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    // Haiku/Sonnet Key 分流：Haiku 必须有独立 Key，否则明确报错
    const isHaiku = _isHaikuModel(model);
    const apiKey = isHaiku ? process.env.HAIKU_API_KEY : process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      const keyName = isHaiku ? 'HAIKU_API_KEY' : 'ANTHROPIC_API_KEY';
      console.error(`[api/chat] ${keyName} 未配置，模型：${model}`);
      return res.status(500).json({
        error: 'Server configuration error',
        code: 'missing_api_key'
      });
    }

    // 超时：Haiku 固定 8s 快速失败，Sonnet 20s（用户传 timeout_ms 可覆盖，钳制在 20s~25s）
    let effectiveTimeout = isHaiku ? PER_NODE_TIMEOUT_HAIKU : PER_NODE_TIMEOUT_SONNET;
    if (!isHaiku && typeof timeout_ms === 'number') {
      effectiveTimeout = Math.max(PER_NODE_TIMEOUT_SONNET, Math.min(timeout_ms, 25000));
    }

    let lastErr = null;
    let lastStatus = null;

    for (const baseURL of BASE_URLS) {
      try {
        const client = new Anthropic({
          apiKey,
          baseURL,
          timeout: effectiveTimeout,
          maxRetries: 0,
          defaultHeaders: { 'anthropic-version': '2023-06-01' },
        });

        // 消息结构：前端已经是 Anthropic 格式，直接传递
        // 图片块已经是 {type:'image', source:{type:'base64', media_type, data}}，原生格式，无需转换
        const anthropicMessages = messages.map(msg => {
          if (msg.role === 'user' && Array.isArray(msg.content)) {
            // vision blocks 已经是 Anthropic 原生格式，直接用
            return { role: msg.role, content: msg.content };
          }
          return { role: msg.role, content: msg.content };
        });

        const params = {
          model,
          max_tokens: max_tokens || 1024,
          messages: anthropicMessages,
        };
        // 支持 Anthropic 原生 system：字符串或带 cache_control 的 text block 数组
        if (system) {
          if (typeof system === 'string') {
            params.system = system;
          } else if (Array.isArray(system)) {
            params.system = system;
          }
        }

        const anthropicResponse = await client.messages.create(params);

        // Anthropic 原生响应结构：content 是 [{type:'text', text:'...'}, ...]
        // 提取所有 text block 拼成完整文本（正常只有一个 text block）
        const text = (anthropicResponse.content || [])
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('')
          .trim();

        const modelLabel = isHaiku ? 'Haiku' : 'Sonnet';
        console.log(`[api/chat] ${modelLabel} Anthropic success: ${baseURL}`, {
          model,
          textLen: text.length,
          stopReason: anthropicResponse.stop_reason,
        });

        // 返回给前端：保持与原来相同的结构（content[0].text），前端无需改动
        return res.status(200).json({
          id: anthropicResponse.id,
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text }],
          model: anthropicResponse.model || model,
          stop_reason: anthropicResponse.stop_reason,
          usage: anthropicResponse.usage,
        });

      } catch (err) {
        const modelLabel = isHaiku ? 'Haiku' : 'Sonnet';
        const errType =
          (err.status === 401 || err.status === 403) ? 'AUTH_ERROR' :
          err.status === 400 ? 'BAD_REQUEST' :
          err.status === 429 ? 'RATE_LIMIT' :
          (err.message?.includes('timeout') || err.message?.includes('timed out') || err.message?.includes('aborted')) ? 'TIMEOUT' :
          err.status >= 500 ? 'UPSTREAM_ERROR' :
          'NETWORK_ERROR';

        console.warn(`[api/chat] ${modelLabel} Anthropic node failed: ${baseURL}`, {
          type: errType,
          msg: err.message,
          status: err.status,
        });
        lastErr = err;
        lastStatus = err.status;

        // 认证错误、请求格式错误立刻退出（重试也是错）
        if (err.status === 401 || err.status === 403 || err.status === 400) {
          break;
        }
      }
    }

    // 所有节点失败
    console.error('[api/chat] all nodes failed:', lastErr?.message);

    let userMessage = '网络繁忙，请稍后再试';
    let statusCode = 500;

    if (lastStatus === 429) {
      userMessage = '请求过于频繁，请稍等几秒再发';
      statusCode = 429;
    } else if (lastStatus === 401 || lastStatus === 403) {
      userMessage = '服务暂不可用，请联系管理员';
      statusCode = 503;
    } else if (lastErr?.message?.includes('timeout') || lastErr?.message?.includes('timed out') || lastErr?.message?.includes('aborted')) {
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
