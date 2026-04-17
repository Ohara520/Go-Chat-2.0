// ============================================================
// character.js — 多角色管理系统
//
// 职责：
//   getCurrentCharacter()  — 获取当前角色
//   switchCharacter(char)  — 切换角色（保存当前 + 加载新的）
//   getCharacterList()     — 获取所有角色配置
//
// 设计原则：
//   · localStorage 标准 key = 当前角色的数据
//   · 切换时才用前缀 key 存/读（ghost_xxx / keegan_xxx）
//   · 所有已有代码（sendMessage / state / cloud）无需修改
//   · 钱包 transactions 共用，不随角色切换
// ============================================================

// ── 角色配置表 ────────────────────────────────────────────
const CHARACTER_LIST = [
  {
    id: 'ghost',
    name: 'Ghost',
    fullName: 'Simon Riley',
    unit: 'TF141 · Lieutenant',
    location: 'Manchester, UK',
    themeColor: '#6b6b6b',
    bgFrom: '#f0eeec',
    bgTo: '#d8d5d1',
    accentColor: '#4a4a4a',
    veniceEndpoint: '/api/venice',   // 调情路由
    personaBuilder: 'buildSystemPrompt', // 主人设构建函数名
    defaultAvatar: 'images/ghost-avatar.png',
  },
  {
    id: 'keegan',
    name: 'Keegan',
    fullName: 'Keegan P. Russ',
    unit: 'Ghosts · Scout Sniper',
    location: 'Texas, USA',
    themeColor: '#5a9ab6',
    bgFrom: '#eaf4f9',
    bgTo: '#c4dfe9',
    accentColor: '#3a7a96',
    veniceEndpoint: '/api/venice-keegan', // Keegan 调情路由
    personaBuilder: 'buildKeeganSystemPrompt',
    defaultAvatar: 'images/keegan-avatar.png',
  },
];

// ── 角色专属的 localStorage key 列表 ─────────────────────
// 这些 key 随角色切换，钱包 transactions 不在列表里（共用）
const CHARACTER_KEYS = [
  // 聊天
  'chatHistory',
  // 关系状态
  'affection', 'moodLevel', 'trustHeat', 'attachmentPull',
  'jealousyLevel', 'loveResistance', 'loveResistanceLastDecay',
  'globalTurnCount', 'relationshipFlags', 'emotionalHurt',
  'moneyRefuseCount', 'userDislikesMoney', 'sassyPost',
  // 冷战
  'coldWarMode', 'coldWarStart', 'coldWarStage', 'coldWarCause',
  // 记忆
  'longTermMemory', 'intimateMemory',
  // 剧情
  'storyBook', 'collections',
  'pendingReversePackages', 'lastReversePackageTurn',
  'pendingGhostApology', 'pendingSeriousTalk',
  'pendingMakeupMoney', 'pendingColdWarEndStory',
  // 快递 / 外卖
  'deliveries', 'deliveryHistory', 'deliveryNotices',
  'takeoutOrders', 'takeoutHistory',
  // 黑卡（每个角色各自的卡）
  'ghostCard',
  // 婚姻 / 见面
  'marriageDate', 'marriageType', 'metInPerson', 'botNickname',
  'hadTalkAt',
  // 角色档案
  'ghostBirthday', 'ghostZodiac', 'ghostZodiacEn',
  'ghostHeight', 'ghostWeight', 'ghostBloodType', 'ghostHometown',
  'ghostAvatarUrl', 'ghostAvatarBase64',
  'ghostUnlocked_birthday', 'ghostUnlocked_zodiac',
  'ghostUnlocked_height', 'ghostUnlocked_weight',
  'ghostUnlocked_blood_type', 'ghostUnlocked_hometown',
  // 朋友圈 / 商城
  'coupleFeedHistory', 'coupleFeedDate', 'lastFeedPostAt',
  'feedHasNew', 'organicFeedCount',
  'marketTriggered', 'purchasedItems', 'purchaseCounts',
  'intimateTriggered',
  // 心声
  'lastInnerThought', 'lastInnerThoughtAt',
  // 工资
  'lastSalaryAmount', 'lastSalaryMonth',
  // 地点
  'currentLocation', 'currentLocationReason', 'currentLocationType',
  'locationNextChange',
];

