// ===================================================
// events.js — Ghost 主动行为 & 剧情系统
//
// 职责分区：
// ① Active Events — Ghost 主动做的事
//    emitGhostEvent / emitGhostNarrativeEvent
//    life_ping / check_in / reverse_package / money / confront / cold_war
//    handlePostReplyActions / pickReadyPendingEvent
//
// ② Story System — 关系里程碑触发
//    legacy story catalog / automatic story checks / story unlock writer
//
// 依赖：state.js / money.js / persona.js / cloud.js
// ===================================================


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ① ACTIVE EVENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Life Ping 场景池 ──────────────────────────────

const LIFE_PING_SCENES = [
  { key: 'range',      hint: 'Training ran long or went rough today.',        weight: 10 },
  { key: 'sleep',      hint: 'Bad sleep last night.',                          weight: 10 },
  { key: 'rain',       hint: 'Raining again. Typical UK weather.',            weight: 12 },
  { key: 'food',       hint: 'Ate something. Nothing special.',               weight: 8  },
  { key: 'team',       hint: 'Minor irritation with the team today.',         weight: 10 },
  { key: 'paperwork',  hint: 'Admin and paperwork. Tedious.',                 weight: 6  },
  { key: 'equipment',  hint: 'Kit issue or equipment maintenance.',           weight: 6  },
  { key: 'run',        hint: 'Morning run. Done.',                            weight: 8  },
  { key: 'quiet',      hint: 'Quiet evening. Nothing happening.',             weight: 8  },
  { key: 'tea',        hint: 'Making tea. Small domestic moment.',            weight: 6  },
];

function pickLifePingScene() {
  // Phase 3G-5A：Events × Mood 解耦——Life Ping 场景不再由 Simon moodLevel 加权。

  // 最近2次场景去重
  const recentKeys = (() => {
    try { return JSON.parse(localStorage.getItem('lifePingSceneHistory') || '[]'); }
    catch(e) { return []; }
  })();

  const weighted = LIFE_PING_SCENES.map(s => {
    let w = s.weight;

    // 去重降权
    const recentIdx = recentKeys.indexOf(s.key);
    if (recentIdx === 0) w *= 0.2; // 上次用过
    if (recentIdx === 1) w *= 0.5; // 上上次用过

    return { ...s, w };
  });

  // 加权随机
  const total = weighted.reduce((sum, s) => sum + Math.max(0, s.w), 0);
  let r = Math.random() * total;
  let picked = weighted[0];
  for (const s of weighted) {
    r -= Math.max(0, s.w);
    if (r <= 0) { picked = s; break; }
  }

  // 记录历史（最多保留2条）
  const newHistory = [picked.key, ...recentKeys].slice(0, 2);
  localStorage.setItem('lifePingSceneHistory', JSON.stringify(newHistory));

  return picked;
}

function buildLifePingPrompt(scene) {
  // Phase 3G-5A：Events × Mood 解耦——Life Ping prompt 不再注入 Simon moodLevel 心理状态。
  return `Send one short Ghost-style message about his day.

Scene: ${scene.hint}

Rules:
- One or two short lines maximum
- English only
- No translation
- No emojis
- No hashtags
- No narration
- No explanation
- No romantic content
- No flirting
- No emotional confession
- Sounds like a real message, not a post
- Feels unplanned, like something sent in the moment
- Dry. Lowercase where natural.`;
}

async function generateLifePing() {
  const scene = pickLifePingScene();
  try {
    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 60,
        system: buildGhostStyleCore() + '\n' + buildLifePingPrompt(scene),
        messages: [{ role: 'user', content: 'Send your message.' }]
      })
    }, 5000);
    const data = await res.json();
    const text = data.content?.[0]?.text?.trim();
    if (text && text.length > 0) return text;
  } catch(e) {}

  // 兜底
  const fallbacks = {
    range: 'ran long.', sleep: "bad night.", rain: 'still raining.',
    food: 'ate something.', team: "won't shut up.", paperwork: 'reports all day.',
    equipment: 'kit issue.', run: 'morning done.', quiet: 'quiet tonight.', tea: 'making tea.'
  };
  return fallbacks[scene.key] || 'still here.';
}


// ── 工具函数 ─────────────────────────────────────

