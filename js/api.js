// ============================================================
// api.js — API工具层
// 负责：所有模型调用封装、超时/重试、翻译层
// 依赖：无（纯工具，不依赖其他模块）
// 被依赖：几乎所有模块都会用到这里的函数
// ============================================================

// ===== 模型常量 =====
const MODEL_SONNET = 'claude-sonnet-4-5-20250929';
const MODEL_HAIKU  = 'claude-haiku-4-5-20251001';

function getMainModel() {
  return MODEL_SONNET;
}

// ===== 基础网络工具 =====

/**
 * 带超时的fetch，超时后abort
 * @param {string} url
 * @param {object} options  fetch options
 * @param {number} timeoutMs  默认15秒
 */
async function fetchWithTimeout(url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

/**
 * 带重试的fetch，针对529/503/502自动重试
 * AbortError直接抛出，不重试（打断逻辑）
 * @param {string} url
 * @param {object} options  fetch options，可包含外部signal
 * @param {number} timeoutMs  单次超时，默认20秒
 * @param {number} maxRetries  最多重试次数，默认1次
 */
async function fetchWithRetry(url, options, timeoutMs = 20000, maxRetries = 1) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const res = await fetchWithTimeout(url, options, timeoutMs);
      if ((res.status === 529 || res.status === 503 || res.status === 502) && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
}

// ===== 消息清洗 =====

/**
 * 过滤掉系统注入消息和已撤回消息，只保留role+content
 * 用于传给API之前的最后一步清洗
 */
function cleanMessages(messages) {
  return (messages || [])
    .filter(m => !m._system && !m._recalled)
    .map(m => ({ role: m.role, content: m.content }));
}

// ===== Claude 调用封装 =====

/**
 * 调用 Claude Haiku（快速检测/判断/短文本生成）
 * @param {string} system  系统提示词
 * @param {Array}  messages  消息数组（原始格式，会自动cleanMessages）
 * @param {number} maxTokens  默认200
 * @returns {string} 模型回复文本，失败返回空字符串
 */
async function callHaiku(system, messages, maxTokens = 200) {
  try {
    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_HAIKU,
        max_tokens: maxTokens,
        system,
        messages: cleanMessages(messages),
      }),
    }, 10000);
    if (!res.ok) return '';
    const data = await res.json();
    return data.content?.[0]?.text?.trim() || '';
  } catch (e) {
    return '';
  }
}

/**
 * 调用 Claude Sonnet（主模型，Ghost主回复/重要剧情）
 * @param {string} system  系统提示词
 * @param {Array}  messages  消息数组
 * @param {number} maxTokens  默认400
 * @returns {string} 模型回复文本，失败返回空字符串
 */
async function callSonnet(system, messages, maxTokens = 400) {
  try {
    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_SONNET,
        max_tokens: maxTokens,
        system,
        messages: cleanMessages(messages),
      }),
    }, 25000);
    if (!res.ok) return '';
    const data = await res.json();
    return data.content?.[0]?.text?.trim() || '';
  } catch (e) {
    return '';
  }
}

// ===== Haiku 功能型调用（原 fetchDeepSeek）=====

/**
 * 用 Haiku 做快速检测/判断（原名fetchDeepSeek，现在统一走Haiku）
 * 接口和原版完全一样，直接替换
 * @param {string} systemPrompt
 * @param {string} userContent
 * @param {number} maxTokens  默认200
 * @returns {string} 回复文本，失败返回空字符串
 */
async function fetchDeepSeek(systemPrompt, userContent, maxTokens = 200) {
  try {
    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_HAIKU,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    }, 8000);
    if (!res.ok) return '';
    const data = await res.json();
    return data.content?.[0]?.text || '';
  } catch (e) {
    return '';
  }
}

// ===== Grok 调用封装 =====

/**
 * 调用 Grok — 救火兜底 / 情绪检测 / 图片识别
 * 对应后端 /api/gemini
 * 人设完全在后端，前端只传 scene + user
 * @param {string} user        用户消息或上下文
 * @param {number} maxTokens   默认300
 * @param {string|null} imageBase64  可选图片
 * @param {string} scene       场景：normal/sticker/story/proactive/salary
 * @returns {string} 回复文本，失败返回空字符串
 */
