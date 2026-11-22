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
];

// ── 角色专属的 localStorage key 列表 ─────────────────────
// 这些 key 随角色切换，钱包 transactions 不在列表里（共用）
const CHARACTER_KEYS = [
  // 聊天
  'chatHistory',
  // 关系状态
  // Phase 3G-8B: 'moodLevel' 已从 CHARACTER_KEYS 删除（Keegan 不启用）。
  'affection', 'trustHeat', 'attachmentPull',
  'jealousyLevel', 'loveResistance', 'loveResistanceLastDecay',
  'globalTurnCount', 'relationshipFlags', 'emotionalHurt',
  'moneyRefuseCount', 'userDislikesMoney', 'sassyPost',
  // 记忆
  'longTermMemory', 'intimateMemory',
  // 剧情
  'storyBook', 'collections',
  'pendingReversePackages', 'lastReversePackageTurn',
  'pendingSeriousTalk',
  'pendingColdWarEndStory',
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
  'ghostAvatarUrl', 'ghostAvatarBase64', 'ghostAvatarUpdatedAt',
  'ghostUnlocked_birthday', 'ghostUnlocked_zodiac',
  'ghostUnlocked_height', 'ghostUnlocked_weight',
  'ghostUnlocked_blood_type', 'ghostUnlocked_hometown',
  // 朋友圈 / 商城
  'feedPosts', 'coupleFeedDate', 'lastFeedPostAt',
  'organicFeedCount',
  'marketTriggered', 'purchasedItems', 'purchaseCounts',
  'purchaseFacts',
  'intimateTriggered',
  // 租赁 AA 授权状态（按房源，非永久付款承诺）
  'homeAgreements',
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
  // 单角色阶段：所有业务固定使用 Simon。旧 Keegan 存档暂不删除。
  return 'ghost';
}

function getCurrentCharacterConfig() {
  const id = getCurrentCharacter();
  return CHARACTER_LIST.find(c => c.id === id) || CHARACTER_LIST[0];
}

function getCharacterList() {
  return CHARACTER_LIST;
}

// 单角色运行时：保留旧函数名兼容其他模块，不再搬运任何存档。
window._characterSwitching = false;
function _saveCharacterData() {}
function _loadCharacterData() {}
async function switchCharacter() { return; }

function applyCharacterTheme(config) {
  if (!config) config = getCurrentCharacterConfig();
  document.body.classList.remove('theme-keegan');
  document.body.classList.add('theme-ghost');
  const root = document.documentElement;
  root.style.setProperty('--char-primary', config.themeColor);
  root.style.setProperty('--char-accent', config.accentColor);
  root.style.setProperty('--char-bg-from', config.bgFrom);
  root.style.setProperty('--char-bg-to', config.bgTo);
  localStorage.setItem('currentCharTheme', JSON.stringify({
    id: 'ghost', primary: config.themeColor, accent: config.accentColor
  }));
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

  // 优先使用当前角色已经保存的头像，不用默认图覆盖自定义头像。
  const savedUrl = localStorage.getItem('ghostAvatarUrl') || '';
  const savedB64 = localStorage.getItem('ghostAvatarBase64') || '';
  const avatarSrc = (savedUrl && !savedUrl.startsWith('data:')) ? savedUrl : (savedB64 ? (savedB64.startsWith('data:') ? savedB64 : 'data:image/jpeg;base64,' + savedB64) : (config.defaultAvatar || ''));
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
  if (typeof buildGhostStyleCore === 'function') return buildGhostStyleCore();
  return '';
}
