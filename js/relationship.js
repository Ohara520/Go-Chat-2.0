// ===================================================
// relationship.js — Relationship Understanding V1
// 独立系统：不是「发生过什么」(Long-Term Memory 管事实/经历)，
// 而是「Ghost 在长期相处中，真正逐渐了解了她什么」——带语境和条件的关系认知。
// 与 Long-Term Memory / WorldBook / Expression Openness 完全独立，互不替代。
// 数据：localStorage['relationshipUnderstandings'] = 条目数组
//   { id, content, createdAt, updatedAt, evidence:[] }
// 流程：回复后异步入口 → Trigger(轻量判信号) → 无信号STOP / 有信号 → Judge(add/revise/no_change)
// 注入：persona.js dynamic recall 区，只给 Ghost 最终 Understanding，不暴露算法。
// 原则：后台在学习，Ghost 在生活。Understanding 是知识，不是行为命令。
// ===================================================

const RU_MAX = 30;

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
// 读当前对话片段 + 少量相关旧 Understanding(≤5)，输出 add/revise/no_change。
async function _ruJudge(recentText) {
  const candidates = _ruSelectRelevant(recentText, 5);
  const candidateBlock = candidates.length
    ? candidates.map(c => `  - id=${c.id} | ${c.content}`).join('\n')
    : '  (none)';

  const prompt = `You maintain what Ghost (the husband) has genuinely come to UNDERSTAND about his wife over long-term interaction — durable, contextual relational knowledge, NOT an event log.

Write "content" in natural first-person English from Ghost's POV about her ("She ... my ..."), 1-2 sentences, WITH the context/conditions the relationship actually taught. Never a checklist, never "teasing=true".
Good: "She normally enjoys my dry teasing and gives it back, but when she's genuinely upset she wants me to take her seriously rather than joke through it."
Bad: "She likes teasing."

EVIDENCE RULES (already settled, follow strictly):
- Explicit relational statement → one clear line is strong evidence ("I love when you talk to me like this").
- Explicit boundary → one clear line MUST be taken seriously, no repetition required ("Don't joke about that again. It actually bothers me").
- Repeated natural pattern → can form understanding, but repetition alone ≠ stable preference; it must hold across different situations.
- Single implicit reaction → usually do NOT learn; leave it in context.
- Ambiguous reaction → do NOT learn, do NOT guess.
HARD RULE: Generalize ONLY as far as the relationship has actually taught you. Do not widen scope beyond the evidence.
Read meaning in context (tone, whether she keeps engaging, whether she explicitly asked to stop, existing understanding). Isolated words / emoji / silence / short replies have NO fixed positive-or-negative meaning.

Choose "action":
- "add": a genuinely NEW, stable, well-grounded understanding forms, not the same as any existing one below.
- "revise": new evidence makes an existing understanding more accurate / narrower / broader / adds a needed condition or exception / shows it was incomplete. Set "target_id" to that entry's EXACT id from the list below. Preserve its meaning, just refine.
- "no_change": DEFAULT. Use it for a single implicit reaction, unclear meaning, a current mood/one-off state, insufficient evidence, mere repetition of an existing understanding, or when you can't tell if it's a stable relational truth.

"target_id" MUST be one of the ids listed below; never invent an id. If unsure which to revise, use "no_change" — never downgrade to add.

Existing related understandings (candidates for target_id):
${candidateBlock}

"keywords": 2-6 short trigger words for later recall of THIS understanding. Give BOTH Chinese and English forms of each core term so a Chinese or English message can both recall it (e.g. the teasing example → ["逗","开玩笑","teasing","joke","难过","upset"]). Use only words truly tied to this understanding's topic; avoid over-broad words (love/you/it/thing).

Format: JSON only
{
  "action": "add|revise|no_change",
  "target_id": "ru_xxx or null",
  "content": "1-2 sentence natural-language understanding, with context/conditions",
  "keywords": ["中文核心词", "对应英文", "..."],
  "evidence": ["short quote or paraphrase of what actually showed this"]
}
If nothing stable is learned, return: {"action":"no_change"}

Recent conversation:
${recentText}`;

  const raw = await callDeepSeek(prompt, 300);
  const res = safeParseJSON(raw);
  if (!res) return;                                    // 解析失败 → 不写入

  const action = (res.action || '').toLowerCase();     // 缺 action → '' → 不写入
  if (!(res.content && String(res.content).trim().length > 5)) return;
  const evidence = Array.isArray(res.evidence) ? res.evidence.filter(Boolean) : [];
  const keywords = Array.isArray(res.keywords) ? res.keywords : [];

  if (action === 'revise') {
    const target = res.target_id;
    const valid = target && candidates.some(c => c.id === target);
    if (!valid) { console.warn('[RU] revise target 无效或不在候选内，放弃:', target); return; }  // 无效 target 不降级 ADD
    const ok = reviseRelationshipUnderstanding(target, res.content, evidence, keywords);
    if (ok) console.log('♻️ 修订关系理解:', String(res.content).slice(0, 60));
  } else if (action === 'add') {
    // 只有明确 add 才新增；no_change / 未知 action / 格式异常一律不写入（fail-closed）
    const e = addRelationshipUnderstanding(res.content, evidence, keywords);
    if (e) console.log('💗 新增关系理解:', String(res.content).slice(0, 60));
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
