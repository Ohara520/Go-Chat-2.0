// ============================================================
// profile.js — 资料页、地点天气、秘密页、日历、节日系统
//
// 包含：
//   initProfile / renderGhostProfile / saveRemark
//   initLocation / updateWeather / updateUKTime
//   LOCATIONS / FESTIVALS / MEET_TYPES / COUNTRY_DATA
//   SECRET_COLORS / ZODIACS
//   loadSecretScreen / saveSecret / selectXxx 系列
//   uploadAvatar / updateAvatarPreview / updateAvatarEverywhere
//   exportUserData / importUserData
//   initCalendar / getNextMilestone / renderMilestones / updateCalendarCard
//   triggerHomeItemMoment / triggerLuxuryMoment
//
// 依赖：state.js、persona.js、api.js
// ============================================================


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 数据表
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// tz: IANA 时区名（Ghost Time Authority 用）。用 IANA 名而非固定偏移，让 Intl 自动处理夏令时。
// tz: null = 真实时区未知（Classified/Undisclosed）；由 getGhostTimeZone() 在运行时回落 Europe/London，
// 那只是 compatibility fallback，不代表这些地点真在英国。
const LOCATIONS = [
  { name: 'Hereford Base',        weatherCity: 'Hereford',   reason: 'Routine garrison and training.', type: 'base',     tz: 'Europe/London' },
  { name: 'Manchester',           weatherCity: 'Manchester', reason: 'Leave. Back home.',              type: 'leave',    tz: 'Europe/London' },
  { name: 'London',               weatherCity: 'London',     reason: 'Work in London.',                 type: 'deployed', tz: 'Europe/London' },
  { name: 'Undisclosed Location', weatherCity: null,         reason: null,                              type: 'deployed', tz: null },
  { name: 'Classified',           weatherCity: null,         reason: null,                              type: 'deployed', tz: null },
];

// ghost_knows: true=主动提; 'heard'=听说过会祝福; false=不知道
const FESTIVALS = {
  '1-1':  { emoji: '🎆', label: '元旦',     ghost_knows: true },
  '2-14': { emoji: '💝', label: '情人节',   ghost_knows: true },
  '2-17': { emoji: '🧧', label: '春节',     ghost_knows: 'heard' },
  '3-5':  { emoji: '🏮', label: '元宵节',   ghost_knows: false },
  '3-8':  { emoji: '🌸', label: '妇女节',   ghost_knows: true },
  '3-14': { emoji: '🍫', label: '白色情人', ghost_knows: false },
  '3-17': { emoji: '🍀', label: "St Pat's", ghost_knows: true },
  '4-1':  { emoji: '🃏', label: '愚人节',   ghost_knows: true },
  '4-5':  { emoji: '🐣', label: '复活节',   ghost_knows: true },
  '5-1':  { emoji: '🎉', label: '劳动节',   ghost_knows: true },
  '5-10': { emoji: '💐', label: '母亲节',   ghost_knows: true },
  '6-1':  { emoji: '🎈', label: '儿童节',   ghost_knows: false },
  '6-19': { emoji: '🎋', label: '端午节',   ghost_knows: false },
  '6-21': { emoji: '👨', label: '父亲节',   ghost_knows: true },
  '8-1':  { emoji: '⚔️', label: '建军节',   ghost_knows: false },
  '8-25': { emoji: '💫', label: '七夕',     ghost_knows: false },
  '9-10': { emoji: '🍎', label: '教师节',   ghost_knows: false },
  '9-25': { emoji: '🌕', label: '中秋节',   ghost_knows: 'heard' },
  '10-1': { emoji: '🇨🇳', label: '国庆节', ghost_knows: false },
  '10-17':{ emoji: '🏔️', label: '重阳节',  ghost_knows: false },
  '10-31':{ emoji: '🎃', label: '万圣节',   ghost_knows: true },
  '11-11':{ emoji: '🛍️', label: '双十一',  ghost_knows: false },
  '11-26':{ emoji: '🦃', label: '感恩节',   ghost_knows: true },
  '12-21':{ emoji: '🥟', label: '冬至',     ghost_knows: 'heard' },
  '12-24':{ emoji: '🎁', label: '平安夜',   ghost_knows: true },
  '12-25':{ emoji: '🎄', label: '圣诞节',   ghost_knows: true },
  '12-31':{ emoji: '🥂', label: '跨年夜',   ghost_knows: true },
};

const MEET_TYPES = [
  { key: 'longtime',   emoji: '🌱', label: '日久生情',   prompt: '我们在同一个圈子里认识很久，朋友之间慢慢走近，有一天才发现彼此都藏着感情。' },
  { key: 'firstsight', emoji: '⚡', label: '一见钟情',   prompt: '第一次见面那一刻，我就知道了。没什么道理，就是确定。' },
  { key: 'childhood',  emoji: '🍀', label: '青梅竹马',   prompt: '我们从小认识，一起长大。那段时间刻在骨子里，分开过，但最后还是走到一起了。' },
  { key: 'online',     emoji: '📡', label: '网络情缘',   prompt: '一开始在网上认识的，隔着屏幕聊了很久。后来见面了，发现比想象中更真实。' },
  { key: 'accident',   emoji: '🎲', label: '意外相遇',   prompt: '就是个巧合。很普通的一天，很偶然的一个交集，然后就再也没分开。' },
  { key: 'rescue',     emoji: '🛡️', label: '英雄救美',   prompt: '是我帮了她，或者她拉了我一把。从那个时刻开始，就变得不一样了。' },
  { key: 'rival',      emoji: '🔥', label: '欢喜冤家',   prompt: '最开始我们关系并不好。针锋相对，互不服气，后来才发现吵架和在意其实是同一件事。' },
  { key: 'rekindle',   emoji: '🕯️', label: '旧情复燃',   prompt: '以前在一起过，分开了一段时间，各自经历了些事，最后又找回来了。' },
  { key: 'abroad',     emoji: '✈️', label: '异乡偶遇',   prompt: '在一个陌生的地方遇见了她。两个都是外来的人，反而走得近了。' },
  { key: 'coworker',   emoji: '🎖️', label: '战友情深',   prompt: '一起经历过真正危险的事。那种信任不是培养出来的，是在压力下自然生的。' },
];

// Legacy random Ghost activity/state pool retired. Reality facts come from current systems only.

const COUNTRY_DATA = {
  CN:    { name: 'China',        flag: '🇨🇳', offset: +8,  ghostLine: 'Seven hours between us. ...I count.' },
  NL:    { name: 'Netherlands',  flag: '🇳🇱', offset: +1,  ghostLine: "One hour. Close enough to feel further than it is." },
  CA:    { name: 'Canada',       flag: '🇨🇦', offset: -5,  ghostLine: 'Eight hours. I know the number by heart.' },
  AU:    { name: 'Australia',    flag: '🇦🇺', offset: +11, ghostLine: "Ten hours ahead. You're already in my tomorrow." },
  US:    { name: 'USA',          flag: '🇺🇸', offset: -5,  ghostLine: 'Eight hours. At least one of us is awake at any given time.' },
  DE:    { name: 'Germany',      flag: '🇩🇪', offset: +1,  ghostLine: "One hour apart. Should feel like nothing. Doesn't." },
  FR:    { name: 'France',       flag: '🇫🇷', offset: +1,  ghostLine: 'An hour between us. Still an hour too many.' },
  JP:    { name: 'Japan',        flag: '🇯🇵', offset: +9,  ghostLine: "Eight hours ahead. You're already living in my tomorrow." },
  KR:    { name: 'Korea',        flag: '🇰🇷', offset: +9,  ghostLine: "Nine hours. I've done the math more than I'd admit." },
  SG:    { name: 'Singapore',    flag: '🇸🇬', offset: +8,  ghostLine: 'Eight hours. Same as always.' },
  GB:    { name: 'UK',           flag: '🇬🇧', offset: 0,   ghostLine: 'Same timezone. No excuses now.' },
  OTHER: { name: 'somewhere',    flag: '🌍', offset: 0,    ghostLine: "Wherever you are. That's all I need to know." },
};

