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
  const systemNote = `[PROACTIVE — something just crossed his mind. He sends one line without framing it as reaching out. No greeting. No "hey". No question to start. Just a statement, an observation, or a fragment — like he thought of something and sent it before deciding not to. Short. Self-contained. He doesn't explain why he sent it. He doesn't wait for a response. Not a check-in. Not asking how she is. Just something that happened or crossed his mind.${stateHint}${todayDetail ? ` Today's context: ${todayDetail}` : ''} English only, lowercase.]`;

  try {
    showTyping();
    const reply = await callHaiku(
      buildSystemPrompt(),
      [...chatHistory.filter(m => !m._system).slice(-6), { role: 'user', content: systemNote }],
      80
    );
    hideTyping();

    // 过滤掉系统标签和问句开头
    const cleaned = (reply || '').replace(/\n?(REFUND|(?<![a-zA-Z])KEEP(?![a-zA-Z])|COLD_WAR_START|GIVE_MONEY:[^\n]*)\n?/g, '').trim();
    if (!cleaned || /^(did|do|are|have|is|can|will|你|她|how|what|when|where|why)/i.test(cleaned)) {
      scheduleProactiveMessage(); return;
    }
    // 破防检测已在 cleanBotText 出口统一处理
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
  if (today.getDate() !== 25) return;
  const salaryKey = 'salaryPaid_' + today.getFullYear() + '_' + (today.getMonth() + 1);

  // 自动修复：key存在但本月没有工资交易记录，说明之前存了key但钱没到，清掉重来
  if (localStorage.getItem(salaryKey)) {
    const monthKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    const txList = JSON.parse(localStorage.getItem('transactions') || '[]');
    const hasSalaryTx = txList.some(tx => tx.name === 'Ghost 月度工资' && tx.time && tx.time.startsWith(monthKey));
    if (!hasSalaryTx) {
      localStorage.removeItem(salaryKey);
    } else {
      return;
    }
  }

  const salary = (Math.floor(Math.random() * 11) + 15) * 100; // £1500-£2500
  localStorage.setItem('lastSalaryAmount', salary);
  localStorage.setItem('lastSalaryMonth', today.getFullYear() + '-' + (today.getMonth() + 1));

  setTimeout(() => {
    setBalance(getBalance() + salary);
    addTransaction({ icon: '💷', name: 'Ghost 月度工资', amount: salary });
    localStorage.setItem(salaryKey, salary.toString());
    if (typeof renderWallet === 'function') renderWallet();
    changeAffection(1);
    setRelationshipFlag('firstSalary', true);

    chatHistory.push({
      role: 'user',
      content: `[System: Today is the 25th. You just sent her your monthly salary £${salary}. It has arrived in her account. You can mention this naturally in conversation.]`,
      _system: true
    });

    const container = document.getElementById('messagesContainer');
    const salaryFallbacks = [
      `it's yours. £${salary}.`,
      `sent. use it.`,
      `check it. £${salary}. be smart.`,
      `£${salary}. don't waste it.`,
      `sent. don't argue.`,
    ];
    const fallbackLine = salaryFallbacks[Math.floor(Math.random() * salaryFallbacks.length)];

    callHaiku(
      `You are Simon Riley.\n\nYou just sent her your monthly salary: £${salary}.\n\nOne line. lowercase. No explanation. No extra context. Keep it short. Like he wouldn't make a thing out of it.`,
      [{ role: 'user', content: 'say something.' }],
      80
    ).then(async line => {
      // 破防检测已在 cleanBotText 出口统一处理
      const finalLine = (line && line.trim()) ? line : fallbackLine;
      if (container && typeof showGhostTransferCard === 'function') {
        showGhostTransferCard(container, salary, finalLine, false);
      }
      chatHistory.push({ role: 'assistant', content: finalLine, _transfer: { amount: salary, isRefund: false } });
      saveHistory();
    }).catch(() => {
      if (container && typeof showGhostTransferCard === 'function') {
        showGhostTransferCard(container, fallbackLine, salary, false);
      }
      chatHistory.push({ role: 'assistant', content: fallbackLine, _transfer: { amount: salary, isRefund: false } });
      saveHistory();
    });

    showToast('💷 Ghost 本月工资已到账 £' + salary + '！');
  }, 2000);
}

// ===== 聊天页初始化 =====
async function initChat() {
  // 清除所有残留定时器，防止多实例
  if (_silenceTimer) { clearTimeout(_silenceTimer); _silenceTimer = null; }
  if (_proactiveTimer) { clearTimeout(_proactiveTimer); _proactiveTimer = null; }
  // 清理历史里的破防内容，防止上下文污染
  if (typeof cleanBreakoutHistory === 'function') cleanBreakoutHistory();

  // 清理历史里的破防内容，防止上下文污染
  if (typeof isBreakout === 'function' && typeof chatHistory !== 'undefined') {
    const before = chatHistory.length;
    chatHistory = chatHistory.filter(m =>
      !(m.role === 'assistant' && !m._recalled && isBreakout(m.content))
    );
    if (chatHistory.length < before && typeof saveHistory === 'function') {
      saveHistory();
    }
  }
  // 好感度首次初始化
  if (!localStorage.getItem('affection')) setAffection(70);

  // 老用户补偿：established模式下trust/affection低于新默认值的，一次性升上来
  if (!localStorage.getItem('trustAffectionUpgrade_20260405')) {
    localStorage.setItem('trustAffectionUpgrade_20260405', '1');
    const _mode = localStorage.getItem('marriageType') || 'established';
    if (_mode === 'established') {
      if (getTrustHeat() < 75) setTrustHeat(75);
      if (getAffection() < 70) setAffection(70);
    }
  }

  // 补偿逻辑延迟执行——必须等云端数据完全加载后再写入，防止覆盖云端数据
  setTimeout(() => {
    // 维护补偿（每个用户只发一次）
    if (!localStorage.getItem('maintenanceCompensation_20260402')) {
      localStorage.setItem('maintenanceCompensation_20260402', '1');
      if (typeof addTransaction === 'function') {
        addTransaction({ icon: '🎁', name: '维护补偿', amount: 100 });
        if (typeof renderWallet === 'function') renderWallet();
      }
    }

    // 开服补偿£200（每个用户只发一次）
    if (!localStorage.getItem('openingCompensation_20260405')) {
      localStorage.setItem('openingCompensation_20260405', '1');
      if (typeof addTransaction === 'function') {
        addTransaction({ icon: '💷', name: '开服补偿', amount: 200 });
        if (typeof renderWallet === 'function') renderWallet();
      }
    }
  }, 5000); // 5秒后执行，确保云端数据已完全加载完毕

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
      const chatContainer = chatScreen.querySelector('.chat-container');
      if (chatContainer) chatContainer.style.height = '';
      const msgs = document.getElementById('messagesContainer');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }, 150);
  });
}