// ── 获取当前角色 ──────────────────────────────────────────
function getCurrentCharacter() {
  return localStorage.getItem('currentCharacter') || 'ghost';
}

function getCurrentCharacterConfig() {
  const id = getCurrentCharacter();
  return CHARACTER_LIST.find(c => c.id === id) || CHARACTER_LIST[0];
}

function getCharacterList() {
  return CHARACTER_LIST;
}

// ── 保存当前角色数据到前缀 key ────────────────────────────
function _saveCharacterData(charId) {
  CHARACTER_KEYS.forEach(key => {
    const val = localStorage.getItem(key);
    if (val !== null) {
      localStorage.setItem(`${charId}_${key}`, val);
    } else {
      localStorage.removeItem(`${charId}_${key}`);
    }
  });
  // 额外保存今日打工次数（key 是动态的）
  const workKey = 'work_' + new Date().toDateString();
  const workVal = localStorage.getItem(workKey);
  if (workVal) localStorage.setItem(`${charId}_${workKey}`, workVal);

  console.log(`[character] ${charId} 数据已保存`);
}

// ── 从前缀 key 加载角色数据到标准 key ────────────────────
function _loadCharacterData(charId) {
  CHARACTER_KEYS.forEach(key => {
    const val = localStorage.getItem(`${charId}_${key}`);
    if (val !== null) {
      localStorage.setItem(key, val);
    } else {
      localStorage.removeItem(key);
    }
  });
  // 今日打工次数
  const workKey = 'work_' + new Date().toDateString();
  const workVal = localStorage.getItem(`${charId}_${workKey}`);
  if (workVal) localStorage.setItem(workKey, workVal);
  else localStorage.removeItem(workKey);

  console.log(`[character] ${charId} 数据已加载`);
}

// ── 切换角色（核心函数）──────────────────────────────────
async function switchCharacter(newCharId) {
  const currentCharId = getCurrentCharacter();
  if (currentCharId === newCharId) return; // 没有变化

  const newConfig = CHARACTER_LIST.find(c => c.id === newCharId);
  if (!newConfig) { console.warn('[character] 未知角色:', newCharId); return; }

  // 1. 先把内存里最新的 chatHistory 写进 localStorage，再保存
  // 否则 _saveCharacterData 存的是旧的，最新消息会丢
  if (typeof chatHistory !== 'undefined' && Array.isArray(chatHistory)) {
    try {
      const toSave = chatHistory
        .filter(m => !m._recalled)
        .slice(-300)
        .map(m => ({ role: m.role, content: m.content,
          ...(m._system ? { _system: true } : {}),
          ...(m._intimate ? { _intimate: true } : {}),
        }));
      localStorage.setItem('chatHistory', JSON.stringify(toSave));
    } catch(e) {}
  }
  _saveCharacterData(currentCharId);

  // 2. 重置 chatHistory 运行时变量（防止旧数据残留）
  // 注意：必须完全清空，包括 _system 消息，否则旧角色的系统消息会污染新角色
  if (typeof chatHistory !== 'undefined') {
    window.chatHistory = [];
  }
  if (typeof _globalTurnCount !== 'undefined') {
    window._globalTurnCount = 0;
  }
  // sessionStorage 里的临时状态也清掉（心声、吃醋状态等）
  sessionStorage.removeItem('ghostState');
  sessionStorage.removeItem('loveOverride');
  sessionStorage.removeItem('jealousyReferent');
  sessionStorage.removeItem('recentInnerThoughts');
  sessionStorage.removeItem('thisRoundCareAction');

  // 3. 切换角色
  localStorage.setItem('currentCharacter', newCharId);

  // 4. 先清空 localStorage 里的 chatHistory，防止加载新角色时读到旧的
  localStorage.removeItem('chatHistory');

  // 4b. 加载新角色数据
  _loadCharacterData(newCharId);

  // 5. 重新读取 chatHistory 到内存（新角色的，可能是空的）
  try {
    const saved = localStorage.getItem('chatHistory');
    if (typeof chatHistory !== 'undefined') {
      window.chatHistory = saved ? JSON.parse(saved) : [];
    }
  } catch(e) {
    if (typeof chatHistory !== 'undefined') window.chatHistory = [];
  }

  // 6. 重新读取 globalTurnCount
  const tc = parseInt(localStorage.getItem('globalTurnCount') || '0');
  if (typeof _globalTurnCount !== 'undefined') window._globalTurnCount = tc;

  // 7. 应用新角色主题色
  applyCharacterTheme(newConfig);
  applyCharacterAvatar(newConfig);

  // 8. 刷新 UI
  // 切换角色需要强制清空聊天区域重新渲染，不能只追加
  const _msgContainer = document.querySelector('#chatScreen .messages');
  if (_msgContainer) _msgContainer.innerHTML = '';
  // 重置渲染计数，让 refreshChatScreen 重新从头渲染
  if (typeof _renderedMsgCount !== 'undefined') window._renderedMsgCount = 0;
  if (typeof _chatInited !== 'undefined') window._chatInited = false;
  if (typeof refreshChatScreen === 'function') refreshChatScreen();
  if (typeof renderWallet === 'function') renderWallet();
  if (typeof initMood === 'function') initMood();

  // 9. 同步云端
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave(true);

  console.log(`[character] 切换完成: ${currentCharId} → ${newCharId}`);
}