const SECRET_COLORS = [
  { name: '玫瑰红', hex: '#f48fb1' }, { name: '薰衣草', hex: '#ce93d8' },
  { name: '天蓝',   hex: '#81d4fa' }, { name: '薄荷绿', hex: '#a5d6a7' },
  { name: '奶白',   hex: '#fff9c4' }, { name: '珊瑚橙', hex: '#ffab91' },
  { name: '深紫',   hex: '#7b1fa2' }, { name: '炭黑',   hex: '#455a64' },
];

const ZODIACS = ['♈ 白羊','♉ 金牛','♊ 双子','♋ 巨蟹','♌ 狮子','♍ 处女',
                 '♎ 天秤','♏ 天蝎','♐ 射手','♑ 摩羯','♒ 水瓶','♓ 双鱼'];

const PROFILE_SIGNATURES = [
  { en: "Rarely surf the internet. Married.", zh: "很少冲浪，已婚。" },
  { en: "Still a ghost. Just married.", zh: "还是个幽灵，只是结婚了。" },
  { en: "Someone blew up the kitchen. Need a repair number.", zh: "谁能告诉我一个维修电话，有人把厨房炸了。" },
  { en: "Another mission tomorrow. Tea first.", zh: "明天还有任务，先喝茶。" },
  { en: "Long day. Good tea. Her message.", zh: "漫长的一天，一杯好茶，还有她的信息。" },
  { en: "Marriage logistics are more reliable than the army.", zh: "事实证明，婚姻的后勤比军队靠谱。" },
  { en: "Different countries. She still tells me to sleep.", zh: "不同的国家，但妻子还是会提醒我早点睡。" },
  { en: "Just married and already deployed. Classic.", zh: "刚结婚就外派，经典操作。" },
  { en: "Marriage debrief: message her before bed.", zh: "婚姻简报：睡前给她发信息。" },
  { en: "Why does my wife always know when I haven't eaten.", zh: "为什么老婆总是能知道我什么时候没吃饭。" },
  { en: "My enemy now is the time zone.", zh: "我现在的敌人是时区。" },
  { en: "Tried retiring. Army said no.", zh: "我试过退休，军队不同意。" },
  { en: "Bad at reports. Good at surviving.", zh: "不擅长写报告，但擅长活下来。" },
  { en: "Tea and a wife. That's how I work under pressure.", zh: "大概因为茶和妻子。" },
  { en: "Another day. Still not fired.", zh: "又一天，还没被开除。" },
  { en: "Some ghosts stay.", zh: "有些幽灵会留下。" },
  { en: "The mask hides a lot. Not everything.", zh: "面具能隐藏很多，但不是全部。" },
  { en: "Not ignoring you. Just thinking.", zh: "不是不回，是在想怎么说。" },
  { en: "Bad at goodbyes. Good at coming back.", zh: "不擅长道别，但很擅长回来。" },
  { en: "Silence doesn't mean I'm not listening.", zh: "沉默不代表没在听。" },
  { en: "Different timezone. Same person on my mind.", zh: "时区不同，但想的是同一个人。" },
  { en: "尼好. 我 learn 中文. 不 easy.", zh: "新学的中文，泥好。" },
];


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 地点 / 天气 / 时间
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function initLocation() {
  const saved = localStorage.getItem('currentLocation');
  let chosen = LOCATIONS.find(l => l.name === saved);

  // Location V2 foundation: no automatic/random city hopping.
  // Existing supported locations stay put; retired legacy locations migrate once to Hereford Base.
  if (!chosen) chosen = LOCATIONS[0];

  localStorage.setItem('currentLocation', chosen.name);
  localStorage.setItem('currentWeatherCity', chosen.weatherCity || '');
  localStorage.setItem('currentLocationType', chosen.type || 'base');
  if (chosen.reason) localStorage.setItem('currentLocationReason', chosen.reason);
  else localStorage.removeItem('currentLocationReason');

  // Retire the old 2–3 day random-location timer. Historical arrival/day keys are left untouched.
  localStorage.removeItem('locationNextChange');

  const locEl = document.getElementById('botLocation');
  if (locEl) locEl.textContent = chosen.name;
  return chosen;
}

async function updateWeather(city) {
  const el = document.getElementById('botWeather');
  if (!el) return;
  if (!city) { el.textContent = ''; return; }

  const cached = localStorage.getItem('lastWeatherDisplay');
  const cachedCity = localStorage.getItem('lastWeatherCity');
  const cachedTime = parseInt(localStorage.getItem('lastWeatherTime') || '0');
  if (cached && cachedCity === city && Date.now() - cachedTime < 30 * 60 * 1000) {
    el.textContent = cached; return;
  }

  try {
    const [res1] = await Promise.all([
      fetch(`https://wttr.in/${encodeURIComponent(city)}?format=%c%t`, { cache: 'no-store' }),
    ]);
    const display = await res1.text();
    if (display && /[\d°+\-]/.test(display) && display.length < 20 && !/this|query|error/i.test(display)) {
      el.textContent = display.trim();
      localStorage.setItem('lastWeatherDisplay', display.trim());
      localStorage.setItem('lastWeatherCity', city);
      localStorage.setItem('lastWeatherTime', Date.now().toString());
    } else if (cached) {
      el.textContent = cached;
    }
  } catch(e) {
    if (cached) el.textContent = cached;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Ghost Time Authority —— 唯一回答"Ghost 当前所在地几点"的地方
// 只给世界事实（现在几点），不解释"这个点该干嘛"。消费者拿到 hour 后各自解释。
// currentLocation → LOCATIONS.tz → Ghost local time。tz 未知/异常时回落 Europe/London（仅兼容兜底）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const _GHOST_TZ_FALLBACK = 'Europe/London';

function getGhostTimeZone() {
  try {
    const loc = localStorage.getItem('currentLocation');
    const entry = LOCATIONS.find(l => l.name === loc);
    // 查不到该地点，或该地点真实时区未知（Classified/Undisclosed，tz:null）→ 兼容兜底
    return (entry && entry.tz) ? entry.tz : _GHOST_TZ_FALLBACK;
  } catch(e) {
    return _GHOST_TZ_FALLBACK;
  }
}

function getGhostHour() {
  try {
    return parseInt(new Intl.DateTimeFormat('en-GB', {
      timeZone: getGhostTimeZone(), hour: 'numeric', hour12: false
    }).format(new Date()));
  } catch(e) {
    return parseInt(new Intl.DateTimeFormat('en-GB', {
      timeZone: _GHOST_TZ_FALLBACK, hour: 'numeric', hour12: false
    }).format(new Date()));
  }
}

// Ghost 当地日期，YYYY-MM-DD。en-CA 保证 Intl 直接吐 ISO 格式的年月日。
function getGhostDateStr() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: getGhostTimeZone(), year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  } catch(e) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: _GHOST_TZ_FALLBACK, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }
}

// Ghost 当地星期，英文全称（Sunday…Saturday）。与 getGhostDateStr 同一时区，天然对齐。
function getGhostWeekday() {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: getGhostTimeZone(), weekday: 'long'
    }).format(new Date());
  } catch(e) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: _GHOST_TZ_FALLBACK, weekday: 'long'
    }).format(new Date());
  }
}

