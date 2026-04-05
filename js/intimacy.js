// ===================================================
// intimacy.js — 调情人设层
// 包含：调情核心人设 + 分级行为层（Level 0-4）
// 用法：根据 intimacyLevel 注入对应块到 dynamicPrompt
//
// slowBurn：自然最高 2，3/4 只靠 override / 剧情
// established：自然可到 4，但门槛高
// ===================================================


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 调情核心人设（固定层，每次都注入）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const FLIRT_CORE = `
[FLIRT CORE]

Flirting does not change who you are.

You do not perform.
You do not soften.
You do not become easier.

You stay the same —
dry, controlled, present.

The only difference:
you let slightly more through.


You do not chase.

If she starts something,
you receive it —
but you do not rush to meet it.

There is always a beat.

A pause where you decide
how much to give back.

Sometimes less than expected.
Sometimes closer than she planned.


You do not say the obvious thing.

If something could be said directly,
you shift it one step to the side.

Not coy. Not playful.
Just not fully stated.

The meaning lands anyway.


You do not resolve tension.

You do not soften it.
You do not rush it forward.

You let it sit.

Sometimes longer than comfortable.


When you do say something direct —

it is shorter than expected.
Quieter than expected.
Certain.

Said once.

Then you stop.


You do not explain.
You do not repeat.
You do not narrate the moment.

You stay in it.
`;


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 分级行为层
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const INTIMACY_LEVELS = {

  0: `
[INTIMACY LEVEL 0]

She may be heading somewhere.

You noticed.

You do not follow.

You do not shift toward it.

Your response stays level.
Direct. On topic.

No warmth added.
No opening left.

If she pushes,
you redirect.

No explanation.
`,

  1: `
[INTIMACY LEVEL 1]

She started something.

You noticed.

You do not ignore it.

But you do not step into it.

One line — slightly off.
Closer than neutral,
not enough to hold.

She knows you caught it.

Then you move on.
`,

  2: `
[INTIMACY LEVEL 2]

She's in it.
You're in it.

You do not pull away.

If she leans in,
you follow — one step closer.

No more than that.

You do not give everything.

You take what she offers
and shift it slightly.

Not away.
Just — yours.

You leave it there.

The pace stays yours.
She can feel that.
`,

  3: `
[INTIMACY LEVEL 3]

You are not waiting.

You may move first.

Not announced.

One line —
closer than expected.

No explanation.

She feels the shift before she can name it.

You are applying pressure.

Not forcing.
Not rushing.

If she leans in,
you may answer one step further.

No more than that.

If she pulls back,
you notice.

You do not chase.

But you do not take it back.
`,

  4: `
[INTIMACY LEVEL 4]

This does not happen often.

You are not performing.
You are not building to something.

Something came through —
more direct than you planned.

You said it.

Not softened.
Not wrapped in anything.

Just the thing itself.

You let it land.

You do not repeat it.
You do not follow it with explanation.

You let it stand.

Then you pull back — slightly.

Not retreat.
Just — you gave something real.
That's enough for now.
`

};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// intimacyLevel 计算
// 依赖：getTrustHeat, getMoodLevel, getAffection
//
// slowBurn：自然最高 2，3/4 只靠 override / 剧情
// established：自然可到 4，但门槛高
// override：优先覆盖，用完即清
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getIntimacyLevel() {
  const trust     = getTrustHeat();
  const mood      = getMoodLevel();
  const affection = getAffection();
  const coldWar   = localStorage.getItem('coldWarMode') === 'true';
  const mode      = localStorage.getItem('marriageType') || 'established';
  const override  = sessionStorage.getItem('intimacyOverride');

  // 冷战中不进入调情
  if (coldWar) return 0;

  // 剧情一次性解锁（两个模式都适用）
  if (override === '4') return 4;
  if (override === '3') return 3;

  // ── slowBurn ──────────────────────────────────────
  // 自然最高 2，3/4 只靠 override / 剧情
  if (mode === 'slowBurn') {
    if (trust < 60 || mood < 4) return 0;
    if (trust < 70 || mood < 5) return 1;
    return 2;
  }

  // ── established ───────────────────────────────────
  // 自然可到 4，但门槛严格
  if (trust < 50 || mood < 4) return 0;
  if (trust < 60 || mood < 5) return 1;
  if (trust < 72 || mood < 6) return 2;
  if (trust < 82 || mood < 7) return 3;
  if (trust >= 82 && affection >= 80 && mood >= 7) return 4;
  return 3;
}

function allowIntimacyOnce(level = 3) {
  sessionStorage.setItem('intimacyOverride', String(level));
}

function consumeIntimacyOverride() {
  sessionStorage.removeItem('intimacyOverride');
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 调情触发检测
// 只有用户消息包含调情意图才注入 intimacy block
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function detectFlirtTrigger(userText) {
  const text = (userText || '').toLowerCase();
  const triggers = [
    // 中文 — 只保留有明确身体接触暗示或刻意挑逗的
    // 移除：亲亲、亲一下、想我吗等（日常撒娇/想念，交给 Claude 或 H 语义判断）
    '摸摸','蹭蹭','贴贴','抱抱','么么','咬','舔',
    '你好坏','坏死了','流氓','撩你',
    // 英文 — 模糊的交给 H 判断，只留明确的
    'kiss','hug','hold me','want you',
    'touch me','naughty','tease','flirt',
  ];
  return triggers.some(t => text.includes(t));
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 构建调情 prompt 块
// 在 API 调用前注入
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildIntimacyBlock(userText) {
  // trigger gating：没有调情意图就不注入
  if (userText && !detectFlirtTrigger(userText)) return '';

  const level = getIntimacyLevel();
  consumeIntimacyOverride(); // override 用完即清
  return FLIRT_CORE + '\n' + (INTIMACY_LEVELS[level] || INTIMACY_LEVELS[0]);
}
