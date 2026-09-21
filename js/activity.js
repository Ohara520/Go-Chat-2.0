// ============================================================
// activity.js — 时序状态层（Phase 1 地基）
//
// 职责：
//   1. Ghost 连续活动状态（不再整个 session 冻结一个随机状态）
//   2. 用户活动状态（从消息里识别"去上班/去洗澡…"，带时间戳）
//   3. getActivityStatus() 纯计算：active / probably_finished / expired
//
// 存储的是"事实"（做了什么 + 何时开始 + 预计多久），
// "现在是什么状态"永远是现算的，不落库。
//
// 依赖：profile.js（getGhostStatesByTime）
// 被用于：persona.js（注入 prompt）、sendMessage.js（识别用户活动）
// ============================================================

// 各类活动的默认持续时间（ms）
const ACTIVITY_DURATIONS = {
  work:     8  * 60 * 60 * 1000,
  sleep:    8  * 60 * 60 * 1000,
  nap:      1.5 * 60 * 60 * 1000,
  shower:   45 * 60 * 1000,
  eating:   45 * 60 * 1000,
  cooking:  60 * 60 * 1000,
  errands:  2  * 60 * 60 * 1000,
  phone:    60 * 60 * 1000,
  exercise: 60 * 60 * 1000,
  commute:  60 * 60 * 1000,
  meeting:  60 * 60 * 1000,
};

// 关键词表 —— 顺序很重要，越具体的越靠前（nap 先于 sleep，commute 先于 work）
// activity: 归一化活动名；label: 给模型看的英文短语
const _ACTIVITY_SIGNALS = [
  { activity: 'nap',      label: 'having a nap',        re: /午睡|小睡|眯一会|眯一下|躺一会|躺一下|\bnap\b/i },
  { activity: 'sleep',    label: 'sleeping',            re: /睡觉|睡了|去睡|要睡|睡去|该睡|准备睡|晚安|\bsleep\b|going to bed|good ?night/i },
  { activity: 'shower',   label: 'in the shower',       re: /洗澡|冲澡|洗个澡|去洗|洗漱|\bshower\b|\bbath\b/i },
  { activity: 'cooking',  label: 'cooking',             re: /做饭|做菜|煮饭|下厨|做个饭|cook(ing)?|making (dinner|lunch|food)/i },
  { activity: 'eating',   label: 'eating',              re: /吃饭|吃个饭|去吃|吃午饭|吃晚饭|吃早饭|吃点|干饭|恰饭|eating|having (lunch|dinner|breakfast)|grab(bing)? (food|lunch|dinner)/i },
  { activity: 'commute',  label: 'commuting',           re: /上班路上|下班路上|通勤|在路上|路上呢|坐地铁|坐公交|开车去|commut(e|ing)|on (my|the) way|heading (to|home)|on the road/i },
  { activity: 'meeting',  label: 'in a meeting',        re: /开会|会议|开个会|meeting/i },
  { activity: 'exercise', label: 'working out',         re: /健身|锻炼|跑步|运动|撸铁|去健身|gym|work(ing)? ?out|running|jogging|exercis/i },
  { activity: 'work',     label: 'at work',             re: /上班|工作|去公司|开工|上工|干活|搬砖|加班|值班|\bwork(ing)?\b|at (the )?office|my shift|on shift/i },
  { activity: 'errands',  label: 'out running errands', re: /出门|出去|办事|逛街|买东西|购物|逛超市|去趟|出去一下|going out|head(ing)? out|errand|shopping|out for/i },
  { activity: 'phone',    label: 'scrolling on her phone', re: /刷手机|玩手机|刷会|刷视频|躺着刷|scrolling|on my phone|browsing/i },
];

