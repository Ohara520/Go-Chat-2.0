// ===================================================
// state.js — 状态管理系统 v2
// 包含：relationship facts / memory / attachment /
//       relationship flags / continuity / cold war migration /
//       expression buckets / pattern detection
// 依赖：touchLocalState (cloud.js)
// ===================================================


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 辅助
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getTodayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _touch() {
  if (typeof touchLocalState === 'function') touchLocalState();
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 表达分类
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EXPRESSION_BUCKETS = {
  sweet: [
    '爱你','想你','亲亲','么么','love you','miss you'
  ],
  nickname: [
    '老公','宝宝','宝贝','hubby','babe','baby','honey','darling','亲爱的'
  ],
  negative: [
    '滚','烦','讨厌','生气','不理你','随便','无所谓',
    '你必须','你给我','不然','否则','逼你','命令你'
  ],
};

function classifyExpression(text) {
  const input = (text || '').toLowerCase();
  const isSweet    = EXPRESSION_BUCKETS.sweet.some(w => input.includes(w));
  const isNickname = EXPRESSION_BUCKETS.nickname.some(w => input.includes(w));
  const isNegative = EXPRESSION_BUCKETS.negative.some(w => input.includes(w));
  return {
    isSweet,
    isNickname,
    isNegative,
    hasAffectionExpression: isSweet || isNickname
  };
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 表达桶冷却系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getBucketHistory(bucketName) {
  try {
    return JSON.parse(sessionStorage.getItem('exprBucket_' + bucketName) || '[]');
  } catch(e) { return []; }
}

function setBucketHistory(bucketName, history) {
  sessionStorage.setItem('exprBucket_' + bucketName, JSON.stringify(history));
}

function getRecentBucketHistory(bucketName, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  return getBucketHistory(bucketName).filter(t => now - t < windowMs);
}

function recordBucketHit(bucketName, windowMs = 60 * 60 * 1000) {
  const now     = Date.now();
  const history = getRecentBucketHistory(bucketName, windowMs);
  history.push(now);
  setBucketHistory(bucketName, history);
  return history.length;
}

function previewBucketCount(bucketName, windowMs = 60 * 60 * 1000) {
  return getRecentBucketHistory(bucketName, windowMs).length + 1;
}

function previewAffectionGain(bucketName) {
  const count = previewBucketCount(bucketName, 60 * 60 * 1000);
  if (count === 1) return 1;
  if (count <= 3)  return 0.2;
  return 0;
}

function isPatternDetected(bucketName) {
  return getRecentBucketHistory(bucketName, 15 * 60 * 1000).length >= 3;
}

function clearBucket(bucketName) {
  sessionStorage.removeItem('exprBucket_' + bucketName);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 心情系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 3G-8B: Simon Mood Core 已删除。
// getMoodLevel / setMoodLevel / changeMood / initMood 不再存在。
// 状态栏情绪 Emoji 已整体退休：Simon 的状态通过语言/行为/连续生活体现，
// 不再由系统在 UI 贴 NPC 情绪标签。
function refreshStatusEmoji() { /* retired: no longer computes or shows mood emoji */ }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 记忆系统：短期记忆与长期记忆
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 更新短期记忆（提取最近对话的未完成上下文）
 */
async function updateShortTermMemory(reply, text) {
  try {
    if (!reply || reply.length < 3) return;
    const recent = chatHistory.filter(m => !m._system && !m._recalled).slice(-5)
      .map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${m.content.slice(0, 150)}`).join('\n');
    const prompt = `Extract key context from recent conversation (unfinished topics, emotional state, pending questions). Keep under 100 words.\n\n${recent}`;
    const shortMem = await callHaiku('You extract conversation context.', [{ role: 'user', content: prompt }], 150);
    if (shortMem && shortMem.length > 10) {
      localStorage.setItem('shortTermMemory', shortMem.trim());
    }
  } catch (e) {
    console.warn('Short-term memory update failed:', e);
  }
}

/**
 * 更新长期记忆（提取重要信息：里程碑、秘密、偏好、事件）
 */
async function updateLongTermMemory(reply, text) {
  try {
    const recentMessages = chatHistory.filter(m => !m._system && !m._recalled).slice(-6);
    const conversationText = recentMessages
      .map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${m.content}`)
      .join('\n');

    // Memory V2：给 DeepSeek 少量与当前对话最相关的旧 Memory（最多 5 条），
    // 让它判断这次内容是「全新的(add)」还是「在修正/完善已记住的某条(update)」。
    const candidates = selectRelevantMemoriesForExtraction(conversationText, 5);
    const candidateBlock = candidates.length
      ? candidates.map(c => `  - id=${c.id} | tags=[${(c.tags || []).join(', ')}] | ${c.content}`).join('\n')
      : '  (none)';

    const prompt = `Extract ONE important long-term memory from this conversation, ONLY if something is genuinely worth remembering long-term.
Focus on:
- Personal details she shared (preferences, fears, dreams, past events)
- Relationship milestones (first time saying something important, breakthroughs)
- Recurring patterns (what she always does, what matters to her)

CRITICAL rules for "content":
- Write it in 简体中文 (Simplified Chinese), 1-2 short sentences.
- 人称固定: 用「她」指代用户（老婆），用「我」指代 Ghost 自己。绝对不要用「he」或「他」来指 Ghost，也不要写「me」。
- 只记真实说过的话，绝对不许编造、补全、脑补。如果某个细节（金额、方式、结局、承诺）对话里没出现，就一个字都不要写。比如她只是开玩笑说"学我说话要付版权费"，就不要脑补成"用亲亲付版权费"——"亲亲"没人说过。宁可记得少、记得糙，也不能加戏。
- 要具体，不要抽象。记住实际发生的事、原话、具体的名字/地点/数字，而不是"她今天心情不好"这类空泛总结。宁可原样保留她说的关键词。
- Preserve EXACT relationships and facts. 她说奶奶就不要写成妈妈；说了具体名字/地点/数字就一字不差保留。Never generalize or guess a relationship.
- "tags" 是用于以后「关键词字面检索」这条记忆的召回词，不是文章翻译。规则：
  · 挑 2-4 个这条记忆里真正的核心词（人、地点、东西、话题），必须是对话里真实出现过 / 真实指代的东西，绝不脑补（比如没人提过的"kisses"就不许放）。
  · 每个核心词尽量同时给「中文」和「对应英文」两种写法，方便用户之后用中文或英文都能召回同一条记忆。例：核心是"黑色大肥猫的故事"→ ["黑色大肥猫","黑猫","故事","black fat cat","black cat","story"]。若某词本来就是英文原词（如人名 Ghost、地名），中英一致时给一个即可。
  · 只要高信息量的词。绝对不要放 a / I / it / me / you / go / thing / love 这种过于宽泛或过短的英文词——它们会导致大量误召回。
  · 总量控制在 6 个以内，宁可少而准。
- Only extract if it matters beyond this moment. Small talk, greetings, and passing remarks are NOT memories — for those use action "none".

You are also given a few EXISTING long-term memories that may be related to this conversation.
Decide an "action":
- "add": the content forms a genuinely NEW long-term memory, not the same as any existing one below.
- "update": the new info clearly CORRECTS, REPLACES, or makes MORE ACCURATE/COMPLETE one of the existing memories below. Set "update_target" to that memory's exact id. 例：旧「她喜欢喝咖啡」+ 新对话「我现在不喝咖啡了，一喝就难受」→ update 成「她不喝咖啡」，不要再 add。又例：旧「她喜欢我逗她」+ 明确「但真正难过时不喜欢被开玩笑」→ update 成带条件的更准确版本，不要保留两条互相矛盾的记忆。
- "none": nothing worth saving long-term; OR essentially the same as an existing memory; OR just a current mood/state; OR too vague; OR you cannot confirm which existing memory it corrects; OR mere repetition with no new meaning. 默认宁可 none，不要为了触发而硬造记忆。

"update_target" MUST be one of the existing memory ids listed below. 绝不要编造不存在的 id。若拿不准是在修正哪条，用 "none"，不要乱填 id、也不要降级成 add。

Existing related memories (candidates for update_target):
${candidateBlock}

Format: JSON only
{
  "action": "add|update|none",
  "update_target": "mem_xxx or null",
  "type": "milestone|secret|preference|event",
  "content": "1-2句简体中文记忆，忠实于她实际说的话，人称遵守上面规则",
  "importance": 1-10,
  "tags": ["中文核心词", "对应英文", "..."]
}

If nothing important, return: {"action":"none"}

Recent conversation:
${conversationText}`;

    const raw = await callDeepSeek(prompt, 300);
    const memory = safeParseJSON(raw);
    if (!memory) return;

    // 兼容旧输出：缺 action 时按 add（保持旧行为）
    const action = (memory.action || 'add').toLowerCase();

    if (action === 'none') return; // 安静结束：不存、不建 wb、不改旧 Memory、不动 recall

    // 重要性门槛：DeepSeek 给的 importance 低于 4 的当作日常闲聊，不入库
    // （缺失 importance 时按 5 处理，保持旧行为不误杀）
    const imp = typeof memory.importance === 'number' ? memory.importance : 5;
    if (!(memory.content && memory.content.length > 5 && imp >= 4)) return;

    if (action === 'update') {
      // update_target 必须命中本次提供的候选 id；否则不降级成 add，直接放弃
      const target = memory.update_target;
      const validTarget = target && candidates.some(c => c.id === target);
      if (!validTarget) {
        console.warn('[memV2] update_target 无效或不在候选内，放弃本次更新:', target);
        return;
      }
      updateLongTermMemoryEntry(target, memory);
    } else {
      // add 及任何未知 action → 走原有新增流程（新 id / 门槛 / sort / top50 / survived / 建 wb）
      saveLongTermMemoryEntry(memory);
    }
  } catch (e) {
    console.error('长期记忆提取失败:', e);
  }
}

/**
 * 从现有 longTermMemories 里挑最多 limit 条与本次对话最相关的旧 Memory，
 * 复用 tags / content 字面匹配思路（不改 recall 本身），仅用于给 DeepSeek 做 add/update 判断。
 */
function selectRelevantMemoriesForExtraction(conversationText, limit = 5) {
  let memories;
  try { memories = JSON.parse(localStorage.getItem('longTermMemories') || '[]'); } catch (e) { memories = []; }
  if (!Array.isArray(memories) || memories.length === 0) return [];
  const text = (conversationText || '').toLowerCase();
  if (!text) return [];

  const scored = memories.map(m => {
    let score = 0;
    if (Array.isArray(m.tags)) {
      m.tags.forEach(tag => { if (tag && text.includes(String(tag).toLowerCase())) score += 5; });
    }
    (m.content || '').toLowerCase().split(/\s+/).forEach(w => {
      if (w.length > 3 && text.includes(w)) score += 2;
    });
    return { m, score };
  });
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => ({ id: s.m.id, content: s.m.content, tags: s.m.tags || [] }));
}

/**
 * Memory V2 UPDATE：原地更新一条已有 Memory，保留 id / timestamp / wbId / lastRecalled，
 * 更新 content / type / importance / tags，并写 updatedAt。不新建 Memory。
 * 更新成功后同步对应 auto WorldBook（若关联有效），绝不新建 wb。
 */
function updateLongTermMemoryEntry(memId, memory) {
  let memories;
  try { memories = JSON.parse(localStorage.getItem('longTermMemories') || '[]'); } catch (e) { memories = []; }
  if (!Array.isArray(memories)) return;
  const m = memories.find(x => x.id === memId);
  if (!m) { console.warn('[memV2] update 目标已不存在，放弃:', memId); return; }

  m.content = memory.content;
  m.type = memory.type || m.type || 'event';
  m.importance = typeof memory.importance === 'number' ? memory.importance : (m.importance || 5);
  if (Array.isArray(memory.tags)) m.tags = memory.tags;
  m.updatedAt = Date.now();
  // 保留 id / timestamp / wbId / lastRecalled 等其它字段不动

  memories.sort((a, b) => (b.importance || 0) - (a.importance || 0));
  localStorage.setItem('longTermMemories', JSON.stringify(memories.slice(0, 50)));
  console.log('♻️ 更新长期记忆:', String(m.content).slice(0, 50));

  // 同步已有 auto WorldBook（原地，不新建）；无 wbId 或关联无效则跳过，UPDATE 本身仍成功
  if (typeof syncAutoWorldBookForMemory === 'function') {
    try { syncAutoWorldBookForMemory(m); } catch (e) {}
  }
}

/**
 * 保存长期记忆到 localStorage
 */
function saveLongTermMemoryEntry(memory) {
  let memories;
  try { memories = JSON.parse(localStorage.getItem('longTermMemories') || '[]'); } catch(e) { memories = []; }
  if (!Array.isArray(memories)) memories = [];
  // 程序层只拦「规范化后完全相同」的 content（去空白+小写）。
  // 语义上的重复 / 补充 / 修正 / 条件变化交给 DeepSeek 的 add/update/none 判断。
  const _norm = s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, '');
  const nc = _norm(memory.content);
  const isDuplicate = memories.some(m => _norm(m.content) === nc);
  if (isDuplicate) return;

  const newMemory = {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    type: memory.type || 'event',
    content: memory.content,
    importance: memory.importance || 5,
    timestamp: Date.now(),
    lastRecalled: 0,
    tags: memory.tags || []
  };

  memories.push(newMemory);
  memories.sort((a, b) => b.importance - a.importance);
  const trimmed = memories.slice(0, 50);
  localStorage.setItem('longTermMemories', JSON.stringify(trimmed));
  console.log('💾 保存长期记忆:', newMemory.content.slice(0, 50));

  // 同步进世界书：用 tags 作触发词，让 AI 抽到的记忆也能被关键词检索到
  // 建 auto WorldBook 前先确认这条 Memory 没被 top50 淘汰，否则不建、不关联、不补救
  // （避免 wb.memId 指向一个已不存在的 Memory）
  const survived = trimmed.some(m => m.id === newMemory.id);
  if (survived && typeof addWorldBookEntry === 'function' && Array.isArray(newMemory.tags) && newMemory.tags.length) {
    try {
      const wbEntry = addWorldBookEntry({ keywords: newMemory.tags, content: newMemory.content, source: 'auto' });
      // wb 真正创建成功（非 null，非去重/无关键词）才建立双向关联
      if (wbEntry && wbEntry.id) linkMemoryAndWorldBook(newMemory.id, wbEntry.id);
    } catch (e) {}
  }
}

