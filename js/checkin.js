// ===================================================
// checkin.js — 签到系统
//
// 职责：
// - renderCheckin()       渲染签到UI
// - doCheckin()           执行签到（虚拟英镑/云端同步）
// - showCheckinResult()   弹窗展示结果
// - launchCheckinFlowers() 花瓣动画（手机/电脑通用）
//
// 依赖：wallet.js（getBalance/setBalance/addTransaction/renderWallet）
//       cloud.js（saveToCloud）
// ===================================================


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 工具
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getCheckinDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getYesterdayDateStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getCheckinMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isCheckedInToday() {
  return !!localStorage.getItem('checkin_' + getCheckinDateStr());
}

function getMonthlyCheckinCount() {
  return parseInt(localStorage.getItem('monthlyCheckin_' + getCheckinMonthStr()) || '0');
}

// 连续签到天数（修复：断签时重置为1，且不超过婚期天数）
function getCheckinStreak() {
  const raw = parseInt(localStorage.getItem('visitStreak') || '0');
  if (!isCheckedInToday()) {
    const yesterdayDone = !!localStorage.getItem('checkin_' + getYesterdayDateStr());
    if (!yesterdayDone && raw > 1) {
      localStorage.setItem('visitStreak', '1');
      return 1;
    }
  }
  const streak = raw || 1;
  // 签到天数不能超过婚期天数
  const marriageDate = localStorage.getItem('marriageDate');
  if (marriageDate) {
    const marriageDays = Math.max(1, Math.floor((Date.now() - new Date(marriageDate)) / 86400000) + 1);
    return Math.min(streak, marriageDays);
  }
  return streak;
}

// 欧气概率：基础5%，每连续7天+1%，最高12%；咖啡师基础15%，最高20%
function getLuckyChance(streak) {
  const base = (typeof getCareer === 'function' && getCareer() === 'barista') ? 0.15 : 0.05;
  const max = (typeof getCareer === 'function' && getCareer() === 'barista') ? 0.20 : 0.12;
  return Math.min(base + Math.floor(streak / 7) * 0.01, max);
}

// 月初新月提示（每月只显示一次）
function checkNewMonthHint() {
  if (getMonthlyCheckinCount() > 0) return false;
  const key = 'newMonthHint_' + getCheckinMonthStr();
  if (localStorage.getItem(key)) return false;
  localStorage.setItem(key, '1');
  return true;
}

