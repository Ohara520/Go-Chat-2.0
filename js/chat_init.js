// ============================================================
// chat_init.js — 聊天页初始化 & 后台系统
//
// 职责：
//   initChat        — 聊天页初始化（历史加载、状态初始化、定时器启动）
//   refreshChatScreen — 从其他页回到聊天页时的轻量刷新
//   沉默计时器       — Ghost 主动发话（silence timer）
//   主动发消息       — scheduleProactiveMessage / maybeProactiveMessage
//   工资系统         — checkSalaryDay
//   iOS键盘处理
//
// 依赖：api.js、ui.js、persona.js、state.js、events.js、
//       money.js、delivery.js、cloud.js
// ============================================================

// ===== 沉默计时器 =====
let _silenceTimer = null;
const SILENCE_THRESHOLD_MS = 20 * 60 * 1000; // 20分钟无消息触发

function resetSilenceTimer() {
  if (_silenceTimer) clearTimeout(_silenceTimer);
  _silenceTimer = setTimeout(onSilenceTimeout, SILENCE_THRESHOLD_MS);
}

async function onSilenceTimeout() {
  if (_isSending) { resetSilenceTimer(); return; }
  const coldWar = localStorage.getItem('coldWarMode') === 'true';
  if (coldWar) return;
  const chatScreen = document.getElementById('chatScreen');
  if (!chatScreen || !chatScreen.classList.contains('active')) return;

  // 深夜不打扰（23:00 - 07:00 本地时间）
  const _hour = new Date().getHours();
  if (_hour >= 23 || _hour < 7) {
    _silenceTimer = setTimeout(onSilenceTimeout, 60 * 60 * 1000); // 1小时后再检查
    return;
  }

  // 触发一次 Ghost 主动 check_in（触发后不自动重置，等用户下次发消息才重置）
  try {
    await emitGhostEvent('check_in');
  } catch(e) {}
  // 触发后重置，但间隔拉长到40分钟防止连续刷屏
  _silenceTimer = setTimeout(onSilenceTimeout, 40 * 60 * 1000);
}

// ===== 主动发消息系统 =====
let _proactiveTimer = null;

function scheduleProactiveMessage() {
  if (_proactiveTimer) clearTimeout(_proactiveTimer);
  const delay = (2 + Math.random() * 2) * 60 * 60 * 1000; // 2-4小时
  _proactiveTimer = setTimeout(maybeProactiveMessage, delay);
}

