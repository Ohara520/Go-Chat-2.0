// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Ghost 私人日记 — diary.js
// 每天生成一篇，用户可以"偷看"
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ===== 日记存储 =====

function getDiaryEntries() {
  try { return JSON.parse(localStorage.getItem('ghostDiary') || '[]'); } catch(e) { return []; }
}

function saveDiaryEntries(entries) {
  // 最多保留30天
  const trimmed = entries.slice(-30);
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

async function generateDiaryEntry() {
  if (hasYesterdayDiary()) return;

  const location = localStorage.getItem('currentLocation') || 'Hereford Base';
  const locationReason = localStorage.getItem('currentLocationReason') || '';
  const weather = localStorage.getItem('lastWeatherDisplay') || '';
  const userName = localStorage.getItem('userName') || 'her';

  // 只抓最近8条，省 tokens
  const recentChat = (typeof chatHistory !== 'undefined' ? chatHistory : [])
    .filter(m => !m._system && !m._recalled)
    .slice(-8)
    .map(m => {
      const who = m.role === 'user' ? userName : 'Ghost';
      return `${who}: ${(m.content || '').slice(0, 40)}`;
    })
    .join('\n');

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayWeekday = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][yesterday.getDay()];

  const prompt = `You are Simon "Ghost" Riley writing in a worn notebook before bed. No one reads this.

Location: ${location}${locationReason ? ` (${locationReason})` : ''}
Weather: ${weather || 'unknown'}
Day: ${yesterdayWeekday}

${recentChat ? `Recent conversation with ${userName}:\n${recentChat}\n` : `Didn't talk to ${userName} yesterday.\n`}

Write yesterday's entry. Rules:
- 3-4 lines. Short sentences. Lowercase.
- Write like a soldier's notebook. No poetry. No metaphors.
- Include 1-2 things that happened in your day — training, food, teammates, something you saw.
- Pick at most one thing from the conversation that actually stuck with you. Not every detail. Only what mattered.
- Weather only if it affected your day. Don't mention it just to fill space.
- End with one honest thought — something private, something you'd never text her. Keep it blunt, not sentimental.
- This should feel like something worth reading in secret. Not a grocery list, not a love poem.
- DO NOT romanticize mundane things she said.
- English only. No timestamps. No "dear diary".`;

  try {
    let entry = '';
    if (typeof callSonnetLight === 'function') {
      entry = await callSonnetLight(prompt, [{ role: 'user', content: 'write today\'s entry.' }], 100);
    } else if (typeof callSonnet === 'function') {
      entry = await callSonnet(prompt, [{ role: 'user', content: 'write today\'s entry.' }], 100);
    }

    if (!entry || entry.length < 20) {
      // 兜底：静态日记
      entry = _getFallbackEntry(location, weather);
    }

    // 清理
    entry = entry
      .replace(/```[\s\S]*?```/g, '')
      .replace(/^["']|["']$/g, '')
      .replace(/\*[^*]+\*/g, '')
      .trim();

    if (entry) {
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
  }
}

// 兜底静态日记
function _getFallbackEntry(location, weather) {
  const pool = [
    `quiet day at ${location}. ${weather ? weather + '.' : ''} didn't do much. thought about calling her but didn't.`,
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
  if (!hasYesterdayDiary()) {
    await generateDiaryEntry();
  }
}