/**
 * 建立 Long-Term Memory ↔ auto WorldBook 的双向关联。
 * 各自独立读写：一侧失败不拖累另一侧，均不影响已保存的 Memory 本体。
 */
function linkMemoryAndWorldBook(memId, wbId) {
  // 写 Memory.wbId
  try {
    const mems = JSON.parse(localStorage.getItem('longTermMemories') || '[]');
    const m = Array.isArray(mems) ? mems.find(x => x.id === memId) : null;
    if (m) { m.wbId = wbId; localStorage.setItem('longTermMemories', JSON.stringify(mems)); }
  } catch (e) {}
  // 写 WorldBook.memId（独立 try：一侧失败不拖累另一侧）
  try {
    const wb = JSON.parse(localStorage.getItem('worldBook') || '[]');
    const w = Array.isArray(wb) ? wb.find(x => x.id === wbId) : null;
    if (w) { w.memId = memId; localStorage.setItem('worldBook', JSON.stringify(wb)); }
  } catch (e) {}
}

/**
 * 按 id 删除一条 Long-Term Memory。返回是否真的删到。
 * 用于 auto WorldBook 删除时联动删除对应 Memory；不跑提炼、不动其它字段。
 */
function removeLongTermMemoryById(memId) {
  try {
    const mems = JSON.parse(localStorage.getItem('longTermMemories') || '[]');
    if (!Array.isArray(mems)) return false;
    const next = mems.filter(m => m.id !== memId);
    if (next.length === mems.length) return false;
    localStorage.setItem('longTermMemories', JSON.stringify(next));
    return true;
  } catch (e) { return false; }
}

