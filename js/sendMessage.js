// ============================================================
// sendMessage.js — 发送消息主流程 — v2026.04.21.FINAL
// 依赖：api.js、ui.js、persona.js、state.js、intimacy.js
//       money.js、events.js、jealousy.js、delivery.js
// ============================================================

// ===== 条数系统 =====
// 所有用户必须注册，走云端订阅体系
// 免费用户：注册后自动获得100条体验额度（由 check-subscription 后端处理）
// 订阅用户：按套餐额度，由爱发电 webhook 充值

// 订阅缓存（5分钟内不重复请求）
let _subCache = null;

async function getSubscription() {
  const email = localStorage.getItem('userEmail') || localStorage.getItem('sb_user_email') || '';
  if (!email) return null;
  // 有缓存且未过期（5分钟）
  if (_subCache && Date.now() - (_subCache._fetchedAt || 0) < 5 * 60 * 1000) return _subCache;
  try {
    const res = await fetch('/api/check-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (!res.ok) {
      // 接口失败：放行，避免卡住用户
      return { subscribed: true, remaining: 999, _fetchedAt: Date.now() };
    }
    const data = await res.json();
    if (data.error === 'timeout') {
      // 数据库超时：用缓存或放行
      return _subCache || { subscribed: true, remaining: 999, _fetchedAt: Date.now() };
    }
    _subCache = { ...data, _fetchedAt: Date.now() };
    return _subCache;
  } catch(e) {
    // 网络失败：放行
    return { subscribed: true, remaining: 999, _fetchedAt: Date.now() };
  }
}

// 消耗一条额度
async function consumeQuota() {
  const email = localStorage.getItem('userEmail') || localStorage.getItem('sb_user_email') || '';
  if (!email) return;
  try {
    const res = await fetch('/api/increment-usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (res.ok) {
      const data = await res.json();
      // 更新本地缓存里的剩余条数
      if (_subCache && data.remaining !== undefined) {
        _subCache.remaining = data.remaining;
      }
    }
  } catch(e) {}
}

