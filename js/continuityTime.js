/**
 * Continuity V1 · Batch 3 - 时间归属与跨天连续性
 *
 * 职责：
 * 1. 解析相对时间表达（tomorrow morning, this afternoon, next Monday）为 Ghost 当地日期
 * 2. 提取时间段信息（morning/afternoon/evening/night）
 * 3. 判断事件是否过期
 * 4. 格式化计划日期为可读文本
 *
 * 完全复用 Time Authority (profile.js)，不重建时钟系统
 */

/**
 * 解析相对时间表达为 Ghost 当地日期（YYYY-MM-DD）
 * @param {string} timeExpr - 时间表达式（如 "tomorrow morning", "this afternoon", "next Monday"）
 * @returns {string|null} - Ghost 当地日期（YYYY-MM-DD）或 null
 */
function parseRelativeDateToGhostLocal(timeExpr) {
  if (!timeExpr || typeof timeExpr !== 'string') return null;

  const expr = timeExpr.toLowerCase().trim();

  // 获取 Ghost 当地日期（复用 Time Authority）
  const ghostDateStr = getGhostDateStr(); // 格式：YYYY-MM-DD
  const ghostDate = new Date(ghostDateStr + 'T00:00:00Z'); // UTC 午夜

  if (isNaN(ghostDate.getTime())) {
    console.warn('[ContinuityTime] Invalid ghost date:', ghostDateStr);
    return null;
  }

  // 当天
  if (expr.includes('today') || expr.includes('this morning') ||
      expr.includes('this afternoon') || expr.includes('this evening') ||
      expr.includes('tonight')) {
    return ghostDateStr;
  }

  // 明天
  if (expr.includes('tomorrow')) {
    const tomorrow = new Date(ghostDate);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return formatDateYYYYMMDD(tomorrow);
  }

  // 下周一/下周二...
  const nextWeekdayMatch = expr.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
  if (nextWeekdayMatch) {
    const targetWeekday = nextWeekdayMatch[1];
    const targetDay = weekdayToNumber(targetWeekday);
    const currentWeekday = getGhostWeekday(); // "Monday", "Tuesday", ...
    const currentDay = weekdayToNumber(currentWeekday.toLowerCase());

    // 计算距离下一个目标星期几的天数（至少 1 天，最多 7 天）
    let daysToAdd = targetDay - currentDay;
    if (daysToAdd <= 0) daysToAdd += 7; // 确保至少是下周

    const targetDate = new Date(ghostDate);
    targetDate.setUTCDate(targetDate.getUTCDate() + daysToAdd);
    return formatDateYYYYMMDD(targetDate);
  }

  // 本周五/本周六...（this Friday）
  const thisWeekdayMatch = expr.match(/this\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
  if (thisWeekdayMatch) {
    const targetWeekday = thisWeekdayMatch[1];
    const targetDay = weekdayToNumber(targetWeekday);
    const currentWeekday = getGhostWeekday();
    const currentDay = weekdayToNumber(currentWeekday.toLowerCase());

    // 计算距离本周目标星期几的天数（0-6 天）
    let daysToAdd = targetDay - currentDay;
    if (daysToAdd < 0) daysToAdd += 7; // 如果已过，跳到下周

    const targetDate = new Date(ghostDate);
    targetDate.setUTCDate(targetDate.getUTCDate() + daysToAdd);
    return formatDateYYYYMMDD(targetDate);
  }

  // X days from now
  const daysMatch = expr.match(/(\d+)\s+days?\s+(from\s+now|later)/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    const targetDate = new Date(ghostDate);
    targetDate.setUTCDate(targetDate.getUTCDate() + days);
    return formatDateYYYYMMDD(targetDate);
  }

  // 无法解析
  return null;
}

/**
 * 提取时间段（morning/afternoon/evening/night）
 * @param {string} timeExpr - 时间表达式
 * @returns {string|null} - "morning" | "afternoon" | "evening" | "night" | null
 */
function extractDayPart(timeExpr) {
  if (!timeExpr || typeof timeExpr !== 'string') return null;

  const expr = timeExpr.toLowerCase();

  if (expr.includes('morning')) return 'morning';
  if (expr.includes('afternoon')) return 'afternoon';
  if (expr.includes('evening')) return 'evening';
  if (expr.includes('night') || expr.includes('tonight')) return 'night';

  return null;
}

/**
 * 判断事件是否过期
 * @param {string} plannedDate - 计划日期（YYYY-MM-DD）
 * @param {string} status - 事件状态（pending/ongoing/completed）
 * @returns {boolean} - 是否过期
 */
function isEventExpired(plannedDate, status) {
  if (!plannedDate) return false; // 无计划日期，永不过期
  if (status === 'completed') return false; // 已完成，不算过期

  const ghostDateStr = getGhostDateStr(); // YYYY-MM-DD
  const ghostDate = new Date(ghostDateStr + 'T00:00:00Z');
  const planned = new Date(plannedDate + 'T00:00:00Z');

  if (isNaN(ghostDate.getTime()) || isNaN(planned.getTime())) {
    return false; // 无法判断，保守处理
  }

  // 过期定义：计划日期在今天之前（不包括今天）
  // 例：计划周一，今天周二 → 过期；计划周二，今天周二 → 未过期
  return planned < ghostDate;
}

/**
 * 格式化计划日期为可读文本
 * @param {string} plannedDate - 计划日期（YYYY-MM-DD）
 * @returns {string} - 可读文本（"today" | "tomorrow" | "Monday" | "2026-03-15"）
 */
function formatPlannedDate(plannedDate) {
  if (!plannedDate) return '';

  const ghostDateStr = getGhostDateStr(); // YYYY-MM-DD
  const ghostDate = new Date(ghostDateStr + 'T00:00:00Z');
  const planned = new Date(plannedDate + 'T00:00:00Z');

  if (isNaN(ghostDate.getTime()) || isNaN(planned.getTime())) {
    return plannedDate; // 无法解析，返回原值
  }

  const daysDiff = Math.floor((planned - ghostDate) / (24 * 60 * 60 * 1000));

  if (daysDiff === 0) return 'today';
  if (daysDiff === 1) return 'tomorrow';
  if (daysDiff === -1) return 'yesterday';

  // 本周内（未来 6 天内）：显示星期几
  if (daysDiff > 1 && daysDiff <= 6) {
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return weekdays[planned.getUTCDay()];
  }

  // 上周（过去 6 天内）：显示星期几
  if (daysDiff < -1 && daysDiff >= -6) {
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `last ${weekdays[planned.getUTCDay()]}`;
  }

  // 其他：显示完整日期
  return plannedDate;
}

/**
 * 辅助函数：星期几转数字
 * @param {string} weekday - 星期几（"monday", "tuesday", ...）
 * @returns {number} - 0-6（Sunday=0, Monday=1, ...）
 */
function weekdayToNumber(weekday) {
  const map = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  return map[weekday.toLowerCase()] ?? 0;
}

/**
 * 辅助函数：格式化日期为 YYYY-MM-DD
 * @param {Date} date - Date 对象
 * @returns {string} - YYYY-MM-DD
 */
function formatDateYYYYMMDD(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
