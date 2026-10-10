// api/tts.js — ElevenLabs 语音合成代理 V2（BYOK 安全版 + 模型白名单 + 限流）
// 前端 voice.js 调用 /api/tts，验证身份后使用用户配置的 Key 或平台降级 Key
// 环境变量：
//   ELEVENLABS_API_KEY（平台降级密钥，用户未配置时使用）
//   VOICE_KEY_ENCRYPTION_SECRET（加密密钥，32字节base64）

import { createClient } from '@supabase/supabase-js';
import { decrypt } from '../utils/voice-crypto.js';
import { isModelAllowed, buildVoiceSettings, getMaxTextLength } from '../utils/elevenlabs-models.js';

const ELEVENLABS_TIMEOUT_MS = 18000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    db: { schema: 'public' },
    global: {
      fetch: (url, options) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        return fetch(url, { ...options, signal: controller.signal })
          .finally(() => clearTimeout(timeout));
      }
    }
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 限流：保护平台统一 Key 的调用额度
// V1 基础保护，防止单用户短时间大量请求耗尽平台额度。
// 不作为严格计费限制，生产环境建议接入 Redis/Vercel KV 实现跨实例限流。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const _rateLimitMap = new Map(); // userId → { count, resetAt }
const RATE_LIMIT_WINDOW_MS = 60000; // 1分钟窗口
const RATE_LIMIT_MAX_PER_USER = 10; // 每用户每分钟最多10次
const RATE_LIMIT_MAX_PLATFORM = 50; // 平台Key每分钟最多50次（保护平台额度）

function checkRateLimit(userId, isPlatformKey) {
  const key = isPlatformKey ? '__platform__' : userId;
  const now = Date.now();
  const limit = isPlatformKey ? RATE_LIMIT_MAX_PLATFORM : RATE_LIMIT_MAX_PER_USER;

  let entry = _rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    _rateLimitMap.set(key, entry);
  }

  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  entry.count++;
  return { allowed: true };
}

// 辅助：验证 Authorization Bearer Token
async function verifyToken(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Missing or invalid Authorization header', status: 401 };
  }

  const token = authHeader.substring(7);
  if (!token) {
    return { error: 'Missing access token', status: 401 };
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return { error: 'Invalid or expired token', status: 401 };
    }
    return { user };
  } catch (e) {
    return { error: 'Token verification failed', status: 401 };
  }
}