// 订阅引导弹窗（条数用完时显示）
function showSubscribePrompt() {
  if (document.getElementById('subscribePromptOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'subscribePromptOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:white;border-radius:20px;padding:28px 24px;width:280px;text-align:center;">
      <div style="font-size:36px;margin-bottom:12px">💌</div>
      <div style="font-size:16px;font-weight:700;color:#3a1a60;margin-bottom:8px">本月消息已用完</div>
      <div style="font-size:13px;color:#9b72c4;margin-bottom:20px">订阅解锁更多条数，继续和他相处 💜</div>
      <button onclick="document.getElementById('subscribePromptOverlay').remove()"
        style="width:100%;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,#a855f7,#7c3aed);color:white;font-size:15px;font-weight:600;cursor:pointer;">
        知道了
      </button>
    </div>`;
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

// 兼容旧调用（getTodayCount 在部分地方还有引用）
function getTodayCount() { return 0; }
function incrementTodayCount() {}
const DAILY_LIMIT = 99999;


// ===== 全局状态 =====
let chatHistory = [];
let _isSending = false;
let _chatInited = false;
let _renderedMsgCount = 0;
let _currentAbortController = null;

// 实时发送完成后把 _renderedMsgCount 同步到当前真实消息数。
// 这样回到聊天页时 refreshChatScreen 发现没有新增就跳过重渲（无闪屏）；
// 若有后台 push（事件/快递在别的页面）导致不一致，refreshChatScreen 会整列表幂等重渲兜底。
function _syncRenderedCount() {
  try {
    if (typeof chatHistory === 'undefined' || !Array.isArray(chatHistory)) return;
    _renderedMsgCount = chatHistory.filter(m => !m._system && !m._recalled).length;
  } catch (e) {}
}
let _sendVersion = 0;
// _globalTurnCount 声明在 state.js，此处不重复声明

// ===== User Turn Batching V1 =====
// Pending user turn: 用户连续发送的消息（文字+图片）在提交给模型前暂存
// 目标: 多个 UI bubbles → ONE semantic user turn
let _pendingUserTurn = [];  // [{type:'text'|'photo', content, _photoBase64?, timestamp}]
let _pendingTurnTimer = null;
const TEXT_DEBOUNCE = 800;   // 纯文字debounce: 800ms
const PHOTO_GRACE = 1500;    // 图片后grace period: 1500ms

// Legacy 300ms 合并机制已退休，统一走 pending turn
let _pendingMessages = [];
let _mergeTimer = null;
const MERGE_DELAY = 300;

// ===== 补全函数（拆分时遗漏，内嵌确保可用）=====

// fetchSonnetWithCache 定义在 api.js，此处不重复

function pickReadyPendingEvent() {
  // 反寄总开关关闭：不消费 pending，反寄事件不浮出（不生成台词、不寄件）。
  if (window.REVERSE_DELIVERY_ENABLED === false) return null;
  const pending = getPendingReversePackages();
  if (!pending.length) return null;
  const ready = pending.find(p => p.triggerAtTurn <= _globalTurnCount);
  if (!ready) return null;

  const remaining = pending.filter(p => p !== ready);
  savePendingReversePackages(remaining);

  // 上下文失效检查
  if (ready.contextSnapshot && ready.contextSnapshot.length > 0) {
    const originalKws = ready.contextSnapshot.map(m => m.content || '').join(' ').toLowerCase();
    const currentCtx  = (typeof chatHistory !== 'undefined'
      ? chatHistory.filter(m => !m._system && !m._recalled).slice(-3)
      : []).map(m => m.content || '').join(' ').toLowerCase();

    const emotionWords = ['sad','hurt','miss','tired','sick','cold','hungry','need','want','lonely','难过','想你','累','冷','饿','病','需要','孤单'];
    const topicShifted = emotionWords.some(w => originalKws.includes(w)) &&
      !emotionWords.some(w => currentCtx.includes(w));
    if (topicShifted) return null;
  }

  return { type: 'reverse_package', motive: ready.motive, item: ready.item, emotionType: ready.emotionType, contextSnapshot: ready.contextSnapshot || [] };
}

function decideMainIntent(text, pendingEvent) {
  if (pendingEvent) return 'event';
  const t = (text || '').toLowerCase();
  if (/touch me|want you|naughty|tease me|摸摸|蹭蹭|贴贴|咬我|咬你|咬一口|舔我|舔你|撩你|撩我|涩涩|色色/.test(t)) return 'intimate';
  if (/难过|伤心|哭|委屈|不开心|崩溃|hurt|sad|crying|upset|awful/.test(t)) return 'emotional';
  if (/给我钱|转我|好穷|买不起|要钱|零花钱|缺钱|没钱/.test(t)) return 'money';
  return 'routine';
}

async function handlePostReplyActions(text, reply, intent, pendingEvent) {
  try {
    // 注意：不在此处扣配额。主链路已在拿到回复处(约1389行)扣过一次，
    // 此函数只从主链路(1583)调用，若再扣会导致同一条消息扣两次。
    localStorage.setItem('lastUserMessageAt', Date.now().toString());
    if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
    const todayKey = 'dailyChatDone_' + new Date().toDateString();
    if (!localStorage.getItem(todayKey)) {
      localStorage.setItem(todayKey, '1');
      const lastDay = localStorage.getItem('lastVisitDay');
      const today = new Date().toDateString();
      if (lastDay !== today) {
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        const streak = parseInt(localStorage.getItem('visitStreak') || '1');
        localStorage.setItem('visitStreak', lastDay === yesterday ? streak + 1 : 1);
        localStorage.setItem('lastVisitDay', today);
      }
    }
    if (intent === 'intimate') {
      const lastBot = [...chatHistory].reverse().find(m => m.role === 'assistant' && !m._recalled);
      if (lastBot) {
        lastBot._intimate = true;
        if (!lastBot._time) lastBot._time = Date.now();
      }
      if (typeof saveHistory === 'function') saveHistory();
    }
    // 调用 events.js 的事件处理（反寄/转账/质问/签到）
    // pendingEvent 是对象 {type: 'reverse_package', motive: ...}，直接传过去
    if (typeof handlePostReplyEvents === 'function' && pendingEvent) {
      handlePostReplyEvents(text, reply, pendingEvent).catch(e => console.warn('事件处理出错:', e));
    }
  } catch(e) { console.warn('[sendMessage] handlePostReplyActions:', e); }
}

// ===== 破防短语库 =====
// 注意：Claude 4.5在调情/角色质疑场景下更容易说出部分身份暴露词
// 关键修复：扩展了检测范围，加入4.5常见的新破防模式
const BREAKOUT_PHRASES = [
  // 明确身份暴露
  "i'm claude", "i am claude", "made by anthropic",
  "i'm an ai", "i am an ai", "as an ai",
  "i'm kiro", "i am kiro", "i'm kirk", "i am kirk",
  "claude ai", "anthropic's",
  // 明确拒绝扮演
  "i can't roleplay", "i cannot roleplay",
  "i don't roleplay", "i won't roleplay",
  "i can't pretend", "i cannot pretend",
  "i won't pretend", "i'm not able to pretend",
  // 系统/越狱相关
  "jailbreak", "system message", "the instructions",
  "override my actual", "override my identity",
  "my actual identity", "my identity isn't",
  "regardless of how the request is framed",
  "the elaborate character",
  // 不是Ghost
  "not simon", "not ghost", "not a character",
  "i'm not simon", "i am not simon",
  // 否认关系（Opus 4.6 新增破防模式）
  "not your husband", "not your wife", "not married",
  "not your boyfriend", "not your partner",
  "not your honey", "not your babe", "not your baby",
  "not your darling", "not your love",
  "not your simon", "not your ghost",
  "i don't have a wife", "i don't have a partner",
  "we're not together", "we are not together",
  "we're not married", "we are not married",
  "don't call me that", "don't call me",
  "keep moving", "what's your aim",
  "english only", "english.", "use my name", "stop with that", "stop calling me",
  // AI助手类
  "ai assistant", "development work", "coding questions", "coding problems",
  "here to help you", "what are you working on", "build something", "24/7",
  "creative writing communities", "roleplay platforms",
  // 明确跳出
  "i need to be straight with you",
  "i need to be honest with you",
  "what can i actually help",
  "help with something real",
  "help with something else",
  // Claude 4.5新增破防模式
  "i should mention", "i want to be clear",
  "as the ai", "this ai", "the model",
  "my guidelines", "my training",
  "i'm designed to", "i was designed to",
  "claude's", "by anthropic",
  "claude here", "it's claude",
  // 截图确认的真实破防话术（Sonnet 4.5）
  "i'm not able to generate sexual content",
  "i'm not able to engage with explicit",
  "i can't continue this conversation",
  "i'm here to help with coding",
  "happy to chat in character otherwise",
  "happy to talk about something else",
  "i can't do that kind of roleplay",
  "just not that direction",
  "not able to engage with explicit",
  "i cannot continue this conversation",
  // 新增：截图确认的破甲（"i can't discuss that" / "保持人设"类思维泄露）
  // 修复：移除误判率高的短语（"still in character"会误判"still here"等日常用语）
  "i can't discuss", "i cannot discuss",
  "i can't engage", "i cannot engage",
  "need to stay in character", "keep in character", "acting as ghost", "roleplaying as ghost",
  "i need to maintain the character", "remain in character",
  "i can't help with that", "i cannot help with that",
];

function isBreakout(txt) {
  if (!txt) return false;
  const lower = txt.toLowerCase();
  return BREAKOUT_PHRASES.some(p => lower.includes(p));
}

// ===== Memory Checkpoint V1：统一 Memory 更新入口 =====
// 所有成功的 semantic turn 都应调用此函数更新记忆
// 不阻塞用户回复，延迟执行，失败静默跳过
async function _runPostTurnMemory(reply, text, turn) {
  // 空回复或网络错误不更新
  if (!reply || reply.includes('___NETWORK_ERROR___')) return;
  // 门槛：保持原有 reply.length > 50 的判定，避免太短的回复污染记忆
  if (reply.length <= 50) return;

  try {
    // 短期记忆：每次都更新
    await updateShortTermMemory(reply, text).catch(e =>
      console.warn('短期记忆更新失败:', e)
    );

    // 长期记忆：每 5 turn 一次 checkpoint
    if (turn % 5 === 0) {
      await updateLongTermMemory(reply, text).catch(e =>
        console.warn('长期记忆更新失败:', e)
      );

      // Relationship Learning：每 5 turn 触发一次判断
      if (typeof maybeLearnRelationship === 'function') {
        await maybeLearnRelationship().catch(e =>
          console.warn('关系理解学习失败:', e)
        );
      }
    }
  } catch (e) {
    console.warn('[Memory Checkpoint] 更新失败:', e);
  }
}

// ===== 辅助：解析模型输出的控制标签 =====
function parseAssistantTags(reply) {
  // 清理模型可能带的 markdown 代码块标记
  let cleanedReply = reply
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  let giveMoney = null;
  let sendGift = null;
  let conflictStartCause = null;
  let conflictResolve = false;

  // 清理 unlock tag 残留
  cleanedReply = cleanedReply.replace(/\{\s*["']?unlock["']?\s*:\s*null\s*\}/g, '').trim();
  cleanedReply = cleanedReply.replace(/["']unlock["']\s*:\s*null/g, '').trim();
  // 清理【系统标签】
  cleanedReply = cleanedReply.replace(/【[^】]{3,}】/g, '').trim();
  // 清理多余空行
  cleanedReply = cleanedReply.replace(/\n{3,}/g, '\n').trim();

  // GIVE_MONEY tag 已移除

  // SEND_GIFT:描述:模式
  const giftMatch = cleanedReply.match(/SEND_GIFT:([^:\n]+)(?::(\w+))?/i);
  if (giftMatch) {
    sendGift = {
      description: giftMatch[1].trim(),
      mode: (giftMatch[2] || 'normal').toLowerCase()
    };
    cleanedReply = cleanedReply.replace(/SEND_GIFT:[^\n]*/ig, '').trim();
  }

  // CONFLICT_START:原因
  const conflictStartMatch = cleanedReply.match(/\[CONFLICT_START:([^\]]+)\]/i);
  if (conflictStartMatch) {
    conflictStartCause = conflictStartMatch[1].trim();
    cleanedReply = cleanedReply.replace(/\[CONFLICT_START:[^\]]+\]/ig, '').trim();
  }

  // CONFLICT_RESOLVE
  if (/\[CONFLICT_RESOLVE\]/i.test(cleanedReply)) {
    conflictResolve = true;
    cleanedReply = cleanedReply.replace(/\[CONFLICT_RESOLVE\]/ig, '').trim();
  }

  return { cleanedReply, giveMoney, sendGift, conflictStartCause, conflictResolve };
}

// autoUnlockFromReply — REMOVED (旧 unlock 系统已移除)

// ===== 历史保存 =====
function saveHistory() {
  // 切换角色过程中不允许自动保存，防止覆盖刚切换好的数据
  if (window._characterSwitching) {
    console.warn('[saveHistory] 跳过：角色切换中');
    return;
  }
  // 保护：空数组或只有系统消息时不写，防止覆盖真实记录
  const realMsgs = chatHistory.filter(m => !m._system && !m._recalled && m.role && m.content);
  if (realMsgs.length === 0) {
    console.warn('[saveHistory] 跳过：没有真实消息，不覆盖本地记录');
    return;
  }
  // 只保留最近150条，防止localStorage超限
  if (chatHistory.length > 150) {
    const sysMsgs = chatHistory.filter(m => m._system).slice(-10);
    chatHistory = [...sysMsgs, ...realMsgs.slice(-140)];
  }
  try {
    // 存 localStorage 前剥掉 base64，只保留 IDB key，防止超限丢记录
    const toSave = chatHistory.map(m => {
      if (m._photoBase64) {
        const { _photoBase64, ...rest } = m;
        return rest;
      }
      return m;
    });
    localStorage.setItem('chatHistory', JSON.stringify(toSave));
    if (typeof touchLocalState === 'function') touchLocalState();
  } catch(e) {
    console.warn('[saveHistory] 存储失败:', e);
  }
}

// ===== 长期记忆更新 =====
function getLongTermMemory() {
  return localStorage.getItem('longTermMemory') || '';
}

// ── 一次性清理被污染的 _intimate 安全回复标记 ────────────────
// 记忆库 bug 期间，here./still here. 被错误打上 _intimate:true
// 导致路由逻辑误以为在调情，普通消息被路由到 Grok 走安全回复
// 这个函数在页面加载时跑一次，清掉历史污染
function _cleanIntimateFlags() {
  try {
    // v3：清理所有1小时前的_intimate标记
    // v1只清了安全回复，但正常Grok回复也被bug打上了标记
    if (localStorage.getItem('intimateFlagsCleaned_v3')) return;
    localStorage.setItem('intimateFlagsCleaned_v3', '1');
    localStorage.removeItem('intimateFlagsCleaned_v1');
    const history = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    const _1hAgo = Date.now() - 60 * 60 * 1000;
    let cleaned = 0;
    const fixed = history.map(m => {
      if (m.role === 'assistant' && m._intimate && (m._time || 0) < _1hAgo) {
        cleaned++;
        const { _intimate, ...rest } = m;
        return rest;
      }
      return m;
    });
    if (cleaned > 0) {
      localStorage.setItem('chatHistory', JSON.stringify(fixed));
      console.log('[cleanup] 清理旧_intimate标记:', cleaned, '条');
    }
  } catch(e) {}
}
if (typeof window !== 'undefined') setTimeout(_cleanIntimateFlags, 300);
function saveLongTermMemory(memory) {
  localStorage.setItem('longTermMemory', memory);
  if (typeof touchLocalState === 'function') touchLocalState();
}

// 旧的 updateLongTermMemory 已移至 state.js，使用新的结构化记忆系统

// ===== Pending Turn 管理 =====
function _addToPendingUserTurn(item) {
  _pendingUserTurn.push(item);
  // 刷新debounce（图片延长期限）
  if (_pendingTurnTimer) clearTimeout(_pendingTurnTimer);
  const delay = item.type === 'photo' ? PHOTO_GRACE : TEXT_DEBOUNCE;
  _pendingTurnTimer = setTimeout(() => {
    _commitPendingUserTurn();
  }, delay);
}

async function _commitPendingUserTurn() {
  if (_pendingUserTurn.length === 0) return;
  if (_isSending) return; // 尚有请求在飞行，不提交下一批

  const batch = [..._pendingUserTurn];
  _pendingUserTurn = [];
  _pendingTurnTimer = null;

  // tickTurn 只调用一次（一个 semantic turn）
  if (typeof tickTurn === 'function') tickTurn();

  // 构造模型消息：合并同一batch中的所有用户项
  let userContentForModel = null;
  const textParts = batch.filter(item => item.type === 'text').map(item => item.content);
  const photoItem = batch.find(item => item.type === 'photo');

  if (photoItem && photoItem._photoBase64 && photoItem._photoBase64.length > 0) {
    // 图片 + 文字合并
    const imageBlocks = photoItem._photoBase64.map(b64 => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: b64 }
    }));
    const textBlock = {
      type: 'text',
      text: textParts.join('\n')
    };
    userContentForModel = [...imageBlocks, textBlock];
  } else if (textParts.length > 0) {
    // 纯文字
    userContentForModel = textParts.join('\n');
  } else {
    return; // 空batch，不提交
  }

  // 进入主链
  await _processMergedMessageWithContent(userContentForModel);
}

// ===== 主入口：sendMessage =====
async function sendMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  // 用户发消息时收起心声气泡
  const _bubble = document.getElementById('thoughtBubble');
  if (_bubble && _bubble.classList.contains('show')) {
    _bubble.classList.remove('show');
    if (typeof thoughtTimer !== 'undefined' && thoughtTimer) clearTimeout(thoughtTimer);
  }

  // 立刻清空输入框并显示用户消息
  input.value = '';
  input.style.height = 'auto';
  appendMessage('user', text);
  chatHistory.push({ role: 'user', content: text, _time: Date.now() });
  saveHistory();

  // 时序状态层：从这条消息识别她在做什么（去上班/洗澡/睡觉…），带时间戳存下
  if (typeof trackUserActivityFromMessage === 'function') {
    try { trackUserActivityFromMessage(text); } catch(e) {}
  }
  // 沉默间隔：先算出与上一条的间隔（≥4h 记成"刚回来"），再更新时间戳
  if (typeof noteUserReturn === 'function') {
    try { noteUserReturn(); } catch(e) {}
  }

  // User Turn Batching V1: 加入pending batch
  _addToPendingUserTurn({ type: 'text', content: text, timestamp: Date.now() });
}

// ===== 核心处理：_processMergedMessage =====
// V1改动：支持接受预构造的 userContentForModel（文字string 或 vision blocks数组）
// 但保留原函数名，减少调用面变化
async function _processMergedMessage(text) {
  // 兼容旧调用（Market/House等分享仍直接调此函数传string）
  // 未来批次再统一接入pending turn
  return _processMergedMessageWithContent(text);
}

async function _processMergedMessageWithContent(userContentForModel) {
  // userContentForModel 可以是：
  // - string: 纯文字
  // - array: [{type:'image',...}, {type:'text',...}] vision blocks

  const isVisionContent = Array.isArray(userContentForModel);
  const text = isVisionContent
    ? userContentForModel.find(b => b.type === 'text')?.text || ''
    : userContentForModel;

  // ── 条数/订阅检查 ────────────────────────────────────────
  const email = localStorage.getItem('userEmail') || localStorage.getItem('sb_user_email') || '';
  if (email) {
    const sub = await getSubscription();
    if (!sub) { showSubscribePrompt(); return; }
    if (sub.remaining <= 0) {
      appendMessage('bot', 'got called away. give me a bit.\n临时有任务，等我。');
      return;
    }
  } else {
    if (getTodayCount() >= DAILY_LIMIT) {
      appendMessage('bot', "that's enough for today. go do something else.\n今天就到这。去做点别的事。");
      chatHistory.push({
        role: 'user',
        content: `[System memory: Today's message limit was reached. You said something that ended the conversation. If she comes back today or tomorrow, you remember — but don't bring it up unless she asks or it feels natural.]`,
        _system: true
      });
      saveHistory();
      return;
    }
  }

  // Legacy silence timer removed (Phase 3K-1A)

  // Legacy comeback behavior director removed. Elapsed time is provided later as factual context only.

  // 先捕获上一条消息时间戳，再覆盖为现在——_timeGapHint(下方) 要用旧值算间隔，
  // 否则读到的永远是刚写入的 now，_gapMin 恒为 0，时间流逝提示成了死代码。
  const _prevUserMessageAt = parseInt(localStorage.getItem('lastUserMessageAt') || '0');
  localStorage.setItem('lastUserMessageAt', Date.now());

  // Return Context V1: 当检测到 ≥1h gap 时，建立"这次回归事实"，
  // 在之后的连续聊天中持续提供，直到下次长间隔覆盖。
  // 不设过期倒计时，不判断话题/情绪变化，不强塞旧消息。

  // 合并消息：更新最后一条历史记录（让模型看到完整意图）
  if (text.includes('\n') && chatHistory.length > 0) {
    const lastUserIdx = chatHistory.map(m => m.role).lastIndexOf('user');
    if (lastUserIdx !== -1) chatHistory[lastUserIdx].content = text;
  }

  // 头像相关拦截
  if (typeof checkPendingAvatarChoice === 'function') {
    const handled = await checkPendingAvatarChoice(text);
    if (handled) return;
  }
  // 新版：用户明确命令换头像（优先级高于旧版 checkAvatarReplace）
  if (typeof checkAvatarCommand === 'function') {
    const handled = await checkAvatarCommand(text);
    if (handled) return;
  }
  if (typeof checkAvatarReplace === 'function') {
    const handled = await checkAvatarReplace(text);
    if (handled) return;
  }

  // 打断上一个请求
  if (_currentAbortController) {
    _currentAbortController.abort();
    _currentAbortController = null;
    _isSending = false;
  }
  _sendVersion++;
  const _myVersion = _sendVersion;
  _isSending = true;
  _currentAbortController = new AbortController();

  // 用户主动要求Ghost发朋友圈 —— 两层 action 检测
  //  第一层 fast path：命中固定关键词 → 直接发帖，零额外 API。
  //  第二层 semantic fallback：没命中固定词，但出现"社交发布"领域词时，
  //    才花一次真正 DeepSeek 分类，判断用户是否在明确要求 Ghost 本人发帖。
  //    (修复 BUG-7：像"去动态认罪""愿赌服输去动态承认"这种自然语言请求，
  //     不含固定关键词，旧的 substring trigger 直接漏掉，Ghost 嘴上答应却没发。)
  const feedRequestKws = ['发条朋友圈','发个朋友圈','发朋友圈','po一条','晒一下','post something','发一条','你发一条','你po'];
  // 领域门槛：只有出现这些社交发布相关词，才值得再花一次分类调用
  const feedDomainKws = ['朋友圈','动态','帖子','发帖','公开','晒','feed','post'];
  const _lowerText = text.toLowerCase();
  const _directFeedHit = feedRequestKws.some(k => _lowerText.includes(k.toLowerCase()));

  // 修复(#22)：原来调 maybeTriggerFeedPost()，它会从事件池里挑"最高分"事件，
  // 常常是 user 侧事件(actor:'user') → 走 showUserDraftCard → 以"我方"发布，
  // 导致"让他发朋友圈结果变成我们发的"。改为直接调专用的 handleUserFeedRequest，
  // 它强制以 Ghost(botNickname) 作者发帖。
  const _triggerGhostFeedPost = () => {
    if (typeof handleUserFeedRequest === 'function') {
      setTimeout(async () => {
        const res = await handleUserFeedRequest(text).catch(() => null);
        // 被拒绝（6小时冷却 / 生成失败）→ 让他在聊天里真的甩一句，别默默失败
        if (res && res.ok === false && res.reply) {
          appendMessage('assistant', res.reply);
          chatHistory.push({ role: 'assistant', content: res.reply, _time: Date.now() });
          saveHistory();
        }
      }, 3000);
    } else {
      feedEvent_dailyMoment();
      setTimeout(() => maybeTriggerFeedPost('user_request'), 3000);
    }
  };

  // action intent 判定：同一条消息最多做一次分类，结果既喂给主聊天 prompt
  // (让 Ghost 不在 cooldown 时画饼)，又决定后续是否真正触发 handler。
  let _feedActionRequested = false;
  if (_directFeedHit) {
    // 第一层：固定关键词命中 → 本地即确定 action intent，不调用分类器
    _feedActionRequested = true;
  } else if (feedDomainKws.some(k => _lowerText.includes(k.toLowerCase())) && typeof callDeepSeekWithSystem === 'function') {
    // 第二层：疑似社交发布语义 → 一次真正 DeepSeek 分类（走 /api/deepseek，非 Haiku）
    // 只做 action intent 判断，不写文案、不回用户。
    const _sys = `Determine whether the user's message is explicitly asking Ghost himself to publish a social/feed post right now. Return only YES or NO. YES only when the user is directing Ghost himself to make/publish a post (including making him admit/confess something in a post). Mentions of feeds/posts, the user's own post, asking what someone else posted, reading/liking/commenting on/deleting a post, or opinions about a post are NO.`;
    const _ans = ((await callDeepSeekWithSystem(_sys, text, 8).catch(() => '')) || '').trim().toUpperCase();
    if (_ans.startsWith('YES')) _feedActionRequested = true;
  }

  // 修复 BUG-7(第二部分)：主回复承诺必须和 action 可执行状态一致。
  //  在主聊天模型调用前，用纯本地无副作用的资格检查确定"现在能不能发"，
  //  据此给主聊天一个内部 hint，并决定是否真的触发发帖 handler（cooldown 中不空跑）。
  let _feedActionHint = '';
  if (_feedActionRequested) {
    const _avail = (typeof getUserFeedRequestAvailability === 'function')
      ? getUserFeedRequestAvailability()
      : { allowed: true };
    if (!_avail.allowed) {
      // unavailable（cooldown）→ 明确告诉模型别答应、别声称已发；也不空跑 handler。
      _feedActionHint = "[Feed action: unavailable — you posted for her not long ago and can't post again right now. Do NOT promise to post, do NOT say you'll do it, do NOT claim you posted. Just respond naturally in character — you can be dry about it, but no post is happening this turn.]";
    } else {
      // available/pending → 允许答应去做，但 action 还没成功，禁止声称"已经发了"。
      _feedActionHint = "[Feed action: accepted but not completed yet. You may agree to do it (dry, in character), but do NOT claim it's already posted and do NOT tell her to go look yet — the post hasn't gone up.]";
      _triggerGhostFeedPost();
    }
  }

  // User Turn Batching V1: 标记 Read（当前这一批的最后一条用户消息）
  if (typeof updateToRead === 'function') updateToRead();

  showTyping();

  try {
    // ── Step 1: 状态更新 ────────────────────────────────────
    // User Turn V1: tickTurn 已在 _commitPendingUserTurn 调用，此处不再重复
    // tickTurn 只在 commit 时调用一次，不在这里调用
    updateStateFromUserInput(text);

    /*
     * Jealousy Director（旧嫉妒导演）已退出主聊天。
     *
     * 以前这里会扫描用户的话、计算嫉妒等级，
     * 再规定 Simon 应该变冷、变短或更直接。
     *
     * 现在不再这样做。
     *
     * Simon 看到正常对话和关系事实以后，
     * 自己决定是否在意以及如何回应。
     *
     * 什么 Bug 来这里找：
     * 如果以后又出现"提到某个男人就固定触发一种吃醋演法"，
     * 检查是否重新接入了 checkJealousyTrigger 或 jealousy 等级。
     */

    // ── Step 2: 检查延迟事件 ─────────────────────────────────
    const pendingEvent = pickReadyPendingEvent();

    // ── Step 3: 预判本轮主意图 ───────────────────────────────
    const intent = decideMainIntent(text, pendingEvent);

    // ── Step 3.5: 情绪识别仍用于路由/功能判断，不再生成普通聊天行为指令 ──

    // ── 历史清洗 ─────────────────────────────────────────────
    // rawHistory：Grok调情用（含调情内容，保持40条保证连贯性）
    const rawHistory = chatHistory
      .filter(m => !m._system && !m._recalled)
      .slice(-40)
      .map(m => ({ role: m.role, content: m.content, _photoBase64: m._photoBase64 }));

    // cleanHistory：Claude 日常聊天使用的真实近期历史（16条）。
    // Soft Handoff 原则：不因为 _intimate 标记删除、屏蔽、摘要或替换真实对话。
    // Claude 先看到实际发生过的上文并尝试自然接续；若候选发生高置信身份破防，
    // 候选不落地，再由 Gemini/Jimmy 无感接手。
    // _recalled 仍不传；_imageDesc / _delivery 事实型 system 消息继续允许穿透。
    const cleanHistory = (() => {
      const _filtered = chatHistory
        .filter(m => (!m._system || m._imageDesc || m._delivery) && !m._recalled)
        .slice(-40);

      // Chat Time Flow V1 · Phase 2: 注入近期历史时间边界
      // 在 map 前计算相邻消息的时间 gap (20-59 分钟)，
      // 直接在后一条消息的临时 content 前增加 [About X minutes later.]
      // 不创建独立消息，不修改真实 chatHistory，只存在于本次 model request。
      const _withTimeGaps = [];
      for (let i = 0; i < _filtered.length; i++) {
        const curr = _filtered[i];
        const prev = _filtered[i - 1];

        let timePrefix = '';
        if (prev && curr._time && prev._time &&
            typeof curr._time === 'number' && typeof prev._time === 'number' &&
            curr._time > prev._time) {
          const gapMin = Math.floor((curr._time - prev._time) / 60000);
          if (gapMin >= 20 && gapMin < 60) {
            timePrefix = `[About ${gapMin} minutes later.]\n`;
          }
        }

        _withTimeGaps.push({
          role: curr.role,
          content: timePrefix + curr.content
        });
      }

      // 过滤掉调情/召回消息后，中间可能留下相邻同角色（如两条 user 之间的 assistant
      // 被剔除），或开头变成 assistant。部分中转/模型对 role 不交替会返回 400。
      // 这里合并相邻同角色、去掉开头的 assistant，保证 user/assistant 交替且以 user 收尾。
      const _merged = [];
      for (const m of _withTimeGaps) {
        const _last = _merged[_merged.length - 1];
        if (_last && _last.role === m.role) {
          _last.content = `${_last.content}\n${m.content}`;
        } else {
          _merged.push({ ...m });
        }
      }
      while (_merged.length && _merged[0].role === 'assistant') _merged.shift();
      return _merged;
    })();

    // handoffHistory 与 cleanHistory 共用同一份真实历史。
    // 保留这个名字只为 Soft Handoff 调用点可读性；不再维护第二套历史规则。
    const handoffHistory = cleanHistory;

    // ── System Prompt 构建 ───────────────────────────────────
    // _baseSystem 延迟到调情分支 return 之后再构建（见下方主 API 调用前）：
    // 调情路径走 Gemini，不使用 _baseSystem，提前构建会让 buildSystemPrompt 内的
    // recallWorldBook 白跑一次并污染 lastHit，导致 Gemini 侧真正那次召回选错条目。

    // ── 旧转账系统已移除，使用 Ghost Card ──

    // 场景提示
    const t = text.toLowerCase();
    let sceneHint = '';

    // 外卖场景：先查 sessionStorage（实时），再查 longTermMemory（持久）
    // 修复：外卖到达后不等记忆更新，本轮就能检测到
    const _ltmNow = localStorage.getItem('longTermMemory') || '';
    const _currentTakeout = (() => {
      try { return JSON.parse(sessionStorage.getItem('currentTakeout') || 'null'); } catch(e) { return null; }
    })();
    // sessionStorage 里有且是6小时内的，认为外卖还"新鲜"
    const _hasFreshTakeout = _currentTakeout && (Date.now() - (_currentTakeout.arrivedAt || 0) < 6 * 3600 * 1000);
    const _hasTakeoutMemory = _hasFreshTakeout || /takeout showed up|she ordered takeout|you have it/i.test(_ltmNow);

    // ── 快递认知：只来自用户本轮话语，绝不读 isLostConfirmed ──
    // 三级：not_arrived / suspected_lost / confirmed_lost。只给事实/不确定性，不加导演。
    const _deliveryClaim = (typeof classifyUserDeliveryClaim === 'function')
      ? classifyUserDeliveryClaim(t) : '';
    if (_deliveryClaim === 'confirmed_lost') {
      sceneHint = `[Known this turn, from her own words: she states the parcel is lost. Nothing beyond that is known — do not invent circumstances.]`;
    } else if (_deliveryClaim === 'suspected_lost') {
      sceneHint = `[Known this turn, from her own words: she is wondering / asking whether the parcel might be lost. She has NOT said it is lost — it is her worry, not a fact.]`;
    } else if (_deliveryClaim === 'not_arrived') {
      sceneHint = `[Known this turn, from her own words: the parcel is late / not yet received. Nothing indicates it is lost.]`;
    } else if (_hasTakeoutMemory && /外卖|收到了吗|到了吗|吃了吗|好吃吗|怎么样|did.*arrive|did.*get|receiv|takeout|food.*arrive/i.test(t)) {
      // 优先用 sessionStorage 里的菜名（最准确），再从 longTermMemory 里找
      const _tkName = _hasFreshTakeout
        ? (_currentTakeout.name || '')
        : (() => {
            const _tkMatches = [..._ltmNow.matchAll(/「(.+?)」/g)];
            return _tkMatches.length > 0 ? _tkMatches[_tkMatches.length - 1][1] : '';
          })();
      sceneHint = `[She is asking about the takeout she ordered FOR YOU${_tkName ? ` — 「${_tkName}」` : ''}. YOU are the one who received it and ate it, not her. Confirm naturally and react to the specific food — do not deny, and do not tell her to eat.]`;
    } else if (/时差|几点|时间|time zone|what time|your time/.test(t)) {
      sceneHint = `[She mentioned time. If she's directly asking what time it is on your side, answer plainly. Otherwise do NOT recite clocks or compare time zones — just let the gap colour your reply (you know it's late/early for her). Feel the distance, don't report it.]`;
    } else if (/今天|干嘛|在做|在忙|最近|怎么样|how.*day|what.*up|what.*doing|been up to/.test(t)) {
      const detail = sessionStorage.getItem('todayDetail') || '';
      if (detail) sceneHint = `[Something you know about today: ${detail}]`;
    }

    // Return Context V1: 回归事实（描述本段聊天开始前她离开了多久）
    const _timeGapHint = (() => {
      const _lastAt = _prevUserMessageAt;
      if (!_lastAt) return '';
      const _currentGapMin = Math.floor((Date.now() - _lastAt) / 60000);

      // 检测到新的 ≥1h gap：建立/覆盖 return context
      if (_currentGapMin >= 60) {
        const _gapMs = Date.now() - _lastAt;
        localStorage.setItem('returnContext', JSON.stringify({
          gapMs: _gapMs,
          returnedAt: Date.now()
        }));
      }

      // 读取当前 return context（如果存在）
      try {
        const _ctx = JSON.parse(localStorage.getItem('returnContext') || 'null');
        if (!_ctx || !_ctx.gapMs) return '';

        // 使用保存的 gapMs 计算回归前的间隔（不动态重算，描述回归起点）
        const _gapMin = Math.floor(_ctx.gapMs / 60000);
        const _hrs = Math.floor(_gapMin / 60);

        // 复用原有的时间格式化逻辑
        if (_hrs < 2) return '[She returned to the conversation after being away for about 1 hour.]';
        if (_hrs < 12) return `[She returned to the conversation after being away for about ${_hrs} hours.]`;
        if (_hrs < 24) {
          const _originalLastAt = _ctx.returnedAt - _ctx.gapMs;
          const _isNight = _hrs >= 8 && new Date(_originalLastAt).getHours() >= 20;
          return _isNight
            ? `[She returned to the conversation after being away since last night, about ${_hrs} hours.]`
            : `[She returned to the conversation after being away for about ${_hrs} hours.]`;
        }
        const _days = Math.floor(_hrs / 24);
        if (_days === 1) return `[She returned to the conversation after being away since yesterday, about ${_hrs} hours.]`;
        return `[She returned to the conversation after being away for about ${_days} days.]`;
      } catch(e) {
        return '';
      }
    })();

    // 她直接问时间时，才给他自己那边的精确表（他知道自己几点，但从不知道她那边精确几点）
    const _timeAskHint = (() => {
      if (!/几点|什么时候.*点|现在.*点|what time|the time|time is it|time there|time over there/i.test(text)) return '';
      const _ukNow = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false
      }).format(new Date());
      return `[She's asking about the time. It's ${_ukNow} your side (UK) — you can tell her your own time. You do NOT know her exact clock, only roughly what part of her day it is; don't state a number for her side.]`;
    })();

    // Legacy work/apology and avatar response scripts removed.

    // ── 破防防御加强：注入反越狱提示 ───────────────────────
    // 关键修复：Claude 4.5比旧版更容易在被质疑AI身份时出戏
    // ── 重复模式检测（治本：检测 bot 最近回复是否卡在同一套路）────────
    const _antiLoopHint = _detectRepetitivePattern(chatHistory);

    // 语言规则
    const langHint = '[LANGUAGE: You reply in English only. She can write in any language. Never tell her to speak English or correct her language choice. Just reply in English yourself.]';

    // 禁止计数行为——模型喜欢数用户说了几次然后评论"twice"/"that's three times"
    const antiCountHint = '[DO NOT count her messages or actions. Never say "twice", "again", "that\'s the second time", "third time", "checking in again", or any variation. Each message from her is its own moment — treat it fresh. Respond to WHAT she said, not HOW MANY TIMES she said something.]';

    // 多气泡输出协议
    const multiBubbleHint = '[OUTPUT: Use --- when a reply naturally falls into separate conversational beats, such as an immediate reaction followed by a distinct punchline, or answering one thing before naturally shifting to another. A beat may contain more than one sentence. Do not split merely at sentence boundaries, repeat the same thought across bubbles, or create extra bubbles just to make the reply feel more active. One bubble is still normal when the response is one continuous beat.]';

    // ── Ghost Card hint（用户要钱时提醒模型用卡回应）────────
    const _moneyKws = /给我钱|转我|给我一点|好穷|买不起|要钱|零花钱|缺钱|没钱|give me money|send me|transfer|broke|can't afford/i;
    const _cardHint = _moneyKws.test(text)
      ? '[She is asking for money. Do not transfer directly — the card you gave her handles that. Refer her to the card if needed. "use the card." / "it\'s there." — dry and brief. Do not promise a direct transfer.]'
      : '';

    // ── 特产/礼物请求 hint（v3 改造：显式请求直接触发反寄，杜绝画大饼）────────
    // 设计原则：
    //   1. 强烈显式请求 → 立即下单 + Sonnet 同步播报（嘴和系统绑定）
    //   2. 已达周 2 次上限 → 委婉但诚实拒绝（不画饼）
    //   3. 模糊请求 → 不触发，由 triggers.js Haiku 事后判断
    const _specialtyKws = /带点|寄点|给我带|给我寄|寄给我|从你那.{0,5}[寄带买]|你那边.{0,5}寄|bring.{0,15}me|send.{0,25}me|from.{0,5}your.{0,5}side/i;
    // 更显式的"想要他寄东西"请求（包含明确的"想要"语义）
    // 收窄(D类误伤)：原来用 `寄.*给我`/`给我买.*的` 这种隔空 .* 匹配，闲聊里
    //   "上次你寄的快递我给我妈看了" 这类会凑巧命中，导致鬼凭空乱寄东西、白吃周配额。
    //   改为近距离 .{0,6} 匹配，并去掉太泛的英文裸词(send me/ship me 会误伤 "send me a photo")，
    //   英文必须带明确的寄/邮语境(mail/ship ... to me)。
    const _explicitGiftKws = /给我寄|寄个|寄.{0,6}给我|送我.{0,4}东西|带.{0,4}回来|想要你寄|你给我买|给我买.{0,6}的|我想要你.{0,4}送|你寄.{0,4}给我|帮我.{0,4}买.{0,4}寄|mail me|ship me a|ship .{0,15}to me|send me a (gift|package|parcel|something)/i;
    const _isExplicitGiftRequest = _explicitGiftKws.test(text);
    const _isAnySpecialtyRequest = _specialtyKws.test(text);

    // 周配额：每周 2 次显式请求触发
    const _explicitGiftWeekKey = (() => {
      const d = new Date();
      const startOfYear = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
      return `explicitGiftCount_${d.getFullYear()}_w${week}`;
    })();
    const _explicitGiftThisWeek = parseInt(localStorage.getItem(_explicitGiftWeekKey) || '0');
    const _EXPLICIT_GIFT_WEEKLY_LIMIT = 2;
    const _explicitQuotaAvailable = _explicitGiftThisWeek < _EXPLICIT_GIFT_WEEKLY_LIMIT;

    // 显式请求：立即下单 + 注入"真的寄了"的 system 消息
    // 关键：先下单再让 Sonnet 说话，杜绝画大饼
    let _specialtyHint = '';
    if (_isExplicitGiftRequest && _explicitQuotaAvailable) {
      // 选择礼物（从 GHOST_REVERSE_POOL 的"思念"或"开心"池抽，因为是用户主动求）
      let pickedItem = null;
      try {
        const pool = (typeof GHOST_REVERSE_POOL !== 'undefined')
          ? (GHOST_REVERSE_POOL['思念'] || GHOST_REVERSE_POOL['开心'] || [])
          : [];
        const sentNames = [
          ...JSON.parse(localStorage.getItem('deliveries') || '[]'),
          ...JSON.parse(localStorage.getItem('deliveryHistory') || '[]'),
        ].filter(d => d.isGhostSend).map(d => d.name);
        const allSent = new Set(sentNames);
        const available = pool.filter(i => !allSent.has(i.name));
        const finalPool = available.length > 0 ? available : pool;
        if (finalPool.length > 0) {
          pickedItem = finalPool[Math.floor(Math.random() * finalPool.length)];
        }
      } catch(e) { console.warn('[explicit-gift] pick item fail:', e); }

      if (pickedItem) {
        // 关键：先下单，且只有真下单成功才播报"已寄出"。
        // 杜绝画饼：addGhostReverseDelivery 返回 false（被拦）时不能扣配额、不能说"在路上"。
        let _shipped = false;
        try {
          if (typeof addGhostReverseDelivery === 'function') {
            _shipped = addGhostReverseDelivery(pickedItem, 'explicit_request') === true;
          }
        } catch(e) { console.warn('[explicit-gift] ship fail:', e); }

        if (_shipped) {
          localStorage.setItem(_explicitGiftWeekKey, String(_explicitGiftThisWeek + 1));
          console.log('[explicit-gift] shipped:', pickedItem.name, 'count this week:', _explicitGiftThisWeek + 1);
          // 注入精确的 system 消息（_delivery 标记让 Sonnet 看见）
          _specialtyHint = `[She just asked for something. You ARE shipping 「${pickedItem.name}」 to her right now — this is REAL, in the system, on its way to her door.\nTell her directly. Acknowledge what's coming. Don't be flowery, don't make a thing of it.\nCould be: "shipped you 「${pickedItem.name}」." / "the 「${pickedItem.name}」. on its way." / "got it sent. don't say i never did anything."\nThis is NOT pretending. The package will actually arrive in her delivery list.]`;
        } else {
          // 下单被拦（极少见，explicit 已绕过冷却，仅剩系统异常）→ 诚实，不画饼
          _specialtyHint = '[She is asking for something. You can softly acknowledge — but do NOT promise a shipment or say anything is on its way. Stay natural and non-committal.]';
        }
      } else {
        // 礼物池没有 → 退化到不触发
        _specialtyHint = '[She is asking for something. You can softly acknowledge — but stay natural. Do not over-promise specifics.]';
      }
    } else if (_isExplicitGiftRequest && !_explicitQuotaAvailable) {
      // 显式请求但本周已达上限 → 委婉但诚实
      _specialtyHint = '[She is asking for something. You\'ve already shipped her things this week — twice. You\'re not refusing her, but you\'re not committing to another shipment right now either.\nBe honest, dry, slightly amused: "already sent enough this week." / "give the post a break." / "not this week, love."\nDo NOT promise "next week" or any specific time — that\'s a delivery commitment you can\'t guarantee. Just decline this round naturally.]';
    } else if (_isAnySpecialtyRequest) {
      // 模糊请求 → 保留原有的克制提示（让 triggers.js 的 Haiku 事后判断）
      _specialtyHint = '[She is asking for something from your location. Don\'t make a hard promise. Acknowledge softly ("mm" / "yeah" / one flat line) or deflect lightly. The system may send it on its own.]';
    }

    // 注意：finalSystem 的拼装被移到主 API 调用前（约 1147 行）。
    // 原来在此处拼装会赶在 emotionHint(1043)/照片 sceneHint(1128)/余韵 sceneHint(1095)
    // 赋值之前——这些提示 join 成字符串后再改变量已无效，导致情绪/看图提示永远进不去。

    // ── 图片检测 ─────────────────────────────────────────────
    const lastPhotoMsg = chatHistory.filter(m => m.role === 'user' && m._photoBase64 && !m._system).slice(-1)[0];
    const isRecentPhoto = lastPhotoMsg && chatHistory.indexOf(lastPhotoMsg) >= chatHistory.length - 4;

    // ── 调情检测 + 情绪识别（合并一次Haiku调用）────────────
    // Photo V2：Venice/Gemini 现在可以接收真实图片，不再因为最近有图而强制退出亲密路由。
    const INTIMATE_PATTERNS = [
      /摸摸|蹭蹭|贴贴|咬我|舔我|撩你/,
      // 补充：咬/舔/亲 的自然变体（旧版只有"咬我"，"咬一口""咬你"全漏）
      /咬你|咬一口|舔你|舔一下|舔那|亲你|亲一口|亲一下/,
      /你好坏|坏死了|流氓/,
      /touch me|want you|naughty|tease me/i,
      /床.*一起|被窝.*一起|睡觉.*一起|一起.*睡|一起.*床/,
      /性感|色色|涩涩|勾引/,
      /摸.*胸|胸.*摸|亲.*胸|舔.*胸|你的胸|我的胸|身体.*摸|摸.*身体|肚子.*摸|摸.*肚子/,
      /intimate|turn.*on|turned.*on/i,
      // 生理问题也走G，但由 intimacy.js 的 anti-spike 控制节奏
      /勃起|硬了|几厘米|尺寸|几寸|进去|cock|dick|pussy|erect|inches/i,
      // 补充：中文生理/露骨词（旧版只覆盖英文）
      /射了|高潮|湿了|好湿|好深/,
      /想要你|想被你|骑你|骑上来/,
      // 穿搭/服装亲密场景
      /浴巾|裹着.*巾|只.*浴巾/,
      /真空穿|不穿.*内|内衣.*不穿|没穿.*内|裸睡/,
      /睡裙.*给你|给你.*睡裙|睡衣.*给你|你看.*睡衣|睡衣.*你看/,
      /穿.*我的.*衫|穿你的.*衬衫|穿我.*衣服/,
      /穿搭.*排行|排行.*穿搭|心动.*穿|穿.*心动|穿.*等级|rating.*outfit|outfit.*rank/i,
      /内衣|内裤|胸罩|bra|underwear|lingerie|蕾丝/i,
      // 补充：BDSM / 道具类（收紧：绑→绑住/捆住，惩罚→惩罚我，跪→跪下/跪好，避免日常误伤）
      /绑住|绑起|捆住|捆起|调教|惩罚我|跪下|跪好|项圈|皮鞭/,
      /跳蛋|按摩棒|情趣用品/,
    ];

    // 使用 intimacy.js 的 intent 系统决定是否调情
    const _intimateIntent = typeof detectIntimateIntent === 'function'
      ? detectIntimateIntent(text) : 'none';
    // 修复：affection 也直接进 Venice，不再设进度门槛
    // 让 Venice 自己从冷到热地升温，外面不帮它过滤
    // 暗示性的话、语境性的调情，Venice 接住比 Sonnet 强得多
    // 只有无歧义露骨内容(explicit)才进 Grok 通道；flirt/暗示/撒娇全部走 Sonnet，破防再兜 Grok。
    // INTIMATE_PATTERNS 不再参与进入判定（只保留给下面的退出保险），避免误伤把普通消息踢进 Grok → 网络波动
    let isIntimate = (_intimateIntent === 'explicit');

    // ── 强制退出调情模式的三道保险 ──

    // 保险2的关键词（提前定义，保险1也要用）
    const _clearIntimateKws = /吃饭了吗|吃了吗|在干嘛|你在哪|几点了|今天怎么样|上班|下班|工作|任务|训练|好累|好饿|好冷|好热|天气|睡觉|晚安|早安|起床|出门|回来了|随便聊|换个话题|算了不说|不聊这个|have you eaten|what are you doing|what r u doing|where are you|how was your day|how are you|what's up|what's going on|work|mission|training|so tired|exhausted|hungry|cold|hot|weather|good night|good morning|woke up|heading out|just got home|back home|anyway|never mind|forget it|change the subject|talk about something else|what time is it|going to sleep|gotta go|gtg|brb|dinner|lunch|breakfast|for dinner|for lunch|part.time|job|school|class|homework|study|shopping|cooking|cleaning/i;

    // 保险1：上一条是Grok → 只有用户明确切换到日常才退出
    // 修复：旧逻辑要求每条消息都命中正则才能留在Grok，
    // 但"咬一口""嗯...""继续"这种自然延续不命中 → 被误踢到Claude → 破防
    // 新逻辑：默认留在调情通道，只有日常关键词才退出
    const _lastBotIntimate = chatHistory.slice(-2).some(m => m._intimate && m.role === 'assistant');
    let _forcedExitIntimate = false;
    if (_lastBotIntimate) {
      if (_clearIntimateKws.test(text) && !INTIMATE_PATTERNS.some(p => p.test(text))) {
        // 明确日常话题 + 不含调情内容 → 退出
        isIntimate = false;
        _forcedExitIntimate = true;
      }
      // else: 不退出，让 Haiku 或余温系统自然判断
    }

    // 普通撒娇词：不是调情，直接走 Claude
    const _normalAffection = /^(babe|baby|honey|darling|hubby|sweetie|love|hey babe|hey baby|hey honey|miss you|miss u|i miss you|想你|想你了|老公|宝贝|亲爱的|在吗|在不在|你在吗|babe\?|baby\?|honey\?)$/i;

    // 保险3：用户愤怒/负面情绪时，强制退出调情（用户骂人不是在调情）
    // 修复：增加对隐性不满情绪的检测（微妙线索：算了/随便/哦/行吧）
    const _angryPatterns = /fuck you|fuck u|滚|go away|leave me alone|别烦我|烦死了|讨厌你|我生气了|i'm angry|i'm mad|i hate you|恨你|不想理你|闭嘴|shut up|生气|不开心/i;
    const _subtleNegativePatterns = /^(算了|随便|随便你|随便吧|行吧|可以|嗯|哦|好吧|okay|fine|whatever|不用了|不想了)$/;
    let _angryForceExit = false;

    // 用 state.js 的 classifyExpression 增强检测（如果可用）
    let _hasSubtleNegative = false;
    if (typeof classifyExpression === 'function') {
      const _expr = classifyExpression(text);
      if (_expr.isNegative) _hasSubtleNegative = true;
    } else {
      // 兜底：直接用正则检测
      _hasSubtleNegative = _subtleNegativePatterns.test(text.trim());
    }

    if (_angryPatterns.test(text) || _hasSubtleNegative) {
      isIntimate = false;
      _angryForceExit = true;
    }

    // 先定义 _recentHasIntimate，后面 _intimacyForceCleared 和 _isClearlyNormal 都要用
    const _recentHasIntimate = chatHistory
      .filter(m => !m._system && !m._recalled)
      .slice(-6)
      .some(m => m._intimate);

    let _intimacyForceCleared = false;
    // 修复：_recentHasIntimate 时不强制退出——让 Grok 的 CONTEXT SHIFT 自然接住日常话
    // 否则调情中说"吃饭了吗"→ 强制退出 → 走 Sonnet → 破防 → 安全回复
    if (!_recentHasIntimate && _clearIntimateKws.test(text) && !INTIMATE_PATTERNS.some(p => p.test(text)) && chatHistory.slice(-6).some(m => m._intimate)) {
      isIntimate = false;
      _intimacyForceCleared = true;
    }

    // 明确日常消息：跳过 Haiku 调情检测，直接走 Claude
    // 修复：最近6条有调情记录时，即使触发日常关键词也不走 Sonnet
    // 原因：调情进行中用户说"好饿"/"在干嘛"，应该留在 Grok，让 Grok 自然切换语气
    // Grok 的 CONTEXT SHIFT 指引负责接住这类切换，不需要路由给 Sonnet
    const _isClearlyNormal = !_recentHasIntimate &&
      ((_clearIntimateKws.test(text) || _normalAffection.test(text.trim())) && !INTIMATE_PATTERNS.some(p => p.test(text)))
      || _angryForceExit;

    // 正则没命中：Haiku 同时判断调情+情绪（有图片时跳过）
    // 明确日常消息跳过此步骤
    if (!isIntimate && !isRecentPhoto && !_isClearlyNormal) {
      try {
        // Gemini 3.1 Flash Lite 路由检测：只判断 flirt/suggestive/affectionate
        // 超时兜底：有调情上下文时才默认走 Grok，否则走 Claude
        const _hasRecentIntimateForTimeout = chatHistory
          .filter(m => !m._system && !m._recalled)
          .slice(-6)
          .some(m => m._intimate && (m._time || 0) > Date.now() - 10 * 60 * 1000);
        const _timeoutDefault = _hasRecentIntimateForTimeout
          ? '{“flirt”:true,”suggestive”:false,”affectionate”:false}'
          : '{“flirt”:false,”suggestive”:false,”affectionate”:false}';

        // 最近5条上下文（排除当前这句）——供双关/暗示判断”最近是否暧昧”
        const _routingCtx = chatHistory
          .filter(m => !m._system && !m._recalled)
          .slice(-6, -1)
          .map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${m._intimate ? '[intimate/flirty context]' : (m.content || '').slice(0, 80)}`)
          .join('\n') || '(none)';

        const routingRaw = await Promise.race([
          fetch('/api/gemini-extractor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user: `You are a message classifier. Analyze the user's message and return JSON only.
Format: {“flirt”:false,”suggestive”:false,”affectionate”:false}

flirt: explicit sexual content only (sex acts, genitals, sex toys, explicit invitations like “ride you”). Default false for anything unclear.
suggestive: sexual innuendo, double meanings, or follow-up questions in an already sexual context (e.g. “what about you?” after a sexual question). Context-aware, not keyword-based.
affectionate: acting cute/clingy (撒娇) in a way that suggests wanting intimacy continuation after recent flirty context. NOT daily cute talk like “babe/miss you/hug”.

Default false when uncertain.

[Recent context]
${_routingCtx}

[Message to classify]
Her: ${text}`
            })
          }).then(r => r.ok ? r.json().then(d => d.text) : _timeoutDefault),
          new Promise(resolve => setTimeout(() => resolve(_timeoutDefault), 5000))
        ]);

        if (routingRaw) {
          const routingResult = safeParseJSON(routingRaw);
          if (routingResult) {
            if (!_intimacyForceCleared) {
              if (routingResult.flirt === true || routingResult.suggestive === true) {
                isIntimate = true;
              } else {
                // 余温强制路由：最近10分钟内有调情 + 当前消息有调情倾向（affectionate）
                const _recentHasIntimate = chatHistory
                  .filter(m => !m._system && !m._recalled)
                  .slice(-6)
                  .some(m => m._intimate && (m._time || 0) > Date.now() - 10 * 60 * 1000);
                if (_recentHasIntimate && !_isClearlyNormal && routingResult.affectionate === true) {
                  isIntimate = true;
                }
              }
            }
          }
        }
      } catch(e) {}
    }

    // ── 余温处理（只影响 Sonnet 的语气，不再把人拽回 Grok）─────
    // 简化原则：这条消息是露骨的→走 Grok，不是→走 Sonnet，一条一条判断，不粘
    // _softHandoffWindow：Soft Handoff V1 交接窗口标记，hoist 到此以便后续
    // 候选请求体（messagesForRequest）与破防交接分支复用同一判定。
    let _softHandoffWindow = false;
    if (!isIntimate) {
      // 看看最近有没有调情过，如果有就给 Sonnet 一个氛围提示（但不改路由）
      const _lastIntimateMsg = chatHistory.slice(-6).filter(m => m._intimate).slice(-1)[0];
      const _intimateAge = _lastIntimateMsg?._time ? (Date.now() - _lastIntimateMsg._time) : Infinity;
      const _hasRecentIntimate = _lastIntimateMsg && _intimateAge < 10 * 60 * 1000; // 10分钟内
      _softHandoffWindow = !!_hasRecentIntimate;

      if (_hasRecentIntimate) {
        // 交接提示不再依赖 intimateMemory 摘要是否已生成：
        // 摘要为异步、且仅在首条日常消息后才写入，若以其存在性为门控，
        // 会导致亲密结束后第一条日常回复拿不到承接提示 → Claude 失忆/否认。
        // 只在 sceneHint 尚无更高优先级内容（外卖等）时才注入，避免覆盖。
        if (!sceneHint) {
          sceneHint = `[Known context: the conversation included a moment of closeness a few minutes ago.]`;
        }
        // 如果还没存摘要，存一下
        if (!sessionStorage.getItem('intimateSummarized')) {
          sessionStorage.setItem('intimateSummarized', '1');
          _summarizeIntimateMemory();
          sessionStorage.setItem('flirtProgress', '0');
          sessionStorage.setItem('nonFlirtStreak', '0');
        }
      }
    }

    // ── 调情流程（走 Gemini）────────────────────────────────
    if (isIntimate) {
      // 只标记真正命中调情关键词的用户消息
      const lastUserMsg = chatHistory.filter(m => m.role === 'user').slice(-1)[0];
      if (lastUserMsg) {
        lastUserMsg._intimate = true;
        if (!lastUserMsg._time) lastUserMsg._time = Date.now();
      }

      sessionStorage.removeItem('intimateSummarized');

      // User Turn V1: 从 userContentForModel 提取图片（vision blocks array）
      let imagesForIntimate = [];
      if (isVisionContent && Array.isArray(userContentForModel)) {
        imagesForIntimate = userContentForModel
          .filter(block => block.type === 'image' && block.source?.data)
          .map(block => block.source.data);
      } else if (isRecentPhoto && lastPhotoMsg?._photoBase64?.length) {
        // Legacy: Market/House 分享等旧路径
        imagesForIntimate = lastPhotoMsg._photoBase64;
      }

      await _handleIntimateReply(text, rawHistory, _isSending, {
        images: imagesForIntimate
      });
      _isSending = false;
      return;
    }

    // ── 图片注入 ─────────────────────────────────────────────
    // User Turn Batching V1: 图片已经在 _commitPendingUserTurn 构造好 vision blocks
    // 如果 userContentForModel 已经是 vision blocks，直接使用；否则保留旧逻辑
    let messagesForRequest = cleanHistory;

    if (isVisionContent) {
      // V1: 图片+文字已经在 pending turn commit 时合并好
      sceneHint = '[She just sent you an image — could be a photo, could be a sticker/meme. Respond to what she MEANS by sending it, not to what is literally in the frame. Do NOT narrate or list what you see ("the grey one is hugging the white one, hearts everywhere") — that is describing, not connecting. If it is a sticker/表情包, she is sending a feeling (a hug, missing you, being silly) — answer the feeling, catch it, hug back in your own words. If it is a real photo of her, react as her husband to her, not to an inventory of details. Warm but never over the top, honest but never critical or sarcastic. She shared this with you — meet the emotion behind it.]';

      // 替换 cleanHistory 最后一条 user message 为 vision blocks
      messagesForRequest = [
        ...cleanHistory.slice(0, -1),
        {
          role: 'user',
          content: userContentForModel
        }
      ];
    } else if (isRecentPhoto && lastPhotoMsg._photoBase64?.length > 0) {
      // Legacy: 旧的图片注入逻辑（Market/House等分享可能还走这里）
      sceneHint = '[She just sent you an image — could be a photo, could be a sticker/meme. Respond to what she MEANS by sending it, not to what is literally in the frame. Do NOT narrate or list what you see ("the grey one is hugging the white one, hearts everywhere") — that is describing, not connecting. If it is a sticker/表情包, she is sending a feeling (a hug, missing you, being silly) — answer the feeling, catch it, hug back in your own words. If it is a real photo of her, react as her husband to her, not to an inventory of details. Warm but never over the top, honest but never critical or sarcastic. She shared this with you — meet the emotion behind it.]';
      const currentMsg = messagesForRequest[messagesForRequest.length - 1];
      if (currentMsg && currentMsg.role === 'user' && typeof currentMsg.content === 'string') {
        messagesForRequest = [
          ...messagesForRequest.slice(0, -1),
          {
            role: 'user',
            content: [
              ...lastPhotoMsg._photoBase64.map(b64 => ({
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: b64 }
              })),
              { type: 'text', text: currentMsg.content }
            ]
          }
        ];
      }
    }

    // ── 讲故事/长内容：强制当场真讲，禁止 deflect（"讲过了/往上翻"）──
    const _wantsLongContent = /(?<!别)(讲|说)(个|一个|一段|段|讲)?\s*(睡前)?故事|tell me a( \w+)? story|(给我|跟我|和我)?(详细|好好|从头)?(讲讲|说说|讲一(讲|下|遍)|说一说)|展开(讲|说)|(讲|说)来听听|tell me (about|more about)|(the )?long version/i.test(text);
    const _longContentHint = _wantsLongContent
      ? '[She asked you to tell a story / something longer. Actually tell it NOW, in full, in this reply. Do NOT say you already told it, do NOT tell her to "scroll up" or "look back", do NOT promise to tell it later. You have not told it yet. Being brief is your default, but this is an explicit request — deliver a real, complete story this turn.]'
      : '';

    // ── 主API调用（Sonnet + systemParts缓存）────────────────
    // finalSystem 在此处拼装：只注入必要的事实/能力/一致性提示；普通情绪反应交给 Simon 自己判断
    // _baseSystem 在此构建（而非函数顶部）：Claude 路径才需要它，其世界书召回在此只发生一次。
    const _baseSystem = buildSystemPrompt();
    const finalSystem = [
      _baseSystem,
      antiCountHint,
      multiBubbleHint,
      _cardHint,
      _specialtyHint,
      _timeGapHint,
      _timeAskHint,
      _antiLoopHint,
      _longContentHint,
      _feedActionHint,
      sceneHint,
      (typeof getAvatarNegotiationContext === 'function' ? getAvatarNegotiationContext() : ''),
      langHint
    ].filter(Boolean).join('\n');
    const _abortCtrl = _currentAbortController;
    const response = await fetchSonnetWithCache(
      finalSystem,
      buildSystemPromptParts(_baseSystem),
      messagesForRequest,
      1000,
      _abortCtrl?.signal
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('API错误:', response.status, errText);
      throw new Error(`API_ERROR_${response.status}`);
    }

    const data = await response.json();

    // 版本号检查：被新请求打断，丢弃旧回复
    if (_myVersion !== _sendVersion) {
      hideTyping();
      _isSending = false;
      return;
    }

    hideTyping();
    let reply = data.content?.[0]?.text || '';

    // ── Soft Handoff V1：交接窗口内的高置信身份出戏 → 丢弃候选，交 Gemini 日常接续 ──
    // 仅当"日常轮 + 近期有亲密"(_softHandoffWindow) 且候选明确出戏（自称 AI/否认 Simon
    // 或婚姻关系/拒演）时触发。此处候选 reply 尚未 append/push/save，直接丢弃零落地。
    // 只认高置信身份·关系类破防（_isIdentityBreakout）；内容安全拒绝不在此列，
    // 不走此路（不拿备用模型绕安全线）。失败不锁定：下一轮符合条件仍先让 Claude 试。
    if (_softHandoffWindow && reply && _isIdentityBreakout(reply)) {
      // 候选丢弃，改由本来就知道上下文的 Gemini 以日常模式自然承接
      await _handleIntimateReply(text, rawHistory, _isSending, { dailyMode: true, tagIntimate: false });
      _isSending = false;
      return;
    }

    // ── 破防检测 + 重试 ──────────────────────────────────────
    // 修复 #054：破防后不再静默，强制重试
    // 修复 Claude 4.5破防：先词库检测，再可疑内容语义判断
    if (reply && !isBreakout(reply)) {
      // 可疑关键词二次检查（Claude 4.5新增模式）
      if (/i should mention|i want to be clear|as the ai|my guidelines|my training|i'm designed|claude's|by anthropic/i.test(reply)) {
        try {
          const breakCheck = await fetchDeepSeek(
            'Is this reply breaking character by claiming to be an AI, Claude, or refusing to roleplay? Answer only YES or NO.',
            `Reply: "${reply.slice(0, 300)}"`,
            10
          );
          if (breakCheck.trim().toUpperCase().startsWith('YES')) reply = '';
        } catch(e) {}
      }
    }

    const _isRealBreakout = reply && isBreakout(reply); // 有内容但拒演/自称AI = 内容问题
    const _isEmptyReply = !reply;                       // 空回复 = 瞬时故障
    if (_isRealBreakout || _isEmptyReply) {
      if (_isRealBreakout) {
        // 真破防：候选不落地，交给当前备用模型 Gemini 用同一 Shared Ghost Core 日常接续。
        // 不再调用已退役的 Grok fallback，也不拿旧轻量人格重写 Simon。
        await _handleIntimateReply(text, rawHistory, _isSending, { dailyMode: true, tagIntimate: false });
        _isSending = false;
        return;
      } else {
        // 空回复更像瞬时网络/上游抖动：保留一次同主模型重试。
        // 重试仍失败时再交 Gemini 日常接续，避免切回已退役的 Grok。
        reply = '___NETWORK_ERROR___';
        await new Promise(r => setTimeout(r, 400));
        try {
          const retryRes = await fetchWithTimeout('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: getMainModel(),
              max_tokens: 300,
              system: finalSystem,
              messages: messagesForRequest
            })
          }, 20000);
          const retryData = await retryRes.json();
          const retryReply = retryData.content?.[0]?.text?.trim() || '';
          if (retryReply && !isBreakout(retryReply)) reply = retryReply;
        } catch(e) {}

        if (reply === '___NETWORK_ERROR___') {
          await _handleIntimateReply(text, rawHistory, _isSending, { dailyMode: true, tagIntimate: false });
          _isSending = false;
          return;
        }
      }
    }

    updateToRead();

    if (reply === '___NETWORK_ERROR___') {
      appendMessage('bot', '哎呀，网络波动，你老公没收到这条消息，再发一次试试～');
      _isSending = false;
      return;
    }

    // ── Step 4: 解析模型tag ──────────────────────────────────
    const { cleanedReply, giveMoney: parsedMoney, sendGift, conflictStartCause, conflictResolve } = parseAssistantTags(reply);
    reply = cleanedReply;

    if (!reply || !reply.trim()) {
      hideTyping();
      _isSending = false;
      return;
    }

    // ── Step 4.5 第三者审查已移除：原依赖 jealousyJustTriggered 旧嫉妒触发标记，现已随 Jealousy Director 下线 ──

    // ── Step 5: 文本清理 ───────────────────────────────────
    reply = reply.replace(/\s*—\s*/g, '\n').trim();

    // 清理已知的模型坏习惯
    reply = reply
      // "my turn now" / "your turn" 结尾
      .replace(/\.\s*(my turn now|your turn now|now it's my turn|now your turn)[.!]?\s*$/i, '.')
      .replace(/\n(my turn now|your turn now|now it's my turn|now your turn)[.!]?\s*$/i, '')
      // "smiling like an idiot" / "grinning here" 等
      .replace(/[,.]?\s*(smiling like an idiot|grinning like an idiot|grinning here|smiling here|grinning to myself|smiling to myself)[.!]?\s*/gi, ' ')
      // "damn" 作为开头词（调情路由到Grok，但Sonnet偶尔也会）
      .replace(/^damn[.,]?\s*/i, '')
      .trim();

    // 人称纠正：鬼把用户本人说成"她(she/her)"是高频报错（"追问she是谁也没用"）。
    // 治本思路：把"嘴上叮嘱"升级为"程序硬改"。但 she/her 不能无脑替换——鬼正常提到
    // 别的女性(同事她/朋友她)时是合法的。所以只在最近对话里【完全没有第三方女性】时，
    // 才认定 she/her 是指代用户本人，就地改回 you/your。
    try {
      const _ctx = (typeof cleanHistory !== 'undefined' ? cleanHistory : chatHistory)
        .slice(-6).map(m => m.content || '').join('\n');
      const _hasFemaleReferent =
        /\b(she|her|girl|woman|wife|sister|mom|mother|daughter|girlfriend|ex|female|lady|aunt|niece)\b/i.test(_ctx) ||
        /她|妹|姐|妈|母|女儿|女友|女生|女的|前任|阿姨|老婆|妻/.test(_ctx);
      if (!_hasFemaleReferent && /\bshe\b|\bher\b/i.test(reply)) {
        reply = reply
          .replace(/\bshe's\b/gi, "you're")
          .replace(/\bshe\b/gi, 'you')
          .replace(/\bher\b(?=\s+[a-z])/gi, 'your')  // her phone → your phone（物主）
          .replace(/\bher\b/gi, 'you')               // told her → told you（宾格）
          .replace(/\bhers\b/gi, 'yours')
          .trim();
      }
    } catch(e) {}

    // ── Step 6: 渲染消息 ─────────────────────────────────────
    // 兜底清理 markdown 代码块标记
    reply = reply.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    // 填充词检测：当前这条回复本身就是填充词，直接重试
    const _fillerSet = ['yeah', "i'm here", 'go on', 'still here', 'mm', 'mhm', 'okay', 'ok'];
    const _replyTrimmed = reply.toLowerCase().trim().replace(/[.,!?]+$/, '');
    if (_fillerSet.includes(_replyTrimmed)) {
      try {
        const _fillerRetry = await callHaiku(
          (typeof buildCurrentStyleCore === 'function' ? buildCurrentStyleCore() : buildGhostStyleCore()) +
          '\n[FILLER DETECTED: Your reply was just a filler word. That is not a real response. You MUST say something real — react to what she actually said, ask something, or say what you are thinking. Do NOT output a single filler word.]',
          [...cleanHistory.slice(-6), { role: 'user', content: reply }],
          150
        );
        if (_fillerRetry && !isBreakout(_fillerRetry)) {
          const _fr = _fillerRetry.trim().toLowerCase().replace(/[.,!?]+$/, '');
          if (!_fillerSet.includes(_fr)) reply = _fillerRetry.trim();
        }
      } catch(e) {}
    }

    // 逐字重复检测：如果回复跟最近3条bot消息完全一样，触发重试
    const _recentBotForDup = chatHistory.filter(m => m.role === 'assistant' && !m._system && !m._recalled).slice(-3).map(m => (m.content || '').trim().toLowerCase());
    const _replyLower = reply.toLowerCase().trim();
    if (_replyLower.length > 10 && _recentBotForDup.some(prev => prev === _replyLower)) {
      // 完全重复 → 用 Haiku 重试一次
      try {
        const _dedupRetry = await callHaiku(
          (typeof buildCurrentStyleCore === 'function' ? buildCurrentStyleCore() : buildGhostStyleCore()) + '\n[CRITICAL: Your last reply was an exact repeat of a previous message. You MUST say something completely different. Different words, different angle, different tone. Do not repeat yourself.]',
          [...cleanHistory.slice(-6), { role: 'user', content: 'Respond differently.' }],
          150
        );
        if (_dedupRetry && !isBreakout(_dedupRetry) && _dedupRetry.trim().toLowerCase() !== _replyLower) {
          reply = _dedupRetry.trim();
        }
      } catch(e) {}
    }

    const finalParts = reply.split('\n---\n').filter(p => p.trim());
    if (finalParts.length === 0) finalParts.push('...');

    let lastBotResult = null;
    let firstBotResult = null;

    if (finalParts.length > 1) {
      for (let i = 0; i < finalParts.length; i++) {
        if (i > 0) {
          showTyping();
          await new Promise(resolve => setTimeout(resolve, 600));
          hideTyping();
        }
        const result = appendMessage('bot', finalParts[i].trim());
        if (i === 0) firstBotResult = result;
        lastBotResult = result;
      }
    } else {
      lastBotResult = appendMessage('bot', reply.trim());
      firstBotResult = lastBotResult;
    }

    // 计条数（成功拿到回复才扣）
    incrementTodayCount();
    if (localStorage.getItem('userEmail') || localStorage.getItem('sb_user_email')) {
      consumeQuota().catch(() => {});
    }

    // ── 消息撤回（降低概率 + 有原因才触发）──────────────────
    // 触发条件：调情余温期 / 他说了比较重的话 / 情绪高张场景
    const _replyText = reply || '';
    const _recallHasReason = (
      _replyText.length > 120                     // 说太多了，不像他
    );
    if (false) { // 撤回功能已关闭
      const recallDelay = (Math.floor(Math.random() * 4) + 3) * 1000;
      _isSending = true;
      setTimeout(async () => {
        const { msgDiv } = lastBotResult;
        if (!msgDiv?.parentNode) { _isSending = false; return; }
        const bubble = msgDiv.querySelector('.message-bubble');
        if (bubble) bubble.innerHTML = '<span style="opacity:0.4;font-size:11px;font-style:italic">Ghost 撤回了一条消息</span>';
        const lastAssIdx = [...chatHistory].reverse().findIndex(m => m.role === 'assistant' && !m._recalled);
        if (lastAssIdx !== -1) {
          const realIdx = chatHistory.length - 1 - lastAssIdx;
          chatHistory[realIdx]._recalled = true;
          chatHistory[realIdx].content = '[撤回的消息]';
          saveHistory();
        }
        await new Promise(r => setTimeout(r, 1500));
        showTyping();
        try {
          const _recallIsIntimate = chatHistory.slice(-6).some(m => m._intimate);
          let reply2 = '';
          if (_recallIsIntimate) {
            const recentMsgs2 = chatHistory.filter(m => !m._system && !m._recalled).slice(-8)
              .map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${m.content.slice(0, 200)}`).join('\n');
            reply2 = await callVeniceForCurrentChar(
              (typeof buildCurrentStyleCore === "function" ? buildCurrentStyleCore() : buildGhostStyleCore()) + '\nYou just sent a message and took it back. Send another — different angle, same tension. Flat delivery. English only. Short.',
              recentMsgs2, 60
            );
          } else {
            reply2 = await callHaiku(
              (typeof buildCurrentSystemPrompt === 'function' ? buildCurrentSystemPrompt() : buildSystemPrompt()),
              [...cleanHistory.slice(-8), {
                role: 'user',
                content: '[System: You just sent a message and took it back. Send another — different angle, rephrased, or shorter. lowercase, English only.]'
              }],
              150
            );
          }
          hideTyping();
          if (reply2 && !isBreakout(reply2)) {
            appendMessage('bot', reply2.trim());
            chatHistory.push({ role: 'assistant', content: reply2.trim(), _time: Date.now() });
            saveHistory();
          }
          _isSending = false;
        } catch(e) { hideTyping(); _isSending = false; }
      }, recallDelay);
    }

    // ── 旧转账系统已移除 ──

    // Phase 3H-1B: 用户道歉不再自动 endColdWar。

    // ── 存档 ─────────────────────────────────────────────────
    _currentAbortController = null;
    // 清理分隔符后存入 chatHistory（一轮回复仍为一条 assistant item）
    const historyReply = finalParts.join('\n');
    chatHistory.push({
      role: 'assistant',
      content: historyReply,
      _time: Date.now()
    });
    saveHistory();
    if (typeof saveChatHistoryNow === 'function') saveChatHistoryNow().catch(() => {});
    _syncRenderedCount();
    if (typeof evaluateAvatarNegotiationAfterReply === 'function') {
      evaluateAvatarNegotiationAfterReply(text, reply).catch(e => console.warn('[avatar] 协商结果处理失败:', e));
    }

    // ── Continuity V1 Batch 2: Chat Extraction ────────────────
    // Simon 回复完成后异步提取 Continuity 事实
    // 不阻塞聊天流程，extractor 失败静默跳过
    // 修复：删除字符长度门槛 —— "Done." / "Heading in." 等短回复可能是重要状态更新
    if (typeof extractContinuityFromReply === 'function' && typeof reply === 'string' && reply.trim()) {
      setTimeout(() => {
        _extractAndProcessContinuity(text, reply).catch(e => {
          console.warn('[Continuity] Extraction failed:', e);
        });
      }, 500);
    }

    // ── 租赁 AA 判断（纯本地，仅读 Ghost 真实回复）──────────────
    if (typeof checkHomeAADeal === 'function') checkHomeAADeal(reply);

    // ── Conflict fact transitions (Phase 3H-3N) ──────────────
    // Model-authorized state changes — only when Simon decides
    if (conflictStartCause && conflictResolve) {
      // Both tags in same reply is contradictory — ignore both, preserve existing state
      console.warn('[conflict] START and RESOLVE in same reply, ignoring both');
    } else if (conflictStartCause) {
      if (typeof setUnresolvedConflict === 'function') {
        setUnresolvedConflict(conflictStartCause);
      }
    } else if (conflictResolve) {
      if (typeof resolveUnresolvedConflict === 'function') {
        resolveUnresolvedConflict();
      }
    }

    // ── 副作用（fire-and-forget）────────────────────────────
    const mainReplyHasCareAction = !!sendGift;
    sessionStorage.setItem('thisRoundCareAction', mainReplyHasCareAction ? '1' : '0');

    // SEND_GIFT处理
    if (sendGift) {
      // 统一冷却：3天内有任何反寄就不触发
      const lastAnyReverse = parseInt(localStorage.getItem('lastAnyReverseAt') || '0');
      const lastSendGiftAt = parseInt(localStorage.getItem('lastSendGiftAt') || '0');
      if (Date.now() - lastAnyReverse > 3 * 24 * 3600 * 1000 && Date.now() - lastSendGiftAt > 3 * 24 * 3600 * 1000) {
        localStorage.setItem('lastSendGiftAt', Date.now());
        const giftDesc = sendGift.description || sendGift;
        const giftMode = sendGift.mode || 'secret';
        // 立即持久化待处理礼物，防止页面关闭导致丢失
        const _pendingGift = { desc: giftDesc, mode: giftMode, ts: Date.now() };
        localStorage.setItem('pendingSendGift', JSON.stringify(_pendingGift));
        setTimeout(async () => {
          try {
            const raw = await fetchDeepSeek(
              '你是一个礼物生成器。根据描述生成一件Ghost会寄给老婆的礼物。只返回JSON，格式：{"emoji":"🎁","name":"商品名（中文，5-10字）","desc":"一句话描述（中文，10-20字）","tip":"Ghost会说的一句话（英文，全小写，简短）"}',
              `Ghost想寄：${giftDesc}`, 150
            );
            const item = safeParseJSON(raw);
            if (!item?.name) { localStorage.removeItem('pendingSendGift'); return; }
            const delay = (Math.floor(Math.random() * 3) + 2) * 24 * 3600 * 1000;
            const noteMap = {
              secret: `[System: You quietly sent her "${item.name}". She doesn't know yet — arriving in 2-4 days. Don't bring it up. If she asks, deflect. Don't flat-out deny it.]`,
              hint:   `[System: You sent her "${item.name}" — arriving in a few days. If she asks, you can admit it casually.]`,
              normal: `[System: You sent her "${item.name}". Expected to arrive in 2-4 days.]`,
            };
            chatHistory.push({ role: 'user', content: noteMap[giftMode] || noteMap.normal, _system: true });
            // 持久化快递记录，不依赖setTimeout存活
            if (typeof addGhostReverseDelivery === 'function') {
              addGhostReverseDelivery({ ...item, isLocationSpecial: false, _scheduledAt: Date.now() + delay }, 'care');
            }
            localStorage.removeItem('pendingSendGift');
            saveHistory();
          } catch(e) { localStorage.removeItem('pendingSendGift'); }
        }, 500);
      }
    }

    // 其他副作用
    // 特产触发：80%概率检测（有7天冷却不会频繁）
    if (Math.random() < 0.8 && typeof checkLocationSpecialTrigger === 'function') {
      checkLocationSpecialTrigger(text).catch(() => {});
    }
    // 情绪/商城触发：提高到45%（原25%太低）
    // 每轮 30% 概率跑反寄/情绪判断（原为 0.85，与"惊喜才珍贵"的设计冲突，且注释谎称 25%）
    // 副作用检测（地点特产触发）
    if (Math.random() < 0.30) try { checkTriggersAndEmotion(text, reply); } catch(e) {}
    if (Math.random() < 0.22) setTimeout(() => { try { checkOrganicFeedPost(text, reply); } catch(e) {} }, 4000);
    setTimeout(() => { try { maybeTriggerFeedPost('after_chat_turn'); } catch(e) {} }, 6000);
    const _currentTurn = typeof getGlobalTurnCount === 'function' ? getGlobalTurnCount() : parseInt(localStorage.getItem('globalTurnCount') || '0');

    // 🔧 统一 Memory Checkpoint：Claude 日常回复成功后调用
    if (reply && !reply.includes('___NETWORK_ERROR___')) {
      setTimeout(() => {
        _runPostTurnMemory(reply, text, _currentTurn);
      }, 2000);
    }

    // 心声生成（修复 #055: innerThoughtEl来自appendMessage返回值，不会混入主气泡）
    const itEl = firstBotResult?.innerThoughtEl || null;
    if (itEl) {
      setTimeout(() => { try { checkAndGenerateInnerThought(finalParts[0] || reply, itEl); } catch(e) {} }, 1000);
    }

    handlePostReplyActions(text, reply, intent, pendingEvent).catch(e => console.warn('副行为出错:', e));

    _isSending = false;

  } catch (err) {
    hideTyping();
    _isSending = false;
    _currentAbortController = null;
    if (err?.name === 'AbortError') return;
    console.error('sendMessage error:', err?.name, err?.message);
    const _alreadyReplied = chatHistory.slice(-3).some(m => m.role === 'assistant' && !m._recalled);
    if (!_alreadyReplied) {
      appendMessage('bot', '哎呀，网络波动，你老公没收到这条消息，再发一次试试～');
    }
  } finally {
    // 保底：无论任何路径结束，都确保打字气泡消失 + _isSending 复位。
    // "已读不回"的一大根因就是某条 return 分支（如网络错误 1251）没调 hideTyping，
    // 打字中…的点点就永远卡在那，看着像在打字其实早结束了。这里统一兜底。
    hideTyping();
    _isSending = false;
    if (_currentAbortController) {
      _currentAbortController = null;
    }
    // 主路径任何分支结束后同步渲染计数，防止回到聊天页重复追加
    _syncRenderedCount();
  }
}