// ─────────────────────────────────────────
// 纯计算：某个活动现在是什么状态
// 返回 { status, elapsedMs, remainingMs }
// status: 'active' | 'probably_finished' | 'expired'
// ─────────────────────────────────────────
function getActivityStatus(activityObj, now) {
  now = now || Date.now();
  if (!activityObj || !activityObj.startedAt || !activityObj.expectedDuration) return null;
  const elapsed = now - activityObj.startedAt;
  const dur = activityObj.expectedDuration;
  let status;
  if (elapsed < dur)            status = 'active';
  else if (elapsed < dur * 1.5) status = 'probably_finished';
  else                          status = 'expired';
  return { status, elapsedMs: elapsed, remainingMs: Math.max(0, dur - elapsed) };
}

// 把毫秒转成"about Xh / about Xmin ago"这种人话
function _humanElapsed(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `about ${Math.max(1, min)} min ago`;
  const hr = Math.round(min / 60);
  return `about ${hr}h ago`;
}

// ─────────────────────────────────────────
// Ghost 连续活动状态
// 未过期 → 继续用同一个；过期 → 按当前时段重抽，接着往下走
// 存 localStorage，跨刷新/跨时段存活，形成一条连续时间线
// ─────────────────────────────────────────
function getGhostActivity() {
  let obj = null;
  try { obj = JSON.parse(localStorage.getItem('ghostActivity') || 'null'); } catch(e) { obj = null; }

  const now = Date.now();
  const st = obj ? getActivityStatus(obj, now) : null;

  // 有且未过期（active 或 probably_finished）→ 继续用，不重抽，保证连续
  if (obj && st && st.status !== 'expired') return obj;

  // 没有 / 已过期 → 按当前时段抽一个新的，接上时间线
  const pool = (typeof getGhostStatesByTime === 'function')
    ? getGhostStatesByTime()
    : (typeof GHOST_STATES !== 'undefined' ? GHOST_STATES : []);
  if (!pool || !pool.length) return obj; // 池子都没有，只能沿用旧的

  let next = pool[Math.floor(Math.random() * pool.length)];
  // 尽量别和上一个撞
  if (obj && obj.activity === next && pool.length > 1) {
    next = pool[Math.floor(Math.random() * pool.length)];
  }
  // 每个状态自然持续 60~120 分钟，到点再换下一个
  const dur = (60 + Math.floor(Math.random() * 60)) * 60 * 1000;
  const fresh = { activity: next, startedAt: now, expectedDuration: dur, source: 'time_pool' };
  try { localStorage.setItem('ghostActivity', JSON.stringify(fresh)); } catch(e) {}
  return fresh;
}

// 给 persona.js 用：Ghost 当前状态的中文字符串（沿用旧 GHOST_STATES 池的措辞）
function getGhostActivityState() {
  const a = getGhostActivity();
  return a ? a.activity : '';
}

// ─────────────────────────────────────────
// 用户活动识别 + 保存
// 从一条用户消息里判断她是不是"要去做某事"
// 命中 → 覆盖当前活动，旧的存进 previousActivity
// ─────────────────────────────────────────
function classifyUserActivity(text) {
  if (!text) return null;
  for (const sig of _ACTIVITY_SIGNALS) {
    if (sig.re.test(text)) {
      return {
        activity: sig.activity,
        label: sig.label,
        expectedDuration: ACTIVITY_DURATIONS[sig.activity] || 60 * 60 * 1000,
      };
    }
  }
  return null;
}

function saveUserActivity(hit) {
  if (!hit) return;
  let prev = null;
  try { prev = JSON.parse(localStorage.getItem('userActivity') || 'null'); } catch(e) { prev = null; }

  const obj = {
    activity: hit.activity,
    label: hit.label,
    startedAt: Date.now(),
    expectedDuration: hit.expectedDuration,
    source: 'user_signal',
  };
  try {
    // 旧的主活动存进 previousActivity（给"吃完饭继续上班"这类连续状态留接口）
    if (prev && prev.activity !== obj.activity) {
      localStorage.setItem('previousActivity', JSON.stringify(prev));
    }
    localStorage.setItem('userActivity', JSON.stringify(obj));
  } catch(e) {}
  return obj;
}