/**
 * 同步更新一条 Long-Term Memory 的 content（保留 id / importance / tags / 时间等一切其它字段）。
 * 用于编辑 auto WorldBook 时把新 content 回写对应 Memory；不新建、不跑 DeepSeek。
 */
function updateLongTermMemoryContent(memId, content) {
  try {
    const mems = JSON.parse(localStorage.getItem('longTermMemories') || '[]');
    if (!Array.isArray(mems)) return false;
    const m = mems.find(x => x.id === memId);
    if (!m) return false;
    m.content = content;
    localStorage.setItem('longTermMemories', JSON.stringify(mems));
    return true;
  } catch (e) { return false; }
}

/**
 * 检索相关长期记忆（在构建 system prompt 时调用）
 * @param {string} userMessage 用户最新消息
 * @param {number} limit 返回记忆数量，默认3条
 * @returns {string} 格式化的记忆文本
 */
function recallLongTermMemory(userMessage, limit = 3) {
  let memories;
  try { memories = JSON.parse(localStorage.getItem('longTermMemories') || '[]'); } catch(e) { memories = []; }
  if (!Array.isArray(memories) || memories.length === 0) return '';

  const userLower = userMessage.toLowerCase();

  // 停用联动：对应 auto WorldBook.enabled===false 的 Memory 不参与召回。
  // 只影响绑定了 auto WorldBook 的 Memory；未绑定 / manual 一律不受影响。
  const mutedMemIds = new Set();
  try {
    const wb = JSON.parse(localStorage.getItem('worldBook') || '[]');
    if (Array.isArray(wb)) {
      wb.forEach(w => {
        if (w && w.source === 'auto' && w.enabled === false && w.memId != null) mutedMemIds.add(w.memId);
      });
    }
  } catch (e) {}
  const candidates = mutedMemIds.size ? memories.filter(m => !mutedMemIds.has(m.id)) : memories;
  if (candidates.length === 0) return '';

  // 计算相关性分数
  const scored = candidates.map(m => {
    let score = 0;

    // 标签匹配（tags 可能缺失或非数组，加守卫防止 forEach 抛错）
    if (Array.isArray(m.tags)) {
      m.tags.forEach(tag => {
        if (tag && userLower.includes(tag.toLowerCase())) score += 5;
      });
    }

    // 内容关键词匹配
    const keywords = (m.content || '').toLowerCase().split(/\s+/);
    keywords.forEach(word => {
      if (word.length > 3 && userLower.includes(word)) score += 2;
    });

    // 重要性权重
    score += m.importance;

    // 时间衰减（越久远的记忆，权重略降）
    const daysPassed = (Date.now() - m.timestamp) / (1000 * 60 * 60 * 24);
    if (daysPassed > 7) score -= 1;
    if (daysPassed > 30) score -= 2;

    // 最近被调用过的记忆，降低优先级（避免重复）
    if (m.lastRecalled > 0) {
      const hoursSinceRecall = (Date.now() - m.lastRecalled) / (1000 * 60 * 60);
      if (hoursSinceRecall < 24) score -= 3;
    }

    return { ...m, score };
  });

  // 排序并取top N
  scored.sort((a, b) => b.score - a.score);
  const relevant = scored.slice(0, limit).filter(m => m.score > 0);

  if (relevant.length === 0) return '';

  // 更新最后调用时间
  relevant.forEach(m => {
    const idx = memories.findIndex(mem => mem.id === m.id);
    if (idx !== -1) {
      memories[idx].lastRecalled = Date.now();
    }
  });
  localStorage.setItem('longTermMemories', JSON.stringify(memories));

  // 格式化返回
  const formatted = relevant.map(m => `- ${m.content}`).join('\n');
  return `\n[LONG-TERM MEMORY]\nThings you remember about her:\n${formatted}\n`;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Attachment Pull
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getAttachmentPull() {
  return parseInt(localStorage.getItem('attachmentPull') || '45');
}

function setAttachmentPull(val) {
  localStorage.setItem('attachmentPull', Math.max(0, Math.min(100, Math.round(val))));
  _touch();
}

function changeAttachmentPull(delta) {
  setAttachmentPull(getAttachmentPull() + delta);
}




// Legacy Trust/Affection/Love Permission/Resistance numeric director systems retired.
// relationshipFlags remains as a factual/business state container.

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 关系标记系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getRelationshipFlags() {
  try { return JSON.parse(localStorage.getItem('relationshipFlags') || '{}'); }
  catch(e) { return {}; }
}

function setRelationshipFlag(key, value = true) {
  const flags = getRelationshipFlags();
  flags[key] = value;
  localStorage.setItem('relationshipFlags', JSON.stringify(flags));
  _touch();
}

function hasRelationshipFlag(key) {
  return !!getRelationshipFlags()[key];
}

// 自检：reunionReady 为 true 但实际没有重逢剧情标记时，重置成 false。
// 重逢的真实凭据只有两个：metInPerson 已置位，或三件套已买齐。
function validateReunionFlag() {
  const flags = getRelationshipFlags();
  if (!flags.reunionReady) return;
  const metInPerson = localStorage.getItem('metInPerson') === 'true';
  let purchased = [];
  try { purchased = JSON.parse(localStorage.getItem('purchasedItems') || '[]'); } catch(e) {}
  const reunionItems = ['去曼城找他的机票','曼彻斯特酒店','英国旅行计划'];
  const setComplete = reunionItems.every(n => purchased.includes(n));
  if (!metInPerson && !setComplete) setRelationshipFlag('reunionReady', false);
}




// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Turn 计数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let _globalTurnCount = parseInt(localStorage.getItem('globalTurnCount') || '0');

function getGlobalTurnCount() {
  return _globalTurnCount;
}

function tickTurn() {
  _globalTurnCount++;
  localStorage.setItem('globalTurnCount', _globalTurnCount);
  _touch();
}

function getLastReversePackageTurn() {
  return parseInt(localStorage.getItem('lastReversePackageTurn') || '-99');
}

function setLastReversePackageTurn(turn) {
  localStorage.setItem('lastReversePackageTurn', turn);
  _touch();
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 反寄包裹状态
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getPendingReversePackages() {
  try { return JSON.parse(localStorage.getItem('pendingReversePackages') || '[]'); }
  catch(e) { return []; }
}

function savePendingReversePackages(arr, { markChanged = true } = {}) {
  localStorage.setItem('pendingReversePackages', JSON.stringify(arr));
  if (markChanged) _touch();
}

function resolvePendingReversePackages() {} // 兼容旧调用


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 统一状态层 — RETIRED 2026-10-04
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// getGhostResponseState() and buildUnifiedGhostStateBlock() removed.
// Money uses getGhostCardMonthlyLimit() directly.
// Delivery has no relationship gates.


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 冷战系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Phase 3H-1A: coldWarTimer removed (auto-lifecycle deleted).


// Phase 3H-1A: Auto-lifecycle removed. checkColdWarApologyCondition, ghostApologize, ghostSendMakeupMoney deleted.
// Phase 3H-3F: startColdWar / endColdWar / setColdWarCause / getColdWarCause removed. Replaced by unresolvedConflict fact system.


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pattern detection → Ghost语气提示
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getPatternHint(patternDetected) {
  if (!patternDetected) return '';
  return `[PATTERN]
She has been repeating sweet expressions.

You notice the pattern.

Your tone flattens.
You do not play along.

If you point it out, keep it to one dry line.`;
}


// Phase 3G-8B: updateMoodFromUserInput() 已删除（Simon Mood Core 完全退役）。


// Phase 3G-8B: buildMoodBlock() 已删除（Keegan 不启用）。


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 统一入口：每条用户消息后调用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function updateRelationshipStatsFromUserInput(userText) {
  // Trust/Affection progression is retired from the per-message path.
  // Saying sweet things, using nicknames, arguing, visiting daily, or returning after
  // time away no longer changes how much relationship Simon is allowed to have.

  // Keep only the factual routine counter used by legacy Story/continuity code.
  const input = (userText || '').toLowerCase();
  const routinePatterns = [
    /吃了吗|吃饭了吗|吃了没|ate yet|have you eaten|did you eat/,
    /晚安|good night|night\b|sleep well/,
    /早安|早上好|good morning|morning\b/,
    /在吗|你在吗|are you there|you there/,
    /红茶|tea\b|making tea|have tea/,
    /想你|miss you/,
  ];
  const matchedRoutine = routinePatterns.find(p => p.test(input));
  if (matchedRoutine) {
    const cnt = parseInt(localStorage.getItem('sharedRoutineCount') || '0');
    localStorage.setItem('sharedRoutineCount', cnt + 1);
  }

  return { patternDetected: false };
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 兼容别名
// sendMessage.js 调用 updateStateFromUserInput
// chat_init.js 调用 checkOfflinePenalty
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function updateStateFromUserInput(userText) {
  return updateRelationshipStatsFromUserInput(userText);
}

// checkOfflinePenalty 定义在 money.js，此处已移除重复定义


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 冷战业务逻辑
// startColdWar / endColdWar /
// checkColdWarApologyCondition /
// ghostApologize / ghostSendMakeupMoney
// Phase 3H-1A: Auto-lifecycle removed. checkColdWarApologyCondition, ghostApologize, ghostSendMakeupMoney deleted.
// Phase 3H-3F: startColdWar / endColdWar removed. Replaced by unresolvedConflict fact system.


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Unresolved Conflict Fact (Phase 3H-3E)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getUnresolvedConflict() {
  const flags = getRelationshipFlags();
  return flags.unresolvedConflict || null;
}

function setUnresolvedConflict(cause) {
  const flags = getRelationshipFlags();
  const existing = flags.unresolvedConflict;

  if (existing && typeof existing === 'object' && existing.startedAt) {
    flags.unresolvedConflict = {
      cause: cause || '',
      startedAt: existing.startedAt
    };
  } else {
    flags.unresolvedConflict = {
      cause: cause || '',
      startedAt: Date.now()
    };
  }

  localStorage.setItem('relationshipFlags', JSON.stringify(flags));
  _touch();
}

function resolveUnresolvedConflict() {
  const flags = getRelationshipFlags();
  delete flags.unresolvedConflict;
  localStorage.setItem('relationshipFlags', JSON.stringify(flags));
  _touch();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Legacy Cold War Migration (Phase 3H-3F)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function migrateColdWarToUnresolvedConflict() {
  const coldWarMode = localStorage.getItem('coldWarMode');
  if (coldWarMode !== 'true') return;

  const flags = getRelationshipFlags();
  if (flags.unresolvedConflict) return;

  const cause = localStorage.getItem('coldWarCause') || '';
  const startTs = parseInt(localStorage.getItem('coldWarStart') || '0');
  const startedAt = (startTs > 0) ? startTs : Date.now();

  flags.unresolvedConflict = { cause, startedAt };
  localStorage.setItem('relationshipFlags', JSON.stringify(flags));

  localStorage.removeItem('coldWarMode');
  localStorage.removeItem('coldWarCause');
  localStorage.removeItem('coldWarStart');
  localStorage.removeItem('coldWarStage');
  localStorage.removeItem('coldWarEndedAt');

  _touch();
}