// 获取最近对话上下文（多处复用）
function getRecentCtx(n = 4, maxChars = 60) {
  if (typeof chatHistory === 'undefined') return '';
  return chatHistory
    .filter(m => !m._system && !m._recalled)
    .slice(-n)
    .map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${String(m.content || '').slice(0, maxChars)}`)
    .join('\n');
}

// 获取最近消息（用于 API messages 参数）
function getRecentMessages(n = 4) {
  if (typeof chatHistory === 'undefined') return [];
  return chatHistory.filter(m => !m._system).slice(-n);
}

// 带 recentCtx 的标准 callHaiku 调用
async function callHaikuWithCtx(systemPrompt, writePrompt, n = 4) {
  const recentCtx = getRecentCtx(n);
  return await callHaiku(
    systemPrompt,
    [
      ...getRecentMessages(n),
      {
        role: 'user',
        content: recentCtx
          ? `Recent chat:\n${recentCtx}\n\n${writePrompt}`
          : writePrompt
      }
    ]
  );
}

// 带 recentCtx 的 Grok 调用（替换Haiku台词生成，不破防，价格低）
async function callGrokWithCtx(systemPrompt, writePrompt, n = 4) {
  const recentCtx = getRecentCtx(n);
  const userContent = recentCtx
    ? `Recent chat:\n${recentCtx}\n\n${writePrompt}`
    : writePrompt;
  // Bug fix: 原来写的 callGrok(systemPrompt, userContent, 100) 参数顺序错了
  // callGrok 签名是 (user, maxTokens, ...) — systemPrompt 被当作 user，userContent 被当作 maxTokens（数字位传了字符串）
  // 改用 callGrokWithSystem(system, user, maxTokens) 正确传参
  return await callGrokWithSystem(systemPrompt, userContent, 100);
}

// ── 事件冷却管理 ──────────────────────────────────
// 目前只纳入 life_ping，其他事件由调用方控制频率
// 如需新增，在 map 里加即可

function getEventCooldownMs(eventType) {
  const map = {
    life_ping: 3 * 3600 * 1000,
  };
  return map[eventType] || 0;
}

function isEventCoolingDown(eventType) {
  const cooldown = getEventCooldownMs(eventType);
  if (!cooldown) return false;
  const lastAt = parseInt(localStorage.getItem(`lastEventAt_${eventType}`) || '0');
  return Date.now() - lastAt < cooldown;
}

function markEventTriggered(eventType) {
  if (!getEventCooldownMs(eventType)) return;
  localStorage.setItem(`lastEventAt_${eventType}`, Date.now());
}


// ── emitGhostEvent 主入口 ────────────────────────

async function emitGhostEvent(eventType, payload = {}) {
  // Phase 3G-5A：Events × Mood 解耦——不再因 Simon moodLevel<=2 禁止主动事件。

  /*
   * Jealousy 状态不再参与事件调度。
   *
   * 事件系统只记录/提供发生了什么，
   * 不替 Simon 判断自己有多吃醋，
   * 也不根据嫉妒等级规定他的行为。
   *
   * 什么 Bug 来这里找：
   * 如果以后某个事件又因为"嫉妒等级"改变触发或演法，
   * 检查 events.js 是否重新读取了 jealousy 状态。
   */

  let line = '';
  let systemTag    = null;
  let sideEffect   = null;

  switch (eventType) {

    case 'life_ping': {
      if (isEventCoolingDown('life_ping')) return false;
      markEventTriggered('life_ping');
      line = await generateLifePing();
      break;
    }

    case 'check_in': {
      // Legacy check_in removed (Phase 3K-1A)
      return false;
    }

    case 'reverse_package': {
      const motive = payload.motive || 'delayed_longing';
      // item 优先用 triggers.js 已经选好的，没有才从礼物池随机选
      let item = payload.item;
      if (!item) {
        const _pool = (typeof GHOST_REVERSE_POOL !== 'undefined')
          ? (GHOST_REVERSE_POOL[payload.emotionType] || GHOST_REVERSE_POOL['思念'] || [])
          : [];
        item = _pool.length > 0
          ? _pool[Math.floor(Math.random() * _pool.length)]
          : { name: 'something', emoji: '📦', desc: 'a small thing', tip: '' };
      }
      const motiveHint = {
        practical_care:   'He sent it because it needed doing. Not a gesture — just handling it. Slightly bossy about it.',
        compensation:     'Something happened between them. He is not apologizing out loud. This is what he does instead.',
        possessive_trace: 'He wanted her to have something of his. He will not say that. But it is why.',
        longing:          'He found it and thought of her. That is the whole reason. He will not admit that either.',
        delayed_longing:  'He sent it a while ago and is only mentioning it now. Like it almost slipped his mind.',
      }[motive] || 'Brief. Dry. Like it is nothing.';

      let generatedLine = null;
      try {
        // 修复 #1：原来用 callGrokWithCtx（只喂最近4条、每条截到60字、且不含 contextSnapshot），
        // 导致他"想起寄了东西"那句话和刚刚聊的内容脱节，读起来像忘了前面说过什么。
        // 现在喂更长的近期对话 + 当初触发寄件的那几句话（她提到的具体事），让台词能接住上下文。
        const _recentCtx = (typeof chatHistory !== 'undefined')
          ? chatHistory.filter(m => !m._system && !m._recalled).slice(-6)
              .map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${String(m.content || '').slice(0, 160)}`)
              .join('\n')
          : '';
        const _snap = Array.isArray(payload.contextSnapshot) ? payload.contextSnapshot : [];
        const _snapCtx = _snap.length > 0
          ? _snap.map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${String(m.content || '').slice(0, 160)}`).join('\n')
          : '';
        const _ctxBlock =
          (_snapCtx ? `What she said that made him send it:\n${_snapCtx}\n\n` : '') +
          (_recentCtx ? `Recent conversation right now:\n${_recentCtx}\n\n` : '');
        const t = await callGrokWithSystem(
          buildGhostStyleCore() + `