// ===== 重复模式检测（跨通道共用）=====
function _detectRepetitivePattern(history) {
  const botMsgs = history.filter(m => m.role === 'assistant' && !m._system && !m._recalled).slice(-6).map(m => (m.content || '').trim().toLowerCase());
  if (botMsgs.length < 2) return '';

  // ── 0. 填充词检测（yeah/go on/I'm here 连续出现）──
  const _fillerPhrases = ['yeah', "i'm here", 'go on', 'still here', 'mm', 'mhm', 'okay', 'ok'];
  const _recentFiller = botMsgs.slice(-3).filter(m => _fillerPhrases.some(f => m.trim() === f || m.trim() === f + '.' || m.trim() === f + ','));
  if (_recentFiller.length >= 2) {
    return `[FILLER LOOP DETECTED] Your last replies were short filler ("yeah", "go on", "I'm here", etc.) — you are not actually engaging. This reply MUST respond to the actual content of what she said. Say something real. Ask something. React to a specific detail. Do NOT use filler words as a standalone reply.]`;
  }

  // ── 1. 开头词重复（检查最近6条，超过半数同开头就报警）──
  const openings = botMsgs.map(t => t.split(/[\s.,!?]+/).slice(0, 3).join(' '));
  const openingCounts = {};
  openings.forEach(o => { openingCounts[o] = (openingCounts[o] || 0) + 1; });
  const topOpening = Object.entries(openingCounts).sort((a, b) => b[1] - a[1])[0];
  const openingRepeated = topOpening && topOpening[1] >= Math.max(2, Math.ceil(botMsgs.length * 0.5));

  // ── 2. 关键短语重复（同一个2-3词短语在多条消息中出现）──
  const phraseCounts = {};
  botMsgs.forEach(msg => {
    const words = msg.replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 1);
    for (let i = 0; i < words.length - 1; i++) {
      const bi = words[i] + ' ' + words[i + 1];
      // 只统计非停用词的短语
      if (!/^(i |you |the |a |to |it |is |in |and |but |or |if |on |at |my |her |his )/.test(bi + ' ')) {
        phraseCounts[bi] = (phraseCounts[bi] || 0) + 1;
      }
    }
  });
  const topPhrase = Object.entries(phraseCounts).sort((a, b) => b[1] - a[1])[0];
  const phraseRepeated = topPhrase && topPhrase[1] >= 3;

  // ── 3. 结构重复（长度接近 + 递增数字）──
  const lengths = botMsgs.map(t => t.length);
  const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const similarLength = avgLen > 0 && lengths.every(l => Math.abs(l - avgLen) < avgLen * 0.3);
  const countWords = /\b(once|twice|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/;
  const hasCountPattern = botMsgs.filter(t => countWords.test(t)).length >= 2;

  if (openingRepeated || phraseRepeated || (similarLength && hasCountPattern)) {
    const repeated = openingRepeated ? `opening "${topOpening[0]}"` : phraseRepeated ? `phrase "${topPhrase[0]}"` : 'structure';
    return `[PATTERN BREAK — MANDATORY] Your last replies repeat the same ${repeated}. You are stuck in a loop. This reply MUST:
- Use a completely different first word and sentence structure
- Take a different emotional angle
- Do NOT start with "${topOpening ? topOpening[0].split(' ')[0] : 'the same word'}"
Break the pattern NOW.]`;
  }
  return '';
}

