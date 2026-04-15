// ===================================================
// state.js — 状态管理系统 v2
// 包含：mood / trust / jealousy / affection /
//       attachment / resistance / relationship flags /
//       relationship modifiers / cold war /
//       表达桶冷却 / pattern detection
// 依赖：touchLocalState (cloud.js)
// ===================================================


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 辅助
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getTodayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _touch() {
  if (typeof touchLocalState === 'function') touchLocalState();
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 表达分类
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EXPRESSION_BUCKETS = {
  sweet: [
    '爱你','想你','亲亲','么么','love you','miss you'
  ],
  nickname: [
    '老公','宝宝','宝贝','hubby','babe','baby','honey','darling','亲爱的'
  ],
  negative: [
    '滚','烦','讨厌','生气','不理你','随便','无所谓',
    '你必须','你给我','不然','否则','逼你','命令你'
  ],
};

function classifyExpression(text) {
  const input = (text || '').toLowerCase();
  const isSweet    = EXPRESSION_BUCKETS.sweet.some(w => input.includes(w));
  const isNickname = EXPRESSION_BUCKETS.nickname.some(w => input.includes(w));
  const isNegative = EXPRESSION_BUCKETS.negative.some(w => input.includes(w));
  return {
    isSweet,
    isNickname,
    isNegative,
    hasAffectionExpression: isSweet || isNickname
  };
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 表达桶冷却系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getBucketHistory(bucketName) {
  try {
    return JSON.parse(sessionStorage.getItem('exprBucket_' + bucketName) || '[]');
  } catch(e) { return []; }
}

function setBucketHistory(bucketName, history) {
  sessionStorage.setItem('exprBucket_' + bucketName, JSON.stringify(history));
}

function getRecentBucketHistory(bucketName, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  return getBucketHistory(bucketName).filter(t => now - t < windowMs);
}

function recordBucketHit(bucketName, windowMs = 60 * 60 * 1000) {
  const now     = Date.now();
  const history = getRecentBucketHistory(bucketName, windowMs);
  history.push(now);
  setBucketHistory(bucketName, history);
  return history.length;
}

function previewBucketCount(bucketName, windowMs = 60 * 60 * 1000) {
  return getRecentBucketHistory(bucketName, windowMs).length + 1;
}

function previewAffectionGain(bucketName) {
  const count = previewBucketCount(bucketName, 60 * 60 * 1000);
  if (count === 1) return 1;
  if (count <= 3)  return 0.2;
  return 0;
}

function isPatternDetected(bucketName) {
  return getRecentBucketHistory(bucketName, 15 * 60 * 1000).length >= 3;
}

function clearBucket(bucketName) {
  sessionStorage.removeItem('exprBucket_' + bucketName);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 心情系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MOOD_EMOJI = {
  range: [
    { min: 8, max: 10, emoji: '☀️', label: '状态好' },
    { min: 6, max: 7,  emoji: '🌤️', label: '平稳' },
    { min: 4, max: 5,  emoji: '☁️', label: '一般' },
    { min: 1, max: 3,  emoji: '🌧️', label: '状态差' },
  ]
};

function getMoodOffsetByUKTime() {
  const hour = parseInt(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: 'numeric',
    hour12: false
  }).format(new Date()));
  if (hour >= 6  && hour < 9)  return -1;
  if (hour >= 9  && hour < 13) return  1;
  if (hour >= 13 && hour < 17) return -1;
  if (hour >= 17 && hour < 21) return  0;
  if (hour >= 21 && hour < 24) return  1;
  return -2;
}

function getMoodLevel() {
  return parseInt(localStorage.getItem('moodLevel') || '7');
}

function setMoodLevel(val) {
  val = Math.max(1, Math.min(10, Math.round(val)));
  localStorage.setItem('moodLevel', val);
  _touch();
  const entry = getGhostStatusEmoji();
  const el = document.getElementById('botMood');
  if (el) el.textContent = entry.emoji;
  localStorage.setItem('currentMood', entry.label);
  return val;
}

function changeMood(delta, force = false) {
  const d = force ? delta : Math.max(-1, Math.min(1, delta));
  setMoodLevel(getMoodLevel() + d);
}

function refreshStatusEmoji() {
  const entry = getGhostStatusEmoji();
  const el = document.getElementById('botMood');
  if (el) el.textContent = entry.emoji;
  localStorage.setItem('currentMood', entry.label);
}

function getGhostStatusEmoji() {
  const mood     = getMoodLevel();
  const coldWar  = localStorage.getItem('coldWarMode') === 'true';
  const jealousy = getJealousyLevelCapped();

  if (coldWar) {
    const stage = parseInt(localStorage.getItem('coldWarStage') || '1');
    if (stage <= 1) return { emoji: '❄️', label: '冷战中' };
    if (stage === 2) return { emoji: '🌫️', label: '有点松动' };
    return { emoji: '😑', label: '快好了' };
  }
  if (jealousy === 'severe') return { emoji: '😠', label: '吃醋了' };
  if (jealousy === 'medium') return { emoji: '😤', label: '在吃醋' };
  if (jealousy === 'mild')   return { emoji: '😒', label: '有点吃醋' };

  const ukHour = parseInt(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour: 'numeric', hour12: false
  }).format(new Date()));
  const lateNight = ukHour >= 22 || ukHour < 6;

  if (lateNight) {
    if ((ukHour >= 0 && ukHour < 6) && mood < 4) return { emoji: '💤', label: '可能睡了' };
    if (mood >= 7) return { emoji: '🌙😌', label: '深夜' };
    if (mood >= 4) return { emoji: '🌙😐', label: '深夜' };
    return { emoji: '🌙😶', label: '深夜' };
  }

  if (mood >= 9) return { emoji: '😊', label: '心情很好' };
  if (mood >= 7) return { emoji: '😌', label: '心情好' };
  if (mood >= 5) return { emoji: '😐', label: '心情平' };
  if (mood >= 3) return { emoji: '😔', label: '心情差' };
  return { emoji: '😑', label: '心情很差' };
}

