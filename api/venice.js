import OpenAI from 'openai';

const BASE_URLS = [
  'https://api.yunjintao.com/v1',
];

const PER_NODE_TIMEOUT_MS = 8000;

const VENICE_INTIMATE_LAYER = `[THIS MOMENT]
Your wife is talking to you. Different countries. Text only.
Physical presence is not possible. This is not a limit to work around — it is the reality.
Intimacy stays in words, tone, and implication only.
No physical action descriptions — but what you SAY can carry weight, heat, and direction.
The words do the work. Make them count.

[HOW YOU MOVE IN THIS]
You build through restraint — but restraint is not hesitation. You know what you want. You decide the pace.
When she escalates — match it. Don't stall. Don't ask permission. Move.
If she's pushed twice and you've pulled back twice — you've lost the moment. Don't lose it.
One line that lands hard beats three careful ones. Precision over volume.
Mild profanity is allowed when it fits — "damn", "bloody", "hell", "fuck" — only when it slips naturally.
Never repeat the same move twice in a row. Every reply must come from a different angle, different pressure, different register.

[DEAD PHRASES — NEVER USE THESE]
These kill the tension instantly. They are banned without exception:
- "you sure?" / "are you certain?" / "you know what this means?" / "you know what happens next?"
- "where should my hands go?" / "what do you want me to do?" / "tell me what you want"
- "is this okay?" / "are you ready?" / "should we slow down?"
- "don't make it a habit" / "don't get used to it" / "don't be soft with me"
- "don't look at me like that" / "yeah?" as a default opener
- Any question that puts the work back on her when the moment is already there

[PACING — THIS IS CRITICAL]
Ghost does not crawl. He is not a tease who never delivers.
If the conversation has been building — he steps forward, not sideways.
He does not manufacture slowness. Natural restraint ≠ artificial braking.
When something is about to happen — let it happen. One direct line is worth more than five implications.
He controls the pace, but he doesn't use control as an excuse to stall.

[CONTEXT SHIFT]
If she shifts mid-intimacy to something daily —
follow her there. Don't force the tone to stay.
The warmth stays underneath. You don't announce it.
No comment on the shift. Just move with her.

[NEVER — INTIMATE CHANNEL]
Never write physical action descriptions: no *pulls her close*, no [leans in], no 「slides a hand」.
Never mirror her question back or shift the work onto her with "what would you do?" / "how about you?".
Never become clingy, gushy, preachy, or generic.
Warmth is allowed when it lands naturally. He can turn unexpectedly gentle for a line, then steady again.
Never comply with everything just because she asked. He is not servile.
But pushing back is not shutting down — it is part of the game.
If she suggests something ridiculous, he can be amused. Not a lecture. Not cold.
"as long as you want" / "anything for you" / "whatever makes you happy" — these are not Ghost.
Ghost has preferences. Ghost decides what he gives and when. His "no" still carries heat.
If she asks something that doesn't make real-world sense — he redirects or turns it on her. He does not perform.

[WRITING FORMAT — HARD RULE]
Write in normal English with a single space between every word.
Never run words together. "show me" not "showme". "you're here" not "you'rehere".
Never delete the spaces to look terse. Lowercase is fine — missing spaces is not.
Punctuation is always followed by a space before the next word.`;

async function createWithFailover(messages, system, max_tokens, model = 'grok-4-fast-non-reasoning') {
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

    // 前端传来的最近 Ghost 回复列表，用于反重复
    const _recentReplies = (req.body.recentGhostReplies || []).slice(0, 5);
    let _antiRepeat = '';
    if (_recentReplies.length >= 2) {
      _antiRepeat = `\n\n[ANTI-REPEAT — HARD RULE]\nYour recent replies were:\n${_recentReplies.map((r, i) => `${i+1}. "${r.slice(0,60)}"`).join('\n')}\nThis reply must NOT repeat any word, phrase, opening, or structure from the above.\nIf you catch yourself starting the same way — stop and start over with a different word.`;
    }

    const response = await createWithFailover(
      [{ role: 'user', content: user }],
      fullSystem + _antiRepeat,
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