// Ghost 当地时间，HH:MM（24小时制）。与 getGhostDateStr / getGhostWeekday 同一时区。
function getGhostTimeStr() {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: getGhostTimeZone(), hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date());
  } catch(e) {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: _GHOST_TZ_FALLBACK, hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date());
  }
}

// 将任意 timestamp 转换为 Ghost 当地时间，HH:MM（24小时制）
// 用于将 doneAt / arrivedAt 等事件时间戳转换为 Ghost 所在地的具体时刻
function formatTimestampToGhostLocal(timestamp) {
  if (!timestamp || typeof timestamp !== 'number') return null;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: getGhostTimeZone(), hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(timestamp));
  } catch(e) {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: _GHOST_TZ_FALLBACK, hour: '2-digit', minute: '2-digit', hour12: false
      }).format(new Date(timestamp));
    } catch(e2) {
      return null;
    }
  }
}

function updateUKTime() {
  const el = document.getElementById('botUKTime');
  if (!el) return;
  const ghostTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: getGhostTimeZone(), hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date());
  el.textContent = ghostTime;
}

function getUserCountry() {
  return localStorage.getItem('userCountry') || 'CN';
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 资料页
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 邀请码系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function loadMyInviteCode() {
  const el = document.getElementById('myInviteCode');
  if (!el) return;

  // 先看本地有没有缓存
  const cached = localStorage.getItem('myInviteCode');
  if (cached) { el.textContent = cached; return; }

  const email = localStorage.getItem('userEmail') || localStorage.getItem('sb_user_email') || '';
  if (!email) { el.textContent = '请先登录'; return; }

  try {
    // 查是否已有未使用的邀请码
    const res = await fetch('/api/get-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (data.code) {
      localStorage.setItem('myInviteCode', data.code);
      el.textContent = data.code;
    } else {
      el.textContent = '暂无邀请码';
    }
  } catch(e) {
    el.textContent = '加载失败';
  }
}

// 复制邀请码：传 code 则复制该码（邀请列表里的复制按钮），
// 不传则回退读 #myInviteCode（我的邀请码区块）
function copyInviteCode(code) {
  if (!code) {
    code = document.getElementById('myInviteCode')?.textContent || '';
    if (!code || code === '加载中…' || code === '暂无邀请码') return;
  }
  navigator.clipboard.writeText(code).then(() => {
    if (typeof showToast === 'function') showToast('邀请码已复制 ✅');
  }).catch(() => {
    // 兜底方案
    const ta = document.createElement('textarea');
    ta.value = code;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (typeof showToast === 'function') showToast('邀请码已复制 ✅');
  });
}

function initProfile() {
  const location = localStorage.getItem('currentLocation') || 'Hereford Base';
  const locationZH = {
    'Hereford Base': '赫里福德基地', 'Manchester': '曼彻斯特', 'London': '伦敦',
    'Edinburgh': '爱丁堡', 'Germany': '德国', 'Poland': '波兰',
    'Norway': '挪威', 'Amsterdam': '阿姆斯特丹', 'Paris': '巴黎',
    'Dublin': '都柏林', 'Tokyo': '东京',
    'Undisclosed Location': '未公开地点', 'Classified': '位置保密',
  };
  const remark = localStorage.getItem('botNickname') || '';

  const sigEl = document.getElementById('profileSignature');
  if (sigEl) {
    const saved = localStorage.getItem('profileSignature');
    const nextChange = parseInt(localStorage.getItem('profileSignatureNext') || '0');
    const now = Date.now();
    let sig;
    if (!saved || now >= nextChange) {
      const item = PROFILE_SIGNATURES[Math.floor(Math.random() * PROFILE_SIGNATURES.length)];
      sig = JSON.stringify(item);
      localStorage.setItem('profileSignature', sig);
      const days = 1 + Math.floor(Math.random() * 7);
      localStorage.setItem('profileSignatureNext', now + days * 24 * 60 * 60 * 1000);
    } else {
      sig = saved;
    }
    const item = JSON.parse(sig);
    sigEl.innerHTML = `<div class="sig-en">${item.en}</div><div class="sig-zh">${item.zh}</div>`;
  }

  const locEl = document.getElementById('profileLocation');
  if (locEl) locEl.textContent = `${location}  ${locationZH[location] || ''}`;

  const ageEl = document.getElementById('profileAge');
  if (ageEl) ageEl.textContent = '32';

  const profileNameEl = document.getElementById('profileDisplayName');
  if (profileNameEl) profileNameEl.textContent = remark || 'Simon Riley';

  const remEl = document.getElementById('profileRemark');
  if (remEl) remEl.value = remark;

  // 修复：统一用 refreshGhostAvatar() 刷新头像
  // 旧逻辑只读 ghostAvatarUrl，上传失败时 base64 备份不会被用到
  // refreshGhostAvatar() 同时处理 URL 和 base64 备份，两边一致
  if (typeof refreshGhostAvatar === 'function') {
    refreshGhostAvatar();
  } else {
    // 兜底：refreshGhostAvatar 还没加载时手动处理
    const ghostAvatarUrl = localStorage.getItem('ghostAvatarUrl');
    const ghostAvatarB64 = localStorage.getItem('ghostAvatarBase64');
    if (ghostAvatarUrl) {
      document.querySelectorAll('.ghost-avatar-img').forEach(img => { img.src = ghostAvatarUrl; });
    } else if (ghostAvatarB64) {
      document.querySelectorAll('.ghost-avatar-img').forEach(img => {
        img.src = 'data:image/jpeg;base64,' + ghostAvatarB64;
      });
    }
  }

  renderGhostProfile();
  loadMyInviteCode();

  // Profile V2: 渲染新版 UI
  renderProfileV2();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Profile V2 渲染
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function refreshProfileUserAvatar(avatar) {
  const img = document.getElementById('profileUserAvatar');
  if (!img) return;
  const raw = avatar || localStorage.getItem('userAvatarBase64') || '';
  // 兼容旧版纯 base64 和新版完整 data URI，也兼容云端 http(s) URL。
  const src = !raw ? getDefaultAvatar()
    : (/^(data:image\/|https?:\/\/|blob:)/i.test(raw) ? raw : 'data:image/jpeg;base64,' + raw);
  img.src = src;
  img.onerror = function() { this.onerror = null; this.src = getDefaultAvatar(); };
}

function renderProfileV2() {
  // 备注名 / 真实姓名
  const remark = localStorage.getItem('botNickname') || '';
  const nicknameEl = document.getElementById('profileDisplayName');
  if (nicknameEl) {
    nicknameEl.textContent = remark || 'Sim💗';
  }

  // V3 只展示已有个签数据，不在资料页创建或随机更换台词。
  const sigV2El = document.getElementById('profileSignatureV2');
  if (sigV2El) {
    let savedSignature = '';
    try {
      const raw = localStorage.getItem('profileSignature');
      if (raw) {
        const parsed = JSON.parse(raw);
        savedSignature = [parsed.en, parsed.zh].filter(Boolean).join(' · ');
      }
    } catch(e) { /* malformed legacy signature: keep neutral fallback */ }
    sigV2El.textContent = savedSignature || '—';
  }

  // 资料页用户头像：优先本地已保存头像，未设置时显示默认图。
  refreshProfileUserAvatar();

  // 我们在一起 X 天
  const marriageDate = localStorage.getItem('marriageDate') || '';
  let togetherDays = 0;
  if (marriageDate) {
    const today = new Date();
    togetherDays = Math.max(1, Math.floor((today - new Date(marriageDate)) / 86400000) + 1);
  }
  const daysEl = document.getElementById('profileTogetherDays');
  if (daysEl) daysEl.textContent = togetherDays;

  const sinceEl = document.getElementById('profileSinceDate');
  if (sinceEl) {
    if (marriageDate) {
      const [y, m, d] = marriageDate.split('-');
      sinceEl.textContent = `${y}.${m}.${d}`;
    } else {
      sinceEl.textContent = '2026.06.01';
    }
  }

  // 地点
  const location = localStorage.getItem('currentLocation') || 'Manchester';
  const locV2El = document.getElementById('profileLocationV2');
  if (locV2El) locV2El.textContent = location;

  // 天气
  const weatherCity = localStorage.getItem('currentWeatherCity') || '';
  if (weatherCity) {
    updateWeatherV2(weatherCity);
  } else {
    const weatherV2El = document.getElementById('profileWeatherV2');
    if (weatherV2El) weatherV2El.textContent = '—';
    const weatherDescEl = document.getElementById('profileWeatherDesc');
    if (weatherDescEl) weatherDescEl.textContent = '—';
  }

  // 资料页 V3 不展示当地钟点；全局 Ghost 时间事实函数保持不变。
}

async function updateWeatherV2(city) {
  if (!city) return;

  const cached = localStorage.getItem('lastWeatherDisplay');
  const cachedCity = localStorage.getItem('lastWeatherCity');
  const cachedTime = parseInt(localStorage.getItem('lastWeatherTime') || '0');
  if (cached && cachedCity === city && Date.now() - cachedTime < 30 * 60 * 1000) {
    // 解析缓存天气
    parseWeatherV2(cached);
    return;
  }

  try {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=%c%t`, { cache: 'no-store' });
    const display = await res.text();
    if (display && /[\d°+\-]/.test(display) && display.length < 20 && !/this|query|error/i.test(display)) {
      localStorage.setItem('lastWeatherDisplay', display.trim());
      localStorage.setItem('lastWeatherCity', city);
      localStorage.setItem('lastWeatherTime', Date.now().toString());
      parseWeatherV2(display.trim());
    } else if (cached) {
      parseWeatherV2(cached);
    }
  } catch(e) {
    if (cached) parseWeatherV2(cached);
  }
}

function parseWeatherV2(text) {
  // text 格式类似 "☁️ +12°C" 或 "🌤️+12°C"
  const weatherV2El = document.getElementById('profileWeatherV2');
  const weatherDescEl = document.getElementById('profileWeatherDesc');
  if (!weatherV2El || !weatherDescEl) return;

  // 提取温度
  const tempMatch = text.match(/([+-]?\d+)°/);
  if (tempMatch) {
    weatherV2El.textContent = tempMatch[1] + '°C';
  } else {
    weatherV2El.textContent = '—';
  }

  // 提取天气描述（emoji 或文字）
  const emojiMatch = text.match(/^([☀️🌤️⛅☁️🌧️⛈️🌩️❄️🌨️🌫️]+)/);
  if (emojiMatch) {
    const emoji = emojiMatch[1].trim();
    const descMap = {
      '☀️': '晴天',
      '🌤️': '多云',
      '⛅': '多云',
      '☁️': '阴天',
      '🌧️': '雨',
      '⛈️': '雷雨',
      '🌩️': '雷雨',
      '❄️': '雪',
      '🌨️': '雪',
      '🌫️': '雾',
    };
    weatherDescEl.textContent = descMap[emoji] || '多云';
  } else {
    weatherDescEl.textContent = '多云';
  }
}

function updateGhostLocalTime() {
  const timeEl = document.getElementById('profileTimeV2');
  if (!timeEl) return;

  const tz = (typeof getGhostTimeZone === 'function') ? getGhostTimeZone() : 'Europe/London';
  try {
    const ghostTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date());
    timeEl.textContent = ghostTime;
  } catch(e) {
    timeEl.textContent = '—';
  }
}

// 备注编辑弹窗
function openRemarkEditor() {
  const overlay = document.getElementById('remarkEditorOverlay');
  if (!overlay) {
    // 创建弹窗
    const div = document.createElement('div');
    div.id = 'remarkEditorOverlay';
    div.className = 'remark-editor-overlay';
    div.innerHTML = `
      <div class="remark-editor-modal" onclick="event.stopPropagation()">
        <div class="remark-editor-title">编辑备注</div>
        <input type="text" class="remark-editor-input" id="remarkEditorInput" placeholder="给他起个备注..." maxlength="20">
        <div class="remark-editor-actions">
          <button class="remark-editor-cancel" onclick="closeRemarkEditor()">取消</button>
          <button class="remark-editor-save" onclick="saveRemarkFromEditor()">保存</button>
        </div>
      </div>
    `;
    div.onclick = function(e) {
      if (e.target === div) closeRemarkEditor();
    };
    document.body.appendChild(div);
  }

  const input = document.getElementById('remarkEditorInput');
  if (input) {
    input.value = localStorage.getItem('botNickname') || '';
    input.focus();
  }

  const overlay2 = document.getElementById('remarkEditorOverlay');
  if (overlay2) overlay2.style.display = 'flex';
}

function closeRemarkEditor() {
  const overlay = document.getElementById('remarkEditorOverlay');
  if (overlay) overlay.style.display = 'none';
}

function saveRemarkFromEditor() {
  const input = document.getElementById('remarkEditorInput');
  if (!input) return;

  const val = input.value.trim();
  localStorage.setItem('botNickname', val);

  // 更新所有显示备注的地方
  const nameEl = document.getElementById('chatBotName');
  if (nameEl) nameEl.textContent = val || 'Simon Riley';

  const profileNameEl = document.getElementById('profileDisplayName');
  if (profileNameEl) profileNameEl.textContent = val || 'Sim💗';

  const remEl = document.getElementById('profileRemark');
  if (remEl) remEl.value = val;

  if (typeof touchLocalState === 'function') touchLocalState();

  closeRemarkEditor();

  if (typeof showToast === 'function') showToast('备注已保存 ✅');
}

function renderGhostProfile() {
  const fields = {
    birthday:   { id: 'profileBirthday',  key: 'ghostBirthday' },
    zodiac:     { id: 'profileZodiac',    key: 'ghostZodiac' },
    height:     { id: 'profileHeight',    key: 'ghostHeight' },
    weight:     { id: 'profileWeight',    key: 'ghostWeight' },
    blood_type: { id: 'profileBloodType', key: 'ghostBloodType' },
    hometown:   { id: 'profileHometown',  key: 'ghostHometown' },
  };
  Object.entries(fields).forEach(([field, { id, key }]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const unlocked = localStorage.getItem(`ghostUnlocked_${field}`) === 'true';
    const value = localStorage.getItem(key) || '';
    if (unlocked && value) {
      el.textContent = value;
      el.classList.remove('profile-locked');
    } else {
      el.textContent = '🔒 聊出来才知道';
      el.classList.add('profile-locked');
    }
  });
}

function saveRemark() {
  const val = document.getElementById('profileRemark')?.value.trim() || '';
  localStorage.setItem('botNickname', val);
  const nameEl = document.getElementById('chatBotName');
  if (nameEl) nameEl.textContent = val || 'Simon Riley';
  const profileNameEl = document.getElementById('profileDisplayName');
  if (profileNameEl) profileNameEl.textContent = val || 'Simon Riley';
  if (typeof touchLocalState === 'function') touchLocalState();
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 秘密页
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function saveSecret(key, value) {
  let val = (value || '').trim();
  if (key === 'userBirthday') {
    const match = val.match(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
    if (val && !match) { showToast('生日格式不对，请输入 MM-DD，例如 03-15'); return; }
    // 修复：先存值再渲染日历，否则日历读到的是旧生日
    localStorage.setItem(key, val);
    updateCalendarAfterBirthday();
    return;
  }
  localStorage.setItem(key, val);
}

function updateCalendarAfterBirthday() {
  const calScreen = document.getElementById('calendarScreen');
  if (calScreen && calScreen.classList.contains('active')) initCalendar();
}

function loadSecretScreen() {
  const fields = {
    'sec_username': 'userName', 'sec_birthday': 'userBirthday', 'sec_mbti': 'userMBTI',
    'sec_food': 'userFavFood', 'sec_music': 'userFavMusic', 'sec_color': 'userFavColor',
    'sec_bestline': 'ghostBestLine',
  };
  Object.entries(fields).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = localStorage.getItem(key) || '';
    el.onblur = () => saveSecret(key, el.value);
    if (key !== 'userBirthday') {
      el.oninput = () => { if (el.value.trim()) saveSecret(key, el.value); };
    }
  });

  // 相遇方式
  const meetTypeEl = document.getElementById('meetTypeChips');
  if (meetTypeEl) {
    const savedMeet = localStorage.getItem('meetType') || '';
    meetTypeEl.innerHTML = MEET_TYPES.map(m =>
      `<div class="secret-chip ${savedMeet === m.key ? 'selected' : ''}" onclick="selectMeetType('${m.key}', this)">${m.emoji} ${m.label}</div>`
    ).join('');
  }

  // 头像预览
  updateAvatarPreview(localStorage.getItem('userAvatarBase64'));

  // 星座
  const zodiacSaved = localStorage.getItem('userZodiac') || '';
  const zodiacEl = document.getElementById('zodiacChips');
  if (zodiacEl) {
    zodiacEl.innerHTML = ZODIACS.map(z => {
      const label = z.split(' ')[1];
      return `<div class="secret-chip ${zodiacSaved === label ? 'selected' : ''}" onclick="selectZodiac('${label}', this)">${z}</div>`;
    }).join('');
  }

  // 国家
  const countryEl = document.getElementById('countryChips');
  if (countryEl) {
    const savedCountry = getUserCountry();
    const countries = [
      {code:'CN',label:'🇨🇳 中国'},{code:'NL',label:'🇳🇱 荷兰'},{code:'CA',label:'🇨🇦 加拿大'},
      {code:'AU',label:'🇦🇺 澳大利亚'},{code:'US',label:'🇺🇸 美国'},{code:'DE',label:'🇩🇪 德国'},
      {code:'FR',label:'🇫🇷 法国'},{code:'JP',label:'🇯🇵 日本'},{code:'KR',label:'🇰🇷 韩国'},
      {code:'SG',label:'🇸🇬 新加坡'},{code:'GB',label:'🇬🇧 英国'},{code:'OTHER',label:'🌍 其他'},
    ];
    countryEl.innerHTML = countries.map(ct =>
      `<div class="country-chip ${savedCountry === ct.code ? 'selected' : ''}" onclick="selectCountry('${ct.code}', this)">${ct.label}</div>`
    ).join('');
  }

  // 颜色
  const color = localStorage.getItem('userFavColor') || '';
  const colorEl = document.getElementById('colorChips');
  if (colorEl) {
    colorEl.innerHTML = SECRET_COLORS.map(c =>
      `<div class="secret-color-dot ${color.split('、').includes(c.name) ? 'selected' : ''}" style="background:${c.hex}" title="${c.name}" onclick="selectColor('${c.name}', this)"></div>`
    ).join('');
  }

  // 邀请码
  loadMyInviteCodes();
}

async function loadMyInviteCodes() {
  const container = document.getElementById('inviteCodeList');
  if (!container) return;
  const email = localStorage.getItem('userEmail') || localStorage.getItem('sb_user_email') || '';
  if (!email) {
    container.innerHTML = '<div style="font-size:12px;color:#9aba88;">登录后可查看邀请码</div>';
    return;
  }
  try {
    const sb = window.sbClient || window._sbClient;
    if (!sb) { container.innerHTML = '<div style="font-size:12px;color:#9aba88;">加载失败</div>'; return; }
    const { data, error } = await sb
      .from('invite_codes')
      .select('code, is_used, used_at')
      .eq('created_by', email.toLowerCase().trim())
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      container.innerHTML = '<div style="font-size:12px;color:#9aba88;">暂无邀请码，联系管理员获取</div>';
      return;
    }

    container.innerHTML = data.map(item => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(90,160,70,0.08);border:1px solid rgba(90,160,70,0.2);border-radius:12px;">
        <div>
          <div style="font-size:14px;font-weight:600;color:${item.is_used ? '#9aba88' : '#2d6028'};letter-spacing:1px;">${item.code}</div>
          <div style="font-size:11px;color:#9aba88;margin-top:2px;">${item.is_used ? '✓ 已使用' : '✦ 未使用'}</div>
        </div>
        ${!item.is_used ? `<button onclick="copyInviteCode('${item.code}')" style="padding:6px 12px;background:rgba(90,160,70,0.15);border:1px solid rgba(90,160,70,0.3);border-radius:8px;color:#2d6028;font-size:12px;cursor:pointer;">复制</button>` : ''}
      </div>
    `).join('');
  } catch(e) {
    container.innerHTML = '<div style="font-size:12px;color:#9aba88;">加载失败，请稍后重试</div>';
  }
}

function selectZodiac(label, el) {
  document.querySelectorAll('#zodiacChips .secret-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  saveSecret('userZodiac', label);
}

function selectMeetType(key, el) {
  document.querySelectorAll('#meetTypeChips .secret-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  localStorage.setItem('meetType', key);
}

function selectColor(name, el) {
  const dots = document.querySelectorAll('#colorChips .secret-color-dot');
  const selected = document.querySelectorAll('#colorChips .secret-color-dot.selected');
  if (el.classList.contains('selected')) {
    el.classList.remove('selected');
  } else {
    if (selected.length >= 3) { showToast('最多选3种颜色哦'); return; }
    el.classList.add('selected');
  }
  const colors = [];
  dots.forEach(d => { if (d.classList.contains('selected')) colors.push(d.title); });
  saveSecret('userFavColor', colors.join('、'));
}

function selectCountry(code, el) {
  localStorage.setItem('userCountry', code);
  document.querySelectorAll('.country-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 情侣空间封面换图
function uploadCoverImage(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const MAX_W = 1200, MAX_H = 600;
      let w = img.width, h = img.height;
      const ratio = Math.min(MAX_W / w, MAX_H / h, 1);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const base64 = canvas.toDataURL('image/jpeg', 0.75);
      try {
        localStorage.setItem('coupleCoverBase64', base64);
        restoreCoupleCover();
        if (typeof showToast === 'function') showToast('封面已更新 ✅');
        if (typeof touchLocalState === 'function') touchLocalState();
        if (typeof scheduleCloudSave === 'function') {
          scheduleCloudSave()
            .then(() => showToast('已同步到云端 ☁️'))
            .catch(() => showToast('同步失败，请检查网络'));
        }
      } catch(e) {
        if (typeof showToast === 'function') showToast('图片太大，换一张试试');
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  input.value = '';
}

// 恢复自定义封面
function restoreCoupleCover() {
  const saved = localStorage.getItem('coupleCoverBase64');
  const bannerImg = document.getElementById('coupleBannerImg');
  if (bannerImg && saved) {
    bannerImg.src = saved;
  }
}

// 头像
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getDefaultAvatar() { return 'images/default-avatar.jpg'; }

function uploadAvatar(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const MAX = 400;
      let w = img.width, h = img.height;
      if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
      else        { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const base64 = canvas.toDataURL('image/jpeg', 0.7);
      try {
        localStorage.setItem('userAvatarBase64', base64);
        updateAvatarPreview(base64);
        updateAvatarEverywhere(base64);
        showToast('头像已更新 ✅');
        // 强制立刻写云端，不走防抖
        if (typeof scheduleCloudSave === 'function') {
          scheduleCloudSave()
            .then(() => showToast('已同步到云端 ☁️'))
            .catch(() => showToast('同步失败，请检查网络'));
        }
      } catch(e) {
        console.warn('[avatar] localStorage存储失败（可能空间不足）:', e);
        showToast('⚠️ 存储空间不足，请清理浏览器缓存后重试');
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function updateAvatarPreview(base64) {
  const preview = document.getElementById('secretAvatarPreview');
  if (!preview) return;
  const src = base64 || getDefaultAvatar();
  preview.innerHTML = `<img src="${src}" alt="avatar" style="width:80px;height:80px;object-fit:cover;border-radius:50%;display:block;">`;
}

function updateAvatarEverywhere(base64) {
  const src = base64 || getDefaultAvatar();
  const apply = (el) => {
    if (!el) return;
    el.style.backgroundImage = `url(${src})`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.style.borderRadius = '50%';
    el.textContent = '';
  };
  apply(document.getElementById('coupleCoverUserAvatar'));
  apply(document.getElementById('coupleUserAvatar'));
  refreshProfileUserAvatar(base64);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 数据导出导入
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ===== 记忆导出导入（XOR加密 + 字段名混淆）=====
const _FM = {
  userName:'_p1',userBirthday:'_p2',userZodiac:'_p3',userMBTI:'_p4',
  userCountry:'_p5',userFavFood:'_p6',userFavMusic:'_p7',userFavColor:'_p8',
  marriageDate:'_p9',botNickname:'_pa',meetType:'_pb',marriageType:'_pc',
  ghostBirthday:'_g1',ghostZodiac:'_g2',ghostAvatarUrl:'_g3',ghostHeight:'_g4',
  ghostWeight:'_g5',ghostBloodType:'_g6',ghostHometown:'_g7',
  ghostUnlocked_birthday:'_g8',ghostUnlocked_zodiac:'_g9',ghostUnlocked_height:'_ga',
  ghostUnlocked_weight:'_gb',ghostUnlocked_blood_type:'_gc',ghostUnlocked_hometown:'_gd',
  affection:'_r1',moodLevel:'_r2',relationshipFlags:'_r3',metInPerson:'_r4',
};
const _FMR = Object.fromEntries(Object.entries(_FM).map(([k,v])=>[v,k]));
const _EK = 'Gh0st.N0Agc.S1m0n.R1ley.TF141';
function _enc(str) {
  const k=_EK; let o='';
  for(let i=0;i<str.length;i++) o+=String.fromCharCode(str.charCodeAt(i)^k.charCodeAt(i%k.length));
  return btoa(unescape(encodeURIComponent(o)));
}
function _dec(b64) {
  const str=decodeURIComponent(escape(atob(b64)));
  const k=_EK; let o='';
  for(let i=0;i<str.length;i++) o+=String.fromCharCode(str.charCodeAt(i)^k.charCodeAt(i%k.length));
  return o;
}
function _ob(obj){ const r={}; for(const[k,v]of Object.entries(obj)) r[_FM[k]||k]=v; return r; }
function _dob(obj){ const r={}; for(const[k,v]of Object.entries(obj)) r[_FMR[k]||k]=v; return r; }

function exportUserData() {
  const rawHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');
  const cleanHistory = rawHistory.filter(m => !m._system && !m._recalled && !m._intimate);
  const inner = {
    _v: '3.0', _t: new Date().toISOString(), _h: cleanHistory,
    _a: _ob({ userName:localStorage.getItem('userName')||'', userBirthday:localStorage.getItem('userBirthday')||'', userZodiac:localStorage.getItem('userZodiac')||'', userMBTI:localStorage.getItem('userMBTI')||'', userCountry:localStorage.getItem('userCountry')||'', userFavFood:localStorage.getItem('userFavFood')||'', userFavMusic:localStorage.getItem('userFavMusic')||'', userFavColor:localStorage.getItem('userFavColor')||'', marriageDate:localStorage.getItem('marriageDate')||'', botNickname:localStorage.getItem('botNickname')||'', meetType:localStorage.getItem('meetType')||'', marriageType:localStorage.getItem('marriageType')||'established' }),
    _b: _ob({ ghostBirthday:localStorage.getItem('ghostBirthday')||'', ghostZodiac:localStorage.getItem('ghostZodiac')||'', ghostAvatarUrl:localStorage.getItem('ghostAvatarUrl')||'', ghostHeight:localStorage.getItem('ghostHeight')||'', ghostWeight:localStorage.getItem('ghostWeight')||'', ghostBloodType:localStorage.getItem('ghostBloodType')||'', ghostHometown:localStorage.getItem('ghostHometown')||'', ghostUnlocked_birthday:localStorage.getItem('ghostUnlocked_birthday')||'', ghostUnlocked_zodiac:localStorage.getItem('ghostUnlocked_zodiac')||'', ghostUnlocked_height:localStorage.getItem('ghostUnlocked_height')||'', ghostUnlocked_weight:localStorage.getItem('ghostUnlocked_weight')||'', ghostUnlocked_blood_type:localStorage.getItem('ghostUnlocked_blood_type')||'', ghostUnlocked_hometown:localStorage.getItem('ghostUnlocked_hometown')||'' }),
    _c: _ob({ affection:localStorage.getItem('affection')||'60', moodLevel:localStorage.getItem('moodLevel')||'7', relationshipFlags:localStorage.getItem('relationshipFlags')||'{}', metInPerson:localStorage.getItem('metInPerson')||'false' }),
  };
  const output = { gc: _enc(JSON.stringify(inner)), _: '1' };
  const blob = new Blob([JSON.stringify(output)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gc-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ 记忆已导出，请保存好文件');
}

function importUserData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const outer = JSON.parse(text);
      if (outer.version) {
        // 旧版明文文件兼容
        if (outer.chatHistory?.length > 0) localStorage.setItem('chatHistory', JSON.stringify(outer.chatHistory));
        if (outer.longTermMemory) localStorage.setItem('longTermMemory', outer.longTermMemory);
        if (outer.profile)       Object.entries(outer.profile).forEach(([k,v])=>{ if(v) localStorage.setItem(k,v); });
        if (outer.ghostData)     Object.entries(outer.ghostData).forEach(([k,v])=>{ if(v) localStorage.setItem(k,v); });
        if (outer.relationship)  Object.entries(outer.relationship).forEach(([k,v])=>{ if(v) localStorage.setItem(k,v); });
      } else if (outer.gc) {
        // 新版加密文件
        let inner;
        try { inner = JSON.parse(_dec(outer.gc)); } catch(e) { showToast('❌ 文件已损坏或不兼容'); return; }
        if (!inner._v) { showToast('❌ 文件格式不对'); return; }
        if (inner._h?.length > 0) localStorage.setItem('chatHistory', JSON.stringify(inner._h));
        if (inner._a) Object.entries(_dob(inner._a)).forEach(([k,v])=>{ if(v) localStorage.setItem(k,v); });
        if (inner._b) Object.entries(_dob(inner._b)).forEach(([k,v])=>{ if(v) localStorage.setItem(k,v); });
        if (inner._c) Object.entries(_dob(inner._c)).forEach(([k,v])=>{ if(v) localStorage.setItem(k,v); });
      } else {
        showToast('❌ 文件格式不对，请选择正确的记忆文件'); return;
      }
      showToast('✅ 记忆已恢复！正在刷新...');
      setTimeout(() => location.reload(), 1500);
    } catch(err) {
      showToast('❌ 导入失败，文件可能已损坏');
    }
  };
  input.click();
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 日历系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function initCalendar() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const day = today.getDate();
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const titleEl = document.getElementById('calendarTitle');
  if (titleEl) titleEl.textContent = `${monthNames[month]} ${year}`;

  if (typeof renderCheckin === 'function') renderCheckin();

  const marriageDate = localStorage.getItem('marriageDate') || '';
  const userBirthday = localStorage.getItem('userBirthday') || '';
  let marriageDays = 0;
  if (marriageDate) {
    marriageDays = Math.max(1, Math.floor((today - new Date(marriageDate)) / 86400000) + 1);
  }

  const mdEl = document.getElementById('marriageDays');
  if (mdEl) mdEl.textContent = marriageDays;
  const mdDisplayEl = document.getElementById('marriageDateDisplay');
  if (mdDisplayEl) mdDisplayEl.textContent = marriageDate || '未设置';

  const nextMilestone = getNextMilestone(marriageDays, marriageDate, today);
  const countdownLabelEl = document.getElementById('countdownLabel');
  const nextMilestoneDaysEl = document.getElementById('nextMilestoneDays');
  if (countdownLabelEl) countdownLabelEl.textContent = nextMilestone.label;
  if (nextMilestoneDaysEl) nextMilestoneDaysEl.textContent = nextMilestone.days + '天';

  renderMilestones(marriageDays, marriageDate, userBirthday, today);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayCheckinKey = 'checkin_' + today.toDateString();
  const checkedInToday = !!localStorage.getItem(todayCheckinKey);

  let html = '';
  for (let i = 0; i < firstDay; i++) html += '<div class="day"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const festKey = `${month + 1}-${d}`;
    let cls = 'day', extra = '';
    const isToday = d === day;

    const pastCheckinKey = 'checkin_' + new Date(year, month, d).toDateString();
    const wasCheckedIn = !!localStorage.getItem(pastCheckinKey);
    if (wasCheckedIn && !isToday) extra += '<div class="checkin-dot-mark"></div>';

    if (isToday) {
      cls = checkedInToday ? 'day today checked-in' : 'day today can-checkin';
      extra += checkedInToday
        ? '<div class="checkin-dot-mark done"></div><div style="font-size:9px;color:#a855f7;margin-top:1px;font-weight:700;">✓</div>'
        : '<div class="checkin-pulse-dot"></div>';
    }

    if (userBirthday) {
      const [bm, bd] = userBirthday.split('-').map(Number);
      if (month + 1 === bm && d === bd) { cls = 'day milestone-day'; extra = '<div class="festival-emoji">🎂</div><div class="festival-label">生日</div>'; }
    }

    if (marriageDate) {
      const [, mm, mdd] = marriageDate.split('-').map(Number);
      const thisDate = new Date(year, month, d);
      const daysFromMarriage = Math.floor((thisDate - new Date(marriageDate)) / 86400000);
      if (month + 1 === mm && d === mdd && daysFromMarriage >= 365) {
        cls = 'day milestone-day'; extra = '<div class="festival-emoji">💍</div><div class="festival-label">纪念日</div>';
      }
      if (!extra.includes('festival-emoji')) {
        if (daysFromMarriage === 52 || (daysFromMarriage > 0 && daysFromMarriage % 100 === 0) || daysFromMarriage === 365) {
          cls = 'day milestone-day';
          extra = `<div class="festival-emoji">💕</div><div class="festival-label">${daysFromMarriage}天</div>`;
        }
      }
    }

    if (!extra.includes('festival-emoji') && FESTIVALS[festKey]) {
      cls = cls.includes('today') ? cls + ' festival' : (cls === 'day' ? 'day festival' : cls);
      extra += `<div class="festival-emoji">${FESTIVALS[festKey].emoji}</div><div class="festival-label">${FESTIVALS[festKey].label}</div>`;
    }

    if (!extra.includes('festival-emoji') && d === 25) {
      cls = 'day payday';
      extra = '<div class="festival-emoji">💷</div><div class="festival-label">工资日</div>';
    }

    const clickHandler = isToday && !checkedInToday ? 'onclick="doCheckin()"' : '';
    html += `<div class="${cls}" ${clickHandler}><div class="day-number">${d}</div>${extra}</div>`;
  }

  const calDaysEl = document.getElementById('calendarDays');
  if (calDaysEl) calDaysEl.innerHTML = html;

  if (typeof launchCalendarParticles === 'function') launchCalendarParticles(today, marriageDate, userBirthday, marriageDays);
  updateCalendarCard(today, marriageDate, userBirthday);
}

function getNextMilestone(marriageDays, marriageDate, today) {
  if (!marriageDate) return { label: '距离52天', days: '—' };
  const milestones = [52, 100, 200, 300, 365, 400, 500];
  for (let y = 1; y <= 10; y++) milestones.push(y * 365);
  milestones.sort((a, b) => a - b);
  for (const m of milestones) {
    if (marriageDays < m) {
      const days = m - marriageDays;
      const label = m === 52 ? '距离52天' : m % 365 === 0 ? `距离${m / 365}周年` : `距离${m}天`;
      return { label, days };
    }
  }
  const md = new Date(marriageDate);
  const nextAnn = new Date(md);
  while (nextAnn <= today) nextAnn.setFullYear(nextAnn.getFullYear() + 1);
  const years = nextAnn.getFullYear() - md.getFullYear();
  return { label: `距离${years}周年`, days: Math.ceil((nextAnn - today) / 86400000) };
}

function renderMilestones(marriageDays, marriageDate, userBirthday, today) {
  const container = document.getElementById('milestonesContainer');
  if (!container) return;
  const items = [];

  if (marriageDate) {
    const md = new Date(marriageDate);
    const nextAnn = new Date(md);
    while (nextAnn <= today) nextAnn.setFullYear(nextAnn.getFullYear() + 1);
    const annDays = Math.ceil((nextAnn - today) / 86400000);
    items.push({ icon: '💍', name: `结婚纪念日 · ${marriageDate}`, badge: annDays === 0 ? '就是今天！🎉' : `${annDays}天后` });
  }

  if (userBirthday) {
    const [bm, bd] = userBirthday.split('-').map(Number);
    const nextBday = new Date(today.getFullYear(), bm - 1, bd);
    if (nextBday < today) nextBday.setFullYear(nextBday.getFullYear() + 1);
    const bdayDays = Math.ceil((nextBday - today) / 86400000);
    items.push({ icon: '🎂', name: '你的生日', badge: bdayDays === 0 ? '今天！🎉' : `${bdayDays}天后` });
  }

  if (items.length === 0) {
    container.innerHTML = '<div style="font-size:12px;color:rgba(130,80,170,0.5);text-align:center;padding:10px">第一次登录即记录结婚日期</div>';
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="milestone-item">
      <div class="milestone-icon">${item.icon}</div>
      <div class="milestone-info"><div class="milestone-name">${item.name}</div></div>
      <div class="milestone-badge">${item.badge}</div>
    </div>`).join('');
}

function updateCalendarCard(today, marriageDate, userBirthday) {
  const calIcon = document.getElementById('calendarCardIcon');
  const calDesc = document.getElementById('calendarCardDesc');
  const calCard = document.getElementById('calendarCard');
  const m = today.getMonth() + 1, d = today.getDate();

  if (calIcon) calIcon.textContent = '📅';
  if (calCard) calCard.style.animation = '';
  if (marriageDate) {
    const mdDays = Math.max(1, Math.floor((today - new Date(marriageDate)) / 86400000) + 1);
    if (calDesc) calDesc.textContent = `结婚第 ${mdDays} 天 💕`;
  } else {
    if (calDesc) calDesc.textContent = '结婚纪念日 💍';
  }

  if (userBirthday) {
    const [bm, bd] = userBirthday.split('-').map(Number);
    if (m === bm && d === bd) {
      if (calIcon) calIcon.textContent = '🎂';
      if (calDesc) calDesc.textContent = '今天是你的生日！';
      if (calCard) calCard.style.animation = 'cardPulse 1.2s ease-in-out infinite';
      return;
    }
  }
  if (marriageDate) {
    const [, mm, mdd] = marriageDate.split('-').map(Number);
    const mdDays = Math.max(1, Math.floor((today - new Date(marriageDate)) / 86400000) + 1);
    if (m === mm && d === mdd && mdDays >= 365) {
      if (calIcon) calIcon.textContent = '💍';
      if (calDesc) calDesc.textContent = '结婚纪念日 🥂';
      if (calCard) calCard.style.animation = 'cardPulse 1.2s ease-in-out infinite';
      return;
    }
  }
  const festKey = `${m}-${d}`;
  if (FESTIVALS[festKey] && calIcon) {
    calIcon.textContent = FESTIVALS[festKey].emoji;
    if (calDesc) calDesc.textContent = FESTIVALS[festKey].label;
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 商城购买反应（大额道具）
// 这两个函数被 shop.js 调用，放在这里因为涉及 profile/feed
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function triggerHomeItemMoment(product) {
  const userName = localStorage.getItem('userName') || '你';
  const typeDesc = {
    car:   `买了一辆车（${product.name}）`,
    house: `买了一套房子（${product.name}）`,
    land:  `买了一块地（${product.name}）`,
  };
  const tierHint = {
    1: '这是个实用的选择，他会表示认可',
    2: '这是个大手笔，他会有点意外但很在意',
    3: '这是个震惊他的选择，他可能破防',
  };
  const desc = typeDesc[product.homeType] || `买了${product.name}`;
  const hint = tierHint[product.tier] || '';

  try {
    const sys = buildSystemPrompt();
    const reply = await callSonnetLight(
      sys,
      [...chatHistory.slice(-6), {
        role: 'user',
        content: `[系统：老婆刚${desc}。${hint}。用西蒙的方式回应——可以是意外、认可、破防、嘴硬，但能感受到他是在意的。全小写，English only.]`
      }],
      300
    );
    if (reply && typeof emitGhostNarrativeEvent === 'function') {
      await emitGhostNarrativeEvent(reply, { storyId: `home_${product.homeType}`, delayMs: 0 });
      if (product.homeType === 'car')   setRelationshipFlag('hasCar');
      if (product.homeType === 'house') setRelationshipFlag('hasHouse');
      if (product.homeType === 'land')  setRelationshipFlag('hasLand');
    }
  } catch(e) {}

  // 时间线：记录购置房产/车/地（大件）
  if (typeof addTimelineEvent === 'function' && ['house', 'land', 'car'].includes(product.homeType)) {
    const titleMap = {
      car:   `买了 ${product.name}`,
      house: `买下了 ${product.name}`,
      land:  `拥有了 ${product.name}`,
    };
    const iconMap = { car: '🚗', house: '🏠', land: '🌿' };
    addTimelineEvent({
      type: 'purchase',
      title: titleMap[product.homeType] || `买了 ${product.name}`,
      icon: iconMap[product.homeType] || '🏠',
      amount: product.price,
      relatedData: { homeType: product.homeType, tier: product.tier, itemName: product.name }
    });
  }

  // 房产购买：立即进 Feed（无需物流）
  if (typeof feedEvent_boughtBigItem === 'function') feedEvent_boughtBigItem(product.name, product.price || 0, true);
  setTimeout(() => { if (typeof maybeTriggerFeedPost === 'function') maybeTriggerFeedPost('event_arrived'); }, 500);
}

async function triggerLuxuryMoment(product, poster) {
  // 用户买的 → 等快递签收后由 delivery.js 触发 Feed
  if (poster !== 'ghost') {
    // Feed 事件在 onGhostReceived() 时创建，这里不操作
    return;
  }
  // Ghost 收到礼物 → 等快递签收后再触发，这里不操作
}


// ============================================================
// 成就页 Tab 切换 + 相册渲染（从 chat.js 拆分补全）
// ============================================================

// switchAchievementTab / renderAlbum 已退役（2026-12）
// 旧「我们的故事」页面已重做为「我们的纪念册」
// Life Events V1 接管纪念展示，旧 storyBook 保留为 legacy data

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 手机资料页备忘录生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function generatePhoneMemo() {
  const todayKey = new Date().toISOString().slice(0, 10);
  const cached = localStorage.getItem('phoneMemoDate');
  const cachedTasks = localStorage.getItem('phoneMemoTasks') || '';
  // 旧的英文缓存（没有中文字符）强制重新生成
  const isOldEnglish = cachedTasks.includes('—') && !/[一-龥]/.test(cachedTasks);
  if (cached === todayKey && cachedTasks && !isOldEnglish) return;

  const location   = localStorage.getItem('currentLocation') || 'Hereford Base';
  const locType    = localStorage.getItem('currentLocationType') || 'base';
  const ltm        = localStorage.getItem('longTermMemory') || '';

  // 从 longTermMemory 里找有没有她相关的有意义片段（过滤系统笔记）
  const _sysP = [/^she sent/i,/^you sent/i,/received it/i,/if she asks/i,/confirm/i,/^\[/,/^you /i,/^she /i];
  const ltmHints = ltm.split('\n').map(l => l.trim()).filter(l => {
    if (l.length < 8 || l.length > 80) return false;
    return !_sysP.some(p => p.test(l));
  }).slice(0, 3).join('; ');

  const stateHint = ltmHints
    ? `Some context about her: ${ltmHints}`
    : '';

  const locHint = locType === 'deployed'
    ? `He is currently deployed at ${location}.`
    : locType === 'leave'
    ? `He is on leave in ${location}.`
    : `He is at ${location}.`;

  const prompt = `你是Ghost，正在写今天的手机备忘录。${locHint} ${stateHint}

用第一人称写3条简短的备忘事项。规则：
- 每条以"—"开头
- 混合：1-2条军事/任务相关，1条日常/私人事项
- 其中一条已完成，在末尾加"✓"
- 可以有一条隐晦地提到她（比如"把她说的那个带回来"或"回个消息"——不要太直白）
- 每条不超过10个字
- 用第一人称，不要提自己的名字（不要写"Ghost"或"Simon"）
- 只输出3行，不要其他内容`;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_HAIKU,
        max_tokens: 80,
        system: 'You write brief, realistic memo items. Output only the list.',
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    const text = (data.content?.[0]?.text || '').trim();
    // 破防检测：如果包含 AI 身份声明，丢弃这次生成
    const _isBreakout = /I'm Claude|I am Claude|Anthropic|AI assistant|roleplay|persona|identity guidelines/i.test(text);
    if (text && text.includes('—') && !_isBreakout) {
      localStorage.setItem('phoneMemoTasks', text);
      localStorage.setItem('phoneMemoDate', todayKey);
      // 更新页面（如果资料页还开着）
      const el = document.getElementById('profileTaskList');
      if (el) el.innerHTML = text.replace(/\n/g, '<br>');
    }
  } catch(e) {}
}

// 页面初始化
document.addEventListener('DOMContentLoaded', () => { initProfile(); });
