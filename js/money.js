// ===================================================
// money.js — 转账系统 v2
//
// 执行顺序：
// 0. moneyRefuseUntil 是否还生效
// 1. shouldRefuseMoneyBeforeMotive()
// 2. classifyMoneyMotive()
// 3. canGiveMoneyForMotive()
// 4. 冷却 / 次数 / 周上限
// 5. getMaxSingleTransfer()
//
// 原则：
// 一旦进入拒绝态，不再评估动机。
// 他已经做出判断。不需要证明，不需要解释，不需要辩论。
//
// 依赖：state.js / cloud.js
// ===================================================


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// moneyComfortLevel — 关系深度决定钱能进入到哪一步
// 0 = 不主动给，基本退
// 1 = 只处理实际需求，小额，克制
// 2 = 可以照顾，可以庆祝，中等金额
// 3 = 钱已进入关系内部，自然处理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getMoneyComfortLevel() {
  const trust = getTrustHeat();
  const mode  = localStorage.getItem('marriageType') || 'slowBurn';
  const flags = getRelationshipFlags();

  let level = 0;
  if (trust >= 45) level = 1;
  if (trust >= 65) level = 2;
  if (trust >= 82) level = 3;

  // slowBurn压一级——关系还在建立
  if (mode === 'slowBurn') level = Math.max(0, level - 1);

  // 冷战修复：关系结构性升级，放宽一级
  if (flags.coldWarRepaired) level = Math.min(3, level + 1);

  return level;
}

// firstSalary影响语气和金额，不影响level
function getMoneyEaseBonus() {
  return getRelationshipFlags().firstSalary ? 1 : 0;
}

