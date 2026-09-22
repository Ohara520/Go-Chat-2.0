// ===================================================
// money.js — 关系金钱状态 + Ghost Card + 离线惩罚
//
// 转账系统（用户↔Ghost 双向）已全部移除。
// 金钱只保留：关系深度档位(getMoneyComfortLevel)、周统计(云端同步用)、
// 离线惩罚问候、Ghost Card。嫉妒等情绪走人格语气层，不再触发给钱。
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


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 周统计
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getMonthKey() {
  const now = new Date();
  return now.getFullYear() + '_m' + (now.getMonth() + 1);
}

// 修复：getWeekKey 改为返回真正的周编号（ISO week number）
// 格式：2026-W33
function getWeekKey() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now - start) / (24 * 60 * 60 * 1000));
  const weekNum = Math.ceil((days + start.getDay() + 1) / 7);
  return now.getFullYear() + '-W' + String(weekNum).padStart(2, '0');
}

function getWeeklyGiven() {
  return parseInt(localStorage.getItem('monthlyGiven_' + getMonthKey()) || '0');
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
    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: typeof getMainModel === 'function' ? getMainModel() : 'claude-sonnet-4-6',
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
      reply = reply.replace(/\n?(REFUND|\bKEEP\b|COLD_WAR_START|GIVE_MONEY:[^\n]*)\n?/g, '').trim();
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

  // 金融师职业福利：Ghost Card 上限加成
  if (typeof getCareerGhostCardBonus === 'function') {
    limit += getCareerGhostCardBonus();
  }

  return Math.max(0, Math.min(limit, 4000)); // 上限提高到4000（金融师满级可达）
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

    // 修复：月初重置和上限差额补偿只执行一次，用 _lastCalcKey 标记
    // 原逻辑每次调用 getGhostCard() 都重算，导致余额漂移（登录扣20、每日少5等）
    const nowMonthKey = now.getFullYear() * 100 + now.getMonth();
    const savedMonthKey = (saved.lastResetYear || 0) * 100 + (saved.lastResetMonth ?? 99);
    const _currentCareer = typeof getCareer === 'function' ? getCareer() : '';
    const _currentLevel  = typeof getCareerLevel === 'function' ? getCareerLevel() : 0;
    const _savedCareer = saved._careerType || '';
    const _calcKey = nowMonthKey + '_' + _currentCareer + '_' + _currentLevel;

    if (saved._lastCalcKey !== _calcKey) {
      // 月初重置
      if (savedMonthKey !== nowMonthKey) {
        const newLimit = getGhostCardMonthlyLimit();
        // 月初重置：上限取历史最高和新算值的较大值（只升不降，冷战除外）
        const _peakLimit = saved._peakLimit || 0;
        const _resetLimit = monthlyLimit === 0 ? 0 : Math.max(newLimit, _peakLimit);
        saved.monthlyLimit   = _resetLimit;
        saved.spentThisMonth = 0;
        saved.lastResetMonth = now.getMonth();
        saved.lastResetYear  = now.getFullYear();
        // 旧余额保留，叠加新月额度，3个月封顶防止无限堆积。
        // 修复(#19)：封顶必须基于历史峰值额度，且绝不主动缩减已有余额。
        // 否则某个月心情差/吃醋把额度临时压到1000时，cap=_resetLimit*3=3000，
        // 会把之前累积的~6000余额砍半（用户报告"5.20有六千多现在变三千"）。
        const _prevBalance = saved.balance || 0;
        const _capBase = Math.max(_resetLimit, saved._peakLimit || 0, saved.monthlyLimit || 0);
        const _accumCap = Math.max(_capBase * 3, _prevBalance); // 永不低于现有余额
        saved.balance = Math.min(_prevBalance + _resetLimit, _accumCap);
      }

      // 职业切换重算上限：同样只升不降
      if (_currentCareer !== _savedCareer) {
        const _peakLimit = saved._peakLimit || 0;
        const _newCareerLimit = monthlyLimit === 0 ? 0 : Math.max(monthlyLimit, _peakLimit);
        saved.monthlyLimit = _newCareerLimit;
        saved._careerType = _currentCareer;
      }

      // lockedLimit：取当前算出值、已存值、历史峰值三者最大（冷战归零除外）
      const _peak = saved._peakLimit || 0;
      const lockedLimit = monthlyLimit === 0 ? 0 : Math.max(saved.monthlyLimit || 0, monthlyLimit, _peak);

      // 上限升级补差额（只在本次计算周期内执行一次）
      const oldLimit = saved.monthlyLimit || 0;
      if (lockedLimit > oldLimit && oldLimit > 0) {
        const diff = lockedLimit - oldLimit;
        saved.balance = Math.min((saved.balance || 0) + diff, lockedLimit);
      }

      saved.monthlyLimit = lockedLimit;
      // 记录历史峰值（冷战时不更新峰值，恢复后能回到原来的上限）
      if (lockedLimit > 0) saved._peakLimit = Math.max(saved._peakLimit || 0, lockedLimit);
      saved._careerType = _currentCareer;
      saved._lastCalcKey = _calcKey; // 标记本周期已计算，防止重复执行
    }

    if (saved.lastDailyAt) delete saved.lastDailyAt; // 清理旧字段
    // 兜底：余额不能为负
    if (saved.balance < 0) saved.balance = 0;
    localStorage.setItem('ghostCard', JSON.stringify(saved));
    return { ...defaults, ...saved };
  } catch(e) { return defaults; }
}

