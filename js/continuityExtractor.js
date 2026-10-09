// ===================================================
// continuityExtractor.js — Continuity V1 · Batch 2 · Chat Extraction
// ===================================================
//
// 职责：
//   从 Simon 回复中提取 Continuity 事实（create/update/complete/none）
//   提案权在此，决定权在系统校验层。
//
// 核心原则：
//   宁可漏记，不要乱记。
//   只记录 Simon 自己明确说出来的、近期且已确定、后面仍存在状态变化的现实事件。
//
// 不记录：
//   - "I'm having coffee." / "I'm tired." / "Weather's shit."
//   - "Maybe I'll go out later." / "Might have training tomorrow."
//   - "Had a briefing last week."
//   - 任何承诺/提醒/任务（"I'll text you when I'm done."）
//
// V1 只有四种 action：create / update / complete / none
// ===================================================


/**
 * 从 Simon 回复中提取 Continuity 事实
 * @param {object} input
 *   - userLastMsg: 用户最后一条消息（用于解析代词/省略/Yes/No）
 *   - simonReply: Simon 的回复（唯一事实来源）
 *   - activeContinuity: 当前 active 的 Continuity 记录数组
 * @returns {object} Extractor 提案
 *   - actions: 数组，每个元素包含：
 *     - action: "create" | "update" | "complete"
 *     - type: 事件类型（仅 create 时）
 *     - subject: 事件主题（仅 create 时）
 *     - status: "pending" | "ongoing"（仅 create/update 时）
 *     - targetId: 目标记录 ID（仅 update/complete 时）
 *     - summary: 客观事实描述（create/update/complete 时）
 *   如果没有事件，返回 { actions: [] }
 */
