// ===== 钱包系统 (wallet.js) =====
// ===== 钱包系统 =====
function getBalance() {
  // 首次使用初始化100英镑
  if (localStorage.getItem('wallet') === null) {
    localStorage.setItem('wallet', '100.00');
    addTransaction({ icon: '🎁', name: '新婚礼金', amount: 100 });
  }
  return parseFloat(localStorage.getItem('wallet') || '100');
}
function setBalance(val) {
  const safeVal = Math.max(0, val);
  localStorage.setItem('wallet', safeVal.toFixed(2));
  const balEl = document.getElementById('transferBalance');
  if (balEl) balEl.textContent = '£' + Math.floor(safeVal);
  const walletBalEl = document.getElementById('walletBalance');
  if (walletBalEl) walletBalEl.textContent = '£' + safeVal.toFixed(2);
  touchLocalState();
  scheduleCloudSave(); // 不要立刻存，等3秒防止中途覆盖
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
    <div class="transaction-item">
      <div class="transaction-icon">${tx.icon || '💰'}</div>
      <div class="transaction-info">
        <div class="transaction-name">${tx.name}</div>
        <div class="transaction-time">${tx.time || ''}</div>
      </div>
      <div class="transaction-amount ${tx.amount > 0 ? 'in' : 'out'}">
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