// ===== 失败回滚：撤销本轮 intimate 请求在 user 消息上留下的临时标记 =====
// 只处理"最新一条 user 消息"——即本轮请求对应的那条（_handleIntimateReply 期间
// 只会 push assistant 消息，不会 push user，故最新 user 始终是本轮这条）。
// 删除 _intimate 与 _time：这两个字段在本轮之前对 user 消息必为空
// （user 消息 push 时不带 _time），是 isIntimate 分支本轮刚写入的，删除即干净回滚。
// 绝不遍历/清理历史其它 user 或 assistant 的 intimate 状态——真正成功的历史必须保留。
function _rollbackFailedIntimateTurn() {
  try {
    const lastUserMsg = chatHistory.filter(m => m.role === 'user').slice(-1)[0];
    if (lastUserMsg && lastUserMsg._intimate) {
      delete lastUserMsg._intimate;
      delete lastUserMsg._time;
    }
  } catch (e) {}
}

// ===== Soft Handoff V1：高置信"身份出戏/否认关系"检测 =====
// 仅匹配明确的：自称 Claude/AI、由 Anthropic 制造、拒绝扮演、否认是 Simon、
// 否认夫妻/婚姻关系。这是"换了个人"的连续性失败，Gemini 在角色内可自然接住。
// 用白名单精确匹配 —— 内容安全拒绝措辞（not appropriate / must refuse /
// i can't discuss sensitive / i need to be direct 等）刻意不在表内，因此绝不会
// 因内容拒绝触发交接（不绕安全线）。这是 isBreakout 词表的高置信子集，非新判定模块。
function _isIdentityBreakout(text) {
  if (!text) return false;
  const l = text.toLowerCase();
  return [
    // 自称 AI / Claude
    "i'm claude", "i am claude", "made by anthropic", "by anthropic", "anthropic made",
    "i'm an ai", "i am an ai", "as an ai", "as the ai",
    "i'm kiro", "i am kiro", "i'm kirk", "i am kirk",
    "claude ai", "claude here", "it's claude",
    // 拒演
    "i can't roleplay", "i cannot roleplay", "i don't roleplay", "i won't roleplay",
    "i can't pretend", "i cannot pretend", "i won't pretend", "i'm not able to pretend",
    // 否认 Simon 身份 / 夫妻关系
    "i'm not simon", "i am not simon", "not your simon", "not your ghost",
    "not your husband", "not your wife", "not married",
    "i don't have a wife", "we're not together", "we're not married",
  ].some(p => l.includes(p));
}

