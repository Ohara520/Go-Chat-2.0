// ── 一次性隔离对照实验（非产品逻辑）────────────────────────
// 用途：用与 api/venice.js 完全相同的 host/model/SDK/认证方式，
//       发一条极短无害请求（Reply with exactly: OK），连测 3 次，
//       判断 grok-4.6 + api.yunjintao.com 这条管道本身活不活。
// 运行：  GEMINI_API_KEY=你的key node scripts/grok-isolation-test.mjs
// 说明：不经过 sendMessage / intimacy / Haiku / chatHistory / localStorage /
//       WorldBook / memory；不产生 UI；不新增公开接口；只打印安全技术元数据。
// 测完请删除本文件（不要进入正式产品逻辑）。
import OpenAI from 'openai';

// —— 与 api/venice.js 保持一致的通道常量 ——
const BASE_URL = 'https://api.yunjintao.com/v1';
const MODEL = 'grok-4.6';
const TIMEOUT_MS = 8000;   // 同 PER_NODE_TIMEOUT_MS
const MAX_RETRIES = 0;     // 同 SDK maxRetries

// —— 刻意简化的无害内容（唯一被简化的变量）——
const SYSTEM = 'You are a test assistant.';
const USER = 'Reply with exactly: OK';
const MAX_TOKENS = 16;     // 只够返回 OK；与产品 200 不同，见报告说明

function hostOf(u) { try { return new URL(u).host; } catch { return 'unknown'; } }

function inspectSuccess(response, elapsedMs) {
  const choice = response?.choices?.[0];
  const raw = choice?.message?.content;
  const hasChoices = Array.isArray(response?.choices) && response.choices.length > 0;
  const hasMessage = !!choice?.message;
  const contentLen = typeof raw === 'string' ? raw.trim().length : 0;
  const isPlainObj = response !== null && typeof response === 'object' && !Array.isArray(response);
  const out = {
    result: (!hasChoices || !hasMessage) ? 'BAD_RESPONSE_SHAPE'
      : (contentLen > 0 ? 'OK' : 'UPSTREAM_EMPTY'),
    elapsedMs, model: MODEL, host: hostOf(BASE_URL),
    hasChoices, hasMessage, contentLen,
    finishReason: choice?.finish_reason,
  };
  if (out.result === 'BAD_RESPONSE_SHAPE') {
    out.topLevelKeys = isPlainObj ? Object.keys(response) : undefined;
    const err = isPlainObj ? response.error : undefined;
    if (err !== undefined) {
      const errIsPlainObj = err !== null && typeof err === 'object' && !Array.isArray(err);
      out.errorValueType = typeof err;
      out.errorIsArray = Array.isArray(err);
      if (errIsPlainObj) {
        out.errorKeys = Object.keys(err);
        out.errorType = typeof err.type === 'string' ? err.type : undefined;
        out.errorCode = (typeof err.code === 'string' || typeof err.code === 'number') ? err.code : undefined;
        out.errorStatus = (typeof err.status === 'string' || typeof err.status === 'number') ? err.status : undefined;
        out.errorStatusCode = (typeof err.statusCode === 'string' || typeof err.statusCode === 'number') ? err.statusCode : undefined;
        out.errorParam = typeof err.param === 'string' ? err.param : undefined;
      }
    }
  }
  return out;
}

function inspectError(err, elapsedMs) {
  const status = typeof err?.status === 'number' ? err.status : undefined;
  return {
    result: (status !== undefined) ? 'HTTP_ERROR_THROWN' : 'NETWORK_OR_SDK_ERROR',
    elapsedMs, model: MODEL, host: hostOf(BASE_URL),
    errName: err?.name, errCode: err?.code, status,
  };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('缺少 GEMINI_API_KEY，无法执行。用法: GEMINI_API_KEY=xxx node scripts/grok-isolation-test.mjs');
    process.exit(1);
  }
  const client = new OpenAI({
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: BASE_URL,
    timeout: TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
  });
  for (let i = 1; i <= 3; i++) {
    const t0 = Date.now();
    try {
      const response = await client.chat.completions.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: USER },
        ],
      });
      console.log(`[GrokIsolate #${i}]`, inspectSuccess(response, Date.now() - t0));
    } catch (err) {
      console.log(`[GrokIsolate #${i}]`, inspectError(err, Date.now() - t0));
    }
  }
}

main();
