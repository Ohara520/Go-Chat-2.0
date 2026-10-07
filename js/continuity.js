// ===================================================
// continuity.js — Continuity V1 · Batch 1 Core
// ===================================================
//
// 这个文件是干什么的：
//   保存"仍然影响现在的近期事实"。
//   不是长期记忆，不是 Life Events，不是行为导演，也不是第二份业务数据库。
//
// 它管什么（只管客观事实）：
//   - Pending 事件：已确定但尚未发生（例：Briefing scheduled later today）
//   - Ongoing 事件：正在发生（例：Briefing in progress）
//   - Recently completed：刚结束不久（completedAt <= 24h）
//
// 它不管什么：
//   - 行为要求（"你应该提起这件事"）
//   - 回复建议（"自然地问她"）
//   - 情绪推断（"显得疲惫"）
//   - 人格控制（"表现得关心"）
//
// 核心原则：
//   系统只保存事实。
//   Simon 是否提起、如何反应，由模型自己决定。
//
// 生命周期：
//   pending → ongoing → completed → 短暂 recent → 退出当前上下文
//   - Active = pending + ongoing
//   - Recent completed = completedAt 距当前 <= 24h
//   - 超过 24h：不再进入 Continuity Context，但记录仍保留（本批不删除）
//
// ===================================================


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Storage Key
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CONTINUITY_STORAGE_KEY = 'continuityV1';


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _loadContinuity() {
  try {
    const raw = localStorage.getItem(CONTINUITY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('[Continuity] Load error:', e);
    return [];
  }
}

function _saveContinuity(items) {
  try {
    localStorage.setItem(CONTINUITY_STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('[Continuity] Save error:', e);
  }
}

function _generateId() {
  return 'ct_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function _formatElapsedTime(mentionedAt) {
  // 旧数据兼容：无 mentionedAt 时返回空字符串
  if (!mentionedAt || typeof mentionedAt !== 'number') {
    return '';
  }

  const now = Date.now();
  const elapsed = now - mentionedAt;

  // 负数/未来时间：兼容容错
  if (elapsed < 0) {
    return '';
  }

  const minutes = Math.floor(elapsed / (60 * 1000));
  const hours = Math.floor(elapsed / (60 * 60 * 1000));
  const days = Math.floor(elapsed / (24 * 60 * 60 * 1000));

  if (minutes < 5) {
    return ' (mentioned a few minutes ago)';
  } else if (minutes < 60) {
    return ` (mentioned about ${minutes} minutes ago)`;
  } else if (hours < 24) {
    return hours === 1 ? ' (mentioned about 1 hour ago)' : ` (mentioned about ${hours} hours ago)`;
  } else if (days === 1) {
    return ' (mentioned yesterday)';
  } else {
    return ` (mentioned ${days} days ago)`;
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API: recordContinuity
// 创建一个新的 Continuity 记录（默认状态 pending）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function recordContinuity(opts) {
  const {
    type,        // 例: "work", "meal", "appointment"
    subject,     // 例: "briefing", "lunch"
    summary,     // 客观事实，例: "Briefing scheduled later today."
    source,      // 例: "chat", "takeout", "delivery"
    sourceId,    // 例: "order_123" 或 null
  } = opts;

  if (!type || !subject || !summary) {
    console.warn('[Continuity] recordContinuity: missing required fields');
    return null;
  }

  const item = {
    id: _generateId(),
    type,
    subject,
    status: 'pending',
    summary,
    source: source || 'chat',
    sourceId: sourceId || null,
    mentionedAt: Date.now(),  // Time Anchor V1: 何时首次提及此事实
    startedAt: 0,
    updatedAt: Date.now(),
    completedAt: null,
  };

  const items = _loadContinuity();
  items.push(item);
  _saveContinuity(items);

  return item;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API: updateContinuity
// 更新一个已存在的 Continuity 记录
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function updateContinuity(id, updates) {
  const items = _loadContinuity();
  const idx = items.findIndex(it => it.id === id);
  if (idx < 0) {
    console.warn('[Continuity] updateContinuity: id not found:', id);
    return null;
  }

  const item = items[idx];

  // 允许更新：status / summary / startedAt
  if (updates.status) item.status = updates.status;
  if (updates.summary) item.summary = updates.summary;
  if (updates.startedAt !== undefined) item.startedAt = updates.startedAt;

  // 自动设置 startedAt（如果从 pending → ongoing 但 startedAt 还是 0）
  if (updates.status === 'ongoing' && item.startedAt === 0) {
    item.startedAt = Date.now();
  }

  item.updatedAt = Date.now();

  items[idx] = item;
  _saveContinuity(items);

  return item;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API: completeContinuity
// 将一个 Continuity 记录标记为 completed
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function completeContinuity(id) {
  const items = _loadContinuity();
  const idx = items.findIndex(it => it.id === id);
  if (idx < 0) {
    console.warn('[Continuity] completeContinuity: id not found:', id);
    return null;
  }

  const item = items[idx];
  item.status = 'completed';
  item.completedAt = Date.now();
  item.updatedAt = Date.now();

  items[idx] = item;
  _saveContinuity(items);

  return item;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API: findContinuityBySource
// 根据 source + sourceId 精确查找一条记录
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function findContinuityBySource(source, sourceId) {
  const items = _loadContinuity();
  return items.find(it => it.source === source && it.sourceId === sourceId) || null;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API: getActiveContinuity
// 返回所有 Active（pending + ongoing）记录
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getActiveContinuity() {
  const items = _loadContinuity();
  return items.filter(it => it.status === 'pending' || it.status === 'ongoing');
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API: getRecentCompletedContinuity
// 返回所有 Recently completed（completedAt 距当前 <= 24h）记录
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getRecentCompletedContinuity() {
  const items = _loadContinuity();
  const now = Date.now();
  const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

  return items.filter(it => {
    if (it.status !== 'completed') return false;
    if (!it.completedAt) return false;
    return (now - it.completedAt) <= WINDOW_MS;
  });
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API: buildContinuityContext
// 构建当前 Continuity 的只读事实 block
// 返回纯文本，供 ghostContext.js 注入
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildContinuityContext() {
  const active = getActiveContinuity();
  const recent = getRecentCompletedContinuity();

  const pending = active.filter(it => it.status === 'pending');
  const ongoing = active.filter(it => it.status === 'ongoing');

  // 如果没有任何有效 Continuity，返回空字符串（不输出空 block）
  if (!pending.length && !ongoing.length && !recent.length) {
    return '';
  }

  const lines = [];
  lines.push('[CURRENT CONTINUITY]');
  lines.push('');

  if (pending.length) {
    lines.push('Pending:');
    pending.forEach(it => {
      lines.push(`- ${it.summary}${_formatElapsedTime(it.mentionedAt)}`);
    });
    if (ongoing.length || recent.length) lines.push('');
  }

  if (ongoing.length) {
    lines.push('Ongoing:');
    ongoing.forEach(it => {
      lines.push(`- ${it.summary}${_formatElapsedTime(it.mentionedAt)}`);
    });
    if (recent.length) lines.push('');
  }

  if (recent.length) {
    lines.push('Recently completed:');
    recent.forEach(it => {
      lines.push(`- ${it.summary}${_formatElapsedTime(it.mentionedAt)}`);
    });
  }

  return lines.join('\n');
}