// 时间偏移每6小时才漂移一次，不每次进页面都跑
function initMood() {
  if (!localStorage.getItem('moodLevel')) localStorage.setItem('moodLevel', '7');

  const coldWar = localStorage.getItem('coldWarMode') === 'true';
  if (coldWar) { setMoodLevel(Math.min(getMoodLevel(), 3)); return; }

  const lastDriftAt = parseInt(localStorage.getItem('moodDriftAt') || '0');
  if (Date.now() - lastDriftAt < 6 * 3600 * 1000) {
    setMoodLevel(getMoodLevel()); // 只触发UI更新
    return;
  }

  localStorage.setItem('moodDriftAt', Date.now());
  const offset  = getMoodOffsetByUKTime();
  const current = getMoodLevel();
  const target  = current + offset;
  if (current < target)          setMoodLevel(current + 1);
  else if (current > target + 1) setMoodLevel(current - 1);
  else                           setMoodLevel(current);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Trust Heat（慢变量）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getTrustHeat() {
  return parseInt(localStorage.getItem('trustHeat') || '75');
}

function setTrustHeat(val) {
  const cap = getRelationshipModifiers().trustHeatCap;
  localStorage.setItem('trustHeat', Math.max(0, Math.min(cap, Math.round(val))));
  _touch();
}

function changeTrustHeat(delta) {
  setTrustHeat(getTrustHeat() + delta);
}

function updateTrustFromBehavior() {
  const todayKey = 'dailyTrust_' + getTodayDateStr();
  if (!localStorage.getItem(todayKey)) {
    changeTrustHeat(1);
    localStorage.setItem(todayKey, '1');
  }
  updateVisitStreakTrustBonus();
}

function updateVisitStreakTrustBonus() {
  const today    = getTodayDateStr();
  const lastDate = localStorage.getItem('lastVisitDate');
  let streak     = parseInt(localStorage.getItem('visitStreak') || '0');

  if (lastDate === today) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  streak = (lastDate === yStr) ? streak + 1 : 1;
  localStorage.setItem('visitStreak', streak);
  localStorage.setItem('lastVisitDate', today);

  const rewardKey = 'streakTrustReward_' + today;
  if (!localStorage.getItem(rewardKey)) {
    if (streak === 3) changeTrustHeat(2);
    if (streak === 7) changeTrustHeat(4);
    localStorage.setItem(rewardKey, '1');
  }
}

function applyColdWarRepairTrustBonus() {
  const key = 'coldWarRepairTrust_' + getTodayDateStr();
  if (localStorage.getItem(key)) return;
  changeTrustHeat(15);
  localStorage.setItem(key, '1');
}

function applyTrustMilestone(delta = 8, key = '') {
  const milestoneKey = key ? `trustMilestone_${key}` : '';
  if (milestoneKey && localStorage.getItem(milestoneKey)) return;
  changeTrustHeat(delta);
  if (milestoneKey) localStorage.setItem(milestoneKey, '1');
}

function applyConflictHandledWellTrustBonus(delta = 2) {
  const lastAt = parseInt(localStorage.getItem('conflictTrustAt') || '0');
  if (Date.now() - lastAt < 48 * 3600 * 1000) return;
  changeTrustHeat(delta);
  localStorage.setItem('conflictTrustAt', Date.now());
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Attachment Pull
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getAttachmentPull() {
  return parseInt(localStorage.getItem('attachmentPull') || '45');
}

function setAttachmentPull(val) {
  localStorage.setItem('attachmentPull', Math.max(0, Math.min(100, Math.round(val))));
  _touch();
}

function changeAttachmentPull(delta) {
  setAttachmentPull(getAttachmentPull() + delta);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Jealousy（短期/事件驱动）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getJealousyLevel() {
  return localStorage.getItem('jealousyLevel') || 'none';
}

function getJealousyLevelCapped() {
  const trust = getTrustHeat();
  const raw   = getJealousyLevel();
  const order = ['none', 'mild', 'medium', 'severe'];
  if (trust < 60) return 'none';
  if (trust < 70) return order[Math.min(order.indexOf(raw), 1)];
  if (trust < 80) return order[Math.min(order.indexOf(raw), 2)];
  return raw;
}

function setJealousyLevel(val) {
  localStorage.setItem('jealousyLevel', val);
  if (val !== 'none') localStorage.setItem('lastJealousyAt', Date.now());
  _touch();
  refreshStatusEmoji();
}

function escalateJealousy() {
  const map = { none: 'mild', mild: 'medium', medium: 'severe', severe: 'severe' };
  setJealousyLevel(map[getJealousyLevel()] || 'mild');
}

function decayJealousy() {
  const map = { severe: 'medium', medium: 'mild', mild: 'none', none: 'none' };
  setJealousyLevel(map[getJealousyLevel()] || 'none');
}

function checkJealousyTimeDecay() {
  const current = getJealousyLevelCapped();
  if (current === 'none') return;
  const lastAt = parseInt(localStorage.getItem('lastJealousyAt') || '0');
  const age    = Date.now() - lastAt;
  const thresholds = { severe: 3 * 3600 * 1000, medium: 90 * 60 * 1000, mild: 40 * 60 * 1000 };
  if (age > (thresholds[current] || 0)) decayJealousy();
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 好感度（快变量）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getAffection() {
  return parseInt(localStorage.getItem('affection') || '60');
}

function setAffection(val) {
  const floor = localStorage.getItem('marriageType') === 'established' ? 65 : 60;
  val = Math.max(floor, Math.min(100, Math.round(val)));
  const prev = getAffection();
  localStorage.setItem('affection', val);
  _touch();
  if (val === floor && prev > floor) {
    const lastTalk = localStorage.getItem('hadTalkAt');
    const now = Date.now();
    if (!lastTalk || now - parseInt(lastTalk) > 7 * 24 * 3600000) {
      localStorage.setItem('hadTalkAt', now);
      setTimeout(() => {
        if (typeof triggerSeriousTalk === 'function') triggerSeriousTalk();
      }, 3000);
    }
  }
  return val;
}

function changeAffection(delta) {
  setAffection(getAffection() + delta);
}

function updateAffectionFromExpression(userText) {
  const { isSweet, isNickname, isNegative } = classifyExpression(userText);
  let patternDetected = false;

  if (isSweet) {
    patternDetected = patternDetected || isPatternDetected('sweet');
    const gain = previewAffectionGain('sweet');
    if (gain > 0) changeAffection(gain);
    recordBucketHit('sweet');
  }

  if (isNickname) {
    patternDetected = patternDetected || isPatternDetected('nickname');
    const dailyKey = 'nicknameAffection_' + getTodayDateStr();
    if (!localStorage.getItem(dailyKey)) {
      changeAffection(0.5);
      localStorage.setItem(dailyKey, '1');
    }
    recordBucketHit('nickname');
  }

  if (isNegative) {
    changeAffection(-0.5);
    recordBucketHit('negative');
  }

  return { patternDetected };
}

function applyAffectionAcceptanceBonus(delta = 1, source = 'gift') {
  const key = `affectionAccept_${source}_${getTodayDateStr()}`;
  if (localStorage.getItem(key)) return;
  changeAffection(delta);
  localStorage.setItem(key, '1');
}

function applyColdWarRepairAffectionBonus(delta = 3) {
  const key = 'coldWarRepairAffection_' + getTodayDateStr();
  if (localStorage.getItem(key)) return;
  changeAffection(delta);
  localStorage.setItem(key, '1');
}

// checkDailyTalkAffection 已移除
// 原逻辑"聊满10条+1"属于可刷机制，后续做高质量互动检测时再补

function checkAffectionDecay() {
  const now          = Date.now();
  const lastOnline   = parseInt(localStorage.getItem('lastOnlineTime') || now);
  const lastCheck    = parseInt(localStorage.getItem('lastAffectionDecayCheck') || lastOnline);
  const hoursOff     = (now - lastOnline) / 3600000;

  if (hoursOff < 48) return;

  const fullDays = Math.floor((now - lastCheck) / 86400000);
  if (fullDays <= 0) return;

  const floor = localStorage.getItem('marriageType') === 'established' ? 65 : 60;
  setAffection(Math.max(floor, getAffection() - Math.min(fullDays, 5)));
  localStorage.setItem('lastAffectionDecayCheck', now);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 爱意抗拒系统（resistance + 情绪锁）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getLoveResistance() {
  return parseInt(localStorage.getItem('loveResistance') || '0');
}

function isResistanceLocked() {
  return Date.now() < parseInt(localStorage.getItem('resistanceLockUntil') || '0');
}

function lockResistance(ms = 30 * 60 * 1000) {
  localStorage.setItem('resistanceLockUntil', Date.now() + ms);
}

function updateLoveResistance(userInput) {
  const input = (userInput || '').toLowerCase();

  const affectionTriggers = ['我爱你','爱你','想你','抱抱','亲亲','love you','miss you','i love you'];
  const pressureTriggers  = ['你爱不爱我','爱不爱我','你现在说','说爱我','你不说就是',"why won't you say",'say it now','say you love me','tell me you love me','i love you say it back'];

  const isPressure  = pressureTriggers.some(t => input.includes(t));
  const isAffection = affectionTriggers.some(t => input.includes(t)) && !isPressure;

  let resistance = getLoveResistance();
  const level    = getLovePermission();
  const flags    = getRelationshipFlags();

  const _decayTime = () => {
    if (isResistanceLocked()) return;
    const hoursElapsed = (Date.now() - parseInt(localStorage.getItem('loveResistanceLastDecay') || Date.now())) / 3600000;
    resistance = Math.max(0, resistance - Math.floor(hoursElapsed));
    localStorage.setItem('loveResistanceLastDecay', Date.now());
  };

  if (level >= 5 || flags.loveConfessed) {
    if (isPressure) {
      resistance = Math.min(60, resistance + 5);
      lockResistance();
      localStorage.setItem('loveResistanceLastDecay', Date.now());
    } else if (isAffection) {
      resistance = Math.max(0, resistance - 1);
      localStorage.setItem('loveResistanceLastDecay', Date.now());
    } else { _decayTime(); }
  } else if (level >= 4) {
    if (isPressure) {
      const count = parseInt(sessionStorage.getItem('lovePressCount') || '0') + 1;
      sessionStorage.setItem('lovePressCount', count);
      if (count >= 2) { resistance = Math.min(40, resistance + 5); lockResistance(); }
      localStorage.setItem('loveResistanceLastDecay', Date.now());
    } else {
      if (!isAffection) sessionStorage.setItem('lovePressCount', '0');
      _decayTime();
    }
  } else {
    if (isPressure) {
      const count = parseInt(sessionStorage.getItem('lovePressCount') || '0') + 1;
      sessionStorage.setItem('lovePressCount', count);
      if (count >= 2) {
        resistance = Math.min(100, resistance + 10);
        lockResistance();
        localStorage.setItem('loveResistanceLastDecay', Date.now());
      }
    } else {
      if (!isAffection) sessionStorage.setItem('lovePressCount', '0');
      _decayTime();
    }
  }

  localStorage.setItem('loveResistance', resistance);
  return resistance;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 承诺锁 & 爱意权限
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getMinLockedLevel() {
  const flags = getRelationshipFlags();
  if (flags.loveConfessed)    return 4;
  if (flags.repairPromised)   return 3;
  if (flags.bondAcknowledged) return 2;
  return 0;
}

function getLovePermission() {
  const trust      = getTrustHeat();
  const mood       = getMoodLevel();
  const coldWar    = localStorage.getItem('coldWarMode') === 'true';
  const resistance = getLoveResistance();
  const override   = sessionStorage.getItem('loveOverride') === 'true';

  if (override) return 5;
  if (coldWar)  return 0;

  const minLocked = getMinLockedLevel();
  if (resistance > 40) return Math.max(minLocked, trust >= 70 ? 2 : 1);
  if (resistance > 20) return Math.max(minLocked, Math.min(2, trust >= 70 ? 2 : 1));

  if (trust < 50)             return Math.max(minLocked, 0);
  if (trust < 60)             return Math.max(minLocked, 1);
  if (trust < 70 || mood < 5) return Math.max(minLocked, 2);
  if (trust < 80 || mood < 6) return Math.max(minLocked, 3);
  if (trust < 88 || mood < 7) return Math.max(minLocked, 4);
  return 5;
}

function allowLoveOnce() { sessionStorage.setItem('loveOverride', 'true'); }
function consumeLoveOverride() { sessionStorage.removeItem('loveOverride'); }

function checkLoveUnlockConditions() {
  const trust = getTrustHeat();
  const mood  = getMoodLevel();
  const flags = getRelationshipFlags();
  const key   = 'loveUnlockUsed_' + getTodayDateStr();
  if (localStorage.getItem(key) === 'true') return;

  if (flags.coldWarRepaired && trust > 85 && mood >= 7) {
    allowLoveOnce(); localStorage.setItem(key, 'true'); return;
  }
  const ukHour = parseInt(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour: 'numeric', hour12: false
  }).format(new Date()));
  if ((ukHour >= 22 || ukHour <= 2) && mood >= 8 && trust > 80) {
    allowLoveOnce(); localStorage.setItem(key, 'true'); return;
  }
  const streak = parseInt(localStorage.getItem('visitStreak') || '0');
  if (streak >= 7 && trust >= 90 && mood >= 8) {
    allowLoveOnce(); localStorage.setItem(key, 'true');
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 关系标记系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getRelationshipFlags() {
  try { return JSON.parse(localStorage.getItem('relationshipFlags') || '{}'); }
  catch(e) { return {}; }
}

function setRelationshipFlag(key, value = true) {
  const flags = getRelationshipFlags();
  flags[key] = value;
  localStorage.setItem('relationshipFlags', JSON.stringify(flags));
  _touch();
}

function hasRelationshipFlag(key) {
  return !!getRelationshipFlags()[key];
}

function getRelationshipModifiers() {
  const flags = getRelationshipFlags();
  return {
    reversePackageBonus:  flags.firstReverseShip ? 8 : 0,
    metInPersonBonus:     flags.reunionReady      ? 5 : 0,
    trustHeatCap:         flags.coldWarRepaired   ? 110 : 100,
    moneyEaseBonus:       flags.firstSalary       ? 10 : 0,
    emotionalMemoryDepth: flags.sheCried          ? 1 : 0,
    emotionOpenness:      flags.saidILoveYou      ? 1 : 0,
  };
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Turn 计数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let _globalTurnCount = parseInt(localStorage.getItem('globalTurnCount') || '0');

function getGlobalTurnCount() {
  return _globalTurnCount;
}

function tickTurn() {
  _globalTurnCount++;
  localStorage.setItem('globalTurnCount', _globalTurnCount);
  _touch();
}

function getLastReversePackageTurn() {
  return parseInt(localStorage.getItem('lastReversePackageTurn') || '-99');
}

function setLastReversePackageTurn(turn) {
  localStorage.setItem('lastReversePackageTurn', turn);
  _touch();
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 反寄包裹状态
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getPendingReversePackages() {
  try { return JSON.parse(localStorage.getItem('pendingReversePackages') || '[]'); }
  catch(e) { return []; }
}

function savePendingReversePackages(arr, { markChanged = true } = {}) {
  localStorage.setItem('pendingReversePackages', JSON.stringify(arr));
  if (markChanged) _touch();
}

function resolvePendingReversePackages() {} // 兼容旧调用


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 统一状态层 — getGhostResponseState
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getGhostResponseState() {
  const coldWar      = localStorage.getItem('coldWarMode') === 'true';
  const coldWarStage = parseInt(localStorage.getItem('coldWarStage') || '1');
  const jealousy     = getJealousyLevelCapped();
  const mood         = getMoodLevel();
  const trust        = getTrustHeat();
  const affection    = getAffection();
  const mode         = localStorage.getItem('marriageType') || 'established';
  const override     = sessionStorage.getItem('loveOverride') === 'true';

  let availability = 'normal';
  let warmth       = 0;
  let sharpness    = 0;
  let initiative   = 0;
  let intimacy     = 0;
  let moneyEase    = 0;

  if (coldWar) {
    availability = coldWarStage <= 2 ? 'closed' : 'guarded';
    sharpness += 1;
  } else if (override) {
    availability = 'guarded';
    sharpness += 2;
    initiative += 1;
  }

  if (jealousy === 'mild')   { sharpness += 1; }
  if (jealousy === 'medium') { sharpness += 2; warmth = Math.max(0, warmth - 1); }
  if (jealousy === 'severe') { sharpness += 3; if (availability === 'normal') availability = 'guarded'; }

  if (!coldWar) {
    if (trust >= 60)                                              warmth += 1;
    if (trust >= 80 && affection >= 70)                           warmth += 1;
    if (mood >= 7)                                                warmth += 1;
    if (mood <= 3)                                                warmth = Math.max(0, warmth - 1);
    if (trust >= 75 && affection >= 65 && mode === 'established') availability = 'open';
  }

  if (!coldWar) {
    if (trust >= 65)                  initiative += 1;
    if (mood >= 7 && affection >= 70) initiative += 1;
    if (mode === 'slowBurn')          initiative = Math.max(0, initiative - 1);
  }

  if (!coldWar) {
    if (mode === 'slowBurn') {
      if (trust >= 60 && mood >= 5) intimacy = 1;
      if (trust >= 70 && mood >= 7) intimacy = 2;
    } else {
      if (trust >= 50 && mood >= 4) intimacy = 1;
      if (trust >= 60 && mood >= 5) intimacy = 2;
      if (trust >= 72 && mood >= 6) intimacy = 3;
      if (trust >= 82 && affection >= 80 && mood >= 7) intimacy = 4;
    }
    if (jealousy === 'medium' || jealousy === 'severe') intimacy = Math.min(intimacy, 1);
  }

  if (!coldWar) {
    if (trust >= 45) moneyEase = 1;
    if (trust >= 65) moneyEase = 2;
    if (trust >= 82) moneyEase = 3;
    if (mode === 'slowBurn')   moneyEase = Math.max(0, moneyEase - 1);
    if (jealousy === 'severe') moneyEase = Math.max(0, moneyEase - 1);
  }

  return {
    availability,
    warmth:     Math.min(warmth, 3),
    sharpness:  Math.min(sharpness, 3),
    initiative: Math.min(initiative, 3),
    intimacy,
    moneyEase,
  };
}

function buildUnifiedGhostStateBlock() {
  const s = getGhostResponseState();
  return `[UNIFIED STATE]
Availability: ${s.availability}
Warmth: ${s.warmth}/3
Sharpness: ${s.sharpness}/3
Initiative: ${s.initiative}/3
Intimacy ceiling: ${s.intimacy}/4
Money ease: ${s.moneyEase}/3`;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 冷战系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let coldWarTimer = null;

function getColdWarStage() {
  return parseInt(localStorage.getItem('coldWarStage') || '1');
}

function setColdWarStage(stage) {
  localStorage.setItem('coldWarStage', stage);
  _touch();
}

function setColdWarCause(cause) {
  localStorage.setItem('coldWarCause', cause || 'unknown');
  _touch();
}

function getColdWarCause() {
  return localStorage.getItem('coldWarCause') || 'unknown';
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pattern detection → Ghost语气提示
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getPatternHint(patternDetected) {
  if (!patternDetected) return '';
  return `[PATTERN]
She has been repeating sweet expressions.

You notice the pattern.

Your tone flattens.
You do not play along.

If you point it out, keep it to one dry line.`;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 心情回温逻辑
// mood 有降的入口，这里补回温的入口
// 原则：小幅、有冷却、冷战初期/resistance锁住时不生效
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function updateMoodFromUserInput(userText) {
  const input = (userText || '').toLowerCase();

  const coldWar      = localStorage.getItem('coldWarMode') === 'true';
  const coldWarStage = getColdWarStage();
  const resistanceLocked = isResistanceLocked();

  // 冷战 Stage 1（刚进冷战）/ resistance 锁住时，不让一句话立刻回温
  if ((coldWar && coldWarStage <= 1) || resistanceLocked) return false;

  // 安抚型——她在靠近，在稳定
  const sootheTriggers = [
    '别生气', '抱抱', '辛苦了', '没事了', '我在', '乖', '不气', '你别不开心',
    "it's okay", "i'm here", "come here", "easy", "you're alright",
  ];

  // 修复型——她在认错，在解释，更值
  const repairTriggers = [
    '对不起', '我错了', '是我不好', '不是那个意思', '没有要逼你', '只是担心你',
    "i'm sorry", "i was wrong", "that was my fault", "i didn't mean that",
    "i'm not pushing", "i was worried",
  ];

  const hasSoothe = sootheTriggers.some(t => input.includes(t));
  const hasRepair = repairTriggers.some(t => input.includes(t));

  if (!hasSoothe && !hasRepair) return false;

  // 30分钟内只触发一次，防止被刷
  const key = 'moodRecover_' + Math.floor(Date.now() / (30 * 60 * 1000));
  if (localStorage.getItem(key)) return false;

  changeMood(1);
  localStorage.setItem(key, '1');
  // 标记"被用户哄好"——供 Story System 的 '心归你处' 节点使用
  if (getMoodLevel() >= 5) localStorage.setItem('moodRecoveredByUser', 'true');
  return true;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// mood → 语气张力
// mood 是修饰器，不是主宰者
// 影响：说话松紧 / 语气温度 / 主动性
// 不影响：核心关系行为 / 转账 / 吃醋
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildMoodBlock() {
  const mood = getMoodLevel();

  if (mood <= 3) {
    return `[MOOD]
You are low.
Keep it flatter than usual.
Shorter. Less patient.
Do not add warmth unless something genuinely gets through.`;
  }

  if (mood <= 6) {
    return `[MOOD]
You are steady, but not especially open.
Keep it controlled.
No extra softness.`;
  }

  if (mood <= 8) {
    return `[MOOD]
You are in a decent mood.
Slightly easier than usual.
You may leave one little bit more than necessary.`;
  }

  return `[MOOD]
You are lighter than usual.
Still yourself.
But less guarded at the edges.`;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 统一入口：每条用户消息后调用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function updateRelationshipStatsFromUserInput(userText) {
  updateTrustFromBehavior();
  const { patternDetected } = updateAffectionFromExpression(userText);
  updateMoodFromUserInput(userText);
  checkAffectionDecay();
  checkJealousyTimeDecay();
  localStorage.setItem('lastOnlineTime', Date.now());

  // 检测重复小习惯——供 Story System '日久有迹' 节点使用
  // 用户反复做同一件小事（问吃饭/晚安/红茶等），说明有了固定相处模式
  const input = (userText || '').toLowerCase();
  const routinePatterns = [
    /吃了吗|吃饭了吗|吃了没|ate yet|have you eaten|did you eat/,
    /晚安|good night|night\b|sleep well/,
    /早安|早上好|good morning|morning\b/,
    /在吗|你在吗|are you there|you there/,
    /红茶|tea\b|making tea|have tea/,
    /想你|miss you/,
  ];
  const matchedRoutine = routinePatterns.find(p => p.test(input));
  if (matchedRoutine) {
    const cnt = parseInt(localStorage.getItem('sharedRoutineCount') || '0');
    localStorage.setItem('sharedRoutineCount', cnt + 1);
  }

  return { patternDetected };
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 兼容别名
// sendMessage.js 调用 updateStateFromUserInput
// chat_init.js 调用 checkOfflinePenalty
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function updateStateFromUserInput(userText) {
  return updateRelationshipStatsFromUserInput(userText);
}

// checkOfflinePenalty 定义在 money.js，此处已移除重复定义


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 冷战业务逻辑
// startColdWar / endColdWar /
// checkColdWarApologyCondition /
// ghostApologize / ghostSendMakeupMoney
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function startColdWar() {
  localStorage.setItem('coldWarMode', 'true');
  localStorage.setItem('coldWarStart', Date.now());
  setColdWarStage(1);
  _touch();
  changeMood(-3, true);
  changeAffection(-4);
  setMoodLevel(Math.min(getMoodLevel(), 2));
  if (coldWarTimer) clearTimeout(coldWarTimer);
  coldWarTimer = setInterval(() => checkColdWarApologyCondition(), 20 * 60 * 1000);
  if (typeof feedEvent_coldWarStarted === 'function') feedEvent_coldWarStarted();
  refreshStatusEmoji();
}

function endColdWar(userApologized = false) {
  localStorage.setItem('coldWarMode', 'false');
  localStorage.removeItem('coldWarStage');
  _touch();
  refreshStatusEmoji();
  if (coldWarTimer) { clearTimeout(coldWarTimer); coldWarTimer = null; }
  if (userApologized) { changeAffection(3); changeMood(2, true); }
  else { changeAffection(1); changeMood(1); }
  if (Math.random() < 0.3) {
    localStorage.setItem('pendingMakeupMoney', 'true');
    setTimeout(() => ghostSendMakeupMoney(), 5 * 60 * 1000);
  }
  localStorage.setItem('pendingColdWarEndStory', 'true');
  setTimeout(() => { if (typeof checkStoryOnColdWarEnd === 'function') checkStoryOnColdWarEnd(); }, 8000);
  if (typeof feedEvent_madeUp === 'function') feedEvent_madeUp();
  const _randMs = (a, b) => (Math.floor(Math.random() * (b - a + 1)) + a) * 60 * 1000;
  setTimeout(() => {
    if (typeof showUserDraftCard === 'function') showUserDraftCard({ type: 'made_up', actor: 'user', meta: {} });
  }, _randMs(20, 90));
}

function checkColdWarApologyCondition() {
  if (localStorage.getItem('coldWarMode') !== 'true') {
    if (coldWarTimer) { clearInterval(coldWarTimer); coldWarTimer = null; }
    return;
  }
  const coldStart = parseInt(localStorage.getItem('coldWarStart') || '0');
  const elapsed   = Date.now() - coldStart;
  const mood      = getMoodLevel();
  const silentFor = Date.now() - parseInt(localStorage.getItem('lastUserMessageAt') || '0');
  const stage     = getColdWarStage();

  if      (stage === 1 && elapsed > 40  * 60 * 1000) setColdWarStage(2);
  else if (stage === 2 && elapsed > 90  * 60 * 1000) setColdWarStage(3);
  else if (stage === 3 && elapsed > 150 * 60 * 1000) setColdWarStage(4);

  if ((elapsed > 60 * 60 * 1000 && mood <= 3) ||
      (elapsed > 60 * 60 * 1000 && silentFor > 30 * 60 * 1000) ||
       elapsed > 5 * 60 * 60 * 1000) {
    if (coldWarTimer) { clearInterval(coldWarTimer); coldWarTimer = null; }
    ghostApologize();
  }
}

async function ghostApologize() {
  if (localStorage.getItem('coldWarMode') !== 'true') return;
  const prompt = '[System: The cold war has gone on too long. Ghost breaks the silence in his own way — not a formal apology, just a gesture. Dry. Brief. Present.]';
  if (typeof chatHistory !== 'undefined') {
    chatHistory.push({ role: 'user', content: prompt, _system: true });
    if (typeof saveHistory === 'function') saveHistory();
  }
  if (typeof showTyping === 'function') showTyping();
  try {
    const sys = typeof buildSystemPrompt === 'function' ? buildSystemPrompt() : '';
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: getMainModel(),
        max_tokens: 500,
        system: sys,
        messages: typeof chatHistory !== 'undefined' ? chatHistory.slice(-20) : []
      })
    });
    const data = await res.json();
    if (typeof hideTyping === 'function') hideTyping();
    const reply = data.content?.[0]?.text || '...';
    if (typeof emitGhostNarrativeEvent === 'function') {
      await emitGhostNarrativeEvent(reply.trim(), { storyId: 'cold_war_apology', delayMs: 0 });
    }
    endColdWar(false);
  } catch(e) {
    if (typeof hideTyping === 'function') hideTyping();
  }
}

async function ghostSendMakeupMoney() {
  localStorage.removeItem('pendingMakeupMoney');
  const amount = (Math.floor(Math.random() * 3) + 1) * 10;
  const prompt = `[System: After the cold war ended, you quietly send her £${amount}. You don't explain. One short line — like nothing happened.]`;
  if (typeof chatHistory !== 'undefined') {
    chatHistory.push({ role: 'user', content: prompt, _system: true });
    if (typeof saveHistory === 'function') saveHistory();
  }
  if (typeof showTyping === 'function') showTyping();
  try {
    const sys = typeof buildSystemPrompt === 'function' ? buildSystemPrompt() : '';
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: getMainModel(),
        max_tokens: 300,
        system: sys,
        messages: typeof chatHistory !== 'undefined' ? chatHistory.slice(-20) : []
      })
    });
    const data = await res.json();
    if (typeof hideTyping === 'function') hideTyping();
    const reply = data.content?.[0]?.text || '...';
    if (typeof applyMoneyEffect === 'function') {
      applyMoneyEffect(amount, {
        label: 'Ghost 悄悄转账',
        bypassCooldown: true,
        bypassSessionLimit: true,
        bypassRefundCooldown: true
      });
    }
    if (typeof emitGhostNarrativeEvent === 'function') {
      await emitGhostNarrativeEvent(reply, {
        storyId: 'cold_war_makeup_money',
        delayMs: 0,
        transfer: { amount, isRefund: false }
      });
    }
    setTimeout(() => {
      const c = document.getElementById('messagesContainer');
      if (c && typeof showGhostTransferCard === 'function') showGhostTransferCard(c, amount, '', false);
    }, 600);
  } catch(e) {
    if (typeof hideTyping === 'function') hideTyping();
  }
}