function saveGhostCard(card) {
  try { localStorage.setItem('ghostCard', JSON.stringify(card)); } catch(e) {}
}

function getGhostCardBalance() {
  const card = getGhostCard();
  if (card.monthlyLimit === 0) return 0; // 冷战 / 硬关闭
  return Math.max(0, card.balance);
}

function spendGhostCard(amount, itemName, category) {
  category = category || 'unknown';
  const card = getGhostCard();
  const available = card.monthlyLimit === 0 ? 0 : card.balance;
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
  const state = typeof getGhostResponseState === 'function' ? getGhostResponseState() : {};
  const { moneyEase = 1 } = state;

  const history = JSON.parse(localStorage.getItem('ghostCardRecentSpend') || '[]');
  history.push({ amount, category, at: Date.now() });
  const last10min = history.filter(s => Date.now() - s.at < 10 * 60 * 1000);
  localStorage.setItem('ghostCardRecentSpend', JSON.stringify(history.slice(-20)));

  const limit = card.monthlyLimit || getGhostCardMonthlyLimit() || 2000;
  const ratio = amount / limit;

  // C: 门槛上移，敏感度只由金额驱动，日常/中小额默认沉默
  let score = 0;
  const isLarge = ratio > 0.3 || amount > 400;       // 异常大额
  if (isLarge) score = 3;                            // 大额
  else if (ratio > 0.15 || amount > 200) score = 2;  // 中额
  else if (ratio > 0.08 || amount > 100) score = 1;  // 中小额
  if (moneyEase >= 2 && !isLarge) score -= 0.5;      // 手头宽松更沉默，但异常大额不打折
  const todayReacted = localStorage.getItem(`ghostCardReacted_${category}_${new Date().toDateString()}`);
  if (todayReacted && !isLarge) score -= 1;          // 同品类当天已反应过降一档，但异常大额不打折

  // 短时高频（10 分钟内 3 笔）直接担心
  if (last10min.length >= 3) return { reactionType: 'worry' };

  // E: 只有三档 —— 沉默 / 暖一句 / 担心一句
  let reactionType;
  if (score < 2)      reactionType = 'ignore';   // 大多数情况：沉默
  else if (score < 3) reactionType = 'warm';     // 偶尔一次：暖一句
  else                reactionType = 'worry';    // 罕见大额：担心一句

  // D: 判定顺序 —— 先单笔反应，若单笔沉默，再看累积；不叠加
  if (reactionType === 'ignore') _maybeSetCumulativePending(history, limit);

  return { reactionType };
}

// D: 本周累计 ≥ 月额度 60% 时挂起 pending（不立即注入），每周最多一次
function _maybeSetCumulativePending(history, limit) {
  const weekAgo = Date.now() - 7 * 86400000;
  const weekSum = history.filter(s => s.at >= weekAgo).reduce((sum, s) => sum + (s.amount || 0), 0);
  if (weekSum < limit * 0.6) return;
  const wk = _isoWeekKey();
  if (localStorage.getItem('ghostCardCumulativeWeek') === wk) return; // 本周已触发过
  if (localStorage.getItem('ghostCardPending')) return;               // 上一个 pending 还没说出口
  localStorage.setItem('ghostCardPending', JSON.stringify({ weekSum: Math.round(weekSum), triggeredAt: Date.now() }));
  localStorage.setItem('ghostCardCumulativeWeek', wk);
}

function _isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${weekNo}`;
}

// A: 注入只留金额，绝不泄露品类/物品。itemName 保留签名但不再用于拼注入。
function _buildGhostCardPrompt(amount, itemName, category, decision) {
  const { reactionType, cumulative } = decision;
  const state = typeof getGhostResponseState === 'function' ? getGhostResponseState() : {};
  const reactionHint = {
    ignore: null,
    warm:   `Nothing alarming. If anything, a light, easy line — glad she treated herself. Don't ask what it was. Something like "spend it however makes you happy."`,
    worry:  cumulative
      ? `She's spent more than usual this week — you can feel it adding up. One gentle, caring line, a little worried but not accusing. Something like "you've been spending a bit more lately — everything okay?"`
      : `That's a larger amount than usual. One line — a touch worried, checking she's alright, not interrogating. Something like "that's a lot at once — everything alright?"`,
  }[reactionType];
  if (!reactionHint) return null;
  return `[Bank alert: £${amount} was charged to the card you gave her. That's all you see — an amount, not what she bought.
Your reaction: ${reactionHint}
State — warmth: ${state.warmth ?? 1}/3, sharpness: ${state.sharpness ?? 0}/3, money ease: ${state.moneyEase ?? 1}/3.
One line only. English. Lowercase. Do not mention "card", "bank", or "alert". Never guess or name what she bought.]`;
}

