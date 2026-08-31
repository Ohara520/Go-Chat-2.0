// ===================================================
// timeline.js — 时间线/记忆相册系统
//
// 职责：
// - 自动捕获重要时刻（转账/礼物/冷战/告白/成就）
// - 生成带 Ghost 感受的时间线卡片
// - 替代朋友圈，更简洁、更情感化
//
// 依赖：state.js / cloud.js / api.js
// ===================================================


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 数据结构
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/*
时间线事件格式：
{
  id: 'timeline_1723787400_abc',
  timestamp: 1723787400000,
  type: 'gift_received',  // 事件类型
  title: '她给我买了订婚戒指',
  icon: '💍',
  amount: 2340,  // 可选
  location: 'Manchester',  // 可选
  ghostReaction: "Didn't see that coming. Still processing.",
  relatedData: { transactionId, deliveryId 等 }
}

事件类型：
- milestone       关系里程碑（结婚、见面、周年）
- transfer        大额转账（≥£500）
- gift_sent       Ghost 主动送礼
- gift_received   收到贵重礼物（≥£1000）
- delivery        特殊快递
- cold_war_start  冷战开始
- cold_war_end    冷战结束
- confession      告白/重要表达
- career          职业成就（升职）
- birthday        生日
- purchase        大额消费（买房/车）
*/


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 存储
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getTimelineEvents() {
  try {
    return JSON.parse(localStorage.getItem('timelineEvents') || '[]');
  } catch(e) {
    return [];
  }
}

function saveTimelineEvents(events) {
  localStorage.setItem('timelineEvents', JSON.stringify(events.slice(0, 100))); // 最多保留100条
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave(true);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 添加事件（核心 API）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function addTimelineEvent(config) {
  /*
  config: {
    type: string (必需),
    title: string (可选，会自动生成),
    icon: string (可选，会自动生成),
    amount: number (可选),
    location: string (可选，默认当前位置),
    relatedData: object (可选),
    ghostReaction: string (可选，会自动生成)
  }
  */

  const events = getTimelineEvents();

  // 防重复：同类型事件 5 分钟内只记录一次
  const now = Date.now();
  const recentSame = events.find(e =>
    e.type === config.type &&
    now - e.timestamp < 5 * 60 * 1000
  );
  if (recentSame) {
    console.log('[timeline] 跳过重复事件:', config.type);
    return null;
  }

  // 自动补全数据
  const event = {
    id: 'timeline_' + now + '_' + Math.random().toString(36).slice(2, 6),
    timestamp: now,
    type: config.type,
    title: config.title || _generateTitle(config),
    icon: config.icon || _getIconForType(config.type),
    location: config.location || localStorage.getItem('currentLocation') || 'Unknown',
    ...( config.amount ? { amount: config.amount } : {}),
    ...( config.relatedData ? { relatedData: config.relatedData } : {}),
    ghostReaction: config.ghostReaction || '' // 稍后异步生成
  };

  // 插入到数组开头（最新的在前）
  events.unshift(event);
  saveTimelineEvents(events);

  // 异步生成 Ghost 的感受（不阻塞主流程）
  if (!event.ghostReaction) {
    _generateGhostReaction(event).then(reaction => {
      if (reaction) {
        const updated = getTimelineEvents();
        const target = updated.find(e => e.id === event.id);
        if (target) {
          target.ghostReaction = reaction;
          saveTimelineEvents(updated);
        }
      }
    }).catch(e => console.warn('[timeline] 生成 Ghost 感受失败:', e));
  }

  console.log('[timeline] 新增事件:', event.type, event.title);
  return event;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 自动补全逻辑
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _generateTitle(config) {
  const userName = localStorage.getItem('userName') || '她';

  switch(config.type) {
    case 'transfer':
      return `${userName}给我转了 £${config.amount}`;
    case 'gift_received':
      return config.relatedData?.itemName
        ? `${userName}送了${config.relatedData.itemName}`
        : `收到了${userName}的礼物`;
    case 'gift_sent':
      return config.relatedData?.itemName
        ? `给${userName}寄了${config.relatedData.itemName}`
        : `给${userName}寄了礼物`;
    case 'delivery':
      return `快递送到了`;
    case 'cold_war_start':
      return '冷战开始';
    case 'cold_war_end':
      return '和好了';
    case 'confession':
      return '第一次说 I love you';
    case 'career':
      return '升职了';
    case 'birthday':
      return config.relatedData?.isGhostBirthday ? '我的生日' : `${userName}的生日`;
    case 'purchase':
      return config.relatedData?.itemName || '买了重要的东西';
    case 'milestone':
      return config.relatedData?.title || '重要时刻';
    default:
      return '发生了一件事';
  }
}

function _getIconForType(type) {
  const icons = {
    milestone: '💕',
    transfer: '💰',
    gift_sent: '📦',
    gift_received: '🎁',
    delivery: '🚚',
    cold_war_start: '❄️',
    cold_war_end: '🌸',
    confession: '💕',
    career: '🏆',
    birthday: '🎂',
    purchase: '🏠'
  };
  return icons[type] || '✨';
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AI 生成 Ghost 的感受（异步）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function _generateGhostReaction(event) {
  if (typeof callMainModel !== 'function') return null;

  const userName = localStorage.getItem('userName') || 'her';

  // 构建 prompt
  let context = `Event: ${event.title}`;
  if (event.amount) context += `\nAmount: £${event.amount}`;
  if (event.location) context += `\nLocation: ${event.location}`;

  const prompt = `${context}

Write Ghost's one-line reaction to this moment.
- 10-20 words max
- Dry, restrained, real
- Not grateful/sweet/romantic clichés
- What he notices, what he doesn't say
- Lowercase, no punctuation at the end

Example tones:
"didn't see that coming. still processing."
"she remembers. that means something."
"not used to this. don't know what to do with it."

Your response (one line only):`;

  try {
    const response = await callMainModel(
      `You are Ghost. British SAS operator. Married to ${userName}. Dry humor, restrained emotion, never performs gratitude.`,
      prompt,
      60
    );

    const reaction = response.trim()
      .split('\n')[0] // 只取第一行
      .replace(/^["']|["']$/g, '') // 去掉引号
      .slice(0, 120); // 最多120字符

    return reaction || null;
  } catch(e) {
    console.warn('[timeline] AI 生成失败:', e);
    return null;
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 云端同步（集成到 cloud.js）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 导出给 cloud.js 调用
function getTimelineForCloud() {
  return getTimelineEvents().slice(0, 50); // 云端只存最近50条
}

function loadTimelineFromCloud(cloudEvents) {
  if (!Array.isArray(cloudEvents) || cloudEvents.length === 0) return;

  const local = getTimelineEvents();
  const localIds = new Set(local.map(e => e.id));

  // 合并：云端有但本地没有的补进来
  const toAdd = cloudEvents.filter(e => !localIds.has(e.id));
  if (toAdd.length > 0) {
    const merged = [...local, ...toAdd].sort((a, b) => b.timestamp - a.timestamp);
    saveTimelineEvents(merged.slice(0, 100));
    console.log('[timeline] 从云端恢复了', toAdd.length, '条事件');
  }
}
