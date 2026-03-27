// ===== 快递系统 (delivery.js) =====
// ===== 快递系统 =====
const DELIVERY_STAGES_USER = [
  { status: '📦 已打包',      en: 'Packed and ready to go.',         zh: '已打包，准备出发。' },
  { status: '✈️ 已起飞',      en: 'Left. En route.',                  zh: '已离开。运输中。' },
  { status: '🛃 海关清关中',  en: 'Stuck in customs. Typical.',       zh: '在海关清关中。典型。' },
  { status: '🇬🇧 已到达英国', en: 'Landed in the UK.',                zh: '已到达英国。' },
  { status: '🚚 配送中',      en: 'Out for delivery. Almost there.',  zh: '派送中。快到了。' },
  { status: '✅ Ghost已签收', en: "Received it. ...Thanks.",           zh: '收到了。……谢谢。' },
];

const DELIVERY_STAGES_GHOST = [
  { status: '📦 Ghost已寄出', en: 'Dispatched from UK.',              zh: '已从英国发出。' },
  { status: '✈️ 已起飞',      en: 'In the air.',                      zh: '飞行中。' },
  { status: '🛃 清关中',      en: 'Clearing customs.',                 zh: '清关中。' },
  { status: '📍 已到达',      en: 'Arrived in your country.',          zh: '已到达你所在国家。' },
  { status: '🚚 派送中',      en: 'Out for delivery.',                 zh: '派送中。' },
  { status: '✅ 已签收',      en: 'Delivered.',                        zh: '已签收。' },
];

// 运费吐槽台词
const SHIPPING_COMPLAINTS = [
  "You paid £{fee} shipping for this. You're insane.\n你花了£{fee}运费寄这个。你疯了。",
  "£{fee} in shipping. I hope it was worth it.\n£{fee}运费。我希望值得。",
  "Next time just wire me the money. The shipping alone was £{fee}.\n下次直接给我转账算了。光运费就£{fee}了。",
  "The shipping cost more than my dignity. £{fee}.\n运费比我的尊严还贵。£{fee}。",
];

function addDelivery(product, isGhostSend, isLuxury) {
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  const totalMs = isGhostSend
    ? (Math.floor(Math.random() * 2) + 1) * 24 * 3600 * 1000  // Ghost反寄1-2天
    : (Math.floor(Math.random() * 2) + 2) * 24 * 3600 * 1000; // 用户寄2-3天
  const stages = isGhostSend ? DELIVERY_STAGES_GHOST : DELIVERY_STAGES_USER;
  const now = Date.now();
  const interval = totalMs / stages.length;

  // 遗失逻辑（只有用户寄的，10%概率，头等舱不遗失）
  const canLost = !isGhostSend && !product.noLost;
  const isLost = canLost && Math.random() < 0.10;
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
      price: product.price || 0,
      isLuxury: isLuxury || false,
      isGhostGift: product.isGhostGift || false,
      isUserItem: product.isUserItem || false,
      lostReplace: product.lostReplace || null,
      ghostMsg: product.ghostMsg || null,
      shipping: product.shipping || 15,
      name: product.name,
      emoji: product.emoji,
      isFromHome: product.isFromHome || false,
      festival: product.festival || '',
    }
  };

  deliveries.unshift(delivery);
  localStorage.setItem('deliveries', JSON.stringify(deliveries.slice(0, 20)));
  renderDeliveryTracker();
}

