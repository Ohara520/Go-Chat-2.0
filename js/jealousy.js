// ===================================================
// jealousy.js — 吃醋触发系统（优化版）
// 依赖：state.js（getJealousyLevelCapped / escalateJealousy /
//                 decayJealousy / changeMood / changeAffection）
//       persona.js（buildGhostStyleCore）
// ===================================================


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 工具：本周 key
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getWeekKeyForJealousy() {
  const d = new Date();
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${d.getFullYear()}_w${week}`;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 前置关键词分类
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function classifyJealousyContext(text) {
  const t     = String(text || '');
  const lower = t.toLowerCase();

  const hasExplicitPerson =
    /\b(ex|boyfriend|girlfriend|coworker|colleague|classmate|friend|male friend|guy|man|boss|manager|teacher|doctor|therapist|neighbor|roommate|client)\b/i.test(lower) ||
    /前任|前男友|前女友|同事|男同事|女同事|朋友|男性朋友|男生|男的|老板|上司|老师|医生|治疗师|邻居|室友|客户/.test(t);

  const supportContext =
    /骚扰|欺负|惹我|气死|烦死|讨厌他|讨厌她|被坑|被骗|被抢|缠着我|一直烦我/.test(t) ||
    /harass|bully|annoy|piss me off|so annoying|keeps bothering me/.test(lower);

  const workSignals =
    /加班|上班|工作|忙|开会|值班|出差|汇报|项目|客户|业务/.test(t) ||
    /overtime|work|busy|meeting|shift|stayed late|called in|business trip|report|project|client/.test(lower);

  const workPeople =
    /\b(coworker|colleague|boss|manager|client|teacher)\b/i.test(lower) ||
    /同事|男同事|女同事|老板|上司|客户|老师/.test(t);

  const suggestiveSignals =
    /前任|暧昧|喜欢他|喜欢她/.test(t) ||
    /flirt|flirting|close|touching|kiss|slept over|date|dating/.test(lower);

  const workOnly = workSignals && (workPeople || !hasExplicitPerson) && !suggestiveSignals;

  const threatContext =
    /找别的|找别人|找其他|换个人|别的男人|另一个男|其他男/.test(t) ||
    /go find someone|find someone else|other guys|another man|replace you|don't need you/.test(lower);

  return { hasExplicitPerson, supportContext, workOnly, threatContext };
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// jealousy soothe（用户安抚/解释）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function sootheJealousyFromUserInput(userText) {
  const input = String(userText || '').toLowerCase();

  // 修复：用数组而不是带字面换行的正则
  const reassureWords = [
    '不是你想的那样','没什么','只是同事','只是朋友','别乱想','你想多了',
    '没有别的意思','只是工作','我错了','对不起',
    'not like that','just a coworker','just a friend','nothing there',
    "don't start","you're overthinking",'it was just work','i was wrong',"i'm sorry"
  ];
  const reassure = reassureWords.some(w => input.includes(w));

  if (!reassure) return false;

  const level = getJealousyLevelCapped();
  if (level === 'none') return false;

  decayJealousy();
  sessionStorage.removeItem('jealousyReferent');
  sessionStorage.removeItem('jealousyReferentAt');
  localStorage.setItem('lastJealousyAt', Date.now());
  return true;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// intensity 计算
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function calcJealousyIntensity({ risk, intent, supportContext, sameReferentRecently, trust, mood, coldWar, threatContext }) {
  let intensity = 0;

  if (supportContext && !threatContext) return 1;

  if (risk === 1) {
    const testing     = intent === 'test' || intent === 'provoke';
    const closeEnough = trust >= 72;
    const moodLowered = mood <= 5;
    intensity = (testing || sameReferentRecently || (closeEnough && moodLowered)) ? 1 : 0;
  } else if (risk === 2) {
    intensity = sameReferentRecently ? 2 : 1;
  } else if (risk === 3) {
    intensity = (trust > 60 && mood >= 4) ? 2 : 1;
  }

  if ((intent === 'provoke' || threatContext) && risk >= 2) {
    intensity = Math.max(intensity, 2);
  }

  if (intent === 'narrative') intensity = Math.min(intensity, 1);
  if (intent === 'casual' && !sameReferentRecently && risk < 2) intensity = Math.min(intensity, 1);
  if (coldWar) intensity = Math.min(intensity, 2);

  return intensity;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// system prompt 注入
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function injectJealousyPrompt({ intensity, supportContext, refHint }) {
  if (typeof chatHistory === 'undefined') return;

  const content = intensity === 1
    ? supportContext
      ? `[JEALOUSY]
Protective${refHint}.
Something about this bothers you, but not because of her.
Stay on her side.
Brief. Controlled.`
      : `[JEALOUSY]
Something tightened${refHint}.
You do not make a scene of it.
Slightly drier than usual.
At most one pointed line.`
    : supportContext
      ? `[JEALOUSY]
Protective and displeased${refHint}.
Stay controlled.
Focus on her side first.
No rivalry. No punishment.`
      : `[JEALOUSY]
You are bothered now${refHint}.
Shorter. More direct.
You may stay on it a beat too long.
Do not invent anything. React only to what she actually said.`;

  chatHistory.push({ role: 'user', content, _system: true });
  if (typeof saveHistory === 'function') saveHistory(); // 修复：注入后立刻存
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 主入口
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function checkJealousyTrigger(userText) {
  try {
    // 先试安抚/解释
    if (sootheJealousyFromUserInput(userText)) return;

    // 冷却检查
    const lastJealousyAt = parseInt(localStorage.getItem('lastJealousyAt') || '0');
    const currentLevel   = getJealousyLevelCapped();
    const cooldowns = {
      none:   20 * 60 * 1000,
      mild:   30 * 60 * 1000,
      medium: 60 * 60 * 1000,
      severe:  4 * 60 * 60 * 1000,
    };
    if (Date.now() - lastJealousyAt < (cooldowns[currentLevel] || 5 * 60 * 1000)) return;

    // 前置分类
    const { hasExplicitPerson, supportContext, workOnly, threatContext } =
      classifyJealousyContext(userText);

    if (!hasExplicitPerson && !supportContext && !threatContext) return;
    if (workOnly && !threatContext && !supportContext) return;

    // established 模式额外门槛
    const marriageMode = localStorage.getItem('marriageType') || 'established';
    if (marriageMode === 'established' && !threatContext && !supportContext) {
      if (!hasExplicitPerson) return;
    }

    // Haiku 语义判断
    let risk = 0, intent = 'casual', referent = null;
    try {
      const raw = await callHaiku(
        `Evaluate this message for jealousy context. Return JSON only. Be conservative but natural.

Risk:
0 = no jealousy context
1 = real person mentioned, ambiguous or light tension
2 = real person + noticeable exclusivity / repeated mention / suggestive tension
3 = clear ex / flirting / physical closeness / deliberate provocation / replacement threat

Intent:
"narrative" | "complaint" | "test" | "provoke" | "casual"

referent:
short label for the person, or null

Return: {"risk":0-3,"intent":"...","referent":"...or null"}`,
        [{ role: 'user', content: `User said: ${String(userText || '')}` }]
      );

      const parsed = JSON.parse((raw || '').replace(/```json|```/g, '').trim());
      risk     = Number(parsed.risk  || 0);
      intent   = parsed.intent   || 'casual';
      referent = parsed.referent || null;
    } catch(e) {
      // Haiku失败：用前置分类兜底
      risk   = supportContext ? 1 : (threatContext ? 2 : 0);
      intent = threatContext ? 'provoke' : 'casual';
    }

    // threat 作为增强因子
    if (threatContext) {
      risk   = Math.max(risk, 2);
      if (intent === 'casual') intent = 'provoke';
    }

    if (risk <= 0 && !supportContext) return;

    // 状态读取
    const mood    = getMoodLevel();
    const trust   = getTrustHeat();
    const coldWar = localStorage.getItem('coldWarMode') === 'true';

    // referent 追踪
    const prevReferent      = sessionStorage.getItem('jealousyReferent');
    const prevReferentAt    = parseInt(sessionStorage.getItem('jealousyReferentAt') || '0');
    const sameReferentRecently =
      referent && prevReferent &&
      referent === prevReferent &&
      (Date.now() - prevReferentAt < 45 * 60 * 1000);

    if (referent && referent !== 'null') {
      sessionStorage.setItem('jealousyReferent', referent);
      sessionStorage.setItem('jealousyReferentAt', Date.now());
    }

    // intensity 计算
    const intensity = calcJealousyIntensity({
      risk, intent, supportContext, sameReferentRecently, trust, mood, coldWar, threatContext
    });

    if (intensity <= 0) return;

    // 记录触发时间
    localStorage.setItem('lastJealousyAt', Date.now());

    // 一周频繁吃醋扣好感（只针对主动挑衅/反复刷同一个人）
    const weekKey   = 'weekJealousyCount_' + getWeekKeyForJealousy();
    const weekCount = parseInt(localStorage.getItem(weekKey) || '0') + 1;
    localStorage.setItem(weekKey, weekCount);

    if ((intent === 'test' || intent === 'provoke' || sameReferentRecently) && !supportContext && weekCount > 3) {
      changeAffection(-0.5);
    }

    const refHint = (referent && referent !== 'null') ? ` (${referent})` : '';

    // intensity 1：只改语气，不升等级
    if (intensity === 1) {
      injectJealousyPrompt({ intensity, supportContext, refHint });
      return;
    }

    // intensity 2：升等级 + 改语气
    const levelBefore = getJealousyLevelCapped();

    escalateJealousy();

    // provoke / 同一人反复出现：小概率跳两档
    if (!supportContext && (intent === 'provoke' || (sameReferentRecently && risk >= 2)) && Math.random() < 0.15) {
      escalateJealousy();
    }

    changeMood(-1);

    if (levelBefore === 'none') {
      sessionStorage.setItem('jealousyJustTriggered', '1');
      sessionStorage.setItem('jealousyJustTriggeredAt', Date.now());
    }

    injectJealousyPrompt({ intensity, supportContext, refHint });

  } catch(e) {}
}
