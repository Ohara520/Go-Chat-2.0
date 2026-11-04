// ===================================================
// dailySchedule.js — Simon 自主日程 V1
// ===================================================
//
// 职责：
//   1. 判断是否需要生成今日日程（新的一天 + 云端已恢复）
//   2. 调用 Haiku 生成计划（一次/天）
//   3. 保存并管理日程的三层结构：plan / changes / meta
//   4. 提供日程上下文供 ghostContext.js 注入
//
// 核心原则：
//   - 计划（plan）由 Haiku 生成，不因时间经过自动变更状态
//   - 变更（changes）只由 Simon 聊天中明确表达触发
//   - 时间经过只用于推断"当前可能在做什么"，不修改 status
//   - 云端数据尚未恢复时，不生成新日程覆盖旧数据
//
// localStorage key：simonSchedule_{userId}_{charId}_{date}
// ===================================================

// ── Key 生成 ──────────────────────────────────────────────
function _scheduleKey(userId, charId, date) {
  return `simonSchedule_${userId}_${charId}_${date}`;
}

function _currentScheduleKey() {
  const userId = (typeof getSbUserId === 'function' ? getSbUserId() : '') || 'anon';
  const charId = (typeof getCurrentCharacter === 'function' ? getCurrentCharacter() : '') || 'ghost';
  const date   = (typeof getGhostDateStr === 'function' ? getGhostDateStr() : '') || _fallbackDate();
  return _scheduleKey(userId, charId, date);
}

function _fallbackDate() {
  return new Date().toISOString().slice(0, 10);
}

