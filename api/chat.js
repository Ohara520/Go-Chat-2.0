import OpenAI from 'openai';

// 中转站官方节点列表（来自站长文档）
const BASE_URLS = [
  'https://api.yunjintao.com',
];

// 单节点超时：Haiku 8秒快速切换，Sonnet 20秒匹配主聊天前端调用（Vercel maxDuration=45s）
const PER_NODE_TIMEOUT_HAIKU = 8000;
const PER_NODE_TIMEOUT_SONNET = 20000;

// Haiku 与 Sonnet 在中转站不能共用同一分组，按模型名分流 Key：
//   claude-haiku-*  → HAIKU_API_KEY（独立，未配置时直接报错，绝不回退到主聊天 Key）
//   其他 Claude 模型 → ANTHROPIC_API_KEY（原有主聊天 Key）
//
// 协议统一（2026-10-28）：两个分组在中转站的 Anthropic 协议都 Failed to fetch，
// 统一改用 OpenAI Chat (/v1/chat/completions)。后端把 OpenAI 响应转回前端期望的
// Anthropic 格式（content[0].text），前端无需改动。
function _isHaikuModel(model) {
  return typeof model === 'string' && model.toLowerCase().startsWith('claude-haiku-');
}

export default async function handler(req, res) {
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
        const client = new OpenAI({
          apiKey,
          baseURL,
          timeout: effectiveTimeout,
          maxRetries: 0,
        });

        // 请求转换：Anthropic → OpenAI Chat
        const chatMessages = [];
        if (system && typeof system === 'string') {
          chatMessages.push({ role: 'system', content: system });
        }
        for (const msg of messages) {
          if (msg.role === 'user' && Array.isArray(msg.content)) {
            // 图片块转换：{type:'image', source:{base64}} → {type:'image_url', image_url:{url}}
            const converted = msg.content.map(block => {
              if (block.type === 'image' && block.source?.type === 'base64') {
                const mimeType = block.source.media_type || 'image/jpeg';
                const data = block.source.data;
                return {
                  type: 'image_url',
                  image_url: { url: `data:${mimeType};base64,${data}` }
                };
              }
              return block;
            });
            chatMessages.push({ role: msg.role, content: converted });
          } else {
            chatMessages.push({ role: msg.role, content: msg.content });
          }
        }

        const chatResponse = await client.chat.completions.create({
          model,
          max_tokens,
          messages: chatMessages,
        });

        // 响应转换：OpenAI Chat → Anthropic 格式（前端期望的 content[0].text 结构）
        // 参考 venice.js _extractChatText：content 可能是字符串或包含 text 的对象数组
        const rawContent = chatResponse.choices?.[0]?.message?.content;
        let text = '';
        if (typeof rawContent === 'string') {
          text = rawContent.trim();
        } else if (Array.isArray(rawContent)) {
          text = rawContent
            .map((p) => (p && typeof p.text === 'string') ? p.text : '')
            .join('')
            .trim();
        }

        // 结构异常（无 choices / 无 message / content 既不是字符串也不是数组）→ 按上游失败处理，不伪装成功。
        // 结构正常但正文为空 → 原样返回空文本：与原 Anthropic 路径一致，前端会走"空回复重试一次 → Gemini 日常接续"，
        // 若改成 502 会跳过这条恢复链，直接显示"网络波动"。
        const _choice = chatResponse?.choices?.[0];
        const _shapeOk = !!_choice?.message &&
          (typeof rawContent === 'string' || Array.isArray(rawContent));
        if (!_shapeOk) {
          // 临时诊断：打印中转站原始响应结构（不含正文），帮助排查为什么结构不对
          console.error('[api/chat] BAD_RESPONSE_SHAPE from upstream:', {
            hasChoices: Array.isArray(chatResponse?.choices),
            choicesLen: chatResponse?.choices?.length,
            hasMessage: !!_choice?.message,
            contentType: typeof rawContent,
            isContentArray: Array.isArray(rawContent),
            topLevelKeys: chatResponse ? Object.keys(chatResponse) : null,
          });
          const err = new Error('BAD_RESPONSE_SHAPE');
          err.status = 502;
          err._badShape = true;
          throw err;
        }

        const anthropicResponse = {
          id: chatResponse.id || `msg_${Date.now()}`,
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text }],
          model: chatResponse.model || model,
          stop_reason: chatResponse.choices[0].finish_reason === 'length' ? 'max_tokens' : 'end_turn',
          usage: chatResponse.usage ? {
            input_tokens: chatResponse.usage.prompt_tokens || 0,
            output_tokens: chatResponse.usage.completion_tokens || 0,
          } : undefined,
        };

        // 诊断日志：区分 Haiku/Sonnet，记录成功或失败类型，不打印内容和Key
        const modelLabel = isHaiku ? 'Haiku' : 'Sonnet';
        console.log(`[api/chat] ${modelLabel} OpenAI success: ${baseURL}`, {
          model,
          hasChoices: Array.isArray(chatResponse.choices) && chatResponse.choices.length > 0,
          textLen: text.length,
          finishReason: chatResponse.choices?.[0]?.finish_reason,
        });

        return res.status(200).json(anthropicResponse);

      } catch (err) {
        const modelLabel = isHaiku ? 'Haiku' : 'Sonnet';
        const errType = err._badShape ? 'BAD_RESPONSE_SHAPE' :
                        err.status ? 'HTTP_ERROR' :
                        (err.message?.includes('timeout') || err.message?.includes('timed out') || err.message?.includes('aborted')) ? 'TIMEOUT' :
                        'NETWORK_ERROR';
        console.warn(`[api/chat] ${modelLabel} OpenAI node failed: ${baseURL}`, {
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
