// ===================================================
// checkin.js — 签到系统
//
// 职责：
// - renderCheckin()       渲染签到UI
// - doCheckin()           执行签到（奖励/里程碑/云端同步）
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

const CHECKIN_MILESTONES     = { 1: 10, 3: 20, 7: 50, 14: 100, 30: 200 };
const CHECKIN_MILESTONE_DAYS = [1, 3, 7, 14, 30];


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 渲染签到UI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderCheckin() {
  const streak        = getCheckinStreak();
  const balance       = typeof getBalance === 'function' ? getBalance() : 0;
  const doneToday     = isCheckedInToday();
  const monthlyCount  = getMonthlyCheckinCount();
  const nextMilestone = CHECKIN_MILESTONE_DAYS.find(m => m > monthlyCount);
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
      if (btnText) btnText.textContent = '✅ 今日已签到';
    } else {
      btnEl.classList.remove('done');
      if (btnText) btnText.textContent = '📅 今日签到';
    }
  }

  if (hintEl) {
    if (isNewMonth && !doneToday) {
      hintEl.textContent = '新的一月开始了，来签到吧 🌙';
    } else if (!doneToday) {
      const bonus = nextMilestone ? CHECKIN_MILESTONES[nextMilestone] : null;
      hintEl.textContent = bonus
        ? `本月第${monthlyCount + 1}次签到，距里程碑还差${nextMilestone - monthlyCount}次，奖励+${bonus}条 🎯`
        : '点击今天的日期签到 ✨';
    } else {
      hintEl.textContent = '明天再来签到吧 🌸';
    }
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 条数奖励发放
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function applyCheckinBonusMessages(count) {
  const email = localStorage.getItem('userEmail') || localStorage.getItem('sb_user_email') || '';
  if (email) {
    // 立即生效：先乐观更新本地缓存，不等 API 返回
    if (typeof _subCache !== 'undefined' && _subCache && _subCache.remaining !== undefined) {
      _subCache.remaining += count;
    }
    // 同步到后端持久化
    fetch('/api/checkin-bonus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, bonus: count })
    }).then(r => r.json()).then(d => {
      if (d.ok && typeof _subCache !== 'undefined' && _subCache) {
        _subCache.remaining = d.remaining;
      } else {
        console.warn('[checkin] bonus API 返回异常:', d);
      }
    }).catch(e => {
      console.warn('[checkin] bonus API 调用失败:', e);
      // API 失败但乐观更新已生效，用户当前 session 不受影响
    });
  } else {
    applyLocalBonusMessages(count);
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
  const milestoneBonus = CHECKIN_MILESTONES[monthlyCount] || 0;

  // ── 主奖励 ──
  const luckyChance = getLuckyChance(streak);
  const rand        = Math.random();
  let rewardMsg     = '';
  const _baristaMulti = (typeof getCareerCheckinMultiplier === 'function') ? getCareerCheckinMultiplier() : 1;
  const _isBarista = _baristaMulti > 1;

  if (rand < luckyChance) {
    let baseCoins = Math.random() < 0.5 ? 100 : 150;
    let coins = _isBarista ? Math.round(baseCoins * _baristaMulti) : baseCoins;
    if (typeof setBalance    === 'function') setBalance(getBalance() + coins);
    if (typeof addTransaction === 'function') addTransaction({ icon: '🎰', name: '欧气签到！', amount: coins });
    if (typeof renderWallet  === 'function') renderWallet();
    rewardMsg = _isBarista
      ? `🎰 欧气签到！£${baseCoins} × ${_baristaMulti.toFixed(1)} = £${coins}！`
      : `🎰 欧气签到！£${coins}！`;
  } else if (rand < luckyChance + 0.475) {
    let baseCoins = [5, 8, 10, 15, 20][Math.floor(Math.random() * 5)];
    let coins = _isBarista ? Math.round(baseCoins * _baristaMulti) : baseCoins;
    if (typeof setBalance    === 'function') setBalance(getBalance() + coins);
    if (typeof addTransaction === 'function') addTransaction({ icon: '🎁', name: '签到奖励', amount: coins });
    if (typeof renderWallet  === 'function') renderWallet();
    rewardMsg = _isBarista
      ? `💰 签到奖励：£${baseCoins} × ${_baristaMulti.toFixed(1)} = £${coins}`
      : `💰 签到奖励：£${coins}`;
  } else {
    let baseMsgCount = Math.floor(Math.random() * 3) + 1;
    let msgCount = _isBarista ? Math.round(baseMsgCount * _baristaMulti) : baseMsgCount;
    applyCheckinBonusMessages(msgCount);
    rewardMsg = _isBarista
      ? `💬 签到奖励：+${baseMsgCount}条 × ${_baristaMulti.toFixed(1)} = +${msgCount}条`
      : `💬 签到奖励：+${msgCount}条`;
  }

  // 咖啡师加成提示
  let baristaMsg = '';
  if (_isBarista) {
    baristaMsg = `\n☕ 咖啡师加成 ×${_baristaMulti.toFixed(1)}`;
  }

  // ── 里程碑额外奖励 ──
  let milestoneMsg = '';
  if (milestoneBonus > 0) {
    applyCheckinBonusMessages(milestoneBonus);
    milestoneMsg = `\n🏆 本月第${monthlyCount}次签到：额外+${milestoneBonus}条！`;
  }

  // ── 连续签到特殊提示 ──
  let streakMsg = '';
  if (streak === 7)  streakMsg = '\n🔥 连续签到7天！';
  if (streak === 30) streakMsg = '\n👑 连续签到30天！';

  showCheckinResult(rewardMsg + baristaMsg + milestoneMsg + streakMsg, streak);
  renderCheckin();
  if (typeof initCalendar === 'function') initCalendar();
  launchCheckinFlowers();
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 签到结果弹窗
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function showCheckinResult(msg, streak) {
  document.getElementById('checkinResultModal')?.remove();

  const lines           = msg.split('\n').filter(Boolean);
  const mainReward      = lines[0] || '';
  const baristaReward   = lines.find(l => l.includes('☕')) || '';
  const milestoneReward = lines.find(l => l.includes('🏆')) || '';
  const streakReward    = lines.find(l => l.includes('🔥') || l.includes('👑')) || '';
  const isLucky         = mainReward.includes('🎰');
  const hasExtra        = baristaReward || milestoneReward || streakReward;

  const modal = document.createElement('div');
  modal.id    = 'checkinResultModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.35);backdrop-filter:blur(4px);';
  modal.innerHTML = `
    <div style="background:white;border-radius:24px;padding:28px 24px;width:280px;text-align:center;box-shadow:0 20px 60px rgba(100,0,200,0.15);">
      <div style="font-size:44px;margin-bottom:8px">${isLucky ? '🎰' : '🌸'}</div>
      <div style="font-size:15px;font-weight:700;color:#3a1a60;margin-bottom:4px">${isLucky ? '欧气签到！' : '签到成功'}</div>
      <div style="font-size:12px;color:#b0a0c8;margin-bottom:16px">连续签到第 ${streak} 天</div>
      <div style="background:${isLucky ? 'linear-gradient(135deg,#fef3c7,#fde68a)' : 'rgba(168,85,247,0.08)'};border:1.5px solid ${isLucky ? 'rgba(251,191,36,0.5)' : 'rgba(168,85,247,0.2)'};border-radius:14px;padding:14px;margin-bottom:${hasExtra ? '10px' : '20px'};">
        <div style="font-size:20px;font-weight:800;color:${isLucky ? '#b45309' : '#7c3aed'}">${mainReward.replace(/[💰💬🎰]/g, '').trim()}</div>
      </div>
      ${baristaReward ? `<div style="background:rgba(139,90,43,0.08);border:1px solid rgba(139,90,43,0.2);border-radius:12px;padding:10px 14px;margin-bottom:10px;font-size:13px;color:#8b5a2b;font-weight:600;">${baristaReward}</div>` : ''}
      ${milestoneReward ? `<div style="background:rgba(236,72,153,0.08);border:1px solid rgba(236,72,153,0.2);border-radius:12px;padding:10px 14px;margin-bottom:10px;font-size:13px;color:#be185d;font-weight:600;">${milestoneReward}</div>` : ''}
      ${streakReward    ? `<div style="background:rgba(251,146,60,0.08);border:1px solid rgba(251,146,60,0.2);border-radius:12px;padding:10px 14px;margin-bottom:10px;font-size:13px;color:#ea580c;font-weight:600;">${streakReward}</div>` : ''}
      <div style="margin-top:${hasExtra ? '0' : '0'}">
        <button onclick="document.getElementById('checkinResultModal').remove()" style="width:100%;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,#a855f7,#7c3aed);color:white;font-size:15px;font-weight:600;cursor:pointer;">好的 ✨</button>
      </div>
    </div>
  `;
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  document.body.appendChild(modal);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 花瓣动画（手机/电脑通用）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function launchCheckinFlowers() {
  const flowers = ['🌸', '🌺', '🌼', '💮', '🌷', '✨'];
  for (let i = 0; i < 18; i++) {
    const el = document.createElement('div');
    el.textContent = flowers[Math.floor(Math.random() * flowers.length)];
    el.style.cssText = `
      position: fixed;
      font-size: ${Math.random() * 14 + 12}px;
      left: ${Math.random() * 100}%;
      bottom: -40px;
      opacity: 1;
      z-index: 99999;
      pointer-events: none;
      animation: flowerRise ${Math.random() * 1.5 + 1.5}s ease-out forwards;
      animation-delay: ${Math.random() * 0.8}s;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }
}
