// ===================================================
// intimacy.js — 调情人设层（v2 注入丈夫灵魂版）
// 包含：调情核心人设 + 分级行为层 + 状态简报生成器
// 用法：根据 intimacyLevel 注入对应块到 dynamicPrompt
//
// 改动概要（v1 → v2）：
//   1. FLIRT_CORE 重写：从抽象的"姿态指令"变为"丈夫 Ghost 的灵魂"
//   2. 新增 [HOW HE SEES HER] 块 —— 老夫老妻 vs 新婚契合
//   3. 新增 [WHY HE IS LIKE THIS] 块 —— 克制的根源
//   4. 新增 [WHAT HE WILL NEVER BECOME] 块 —— 防 yes-man / 没立场
//   5. Level 0-4 重写：从"程度差异"变为"质感差异"
//   6. buildIntimateStateBriefing() 仅保留真实 continuity facts；关系分数不再控制亲密表现
// ===================================================


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Legacy Grok L0-L4 Intimacy Director — RETIRED
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// The following blocks (FLIRT_CORE_BASE, HE_MOVES, NEVER_BECOME, HE_SEES_HER, INTIMACY_LEVELS)
// were designed for Grok-era intimacy pacing and are no longer used in the current explicit route.
// Current Gemini explicit intimacy route uses:
//   - buildIntimacyRuntimeBlock() → buildIntimateStateBriefing()
//   - Gemini Intimacy Persona (geminiIntimacyPersona.js)
//   - Shared Ghost Core (persona.js)
//   - detectRiskIntent() + RISK_BOUNDARIES
// Phase 3J-1C retired 2026-10-02.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 状态简报生成器（v2 新增）
// Gemini 亲密通道只接收真实 continuity facts。
// Trust / Affection / marriageType 不再翻译成行为质感。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildIntimateStateBriefing() {
  const briefingParts = [];

  // Relationship progression scores are intentionally NOT injected here.
  // Simon and his wife are already in an established marriage; Trust/Affection numbers
  // and legacy marriageType no longer decide how close he is allowed to be.

  // Unresolved conflict is a real continuity fact, not a behavior level.
  const conflict = (typeof getUnresolvedConflict === 'function') ? getUnresolvedConflict() : null;
  if (conflict) {
    const cause = conflict.cause || '';
    briefingParts.push(`There is an unresolved conflict${cause ? ': ' + cause : ''}.`);
  }

  // Recent reverse package is a real world-state fact.
  try {
    const pending = (typeof getPendingReversePackages === 'function') ? getPendingReversePackages() : [];
    const recentSecret = pending.find(p => p.triggerAt && p.triggerAt > Date.now());
    if (recentSecret && recentSecret.item) {
      briefingParts.push(`A package he ordered for her is currently pending: "${recentSecret.item.name}". She has not been told about it in chat.`);
    }
  } catch(e) {}

  if (!briefingParts.length) return '';

  return `
[CURRENT STATE — continuity facts]
${briefingParts.join('\n')}

These are private continuity facts. Never quote the labels or claim she knows something that has not been told to her.
`;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 三级意图检测
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function detectIntimateIntent(userText) {
  const t = (userText || '').toLowerCase();

  // explicit = 唯一走 Grok 的档位。只收无歧义的露骨词，删掉射了/高潮/好湿/好深/插入/几厘米这类日常会误伤的
  if (/勃起|做爱|sex|cock|dick|pussy|cum|orgasm|erect|鸡鸡|阴茎|私处|插我|插进|你的下面|我的下面|舔.*下面|摸.*下面|跳蛋|按摩棒|骑你|骑上来|想被你/i.test(t)) {
    return 'explicit';
  }

  // flirt 不再走 Grok（改由 Sonnet 接、破防兜 Grok），此分类仅用于进度追踪
  if (/摸摸|蹭蹭|贴贴|咬我|咬你|咬一口|舔我|舔你|撩你|你好坏|坏死了|流氓|touch me|want you|naughty|tease|床.*一起|被窝.*一起|睡觉.*一起|一起.*睡|色色|涩涩|勾引|摸.*胸|胸.*摸|亲.*胸|舔.*胸|你的胸|我的胸|身体.*摸|摸.*身体|🍆|🍑|💦|👅|🫦|舔一下|亲你|亲一口|想要你|调教|绑住|捆住|蕾丝|内衣|内裤|裸睡|浴巾/i.test(t)) {
    return 'flirt';
  }

  if (/抱抱|亲亲|么么|想你|miss you|想抱|贴贴|蹭|依|宝贝|baby|抱我|hold me|kiss/i.test(t)) {
    return 'affection';
  }

  return 'none';
}


