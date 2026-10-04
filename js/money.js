// ===================================================
// money.js — 金钱状态 + Ghost Card
//
// 转账系统（用户↔Ghost 双向）已全部移除。
// 金钱只保留：周统计（云端同步兼容）、Ghost Card。
// getMoneyComfortLevel 仅作旧模块兼容，不再读取 Trust / Affection / marriageType。
//
// 依赖：state.js / cloud.js
// ===================================================


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Legacy moneyComfortLevel — compatibility only
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Relationship progression no longer controls money behavior.
// Keep the function temporarily because older modules may still call it;
// an established marriage is treated as fully available rather than Trust/marriageType-gated.
function getMoneyComfortLevel() {
  return 3;
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
// Offline relationship penalty / forced comeback — RETIRED
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Time away no longer lowers Affection and no longer auto-generates a husband reaction.
// Shared Reality / normal conversation history should carry the fact of elapsed time.


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💳 Ghost Card 亲情卡系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getGhostCardMonthlyLimit() {
  /*
   * Ghost Card V2: Fixed £10,000 monthly limit.
   *
   * This is NOT a relationship reward and does not vary with:
   * - Trust, Affection, relationship mode
   * - moneyEase, availability, or any Unified state
   * - Career, mood, jealousy, or any other dynamic factor
   *
   * Maximum balance: £10,000
   * Monthly restoration: spent amount is restored, balance capped at £10,000
   */
  return 10000;
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
      localStorage.setItem('ghostCardFixed10k_v1', '1');
      return defaults;
    }

    // Ghost Card fixed-£10k migration (one time).
    // Older users can still carry a fully calculated £3k/legacy card for the current month,
    // which means _lastCalcKey would otherwise prevent the new fixed limit from taking effect.
    if (localStorage.getItem('ghostCardFixed10k_v1') !== '1') {
      saved.monthlyLimit = monthlyLimit;
      saved.balance = monthlyLimit;
      saved.spentThisMonth = 0;
      saved.lastResetMonth = now.getMonth();
      saved.lastResetYear = now.getFullYear();
      // Force the normal calculation block below to stamp the current fixed-rule calc key.
      delete saved._lastCalcKey;
      delete saved._peakLimit;
      delete saved.lockedLimit;
      localStorage.setItem('ghostCardFixed10k_v1', '1');
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
        saved.monthlyLimit   = newLimit;
        saved.spentThisMonth = 0;
        saved.lastResetMonth = now.getMonth();
        saved.lastResetYear  = now.getFullYear();
        // V2: 余额直接重置为上限，不累积
        saved.balance = newLimit;
      }

      // 职业切换重算上限：V2 固定 £10,000，不再需要
      saved.monthlyLimit = monthlyLimit;

      // 上限升级补差额：V2 固定上限，不再需要
      // lockedLimit / _peakLimit 逻辑移除

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
  const history = JSON.parse(localStorage.getItem('ghostCardRecentSpend') || '[]');
  history.push({ amount, category, at: Date.now() });
  const last10min = history.filter(s => Date.now() - s.at < 10 * 60 * 1000);
  localStorage.setItem('ghostCardRecentSpend', JSON.stringify(history.slice(-20)));

  const limit = card.monthlyLimit || getGhostCardMonthlyLimit() || 10000;
  const ratio = amount / limit;

  // 门槛上移，敏感度只由金额驱动，日常/中小额默认沉默
  let score = 0;
  const isLarge = ratio > 0.3 || amount > 400;       // 异常大额
  if (isLarge) score = 3;                            // 大额
  else if (ratio > 0.15 || amount > 200) score = 2;  // 中额
  else if (ratio > 0.08 || amount > 100) score = 1;  // 中小额
  const todayReacted = localStorage.getItem(`ghostCardReacted_${category}_${new Date().toDateString()}`);
  if (todayReacted && !isLarge) score -= 1;          // 同品类当天已反应过降一档，但异常大额不打折

  // 短时高频（10 分钟内 3 笔）直接担心
  if (last10min.length >= 3) return { reactionType: 'worry' };

  // 只有三档 —— 沉默 / 暖一句 / 担心一句
  let reactionType;
  if (score < 2)      reactionType = 'ignore';   // 大多数情况：沉默
  else if (score < 3) reactionType = 'warm';     // 偶尔一次：暖一句
  else                reactionType = 'worry';    // 罕见大额：担心一句

  // 判定顺序 —— 先单笔反应，若单笔沉默，再看累积；不叠加
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
