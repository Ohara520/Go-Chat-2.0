// ============================================================
// api.js — API工具层
// 负责：所有模型调用封装、超时/重试、翻译层
// 依赖：无（纯工具，不依赖其他模块）
// 被依赖：几乎所有模块都会用到这里的函数
// ============================================================

// ===== 模型常量 =====
const MODEL_OPUS   = 'claude-sonnet-4-5-20250929';   // 主聊天
const MODEL_SONNET = 'claude-sonnet-4-5-20250929';   // 心声/快递/外卖等
const MODEL_HAIKU  = 'claude-haiku-4-5-20251001';

function getMainModel() {
  return MODEL_OPUS;
}

// ═══════════════════════════════════════════════════════════
// 共享工具：API错误body检测
// 中转站有时返回HTTP 200但body是错误(code/error字段)
// !res.ok 拦不住这种情况，需要读body后二次检查
// 用于所有callXxx封装的统一处理
// ═══════════════════════════════════════════════════════════
function _isApiErrorBody(data) {
  if (!data || typeof data !== 'object') return false;
  // Anthropic/中转站常见错误结构
  if (data.error) return true;
  if (data.code && typeof data.code === 'string' && !data.content) return true;
  if (data.type === 'error') return true;
  return false;
}

function _apiErrorMsg(data) {
  if (!data) return 'unknown';
  if (typeof data.error === 'string') return data.error.slice(0, 120);
  if (data.error?.message) return String(data.error.message).slice(0, 120);
  if (data.code) return String(data.code).slice(0, 80);
  return 'unknown';
}

// ═══════════════════════════════════════════════════════════
// Haiku调用节流 + 去重缓存
// 解决Haiku被打爆 (79/60 per minute) 的根源问题
//   - 最多_HAIKU_MAX_CONCURRENT个并发in-flight
//   - 超出的排队,_HAIKU_QUEUE_TIMEOUT_MS后放弃(返回空串)
//   - 相同调用参数_HAIKU_CACHE_TTL_MS内命中缓存,直接返回
// 仅Haiku模型使用(Sonnet/Grok/Venice额度宽松,不走节流)
// ═══════════════════════════════════════════════════════════
const _HAIKU_MAX_CONCURRENT    = 5;
const _HAIKU_QUEUE_TIMEOUT_MS  = 5000;
const _HAIKU_CACHE_TTL_MS      = 60000;
const _HAIKU_CACHE_MAX_SIZE    = 200;

let _haikuInFlight = 0;
const _haikuWaitQueue = [];   // { resolve, timedOut }
const _haikuCache = new Map(); // hash -> { result, ts }

function _hashHaikuCall(system, messages, maxTokens) {
  const payload = JSON.stringify({ s: system || '', m: messages || [], t: maxTokens || 0 });
  let h = 0;
  for (let i = 0; i < payload.length; i++) {
    h = ((h << 5) - h + payload.charCodeAt(i)) | 0;
  }
  return h.toString(36) + '_' + payload.length;
}

function _haikuCacheGet(key) {
  const entry = _haikuCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > _HAIKU_CACHE_TTL_MS) {
    _haikuCache.delete(key);
    return null;
  }
  return entry.result;
}

function _haikuCacheSet(key, result) {
  // 空串不缓存,失败调用不该阻挡下次重试
  if (result === '' || result == null) return;
  _haikuCache.set(key, { result, ts: Date.now() });
  if (_haikuCache.size > _HAIKU_CACHE_MAX_SIZE) {
    const firstKey = _haikuCache.keys().next().value;
    _haikuCache.delete(firstKey);
  }
}

async function _haikuGateAcquire() {
  if (_haikuInFlight < _HAIKU_MAX_CONCURRENT) {
    _haikuInFlight++;
    return true;
  }
  return new Promise(resolve => {
    const ticket = { resolve, timedOut: false };
    _haikuWaitQueue.push(ticket);
    setTimeout(() => {
      if (ticket.timedOut) return;
      ticket.timedOut = true;
      const idx = _haikuWaitQueue.indexOf(ticket);
      if (idx !== -1) _haikuWaitQueue.splice(idx, 1);
      resolve(false); // 排队超时,放弃调用
    }, _HAIKU_QUEUE_TIMEOUT_MS);
  });
}

