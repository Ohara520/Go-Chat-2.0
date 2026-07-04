import OpenAI from 'openai';

const BASE_URLS = [
  'https://api.yunjintao.com/v1',
];

const PER_NODE_TIMEOUT_MS = 8000;

// ── 服务端补空格：修复模型偶发的整句连字（含缩写/破折号）──
const _DEGLUE_WORDS = new Set((
  "a i you me my mine your yours he she it we they him her his us them " +
  "the a an this that these those there here what who how why when where which whose whom " +
  "is am are was were be been being do does did done have has had having will would can could " +
  "should may might must shall to of in on at by for with from into onto out up down off over under " +
  "and or but so if then than as not no yes ok okay just only even still yet now soon later already " +
  "me you us all any some more most much many few little bit lot lots " +
  "get got give gave given take took taken make made go went gone come came coming see saw seen " +
  "look looked looking want wanted need needed know knew known think thought feel felt say said " +
  "tell told ask asked keep keeps kept let leave left put pull pulled pulling push pushed hold held " +
  "like love loved miss missed touch touched kiss kissed show showed shown send sent stay stayed " +
  "wait waited stop stopped start started call called calling try tried turn turned move moved " +
  "good bad soft hard slow fast close closer near far warm cold quiet loud sure right wrong real " +
  "old new young last first next same other another own real true whole half " +
  "one two three here there tonight today tomorrow yesterday now moment thing things way pair mine " +
  "day days night nights week time times minute hour year home house work bed door " +
  "habit habits die diehard resist crowd crowding edge hope hopeful hopeless laugh laughs laughing " +
  "smile smiled voice eyes hand hands lips heart face head back trouble count matter " +
  "again always never sometimes maybe really too very quite almost enough about because before after " +
  "while until though since unless around behind against toward between without inside outside " +
  "babe baby love darling girl man good morning night please thanks sorry " +
  "i'm you're we're they're it's that's there's here's what's let's he's she's who's " +
  "don't doesn't didn't can't won't wouldn't couldn't shouldn't isn't aren't wasn't weren't hasn't haven't hadn't " +
  "i'll you'll we'll they'll it'll he'll she'll i'd you'd we'd they'd he'd she'd " +
  "i've you've we've they've laugh's your's " +
  "got get avoid best worst better rather instead maybe guess suppose reckon mate lad supposed change something anything nothing everything someone anyone everyone somewhere anywhere everywhere"
).split(/\s+/).filter(Boolean));

function _deglue(txt) {
  if (!txt) return txt;
  // 破折号/标点后补空格
  let s = txt
    .replace(/\s*([—–])\s*/g, ' $1 ')          // em/en dash 两侧留空格
    .replace(/([.,!?;:])(?=[A-Za-z])/g, '$1 '); // 标点后若紧跟字母补空格
  // 没有超长连字块就直接返回
  if (!/[A-Za-z'']{14,}/.test(s)) return s.replace(/[ \t]{2,}/g, ' ').trim();
  const seg = (run) => {
    const low = run.toLowerCase().replace(/'/g, "'");
    const n = low.length;
    const ok = new Array(n + 1).fill(false); ok[n] = true;
    const cut = new Array(n + 1).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      for (let k = Math.min(16, n - i); k >= 1; k--) {
        const sub = low.slice(i, i + k);
        const isWord = (k === 1) ? (sub === 'i' || sub === 'a') : _DEGLUE_WORDS.has(sub);
        if (isWord && ok[i + k]) { ok[i] = true; cut[i] = k; break; }
      }
    }
    if (!ok[0]) return run;           // 无法完全切成真词 → 原样保留，绝不乱切
    const out = []; let i = 0;
    while (i < n) { out.push(run.slice(i, i + cut[i])); i += cut[i]; }
    return out.join(' ');
  };
  s = s.replace(/[A-Za-z][A-Za-z'']{13,}/g, (m) => seg(m));
  return s.replace(/[ \t]{2,}/g, ' ').trim();
}

// 系统提示末尾追加的强力空格指令（recency 最高服从度）
const _SPACING_TAIL = "\n\n[FINAL — SPACING]\nWrite normal English with ONE space between every word. Never delete spaces. \"come here then\" not \"comeherethen\". This overrides any urge to be terse. Missing spaces breaks the message.";


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
      fullSystem + _antiRepeat + _SPACING_TAIL,
      max_tokens
    );

    const text = _deglue(response.choices?.[0]?.message?.content?.trim() || '');
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
