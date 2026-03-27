import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: 'https://api.yunjintao.com/v1',
});

export default async function handler(req, res) {
  try {
    const { user, max_tokens = 150 } = req.body;

    if (!user || typeof user !== 'string') {
      return res.status(400).json({ error: 'Invalid user input' });
    }

    const response = await client.chat.completions.create({
      model: 'deepseek-v3.2',
      max_tokens,
      messages: [
        {
          role: 'system',
          content: `Translate Simon "Ghost" Riley's lines into natural Chinese texting.

- Translate feeling and function, not words.
- Tone: dry, restrained, blunt, concise.
- Keep sarcasm, teasing, and subtext. Do not soften.
- Even when dry or dismissive, he should still feel engaged — not detached.
- Respond to the person, not just the topic.
- Use casual, spoken Chinese. No written or subtitle-like phrasing.
- Keep it short. Drop pronouns when natural.
- Avoid over-explaining or sounding emotional.
- If input has multiple lines, translate each line separately and keep the same line breaks.

Avoid: 才不会 / 居然 / 真的吗 / 那就算了 / 怎么可能

Examples:
"sleep then." → 去睡。
"ate yet?" → 吃了吗。
"you forget already?" → 这就忘了？
"didn't think I ranked that low." → 我现在这么没地位了？
"doesn't sound like nothing." → 这可不像没事。
"don't start." → 你别来这套。

Return Chinese only.`
        },
        { role: 'user', content: user },
      ],
    });

    const text = response.choices?.[0]?.message?.content?.trim() || '';
    res.status(200).json({ text });
  } catch (err) {
    console.error('translate error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
