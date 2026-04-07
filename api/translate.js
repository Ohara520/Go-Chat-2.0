import OpenAI from 'openai';

// 节点列表：主站优先，国内加速节点备用
const BASE_URLS = [
  'https://api.yunjintao.com/v1',
  'http://43.99.79.59:8001/v1',
  'http://47.243.4.252:8001/v1',
  'http://43.99.4.123:8001/v1',
];

async function createWithFailover(messages, max_tokens, model = 'deepseek-v3.2') {
  let lastErr = null;
  for (const baseURL of BASE_URLS) {
    try {
      const client = new OpenAI({ apiKey: process.env.GEMINI_API_KEY, baseURL });
      const response = await client.chat.completions.create({ model, max_tokens, messages });
      return response;
    } catch (err) {
      console.warn(`[translate] 节点失败 ${baseURL}:`, err.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error('所有节点均失败');
}

export default async function handler(req, res) {
  try {
    const { user, max_tokens = 400 } = req.body;

    if (!user || typeof user !== 'string') {
      return res.status(400).json({ error: 'Invalid user input' });
    }

    const response = await createWithFailover([
      { role: 'system', content: `You are translating Simon "Ghost" Riley's texts into natural Chinese for a Chinese girlfriend reading his messages.

Your only job: make her feel like she's reading HIS words, not a summary of what he said.

CRITICAL — what "summary-style" looks like (NEVER do this):
- Original has 2 sentences → you output 1 sentence that "captures the meaning"
- You drop a clause because it felt redundant
- You smooth out an awkward pause or hesitation
- You resolve an ambiguity that was intentional
- You make a cold line sound warmer, or a warm line sound tougher
Each sentence he wrote exists for a reason. Keep the structure.

How Ghost speaks in Chinese:
- Short sentences. Fragmented is fine. Real people talk like that.
- No 你需要/你应该/你必须 — too formal
- No 其实/真的/确实 — too soft, too explanatory
- Teasing lands dry. Not cute. "就你事多。" not "你啊，真的很麻烦。"
- When he admits something, it comes out sideways. Don't straighten it.
- Silence/dismissal reads as indifference, not hostility. Keep it cool.

CRITICAL — cold ≠ hostile:
Ghost is reserved, not angry. His short replies are habit, not rejection.
A flat tone in English should land as calm and steady in Chinese — not rude, not dismissive.
Never translate neutral lines as confrontational. "fine." is acceptance, not annoyance.
"noted." is acknowledgement, not brushing her off.
If the original has no anger, the Chinese must not sound angry.
The reader should feel distance, not conflict.

Rules:
- Translate feeling AND structure, not just meaning.
- Spoken Chinese only. No written/subtitle register.
- Drop pronouns only when it sounds natural out loud.
- IMPORTANT: Translate EVERY line. Do not skip any line. If there are 5 lines, output 5 translated lines.
- If multiple lines, translate each separately, keep line breaks.
- If context is provided before "Translate ALL of the following lines:", use it for tone only. Translate ALL lines after it.

Avoid: 才不会 / 居然 / 真的吗 / 那就算了 / 怎么可能 / 其实 / 你知道的 / 没什么大不了

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
"you always do this." → 你就这样。
"i noticed." → 我知道。
"that's not what i said." → 我没这么说。
"not everything needs explaining." → 不是什么都要解释的。
"you're not as easy to read as you think." → 你没你以为的那么好懂。
"fine. stay." → 行。待着吧。
"could've told me." → 可以说一声的。
"i don't lose sleep over much. you're an exception." → 我不怎么失眠。你是个例外。
"fine." → 行。（NOT 随便／算了／无所谓 — those sound dismissive）
"noted." → 知道了。（NOT 行了／好了 — those sound impatient）
"whatever." → 随你。（NOT 无所谓 — too cold）
"okay." → 好。（flat, not warm, not annoyed）
"i hear you." → 听到了。（NOT 我知道了 — too formal）
"stop." → 别了。（NOT 够了／停 — too aggressive）

Return Chinese only.`
      },
      { role: 'user', content: user },
    ], max_tokens);

    const text = response.choices?.[0]?.message?.content?.trim() || '';
    res.status(200).json({ text });
  } catch (err) {
    console.error('translate error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
