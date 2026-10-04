// ============================================================
// chat_init.js — 聊天页初始化 & 后台系统
//
// 职责：
//   initChat        — 聊天页初始化（历史加载、状态初始化）
//   refreshChatScreen — 从其他页回到聊天页时的轻量刷新
//   iOS键盘处理
//
// 依赖：api.js、ui.js、persona.js、state.js、events.js、
//       money.js、delivery.js、cloud.js
// ============================================================

// ===== Legacy Silence / Proactive directors removed (Phase 3K-1A) =====
// Future Autonomy V1 will handle Ghost-initiated behavior.

// ===== 工资系统 · 已退役（2026-10）=====
// Ghost 每月底自动向用户钱包上交工资的机制已退役。
// 9 月为最后一次合法发放，历史 transaction 与余额保留。
// 新经济关系：用户职业收入=用户自己来源；Ghost Card=有限共享消费；
// Ghost Pay=按订单自主承担。不再有固定月度送钱机制。

// ===== 聊天页初始化 =====
async function initChat() {
  // Legacy timers removed (Phase 3K-1A)
  // 破防历史清理：暂时关闭，isBreakout 词表过于激进会误删正常回复
  // if (typeof cleanBreakoutHistory === 'function') cleanBreakoutHistory();
  // if (typeof isBreakout === 'function' && typeof chatHistory !== 'undefined') {
  //   chatHistory = chatHistory.filter(m =>
  //     !(m.role === 'assistant' && !m._recalled && isBreakout(m.content))
  //   );
  //   if (chatHistory.length < before && typeof saveHistory === 'function') saveHistory();
  // }
  // 钱包初始化（补偿/礼金/迁移，只执行一次）
  if (typeof initWallet === 'function') initWallet();

  // Relationship progression bootstrap retired (2026-10).
  // Legacy affection/trust values may remain in storage for compatibility,
  // but opening chat no longer initializes or upgrades the relationship.

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

  // 检查各类待触发事件
  if (localStorage.getItem('pendingSeriousTalk') === 'true') {
    setTimeout(() => { if (typeof triggerSeriousTalk === 'function') triggerSeriousTalk(); }, 2000);
  }

  // 朋友圈新动态提示恢复
  if (localStorage.getItem('feedHasNew') === '1') {
    const badge = document.getElementById('feedNewBadge');
    if (badge) badge.style.display = 'block';
  }

  // Offline affection penalty / forced comeback message retired.
  // Returning after time away is a fact, not a relationship score change or scripted reaction.

  // Ghost 月度工资上交机制已退役（2026-10），不再自动入账 / 发消息。

  // 剧情解锁检查（sessionStart类型）
  setTimeout(() => { if (typeof checkStoryOnSessionStart === 'function') checkStoryOnSessionStart(); }, 1500);

  // 地点 / 天气 / 时间
  if (typeof initLocation === 'function') {
    const loc = initLocation();
    if (typeof updateWeather === 'function') updateWeather(loc.weatherCity);
  }
  if (typeof updateUKTime === 'function') updateUKTime();
  // Phase 3G-8A: Simon 不再初始化 moodLevel。Mood Core 保留供 Keegan 兼容。

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
}

// ===== 从其他页回聊天页的轻量刷新 =====
function refreshChatScreen() {
  if (!_chatInited) {
    initChat();
    return;
  }

  // 修复 #3 重复回复：增量追加依赖 _renderedMsgCount，但实时发送
  // （sendMessage / 事件 / 快递等）push 进 chatHistory 时不会更新这个计数，
  // 导致回到聊天页时把已渲染过的消息当成"新消息"再追加一遍，且按 \n---\n
  // 拆段造成整条/部分重复。改为整列表幂等重渲（与 initChat 一致），
  // renderChatHistory 会先清空容器再重建，天然不会重复，并且能正确还原
  // 表情包/图片/转账卡片（增量路径会丢这些）。
  const realCount = chatHistory.filter(m => !m._system && !m._recalled).length;
  if (realCount !== _renderedMsgCount) {
    if (typeof renderChatHistory === 'function') {
      renderChatHistory(chatHistory);
    }
    _renderedMsgCount = realCount;
    scrollToBottom();
  }

  // 刷新状态UI
  if (typeof updateUKTime === 'function') updateUKTime();

  // 检查是否有未触发的外卖/快递反应（用户从外卖页切回聊天时触发）
  setTimeout(() => {
    if (typeof checkPendingTakeoutReactions === 'function') checkPendingTakeoutReactions();
  }, 500);
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