async function extractContinuityFromReply(input) {
  const { userLastMsg = '', simonReply = '', activeContinuity = [] } = input;

  if (!simonReply || !simonReply.trim()) {
    return { action: 'none' };
  }

  // 使用项目现有的低成本模型（fetchDeepSeek 实际走 Haiku）
  const systemPrompt = `You are a continuity extractor. You analyze Simon's reply and determine if it contains factual events that should be tracked.

ONLY record events that:
1. Simon explicitly states in his own words
2. Are near-term and already confirmed (not "maybe" / "might")
3. Will have status changes later (pending → ongoing → completed)

DO NOT record:
- Current momentary states ("I'm having coffee", "I'm tired")
- Vague possibilities ("Maybe I'll go out later", "Might have training tomorrow")
- Past events that are already done ("Had a briefing last week")
- Promises or reminders ("I'll text you when I'm done")

Output ONLY a JSON object, no other text.

Schema:
{
  "actions": [
    {
      "action": "create" | "update" | "complete",

      // For "create":
      "type": "work" | "appointment" | "meal" | "travel" | "rest",
      "subject": "briefing" | "training" | "lunch" | etc.,
      "status": "pending" | "ongoing",
      "summary": "objective factual summary",
      "timeExpr": "tomorrow morning" | "this afternoon" | "next Monday" | null,  // Extract relative time expression

      // For "update":
      "targetId": "ct_xxx",
      "status": "pending" | "ongoing",
      "summary": "objective factual summary",
      "timeExpr": "tomorrow morning" | null,  // If reschedule changes the time

      // For "complete":
      "targetId": "ct_xxx",
      "summary": "objective factual summary"
    }
  ]
}

If no events should be recorded, return: {"actions":[]}

Examples:

User: "what are you doing later?"
Simon: "Got a briefing in twenty."
→ {"actions":[{"action":"create","type":"work","subject":"briefing","status":"pending","summary":"Briefing scheduled shortly.","timeExpr":null}]}

Simon: "Got training this morning. Paperwork this afternoon."
→ {"actions":[{"action":"create","type":"work","subject":"training","status":"pending","summary":"Training scheduled for this morning.","timeExpr":"this morning"},{"action":"create","type":"work","subject":"paperwork","status":"pending","summary":"Paperwork scheduled for this afternoon.","timeExpr":"this afternoon"}]}

Simon: "Training tomorrow morning."
→ {"actions":[{"action":"create","type":"work","subject":"training","status":"pending","summary":"Training scheduled for tomorrow morning.","timeExpr":"tomorrow morning"}]}

Simon: "Got a briefing next Monday."
→ {"actions":[{"action":"create","type":"work","subject":"briefing","status":"pending","summary":"Briefing scheduled for next Monday.","timeExpr":"next Monday"}]}

[Active: briefing/pending]
Simon: "Heading in now."
→ {"actions":[{"action":"update","targetId":"ct_xxx","status":"ongoing","summary":"Briefing in progress."}]}

[Active: briefing/ongoing]
Simon: "Just got out."
→ {"actions":[{"action":"complete","targetId":"ct_xxx","summary":"Briefing completed."}]}

[Active: training/pending]
Simon: "Just finished training. Still got paperwork to do."
→ {"actions":[{"action":"complete","targetId":"ct_xxx","summary":"Training completed."}]}
// "Still got paperwork to do" is status confirmation, not a change - no action needed

Simon: "I'm having coffee."
→ {"actions":[]}

Simon: "Might have training tomorrow."
→ {"actions":[]}

[Active: briefing/pending]
Simon: "Briefing got pushed to tomorrow."
→ {"actions":[{"action":"update","targetId":"ct_xxx","status":"pending","summary":"Briefing rescheduled to tomorrow.","timeExpr":"tomorrow"}]}

[Active: briefing/pending, training/pending]
Simon: "Heading in now."
→ {"actions":[]}  // Multiple candidates, cannot determine

User: "briefing later?"
Simon: "Maybe."
→ {"actions":[]}

User: "briefing later?"
Simon: "Yeah. In twenty."
→ {"actions":[{"action":"create","type":"work","subject":"briefing","status":"pending","summary":"Briefing scheduled shortly."}]}

Simon: "Got a briefing now. I'll text you when I'm done."
→ {"actions":[{"action":"create","type":"work","subject":"briefing","status":"ongoing","summary":"Briefing in progress."}]}
// DO NOT create a separate "text wife" task

Simon: "Training tomorrow morning."
→ {"actions":[{"action":"create","type":"work","subject":"training","status":"pending","summary":"Training scheduled for tomorrow morning."}]}

Simon: "Flying back on Friday."
→ {"actions":[{"action":"create","type":"travel","subject":"return flight","status":"pending","summary":"Flight back scheduled for Friday."}]}

Simon: "Got a briefing at 14:00. Training after that. Heading home around 18:00."
→ {"actions":[{"action":"create","type":"work","subject":"briefing","status":"pending","summary":"Briefing scheduled at 14:00."},{"action":"create","type":"work","subject":"training","status":"pending","summary":"Training scheduled after briefing."},{"action":"create","type":"travel","subject":"heading home","status":"pending","summary":"Heading home around 18:00."}]}

IMPORTANT:
- Summary MUST be an objective fact, never an instruction ("Remember to mention", "Ask her about it")
- If uncertain about an event, omit it from the actions array
- Only match ONE candidate for update/complete. Multiple candidates → omit that action
- Each action in the array must be independent and complete
- Do not create duplicate events with the same subject in one response
- timeExpr: Extract relative time expressions EXACTLY as Simon said them (e.g. "tomorrow morning", "this afternoon", "next Monday"). If no time expression, set to null. Do NOT invent time expressions.`;

  const userPrompt = `[Active Continuity]
${activeContinuity.length > 0
  ? activeContinuity.map(c => `- ${c.id}: ${c.subject} / ${c.status}`).join('\n')
  : '(none)'}

[User's last message]
${userLastMsg}

[Simon's reply]
${simonReply}

Extract:`;

  try {
    const raw = await fetchDeepSeek(systemPrompt, userPrompt, 300);
    if (!raw || !raw.trim()) {
      return { actions: [] };
    }

    // 清理 markdown 代码块标记
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const result = safeParseJSON(cleaned);

    if (!result || typeof result !== 'object') {
      return { actions: [] };
    }

    // 新格式校验
    if (!Array.isArray(result.actions)) {
      return { actions: [] };
    }

    // 基本合法性检查每个 action
    const validActions = ['create', 'update', 'complete'];
    const validatedActions = result.actions.filter(action => {
      if (!action || typeof action !== 'object') return false;
      if (!validActions.includes(action.action)) return false;
      return true;
    });

    return { actions: validatedActions };
  } catch (e) {
    console.warn('[Continuity Extractor] Error:', e);
    return { actions: [] };
  }
}