async function maybeProactiveMessage() {
  const coldWar = localStorage.getItem('coldWarMode') === 'true';
  if (coldWar) { scheduleProactiveMessage(); return; }

  const chatScreen = document.getElementById('chatScreen');
  if (!chatScreen || !chatScreen.classList.contains('active')) {
    scheduleProactiveMessage(); return;
  }

  // 深夜不打扰（23:00 - 07:00 本地时间）
  const _hour = new Date().getHours();
  if (_hour >= 23 || _hour < 7) {
    scheduleProactiveMessage(); return;
  }

  // 今天已触发过2次就停
  const todayKey = 'proactiveCount_' + new Date().toDateString();
  const todayCount = parseInt(localStorage.getItem(todayKey) || '0');
  if (todayCount >= 2) { scheduleProactiveMessage(); return; }

  // 触发概率
  const trust = getTrustHeat ? getTrustHeat() : 60;
  const mood = getMoodLevel ? getMoodLevel() : 7;
  const triggerChance = 0.3 * ((trust + mood * 10) / 2) / 100;
  if (Math.random() > triggerChance) { scheduleProactiveMessage(); return; }

  // 最近5分钟有消息，不打扰
  const lastMsg = chatHistory.filter(m => m.role === 'assistant').slice(-1)[0];
  if (lastMsg && lastMsg._time && Date.now() - lastMsg._time < 5 * 60 * 1000) {
    scheduleProactiveMessage(); return;
  }

  localStorage.setItem(todayKey, todayCount + 1);

  const todayDetail = sessionStorage.getItem('todayDetail') || '';
  const ghostState = sessionStorage.getItem('ghostState') || '';
  const stateHint = ghostState ? ` He is currently: ${ghostState}. The message may naturally relate to what he's doing or thinking right now — or not. Let it feel unforced.` : '';

  // 防重复池
  const _proPool = (() => { try { return JSON.parse(localStorage.getItem('proactiveReplyPool') || '[]'); } catch(e) { return []; } })();
  const _proNoRepeat = _proPool.length > 0
    ? `\nDo not reuse phrasing from these recent lines: ${_proPool.map(l => `"${l}"`).join(', ')}. Change angle entirely.`
    : '';

  // 检测她最后一条消息是否提到去做某事
  const _lastUserMsg = chatHistory.filter(m => m.role === 'user' && !m._system).slice(-1)[0]?.content || '';
  const _leftSignal = /去吃|去洗|去睡|去忙|先去|回来|eating|shower|bath|sleep|brb|busy now/i.test(_lastUserMsg);
  const _followUpHint = _leftSignal
    ? `\nShe mentioned leaving or doing something before going quiet. This message can be a dry follow-up — is she back, did she eat, is she okay. Keep it short. Not soft.`
    : '';

  const systemNote = `[PROACTIVE — something just crossed his mind. He sends one line without framing it as reaching out. No greeting. No "hey". Just a statement, observation, or fragment — like he thought of something and sent it. Short. Self-contained. Not a check-in. Not asking how she is. Just something real.${stateHint}${todayDetail ? ` Today's context: ${todayDetail}` : ''}${_followUpHint}${_proNoRepeat} English only, lowercase.]`;

  try {
    showTyping();
    const recentCtx = chatHistory.filter(m => !m._system && !m._recalled).slice(-6)
      .map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${(m.content || '').slice(0, 80)}`).join('\n');
    const reply = await callGrokWithSystem(
      buildGhostStyleCore(),
      recentCtx ? `Recent chat:\n${recentCtx}\n\n${systemNote}` : systemNote,
      80
    );
    hideTyping();

    const cleaned = (reply || '').replace(/\n?(REFUND|(?<![a-zA-Z])KEEP(?![a-zA-Z])|COLD_WAR_START|GIVE_MONEY:[^\n]*)\n?/g, '').trim();
    if (!cleaned || /^(did|do|are|have|is|can|will|你|她|how|what|when|where|why)/i.test(cleaned)) {
      scheduleProactiveMessage(); return;
    }
    // 存入防重复池
    _proPool.push(cleaned); localStorage.setItem('proactiveReplyPool', JSON.stringify(_proPool.slice(-8)));
    appendMessage('bot', cleaned);
    chatHistory.push({ role: 'assistant', content: cleaned, _time: Date.now() });
    saveHistory();
    if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
  } catch(e) {
    hideTyping();
  }

  scheduleProactiveMessage();
}

// ===== 工资系统 =====
function checkSalaryDay() {
  const today = new Date();
  if (today.getDate() < 25) return; // 25号及以后都可以补发

  const salaryKey = 'salaryPaid_' + today.getFullYear() + '_' + (today.getMonth() + 1);

  // 防重发：salaryKey 存在 OR 本月交易记录里有工资 → 已发过
  const _txList = JSON.parse(localStorage.getItem('transactions') || '[]');
  const _monthStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
  const _alreadyPaid = localStorage.getItem(salaryKey)
    || _txList.some(tx => tx.name === 'Ghost 月度工资' && tx.time && tx.time.startsWith(_monthStr));
  if (_alreadyPaid) return;

  // 根据本月出差天数浮动工资
  const _monthKey  = 'locDays_' + today.getFullYear() + '_' + (today.getMonth() + 1);
  const _locDays   = JSON.parse(localStorage.getItem(_monthKey) || '{"deployed":0,"base":0,"leave":0}');
  const _total     = (_locDays.deployed || 0) + (_locDays.base || 0) + (_locDays.leave || 0) || 30;
  const _deployRatio = (_locDays.deployed || 0) / _total;

  // 无记录时（老用户首次/数据缺失）走正常档
  const _noRecord = !localStorage.getItem(_monthKey);
  let _salaryMin, _salaryMax;
  if (_noRecord || (_deployRatio < 0.3 && _locDays.leave < 1)) {
    _salaryMin = 15; _salaryMax = 25;
  } else if (_deployRatio >= 0.6) {
    _salaryMin = 22; _salaryMax = 32;
  } else if ((_locDays.leave || 0) / _total >= 0.5) {
    _salaryMin = 15; _salaryMax = 18;
  } else {
    _salaryMin = 15; _salaryMax = 25;
  }
  const salary = (Math.floor(Math.random() * (_salaryMax - _salaryMin + 1)) + _salaryMin) * 100;
  localStorage.setItem('lastSalaryAmount', salary);
  localStorage.setItem('lastSalaryMonth', today.getFullYear() + '-' + (today.getMonth() + 1));

  // 立刻标记已发，防止 initChat 多次调用导致重复发薪
  localStorage.setItem(salaryKey, salary.toString());

  setTimeout(() => {
    // 直接入账，不走转账卡片
    if (typeof addTransaction === 'function') {
      addTransaction({ icon: '💷', name: 'Ghost 月度工资', amount: salary });
    }
    if (typeof renderWallet === 'function') renderWallet();
    if (typeof changeAffection === 'function') changeAffection(1);
    if (typeof setRelationshipFlag === 'function') setRelationshipFlag('firstSalary', true);

    // 告诉模型工资已发
    if (typeof chatHistory !== 'undefined') {
      chatHistory.push({
        role: 'user',
        content: `[System: Today is payday. You sent her your monthly salary £${salary}. It has been deposited into her account automatically. You can mention this naturally — keep it brief, matter-of-fact.]`,
        _system: true
      });
    }

    // Ghost 说一句
    const _deployHint = _deployRatio >= 0.6 ? ' Been away most of the month.' : _deployRatio < 0.3 ? ' Quiet month.' : '';
    const fallbacks = [
      `this month's in. £${salary}.`,
      `£${salary}. check your account.`,
      `salary's in. £${salary}.`,
      `sent. £${salary}. don't waste it.`,
      `it's in your account. £${salary}.`,
    ];
    const fallbackLine = fallbacks[Math.floor(Math.random() * fallbacks.length)];

    if (typeof showTyping === 'function') showTyping();
    setTimeout(async () => {
      let line = '';
      try {
        line = await callGrokWithSystem(
          `You are Simon Riley.\n\nYou just deposited your monthly salary into her account: £${salary}.${_deployHint}\n\nOne line. lowercase. This is routine — you do this every month. Not making a big deal. Just letting her know it's there.\n\nDo NOT say "transfer" or "sent you money". It's already in her account. Just confirm it landed.`,
          'let her know.',
          80
        );
        if (typeof isBreakout === 'function' && isBreakout(line)) line = '';
      } catch(e) {}

      if (!line || !line.trim()) line = fallbackLine;
      line = line.trim().split('\n')[0];

      if (typeof hideTyping === 'function') hideTyping();
      if (typeof appendMessage === 'function') appendMessage('bot', line);
      if (typeof chatHistory !== 'undefined') {
        chatHistory.push({ role: 'assistant', content: line });
        if (typeof saveHistory === 'function') saveHistory();
      }
    }, 1500);

    if (typeof showToast === 'function') showToast('💷 Ghost 本月工资已到账 £' + salary + '！');
    if (typeof scheduleCloudSave === 'function') scheduleCloudSave(true);
  }, 2000);
}

