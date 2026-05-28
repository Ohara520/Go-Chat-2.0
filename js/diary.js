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
  // 修复：锁加上过期时间（2小时），避免生成失败后永久卡死
  const _lockKey = 'diaryLock_' + getYesterdayKey();
  const _lockVal = localStorage.getItem(_lockKey);
  if (_lockVal) {
    const _lockTime = parseInt(_lockVal);
    // 如果锁是一个时间戳且还在2小时内，跳过
    if (!isNaN(_lockTime) && Date.now() - _lockTime < 2 * 60 * 60 * 1000) return;
    // 锁过期了或者是旧版'1'格式，清掉重新生成
    localStorage.removeItem(_lockKey);
  }
  localStorage.setItem(_lockKey, Date.now().toString());
  _diaryGenerating = true;

  try {
    const location = localStorage.getItem('currentLocation') || 'Hereford Base';
    const locationReason = localStorage.getItem('currentLocationReason') || '';
    const weather = (localStorage.getItem('lastWeatherDisplay') || '').replace(/^undefined$/i, '').trim();
    const userName = localStorage.getItem('userName') || 'her';

    // ── 昨天的聊天记录（日记写的是昨天，不是今天）──────────────
    const yesterdayStr = getYesterdayKey(); // "2026-05-21" 格式
    const _allHistory = (() => {
      try { return JSON.parse(localStorage.getItem('chatHistory') || '[]'); } catch(e) { return []; }
    })();

    // 筛出昨天的消息（按时间戳判断）
    const _yesterdayStart = new Date(yesterdayStr + 'T00:00:00').getTime();
    const _yesterdayEnd   = _yesterdayStart + 24 * 60 * 60 * 1000;
    const _yesterdayMsgs  = _allHistory.filter(m => {
      if (m._system || m._recalled) return false;
      const t = m._time || m.timestamp || 0;
      return t >= _yesterdayStart && t < _yesterdayEnd;
    });

    // 取最多10条，格式化成"她说了什么 / Ghost说了什么"
    const _chatSnippet = _yesterdayMsgs
      .slice(-10)
      .map(m => {
        const who = m.role === 'user' ? 'SHE SAID' : 'GHOST SAID';
        const text = (typeof m.content === 'string' ? m.content : '').slice(0, 80).replace(/\n/g, ' ');
        return `${who}: ${text}`;
      })
      .join('\n');

    // 如果昨天没有聊天记录，用 memoryBank 里最相关的几条兜底
    let memoryHint = '';
    if (_chatSnippet) {
      memoryHint = `What happened yesterday between Ghost and her (their actual conversation — "SHE SAID" = her words, "GHOST SAID" = his words):
${_chatSnippet}`;
    } else {
      // 没有昨天的记录——从 memoryBank 拿几条关于她的背景
      let _memBank = [];
      try { _memBank = JSON.parse(localStorage.getItem('memoryBank') || '[]'); } catch(e) {}
      if (_memBank.length > 0) {
        const _memTop = _memBank
          .sort((a, b) => (b.importance || 1) - (a.importance || 1))
          .slice(0, 5)
          .map(m => '- ' + m.text)
          .join('\n');
        memoryHint = `Background details about her:\n${_memTop}`;
      } else {
        // 再兜底：旧版 longTermMemory
        const _oldMem = localStorage.getItem('longTermMemory') || '';
        const _oldLines = _oldMem.split('\n').filter(l => l.trim()).slice(-5).join('\n');
        if (_oldLines) memoryHint = `Background details about her:\n${_oldLines}`;
      }
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayWeekday = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][yesterday.getDay()];

    // v2: 读取 Ghost 当前心情，让日记反映真实情绪而非默认忧郁
    const mood = (typeof getMoodLevel === 'function') ? getMoodLevel() : 7;

    // Ghost 那边的世界素材——给 DeepSeek 编造细节用
    // 根据位置和心情提供合理的军旅细节
    const _sideWorld = (() => {
      const loc = localStorage.getItem('currentLocation') || 'Hereford Base';
      const isDeployed = !loc.toLowerCase().includes('hereford') && !loc.toLowerCase().includes('base');
      if (isDeployed) {
        return `He's currently deployed at ${loc}. Details available to use: patrols, checkpoints, kit maintenance, local weather affecting operations, downtime in transit or barracks, limited comms, food from rations or local mess.`;
      } else {
        return `He's at base (${loc}). Details available to use: drills, range practice, briefings, PT, mess hall food, time with Soap/Gaz/Price, evening downtime, cleaning kit, admin work, early nights or late ones.`;
      }
    })();
    let moodHint = '';
    if (mood >= 8) {
      moodHint = `Yesterday was a good one. He's in a settled, decent mood. The entry should reflect that — not cheerful, not poetic, just steady. Maybe one small thing made him quietly pleased.`;
    } else if (mood >= 6) {
      moodHint = `Yesterday was ordinary. Steady. Neither rough nor bright. The entry should sit in that — practical, dry, occasionally a flicker of warmth or amusement, but mostly just an account of the day.`;
    } else if (mood >= 4) {
      moodHint = `Yesterday was a little off. Tired, maybe slightly low. The entry can show that, but he doesn't dwell — he doesn't pour his heart out, even to himself.`;
    } else {
      moodHint = `Yesterday was rough. He's not okay. But he doesn't write it that way — he writes around it. Short. Withholding. The reader has to feel it underneath.`;
    }

    // 修复：prompt 完全避免"memory system/track/relationship"等触发词
    // 改成创意写作语境，让模型理解这是小说角色的日记创作
    const prompt = `Write a short notebook entry for Simon "Ghost" Riley. British SAS soldier, 35.

Setting: ${location}${locationReason ? ` (${locationReason})` : ''}
Weather: ${weather || 'not noted'}
Day: ${yesterdayWeekday}
${moodHint}
${_sideWorld}

${memoryHint ? `${memoryHint.startsWith('What happened') ? 'Their conversation yesterday — draw from this, but write it as Ghost\'s experience, not a transcript. Pick 1-2 moments that stuck. Don\'t quote directly.\nCRITICAL: "SHE SAID" lines are HER words. "GHOST SAID" lines are HIS words. Do NOT mix them up. If she said something, it is her action. If he said something, it is his action.' : 'Background about her — use at most one detail, naturally:'}\n${memoryHint}\n` : 'He didn\'t hear from her yesterday.\n'}
Strict rules:
- 3-5 lines. Lowercase. Short sentences.
- Split the entry between TWO things: (1) what happened on his side yesterday — training, teammates, food, something observed at base — and (2) one moment involving her, drawn from the conversation context.
- Invent plausible soldier details freely: a drill that ran long, something soap did, what he ate, the cold, a card game, cleaning kit, a briefing that went nowhere. These make him feel real.
- If she said something in the conversation — let it echo in his day without quoting it. Something she mentioned might connect to something that happened on his end.
- He records facts. He does not name or explain his feelings. Ever.
- Dry, flat, functional. NOT poetic. NOT introspective. NOT sentimental.
- BANNED: "still thinking about it" / "that's enough" / "saved it to tell her" / "something felt different" / "still mine" / "quiet moment" / any sentence that ends on emotion.
- She appears through his actions: "checked my phone" / "she called" / "she was still awake when i got back" — not "i missed her".
- English only. No "dear diary". No timestamps. No stage directions.`;

    let entry = '';
    // 优先用 DeepSeek：不会拒绝日记内容，比 Sonnet 稳定
    if (typeof fetchDeepSeek === 'function') {
      entry = await fetchDeepSeek(prompt, 'write today\'s entry.', 120);
    } else if (typeof callSonnetLight === 'function') {
      entry = await callSonnetLight(prompt, [{ role: 'user', content: 'write today\'s entry.' }], 100);
    } else if (typeof callSonnet === 'function') {
      entry = await callSonnet(prompt, [{ role: 'user', content: 'write today\'s entry.' }], 100);
    }

    // 破防检测：不存 AI 泄露内容
    // 修复：加入日记场景特有的拒绝模式（Sonnet 4.5 容易把日记请求识别为"记忆追踪系统"而拒绝）
    const _diaryBreakout = (txt) => {
      if (!txt) return true;
      const l = txt.toLowerCase();
      if (typeof isBreakout === 'function' && isBreakout(txt)) return true;
      return [
        "i can't help with this request",
        "i cannot help with this request",
        "i don't create, maintain",
        "memory systems designed to track",
        "intimate relationship details",
        "if you need help with coding",
        "professional work, i'm available",
        "regardless of language, framing",
        "creative exercises",
        "i need to be direct",
        "i'm not able to",
      ].some(p => l.includes(p));
    };
    if (_diaryBreakout(entry)) {
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
  } finally {
    // 修复：无论成功还是失败都清除锁
    // 成功：日记已写入，hasYesterdayDiary()会拦截重复生成，锁不再需要
    // 失败：清锁让下次进入时可以重试，不永久卡死
    localStorage.removeItem(_lockKey);
    _diaryGenerating = false;
  }
}