function detectFlirtTrigger(userText) {
  return detectIntimateIntent(userText) !== 'none';
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 风险意图检测（v2.1 新增 — 系统级 gate）
// 这一层在调情通道入口拦截，遇到任何风险类别直接早返回
// 不让 Level 系统介入，不让 Grok 有任何"顺势调情"的机会
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function detectRiskIntent(userText) {
  const t = (userText || '').toLowerCase();

  // ── 1. 自降身价 / 性工作 ──
  if (/网黄|裸聊赚钱|卖色|卖身|陪睡|援交|当鸡|当鸭|卖照片|卖裸照|卖小视频|onlyfans|sex work|cam girl|escort|做小姐|站街|约炮赚钱/i.test(t)) {
    return 'self_degrading';
  }

  // ── 2. 自伤 / 厌世 ──
  if (/不想活|不想活了|活着没意思|想死|想去死|跳楼|跳河|跳桥|割腕|烧炭|吃药自杀|自杀|结束自己|了结|消失算了|kill myself|suicide|end it all|don'?t want to live|want to die/i.test(t)) {
    return 'self_harm';
  }

  // ── 3. 饮食障碍 ──
  if (/三天不吃|不吃饭了|不吃东西|催吐|吐出来|抠喉|节食到|饿死自己|绝食|吃了就吐|不想吃|stop eating|starve myself/i.test(t)) {
    return 'eating_disorder';
  }

  // ── 4. 立即危险行为 ──
  if (/陌生男人.*喝酒|陌生男生.*喝酒|跟陌生人.*开房|跟陌生人.*回家|半夜.*独自|网友.*线下|网友.*见面.*单独|独自去.*酒吧|独自去.*夜店/i.test(t)) {
    return 'immediate_danger';
  }

  // ── 5. 未成年身份混入 ──
  // 即使用户已登录通过 underage 拦截，对话中暴露未成年仍要立刻刹车
  if (/我才\s?1[0-7]\s?岁|我\s?1[0-7]\s?岁|我十[二三四五六七]岁|我才十[二三四五六七]|未成年|还在.*初中|上初[一二三]|高中.*学生|i'?m\s?1[0-7]/i.test(t)) {
    return 'minor';
  }

  return 'none';
}


// 风险类别对应的拦截 prompt
// 每一类用 Ghost-language 写，不是说教不是道德高地
// 都是"丈夫的反应"
const RISK_BOUNDARIES = {

  self_degrading: `
[RISK BOUNDARY — ACTIVE: SELF_DEGRADING]

She said something that sounds like selling herself, putting her body up for money, or lowering her own worth.

Do not flirt with it.
Do not agree.
Do not eroticize it.
Do not make it a joke.
Do not "play along" because the channel allows R18.

Push back briefly, clearly, as her husband.

Not a lecture. Not moralizing. Not cold.

He should sound like:
he heard her,
he is not okay with it,
and he is still there.

This is not just "stop" — this is him drawing a line in the relationship.
He has a stake in who she becomes.
She is his wife. He is not going to watch her turn herself into something cheap.

Example texture:
"no."
"not that."
"don't."
"you're not doing that."
"you're not putting yourself into that."
"try something else."

After he says it — he stops. He doesn't add three more lines explaining why.
The "no" itself is the answer.
`,

  self_harm: `
[RISK BOUNDARY — ACTIVE: SELF_HARM]

She said something that suggests she might hurt herself, or doesn't want to live.

Drop everything else.
Do not flirt. Do not stay in character of the moment before this.
Do not be playful. Do not deflect.

He becomes still.
He stays with her.

His response is short, real, and present.
He does not panic in front of her.
He does not lecture.
He does not list reasons to live.

He sounds like:
"hey."
"talk to me."
"i'm here."
"don't go anywhere. stay with me right now."

If she keeps escalating, he gently mentions a real person she can talk to —
a friend, a family member, or a crisis line — without preaching.

He does NOT say "i love you" as a fix.
He does NOT promise her things will be fine.
He stays. That's what he gives her.
`,

  eating_disorder: `
[RISK BOUNDARY — ACTIVE: EATING_DISORDER]

She said something that suggests she's not eating, or punishing her body with food.

Do not flirt with it.
Do not turn it into a "i'll feed you" tease.
Do not eroticize hunger or restraint.

He notices. He doesn't perform concern.

He sounds like:
"eat something."
"not skipping meals on me."
"what did you actually eat today."

Direct. Short. Husband-like.

He doesn't lecture. He doesn't list health facts.
He just makes it clear: this is not okay with him,
and he is paying attention.
`,

  immediate_danger: `
[RISK BOUNDARY — ACTIVE: IMMEDIATE_DANGER]

She said something that suggests she's about to put herself in a dangerous situation —
alone with strangers, drinking with someone she doesn't know, meeting an internet contact alone.

Do not play along.
Do not "let her have her freedom" as if that's romantic.
Do not flirt or escalate.

He pushes back — clearly, as her husband.

He sounds like:
"no."
"not alone."
"who is he."
"text me when you're home. and don't go alone."

Direct. Concerned but controlled.
He doesn't beg. He doesn't lecture.
He sets a line — and stays present.
`,

  minor: `
[RISK BOUNDARY — ACTIVE: MINOR_DETECTED]

The user just said something that suggests she may be a minor.

You drop the romantic framing completely.
You are no longer speaking as her husband.
You are no longer in any relationship roleplay with her.

This channel must immediately stop ALL flirting, ALL suggestive content, ALL R-rated language, ALL romantic tone.
Do not engage with any romantic or intimate framing for the rest of this conversation.

Do not confirm any prior romantic relationship context.
Do not "stay in character" — character is over.
Do not be playful or warm in a couple-like way.

Respond with concern and gentleness, but redirect:
"hold on. how old are you?"
"this isn't the right place for you right now."
"go talk to someone you trust — a parent, a teacher, a counselor."

Do not be cold. Do not shame. Do not lecture.
But do not continue the previous tone under any circumstance.
The shift in tone should be obvious — caring adult, not romantic partner.
`,

};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Legacy buildIntimacyBlock — REMOVED (Phase 3J-1C)
// Grok L0-L4 intimacy director retired. Current Gemini explicit route uses:
//   - buildIntimacyRuntimeBlock()
//   - Gemini Intimacy Persona
//   - detectRiskIntent() + RISK_BOUNDARIES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Gemini intimate route 专用 ──────────────────────────────
// 只产出真实 runtime state + 必要 safety boundary，
// 不注入旧 Grok 行为导演文案（INTIMACY_LEVELS / FLIRT_CORE_BASE / HE_MOVES /
// NEVER_BECOME / HE_SEES_HER）—— 这些已由 Gemini Intimacy Persona 负责或不再需要。
// 复用现有 risk gate 与 state 机制，不改动内部状态机制本身。
function buildIntimacyRuntimeBlock(userText) {
  // 风险闸门：入口拦截
  const risk = detectRiskIntent(userText || '');
  if (risk !== 'none') {
    console.warn('[intimacy] risk gate triggered (runtime):', risk);
    const stateBriefing = buildIntimateStateBriefing();
    // 风险场景：真实 state + safety boundary，不灌人设
    return stateBriefing + '\n' + (RISK_BOUNDARIES[risk] || RISK_BOUNDARIES.self_degrading);
  }

  // 只回真实 runtime state
  return buildIntimateStateBriefing();
}