// 未登录用户条数奖励：存专属key，不和消息计数混在一起
function applyLocalBonusMessages(count) {
  const key     = 'checkinMsgBonus_' + getCheckinDateStr();
  const current = parseInt(localStorage.getItem(key) || '0');
  localStorage.setItem(key, current + count);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 里程碑配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 签到仅奖励虚拟英镑，不再赠送聊天条数。


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 渲染签到UI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderCheckin() {
  const streak        = getCheckinStreak();
  const balance       = typeof getBalance === 'function' ? getBalance() : 0;
  const doneToday     = isCheckedInToday();
  const monthlyCount  = getMonthlyCheckinCount();
  const isNewMonth    = checkNewMonthHint();

  const streakEl  = document.getElementById('checkinStreak');
  const balanceEl = document.getElementById('checkinBalance');
  const btnEl     = document.getElementById('checkinBtn');
  const hintEl    = document.getElementById('checkinHint');

  if (streakEl)  streakEl.textContent  = streak;
  if (balanceEl) balanceEl.textContent = '£' + Math.floor(balance);

  if (btnEl) {
    const btnText = btnEl.querySelector('#checkinBtnText');
    if (doneToday) {
      btnEl.classList.add('done');
      if (btnText) btnText.textContent = '今日已签到';
    } else {
      btnEl.classList.remove('done');
      if (btnText) btnText.textContent = '今日签到';
    }
  }

  if (hintEl) {
    if (isNewMonth && !doneToday) {
      hintEl.textContent = '新的一月开始了，来签到吧';
    } else if (!doneToday) {
      hintEl.textContent = '点击今天的日期签到';
    } else {
      hintEl.textContent = '明天再来签到吧';
    }
    hintEl.textContent = hintEl.textContent.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').trim();
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 执行签到
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function doCheckin() {
  if (isCheckedInToday()) {
    if (typeof showToast === 'function') showToast('今天已经签到过了 🌸');
    return;
  }

  // 标记今天已签到
  localStorage.setItem('checkin_' + getCheckinDateStr(), '1');

  // streak：昨天签了就+1，否则重置为1
  const yesterdayDone = !!localStorage.getItem('checkin_' + getYesterdayDateStr());
  const prevStreak    = parseInt(localStorage.getItem('visitStreak') || '0');
  const streak        = yesterdayDone ? prevStreak + 1 : 1;
  localStorage.setItem('visitStreak', streak);

  // 本月签到次数 +1
  const monthKey     = 'monthlyCheckin_' + getCheckinMonthStr();
  const monthlyCount = parseInt(localStorage.getItem(monthKey) || '0') + 1;
  localStorage.setItem(monthKey, monthlyCount);

  // 里程碑奖励

  // ── 主奖励 ──
  const luckyChance = getLuckyChance(streak);
  const rand        = Math.random();
  let rewardMsg     = '';
  const _baristaMulti = (typeof getCareerCheckinMultiplier === 'function') ? getCareerCheckinMultiplier() : 1;
  const _isBarista = _baristaMulti > 1;

  if (rand < luckyChance) {
    let baseCoins = Math.random() < 0.5 ? 100 : 150;
    let coins = _isBarista ? Math.round(baseCoins * _baristaMulti) : baseCoins;
    if (typeof addTransaction === 'function') addTransaction({ icon: '🎰', name: '欧气签到！', amount: coins });
    if (typeof renderWallet  === 'function') renderWallet();
    rewardMsg = _isBarista
      ? `🎰 欧气签到！£${baseCoins} × ${_baristaMulti.toFixed(1)} = £${coins}！`
      : `🎰 欧气签到！£${coins}！`;
  } else if (rand < luckyChance + 0.475) {
    let baseCoins = [5, 8, 10, 15, 20][Math.floor(Math.random() * 5)];
    let coins = _isBarista ? Math.round(baseCoins * _baristaMulti) : baseCoins;
    if (typeof addTransaction === 'function') addTransaction({ icon: '🎁', name: '签到奖励', amount: coins });
    if (typeof renderWallet  === 'function') renderWallet();
    rewardMsg = _isBarista
      ? `💰 签到奖励：£${baseCoins} × ${_baristaMulti.toFixed(1)} = £${coins}`
      : `💰 签到奖励：£${coins}`;
  } else {
    let baseCoins = [5, 8, 10, 15, 20][Math.floor(Math.random() * 5)];
    let coins = _isBarista ? Math.round(baseCoins * _baristaMulti) : baseCoins;
    if (typeof addTransaction === 'function') addTransaction({ icon: '🎁', name: '签到奖励', amount: coins });
    if (typeof renderWallet === 'function') renderWallet();
    rewardMsg = _isBarista
      ? `💰 签到奖励：£${baseCoins} × ${_baristaMulti.toFixed(1)} = £${coins}`
      : `💰 签到奖励：£${coins}`;
  }

  // 咖啡师加成提示
  let baristaMsg = '';
  if (_isBarista) {
    baristaMsg = `\n☕ 咖啡师加成 ×${_baristaMulti.toFixed(1)}`;
  }

  // ── 连续签到特殊提示 ──
  let streakMsg = '';
  if (streak === 7)  streakMsg = '\n🔥 连续签到7天！';
  if (streak === 30) streakMsg = '\n👑 连续签到30天！';

  showCheckinResult(rewardMsg + baristaMsg + streakMsg, streak);
  renderCheckin();
  if (typeof initCalendar === 'function') initCalendar();
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 签到结果弹窗
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function showCheckinResult(msg, streak) {
  document.getElementById('checkinResultModal')?.remove();
  const lines = msg.split('\n').filter(Boolean);
  const clean = s => s.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').trim();
  const modal = document.createElement('div');
  modal.id = 'checkinResultModal';
  modal.className = 'calendar-checkin-overlay';
  const paper = document.createElement('section');
  paper.className = 'calendar-checkin-paper';
  const kicker = document.createElement('div');
  kicker.className = 'calendar-checkin-kicker'; kicker.textContent = 'CHECK-IN';
  const title = document.createElement('h2');
  title.textContent = lines[0]?.includes('欧气') ? '幸运签到' : '签到成功';
  const streakText = document.createElement('p');
  streakText.className = 'calendar-checkin-streak';
  streakText.textContent = `连续签到第 ${streak} 天`;
  const reward = document.createElement('div');
  reward.className = 'calendar-checkin-reward';
  reward.textContent = clean(lines[0] || '签到完成');
  paper.append(kicker, title, streakText, reward);
  if (lines.length > 1) {
    const details = document.createElement('div');
    details.className = 'calendar-checkin-details';
    lines.slice(1).forEach(line => {
      const p = document.createElement('p');
      p.textContent = clean(line);
      details.appendChild(p);
    });
    paper.appendChild(details);
  }
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'calendar-checkin-close';
  close.textContent = '好的';
  close.onclick = () => modal.remove();
  paper.appendChild(close);
  modal.appendChild(paper);
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  document.body.appendChild(modal);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 花瓣动画（手机/电脑通用）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// V2.3: 签到后不再产生任何掉落物或花瓣特效。
function launchCheckinFlowers() {}