// 单次金额硬上限（代码层截断，不管模型写什么）
function getMaxSingleTransfer() {
  const level     = getMoneyComfortLevel();
  const easeBonus = getMoneyEaseBonus();
  const caps      = { 0: 0, 1: 40, 2: 80, 3: 120 };
  return (caps[level] || 0) + (easeBonus * 20);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 要钱行为检测
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MONEY_ASK_KEYWORDS = [
  '给我钱','转点钱','转我','给点','再给','多给','给我','钱钱',
  '买不起','没钱了','穷了','缺钱','想买','帮我买','再多一点',
  'give me money','send money','transfer','more money','need money','send more',
];

// 真实practical关键词——有这些时不加resistance
const GENUINE_NEED_KEYWORDS = [
  '没吃饭','没吃东西','真的没钱','交不起','欠款','账单','急用','生病了','受伤',
  'genuinely broke','actual emergency','rent','medical','hospital',
];

function isMoneyAsk(text) {
  const t = (text || '').toLowerCase();
  return MONEY_ASK_KEYWORDS.some(k => t.includes(k));
}

function isGenuineNeed(text) {
  const t = (text || '').toLowerCase();
  return GENUINE_NEED_KEYWORDS.some(k => t.includes(k));
}

function recordMoneyAsk(text) {
  // 真实需求且没有刷模式 → 不加resistance
  const pattern = getMoneyAskPattern();
  const genuine = isGenuineNeed(text);
  if (genuine && pattern === 'none') {
    // 只记桶，不加resistance
    const now     = Date.now();
    const history = getRecentBucketHistory('moneyAsk', 60 * 60 * 1000);
    history.push(now);
    setBucketHistory('moneyAsk', history);
    return;
  }
  // pushing / repeated → 记桶 + 加resistance
  const now     = Date.now();
  const history = getRecentBucketHistory('moneyAsk', 60 * 60 * 1000);
  history.push(now);
  setBucketHistory('moneyAsk', history);
  incrementMoneyResistance();
}

function getMoneyAskPattern() {
  const count15min = getRecentBucketHistory('moneyAsk', 15 * 60 * 1000).length;
  const count1hr   = getRecentBucketHistory('moneyAsk', 60 * 60 * 1000).length;
  if (count15min >= 3) return 'heavy';
  if (count1hr   >= 5) return 'medium';
  if (count1hr   >= 3) return 'light';
  return 'none';
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// moneyResistance — 越刷越难给
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getMoneyResistance() {
  return parseInt(localStorage.getItem('moneyResistance') || '0');
}

function incrementMoneyResistance() {
  const val = Math.min(10, getMoneyResistance() + 1);
  localStorage.setItem('moneyResistance', val);
}

function decayMoneyResistance() {
  const last = parseInt(localStorage.getItem('moneyResistanceDecayAt') || '0');
  if (Date.now() - last < 30 * 60 * 1000) return;
  const val = Math.max(0, getMoneyResistance() - 1);
  localStorage.setItem('moneyResistance', val);
  localStorage.setItem('moneyResistanceDecayAt', Date.now());
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 拒绝态 — 持续时间
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function setMoneyRefuseState(pattern) {
  const durations = { light: 10 * 60 * 1000, medium: 30 * 60 * 1000, heavy: 2 * 3600 * 1000 };
  const until = Date.now() + (durations[pattern] || 10 * 60 * 1000);
  localStorage.setItem('moneyRefuseUntil', until);

  // heavy触发后本轮对话关闭钱话题
  if (pattern === 'heavy') {
    sessionStorage.setItem('moneyTopicClosed', '1');
  }
}

function isMoneyRefuseActive() {
  // 本轮话题已关闭
  if (sessionStorage.getItem('moneyTopicClosed') === '1') return true;
  // 拒绝态持续时间内
  const until = parseInt(localStorage.getItem('moneyRefuseUntil') || '0');
  return Date.now() < until;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 拒绝前置判断（resistance先决）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function shouldRefuseMoneyBeforeMotive() {
  const pattern    = getMoneyAskPattern();
  const resistance = getMoneyResistance();

  if (pattern === 'heavy') {
    setMoneyRefuseState('heavy');
    return true;
  }
  // medium：概率拒绝，resistance越高概率越大
  if (pattern === 'medium') {
    const refuseChance = 0.5 + (resistance * 0.05); // 50%起，resistance每+1加5%
    if (Math.random() < refuseChance) {
      setMoneyRefuseState('medium');
      return true;
    }
  }
  if (resistance >= 8) {
    setMoneyRefuseState('medium');
    return true;
  }
  if (resistance >= 5 && Math.random() < 0.7) {
    setMoneyRefuseState('light');
    return true;
  }
  if (resistance >= 3 && Math.random() < 0.3) {
    setMoneyRefuseState('light');
    return true;
  }
  // 轻微随机拒绝——打破可预测性，带10分钟余波
  if (Math.random() < 0.15) {
    setMoneyRefuseState('light');
    return true;
  }

  return false;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// motive资格检查
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function hasRecentCompensationContext() {
  const last = parseInt(localStorage.getItem('recentConflictAt') || '0');
  return Date.now() - last < 48 * 3600 * 1000;
}

function canGiveMoneyForMotive(motive) {
  const level = getMoneyComfortLevel();
  switch (motive) {
    case 'practical':    return level >= 1;
    case 'celebration':  return level >= 2;
    case 'care':         return level >= 2;
    case 'compensation': return level >= 2 && hasRecentCompensationContext();
    default:             return false;
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 动机分类器
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function classifyMoneyMotive(context = {}) {
  const { mood, trust, userText = '' } = context;
  const t       = (userText || '').toLowerCase();
  const coldWar = localStorage.getItem('coldWarMode') === 'true';
  const aff     = getAffection();

  if (coldWar) return null;

  // 机票/见面：绝对不主动给
  if (/机票|来找你|来英国|去英国|飞过去|plane ticket|flight|come see|visit you/.test(t)) return null;

  // 特殊日子（单独处理，不受aff门槛）
  const isBirthday = localStorage.getItem('userBirthday') && (() => {
    const [bm, bd] = (localStorage.getItem('userBirthday') || '').split('-').map(Number);
    const now = new Date();
    return now.getMonth() + 1 === bm && now.getDate() === bd;
  })();
  const marriageDate      = localStorage.getItem('marriageDate');
  const marriageDaysTotal = marriageDate
    ? Math.max(1, Math.floor((Date.now() - new Date(marriageDate)) / 86400000) + 1)
    : 0;
  const isMilestone = marriageDaysTotal > 0 &&
    (marriageDaysTotal === 52 || (marriageDaysTotal % 100 === 0) || marriageDaysTotal === 365);
  if (isBirthday || isMilestone) return 'celebration';

  // practical：门槛最低，关键词必须有明确经济语义
  if (/没钱|买不起|交不起|负担不起|缺钱|手头紧|穷|欠钱|还不起|need money|can't afford|broke|short on|no money/.test(t)) return 'practical';

  // care：aff >= 55
  if (aff >= 55 && /累|饿|没吃|难过|不开心|哭|tired|hungry|sad|haven't eaten|skipped/.test(t) && mood >= 5 && trust > 55) return 'care';

  // compensation：aff >= 60
  if (aff >= 60 && context.justHadTension && trust > 65 && mood >= 5) return 'compensation';

  return null;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 金额决策
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function decideMoneyAmountFromState(motive = 'practical') {
  const coldWar  = localStorage.getItem('coldWarMode') === 'true';
  const jealousy = getJealousyLevelCapped();
  const mood     = getMoodLevel();
  const level    = getMoneyComfortLevel();
  const easeBonus = getMoneyEaseBonus();

  if (coldWar || jealousy === 'severe') return 0;
  if (mood <= 3) return 0;
  if (level === 0) return 0;

  // 参考区间按 comfortLevel（模型自己评估，代码不做单次硬截断）
  // L1: 小额日常 £10-50
  // L2: 中等 £20-100
  // L3: 宽松 £30-150
  const baseRanges = {
    0: [0, 0],
    1: [10, 50],
    2: [20, 100],
    3: [30, 150],
  };
  const [min, max] = baseRanges[level] || [0, 0];

  const motiveMultiplier = {
    practical:    1.0,
    care:         1.0,
    celebration:  1.2,
    compensation: 0.8,
  }[motive] || 1.0;

  const moodMult = mood >= 8 ? 1.1 : mood <= 4 ? 0.8 : 1.0;

  let amount = Math.floor((min + Math.random() * (max - min)) * motiveMultiplier * moodMult);
  amount += easeBonus * 5;

  // 只做月度上限检查，不做单次硬截断
  const monthlyUsed  = getWeeklyGiven();
  const monthlyLimit = _getWeeklyTransferLimit();
  if (monthlyLimit > 0) amount = Math.min(amount, monthlyLimit - monthlyUsed);
  return Math.max(amount, 0);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 吃醋转账规则
// mild：不触发
// medium：极低概率 + level≥2
// severe：允许但不bypass每周上限
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function canJealousyTriggerMoney() {
  const jealousy = getJealousyLevelCapped();
  const level    = getMoneyComfortLevel();
  if (jealousy === 'mild')   return false;
  if (jealousy === 'medium') return level >= 2 && Math.random() < 0.15;
  if (jealousy === 'severe') return level >= 2;
  return false;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 主判断入口
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function shouldGiveMoney(userText, context = {}) {
  // 读统一状态
  const gs = (typeof getGhostResponseState === 'function') ? getGhostResponseState() : null;

  // availability closed → 绝不给
  if (gs && gs.availability === 'closed') return { ok: false, motive: null };

  // moneyEase 0 → 不给
  if (gs && gs.moneyEase === 0) return { ok: false, motive: null };

  // 0. 拒绝态持续时间
  if (isMoneyRefuseActive()) return { ok: false, motive: null };

  // 1. resistance先决
  if (isMoneyAsk(userText)) {
    recordMoneyAsk(userText);
    if (shouldRefuseMoneyBeforeMotive()) return { ok: false, motive: null };
  }

  // 2. 动机判断
  const motive = classifyMoneyMotive({ ...context, userText });
  if (!motive) return { ok: false, motive: null };

  // 3. comfort门槛（统一状态补强：moneyEase高可降低门槛）
  if (gs && gs.moneyEase >= 3) {
    // 高ease：practical直接放行
    if (motive === 'practical') return { ok: true, motive };
  }
  if (!canGiveMoneyForMotive(motive)) return { ok: false, motive: null };

  return { ok: true, motive };
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 拒绝态：Ghost反应生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildMoneyAskReactionPrompt(pattern) {
  const blocks = {
    light: `[MONEY ASK — LIGHT]
She has asked for money again.

You noticed the pattern.

Your tone goes flatter.
You do not fully call it out.
You do not encourage it.

One short line. Dry. Brief. No explanation.`,

    medium: `[MONEY ASK — MEDIUM]
She is pushing the same ask again.

You do not play along.

Your tone turns shorter. More direct.

You may push back once.
No softness. No elaboration.`,

    heavy: `[MONEY ASK — HEAVY]
The pattern is obvious.

You shut it down.

Very short. Very direct.
No explanation. No second line. No room left open.`
  };

  return (blocks[pattern] || blocks.light) +
    `\n\nDo not reuse the same phrasing used in recent refusals.
Shift the angle, keep the attitude.
English only.`;
}

async function generateMoneyRefuseLine(pattern) {
  try {
    const res = await callDeepSeek(
      buildGhostStyleCore() + '\n' + buildMoneyAskReactionPrompt(pattern),
      80
    );
    if (res && res.trim()) return res.trim();
  } catch(e) {}

  const fallbacks = {
    light:  ["you already asked.", "not this time.", "drop it."],
    medium: ["you're pushing it.", "this isn't how it works.", "no."],
    heavy:  ["no.", "done.", "."]
  };
  const opts = fallbacks[pattern] || fallbacks.light;
  return opts[Math.floor(Math.random() * opts.length)];
}


// ── 旧转账系统已移除，请使用 Ghost Card ──


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 周统计
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getMonthKey() {
  const now = new Date();
  return now.getFullYear() + '_m' + (now.getMonth() + 1);
}

// 兼容旧名称，内部改为月度
function getWeekKey() { return getMonthKey(); }

function getWeeklyGiven() {
  return parseInt(localStorage.getItem('monthlyGiven_' + getMonthKey()) || '0');
}

function addWeeklyGiven(amount) {
  localStorage.setItem('monthlyGiven_' + getMonthKey(), getWeeklyGiven() + amount);
}

function _getTransferCooldownMs() {
  const aff = getAffection();
  if (aff >= 80) return (8 + Math.floor(Math.random() * 5)) * 60 * 1000;
  return 15 * 60 * 1000;
}

function _getWeeklyTransferLimit() {
  // 已改为月度上限
  const level  = getMoneyComfortLevel();
  const limits = { 0: 0, 1: 800, 2: 1600, 3: 2400 };
  return limits[level] || 0;
}

function getMonthlyGiven() { return getWeeklyGiven(); }
function getMonthlyLimit() { return _getWeeklyTransferLimit(); }

function getTodayGivenCount() {
  return parseInt(localStorage.getItem('givenCount_' + new Date().toISOString().slice(0, 10)) || '0');
}

function incrementTodayGivenCount() {
  const key = 'givenCount_' + new Date().toISOString().slice(0, 10);
  localStorage.setItem(key, getTodayGivenCount() + 1);
}

function getTodayMoneyRequests() {
  return parseInt(localStorage.getItem('moneyReq_' + new Date().toISOString().slice(0, 10)) || '0');
}

function incrementMoneyRequest() {
  const key   = 'moneyReq_' + new Date().toISOString().slice(0, 10);
  const count = getTodayMoneyRequests() + 1;
  localStorage.setItem(key, count);
  // 【已接新 resistance 体系】——频繁要钱累积 resistance，不再直接扣 affection
  // resistance 会影响后续给钱概率，比直接扣好感更自然
  if (count >= 3) incrementMoneyResistance();
  return count;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 用户主动转账（confirmTransfer）
// 执行顺序：
// 1. 余额 / 条数检查
// 2. 冷战 → 直接退
// 3. isMoneyRefuseActive() → 拒绝态直接退
// 4. moneyComfortLevel → 关系深度决定能不能收
// 5. 金额超过 getMaxSingleTransfer() → 超额部分退回
// 6. 让模型生成回应，结尾带 KEEP / REFUND
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function openTransfer() {
  const balance = typeof getBalance === 'function' ? getBalance() : 0;
  const balEl = document.getElementById('transferBalance');
  if (balEl) balEl.textContent = '£' + Math.floor(balance);
  document.getElementById('transferAmount').value = '';
  document.getElementById('transferOverlay').classList.add('show');
  document.getElementById('transferModal').classList.add('show');
  setTimeout(() => document.getElementById('transferAmount').focus(), 100);
}

function closeTransfer() {
  document.getElementById('transferOverlay').classList.remove('show');
  document.getElementById('transferModal').classList.remove('show');
}

// 纯函数：判断用户转账后 Ghost 应该收还是退
// 返回 { shouldRefund: bool, reason: string, acceptAmount: number }
// context.reason：上下文内容（最近几条对话 + 用户说的理由）
function judgeUserTransfer(amount, context = {}) {
  const coldWar = localStorage.getItem('coldWarMode') === 'true';
  const level   = getMoneyComfortLevel();
  const mood    = getMoodLevel();
  const trust   = getTrustHeat();
  const aff     = getAffection();

  // 软上限：单次最多 £1000，超过直接退（防止异常数字）
  const SOFT_CAP = 1000;

  const reason      = (context.reason || '').toLowerCase();
  const hasReason   = !!reason.trim();
  const isGift      = /礼物|送你|给你的|520|1314|生日|情人节|纪念|gift|present|for you|birthday|anniversary/.test(reason);
  const isComp      = /补偿|赔你|我错了|补给你|对不起|抱歉|make it up|compensation|my fault|sorry|apologize/.test(reason);
  const isPractical = /帮你|拿去用|买东西|用吧|花吧|use it|for this|for that|spend it/.test(reason);
  const isGoodReason = isGift || isComp || isPractical;

  // 硬拒绝
  if (coldWar)              return { shouldRefund: true,  reason: 'coldWar',      acceptAmount: 0, needsReason: false };
  if (isMoneyRefuseActive()) return { shouldRefund: true,  reason: 'refuseActive', acceptAmount: 0, needsReason: false };
  if (level === 0)          return { shouldRefund: true,  reason: 'comfortLevel', acceptAmount: 0, needsReason: false };
  if (mood <= 3)            return { shouldRefund: true,  reason: 'mood',         acceptAmount: 0, needsReason: false };
  if (amount > SOFT_CAP)    return { shouldRefund: true,  reason: 'overMax',      acceptAmount: 0, needsReason: false };

  // 没有理由且金额不小：先问
  if (!hasReason && amount > 20) {
    return { shouldRefund: false, reason: 'noReason', acceptAmount: 0, needsReason: true };
  }

  // Level 1：关系还浅，只收小额好理由
  if (level === 1) {
    if (isGoodReason && amount <= 50 && mood >= 5)
      return { shouldRefund: false, reason: 'ok',           acceptAmount: amount, needsReason: false };
    if (isGoodReason && amount > 50)
      return { shouldRefund: false, reason: 'overMaxPartial', acceptAmount: 50,   needsReason: false };
    return { shouldRefund: true, reason: hasReason ? 'tooMuchForLevel' : 'noReason', acceptAmount: 0, needsReason: false };
  }

  // Level 2：可以收有理由的中等金额
  if (level === 2) {
    if (isGoodReason && amount <= 200)
      return { shouldRefund: false, reason: 'ok',           acceptAmount: amount, needsReason: false };
    if (isGoodReason && amount > 200)
      return { shouldRefund: false, reason: 'overMaxPartial', acceptAmount: 200,  needsReason: false };
    if (!hasReason && amount <= 20 && mood >= 7 && trust >= 65)
      return { shouldRefund: false, reason: 'smallNoReason', acceptAmount: amount, needsReason: false };
    return { shouldRefund: true, reason: hasReason ? 'notThis' : 'noReason', acceptAmount: 0, needsReason: false };
  }

  // Level 3：关系深，有好理由基本都收，金额大会收一部分
  if (level >= 3) {
    if (isGoodReason && amount <= 500)
      return { shouldRefund: false, reason: 'ok',           acceptAmount: amount, needsReason: false };
    if (isGoodReason && amount > 500)
      return { shouldRefund: false, reason: 'overMaxPartial', acceptAmount: 500,  needsReason: false };
    if (!hasReason && amount <= 30 && mood >= 7 && aff >= 70 && trust >= 75)
      return { shouldRefund: false, reason: 'smallNoReason', acceptAmount: amount, needsReason: false };
    return { shouldRefund: true, reason: hasReason ? 'guarded' : 'noReason', acceptAmount: 0, needsReason: false };
  }

  return { shouldRefund: true, reason: 'fallback', acceptAmount: 0, needsReason: false };
}

async function confirmTransfer() {
  const amount  = parseInt(document.getElementById('transferAmount').value);
  const balance = typeof getBalance === 'function' ? getBalance() : 0;
  if (!amount || amount <= 0) return;
  if (amount > balance) {
    document.getElementById('transferAmount').placeholder = '余额不足';
    document.getElementById('transferAmount').value = '';
    return;
  }

  // 条数检查
  const _email = localStorage.getItem('userEmail') || localStorage.getItem('sb_user_email') || '';
  if (_email) {
    const _remaining = typeof _subCache !== 'undefined' && _subCache ? _subCache.remaining : 1;
    if (_remaining <= 0) {
      if (typeof showToast === 'function') showToast('今天的消息条数已用完，明天再来哦 💌');
      closeTransfer(); return;
    }
  } else {
    if (typeof getTodayCount === 'function' && typeof DAILY_LIMIT !== 'undefined') {
      if (getTodayCount() >= DAILY_LIMIT) {
        if (typeof showToast === 'function') showToast('今天的消息条数已用完，明天再来哦 💌');
        closeTransfer(); return;
      }
    }
  }

  closeTransfer();

  // 先扣余额，后面退款再加回来
  // setBalance 只更新 UI 不写账本，用 addTransaction 真正记账
  if (typeof addTransaction === 'function') addTransaction({ icon: '💸', name: '转账给 Ghost', amount: -amount });
  if (typeof renderWallet === 'function') renderWallet();

  // 读最近几条对话作为理由上下文
  const _recentContext = (() => {
    if (typeof chatHistory === 'undefined') return '';
    return chatHistory
      .filter(m => !m._system && !m._recalled)
      .slice(-6)
      .map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${m.content.slice(0, 150)}`)
      .join('\n');
  })();

  // 检测上下文里有没有明确理由
  const _ctxLower = _recentContext.toLowerCase();
  const _hasContextReason =
    /礼物|送你|给你的|520|1314|生日|情人节|纪念|gift|present|for you|birthday|anniversary/.test(_ctxLower) ||
    /补偿|赔你|我错了|补给你|对不起|抱歉|make it up|compensation|my fault|sorry|apologize/.test(_ctxLower) ||
    /帮你|拿去用|买东西|用吧|花吧|use it|for this|for that|spend it|心意|喜欢你|爱你|想给你/.test(_ctxLower);

  // 没有理由 → Ghost问一句，存pendingTransfer等用户回答
  if (!_hasContextReason) {
    sessionStorage.setItem('pendingTransfer', JSON.stringify({ amount, deducted: true }));

    const _askLine = await (async () => {
      try {
        const res = await callGrokWithSystem(
          buildGhostStyleCore() + '\nShe just transferred money to you without explanation. You want to know what it means — not because you doubt her, just because you do. Ask once, short, dry, lowercase. Do not mention the amount.',
          _recentContext || 'she just sent money.',
          60
        );
        if (res && !isBreakout(res)) return res.trim().split('\n')[0];
      } catch(e) {}
      const opts = ["what's this for.", "what's it for.", "why.", "reason."];
      return opts[Math.floor(Math.random() * opts.length)];
    })();

    if (typeof showTyping === 'function') showTyping();
    await new Promise(r => setTimeout(r, 800));
    if (typeof hideTyping === 'function') hideTyping();
    if (typeof appendMessage === 'function') appendMessage('bot', _askLine);
    if (typeof chatHistory !== 'undefined') {
      chatHistory.push({ role: 'assistant', content: _askLine });
      if (typeof saveHistory === 'function') saveHistory();
    }
    if (typeof _isSending !== 'undefined') _isSending = false;
    return;
  }

  // 有理由 → 判断收/退
  const judgeContext = { reason: _recentContext };
  const { shouldRefund, reason, acceptAmount } = judgeUserTransfer(amount, judgeContext);
  const refundAmount = amount - acceptAmount;

  // 构建给模型的 prompt
  const mood = getMoodLevel();
  let judgePrompt = '';

  if (shouldRefund) {
    const hintMap = {
      coldWar:         `Cold war is active. Ghost sends it back — cold, minimal, no explanation.`,
      refuseActive:    `She has been asking too often. He is not interested. Send it back, one line.`,
      comfortLevel:    `The relationship is not there yet. Return it, no explanation, not cold.`,
      mood:            `Ghost is in a bad mood today (${mood}/10). Not taking it. Return it, tone is hard.`,
      overMax:         `Too much. He does not take this amount. Return it, one line, no mention of limits.`,
      noReason:        `She transferred without saying why. He does not get it. Return it — or ask once.`,
      tooMuchForLevel: `Not at this stage yet. Even with a reason, the amount is too much. Return it, neutral tone.`,
      notThis:         `The reason is not enough, or the amount is off. Return it, brief.`,
      guarded:         `He is a little wary — not sure what she is after. Return it, dry, maybe one question.`,
      fallback:        `Return it. No explanation.`,
    };
    judgePrompt = `[System: She just transferred £${amount} to Ghost. ${hintMap[reason] || hintMap.fallback} Write REFUND on its own line at the end of your reply.]`;
  } else if (reason === 'overMaxPartial') {
    judgePrompt = `[System: She transferred £${amount}. Too much — he kept £${acceptAmount} and returned £${refundAmount}. Neutral tone, no mention of limits. Something like "don't need that much." Write KEEP on its own line at the end.]`;
  } else if (reason === 'smallNoReason') {
    judgePrompt = `[System: She transferred £${amount} without explanation. Small amount. Ghost mood ${mood}/10 — he took it, but tone is slightly puzzled or casual. No clear reason makes it a little odd, but he did not refuse. Write KEEP on its own line at the end.]`;
  } else {
    judgePrompt = `[System: She transferred £${amount} to Ghost. He accepted it.
He is not responding to the money — he is responding to what it means coming from her.
He received it quietly. No performance. No making it a thing.
One line. His own words. Not flat, not cold, not overly warm.
Something that lands — like he got it, and he's fine with it.
Do not say "noted". Do not explain why he kept it.
Write KEEP on its own line at the end.]`;
  }

  if (typeof chatHistory !== 'undefined') {
    chatHistory.push({ role: 'user', content: judgePrompt, _system: true, _userTransfer: { amount } });
    if (typeof saveHistory === 'function') saveHistory();
  }

  const container = document.getElementById('messagesContainer');
  const cardId = container ? showUserTransferCard(container, amount) : null;
  if (typeof showTyping === 'function') showTyping();
  if (typeof _isSending !== 'undefined') _isSending = true;

  // 用 Grok 生成台词：结合上下文，不破防
  try {
    let reply = await (async () => {
      try {
        const res = await fetchWithTimeout('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: _recentContext + '\n\n' + judgePrompt,
            max_tokens: 200,
            scene: 'normal',
          })
        }, 15000);
        if (!res.ok) return '';
        const d = await res.json();
        const t = d.text?.trim() || '';
        return (typeof isBreakout === 'function' && isBreakout(t)) ? '' : t;
      } catch(e) { return ''; }
    })();

    if (!reply) reply = shouldRefund ? 'sent it back.' : 'got it.';

    if (typeof hideTyping === 'function') hideTyping();
    if (typeof updateToRead === 'function') updateToRead();

    reply = reply.replace(/\n?(REFUND|(?<![a-zA-Z])KEEP(?![a-zA-Z])|COLD_WAR_START)\n?/g, '')
                 .replace(/\s{2,}/g, ' ').trim();

    if (typeof incrementTodayCount === 'function') incrementTodayCount();
    const _em = localStorage.getItem('userEmail') || localStorage.getItem('sb_user_email');
    if (_em && typeof consumeQuota === 'function') consumeQuota().catch(() => {});

    if (shouldRefund) {
      // 全退
      const bal = typeof getBalance === 'function' ? getBalance() : 0;
      if (typeof setBalance === 'function') setBalance(bal + amount);
      if (typeof addTransaction === 'function') addTransaction({ icon: '↩️', name: '退款（Ghost 退回）', amount });
      localStorage.setItem('lastRefundAt', Date.now());
      localStorage.setItem('lastMoneyRefusedAt', Date.now());
      if (typeof renderWallet === 'function') renderWallet();
      updateUserTransferCard(cardId, false);
      if (container) showGhostTransferCard(container, amount, reply, true);
      if (typeof chatHistory !== 'undefined') {
        chatHistory.push({ role: 'assistant', content: reply || `sent it back. £${amount}.` });
        chatHistory.push({ role: 'user', content: `[System: Ghost just returned £${amount}. He knows he sent it back.]`, _system: true });
      }
    } else {
      // 收了（可能是部分退）
      if (refundAmount > 0) {
        // 超额部分退回
        const bal = typeof getBalance === 'function' ? getBalance() : 0;
        if (typeof setBalance === 'function') setBalance(bal + refundAmount);
        if (typeof addTransaction === 'function') addTransaction({ icon: '↩️', name: `退回超额部分`, amount: refundAmount });
        if (typeof renderWallet === 'function') renderWallet();
      }
      changeAffection(1);
      // 标记"第一次收下用户的东西"——供 Story System 的 '留而不言' 节点使用
      if (!localStorage.getItem('firstUserGiftAccepted')) {
        localStorage.setItem('firstUserGiftAccepted', 'true');
      }
      updateUserTransferCard(cardId, true);
      if (reply && typeof appendMessage === 'function') appendMessage('bot', reply);
      if (typeof chatHistory !== 'undefined') {
        chatHistory.push({ role: 'assistant', content: reply });
        if (refundAmount > 0) {
          chatHistory.push({ role: 'user', content: `[System: Ghost kept £${acceptAmount} and returned the extra £${refundAmount}.]`, _system: true });
        }
      }
    }

    if (typeof saveHistory === 'function') saveHistory();
    if (typeof _isSending !== 'undefined') _isSending = false;

  } catch(e) {
    if (typeof hideTyping === 'function') hideTyping();
    if (typeof _isSending !== 'undefined') _isSending = false;
    // 网络错误：全退
    const bal = typeof getBalance === 'function' ? getBalance() : 0;
    if (typeof addTransaction === 'function') addTransaction({ icon: '↩️', name: '退款（网络错误）', amount });
    if (typeof renderWallet === 'function') renderWallet();
    updateUserTransferCard(cardId, false);
    if (typeof appendMessage === 'function') appendMessage('bot', '哎呀，网络波动，你老公没收到这条消息，再发一次试试～');
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 转账UI卡片
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// handlePendingTransfer
// 用户回答了理由后，继续处理之前挂起的转账
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function handlePendingTransfer(amount, userReason) {
  const recentContext = (typeof chatHistory !== 'undefined')
    ? chatHistory.filter(m => !m._system && !m._recalled).slice(-6)
      .map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${m.content.slice(0, 150)}`).join('\n')
    : '';

  const judgeContext = { reason: recentContext + '\nHer reason: ' + userReason };
  const { shouldRefund, reason, acceptAmount } = judgeUserTransfer(amount, judgeContext);
  const refundAmount = amount - acceptAmount;
  const mood = getMoodLevel();

  let judgePrompt = '';
  if (shouldRefund) {
    const hintMap = {
      coldWar:         `Cold war is active. Ghost sends it back — cold, minimal, no explanation.`,
      comfortLevel:    `The relationship is not there yet. Return it, no explanation, not cold.`,
      mood:            `Ghost is in a bad mood today (${mood}/10). Not taking it. Return it, tone is hard.`,
      overMax:         `Too much. He does not take this amount. Return it, one line.`,
      notThis:         `The reason is not enough, or the amount is off. Return it, brief.`,
      fallback:        `Return it. No explanation.`,
    };
    judgePrompt = `[System: She just transferred £${amount} to Ghost. ${hintMap[reason] || hintMap.fallback} Write REFUND on its own line at the end.]`;
  } else {
    judgePrompt = `[System: She transferred £${amount} to Ghost. She explained why. He accepted it — not because of the money, because of what it means from her. One line. His own words. Not flat, not cold. Write KEEP on its own line at the end.]`;
  }

  if (typeof chatHistory !== 'undefined') {
    chatHistory.push({ role: 'user', content: judgePrompt, _system: true, _userTransfer: { amount } });
    if (typeof saveHistory === 'function') saveHistory();
  }

  const container = document.getElementById('messagesContainer');
  const cardId = container ? showUserTransferCard(container, amount) : null;
  if (typeof showTyping === 'function') showTyping();
  if (typeof _isSending !== 'undefined') _isSending = true;

  try {
    let reply = '';
    try {
      const res = await fetchWithTimeout('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: recentContext + '\n\n' + judgePrompt, max_tokens: 150, scene: 'normal' })
      }, 15000);
      if (res.ok) {
        const d = await res.json();
        const t = d.text?.trim() || '';
        reply = (typeof isBreakout === 'function' && isBreakout(t)) ? '' : t;
      }
    } catch(e) {}

    if (!reply) reply = shouldRefund ? 'sent it back.' : 'got it.';
    if (typeof hideTyping === 'function') hideTyping();
    reply = reply.replace(/\n?(REFUND|(?<![a-zA-Z])KEEP(?![a-zA-Z]))\n?/g, '').replace(/\s{2,}/g, ' ').trim();

    if (shouldRefund) {
      const bal = typeof getBalance === 'function' ? getBalance() : 0;
      if (typeof setBalance === 'function') setBalance(bal + amount);
      if (typeof addTransaction === 'function') addTransaction({ icon: '↩️', name: '退款（Ghost 退回）', amount });
      localStorage.setItem('lastRefundAt', Date.now());
      if (typeof renderWallet === 'function') renderWallet();
      updateUserTransferCard(cardId, false);
      if (container) showGhostTransferCard(container, amount, reply, true);
      if (typeof chatHistory !== 'undefined') {
        chatHistory.push({ role: 'assistant', content: reply });
        chatHistory.push({ role: 'user', content: `[System: Ghost returned £${amount}.]`, _system: true });
      }
    } else {
      changeAffection(1);
      if (!localStorage.getItem('firstUserGiftAccepted')) localStorage.setItem('firstUserGiftAccepted', 'true');
      updateUserTransferCard(cardId, true);
      if (container) {
        const now = new Date();
        const timeStr = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
        const ghostReceivedDiv = document.createElement('div');
        ghostReceivedDiv.className = 'message bot';
        ghostReceivedDiv.innerHTML = `<div class="transfer-card ghost-transfer-card">
          <div class="transfer-card-top"><div class="transfer-label">RECEIVED FROM YOU</div><div class="transfer-name">已收到</div></div>
          <div class="transfer-amount-block"><div class="transfer-amount-label">AMOUNT</div><div class="transfer-amount">£${acceptAmount}</div></div>
          <div class="transfer-footer"><div class="transfer-status">✅ 已收到</div><div class="transfer-time">${timeStr}</div></div></div>`;
        container.appendChild(ghostReceivedDiv);
        container.scrollTop = container.scrollHeight;
      }
      if (reply && typeof appendMessage === 'function') appendMessage('bot', reply);
      if (typeof chatHistory !== 'undefined') chatHistory.push({ role: 'assistant', content: reply });
    }

    if (typeof saveHistory === 'function') saveHistory();
    if (typeof incrementTodayCount === 'function') incrementTodayCount();
    const _em = localStorage.getItem('userEmail') || localStorage.getItem('sb_user_email');
    if (_em && typeof consumeQuota === 'function') consumeQuota().catch(() => {});
  } catch(e) {
    if (typeof hideTyping === 'function') hideTyping();
    const bal = typeof getBalance === 'function' ? getBalance() : 0;
    if (typeof setBalance === 'function') setBalance(bal + amount);
    if (typeof addTransaction === 'function') addTransaction({ icon: '↩️', name: '退款（网络错误）', amount });
    if (typeof renderWallet === 'function') renderWallet();
    updateUserTransferCard(cardId, false);
  } finally {
    if (typeof _isSending !== 'undefined') _isSending = false;
  }
}

function showUserTransferCard(container, amount) {
  const now     = new Date();
  const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const cardId  = 'utc_' + Date.now();
  const div     = document.createElement('div');
  div.className = 'message user';
  div.innerHTML = `<div class="transfer-card user-transfer-card" id="${cardId}">
    <div class="transfer-card-top">
      <div class="transfer-label">TRANSFER TO</div>
      <div class="transfer-name">Simon Riley</div>
    </div>
    <div class="transfer-amount-block">
      <div class="transfer-amount-label">AMOUNT</div>
      <div class="transfer-amount">£${amount}</div>
    </div>
    <div class="transfer-footer">
      <div class="transfer-status" id="${cardId}_status">🌸 待确认</div>
      <div class="transfer-time">${timeStr}</div>
    </div></div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return cardId;
}

function updateUserTransferCard(cardId, kept) {
  const el = document.getElementById(cardId + '_status');
  if (!el) return;
  el.textContent = kept ? '✅ 已收到' : '↩️ 已退回';
  el.style.color = kept ? '#4a8a30' : '#9ca3af';
}

// ── showGhostTransferCard 已移除 ──


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 离线惩罚 & Ghost主动问候
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function checkOfflinePenalty() {
  const last  = parseInt(localStorage.getItem('lastOnlineTime') || Date.now());
  const hours = (Date.now() - last) / 3600000;
  if (hours >= 48) changeAffection(-Math.min(Math.floor(hours / 24) - 1, 5));
  if (hours >= 12) {
    const key = 'ghostInitMsg_' + new Date().toDateString();
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, '1');
      setTimeout(() => ghostSendInitMessage(hours), 6000);
    }
  }
  localStorage.setItem('lastOnlineTime', Date.now());
}

async function ghostSendInitMessage(offlineHours) {
  const hintMap = [
    { min: 12,  max: 24,       hint: "She's been gone most of the day. Just came back." },
    { min: 24,  max: 48,       hint: "She was gone yesterday. Back now." },
    { min: 48,  max: 96,       hint: "She disappeared for two days. Just showed up." },
    { min: 96,  max: Infinity, hint: "She's been gone for days. Suddenly back." },
  ];
  const hint = hintMap.find(h => offlineHours >= h.min && offlineHours < h.max)?.hint || '';
  try {
    if (typeof showTyping === 'function') showTyping();
    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: typeof getMainModel === 'function' ? getMainModel() : 'claude-sonnet-4-20250514',
        max_tokens: 150,
        ...(() => { const s = buildSystemPrompt(); return { system: s, systemParts: buildSystemPromptParts(s) }; })(),
        messages: [...(typeof chatHistory !== 'undefined' ? chatHistory.slice(-6) : []),
          { role: 'user', content: `[System: ${hint} Ghost noticed. Say something — could be a pointed question, a casual remark, or just checking in. lowercase, English only.]` }
        ]
      })
    });
    const data = await res.json();
    if (typeof hideTyping === 'function') hideTyping();
    let reply = data.content?.[0]?.text?.trim() || '';
    if (reply) {
      reply = reply.replace(/\n?(REFUND|(?<![a-zA-Z])KEEP(?![a-zA-Z])|COLD_WAR_START|GIVE_MONEY:[^\n]*)\n?/g, '').trim();
      if (typeof appendMessage === 'function') appendMessage('bot', reply);
      if (typeof chatHistory !== 'undefined') {
        chatHistory.push({ role: 'assistant', content: reply });
        if (typeof saveHistory === 'function') saveHistory();
      }
    }
  } catch(e) {
    if (typeof hideTyping === 'function') hideTyping();
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💳 Ghost Card 亲情卡系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getGhostCardMonthlyLimit() {
  const coldWar   = localStorage.getItem('coldWarMode') === 'true';
  if (coldWar) return 0;

  const jealousy  = typeof getJealousyLevelCapped === 'function' ? getJealousyLevelCapped() : 'none';
  const mood      = typeof getMoodLevel === 'function' ? getMoodLevel() : 7;
  const trust     = typeof getTrustHeat === 'function' ? getTrustHeat() : 50;
  const affection = typeof getAffection === 'function' ? getAffection() : 50;
  const s         = typeof getGhostResponseState === 'function' ? getGhostResponseState() : { moneyEase: 1, availability: 'normal' };

  // 基础额度由 moneyEase 决定
  const limitMap = { 0: 0, 1: 1200, 2: 2000, 3: 2600 };
  let limit = limitMap[s.moneyEase] || 0;

  // 关系特别顺时小幅上调
  if (trust >= 80 && affection >= 75 && mood >= 7 && jealousy === 'none' && s.availability === 'open') {
    limit += 400;
  }

  // 状态压制
  if (mood <= 3)               limit = Math.min(limit, 1000);
  if (jealousy === 'medium')   limit = Math.min(limit, 1400);
  if (jealousy === 'severe')   limit = Math.min(limit, 800);

  return Math.max(0, Math.min(limit, 3000));
}

function getGhostCard() {
  const monthlyLimit = getGhostCardMonthlyLimit();
  const now = new Date();

  const defaults = {
    balance: monthlyLimit, // 首次初始化直接给满月度额度
    monthlyLimit,
    spentThisMonth: 0,
    lastResetMonth: now.getMonth(),
  };
  try {
    const saved = JSON.parse(localStorage.getItem('ghostCard') || 'null');
    if (!saved) {
      localStorage.setItem('ghostCard', JSON.stringify(defaults));
      return defaults;
    }

    // 月初重置：花费清零，余额一次性给满新额度
    if (saved.lastResetMonth !== now.getMonth()) {
      const newLimit = getGhostCardMonthlyLimit();
      saved.monthlyLimit   = newLimit;
      saved.spentThisMonth = 0;
      saved.lastResetMonth = now.getMonth();
      saved.balance        = newLimit; // 月初一次性给满
    }

    // 保证余额不低于本月剩余应得额度
    // 兼容旧版按天补发数据、云端同步覆盖等各种情况
    const entitled = Math.max(0, monthlyLimit - (saved.spentThisMonth || 0));
    if (saved.balance < entitled) saved.balance = entitled;
    if (saved.lastDailyAt) delete saved.lastDailyAt; // 清理旧字段

    saved.monthlyLimit = monthlyLimit;
    localStorage.setItem('ghostCard', JSON.stringify(saved));
    return { ...defaults, ...saved };
  } catch(e) { return defaults; }
}

function saveGhostCard(card) {
  try { localStorage.setItem('ghostCard', JSON.stringify(card)); } catch(e) {}
}

function getGhostCardBalance() {
  const card = getGhostCard();
  return Math.max(0, Math.min(card.balance, card.monthlyLimit - card.spentThisMonth));
}

function spendGhostCard(amount, itemName, category) {
  category = category || 'unknown';
  const card = getGhostCard();
  const available = Math.min(card.balance, card.monthlyLimit - card.spentThisMonth);
  if (available < amount) return false;
  card.balance = Math.round(card.balance - amount);
  card.spentThisMonth = Math.round(card.spentThisMonth + amount);
  saveGhostCard(card);
  if (typeof addTransaction === 'function') addTransaction({ icon: '💳', name: `Ghost Card · ${itemName}`, amount: -amount, ghostCard: true });
  if (typeof renderWallet === 'function') renderWallet();
  _ghostCardReaction(amount, itemName, category, card);
  return true;
}

function _classifySpend(amount, category, card) {
  const state    = typeof getGhostResponseState === 'function' ? getGhostResponseState() : {};
  const jealousy = typeof getJealousyLevelCapped === 'function' ? getJealousyLevelCapped() : 'none';
  const { moneyEase = 1, sharpness = 0, warmth = 0, availability = 'normal' } = state;

  const history = JSON.parse(localStorage.getItem('ghostCardRecentSpend') || '[]');
  history.push({ amount, category, at: Date.now() });
  const last10min = history.filter(s => Date.now() - s.at < 10 * 60 * 1000);
  localStorage.setItem('ghostCardRecentSpend', JSON.stringify(history.slice(-20)));

  if (last10min.length >= 3) return { reactionType: 'intervene', lineTone: 'sharp', needExplanation: true };

  const limit = card.monthlyLimit || 2000;
  const ratio = amount / limit;
  const baseSensitivity = { daily: 0, self: 0.5, for_him: 0, gift: 1.5, unknown: 1 }[category] || 1;
  let sensitivityMod = 0;
  if (jealousy === 'medium') sensitivityMod += 1;
  if (jealousy === 'severe') sensitivityMod += 2;
  if (availability === 'closed') sensitivityMod += 1;
  if (moneyEase >= 2) sensitivityMod -= 0.5;

  let amountWeight = 0;
  if (ratio > 0.3 || amount > 400) amountWeight = 3;
  else if (ratio > 0.15 || amount > 200) amountWeight = 2;
  else if (ratio > 0.05 || amount > 80) amountWeight = 1;

  const todayReacted = localStorage.getItem(`ghostCardReacted_${category}_${new Date().toDateString()}`);
  const finalScore = baseSensitivity + sensitivityMod + amountWeight + (todayReacted ? -1 : 0);

  let reactionType, lineTone, needExplanation = false;
  if (finalScore <= 0)   { reactionType = 'ignore';    lineTone = 'casual'; }
  else if (finalScore <= 1)   { reactionType = 'note';      lineTone = warmth >= 2 ? 'casual' : 'dry'; }
  else if (finalScore <= 2.5) { reactionType = 'ask';       lineTone = sharpness >= 2 ? 'guarded' : 'dry'; needExplanation = amount > 150; }
  else if (finalScore <= 4)   { reactionType = 'probe';     lineTone = 'sharp'; needExplanation = true; }
  else                        { reactionType = 'intervene'; lineTone = 'sharp'; needExplanation = true; }

  if (category === 'gift' && (jealousy === 'medium' || jealousy === 'severe')) {
    if (reactionType === 'ask')  reactionType = 'probe';
    if (reactionType === 'note') reactionType = 'ask';
    lineTone = 'sharp'; needExplanation = true;
  }
  return { reactionType, lineTone, needExplanation };
}

function _buildGhostCardPrompt(amount, itemName, category, decision) {
  const { reactionType, lineTone, needExplanation } = decision;
  const state    = typeof getGhostResponseState === 'function' ? getGhostResponseState() : {};
  const jealousy = typeof getJealousyLevelCapped === 'function' ? getJealousyLevelCapped() : 'none';
  const categoryHint = { daily: 'everyday spending — food, drinks, transport', self: 'something for herself', for_him: 'a gift for you', gift: 'something for someone else', unknown: 'purpose unknown' }[category] || 'unknown purpose';
  const toneHint = { casual: 'casual, offhand', dry: 'dry, controlled, brief', guarded: 'guarded, slightly sharp', sharp: 'sharp, direct, wants an answer' }[lineTone] || 'dry';
  const reactionHint = {
    ignore:    null,
    note:      `You saw it. One line — notice it without making it a thing. ${toneHint}.`,
    ask:       `You saw the charge. Ask what it was for — one line, ${toneHint}. ${needExplanation ? 'You want an actual answer.' : 'Not demanding, just asking.'}`,
    probe:     `You saw the charge and it caught your attention. Push a little — ${toneHint}. One line, wants an explanation.${jealousy !== 'none' ? ' There is an edge to it.' : ''}`,
    intervene: `Multiple charges or something significant. Putting a stop to it for now. One line — direct, not angry, but clear.`,
  }[reactionType];
  if (!reactionHint) return null;
  return `[Ghost Card notification: she spent £${amount} on: ${categoryHint}. Item: 「${itemName}」.\nYour reaction: ${reactionHint}\nState — warmth: ${state.warmth ?? 1}/3, sharpness: ${state.sharpness ?? 0}/3, money ease: ${state.moneyEase ?? 1}/3.\nOne line only. English. Lowercase. Do not mention "card" or "notification".]`;
}

async function _ghostCardReaction(amount, itemName, category, card) {
  try {
    const _isFlirting = (chatHistory || []).slice(-4).some(m => m._intimate);
    if (_isFlirting) return;
    const decision = _classifySpend(amount, category, card);
    if (decision.reactionType === 'ignore') return;
    const prompt = _buildGhostCardPrompt(amount, itemName, category, decision);
    if (!prompt) return;
    localStorage.setItem(`ghostCardReacted_${category}_${new Date().toDateString()}`, '1');
    await new Promise(r => setTimeout(r, 3000));
    if (decision.reactionType === 'intervene') {
      const c = getGhostCard(); c.balance = Math.max(0, c.balance - amount * 0.3); saveGhostCard(c);
    }
    const _sys = typeof buildGhostStyleCore === 'function' ? buildGhostStyleCore() : '';
    const _res = await fetchWithTimeout('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: typeof getMainModel === 'function' ? getMainModel() : 'claude-sonnet-4-20250514', max_tokens: 60, system: _sys, messages: [...(chatHistory||[]).filter(m=>!m._system).slice(-4), { role:'user', content: prompt }] })
    }, 10000);
    const _data = await _res.json();
    const _reply = (_data.content?.[0]?.text || '').trim();
    const _bad = ["i'm claude","i am claude","as an ai","can't roleplay","ghost card","notification"];
    if (_reply && !_bad.some(p => _reply.toLowerCase().includes(p))) {
      if (typeof appendMessage === 'function') appendMessage('bot', _reply);
      if (typeof chatHistory !== 'undefined') { chatHistory.push({ role:'assistant', content: _reply }); if (typeof saveHistory === 'function') saveHistory(); }
    }
  } catch(e) { console.warn('[GhostCard] 反应失败:', e); }
}

function showGhostCardReceipt(amount, itemName, isUserCard) {
  const now = new Date();
  const timeStr = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  const dateStr = `${now.getMonth()+1}/${now.getDate()}`;
  const c = document.getElementById('messagesContainer');
  if (!c) return;
  const div = document.createElement('div');
  div.className = 'message user';
  if (isUserCard) {
    div.innerHTML = `<div class="payment-card my-card"><div class="payment-card-header"><span class="payment-card-icon">🌸</span><span class="payment-card-label">MY CARD</span></div><div class="payment-card-item">${itemName}</div><div class="payment-card-amount">£${amount}</div><div class="payment-card-footer"><span class="payment-card-status">✓ 支付成功</span><span class="payment-card-time">${dateStr} ${timeStr}</span></div></div>`;
  } else {
    div.innerHTML = `<div class="payment-card ghost-card"><div class="payment-card-header"><span class="payment-card-label">GHOST CARD</span><span class="payment-card-chip">◈</span></div><div class="payment-card-item">${itemName}</div><div class="payment-card-amount">£${amount}</div><div class="payment-card-footer"><span class="payment-card-status">✓ APPROVED</span><span class="payment-card-time">${dateStr} ${timeStr}</span></div></div>`;
  }
  c.appendChild(div); c.scrollTop = c.scrollHeight;
}

function showCardSelector(amount, itemName, onUserCard, onGhostCard) {
  const ghostAvailable = getGhostCardBalance();
  const userBal = typeof getBalance === 'function' ? getBalance() : 0;
  const canUseGhost = ghostAvailable >= amount;
  const canUseUser  = userBal >= amount;
  const existing = document.getElementById('cardSelectorModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'cardSelectorModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(10,20,10,0.6);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;';

  modal.innerHTML = `
    <div style="
      background: rgba(240,248,234,0.92);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border-radius: 24px 24px 0 0;
      padding: 28px 20px 44px;
      width: 100%; max-width: 420px;
      animation: slideUp 0.28s cubic-bezier(0.34,1.2,0.64,1);
      border-top: 1px solid rgba(120,180,85,0.25);
      box-shadow: 0 -8px 40px rgba(20,60,10,0.15);
    ">
      <div style="text-align:center;margin-bottom:22px;">
        <div style="width:36px;height:4px;background:rgba(60,120,40,0.2);border-radius:2px;margin:0 auto 16px;"></div>
        <div style="font-size:9px;letter-spacing:3px;color:rgba(40,90,30,0.5);margin-bottom:6px;">SELECT PAYMENT</div>
        <div style="font-size:26px;font-weight:700;color:#1e3d20;letter-spacing:-0.5px;">£${amount}</div>
        <div style="font-size:12px;color:rgba(40,90,30,0.45);margin-top:3px;">${itemName}</div>
      </div>

      <!-- 我的卡：毛玻璃绿色 -->
      <div onclick="window._cardSelect('user')" style="
        background: rgba(255,255,255,0.65);
        backdrop-filter: blur(12px);
        border: 1.5px solid ${canUseUser ? 'rgba(100,170,70,0.4)' : 'rgba(180,180,180,0.2)'};
        border-radius: 18px; padding: 16px 18px; margin-bottom: 10px;
        cursor: ${canUseUser ? 'pointer' : 'not-allowed'};
        opacity: ${canUseUser ? 1 : 0.4};
        display: flex; align-items: center; justify-content: space-between;
        box-shadow: 0 2px 12px rgba(60,120,40,0.08);
        transition: all 0.15s;
      ">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="
            width:42px;height:42px;border-radius:12px;
            background:linear-gradient(135deg,rgba(90,154,70,0.15),rgba(120,185,85,0.1));
            border:1px solid rgba(90,154,70,0.2);
            display:flex;align-items:center;justify-content:center;font-size:20px;
          ">💳</div>
          <div>
            <div style="font-size:13px;font-weight:600;color:#1e3d20;">我的卡</div>
            <div style="font-size:11px;color:rgba(40,90,30,0.5);margin-top:1px;">余额 £${userBal.toFixed(2)}</div>
          </div>
        </div>
        <div style="font-size:16px;color:rgba(60,130,40,0.5);">${canUseUser ? '›' : '不足'}</div>
      </div>

      <!-- Ghost Card：暗金 -->
      <div onclick="window._cardSelect('ghost')" style="
        background: linear-gradient(135deg,#161c14,#1e2a1a,#161c14);
        border: 1.5px solid ${canUseGhost ? 'rgba(201,168,76,0.45)' : 'rgba(80,80,70,0.4)'};
        border-radius: 18px; padding: 16px 18px; margin-bottom: 20px;
        cursor: ${canUseGhost ? 'pointer' : 'not-allowed'};
        opacity: ${canUseGhost ? 1 : 0.4};
        display: flex; align-items: center; justify-content: space-between;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(201,168,76,0.1);
        position: relative; overflow: hidden;
      ">
        <div style="
          position:absolute;width:80px;height:80px;border-radius:50%;
          background:radial-gradient(circle,rgba(201,168,76,0.08),transparent 70%);
          top:-20px;right:-10px;pointer-events:none;
        "></div>
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="
            width:42px;height:42px;border-radius:12px;
            background:rgba(201,168,76,0.1);
            border:1px solid rgba(201,168,76,0.25);
            display:flex;align-items:center;justify-content:center;
            font-size:18px;color:#c9a84c;
          ">◈</div>
          <div>
            <div style="font-size:12px;font-weight:600;color:#c9a84c;letter-spacing:2px;">GHOST CARD</div>
            <div style="font-size:11px;color:rgba(201,168,76,0.5);margin-top:1px;">
              ${canUseGhost ? `可用 £${ghostAvailable.toFixed(2)}` : '额度不足'}
            </div>
          </div>
        </div>
        <div style="font-size:16px;color:rgba(201,168,76,0.6);">${canUseGhost ? '›' : '—'}</div>
      </div>

      <div onclick="window._cardSelect('cancel')" style="text-align:center;font-size:13px;color:rgba(40,90,30,0.4);cursor:pointer;padding:8px;letter-spacing:0.5px;">取消</div>
    </div>
  `;

  window._cardSelect = (choice) => {
    modal.remove(); delete window._cardSelect;
    if (choice === 'user' && canUseUser) onUserCard();
    else if (choice === 'ghost' && canUseGhost) onGhostCard();
  };

  document.body.appendChild(modal);
}
