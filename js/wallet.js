// ===== 钱包系统 (wallet.js) =====
// ===== 钱包系统 =====

// 修复：把初始化和补偿逻辑从 getBalance() 里独立出来
// getBalance() 会被高频调用（每次显示余额都会触发），放里面容易重复执行
// initWallet() 只在页面初始化时调用一次（在 index.js 或页面入口里调用）
function initWallet() {
  // 迁移v3：清空旧数据，发新婚礼金
  if (!localStorage.getItem('walletMigrated_v3')) {
    localStorage.setItem('walletMigrated_v3', '1');
    localStorage.removeItem('walletMigrated_v2');
    localStorage.removeItem('walletMigrated');
    localStorage.removeItem('transactions');
    localStorage.removeItem('wallet');
    // 新婚礼金：只在没有云端标记时发放
    if (!localStorage.getItem('weddingGift_v1')) {
      localStorage.setItem('weddingGift_v1', '1');
      addTransaction({ icon: '💍', name: '新婚礼金', amount: 200 });
    }
  }
  // 开服补偿（2026年4月）：只执行一次
  if (!localStorage.getItem('maintenanceComp_20260409')) {
    localStorage.setItem('maintenanceComp_20260409', '1');
    addTransaction({ icon: '🎁', name: '开服补偿', amount: 200 });
  }

  // 双倍扣款补偿（2026年5月）：每人只能领一次
  if (!localStorage.getItem('bugComp_20260516')) {
    localStorage.setItem('bugComp_20260516', '1');
    addTransaction({ icon: '💰', name: '双倍扣款补偿', amount: 888 });
  }

  // 迁移：首次打开时把旧用户超额的transactions压缩进walletBaseBalance
  // 旧版用户可能有200条记录，直接压缩成50条明细+基础余额
  if (!localStorage.getItem('walletCompacted_v1')) {
    localStorage.setItem('walletCompacted_v1', '1');
    _compactTransactions();
  }

  // 恢复被错误脚本清零的黑卡余额
  // 有 ghostCardBalanceFix_20260516 标记 = 被我的脚本改过，直接恢复满额
  if (localStorage.getItem('ghostCardBalanceFix_20260516') === '1' &&
      !localStorage.getItem('ghostCardBalanceRestored_20260516')) {
    localStorage.setItem('ghostCardBalanceRestored_20260516', '1');
    try {
      const _gc = JSON.parse(localStorage.getItem('ghostCard') || 'null');
      if (_gc && typeof _gc.monthlyLimit === 'number' && _gc.monthlyLimit > 0) {
        _gc.balance = _gc.monthlyLimit;
        _gc.spentThisMonth = 0;
        localStorage.setItem('ghostCard', JSON.stringify(_gc));
        if (typeof renderGhostCardWallet === 'function') renderGhostCardWallet();
        if (typeof renderWallet === 'function') renderWallet();
      }
    } catch(e) {}
  }

  // 迁移：老用户 marriageType 升级
  // affection >= 60 的用户应已是 established，但旧版可能仍停在 slowBurn
  // slowBurn 会让 moneyEase -1，导致黑卡上限卡在 £2000 而非 £2600
  if (!localStorage.getItem('marriageTypeUpgrade_v1')) {
    localStorage.setItem('marriageTypeUpgrade_v1', '1');
    const _curType = localStorage.getItem('marriageType');
    const _aff = parseInt(localStorage.getItem('affection') || '0');
    if (_curType === 'slowBurn' && _aff >= 60) {
      localStorage.setItem('marriageType', 'established');
      localStorage.setItem('relationshipUnlocked', 'true');
    }
  }
  // v2：修复 v1 时 affection 不足60但现在已达到的用户
  if (!localStorage.getItem('marriageTypeUpgrade_v2')) {
    localStorage.setItem('marriageTypeUpgrade_v2', '1');
    const _curType2 = localStorage.getItem('marriageType');
    const _aff2 = parseInt(localStorage.getItem('affection') || '0');
    if (_curType2 === 'slowBurn' && _aff2 >= 60) {
      localStorage.setItem('marriageType', 'established');
      localStorage.setItem('relationshipUnlocked', 'true');
    }
  }

  // 余额漂移误删补偿：balanceDriftFixed_20260523 把合法余额误删了
  // 受影响用户：本地余额比云端高500+，被清理后余额暴跌
  // 补偿：确保余额不低于已发放补偿之和（1288）
  if (!localStorage.getItem('driftVictimComp_v1')) {
    localStorage.setItem('driftVictimComp_v1', '1');
    const _curBal = getBalance();
    let _minExpected = 0;
    if (localStorage.getItem('weddingGift_v1'))           _minExpected += 200;
    if (localStorage.getItem('maintenanceComp_20260409')) _minExpected += 200;
    if (localStorage.getItem('bugComp_20260516'))         _minExpected += 888;
    if (_minExpected > 0 && _curBal < _minExpected) {
      const _diff = _minExpected - _curBal;
      addTransaction({ icon: '💰', name: '余额异常补偿', amount: Math.ceil(_diff) });
    }
  }

  // 安全网：所有补偿标记都已设置，但余额仍为0，说明数据被意外清空
  // 把已发放的补偿金额写入 walletBaseBalance，防止用户钱包永远显示零
  if (!localStorage.getItem('walletZeroFix_v1')) {
    localStorage.setItem('walletZeroFix_v1', '1');
    const _curBal = getBalance();
    if (_curBal === 0) {
      // 计算应有的最低基础余额（已发放的补偿之和）
      let _minBase = 0;
      if (localStorage.getItem('weddingGift_v1'))           _minBase += 200;
      if (localStorage.getItem('maintenanceComp_20260409')) _minBase += 200;
      if (localStorage.getItem('bugComp_20260516'))         _minBase += 888;
      if (_minBase > 0) {
        localStorage.setItem('walletBaseBalance', _minBase.toFixed(2));
      }
    }
  }

  // 老用户 trust 被云端快照覆盖修复：聊了很久但 trustHeat 被重置到低值
  // 判断依据：有签到记录或聊天记录，说明是老用户，trust 不应该低于82
  if (!localStorage.getItem('trustHeatFix_v1')) {
    localStorage.setItem('trustHeatFix_v1', '1');
    const _trust = parseInt(localStorage.getItem('trustHeat') || '0');
    const _turns = parseInt(localStorage.getItem('globalTurnCount') || '0');
    const _hasHistory = (JSON.parse(localStorage.getItem('chatHistory') || '[]')).length > 20;
    // 聊超过50轮或有大量历史记录，认为是老用户，trust 至少应该到82
    if ((_turns > 50 || _hasHistory) && _trust < 82) {
      localStorage.setItem('trustHeat', '82');
    }
  }
}

