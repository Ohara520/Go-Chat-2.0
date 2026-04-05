// ============================================================
// helpers.js — 拆分补全：sendMessage.js 依赖的辅助函数
//
// 包含：
//   fetchDeepSeek        — Haiku 快速判断包装（原 callHaiku 简化版）
//   pickReadyPendingEvent — 从 localStorage 取待触发事件
//   decideMainIntent     — 预判本轮主意图
//   handlePostReplyActions — 回复后副作用（云存、记忆更新等）
//
// 加载顺序：在 api.js 之后、sendMessage.js 之前
// ============================================================


// ===== fetchDeepSeek =====
// 实质是 callHaiku 的轻量包装，用于需要快速文本判断的场景
// system: 系统提示字符串
// userContent: 用户消息字符串
// maxTokens: 最大输出 token 数
async function fetchDeepSeek(system, userContent, maxTokens = 80) {
  return await callHaiku(
    system,
    [{ role: 'user', content: userContent }],
    maxTokens
  );
}


// ===== pickReadyPendingEvent =====
// 从 localStorage 取一个"已就绪"的待触发事件
// 就绪条件：triggerAt <= 当前时间
// 返回事件对象，或 null（没有待触发事件）
function pickReadyPendingEvent() {
  try {
    const raw = localStorage.getItem('pendingEvents');
    if (!raw) return null;
    const events = JSON.parse(raw);
    if (!Array.isArray(events) || events.length === 0) return null;

    const now = Date.now();
    const readyIdx = events.findIndex(e => !e.triggerAt || e.triggerAt <= now);
    if (readyIdx === -1) return null;

    // 取出并从队列移除
    const [ready] = events.splice(readyIdx, 1);
    localStorage.setItem('pendingEvents', JSON.stringify(events));
    return ready;
  } catch(e) {
    return null;
  }
}


// ===== decideMainIntent =====
// 根据用户消息文本和待触发事件，预判本轮回复的主意图
// 返回字符串，供 handlePostReplyActions 使用
// intent 值：'event' | 'intimate' | 'emotional' | 'money' | 'routine'
function decideMainIntent(text, pendingEvent) {
  if (pendingEvent) return 'event';

  const t = (text || '').toLowerCase();

  // 调情/亲密
  if (/touch me|want you|naughty|tease me|摸摸|蹭蹭|贴贴|咬|舔|撩|涩涩|色色/.test(t)) {
    return 'intimate';
  }

  // 情绪支持
  if (/难过|伤心|哭|委屈|不开心|崩溃|hurt|sad|crying|upset|awful|scared|帮帮我/.test(t)) {
    return 'emotional';
  }

  // 钱相关
  if (/给我钱|转我|好穷|买不起|能不能给|要钱|零花钱|缺钱|没钱|give me|send me money/.test(t)) {
    return 'money';
  }

  // 默认：普通聊天
  return 'routine';
}


// ===== handlePostReplyActions =====
// 回复完成后的异步副作用：云端存档、记忆更新、打卡等
// text: 用户原始消息
// reply: Ghost 本轮回复
// intent: decideMainIntent 的返回值
async function handlePostReplyActions(text, reply, intent) {
  try {
    // 1. 消耗一条额度
    if (typeof consumeQuota === 'function') {
      consumeQuota().catch(() => {});
    }

    // 2. 记录最后发消息时间
    localStorage.setItem('lastUserMessageAt', Date.now().toString());

    // 3. 云端存档（节流，避免每条都触发）
    if (typeof scheduleCloudSave === 'function') {
      scheduleCloudSave();
    }

    // 4. 打卡/连续登录（每日首条消息）
    const todayKey = 'dailyChatDone_' + new Date().toDateString();
    if (!localStorage.getItem(todayKey)) {
      localStorage.setItem(todayKey, '1');
      // 连续打卡天数
      const streak = parseInt(localStorage.getItem('visitStreak') || '1');
      const lastDay = localStorage.getItem('lastVisitDay');
      const today = new Date().toDateString();
      if (lastDay !== today) {
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        const newStreak = lastDay === yesterday ? streak + 1 : 1;
        localStorage.setItem('visitStreak', newStreak);
        localStorage.setItem('lastVisitDay', today);
      }
    }

    // 5. 亲密意图后：标记最后一条消息为 _intimate
    if (intent === 'intimate') {
      const lastBot = [...chatHistory].reverse().find(m => m.role === 'assistant' && !m._recalled);
      if (lastBot) lastBot._intimate = true;
      if (typeof saveHistory === 'function') saveHistory();
    }

    // 6. 长期记忆更新（由 sendMessage.js 的 updateLongTermMemory 按轮次控制，这里不重复）

  } catch(e) {
    // 副作用报错不影响主流程
    console.warn('[helpers] handlePostReplyActions error:', e);
  }
}
