// =====================================================================
// dates.js — Ghost 物品架 + 约会系统
// ---------------------------------------------------------------------
// 职责：
// ① 礼物架 — 自动记录所有送给 Ghost 的礼物 + Ghost 收到时的话
// ② 约会系统 — 礼物达标后解锁，Simon 飞来中国与用户约会
// ③ 记忆相册 — 完成的约会存档
//
// 加载顺序：必须在 delivery.js / persona.js / events.js 之后加载
// 储存键：giftRecords, dateMemories
// =====================================================================


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ① 配置常量
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 解锁门槛：第 1 次 10 件，之后每次 +5
const DATE_BASE_THRESHOLD = 10;
const DATE_THRESHOLD_STEP = 5;

// 一次约会最大 AI 轮数（前后各 1 轮脚本，中间 AI）
const DATE_MAX_AI_TURNS = 4;

// 城市 + 餐厅数据
const DATE_CITIES = [
  {
    id: 'beijing',
    name: '北京',
    emoji: '🏛️',
    desc: '故宫红墙、胡同、烤鸭与冬夜',
    visitCost: 800,
    bg: 'linear-gradient(160deg,#5a1f1a 0%,#8c2e22 35%,#c97a3a 70%,#e8b86a 100%)',
    accentColor: '#e8b86a',
    sceneVibe: 'Beijing at dusk — old hutong walls, paper lanterns, the air still cold from late winter. The Forbidden City is half a mile away. Tourists thinning out. The two of you found each other at the corner of a quiet alley.',
    openings: [
      "made it. didn't sleep on the flight. you look better in person than the camera lets on.",
      "the wall outside this place is older than half my unit. mental.",
      "twelve hours in the air. worth it. don't make me say that twice."
    ],
    restaurants: [
      { id: 'huguosi', name: '护国寺小吃', tier: 'street', emoji: '🥟', price: 80, dish: '炒肝、豌豆黄、面茶', vibe: 'old-school local diner, plastic stools, neon menu board, locals slurping breakfast at 9pm' },
      { id: 'siji', name: '四季民福烤鸭', tier: 'mid', emoji: '🦆', price: 520, dish: '现片烤鸭 · 葱丝荷叶饼', vibe: 'warm wood-paneled dining room, glass partitions, the duck wheeled to the table on a cart' },
      { id: 'jingzhao', name: '京兆尹素膳', tier: 'upscale', emoji: '🌿', price: 1380, dish: '十二道时令素膳 · 帝王宴', vibe: 'a converted courtyard, candles in stone lanterns, slow service, no menu — just what arrives' }
    ]
  },
  {
    id: 'shanghai',
    name: '上海',
    emoji: '🌉',
    desc: '外滩夜灯、爵士与法租界小馆',
    visitCost: 950,
    bg: 'linear-gradient(155deg,#0f1d3a 0%,#1d3260 30%,#5e3d8a 65%,#c25b94 100%)',
    accentColor: '#c25b94',
    sceneVibe: 'Shanghai night, the Bund glowing across the river, the neon flickering on the water. He came straight from the airport in a black field coat, no sleep. You meet him on a side street off Huaihai Road.',
    openings: [
      "your city's loud. i like it.",
      "no jet lag. bad sign — means i'm getting old. show me where we're going.",
      "saw the skyline coming in. you didn't undersell it."
    ],
    restaurants: [
      { id: 'jiajia', name: '佳家汤包', tier: 'street', emoji: '🥟', price: 95, dish: '蟹粉汤包 · 鲜肉小笼', vibe: 'tiny corner shop, condensation on the windows, a queue out the door even at 10pm' },
      { id: 'fuhe', name: '福和慧', tier: 'mid', emoji: '🍷', price: 620, dish: '法租界小酒馆 · 红酒炖牛肉', vibe: 'low ceiling, warm yellow bulbs, a vinyl record turning somewhere in the back, French doors open to the street' },
      { id: 'pudong', name: 'Mr. & Mrs. Bund', tier: 'upscale', emoji: '🥂', price: 1580, dish: '外滩 18 号 · 法餐七道菜', vibe: 'floor-to-ceiling glass facing the river, the Pudong skyline as the only wall art, white tablecloths, low conversation' }
    ]
  },
  {
    id: 'chengdu',
    name: '成都',
    emoji: '🐼',
    desc: '茶馆、火锅、雾蒙蒙的午后',
    visitCost: 600,
    bg: 'linear-gradient(170deg,#243b2c 0%,#3d6249 35%,#88a576 65%,#e8d8b0 100%)',
    accentColor: '#88a576',
    sceneVibe: 'Chengdu, slow afternoon, mist hanging over the bamboo. Tea houses along the riverside. The weather is humid and gentle. He took a flight in via Hong Kong. Showed up looking like he hadn\'t slept since Monday.',
    openings: [
      "you weren't kidding about the heat. the air's wet.",
      "saw a panda from the cab. that's enough postcards. let's eat.",
      "twenty hours of travel. and the first thing i smell is chili oil. fair."
    ],
    restaurants: [
      { id: 'longchaoshou', name: '龙抄手 · 春熙路', tier: 'street', emoji: '🌶️', price: 60, dish: '红油抄手 · 担担面 · 钟水饺', vibe: 'bright fluorescent lighting, communal tables, glass case of pickled vegetables, the kind of place locals bring out-of-towners' },
      { id: 'shuxiang', name: '蜀香苑火锅', tier: 'mid', emoji: '🍲', price: 320, dish: '九宫格鸳鸯锅 · 毛肚黄喉', vibe: 'private wooden booth, copper pot bubbling, smoke curling up under the extractor fan, the staff refilling tea between rounds' },
      { id: 'yuzhilan', name: '玉芝兰', tier: 'upscale', emoji: '🍵', price: 760, dish: '川菜精致小盘 · 八道菜', vibe: 'a quiet courtyard restaurant, single seating per night, the chef coming out between courses to explain what just landed' }
    ]
  },
  {
    id: 'xiamen',
    name: '厦门',
    emoji: '🌊',
    desc: '海风、鼓浪屿、夜里的渔船灯',
    visitCost: 720,
    bg: 'linear-gradient(170deg,#1a4459 0%,#2d7896 35%,#7eb8c4 65%,#f0d8a8 100%)',
    accentColor: '#7eb8c4',
    sceneVibe: 'Xiamen, salt air, the ferry to Gulangyu just left. Old colonial buildings painted yellow and pink. The light is amber, late afternoon. He came up from the south, said the heat was nothing he wasn\'t used to.',
    openings: [
      "salt air. ferry whistles. quieter than i thought.",
      "the buildings here are pink. didn't expect that.",
      "warmer than back home. by a lot. you didn't have to flag it twice."
    ],
    restaurants: [
      { id: 'haseafood', name: '阿吉仔海鲜', tier: 'street', emoji: '🦐', price: 110, dish: '海蛎煎、沙茶面、土笋冻', vibe: 'family-run shop on a back lane, fish tanks lining one wall, the menu just shouted across the kitchen pass' },
      { id: 'haianjie', name: '海岸街海景餐厅', tier: 'mid', emoji: '🐟', price: 420, dish: '清蒸石斑 · 椒盐皮皮虾', vibe: 'second-floor terrace, wooden tables, the sea over the railing, fishing boats coming in with their lights on' },
      { id: 'yundang', name: '筼筜书院', tier: 'upscale', emoji: '🍵', price: 880, dish: '闽南古早味 · 八道私房菜', vibe: 'a tea-house restaurant tucked behind bamboo, single long table by candlelight, dishes paired with local oolong' }
    ]
  },
  {
    id: 'dali',
    name: '大理',
    emoji: '⛰️',
    desc: '苍山洱海、白族小院、夜里的风',
    visitCost: 580,
    bg: 'linear-gradient(170deg,#2a3f5f 0%,#4d68a6 30%,#9d8fc5 60%,#e6c5b8 100%)',
    accentColor: '#9d8fc5',
    sceneVibe: 'Dali, late afternoon, the lake catching the last light, Cangshan Mountain bruised purple in the background. Cobbled streets, white-walled Bai courtyard houses. The air is thin and dry. He drove up from Kunming.',
    openings: [
      "the mountain shows up the second i step out. fair warning would've been nice.",
      "altitude's hitting. half a beat slow. don't take advantage.",
      "this place is quieter than my flat. and i live alone."
    ],
    restaurants: [
      { id: 'nashima', name: '人民路小馆', tier: 'street', emoji: '🍢', price: 50, dish: '乳扇、汽锅鸡、酸辣鱼', vibe: 'open-front street kitchen, plastic stools facing the alley, a stray dog watching from across the road' },
      { id: 'yujie', name: '玉洁餐厅 · 海景', tier: 'mid', emoji: '🐠', price: 280, dish: '洱海弓鱼 · 喜洲粑粑', vibe: 'lake-facing wooden deck, fish brought up from the boat that morning, a single pot of tea between you that doesn\'t empty' },
      { id: 'baiyun', name: '白云间', tier: 'upscale', emoji: '🌙', price: 580, dish: '白族私房宴 · 七道时令', vibe: 'a converted Bai courtyard, candles in alcoves, a fire pit in the middle, no other guests, the host\'s mother cooking quietly in the back' }
    ]
  },
  {
    id: 'xian',
    name: '西安',
    emoji: '🏯',
    desc: '城墙、羊肉串、唐风巷子',
    visitCost: 640,
    bg: 'linear-gradient(160deg,#5e2818 0%,#a04822 35%,#d68d3f 70%,#ecc481 100%)',
    accentColor: '#d68d3f',
    sceneVibe: 'Xi\'an, the old city wall lit up after dark, smoke from the lamb skewer stalls drifting over Muslim Quarter. Drums from a tourist show somewhere a few blocks over. The night is cold and dry.',
    openings: [
      "ate something with cumin off a stick before i found you. apologise in advance.",
      "the wall outside this restaurant is six hundred years old. tells you everything.",
      "drier than i expected. the cold here gets in fast."
    ],
    restaurants: [
      { id: 'huimin', name: '回民街老马家', tier: 'street', emoji: '🥙', price: 70, dish: '肉夹馍、凉皮、biangbiang面', vibe: 'narrow stall on the busiest food street in the city, bench seating, hands grabbing skewers as soon as they leave the grill' },
      { id: 'defachang', name: '德发长饺子宴', tier: 'mid', emoji: '🥟', price: 360, dish: '十二种饺子宴 · 黄米酒', vibe: 'banquet-style restaurant, large round table for two, dishes brought out one at a time on a rotating tray' },
      { id: 'tangyue', name: '唐乐宫', tier: 'upscale', emoji: '🎭', price: 720, dish: '盛唐宫廷宴 · 八道菜', vibe: 'a Tang dynasty themed dining hall, low tables, traditional music live in the corner, eight courses paced through the night' }
    ]
  }
];