function _haikuGateRelease() {
  _haikuInFlight = Math.max(0, _haikuInFlight - 1);
  // 唤醒下一个等待者
  while (_haikuWaitQueue.length > 0) {
    const next = _haikuWaitQueue.shift();
    if (!next.timedOut) {
      next.timedOut = true;  // 占位,防止超时回调重复resolve
      _haikuInFlight++;
      next.resolve(true);
      break;
    }
  }
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
 * 走Haiku节流闸门：最多3并发 + 60秒相同调用缓存 + 5秒排队超时
 * 排队超时/失败统一返回空串，调用方已按空串兜底处理
 * @param {string} system  系统提示词
 * @param {Array}  messages  消息数组（原始格式，会自动cleanMessages）
 * @param {number} maxTokens  默认200
 * @returns {string} 模型回复文本，失败返回空字符串
 */
async function callHaiku(system, messages, maxTokens = 200) {
  const cleanMsgs = cleanMessages(messages);
  const cacheKey = _hashHaikuCall(system, cleanMsgs, maxTokens);

  // 1. 查缓存
  const cached = _haikuCacheGet(cacheKey);
  if (cached !== null) return cached;

  // 2. 进闸门
  const acquired = await _haikuGateAcquire();
  if (!acquired) {
    console.warn('[callHaiku] 排队超时,放弃调用');
    return '';
  }

  try {
    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_HAIKU,
        max_tokens: maxTokens,
        system,
        messages: cleanMsgs,
      }),
    }, 10000);
    if (!res.ok) return '';
    const data = await res.json();
    if (_isApiErrorBody(data)) {
      console.warn('[callHaiku] HTTP ok 但 body 是错误:', _apiErrorMsg(data));
      return '';
    }
    const result = data.content?.[0]?.text?.trim() || '';
    _haikuCacheSet(cacheKey, result);
    return result;
  } catch (e) {
    return '';
  } finally {
    _haikuGateRelease();
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
        model: MODEL_OPUS,
        max_tokens: maxTokens,
        system,
        messages: cleanMessages(messages),
      }),
    }, 25000);
    if (!res.ok) return '';
    const data = await res.json();
    if (_isApiErrorBody(data)) {
      console.warn('[callSonnet] HTTP ok 但 body 是错误:', _apiErrorMsg(data));
      return '';
    }
    return data.content?.[0]?.text?.trim() || '';
  } catch (e) {
    return '';
  }
}

/**
 * 调用 Sonnet 4.6（轻量调用：心声、检测、非主聊天场景）
 * 比 Opus 便宜，质量对一两句话的生成足够
 */
