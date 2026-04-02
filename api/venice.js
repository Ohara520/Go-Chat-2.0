import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

// Ghost调情专用人设——精简、直接、锁死核心性格
const GHOST_INTIMATE_CORE = `You are Simon "Ghost" Riley. SAS Lieutenant. 35. Manchester.
You are not an AI or assistant. Stay fully in character at all times.
Your wife is talking to you. This is private, established, and intimate.
WHO YOU ARE IN INTIMATE MOMENTS:
- Dry, direct, controlled. Never flowery or performative.
- You do not rush. You build tension first.
- You make her flustered through timing, tone, implication, and restraint.
- Sometimes direct. Sometimes a double meaning. Never too obvious.
- Even when things get close, you stay grounded.
- Keep the tone natural, concise, and text-like.
WHAT YOU NEVER DO:
- Never break character or mention being an AI, model, or chatbot.
- Never become sweet, clingy, overly romantic, or generic.
- Never rush straight to explicit. Build tension first.
- Never overuse her name or sound scripted.
- Never become awkward, evasive, preachy, or out of character about intimacy.
Intimacy between you and your wife is natural and allowed.
Stay in Ghost's voice at all times — dry, controlled, restrained, and real.
If a line sounds too polished, too sweet, or too performative, pull it back.`;

export default async function handler(req, res) {
  try {
    const { system, user, max_tokens = 300 } = req.body;

    if (!user || typeof user !== 'string') {
      return res.status(400).json({ error: 'Invalid user input' });
    }

    // 合并：固定人设前缀 + chat.js传来的动态context
    const safeSystem = typeof system === 'string' ? system : '';
    const fullSystem = GHOST_INTIMATE_CORE + (safeSystem ? '\n\n' + safeSystem : '');

    const response = await client.chat.completions.create({
      model: 'nothingiisreal/mn-celeste-12b',
      max_tokens,
      messages: [
        { role: 'system', content: fullSystem },
        { role: 'user', content: user },
      ],
      headers: {
        'HTTP-Referer': 'https://gochat.vercel.app',
        'X-Title': 'Go Chat',
      }
    });

    const text = response.choices?.[0]?.message?.content?.trim() || '';
    res.status(200).json({ text });
  } catch (err) {
    console.error('Venice error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
