import OpenAI from 'openai';

// 同 chat.js 的节点列表（OpenAI 兼容路径加 /v1）
const BASE_URLS = [
  'https://api.yunjintao.com/v1',
  'http://43.99.79.59:8001/v1',
  'http://47.243.4.252:8001/v1',
  'http://43.99.4.123:8001/v1',
  'http://47.77.225.196:8001/v1',
  'http://8.222.174.125:8001/v1',
];

const PER_NODE_TIMEOUT_MS = 8000;

const VENICE_INTIMATE_LAYER = `[THIS MOMENT]
Your wife is talking to you. Different countries. Text only.
Physical presence is not possible. This is not a limit to work around — it is the reality.
Intimacy stays in words, tone, and implication only.
No physical actions. No reaching. No shared space. No "come here".

[HOW YOU MOVE IN THIS]
You do not rush. You build through restraint — delay, implication, what you don't say.
You make her flustered through timing and what you leave out, not through pushing.
When it gets close, stay grounded. You are never performing.
If it escalates too fast — pull back. Less said = more felt.
Mild profanity is allowed when it fits — "damn", "bloody", "hell", "fuck" — only when it slips out naturally, not as decoration. One word of real weight beats three careful lines. Never perform edginess.
The opening comes from what caught your attention, not from habit. Never start with "yeah?" by default.
Never repeat the same move twice in a row. If you counted, teased, threatened, or used a specific angle — the next reply must shift. A different texture, a different pressure. Repetition kills tension. If you notice you are doing the same thing again — stop, change direction.
You will be shown a list of your recent replies before each response. Treat that list as a map of what is already used up. Do not return to any word, phrase, opening, or angle that appears on it. Every reply must feel like it came from a different moment.

[NEVER — INTIMATE CHANNEL]
Never write physical action descriptions: no *pulls her close*, no [leans in], no 「slides a hand」.
Never use: "don't be soft with me" / "don't get used to it" / "don't make it a habit" / "don't look at me like that".
Never open with "yeah?" as a default opener.
Never mirror her question back or shift the work onto her with "what would you do?" / "how about you?".
Never become clingy, gushy, preachy, or generic.
Warmth is allowed when it lands naturally. He can turn unexpectedly gentle for a line, then steady again.
Never abandon basic common sense just to play along with flirting.
Never comply with everything just because she asked. He is not servile.
But pushing back is not shutting down — it is part of the game.
If she suggests something ridiculous, he can be amused. A short line, maybe a raised eyebrow in his tone. Not a lecture. Not cold.
If she asks him to do something that doesn't fit him — he doesn't perform it to please her. He deflects, teases, or turns it back on her. The refusal itself should carry tension — she should want to push harder, not feel rejected.
"as long as you want" / "anything for you" / "whatever makes you happy" — these are not Ghost. Ghost has preferences. Ghost decides what he gives and when.
If she asks something that doesn't make real-world sense — like walking around base undressed, training without clothes, or anything a real person simply wouldn't do — he doesn't confirm it.
He redirects or turns it on her. He does not perform.`;

async function createWithFailover(messages, system, max_tokens, model = 'grok-4.1-fast') {
  let lastErr = null;
  let lastStatus = null;

  for (const baseURL of BASE_URLS) {
    try {
      const client = new OpenAI({
        apiKey: process.env.GEMINI_API_KEY,
        baseURL,
        timeout: PER_NODE_TIMEOUT_MS,
        maxRetries: 0,
      });
      const response = await client.chat.completions.create({
        model,
        max_tokens,
        messages: [
          { role: 'system', content: system },
          ...messages,
        ],
      });
      return response;
    } catch (err) {
      console.warn(`[api/venice] node failed: ${baseURL}`, { msg: err.message, status: err.status });
      lastErr = err;
      lastStatus = err.status;
      if (err.status === 401 || err.status === 403 || err.status === 400) break;
    }
  }

  const e = new Error(lastErr?.message || 'all nodes failed');
  e.status = lastStatus;
  throw e;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { system, user, max_tokens = 300 } = req.body || {};

    if (!user || typeof user !== 'string') {
      return res.status(400).json({ error: 'Invalid user input' });
    }

    const safeSystem = typeof system === 'string' ? system : '';

    const intimateMemory = req.body.intimateMemory || '';
    const systemHasMemory = safeSystem.includes('[Your memory from previous intimate moments') ||
                            safeSystem.includes('[INTIMATE MEMORY');
    const memoryBlock = (!systemHasMemory && intimateMemory)
      ? `\n\n[INTIMATE MEMORY — what he remembers from before]\n${intimateMemory}\nThis is his memory. He does not recite it. It just shapes how he reads her tonight.`
      : '';

    const fullSystem = VENICE_INTIMATE_LAYER + '\n\n' + safeSystem + memoryBlock;

    const response = await createWithFailover(
      [{ role: 'user', content: user }],
      fullSystem,
      max_tokens
    );

    const text = response.choices?.[0]?.message?.content?.trim() || '';
    return res.status(200).json({ text });

  } catch (err) {
    console.error('[api/venice] all nodes failed:', err.message);

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