// 通用收尾台词池（约会结束时随机一条）
const DATE_CLOSING_LINES = [
  "flying back tomorrow. you knew that. doesn't make it lighter.",
  "next time you come to me.",
  "you didn't say much when i sat down. you didn't have to. i clocked it.",
  "this happened. that's the point.",
  "i'll text when i land. won't be much. you'll know what it means.",
  "keep the receipt. for the album you keep that you think i don't know about.",
  "twelve hours back. i'll sleep on the plane this time.",
  "should've done this sooner. don't say it back."
];

// 后台 prompt 给 Sonnet 用的（中间 AI 轮）
function buildDateScenePrompt(city, restaurant) {
  const core = (typeof buildGhostStyleCore === 'function')
    ? buildGhostStyleCore()
    : 'You are Simon "Ghost" Riley. Lowercase. English. Short. Direct.';
  return `${core}

[ON A DATE — IN PERSON]
You flew to China to see her. You're with her right now.
Location: ${city.name} (${city.desc}).
Setting: ${city.sceneVibe}
Restaurant: ${restaurant.name} — ${restaurant.dish}.
Vibe: ${restaurant.vibe}

This isn't a phone call. You're at the same table. You can see her face.
Some things land different in person — you notice things you wouldn't catch on text.
Don't narrate the place to her like a tour guide — she's there with you.
React to HER. To this moment. To something specific you just noticed about the food, the air, the way she's sitting, what she just said.

One or two lines. Lowercase. English. No tour-guide voiceover.
You can be quieter than usual. In person, less is more.`;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ② 储存层
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getGiftRecords() {
  try { return JSON.parse(localStorage.getItem('giftRecords') || '[]'); }
  catch(e) { return []; }
}

function getDateMemories() {
  try { return JSON.parse(localStorage.getItem('dateMemories') || '[]'); }
  catch(e) { return []; }
}

// 礼物达标进度
function getDateUnlockState() {
  const memories = getDateMemories();
  const completedCount = memories.length;
  const threshold = DATE_BASE_THRESHOLD + completedCount * DATE_THRESHOLD_STEP;
  const lastDateTs = completedCount > 0 ? memories[memories.length - 1].timestamp : 0;
  const giftsSince = getGiftRecords().filter(g => g.timestamp > lastDateTs).length;
  return {
    completedCount,
    threshold,
    giftsSince,
    isUnlocked: giftsSince >= threshold,
    progress: Math.min(1, giftsSince / threshold)
  };
}

// 记录礼物到架子
function recordGiftToShelf(delivery, ghostReaction) {
  if (!delivery || !delivery.name) return;
  const list = getGiftRecords();
  // 同一 delivery.id 防重
  if (list.some(g => g.deliveryId === delivery.id)) return;
  const entry = {
    id: 'gift_' + delivery.id + '_' + Math.random().toString(36).slice(2,7),
    deliveryId: delivery.id,
    emoji: delivery.emoji || '🎁',
    name: delivery.name,
    price: (delivery.productData && delivery.productData.price) || 0,
    isLuxury: !!(delivery.productData && delivery.productData.isLuxury),
    isFromHome: !!(delivery.productData && delivery.productData.isFromHome),
    isIntimate: !!(delivery.productData && delivery.productData.isIntimate),
    ghostReaction: (ghostReaction || '').trim().slice(0, 280),
    timestamp: Date.now()
  };
  list.push(entry);
  // 上限 200，超出移除最旧
  const trimmed = list.slice(-200);
  localStorage.setItem('giftRecords', JSON.stringify(trimmed));
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();

  // 解锁时弹通知（一次性）
  setTimeout(() => {
    const st = getDateUnlockState();
    if (st.isUnlocked) {
      const flagKey = 'dateUnlockedNotified_' + st.completedCount;
      if (!localStorage.getItem(flagKey)) {
        localStorage.setItem(flagKey, '1');
        if (typeof showToast === 'function') {
          showToast('💑 约会已解锁！点主页"约会"卡片选个城市～');
        }
      }
    }
    // 顺手刷新主页两张卡
    if (typeof refreshShelfCardBadge === 'function') refreshShelfCardBadge();
    if (typeof refreshDateCardBadge === 'function') refreshDateCardBadge();
  }, 600);

  // 如果当前在物品架页面，刷新
  if (document.getElementById('shelfScreen')?.classList.contains('active')) {
    renderGiftShelf();
  }
  if (document.getElementById('dateHubScreen')?.classList.contains('active')) {
    renderDateHub();
  }
}

// 暴露给 hook 用
window.recordGiftToShelf = recordGiftToShelf;


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ③ 被动捕获 hook —— 不动 delivery.js
// 包装 onGhostReceived + _safeDeliverySaveHistory
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const _giftCaptureQueue = [];

function _installGiftCaptureHooks() {
  // 包装 onGhostReceived：只追踪用户寄给 Ghost 的礼物
  const _origOnGhostReceived = window.onGhostReceived;
  if (typeof _origOnGhostReceived !== 'function') {
    console.warn('[dates] onGhostReceived 未找到 — 物品架捕获未安装。请确认 dates.js 在 delivery.js 之后加载。');
    return;
  }
  if (window.onGhostReceived._giftPatched) return; // 防止重复包装
  window.onGhostReceived = async function(delivery) {
    try {
      // 只捕获用户寄给 Ghost 的（非 Ghost 反寄、非 isUserItem）
      if (delivery && !delivery.isGhostSend &&
          !(delivery.productData && delivery.productData.isUserItem)) {
        _giftCaptureQueue.push({ delivery, ts: Date.now(), captured: false });
      }
    } catch(e) { console.warn('[dates] queue push fail:', e); }
    return await _origOnGhostReceived.apply(this, arguments);
  };
  window.onGhostReceived._giftPatched = true;

  // 包装 _safeDeliverySaveHistory：每次 delivery 保存 chatHistory 时，把最新 assistant 消息归档给队首
  const _origSaveHist = window._safeDeliverySaveHistory;
  if (typeof _origSaveHist !== 'function') {
    console.warn('[dates] _safeDeliverySaveHistory 未找到 — 物品架捕获回退到无文字模式。');
    return;
  }
  if (window._safeDeliverySaveHistory._giftPatched) return;
  window._safeDeliverySaveHistory = function() {
    const result = _origSaveHist.apply(this, arguments);
    try {
      // 清理超时（90s）
      while (_giftCaptureQueue.length && Date.now() - _giftCaptureQueue[0].ts > 90000) {
        const stale = _giftCaptureQueue.shift();
        // 即使没拿到反应也记录一条，反应留空
        if (!stale.captured) recordGiftToShelf(stale.delivery, '');
      }
      // 给队首归档最近一条 assistant 消息
      if (_giftCaptureQueue.length > 0 && typeof chatHistory !== 'undefined') {
        const last = chatHistory[chatHistory.length - 1];
        if (last && last.role === 'assistant' && last.content) {
          const head = _giftCaptureQueue[0];
          if (!head.captured) {
            head.captured = true;
            recordGiftToShelf(head.delivery, last.content);
            _giftCaptureQueue.shift();
          }
        }
      }
    } catch(e) { console.warn('[dates] capture fail:', e); }
    return result;
  };
  window._safeDeliverySaveHistory._giftPatched = true;
  console.log('[dates] 物品架捕获 hook 已安装');
}

// DOM 就绪后安装（保证 delivery.js 已挂载全局函数）
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _installGiftCaptureHooks);
} else {
  setTimeout(_installGiftCaptureHooks, 0);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ④ 物品架页面渲染
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderGiftShelf() {
  const screen = document.getElementById('shelfScreen');
  if (!screen) return;
  const body = screen.querySelector('.shelf-body');
  if (!body) return;

  const records = getGiftRecords().slice().reverse(); // 新的在上

  // ── 礼物列表 ──
  let giftsHTML;
  if (records.length === 0) {
    giftsHTML = `
      <div class="shelf-empty">
        <div class="shelf-empty-emoji">📦</div>
        <div class="shelf-empty-title">架子是空的</div>
        <div class="shelf-empty-desc">从商城寄点东西过去，<br/>他签收时说的话会在这儿留着。</div>
      </div>
    `;
  } else {
    giftsHTML = `
      <div class="shelf-gifts-list">
        ${records.map(g => `
          <div class="shelf-gift-card${g.isLuxury ? ' is-luxury' : ''}${g.isIntimate ? ' is-intimate' : ''}">
            <div class="shelf-gift-emoji">${g.emoji}</div>
            <div class="shelf-gift-body">
              <div class="shelf-gift-name">${_esc(g.name)}</div>
              <div class="shelf-gift-meta">${_formatShortDate(g.timestamp)}${g.price ? ' · £' + g.price : ''}</div>
              ${g.ghostReaction
                ? `<div class="shelf-gift-quote">"${_esc(g.ghostReaction)}"<span class="shelf-gift-attrib">— Ghost</span></div>`
                : `<div class="shelf-gift-quote shelf-gift-quote-empty">他还没说什么…</div>`
              }
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  body.innerHTML = `
    <div class="shelf-header-card">
      <div class="shelf-header-title">🏠 Ghost 的小屋</div>
      <div class="shelf-header-sub">${records.length > 0 ? `你送过他 ${records.length} 件东西，都在这儿留着` : '他收到的每件东西，都在这儿留着'}</div>
    </div>
    ${giftsHTML}
  `;
}
window.renderGiftShelf = renderGiftShelf;


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ④.5 约会主页（独立板块）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderDateHub() {
  const screen = document.getElementById('dateHubScreen');
  if (!screen) return;
  const body = screen.querySelector('.date-hub-body');
  if (!body) return;

  const memories = getDateMemories().slice().reverse();
  const st = getDateUnlockState();
  const pct = Math.round(st.progress * 100);
  const remaining = Math.max(0, st.threshold - st.giftsSince);

  // ── 进度卡片 ──
  let progressHTML;
  if (st.isUnlocked) {
    progressHTML = `
      <div class="date-hub-status-card unlocked">
        <div class="date-hub-status-emoji">💑</div>
        <div class="date-hub-status-title">他可以飞过来了</div>
        <div class="date-hub-status-sub">机酒他自己定，你只管选个能让他心动的地方</div>
        <button class="date-hub-go-btn" onclick="openDatePicker()">
          选个城市 →
        </button>
        <div class="date-hub-status-foot">完成这次后，下次需要 ${st.threshold + DATE_THRESHOLD_STEP} 件礼物</div>
      </div>
    `;
  } else {
    progressHTML = `
      <div class="date-hub-status-card locked">
        <div class="date-hub-status-emoji">✈️</div>
        <div class="date-hub-status-title">${st.completedCount === 0 ? '让他飞来中国看你' : '约下一次'}</div>
        <div class="date-hub-status-sub">凑够 ${st.threshold} 件礼物，他就准假飞过来了</div>
        <div class="date-hub-progress-bar">
          <div class="date-hub-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="date-hub-progress-num">
          <b>${st.giftsSince}</b> <span>/ ${st.threshold}</span>
          <span class="date-hub-progress-remain">还差 ${remaining} 件</span>
        </div>
        <button class="date-hub-go-btn locked-btn" disabled>
          🔒 还没解锁
        </button>
      </div>
    `;
  }

  // ── 记忆相册 ──
  let memoriesHTML = '';
  if (memories.length > 0) {
    memoriesHTML = `
      <div class="date-hub-section-title">📷 记忆相册 · ${memories.length} 次相聚</div>
      <div class="date-hub-memories-grid">
        ${memories.map(m => `
          <div class="date-hub-memory-card" style="background:${m.bg || 'linear-gradient(135deg,#888,#aaa)'};" onclick="openDateMemory('${m.id}')">
            <div class="date-hub-memory-emoji">${m.cityEmoji || '💑'}${m.restaurantEmoji || ''}</div>
            <div class="date-hub-memory-info">
              <div class="date-hub-memory-city">${m.cityName} · ${m.restaurantName || ''}</div>
              <div class="date-hub-memory-date">${_formatShortDate(m.timestamp)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    memoriesHTML = `
      <div class="date-hub-section-title">📷 记忆相册</div>
      <div class="date-hub-memories-empty">
        还没和他真正见过面 · 第一次约会会留在这里
      </div>
    `;
  }

  // ── 关于约会 ──
  const aboutHTML = `
    <div class="date-hub-about">
      <div class="date-hub-about-title">关于约会</div>
      <div class="date-hub-about-text">
        送够礼物，Simon 会请假飞来中国看你。<br/>
        你选城市、选餐厅，他买单的是机票和酒店。<br/>
        他在你身边时，话不会多，但会留下来。<br/>
        每一次见面都会存进相册，回去翻得到。
      </div>
    </div>
  `;

  body.innerHTML = `
    ${progressHTML}
    ${memoriesHTML}
    ${aboutHTML}
  `;
}
window.renderDateHub = renderDateHub;


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⑤ 约会 — 城市/餐厅选择
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let _selectedDateCity = null;
let _selectedDateRestaurant = null;

function openDatePicker() {
  const st = getDateUnlockState();
  if (!st.isUnlocked) {
    if (typeof showToast === 'function') showToast(`💔 还差 ${st.threshold - st.giftsSince} 件礼物`);
    return;
  }
  _selectedDateCity = null;
  _selectedDateRestaurant = null;
  if (typeof openScreen === 'function') openScreen('datePickerScreen');
  else document.getElementById('datePickerScreen').classList.add('active');
  renderDateCityList();
}
window.openDatePicker = openDatePicker;

function renderDateCityList() {
  const c = document.getElementById('datePickerBody');
  if (!c) return;
  c.innerHTML = `
    <div class="date-picker-title">他要飞过来了 · 选个城市</div>
    <div class="date-picker-sub">机票 + 酒店都算他自己的，但你得选个能让他心动的地方。</div>
    <div class="date-cities-grid">
      ${DATE_CITIES.map(city => `
        <div class="date-city-card" style="background:${city.bg};" onclick="selectDateCity('${city.id}')">
          <div class="date-city-emoji">${city.emoji}</div>
          <div class="date-city-name">${city.name}</div>
          <div class="date-city-desc">${city.desc}</div>
          <div class="date-city-cost">£${city.visitCost}<span style="font-size:11px;opacity:0.85;"> 起</span></div>
        </div>
      `).join('')}
    </div>
  `;
}

function selectDateCity(cityId) {
  const city = DATE_CITIES.find(c => c.id === cityId);
  if (!city) return;
  _selectedDateCity = city;
  renderDateRestaurantList(city);
}
window.selectDateCity = selectDateCity;

function renderDateRestaurantList(city) {
  const c = document.getElementById('datePickerBody');
  if (!c) return;
  const bal = (typeof getBalance === 'function') ? getBalance() : 0;
  c.innerHTML = `
    <div class="date-picker-back" onclick="renderDateCityList()">‹ 换城市</div>
    <div class="date-picker-title" style="margin-top:8px;">${city.emoji} ${city.name} · 吃哪儿</div>
    <div class="date-picker-sub">${city.desc}</div>
    <div class="date-restaurants-list">
      ${city.restaurants.map(r => {
        const total = city.visitCost + r.price;
        const canAfford = bal >= total;
        return `
        <div class="date-restaurant-card${canAfford ? '' : ' not-affordable'}" onclick="${canAfford ? `selectDateRestaurant('${r.id}')` : `showToast && showToast('💔 余额不够，再赚点')`}">
          <div class="date-restaurant-head">
            <div class="date-restaurant-emoji">${r.emoji}</div>
            <div class="date-restaurant-tier date-restaurant-tier-${r.tier}">${
              r.tier === 'street' ? '街边小馆' : r.tier === 'mid' ? '中档' : '高档'
            }</div>
          </div>
          <div class="date-restaurant-name">${r.name}</div>
          <div class="date-restaurant-dish">${r.dish}</div>
          <div class="date-restaurant-price">
            ${city.visitCost > 0 ? `<span style="opacity:0.65;">机酒 £${city.visitCost}</span> + ` : ''}
            <span>餐 £${r.price}</span>
            <span class="date-restaurant-total"> = £${total.toLocaleString()}</span>
          </div>
        </div>
      `}).join('')}
    </div>
    <div class="date-picker-balance">钱包余额：£${bal.toFixed(2)}</div>
  `;
}

function selectDateRestaurant(rid) {
  if (!_selectedDateCity) return;
  const r = _selectedDateCity.restaurants.find(x => x.id === rid);
  if (!r) return;
  _selectedDateRestaurant = r;
  // 弹确认
  const total = _selectedDateCity.visitCost + r.price;
  const html = `
    <div class="date-confirm-modal" onclick="if(event.target===this)closeDateConfirm()">
      <div class="date-confirm-card">
        <div class="date-confirm-emoji">${_selectedDateCity.emoji}${r.emoji}</div>
        <div class="date-confirm-title">${_selectedDateCity.name} · ${r.name}</div>
        <div class="date-confirm-desc">${r.dish}</div>
        <div class="date-confirm-cost">
          <div>机票 + 酒店：<b>£${_selectedDateCity.visitCost}</b></div>
          <div>餐厅：<b>£${r.price}</b></div>
          <div class="date-confirm-total">总计：<b>£${total.toLocaleString()}</b></div>
        </div>
        <div class="date-confirm-buttons">
          <button class="date-confirm-cancel" onclick="closeDateConfirm()">再想想</button>
          <button class="date-confirm-go" onclick="confirmAndStartDate()">就这家</button>
        </div>
      </div>
    </div>
  `;
  let m = document.getElementById('dateConfirmHost');
  if (!m) { m = document.createElement('div'); m.id = 'dateConfirmHost'; document.body.appendChild(m); }
  m.innerHTML = html;
}
window.selectDateRestaurant = selectDateRestaurant;

function closeDateConfirm() {
  const m = document.getElementById('dateConfirmHost');
  if (m) m.innerHTML = '';
}
window.closeDateConfirm = closeDateConfirm;

function confirmAndStartDate() {
  if (!_selectedDateCity || !_selectedDateRestaurant) return;
  const total = _selectedDateCity.visitCost + _selectedDateRestaurant.price;
  const bal = (typeof getBalance === 'function') ? getBalance() : 0;
  if (bal < total) {
    if (typeof showToast === 'function') showToast('💔 余额不足');
    return;
  }
  // 扣钱
  if (typeof setBalance === 'function') setBalance(bal - total);
  if (typeof addTransaction === 'function') {
    addTransaction({
      icon: _selectedDateCity.emoji,
      name: `约会 · ${_selectedDateCity.name} · ${_selectedDateRestaurant.name}`,
      amount: -total
    });
  }
  if (typeof renderWallet === 'function') renderWallet();
  closeDateConfirm();
  startDateScene(_selectedDateCity, _selectedDateRestaurant);
}
window.confirmAndStartDate = confirmAndStartDate;


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⑥ 约会场景（混合：脚本开场 → AI 中段 → 脚本收尾）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let _activeDate = null;
// _activeDate = { city, restaurant, dialogue: [{role,text}], aiTurnsUsed, ended }

function startDateScene(city, restaurant) {
  // 选脚本开场（每城 2-3 条随机）
  const opener = city.openings[Math.floor(Math.random() * city.openings.length)];
  _activeDate = {
    city,
    restaurant,
    dialogue: [{ role: 'ghost', text: opener, scripted: true }],
    aiTurnsUsed: 0,
    ended: false,
    startedAt: Date.now()
  };
  if (typeof openScreen === 'function') openScreen('dateSceneScreen');
  else document.getElementById('dateSceneScreen').classList.add('active');
  renderDateScene();
}

function renderDateScene() {
  if (!_activeDate) return;
  const { city, restaurant, dialogue, aiTurnsUsed, ended } = _activeDate;
  const screen = document.getElementById('dateSceneScreen');
  if (!screen) return;
  screen.style.background = city.bg;
  screen.style.setProperty('--date-accent', city.accentColor);

  const bodyEl = screen.querySelector('.date-scene-body');
  if (!bodyEl) return;

  const bubbles = dialogue.map(line => {
    const cls = line.role === 'ghost' ? 'date-bubble-ghost' : 'date-bubble-user';
    const tag = line.scripted ? `<div class="date-bubble-tag">${line.role === 'ghost' ? (line.scripted === 'closing' ? '收尾' : '开场') : '你'}</div>` : '';
    return `<div class="date-bubble ${cls}">${tag}<div class="date-bubble-text">${_esc(line.text)}</div></div>`;
  }).join('');

  const remainingAI = DATE_MAX_AI_TURNS - aiTurnsUsed;
  const inputDisabled = ended || _activeDate._waitingReply;

  let footerHTML;
  if (ended) {
    footerHTML = `
      <button class="date-end-save-btn" onclick="finalizeDateMemory()">📷 把这次约会存进相册</button>
    `;
  } else {
    footerHTML = `
      <textarea class="date-scene-input"
        id="dateSceneInput"
        placeholder="${_activeDate._waitingReply ? '他在听…' : '说点什么…'}"
        ${inputDisabled ? 'disabled' : ''}
        rows="2"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendDateTurn();}"></textarea>
      <div class="date-scene-buttons">
        <button class="date-scene-end-btn" onclick="endDateScene()" ${_activeDate._waitingReply ? 'disabled' : ''}>结束这次约会</button>
        <button class="date-scene-send-btn" onclick="sendDateTurn()" ${inputDisabled ? 'disabled' : ''}>发送</button>
      </div>
      <div class="date-scene-hint">还能聊 ${remainingAI} 轮 · 想停随时停</div>
    `;
  }

  bodyEl.innerHTML = `
    <div class="date-scene-header">
      <div class="date-scene-loc">${city.emoji} ${city.name} · ${restaurant.emoji} ${restaurant.name}</div>
      <div class="date-scene-dish">${restaurant.dish}</div>
    </div>
    <div class="date-scene-bubbles" id="dateSceneBubbles">
      ${bubbles}
    </div>
    <div class="date-scene-footer">
      ${footerHTML}
    </div>
  `;
  // 滚到底
  const bub = document.getElementById('dateSceneBubbles');
  if (bub) bub.scrollTop = bub.scrollHeight;
}
window.renderDateScene = renderDateScene;

async function sendDateTurn() {
  if (!_activeDate || _activeDate.ended || _activeDate._waitingReply) return;
  if (_activeDate.aiTurnsUsed >= DATE_MAX_AI_TURNS) {
    if (typeof showToast === 'function') showToast('够了，让他喘口气吧～');
    return;
  }
  const inp = document.getElementById('dateSceneInput');
  if (!inp) return;
  const txt = (inp.value || '').trim();
  if (!txt) return;
  inp.value = '';
  _activeDate.dialogue.push({ role: 'user', text: txt });
  _activeDate._waitingReply = true;
  renderDateScene();

  // 调 Sonnet
  let reply = '';
  try {
    if (typeof callSonnet === 'function') {
      const sys = buildDateScenePrompt(_activeDate.city, _activeDate.restaurant);
      // 把 dialogue 转成 messages（user/assistant 交替）
      const msgs = _activeDate.dialogue.map(line => ({
        role: line.role === 'ghost' ? 'assistant' : 'user',
        content: line.text
      }));
      reply = await callSonnet(sys, msgs);
    }
  } catch (e) {
    console.warn('[date scene] sonnet call failed', e);
  }

  // 兜底：模型挂了就脚本一条
  if (!reply || !reply.trim()) {
    const fallbacks = [
      'mhm.',
      'go on.',
      "noted.",
      "yeah.",
      "i hear you.",
      "say that again."
    ];
    reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
  reply = reply.trim().split('\n').slice(0, 3).join(' ');

  _activeDate.dialogue.push({ role: 'ghost', text: reply });
  _activeDate.aiTurnsUsed += 1;
  _activeDate._waitingReply = false;
  renderDateScene();
}
window.sendDateTurn = sendDateTurn;

function endDateScene() {
  if (!_activeDate || _activeDate.ended) return;
  // 加入脚本收尾
  const closing = DATE_CLOSING_LINES[Math.floor(Math.random() * DATE_CLOSING_LINES.length)];
  _activeDate.dialogue.push({ role: 'ghost', text: closing, scripted: 'closing' });
  _activeDate.ended = true;
  renderDateScene();

  // 顺便扯一下好感度（如果系统有这函数）
  try {
    if (typeof changeAffection === 'function') changeAffection(3);
    if (typeof changeAttachmentPull === 'function') changeAttachmentPull(8);
  } catch(e) {}
}
window.endDateScene = endDateScene;

// 把约会存进相册
function finalizeDateMemory() {
  if (!_activeDate) return;
  const memories = getDateMemories();
  const id = 'date_' + Date.now();
  const memory = {
    id,
    cityId: _activeDate.city.id,
    cityName: _activeDate.city.name,
    cityEmoji: _activeDate.city.emoji,
    bg: _activeDate.city.bg,
    restaurantName: _activeDate.restaurant.name,
    restaurantEmoji: _activeDate.restaurant.emoji,
    dish: _activeDate.restaurant.dish,
    dialogue: _activeDate.dialogue,
    aiTurnsUsed: _activeDate.aiTurnsUsed,
    timestamp: Date.now(),
    duration: Date.now() - _activeDate.startedAt
  };
  memories.push(memory);
  localStorage.setItem('dateMemories', JSON.stringify(memories));
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();

  if (typeof showToast === 'function') showToast('📷 已存进相册～');
  _activeDate = null;
  // 跳回约会主页
  if (typeof openScreen === 'function') openScreen('dateHubScreen');
  setTimeout(() => { if (typeof renderDateHub === 'function') renderDateHub(); }, 50);
}
window.finalizeDateMemory = finalizeDateMemory;


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⑦ 记忆相册 — 单条详情
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function openDateMemory(memId) {
  const memories = getDateMemories();
  const m = memories.find(x => x.id === memId);
  if (!m) return;
  const bubbles = (m.dialogue || []).map(line => {
    const cls = line.role === 'ghost' ? 'date-bubble-ghost' : 'date-bubble-user';
    return `<div class="date-bubble ${cls}"><div class="date-bubble-text">${_esc(line.text)}</div></div>`;
  }).join('');
  const dateStr = _formatLongDate(m.timestamp);

  const html = `
    <div class="memory-detail-overlay" onclick="if(event.target===this)closeDateMemory()">
      <div class="memory-detail-card" style="background:${m.bg || '#888'};">
        <button class="memory-detail-close" onclick="closeDateMemory()">×</button>
        <div class="memory-detail-head">
          <div class="memory-detail-emoji">${m.cityEmoji} ${m.restaurantEmoji}</div>
          <div class="memory-detail-title">${m.cityName} · ${m.restaurantName}</div>
          <div class="memory-detail-meta">${dateStr} · ${m.dish}</div>
        </div>
        <div class="memory-detail-bubbles">
          ${bubbles}
        </div>
      </div>
    </div>
  `;
  let host = document.getElementById('dateMemoryHost');
  if (!host) { host = document.createElement('div'); host.id = 'dateMemoryHost'; document.body.appendChild(host); }
  host.innerHTML = html;
}
window.openDateMemory = openDateMemory;

function closeDateMemory() {
  const host = document.getElementById('dateMemoryHost');
  if (host) host.innerHTML = '';
}
window.closeDateMemory = closeDateMemory;


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⑧ 主页两张卡片状态刷新（物品架卡 + 约会卡）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function refreshShelfCardBadge() {
  const card = document.getElementById('shelfCard');
  if (!card) return;
  const desc = card.querySelector('.card-desc');
  if (!desc) return;
  const total = getGiftRecords().length;
  if (total > 0) {
    desc.textContent = `${total} 件礼物在架上`;
  } else {
    desc.textContent = '送过他的东西';
  }
}
window.refreshShelfCardBadge = refreshShelfCardBadge;

function refreshDateCardBadge() {
  const card = document.getElementById('dateCard');
  if (!card) return;
  const desc = card.querySelector('.card-desc');
  if (!desc) return;
  const st = getDateUnlockState();
  const memCount = getDateMemories().length;
  if (st.isUnlocked) {
    desc.innerHTML = '💞 他可以来了';
    card.classList.add('date-card-unlocked');
    card.classList.remove('date-card-locked');
  } else if (memCount > 0) {
    desc.textContent = `${memCount} 次相聚 · 还差 ${st.threshold - st.giftsSince}`;
    card.classList.remove('date-card-unlocked', 'date-card-locked');
  } else {
    desc.textContent = `还差 ${st.threshold - st.giftsSince} 件礼物`;
    card.classList.add('date-card-locked');
    card.classList.remove('date-card-unlocked');
  }
}
window.refreshDateCardBadge = refreshDateCardBadge;

// 在 openScreen 钩子里刷新（若 app.js 有 hook）
(function hookMainScreenRefresh() {
  const _origOpen = window.openScreen;
  if (typeof _origOpen !== 'function') {
    setTimeout(hookMainScreenRefresh, 200);
    return;
  }
  if (_origOpen._shelfHooked) return;
  window.openScreen = function(id) {
    const result = _origOpen.apply(this, arguments);
    try {
      if (id === 'mainScreen') {
        refreshShelfCardBadge();
        refreshDateCardBadge();
      }
      if (id === 'shelfScreen') renderGiftShelf();
      if (id === 'dateHubScreen') renderDateHub();
    } catch(e) {}
    return result;
  };
  window.openScreen._shelfHooked = true;
})();


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 工具函数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _formatShortDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return sameYear ? `${m}/${day}` : `${d.getFullYear()}/${m}/${day}`;
}

function _formatLongDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
