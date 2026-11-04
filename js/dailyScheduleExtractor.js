// ===================================================
// dailyScheduleExtractor.js — 日程变更提取器 V1
// ===================================================
//
// 职责：
//   从 Simon 回复中识别对当天日程的明确变更（取消/推迟/修改）
//   结合原计划上下文，避免误判和无意义调用
//
// 触发条件（两个都满足才调用 Haiku）：
//   1. Simon 回复包含第一人称对活动的陈述
//   2. 当天有 status='planned' 的事项
//
// 不触发：
//   - 纯问候、情感回复、无活动相关内容
//   - 当天无计划
//   - 仅时间经过（不视为变更）
// ===================================================

// ── 快速预检（避免无意义 Haiku 调用）──────────────────────
const _CHANGE_SIGNALS = [
  // 取消信号
  /\b(cancel(led)?|call(ed)?\s+off|not\s+happen(ing)?|won'?t\s+(be\s+)?go(ing)?|scrapped|called\s+off)\b/i,
  // 推迟信号
  /\b(push(ed)?\s+(back|to)|postpone[d]?|delay(ed)?|reschedule[d]?|moved\s+to)\b/i,
  // 完成信号
  /\b(just\s+(got\s+out|finished|wrapped|done|back)\b|all\s+done|wrapped\s+up)\b/i,
  // 进行中信号
  /\b(heading\s+(in|out|over)|on\s+my\s+way|just\s+arrived|in\s+the\s+middle\s+of)\b/i,
];

function _hasChangeSignal(text) {
  return _CHANGE_SIGNALS.some(re => re.test(text));
}

// ── 主提取函数 ────────────────────────────────────────────
async function extractScheduleChanges(simonReply, userLastMsg) {
  if (!simonReply || !simonReply.trim()) return;

  // 条件 1：快速预检，无变更信号则跳过
  if (!_hasChangeSignal(simonReply)) return;

  // 条件 2：当天有 planned 事项
  const sched = (typeof loadTodaySchedule === 'function') ? loadTodaySchedule() : null;
  if (!sched || !Array.isArray(sched.plan)) return;

  const plannedItems = sched.plan.filter(p => p.status === 'planned');
  if (plannedItems.length === 0) return;

  // 组装原计划供 Haiku 对比
  const planSummary = plannedItems
    .map(p => `- id:${p.id} | ${p.startTime || '?'} ${p.activity}${p.location ? ' @ '+p.location : ''}`)
    .join('\n');

  // 已有变更（避免重复处理）
  const existingChanges = (sched.changes || []).map(c => `${c.itemId}:${c.type}`).join(', ') || 'none';

  const systemPrompt = `You extract schedule changes from Simon Riley's reply. Compare his words against his existing plan.

Output ONLY a JSON array of changes, or [] if nothing changed.

Rules:
- Only record changes Simon EXPLICITLY states (not implied by time passing)
- Match to an existing plan item by subject similarity; if no match, output []
- Change types: "cancel" | "postpone" | "modify" | "done" | "ongoing"
- "done": Simon says he finished the activity
- "ongoing": Simon says he's currently doing the activity
- "postpone": Simon says it's moved to a later time
- "cancel": Simon says it's not happening
- "modify": Simon says something about the activity changed (new time, place, etc.)
- Never infer from silence or time alone

Schema:
[{ "itemId": "sched_xxx", "type": "cancel|postpone|modify|done|ongoing", "evidence": "exact quote", "newTime": "HH:MM|null", "newActivity": "string|null" }]`;

  const userPrompt = `Today's plan:
${planSummary}

Already recorded changes: ${existingChanges}

User said: "${userLastMsg}"
Simon replied: "${simonReply}"

Extract changes ([] if none):`;

  try {
    const raw = await fetchDeepSeek(systemPrompt, userPrompt, 250);
    if (!raw || !raw.trim()) return;

    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const changes = JSON.parse(cleaned);
    if (!Array.isArray(changes) || changes.length === 0) return;

    const validTypes = new Set(['cancel', 'postpone', 'modify', 'done', 'ongoing']);
    const validItemIds = new Set(plannedItems.map(p => p.id));

    for (const c of changes) {
      if (!c || typeof c !== 'object') continue;
      if (!validTypes.has(c.type)) continue;
      if (!validItemIds.has(c.itemId)) continue;  // 只处理存在的计划项

      const applied = (typeof applyScheduleChange === 'function')
        ? applyScheduleChange({
            itemId:      c.itemId,
            type:        c.type,
            evidence:    c.evidence || simonReply.slice(0, 100),
            newTime:     c.newTime     || null,
            newActivity: c.newActivity || null,
            recordedAt:  Date.now(),
          })
        : false;

      if (applied) {
        console.log(`[ScheduleExtractor] Applied change: ${c.itemId} → ${c.type}`);

        // 仅在取消/推迟时写入 Continuity（避免双重事实）
        if ((c.type === 'cancel' || c.type === 'postpone') && typeof cancelContinuity === 'function') {
          // 找对应的 Continuity 事件（若有）
          const active = (typeof getActiveContinuity === 'function') ? getActiveContinuity() : [];
          const item = plannedItems.find(p => p.id === c.itemId);
          const ctEvent = active.find(ct =>
            item && ct.subject.toLowerCase().includes(item.activity.toLowerCase().split(' ')[0])
          );
          if (ctEvent && c.type === 'cancel') {
            cancelContinuity(ctEvent.id, `${item.activity} cancelled.`, 'schedule_change');
          }
        }
      }
    }
  } catch (e) {
    console.warn('[ScheduleExtractor] Failed:', e.message);
    // 提取失败不影响聊天流程
  }
}

// ── 导出 ─────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.extractScheduleChanges = extractScheduleChanges;
}
