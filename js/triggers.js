// ============================================================
// triggers.js — 回复后副作用检测
//
// 职责：每轮对话结束后的三重判断
//   1. mood_change  — Ghost心情微变化
//   2. market       — 商城高亮触发（Ghost暗示缺少某样东西）
//   3. emotion      — 情绪反寄触发（用户情绪触发Ghost悄悄寄东西）
//   + checkLocationSpecialTrigger — 地点特产反寄（来自 events.js）
//
// 依赖：api.js、state.js、delivery.js、events.js
// 注意：checkLocationSpecialTrigger 定义在 events.js，这里直接调用
// ============================================================


// ── 商城触发分类表 ────────────────────────────────────────
const MARKET_TRIGGER_CATS = {
  '保暖类': {
    products: ['苏格兰格纹围巾','厚实连帽卫衣','Cashmere羊绒毛衣','Barbour蜡质夹克','Gore-Tex冲锋衣'],
    reason: '为他推荐 🧣'
  },
  '饮食类': {
    products: ['精品咖啡豆礼盒','苏格兰高地蜂蜜套装','比利时限量松露巧克力','苏格兰威士忌（12年）','格兰诺拉营地早餐礼盒','多产区精装茶叶礼盒','英式真空培根香肠礼盒'],
    reason: '为他推荐 🍫'
  },
  '疲惫类': {
    products: ['香薰蜡烛','男士护肤套装','Stanley保温水壶','便携咖啡滤杯套装'],
    reason: '为他推荐 🕯️'
  },
  '思念类': {
    products: ['情侣吊坠','定制相框','永生玫瑰','音乐盒','定制军牌','合照相册','定制地图'],
    reason: '为他推荐 💍'
  },
  '卫生类': {
    products: ['男士护肤套装','Tom Ford 剃须套装','CK内裤','Merino羊毛T恤'],
    reason: '为他推荐 🧴'
  },
};

// ── 商城触发辅助函数 ──────────────────────────────────────
function getProductTrigger(name) {
  const triggered = JSON.parse(localStorage.getItem('marketTriggered') || '{}');
  const item = triggered[name];
  if (!item) return null;
  if (Date.now() - item.timestamp > 3 * 24 * 3600 * 1000) return null; // 3天冷却
  return item.reason;
}

function clearProductTrigger(name) {
  const triggered = JSON.parse(localStorage.getItem('marketTriggered') || '{}');
  const reason = triggered[name]?.reason;
  if (reason) {
    Object.keys(triggered).forEach(k => {
      if (triggered[k]?.reason === reason) delete triggered[k];
    });
  }
  localStorage.setItem('marketTriggered', JSON.stringify(triggered));
}

// ── 私密商品高亮辅助函数 ──────────────────────────────────
function getIntimateProductTrigger(name) {
  const triggered = JSON.parse(localStorage.getItem('intimateTriggered') || '{}');
  const item = triggered[name];
  if (!item) return null;
  if (Date.now() - item.timestamp > 5 * 24 * 3600 * 1000) return null; // 5天冷却
  return item.reason;
}

function clearIntimateProductTrigger(name) {
  const triggered = JSON.parse(localStorage.getItem('intimateTriggered') || '{}');
  delete triggered[name];
  localStorage.setItem('intimateTriggered', JSON.stringify(triggered));
}

// ── 私密商品高亮触发 ──────────────────────────────────────
async function checkIntimateHighlight(userText, botReply) {
  // 预筛：本轮或最近几条有 _intimate 标记才调模型
  const hasIntimate = chatHistory.slice(-6).some(m => m._intimate);
  if (!hasIntimate) return;

  // 5天冷却
  const lastAt = parseInt(localStorage.getItem('intimateHighlightAt') || '0');
  if (Date.now() - lastAt < 5 * 24 * 3600 * 1000) return;

  try {
    const raw = await fetchDeepSeek(
      `你是一个情绪判断器。只返回JSON，不要其他文字。
Ghost replied: "${botReply.slice(0, 200)}"
Did Ghost show clear desire or wanting — through implication, tension, or controlled restraint? Answer only JSON: {"desire": true} or {"desire": false}`,
      `判断`,
      30
    );
    const result = safeParseJSON(raw);
    if (!result?.desire) return;
  } catch(e) { return; }

  localStorage.setItem('intimateHighlightAt', Date.now());

  // 随机选1件私密商品高亮
  const pool = (typeof MARKET_PRODUCTS !== 'undefined' && MARKET_PRODUCTS.intimate) || [];
  const purchased = JSON.parse(localStorage.getItem('purchasedItems') || '[]');
  const available = pool.filter(p => !purchased.includes(p.name));
  if (available.length === 0) return;

  const picked = available[Math.floor(Math.random() * available.length)];
  const triggered = JSON.parse(localStorage.getItem('intimateTriggered') || '{}');
  triggered[picked.name] = { reason: '他很想要你', timestamp: Date.now() };
  localStorage.setItem('intimateTriggered', JSON.stringify(triggered));
}


// ============================================================
// 核心：checkTriggersAndEmotion
// 每轮25%概率触发（由sendMessage.js控制）
// 修复：地点特产调用从 checkLocationSpecial(userText, botText)
//       改为 checkLocationSpecialTrigger(userText)（来自events.js）
// ============================================================