// ===== 聊天页初始化 =====
async function initChat() {
  // 清除所有残留定时器，防止多实例
  if (_silenceTimer) { clearTimeout(_silenceTimer); _silenceTimer = null; }
  if (_proactiveTimer) { clearTimeout(_proactiveTimer); _proactiveTimer = null; }
  // 破防历史清理：暂时关闭，isBreakout 词表过于激进会误删正常回复
  // if (typeof cleanBreakoutHistory === 'function') cleanBreakoutHistory();
  // if (typeof isBreakout === 'function' && typeof chatHistory !== 'undefined') {
  //   chatHistory = chatHistory.filter(m =>
  //     !(m.role === 'assistant' && !m._recalled && isBreakout(m.content))
  //   );
  //   if (chatHistory.length < before && typeof saveHistory === 'function') saveHistory();
  // }
  // 好感度首次初始化
  if (!localStorage.getItem('affection')) setAffection(70);

  // 老用户补偿：延迟执行，避免立刻拉高数值触发剧情条件导致进页面破防
  // （trust/affection 升高会让 checkStoryOnSessionStart 触发 Haiku，Haiku 容易崩）
  setTimeout(() => {
    if (!localStorage.getItem('trustAffectionUpgrade_20260405')) {
      localStorage.setItem('trustAffectionUpgrade_20260405', '1');
      const _mode = localStorage.getItem('marriageType') || 'established';
      if (_mode === 'established') {
        if (getTrustHeat() < 75) setTrustHeat(75);
        if (getAffection() < 70) setAffection(70);
      }
    }
  }, 10000); // 10秒后执行，确保页面已稳定，且剧情检测已过

  // 副作用初始化
  if (typeof ensureGhostBirthday === 'function') ensureGhostBirthday();
  if (typeof ensureGhostProfile === 'function') ensureGhostProfile();
  if (typeof ensurePersonality === 'function') ensurePersonality();

  // 每次会话只轮换一次今日细节
  if (!sessionStorage.getItem('todayDetail') && typeof pickTodayDetail === 'function') {
    sessionStorage.setItem('todayDetail', pickTodayDetail());
  }

  // 快递进度检查
  try { if (typeof checkDeliveryUpdates === 'function') checkDeliveryUpdates(); } catch(e) {}

  // 外卖进度检查 + 离线期间到达的外卖反应
  try { if (typeof checkTakeoutUpdates === 'function') checkTakeoutUpdates(); } catch(e) {}
  try { if (typeof updateTakeoutCardHint === 'function') updateTakeoutCardHint(); } catch(e) {}
  setTimeout(() => {
    try { if (typeof checkPendingTakeoutReactions === 'function') checkPendingTakeoutReactions(); } catch(e) {}
  }, 2000);

  // 地点特产主动触发（Ghost在某地点待够3天自动反寄）
  setTimeout(() => {
    try { if (typeof checkLocationSpecialAutoTrigger === 'function') checkLocationSpecialAutoTrigger(); } catch(e) {}
  }, 5000);

  // 补触发离线签收的 Ghost 反应
  setTimeout(() => {
    try {
      const pendingReactions = JSON.parse(localStorage.getItem('pendingDeliveryReactions') || '[]');
      if (pendingReactions.length > 0) {
        localStorage.removeItem('pendingDeliveryReactions');
        pendingReactions.forEach((item, idx) => {
          setTimeout(() => {
            if (typeof onGhostReceived === 'function') onGhostReceived(item.delivery);
          }, idx * 3000);
        });
      }
    } catch(e) {}
  }, 2000);

  // 纪念日/整数天检测 → 弹用户草稿
  const _marriageDate = localStorage.getItem('marriageDate');
  if (_marriageDate) {
    const _days = Math.max(1, Math.floor((Date.now() - new Date(_marriageDate).getTime()) / 86400000) + 1);
    const _isMilestone = _days === 52 || (_days % 100 === 0 && _days > 0) || _days === 365;
    const _isAnniversary = _days >= 365 && (() => {
      const [, mm, dd] = _marriageDate.split('-').map(Number);
      const now = new Date();
      return now.getMonth() + 1 === mm && now.getDate() === dd;
    })();
    const _milestoneKey = 'milestoneDraftShown_' + _days;
    if ((_isMilestone || _isAnniversary) && !localStorage.getItem(_milestoneKey)) {
      localStorage.setItem(_milestoneKey, '1');
      setTimeout(() => {
        if (typeof showUserDraftCard === 'function') {
          showUserDraftCard({ type: 'anniversary', actor: 'user', meta: { days: _days, isAnniversary: _isAnniversary } });
        }
      }, 8000);
    }
  }

  // 检查各类待触发事件
  if (localStorage.getItem('pendingSeriousTalk') === 'true') {
    setTimeout(() => { if (typeof triggerSeriousTalk === 'function') triggerSeriousTalk(); }, 2000);
  }
  if (localStorage.getItem('pendingMakeupMoney') === 'true') {
    setTimeout(() => { if (typeof ghostSendMakeupMoney === 'function') ghostSendMakeupMoney(); }, 5 * 60 * 1000);
  }
  if (localStorage.getItem('pendingColdWarEndStory') === 'true') {
    setTimeout(() => { if (typeof checkStoryOnColdWarEnd === 'function') checkStoryOnColdWarEnd(); }, 3000);
  }
  if (localStorage.getItem('pendingGhostApology') === 'true') {
    localStorage.removeItem('pendingGhostApology');
    setTimeout(() => { if (typeof ghostApologize === 'function') ghostApologize(); }, 3000);
  }

  // 朋友圈新动态提示恢复
  if (localStorage.getItem('feedHasNew') === '1') {
    const badge = document.getElementById('feedNewBadge');
    if (badge) badge.style.display = 'block';
  }

  // 检查离线扣好感
  if (typeof checkOfflinePenalty === 'function') checkOfflinePenalty();

  // 工资检查
  checkSalaryDay();

  // 如果现在是24号，设定午夜定时器：0点自动触发工资检查
  // 这样0点还在聊天的用户也能收到工资
  const _today = new Date();
  if (_today.getDate() === 24) {
    const _midnight = new Date(_today);
    _midnight.setDate(25);
    _midnight.setHours(0, 0, 5, 0); // 0:00:05，留5秒确保日期翻转
    const _msToMidnight = _midnight.getTime() - _today.getTime();
    if (_msToMidnight > 0 && _msToMidnight < 24 * 3600 * 1000) {
      setTimeout(() => checkSalaryDay(), _msToMidnight);
    }
  }

  // 剧情解锁检查（sessionStart类型）
  setTimeout(() => { if (typeof checkStoryOnSessionStart === 'function') checkStoryOnSessionStart(); }, 1500);

  // 冷战计时器恢复
  if (localStorage.getItem('coldWarMode') === 'true') {
    const coldStart = parseInt(localStorage.getItem('coldWarStart') || Date.now());
    const remaining = 3 * 60 * 60 * 1000 - (Date.now() - coldStart);
    if (typeof coldWarTimer !== 'undefined' && coldWarTimer) clearTimeout(coldWarTimer);
    if (remaining > 0) {
      setTimeout(() => { if (typeof ghostApologize === 'function') ghostApologize(); }, remaining);
    } else {
      if (typeof ghostApologize === 'function') ghostApologize();
    }
  }

  // 地点 / 天气 / 时间 / 心情
  if (typeof initLocation === 'function') {
    const loc = initLocation();
    if (typeof updateWeather === 'function') updateWeather(loc.weatherCity);
  }
  if (typeof updateUKTime === 'function') updateUKTime();
  if (typeof initMood === 'function') initMood();

  // 英国时间每分钟刷新
  if (window._ukTimeInterval) clearInterval(window._ukTimeInterval);
  window._ukTimeInterval = setInterval(() => {
    if (typeof updateUKTime === 'function') updateUKTime();
  }, 60000);

  // 加载历史记录
  const container = document.getElementById('messagesContainer');
  if (!container) return;

  const saved = localStorage.getItem('chatHistory');
  if (saved) {
    try { chatHistory = JSON.parse(saved); } catch(e) { chatHistory = []; }
  }

  if (_isSending) return; // 正在等回复，不重渲染

  _chatInited = true;

  const nameEl = document.getElementById('chatBotName');
  if (nameEl) nameEl.textContent = localStorage.getItem('botNickname') || 'Simon "Ghost" Riley';

  // 用 ui.js 的 renderChatHistory 重建历史
  if (typeof renderChatHistory === 'function') {
    renderChatHistory(chatHistory);
  }

  _renderedMsgCount = chatHistory.filter(m => !m._system && !m._recalled).length;

  // 渲染完多次尝试滚到底部，确保内容完全撑开后到位
  if (typeof scrollToBottom === 'function') {
    scrollToBottom();
    requestAnimationFrame(() => {
      scrollToBottom();
      setTimeout(() => scrollToBottom(), 100);
      setTimeout(() => scrollToBottom(), 400);
      setTimeout(() => scrollToBottom(), 800);
    });
  }

  // 启动定时器
  scheduleProactiveMessage();
  resetSilenceTimer();
}

