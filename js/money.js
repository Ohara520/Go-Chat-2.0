// ===================================================
// money.js — 金钱状态 + Ghost Card
//
// 转账系统（用户↔Ghost 双向）已全部移除。
// 金钱只保留：周统计（云端同步兼容）、Ghost Card。
//
// 依赖：state.js / cloud.js
// ===================================================


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

    // 用 _lastCalcKey 标记本月已处理固定额度与月度重置
    // 原逻辑每次调用 getGhostCard() 都重算，导致余额漂移（登录扣20、每日少5等）
    const nowMonthKey = now.getFullYear() * 100 + now.getMonth();
    const savedMonthKey = (saved.lastResetYear || 0) * 100 + (saved.lastResetMonth ?? 99);
    const _calcKey = nowMonthKey;

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

      // 保持固定 £10,000 上限
      saved.monthlyLimit = monthlyLimit;

      // 上限升级补差额：V2 固定上限，不再需要
      // lockedLimit / _peakLimit 逻辑移除

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
  const card = getGhostCard();
  const available = card.monthlyLimit === 0 ? 0 : card.balance;
  if (available < amount) return false;
  card.balance = Math.round(card.balance - amount);
  card.spentThisMonth = Math.round(card.spentThisMonth + amount);
  saveGhostCard(card);
  if (typeof addTransaction === 'function') addTransaction({ icon: '💳', name: `Ghost Card · ${itemName}`, amount: -amount, ghostCard: true });
  if (typeof renderWallet === 'function') renderWallet();
  return true;
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