async function checkTriggersAndEmotion(userText, botText) {

  // ── 跳过太短的消息 ──
  if (userText.length < 4) {
    if (typeof checkLocationSpecialTrigger === 'function') {
      checkLocationSpecialTrigger(userText).catch(() => {});
    }
    return;
  }

  try {
    // ── 三重判断：用 Haiku，不再预筛关键词，直接让模型判断 ──
    const raw = await fetchDeepSeek(
      `你是一个三重判断器。只返回JSON，不要其他文字。
1. 判断Ghost的回复是否暗示他需要/缺少某样东西，返回market字段
2. 判断用户的消息透露了什么情绪，返回emotion字段。宁可判true——只要用户有任何情绪波动（开心、难过、累、想念、焦虑、生病等），都算triggered。不需要用户明确说出关键词。
3. 判断这次对话后Ghost的心情变化，返回mood_change字段

mood_change规则：
用户真的生气/冷漠/拒绝/说很伤人的话 → -1
用户撒娇式吵架/开玩笑/正常拌嘴 → 0
用户说了温暖/感动的话 → 1

格式：{"market":{"triggered":false},"emotion":{"triggered":false},"mood_change":0}
market分类：保暖类/饮食类/疲惫类/思念类/卫生类
emotion类型：开心/难过/委屈/饥饿/劳累/压力大/生病/太冷/太热/思念
emotion强度：轻/中/重`,
      `Ghost说：${botText}\n用户说：${userText}`,
      180
    );

    const result = safeParseJSON(raw);
    if (!result) return;

    // ── 1. mood变化 ───────────────────────────────────────
    if (result.mood_change && result.mood_change !== 0) {
      changeMood(result.mood_change);
    }

    // ── 2. 商城高亮触发 ───────────────────────────────────
    if (result.market?.triggered) {
      const cat = MARKET_TRIGGER_CATS[result.market.category];
      if (cat) {
        const triggered = JSON.parse(localStorage.getItem('marketTriggered') || '{}');
        const purchased = JSON.parse(localStorage.getItem('purchasedItems') || '[]');
        const now = Date.now();
        const cooldownMs = 3 * 24 * 3600 * 1000;

        const availableProducts = cat.products.filter(name => !purchased.includes(name));
        if (availableProducts.length === 0) return;

        const alreadyTriggered = availableProducts.some(
          name => triggered[name] && now - triggered[name].timestamp < cooldownMs
        );
        if (!alreadyTriggered) {
          availableProducts.forEach(name => {
            triggered[name] = { reason: cat.reason, timestamp: now };
          });
          localStorage.setItem('marketTriggered', JSON.stringify(triggered));
        }
      }
    }

    // ── 3. 情绪反寄触发 ───────────────────────────────────
    if (result.emotion?.triggered) {
      const type      = result.emotion.type;
      const intensity = result.emotion.intensity;

      // 3天冷却（同类型情绪）
      const coolKey  = 'reverseShipCool_' + type;
      const lastTime = parseInt(localStorage.getItem(coolKey) || '0');
      if (Date.now() - lastTime < 3 * 24 * 3600 * 1000) return;

      // 概率：轻60% 中80% 重95%
      const probMap = { '轻': 0.60, '中': 0.80, '重': 0.95 };
      const prob = probMap[intensity] || 0.50;
      if (Math.random() > prob) return;

      // 从礼物池抽取，去重
      const pool = (typeof GHOST_REVERSE_POOL !== 'undefined') ? GHOST_REVERSE_POOL[type] : null;
      if (!pool || pool.length === 0) return;

      const sentNames = [
        ...JSON.parse(localStorage.getItem('deliveries') || '[]'),
        ...JSON.parse(localStorage.getItem('deliveryHistory') || '[]'),
      ].filter(d => d.isGhostSend).map(d => d.name);
      const allSent = new Set(sentNames);

      const available = pool.filter(i => !allSent.has(i.name));
      const finalPool = available.length > 0 ? available : pool;
      const item = finalPool[Math.floor(Math.random() * finalPool.length)];

      localStorage.setItem(coolKey, Date.now());

      // 注入系统记忆
      chatHistory.push({
        role: 'user',
        content: `[System: You quietly sent her "${item.name}". She doesn't know yet — it's on the way. Don't bring it up. If she asks, deflect or stay vague. Once it arrives, you can admit it.]`,
        _system: true
      });
      saveHistory();

      // 写入持久队列（替代 setTimeout，关页面不丢失）
      // 30分钟-1小时后触发
      const triggerAt = Date.now() + (30 + Math.floor(Math.random() * 30)) * 60 * 1000;
      const pending = getPendingReversePackages ? getPendingReversePackages() : JSON.parse(localStorage.getItem('pendingReversePackages') || '[]');
      pending.push({
        item,
        emotionType: type,
        triggerAt,
        triggerAtTurn: _globalTurnCount + 1, // 至少再聊1轮才触发
        contextSnapshot: (typeof chatHistory !== 'undefined' ? chatHistory.filter(m => !m._system).slice(-4) : []),
        motive: type === '思念' ? 'longing' : type === '难过' || type === '委屈' ? 'compensation' : 'practical_care',
      });
      if (typeof savePendingReversePackages === 'function') {
        savePendingReversePackages(pending);
      } else {
        localStorage.setItem('pendingReversePackages', JSON.stringify(pending));
      }
    }

    // ── 4. 地点特产触发 ───────────────────────────────────
    // 【修复】原版传了 botText，新版只传 userText，判断更准确
    if (typeof checkLocationSpecialTrigger === 'function') {
      checkLocationSpecialTrigger(userText).catch(() => {});
    }

  } catch(e) {
    // 三重判断失败：至少还跑地点检测
    if (typeof checkLocationSpecialTrigger === 'function') {
      checkLocationSpecialTrigger(userText).catch(() => {});
    }
  }
}