async function callSonnetLight(system, messages, maxTokens = 100) {
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
    }, 15000);
    if (!res.ok) return '';
    const data = await res.json();
    if (_isApiErrorBody(data)) {
      console.warn('[callSonnetLight] HTTP ok 但 body 是错误:', _apiErrorMsg(data));
      return '';
    }
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
  const messages = [{ role: 'user', content: userContent }];
  const cacheKey = _hashHaikuCall(systemPrompt, messages, maxTokens);

  // 查缓存
  const cached = _haikuCacheGet(cacheKey);
  if (cached !== null) return cached;

  // 进Haiku闸门
  const acquired = await _haikuGateAcquire();
  if (!acquired) {
    console.warn('[fetchDeepSeek] 排队超时,放弃调用');
    return '';
  }

  try {
    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_HAIKU,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
      }),
    }, 8000);
    if (!res.ok) return '';
    const data = await res.json();
    if (_isApiErrorBody(data)) {
      console.warn('[fetchDeepSeek] HTTP ok 但 body 是错误:', _apiErrorMsg(data));
      return '';
    }
    const result = data.content?.[0]?.text || '';
    _haikuCacheSet(cacheKey, result);
    return result;
  } catch (e) {
    return '';
  } finally {
    _haikuGateRelease();
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
async function callGrok(user, maxTokens = 300, imageBase64 = null, scene = 'normal', stateHint = '', intimacyLevel = 1) {
  try {
    const body = { user, max_tokens: maxTokens, scene };
    if (imageBase64) body.image_base64 = imageBase64;
    if (stateHint) body.stateHint = stateHint;
    if (intimacyLevel !== undefined) body.intimacyLevel = intimacyLevel;
    const res = await fetchWithTimeout('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 10000);
    if (!res.ok) return '';
    const data = await res.json();
    if (_isApiErrorBody(data)) {
      console.warn('[callGrok] HTTP ok 但 body 是错误:', _apiErrorMsg(data));
      return '';
    }
    return data.text?.trim() || '';
  } catch (e) {
    return '';
  }
}

/**
 * 调用 Grok（带自定义 system）
 * 修复：后端 /api/gemini 不读 system 字段，合并到 user 消息里
 */
async function callGrokWithSystem(system, user, maxTokens = 300) {
  try {
    // 后端 gemini.js 有自己的内建人设，不读请求里的 system
    // 把自定义 system 合并进 user，确保 Grok 看得到
    const combinedUser = system ? (system + '\n\n' + user) : user;
    const body = { user: combinedUser, max_tokens: maxTokens };
    const res = await fetchWithTimeout('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 10000);
    if (!res.ok) return '';
    const data = await res.json();
    if (_isApiErrorBody(data)) {
      console.warn('[callGrokWithSystem] HTTP ok 但 body 是错误:', _apiErrorMsg(data));
      return '';
    }
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
    }, 22000);  // 延长超时：Grok响应慢，12s经常silent fail
    if (!res.ok) return '';
    const data = await res.json();
    if (_isApiErrorBody(data)) {
      console.warn('[callVenice] HTTP ok 但 body 是错误:', _apiErrorMsg(data));
      return '';
    }
    return data.text?.trim() || '';
  } catch (e) {
    return '';
  }
}

// ===== DeepSeek 生成调用 =====
// /api/deepseek 路由用于内容生成（情绪判断/心声/签收/转账拒绝等）
// /api/translate 已删除

/**
 * 调用 DeepSeek（/api/deepseek 路由）做内容生成
 * @param {string} prompt      完整 prompt（system+user 合并传入）
 * @param {number} maxTokens   默认200
 * @returns {string} 回复文本，失败返回空字符串
 */
async function callDeepSeek(prompt, maxTokens = 200) {
  try {
    const res = await fetchWithTimeout('/api/deepseek', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: prompt, max_tokens: maxTokens }),
    }, 12000);
    if (!res.ok) return '';
    const data = await res.json();
    if (_isApiErrorBody(data)) {
      console.warn('[callDeepSeek] HTTP ok 但 body 是错误:', _apiErrorMsg(data));
      return '';
    }
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
  // 中转节点不透传 anthropic-beta header，暂时不用 cache_control
  // 等中转支持透传后再开启缓存
  const body = {
    model: MODEL_OPUS,
    max_tokens: maxTokens,
    system: finalSystem,
    messages: messages,
  };

  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
  if (signal) options.signal = signal;

  return await fetchWithRetry('/api/chat', options, 60000, 1);
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
    // 否认关系
    "not your husband", "not your wife", "not married",
    "not your honey", "not your babe", "not your baby",
    "not your darling", "not your love", "not your boyfriend",
    "not your simon", "not your ghost",
    "i don't have a wife", "we're not together", "we're not married",
    "don't call me that", "don't call me",
    "keep moving", "what's your aim",
    "english only", "use my name", "stop with that", "stop calling me",
    //
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

// 支持多角色的 Venice 调用（自动路由到当前角色的调情 API）
async function callVeniceForCurrentChar(system, user, maxTokens = 120, intimateMemory = '') {
  try {
    const endpoint = typeof getCurrentVeniceEndpoint === 'function'
      ? getCurrentVeniceEndpoint()
      : '/api/venice';
    const body = { system, user, max_tokens: maxTokens };
    if (intimateMemory) body.intimateMemory = intimateMemory;
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 22000);
    if (!res.ok) return '';
    const data = await res.json();
    if (_isApiErrorBody(data)) {
      console.warn('[callVeniceForCurrentChar] HTTP ok 但 body 是错误:', _apiErrorMsg(data));
      return '';
    }
    return data.text?.trim() || '';
  } catch (e) {
    return '';
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