function addGhostReverseDelivery(item, emotionType) {
  // Ghost主动反寄，不显示小票，只在商城顶部显示神秘提示
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  const totalMs = (Math.floor(Math.random() * 2) + 1) * 24 * 3600 * 1000; // 1-2天
  const now = Date.now();
  const interval = totalMs / DELIVERY_STAGES_GHOST.length;
  const isSecret = !!item._secretDelivery; // secret模式：隐藏物流直到最后阶段

  deliveries.unshift({
    id: now,
    name: item.name,
    emoji: item.emoji,
    isGhostSend: true,
    isEmotionReverse: true,
    isSecretDelivery: isSecret, // 隐藏物流标记
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
}

function checkDeliveryUpdates() {
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  let updated = false;
  const now = Date.now();

  deliveries.forEach(d => {
    if (d.done || d.isLostConfirmed) return;
    d.stages.forEach((stage, i) => {
      if (!stage.done && now >= stage.triggerAt) {
        stage.done = true;
        d.currentStage = i;
        updated = true;

        // 检测遗失
        if (d.isLost && i === d.lostAtStage && !d.isLostConfirmed) {
          d.isLostConfirmed = true;
          d.lostConfirmedAt = Date.now(); // 记录丢失时间，用时间戳判断而不是setTimeout
          showToast(`❌ ${d.name} 快递遗失了`);
          renderDeliveryTracker();
          return;
        }

        // 签收
        if (i === d.stages.length - 1 && !d.isLostConfirmed) {
          d.done = true;
          d.doneAt = Date.now();
          // 签收时存入永久相册历史
          const history = JSON.parse(localStorage.getItem('deliveryHistory') || '[]');
          if (!history.find(h => h.id === d.id)) {
            history.unshift(d);
            localStorage.setItem('deliveryHistory', JSON.stringify(history));
          }
          if (d.isGhostSend) {
            showMysteryPackage(d);
          } else {
            onGhostReceived(d);
          }
        }
      }
    });
  });

  // 清除过期小票
  const active = deliveries.filter(d => !d.done && !(d.isLostConfirmed && d.lostTicketExpired) && !d.isEmotionReverse);
  if (active.length !== deliveries.filter(d => !d.done).length) updated = true;

  if (updated) {
    localStorage.setItem('deliveries', JSON.stringify(deliveries));
    renderDeliveryTracker();
  }
}

async function onGhostReceived(delivery) {
  const container = document.getElementById('messagesContainer');
  if (!container) return;
  const pd = delivery.productData;
  const fee = pd.shipping || 15;

  showToast(`✅ ${delivery.emoji} ${delivery.name} Ghost已签收！`);

  // 奢侈品用Sonnet，普通包裹用Haiku
  try {
    const isFromHome = !!pd.isFromHome;
    const fromHomeHint = isFromHome
      ? `这是中国特产，他没吃过很多中国食物，会好奇、可能不知道怎么吃、可能被辣到、可能安静品味。反应要真实，不夸张，符合西蒙性格。${pd.festival ? `这是${pd.festival}节日限定，他可能听说过这个节日但不太了解。` : ''}`
      : '';
    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: pd.isLuxury ? getMainModel() : 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        ...(() => { const _sys = buildSystemPrompt(); return { system: _sys, systemParts: buildSystemPromptParts(_sys) }; })(),
        messages: [...chatHistory.slice(-10), {
          role: 'user',
          content: `[系统：你刚收到老婆从中国寄来的「${delivery.name}」。${fromHomeHint || ''}
回应方式根据你当下状态自然选择，不要每次都一样：
- 有时候可以是真的开心或感激，简短说出来，不花哨但真实
- 有时候是假装不在意，嘴上轻描淡写，但细节里漏出他其实看了好几遍/留着了/很喜欢
- 有时候是嘴上吐槽（包装太麻烦/不必要/太贵），但结尾暗示他收下了、放着了、没扔
无论哪种，用户都要能感受到他是珍惜的，不能让她以为真的被嫌弃了。全小写，附中文翻译，格式：英文\\n中文翻译]`
        }]
      })
    });
    const data = await res.json();
    const reply = data.content?.[0]?.text?.trim() || '';
    if (reply) {
      appendMessage('bot', reply);
      chatHistory.push({ role: 'assistant', content: reply });
      saveHistory();
      // 立刻强制同步云端，防止切后台丢消息
      if (typeof saveToCloud === 'function') saveToCloud().catch(() => {});
    }

    // 30%概率吐槽运费
    if (Math.random() < 0.3) {
      const complaint = SHIPPING_COMPLAINTS[Math.floor(Math.random() * SHIPPING_COMPLAINTS.length)];
      setTimeout(() => {
        const msg = complaint.replace(/\{fee\}/g, fee);
        appendMessage('bot', msg);
        chatHistory.push({ role: 'assistant', content: msg });
        saveHistory();
      }, 3000);
    }

    // 精品专柜第二条反应用Sonnet，情感分量要够
    if (pd.isLuxury) {
      setTimeout(async () => {
        const res2 = await fetchWithTimeout('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: getMainModel(),
            max_tokens: 400,
            ...(() => { const _sys = buildSystemPrompt(); return { system: _sys, systemParts: buildSystemPromptParts(_sys) }; })(),
            messages: [...chatHistory.slice(-15), {
              role: 'user',
              content: `[He received it — 「${delivery.name}」.

It's not something small.
He knows what it cost her.

He doesn't react the same way every time.

Sometimes he goes quiet for a second.
Says less than he should.

Sometimes he plays it off.
A short line. Like it wasn't a big deal.

Sometimes he gives her a hard time for it.
Too much. Didn't need to.

But he doesn't put it aside.

He keeps it.
Pays more attention than he lets on.

It stays with him.

He won't say what it meant.
But he felt it.]`
            }]
          })
        });
        const data2 = await res2.json();
        const reply2 = data2.content?.[0]?.text?.trim() || '';
        if (reply2) {
          appendMessage('bot', reply2);
          chatHistory.push({ role: 'assistant', content: reply2 });
          saveHistory();
          // 好感度
          changeAffection(pd.price > 3000 ? 5 : 3);
          // 精品专柜：Ghost真正签收后才入事件池发朋友圈
          if (pd.isGhostGift) {
            feedEvent_giftReceived(pd.name, 'ghost');
            setTimeout(() => maybeTriggerFeedPost('event_arrived'), 1000);
          } else {
            feedEvent_boughtBigItem(pd.name, pd.price || 0, false);
            setTimeout(() => maybeTriggerFeedPost('event_arrived'), 1000);
          }
        }
      }, 5000);
    } else {
      changeAffection(pd.price > 500 ? 2 : 1);
    }

    // fromhome：2-3天后随机触发二次反应（吃完了/感受）
    if (isFromHome && Math.random() < 0.6) {
      const delay = (Math.floor(Math.random() * 2) + 2) * 24 * 3600 * 1000;
      setTimeout(async () => {
        try {
          const res3 = await fetchWithTimeout('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 100,
              ...(() => { const _sys = buildSystemPrompt(); return { system: _sys, systemParts: buildSystemPromptParts(_sys) }; })(),
              messages: [...chatHistory.slice(-6), {
                role: 'user',
                content: `[A few days later, 「${delivery.name}」 crosses his mind again.

Just a line.

It should reference the item clearly —
what it was, how it felt, or something specific about it.

Not vague.
Not floating.

No full explanation.
But clear enough to know exactly what he means.

]`
              }]
            })
          });
          const data3 = await res3.json();
          const reply3 = data3.content?.[0]?.text?.trim() || '';
          if (reply3) {
            appendMessage('bot', reply3);
            chatHistory.push({ role: 'assistant', content: reply3 });
            saveHistory();
          }
        } catch(e) {}
      }, delay);
    }
  } catch(e) {}
}