// 从一条用户消息里识别活动并保存（sendMessage 每条消息调用）
function trackUserActivityFromMessage(text) {
  const hit = classifyUserActivity(text);
  if (hit) return saveUserActivity(hit);
  return null;
}

// 给 persona.js 用：拼出"她现在大概在干嘛"的英文提示，模型只管说话不算时间
// expired 的活动直接不提（她早该做完了，系统不再假设她还在做）
function getUserActivityHint() {
  let obj = null;
  try { obj = JSON.parse(localStorage.getItem('userActivity') || 'null'); } catch(e) { obj = null; }
  if (!obj) return '';
  const st = getActivityStatus(obj, Date.now());
  if (!st || st.status === 'expired') return '';

  const ago = _humanElapsed(st.elapsedMs);
  const tail = st.status === 'active'
    ? 'probably still doing that'
    : 'probably done by now';
  return `She said she's ${obj.label} — started ${ago}, ${tail}. (System inference from what she told you, not certainty — don't state it as fact, just don't contradict it.)`;
}

// ─────────────────────────────────────────
// 沉默间隔：她隔了很久没吭声、刚回来
// 不管她有没有说去干嘛，只看"距离上一条消息过了多久"
// 每条消息调一次 noteUserReturn()：先算出与上一条的间隔并暂存，再更新时间戳
// ─────────────────────────────────────────
function noteUserReturn() {
  const now = Date.now();
  let last = 0;
  try { last = parseInt(localStorage.getItem('lastUserMessageAt') || '0'); } catch(e) {}
  const gap = last ? now - last : 0;
  try {
    // 间隔 ≥ 4h → 记成"刚回来"，只对这一轮有效
    if (gap >= 4 * 3600 * 1000) {
      sessionStorage.setItem('justReturnedGapMs', String(gap));
      sessionStorage.setItem('justReturnedAt', String(now));
    } else {
      sessionStorage.removeItem('justReturnedGapMs');
      sessionStorage.removeItem('justReturnedAt');
    }
    localStorage.setItem('lastUserMessageAt', String(now));
  } catch(e) {}
}

// 给 persona.js 用：她刚从长时间沉默里回来的提示
// 她明确说过在干嘛（去上班等）→ activity hint 已解释时间流逝，这里不重复
function getUserSilenceHint() {
  if (typeof getUserActivityHint === 'function' && getUserActivityHint()) return '';

  let gap = 0, at = 0;
  try {
    gap = parseInt(sessionStorage.getItem('justReturnedGapMs') || '0');
    at  = parseInt(sessionStorage.getItem('justReturnedAt') || '0');
  } catch(e) {}
  if (!gap || !at) return '';
  // 只在"刚回来这一轮"有效（3分钟内），防主动消息/过期上下文误用
  if (Date.now() - at > 3 * 60 * 1000) return '';

  const hours = gap / 3600000;
  if (hours < 4) return '';

  let phrase;
  if (hours < 8)       phrase = `about ${Math.round(hours)} hours`;
  else if (hours < 20) phrase = `most of the day (~${Math.round(hours)}h)`;
  else if (hours < 48) phrase = `since yesterday`;
  else                 phrase = `a couple of days`;

  return `She went quiet for ${phrase} and just came back — she didn't say where she went. He noticed the gap. He does NOT interrogate her about it; he just registers it — a dry acknowledgement, mild curiosity, or picking back up with a slight edge, whatever fits his mood. (System inference from timing, not certainty — don't state the exact hours as fact.)`;
}

if (typeof window !== 'undefined') {
  window.getActivityStatus = getActivityStatus;
  window.getGhostActivity = getGhostActivity;
  window.getGhostActivityState = getGhostActivityState;
  window.classifyUserActivity = classifyUserActivity;
  window.saveUserActivity = saveUserActivity;
  window.trackUserActivityFromMessage = trackUserActivityFromMessage;
  window.getUserActivityHint = getUserActivityHint;
  window.noteUserReturn = noteUserReturn;
  window.getUserSilenceHint = getUserSilenceHint;
}
