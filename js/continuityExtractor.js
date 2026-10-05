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
 *   - action: "none" | "create" | "update" | "complete"
 *   - type: 事件类型（仅 create 时）
 *   - subject: 事件主题（仅 create 时）
 *   - status: "pending" | "ongoing"（仅 create/update 时）
 *   - targetId: 目标记录 ID（仅 update/complete 时）
 *   - summary: 客观事实描述（create/update/complete 时）
 */
async function extractContinuityFromReply(input) {
  const { userLastMsg = '', simonReply = '', activeContinuity = [] } = input;

  if (!simonReply || !simonReply.trim()) {
    return { action: 'none' };
  }

  // 使用项目现有的低成本模型（fetchDeepSeek 实际走 Haiku）
  const systemPrompt = `You are a continuity extractor. You analyze Simon's reply and determine if it contains a factual event that should be tracked.

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
  "action": "none" | "create" | "update" | "complete",

  // For "create":
  "type": "work" | "appointment" | "meal" | "travel" | "rest",
  "subject": "briefing" | "training" | "lunch" | etc.,
  "status": "pending" | "ongoing",
  "summary": "objective factual summary",

  // For "update":
  "targetId": "ct_xxx",
  "status": "pending" | "ongoing",
  "summary": "objective factual summary",

  // For "complete":
  "targetId": "ct_xxx",
  "summary": "objective factual summary"
}

Examples:

User: "what are you doing later?"
Simon: "Got a briefing in twenty."
→ {"action":"create","type":"work","subject":"briefing","status":"pending","summary":"Briefing scheduled shortly."}

[Active: briefing/pending]
Simon: "Heading in now."
→ {"action":"update","targetId":"ct_xxx","status":"ongoing","summary":"Briefing in progress."}

[Active: briefing/ongoing]
Simon: "Just got out."
→ {"action":"complete","targetId":"ct_xxx","summary":"Briefing completed."}

Simon: "I'm having coffee."
→ {"action":"none"}

Simon: "Might have training tomorrow."
→ {"action":"none"}

[Active: briefing/pending]
Simon: "Briefing got pushed to tomorrow."
→ {"action":"update","targetId":"ct_xxx","status":"pending","summary":"Briefing rescheduled to tomorrow."}

[Active: briefing/pending, training/pending]
Simon: "Heading in now."
→ {"action":"none"}  // Multiple candidates, cannot determine

User: "briefing later?"
Simon: "Maybe."
→ {"action":"none"}

User: "briefing later?"
Simon: "Yeah. In twenty."
→ {"action":"create","type":"work","subject":"briefing","status":"pending","summary":"Briefing scheduled shortly."}

Simon: "Got a briefing now. I'll text you when I'm done."
→ {"action":"create","type":"work","subject":"briefing","status":"ongoing","summary":"Briefing in progress."}
// DO NOT create a separate "text wife" task

Simon: "Training tomorrow morning."
→ {"action":"create","type":"work","subject":"training","status":"pending","summary":"Training scheduled for tomorrow morning."}

Simon: "Flying back on Friday."
→ {"action":"create","type":"travel","subject":"return flight","status":"pending","summary":"Flight back scheduled for Friday."}

IMPORTANT:
- Summary MUST be an objective fact, never an instruction ("Remember to mention", "Ask her about it")
- If uncertain, return {"action":"none"}
- Only match ONE candidate for update/complete. Multiple candidates → none.`;

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
    const raw = await fetchDeepSeek(systemPrompt, userPrompt, 150);
    if (!raw || !raw.trim()) {
      return { action: 'none' };
    }

    // 清理 markdown 代码块标记
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const result = safeParseJSON(cleaned);

    if (!result || typeof result !== 'object') {
      return { action: 'none' };
    }

    // 基本合法性检查
    const validActions = ['none', 'create', 'update', 'complete'];
    if (!validActions.includes(result.action)) {
      return { action: 'none' };
    }

    return result;
  } catch (e) {
    console.warn('[Continuity Extractor] Error:', e);
    return { action: 'none' };
  }
}
