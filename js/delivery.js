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

function addDelivery(product, isGhostSend, isLuxury) {
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  const totalMs = isGhostSend
    ? (Math.floor(Math.random() * 2) + 1) * 24 * 3600 * 1000
    : (Math.floor(Math.random() * 2) + 2) * 24 * 3600 * 1000;
  const stages   = isGhostSend ? DELIVERY_STAGES_GHOST
                   : product.isUserItem ? DELIVERY_STAGES_SELF
                   : DELIVERY_STAGES_USER;
  const now      = Date.now();
  const interval = totalMs / stages.length;

  const canLost    = !isGhostSend && !product.noLost;
  const isLost     = canLost && Math.random() < 0.10;
  const lostAtStage = isLost ? Math.floor(Math.random() * 3) + 1 : -1;

  const delivery = {
    id: now,
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
  localStorage.setItem('deliveries', JSON.stringify(deliveries.slice(0, 20)));
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
  // 读统一状态
  const gs = (typeof getGhostResponseState === 'function') ? getGhostResponseState() : null;

  // initiative 0 + availability closed → 不主动寄
  if (gs && gs.initiative === 0 && gs.availability === 'closed') return;

  // warmth 0 + 非 longing/sick 类型 → 不寄软性礼物
  const softTypes = ['longing', 'sad', 'heartbroken', 'worry'];
  if (gs && gs.warmth === 0 && softTypes.includes(emotionType)) return;

  if (typeof canTriggerReverseDelivery  === 'function' && !canTriggerReverseDelivery()) return;
  if (typeof markReverseDeliveryTriggered === 'function') markReverseDeliveryTriggered();

  const deliveries  = JSON.parse(localStorage.getItem('deliveries') || '[]');
  const totalMs     = (Math.floor(Math.random() * 2) + 1) * 24 * 3600 * 1000;
  const now         = Date.now();
  const interval    = totalMs / DELIVERY_STAGES_GHOST.length;
  const isSecret    = !!item._secretDelivery;
  const visibleAt   = now + ((Math.floor(Math.random() * 24) + 24) * 3600 * 1000);

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
  localStorage.setItem('deliveries', JSON.stringify(deliveries.slice(0, 20)));

  // ── 三种模式：60%偷偷寄 / 30%暗示 / 10%直说 ──
  const rand = Math.random();

  // 【改】系统私信改成英文简化版，减轻"剧本感"
  // 模型只需要知道"寄了/知道这件事"，不需要剧本式中文指令
  if (rand < 0.6) {
    // 偷偷寄：注入轻量记忆，不说话
    if (typeof chatHistory !== 'undefined') {
      chatHistory.push({
        role: 'user',
        content: `[you sent something. you remember it. don't bring it up unless needed.]`,
        _system: true
      });
      if (typeof saveHistory === 'function') _safeDeliverySaveHistory();
    }
    return;
  } else if (rand < 0.9) {
    // 暗示：注入记忆 + 随机延迟后说一句模糊的话
    // 【改】加随机延迟，不是立刻说，更自然
    if (typeof chatHistory !== 'undefined') {
      chatHistory.push({
        role: 'user',
        content: `[you sent something. it's on its way. you know. don't confirm details if asked, but don't deny it either.]`,
        _system: true
      });
      if (typeof saveHistory === 'function') _safeDeliverySaveHistory();
    }
    const hintDelay = [2000, 2 * 60 * 1000, 10 * 60 * 1000][Math.floor(Math.random() * 3)];
    setTimeout(async () => {
      try {
        const line = await callDeepSeek(
          buildGhostStyleCore() + '\n\n[You sent her something. She doesn\'t know yet. Drop one vague line — not what it is, not when. Something that could mean anything. One line. Do not announce it like a delivery update. English only. Lowercase.]',
          60
        );
        if (line && line.trim()) {
          appendMessage('bot', line.trim().split('\n')[0]);
          chatHistory.push({ role: 'assistant', content: line.trim().split('\n')[0] });
          _safeDeliverySaveHistory();
        }
      } catch(e) {}
    }, hintDelay);
  } else {
    // 直说：注入记忆 + 随机延迟后说一句
    if (typeof chatHistory !== 'undefined') {
      chatHistory.push({
        role: 'user',
        content: `[you sent her something. she'll find out soon. if she asks, confirm it.]`,
        _system: true
      });
      if (typeof saveHistory === 'function') _safeDeliverySaveHistory();
    }
    const directDelay = [2000, 2 * 60 * 1000][Math.floor(Math.random() * 2)];
    setTimeout(async () => {
      try {
        const line = await callDeepSeek(
          buildGhostStyleCore() + `\n\n[You sent her 「${item.name}」. Say one line — low-key, no details. Like it's not a big deal.${item.tip ? ' ' + item.tip : ''} English only. Lowercase.]`,
          60
        );
        if (line && line.trim()) {
          appendMessage('bot', line.trim().split('\n')[0]);
          chatHistory.push({ role: 'assistant', content: line.trim().split('\n')[0] });
          _safeDeliverySaveHistory();
        }
      } catch(e) {}
    }, directDelay);
  }
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
            if (typeof saveToCloud     === 'function') saveToCloud().catch(() => {});
          }

          if (d.productData?.isUserItem) {
            showToast(`✅ ${d.emoji} ${d.name} 已送达！`);
          } else if (d.isGhostSend) {
            showMysteryPackage(d);
          } else {
            // 【改】系统私信改成英文简化版
            if (typeof chatHistory !== 'undefined') {
              chatHistory.push({
                role: 'user',
                content: `[the item she sent — 「${d.name}」— just arrived. you have it now. if she asks, confirm it naturally.]`,
                _system: true
              });
              _safeDeliverySaveHistory(); // 防止空 chatHistory 覆盖真实记录
            }
            // 写进长期记忆，防止Ghost否认收到
            try {
              const _ltm = localStorage.getItem('longTermMemory') || '';
              const _note = `She sent you 「${d.name}」. You received it. If she asks, confirm.`;
              if (!_ltm.includes(d.name)) {
                localStorage.setItem('longTermMemory', (_ltm + '\n' + _note).trim().slice(-2000));
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
        _system: true
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
        _system: true
      });
      _safeDeliverySaveHistory();
    }

    setTimeout(async () => {
      try {
        const _deliveryUserContent = `[She sent something. It just arrived — 「${delivery.name}」.${fromHomeHint ? ' ' + fromHomeHint : ''}

He doesn't react the same way every time.

Sometimes it's simple. A short line. Real. No effort to dress it up.
Sometimes he plays it down. Says less than he feels. But lingers on it.
Sometimes he gives her a hard time about it. A comment, a complaint, something dry.

He doesn't make a show of it. But he keeps it. English only. Lowercase.]`;

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

    // 好感度
    if (!pd.isLuxury) changeAffection(pd.price > 500 ? 2 : 1);

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

When he receives something expensive from her, he understands what it means.
He doesn't ignore it. He doesn't treat it lightly.

He may go quiet, or give a short understated response.
He might downplay it, or push back — like it was more than necessary.
Sometimes he gives her a bit of a hard time for it.

But he keeps it. It stays with him.
He won't explain what it meant to him.

Item received: 「${delivery.name}」]`
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
    });
    if (typeof saveHistory === 'function') _safeDeliverySaveHistory();
  }
  // 写进长期记忆，防止20条后被截掉导致Ghost否认
  try {
    const _ltm = localStorage.getItem('longTermMemory') || '';
    const _note = `You sent her 「${delivery.name}」. She received it.`;
    if (!_ltm.includes(delivery.name)) {
      localStorage.setItem('longTermMemory', (_ltm + '\n' + _note).trim().slice(-2000));
      if (typeof touchLocalState === 'function') touchLocalState();
    }
  } catch(e) {}

  // 生成 Ghost 那句话（存进通知，不发聊天框）
  let ghostLine = '';
  try {
    const fallbacks = ["check the door.", "something might've arrived.", "use it.", "it's there."];
    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_SONNET,
        max_tokens: 60,
        system: buildDeliverySystem(),
        messages: [...chatHistory.slice(-6), {
          role: 'user',
          content: `[He sent her 「${delivery.name}」. She just received it.${delivery.productData?.tip ? ' ' + delivery.productData.tip : ''} One short line — dry, offhand, like it cost him nothing. No explanation. English only. Lowercase.]`
        }]
      })
    });
    const data = await res.json();
    const line = data.content?.[0]?.text?.trim() || '';
    ghostLine = (line && !_isDeliveryBreakout(line)) ? line.split('\n')[0] : fallbacks[Math.floor(Math.random() * fallbacks.length)];
  } catch(e) {
    ghostLine = ["check the door.", "something might've arrived.", "use it."][Math.floor(Math.random() * 3)];
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
  if (!keywords.some(k => userText.includes(k))) return false;

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

    chatHistory.push({ role: 'user', content: contextPrompt, _system: true });
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
      return `<span class="delivery-tag" onclick="openDeliveryModal(${active.indexOf(d)})" style="background:rgba(255,235,235,0.9);border-color:rgba(240,100,100,0.5);color:#b91c1c;">
        <span style="font-size:10px">❌</span>
        ${d.emoji} ${d.name.length > 6 ? d.name.slice(0,6)+'…' : d.name}
      </span>`;
    }
    return `<span class="delivery-tag" onclick="openDeliveryModal(${active.indexOf(d)})" style="${isGhost ? 'background:rgba(168,85,247,0.12);border-color:rgba(168,85,247,0.5);' : ''}">
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
  if (typeof saveToCloud === 'function') saveToCloud().catch(() => {});
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
  if (typeof saveToCloud === 'function') saveToCloud().catch(() => {});
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
