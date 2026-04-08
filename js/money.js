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
  const caps      = { 0: 0, 1: 25, 2: 60, 3: 120 };
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

  // 基础区间按 comfortLevel
  const baseRanges = {
    0: [0, 0],
    1: [10, 25],
    2: [20, 60],
    3: [40, 120],
  };
  const [min, max] = baseRanges[level] || [0, 0];

  // motive修正
  const motiveMultiplier = {
    practical:    1.0,
    care:         1.0,
    celebration:  1.2,  // 特殊日子略高
    compensation: 0.8,  // 补偿不要太大
  }[motive] || 1.0;

  // mood微调
  const moodMult = mood >= 8 ? 1.1 : mood <= 4 ? 0.8 : 1.0;

  let amount = Math.floor((min + Math.random() * (max - min)) * motiveMultiplier * moodMult);
  amount += easeBonus * 5; // firstSalary微加

  // 不超过单次上限
  return Math.min(Math.max(amount, min), getMaxSingleTransfer());
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
    const recentCtx = (typeof chatHistory !== 'undefined' ? chatHistory : [])
      .filter(m => !m._system && !m._recalled).slice(-4)
      .map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${m.content.slice(0, 150)}`).join('\n');
    const res = await callGrokWithSystem(
      buildGhostStyleCore() + '\n' + buildMoneyAskReactionPrompt(pattern),
      recentCtx || 'she asked for money again.',
      100
    );
    if (res && res.trim() && !isBreakout(res)) return res.trim();
  } catch(e) {}

  const fallbacks = {
    light:  ["you already asked.", "not this time.", "drop it."],
    medium: ["you're pushing it.", "this isn't how it works.", "no."],
    heavy:  ["no.", "done.", "."]
  };
  const opts = fallbacks[pattern] || fallbacks.light;
  return opts[Math.floor(Math.random() * opts.length)];
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 统一给钱执行函数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function applyMoneyEffect(amount, options = {}) {
  if (!amount || amount <= 0) return false;

  const userRequested = options.userRequested || false;
  const _aff = getAffection();

  if (_aff < 30) return false;
  if (_aff < 40 && !options.bypassAffectionGate) {
    const _todayLowAffKey = 'lowAffGiven_' + new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(_todayLowAffKey)) return false;
    // 【已接新 motive 体系】——只有 care 动机才在低好感时破例给
    // 调用方通过 options.motive 传入，没传则保守不给
    if (options.motive !== 'care') return false;
    if (Math.random() > 0.3) return false;
    localStorage.setItem(_todayLowAffKey, '1');
    amount = Math.min(amount, 20);
  }

  if (!userRequested && localStorage.getItem('userDislikesMoney') === 'true') return false;

  const todayCount = getTodayGivenCount();
  const dailyLimit = userRequested ? 5 : 3;
  if (todayCount >= dailyLimit) return false;

  if (!userRequested && !options.bypassCooldown) {
    const lastGivenAt = parseInt(localStorage.getItem('lastGivenAt') || '0');
    if (Date.now() - lastGivenAt < _getTransferCooldownMs()) return false;
  }

  if (!userRequested && !options.bypassRefundCooldown) {
    const lastRefundAt = parseInt(localStorage.getItem('lastRefundAt') || '0');
    if (Date.now() - lastRefundAt < 2 * 3600 * 1000) return false;
  }

  const conversationGiven = parseInt(sessionStorage.getItem('conversationGivenCount') || '0');
  if (!userRequested && !options.bypassSessionLimit) {
    if (conversationGiven >= 1) return false;
  }

  const weeklyUsed  = getWeeklyGiven();
  const weeklyLimit = _getWeeklyTransferLimit();

  // 吃醋转账不bypass每周上限
  if (!options.bypassWeeklyLimit && weeklyUsed >= weeklyLimit) return false;

  const actualAmount = options.bypassWeeklyLimit
    ? amount
    : Math.min(amount, weeklyLimit - weeklyUsed);

  if (typeof addTransaction === 'function') {
    addTransaction({ icon: '💷', name: options.label || 'Ghost 零花钱', amount: actualAmount });
  }
  addWeeklyGiven(actualAmount);
  incrementTodayGivenCount();
  localStorage.setItem('lastGivenAt', Date.now());
  sessionStorage.setItem('conversationGivenCount', String(conversationGiven + 1));

  if (typeof renderWallet === 'function') renderWallet();
  if (options.affection !== false) changeAffection(1);
  if (typeof saveToCloud === 'function') saveToCloud().catch(() => {});

  if (options.showCard !== false) {
    const container = document.getElementById('messagesContainer');
    if (container) showGhostTransferCard(container, actualAmount, options.note || '', false);
  }

  return actualAmount;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 周统计
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getWeekKey() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
  return now.getFullYear() + '_w' + week;
}

function getWeeklyGiven() {
  return parseInt(localStorage.getItem('weeklyGiven_' + getWeekKey()) || '0');
}

function addWeeklyGiven(amount) {
  localStorage.setItem('weeklyGiven_' + getWeekKey(), getWeeklyGiven() + amount);
}

function _getTransferCooldownMs() {
  const aff = getAffection();
  if (aff >= 80) return (8 + Math.floor(Math.random() * 5)) * 60 * 1000;
  return 15 * 60 * 1000;
}

function _getWeeklyTransferLimit() {
  const level  = getMoneyComfortLevel();
  const limits = { 0: 0, 1: 75, 2: 200, 3: 350 };
  return limits[level] || 0;
}

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
// context.reason：最近一条用户消息内容，用来判断有没有明确理由
function judgeUserTransfer(amount, context = {}) {
  const coldWar   = localStorage.getItem('coldWarMode') === 'true';
  const level     = getMoneyComfortLevel();
  const maxSingle = getMaxSingleTransfer();
  const mood      = getMoodLevel();
  const trust     = getTrustHeat();
  const aff       = getAffection();

  const reason     = (context.reason || '').toLowerCase();
  const hasReason  = !!reason.trim();
  const isGift     = /礼物|送你|给你的|gift|present|for you/.test(reason);
  const isComp     = /补偿|赔你|我错了|补给你|make it up|compensation|my fault/.test(reason);
  const isPractical = /帮你|拿去用|买东西|use it|for this|for that/.test(reason);

  // 1. 硬拒绝
  if (coldWar)             return { shouldRefund: true, reason: 'coldWar',      acceptAmount: 0 };
  if (isMoneyRefuseActive()) return { shouldRefund: true, reason: 'refuseActive', acceptAmount: 0 };
  if (level === 0)         return { shouldRefund: true, reason: 'comfortLevel', acceptAmount: 0 };
  if (mood <= 3)           return { shouldRefund: true, reason: 'mood',         acceptAmount: 0 };

  // 2. level 3 + gift/comp 大额：部分收，超出退（放在整笔退之前）
  if (level >= 3 && amount > maxSingle && (isGift || isComp)) {
    return { shouldRefund: false, reason: 'overMaxPartial', acceptAmount: maxSingle };
  }

  // 3. 其他大额：整笔退
  if (amount > maxSingle) {
    return { shouldRefund: true, reason: 'overMax', acceptAmount: 0 };
  }

  // 4. Level 1：只收明确合理的小额
  if (level === 1) {
    if (amount <= 25 && (isGift || isPractical || isComp) && mood >= 5) {
      return { shouldRefund: false, reason: 'ok', acceptAmount: amount };
    }
    return { shouldRefund: true, reason: hasReason ? 'tooMuchForLevel' : 'noReason', acceptAmount: 0 };
  }

  // 5. Level 2：可收有理由的小中额
  if (level === 2) {
    if ((isGift || isPractical || isComp) && amount <= 60) {
      return { shouldRefund: false, reason: 'ok', acceptAmount: amount };
    }
    if (!hasReason && amount <= 15 && mood >= 8 && trust >= 70) {
      return { shouldRefund: false, reason: 'smallNoReason', acceptAmount: amount };
    }
    return { shouldRefund: true, reason: hasReason ? 'notThis' : 'noReason', acceptAmount: 0 };
  }

  // 6. Level 3：更自然，但仍不是乱收
  if (level >= 3) {
    if ((isGift || isPractical || isComp) && amount <= maxSingle) {
      return { shouldRefund: false, reason: 'ok', acceptAmount: amount };
    }
    if (!hasReason && amount <= 20 && mood >= 8 && aff >= 75 && trust >= 75) {
      return { shouldRefund: false, reason: 'smallNoReason', acceptAmount: amount };
    }
    return { shouldRefund: true, reason: hasReason ? 'guarded' : 'noReason', acceptAmount: 0 };
  }

  return { shouldRefund: true, reason: 'fallback', acceptAmount: 0 };
}

function confirmTransfer() {
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
  // 用 addTransaction 真正记账，setBalance 只更新 UI 不写 localStorage
  if (typeof addTransaction === 'function') addTransaction({ icon: '💸', name: '转账给 Ghost', amount: -amount });
  if (typeof renderWallet === 'function') renderWallet();

  // 读最近一条用户消息作为转账理由上下文
  const lastUserMessage = (() => {
    if (typeof chatHistory === 'undefined') return '';
    const last = [...chatHistory].reverse().find(m => m.role === 'user' && !m._system && !m._recalled);
    return last?.content || '';
  })();

  // 判断收/退（接入新系统）
  const judgeContext = { reason: lastUserMessage };
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
    judgePrompt = `[System: She transferred £${amount}. Ghost mood ${mood}/10 — he accepted it. Tone follows mood: if high, casual and easy; if neutral, brief and to the point. Write KEEP on its own line at the end.]`;
  }

  if (typeof chatHistory !== 'undefined') {
    chatHistory.push({ role: 'user', content: judgePrompt, _system: true, _userTransfer: { amount } });
    if (typeof saveHistory === 'function') saveHistory();
  }

  const container = document.getElementById('messagesContainer');
  const cardId = container ? showUserTransferCard(container, amount) : null;
  if (typeof showTyping === 'function') showTyping();
  if (typeof _isSending !== 'undefined') _isSending = true;

  // 转账回复用 Grok：结合上下文生成台词，不破防
  const _recentCtxForTransfer = (typeof chatHistory !== 'undefined' ? chatHistory : [])
    .filter(m => !m._system && !m._recalled).slice(-6)
    .map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${m.content.slice(0, 150)}`).join('\n');

  fetchWithTimeout('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: buildGhostStyleCore(),
      user: _recentCtxForTransfer + '\n\n' + judgePrompt,
      max_tokens: 200,
    })
  }, 15000).then(r => r.json()).then(data => {
    if (typeof hideTyping === 'function') hideTyping();
    let reply = data.text?.trim() || '...';
    if (typeof updateToRead === 'function') updateToRead();

    // 破防检测
    if (typeof isBreakout === 'function' && isBreakout(reply)) {
      reply = shouldRefund ? 'sent it back.' : 'noted.';
    }

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

  }).catch(() => {
    if (typeof hideTyping === 'function') hideTyping();
    if (typeof _isSending !== 'undefined') _isSending = false;
    // 网络错误：全退
    const bal = typeof getBalance === 'function' ? getBalance() : 0;
    if (typeof setBalance === 'function') setBalance(bal + amount);
    if (typeof addTransaction === 'function') addTransaction({ icon: '↩️', name: '退款（网络错误）', amount });
    if (typeof renderWallet === 'function') renderWallet();
    updateUserTransferCard(cardId, false);
    if (typeof appendMessage === 'function') appendMessage('bot', '哎呀，网络波动，你老公没收到这条消息，再发一次试试～');
  });
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 转账UI卡片
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