// ── 读写 ──────────────────────────────────────────────────
function loadTodaySchedule() {
  try {
    const raw = localStorage.getItem(_currentScheduleKey());
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function _saveSchedule(schedObj) {
  try {
    const key = _currentScheduleKey();
    localStorage.setItem(key, JSON.stringify(schedObj));
    _cleanOldSchedules();
    // 触发云端保存（防抖，不阻塞）
    if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
  } catch (e) {
    console.error('[DailySchedule] Save failed:', e);
  }
}

// 清理 7 天前的旧日程
function _cleanOldSchedules() {
  const userId = (typeof getSbUserId === 'function' ? getSbUserId() : '') || 'anon';
  const charId = (typeof getCurrentCharacter === 'function' ? getCurrentCharacter() : '') || 'ghost';
  const prefix = `simonSchedule_${userId}_${charId}_`;
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

  Object.keys(localStorage).forEach(k => {
    if (!k.startsWith(prefix)) return;
    try {
      const obj = JSON.parse(localStorage.getItem(k));
      if (obj?.meta?.generatedAt && obj.meta.generatedAt < cutoff) {
        localStorage.removeItem(k);
      }
    } catch (e) {}
  });
}

// ── 核心触发逻辑 ──────────────────────────────────────────
// 在 App 启动 / 进入时调用
// cloudLoadDone: bool，是否已完成 loadFromCloud
async function checkAndGenerateSchedule(cloudLoadDone) {
  // 仅主角色（ghost）V1 支持
  const charId = (typeof getCurrentCharacter === 'function' ? getCurrentCharacter() : '') || 'ghost';
  if (charId !== 'ghost') return;

  const existing = loadTodaySchedule();

  if (existing) {
    if (existing.meta && existing.meta.cloudLoaded) {
      // 已生成且已确认云端状态 → 无需操作
      return;
    }
    if (!cloudLoadDone) {
      // 有日程但云端未加载完毕 → 等待，不重新生成
      return;
    }
    // 标记 cloudLoaded
    existing.meta.cloudLoaded = true;
    _saveSchedule(existing);
    return;
  }

  if (!cloudLoadDone) {
    // 无日程且云端未加载 → 等待，不提前生成（防止覆盖云端旧数据）
    console.log('[DailySchedule] Waiting for cloud load before generating');
    return;
  }

  // 无日程 + 云端已加载 → 生成
  await _generateTodaySchedule();
}

// ── 生成日程 ──────────────────────────────────────────────
async function _generateTodaySchedule() {
  const userId  = (typeof getSbUserId === 'function' ? getSbUserId() : '') || 'anon';
  const charId  = (typeof getCurrentCharacter === 'function' ? getCurrentCharacter() : '') || 'ghost';
  const date    = (typeof getGhostDateStr === 'function' ? getGhostDateStr() : '') || _fallbackDate();
  const weekday = (typeof getGhostWeekday === 'function' ? getGhostWeekday() : '') || '';
  const time    = (typeof getGhostTimeStr === 'function' ? getGhostTimeStr() : '') || '';
  const location = localStorage.getItem('currentLocation') || 'Hereford Base';

  // 读取上下文：已有约定、未完成 Continuity 事件
  const activeContinuity = (typeof getActiveContinuity === 'function') ? getActiveContinuity() : [];
  const existingCommitments = activeContinuity
    .filter(c => c.plannedDate === date)
    .map(c => `- ${c.subject}${c.plannedDayPart ? ' (' + c.plannedDayPart + ')' : ''}`)
    .join('\n') || 'none';

  // 读取最近 2 天的日程，作为背景
  const recentCtx = _getRecentScheduleSummary(userId, charId, date);

  const systemPrompt = `You are a scheduler assistant. Generate Simon Riley's plausible daily plan for today.

Simon is a British SAS soldier (TF141, Lt.). He is at: ${location}.
Today: ${weekday}, ${date}. Current time: ${time}.

Rules:
- Output ONLY a JSON array of schedule items (no prose, no markdown fences)
- 2-6 items maximum. Leaving gaps is fine — do not fill every hour
- Do NOT schedule anything that conflicts with existing commitments
- Do NOT include meals unless contextually natural
- Do NOT add fixed recurring items just to fill the schedule
- Status must be "planned" for all items
- Times in HH:MM 24h format. endTime can be null if uncertain
- Location can be null

Item schema: { "activity": string, "startTime": "HH:MM", "endTime": "HH:MM|null", "location": "string|null" }`;

  const userPrompt = `Existing commitments for today (do not duplicate):
${existingCommitments}

Recent context:
${recentCtx}

Generate today's plan as a JSON array:`;

  try {
    const raw = await fetchDeepSeek(systemPrompt, userPrompt, 400);
    if (!raw || !raw.trim()) throw new Error('empty response');

    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const items = JSON.parse(cleaned);

    if (!Array.isArray(items)) throw new Error('not an array');

    const plan = items
      .filter(it => it && typeof it.activity === 'string' && typeof it.startTime === 'string')
      .slice(0, 6)
      .map((it, i) => ({
        id: `sched_${Date.now()}_${i}`,
        activity:  String(it.activity).slice(0, 100),
        startTime: _validateTime(it.startTime) ? it.startTime : null,
        endTime:   _validateTime(it.endTime)   ? it.endTime   : null,
        location:  it.location ? String(it.location).slice(0, 100) : null,
        status:    'planned',
        createdAt: Date.now(),
      }));

    const schedObj = {
      meta: {
        userId,
        charId,
        date,
        generatedAt: Date.now(),
        cloudLoaded: true,
      },
      plan,
      changes: [],
    };

    _saveSchedule(schedObj);
    console.log(`[DailySchedule] Generated ${plan.length} items for ${date}`);

  } catch (e) {
    console.warn('[DailySchedule] Generation failed:', e.message);
    // 生成失败不保存，下次重试
  }
}

function _validateTime(t) {
  return t && typeof t === 'string' && /^\d{2}:\d{2}$/.test(t);
}

// ── 近期日程摘要（给生成 Haiku 的背景） ───────────────────
function _getRecentScheduleSummary(userId, charId, todayDate) {
  const yesterday = _offsetDate(todayDate, -1);
  const lines = [];

  [yesterday].forEach(d => {
    const key = _scheduleKey(userId, charId, d);
    try {
      const obj = JSON.parse(localStorage.getItem(key) || 'null');
      if (!obj || !Array.isArray(obj.plan)) return;
      const summary = obj.plan.map(p => `${p.startTime || '?'} ${p.activity}`).join(', ');
      lines.push(`${d}: ${summary}`);
    } catch (e) {}
  });

  return lines.length ? lines.join('\n') : 'No recent schedule data.';
}

function _offsetDate(dateStr, days) {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  } catch (e) {
    return dateStr;
  }
}

// ── 应用变更 ──────────────────────────────────────────────
// 由 dailyScheduleExtractor.js 调用
function applyScheduleChange(change) {
  // change: { itemId, type, evidence, newTime?, newActivity?, recordedAt }
  const sched = loadTodaySchedule();
  if (!sched) return false;

  const item = sched.plan.find(p => p.id === change.itemId);
  if (!item) return false;

  // 幂等：同一 itemId + type 的变更已存在则跳过
  const alreadyRecorded = sched.changes.some(
    c => c.itemId === change.itemId && c.type === change.type
  );
  if (alreadyRecorded) return false;

  sched.changes.push({
    itemId:      change.itemId,
    type:        change.type,
    evidence:    change.evidence || '',
    newTime:     change.newTime  || null,
    newActivity: change.newActivity || null,
    recordedAt:  change.recordedAt || Date.now(),
  });

  // 更新 plan 中的 status（不删除，保留变更记录）
  if (change.type === 'cancel') {
    item.status = 'cancelled';
  } else if (change.type === 'postpone') {
    item.status = 'postponed';
    if (change.newTime) item.startTime = change.newTime;
  } else if (change.type === 'modify') {
    if (change.newActivity) item.activity = change.newActivity;
    if (change.newTime)     item.startTime = change.newTime;
  }
  item.updatedAt = Date.now();

  _saveSchedule(sched);
  return true;
}

// ── 供 ghostContext.js 使用的上下文文本 ───────────────────
function buildScheduleContextBlock() {
  const sched = loadTodaySchedule();
  if (!sched || !Array.isArray(sched.plan) || sched.plan.length === 0) return '';

  const date    = (typeof getGhostDateStr === 'function' ? getGhostDateStr() : '') || sched.meta?.date || '';
  const timeSt  = (typeof getGhostTimeStr === 'function' ? getGhostTimeStr() : '') || '';

  // 将变更应用到展示（不修改原计划）
  const changeMap = {};
  (sched.changes || []).forEach(c => { changeMap[c.itemId] = c.type; });

  const lines = [`[TODAY'S SCHEDULE — ${date}]`];

  sched.plan.forEach(item => {
    const effectiveStatus = changeMap[item.id] === 'cancel'   ? 'cancelled'
                          : changeMap[item.id] === 'postpone' ? 'postponed'
                          : item.status;

    const timeStr = item.startTime || '';
    const loc     = item.location ? ` · ${item.location}` : '';
    const flag    = effectiveStatus === 'cancelled' ? ' [cancelled]'
                  : effectiveStatus === 'postponed' ? ' [postponed]'
                  : effectiveStatus === 'done'      ? ' [done]'
                  : '';
    lines.push(`${timeStr}  ${item.activity}${loc}${flag}`);
  });

  lines.push('');
  lines.push(`(This is what you planned. You can follow it, adjust it, or ignore parts of it. It is not a script.)`);

  return lines.join('\n');
}

// ── 供 cloud.js stateSnapshot 使用 ────────────────────────
function getSchedulesForSnapshot() {
  const userId = (typeof getSbUserId === 'function' ? getSbUserId() : '') || 'anon';
  const charId = (typeof getCurrentCharacter === 'function' ? getCurrentCharacter() : '') || 'ghost';
  const today  = (typeof getGhostDateStr === 'function' ? getGhostDateStr() : '') || _fallbackDate();

  const result = {};
  [0, -1, -2].forEach(offset => {
    const d   = _offsetDate(today, offset);
    const key = _scheduleKey(userId, charId, d);
    try {
      const obj = JSON.parse(localStorage.getItem(key) || 'null');
      if (obj) result[`${charId}_${d}`] = obj;
    } catch (e) {}
  });
  return result;
}

// ── 从 stateSnapshot 恢复日程 ─────────────────────────────
function restoreSchedulesFromSnapshot(snapshotSchedules) {
  if (!snapshotSchedules || typeof snapshotSchedules !== 'object') return;

  const userId = (typeof getSbUserId === 'function' ? getSbUserId() : '') || 'anon';

  Object.entries(snapshotSchedules).forEach(([compositeKey, schedObj]) => {
    if (!schedObj || !schedObj.meta) return;

    // compositeKey = '{charId}_{date}'
    const { charId, date } = schedObj.meta;
    if (!charId || !date) return;

    const localKey = _scheduleKey(userId, charId, date);
    const existing = localStorage.getItem(localKey);

    if (!existing) {
      // 本地无此日程，直接用云端版本
      localStorage.setItem(localKey, JSON.stringify(schedObj));
      return;
    }

    try {
      const local = JSON.parse(existing);
      // 冲突：取 generatedAt 较新的 plan，但两侧 changes 始终取并集
      const mergedChanges = _mergeChanges(schedObj.changes || [], local.changes || []);
      if (!local.meta || schedObj.meta.generatedAt > (local.meta.generatedAt || 0)) {
        // 云端 plan 更新，用云端 plan + 并集 changes
        const merged = { ...schedObj, changes: mergedChanges };
        merged.meta.cloudLoaded = true;
        localStorage.setItem(localKey, JSON.stringify(merged));
      } else {
        // 本地 plan 更新，保留本地 plan + 并集 changes
        local.changes = mergedChanges;
        local.meta.cloudLoaded = true;
        localStorage.setItem(localKey, JSON.stringify(local));
      }
    } catch (e) {}
  });
}

function _mergeChanges(a, b) {
  const seen = new Set();
  const result = [];
  [...a, ...b].forEach(c => {
    const key = `${c.itemId}_${c.type}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(c);
    }
  });
  return result;
}

// ── 导出 ─────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.checkAndGenerateSchedule    = checkAndGenerateSchedule;
  window.loadTodaySchedule           = loadTodaySchedule;
  window.applyScheduleChange         = applyScheduleChange;
  window.buildScheduleContextBlock   = buildScheduleContextBlock;
  window.getSchedulesForSnapshot     = getSchedulesForSnapshot;
  window.restoreSchedulesFromSnapshot = restoreSchedulesFromSnapshot;
}
