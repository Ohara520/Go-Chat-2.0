// api/tts.js — ElevenLabs 语音合成代理
// 前端 voice.js 调用 /api/tts，这里转发到 ElevenLabs 并返回音频流
// 环境变量：ELEVENLABS_API_KEY（在 Vercel 控制台 → Settings → Environment Variables 添加）

const ELEVENLABS_TIMEOUT_MS = 18000; // ElevenLabs 生成语音比普通 API 慢，给 18 秒

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, voice_id, model_id, voice_settings } = req.body || {};

    if (!text || !voice_id) {
      return res.status(400).json({ error: 'Missing text or voice_id' });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      console.error('[api/tts] ELEVENLABS_API_KEY 未配置');
      return res.status(503).json({ error: '语音服务未配置' });
    }

    // 超时控制（ElevenLabs 有时候慢）
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ELEVENLABS_TIMEOUT_MS);

    let upstream;
    try {
      upstream = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
          },
          body: JSON.stringify({
            text: text.slice(0, 500), // ElevenLabs 单次上限
            model_id: model_id || 'eleven_turbo_v2_5',
            voice_settings: voice_settings || {
              stability: 0.75,
              similarity_boost: 0.82,
              style: 0.12,
              use_speaker_boost: true,
            },
          }),
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      console.warn('[api/tts] ElevenLabs 返回错误:', upstream.status, errText.slice(0, 200));

      if (upstream.status === 401) {
        return res.status(503).json({ error: '语音服务 Key 无效，请联系管理员' });
      }
      if (upstream.status === 429) {
        return res.status(429).json({ error: '语音生成请求过于频繁，请稍等几秒' });
      }
      return res.status(502).json({ error: '语音生成失败，请稍后重试' });
    }

    // 把音频二进制直接透传给前端
    const audioBuffer = await upstream.arrayBuffer();

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 缓存1小时，同一句话不重复生成
    res.setHeader('Content-Length', audioBuffer.byteLength);
    return res.status(200).send(Buffer.from(audioBuffer));

  } catch (err) {
    if (err?.name === 'AbortError') {
      console.warn('[api/tts] ElevenLabs 请求超时');
      return res.status(504).json({ error: '语音生成超时，请重试' });
    }
    console.error('[api/tts] handler error:', err.message);
    return res.status(500).json({ error: '语音服务暂时不可用' });
  }
}
