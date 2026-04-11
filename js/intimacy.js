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
// 调情上限（cap）— 长期关系状态决定"最高能到哪"
// 不决定当前回复走多深，只是天花板
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getIntimacyCap() {
  const trust     = getTrustHeat();
  const mood      = getMoodLevel();
  const affection = getAffection();
  const coldWar   = localStorage.getItem('coldWarMode') === 'true';
  const mode      = localStorage.getItem('marriageType') || 'established';
  const override  = sessionStorage.getItem('intimacyOverride');

  if (coldWar) return 0;

  if (override === '4') return 4;
  if (override === '3') return 3;

  if (mode === 'slowBurn') {
    if (trust < 60 || mood < 4) return 0;
    if (trust < 70 || mood < 5) return 1;
    return 2;
  }

  if (trust < 50 || mood < 4) return 0;
  if (trust < 60 || mood < 5) return 1;
  if (trust < 72 || mood < 6) return 2;
  if (trust < 82 || mood < 7) return 3;
  if (trust >= 82 && affection >= 80 && mood >= 7) return 4;
  return 3;
}

// 兼容旧调用
function getIntimacyLevel() { return getIntimacyCap(); }


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 三级意图检测
// affection / flirt / explicit / none
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function detectIntimateIntent(userText) {
  const t = (userText || '').toLowerCase();

  // explicit — 生理/露骨，直接但要降维处理
  if (/勃起|硬了|几厘米|多长|尺寸|几寸|进去|插|做爱|sex|cock|dick|pussy|cum|orgasm|erect|inches|how big|how long.*下面|下面.*多长/i.test(t)) {
    return 'explicit';
  }

  // flirt — 明确调情挑逗
  if (/摸摸|蹭蹭|贴贴|咬我|舔我|撩你|你好坏|坏死了|流氓|kiss|touch me|want you|naughty|tease|床.*一起|被窝.*一起|睡觉.*一起|一起.*睡|色色|涩涩|勾引|身体.*摸|摸.*身体|🍆|🍑|💦|👅|🫦/i.test(t)) {
    return 'flirt';
  }

  // affection — 撒娇亲昵，不算调情
  if (/抱抱|亲亲|么么|想你|miss you|想抱|贴贴|蹭|依|宝贝|baby|抱我|hold me/i.test(t)) {
    return 'affection';
  }

  return 'none';
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 调情进度引擎（progress）
// 楼梯：决定"这轮先走到哪一级"
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getFlirtProgress() {
  return parseFloat(sessionStorage.getItem('flirtProgress') || '0');
}

function saveFlirtProgress(val) {
  sessionStorage.setItem('flirtProgress', String(Math.max(0, Math.min(val, 4))));
  sessionStorage.setItem('lastFlirtTime', String(Date.now()));
}

// 阻尼增长：越往后越难涨
function pushFlirtProgress(intent, current) {
  const deltas = { affection: 0.3, flirt: 0.7, explicit: 1.0, none: 0 };
  const delta = deltas[intent] || 0;
  const resistance = 1 - (current / 4); // 越高越难涨
  return current + delta * resistance;
}

// 衰减：氛围断了慢慢降温
function decayFlirtProgress(current, intent, nonFlirtStreak) {
  let p = current;

  // 非调情连续2条 → 降温
  if (intent === 'none' && nonFlirtStreak >= 2) {
    p *= 0.6;
  } else if (intent === 'none') {
    p *= 0.85;
  }

  // 时间辅助衰减
  const lastTime = parseInt(sessionStorage.getItem('lastFlirtTime') || '0');
  const gap = Date.now() - lastTime;
  if (gap > 8 * 60 * 1000) p *= 0.5;   // 8分钟没有调情
  if (gap > 20 * 60 * 1000) p *= 0.3;  // 20分钟基本归零

  return Math.max(0, p);
}

// 非调情连续计数
function getNonFlirtStreak() {
  return parseInt(sessionStorage.getItem('nonFlirtStreak') || '0');
}

function updateNonFlirtStreak(intent) {
  if (intent === 'none') {
    sessionStorage.setItem('nonFlirtStreak', String(getNonFlirtStreak() + 1));
  } else {
    sessionStorage.setItem('nonFlirtStreak', '0');
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 当前轮次 step 计算
// 结合 progress + anti-spike + cap
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getCurrentIntimacyStep(userText) {
  let intent = detectIntimateIntent(userText);
  const nonFlirtStreak = getNonFlirtStreak();
  let progress = getFlirtProgress();

  // 衰减（先算衰减，再推进）
  progress = decayFlirtProgress(progress, intent === 'none' ? 'none' : intent, nonFlirtStreak);

  // anti-spike：第一句就 explicit 且 progress 不够 → 降级为 flirt
  if (intent === 'explicit' && progress < 1.5) {
    intent = 'flirt';
  }

  // 推进
  if (intent !== 'none') {
    progress = pushFlirtProgress(intent, progress);
  }

  // 更新记录
  updateNonFlirtStreak(intent === 'none' ? 'none' : 'flirt');
  saveFlirtProgress(progress);

  const step = Math.floor(progress);

  // 调试输出
  if (typeof console !== 'undefined') {
    console.log('[intimacy]', { intent, progress: progress.toFixed(2), step, cap: getIntimacyCap() });
  }

  return step;
}


function allowIntimacyOnce(level = 3) {
  sessionStorage.setItem('intimacyOverride', String(level));
}

function consumeIntimacyOverride() {
  sessionStorage.removeItem('intimacyOverride');
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 调情触发检测（兼容旧接口）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function detectFlirtTrigger(userText) {
  return detectIntimateIntent(userText) !== 'none';
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 构建调情 prompt 块
// cap + step → finalLevel
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildIntimacyBlock(userText) {
  const intent = detectIntimateIntent(userText || '');
  if (intent === 'none' && userText) return '';

  const cap  = getIntimacyCap();
  const step = getCurrentIntimacyStep(userText || '');
  const finalLevel = Math.min(cap, step);

  consumeIntimacyOverride();

  console.log('[intimacy] buildIntimacyBlock', { cap, step, finalLevel });

  return FLIRT_CORE + '\n' + (INTIMACY_LEVELS[finalLevel] || INTIMACY_LEVELS[0]);
}