// ── 应用角色主题色 ────────────────────────────────────────
function applyCharacterTheme(config) {
  if (!config) config = getCurrentCharacterConfig();

  // 切换 body class
  document.body.classList.remove('theme-keegan', 'theme-ghost');
  if (config.id === 'keegan') {
    document.body.classList.add('theme-keegan');
  }

  // CSS 变量
  const root = document.documentElement;
  root.style.setProperty('--char-primary', config.themeColor);
  root.style.setProperty('--char-accent', config.accentColor);
  root.style.setProperty('--char-bg-from', config.bgFrom);
  root.style.setProperty('--char-bg-to', config.bgTo);

  localStorage.setItem('currentCharTheme', JSON.stringify({
    id: config.id,
    primary: config.themeColor,
    accent: config.accentColor,
  }));

  // Keegan 模式：只开放聊天，其他功能显示"即将开放"
  _applyKeeganRestrictions(config.id === 'keegan');
}

// ── Keegan 功能限制 ───────────────────────────────────────
function _applyKeeganRestrictions(isKeegan) {
  // 需要限制的卡片 id（主页功能卡片）
  const restrictedCards = [
    'calendarCard', 'walletCard',
  ];
  // 需要限制的 onclick（通过 data 标记）
  const restrictedScreens = [
    'calendarScreen', 'collectionScreen', 'marketScreen',
    'workScreen', 'vocabScreen', 'takeoutScreen',
    'achievementScreen', 'walletScreen', 'coupleScreen',
    'secretScreen',
  ];

  // 移除旧的限制遮罩
  document.querySelectorAll('.keegan-coming-soon').forEach(el => el.remove());

  if (!isKeegan) {
    // 恢复 Ghost 模式：移除所有限制
    document.querySelectorAll('[data-keegan-locked]').forEach(el => {
      el.style.opacity = '';
      el.style.pointerEvents = '';
      el.removeAttribute('data-keegan-locked');
    });
    return;
  }

  // Keegan 模式：限制所有非聊天入口
  // 找主页里所有功能卡片
  const mainContent = document.querySelector('#mainScreen .main-content');
  if (!mainContent) return;

  const cards = mainContent.querySelectorAll('.card');
  cards.forEach(card => {
    const onclick = card.getAttribute('onclick') || '';
    // 聊天卡片不限制
    if (onclick.includes('chatScreen')) return;
    // 其他卡片全部限制
    if (!card.getAttribute('data-keegan-locked')) {
      card.setAttribute('data-keegan-locked', '1');
      card.style.opacity = '0.45';
      card.style.filter = 'grayscale(60%)';

      // 加点击提示遮罩
      const overlay = document.createElement('div');
      overlay.className = 'keegan-coming-soon';
      overlay.style.cssText = 'position:absolute;inset:0;cursor:pointer;z-index:10;border-radius:inherit;';
      overlay.onclick = (e) => {
        e.stopPropagation();
        _showKeeganComingSoon();
      };
      card.style.position = 'relative';
      card.appendChild(overlay);
    }
  });

  // Tab Bar 也限制（情侣空间）
  const tabCouple = document.getElementById('tab-couple');
  if (tabCouple && !tabCouple.getAttribute('data-keegan-locked')) {
    tabCouple.setAttribute('data-keegan-locked', '1');
    tabCouple.style.opacity = '0.4';
    tabCouple.style.filter = 'grayscale(60%)';
    tabCouple._origOnclick = tabCouple.onclick;
    tabCouple.onclick = (e) => {
      e.stopPropagation();
      _showKeeganComingSoon();
    };
  }
}

