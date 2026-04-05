// ===== 钱包系统 (wallet.js) =====
// ===== 钱包系统 =====
function getBalance() {
  // 迁移v2：清空旧transactions，统一发£500补偿
  if (!localStorage.getItem('walletMigrated_v3')) {
    localStorage.setItem('walletMigrated_v3', '1');
    localStorage.removeItem('walletMigrated_v2');
    localStorage.removeItem('walletMigrated');
    localStorage.removeItem('transactions');
    localStorage.removeItem('wallet');
    addTransaction({ icon: '💍', name: '新婚礼金', amount: 200 });
  }
  // 从transactions算余额
  const txs = getTransactions();
  return Math.max(0, txs.reduce((sum, t) => sum + (t.amount || 0), 0));
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
  const timePart = timeStr.slice(11, 16); // HH:MM
  const datePart = timeStr.slice(0, 10);  // YYYY-MM-DD
  if (datePart === todayStr) return '今天 ' + timePart;
  if (datePart === yStr)     return '昨天 ' + timePart;
  // 更早：显示 Apr 5 · HH:MM
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [, m, d] = datePart.split('-').map(Number);
  return months[m-1] + ' ' + d + ' · ' + timePart;
}

function getTxIconStyle(amount) {
  const base = 'border-radius:10px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;';
  return base + (amount > 0 ? 'background:#EAF3DE;' : 'background:#FAECE7;');
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
  container.innerHTML = showList.map(tx => `
    <div class="transaction-item" style="display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:0.5px solid var(--color-border-tertiary);">
      <div style="${getTxIconStyle(tx.amount)}">${tx.icon || '💰'}</div>
      <div style="flex:1;min-width:0;">
        <div class="transaction-name" style="font-size:13px;font-weight:500;color:var(--color-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${tx.name}</div>
        <div class="transaction-time" style="font-size:11px;color:var(--color-text-tertiary);margin-top:2px;">${formatTxTime(tx.time)}</div>
      </div>
      <div class="transaction-amount ${tx.amount > 0 ? 'in' : 'out'}" style="font-size:14px;font-weight:500;flex-shrink:0;color:${tx.amount > 0 ? '#3B6D11' : '#993C1D'};">
        ${tx.amount > 0 ? '+' : '-'}£${Math.abs(tx.amount).toFixed(0)}
      </div>
    </div>
  `).join('');

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
}

function toggleTransactions() {
  txExpanded = !txExpanded;
  renderWallet();
}

