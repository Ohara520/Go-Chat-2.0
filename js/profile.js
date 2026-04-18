// ============================================================
// profile.js — 资料页、地点天气、秘密页、日历、节日系统
//
// 包含：
//   initProfile / renderGhostProfile / saveRemark
//   initLocation / updateWeather / updateUKTime
//   LOCATIONS / FESTIVALS / MEET_TYPES / GHOST_STATES / COUNTRY_DATA
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

const LOCATIONS = [
  { name: 'Hereford Base',        weight: 40, weatherCity: 'Hereford',   reason: 'Routine garrison and training.', type: 'base' },
  { name: 'Manchester',           weight: 12, weatherCity: 'Manchester', reason: 'Leave. Back home.',              type: 'leave' },
  { name: 'London',               weight: 8,  weatherCity: 'London',     reason: 'NATO coordination briefing.',   type: 'leave' },
  { name: 'Edinburgh',            weight: 5,  weatherCity: 'Edinburgh',  reason: 'Highland terrain training.',    type: 'base' },
  { name: 'Germany',              weight: 5,  weatherCity: 'Berlin',     reason: 'NATO joint exercise.',          type: 'deployed' },
  { name: 'Poland',               weight: 4,  weatherCity: 'Warsaw',     reason: 'Eastern European support op.',  type: 'deployed' },
  { name: 'Norway',               weight: 4,  weatherCity: 'Oslo',       reason: 'Arctic warfare training.',      type: 'deployed' },
  { name: 'Amsterdam',            weight: 3,  weatherCity: 'Amsterdam',  reason: 'European transit. Brief stop.', type: 'deployed' },
  { name: 'Paris',                weight: 3,  weatherCity: 'Paris',      reason: 'NATO intel coordination.',      type: 'deployed' },
  { name: 'Dublin',               weight: 3,  weatherCity: 'Dublin',     reason: 'Cross-border liaison mission.', type: 'deployed' },
  { name: 'Tokyo',                weight: 3,  weatherCity: 'Tokyo',      reason: 'Far East joint exercise.',      type: 'deployed' },
  { name: 'Undisclosed Location', weight: 3,  weatherCity: null,         reason: null,                            type: 'deployed' },
  { name: 'Classified',           weight: 2,  weatherCity: null,         reason: null,                            type: 'deployed' },
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

// GHOST_STATES 按UK时间段分组，避免出现逻辑不合理的状态
const GHOST_STATES_BY_TIME = {
  // 清晨 6-9点
  dawn: [
    '刚完成一次夜间演习，天刚亮', '快天亮了，睡意刚来',
    '睡了两个小时，不知道为什么醒了', '今天格外清醒，不知道为什么',
    '刚做了个奇怪的梦，不打算说', '头有点疼，大概是睡眠不够',
    '昨晚打雷，几个新人没睡好', '昨天的任务有点出乎意料',
    '刚结束任务，还没睡',
  ],
  // 上午 9-12点
  morning: [
    '刚跑完10公里，还没缓过来', '靶场训练结束，耳朵还有点鸣',
    '今天的训练被Price叫停了，原因不明', '在装备间做维护，手上有油',
    '刚做完力量训练，手有点抖', '靶场排队等了半小时，轮到他又没子弹了',
    '装备出了点问题，在等维修', '今天演习用的是实弹，不想细说',
    '训练科目改了，没人提前通知', '基地今天来了几个不认识的人，身份不明',
    '今天的简报比平时短，不是好兆头', '刚收到新任务指令，还没看完',
    '跑步机坏了，只能去室外，结果下雨了', '刚淋完雨，衣服还没干',
    '今天太阳难得出来，晒了一会儿', '基地今天刮大风，户外训练取消了',
    '雾很大，能见度极低',
  ],
  // 下午 12-18点
  afternoon: [
    '待命中，坐在基地里无聊', '在食堂，伙食很差',
    '伙食今天意外还行，不想承认', '开会，手机放腿上偷偷回消息',
    '任务前最后准备，可能要消失一段时间', '坐军车颠了几个小时，刚到',
    '刚从另一个基地转回来，还没适应', '任务延误了，不知道等多久',
    '在等直升机，可能还要两个小时', '今天特别闲，闲得有点烦',
    '轮休，没什么事做，比平时话多一点', '在基地图书室，没人知道他会来这里',
    'Soap今天作死，Ghost没好气', '今天Gaz难得说了句很有道理的话',
    '基地来了新人，看起来很嫩', '队友赌输了，气氛很微妙',
    'Price今天提了个他没想到的问题', '新来的队员问了个很蠢的问题，他没回答',
    '下午突然降温，比预报的冷', '今天湿度很高，装备需要额外保养',
    '外面在结冰，走路要小心', '在擦枪，比实际需要的时间更长',
    '今天看了本书，看了三页，放下了', '在整理装备，发现少了一样东西',
    '发现基地有只猫，不知道从哪来的', '在整理一些旧东西，没打算扔',
    '窗外有人在踢球，他看了一会儿', '今天话特别少，连队友都没来打扰他',
    '手上有个小伤，自己处理了', '背有点紧，可能需要拉伸',
    '今天任务顺利，他自己不太相信',
  ],
  // 傍晚 18-22点
  evening: [
    '刚洗完澡，难得清醒', '一个人喝茶，难得安静',
    '队里有人过生日，他出现了，没说话就走了',
    'Soap又在讲他根本不好笑的笑话', 'Gaz今天难得安静，不知道发生什么了',
    '在基地屋顶，没人知道他在这', '一个人在宿舍，外面下雪',
    '今天不知道为什么有点烦', '今天看到一个东西让他想起她',
    '今天有人提到曼彻斯特，晃了一下神', '看了张旧照片，没说给任何人',
    '突然想起一件很久以前的事', '在写一份东西，写了删，删了写',
    '今天第一次听到一首歌，没说给任何人', '想到曼彻斯特的冬天，不知道为什么',
    '旧伤有点酸，不打算提', '今天吃得少，不是不饿',
    '基地暖气修了一半，另一半还冷着', '今天状态比昨天好一点',
    '休假，在曼彻斯特老家', '在曼彻斯特街上，人多得他不习惯',
    '在超市，不知道买什么', '坐地铁，有人一直看他',
    '在老家咖啡馆，觉得格格不入', '难得休假，不知道该做什么',
    '在外面走了很久，没有目的地', '一个人待着，比平时安静',
  ],
  // 深夜 22-6点
  night: [
    '深夜，营地很安静', '基地停电了，用手机手电筒',
    '睡不着，不知道为什么', '今天心情不太好，说不清原因',
    '深夜开着暖气，外面在下雪', '关灯躺着，还没睡着',
    '在基地操场独自坐着，没什么理由', '夜里起来喝水，顺便看了眼手机',
    '夜班站岗，没什么动静', '喝了太多咖啡，现在睡不着',
    '想了一件很久以前的事，没人知道', '老家的东西还放在那里没人动',
    '想起以前一个地方，现在可能已经拆了', '很久没回去了，不确定还算不算家',
    '今晚月亮挺圆，没什么原因就注意到了', '刚换了手机壳，没人注意到',
    '今天格外清醒，不知道为什么', '一个人待着，比平时安静',
  ],
};

// 根据UK时间返回对应状态池
function getGhostStatesByTime() {
  const ukHour = parseInt(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour: 'numeric', hour12: false
  }).format(new Date()));
  if (ukHour >= 6 && ukHour < 9)  return GHOST_STATES_BY_TIME.dawn;
  if (ukHour >= 9 && ukHour < 12) return GHOST_STATES_BY_TIME.morning;
  if (ukHour >= 12 && ukHour < 18) return GHOST_STATES_BY_TIME.afternoon;
  if (ukHour >= 18 && ukHour < 22) return GHOST_STATES_BY_TIME.evening;
  return GHOST_STATES_BY_TIME.night;
}