async function _ghostCardReaction(amount, itemName, category, card) {
  try {
    const _isFlirting = (chatHistory || []).slice(-4).some(m => m._intimate);
    if (_isFlirting) return;
    const decision = _classifySpend(amount, category, card);
    if (decision.reactionType === 'ignore') return; // 沉默；累积 pending 已在 _classifySpend 里挂起
    const prompt = _buildGhostCardPrompt(amount, itemName, category, decision);
    if (!prompt) return;
    localStorage.setItem(`ghostCardReacted_${category}_${new Date().toDateString()}`, '1');
    await new Promise(r => setTimeout(r, 3000));
    await _sendGhostCardLine(prompt);
  } catch(e) { console.warn('[GhostCard] 反应失败:', e); }
}

// D 的下半场：下一轮对话时检查 pending，等她聊到钱/消费/近况才注入
async function checkGhostCardPending(text) {
  try {
    const raw = localStorage.getItem('ghostCardPending');
    if (!raw) return;
    const pending = JSON.parse(raw);
    if (Date.now() - (pending.triggeredAt || 0) > 48 * 3600000) { // 48h 过期
      localStorage.removeItem('ghostCardPending');
      return;
    }
    const kw = /钱|买|花|消费|预算|账单|工资|最近|状态|spend|spent|bought|buy|money|budget|afford|broke|cost/i;
    if (!kw.test(text || '')) return; // 没聊到，继续等
    const _isFlirting = (chatHistory || []).slice(-4).some(m => m._intimate);
    if (_isFlirting) return; // 亲密时刻不打断，pending 保留
    localStorage.removeItem('ghostCardPending');
    const prompt = _buildGhostCardPrompt(pending.weekSum, '', 'unknown', { reactionType: 'worry', cumulative: true });
    if (!prompt) return;
    await new Promise(r => setTimeout(r, 2000));
    await _sendGhostCardLine(prompt);
  } catch(e) { console.warn('[GhostCard] pending 检查失败:', e); }
}

async function _sendGhostCardLine(prompt) {
  const _sys = typeof buildGhostStyleCore === 'function' ? buildGhostStyleCore() : '';
  const _res = await fetchWithTimeout('/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: typeof getMainModel === 'function' ? getMainModel() : 'claude-sonnet-4-6', max_tokens: 60, system: _sys, messages: [...(chatHistory||[]).filter(m=>!m._system).slice(-4), { role:'user', content: prompt }] })
  }, 10000);
  const _data = await _res.json();
  const _reply = (_data.content?.[0]?.text || '').trim();
  const _bad = ["i'm claude","i am claude","as an ai","can't roleplay","ghost card","notification","bank alert"];
  if (_reply && !_bad.some(p => _reply.toLowerCase().includes(p))) {
    if (typeof appendMessage === 'function') appendMessage('bot', _reply);
    if (typeof chatHistory !== 'undefined') { chatHistory.push({ role:'assistant', content: _reply }); if (typeof saveHistory === 'function') saveHistory(); }
  }
}

function showGhostCardReceipt(amount, itemName, isUserCard) { /* 已停用：账单不在聊天框显示 */ }

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

  // 修复：用唯一ID替代 window._cardSelect
  // 旧写法 window._cardSelect 是全局唯一的，连续快速购买两件商品时
  // 第二个弹窗会覆盖第一个的回调，导致第一个弹窗的按钮触发第二个弹窗的支付逻辑
  // 造成串台、双倍扣款或用户卡/黑卡混用的问题
  const _cbKey = '_cardSel_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  window[_cbKey] = (choice) => {
    modal.remove();
    delete window[_cbKey];
    if (choice === 'user' && canUseUser) onUserCard();
    else if (choice === 'ghost' && canUseGhost) onGhostCard();
  };

  // 把 innerHTML 里的 onclick 替换成唯一key
  modal.querySelectorAll('[onclick]').forEach(el => {
    const oc = el.getAttribute('onclick') || '';
    el.setAttribute('onclick', oc.replace(/window\._cardSelect/g, "window['" + _cbKey + "']"));
  });

  document.body.appendChild(modal);
}