// 兜底静态日记 — 按 mood 分层，避免全部都是忧郁
function _getFallbackEntry(location, weather) {
  // 读取昨天的心情（用今天的 mood 当代理，因为日记是为昨天写的）
  const mood = (typeof getMoodLevel === 'function') ? getMoodLevel() : 7;

  // ── 心情好（mood >= 7）—— 平淡日常，她以行为方式出现 ──
  const goodPool = [
    `${location}. ${weather ? weather + '.' : ''} drills in the morning. she messaged around noon. read it between sets. didn't reply until after.`,
    `solid one. ${weather ? weather + '.' : ''} ran the route. got back. she'd already sent two things by then. read both.`,
    `${location}. kit check after drills. ${weather ? weather + '.' : ''} she was still up when i got in. later than usual for her.`,
    `${weather ? weather + '.' : ''} price ran us hard. no complaints. checked my phone after. she'd sent something. decent day.`,
    `${location}. ${weather ? weather + '.' : ''} gaz said something stupid at dinner. would've told her. didn't.`,
    `training. mess. bunk. ${weather ? weather + '.' : ''} she called. kept it short. not because i wanted to.`,
  ];

  // ── 心情中等（mood 5-6）—— 她出现，但他不多说 ──
  const neutralPool = [
    `${location}. ${weather ? weather + '.' : ''} long day. she messaged twice. answered the second one. meant to get back to the first.`,
    `slow one. ${weather ? weather + ' all morning.' : ''} didn't hear from her until late. checked a few times before that.`,
    `${location} again. ${weather ? weather + '.' : ''} briefing ran over. missed her call. she didn't leave a message.`,
    `ran drills. ate. ${weather ? weather + '.' : ''} she sent something at an odd hour. she was still awake.`,
    `long one. ${weather ? weather + '.' : ''} price had us out late. she was already asleep by the time i got back. didn't wake her.`,
  ];

  // ── 心情低（mood <= 4）—— 更短，她若隐若现 ──
  const lowPool = [
    `${location}. ${weather ? weather + '.' : ''} training ran long. she messaged. didn't have much to say back. said i was fine.`,
    `bad sleep. drills anyway. ${weather ? weather + '.' : ''} she could tell something was off. didn't push it.`,
    `${location}. ${weather ? weather + '.' : ''} checked my phone more than i needed to. nothing new.`,
    `ran the route alone. ${weather ? weather + '.' : ''} she sent something in the morning. read it three times. didn't answer right away.`,
  ];

  // 按 mood 选池
  let pool;
  if (mood >= 7)      pool = goodPool;
  else if (mood >= 5) pool = neutralPool;
  else                pool = lowPool;

  // 去重：记录最近用过的兜底内容，避免连续几天重复
  const _usedKey = 'diaryFallbackUsed';
  let _used = [];
  try { _used = JSON.parse(localStorage.getItem(_usedKey) || '[]'); } catch(e) {}

  // 过滤掉最近用过的
  const _available = pool.filter((_, i) => !_used.includes(i));
  const _pickFrom = _available.length > 0 ? _available : pool; // 全用过了就重置

  // 随机选一条
  const _poolIdx = pool.indexOf(_pickFrom[Math.floor(Math.random() * _pickFrom.length)]);

  // 记录这次用的，只保留最近3条记录
  _used.push(_poolIdx);
  if (_used.length > 3) _used = _used.slice(-3);
  localStorage.setItem(_usedKey, JSON.stringify(_used));

  return pool[_poolIdx];
}

// ===== 日记页面渲染 =====

function renderDiary() {
  const container = document.getElementById('diaryContainer');
  if (!container) return;

  // 修复：每次打开日记页面时主动检查并生成
  // 不依赖 app.js 的初始化时机，切换页面也能触发
  if (!hasYesterdayDiary()) {
    dailyDiaryCheck().then(() => {
      // 生成完成后重新渲染一次
      _renderDiaryContent(container);
    }).catch(() => {});
  }

  _renderDiaryContent(container);
}

function _renderDiaryContent(container) {
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

  // 修复：检查昨天的日记，没有才生成
  // hasYesterdayDiary() 是唯一的写入门槛，锁只是防并发，不阻止重试
  if (!hasYesterdayDiary()) {
    await generateDiaryEntry();
  }
}
