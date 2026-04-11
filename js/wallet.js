// ===== 钱包系统 (wallet.js) =====
// ===== 钱包系统 =====
function getBalance() {
  // 迁移v3：清空旧数据，发新婚礼金（云端标记，换浏览器不重复领）
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

  // 开服补偿（2026年4月）：云端标记控制，换浏览器不重复领
  if (!localStorage.getItem('maintenanceComp_20260409')) {
    localStorage.setItem('maintenanceComp_20260409', '1');
    addTransaction({ icon: '🎁', name: '开服补偿', amount: 200 });
  }

  // 从transactions算余额
  const txs = getTransactions();
  return Math.max(0, txs.reduce((sum, t) => t.ghostCard ? sum : sum + (t.amount || 0), 0));
}

function setBalance(val) {
  // 不再直接存wallet，余额由transactions决定
  // 只更新UI显示
  const safeVal = Math.max(0, val);
  const balEl = document.getElementById('transferBalance');
  if (balEl) balEl.textContent = '£' + Math.floor(safeVal);
  const walletBalEl = document.getElementById('walletBalance');
  if (walletBalEl) walletBalEl.textContent = '£' + safeVal.toFixed(2);
  touchLocalState();
  if (typeof saveToCloud === 'function') saveToCloud().catch(()=>{}); // 余额变动立即写云端
}
function getTransactions() {
  return JSON.parse(localStorage.getItem('transactions') || '[]');
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
  // 交易是重要操作，立即写云端，不走防抖
  if (typeof saveToCloud === 'function') saveToCloud().catch(()=>{});
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

  const txList = getTransactions();
  const now = new Date();
  const monthKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  let monthIn = 0, monthOut = 0;
  txList.forEach(tx => {
    if (tx.time && tx.time.startsWith(monthKey)) {
      if (tx.amount > 0) monthIn += tx.amount;
      else monthOut += Math.abs(tx.amount);
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
  const available      = card ? Math.max(0, Math.min(card.balance, card.monthlyLimit - card.spentThisMonth)) : 0;
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