function getBalance() {
  // 治本修复：余额 = 基础余额（历史压缩值）+ 最近50条明细之和
  // 旧版从所有transactions算，云端只存150条，超出的丢失导致余额变少
  // 新版：旧记录压缩成一个数字存起来，云端只需存50条明细，永远不丢数据
  const base = parseFloat(localStorage.getItem('walletBaseBalance') || '0');
  const txs = getTransactions();
  const detail = txs.reduce((sum, t) => t.ghostCard ? sum : sum + (t.amount || 0), 0);
  return Math.max(0, base + detail);
}

function setBalance(val) {
  // 不再直接存wallet，余额由transactions决定
  // 只更新UI显示
  const safeVal = Math.max(0, val);
  const balEl = document.getElementById('transferBalance');
  if (balEl) balEl.textContent = '£' + Math.floor(safeVal);
  const walletBalEl = document.getElementById('walletBalance');
  if (walletBalEl) walletBalEl.textContent = '£' + safeVal.toFixed(2);
  if (typeof touchLocalState === 'function') touchLocalState();
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave(); // 走防抖，不直接存
}
function getTransactions() {
  return JSON.parse(localStorage.getItem('transactions') || '[]');
}
// 最多保留的明细条数，超出的压缩进基础余额
const TX_DETAIL_LIMIT = 50;

function _compactTransactions() {
  // 把超出50条的旧记录压缩进 walletBaseBalance，只保留最新50条明细
  const list = JSON.parse(localStorage.getItem('transactions') || '[]');
  if (list.length <= TX_DETAIL_LIMIT) return;
  const keep = list.slice(0, TX_DETAIL_LIMIT);        // 最新50条保留
  const old  = list.slice(TX_DETAIL_LIMIT);            // 旧的压缩
  const oldSum = old.reduce((s, t) => t.ghostCard ? s : s + (t.amount || 0), 0);
  const base = parseFloat(localStorage.getItem('walletBaseBalance') || '0');
  localStorage.setItem('walletBaseBalance', (base + oldSum).toFixed(2));
  localStorage.setItem('transactions', JSON.stringify(keep));
}

function addTransaction(tx) {
  if (!tx.time) {
    const now = new Date();
    tx.time = now.getFullYear() + '-' +
      String(now.getMonth()+1).padStart(2,'0') + '-' +
      String(now.getDate()).padStart(2,'0') + ' ' +
      String(now.getHours()).padStart(2,'0') + ':' +
      String(now.getMinutes()).padStart(2,'0');
  }
  if (!tx.id) tx.id = Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const list = getTransactions();
  list.unshift(tx);
  localStorage.setItem('transactions', JSON.stringify(list));
  // 超过50条时自动压缩，防止无限增长
  _compactTransactions();
  // 交易数据写入后立即触发紧急保存（2秒防抖），防止关页面前没存上云端
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave(true);
}

function formatTxTime(timeStr) {
  if (!timeStr) return '';
  const now = new Date();
  const todayStr = now.getFullYear() + '-' +
    String(now.getMonth()+1).padStart(2,'0') + '-' +
    String(now.getDate()).padStart(2,'0');
  const yesterday = new Date(now - 86400000);
  const yStr = yesterday.getFullYear() + '-' +
    String(yesterday.getMonth()+1).padStart(2,'0') + '-' +
    String(yesterday.getDate()).padStart(2,'0');
  const timePart = timeStr.slice(11, 16);
  const datePart = timeStr.slice(0, 10);
  if (datePart === todayStr) return '今天 ' + timePart;
  if (datePart === yStr)     return '昨天 ' + timePart;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [, m, d] = datePart.split('-').map(Number);
  return months[m-1] + ' ' + d + ' · ' + timePart;
}

