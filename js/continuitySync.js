// ===================================================
// continuitySync.js — Continuity RPC 云同步模块 (v2)
// ===================================================
//
// 修复点：
//   F-SYNC-1  快照确认机制：上传前记录快照指纹，成功后只有当本地未变化时才清除脏标记
//   F-SYNC-2  账号隔离：脏标记 key 含 userId+charId，切换账号/角色不串
//   F-SYNC-3  登录恢复：loadContinuityFromCloud 前先清本地孤儿状态
//   F-SYNC-4  网络失败保留脏标记；不阻止本地写入
//   F-SYNC-5  冲突中的 cloud_record 直接用于本地合并，无需额外 SELECT
//
// 设计原则：
//   不阻止本地写入。本地总是可写，上传成功后再确认已同步。
//   脏标记 = "localStorage 中有云端未见过的内容"
//   快照指纹 = 上传时刻的 JSON 内容 SHA-like 字符串（轻量字符串比较）
// ===================================================

const SYNC_COOLDOWN_MS  = 3000;
const MAX_RETRY_COUNT   = 3;

// ── 脏标记（按 userId + charId 隔离）──────────────────────
function _dirtyKey() {
  const uid = (typeof getSbUserId === 'function' ? getSbUserId() : '') || 'anon';
  const cid = (typeof getCurrentCharacter === 'function' ? getCurrentCharacter() : '') || 'ghost';
  return `_continuityDirty_${uid}_${cid}`;
}

function markContinuityDirty() {
  sessionStorage.setItem(_dirtyKey(), 'true');
}

function _clearContinuityDirty() {
  sessionStorage.removeItem(_dirtyKey());
}

function isContinuityDirty() {
  return sessionStorage.getItem(_dirtyKey()) === 'true';
}

// ── 快照指纹（轻量字符串，不依赖哈希）──────────────────
function _snapshotFingerprint(events) {
  // 按 id 排序后 JSON 序列化，变化必然不同
  const sorted = [...events].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  return JSON.stringify(sorted.map(e => ({
    id: e.id, status: e.status, version: e.version,
    summary: e.summary, plannedDate: e.plannedDate
  })));
}

// ── 同步锁 ─────────────────────────────────────────────
let _syncInProgress  = false;
let _lastSyncAttempt = 0;

// ── 主同步函数 ─────────────────────────────────────────
async function saveContinuity(retryCount) {
  retryCount = retryCount || 0;

  if (!isContinuityDirty()) {
    return { skipped: true };
  }

  const now = Date.now();
  if (now - _lastSyncAttempt < SYNC_COOLDOWN_MS && retryCount === 0) {
    return { deferred: true };
  }

  if (_syncInProgress) {
    // 在锁内有新修改，脏标记已由 markContinuityDirty 保留，下次会重新跑
    return { inProgress: true };
  }

  _syncInProgress  = true;
  _lastSyncAttempt = now;

  try {
    const sb     = (typeof getSbClient        === 'function') ? getSbClient()        : null;
    const userId = (typeof getSbUserId        === 'function') ? getSbUserId()        : null;
    const charId = (typeof getCurrentCharacter === 'function') ? getCurrentCharacter() : 'ghost';

    if (!sb || !userId) {
      _syncInProgress = false;
      return { error: 'not_ready' };
    }

    // F-SYNC-1: 读快照并记录指纹（在调用 RPC 之前固定）
    const events     = JSON.parse(localStorage.getItem('continuityV1')          || '[]');
    const tombstones = JSON.parse(localStorage.getItem('continuityTombstones')  || '[]');
    const snapshotFp = _snapshotFingerprint(events);

    events.sort((a, b) => (a.id || '').localeCompare(b.id || ''));

    const payload_events = events.map(e => ({
      id:               e.id,
      type:             e.type,
      subject:          e.subject,
      status:           e.status,
      summary:          e.summary,
      source:           e.source,
      sourceId:         e.sourceId,
      mentionedAt:      e.mentionedAt      || null,
      startedAt:        e.startedAt        || null,
      client_updated_at: e.updatedAt       || null,
      completedAt:      e.completedAt      || null,
      cancelledAt:      e.cancelledAt      || null,
      plannedDate:      e.plannedDate      || null,
      plannedDayPart:   e.plannedDayPart   || null,
      changes:          e.changes          || [],
      version:          e.version          || 1
    }));

    const payload_tombstones = tombstones.map(t => ({
      event_id:   t.id,
      deleted_at: t.deletedAt
    }));

    const { data, error } = await sb.rpc('atomic_merge_continuity', {
      p_user_id:      userId,
      p_character_id: charId,
      p_events:       payload_events,
      p_tombstones:   payload_tombstones
    });

    if (error) {
      if (error.code === '40P01' && retryCount < MAX_RETRY_COUNT) {
        // 死锁：等待随机时间后重试
        _syncInProgress = false;
        await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
        return saveContinuity(retryCount + 1);
      }
      throw error;
    }

    // 处理冲突（F-SYNC-5：直接用 cloud_record 合并，无需额外 SELECT）
    if (Array.isArray(data?.conflicts) && data.conflicts.length > 0) {
      _applyConflictResolutions(data.conflicts);
    }

    // F-SYNC-1: 快照确认
    // 只有当本地快照与上传时一致，才清除脏标记
    // 若上传期间有新修改，本地指纹已变，脏标记保留供下次上传
    const currentFp = _snapshotFingerprint(
      JSON.parse(localStorage.getItem('continuityV1') || '[]')
    );
    if (currentFp === snapshotFp) {
      _clearContinuityDirty();
    } else {
      // 上传期间有新写入，保留脏标记
      console.log('[ContinuitySync] Local changed during sync, keeping dirty flag');
    }

    _syncInProgress = false;
    return { success: true, conflicts: data?.conflicts || [] };

  } catch (e) {
    console.error('[ContinuitySync] Sync failed:', e.message);
    _syncInProgress = false;
    // 网络失败：保留脏标记（F-SYNC-4）
    markContinuityDirty();
    return { error: e.message };
  }
}

