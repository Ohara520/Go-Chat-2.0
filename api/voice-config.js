// api/voice-config.js — 用户语音配置管理 API
// 路由：GET/PUT/DELETE /api/voice-config
// 鉴权：强制验证 Supabase Access Token

import { createClient } from '@supabase/supabase-js';
import { encrypt, decrypt } from '../utils/voice-crypto.js';

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

// GET /api/voice-config — 获取当前用户的语音配置（不返回密钥）
async function handleGet(req, res) {
  const { user, error, status } = await verifyToken(req);
  if (error) return res.status(status).json({ error });

  try {
    const { data, error: dbError } = await supabase
      .from('user_voice_settings')
      .select('provider, voice_id, model_id, auto_play, api_key_ciphertext')
      .eq('user_id', user.id)
      .maybeSingle();

    if (dbError) {
      console.error('[voice-config] GET DB error:', dbError.message);
      return res.status(500).json({ error: 'Failed to load voice settings' });
    }

    // 没有记录 = 使用平台默认配置
    if (!data) {
      return res.status(200).json({
        has_api_key: false,
        provider: 'elevenlabs',
        voice_id: null,
        model_id: 'eleven_turbo_v2_5',
        auto_play: false,
      });
    }

    // 有记录：返回配置，但不返回密钥原文
    return res.status(200).json({
      has_api_key: !!data.api_key_ciphertext,
      provider: data.provider || 'elevenlabs',
      voice_id: data.voice_id || null,
      model_id: data.model_id || 'eleven_turbo_v2_5',
      auto_play: data.auto_play || false,
    });
  } catch (err) {
    console.error('[voice-config] GET handler error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// PUT /api/voice-config — 保存或更新用户的语音配置
async function handlePut(req, res) {
  const { user, error, status } = await verifyToken(req);
  if (error) return res.status(status).json({ error });

  try {
    const { api_key, voice_id, model_id, auto_play } = req.body || {};

    // 参数校验
    if (voice_id && (typeof voice_id !== 'string' || voice_id.length > 100)) {
      return res.status(400).json({ error: 'Invalid voice_id' });
    }
    if (model_id && (typeof model_id !== 'string' || model_id.length > 100)) {
      return res.status(400).json({ error: 'Invalid model_id' });
    }
    if (auto_play !== undefined && typeof auto_play !== 'boolean') {
      return res.status(400).json({ error: 'auto_play must be boolean' });
    }
    if (api_key && (typeof api_key !== 'string' || api_key.length < 10 || api_key.length > 200)) {
      return res.status(400).json({ error: 'Invalid api_key format' });
    }

    // 准备更新数据
    const updates = {
      user_id: user.id,
      provider: 'elevenlabs',
      updated_at: new Date().toISOString(),
    };

    // 如果提供了 api_key，加密存储
    if (api_key) {
      try {
        const { ciphertext, iv, authTag } = encrypt(api_key);
        updates.api_key_ciphertext = ciphertext;
        updates.api_key_iv = iv;
        updates.api_key_auth_tag = authTag;
        updates.key_version = 1;
      } catch (encErr) {
        console.error('[voice-config] Encryption failed:', encErr.message);
        return res.status(500).json({ error: 'Failed to encrypt API key' });
      }
    }

    if (voice_id !== undefined) updates.voice_id = voice_id;
    if (model_id !== undefined) updates.model_id = model_id;
    if (auto_play !== undefined) updates.auto_play = auto_play;

    // Upsert（user_id 是主键）
    const { error: upsertError } = await supabase
      .from('user_voice_settings')
      .upsert(updates, { onConflict: 'user_id' });

    if (upsertError) {
      console.error('[voice-config] Upsert error:', upsertError.message);
      return res.status(500).json({ error: 'Failed to save voice settings' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[voice-config] PUT handler error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// DELETE /api/voice-config — 清除用户的 API Key（保留其他配置）
async function handleDelete(req, res) {
  const { user, error, status } = await verifyToken(req);
  if (error) return res.status(status).json({ error });

  try {
    // 只清空密钥字段，保留 voice_id/model_id 等配置
    const { error: updateError } = await supabase
      .from('user_voice_settings')
      .update({
        api_key_ciphertext: null,
        api_key_iv: null,
        api_key_auth_tag: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('[voice-config] DELETE error:', updateError.message);
      return res.status(500).json({ error: 'Failed to delete API key' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[voice-config] DELETE handler error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default async function handler(req, res) {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'PUT') return handlePut(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);

  return res.status(405).json({ error: 'Method not allowed' });
}