// ── 提示弹窗 ─────────────────────────────────────────────
function _showKeeganComingSoon() {
  if (document.getElementById('keeganComingSoonToast')) return;
  const toast = document.createElement('div');
  toast.id = 'keeganComingSoonToast';
  toast.style.cssText = `
    position:fixed; bottom:100px; left:50%; transform:translateX(-50%) translateY(20px);
    background:rgba(30,58,80,0.88); color:white;
    padding:10px 22px; border-radius:20px;
    font-size:13px; font-weight:600;
    opacity:0; transition:all 0.3s cubic-bezier(0.34,1.56,0.64,1);
    z-index:10000; white-space:nowrap;
    backdrop-filter:blur(12px);
    box-shadow:0 4px 20px rgba(30,70,100,0.25);
  `;
  toast.textContent = '🔒 Keegan 此功能即将开放～';
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  }, 10);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ── 初始化：页面加载时应用当前角色主题 ───────────────────
function initCharacterSystem() {
  const config = getCurrentCharacterConfig();
  applyCharacterTheme(config);
  applyCharacterAvatar(config);
  console.log('[character] 初始化完成，当前角色:', config.id);
}

// ── 应用角色默认头像 ──────────────────────────────────────
function applyCharacterAvatar(config) {
  if (!config) config = getCurrentCharacterConfig();
  const customAvatar = localStorage.getItem('ghostAvatarUrl');
  const customBase64 = localStorage.getItem('ghostAvatarBase64');
  const avatarSrc = (customAvatar && !customAvatar.startsWith('data:'))
    ? customAvatar
    : (customBase64 || config.defaultAvatar || '');
  if (!avatarSrc) return;
  document.querySelectorAll('.ghost-avatar-img').forEach(el => {
    el.src = avatarSrc;
  });
}

// ── 获取当前角色的调情路由 ────────────────────────────────
function getCurrentVeniceEndpoint() {
  return getCurrentCharacterConfig().veniceEndpoint;
}

// ── 获取当前角色的人设构建函数 ───────────────────────────
function buildCurrentSystemPrompt() {
  const config = getCurrentCharacterConfig();
  const fn = window[config.personaBuilder];
  if (typeof fn === 'function') return fn();
  // 兜底：用 Ghost 的
  if (typeof buildSystemPrompt === 'function') return buildSystemPrompt();
  return '';
}

// ── 获取当前角色的 StyleCore（Haiku 用）─────────────────
function buildCurrentStyleCore() {
  const charId = getCurrentCharacter();
  if (charId === 'keegan' && typeof buildKeeganStyleCore === 'function') {
    return buildKeeganStyleCore();
  }
  if (typeof buildGhostStyleCore === 'function') return buildGhostStyleCore();
  return '';
}
