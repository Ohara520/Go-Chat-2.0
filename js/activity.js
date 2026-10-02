// ============================================================
// activity.js — 用户现实事实层（Reality Cleanup V1）
//
// 这个文件现在管什么（只管用户侧的真实事实）：
//   1. User Activity Fact（用户活动事实）
//      = 用户自己明确告诉 Simon 她去做什么（"我去洗澡/我要工作了/我去睡了"）。
//        从消息里识别关键词，带时间戳存下来。
//   2. User Silence Fact（用户沉默事实）
//      = 距离用户上一条真实消息过去了多久。
//   3. getActivityStatus() 纯计算：active / probably_finished / expired
//
// 核心原则：
//   这些都只是"事实"。它们不决定 Simon 应该有什么情绪、
//   也不替 Simon 决定该怎么回应。系统只报事实，演法交给模型。
//
// 这个文件不管什么：
//   - 不替 Simon 随机决定他正在干嘛（旧 Ghost 随机活动调度已移除，见下）。
//   - 不解释她的沉默意味着什么（生没生气/睡没睡着/该不该想她）。
//   - 不写"这个点只能说什么/不能说什么"的时间行为剧本。
//
// 什么 Bug 来这里找：
//   - 她明确说过"我去洗澡"却没被记住 → classifyUserActivity / saveUserActivity
//   - 沉默时长算错 → noteUserReturn / getUserSilenceHint
//   - 系统又开始替 Simon 编造"他正在睡觉/训练" → 说明旧随机调度被谁加回来了
//
// 依赖：无（旧 profile.js 的 getGhostStatesByTime 依赖已随随机调度移除）
// 被用于：persona.js（注入 prompt）、sendMessage.js（识别用户活动 / 记沉默）
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
// 旧 Ghost 随机活动调度已移除（Reality Cleanup V1）：
// 系统不再替 Simon 随机决定他正在做什么（睡觉/训练/值勤/吃饭…）。
// 原 getGhostActivity() / getGhostActivityState() 会从时段池里抽一个状态，
// 再把它当成事实告诉模型——那是行为导演，不是现实事实，已删除。
// Simon 现在在干嘛，交给模型根据人设 + 真实时间 + 当前对话自己判断。
// ─────────────────────────────────────────

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

// User Activity Fact（用户活动事实）给 persona.js 用。
// 只报两件真实的事：① 她自己说过要去做什么 ② 那是多久以前说的。
// 不替她断定她"现在还在不在做"——那是推测，不是事实，交给模型自己判断。
// expired 的活动直接不提（隔了太久，连"她说过"都已不再是本轮相关事实）。
function getUserActivityHint() {
  let obj = null;
  try { obj = JSON.parse(localStorage.getItem('userActivity') || 'null'); } catch(e) { obj = null; }
  if (!obj) return '';
  const st = getActivityStatus(obj, Date.now());
  if (!st || st.status === 'expired') return '';

  const ago = _humanElapsed(st.elapsedMs);
  // 纯事实：她说过的话 + 过了多久。不加"probably still/done"这类系统推测。
  return `She told you she's ${obj.label} (${ago}). That is what she said — not a confirmation of what she's doing right now. Don't contradict it; make nothing else of it.`;
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

// User Silence Fact（用户沉默事实）给 persona.js 用。
// 只报一件真实的事：距离她上一条消息过了多久。
// 不解释这意味着什么（生没生气/睡没睡着），也不建议 Simon 该不该在意、该怎么回。
// 她明确说过去干嘛（去上班等）→ activity fact 已覆盖这段时间流逝，这里不重复。
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

  // 纯事实：隔了多久 + 她没说去哪。不给情绪解读，不给行为建议。
  return `Her last message was ${phrase} ago; she didn't say where she'd been. That's the only fact here — what it means, and whether to say anything about it, is yours to read.`;
}

if (typeof window !== 'undefined') {
  window.getActivityStatus = getActivityStatus;
  window.classifyUserActivity = classifyUserActivity;
  window.saveUserActivity = saveUserActivity;
  window.trackUserActivityFromMessage = trackUserActivityFromMessage;
  window.getUserActivityHint = getUserActivityHint;
  window.noteUserReturn = noteUserReturn;
  window.getUserSilenceHint = getUserSilenceHint;
}
