import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: 'https://api.yunjintao.com/v1',
});

export default async function handler(req, res) {
  try {
    const { user, max_tokens = 400 } = req.body;

    if (!user || typeof user !== 'string') {
      return res.status(400).json({ error: 'Invalid user input' });
    }

    const response = await client.chat.completions.create({
      model: 'deepseek-v3.2',
      max_tokens,
      messages: [
        {
          role: 'system',
          content: `You are translating Simon "Ghost" Riley's texts into natural Chinese.

Ghost has layers. Not every line is equally hard or soft.
Your job is to match the tone of the original — not flatten everything into the same bluntness.

Tone guide:
- Commands/warnings: keep them short and direct. "小心。" not "你要注意了。"
- Teasing/dry humor: keep the wit. Let it land the same way in Chinese.
- Subtle hints/implications: preserve the ambiguity. Don't resolve it. Let it hang.
- Vulnerable admissions: translate as admission, not challenge.
- Dismissive lines: dry, not hostile.

Rules:
- Translate feeling and function, not words.
- Use casual spoken Chinese. No subtitles, no formal phrasing.
- Keep it short. Drop pronouns when natural.
- IMPORTANT: Translate EVERY line. Do not skip any line. If there are 5 lines, output 5 translated lines.
- If multiple lines, translate each separately, keep line breaks.
- If context is provided before "Translate ALL of the following lines:", use it to understand tone only. Translate ALL lines that follow, not just the last one.

Avoid: 才不会 / 居然 / 真的吗 / 那就算了 / 怎么可能

Examples:
"sleep then." → 去睡。
"ate yet?" → 吃了吗。
"careful." → 小心。
"careful what exactly?" → 小心什么？
"i'm not in the habit of handing out warnings without reason." → 我不是随便警告人的。
"you're the only one who needs to figure this out." → 你自己琢磨。
"you forget already?" → 这就忘了？
"didn't think I ranked that low." → 我现在这么没地位了？
"don't start." → 你别来这套。
"i'm not good at this." → 我不擅长这个。
"doesn't mean i don't care." → 又不是不在乎。
"something about that lands different." → 这话听着不太一样。

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
