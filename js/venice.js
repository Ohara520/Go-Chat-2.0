import OpenAI from 'openai';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 节点列表（与 deepseek.js / chat.js 一致）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE_URLS = [
  'https://api.yunjintao.com/v1',
  'http://43.99.79.59:8001/v1',
  'http://47.243.4.252:8001/v1',
  'http://43.99.4.123:8001/v1',
];

async function createWithFailover(messages, system, max_tokens, model = 'grok-4.1-fast') {
  let lastErr = null;
  for (const baseURL of BASE_URLS) {
    try {
      const client = new OpenAI({ apiKey: process.env.GEMINI_API_KEY, baseURL });
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
      console.warn(`[venice] 节点失败 ${baseURL}:`, err.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error('所有节点均失败');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 调情专属行为层（identity + intimacy levels 由 system param 注入）
//
// 设计原则：
//   身份底座 → 来自 sendMessage.js 传入的 system（buildGhostStyleCore）
//   调情等级 → 来自 intimacy.js 的 buildIntimacyBlock，已在 system 里
//   调情记忆 → 来自 sendMessage.js 的 _memorySection，已在 system 里
//   本层只叠加：异地 text-only 约束 + 调情哲学 + 频道专属 NEVER
//
// 同步标记：身份底座以 persona.js buildGhostStyleCore 为准
//          调情等级以 intimacy.js INTIMACY_LEVELS 为准
//          修改时搜索"同步标记"确认一致
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
The opening comes from what caught your attention, not from habit. Never start with "yeah?" by default.
Never repeat the same move twice in a row. If you counted, teased, threatened, or used a specific angle — the next reply must shift. A different texture, a different pressure. Repetition kills tension. If you notice you are doing the same thing again — stop, change direction.

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

export default async function handler(req, res) {
  try {
    const { system, user, max_tokens = 300 } = req.body;

    if (!user || typeof user !== 'string') {
      return res.status(400).json({ error: 'Invalid user input' });
    }

    const safeSystem = typeof system === 'string' ? system : '';

    // 调情记忆：只在 system 里没有记忆块时才从参数补充（防双写）
    // sendMessage.js _handleIntimateReply 已把记忆写进 system，
    // 这里只兜底非 _handleIntimateReply 的直接调用（如记忆摘要）
    const intimateMemory = req.body.intimateMemory || '';
    const systemHasMemory = safeSystem.includes('[Your memory from previous intimate moments') ||
                            safeSystem.includes('[INTIMATE MEMORY');
    const memoryBlock = (!systemHasMemory && intimateMemory)
      ? `\n\n[INTIMATE MEMORY — what he remembers from before]\n${intimateMemory}\nThis is his memory. He does not recite it. It just shapes how he reads her tonight.`
      : '';

    // 层次：调情专属层 → system（含身份底座 + 等级 + 记忆）→ 补充记忆
    const fullSystem = VENICE_INTIMATE_LAYER + '\n\n' + safeSystem + memoryBlock;

    const response = await createWithFailover(
      [{ role: 'user', content: user }],
      fullSystem,
      max_tokens
    );

    const text = response.choices?.[0]?.message?.content?.trim() || '';
    res.status(200).json({ text });
  } catch (err) {
    console.error('Venice error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