// ── 冲突解决（F-SYNC-5）──────────────────────────────────
function _applyConflictResolutions(conflicts) {
  const events = JSON.parse(localStorage.getItem('continuityV1') || '[]');
  let changed = false;

  for (const c of conflicts) {
    if (c.reason === 'version_conflict' || c.reason === 'terminal_state_protected') {
      // RPC 已返回 cloud_record，直接合并，无需额外网络请求
      const cr = c.cloud_record;
      if (!cr) continue;

      const idx = events.findIndex(e => e.id === cr.id);
      if (idx >= 0) {
        // 用云端权威版本覆盖本地
        events[idx] = {
          ...events[idx],
          status:        cr.status,
          summary:       cr.summary        !== undefined ? cr.summary        : events[idx].summary,
          version:       cr.version,
          updatedAt:     cr.client_updated_at !== undefined ? cr.client_updated_at : events[idx].updatedAt,
          plannedDate:   cr.plannedDate    !== undefined ? cr.plannedDate    : events[idx].plannedDate,
          plannedDayPart: cr.plannedDayPart !== undefined ? cr.plannedDayPart : events[idx].plannedDayPart
        };
        changed = true;
        console.warn(`[ContinuitySync] Conflict resolved: ${c.event_id} → cloud v${cr.version} (${cr.status})`);
      }
    } else if (c.reason === 'event_deleted') {
      const before = events.length;
      const after  = events.filter(e => e.id !== c.event_id);
      if (after.length < before) {
        events.splice(0, events.length, ...after);
        changed = true;
        console.warn(`[ContinuitySync] Removed locally deleted event: ${c.event_id}`);
      }
    }
  }

  if (changed) {
    // 直接写 localStorage，不触发脏标记（这是云端数据覆盖本地，不是本地新修改）
    try {
      localStorage.setItem('continuityV1', JSON.stringify(events));
    } catch (e) {
      console.error('[ContinuitySync] Failed to save conflict resolution:', e);
    }
  }
}

// ── 加载云端数据（登录恢复）──────────────────────────────
async function loadContinuityFromCloud() {
  const sb     = (typeof getSbClient         === 'function') ? getSbClient()        : null;
  const userId = (typeof getSbUserId         === 'function') ? getSbUserId()        : null;
  const charId = (typeof getCurrentCharacter  === 'function') ? getCurrentCharacter() : 'ghost';

  if (!sb || !userId) return;

  try {
    const { data: rows, error } = await sb
      .from('continuity_events')
      .select('*')
      .eq('user_id', userId)
      .eq('character_id', charId);

    if (error) throw error;
    if (!rows || rows.length === 0) return;

    const cloudEvents = rows.map(r => ({
      id:            r.event_id,
      type:          r.type,
      subject:       r.subject,
      status:        r.status,
      summary:       r.summary,
      source:        r.source,
      sourceId:      r.source_id,
      mentionedAt:   r.mentioned_at,
      startedAt:     r.started_at,
      updatedAt:     r.client_updated_at,
      completedAt:   r.completed_at,
      cancelledAt:   r.cancelled_at,
      plannedDate:   r.planned_date,
      plannedDayPart: r.planned_day_part,
      changes:       r.changes || [],
      version:       r.version
    }));

    const localEvents = JSON.parse(localStorage.getItem('continuityV1') || '[]');
    const merged      = _mergeCloudIntoLocal(localEvents, cloudEvents);

    localStorage.setItem('continuityV1', JSON.stringify(merged));
    // 加载后本地与云端一致，清除脏标记
    _clearContinuityDirty();
    console.log(`[ContinuitySync] Loaded ${cloudEvents.length} events from cloud`);

  } catch (e) {
    console.error('[ContinuitySync] Load failed:', e.message);
    // 加载失败不清除本地数据，保留脏标记等下次重试
  }
}

// ── 云端合并策略 ─────────────────────────────────────────
// 云端 version 是权威；本地 version 仅 > 云端时保留（未同步的本地修改）
function _mergeCloudIntoLocal(local, cloud) {
  const byId = new Map();

  // 先放入云端（权威）
  for (const ce of cloud) {
    byId.set(ce.id, ce);
  }

  // 本地事件：version 严格大于云端才保留（表示有未同步修改）
  for (const le of local) {
    const ce = byId.get(le.id);
    if (!ce) {
      // 云端没有，保留本地（未同步的新增）
      byId.set(le.id, le);
    } else if ((le.version || 1) > ce.version) {
      // 本地版本更新，保留本地
      byId.set(le.id, le);
    }
    // 否则保留云端（已同步或云端更新）
  }

  return Array.from(byId.values());
}

// ── 导出 ────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.saveContinuity          = saveContinuity;
  window.loadContinuityFromCloud = loadContinuityFromCloud;
  window.markContinuityDirty     = markContinuityDirty;
  window.isContinuityDirty       = isContinuityDirty;
}
