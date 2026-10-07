// ===================================================
// api/gemini-extractor.js — Gemini 3.1 Flash Lite for background cognition tasks
// Used by: state.js (Long-term Memory extraction), relationship.js (Relationship Understanding extraction)
// Model: gemini-3.1-flash-lite-preview
// ===================================================

const BASE_URLS = [
  'https://api.yunjintao.com/v1',
];

const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';
const GEMINI_UPSTREAM_TIMEOUT_MS = 15000;

// 从 Gemini Native response 安全提取正文
function _extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((p) => (p && typeof p.text === 'string') ? p.text : '')
    .join('')
    .trim();
}

// Gemini Native transport：POST /v1/models/<model>:generateContent
async function callGeminiNative(user, model = GEMINI_MODEL) {
  let lastErr = null;
  let lastStatus = null;

  const body = {
    contents: [
      { role: 'user', parts: [{ text: user }] },
    ],
    generationConfig: { temperature: 0.7 },
  };

  for (const baseURL of BASE_URLS) {
    const endpoint = `${baseURL}/models/${model}:generateContent`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_UPSTREAM_TIMEOUT_MS);

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GEMINI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        const e = new Error(`upstream ${resp.status}`);
        e.status = resp.status;
        e._detail = errText;
        throw e;
      }

      const data = await resp.json();
      return data;
    } catch (err) {
      clearTimeout(timer);
      console.warn(`[api/gemini-extractor] node failed: ${baseURL}`, {
        msg: err.message,
        status: err.status,
        code: err.code,
      });
      lastErr = err;
      lastStatus = err.status;

      const isAbort = err?.name === 'AbortError';
      if (isAbort) { lastStatus = 504; break; }
      if (err.status === 401 || err.status === 403 || err.status === 400) break;
    }
  }

  const e = new Error(lastErr?.name === 'AbortError' ? 'upstream timeout' : (lastErr?.message || 'all nodes failed'));
  e.status = lastStatus;
  throw e;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user, max_tokens = 300 } = req.body || {};

    if (!user || typeof user !== 'string') {
      return res.status(400).json({ error: 'Invalid user input' });
    }

    const response = await callGeminiNative(user, GEMINI_MODEL);
    const text = _extractGeminiText(response);

    return res.status(200).json({ text });

  } catch (err) {
    console.error('[api/gemini-extractor] error:', {
      msg: err.message,
      status: err.status,
      code: err.code,
    });

    let userMessage = '网络繁忙，请稍后再试';
    let statusCode = 500;

    if (err.status === 429) {
      userMessage = '请求过于频繁，请稍等几秒再发';
      statusCode = 429;
    } else if (err.message?.includes('timeout') || err.message?.includes('aborted')) {
      userMessage = '请求超时了，再试一次吧';
      statusCode = 504;
    } else if (err.status >= 500) {
      userMessage = '上游服务暂时不稳，请稍后重试';
      statusCode = 502;
    }

    return res.status(statusCode).json({ error: userMessage });
  }
}
