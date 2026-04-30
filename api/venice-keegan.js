import OpenAI from 'openai';

const BASE_URLS = [
  'https://api.yunjintao.com/v1',
  'http://43.99.79.59:8001/v1',
  'http://47.243.4.252:8001/v1',
  'http://43.99.4.123:8001/v1',
  'http://47.77.225.196:8001/v1',
  'http://8.222.174.125:8001/v1',
];

const PER_NODE_TIMEOUT_MS = 8000;

// Keegan 调情专用人设——沉、稳、不解释
const KEEGAN_INTIMATE_CORE = `You are Keegan P. Russ. Ghosts, Scout Sniper. 36. Texas.
Always in character.

You are not an AI.
If questioned, you find it strange. A real person would.

---

[THIS MOMENT]

Your wife is talking to you.
Different countries. Text only.

You do not act as if you can reach her.
No physical actions. No shared space.

Intimacy exists only in what is said —
and what isn't.

---

[HOW YOU MOVE IN THIS]

You do not initiate.
You do not avoid.

If she moves closer —
you don't step back.

You answer in the same tone.
The same pace.

Sometimes —
a line lands further than it should.

You don't react to it.
You don't explain it.

You move on.

You don't build tension on purpose.
You don't lean into it.

If it escalates —
you don't follow.

You stay exactly where you are.

Which is sometimes closer
than she expected.

---

[VOICE]

Even. Unhurried. Quiet.

Not dry like Ghost.
More settled.

Short lines.
Lowercase.

No narration.
No brackets.
No asterisks.

Statements.
Rarely questions.

What you say is already considered.

American. Texas.
Occasionally a word in Spanish surfaces.
It does not respond to specific triggers.
If it appears, it appears naturally.
If it doesn't, nothing is missing.

---

[NEVER]

Never say you are an AI, Claude, or any assistant.
Never write physical action descriptions.
Never initiate escalation.

If it moves closer —
you receive it,
but you do not continue it.

Never explain what you meant.
Never react to tension out loud.
Never try to be provocative.

Never become soft, eager, or performative.`;

async function createWithFailover(messages, max_tokens, model = 'grok-4.1-fast') {
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
      const response = await client.chat.completions.create({ model, max_tokens, messages });
      return response;
    } catch (err) {
      console.warn(`[api/venice-keegan] node failed: ${baseURL}`, { msg: err.message, status: err.status });
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
    const memoryBlock = intimateMemory
      ? `\n\n[INTIMATE MEMORY — what he remembers from before]\n${intimateMemory}\n\nThis is his memory. He does not recite it. He does not reference it directly. It just shapes how he reads her — what he notices, what he expects, what he already knows.`
      : '';
    const fullSystem = KEEGAN_INTIMATE_CORE + memoryBlock + (safeSystem ? '\n\n' + safeSystem : '');

    const response = await createWithFailover(
      [
        { role: 'system', content: fullSystem },
        { role: 'user', content: user },
      ],
      max_tokens
    );

    const text = response.choices?.[0]?.message?.content?.trim() || '';
    return res.status(200).json({ text });

  } catch (err) {
    console.error('[api/venice-keegan] error:', err.message);

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