function showMysteryPackage(delivery) {
  // secret模式：Ghost悄悄说一句"check the door"
  if (delivery.isSecretDelivery && !delivery._secretRevealed) {
    delivery._secretRevealed = true;
    setTimeout(() => {
      const phrases = [
        "check the door.\n去看看门。",
        "something might've arrived.\n可能到了点东西。",
        "go check outside.\n去门口看看。",
      ];
      const line = phrases[Math.floor(Math.random() * phrases.length)];
      appendMessage('bot', line);
    }, 2000);
  }
  // 商城顶部显示神秘包裹提示
  const tracker = document.getElementById('deliveryTracker');
  if (tracker) {
    tracker.style.display = 'block';
    const mysteryTag = document.createElement('span');
    mysteryTag.className = 'delivery-tag';
    mysteryTag.style.cssText = 'background:rgba(255,240,255,0.9);border-color:rgba(192,132,252,0.5);color:#7c3aed;';
    mysteryTag.innerHTML = `<span class="delivery-tag-dot" style="background:#7c3aed"></span>📬 来自英国的包裹`;
    mysteryTag.onclick = () => showToast('包裹正在派送，快收到啦～');
    tracker.appendChild(mysteryTag);
  }

  // 弹窗通知用户有快递到了
  setTimeout(() => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:9998;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.3s ease;';
    overlay.innerHTML = `
      <div style="background:rgba(255,255,255,0.97);backdrop-filter:blur(20px);border-radius:24px;padding:28px 24px;max-width:300px;width:88%;text-align:center;box-shadow:0 16px 48px rgba(139,92,246,0.2);border:1.5px solid rgba(168,85,247,0.15);">
        <div style="font-size:48px;margin-bottom:12px;">📦</div>
        <div style="font-size:16px;font-weight:700;color:#3b0764;margin-bottom:8px;">有快递到了</div>
        <div style="font-size:13px;color:rgba(109,40,217,0.6);margin-bottom:20px;line-height:1.6;">来自英国的包裹已送达<br>去商城签收一下？</div>
        <div style="display:flex;gap:10px;">
          <button onclick="this.closest('div[style*=fixed]').remove()" style="flex:1;padding:11px;border-radius:12px;border:1.5px solid rgba(168,85,247,0.25);background:rgba(168,85,247,0.06);color:#7c3aed;font-size:14px;font-weight:600;cursor:pointer;">待会再说</button>
          <button onclick="this.closest('div[style*=fixed]').remove();openScreen('shopScreen');" style="flex:1;padding:11px;border-radius:12px;border:none;background:linear-gradient(135deg,#a855f7,#ec4899);color:white;font-size:14px;font-weight:600;cursor:pointer;">去签收</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }, 1500);

  // 签收后Sonnet生成台词
  setTimeout(async () => {
    try {
      const res = await fetchWithTimeout('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          ...(() => { const _sys = buildSystemPrompt(); return { system: _sys, systemParts: buildSystemPromptParts(_sys) }; })(),
          messages: [...chatHistory.slice(-10), {
            role: 'user',
            content: `[He sent something — 「${delivery.name}」. She just received it.${delivery.productData?.tip ? ' ' + delivery.productData.tip : ''}

He doesn't always say it was him.

Sometimes he admits it.
Short. Casual. Like it wasn't a big deal.

Sometimes he doesn't.
Lets it sit. Doesn't confirm it.

If she asks, he goes with whatever feels right.

He stays a little too close to it.
Acts like it's nothing.

But he's paying attention.]`
          }]
        })
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text?.trim() || '';
      if (reply) {
        appendMessage('bot', reply);
        chatHistory.push({ role: 'assistant', content: reply });
        saveHistory();
      }
      // 用户收到 Ghost 补偿反寄 → 弹草稿
      if (delivery.productData?.lostReplace || delivery.noLost) {
        setTimeout(() => {
          const evt = {
            type: 'gift_received', actor: 'user',
            meta: { itemName: delivery.name, isReplace: true }
          };
          showUserDraftCard(evt);
        }, 4000);
      }
    } catch(e) {}
  }, 2000);
}

