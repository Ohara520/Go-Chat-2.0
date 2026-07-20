import OpenAI from 'openai';

const BASE_URLS = [
  'https://api.yunjintao.com/v1',
];

const PER_NODE_TIMEOUT_MS = 8000;

// ── 服务端补空格：修复模型偶发的整句连字（含缩写/破折号）──
const _DEGLUE_WORDS = new Set((
  "a i o oh ah k ok okay yes yeah yep nope no not now new own out off up on in at by to of as so if or and but for the a an this that these those there here what who whom whose how why when where which " +
  "is am are was were be been being do does did done doing have has had having will would shall should can could may might must " +
  "me my mine you your yours he him his she her hers we us our ours they them their theirs it its myself yourself himself herself " +
  "one two three first last next only just even still yet all any some more most much many few little bit lot lots both each every " +
  "go goes went gone going come comes came coming get gets got gotten give gives gave given take takes took taken make makes made making " +
  "want wants wanted need needs needed know knows knew known think thinks thought feel feels felt say says said tell tells told ask asks asked " +
  "keep keeps kept let lets leave leaves left put puts pull pulls pulled pulling push pushes pushed hold holds held " +
  "like likes liked love loves loved miss missed touch touches touched kiss kisses kissed hug hugs show shows showed shown " +
  "send sends sent stay stays stayed wait waits waited stop stops stopped start starts started try tries tried turn turns turned " +
  "move moves moved run runs ran walk walks walked look looks looked see sees saw seen watch watches watched hear hears heard listen " +
  "prove proves proved forget forgets forgot forgotten remember remembers regret regrets hesitate hesitated whisper whispers whispering " +
  "breathe breathless breath quiet loud soft hard slow fast close closer closest near far warm cold hot fire warmth " +
  "good better best bad worse worst nice sweet kind gentle rough real true whole half sure right wrong worth deserve " +
  "day days night nights morning evening tonight today tomorrow yesterday week weekend month year time times moment " +
  "home house bed door room floor world life way ways word words name names voice eyes hand hands lips heart face head skin body arms " +
  "fine well then than as too very quite almost enough really maybe perhaps about because before after while until since unless though although " +
  "around behind against toward between without inside outside over under above below through across along into onto from with " +
  "stick sticks stuck earn earns earned wear wears wore worn taste tastes bite bites mean means meant " +
  "babe baby love darling girl man boy mate lad sweetheart dear " +
  "i'm you're we're they're it's that's there's here's what's let's he's she's who's how's " +
  "don't doesn't didn't can't won't wouldn't couldn't shouldn't isn't aren't wasn't weren't hasn't haven't hadn't ain't " +
  "i'll you'll we'll they'll it'll he'll she'll i'd you'd we'd they'd he'd she'd i've you've we've they've " +
  "gonna wanna gotta lemme " +
  "something anything nothing everything someone anyone everyone somewhere anywhere everywhere nowhere " +
  "exactly already always never sometimes ever supposed change no push button figure face soon those person people mind mine sound round found around ground word world could would should relationship complicated understand everything something beautiful comfortable conversation immediately absolutely different remember together whatever forever probably actually finally honestly seriously"
).split(/\s+/).filter(Boolean));

function _deglue(txt) {
  if (!txt) return txt;
  let s = txt.replace(/\s*([\u2014\u2013])\s*/g, ' $1 ').replace(/([.,!?;:])(?=[A-Za-z])/g, '$1 ');
  if (!/[A-Za-z'\u2019]{8,}/.test(s)) return s.replace(/[ \t]{2,}/g, ' ').trim();
  const _isW = (sub) => {
    if (sub.length === 1) return sub === 'i' || sub === 'a';
    if (_DEGLUE_WORDS.has(sub)) return true;
    const _suf = ['s','es','ed','ing','er','ers','est','ly','ies','ings'];
    for (const suf of _suf) {
      if (sub.length > suf.length + 1 && sub.endsWith(suf)) {
        const base = sub.slice(0, -suf.length);
        if (_DEGLUE_WORDS.has(base)) return true;
        if ((suf==='ing'||suf==='ed'||suf==='er') && _DEGLUE_WORDS.has(base+'e')) return true;
        if ((suf==='ing'||suf==='ed'||suf==='er') && base.length>=3 && base[base.length-1]===base[base.length-2] && _DEGLUE_WORDS.has(base.slice(0,-1))) return true;
        if (suf==='ies' && _DEGLUE_WORDS.has(base+'y')) return true;
      }
    }
    return false;
  };
  const _seg = (run) => {
    const low = run.toLowerCase().replace(/\u2019/g, "'");
    const n = low.length;
    const ok = new Array(n + 1).fill(false); ok[n] = true;
    const cut = new Array(n + 1).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      for (let k = Math.min(18, n - i); k >= 1; k--) {
        if (_isW(low.slice(i, i + k)) && ok[i + k]) { ok[i] = true; cut[i] = k; break; }
      }
    }
    if (!ok[0]) return run;
    const out = []; let i = 0;
    while (i < n) { out.push(run.slice(i, i + cut[i])); i += cut[i]; }
    return out.join(' ');
  };
  s = s.replace(/[A-Za-z][A-Za-z'\u2019]{7,}/g, (m) => _seg(m));
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

    // 检测严重吞空格 → 标记需要重试
    // 判据：有一个 15+ 字母的超长粘连串，或 2 个以上 10+ 的串
    // （已验证：能命中整句连字，且不误伤 everything/unbelievable 这类正常长词）
    const _gluedRuns = text.match(/[A-Za-z']{10,}/g) || [];
    const needsRetry = _gluedRuns.some(r => r.length >= 15) || _gluedRuns.length >= 2;

    return res.status(200).json({ text, needsRetry });

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
