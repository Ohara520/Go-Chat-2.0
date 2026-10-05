// ============================================================
// lifeEvents.js — Life Events V1 数据层
//
// 职责：
//   - 记录真实发生的 Life Event
//   - 读取 / 去重 / 排序
//   - 为纪念册提供数据
//
// 原则：
//   Life Events 是共同生活事实账本，不是剧情系统。
//   系统负责记录发生过什么，不决定 Simon 应该怎么表现。
//
// 依赖：无
// ============================================================


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 数据结构
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Life Event 基础结构 V1
 *
 * @typedef {Object} LifeEvent
 * @property {string} id - 唯一 ID，格式 evt_xxxxx
 * @property {string} type - 事件类型（takeout_delivered, package_sent 等）
 * @property {string} source - 来源系统（takeout, delivery, home 等）
 * @property {string} sourceId - 原业务对象 ID，用于去重和追溯
 * @property {string[]} actors - 参与者 ["user", "ghost"]
 * @property {string} visibility - 可见性 shared | user_only | ghost_only | system
 * @property {string} status - 状态 pending | ongoing | completed | cancelled | superseded
 * @property {number} occurredAt - 世界中真正发生的时间（毫秒时间戳）
 * @property {number} recordedAt - 系统写入记录的时间（毫秒时间戳）
 * @property {Object} facts - 各业务系统自己的客观事实
 * @property {Object|null} keepsake - 是否/如何进入纪念册
 */


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 存储管理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const LIFE_EVENTS_KEY = 'lifeEventsV1';

/**
 * 写入 Life Event
 * @param {LifeEvent} event - 事件对象
 * @returns {boolean} 是否成功写入
 */
function recordLifeEvent(event) {
  try {
    if (!event || !event.type || !event.source) {
      console.warn('[lifeEvents] 无效事件对象，缺少必需字段');
      return false;
    }

    const events = getLifeEvents();

    // 去重：同 sourceId 的事件不重复记录
    if (event.sourceId) {
      const exists = events.find(e =>
        e.source === event.source &&
        e.sourceId === event.sourceId
      );
      if (exists) {
        console.log('[lifeEvents] 事件已存在，跳过:', event.sourceId);
        return false;
      }
    }

    // 补全默认值
    const now = Date.now();
    const fullEvent = {
      id: event.id || `evt_${now}_${Math.random().toString(36).substr(2, 9)}`,
      type: event.type,
      source: event.source,
      sourceId: event.sourceId || '',
      actors: event.actors || ['user', 'ghost'],
      visibility: event.visibility || 'shared',
      status: event.status || 'completed',
      occurredAt: event.occurredAt || now,
      recordedAt: now,
      facts: event.facts || {},
      keepsake: event.keepsake || null
    };

    events.push(fullEvent);
    localStorage.setItem(LIFE_EVENTS_KEY, JSON.stringify(events));

    // 触发本地状态更新（如果有 cloud.js）
    if (typeof touchLocalState === 'function') {
      touchLocalState();
    }

    console.log('[lifeEvents] 记录成功:', fullEvent.type, fullEvent.id);
    return true;

  } catch(e) {
    console.error('[lifeEvents] 记录失败:', e);
    return false;
  }
}

/**
 * 读取所有 Life Events
 * @returns {LifeEvent[]}
 */