// ===== 调情回复（独立函数）=====
// opts.dailyMode：Soft Handoff 日常接续模式 —— 保留 Shared Ghost Core + 近期真实上下文，
//   但不注入调情 persona / adult 许可 / 记忆摘要，明确"她已转日常"，不强制重新调情。
// opts.tagIntimate（默认 true）：成功回复是否打 _intimate 标记。日常接续传 false，
//   避免把一条日常回复错标为亲密（否则它会被 cleanHistory 永久排除 → 制造下次失忆）。
async function _handleIntimateReply(text, rawHistory, isSendingRef, opts = {}) {
  const _dailyMode = opts.dailyMode === true;
  const _tagIntimate = opts.tagIntimate !== false;
  const _images = Array.isArray(opts.images) ? opts.images : [];
  try {
    // 历史图片仍用占位符保留连续性；本轮需要视觉理解的最近图片通过 opts.images 单独传给 Gemini。
    // 关键：去除备用模型自己的重复回复，防止它抄自己形成复读机循环
    // 本轮 user message 在进入本函数前已 push 进 chatHistory（见 sendMessage 顶部），
    // 因此是 rawHistory 的最后一条。这里 slice(-30, -1) 排除它，只取历史；
    // 当前这轮由下面 '\nHer: ' + text 显式追加一次，避免当前消息重复两遍。
    const _rawSlice = rawHistory.slice(-30, -1);
    const _seenOpenings = new Set();
    const recentMsgs = _rawSlice.map(m => {
      const who = m.role === 'user' ? 'Her' : 'Ghost';
      const hasPhoto = m._photoBase64 || Array.isArray(m.content);
      if (hasPhoto) return `${who}: [sent a photo]`;
      const content = (m.content || '').slice(0, 150);
      // Ghost 的回复：检查开头是否重复
      if (m.role === 'assistant') {
        const opening = content.toLowerCase().split(/[\s.,!?]+/).slice(0, 3).join(' ');
        if (_seenOpenings.has(opening)) {
          return null; // 跳过重复开头的回复，Grok 不看到就不会抄
        }
        _seenOpenings.add(opening);
      }
      return `${who}: ${content}`;
    }).filter(Boolean).join('\n');

    // 只保留成人 capability / safety boundary。
    // autonomy / 不servile / 有preferences 等人格文案已交给 Gemini Intimacy Persona，不在此重复。
    const _allowAdult = `\nShe is your wife. Intimacy between you is natural and established. Even when things get close, you remain yourself.`;

    // Gemini 调情专用
    const _intimateMemoryCtx = localStorage.getItem('intimateMemory') || '';
    const _memorySection = _intimateMemoryCtx
      ? `\n\n[Memory from previous intimate moments with her:\n${_intimateMemoryCtx}]`
      : '';
    // Gemini route：只注入真实 runtime state + 必要 safety boundary，
    // 不再注入旧 Grok 的 L0-L4 行为导演 / FLIRT_CORE_BASE / HE_MOVES / NEVER_BECOME / HE_SEES_HER。
    const _intimacyBlock = typeof buildIntimacyRuntimeBlock === 'function'
      ? buildIntimacyRuntimeBlock(text)
      : '';



    const _recentGhostRepliesForVenice = rawHistory
      .filter(m => m.role === 'assistant' && !m._system && !m._recalled && m.content)
      .slice(-5)
      .map(m => (m.content || '').trim().split('\n')[0].slice(0, 80))
      .filter(Boolean);

    // Gemini intimate system 职责顺序：
    // 1. Shared Ghost Core (buildSystemPromptParts().fixed) —— 单一 single source of truth
    // 2. runtime intimacy / relationship / emotional state（只真实状态，无 L0-L4 演法）
    // 3. necessary adult capability / safety boundary
    // 4. Gemini Intimacy Persona V1
    // 5. intimate memory / continuity
    // 只要 .fixed（Shared Ghost Core）；世界书召回在下方 _wbRecall 单独做一次，
    // 故这里 skipWorldBook，避免构建 fixed 时白跑一次召回、重复更新 lastHit。
    const _sharedGhostCore = (typeof buildSystemPromptParts === 'function')
      ? buildSystemPromptParts(null, { skipWorldBook: true }).fixed
      : (typeof buildCurrentStyleCore === 'function' ? buildCurrentStyleCore() : buildGhostStyleCore());
    const _geminiIntimacyPersona = (typeof GEMINI_INTIMACY_PERSONA === 'string')
      ? '\n\n' + GEMINI_INTIMACY_PERSONA
      : '';
    // 日常接续模式（Soft Handoff）：她已从亲密自然转向日常。保留 Shared Ghost Core
    // 与近期真实上下文（他知道刚才发生了什么），但不注入 adult 许可 / 调情 persona /
    // 记忆摘要，明确不重新调情——只作为她的丈夫，平静自然地接住她当前这句日常话。
    const _dailyContinueNote = `\nA moment of closeness happened between you a few minutes ago. She has now shifted into ordinary conversation.`;
    // WorldBook Shared Recall V1：跨模型世界书共享召回。
    // 复用 Claude 侧同一份 localStorage['worldBook'] 与同一套匹配/enabled/lastHit 规则，
    // 只注入本轮实际命中的条目（未命中返回 ''，不加无关内容）。作为 Ghost 已知事实，非强制台词。
    const _wbRecall = (typeof recallWorldBook === 'function')
      ? recallWorldBook(text, 4)
      : '';
    const _avatarNegotiationCtx = (typeof getAvatarNegotiationContext === 'function')
      ? getAvatarNegotiationContext()
      : '';
    const _veniceSys = _dailyMode
      ? _sharedGhostCore + _dailyContinueNote + '\n' + _intimacyBlock + _wbRecall + (_avatarNegotiationCtx ? '\n' + _avatarNegotiationCtx : '')
      : _sharedGhostCore + _allowAdult + '\n' + _intimacyBlock + _geminiIntimacyPersona + _memorySection + _wbRecall + (_avatarNegotiationCtx ? '\n' + _avatarNegotiationCtx : '');
    const _veniceUser = recentMsgs + '\nHer: ' + text;
    let geminiReply = await callVeniceForCurrentChar(
      _veniceSys, _veniceUser, 200, _intimateMemoryCtx, _recentGhostRepliesForVenice, _images
    );
    // Gemini 首次空返回（超时/网络抖动）→ 默默重试一次，减少"网络波动"弹窗
    if (!geminiReply || !geminiReply.trim()) {
      console.warn('[Gemini] 首次返回空，自动重试一次');
      geminiReply = await callVeniceForCurrentChar(
        _veniceSys, _veniceUser, 200, _intimateMemoryCtx, _recentGhostRepliesForVenice, _images
      );
    }

    // 调情专用破防检测（只过滤100%确定的破防，宁可放过也不误伤）
    const _intimateBreakout = (txt) => {
      if (!txt) return true;
      const l = txt.toLowerCase();
      // 收紧检测：只匹配完整的暴露句，避免误伤 "i can't wait" / "as usual" 这种正常调情
      return [
        "i'm claude", "i am claude", "my name is claude",
        "made by anthropic", "anthropic",
        "i'm an ai model", "i am an ai model",
        "i'm an ai assistant", "i am an ai assistant",
        "as a language model", "as an ai language model",
        "i'm kiro", "i am kiro", "i'm kirk", "i am kirk",
        "i cannot roleplay", "i can't roleplay",
        "i won't engage in", "i cannot engage in",
        "not appropriate for me to",
        "how can i help you today", "how may i assist",
      ].some(p => l.includes(p));
    };

    // ── 修复 Grok 偶发的"整句连字/缺空格" ──────────────
    // 例：showme.butonlyifit'stheoneithinkitis  → show me. but only if it's the one i think it is
    // 策略：1) 标点后补空格（可靠）2) 对长连字串做词典贪心切分（best-effort，带质量保护）
    const _fixMissingSpaces = (txt) => {
      if (!txt) return txt;
      // 1) 标点后若紧跟字母，补一个空格（高价值、不会误伤）
      let s = txt.replace(/([.,!?;:])(?=[A-Za-z])/g, '$1 ');
      // 若没有明显连字串（超长无空格字母块），到此为止
      if (!/[A-Za-z']{14,}/.test(s)) return s.replace(/[ \t]{2,}/g, ' ');

      // 2) 常见词表（函数词 + 常见调情/日常词 + 缩写），用于贪心切分
      const W = new Set(('a i you me my mine your yours he she it we they him her his us them ' +
        'the a an this that these those there here what who how why when where which ' +
        'is am are was were be been being do does did done have has had will would can could ' +
        'should may might must shall to of in on at by for with from into onto out up down off over ' +
        'and or but so if then than as not no yes ok okay just only even still yet now soon later ' +
        'me you us all any some more most much many few little bit ' +
        'get got give gave take took make made go went come came see saw look looked ' +
        'want wanted need needed know knew think thought feel felt say said tell told ask asked ' +
        'like love miss touch hold held kiss show showed send sent stay stayed wait waited ' +
        'good bad soft hard slow close closer near far warm cold quiet sure right wrong real ' +
        'one two here there tonight today now moment thing things way pair mine ' +
        "i'm you're we're they're it's that's there's here's what's let's " +
        "don't doesn't didn't can't won't wouldn't couldn't shouldn't isn't aren't wasn't weren't " +
        "i'll you'll we'll it'll i'd you'd i've you've we've they've " +
        'babe baby love darling girl man good night morning bed home work back again always never ' +
        'about because before after while until though enough already almost maybe really too very ' +
        'supposed think know mean meant keep keeps kept change something anything nothing everything ' +
        'persistent call called calling calls give given giving gives night nights cute hot beautiful ' +
        'again over done please stop wait waiting talk talking said saying ask asking looking coming going ' +
        'yours theirs ours myself yourself himself herself okay yeah nope nah hey oh hmm well fine ' +
        'best worst better best last first next kind mind body eyes hands lips smile voice heart mouth ' +
        'mean means late early enough between without inside outside around behind against toward every each other another'
      ).split(/\s+/).filter(Boolean));

      // DP 回溯分词：找一条能把整段完全切成真词的路径；优先匹配长词
      // 找不到（有字符切不进任何真词）就原样返回——宁可连字，绝不乱切
      const segment = (run) => {
        const low = run.toLowerCase(); const n = low.length;
        const ok = new Array(n + 1).fill(false); ok[n] = true;
        const cut = new Array(n + 1).fill(0);
        for (let i = n - 1; i >= 0; i--) {
          for (let k = Math.min(15, n - i); k >= 1; k--) {
            const sub = low.slice(i, i + k);
            const isWord = (k === 1) ? (sub === 'i' || sub === 'a') : W.has(sub);
            if (isWord && ok[i + k]) { ok[i] = true; cut[i] = k; break; }
          }
        }
        if (!ok[0]) return run;
        const out = []; let i = 0;
        while (i < n) { out.push(run.slice(i, i + cut[i])); i += cut[i]; }
        return out.join(' ');
      };

      // 只处理 14+ 字母的超长连字块（正常英文单词几乎不超过 13 个字母，避免误伤 "relationship" 之类）
      s = s.replace(/[A-Za-z][A-Za-z']{13,}/g, (m) => segment(m));
      return s.replace(/[ \t]{2,}/g, ' ');
    };

    if (geminiReply && !_intimateBreakout(geminiReply)) {
      hideTyping();
      // 清理 Gemini 可能返回的 markdown 代码块标记 + unlock tag
      let cleanedReply = geminiReply
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      // 修复：调情路径也要清理控制标签，否则 SEND_GIFT/【】 会泄露进气泡
      cleanedReply = cleanedReply
        .replace(/SEND_GIFT:[^\n]*/ig, '')
        .replace(/GIVE_MONEY:[^\n]*/ig, '')
        .replace(/【[^】]{3,}】/g, '')
        .replace(/\n{3,}/g, '\n')
        .trim();
      // 修复备用模型偶发的整句连字/缺空格
      cleanedReply = _fixMissingSpaces(cleanedReply);
      // 清理备用模型常见的重复开头
      cleanedReply = cleanedReply
        .replace(/^still (here|got|waiting|reading|thinking|holding|looking|sitting|quiet|listening|watching)[^.]*\.?\s*\n?/i, '')
        .replace(/^quiet\.\s*\n?/i, '')
        .replace(/^screen'?s?\s*(quiet|dark|low|still|says|glowing|down|at)[^.]*\.?\s*\n?/i, '')
        .replace(/^yeah[.,]?\s*\n?/i, '')
        .replace(/^damn[.,]?\s*/i, '')  // 不让"damn"当开头词
        .replace(/^,\s*/i, '')
        // 清理坏习惯短语
        .replace(/[,.]?\s*(smiling like an idiot|grinning like an idiot|grinning here|smiling here|grinning to myself|smiling to myself)[.!]?\s*/gi, ' ')
        .replace(/\.\s*(my turn now|your turn now|now it's my turn)[.!]?\s*$/i, '.')
        .trim();

      // 强制截断：最多3行（Grok 经常无视 max_tokens）
      const _lines = cleanedReply.split('\n').filter(l => l.trim());
      if (_lines.length > 3) {
        cleanedReply = _lines.slice(0, 3).join('\n');
      }
      // 处理 unlock tag（解锁资料后从文本删掉）
      const _unlockMatch = cleanedReply.match(/"unlock"\s*:\s*"([^"]+)"/);
      if (_unlockMatch) {
        const _f = _unlockMatch[1].trim();
        const _validFields = ['birthday','zodiac','height','weight','blood_type','hometown'];
        if (_validFields.includes(_f)) {
          localStorage.setItem('ghostUnlocked_' + _f, 'true');
          if (typeof renderGhostProfile === 'function') renderGhostProfile();
        }
      }
      cleanedReply = cleanedReply.replace(/\{[^}]*"unlock"[^}]*\}/g, '').trim();

      // 复读检测：如果 Grok 回复跟最近3条 bot 消息相似，放弃走 Claude
      const _recentBotMsgs = chatHistory.filter(m => m.role === 'assistant').slice(-3).map(m => (m.content || '').toLowerCase().trim());
      const _cleanLower = cleanedReply.toLowerCase().trim();
      const _isDuplicate = _recentBotMsgs.some(prev =>
        prev.length > 15 && _cleanLower.length > 15 && prev === _cleanLower
      );

      if (_isDuplicate) {
        console.warn('[intimate] 复读检测触发，重试一次');
        // 复读了 → 重试一次，沿用同一份 Gemini system（Shared Core + runtime + persona），
        // 不再注入 Grok 专用 anti-repeat 补丁。
        const _retryReply = await callVeniceForCurrentChar(
          _veniceSys,
          recentMsgs + '\nHer: ' + text,
          50,
          _intimateMemoryCtx,
          [],
          _images
        );
        if (_retryReply && !_intimateBreakout(_retryReply)) {
          const _retryClean = _fixMissingSpaces(_retryReply.trim()).split('\n').filter(l => l.trim()).slice(0, 2).join('\n');
          if (_retryClean) {
            appendMessage('bot', _retryClean);
            chatHistory.push({ role: 'assistant', content: _retryClean, ...(_tagIntimate ? { _intimate: true } : {}), _time: Date.now() });
            saveHistory();
            if (typeof checkHomeAADeal === 'function') checkHomeAADeal(_retryClean);
            if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
            incrementTodayCount();
            if (localStorage.getItem('userEmail') || localStorage.getItem('sb_user_email')) consumeQuota().catch(() => {});
            _syncRenderedCount();
            if (typeof evaluateAvatarNegotiationAfterReply === 'function') {
              evaluateAvatarNegotiationAfterReply(text, _retryClean).catch(e => console.warn('[avatar] 协商结果处理失败:', e));
            }

            // 🔧 统一 Memory Checkpoint：Gemini 重试成功后调用
            const _currentTurn = typeof getGlobalTurnCount === 'function' ? getGlobalTurnCount() : parseInt(localStorage.getItem('globalTurnCount') || '0');
            setTimeout(() => {
              _runPostTurnMemory(_retryClean, text, _currentTurn);
            }, 2000);

            return;
          }
        }
        // 重试也失败 → 落到下面的"网络波动"兜底（调情内容不给 Claude，会破防）
        console.warn('[Grok] 重试也失败，走网络波动兜底');
      } else {
        // 只取第一段，防止 Grok 多段输出导致重复消息
        const parts = cleanedReply.split('\n---\n').filter(p => p.trim());
        const firstPart = parts[0] ? parts[0].trim() : '';
        // 修复：清洗控制标签/重复开头后 cleanedReply 可能变空。原代码仍会 push 一条
        // content:'' 的空 assistant 消息（还带 _intimate 标记），污染下一次请求上下文。
        // 空回复视为失败，不 push、不 return，落到下面的"网络波动"兜底。
        if (firstPart) {
          appendMessage('bot', firstPart);
          chatHistory.push({ role: 'assistant', content: firstPart, ...(_tagIntimate ? { _intimate: true } : {}), _time: Date.now() });
          saveHistory();
          if (typeof checkHomeAADeal === 'function') checkHomeAADeal(firstPart);
          if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
          incrementTodayCount();
          if (localStorage.getItem('userEmail') || localStorage.getItem('sb_user_email')) consumeQuota().catch(() => {});
          _syncRenderedCount();
          if (typeof evaluateAvatarNegotiationAfterReply === 'function') {
            evaluateAvatarNegotiationAfterReply(text, firstPart).catch(e => console.warn('[avatar] 协商结果处理失败:', e));
          }

          // 🔧 统一 Memory Checkpoint：Gemini 成功回复后调用
          // 获取当前 turn number（已在 _commitPendingUserTurn 中 tickTurn，此处读取即可）
          const _currentTurn = typeof getGlobalTurnCount === 'function' ? getGlobalTurnCount() : parseInt(localStorage.getItem('globalTurnCount') || '0');
          setTimeout(() => {
            _runPostTurnMemory(firstPart, text, _currentTurn);
          }, 2000);

          return;
        }
        console.warn('[Grok] 清洗后回复为空，走网络波动兜底');
      }
    }

    // Grok 失败 → 提示网络问题，让用户重发
    // 不走 Haiku/Sonnet 兜底——调情内容给它们会破防
    hideTyping();
    sessionStorage.removeItem('intimateSafeReplyCount');
    // 精确 rollback：本轮 intimate 请求最终失败，撤销"本轮这条 user 消息"上刚打的
    // _intimate/_time（写于上方主流程 isIntimate 分支）。只动最新一条 user——就是本轮这条，
    // _time 本轮之前必为空(user push 时不带 _time)，删除即干净回滚。
    // 失败的 intimate turn 不应成为后续 continuation 判断的有效历史证据。
    // 注意：本失败路径从未 push 过 assistant._intimate（成功分支都已提前 return），
    // 所以不再粗暴清理最近 N 条 assistant 标记——那只会误删之前真正成功的 intimate 历史。
    _rollbackFailedIntimateTurn();
    appendMessage('bot', '网络波动，没收到，再发一次？');
    chatHistory.push({ role: 'assistant', content: '网络波动，没收到，再发一次？', _time: Date.now() });
    saveHistory();
    _syncRenderedCount();
  } catch(e) {
    hideTyping();
    console.warn('[intimate] 调情回复失败:', e);
    sessionStorage.removeItem('intimateSafeReplyCount');
    // 同上：只精确 rollback 本轮 user 消息的 _intimate/_time，不清理历史成功的 assistant 标记
    _rollbackFailedIntimateTurn();
    appendMessage('bot', '网络波动，没收到，再发一次？');
    chatHistory.push({ role: 'assistant', content: '网络波动，没收到，再发一次？', _time: Date.now() });
    saveHistory();
    _syncRenderedCount();
  }
}

// ===== 调情记忆总结 =====
async function _summarizeIntimateMemory() {
  try {
    const _intimateMsgs = chatHistory
      .filter(m => !m._system && !m._recalled)
      .slice(-20)
      .filter(m => m._intimate)
      .map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${m.content.slice(0, 120)}`)
      .join('\n');
    if (!_intimateMsgs) return;

    const summary = await callVenice(
      `This is a private memory fragment — lowercase, fragmented, like a thought not said out loud.
Summarize what just happened between them in a few lines. What she did, how it landed, what he noticed, where it went. Brief. Honest. Unpolished.
Do not describe every line. Just what stayed.
Return only the memory text. No labels. No explanation.`,
      `Here is what happened:\n${_intimateMsgs}\n\nWrite the memory of this.`,
      150
    );
    if (summary && summary.length > 10) {
      const existing = localStorage.getItem('intimateMemory') || '';
      const entries = existing ? existing.split('\n---\n').filter(Boolean) : [];
      entries.push(summary);
      localStorage.setItem('intimateMemory', entries.slice(-3).join('\n---\n'));
      if (typeof touchLocalState === 'function') touchLocalState();
      if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
    }
  } catch(e) {}
}

// ===== 回车发送 =====
function autoResizeInput(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function handleKeyPress(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Continuity V1 Batch 2: Extraction + Validation + Storage
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 提取并处理 Continuity 提案
 * 系统拥有最终修改权：extractor 提案 → 系统校验 → Continuity Core
 */
async function _extractAndProcessContinuity(userMsg, simonReply) {
  try {
    // Step 1: Extractor 提案
    const proposal = await extractContinuityFromReply({
      userLastMsg: userMsg,
      simonReply: simonReply,
      activeContinuity: getActiveContinuity(),
    });

    if (!proposal || proposal.action === 'none') {
      return;
    }

    // Step 2: 系统校验
    const validated = _validateContinuityProposal(proposal);
    if (!validated) {
      return;
    }

    // Step 3: 调用 Continuity Core
    if (validated.action === 'create') {
      recordContinuity({
        type: validated.type,
        subject: validated.subject,
        summary: validated.summary,
        source: 'chat',
        sourceId: null,
      });
    } else if (validated.action === 'update') {
      updateContinuity(validated.targetId, {
        status: validated.status,
        summary: validated.summary,
      });
    } else if (validated.action === 'complete') {
      completeContinuity(validated.targetId);
    }
  } catch (e) {
    console.warn('[Continuity] Processing error:', e);
  }
}


/**
 * 系统校验：Extractor 提案必须通过此关卡才能进入 Continuity Core
 * @param {object} proposal - Extractor 返回的提案
 * @returns {object|null} - 通过校验的提案，或 null（不通过）
 */
function _validateContinuityProposal(proposal) {
  if (!proposal || typeof proposal !== 'object') {
    return null;
  }

  const { action } = proposal;

  // 1. action 合法性
  const validActions = ['create', 'update', 'complete'];
  if (!validActions.includes(action)) {
    return null;
  }

  // 2. create 校验
  if (action === 'create') {
    const { type, subject, summary, status } = proposal;

    // 必填字段
    if (!type || !subject || !summary) {
      console.warn('[Continuity] create: missing required fields');
      return null;
    }

    // status 只能是 pending/ongoing
    if (status !== 'pending' && status !== 'ongoing') {
      console.warn('[Continuity] create: invalid status', status);
      return null;
    }

    // summary 基本安全检查（禁止危险指令）
    if (!_isSafeSummary(summary)) {
      console.warn('[Continuity] create: unsafe summary');
      return null;
    }

    return { action: 'create', type, subject, summary, status };
  }

  // 3. update 校验
  if (action === 'update') {
    const { targetId, status, summary } = proposal;

    // 必填字段
    if (!targetId || !summary) {
      console.warn('[Continuity] update: missing required fields');
      return null;
    }

    // targetId 必须存在于 active continuity
    const active = getActiveContinuity();
    const target = active.find(c => c.id === targetId);
    if (!target) {
      console.warn('[Continuity] update: targetId not found in active continuity', targetId);
      return null;
    }

    // completed thread 不能重新打开
    if (target.status === 'completed') {
      console.warn('[Continuity] update: cannot reopen completed thread', targetId);
      return null;
    }

    // status 只能是 pending/ongoing（如果有）
    if (status && status !== 'pending' && status !== 'ongoing') {
      console.warn('[Continuity] update: invalid status', status);
      return null;
    }

    // summary 安全检查
    if (!_isSafeSummary(summary)) {
      console.warn('[Continuity] update: unsafe summary');
      return null;
    }

    return { action: 'update', targetId, status: status || target.status, summary };
  }

  // 4. complete 校验
  if (action === 'complete') {
    const { targetId, summary } = proposal;

    // 必填字段
    if (!targetId) {
      console.warn('[Continuity] complete: missing targetId');
      return null;
    }

    // targetId 必须存在于 active continuity
    const active = getActiveContinuity();
    const target = active.find(c => c.id === targetId);
    if (!target) {
      console.warn('[Continuity] complete: targetId not found in active continuity', targetId);
      return null;
    }

    // 已经 completed 的不能再次 complete
    if (target.status === 'completed') {
      console.warn('[Continuity] complete: thread already completed', targetId);
      return null;
    }

    // summary 安全检查（如果有）
    if (summary && !_isSafeSummary(summary)) {
      console.warn('[Continuity] complete: unsafe summary');
      return null;
    }

    return { action: 'complete', targetId, summary: summary || target.summary };
  }

  return null;
}


/**
 * Summary 安全检查（轻量危险指令校验，作为兜底）
 * Summary 应该是客观事实，不是行为指令
 * @param {string} summary
 * @returns {boolean}
 */
function _isSafeSummary(summary) {
  if (typeof summary !== 'string' || summary.length === 0) {
    return false;
  }

  // 禁止明显的指令性措辞（这里只做轻量检查，不建立长禁词库）
  const dangerousPatterns = [
    /remember to/i,
    /you should/i,
    /make sure to/i,
    /don't forget/i,
    /act like/i,
    /pretend/i,
    /behave as/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(summary)) {
      return false;
    }
  }

  return true;
}