// 兼容旧代码，保留 GHOST_STATES 作为完整池的引用
const GHOST_STATES = [
  ...GHOST_STATES_BY_TIME.dawn,
  ...GHOST_STATES_BY_TIME.morning,
  ...GHOST_STATES_BY_TIME.afternoon,
  ...GHOST_STATES_BY_TIME.evening,
  ...GHOST_STATES_BY_TIME.night,
];

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
  const nextChange = parseInt(localStorage.getItem('locationNextChange') || '0');
  const now = Date.now();
  let chosen;

  if (saved && now < nextChange) {
    chosen = LOCATIONS.find(l => l.name === saved) || LOCATIONS[0];
  } else {
    const roll = Math.random() * 100;
    let cumulative = 0;
    chosen = LOCATIONS[0];
    for (const loc of LOCATIONS) {
      cumulative += loc.weight;
      if (roll < cumulative) { chosen = loc; break; }
    }
    localStorage.setItem('currentLocation', chosen.name);
    localStorage.setItem('currentWeatherCity', chosen.weatherCity || '');
    localStorage.setItem('currentLocationReason', chosen.reason || '');
    localStorage.setItem('currentLocationType', chosen.type || 'base');
    const days = 2 + Math.floor(Math.random() * 4);
    localStorage.setItem('locationNextChange', now + days * 24 * 60 * 60 * 1000);
    // 修复：换地点时记录到达时间，供 checkLocationSpecialAutoTrigger 判断"待满2天"
    const _locKey = (chosen.name || '').replace(/\s+/g, '_');
    localStorage.setItem('locationArrivedAt_' + _locKey, now.toString());
    localStorage.setItem('locationArrivedAt_' + chosen.name, now.toString());

    // 追踪本月各类地点天数（用于月底工资计算）
    const monthKey = 'locDays_' + new Date().getFullYear() + '_' + (new Date().getMonth() + 1);
    const locDays  = JSON.parse(localStorage.getItem(monthKey) || '{"deployed":0,"base":0,"leave":0}');
    const type     = chosen.type || 'base';
    locDays[type]  = (locDays[type] || 0) + days;
    localStorage.setItem(monthKey, JSON.stringify(locDays));
  }

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