He sent something to his wife. She does not know yet, or just found out.
He is saying one line — the only line he will say about it.

His internal state: ${motiveHint}
Item context: ${item.desc}

How to write:
- Do not name the item
- Do not explain why he sent it
- Do not announce it like a delivery update
- Do not be sweet, romantic, or soft
- Drop the subject where natural
- It must fit what she JUST said — do not ignore the current conversation or sound like you forgot it
- Short. Offhand. Like it cost him nothing to say.

Usually one line.
Occasionally two very short lines — only if the second adds weight, not explanation.

English only.`,
          `${_ctxBlock}Write his line.`,
          100
        );
        if (t && t.trim()) generatedLine = t.trim().split('\n').slice(0, 2).join('\n');
      } catch(e) {}

      if (!generatedLine) {
        const fallbacks = {
          practical_care:   ["check your door.", "use it."],
          compensation:     ["just take it.", "check later."],
          possessive_trace: ["keep it.", "something there for you."],
          longing:          ["found something. sent it.", "don't make it a thing."],
          delayed_longing:  ["should be there by now.", "check your door."],
        };
        const opts = fallbacks[motive] || fallbacks.delayed_longing;
        generatedLine = opts[Math.floor(Math.random() * opts.length)];
      }

      line = generatedLine;
      sideEffect = () => {
        if (typeof addGhostReverseDelivery === 'function') {
          // triggers.js 的情绪反寄已经做过冷却检查，直接更新冷却时间跳过重复检查
          if (payload.item) {
            localStorage.setItem('lastAnyReverseAt', Date.now().toString());
            // 直接调内部逻辑，跳过 addGhostReverseDelivery 的冷却拦截
            const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
            const now = Date.now();
            const totalMs = (Math.floor(Math.random() * 2) + 1) * 24 * 3600 * 1000;
            const interval = totalMs / (typeof DELIVERY_STAGES_GHOST !== 'undefined' ? DELIVERY_STAGES_GHOST.length : 6);
            deliveries.unshift({
              id: now + '_' + Math.random().toString(36).slice(2, 8),
              name: item.name,
              emoji: item.emoji,
              isGhostSend: true,
              isEmotionReverse: true,
              isSecretDelivery: false,
              // 修复 #4：立刻显示追踪条，不再延迟24-48小时
              // 旧版延迟导致剧情说"寄出了"但用户在快递里看不到，以为没收到
              visibleAt: now,
              emotionType: payload.emotionType || motive,
              stages: (typeof DELIVERY_STAGES_GHOST !== 'undefined' ? DELIVERY_STAGES_GHOST : []).map((s, i) => ({ ...s, triggerAt: now + interval * (i + 1), done: false })),
              currentStage: 0,
              done: false,
              isLost: false,
              lostAtStage: -1,
              isLostConfirmed: false,
              productData: { price: 0, name: item.name, emoji: item.emoji, desc: item.desc || '', tip: item.tip || '' }
            });
            localStorage.setItem('deliveries', JSON.stringify(deliveries.slice(0, 20)));
          } else {
            addGhostReverseDelivery(item, motive);
          }
        }
        setLastReversePackageTurn(_globalTurnCount);
      };
      break;
    }

    case 'confront': {
      try {
        const t = await callGrokWithCtx(
          buildGhostStyleCore() + `
Write ONE short line — Ghost noticing another man in the conversation.
Not an accusation. Just tension. Dry. Direct.
No explanation. English only.`,
          `Write his line.`
        );
        if (t && t.trim()) { line = t.trim().split('\n')[0]; break; }
      } catch(e) {}
      const cfOpts = ["who's that, then.", "you're talking about him a lot.", "try that again."];
      line = cfOpts[Math.floor(Math.random() * cfOpts.length)];
      break;
    }

    case 'cold_war': {
      systemTag = 'COLD_WAR_START';
      try {
        const t = await callGrokWithCtx(
          buildGhostStyleCore() + `
