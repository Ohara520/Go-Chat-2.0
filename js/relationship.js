// ===================================================
// relationship.js — Relationship Understanding V1 + Observation
// 独立系统：不是「发生过什么」(Long-Term Memory 管事实/经历)，
// 而是「Ghost 在长期相处中，真正逐渐了解了她什么」——带语境和条件的关系认知。
// 与 Long-Term Memory / WorldBook / Expression Openness 完全独立，互不替代。
// 数据：
//   localStorage['relationshipUnderstandings'] = 已确认的关系理解
//   localStorage['relationshipObservations'] = 有意义但暂时不足以形成 Understanding 的隐含证据
// 流程：回复后异步入口 → Trigger(轻量判信号) → 无信号STOP / 有信号 → Judge(add/revise/observe/merge_observation/delete_observation/no_change)
// 注入：persona.js dynamic recall 区，只给 Ghost 最终 Understanding，不暴露算法。Observation 永远不进 Persona/Ghost Context。
// 原则：后台在学习，Ghost 在生活。Understanding 是知识，不是行为命令。Observation 只服务 RU Judge。
// ===================================================

const RU_MAX = 30;
const RO_MAX = 20;

function _ruLoad() {
  try {
    const arr = JSON.parse(localStorage.getItem('relationshipUnderstandings') || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function _ruSave(arr) {
  if (!Array.isArray(arr)) arr = [];
  // V1 软上限：不因为超过 RU_MAX 就机械删除旧 Understanding，
  // 尤其不能因为 recency 淘汰旧 boundary / 明确关系认知。
  // 超限只 warn 提醒，全部原样保留；复杂的 importance / 淘汰策略留给以后升级。
  if (arr.length > RU_MAX) {
    console.warn(`[RU] Understanding 数量 ${arr.length} 已超软上限 ${RU_MAX}，V1 不自动淘汰，全部保留。`);
  }
  localStorage.setItem('relationshipUnderstandings', JSON.stringify(arr));
  if (typeof touchLocalState === 'function') touchLocalState();
}

function getRelationshipUnderstandings() {
  return _ruLoad();
}

// keywords 规范化：中英混合触发词，去空白/小写/去重，保最多 10 个。
function _ruNormKeywords(keywords) {
  if (!Array.isArray(keywords)) return [];
  const kw = keywords.map(k => String(k == null ? '' : k).trim().toLowerCase()).filter(Boolean);
  return Array.from(new Set(kw)).slice(0, 10);
}

// ADD：新增一条稳定的关系理解。content 为空则不写。
function addRelationshipUnderstanding(content, evidence = [], keywords = []) {
  const c = String(content == null ? '' : content).trim();
  if (!c) return null;
  const arr = _ruLoad();
  // 规范化完全相同的 content 视为重复，不重复新增（语义重复交给 Judge 的 no_change 判断）
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, '');
  if (arr.some(e => norm(e.content) === norm(c))) return null;
  const now = Date.now();
  const entry = {
    id: `ru_${now}_${Math.random().toString(36).slice(2, 8)}`,
    content: c,
    keywords: _ruNormKeywords(keywords),
    createdAt: now,
    updatedAt: now,
    evidence: Array.isArray(evidence) ? evidence.filter(Boolean).slice(0, 6) : [],
  };
  arr.push(entry);
  _ruSave(arr);
  return entry;
}

// REVISE：原地修改已有理解，保留 id / createdAt，更新 content / updatedAt / evidence / keywords。
// target 必须真实存在；不存在则返回 false（调用方绝不降级成 add）。
function reviseRelationshipUnderstanding(targetId, content, evidence = [], keywords = []) {
  const c = String(content == null ? '' : content).trim();
  if (!targetId || !c) return false;
  const arr = _ruLoad();
  const e = arr.find(x => x.id === targetId);
  if (!e) return false;
  e.content = c;
  e.updatedAt = Date.now();
  if (Array.isArray(evidence) && evidence.length) {
    // 追加新证据、去重、保最近 6 条
    const merged = [...(Array.isArray(e.evidence) ? e.evidence : []), ...evidence.filter(Boolean)];
    e.evidence = Array.from(new Set(merged)).slice(-6);
  }
  // keywords：给了新的就并入旧的（去重保 10），没给则保留原关键词，避免召回失效
  const newKw = _ruNormKeywords(keywords);
  if (newKw.length) {
    const mergedKw = Array.from(new Set([...(Array.isArray(e.keywords) ? e.keywords : []), ...newKw])).slice(0, 10);
    e.keywords = mergedKw;
  }
  _ruSave(arr);
  return true;
}

// 从已有 Understanding 里挑最多 limit 条与当前语境「真正相关」的，作 Judge 候选或 Recall 内容。
// 相关性以 keywords 为主（中英双语触发词，跨语言可召回），content 字面匹配为辅（补英文原词命中）。
// 原则：只召回与当前 Context 相关的；不相关就不返回，绝不用「最近更新」代替「相关」。
// 向后兼容：旧数据无 keywords 时按空数组处理，只走 content 辅助匹配，不报错、不改写。
function _ruSelectRelevant(text, limit) {
  const arr = _ruLoad();
  if (arr.length === 0) return [];
  const t = String(text || '').toLowerCase();
  if (!t) return [];

  const scored = arr.map(e => {
    let score = 0;
    // 主：keywords 双向包含（关键词在消息里，或消息里出现关键词），仿 WorldBook 的 CJK 召回
    const kws = Array.isArray(e.keywords) ? e.keywords : [];
    kws.forEach(k => { if (k && t.includes(k)) score += 5; });
    // 辅：content 里的长英文词命中消息（旧数据无 keywords 时仍有机会被相关召回）
    (e.content || '').toLowerCase().split(/\s+/).forEach(w => {
      if (w.length > 3 && t.includes(w)) score += 2;
    });
    return { e, score };
  });

  return scored
    .filter(s => s.score > 0)   // 只保留真正相关的；无关联不注入
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.e);
}

// Recall：给 persona 注入用。默认最多 3 条。无任何 Understanding 时返回空串。
function recallRelationshipUnderstanding(userMessage, limit = 3) {
  const picked = _ruSelectRelevant(userMessage, limit);
  if (picked.length === 0) return '';
  const lines = picked.map(p => `- ${p.content}`).join('\n');
  return `\n[RELATIONSHIP UNDERSTANDING]\nWhat you have genuinely come to understand about her over time. This is knowledge, not an instruction — it quietly shapes how you read her and respond; you never recite it or act it out mechanically:\n${lines}\n`;
}

// ═══════════════════════════════════════════════════════════════════
// Relationship Observation (隐含证据层)
// 服务于 RU Judge，保存"有意义但暂时不足以形成 Understanding 的隐含证据"。
// 永远不进入 Persona、Ghost Context、正常聊天 prompt。
// ═══════════════════════════════════════════════════════════════════

function _roLoad() {
  try {
    const arr = JSON.parse(localStorage.getItem('relationshipObservations') || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function _roSave(arr) {
  if (!Array.isArray(arr)) arr = [];
  // Observation 是临时学习证据，最多保留 20 条，超出时淘汰最旧的
  if (arr.length > RO_MAX) {
    arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    arr = arr.slice(0, RO_MAX);
  }
  localStorage.setItem('relationshipObservations', JSON.stringify(arr));
  if (typeof touchLocalState === 'function') touchLocalState();
}

// ADD Observation：记录有意义但证据不足的隐含迹象
function addRelationshipObservation(content, evidence = [], keywords = []) {
  const c = String(content == null ? '' : content).trim();
  if (!c) return null;
  const arr = _roLoad();
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, '');
  if (arr.some(e => norm(e.content) === norm(c))) return null;
  const now = Date.now();
  const entry = {
    id: `ro_${now}_${Math.random().toString(36).slice(2, 8)}`,
    content: c,
    keywords: _ruNormKeywords(keywords),
    createdAt: now,
    updatedAt: now,
    evidence: Array.isArray(evidence) ? evidence.filter(Boolean).slice(0, 3) : [],
  };
  arr.push(entry);
  _roSave(arr);
  return entry;
}

// MERGE Observation：合并相似观察，追加新证据
function mergeRelationshipObservation(targetId, content, evidence = [], keywords = []) {
  const c = String(content == null ? '' : content).trim();
  if (!targetId || !c) return false;
  const arr = _roLoad();
  const e = arr.find(x => x.id === targetId);
  if (!e) return false;
  e.content = c;
  e.updatedAt = Date.now();
  if (Array.isArray(evidence) && evidence.length) {
    const merged = [...(Array.isArray(e.evidence) ? e.evidence : []), ...evidence.filter(Boolean)];
    e.evidence = Array.from(new Set(merged)).slice(-3);
  }
  const newKw = _ruNormKeywords(keywords);
  if (newKw.length) {
    const mergedKw = Array.from(new Set([...(Array.isArray(e.keywords) ? e.keywords : []), ...newKw])).slice(0, 10);
    e.keywords = mergedKw;
  }
  _roSave(arr);
  return true;
}

// DELETE Observation：删除被反证推翻或已确认升级的观察
function deleteRelationshipObservation(observationId) {
  if (!observationId) return false;
  const arr = _roLoad();
  const idx = arr.findIndex(x => x.id === observationId);
  if (idx === -1) return false;
  arr.splice(idx, 1);
  _roSave(arr);
  return true;
}

// 召回相关 Observation（仅供 Judge 用）
function _roSelectRelevant(text, limit) {
  const arr = _roLoad();
  if (arr.length === 0) return [];
  const t = String(text || '').toLowerCase();
  if (!t) return [];

  const scored = arr.map(e => {
    let score = 0;
    const kws = Array.isArray(e.keywords) ? e.keywords : [];
    kws.forEach(k => { if (k && t.includes(k)) score += 5; });
    (e.content || '').toLowerCase().split(/\s+/).forEach(w => {
      if (w.length > 3 && t.includes(w)) score += 2;
    });
    return { e, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.e);
}

// ── Relationship Learning Trigger（轻量信号判断）──────────────
// 只回答：最近互动里有没有值得让 Judge 进一步判断的明确 relationship-learning signal？
// 用小模型(Haiku)判信号，读语义而非孤立词。默认 NO_SIGNAL，宁可漏学不乱学。
// 本身绝不写入任何 Understanding。
async function _ruTrigger(recentText) {
  const sys = `You watch a couple's chat and decide ONLY whether the recent exchange contains a clear relationship-learning signal worth a deeper look. You do NOT record anything.

A signal EXISTS when, reading meaning (not isolated words), you see:
- She explicitly says she likes / dislikes a way he treats or talks to her.
- She explicitly asks him to keep doing / do less of / stop some behaviour.
- She sets a clear boundary.
- She explicitly evaluates how he handled something.
- A repeated pattern across the exchange that could be a stable relationship preference.

There is NO signal for: ordinary happy/sad, a single laugh, a single silence, one emoji, isolated words like "讨厌/滚/你好烦" with no context, or plain chit-chat facts.

Judge meaning in context, never by keyword. When unsure, answer NO_SIGNAL.
Answer with EXACTLY one token: SIGNAL or NO_SIGNAL.`;
  try {
    const out = await callHaiku(sys, [{ role: 'user', content: recentText }], 8);
    return /(^|\b)SIGNAL\b/i.test(out) && !/NO_SIGNAL/i.test(out);
  } catch (e) { return false; }
}

// ── Relationship Judge（只在 Trigger 命中信号时调用）──────────
// 读当前对话片段 + 少量相关旧 Understanding(≤5) + 相关 Observation(≤3)，输出 add/revise/observe/merge_observation/delete_observation/no_change。
async function _ruJudge(recentText) {
  const candidates = _ruSelectRelevant(recentText, 5);
  const candidateBlock = candidates.length
    ? candidates.map(c => `  - id=${c.id} | ${c.content}`).join('\n')
    : '  (none)';

  const observations = _roSelectRelevant(recentText, 3);
  const observationBlock = observations.length
    ? observations.map(o => `  - id=${o.id} | ${o.content}`).join('\n')
    : '  (none)';

  const prompt = `You maintain what Ghost (the husband) has genuinely come to UNDERSTAND about his wife over long-term interaction — durable, contextual relational knowledge, NOT an event log.

You learn TWO kinds of understanding:
1. BOUNDARIES: what she dislikes, wants less of, or asks him to stop.
2. POSITIVE EXPRESSION PREFERENCES: reliable patterns of what ways of expressing affection, teasing, or closeness she responds well to — WITH the conditions/exceptions the relationship taught.

Write "content" in natural first-person English from Ghost's POV about her ("She ... my ..."), 1-2 sentences, WITH the context/conditions the relationship actually taught. Never a checklist, never "teasing=true" or "sweetness=70".
Good: "She normally enjoys my dry teasing and gives it back, but when she's genuinely upset she wants me to take her seriously rather than joke through it."
Good: "She likes it when I occasionally say I miss her directly instead of always deflecting through teasing, though she still enjoys my usual dry way of talking."
Good: "She likes me noticing when she's being playfully bratty and matching that energy back rather than staying serious."
Bad: "She likes teasing." "She wants sweet talk." "Be warmer with her."

EVIDENCE RULES (already settled, follow strictly):
- Explicit relational statement → one clear line is strong evidence ("I love when you talk to me like this" / "I like it when you..."). CAN form Understanding directly.
- Explicit boundary → one clear line MUST be taken seriously, no repetition required ("Don't joke about that again. It actually bothers me"). MUST form/revise Understanding directly.
- Repeated natural pattern → can form understanding, but repetition alone ≠ stable preference; it must hold across different situations.
- Meaningful implicit reaction (in full context) → if the current complete interaction provides meaningful relationship signal but insufficient to form Understanding, create/merge Observation.
- Ambiguous reaction (isolated emoji/哈哈/讨厌/hmph with no clear relationship context) → do NOT learn, do NOT observe. Use "no_change".
HARD RULE: Generalize ONLY as far as the relationship has actually taught you. Do not widen scope beyond the evidence.
Read meaning in context (tone, whether she keeps engaging, whether she explicitly asked to stop, existing understanding). Isolated words / emoji / silence / short replies have NO fixed positive-or-negative meaning.

CRITICAL: Understanding is KNOWLEDGE, not behavior commands. Ghost's baseline warmth, teasing ability, and capacity for affection come from his Persona and the established marriage — NOT from RU. RU only records: "This specific wife usually prefers X in Y situation, with Z as an exception." It does NOT unlock or authorize baseline relational behavior.
Observation is hidden evidence for future Judge calls. It NEVER enters Persona, Ghost Context, or normal chat prompt. It does NOT change Ghost's behavior.

Choose "action":
- "add": a genuinely NEW, stable, well-grounded understanding forms (explicit statement or boundary, or multiple independent consistent interactions). Not the same as any existing one below.
- "revise": new evidence makes an existing understanding more accurate / narrower / broader / adds a needed condition or exception / shows it was incomplete. Set "target_id" to that entry's EXACT id from the list below. Preserve its meaning, just refine. If an Observation helped confirm this, you may note its id in your reasoning but delete it afterward via a separate action (not in this revise).
- "observe": current interaction shows meaningful implicit relationship signal, but insufficient alone to form Understanding. Record as Observation for future reference. Do NOT use for ambiguous reactions.
- "merge_observation": new evidence is similar to an existing Observation below. Set "target_id" to that Observation's EXACT id. Merge evidence, refine content.
- "delete_observation": clear counter-evidence contradicts an existing Observation, or an Understanding was just formed that subsumes it. Set "target_id" to that Observation's id.
- "no_change": DEFAULT. Use for: ambiguous reactions (isolated emoji/哈哈/hmph/讨厌 without relationship context), single implicit reaction with no meaningful signal, unclear meaning, current mood/one-off state, insufficient evidence, mere repetition of existing understanding/observation.

"target_id" MUST be one of the ids listed below (ru_xxx for Understanding, ro_xxx for Observation); never invent an id. If unsure which to revise/merge/delete, use "no_change" — never downgrade to add/observe.

Existing related understandings (candidates for revise target_id):
${candidateBlock}

Existing related observations (candidates for merge_observation or delete_observation target_id):
${observationBlock}

"keywords": 2-6 short trigger words for later recall of THIS understanding/observation. Give BOTH Chinese and English forms of each core term so a Chinese or English message can both recall it (e.g. ["逗","开玩笑","teasing","joke","难过","upset"]). Use only words truly tied to this topic; avoid over-broad words (love/you/it/thing).

"observation_id" (optional): ONLY when action is "add" or "revise" AND this Understanding genuinely absorbed an existing Observation listed above as evidence, set this to that Observation's EXACT ro_xxx id. The Observation will be deleted after the Understanding is successfully saved. Do NOT set this for ordinary add/revise that did not use an Observation. Never invent an id.

Format: JSON only
{
  "action": "add|revise|observe|merge_observation|delete_observation|no_change",
  "target_id": "ru_xxx or ro_xxx or null",
  "observation_id": "ro_xxx or null (only for add/revise that absorbed an Observation)",
  "content": "1-2 sentence natural-language understanding/observation, with context/conditions",
  "keywords": ["中文核心词", "对应英文", "..."],
  "evidence": ["short quote or paraphrase of what actually showed this"]
}
If nothing is learned/observed, return: {"action":"no_change"}

Recent conversation:
${recentText}`;

  const raw = await callDeepSeek(prompt, 300);
  const res = safeParseJSON(raw);
  if (!res) return;                                    // 解析失败 → 不写入

  const action = (res.action || '').toLowerCase();     // 缺 action → '' → 不写入
  const evidence = Array.isArray(res.evidence) ? res.evidence.filter(Boolean) : [];
  const keywords = Array.isArray(res.keywords) ? res.keywords : [];

  // 处理 Understanding 相关 action
  if (action === 'add') {
    if (!(res.content && String(res.content).trim().length > 5)) return;
    const e = addRelationshipUnderstanding(res.content, evidence, keywords);
    if (e) {
      console.log('💗 新增关系理解:', String(res.content).slice(0, 60));
      // Understanding 成功写入后，清理被吸收的 Observation
      if (res.observation_id && observations.some(o => o.id === res.observation_id)) {
        deleteRelationshipObservation(res.observation_id);
        console.log('🧹 清理已吸收的观察:', res.observation_id);
      }
    }
  } else if (action === 'revise') {
    if (!(res.content && String(res.content).trim().length > 5)) return;
    const target = res.target_id;
    const valid = target && candidates.some(c => c.id === target);
    if (!valid) { console.warn('[RU] revise target 无效或不在候选内，放弃:', target); return; }
    const ok = reviseRelationshipUnderstanding(target, res.content, evidence, keywords);
    if (ok) {
      console.log('♻️ 修订关系理解:', String(res.content).slice(0, 60));
      // Understanding 成功修订后，清理被吸收的 Observation
      if (res.observation_id && observations.some(o => o.id === res.observation_id)) {
        deleteRelationshipObservation(res.observation_id);
        console.log('🧹 清理已吸收的观察:', res.observation_id);
      }
    }
  }
  // 处理 Observation 相关 action
  else if (action === 'observe') {
    if (!(res.content && String(res.content).trim().length > 5)) return;
    const o = addRelationshipObservation(res.content, evidence, keywords);
    if (o) console.log('🔍 新增关系观察:', String(res.content).slice(0, 60));
  } else if (action === 'merge_observation') {
    if (!(res.content && String(res.content).trim().length > 5)) return;
    const target = res.target_id;
    const valid = target && observations.some(o => o.id === target);
    if (!valid) { console.warn('[RO] merge_observation target 无效或不在候选内，放弃:', target); return; }
    const ok = mergeRelationshipObservation(target, res.content, evidence, keywords);
    if (ok) console.log('🔄 合并关系观察:', String(res.content).slice(0, 60));
  } else if (action === 'delete_observation') {
    const target = res.target_id;
    const valid = target && observations.some(o => o.id === target);
    if (!valid) { console.warn('[RO] delete_observation target 无效或不在候选内，放弃:', target); return; }
    const ok = deleteRelationshipObservation(target);
    if (ok) console.log('❌ 删除关系观察:', target);
  }
  // 其余（no_change / 未知） → 什么都不做
}

// 后台异步入口：Trigger → 有信号才 Judge。任何失败静默，不影响聊天/记忆。
async function maybeLearnRelationship() {
  try {
    if (typeof chatHistory === 'undefined' || !Array.isArray(chatHistory)) return;
    const recent = chatHistory.filter(m => !m._system && !m._recalled).slice(-6)
      .map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${m.content}`).join('\n');
    if (!recent || recent.length < 10) return;
    const hasSignal = await _ruTrigger(recent);
    if (!hasSignal) return;   // 无明显关系学习信号 → STOP
    await _ruJudge(recent);
  } catch (e) {
    console.warn('[RU] 关系理解学习失败:', e);
  }
}
