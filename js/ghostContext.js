// ===================================================
// ghostContext.js — Ghost 事实资料夹（Ghost Context V1）
// ===================================================
//
// 这个文件是干什么的：
//   Simon 每轮回复前，先拿到的一份"事实资料夹"。
//   它只回答一个问题："现在，真实情况是什么。"
//
// 它管什么（只管已经真实存在的信息）：
//   - 她是谁（userName / 她所在的国家）
//   - 已婚这件事本身（事实，不是表现指令）
//   - Ghost 当前在哪（currentLocation / currentLocationReason）
//   - Ghost 所在地此刻的真实日期 / 星期 / 时间（复用 profile.js 的 Ghost Time Authority）
//   - Ghost 所在地此刻的真实天气
//   - 本轮相关的长期记忆 / 世界书 / 关系理解召回
//
// 它不管什么（这些属于后续批次，别加进来）：
//   - mood / warmth / sharpness / initiative
//   - jealousy / affection / trust 数值
//   - random activity / asleep / training / on duty 等推测
//   - pacing / 表达风格 / SEND_GIFT / Diary / Feed / Takeout / Delivery / Market
//   - 任何"所以你应该怎么回"的指令
//
// 核心原则（最重要）：
//   系统负责告诉 Simon 发生了什么，
//   不负责告诉 Simon 应该怎么表现。
//   ——只给世界事实，不给演法。
//
// 什么 Bug 来这里找：
//   - Ghost 把她的名字 / 国家说错
//   - Ghost 搞错自己当前所在地或原因
//   - Ghost 的当地时间 / 星期 / 日期 不对（时区问题继续查 profile.js 的 getGhostTimeZone）
//   - Ghost 说错当前天气
//   - 该召回的记忆 / 世界书 / 关系理解没进 prompt
//   - 如果是"语气/情绪/表现不对"——那不在这里，去 persona.js 的动态块找。
// ===================================================


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildGhostContextBlock — 本轮事实资料夹
// 放在 persona.js 动态层 [CURRENT STATE] 之后，不进固定缓存层。
// opts.skipWorldBook：跳过世界书召回（见 persona.js Gemini 路径说明）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildGhostContextBlock(opts) {
  const _skipWorldBook = !!(opts && opts.skipWorldBook);

  // —— 她是谁 ——
  const userName = localStorage.getItem('userName') || '你';
  const userCountry = localStorage.getItem('userCountry') || 'CN';
  const countryInfo = (typeof COUNTRY_DATA !== 'undefined' && COUNTRY_DATA[userCountry])
    || { name: 'China', flag: '🇨🇳' };

  // —— Ghost 当前在哪 ——
  const location = localStorage.getItem('currentLocation') || 'Hereford Base';
  const locationReason = localStorage.getItem('currentLocationReason');

  // —— Ghost 所在地此刻真实日期/时间（复用 profile.js Ghost Time Authority，不重写时区）——
  const ghostDate = (typeof getGhostDateStr === 'function') ? getGhostDateStr() : '';
  const ghostWeekday = (typeof getGhostWeekday === 'function') ? getGhostWeekday() : '';
  let ghostClock = '';
  if (typeof getGhostTimeZone === 'function') {
    try {
      ghostClock = new Intl.DateTimeFormat('en-GB', {
        timeZone: getGhostTimeZone(), hour: '2-digit', minute: '2-digit', hour12: false
      }).format(new Date());
    } catch (e) { ghostClock = ''; }
  }

  // —— Ghost 所在地此刻真实天气 ——
  const weather = (localStorage.getItem('lastWeatherDisplay') || '').replace(/^undefined$/i, '').trim();

  // —— 本轮相关召回（基于她最后一条消息）——
  const userLastMsg = (typeof chatHistory !== 'undefined')
    ? (chatHistory.filter(m => m.role === 'user').slice(-1)[0]?.content || '')
    : '';
  const longTermMemory = (typeof recallLongTermMemory === 'function')
    ? recallLongTermMemory(userLastMsg, 3) : '';
  const worldBookRecall = (!_skipWorldBook && typeof recallWorldBook === 'function')
    ? recallWorldBook(userLastMsg, 4) : '';
  const relationshipUnderstanding = (typeof recallRelationshipUnderstanding === 'function')
    ? recallRelationshipUnderstanding(userLastMsg, 3) : '';

  // ===== 组装（纯事实陈述，无任何表现指令）=====
  const lines = [];
  lines.push(`[GHOST CONTEXT — what is actually true right now. Facts only, not instructions on how to act.]`);
  lines.push('');
  lines.push(`Your wife: ${userName}, in ${countryInfo.flag} ${countryInfo.name}.`);
  lines.push(`You are married to her. That is a fact, not something to prove or perform.`);
  lines.push('');
  lines.push(`Where you are right now: ${location}${locationReason ? ` (${locationReason})` : ''}.`);

  // 时间：只报"现在几点/星期几/日期"这种世界事实，不解释"这个点该干嘛"。
  const timeBits = [ghostWeekday, ghostDate, ghostClock].filter(Boolean).join(' · ');
  if (timeBits) {
    lines.push(`Local date & time where you are: ${timeBits}. (A plain fact about now, not a cue for what you should be doing.)`);
  }

  if (weather) {
    lines.push(`Current weather where you are: ${weather}. (A plain fact about your surroundings.)`);
  }

  if (longTermMemory) {
    lines.push('');
    lines.push(`Relevant long-term memories:\n${longTermMemory}`);
  }
  if (worldBookRecall) {
    lines.push('');
    lines.push(worldBookRecall);
  }
  if (relationshipUnderstanding) {
    lines.push('');
    lines.push(relationshipUnderstanding);
  }

  // —— Unresolved Conflict (Phase 3H-3E) ——
  const conflict = (typeof getUnresolvedConflict === 'function') ? getUnresolvedConflict() : null;
  if (conflict) {
    lines.push('');
    lines.push('There is an unresolved conflict between you.');
    if (conflict.cause) {
      lines.push(`Cause: ${conflict.cause}`);
    }
  }

  return lines.join('\n');
}