function getLifeEvents() {
  try {
    const raw = localStorage.getItem(LIFE_EVENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch(e) {
    console.error('[lifeEvents] 读取失败:', e);
    return [];
  }
}

/**
 * 获取用于纪念册的事件（有 keepsake 的事件）
 * @returns {LifeEvent[]} 按 occurredAt 倒序排列
 */
function getKeepsakeEvents() {
  const events = getLifeEvents();
  return events
    .filter(e => e.keepsake && e.keepsake.key)
    .sort((a, b) => b.occurredAt - a.occurredAt);
}

/**
 * 按年份分组
 * @param {LifeEvent[]} events
 * @returns {Object} { year: LifeEvent[] }
 */
function groupEventsByYear(events) {
  const grouped = {};
  events.forEach(e => {
    const year = new Date(e.occurredAt).getFullYear();
    if (!grouped[year]) grouped[year] = [];
    grouped[year].push(e);
  });
  return grouped;
}

/**
 * 按月份分组
 * @param {LifeEvent[]} events
 * @returns {Object} { month: LifeEvent[] }
 */
function groupEventsByMonth(events) {
  const grouped = {};
  events.forEach(e => {
    const d = new Date(e.occurredAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
  });
  return grouped;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Event Type Registry
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * V1 支持的 Event Types
 *
 * 本轮只建立 registry / 支持结构。
 * 不为了测试伪造事件。
 * 如果现有业务系统尚未提供正式接入点，只准备 API，不自行猜测接法。
 */
const LIFE_EVENT_TYPES = {
  // Takeout
  takeout_ordered: {
    label: '点了外卖',
    source: 'takeout',
    keepsake: false
  },
  takeout_delivered: {
    label: '外卖送到了',
    source: 'takeout',
    keepsake: false
  },

  // Package / Delivery
  package_sent: {
    label: '寄出包裹',
    source: 'delivery',
    keepsake: true, // 第一个包裹值得纪念
    keepsakeCondition: (events, newEvent) => {
      // 只有第一个才标记为 keepsake
      const existing = events.filter(e => e.type === 'package_sent' && e.keepsake);
      return existing.length === 0;
    }
  },
  package_delivered: {
    label: '包裹送达',
    source: 'delivery',
    keepsake: true,
    keepsakeCondition: (events, newEvent) => {
      const existing = events.filter(e => e.type === 'package_delivered' && e.keepsake);
      return existing.length === 0;
    }
  },

  gift_sent: {
    label: '送出礼物',
    source: 'delivery',
    keepsake: true,
    keepsakeCondition: (events, newEvent) => {
      const existing = events.filter(e => e.type === 'gift_sent' && e.keepsake);
      return existing.length === 0;
    }
  },
  gift_received: {
    label: '收到礼物',
    source: 'delivery',
    keepsake: true,
    keepsakeCondition: (events, newEvent) => {
      const existing = events.filter(e => e.type === 'gift_received' && e.keepsake);
      return existing.length === 0;
    }
  },

  // Travel
  trip_booked: {
    label: '订了行程',
    source: 'travel',
    keepsake: true
  },

  // Reunion
  reunion_started: {
    label: '终于来到身边',
    source: 'reunion',
    keepsake: true,
    keepsakeCondition: (events) => {
      const existing = events.filter(e => e.type === 'reunion_started' && e.keepsake);
      return existing.length === 0;
    }
  },
  reunion_ended: {
    label: '分别',
    source: 'reunion',
    keepsake: false
  },

  // Home
  home_rented: {
    label: '租下了家',
    source: 'home',
    keepsake: true,
    keepsakeCondition: (events) => {
      const existing = events.filter(e => e.type === 'home_rented' && e.keepsake);
      return existing.length === 0;
    }
  },
  home_purchased: {
    label: '买下了家',
    source: 'home',
    keepsake: true
  },
  home_moved_in: {
    label: '我们的第一个家',
    source: 'home',
    keepsake: true,
    keepsakeCondition: (events) => {
      const existing = events.filter(e => e.type === 'home_moved_in' && e.keepsake);
      return existing.length === 0;
    }
  },
  home_moved_out: {
    label: '搬出',
    source: 'home',
    keepsake: false
  },

  // Special Days
  birthday: {
    label: '生日',
    source: 'calendar',
    keepsake: true
  },
  wedding_anniversary: {
    label: '结婚纪念日',
    source: 'calendar',
    keepsake: true
  }
};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Integration Points (TODO)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * TODO: 接入 Takeout 系统
 * 调用时机：Takeout 完成订单后
 *
 * function onTakeoutDelivered(orderId, orderData) {
 *   recordLifeEvent({
 *     type: 'takeout_delivered',
 *     source: 'takeout',
 *     sourceId: orderId,
 *     occurredAt: Date.now(),
 *     facts: {
 *       restaurant: orderData.restaurant,
 *       dish: orderData.dish,
 *       cost: orderData.cost
 *     },
 *     keepsake: null
 *   });
 * }
 */

/**
 * TODO: 接入 Delivery 系统
 * 调用时机：包裹送达后
 *
 * function onPackageDelivered(deliveryId, deliveryData) {
 *   const events = getLifeEvents();
 *   const isFirst = !events.find(e => e.type === 'package_delivered' && e.keepsake);
 *
 *   recordLifeEvent({
 *     type: 'package_delivered',
 *     source: 'delivery',
 *     sourceId: deliveryId,
 *     occurredAt: deliveryData.doneAt || Date.now(),
 *     facts: {
 *       item: deliveryData.name,
 *       from: deliveryData.from,
 *       to: deliveryData.to
 *     },
 *     keepsake: isFirst ? {
 *       key: 'first_package_delivered',
 *       title: '第一个包裹收到了',
 *       description: '第一次真正寄到他手上。',
 *       image: deliveryData.productData?.image || null,
 *       location: deliveryData.to
 *     } : null
 *   });
 * }
 */

/**
 * TODO: 接入 Home 系统
 * 调用时机：租赁/购买/入住后
 */


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 暴露给全局
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if (typeof window !== 'undefined') {
  window.recordLifeEvent = recordLifeEvent;
  window.getLifeEvents = getLifeEvents;
  window.getKeepsakeEvents = getKeepsakeEvents;
  window.groupEventsByYear = groupEventsByYear;
  window.groupEventsByMonth = groupEventsByMonth;
  window.LIFE_EVENT_TYPES = LIFE_EVENT_TYPES;
}