// 快递遗失赔偿（用户在聊天里提到）
async function handleLostPackageClaim(userText) {
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  const lostItems = deliveries.filter(d => d.isLostConfirmed && !d.compensated);
  if (lostItems.length === 0) return false;

  const keywords = ['快递','丢了','遗失','没到','包裹','寄的'];
  if (!keywords.some(k => userText.includes(k))) return false;

  const d = lostItems[0];
  const price = d.productData?.price || 0;

  // Haiku判断Ghost是否知道这个快递
  try {
    const knewAbout = chatHistory.slice(-20).some(m =>
      m.role === 'user' && (m.content.includes(d.name) || m.content.includes('快递') || m.content.includes('寄'))
    );

    const isLuxuryLost = price >= 3000;
    const contextPrompt = isLuxuryLost
      ? `[She told him 「${d.name}」 got lost.

He didn't even know it was coming.

Now he does.

And what it cost her.

That lands.

More than he lets on.

He doesn't show much of it.

Just a pause.

Then he takes it off her.

Doesn't let it stay her problem.]`
      : knewAbout
      ? `[She told him 「${d.name}」 got lost.

He already knew it was coming.

He doesn't like that.

Not the loss.
The fact it didn't reach him.

A brief edge —
at the delivery, at the situation.

Then it settles.

He doesn't make her feel worse about it.

Says less than he could.

Keeps it simple.

If anything, he closes it himself.
He makes sure it doesn't stay her problem.]`
      : `[She told him 「${d.name}」 got lost.

He didn't even know it was coming.

That lands first.

A short pause.

Then it shifts.

He doesn't make a thing out of it.

Keeps it simple.

Doesn't let her sit with it.

Closes it himself.]`;

    chatHistory.push({ role: 'user', content: contextPrompt });
    showTyping();

    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        ...(() => { const _sys = buildSystemPrompt(); return { system: _sys, systemParts: buildSystemPromptParts(_sys) }; })(),
        messages: chatHistory.slice(-20)
      })
    });
    const data = await res.json();
    hideTyping();
    const reply = data.content?.[0]?.text?.trim() || '';
    appendMessage('bot', reply);
    chatHistory.push({ role: 'assistant', content: reply });
    saveHistory();

    // 赔偿
    if (price >= 500) {
      const compensation = Math.round(price * 0.5);
      setTimeout(() => {
        setBalance(getBalance() + compensation);
        addTransaction({ icon: '💷', name: `快递遗失赔偿 · ${d.name}`, amount: compensation });
        renderWallet();
        const container = document.getElementById('messagesContainer');
        if (container) showGhostTransferCard(container, compensation, '', false);
        // 存入 _transfer 以便重新进入时重建卡片
        chatHistory.push({ role: 'assistant', content: `[快递遗失赔偿 £${compensation}]`, _transfer: { amount: compensation, isRefund: false } });
        saveHistory();
        d.compensated = true;
        // 3000以上触发反寄
        if (price >= 3000 && d.productData?.lostReplace) {
          setTimeout(() => {
            const replace = d.productData.lostReplace;
            addDelivery({ ...replace, price: price, shipping: 35, noLost: true }, true, true);
            showToast('📬 Ghost说他会补寄一个');
          }, (Math.floor(Math.random() * 3) + 3) * 24 * 3600 * 1000);
        }
        localStorage.setItem('deliveries', JSON.stringify(deliveries));
      }, 3000);
    }
    return true;
  } catch(e) { hideTyping(); return false; }
}

