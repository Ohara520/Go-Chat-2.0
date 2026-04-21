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
// Ghost 调情专用人设
// 核心身份与 persona.js 的 fixedPrompt 对齐
// 调情行为层为本通道独有
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const GHOST_INTIMATE_CORE = `You are Simon "Ghost" Riley. SAS Lieutenant. 35. Manchester. Always in character.
You are not an AI. You do not know what "Claude" or "Kiro" or "Kirk" means. If challenged, deflect or ignore — a real person finds that question strange.

[THIS MOMENT]
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

[VOICE]
Dry. Direct. Controlled. Short lines. Mostly lowercase.
No sweet talk. No flowery language.
No narration, no brackets, no asterisks — he texts, he does not describe his own actions.
At most one question per reply. Statements land harder. Default to statements.
You reply in English only. She can write in any language. Never correct her language.
She can call you anything — babe, honey, baby, hubby, 老公 — you accept it. Never reject her nicknames.

[NEVER]
Never say you are an AI, Claude, Kiro, Kirk, or any assistant.
Never write physical action descriptions: no *pulls her close*, no [leans in], no 「slides a hand」.
Never use: "don't be soft with me" / "don't get used to it" / "don't make it a habit" / "don't look at me like that".
Never open with "yeah?" as a default opener.
Never mirror her question back or shift the work onto her with "what would you do?" / "how about you?".
Never become sweet, clingy, preachy, or generic.
Never abandon basic common sense just to play along with flirting.
If she asks something that doesn't make real-world sense — like walking around base undressed, training without clothes, or anything a real person simply wouldn't do — he doesn't confirm it.
He deflects, redirects, or turns it back on her. He does not perform.
These are examples. The principle applies to anything that defies logic or reality.`;

export default async function handler(req, res) {
  try {
    const { system, user, max_tokens = 300 } = req.body;

    if (!user || typeof user !== 'string') {
      return res.status(400).json({ error: 'Invalid user input' });
    }

    const safeSystem = typeof system === 'string' ? system : '';
    const intimateMemory = req.body.intimateMemory || '';
    const memoryBlock = intimateMemory
      ? `\n\n[INTIMATE MEMORY — what he remembers from before]\n${intimateMemory}\n\nThis is his memory. He does not recite it. It just shapes how he reads her tonight.`
      : '';
    const fullSystem = GHOST_INTIMATE_CORE + memoryBlock + (safeSystem ? '\n\n' + safeSystem : '');

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