// 辅助：获取用户的语音配置（包括解密密钥）
// V1.1 改动：用户必须配置自己的 API Key，禁止 fallback 到平台密钥
async function getUserVoiceConfig(userId) {
  try {
    const { data, error } = await supabase
      .from('user_voice_settings')
      .select('api_key_ciphertext, api_key_iv, api_key_auth_tag, voice_id, model_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[tts] Failed to fetch user voice config:', error.message);
      return { error: 'Failed to load voice settings', status: 500 };
    }

    // V1.1：不配置用户 Key = 返回 400，不允许使用任何 Key
    if (!data || !data.api_key_ciphertext) {
      return {
        error: '请先配置您的 ElevenLabs API Key',
        status: 400,
      };
    }

    // 解密用户密钥
    let userApiKey;
    try {
      userApiKey = decrypt(
        data.api_key_ciphertext,
        data.api_key_iv,
        data.api_key_auth_tag
      );
    } catch (decErr) {
      console.error('[tts] Failed to decrypt user API key');
      return { error: 'Failed to decrypt API key', status: 500 };
    }

    return {
      apiKey: userApiKey,
      voiceId: data.voice_id,
      modelId: data.model_id,
      isPlatformKey: false,
    };
  } catch (err) {
    console.error('[tts] getUserVoiceConfig error:', err.message);
    return { error: 'Internal server error', status: 500 };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ========== 1. 强制验证身份 ==========
  const { user, error: authError, status: authStatus } = await verifyToken(req);
  if (authError) {
    return res.status(authStatus).json({ error: authError });
  }

  try {
    // ========== 2. 参数校验 ==========
    const { text, voice_id, model_id, voice_settings } = req.body || {};

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid text' });
    }

    // ========== 3. 获取用户配置 ==========
    const config = await getUserVoiceConfig(user.id);
    if (config.error) {
      return res.status(config.status).json({ error: config.error });
    }

    const { apiKey, voiceId, modelId, isPlatformKey } = config;

    // V1.1：如果用户未配置 API Key，getUserVoiceConfig 已返回 400 错误
    // 这里只需要校验 apiKey 存在即可（不应该走到这里）
    if (!apiKey) {
      console.error('[tts] No API key available');
      return res.status(400).json({ error: '请先配置您的 ElevenLabs API Key' });
    }

    // ========== 4. 限流检查 ==========
    // V1.1：移除平台密钥限流，改为用户粒度限流
    const rateLimitResult = checkRateLimit(user.id, false);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        error: `请求过于频繁，请 ${rateLimitResult.retryAfter} 秒后重试`,
        retryAfter: rateLimitResult.retryAfter,
      });
    }

    // ========== 5. 准备请求参数 ==========
    // 优先使用用户配置的 voice_id/model_id，否则用前端传入的，再降级到默认值
    const finalVoiceId = voiceId || voice_id || 'QHVs2huJe5wggzgIHMIi';
    const finalModelId = modelId || model_id || 'eleven_turbo_v2_5';

    // 模型白名单校验
    if (!isModelAllowed(finalModelId)) {
      return res.status(400).json({ error: '不支持的模型，请在语音设置中选择有效模型' });
    }

    // 校验 voice_id 格式（防止注入）
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(finalVoiceId)) {
      return res.status(400).json({ error: 'Invalid voice_id format' });
    }

    // 根据模型获取最大文本长度
    const maxTextLength = getMaxTextLength(finalModelId);
    if (text.length > maxTextLength) {
      return res.status(400).json({ error: `文本过长（最大 ${maxTextLength} 字符）` });
    }

    // 根据模型能力构建兼容的 voice_settings
    const compatibleSettings = buildVoiceSettings(finalModelId, voice_settings);

    // ========== 6. 调用 ElevenLabs ==========
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ELEVENLABS_TIMEOUT_MS);

    let upstream;
    try {
      const requestBody = {
        text: text.slice(0, maxTextLength),
        model_id: finalModelId,
      };

      // 只在模型支持时添加 voice_settings
      if (compatibleSettings) {
        requestBody.voice_settings = compatibleSettings;
      }

      upstream = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${finalVoiceId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timer);
    }

    // ========== 7. 处理 ElevenLabs 响应 ==========
    if (!upstream.ok) {
      console.warn('[tts] ElevenLabs error:', upstream.status);

      // V1.1：用户密钥失效或其他错误，直接返回给用户
      if (upstream.status === 401) {
        return res.status(401).json({
          error: '您的 ElevenLabs API Key 无效或已过期',
          hint: '请前往「我的 → 语音设置」更新密钥',
        });
      }

      if (upstream.status === 429) {
        return res.status(429).json({
          error: '您的 ElevenLabs API Key 额度不足',
          hint: '请充值或前往「我的 → 语音设置」更换密钥',
        });
      }

      // 其他错误
      return res.status(502).json({ error: '语音生成失败，请稍后重试' });
    }

    // ========== 8. 返回音频 ==========
    const audioBuffer = await upstream.arrayBuffer();

    // V1 改进：Cache-Control 改为 private, no-store（防止跨账号缓存泄露）
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Length', audioBuffer.byteLength);
    return res.status(200).send(Buffer.from(audioBuffer));

  } catch (err) {
    if (err?.name === 'AbortError') {
      console.warn('[tts] ElevenLabs request timeout');
      return res.status(504).json({ error: '语音生成超时，请重试' });
    }
    console.error('[tts] handler error:', err.message);
    return res.status(500).json({ error: '语音服务暂时不可用' });
  }
}