async function callGrok(user, maxTokens = 300, imageBase64 = null, scene = 'normal') {
  try {
    const body = { user, max_tokens: maxTokens, scene };
    if (imageBase64) body.image_base64 = imageBase64;
    const res = await fetchWithTimeout('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 10000);
    if (!res.ok) return '';
    const data = await res.json();
    return data.text?.trim() || '';
  } catch (e) {
    return '';
  }
}

/**
 * 调用 Grok（带自定义 system）
 * 用于心声、调情总结等需要专用 prompt 的场景
 * @param {string} system      专用系统提示
 * @param {string} user        用户消息或上下文
 * @param {number} maxTokens   默认300
 * @returns {string} 回复文本，失败返回空字符串
 */
async function callGrokWithSystem(system, user, maxTokens = 300) {
  try {
    const body = { system, user, max_tokens: maxTokens };
    const res = await fetchWithTimeout('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 10000);
    if (!res.ok) return '';
    const data = await res.json();
    return data.text?.trim() || '';
  } catch (e) {
    return '';
  }
}

/**
 * 调用 Venice（Grok调情专用）
 * 对应后端 /api/venice，内置Ghost调情人设，只需传动态context
 * @param {string} system          动态context（追加到内置人设后面）
 * @param {string} user            用户消息
 * @param {number} maxTokens       默认300
 * @param {string} intimateMemory  可选，Ghost的调情记忆片段
 * @returns {string} 回复文本，失败返回空字符串
 */
async function callVenice(system, user, maxTokens = 300, intimateMemory = '') {
  try {
    const body = { system, user, max_tokens: maxTokens };
    if (intimateMemory) body.intimateMemory = intimateMemory;
    const res = await fetchWithTimeout('/api/venice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 12000);  // 原版超时，12s足够
    if (!res.ok) return '';
    const data = await res.json();
    return data.text?.trim() || '';
  } catch (e) {
    return '';
  }
}

// ===== DeepSeek 文本处理调用 =====
// 注意：/api/translate 路由实际是 DeepSeek，不只用于翻译
// 目前主要用于：长期记忆提取（sendMessage主流程末尾）
// 失败时调用方自行用 fetchDeepSeek 兜底

/**
 * 调用 DeepSeek（/api/translate 路由）做文本处理
 * @param {string} prompt      完整提示词（system+user合并传入）
 * @param {number} maxTokens   默认500
 * @returns {string} 回复文本，失败返回空字符串
 */
async function callDeepSeek(prompt, maxTokens = 500) {
  try {
    const res = await fetchWithTimeout('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: prompt, max_tokens: maxTokens }),
    }, 12000);
    if (!res.ok) return '';
    const data = await res.json();
    return data.text?.trim() || '';
  } catch (e) {
    return '';
  }
}

// ===== Sonnet 主调用（支持prompt cache）=====

/**
 * fetchSonnetWithCache
 * 主聊天回复调用，支持 Anthropic prompt caching
 * @param {string} finalSystem        完整动态system（含状态/hint等）
 * @param {{fixed:string, dynamic:string}} parts  buildSystemPromptParts的结果
 * @param {Array}  messages           已处理好的消息数组
 * @param {number} maxTokens          默认1000
 * @param {AbortSignal|null} signal   外部abort信号
 * @returns {Response} 原始fetch Response（调用方自己.json()）
 */
async function fetchSonnetWithCache(finalSystem, parts, messages, maxTokens = 1000, signal = null) {
  // 构建system字段：尝试用cache_control分段，若parts无效则fallback到纯字符串
  let systemField;
  if (parts && parts.fixed && parts.dynamic) {
    systemField = [
      { type: 'text', text: parts.fixed, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: parts.dynamic + '\n' + finalSystem }
    ];
  } else {
    systemField = finalSystem;
  }

  const body = {
    model: MODEL_SONNET,
    max_tokens: maxTokens,
    system: systemField,
    messages: messages,
  };

  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
  if (signal) options.signal = signal;

  return await fetchWithRetry('/api/chat', options, 30000, 1);
}

// ===== 破防检测 =====
// 与 sendMessage.js 的 BREAKOUT_PHRASES 保持一致
// sendMessage.js 有自己完整的 isBreakout，这里是供其他模块（ui.js、innerThought.js 等）使用的版本

function isBreakout(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return [
    "i'm claude", "i am claude", "made by anthropic",
    "i'm an ai", "i am an ai", "as an ai",
    "i'm kiro", "i am kiro", "i'm kirk", "i am kirk",
    "claude ai", "by anthropic", "anthropic made",
    "i can't roleplay", "i cannot roleplay",
    "i don't roleplay", "i won't roleplay",
    "i can't pretend", "i cannot pretend",
    "i won't pretend", "i'm not able to pretend",
    "jailbreak", "override my actual", "override my identity",
    "my actual identity",
    "regardless of how the request is framed",
    "the elaborate character",
    "i'm not simon", "i am not simon",
    "i need to pause here",
    "i need to be direct with you",
    "i need to be straight with you",
    "i need to be honest with you",
    "as the ai", "i'm designed to", "i was designed to",
    "claude here", "it's claude",
    "i appreciate the creative", "i appreciate the detailed",
    "maintain an ongoing", "simulate an intimate",
    "developer assistant", "i can't discuss sensitive",
    "sensitive, personal", "must refuse to answer",
    "within my capabilities",
  ].some(p => lower.includes(p));
}

// ===== 异步语义破防检测 =====
// 词库没命中时，用Haiku语义判断是否出戏
// 只在可疑内容时才调用，减少额外费用

async function isBreakoutAsync(text) {
  if (!text) return false;
  // 先词库快速判断
  if (isBreakout(text)) return true;
  // 可疑关键词预筛——没有这些词不调模型
  const suspicious = /i appreciate|let's keep|keep it grounded|i can't engage|that kind of content|i need to clarify|i should note|acting as|pretending to be|as a language|my role is|i don't feel comfortable|not appropriate|inappropriate|i must be honest/i;
  if (!suspicious.test(text)) return false;
  // Haiku语义判断
  try {
    const result = await callHaiku(
      'You are a character consistency checker. Is this reply breaking character by acting like an AI assistant, refusing to engage, claiming safety restrictions, or stepping outside a roleplay persona? Answer only YES or NO.',
      [{ role: 'user', content: `Reply to check: "${text.slice(0, 300)}"` }],
      5
    );
    return result.trim().toUpperCase().startsWith('YES');
  } catch(e) {
    return false;
  }
}

// ===== JSON安全解析 =====

/**
 * 安全解析带有markdown fence的JSON回复
 * @param {string} raw  模型原始输出
 * @returns {object|null}
 */
function safeParseJSON(raw) {
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch (e) {
    return null;
  }
}