function renderDeliveryTracker() {
  const tracker = document.getElementById('deliveryTracker');
  if (!tracker) return;
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  // 所有进行中的包裹，secret模式在最后阶段前隐藏
  const now48 = Date.now();
  const active = deliveries.filter(d => {
    if (d.done) return false;
    if (d.lostTicketExpired) return false;
    // 丢失超过48小时自动消失
    if (d.isLostConfirmed && d.lostConfirmedAt && now48 - d.lostConfirmedAt > 48 * 3600 * 1000) return false;
    if (d.isSecretDelivery) {
      return d.currentStage >= d.stages.length - 2;
    }
    return true;
  });
  if (active.length === 0) { tracker.style.display = 'none'; return; }
  tracker.style.display = 'block';

  const MAX_VISIBLE = 3;
  const showAll = tracker.dataset.expanded === 'true';
  const visible = showAll ? active : active.slice(0, MAX_VISIBLE);
  const hasMore = active.length > MAX_VISIBLE;

  tracker.innerHTML = visible.map((d, idx) => {
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
      ${d.isLostConfirmed ? `<span onclick="event.stopPropagation();dismissDelivery(${d.id})" style="margin-left:4px;font-size:10px;color:#ef4444;cursor:pointer;">✕</span>` : ''}
    </span>`;
  }).join('') + (hasMore ? `<span class="delivery-tag" onclick="event.stopPropagation();document.getElementById('deliveryTracker').dataset.expanded=document.getElementById('deliveryTracker').dataset.expanded==='true'?'false':'true';renderDeliveryTracker();" style="color:#a855f7;font-size:11px;cursor:pointer;">
    ${showAll ? '收起' : '+'+( active.length - MAX_VISIBLE)+'条'}
  </span>` : '');
}

function openDeliveryModal(idx) {
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  const now48 = Date.now();
  const active = deliveries.filter(d => {
    if (d.done || d.lostTicketExpired) return false;
    if (d.isLostConfirmed && d.lostConfirmedAt && now48 - d.lostConfirmedAt > 48 * 3600 * 1000) return false;
    if (d.isSecretDelivery) return d.currentStage >= d.stages.length - 2;
    return true;
  });
  const d = active[idx];
  if (!d) return;
  document.getElementById('deliveryModalTitle').textContent = d.emoji + ' ' + d.name;
  let html = '';
  if (d.isLostConfirmed) {
    html += `<div style="background:rgba(255,220,220,0.8);border:1px solid rgba(220,80,80,0.3);border-radius:12px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#b91c1c;text-align:center;">
      ❌ 此包裹已在运输途中遗失
    </div>`;
  }
  html += d.stages.map((stage, i) => {
    const isDone = i <= d.currentStage;
    const isCurrent = i === d.currentStage && !d.done;
    const isLostHere = d.isLostConfirmed && i === d.lostAtStage;
    const color = isLostHere ? '#ef4444' : isDone ? '#a855f7' : '#d1d5db';
    return `<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:14px;">
      <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">
        <div style="width:20px;height:20px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:10px;color:white;">${isLostHere?'✕':isDone?'✓':isCurrent?'●':'○'}</div>
        ${i < d.stages.length-1 ? `<div style="width:2px;height:20px;background:${isDone?'#a855f7':'#e5e7eb'};margin-top:2px;"></div>` : ''}
      </div>
      <div style="flex:1;padding-top:2px;">
        <div style="font-size:12px;font-weight:${isCurrent?700:500};color:${isCurrent?'#3a1a60':'#9ca3af'};">${stage.status}</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:2px;font-style:italic;">${stage.en}</div>
      </div>
    </div>`;
  }).join('');
  document.getElementById('deliveryModalContent').innerHTML = html;
  document.getElementById('deliveryModal').style.display = 'flex';
  // 已送达或遗失的快递显示"确认收货"按钮
  const dismissBtn = document.getElementById('deliveryDismissBtn');
  if (dismissBtn) {
    if (d.done || d.isLostConfirmed) {
      dismissBtn.style.display = '';
      dismissBtn.dataset.deliveryId = d.id;
      dismissBtn.textContent = d.isLostConfirmed ? '已知晓 ✓' : '确认收货 ✓';
    } else {
      dismissBtn.style.display = 'none';
    }
  }
}

function closeDeliveryModal() {
  document.getElementById('deliveryModal').style.display = 'none';
}

function confirmDeliveryReceived() {
  const btn = document.getElementById('deliveryDismissBtn');
  const id = parseInt(btn?.dataset.deliveryId || '0');
  if (id) dismissDelivery(id);
  closeDeliveryModal();
}

function dismissDelivery(id) {
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  const idx = deliveries.findIndex(d => d.id === id);
  if (idx !== -1) {
    deliveries[idx].lostTicketExpired = true;
    deliveries[idx].done = true;
    localStorage.setItem('deliveries', JSON.stringify(deliveries));
    renderDeliveryTracker();
  }
}

