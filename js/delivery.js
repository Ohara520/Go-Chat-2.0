// ===================================================
// delivery.js — 快递系统
//
// 职责：
// - addDelivery()              创建快递（用户寄给Ghost）
// - addGhostReverseDelivery()  Ghost反寄
// - checkDeliveryUpdates()     检查快递进度
// - onGhostReceived()          Ghost收到用户寄的东西
// - showMysteryPackage()       显示神秘包裹
// - （已退役）handleLostPackageClaim() 旧丢件赔偿
// - renderDeliveryTracker()    渲染快递追踪UI
// - openDeliveryModal()        打开快递详情弹窗
//
// AI Generation 已退役（2026-10-07）：
// - Chain A: Ghost 发货通知自动生成
// - Chain B: 签收反应自动生成（DeepSeek/Haiku）
// - Chain C: 3-5 天强制回忆 timer
// Delivery 事实现通过 Continuity 提供给 Simon 主模型，由其自主决定反应
//
// 依赖：wallet.js / state.js / persona.js / events.js / feed.js / continuity.js
// ===================================================


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 反寄系统总开关（临时关闭）
// 反寄寄出的仍是老版 emoji 形式的商品，与 V1 商城的真实商品图不一致，
// 暂时关闭整条反寄通道；等反寄接入真实商品后，把这里改回 true 即可整体恢复。
// 关闭时：不寄出、不播报"寄了东西"、不排队攒 pending，避免画饼。
// 用户寄给 Ghost / 用户自购 / 签收 / 遗失赔偿等其余快递功能不受影响。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
window.REVERSE_DELIVERY_ENABLED = false;


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildDeliveryContext — 构建当前相关的快递事实（供 ghostContext.js 注入）
// 只提供客观事实，不包含任何行为指令
// 使用 isGhostSend 作为唯一方向标识
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildDeliveryContext() {
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  if (!deliveries.length) return '';

  const now = Date.now();
  const RECENT_WINDOW = 7 * 24 * 3600 * 1000; // 7 天内的快递

  // 筛选近期相关快递：在途 + 近 7 天已送达
  const relevant = deliveries.filter(d => {
    if (d.voided) return false;
    if (d.isLostConfirmed) return false;
    if (!d.done) return true; // 在途
    if (d.doneAt && (now - d.doneAt) <= RECENT_WINDOW) return true; // 近期送达
    return false;
  });

  if (!relevant.length) return '';

  const lines = [];
  lines.push('[DELIVERY FACTS]');
  lines.push('');

  const inTransit = relevant.filter(d => !d.done);
  const arrived = relevant.filter(d => d.done);

  if (inTransit.length) {
    lines.push('In transit:');
    inTransit.forEach(d => {
      if (d.isGhostSend) {
        // Simon → 用户
        lines.push(`- You sent her 「${d.name}」. It is on its way, not yet delivered.`);
      } else {
        // 用户 → Simon
        lines.push(`- She sent you 「${d.name}」. It is on its way, not yet delivered.`);
      }
    });
    if (arrived.length) lines.push('');
  }

  if (arrived.length) {
    lines.push('Recently delivered:');
    arrived.forEach(d => {
      const daysAgo = Math.floor((now - d.doneAt) / (24 * 3600 * 1000));
      const timeStr = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;

      if (d.isGhostSend) {
        // Simon → 用户：已送达，但不知道她是否打开/喜欢
        lines.push(`- You sent her 「${d.name}」. It was delivered ${timeStr}.`);
        lines.push(`  (Delivered means it reached her. You do not know if she opened it, used it, or what she thinks of it unless she tells you.)`);
      } else {
        // 用户 → Simon：已送达并签收
        lines.push(`- She sent you 「${d.name}」. It arrived ${timeStr}.`);
      }
    });
  }

  return lines.join('\n');
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
  // voided（Migration B 作废的资产/特殊物流）视为终态，不占在途名额。
  const pending  = deliveries.filter(d => !d.done && !d.isLostConfirmed && !d.voided);
  const finished = deliveries.filter(d => d.done || d.isLostConfirmed || d.voided).slice(0, limitDone);
  localStorage.setItem('deliveries', JSON.stringify([...pending, ...finished]));
}

