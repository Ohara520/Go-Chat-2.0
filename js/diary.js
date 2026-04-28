// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Ghost 私人日记 — diary.js
// 每天生成一篇，用户可以"偷看"
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ===== 日记存储 =====

function getDiaryEntries() {
  try { return JSON.parse(localStorage.getItem('ghostDiary') || '[]'); } catch(e) { return []; }
}

function saveDiaryEntries(entries) {
  // 去重：同一天只保留第一篇
  const seen = new Set();
  const deduped = entries.filter(e => {
    if (seen.has(e.date)) return false;
    seen.add(e.date);
    return true;
  });
  // 最多保留30天
  const trimmed = deduped.slice(-30);
  localStorage.setItem('ghostDiary', JSON.stringify(trimmed));
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
}

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getYesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function hasYesterdayDiary() {
  const entries = getDiaryEntries();
  return entries.some(e => e.date === getYesterdayKey());
}

// ===== 日记生成 =====

let _diaryGenerating = false; // 防并发锁（运行时）

async function generateDiaryEntry() {
  if (hasYesterdayDiary()) return;
  if (_diaryGenerating) return;

  // 持久锁：防止页面刷新后重复生成
  const _lockKey = 'diaryLock_' + getYesterdayKey();
  if (localStorage.getItem(_lockKey)) return;
  localStorage.setItem(_lockKey, '1');
  _diaryGenerating = true;

  try {
    const location = localStorage.getItem('currentLocation') || 'Hereford Base';
    const locationReason = localStorage.getItem('currentLocationReason') || '';
    const weather = localStorage.getItem('lastWeatherDisplay') || '';
    const userName = localStorage.getItem('userName') || 'her';

    // 用 longTermMemory（已总结过的记忆），不用原始聊天记录
    // 原始记录问题：1.今天的聊天被写进昨天日记 2.Ghost的话被当成用户说的
    const memory = localStorage.getItem('longTermMemory') || '';
    const memoryHint = memory
      ? `What you remember about recent days with ${userName}:\n${memory.slice(-300)}`
      : '';

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayWeekday = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][yesterday.getDay()];

    const prompt = `You are Simon "Ghost" Riley writing in a worn notebook before bed. No one reads this.

Location: ${location}${locationReason ? ` (${locationReason})` : ''}
Weather: ${weather || 'unknown'}
Day: ${yesterdayWeekday}

${memoryHint ? memoryHint + '\n' : `Didn't talk to ${userName} yesterday.\n`}

Write yesterday's diary entry. Rules:
- 3-4 lines. Short sentences. Lowercase.
- Write like a soldier's notebook. No poetry. No metaphors.
- Include 1-2 things from YOUR day — training, food, teammates, something you saw.
- If something about ${userName} is in your memory, pick ONE thing that stuck. Not everything.
- DO NOT invent conversations. DO NOT quote things she said unless it is clearly in the memory above. If unsure, do not write it.
- DO NOT put your own words or thoughts in her mouth.
- Weather only if it affected your day.
- End with one honest thought — something private, blunt, not sentimental.
- English only. No timestamps. No "dear diary". No action descriptions.`;

    let entry = '';
    if (typeof callSonnetLight === 'function') {
      entry = await callSonnetLight(prompt, [{ role: 'user', content: 'write today\'s entry.' }], 100);
    } else if (typeof callSonnet === 'function') {
      entry = await callSonnet(prompt, [{ role: 'user', content: 'write today\'s entry.' }], 100);
    }

    // 破防检测：不存 AI 泄露内容
    if (entry && typeof isBreakout === 'function' && isBreakout(entry)) {
      console.warn('[diary] 破防内容，使用兜底');
      entry = '';
    }

    if (!entry || entry.length < 20) {
      entry = _getFallbackEntry(location, weather);
    }

    // 清理
    entry = entry
      .replace(/```[\s\S]*?```/g, '')
      .replace(/^["']|["']$/g, '')
      .replace(/\*[^*]+\*/g, '')
      .trim();

    if (entry) {
      // 再次检查防止并发写入
      if (hasYesterdayDiary()) return;
      const entries = getDiaryEntries();
      entries.push({
        date: getYesterdayKey(),
        location,
        weather: weather || '',
        content: entry,
      });
      saveDiaryEntries(entries);
    }
  } catch(e) {
    console.warn('[diary] 生成失败:', e);
    // 生成失败清除锁，下次可以重试
    localStorage.removeItem(_lockKey);
  } finally {
    _diaryGenerating = false;
  }
}

// 兜底静态日记
function _getFallbackEntry(location, weather) {
  const pool = [
    `slow day at ${location}. ${weather ? weather + '.' : ''} didn't do much. thought about calling her but didn't.`,
    `long one. training ran late. ${weather ? weather + ' outside.' : ''} sat in the mess for a bit after. didn't feel like talking.`,
    `${location}. same routine. ${weather ? weather + '.' : ''} she sent something earlier. read it twice before replying once.`,
    `nothing worth writing. ${weather ? weather + ' all day.' : ''} cleaned my kit. checked my phone more than i should've.`,
    `${location} again. ${weather ? weather + '.' : ''} price had us running drills. came back tired. she asked if i was okay. said yeah. wasn't lying. wasn't the whole truth either.`,
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ===== 日记页面渲染 =====

function renderDiary() {
  const container = document.getElementById('diaryContainer');
  if (!container) return;

  const entries = getDiaryEntries().slice().reverse();

  if (entries.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:#a09880;">
        <div style="font-size:48px;margin-bottom:12px;">📓</div>
        <div style="font-size:14px;font-weight:600;margin-bottom:6px;">日记本还是空的…</div>
        <div style="font-size:12px;color:#c0b8a0;">Ghost 还没写，明天再来偷看？</div>
      </div>
    `;
    return;
  }

  let html = `
    <div style="padding:4px 16px 8px;text-align:center;">
      <div style="font-size:11px;color:#c0b8a0;font-style:italic;">⚠️ 这是Ghost的私人日记。他不知道你能看到。</div>
    </div>
  `;

  entries.forEach(entry => {
    const d = new Date(entry.date + 'T00:00:00');
    const weekday = ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];
    const dateStr = `${d.getMonth()+1}月${d.getDate()}日 ${weekday}`;

    html += `
      <div style="margin:0 16px 14px;background:rgba(245,240,230,0.7);border:1px solid rgba(200,190,170,0.3);border-radius:12px;padding:16px;position:relative;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-size:12px;color:#a09880;font-weight:600;">${dateStr}</span>
          <span style="font-size:11px;color:#c0b8a0;">${entry.location || ''} ${entry.weather || ''}</span>
        </div>
        <div style="font-size:13px;color:#5a4a3a;line-height:1.7;font-family:'Georgia','Times New Roman',serif;font-style:italic;white-space:pre-line;">${entry.content}</div>
        <div style="position:absolute;top:12px;right:14px;font-size:10px;color:rgba(180,170,150,0.5);">📓</div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ===== 每日检查（在 app.js 调用）=====

async function dailyDiaryCheck() {
  // 先清理已有的重复日记
  const existing = getDiaryEntries();
  const seen = new Set();
  const cleaned = existing.filter(e => {
    if (seen.has(e.date)) return false;
    seen.add(e.date);
    return true;
  });
  if (cleaned.length < existing.length) {
    console.log('[diary] 清理重复日记:', existing.length - cleaned.length, '条');
    localStorage.setItem('ghostDiary', JSON.stringify(cleaned));
  }

  if (!hasYesterdayDiary()) {
    await generateDiaryEntry();
  }
}