function updateUKTime() {
  const el = document.getElementById('botUKTime');
  if (!el) return;
  const ukTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date());
  el.textContent = ukTime;
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

function copyInviteCode() {
  const code = document.getElementById('myInviteCode')?.textContent || '';
  if (!code || code === '加载中…' || code === '暂无邀请码') return;
  navigator.clipboard.writeText(code).then(() => {
    showToast('邀请码已复制 ✅');
  }).catch(() => {
    // 兜底方案
    const ta = document.createElement('textarea');
    ta.value = code;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('邀请码已复制 ✅');
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
  if (ageEl) ageEl.textContent = '35';

  const profileNameEl = document.getElementById('profileDisplayName');
  if (profileNameEl) profileNameEl.textContent = remark || 'Simon Riley';

  const remEl = document.getElementById('profileRemark');
  if (remEl) remEl.value = remark;

  const ghostAvatarUrl = localStorage.getItem('ghostAvatarUrl');
  if (ghostAvatarUrl) {
    document.querySelectorAll('.ghost-avatar-img').forEach(img => { img.src = ghostAvatarUrl; });
  }

  renderGhostProfile();
  loadMyInviteCode();
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
    updateCalendarAfterBirthday();
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

  // 婚姻模式
  const marriageTypeEl = document.getElementById('marriageTypeChips');
  if (marriageTypeEl) {
    const savedMode = localStorage.getItem('marriageType') || 'established';
    const modes = [
      { key: 'established', emoji: '💫', label: '已有默契，感情稳定' },
      { key: 'slowBurn',    emoji: '🌱', label: '刚步入婚姻，慢慢磨合' },
    ];
    marriageTypeEl.innerHTML = modes.map(m =>
      `<div class="secret-chip ${savedMode === m.key ? 'selected' : ''}" onclick="selectMarriageType('${m.key}', this)">${m.emoji} ${m.label}</div>`
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

function copyInviteCode(code) {
  navigator.clipboard.writeText(code).then(() => {
    if (typeof showToast === 'function') showToast('邀请码已复制 🔗');
  }).catch(() => {
    const el = document.createElement('textarea');
    el.value = code;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    if (typeof showToast === 'function') showToast('邀请码已复制 🔗');
  });
}

function selectZodiac(label, el) {
  document.querySelectorAll('#zodiacChips .secret-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  saveSecret('userZodiac', label);
}

function selectMarriageType(key, el) {
  document.querySelectorAll('#marriageTypeChips .secret-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  localStorage.setItem('marriageType', key);
  if (key === 'established') {
    localStorage.setItem('affection', '60');
    localStorage.setItem('trustHeat', '75');
  } else if (key === 'slowBurn') {
    localStorage.setItem('affection', '30');
    localStorage.setItem('trustHeat', '50');
  }
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
        if (typeof saveToCloud === 'function') {
          saveToCloud()
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
        if (typeof saveToCloud === 'function') {
          saveToCloud()
            .then(() => showToast('已同步到云端 ☁️'))
            .catch(() => showToast('同步失败，请检查网络'));
        }
      } catch(e) {
        showToast('图片太大了，换一张小一点的试试');
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
    const reply = await callSonnet(
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

  if (typeof feedEvent_boughtBigItem === 'function') feedEvent_boughtBigItem(product.name, product.price || 0, true);
  setTimeout(() => { if (typeof maybeTriggerFeedPost === 'function') maybeTriggerFeedPost('event_arrived'); }, 500);
}

async function triggerLuxuryMoment(product, poster) {
  // 用户买的 → 入事件池
  if (poster !== 'ghost') {
    if (typeof feedEvent_boughtBigItem === 'function') feedEvent_boughtBigItem(product.name, product.price || 0, false);
    setTimeout(() => { if (typeof maybeTriggerFeedPost === 'function') maybeTriggerFeedPost('event_arrived'); }, 500);
    return;
  }
  // Ghost 收到礼物 → 等快递签收后再触发，这里不操作
}


// ============================================================
// 成就页 Tab 切换 + 相册渲染（从 chat.js 拆分补全）
// ============================================================

function switchAchievementTab(tab) {
  const storyPanel = document.getElementById('storyBookPanel');
  const albumPanel = document.getElementById('albumPanel');
  const tabStory   = document.getElementById('tabStory');
  const tabAlbum   = document.getElementById('tabAlbum');
  const title      = document.getElementById('achievementTitle');
  const counter    = document.getElementById('storyBookCounter');

  if (tab === 'story') {
    if (storyPanel) storyPanel.style.display = '';
    if (albumPanel) albumPanel.style.display = 'none';
    if (tabStory)   tabStory.classList.add('active');
    if (tabAlbum)   tabAlbum.classList.remove('active');
    if (title)      title.textContent = '📖 我们的故事';
    if (typeof renderStoryBook === 'function') renderStoryBook();
  } else {
    if (storyPanel) storyPanel.style.display = 'none';
    if (albumPanel) albumPanel.style.display = '';
    if (tabStory)   tabStory.classList.remove('active');
    if (tabAlbum)   tabAlbum.classList.add('active');
    if (title)      title.textContent = '📦 回忆相册';
    if (counter)    counter.textContent = '';
    renderAlbum();
  }
}

function renderAlbum() {
  const container = document.getElementById('albumList');
  if (!container) return;

  const history      = JSON.parse(localStorage.getItem('deliveryHistory') || '[]');
  const deliveries   = JSON.parse(localStorage.getItem('deliveries') || '[]');
  const fromDeliveries = deliveries.filter(d => d.done && !history.find(h => h.id === d.id));
  const done         = [...history, ...fromDeliveries];

  if (done.length === 0) {
    container.innerHTML = `<div class="album-empty">还没有收到任何东西<br>去商城给他寄点什么吧</div>`;
    return;
  }

  const sorted = [...done].sort((a, b) => (b.doneAt || b.addedAt || 0) - (a.doneAt || a.addedAt || 0));
  container.innerHTML = sorted.map(d => {
    const emoji      = d.productData?.emoji || d.emoji || '📦';
    const name       = d.name || '神秘包裹';
    const isFromGhost = d.isGhostSend || d.isLocationSpecial;
    const isFromHome  = d.productData?.isFromHome;
    const from       = isFromGhost ? '他寄来的' : isFromHome ? '你从家寄给他的' : '你寄给他的';
    const dateStr    = d.doneAt
      ? new Date(d.doneAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
      : d.addedAt
        ? new Date(d.addedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
        : '';
    const note = d.ghostNote || d.note || '';
    return `<div class="album-card">
      <div class="album-card-top">
        <div class="album-card-emoji">${emoji}</div>
        <div class="album-card-info">
          <div class="album-card-name">${name}</div>
          <div class="album-card-from">${from}</div>
        </div>
        <div class="album-card-date">${dateStr}</div>
      </div>
      ${note ? `<div class="album-card-note">"${note}"</div>` : ''}
    </div>`;
  }).join('');
}

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
  const coldWar    = localStorage.getItem('coldWarMode') === 'true';
  const mood       = typeof getMoodLevel === 'function' ? getMoodLevel() : 7;
  const ltm        = localStorage.getItem('longTermMemory') || '';

  // 从 longTermMemory 里找有没有她相关的有意义片段（过滤系统笔记）
  const _sysP = [/^she sent/i,/^you sent/i,/received it/i,/if she asks/i,/confirm/i,/^\[/,/^you /i,/^she /i];
  const ltmHints = ltm.split('\n').map(l => l.trim()).filter(l => {
    if (l.length < 8 || l.length > 80) return false;
    return !_sysP.some(p => p.test(l));
  }).slice(0, 3).join('; ');

  const stateHint = coldWar
    ? 'Things are tense between them right now.'
    : ltmHints
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
        model: 'claude-haiku-4-5-20251001',
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