Write ONE word or very short line — he is shutting down.
Cold. Clipped. Done talking.
No explanation. English only.`,
          `Write his closing line.`
        );
        if (t && t.trim()) { line = t.trim().split('\n')[0]; break; }
      } catch(e) {}
      line = payload.line || "fine.";
      break;
    }

    default:
      return false;
  }

  // 统一输出逻辑
  return await new Promise(resolve => {
    setTimeout(() => {
      if (typeof appendMessage === 'function') appendMessage('bot', line);
      if (typeof chatHistory !== 'undefined') {
        chatHistory.push({
          role: 'assistant',
          content: line,
          ...(systemTag ? { _eventTag: systemTag } : {})
        });
        if (typeof saveHistory === 'function') saveHistory();
      }
      if (sideEffect) sideEffect();
      if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
      resolve({ line, systemTag });
    }, payload.delayMs || 2000);
  });
}


// ── emitGhostNarrativeEvent ──────────────────────

async function emitGhostNarrativeEvent(text, options = {}) {
  if (!text) return;

  const delayMs = options.delayMs !== undefined ? options.delayMs : 1500;

  await new Promise(resolve => setTimeout(resolve, delayMs));

  if (typeof appendMessage === 'function') appendMessage('bot', text);
  if (typeof chatHistory !== 'undefined') {
    chatHistory.push({
      role: 'assistant',
      content: text,
      _storyId: options.storyId || null,
      ...(options.transfer ? { _transfer: options.transfer } : {})
    });
    if (typeof saveHistory === 'function') saveHistory();
  }
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
}


// pickReadyPendingEvent 已移至 sendMessage.js，此处删除重复定义


// ── handlePostReplyActions ───────────────────────
// 只做"回复后状态结算"，不做内容决策

async function handlePostReplyEvents(userText, reply, intent) {
  switch (intent.type) {
    case 'confront':
      if (Math.random() < 0.35) await emitGhostEvent('confront');
      break;

    case 'reverse_package': {
      // 反寄总开关关闭：不生成台词、不寄件（正常情况下 pickReadyPendingEvent 已拦在上游）。
      if (window.REVERSE_DELIVERY_ENABLED === false) break;
      const _pool2 = (typeof GHOST_REVERSE_POOL !== 'undefined')
        ? (GHOST_REVERSE_POOL[intent.emotionType] || GHOST_REVERSE_POOL['思念'] || [])
        : [];
      const item = intent.item || (_pool2.length > 0
        ? _pool2[Math.floor(Math.random() * _pool2.length)]
        : { name: 'something', emoji: '📦', desc: 'a small thing', tip: '' });
      // 修复 #1（触发回忆点时忘记之前提到的事）：把 contextSnapshot 透传给台词生成，
      // 这是当初让他寄东西的那几句话（她提到的具体事），不传的话台词会和上下文脱节
      await emitGhostEvent('reverse_package', { motive: intent.motive, item, emotionType: intent.emotionType, contextSnapshot: intent.contextSnapshot || [] });
      break;
    }

    case 'check_in':
      // Legacy check_in removed (Phase 3K-1A)
      break;

    default:
      break;
  }
}


// ── checkLocationSpecialTrigger ──────────────────
// 特产反寄触发器
// 原 checkLocationSpecial(userText, botText) 搬至此处，botText 已去除
// 本质是 reverse_package 的特殊来源，统一由 addGhostReverseDelivery 处理记忆注入
//
// 【低优先级】sentKey 后续改成带周期（如30天），防止地点永久失效

async function checkLocationSpecialTrigger(userText) {
  // 反寄总开关关闭：地点特产反寄整条跳过。
  if (window.REVERSE_DELIVERY_ENABLED === false) return;
  try {
    // ── 获取当前地点 ──────────────────────────────
    const rawLocation = localStorage.getItem('currentLocation') || 'Hereford Base';

    // 修复：回基地后 pending 里的外地物品也要能寄
    // 优先用 pending 信号里记录的请求时位置（可能是外地），找不到才用当前位置
    const _pendingForLocation = (() => {
      try {
        const arr = JSON.parse(localStorage.getItem('pendingSpecialtyRequests') || '[]');
        return arr.find(p => p.requestedFromLocation && p.requestedFromLocation !== rawLocation);
      } catch(e) { return null; }
    })();
    const _effectiveLocation = _pendingForLocation?.requestedFromLocation || rawLocation;

    const locationKey = LOCATION_KEY_MAP?.[_effectiveLocation]
      || LOCATION_KEY_MAP?.[Object.keys(LOCATION_KEY_MAP || {}).find(k => _effectiveLocation.includes(k))]
      || LOCATION_KEY_MAP?.[rawLocation]
      || LOCATION_KEY_MAP?.[Object.keys(LOCATION_KEY_MAP || {}).find(k => rawLocation.includes(k))]
      || null;
    if (!locationKey) return;

    // ── 该地点是否有特产 ──────────────────────────
    const specials = LOCATION_SPECIALS?.[locationKey];
    if (!specials || specials.length === 0) return;

    // ── 统一惊喜冷却：7天内已主动寄过任何东西（情绪/特产）→ 跳过 ────
    // 修复：原版只在寄出后"写"lastAnyReverseAt，却从不"读"，导致特产反寄绕过全局冷却、太频繁。
    const lastAnyReverse = parseInt(localStorage.getItem('lastAnyReverseAt') || '0');
    if (Date.now() - lastAnyReverse < 7 * 24 * 3600 * 1000) return;

    // ── 2天冷却（同地点每2天最多触发一次）────
    const sentKey  = 'locationSpecialSent_' + locationKey;
    const lastSent = parseInt(localStorage.getItem(sentKey) || '0');
    if (lastSent && Date.now() - lastSent < 2 * 24 * 3600 * 1000) return;

    // ── 关键词前筛（改为 OR，命中其一即可）────────
    const input = (userText || '').toLowerCase();

    const locationWords = [
      '当地','英国','曼城','伦敦','苏格兰','那边','你们那边','你那边',
      'local','manchester','uk','british','edinburgh','norway','germany',
      'poland','hereford','london','amsterdam','paris','dublin','tokyo',
      'japan','france','ireland','netherlands',
    ];
    const interestWords = [
      '想要','喜欢','好奇','想看','想试试','好吃','有意思','特产','带回来',
      '吃','馋','羡慕','茶','巧克力','围巾','明信片','小物','挂件','香薰',
      'curious','want','like','bring back','local thing','food','chocolate',
      'scarf','souvenir','miss','try','taste',
      // 扩展：关心地点生活的日常用语
      '怎么样','好不好','冷不冷','热不热','天气','下雨','下雪','那里',
      '习惯吗','适应','好玩','无聊','有什么','什么样','风景',
      'how is it','what\'s it like','is it cold','is it nice','how\'s the weather',
      'what\'s there','do you like it','having fun','boring','beautiful',
      'raining','snowing','how are things','what do you do there',
    ];

    const hasLocation = locationWords.some(w => input.includes(w));
    const hasInterest = interestWords.some(w => input.includes(w));
    // 放宽预筛：命中任意一组就进 Haiku，或者消息够长也进（让模型判断）
    if (!hasLocation && !hasInterest && input.length < 8) return;

    // ── Haiku 语义判断(扩展:同时检测是否明确在要东西) ───
    let triggered = false;
    let askingForItem = false;
    let itemHint = '';
    try {
      const raw = await callHaiku(
        `Ghost 目前在 ${rawLocation}。判断用户消息:
1. triggered: 是否跟他所在地、他的生活状况、当地事物有任何关联?(宽泛判断,宁可 true)
2. askingForItem: 是否在明确请求/希望他寄某样东西给她?(如 "给我带点 XX"/"能不能寄 XX"/"我想要你那边的 XX",必须是实际请求不是泛聊)
3. item: 如果 askingForItem=true,提取具体物品词(2-10 字,如"咖喱"/"茶叶"/"围巾"),提取不到就空串

只返回 JSON: {"triggered":true/false,"askingForItem":true/false,"item":"xxx"}`,
        [{ role: 'user', content: userText }]
      );
      const result = JSON.parse((raw || '').replace(/```json|```/g, '').trim());
      triggered     = result.triggered === true;
      askingForItem = result.askingForItem === true;
      itemHint      = (result.item || '').toString().slice(0, 20);
    } catch(e) {
      // 模型失败：前筛两个都命中才保守触发
      triggered = hasLocation && hasInterest;
    }

    // 用户明确在要东西 → 记 pending 信号(不立即寄,由反寄系统决定节奏)
    if (askingForItem && typeof addSpecialtyPendingSignal === 'function') {
      addSpecialtyPendingSignal(itemHint);
    }

    if (!triggered) return;

    // ── 抽一件特产:优先匹配 pending 的物品 ─────────
    let item = null;
    if (_hasPending) {
      for (const p of _pendingSignals) {
        if (!p.itemHint) continue;
        const h = p.itemHint.toLowerCase();
        const match = specials.find(s => {
          const n = (s.name || '').toLowerCase();
          return n.includes(h) || h.includes(n);
        });
        if (match) { item = match; break; }
      }
    }
    if (!item) {
      item = specials[Math.floor(Math.random() * specials.length)];
    }

    // ── 写入冷却时间戳 ────────────────────────────
    localStorage.setItem(sentKey, Date.now().toString());

    // 寄出 → 清 pending
    if (typeof consumeSpecialtyPendingMatching === 'function') {
      consumeSpecialtyPendingMatching(item.name);
    }

    // Bug fix：预占统一反寄冷却位，防止 30-60min 延迟期间被其他反寄触发
    // 若不预占，addGhostReverseDelivery 的冷却检查会在延迟到期后才看到，
    // 但此时 lastAnyReverseAt 可能已被别的反寄写入，导致本次反寄被拦截丢失
    localStorage.setItem('lastAnyReverseAt', Date.now().toString());

    // ── 30-60分钟后出现包裹 ──────────────────────
    const delay = (30 + Math.floor(Math.random() * 30)) * 60 * 1000;
    setTimeout(() => {
      if (typeof addGhostReverseDelivery === 'function') {
        addGhostReverseDelivery({ ...item, isLocationSpecial: true }, 'location_special');
      }
    }, delay);

  } catch(e) {}
}


// ── 主动触发：Ghost在某地点待够3天自动反寄 ──────────────
// 在 initChat 或每日签到后调用
function checkLocationSpecialAutoTrigger() {
  // 反寄总开关关闭：地点特产主动反寄整条跳过。
  if (window.REVERSE_DELIVERY_ENABLED === false) return;
  try {
    const rawLocation = localStorage.getItem('currentLocation') || '';
    if (!rawLocation) return;

    const locationKey = LOCATION_KEY_MAP?.[rawLocation]
      || LOCATION_KEY_MAP?.[Object.keys(LOCATION_KEY_MAP || {}).find(k => rawLocation.includes(k))]
      || null;
    if (!locationKey) return;

    const specials = LOCATION_SPECIALS?.[locationKey];
    if (!specials || specials.length === 0) return;

    // 统一惊喜冷却：7天内已主动寄过任何东西（情绪/特产）→ 跳过
    // 修复：同 checkLocationSpecialTrigger，原版只写不读 lastAnyReverseAt，绕过了全局冷却。
    const lastAnyReverse = parseInt(localStorage.getItem('lastAnyReverseAt') || '0');
    if (Date.now() - lastAnyReverse < 7 * 24 * 3600 * 1000) return;

    // 同地点2天冷却
    const sentKey  = 'locationSpecialSent_' + locationKey;
    const lastSent = parseInt(localStorage.getItem(sentKey) || '0');
    if (lastSent && Date.now() - lastSent < 2 * 24 * 3600 * 1000) return;

    // Ghost在此地点待够3天才主动触发
    const arrivedKey = 'locationArrivedAt_' + locationKey;
    const arrivedAt  = parseInt(localStorage.getItem(arrivedKey) || '0');
    if (!arrivedAt) {
      // 第一次记录到达时间
      localStorage.setItem(arrivedKey, Date.now().toString());
      return;
    }
    const daysHere = (Date.now() - arrivedAt) / (24 * 3600 * 1000);
    if (daysHere < 2) return; // 修复：待满2天才触发

    // pending 信号加成:有 pending 时概率 50% → 80%
    const _pendingSignals = (typeof getPendingSpecialtySignals === 'function') ? getPendingSpecialtySignals() : [];
    const _prob = _pendingSignals.length > 0 ? 0.80 : 0.50;
    if (Math.random() > _prob) return;

    // 抽特产:优先匹配 pending 的物品
    let item = null;
    if (_pendingSignals.length > 0) {
      for (const p of _pendingSignals) {
        if (!p.itemHint) continue;
        const h = p.itemHint.toLowerCase();
        const match = specials.find(s => {
          const n = (s.name || '').toLowerCase();
          return n.includes(h) || h.includes(n);
        });
        if (match) { item = match; break; }
      }
    }
    if (!item) {
      item = specials[Math.floor(Math.random() * specials.length)];
    }

    localStorage.setItem(sentKey, Date.now().toString());

    // 寄出 → 清 pending
    if (typeof consumeSpecialtyPendingMatching === 'function') {
      consumeSpecialtyPendingMatching(item.name);
    }

    // Bug fix：预占统一反寄冷却位（同 checkLocationSpecialTrigger）
    localStorage.setItem('lastAnyReverseAt', Date.now().toString());

    const delay = (30 + Math.floor(Math.random() * 30)) * 60 * 1000;
    setTimeout(() => {
      if (typeof addGhostReverseDelivery === 'function') {
        addGhostReverseDelivery({ ...item, isLocationSpecial: true }, 'location_special');
      }
    }, delay);

  } catch(e) {}
}




// Legacy automatic story director retired (2026-10).
// Existing storyBook records are preserved as historical data until Life Events V2 migration.

// love letter block
function _parseMD(s) {
  if (!s) return null;
  const p = s.split("-").map(Number);
  return p.length >= 3 ? { m: p[1], d: p[2] } : { m: p[0], d: p[1] };
}

function _loveLetterOccasionToday() {
  const now = new Date();
  const tM = now.getMonth() + 1, tD = now.getDate();
  const bd = _parseMD(localStorage.getItem("userBirthday"));
  const marriageDate = localStorage.getItem("marriageDate");
  const md = _parseMD(marriageDate);
  let occasion = null;
  if (bd && bd.m === tM && bd.d === tD) occasion = "birthday";
  else if (md && marriageDate && md.m === tM && md.d === tD) {
    const days = Math.floor((Date.now() - new Date(marriageDate)) / 86400000);
    if (days >= 365) occasion = "anniversary";
  }
  if (!occasion) return null;
  const lockKey = "loveLetter_" + occasion + "_" + now.getFullYear();
  if (localStorage.getItem(lockKey)) return null;
  localStorage.setItem(lockKey, "1");
  return occasion;
}

async function _sendLoveLetter(occasion) {
  try {
    const userName = (localStorage.getItem("userName") || "").trim();
    const marriageDate = localStorage.getItem("marriageDate");
    const daysTogether = marriageDate
      ? Math.max(1, Math.floor((Date.now() - new Date(marriageDate)) / 86400000) + 1) : null;
    let giftLine = "";
    try {
      if (typeof getGiftRecords === "function") {
        const gifts = getGiftRecords().slice(-4).map(g => g.name).filter(Boolean);
        if (gifts.length) giftLine = "Things she has sent you: " + gifts.join(", ") + ".";
      }
    } catch(e) {}
    const careerLine = (typeof getCareerSummary === "function" && getCareerSummary() !== "暂未选择职业")
      ? "Her work now: " + getCareerSummary() + "." : "";
    const occText = occasion === "birthday"
      ? "Today is " + (userName || "her") + "'s birthday."
      : "Today is your wedding anniversary" + (daysTogether ? " — " + daysTogether + " days together" : "") + ".";
    const writePrompt = "[SYSTEM — SPECIAL LETTER, ONE DAY A YEAR]" + "\n" +
      occText + "\n" +
      "Write her a letter — not a quick text, a real letter, longer than your usual messages." + "\n" +
      "This is the one day you let the wall down and actually say what she means to you." + "\n" +
      "Look back on your time together and be specific — not generic vows." + "\n" +
      (daysTogether ? ("You have been together " + daysTogether + " days, and you kept count." + "\n") : "") +
      (giftLine ? (giftLine + "\n") : "") +
      (careerLine ? (careerLine + "\n") : "") +
      "Still you: plain-spoken, English, lowercase is fine, no theatrics. But this once, warm and honest all the way through — no pulling back at the end." + "\n" +
      "No brackets, no narration, no stage directions. About 4 to 8 short lines. End it like a man who means every word.";
    let letter = "";
    try {
      if (typeof callSonnet === "function" && typeof buildSystemPrompt === "function") {
        const hist = (typeof chatHistory !== "undefined") ? chatHistory.slice(-4) : [];
        letter = await callSonnet(buildSystemPrompt(), [...hist, { role: "user", content: writePrompt }], 500);
      }
    } catch(e) { console.warn("[loveLetter] 生成失败:", e); }
    if (!letter || !letter.trim()) {
      letter = occasion === "birthday"
        ? "happy birthday.\ni'm not good with words like this. never have been.\nbut i'm glad it's you. every single day of it.\nwhatever you need today — it's already yours."
        : (daysTogether || "all these") + " days. i kept count of every one.\ni don't say it enough. maybe i never say it right.\nbut i'd do all of it again — every mile between us.\nyou're the one thing i got right.";
    }
    if (typeof scheduleCloudSave === "function") scheduleCloudSave();
    await emitGhostNarrativeEvent(letter, { delayMs: 2500 });
  } catch(e) { console.warn("[loveLetter] error:", e); }
}

function checkCelebrationOnSessionStart() {
  // Birthday / wedding anniversary are real calendar facts.
  // Keep this hook isolated from the retired Story auto-director.
  const occasion = _loveLetterOccasionToday();
  if (occasion) setTimeout(() => _sendLoveLetter(occasion), 3000);
}


function renderStoryBook() {
  const container = document.getElementById('storyBookList');
  if (!container) return;

  // Legacy history viewer only.
  // Life Events V2 will migrate these records into the new milestone store later.
  const book = JSON.parse(localStorage.getItem('storyBook') || '[]');
  const counterEl = document.getElementById('storyBookCounter');
  if (counterEl) counterEl.textContent = String(book.length);

  if (book.length === 0) {
    container.innerHTML = `<div class="story-empty">还没有留下共同回忆</div>`;
    return;
  }

  const unlockedFilms = book.map(e => {
    const icon = e.icon || '📖';
    const timestamp = e.at || e.unlockedAt;
    const dateStr = timestamp
      ? new Date(timestamp).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
      : '';
    return `
    <div class="film-card unlocked">
      <div class="film-holes"><div class="film-hole"></div><div class="film-hole"></div><div class="film-hole"></div><div class="film-hole"></div></div>
      <div class="film-img"><div class="film-img-icon">${icon}</div></div>
      <div class="film-info">
        <div class="film-title">${e.title || '共同回忆'}</div>
        <div class="film-desc">${e.desc || ''}</div>
        <div class="film-date">${dateStr}</div>
      </div>
      <div class="film-holes"><div class="film-hole"></div><div class="film-hole"></div><div class="film-hole"></div><div class="film-hole"></div></div>
    </div>`;
  }).join('');

  container.innerHTML = `
    <div class="story-section-label">留下的回忆</div>
    <div class="film-track">${unlockedFilms}</div>
    <div class="swipe-hint">← 左右滑动 →</div>
  `;
}


// ═══════════════════════════════════════════════════════════
// Pending 特产请求信号系统
// ───────────────────────────────────────────────────────────
// 用户开口要特产时,不立即寄,而是记一个 pending 信号。
// 这个信号会:
//   - 提高反寄系统的概率(自动版)
//   - 降低反寄系统的门槛(对话版)
//   - 让特产抽取时优先匹配用户提过的物品
// 真正的寄出时机由反寄系统自己决定,用户感受不到确定性。
// 14 天无寄出则过期清除。
// ═══════════════════════════════════════════════════════════

const _SPECIALTY_PENDING_TTL_MS = 14 * 24 * 3600 * 1000;
const _SPECIALTY_PENDING_DEDUP_MS = 2 * 24 * 3600 * 1000;

function getPendingSpecialtySignals() {
  try {
    const now = Date.now();
    const arr = JSON.parse(localStorage.getItem('pendingSpecialtyRequests') || '[]');
    return arr.filter(p => now - (p.requestedAt || 0) < _SPECIALTY_PENDING_TTL_MS);
  } catch(e) { return []; }
}

function addSpecialtyPendingSignal(itemHint) {
  try {
    const now = Date.now();
    const arr = getPendingSpecialtySignals(); // 自动过滤过期
    // 去重:2 天内有同物品请求 → 不重复记
    if (itemHint) {
      const recent = arr.find(p => p.itemHint === itemHint && now - p.requestedAt < _SPECIALTY_PENDING_DEDUP_MS);
      if (recent) return false;
    }
    // 单一用户短期内最多 3 个 pending,防止堆积
    if (arr.length >= 3) {
      arr.sort((a, b) => a.requestedAt - b.requestedAt);
      arr.shift();
    }
    arr.push({
      id: 'sp_' + now,
      requestedAt: now,
      itemHint: itemHint || '',
      // 记录请求时 Ghost 的位置，回基地后还能用这个位置的特产寄
      requestedFromLocation: localStorage.getItem('currentLocation') || ''
    });
    localStorage.setItem('pendingSpecialtyRequests', JSON.stringify(arr));
    if (typeof touchLocalState === 'function') touchLocalState();
    return true;
  } catch(e) { return false; }
}

function consumeOldestSpecialtyPending() {
  try {
    const arr = getPendingSpecialtySignals();
    if (arr.length === 0) return null;
    arr.sort((a, b) => a.requestedAt - b.requestedAt);
    const consumed = arr.shift();
    localStorage.setItem('pendingSpecialtyRequests', JSON.stringify(arr));
    if (typeof touchLocalState === 'function') touchLocalState();
    return consumed;
  } catch(e) { return null; }
}

function consumeSpecialtyPendingMatching(itemName) {
  // 寄出物匹配某 pending 的物品 hint → 清掉那一条;否则清最旧的
  try {
    const arr = getPendingSpecialtySignals();
    if (arr.length === 0) return null;
    const lowerName = (itemName || '').toLowerCase();
    const matchIdx = arr.findIndex(p => {
      const hint = (p.itemHint || '').toLowerCase();
      return hint && (lowerName.includes(hint) || hint.includes(lowerName));
    });
    if (matchIdx !== -1) {
      const consumed = arr.splice(matchIdx, 1)[0];
      localStorage.setItem('pendingSpecialtyRequests', JSON.stringify(arr));
      if (typeof touchLocalState === 'function') touchLocalState();
      return consumed;
    }
    // 没匹配 → 清最旧的(她提过但没明确物品名)
    return consumeOldestSpecialtyPending();
  } catch(e) { return null; }
}