let txExpanded = false;
const TX_PREVIEW = 5;

function renderWallet() {
  const bal = getBalance();
  const walletBalEl = document.getElementById('walletBalance');
  if (walletBalEl) walletBalEl.textContent = '£' + bal.toFixed(2);

  // 过滤掉黑卡交易：Ghost Card 扣款在黑卡进度条里展示，不放用户钱包列表
  // 否则用户看到红色 -£[amount] 会误以为自己的钱被扣了
  const txList = getTransactions().filter(t => !t.ghostCard);
  const now = new Date();
  const monthKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  let monthIn = 0, monthOut = 0;
  txList.forEach(tx => {
    if (tx.time && tx.time.startsWith(monthKey)) {
      if (tx.amount > 0) monthIn += tx.amount;
      else if (!tx.ghostCard) monthOut += Math.abs(tx.amount);
    }
  });
  const inEl = document.getElementById('monthIncome');
  const outEl = document.getElementById('monthExpense');
  if (inEl) inEl.textContent = '+£' + monthIn.toFixed(0);
  if (outEl) outEl.textContent = '-£' + monthOut.toFixed(0);

  const container = document.getElementById('transactionList');
  const toggleBtn = document.getElementById('transactionToggle');
  if (!container) return;

  if (txList.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:rgba(130,80,170,0.5);padding:24px;font-size:13px;">暂无交易记录</div>';
    if (toggleBtn) toggleBtn.style.display = 'none';
    return;
  }

  const showList = txExpanded ? txList : txList.slice(0, TX_PREVIEW);
  container.innerHTML = showList.map(tx => {
    const isIn = tx.amount > 0;
    return `
    <div class="transaction-item">
      <div class="transaction-icon ${isIn ? 'in' : 'out'}">${tx.icon || '💰'}</div>
      <div class="transaction-info">
        <div class="transaction-name">${tx.name}</div>
        <div class="transaction-time">${formatTxTime(tx.time)}</div>
      </div>
      <div class="transaction-amount ${isIn ? 'in' : 'out'}">
        ${isIn ? '+' : '-'}£${Math.abs(tx.amount).toFixed(0)}
      </div>
    </div>`;
  }).join('');

  if (toggleBtn) {
    if (txList.length > TX_PREVIEW) {
      toggleBtn.style.display = 'block';
      const remaining = txList.length - TX_PREVIEW;
      document.getElementById('transactionToggleCount').textContent = txExpanded ? '' : `（还有 ${remaining} 条）`;
      toggleBtn.querySelector('.toggle-text').textContent = txExpanded ? '收起 ' : '展开全部 ';
      const arrow = toggleBtn.querySelector('.toggle-arrow');
      if (arrow) arrow.classList.toggle('open', txExpanded);
    } else {
      toggleBtn.style.display = 'none';
    }
  }
  renderGhostCardWallet();
}

function toggleTransactions() {
  txExpanded = !txExpanded;
  renderWallet();
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Ghost Card — 钱包面板
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderGhostCardWallet() {
  const container = document.querySelector('.wallet-container');
  if (!container) return;

  let el = document.getElementById('ghostCardWallet');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ghostCardWallet';
    const txSection = container.querySelector('.transaction-section');
    txSection ? container.insertBefore(el, txSection) : container.appendChild(el);
  }

  const card           = (typeof getGhostCard === 'function') ? getGhostCard() : null;
  const coldWar        = localStorage.getItem('coldWarMode') === 'true';
  const suspended      = coldWar || !card || card.monthlyLimit === 0;
  const available      = card ? Math.max(0, card.balance) : 0;
  const monthlyLimit   = card ? card.monthlyLimit : 0;
  const spentThisMonth = card ? (card.spentThisMonth || 0) : 0;
  const usedPct        = monthlyLimit > 0 ? Math.min(100, Math.round(spentThisMonth / monthlyLimit * 100)) : 0;

  if (suspended) {
    el.innerHTML = `
      <div class="wallet-ghost-card wallet-ghost-card--suspended">
        <div class="wgc-label">GHOST CARD</div>
        <div class="wgc-suspended-text">${coldWar ? 'Card suspended' : 'Not available'}</div>
        <div class="wgc-chip">◈</div>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="wallet-ghost-card">
      <div class="wgc-top">
        <div>
          <div class="wgc-label">GHOST CARD</div>
          <div class="wgc-available">£${available.toFixed(0)}</div>
          <div class="wgc-sublabel">available</div>
        </div>
        <div class="wgc-chip">◈</div>
      </div>
      <div class="wgc-bar-wrap">
        <div class="wgc-bar-track">
          <div class="wgc-bar-fill" style="width:${usedPct}%"></div>
        </div>
        <div class="wgc-bar-labels">
          <span>spent £${spentThisMonth.toFixed(0)}</span>
          <span>limit £${monthlyLimit.toFixed(0)}</span>
        </div>
      </div>
    </div>`;
}