// ===== 从其他页回聊天页的轻量刷新 =====
function refreshChatScreen() {
  if (!_chatInited) {
    initChat();
    return;
  }

  // 只追加新消息，不重渲整个列表（防止闪屏）
  const realMsgs = chatHistory.filter(m => !m._system && !m._recalled);
  const newCount = realMsgs.length;
  if (newCount > _renderedMsgCount) {
    const newMsgs = realMsgs.slice(_renderedMsgCount);
    newMsgs.forEach(msg => {
      if (msg.role === 'user') {
        appendMessage('user', msg.content, false);
      } else if (msg.role === 'assistant' && !msg._recalled) {
        const parts = msg.content.split(/\n---\n/).filter(p => p.trim());
        parts.forEach(p => appendMessage('bot', p.trim(), false));
      }
    });
    _renderedMsgCount = newCount;
    scrollToBottom();
  }

  // 刷新状态UI
  if (typeof updateUKTime === 'function') updateUKTime();
  if (typeof refreshStatusEmoji === 'function') refreshStatusEmoji();
}

// ===== iOS 键盘处理 =====
const _isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    const chatScreen = document.getElementById('chatScreen');
    if (!chatScreen || !chatScreen.classList.contains('active')) return;
    const vv = window.visualViewport;
    // iOS 键盘弹起：固定定位跟随 visualViewport，防止被顶上去
    chatScreen.style.position = 'fixed';
    chatScreen.style.top      = vv.offsetTop + 'px';
    chatScreen.style.left     = vv.offsetLeft + 'px';
    chatScreen.style.width    = vv.width + 'px';
    chatScreen.style.height   = vv.height + 'px';
    const chatContainer = chatScreen.querySelector('.chat-container');
    if (chatContainer) chatContainer.style.height = vv.height + 'px';
    const msgs = document.getElementById('messagesContainer');
    if (msgs) setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 60);
  });
}

if (_isIOS) {
  document.addEventListener('focusin', (e) => {
    const chatScreen = document.getElementById('chatScreen');
    if (!chatScreen || !chatScreen.classList.contains('active')) return;
    if (e.target.id !== 'chatInput') return;
    setTimeout(() => {
      const msgs = document.getElementById('messagesContainer');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }, 400);
  });

  document.addEventListener('focusout', (e) => {
    const chatScreen = document.getElementById('chatScreen');
    if (!chatScreen || !chatScreen.classList.contains('active')) return;
    if (e.target.id !== 'chatInput') return;
    setTimeout(() => {
      chatScreen.style.position = '';
      chatScreen.style.top      = '';
      chatScreen.style.left     = '';
      chatScreen.style.width    = '';
      chatScreen.style.height   = '';
      const chatContainer = chatScreen.querySelector('.chat-container');
      if (chatContainer) chatContainer.style.height = '';
      const msgs = document.getElementById('messagesContainer');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }, 150);
  });
}