function showGhostTransferCard(container, amount, noteText, isRefund) {
  const now     = new Date();
  const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const hasEnglish = noteText && /[a-zA-Z]/.test(noteText);
  if (noteText && hasEnglish) {
    const parts = noteText.split(/\n---\n/).filter(p => p.trim());
    if (parts.length > 1) {
      parts.forEach((p, i) => setTimeout(() => {
        if (typeof appendMessage === 'function') appendMessage('bot', p.trim());
      }, i * 600));
    } else {
      if (typeof appendMessage === 'function') appendMessage('bot', noteText);
    }
  }
  setTimeout(() => {
    const c = document.getElementById('messagesContainer');
    if (!c) return;
    const divOut = document.createElement('div');
    divOut.className = 'message bot';
    divOut.innerHTML = `<div class="transfer-card ghost-transfer-card ${isRefund ? 'refund-card' : ''}">
      <div class="transfer-card-top">
        <div class="transfer-label">${isRefund ? 'REFUND' : 'TRANSFER TO YOU'}</div>
        <div class="transfer-name">${isRefund ? '退款' : '转给你'}</div>
      </div>
      <div class="transfer-amount-block">
        <div class="transfer-amount-label">AMOUNT</div>
        <div class="transfer-amount">£${amount}</div>
      </div>
      <div class="transfer-footer">
        <div class="transfer-status ${isRefund ? 'refund-status' : ''}">${isRefund ? '退款中' : '转账中'}</div>
        <div class="transfer-time">${timeStr}</div>
      </div></div>`;
    c.appendChild(divOut);
    c.scrollTop = c.scrollHeight;
    setTimeout(() => {
      const c2 = document.getElementById('messagesContainer');
      if (!c2) return;
      const divIn = document.createElement('div');
      divIn.className = 'message user';
      divIn.innerHTML = `<div class="transfer-card user-transfer-card">
        <div class="transfer-card-top">
          <div class="transfer-label">RECEIVED</div>
          <div class="transfer-name">${isRefund ? '已退款 ✓' : '已到账 ✓'}</div>
        </div>
        <div class="transfer-amount-block">
          <div class="transfer-amount-label">AMOUNT</div>
          <div class="transfer-amount">£${amount}</div>
        </div>
        <div class="transfer-footer">
          <div class="transfer-status">${isRefund ? '已退款' : '已到账'}</div>
          <div class="transfer-time">${timeStr}</div>
        </div></div>`;
      c2.appendChild(divIn);
      c2.scrollTop = c2.scrollHeight;
    }, 1000);
  }, noteText ? 800 : 0);
}


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
    const _offlineCtx = (typeof chatHistory !== 'undefined' ? chatHistory : [])
      .filter(m => !m._system && !m._recalled).slice(-4)
      .map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${m.content.slice(0, 150)}`).join('\n');
    const res = await fetchWithTimeout('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: buildGhostStyleCore(),
        user: (_offlineCtx ? _offlineCtx + '\n\n' : '') + `[System: ${hint} Ghost noticed. Say something — could be a pointed question, a casual remark, or just checking in. lowercase, English only.]`,
        max_tokens: 150,
      })
    }, 12000);
    const data = await res.json();
    if (typeof hideTyping === 'function') hideTyping();
    let reply = data.text?.trim() || '';
    if (reply && !(typeof isBreakout === 'function' && isBreakout(reply))) {
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