// Phase 2：新增可选第4参 purchaseId，把这条快递关联回它的 Purchase Fact。
// 旧调用方不传即为 null，行为完全不变。返回刚创建的 delivery，供上游回填 deliveryId。
function addDelivery(product, isGhostSend, isLuxury, purchaseId) {
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
  const isLost     = canLost && Math.random() < 0.03;
  const lostAtStage = isLost ? Math.floor(Math.random() * 3) + 1 : -1;

  const delivery = {
    id: now + '_' + Math.random().toString(36).slice(2, 8),
    // Phase 2：Purchase↔Delivery 顶层关联。非 Mall 购买路径（反寄/自愈补发）为 null。
    purchaseId: purchaseId || null,
    productId: typeof getProductId === 'function'
      ? getProductId(product)
      : (product.id || null),
    image: product.id
      ? ('images/products/' + product.id + '.png')
      : '',
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
  return delivery;
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

// 返回 true=已下单，false=被拦截未下单。调用方（尤其是用户明确索要的路径）
// 必须依据返回值决定是否播报"已寄出"，否则会出现"嘴上说寄了、系统没寄"的画饼。
function addGhostReverseDelivery(item, emotionType) {
  // 反寄总开关关闭：直接不寄，返回 false 让上游不要播报"已寄出"。
  if (window.REVERSE_DELIVERY_ENABLED === false) return false;

  // 用户明确索要（explicit_request）不受惊喜冷却限制——上游已用每周配额节流。
  // 惊喜类（情绪/特产）才共用 7 天全局冷却，保证稀有。
  const isExplicitRequest = emotionType === 'explicit_request';

  if (!isExplicitRequest) {
    // 统一惊喜冷却：7天内只主动寄一次（情绪 + 特产共用）
    const lastAnyReverse = parseInt(localStorage.getItem('lastAnyReverseAt') || '0');
    if (Date.now() - lastAnyReverse < 7 * 24 * 3600 * 1000) return false;
  }

  if (!isExplicitRequest && typeof canTriggerReverseDelivery === 'function' && !canTriggerReverseDelivery()) return false;
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

  // 创建反寄快递记录（isGhostSend = true）
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

  // 追踪条立刻刷新
  if (typeof renderDeliveryTracker === 'function') renderDeliveryTracker();

  // Chain A retired: 不再由 DeepSeek 自动生成发货通知台词
  // Delivery 事实已记录，物流 UI 正常显示，Simon 主模型可通过 Continuity 读取事实后自主决定是否提及

  return true;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 检查快递进度
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function checkDeliveryUpdates() {
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  let updated = false;
  const now   = Date.now();

  deliveries.forEach(d => {
    if (d.done || d.isLostConfirmed || d.voided) return; // voided=资产/特殊错误物流，不推进/不签收
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
              const _note = `You sent her 「${d.name}」 on ${_dateStr}${_reasonTag}. It was delivered.`;
              if (!_ltm.includes(d.name)) {
                const _ltmLines = (_ltm + '\n' + _note).trim().split('\n').filter(l => l.trim());
                const _ltmTrimmed = _ltmLines.length > 30 ? _ltmLines.slice(-30).join('\n') : _ltmLines.join('\n');
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
              const _d = new Date(d.doneAt);
              const _dateStr = `${_d.getMonth()+1}/${_d.getDate()}`;
              const _note = `She sent you 「${d.name}」. You received it on ${_dateStr}.`;
              if (!_ltm.includes(d.name)) {
                const _ltmLines = (_ltm + '\n' + _note).trim().split('\n').filter(l => l.trim());
                const _ltmTrimmed = _ltmLines.length > 30 ? _ltmLines.slice(-30).join('\n') : _ltmLines.join('\n');
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

  const container = document.getElementById('messagesContainer');
  if (!container) {
    // 不在聊天页面，存起来下次触发
    const pending = JSON.parse(localStorage.getItem('pendingDeliveryReactions') || '[]');
    if (!pending.some(p => p.delivery && p.delivery.id === delivery.id)) {
      pending.push({ delivery, savedAt: Date.now() });
      localStorage.setItem('pendingDeliveryReactions', JSON.stringify(pending));
    }
    return;
  }

  // 到这里说明在聊天页、确定要执行副作用了，此刻才设去重标记
  localStorage.setItem(_dedupKey, Date.now().toString());

  const pd = delivery.productData;
  showToast(`✅ ${delivery.emoji} ${delivery.name} Ghost已签收！`);
  _addDeliveryNotice({ id: 'recv_' + delivery.id, type: 'ghost_received', itemName: delivery.name, itemEmoji: delivery.emoji || '📦' });

  // Chain B retired: 不再由后台模型自动生成签收反应台词
  // Delivery 事实已通过 Continuity 系统提供给 Simon 主模型，由其自主决定是否反应及如何表达

  try {
    // 好感度（普通商品）
    if (!pd.isLuxury) {
      changeAffection(pd.price > 500 ? 2 : 1);
    }

    // Feed 事件候选（真实签收后，不区分普通/奢侈品）
    if (typeof feedEvent_deliveryReceived === 'function') {
      feedEvent_deliveryReceived(delivery.name, delivery.emoji || '📦', delivery.id, delivery.doneAt);
    }

    // 时间线：记录贵重礼物（≥£1000）
    if (pd.price >= 1000 && typeof addTimelineEvent === 'function') {
      addTimelineEvent({
        type: 'gift_received',
        amount: pd.price,
        relatedData: { itemName: delivery.name, isLuxury: pd.isLuxury }
      });
    }

    // 奢侈品额外好感度
    if (pd.isLuxury) {
      changeAffection(pd.price > 3000 ? 5 : 3);
      if (pd.isGhostGift && typeof feedEvent_giftReceived === 'function') {
        feedEvent_giftReceived(pd.name, 'ghost');
      }
      setTimeout(() => {
        if (typeof maybeTriggerFeedPost === 'function') {
          maybeTriggerFeedPost('event_arrived');
        }
      }, 1000);
    }

    // Chain C retired: 删除 3-5 天强制回忆 timer
    // Simon 主模型将通过自然记忆和 Continuity 事实自主决定是否在后续对话中提及

  } catch(e) {}
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 显示神秘包裹（Ghost寄给用户）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function showMysteryPackage(delivery) {
  renderDeliveryTracker();

  // Chain A retired: 不再由后台模型自动生成发货通知台词
  // Delivery 事实已通过 Continuity 系统提供给 Simon 主模型，由其自主决定是否提及

  // 写入通知（商城卡片提示，进商城后弹礼物盒）
  _addDeliveryNotice({
    id:        'arrived_' + delivery.id,
    type:      'package_arrived',
    itemName:  delivery.name,
    itemEmoji: delivery.emoji || '📦',
    fromCity:  localStorage.getItem('currentLocation') || 'UK',
  });

  showToast('📦 有来自 Ghost 的包裹！去商城查看');

  // 旧版"补寄/置换快递后弹草稿让用户选文案发布"机制已退役，不再主动弹窗。
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 用户本轮物流表述分类（纯文本，不读 deliveries / isLostConfirmed）
// 返回：'' | 'not_arrived' | 'suspected_lost' | 'confirmed_lost'
// 认知线与物流真值线在此彻底分离：这里只解析用户这轮说了什么。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function classifyUserDeliveryClaim(text) {
  const t = (text || '').toLowerCase();

  const pkgRef    = /快递|包裹|寄|物流|快件|parcel|package|delivery|shipment/.test(t);
  const lostWord  = /丢|遗失|lost|missing/.test(t);
  const notArrive = /还没到|没到|没收到|还没收到|一直没|迟迟没|怎么还没|didn'?t arrive|hasn'?t arrived|not arrived|not here yet|still not here/.test(t);
  // 猜测/询问标记：任何一个命中即视为"不确定"，向 suspected 降级（安全方向）
  const guessing  = /是不是|会不会|该不会|是否|难道|莫非|不会.*吧|.*吧[?？]?$|吗|[?？]/.test(t);

  // 顺序即优先级：询问永远压过陈述，"没到"永远升不成"丢"
  if (lostWord && guessing) return 'suspected_lost';  // 在猜/问是否遗失
  if (lostWord && pkgRef)   return 'confirmed_lost';  // 明确陈述遗失（需包裹上下文）
  if (notArrive && pkgRef)  return 'not_arrived';     // 只说还没到
  return '';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 快递遗失赔偿（旧机制已退役）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 旧的 handleLostPackageClaim() 已整体删除：固定 £50 / 50% 赔偿、
// showGhostTransferCard、[快递遗失赔偿 £X]、lostReplace 自动补寄、
// 相关 wallet 写入与 timer/toast 全部退役。
// 物流真值字段 isLost / lostAtStage / isLostConfirmed / lostConfirmedAt 保留，
// 仍供物流推进、追踪 UI、48h 展示窗口使用。


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 申请快递理赔 V1（确定性原路退款，processing → paid）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 纯物流流程：不产生 Ghost 对话、不改 Ghost Awareness、不退 shipping。
// 退款按 purchaseId → fact.payer 分三路：
//   user     → setBalance + addTransaction（真实退回用户余额）
//   ghost    → Ghost Card 对称冲减：balance += 退款 且 spentThisMonth -= 退款(不低于0)
//   ghost_pay→ 只记 claimNote，不动 User Balance / 不动 Ghost Card / 不建 bank
// 老包裹（无 purchaseId / fact.payer）不开放理赔，不猜测支付方向。

// 判断一条丢件是否可理赔，并解析赔付方向。返回给 UI 用于渲染按钮/信息行。
// { eligible, payer, price, refund, reason, claimStatus }
function getDeliveryClaimInfo(d) {
  const price = (d && d.productData && typeof d.productData.price === 'number') ? d.productData.price : 0;
  const claimStatus = (d && d.claimStatus) || null;
  const out = { eligible: false, payer: null, price, refund: price, reason: '', claimStatus };

  if (!d || !d.isLostConfirmed) { out.reason = 'not_lost'; return out; }

  // 已理赔 / 正在理赔：不再可申请，但要把状态透传给 UI
  if (claimStatus === 'paid' || claimStatus === 'processing') {
    out.payer = d.claimPayer || null;
    out.refund = (typeof d.claimRefund === 'number') ? d.claimRefund : price;
    return out;
  }

  // 老包裹：无 purchaseId → 不开放（不猜测支付方向）
  if (!d.purchaseId || typeof getPurchaseFacts !== 'function') { out.reason = 'no_purchase'; return out; }
  const fact = getPurchaseFacts().find(f => f && f.purchaseId === d.purchaseId);
  if (!fact || !fact.payer) { out.reason = 'no_payer'; return out; }

  out.payer = fact.payer;
  out.eligible = price > 0;
  if (!out.eligible) out.reason = 'no_price';
  return out;
}

// 执行理赔：写 processing → 实际原路退款成功 → 立即写 paid。
// 无人为延迟；同步退款，UI transition 自然表现即可。
// 返回：'paid' | 'processing_only' | 'ineligible' | 'already'
function claimDelivery(id) {
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  const idx = deliveries.findIndex(d => d && d.id === id);
  if (idx === -1) return 'ineligible';
  const d = deliveries[idx];

  // 幂等保护：已 paid / processing 直接返回，绝不二次退款
  if (d.claimStatus === 'paid') return 'already';
  if (d.claimStatus === 'processing') return 'already';

  const info = getDeliveryClaimInfo(d);
  if (!info.eligible || !info.payer) return 'ineligible';

  const refund = info.refund;
  const payer  = info.payer;

  // 1) 先写 processing 落盘（此刻钱还没退，若中途异常也不会误判已赔）
  d.claimStatus = 'processing';
  d.claimStartedAt = Date.now();
  d.claimPayer = payer;
  d.claimRefund = refund;
  deliveries[idx] = d;
  localStorage.setItem('deliveries', JSON.stringify(deliveries));

  // 2) 实际原路退款（同步）
  let refunded = false;
  try {
    if (payer === 'user') {
      if (typeof setBalance === 'function' && typeof getBalance === 'function') setBalance(getBalance() + refund);
      if (typeof addTransaction === 'function') addTransaction({ icon: '📦', name: `快递理赔 · ${d.name}`, amount: refund });
      refunded = true;
    } else if (payer === 'ghost') {
      // Ghost Card 对称冲减：完全逆转 spendGhostCard 的 balance-- 与 spentThisMonth++
      if (typeof getGhostCard === 'function' && typeof saveGhostCard === 'function') {
        const card = getGhostCard();
        card.balance = Math.round((card.balance || 0) + refund);
        card.spentThisMonth = Math.max(0, Math.round((card.spentThisMonth || 0) - refund));
        saveGhostCard(card);
        if (typeof addTransaction === 'function') {
          addTransaction({ icon: '💳', name: `Ghost Card 理赔冲减 · ${d.name}`, amount: refund, ghostCard: true });
        }
        refunded = true;
      }
    } else if (payer === 'ghost_pay') {
      // Ghost 买单：不是账户余额，不退钱，只记录原路退回付款账户
      d.claimNote = '已原路退回付款账户';
      refunded = true;
    }
  } catch (e) { refunded = false; }

  if (typeof renderWallet === 'function') { try { renderWallet(); } catch (e) {} }

  // 3) 退款成功 → 立即写 paid（不用 setTimeout 制造假处理时间）
  if (refunded) {
    d.claimStatus = 'paid';
    d.claimedAt = Date.now();
    deliveries[idx] = d;
    localStorage.setItem('deliveries', JSON.stringify(deliveries));
    if (typeof touchLocalState === 'function') touchLocalState();
    if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
    return 'paid';
  }

  // 退款失败 → 保留 processing，不写 paid（下次可重试，不会误退）
  localStorage.setItem('deliveries', JSON.stringify(deliveries));
  return 'processing_only';
}

window.getDeliveryClaimInfo = getDeliveryClaimInfo;
window.claimDelivery = claimDelivery;


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 渲染快递追踪UI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderDeliveryTracker() {
  // Delivery V1 的「我的快递」页面已接管物流展示。
  // 保留函数与所有调用点，仅停止在 NOA MARKET 顶部渲染旧物流条。
  const tracker = document.getElementById('deliveryTracker');
  if (tracker) {
    tracker.style.display = 'none';
    tracker.innerHTML = '';
  }
  return;

  // eslint-disable-next-line no-unreachable
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
        const hasActive = JSON.parse(localStorage.getItem('deliveries') || '[]').some(d => !d.done && !d.isLostConfirmed && !d.voided);
        if (hasActive && typeof checkDeliveryUpdates === 'function') checkDeliveryUpdates();
      } catch(e) {}
    }, 60000);
  }
}
