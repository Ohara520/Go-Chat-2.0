// ===================================================
// delivery.js — 快递系统
//
// 职责：
// - addDelivery()              创建快递（用户寄给Ghost）
// - addGhostReverseDelivery()  Ghost反寄
// - checkDeliveryUpdates()     检查快递进度
// - onGhostReceived()          Ghost收到用户寄的东西
// - showMysteryPackage()       显示神秘包裹
// - handleLostPackageClaim()   快递遗失赔偿
// - renderDeliveryTracker()    渲染快递追踪UI
// - openDeliveryModal()        打开快递详情弹窗
//
// 依赖：wallet.js / state.js / persona.js / events.js / feed.js
// ===================================================


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 破防检测
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _isDeliveryBreakout(text) {
  if (!text) return true;
  const lower = text.toLowerCase();
  return [
    "i'm claude", "i am claude", "made by anthropic", "i can't roleplay",
    "i cannot roleplay", "as an ai", "i need to be direct",
    "system instructions", "character persona"
  ].some(p => lower.includes(p));
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 快递专用 system prompt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildDeliverySystem() {
  const base = typeof buildGhostStyleCore === 'function' ? buildGhostStyleCore() : '';
  return base + `\nYou are Simon "Ghost" Riley. Reply naturally and briefly in character. Lowercase, English only. Do not explain yourself or break character under any circumstances.`;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 快递阶段配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DELIVERY_STAGES_USER = [
  { status: '📦 已打包',      en: 'Packed and ready to go.',        zh: '已打包，准备出发。' },
  { status: '✈️ 已起飞',      en: 'Left. En route.',                 zh: '已离开。运输中。' },
  { status: '🛃 海关清关中',  en: 'Stuck in customs. Typical.',      zh: '在海关清关中。典型。' },
  { status: '🇬🇧 已到达英国', en: 'Landed in the UK.',               zh: '已到达英国。' },
  { status: '🚚 配送中',      en: 'Out for delivery. Almost there.', zh: '派送中。快到了。' },
  { status: '✅ Ghost已签收', en: "Received it. ...Thanks.",          zh: '收到了。……谢谢。' },
];

const DELIVERY_STAGES_GHOST = [
  { status: '📦 Ghost已寄出', en: 'Dispatched from UK.',             zh: '已从英国发出。' },
  { status: '✈️ 已起飞',      en: 'In the air.',                     zh: '飞行中。' },
  { status: '🛃 清关中',      en: 'Clearing customs.',                zh: '清关中。' },
  { status: '📍 已到达',      en: 'Arrived in your country.',         zh: '已到达你所在国家。' },
  { status: '🚚 派送中',      en: 'Out for delivery.',                zh: '派送中。' },
  { status: '✅ 已签收',      en: 'Delivered.',                       zh: '已签收。' },
];

// 用户自购：快递到自己手上
const DELIVERY_STAGES_SELF = [
  { status: '📦 备货中',   en: 'Processing your order.',  zh: '备货中。' },
  { status: '🚚 已发货',   en: 'Shipped out.',             zh: '已发货。' },
  { status: '📍 派送中',   en: 'Out for delivery.',        zh: '派送中。' },
  { status: '✅ 已签收',   en: 'Delivered.',               zh: '已签收。' },
];


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 创建快递（用户寄给Ghost）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 保留全部在途快递，只对已完成的做上限——防止在途件被挤掉导致礼物消失
function _capDeliveries(deliveries, limitDone = 20) {
  const pending  = deliveries.filter(d => !d.done && !d.isLostConfirmed);
  const finished = deliveries.filter(d => d.done || d.isLostConfirmed).slice(0, limitDone);
  localStorage.setItem('deliveries', JSON.stringify([...pending, ...finished]));
}

function addDelivery(product, isGhostSend, isLuxury) {
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  let totalMs = isGhostSend
    ? (Math.floor(Math.random() * 2) + 1) * 24 * 3600 * 1000
    : (Math.floor(Math.random() * 2) + 2) * 24 * 3600 * 1000;

  // 艺人职业快递加速（#6 bug fix）
  const _speedPct = typeof getCareerDeliverySpeed === 'function' ? getCareerDeliverySpeed() : 0;
  if (_speedPct > 0) totalMs = Math.round(totalMs * (1 - _speedPct / 100));

  const stages   = isGhostSend ? DELIVERY_STAGES_GHOST
                   : product.isUserItem ? DELIVERY_STAGES_SELF
                   : DELIVERY_STAGES_USER;
  const now      = Date.now();
  const interval = totalMs / stages.length;

  const canLost    = !isGhostSend && !product.noLost;
  const isLost     = canLost && Math.random() < 0.10;
  const lostAtStage = isLost ? Math.floor(Math.random() * 3) + 1 : -1;

  const delivery = {
    id: now + '_' + Math.random().toString(36).slice(2, 8),
    name: product.name,
    emoji: product.emoji,
    isGhostSend,
    stages: stages.map((s, i) => ({ ...s, triggerAt: now + interval * (i + 1), done: false })),
    currentStage: 0,
    done: false,
    isLost,
    lostAtStage,
    isLostConfirmed: false,
    lostNotified: false,
    productData: {
      price:      product.price      || 0,
      isLuxury:   isLuxury           || false,
      isGhostGift: product.isGhostGift || false,
      isUserItem: product.isUserItem  || false,
      lostReplace: product.lostReplace || null,
      ghostMsg:   product.ghostMsg   || null,
      shipping:   product.shipping   || 15,
      name:       product.name,
      emoji:      product.emoji,
      isFromHome: product.isFromHome || false,
      festival:   product.festival   || '',
    }
  };

  deliveries.unshift(delivery);
  // 修复(礼物消失)：在途快递一律保留，只对已完成/已确认丢件的做 20 条上限，
  // 防止在途快递被挤出数组后既不送达也不上架、凭空消失
  _capDeliveries(deliveries);
  renderDeliveryTracker();
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 购买小票
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function showPurchaseReceipt(delivery) {
  const container = document.getElementById('messagesContainer');
  if (!container) return;
  const now     = new Date();
  const timeStr = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  const dateStr = (now.getMonth()+1) + '/' + now.getDate();
  const pd      = delivery.productData || {};
  const price   = pd.price || 0;
  const isGhost = delivery.isGhostSend;

  const div = document.createElement('div');
  div.className = 'message user';
  div.innerHTML = `
    <div style="
      background: rgba(255,255,255,0.92);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(90,154,70,0.25);
      border-radius: 18px;
      padding: 16px 18px;
      min-width: 200px;
      max-width: 280px;
      box-shadow: 0 2px 16px rgba(60,120,40,0.08);
    ">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div style="font-size:9px;letter-spacing:2.5px;color:rgba(40,90,30,0.45);font-weight:600;">ORDER PLACED</div>
        <div style="font-size:10px;color:rgba(40,90,30,0.35);">${dateStr} ${timeStr}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <div style="font-size:32px;line-height:1;">${delivery.emoji || '📦'}</div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:#1e3d20;line-height:1.3;">${delivery.name}</div>
          ${isGhost ? '<div style=\"font-size:10px;color:rgba(168,85,247,0.8);margin-top:2px;font-weight:600;letter-spacing:1px;\">GHOST GIFT</div>' : ''}
        </div>
      </div>
      ${price > 0 ? `
      <div style="border-top:1px dashed rgba(90,154,70,0.2);padding-top:10px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:11px;color:rgba(40,90,30,0.5);">合计</div>
        <div style="font-size:16px;font-weight:700;color:#1e3d20;">£${price}</div>
      </div>
      ` : ''}
      <div style="display:flex;align-items:center;gap:6px;background:rgba(90,154,70,0.06);border-radius:10px;padding:8px 10px;">
        <div style="width:6px;height:6px;border-radius:50%;background:#5a9a46;animation:pulse 1.5s infinite;flex-shrink:0;"></div>
        <div style="font-size:11px;color:#3a6a28;font-weight:500;">📦 已打包，准备出发</div>
      </div>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Ghost 反寄
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function addGhostReverseDelivery(item, emotionType) {
  // 统一冷却：3天内只寄一次（不管哪种反寄系统）
  const lastAnyReverse = parseInt(localStorage.getItem('lastAnyReverseAt') || '0');
  if (Date.now() - lastAnyReverse < 3 * 24 * 3600 * 1000) return;

  // 读统一状态
  const gs = (typeof getGhostResponseState === 'function') ? getGhostResponseState() : null;

  // initiative 0 + availability closed → 不主动寄
  if (gs && gs.initiative === 0 && gs.availability === 'closed') return;

  // warmth 0 + 非 longing/sick 类型 → 不寄软性礼物
  const softTypes = ['longing', 'sad', 'heartbroken', 'worry'];
  if (gs && gs.warmth === 0 && softTypes.includes(emotionType)) return;

  if (typeof canTriggerReverseDelivery  === 'function' && !canTriggerReverseDelivery()) return;
  if (typeof markReverseDeliveryTriggered === 'function') markReverseDeliveryTriggered();

  // 记录统一冷却时间
  localStorage.setItem('lastAnyReverseAt', Date.now().toString());

  const deliveries  = JSON.parse(localStorage.getItem('deliveries') || '[]');
  let totalMs       = (Math.floor(Math.random() * 2) + 1) * 24 * 3600 * 1000;

  // 艺人职业快递加速（#6 bug fix）
  const _speedPct2 = typeof getCareerDeliverySpeed === 'function' ? getCareerDeliverySpeed() : 0;
  if (_speedPct2 > 0) totalMs = Math.round(totalMs * (1 - _speedPct2 / 100));

  const now         = Date.now();
  const interval    = totalMs / DELIVERY_STAGES_GHOST.length;
  const isSecret    = !!item._secretDelivery;
  // 修复：visibleAt 改成立刻显示，不再延迟24-48小时
  // 旧版延迟导致用户完全看不到追踪条，误以为包裹不存在
  // 秘密快递（_secretDelivery）保留延迟显示的设计
  const visibleAt   = isSecret
    ? now + ((Math.floor(Math.random() * 24) + 24) * 3600 * 1000)
    : now;

  deliveries.unshift({
    id: now,
    name: item.name,
    emoji: item.emoji,
    isGhostSend: true,
    isEmotionReverse: true,
    isSecretDelivery: isSecret,
    visibleAt,
    emotionType,
    stages: DELIVERY_STAGES_GHOST.map((s, i) => ({ ...s, triggerAt: now + interval * (i + 1), done: false })),
    currentStage: 0,
    done: false,
    isLost: false,
    lostAtStage: -1,
    isLostConfirmed: false,
    productData: { price: 0, name: item.name, emoji: item.emoji, desc: item.desc, tip: item.tip || '' }
  });
  _capDeliveries(deliveries);

  // 修复：100%主动告知，去掉沉默路径
  // 寄了东西就直接告诉她，同时追踪条立刻显示
  // 注入系统记忆
  if (typeof chatHistory !== 'undefined') {
    chatHistory.push({
      role: 'user',
      content: `[System: You just sent her 「${item.name}」. It is on the way — NOT delivered yet. Tell her naturally. Do NOT imply she has already received it.]`,
      _system: true,
      _delivery: true
    });
    if (typeof saveHistory === 'function') _safeDeliverySaveHistory();
  }

  // 追踪条立刻刷新
  if (typeof renderDeliveryTracker === 'function') renderDeliveryTracker();

  // 让模型自己想说什么说什么，Ghost口吻，带点温度但不肉麻
  const directDelay = [2000, 5000, 10000][Math.floor(Math.random() * 3)];
  setTimeout(async () => {
    try {
      const _itemDesc = item.desc || item.name;
      const _tipHint = item.tip ? `\n\nTone anchor: ${item.tip}` : '';
      const line = await callDeepSeek(
        buildGhostStyleCore() + `\n\n[You just sent her 「${item.name}」 — ${_itemDesc}. It is on its way, not arrived yet.
Tell her you sent something. Be natural — you chose this, you sent it, let her know.
Not a system announcement. Not robotic. Not "check your door."
You can be brief, dry, even a little offhand — but it should feel like something a husband says, not a courier notification.
Examples of the right texture: "sent you something." / "something's on its way." / "picked something up for you." / "you'll get a package in a day or two."
One line. English only. Lowercase.${_tipHint}]`,
        80
      );
      if (line && line.trim() && !_isDeliveryBreakout(line)) {
        const cleanLine = line.trim().split('\n')[0];
        appendMessage('bot', cleanLine);
        chatHistory.push({ role: 'assistant', content: cleanLine });
        _safeDeliverySaveHistory();
      }
    } catch(e) {}
  }, directDelay);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 检查快递进度
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function checkDeliveryUpdates() {
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  let updated = false;
  const now   = Date.now();

  deliveries.forEach(d => {
    if (d.done || d.isLostConfirmed) return;
    d.stages.forEach((stage, i) => {
      if (!stage.done && now >= stage.triggerAt) {
        stage.done    = true;
        d.currentStage = i;
        updated       = true;

        // 检测遗失
        if (d.isLost && i === d.lostAtStage && !d.isLostConfirmed) {
          d.isLostConfirmed = true;
          d.lostConfirmedAt = Date.now();
          showToast(`❌ ${d.name} 快递遗失了`);
          _addDeliveryNotice({ id: 'lost_' + d.id, type: 'lost', itemName: d.name, itemEmoji: d.emoji || '📦' });
          renderDeliveryTracker();
          return;
        }

        // 最终签收
        if (i === d.stages.length - 1 && !d.isLostConfirmed) {
          d.done   = true;
          d.doneAt = Date.now();

          // 存入永久历史
          const history = JSON.parse(localStorage.getItem('deliveryHistory') || '[]');
          if (!history.find(h => h.id === d.id)) {
            history.unshift(d);
            localStorage.setItem('deliveryHistory', JSON.stringify(history));
            if (typeof touchLocalState === 'function') touchLocalState();
            if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
          }

          if (d.productData?.isUserItem) {
            showToast(`✅ ${d.emoji} ${d.name} 已送达！`);
          } else if (d.isGhostSend) {
            // 写进长期记忆，防止 Ghost 否认自己寄过(跟"她寄给你"机制对称)
            try {
              const _ltm = localStorage.getItem('longTermMemory') || '';
              const _d = new Date(d.doneAt);
              const _dateStr = `${_d.getMonth()+1}/${_d.getDate()}`;
              const _reasonTag = d.emotionType === 'location_special'
                ? ' (a specialty from where you were)'
                : (d.emotionType === 'longing' || d.emotionType === 'compensation' || d.emotionType === 'practical_care')
                ? ' (when she needed it)'
                : '';
              const _note = `You sent her 「${d.name}」 on ${_dateStr}${_reasonTag}. She received it. If she brings it up, acknowledge — this was from you. Do not deny sending it.`;
              if (!_ltm.includes(d.name)) {
                const _ltmLines = (_ltm + '\n' + _note).trim().split('\n').filter(l => l.trim());
                const _ltmTrimmed = _ltmLines.length > 15 ? _ltmLines.slice(-15).join('\n') : _ltmLines.join('\n');
                localStorage.setItem('longTermMemory', _ltmTrimmed);
                if (typeof touchLocalState === 'function') touchLocalState();
                if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
              }
            } catch(e) {}
            showMysteryPackage(d);
          } else {
            // 写进长期记忆，防止Ghost否认收到
            try {
              const _ltm = localStorage.getItem('longTermMemory') || '';
              const _note = `She sent you 「${d.name}」. You received it. If she asks, confirm.`;
              if (!_ltm.includes(d.name)) {
                const _ltmLines = (_ltm + '\n' + _note).trim().split('\n').filter(l => l.trim());
                const _ltmTrimmed = _ltmLines.length > 15 ? _ltmLines.slice(-15).join('\n') : _ltmLines.join('\n');
                localStorage.setItem('longTermMemory', _ltmTrimmed);
                if (typeof touchLocalState === 'function') touchLocalState();
              }
            } catch(e) {}
            onGhostReceived(d);
          }
        }
      }
    });
  });

  if (updated) {
    localStorage.setItem('deliveries', JSON.stringify(deliveries));
    renderDeliveryTracker();
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Ghost 收到用户寄的东西
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 安全保存历史（防止空 chatHistory 覆盖真实记录）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _safeDeliverySaveHistory() {
  if (typeof chatHistory === 'undefined' || typeof saveHistory !== 'function') return;
  const realMsgs = chatHistory.filter(m => !m._system && !m._recalled && m.role && m.content);
  if (realMsgs.length === 0) return; // 空的/只有系统消息 → 不覆盖
  saveHistory();
}


async function onGhostReceived(delivery) {
  // 去重：同一个快递只触发一次签收反应
  const _dedupKey = 'ghostReceived_' + delivery.id;
  if (localStorage.getItem(_dedupKey)) return;
  localStorage.setItem(_dedupKey, Date.now().toString());

  const container = document.getElementById('messagesContainer');
  if (!container) {
    // 不在聊天页面，存起来下次触发
    const pending = JSON.parse(localStorage.getItem('pendingDeliveryReactions') || '[]');
    pending.push({ delivery, savedAt: Date.now() });
    localStorage.setItem('pendingDeliveryReactions', JSON.stringify(pending));
    return;
  }

  const pd = delivery.productData;
  showToast(`✅ ${delivery.emoji} ${delivery.name} Ghost已签收！`);
  _addDeliveryNotice({ id: 'recv_' + delivery.id, type: 'ghost_received', itemName: delivery.name, itemEmoji: delivery.emoji || '📦' });

  // ── 私密商品 ──────────────────────────────────
  if (pd.isIntimate) {
    const tipHint = pd.tip ? `\n\nItem-specific tone anchor (do not quote verbatim): "${pd.tip}"` : '';
    const prompt  = `[SPECIAL ITEM: INTIMATE / SUGGESTIVE ITEMS]
She sent him 「${delivery.name}」. He just received it.

He understands exactly what it implies.
He doesn't react immediately.
He doesn't joke it off, and he doesn't respond explicitly.
He may acknowledge it with a short line, slightly off.
He may push back a little — questioning the intention.
But he doesn't reject it.
He keeps it indirect. No explicit language.
If something can be implied, he implies it.
He controls the pace.${tipHint}

One or two lines. Lowercase. English only.]`;

    let replyI = '';
    try {
      const resDS = await fetchWithTimeout('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: buildGhostStyleCore() + '\nYou are Simon Riley. Stay in character at all times.',
          user: prompt, max_tokens: 150
        })
      }, 10000);
      if (resDS.ok) {
        const dataDS  = await resDS.json();
        const candidate = dataDS.text?.trim() || '';
        if (candidate && !_isDeliveryBreakout(candidate)) replyI = candidate;
      }
    } catch(e) {}

    // Haiku 兜底
    if (!replyI) {
      try {
        const line = await callHaiku(
          buildDeliverySystem(),
          [...chatHistory.slice(-8), { role: 'user', content: prompt }]
        );
        if (line && !_isDeliveryBreakout(line)) replyI = line.trim();
      } catch(e) {}
    }

    if (replyI) {
      appendMessage('bot', replyI);
      chatHistory.push({ role: 'assistant', content: replyI });
      // 【改】系统私信改成英文简化版
      chatHistory.push({
        role: 'user',
        content: `[you received something intimate from her. you know. carry it.]`,
        _system: true,
        _delivery: true
      });
      _safeDeliverySaveHistory();
      changeAffection(2);
    }
    return;
  }

  // ── 恶作剧礼物 ───────────────────────────────
  if (pd.isJokeGift || delivery.name === '《讨好老婆的99招》') {
    try {
      const res2  = await fetchWithTimeout('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL_SONNET,
          max_tokens: 150,
          system: buildDeliverySystem(),
          messages: [...chatHistory.slice(-10), {
            role: 'user',
            content: `[She sent him a book called 「讨好老婆的99招」— written by someone called Noah. He just received it. React naturally. English only. lowercase.]`
          }]
        })
      });
      const data2 = await res2.json();
      const reply2 = data2.content?.[0]?.text?.trim() || '';
      if (reply2) {
        appendMessage('bot', reply2);
        chatHistory.push({ role: 'assistant', content: reply2 });
        _safeDeliverySaveHistory();
        changeAffection(2);
      }
    } catch(e) {}
    return;
  }

  // ── 普通/奢侈品签收 ──────────────────────────
  try {
    const isFromHome  = !!pd.isFromHome;
    const fromHomeHint = isFromHome
      ? `This is Chinese local food/specialty he hasn't had much of. He's curious, might not know how to eat it, might get surprised by spice. Real reaction, not exaggerated.${pd.festival ? ` It's a ${pd.festival} seasonal item.` : ''}`
      : '';

    // 【改】签收→说话加随机延迟，不总是立刻说
    // 修复：延迟缩短到最多30秒，防止用户等太久或提前问导致答错
    const replyDelay = [0, 10 * 1000, 30 * 1000][Math.floor(Math.random() * 3)];

    // 修复：系统消息立刻注入，不等延迟——用户提前问也能拿到正确上下文
    if (typeof chatHistory !== 'undefined') {
      chatHistory.push({
        role: 'user',
        content: `[the item she sent — 「${delivery.name}」— just arrived. you have it now. if she asks, confirm it naturally.]`,
        _system: true,
        _delivery: true
      });
      _safeDeliverySaveHistory();
    }

    setTimeout(async () => {
      try {
        const _itemDesc = pd.desc || pd.tip || delivery.name;
        const _priceHint = pd.price > 500 ? ' She spent real money on this.' : '';
        const _deliveryUserContent = `[She sent something. It just arrived — 「${delivery.name}」.
Item: ${_itemDesc}.${_priceHint}${fromHomeHint ? ' ' + fromHomeHint : ''}

She chose this. Bought it. Waited days for it to get here.
He knows that. He won't say it. But it registers.

How he reacts depends on the moment:
- Sometimes he looks at it for a second, then says something about the thing itself — what it is, what it looks like, what it reminds him of. Specific. Not generic.
- Sometimes he gives her a hard time about it — questioning why she sent it, or commenting on the choice. But the fact that he noticed the detail means he looked.
- Sometimes it's quieter. One line that says more than it should. Then nothing else.

What makes it land:
- He reacts to THIS item, not "a package." Name it or describe it. Show he actually opened it.
- The restraint makes the reaction heavier, not emptier. "got it. thanks." is empty. "you sent Earl Grey. bold choice." has weight.
- He can be amused, surprised, unimpressed, curious, or quietly affected. Not always the same.

One or two lines. English only. Lowercase. No sweet talk. But not hollow either.]`;

        let reply = '';
        if (pd.isLuxury) {
          // 奢侈品 → S
          const res = await fetchWithTimeout('/api/chat', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: MODEL_SONNET,
              max_tokens: 150,
              system: buildDeliverySystem(),
              messages: [...chatHistory.slice(-10), { role: 'user', content: _deliveryUserContent }]
            })
          });
          const data = await res.json();
          reply = data.content?.[0]?.text?.trim() || '';
        } else {
          // 普通签收 → D
          reply = await callDeepSeek(buildDeliverySystem() + '\n\n' + _deliveryUserContent, 120);
        }
        if (reply && !_isDeliveryBreakout(reply)) {
          appendMessage('bot', reply);
          chatHistory.push({ role: 'assistant', content: reply });
          _safeDeliverySaveHistory();
        }
      } catch(e) {}
    }, replyDelay);

    // 好感度 + 礼物记录（普通商品）
    if (!pd.isLuxury) {
      changeAffection(pd.price > 500 ? 2 : 1);
      if (typeof feedEvent_boughtBigItem === 'function') {
        feedEvent_boughtBigItem(delivery.name, pd.price || 0, false);
      }
    }

    // 奢侈品：第二条用 Sonnet，5秒后
    if (pd.isLuxury) {
      setTimeout(async () => {
        try {
          const res2  = await fetchWithTimeout('/api/chat', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: MODEL_SONNET,
              max_tokens: 400,
              system: buildDeliverySystem(),
              messages: [...chatHistory.slice(-15), {
                role: 'user',
                content: `[RECEIVING EXPENSIVE GIFTS]

She sent him 「${delivery.name}」. ${pd.desc || ''}
This was not cheap. He knows that.

He doesn't ignore it. He doesn't treat it lightly.
But he also doesn't gush or thank her properly — that's not him.

What he might do:
- Go quiet for a beat, then say something about the item itself — a detail, a quality, something only someone who actually looked would notice.
- Push back a little — "this was too much" / "you didn't have to" — but the fact that he said it means it landed.
- Say something that reveals he's already using it or keeping it close. Not announced. Just visible.

The reaction should feel like: he won't tell her what it meant. But she'll know.

One to two lines. English only. Lowercase.]`
              }]
            })
          });
          const data2  = await res2.json();
          const reply2 = data2.content?.[0]?.text?.trim() || '';
          if (reply2) {
            appendMessage('bot', reply2);
            chatHistory.push({ role: 'assistant', content: reply2 });
            _safeDeliverySaveHistory();
            changeAffection(pd.price > 3000 ? 5 : 3);
            if (pd.isGhostGift) {
              feedEvent_giftReceived(pd.name, 'ghost');
            } else {
              feedEvent_boughtBigItem(pd.name, pd.price || 0, false);
            }
            setTimeout(() => maybeTriggerFeedPost('event_arrived'), 1000);
          }
        } catch(e) {}
      }, 5000);
    }

    // fromHome：2-3天后随机触发余温回想
    // 【改】余温回想推广到所有签收，不只 fromHome
    // fromHome 概率60%，普通商品概率30%
    const afterthoughtChance = isFromHome ? 0.6 : 0.3;
    if (Math.random() < afterthoughtChance) {
      const afterthoughtDelay = (Math.floor(Math.random() * 3) + 2) * 24 * 3600 * 1000;
      setTimeout(async () => {
        try {
          const _afterPrompt = isFromHome
            ? buildDeliverySystem() + `\n\n[A few days later, something she sent from home crosses his mind. Just a line. Use what you know about it: ${pd.desc || delivery.name}. Write in English — describe how it tasted, felt, or what he did with it. Specific. Offhand. No explanation.]`
            : buildDeliverySystem() + `\n\n[A few days later, something she sent crosses his mind. Just a line. What it is: ${pd.desc || delivery.name}. Write in English — one concrete detail about it. Dry. Offhand.]`;
          const line = await callDeepSeek(_afterPrompt, 60);
          if (line && line.trim()) {
            appendMessage('bot', line.trim().split('\n')[0]);
            chatHistory.push({ role: 'assistant', content: line.trim().split('\n')[0] });
            _safeDeliverySaveHistory();
          }
        } catch(e) {}
      }, afterthoughtDelay);
    }

  } catch(e) {}
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 显示神秘包裹（Ghost寄给用户）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function showMysteryPackage(delivery) {
  renderDeliveryTracker();

  // 注入系统记忆（模型知道但不进聊天框）
  if (typeof chatHistory !== 'undefined') {
    chatHistory.push({
      role: 'user',
      content: `[You sent her something — 「${delivery.name}」. She just received it. You know. Don't announce it unless she brings it up.]`,
      _system: true,
      _delivery: true,
    });
    if (typeof saveHistory === 'function') _safeDeliverySaveHistory();
  }
  // 写进长期记忆，防止20条后被截掉导致Ghost否认
  try {
    const _ltm = localStorage.getItem('longTermMemory') || '';
    const _note = `You sent her 「${delivery.name}」. She received it.`;
    if (!_ltm.includes(delivery.name)) {
      const _ltmLines = (_ltm + '\n' + _note).trim().split('\n').filter(l => l.trim());
                const _ltmTrimmed = _ltmLines.length > 15 ? _ltmLines.slice(-15).join('\n') : _ltmLines.join('\n');
                localStorage.setItem('longTermMemory', _ltmTrimmed);
      if (typeof touchLocalState === 'function') touchLocalState();
    }
  } catch(e) {}

  // 生成 Ghost 那句话（显示在礼物盒通知里）
  // 修复：兜底台词改得更有人情味，去掉"check the door"这种冷冰冰的系统播报感
  let ghostLine = '';
  const _fallbacks = [
    "it's there.",
    "should be there by now.",
    "open it.",
    "got you something.",
    "you'll see.",
    "something from me.",
    "thought you'd want it.",
  ];
  try {
    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_SONNET,
        max_tokens: 60,
        system: buildDeliverySystem(),
        messages: [...chatHistory.slice(-6), {
          role: 'user',
          content: `[He sent her 「${delivery.name}」. She just received it.${delivery.productData?.tip ? ' ' + delivery.productData.tip : ''}
One short line — what he'd say when she opens the package. Like a husband, not a courier.
Could be: reacting to what it is, a dry comment on why he sent it, or just acknowledging she has it.
NOT "check the door" — she already has it. NOT a system announcement.
English only. Lowercase. One line.]`
        }]
      })
    });
    const data = await res.json();
    const line = data.content?.[0]?.text?.trim() || '';
    ghostLine = (line && !_isDeliveryBreakout(line)) ? line.split('\n')[0] : _fallbacks[Math.floor(Math.random() * _fallbacks.length)];
  } catch(e) {
    ghostLine = _fallbacks[Math.floor(Math.random() * _fallbacks.length)];
  }

  // 写入通知（商城卡片提示，进商城后弹礼物盒）
  _addDeliveryNotice({
    id:        'arrived_' + delivery.id,
    type:      'package_arrived',
    itemName:  delivery.name,
    itemEmoji: delivery.emoji || '📦',
    fromCity:  localStorage.getItem('currentLocation') || 'UK',
    ghostLine,
  });

  // 在聊天里发一条主动消息（如果当前在聊天页面）
  const _chatContainer = document.getElementById('messagesContainer');
  if (_chatContainer && ghostLine && typeof appendMessage === 'function') {
    setTimeout(() => {
      appendMessage('bot', ghostLine);
      if (typeof chatHistory !== 'undefined') {
        chatHistory.push({ role: 'assistant', content: ghostLine, _delivery: true });
        if (typeof _safeDeliverySaveHistory === 'function') _safeDeliverySaveHistory();
      }
    }, 2000);
  }

  showToast('📦 有来自 Ghost 的包裹！去商城查看');

  // 补寄/置换快递：弹草稿
  if (delivery.productData?.lostReplace || delivery.noLost) {
    setTimeout(() => {
      if (typeof showUserDraftCard === 'function') {
        showUserDraftCard({ type: 'gift_received', actor: 'user', meta: { itemName: delivery.name, isReplace: true } });
      }
    }, 4000);
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 快递遗失赔偿
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function handleLostPackageClaim(userText) {
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  const lostItems  = deliveries.filter(d => d.isLostConfirmed && !d.compensated);
  if (lostItems.length === 0) return false;

  const keywords = ['快递','丢了','遗失','没到','包裹','寄的'];
  // 修复：必须同时提到具体快递名或明确说"丢了/遗失"，防止普通聊天误触发
  const hasKeyword = keywords.some(k => userText.includes(k));
  const hasStrongKeyword = ['丢了','遗失','没到'].some(k => userText.includes(k));
  const hasItemName = lostItems.some(d => userText.includes(d.name));
  if (!hasKeyword) return false;
  if (!hasStrongKeyword && !hasItemName) return false;

  const d     = lostItems[0];
  const price = d.productData?.price || 0;

  try {
    const knewAbout = chatHistory.slice(-20).some(m =>
      m.role === 'user' && (m.content.includes(d.name) || m.content.includes('快递') || m.content.includes('寄'))
    );

    const isLuxuryLost = price >= 3000;

    // 【改】丢失事件加情绪重量——Ghost 的不爽/控制欲
    const contextPrompt = isLuxuryLost
      ? `[She told him 「${d.name}」 got lost.

He didn't even know it was coming. Now he does. And what it cost her.

That lands. More than he lets on.

He doesn't show much of it. Just a pause. Then he takes it off her. Doesn't let it stay her problem.

He may say something quiet — not comforting exactly, just closing it.]`
      : knewAbout
      ? `[She told him 「${d.name}」 got lost.

He already knew it was coming. He doesn't like that.

Not the loss. The fact it didn't reach him.

There's a brief edge — at the situation, not at her. He may sound slightly clipped. Slightly controlling. Like something didn't go the way it should have and he noticed.

Then it settles. He doesn't make her feel worse. Keeps it simple. Closes it himself.]`
      : `[She told him 「${d.name}」 got lost.

He didn't even know it was coming. That lands first.

A short pause. Then it shifts.

He doesn't make a thing out of it. But there's a slight edge — not at her, at the situation. Keeps it simple. Doesn't let her sit with it. Closes it himself.]`;

    chatHistory.push({ role: 'user', content: contextPrompt, _system: true, _delivery: true });
    if (typeof showTyping === 'function') showTyping();

    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_SONNET,
        max_tokens: 400,
        system: buildDeliverySystem(),
        messages: chatHistory.slice(-20)
      })
    });
    const data  = await res.json();
    if (typeof hideTyping === 'function') hideTyping();
    const reply = data.content?.[0]?.text?.trim() || '';
    if (reply) {
      appendMessage('bot', reply);
      chatHistory.push({ role: 'assistant', content: reply });
      _safeDeliverySaveHistory();
    }

    // 丢失商品重新上架（无论价格，让用户可以再买）
    try {
      const _itemName = d.productData?.name || d.name;
      const _purchased = JSON.parse(localStorage.getItem('purchasedItems') || '[]');
      const _newPurchased = _purchased.filter(n => n !== _itemName);
      localStorage.setItem('purchasedItems', JSON.stringify(_newPurchased));
      const _counts = JSON.parse(localStorage.getItem('purchaseCounts') || '{}');
      if (_counts[_itemName]) {
        _counts[_itemName] = Math.max(0, (_counts[_itemName] || 1) - 1);
        if (_counts[_itemName] === 0) delete _counts[_itemName];
        localStorage.setItem('purchaseCounts', JSON.stringify(_counts));
      }
      if (typeof initMarket === 'function') initMarket();
    } catch(e) {}

    // 赔偿
    if (price >= 500) {
      const compensation = Math.round(price * 0.5);
      setTimeout(() => {
        setBalance(getBalance() + compensation);
        addTransaction({ icon: '💷', name: `快递遗失赔偿 · ${d.name}`, amount: compensation });
        renderWallet();
        const msgContainer = document.getElementById('messagesContainer');
        if (msgContainer) showGhostTransferCard(msgContainer, compensation, '', false);
        chatHistory.push({
          role: 'assistant',
          content: `[快递遗失赔偿 £${compensation}]`,
          _transfer: { amount: compensation, isRefund: false }
        });
        _safeDeliverySaveHistory();
        d.compensated = true;

        // 高价值商品触发补寄
        if (price >= 3000 && d.productData?.lostReplace) {
          setTimeout(() => {
            const replace = d.productData.lostReplace;
            addDelivery({ ...replace, price, shipping: 35, noLost: true }, true, true);
            if (typeof showToast === 'function') showToast('📬 Ghost说他会补寄一个');
          }, (Math.floor(Math.random() * 3) + 3) * 24 * 3600 * 1000);
        }

        localStorage.setItem('deliveries', JSON.stringify(deliveries));
      }, 3000);
    }
    return true;
  } catch(e) {
    if (typeof hideTyping === 'function') hideTyping();
    return false;
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 渲染快递追踪UI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderDeliveryTracker() {
  const tracker = document.getElementById('deliveryTracker');
  if (!tracker) return;

  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  const now        = Date.now();

  const active = deliveries.filter(d => {
    if (d.done || d.lostTicketExpired) return false;
    if (d.visibleAt && now < d.visibleAt) return false;
    if (d.isLostConfirmed && (!d.lostConfirmedAt || now - d.lostConfirmedAt > 48 * 3600 * 1000)) return false;
    if (d.isSecretDelivery) return d.currentStage >= d.stages.length - 2;
    return true;
  });

  if (active.length === 0) { tracker.style.display = 'none'; return; }
  tracker.style.display = 'block';

  const MAX_VISIBLE = 3;
  const showAll     = tracker.dataset.expanded === 'true';
  const visible     = showAll ? active : active.slice(0, MAX_VISIBLE);
  const hasMore     = active.length > MAX_VISIBLE;

  tracker.innerHTML = visible.map((d) => {
    const isGhost = d.isGhostSend;
    if (d.isLostConfirmed) {
      return `<span class="delivery-tag" onclick="openDeliveryModalById('${d.id}')" style="background:rgba(255,235,235,0.9);border-color:rgba(240,100,100,0.5);color:#b91c1c;">
        <span style="font-size:10px">❌</span>
        ${d.emoji} ${d.name.length > 6 ? d.name.slice(0,6)+'…' : d.name}
      </span>`;
    }
    return `<span class="delivery-tag" onclick="openDeliveryModalById('${d.id}')" style="${isGhost ? 'background:rgba(168,85,247,0.12);border-color:rgba(168,85,247,0.5);' : ''}">
      <div class="delivery-tag-dot" style="${isGhost ? 'background:#a855f7;' : ''}"></div>
      ${isGhost ? '💌 ' : ''}${d.emoji} ${d.name.length > 6 ? d.name.slice(0,6)+'…' : d.name}
    </span>`;
  }).join('') + (hasMore
    ? `<span class="delivery-tag" onclick="event.stopPropagation();var t=document.getElementById('deliveryTracker');t.dataset.expanded=t.dataset.expanded==='true'?'false':'true';renderDeliveryTracker();" style="color:#a855f7;font-size:11px;cursor:pointer;">
        ${showAll ? '收起' : '+' + (active.length - MAX_VISIBLE) + '条'}
      </span>`
    : '');
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 快递详情弹窗
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function openDeliveryModal(idx) {
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  const now        = Date.now();
  const active     = deliveries.filter(d => {
    if (d.done || d.lostTicketExpired) return false;
    if (d.visibleAt && now < d.visibleAt) return false;
    if (d.isLostConfirmed && (!d.lostConfirmedAt || now - d.lostConfirmedAt > 48 * 3600 * 1000)) return false;
    if (d.isSecretDelivery) return d.currentStage >= d.stages.length - 2;
    return true;
  });
  const d = active[idx];
  if (!d) return;
  _renderDeliveryModal(d);
}

// Bug fix：通过 id 打开详情，避免 index 在两次计算间不同步导致打开错误快递
function openDeliveryModalById(id) {
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  const now        = Date.now();
  const active     = deliveries.filter(d => {
    if (d.done || d.lostTicketExpired) return false;
    if (d.visibleAt && now < d.visibleAt) return false;
    if (d.isLostConfirmed && (!d.lostConfirmedAt || now - d.lostConfirmedAt > 48 * 3600 * 1000)) return false;
    if (d.isSecretDelivery) return d.currentStage >= d.stages.length - 2;
    return true;
  });
  const d = active.find(d => d.id === id);
  if (!d) return;
  _renderDeliveryModal(d);
}

function _renderDeliveryModal(d) {
  const titleEl = document.getElementById('deliveryModalTitle');
  if (titleEl) titleEl.textContent = d.emoji + ' ' + d.name;

  let html = '';
  if (d.isLostConfirmed) {
    html += `<div style="background:rgba(255,220,220,0.8);border:1px solid rgba(220,80,80,0.3);border-radius:12px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#b91c1c;text-align:center;">
      ❌ 此包裹已在运输途中遗失
    </div>`;
  }

  html += d.stages.map((stage, i) => {
    const isDone    = i <= d.currentStage;
    const isCurrent = i === d.currentStage && !d.done;
    const isLostHere = d.isLostConfirmed && i === d.lostAtStage;
    const color     = isLostHere ? '#ef4444' : isDone ? '#a855f7' : '#d1d5db';
    return `<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:14px;">
      <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">
        <div style="width:20px;height:20px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:10px;color:white;">${isLostHere ? '✕' : isDone ? '✓' : isCurrent ? '●' : '○'}</div>
        ${i < d.stages.length - 1 ? `<div style="width:2px;height:20px;background:${isDone ? '#a855f7' : '#e5e7eb'};margin-top:2px;"></div>` : ''}
      </div>
      <div style="flex:1;padding-top:2px;">
        <div style="font-size:12px;font-weight:${isCurrent ? 700 : 500};color:${isCurrent ? '#3a1a60' : '#9ca3af'};">${stage.status}</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:2px;font-style:italic;">${stage.en}</div>
      </div>
    </div>`;
  }).join('');

  const contentEl = document.getElementById('deliveryModalContent');
  if (contentEl) contentEl.innerHTML = html;

  const modalEl = document.getElementById('deliveryModal');
  if (modalEl) modalEl.style.display = 'flex';

  const dismissBtn = document.getElementById('deliveryDismissBtn');
  if (dismissBtn) {
    if (d.done || d.isLostConfirmed) {
      dismissBtn.style.display  = '';
      dismissBtn.dataset.deliveryId = d.id;
      dismissBtn.textContent    = d.isLostConfirmed ? '已知晓 ✓' : '确认收货 ✓';
    } else {
      dismissBtn.style.display = 'none';
    }
  }
}

function closeDeliveryModal() {
  const modalEl = document.getElementById('deliveryModal');
  if (modalEl) modalEl.style.display = 'none';
}

function confirmDeliveryReceived() {
  const btn = document.getElementById('deliveryDismissBtn');
  const id  = parseInt(btn?.dataset.deliveryId || '0');
  if (id) dismissDelivery(id);
  closeDeliveryModal();
}

function dismissDelivery(id) {
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  const idx        = deliveries.findIndex(d => d.id === id);
  if (idx !== -1) {
    deliveries[idx].lostTicketExpired = true;
    deliveries[idx].done              = true;
    localStorage.setItem('deliveries', JSON.stringify(deliveries));
    renderDeliveryTracker();
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 包裹通知系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _addDeliveryNotice(notice) {
  const notices = JSON.parse(localStorage.getItem('deliveryNotices') || '[]');
  // 同一个 delivery id 不重复写
  if (notices.find(n => n.id === notice.id)) return;
  notices.unshift({ ...notice, read: false, createdAt: Date.now() });
  localStorage.setItem('deliveryNotices', JSON.stringify(notices.slice(0, 20)));
  _updateMarketCardBadge();
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
}

function _getUnreadNotices() {
  return JSON.parse(localStorage.getItem('deliveryNotices') || '[]').filter(n => !n.read);
}

function _markNoticeRead(id) {
  const notices = JSON.parse(localStorage.getItem('deliveryNotices') || '[]');
  const n = notices.find(n => n.id === id);
  if (n) n.read = true;
  localStorage.setItem('deliveryNotices', JSON.stringify(notices));
  _updateMarketCardBadge();
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
}

function _updateMarketCardBadge() {
  const desc = document.getElementById('marketCardDesc');
  if (!desc) return;
  const unread = _getUnreadNotices();
  if (unread.length > 0) {
    desc.textContent = `📦 有包裹信息 (${unread.length})`;
    desc.style.color = '#2d6028';
    desc.style.fontWeight = '600';
  } else {
    desc.textContent = '买礼物';
    desc.style.color = '';
    desc.style.fontWeight = '';
  }
}

// 进商城时显示未读通知弹窗
function checkAndShowDeliveryNotices() {
  const unread = _getUnreadNotices();
  if (!unread.length) return;
  _showNoticeModal(unread);
}

function _showNoticeModal(notices) {
  document.getElementById('_deliveryNoticeModal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = '_deliveryNoticeModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(20,50,20,0.32);backdrop-filter:blur(8px);z-index:9999;display:flex;justify-content:center;align-items:flex-end;padding-bottom:env(safe-area-inset-bottom);';

  const items = notices.map(n => _renderNoticeItem(n)).join('');

  overlay.innerHTML = `
    <div style="background:rgba(255,255,255,0.97);backdrop-filter:blur(20px);border-radius:24px 24px 0 0;
      padding:20px 20px 28px;width:100%;max-width:480px;box-shadow:0 -8px 32px rgba(50,110,30,0.15);">
      <div style="width:36px;height:4px;background:rgba(90,160,70,0.28);border-radius:2px;margin:0 auto 18px;"></div>
      <div style="font-size:15px;font-weight:700;color:#1e3d20;margin-bottom:14px;">📬 包裹消息</div>
      <div id="_noticeList" style="display:flex;flex-direction:column;gap:10px;">${items}</div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function _renderNoticeItem(notice) {
  if (notice.type === 'package_arrived') {
    return `
    <div id="_notice_${notice.id}" class="delivery-notice-card notice-gift">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
        <div class="gift-box-wrap" id="_giftbox_${notice.id}">
          <div class="gift-box">
            <div class="gift-lid">🎁</div>
            <div class="gift-content" style="display:none;">
              <div style="font-size:36px;">${notice.itemEmoji}</div>
            </div>
          </div>
        </div>
        <div>
          <div style="font-size:13px;font-weight:700;color:#1e3d20;">来自 Ghost 的包裹</div>
          <div style="font-size:11px;color:rgba(40,100,30,0.6);margin-top:2px;">从 ${notice.fromCity || '英国'} 寄出</div>
        </div>
      </div>
      <div class="notice-gift-reveal" id="_reveal_${notice.id}" style="display:none;">
        <div style="font-size:14px;font-weight:600;color:#1e3d20;margin-bottom:6px;">${notice.itemEmoji} ${notice.itemName}</div>
        ${notice.ghostLine ? `<div style="font-size:12px;color:rgba(40,100,30,0.7);font-style:italic;padding:8px 12px;background:rgba(90,160,70,0.06);border-radius:10px;border-left:2px solid rgba(90,160,70,0.3);">"${notice.ghostLine}"</div>` : ''}
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button onclick="_openGiftBox('${notice.id}')" id="_openbtn_${notice.id}"
          style="flex:1;padding:10px;border-radius:12px;border:none;background:linear-gradient(135deg,rgba(90,154,70,0.85),rgba(120,185,85,0.8));color:white;font-size:13px;font-weight:700;cursor:pointer;">
          打开包裹
        </button>
        <button onclick="_dismissNotice('${notice.id}')" id="_donebtn_${notice.id}" style="display:none;
          flex:1;padding:10px;border-radius:12px;border:1px solid rgba(90,160,70,0.25);background:transparent;color:#5a9a46;font-size:13px;font-weight:600;cursor:pointer;">
          收好了 ✓
        </button>
      </div>
    </div>`;
  }

  if (notice.type === 'ghost_received') {
    return `
    <div id="_notice_${notice.id}" class="delivery-notice-card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="font-size:32px;">${notice.itemEmoji}</div>
        <div>
          <div style="font-size:13px;font-weight:700;color:#1e3d20;">Ghost 已签收</div>
          <div style="font-size:12px;color:rgba(40,100,30,0.7);margin-top:2px;">你寄的「${notice.itemName}」已送达</div>
        </div>
      </div>
      <button onclick="_dismissNotice('${notice.id}')"
        style="width:100%;padding:10px;border-radius:12px;border:1px solid rgba(90,160,70,0.25);background:transparent;color:#5a9a46;font-size:13px;font-weight:600;cursor:pointer;">
        确认 ✓
      </button>
    </div>`;
  }

  if (notice.type === 'lost') {
    return `
    <div id="_notice_${notice.id}" class="delivery-notice-card notice-lost">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="font-size:32px;">❌</div>
        <div>
          <div style="font-size:13px;font-weight:700;color:#b91c1c;">快递遗失</div>
          <div style="font-size:12px;color:rgba(185,28,28,0.7);margin-top:2px;">你寄的「${notice.itemName}」在运输途中丢失</div>
        </div>
      </div>
      <button onclick="_dismissNotice('${notice.id}'); const _lid = '${notice.id}'.replace('lost_',''); if(_lid) dismissDelivery(parseInt(_lid));"
        style="width:100%;padding:10px;border-radius:12px;border:1px solid rgba(220,80,80,0.25);background:transparent;color:#b91c1c;font-size:13px;font-weight:600;cursor:pointer;">
        已知晓
      </button>
    </div>`;
  }
  return '';
}

function _openGiftBox(id) {
  // 礼物盒动画
  const box   = document.getElementById(`_giftbox_${id}`);
  const reveal = document.getElementById(`_reveal_${id}`);
  const openBtn = document.getElementById(`_openbtn_${id}`);
  const doneBtn = document.getElementById(`_donebtn_${id}`);
  if (!box) return;

  box.classList.add('gift-opening');
  setTimeout(() => {
    box.classList.add('gift-opened');
    if (reveal) { reveal.style.display = 'block'; reveal.classList.add('notice-reveal-in'); }
    if (openBtn) openBtn.style.display = 'none';
    if (doneBtn) doneBtn.style.display = 'block';
  }, 600);
}

function _dismissNotice(id) {
  _markNoticeRead(id);
  // 丢失通知关掉后，同步从快递追踪条移除
  if (id.startsWith('lost_')) {
    const deliveryId = parseInt(id.replace('lost_', ''));
    if (deliveryId) dismissDelivery(deliveryId);
  }
  const el = document.getElementById(`_notice_${id}`);
  if (el) {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-8px)';
    el.style.transition = 'all 0.25s ease';
    setTimeout(() => {
      el.remove();
      // 如果所有通知都处理完了，关弹窗
      const list = document.getElementById('_noticeList');
      if (list && !list.children.length) {
        document.getElementById('_deliveryNoticeModal')?.remove();
      }
    }, 250);
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 离线补触发（对应外卖的 checkPendingTakeoutReactions）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function checkPendingDeliveryReactions() {
  try {
    const pending = JSON.parse(localStorage.getItem('pendingDeliveryReactions') || '[]');
    if (!pending.length) return;
    // 只处理 48 小时内的 pending，太旧的丢掉
    const fresh = pending.filter(p => Date.now() - (p.savedAt || 0) < 48 * 3600 * 1000);
    localStorage.removeItem('pendingDeliveryReactions');
    fresh.forEach((item, idx) => {
      setTimeout(() => {
        if (item.delivery) onGhostReceived(item.delivery);
      }, idx * 4000);
    });
  } catch(e) {}
}

// 用户切回聊天页时自动回放 pending
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      setTimeout(checkPendingDeliveryReactions, 1500);
    }
  });
}


// 注：checkPendingDeliveryReactions 已在上方定义（带48小时过滤），此处不重复

// ── 关键修复：把 onGhostReceived 挂到 window 上 ──
// dates.js 的 hook 需要从 window 拦截，否则 delivery.js 内部直接调用
// 本地函数会完全绕过 hook，导致礼物签收后进不了小屋
window.onGhostReceived = onGhostReceived;

// ── 修复：给快递加定时器，每60秒自动检查一次 ──
// 旧版只在 initChat 和购买时检查，用户长时间聊天不重开页面就永远收不到快递
// 对标 takeout.js 的 setInterval，确保快递能准时送达
if (typeof document !== 'undefined') {
  // 页面切回来时立刻检查
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      setTimeout(() => {
        try { if (typeof checkDeliveryUpdates === 'function') checkDeliveryUpdates(); } catch(e) {}
      }, 1000);
    }
  });

  // 每60秒自动检查（跟外卖系统一致）
  if (!window._deliveryCheckInterval) {
    window._deliveryCheckInterval = setInterval(() => {
      try {
        const hasActive = JSON.parse(localStorage.getItem('deliveries') || '[]').some(d => !d.done && !d.isLostConfirmed);
        if (hasActive && typeof checkDeliveryUpdates === 'function') checkDeliveryUpdates();
      } catch(e) {}
    }, 60000);
  }
}
