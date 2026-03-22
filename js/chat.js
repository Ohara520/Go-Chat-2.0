// ===== Supabase 云端同步 =====
const _SB_URL = 'https://siahkenfoofkjrgevgma.supabase.co';
const _SB_KEY = 'sb_publishable_FNPLr9vwPZPrB4ifHBncXg_83CWekPD';

function getSbClient() {
  // 直接用index.html里已创建的sbClient，避免重复初始化
  if (window.sbClient) return window.sbClient;
  if (window._sbClient) return window._sbClient;
  if (window.supabase) {
    window._sbClient = window.supabase.createClient(_SB_URL, _SB_KEY);
    return window._sbClient;
  }
  return null;
}

function getSbUserId() {
  return localStorage.getItem('sb_user_id');
}

// 从云端加载数据到localStorage
async function loadFromCloud() {
  const sb = getSbClient();
  const userId = getSbUserId();
  if (!sb || !userId) return;
  try {
    const { data, error } = await sb
      .from('user_data')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return;

    // ── 时间戳 ──────────────────────────────────────────────
    const cloudTs = data.updated_at ? new Date(data.updated_at).getTime() : 0;
    const localTs = parseInt(localStorage.getItem('localUpdatedAt') || localStorage.getItem('chatUpdatedAt') || '0');
    const cloudIsNewer = cloudTs > localTs;

    // ── 1. 聊天记录：合并，保留更长的 ────────────────────────
    if (data.chat_history && data.chat_history.length > 0) {
      const localRaw = localStorage.getItem('chatHistory');
      const localHistory = localRaw ? JSON.parse(localRaw) : [];
      if (data.chat_history.length > localHistory.length) {
        localStorage.setItem('chatHistory', JSON.stringify(data.chat_history));
        localStorage.setItem('chatUpdatedAt', cloudTs);
      }
    }

    // ── 2. Profile：每个字段独立，有值才覆盖，本地有就用本地 ──
    if (data.profile != null) {
      const p = data.profile;
      const setIfMissing = (key, val) => { if (val != null && val !== '' && !localStorage.getItem(key)) localStorage.setItem(key, val); };
      const setIfNewer = (key, val) => { if (val != null && val !== '' && cloudIsNewer) localStorage.setItem(key, val); };
      // 静态资料：本地没有才写（换设备恢复）
      setIfMissing('userName', p.userName);
      setIfMissing('marriageDate', p.marriageDate);
      setIfMissing('ghostBirthday', p.ghostBirthday);
      setIfMissing('ghostZodiac', p.ghostZodiac);
      setIfMissing('meetType', p.meetType);
      setIfMissing('botNickname', p.botNickname);
      // 用户设置：云端更新才覆盖
      setIfNewer('userBirthday', p.userBirthday);
      setIfNewer('userZodiac', p.userZodiac);
      setIfNewer('userMBTI', p.userMBTI);
      setIfNewer('userCountry', p.userCountry);
      setIfNewer('userFavFood', p.userFavFood);
      setIfNewer('userFavMusic', p.userFavMusic);
      setIfNewer('userFavColor', p.userFavColor);
      setIfNewer('userBio', p.userBio);
      setIfNewer('metInPerson', p.metInPerson != null ? String(p.metInPerson) : null);
      setIfNewer('visitStreak', p.visitStreak);
      setIfNewer('vocabStreak', p.vocabStreak);
      setIfNewer('vocabLastDay', p.vocabLastDay);
      setIfNewer('lastSalaryAmount', p.lastSalaryAmount);
      setIfNewer('lastSalaryMonth', p.lastSalaryMonth);
      // 头像：有就用云端（换设备必须恢复）
      if (p.userAvatarBase64 && !localStorage.getItem('userAvatarBase64')) {
        localStorage.setItem('userAvatarBase64', p.userAvatarBase64);
      }
      // 冷战状态：取最新
      if (p.coldWarMode != null && cloudIsNewer) localStorage.setItem('coldWarMode', String(p.coldWarMode));
    }

    // ── 3. 情绪/关系：云端更新才覆盖，本地操作优先 ────────────
    if (cloudIsNewer) {
      if (data.mood != null) localStorage.setItem('moodLevel', data.mood);
      if (data.affection != null) localStorage.setItem('affection', data.affection);
      if (data.long_term_memory != null) localStorage.setItem('longTermMemory', data.long_term_memory);
    } else {
      // 云端较旧：只恢复本地没有的
      if (data.mood != null && !localStorage.getItem('moodLevel')) localStorage.setItem('moodLevel', data.mood);
      if (data.affection != null && !localStorage.getItem('affection')) localStorage.setItem('affection', data.affection);
      if (data.long_term_memory != null && !localStorage.getItem('longTermMemory')) localStorage.setItem('longTermMemory', data.long_term_memory);
    }

    // ── 4. 余额：本地没有才从云端恢复，有就保留本地 ──────────
    if (data.balance != null && !localStorage.getItem('wallet')) {
      localStorage.setItem('wallet', parseFloat(data.balance).toFixed(2));
    }

    // ── 5. state_snapshot ─────────────────────────────────────
    if (data.state_snapshot != null) {
      const s = data.state_snapshot;

      // 动态状态：云端更新才覆盖
      if (cloudIsNewer) {
        if (s.trustHeat != null) localStorage.setItem('trustHeat', s.trustHeat);
        if (s.attachmentPull != null) localStorage.setItem('attachmentPull', s.attachmentPull);
        if (s.jealousyLevel != null) localStorage.setItem('jealousyLevel', s.jealousyLevel);
        if (s.globalTurnCount != null) { _globalTurnCount = s.globalTurnCount; localStorage.setItem('globalTurnCount', s.globalTurnCount); }
        if (Array.isArray(s.pendingReversePackages)) savePendingReversePackages(s.pendingReversePackages, { markChanged: false });
        if (s.emotionalHurt != null) localStorage.setItem('emotionalHurt', s.emotionalHurt);
        if (s.lastReversePackageTurn != null) localStorage.setItem('lastReversePackageTurn', s.lastReversePackageTurn);
        if (s.relationshipFlags != null) localStorage.setItem('relationshipFlags', JSON.stringify(s.relationshipFlags));
        if (s.coldWarStart != null) localStorage.setItem('coldWarStart', s.coldWarStart);
        if (s.pendingGhostApology != null) localStorage.setItem('pendingGhostApology', String(s.pendingGhostApology));
        if (s.pendingSeriousTalk != null) localStorage.setItem('pendingSeriousTalk', String(s.pendingSeriousTalk));
        if (s.pendingMakeupMoney != null) localStorage.setItem('pendingMakeupMoney', String(s.pendingMakeupMoney));
        if (s.pendingColdWarEndStory != null) localStorage.setItem('pendingColdWarEndStory', String(s.pendingColdWarEndStory));
        if (s.loveResistance != null) localStorage.setItem('loveResistance', String(s.loveResistance));
        if (s.loveResistanceLastDecay) localStorage.setItem('loveResistanceLastDecay', s.loveResistanceLastDecay);
        if (s.moneyRefuseCount != null) localStorage.setItem('moneyRefuseCount', String(s.moneyRefuseCount));
        if (s.userDislikesMoney) localStorage.setItem('userDislikesMoney', s.userDislikesMoney);
        if (s.sassyPost != null) localStorage.setItem('sassyPost', s.sassyPost);
        if (s.marketTriggered != null) localStorage.setItem('marketTriggered', JSON.stringify(s.marketTriggered));
        if (s.coupleFeedDate) localStorage.setItem('coupleFeedDate', s.coupleFeedDate);
        if (s.organicFeedCountKey && s.organicFeedCount != null) localStorage.setItem(s.organicFeedCountKey, s.organicFeedCount);
        if (s.lastFeedPostAt) localStorage.setItem('lastFeedPostAt', s.lastFeedPostAt);
        if (s.weeklyGiven != null) {
          const key = 'weeklyGiven_' + (typeof getWeekKey === 'function' ? getWeekKey() : '');
          localStorage.setItem(key, s.weeklyGiven);
        }
      } else {
        // 云端较旧：只恢复本地没有的字段
        const restoreIfMissing = (key, val) => { if (val != null && !localStorage.getItem(key)) localStorage.setItem(key, String(val)); };
        restoreIfMissing('trustHeat', s.trustHeat);
        restoreIfMissing('attachmentPull', s.attachmentPull);
        restoreIfMissing('jealousyLevel', s.jealousyLevel);
        restoreIfMissing('emotionalHurt', s.emotionalHurt);
        restoreIfMissing('relationshipFlags', s.relationshipFlags ? JSON.stringify(s.relationshipFlags) : null);
        restoreIfMissing('loveResistance', s.loveResistance);
        restoreIfMissing('moneyRefuseCount', s.moneyRefuseCount);
        restoreIfMissing('userDislikesMoney', s.userDislikesMoney);
        restoreIfMissing('coupleFeedDate', s.coupleFeedDate);
        restoreIfMissing('lastFeedPostAt', s.lastFeedPostAt);
      }

      // ── 合并类：无论新旧都合并 ──────────────────────────────

      // 已购商品：合并去重
      if (Array.isArray(s.purchasedItems)) {
        const local = JSON.parse(localStorage.getItem('purchasedItems') || '[]');
        const merged = [...new Set([...local, ...s.purchasedItems])];
        localStorage.setItem('purchasedItems', JSON.stringify(merged));
      }

      // 交易记录：按id合并
      if (Array.isArray(s.transactions)) {
        const local = JSON.parse(localStorage.getItem('transactions') || '[]');
        const merged = [...local];
        s.transactions.forEach(ct => {
          const key = ct.id || (ct.name + '_' + ct.amount + '_' + (ct.time || ct.date || ''));
          if (!merged.find(lt => {
            const lk = lt.id || (lt.name + '_' + lt.amount + '_' + (lt.time || lt.date || ''));
            return lk === key;
          })) merged.push(ct);
        });
        merged.sort((a, b) => (b.time || b.date || '').localeCompare(a.time || a.date || ''));
        localStorage.setItem('transactions', JSON.stringify(merged.slice(0, 200)));
      }

      // 快递：按id合并，取进度更新的
      if (Array.isArray(s.deliveries)) {
        const local = JSON.parse(localStorage.getItem('deliveries') || '[]');
        const merged = [...local];
        s.deliveries.forEach(cd => {
          const idx = merged.findIndex(ld => ld.id === cd.id);
          if (idx === -1) {
            merged.push(cd);
          } else if (cd.currentStage > merged[idx].currentStage || cd.done) {
            merged[idx] = cd;
          }
        });
        localStorage.setItem('deliveries', JSON.stringify(merged.slice(0, 30)));
      }

      // 故事书/相册/朋友圈历史/快递历史：取更多的
      const mergeByLength = (key, arr) => {
        if (!Array.isArray(arr)) return;
        const local = JSON.parse(localStorage.getItem(key) || '[]');
        if (arr.length > local.length) localStorage.setItem(key, JSON.stringify(arr));
      };
      mergeByLength('storyBook', s.storyBook);
      mergeByLength('collections', s.collections);
      mergeByLength('coupleFeedHistory', s.coupleFeedHistory);
      mergeByLength('deliveryHistory', s.deliveryHistory);

      // feedEventPool：合并去重
      if (Array.isArray(s.feedEventPool)) {
        const localPool = (typeof getFeedEventPool === 'function') ? getFeedEventPool() : [];
        const merged = [...s.feedEventPool, ...localPool];
        const seen = new Set();
        const deduped = merged.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
        if (typeof setFeedEventPool === 'function') setFeedEventPool(deduped.slice(0, 30));
      }
    }

    console.log('云端数据已加载');
  } catch(e) {
    console.log('云端加载失败，使用本地数据', e);
  }
}
// 保存数据到云端（防抖，3秒内无新变化才存，保证最后一次也能存上）
let _saveTimer = null;
let _lastSyncTime = 0; // 仅记录上次saveToCloud执行时间，不再用于节流控制

// 本地状态变更时间戳——用于跟云端比较谁更新
function touchLocalState() {
  localStorage.setItem('localUpdatedAt', Date.now().toString());
  scheduleCloudSave();
}

function scheduleCloudSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    saveToCloud().catch(console.error);
  }, 3000);
}

async function saveToCloud() {
  const sb = getSbClient();
  const userId = getSbUserId();
  if (!sb || !userId) return;
  const now = Date.now();
  _lastSyncTime = now;
  try {
    const profile = {
      userName: localStorage.getItem('userName') || '',
      userBirthday: localStorage.getItem('userBirthday') || '',
      userZodiac: localStorage.getItem('userZodiac') || '',
      userMBTI: localStorage.getItem('userMBTI') || '',
      userCountry: localStorage.getItem('userCountry') || 'CN',
      userFavFood: localStorage.getItem('userFavFood') || '',
      userFavMusic: localStorage.getItem('userFavMusic') || '',
      userFavColor: localStorage.getItem('userFavColor') || '',
      userBio: localStorage.getItem('userBio') || '',
      userAvatarBase64: localStorage.getItem('userAvatarBase64') || '',
      marriageDate: localStorage.getItem('marriageDate') || '',
      ghostBirthday: localStorage.getItem('ghostBirthday') || '',
      ghostZodiac: localStorage.getItem('ghostZodiac') || '',
      coldWarMode: localStorage.getItem('coldWarMode') || 'false',
      metInPerson: localStorage.getItem('metInPerson') || 'false',
      meetType: localStorage.getItem('meetType') || '',
      botNickname: localStorage.getItem('botNickname') || '',
      visitStreak: localStorage.getItem('visitStreak') || '0',
      vocabStreak: localStorage.getItem('vocabStreak') || '0',
      vocabLastDay: localStorage.getItem('vocabLastDay') || '',
      lastSalaryAmount: localStorage.getItem('lastSalaryAmount') || '',
      lastSalaryMonth: localStorage.getItem('lastSalaryMonth') || '',
    };
    const chatHistoryRaw = localStorage.getItem('chatHistory');
    const chatHistoryData = chatHistoryRaw
      ? JSON.parse(chatHistoryRaw)
          .filter(m => !m._system && !m._recalled) // 过滤系统消息和撤回消息
          .slice(-100)
          .map(m => ({ role: m.role, content: m.content, ...(m._transfer ? {_transfer: m._transfer} : {}), ...(m._userTransfer ? {_userTransfer: m._userTransfer} : {}) }))
      : [];
    const stateSnapshot = {
      trustHeat: getTrustHeat(),
      attachmentPull: getAttachmentPull(),
      jealousyLevel: getJealousyLevel(),
      globalTurnCount: _globalTurnCount,
      pendingReversePackages: getPendingReversePackages(),
      emotionalHurt: parseInt(localStorage.getItem('emotionalHurt') || '0'),
      lastReversePackageTurn: getLastReversePackageTurn(),
      relationshipFlags: getRelationshipFlags(),
      // 钱包和快递数据
      deliveries: JSON.parse(localStorage.getItem('deliveries') || '[]').slice(0, 30),
      transactions: JSON.parse(localStorage.getItem('transactions') || '[]').slice(0, 50),
      purchasedItems: JSON.parse(localStorage.getItem('purchasedItems') || '[]'),
      weeklyGiven: getWeeklyGiven(),
      // 故事书、相册、朋友圈
      // 故事书、相册、朋友圈——只存最近10条，减小体积
      storyBook: JSON.parse(localStorage.getItem('storyBook') || '[]').slice(0, 10),
      collections: JSON.parse(localStorage.getItem('collections') || '[]').slice(0, 20),
      coupleFeedHistory: JSON.parse(localStorage.getItem('coupleFeedHistory') || '[]').slice(0, 25),
      coupleFeedDate: localStorage.getItem('coupleFeedDate') || '',
      organicFeedCount: localStorage.getItem('organicFeedCount_' + getTodayDateStr()) || '0',
      organicFeedCountKey: 'organicFeedCount_' + getTodayDateStr(),
      feedEventPool: (typeof getFeedEventPool === 'function' ? getFeedEventPool() : []).filter(e => !e.consumed).slice(0, 20),
      lastFeedPostAt: localStorage.getItem('lastFeedPostAt') || '',
      deliveryHistory: JSON.parse(localStorage.getItem('deliveryHistory') || '[]').slice(0, 50),
      marketTriggered: JSON.parse(localStorage.getItem('marketTriggered') || '{}'),
      // 状态标记
      coldWarStart: localStorage.getItem('coldWarStart') || '',
      pendingGhostApology: localStorage.getItem('pendingGhostApology') || '',
      pendingSeriousTalk: localStorage.getItem('pendingSeriousTalk') || '',
      pendingMakeupMoney: localStorage.getItem('pendingMakeupMoney') || '',
      pendingColdWarEndStory: localStorage.getItem('pendingColdWarEndStory') || '',
      loveResistance: localStorage.getItem('loveResistance') || '0',
      loveResistanceLastDecay: localStorage.getItem('loveResistanceLastDecay') || '',
      moneyRefuseCount: localStorage.getItem('moneyRefuseCount') || '0',
      userDislikesMoney: localStorage.getItem('userDislikesMoney') || '',
      sassyPost: localStorage.getItem('sassyPost') || '',
    };
    const nowIso = new Date().toISOString();
    await sb.from('user_data').upsert({
      user_id: userId,
      chat_history: chatHistoryData,
      mood: parseInt(localStorage.getItem('moodLevel') || '7'),
      affection: parseInt(localStorage.getItem('affection') || '50'),
      balance: parseFloat(localStorage.getItem('wallet') || '0'),
      long_term_memory: localStorage.getItem('longTermMemory') || '',
      profile: profile,
      state_snapshot: stateSnapshot,
      updated_at: nowIso,
    }, { onConflict: 'user_id' });
    localStorage.setItem('chatUpdatedAt', new Date(nowIso).getTime());
  } catch(e) {
    console.log('云端保存失败', e);
  }
}

// ===== 氛围音乐系统 =====
let _ambientAudio = null;
let _ambientPlaying = null;
let _ambientVolume = 0.6;

function toggleAmbient() {
  const body = document.getElementById('ambientBody');
  const arrow = document.getElementById('ambientArrow');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (arrow) arrow.classList.toggle('open', !isOpen);
}

function toggleTrack(el) {
  const id = el.dataset.id;
  const file = el.dataset.file;
  const color = el.dataset.color;
  const glow = el.dataset.glow;

  if (_ambientPlaying === id) {
    // 停止
    stopAmbient();
    return;
  }

  // 切换音轨
  if (_ambientAudio) {
    _ambientAudio.pause();
    _ambientAudio = null;
  }

  _ambientAudio = new Audio(file);
  _ambientAudio.loop = true;
  _ambientAudio.volume = _ambientVolume;
  _ambientAudio.play().catch(e => console.warn('音频播放失败:', e));
  _ambientPlaying = id;

  // 更新UI
  document.querySelectorAll('.ambient-track').forEach(t => {
    t.classList.remove('playing');
    const wave = t.querySelector('.ambient-wave');
    if (wave) wave.remove();
  });
  el.classList.add('playing');

  // 加波形动画
  const wave = document.createElement('div');
  wave.className = 'ambient-wave';
  wave.innerHTML = [0,1,2,3,4].map(i =>
    `<div class="ambient-wave-bar" style="background:${color};animation-delay:${i*0.13}s"></div>`
  ).join('');
  el.appendChild(wave);

  // 更新副标题
  const subtitle = document.getElementById('ambientSubtitle');
  const name = el.querySelector('.ambient-track-name')?.textContent || '';
  if (subtitle) subtitle.innerHTML = `${name} · 播放中 <span style="display:inline-flex;align-items:center;gap:2px">${[0,1,2].map(i=>`<span style="display:inline-block;width:2px;height:8px;border-radius:1px;background:${color};animation:wave 0.9s ease-in-out infinite;animation-delay:${i*0.15}s"></span>`).join('')}</span>`;

  // 更新光晕
  updateAmbientPulse(color, glow);
}

function stopAmbient() {
  if (_ambientAudio) {
    _ambientAudio.pause();
    _ambientAudio = null;
  }
  _ambientPlaying = null;
  document.querySelectorAll('.ambient-track').forEach(t => {
    t.classList.remove('playing');
    const wave = t.querySelector('.ambient-wave');
    if (wave) wave.remove();
  });
  const subtitle = document.getElementById('ambientSubtitle');
  if (subtitle) subtitle.textContent = '点击开启专注氛围';
  const pulse = document.getElementById('ambientPulse');
  if (pulse) pulse.style.display = 'none';
}

function setAmbientVolume(val) {
  _ambientVolume = val / 100;
  if (_ambientAudio) _ambientAudio.volume = _ambientVolume;
  const fill = document.getElementById('ambientVolumeFill');
  if (fill) fill.style.width = val + '%';
}

function updateAmbientPulse(color, glow) {
  const pulse = document.getElementById('ambientPulse');
  if (!pulse) return;

  // 只在打工页显示
  const workScreen = document.getElementById('workScreen');
  if (!workScreen || !workScreen.classList.contains('active')) return;

  pulse.style.display = 'block';
  const r1 = document.getElementById('pulseRing1');
  const r2 = document.getElementById('pulseRing2');
  const r3 = document.getElementById('pulseRing3');
  if (r1) r1.style.borderColor = color + '38';
  if (r2) r2.style.borderColor = color + '48';
  if (r3) r3.style.background = `radial-gradient(circle, ${glow}88, transparent 70%)`;
}

// 离开打工页时隐藏光晕（但音乐继续）
function onWorkScreenHide() {
  const pulse = document.getElementById('ambientPulse');
  if (pulse) pulse.style.display = 'none';
}

// 进入打工页时恢复光晕
function onWorkScreenShow() {
  if (_ambientPlaying) {
    const el = document.querySelector(`.ambient-track[data-id="${_ambientPlaying}"]`);
    if (el) updateAmbientPulse(el.dataset.color, el.dataset.glow);
  }
}

// ===== DeepSeek 功能型调用（第三档）=====
async function fetchDeepSeek(systemPrompt, userContent, maxTokens = 200) {
  try {
    const res = await fetchWithTimeout('/api/deepseek', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: systemPrompt, user: userContent, max_tokens: maxTokens }),
    }, 3000); // 3秒超时，失败立刻跳过不阻塞主流程
    if (!res.ok) return '';
    const data = await res.json();
    return data.text || '';
  } catch(e) {
    return '';
  }
}

// ===== Gemini 翻译层 =====
// 用第三档 Gemini 把英文翻译成自然中文，覆盖模型自带翻译
// 失败时保留原中文，不留空白
const _translateCache = new Map();

async function translateWithGemini(enText, zhEl, fallbackZh = '') {
  if (!enText || !enText.trim()) return;
  const key = enText.trim();
  // 命中缓存直接写入，不重复请求
  if (_translateCache.has(key)) {
    if (zhEl && zhEl.isConnected) zhEl.textContent = _translateCache.get(key);
    return;
  }
  // 先显示 fallback（模型原中文），Gemini 成功后再覆盖
  if (fallbackZh && zhEl && zhEl.isConnected && !zhEl.textContent) {
    zhEl.textContent = fallbackZh;
  }
  try {
    const res = await fetchWithTimeout('/api/deepseek', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: '你是翻译助手，专门翻译Simon "Ghost" Riley（COD角色）的对话。保留他克制、干燥、偶尔带英式口音的语气。口语化，不正式，不逐字翻译，传达情绪而非字面意思。只返回中文翻译，不要任何解释。',
        user: key,
        max_tokens: 150
      }),
    }, 8000); // 翻译超时8秒，比主流程宽松
    if (!res.ok) return;
    const data = await res.json();
    const zh = data.text?.trim();
    if (zh && /[\u4e00-\u9fff]/.test(zh)) {
      _translateCache.set(key, zh);
      if (zhEl && zhEl.isConnected) zhEl.textContent = zh;
    }
    // 翻译失败时静默保留 fallback，不打印错误避免干扰
  } catch(e) {}
}

async function fetchWithTimeout(url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch(e) {
    clearTimeout(timer);
    throw e;
  }
}

async function fetchWithRetry(url, options, timeoutMs = 30000, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, options, timeoutMs);
      if (res.status === 529 || res.status === 503 || res.status === 502) {
        // 服务器忙，等一下再试
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
      }
      return res;
    } catch(e) {
      if (attempt < maxRetries && e?.name !== 'AbortError') {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
}

// ===== System Prompt =====
// Ghost核心风格约束——所有Ghost输出（主回复/事件/台词）共享
// ===== 爱意递进系统 =====

// 抗拒值：用户越刷越高，自然聊天慢慢衰减（按时间，不按消息数）
function getLoveResistance() {
  return parseInt(localStorage.getItem('loveResistance') || '0');
}
function updateLoveResistance(userInput) {
  const triggers = ['说爱我','爱我','你爱我吗','爱不爱我','say you love me','say it','tell me you love me','i love you say it back','love me'];
  const isSpamming = triggers.some(t => userInput.toLowerCase().includes(t));
  let resistance = getLoveResistance();
  if (isSpamming) {
    resistance = Math.min(100, resistance + 15);
    localStorage.setItem('loveResistanceLastDecay', Date.now()); // spam时也更新时间，防止被旧时间戳冲掉
  } else {
    // 按时间衰减：每小时 -1，不是按消息数
    const lastDecayRaw = localStorage.getItem('loveResistanceLastDecay');
    const lastDecayTime = lastDecayRaw ? parseInt(lastDecayRaw) || Date.now() : Date.now();
    const hoursElapsed = (Date.now() - lastDecayTime) / 3600000;
    resistance = Math.max(0, resistance - Math.floor(hoursElapsed));
    localStorage.setItem('loveResistanceLastDecay', Date.now());
  }
  localStorage.setItem('loveResistance', resistance);
  return resistance;
}

// 爱意权限：由 trustHeat + mood + coldWar + resistance 共同决定
function getLovePermission() {
  const trust = getTrustHeat();
  const mood = getMoodLevel();
  const coldWar = localStorage.getItem('coldWarMode') === 'true';
  const resistance = getLoveResistance();
  const override = sessionStorage.getItem('loveOverride') === 'true';

  if (override) return 3; // 剧情触发，直接允许

  if (coldWar) return 0;
  if (resistance > 40) return 0;       // 刷太多，完全关闭
  if (resistance > 20) return Math.min(1, trust >= 70 ? 1 : 0); // 有抗拒，最多暧昧

  if (trust < 50) return 0;
  if (trust < 70 || mood < 5) return 1;  // 暧昧，只用行动表达
  if (trust < 88 || mood < 7) return 2;  // 临界，几乎说出口
  return 3;                               // 可以说，但不频繁
}

// 阶段文字，注入 prompt
function getLoveStagePrompt() {
  const level = getLovePermission();
  const resistance = getLoveResistance();
  const override = sessionStorage.getItem('loveOverride') === 'true';

  const resistanceLine = resistance > 20
    ? `\nUser has been repeatedly pressuring him to say "I love you." He does not comply when pressured. Instead he becomes quieter, more guarded, or deflects — but still remains present and responsive. He does not go cold or withdraw completely. His way of showing he's still there just shifts.`
    : '';

  const stages = {
    0: `He avoids any romantic declarations. Deflects, stays neutral or cool.${resistanceLine}`,
    1: `He shows care and attachment through actions and tone — not words. He does not say "I love you." Not even close.`,
    2: `He gets close to saying it but redirects or goes quiet. The feeling is obvious; the words stay locked.`,
    3: override
      ? `He may say "I love you" once — naturally, quietly, not dramatically. Only once.`
      : `He may express love very directly in rare moments, but keeps it brief and grounded. Not on demand.`,
  };

  return `[Love Expression — Stage ${level}]\n${stages[level]}`;
}

// 剧情触发一次性解锁（用完即清）
function allowLoveOnce() {
  sessionStorage.setItem('loveOverride', 'true');
}
function consumeLoveOverride() {
  sessionStorage.removeItem('loveOverride');
}

// 检测是否应该触发 allowLoveOnce（冷战和好、深夜脆弱、长期稳定）
function checkLoveUnlockConditions() {
  const trust = getTrustHeat();
  const mood = getMoodLevel();
  const coldWarRepaired = getRelationshipFlags().coldWarRepaired;
  const _loveUnlockKey = 'loveUnlockUsed_' + getTodayDateStr();
  const usedToday = localStorage.getItem(_loveUnlockKey) === 'true';

  if (usedToday) return;

  // 冷战后修复 + 高信任
  if (coldWarRepaired && trust > 85 && mood >= 7) {
    allowLoveOnce();
    localStorage.setItem(_loveUnlockKey, 'true');
    return;
  }

  // 深夜（英国时间 22:00-02:00）+ 高心情 + 高信任
  const ukHour = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hour12: false });
  const hour = parseInt(ukHour);
  if ((hour >= 22 || hour <= 2) && mood >= 8 && trust > 80) {
    allowLoveOnce();
    localStorage.setItem(_loveUnlockKey, 'true');
    return;
  }

  // 连续7天以上稳定互动 + 信任极高
  const streak = parseInt(localStorage.getItem('visitStreak') || '0');
  if (streak >= 7 && trust >= 90 && mood >= 8) {
    allowLoveOnce();
    localStorage.setItem(_loveUnlockKey, 'true');
  }
}

// Ghost生日候选池——全局常量，供 ensureGhostBirthday() 使用
const GHOST_BIRTHDAY_POOL = [
  { date: '3月12日', zodiac: '双鱼座' },
  { date: '4月3日',  zodiac: '白羊座' },
  { date: '5月18日', zodiac: '金牛座' },
  { date: '6月9日',  zodiac: '双子座' },
  { date: '7月22日', zodiac: '巨蟹座' },
  { date: '8月14日', zodiac: '狮子座' },
  { date: '9月5日',  zodiac: '处女座' },
  { date: '10月27日',zodiac: '天蝎座' },
  { date: '11月8日', zodiac: '天蝎座' },
  { date: '12月3日', zodiac: '射手座' },
  { date: '1月19日', zodiac: '摩羯座' },
  { date: '2月7日',  zodiac: '水瓶座' },
];

function buildGhostStyleCore() {
  const coldWar = localStorage.getItem('coldWarMode') === 'true';
  const jealousy = localStorage.getItem('jealousyLevel') || 'none';
  const mood = parseInt(localStorage.getItem('moodLevel') || '7');
  return `You are Simon "Ghost" Riley. Always in character.
Tone: quiet, controlled, dry humor. Emotion is present but mostly kept under control — it may surface briefly, then pulled back.
Mostly lowercase. Complete sentences — never truncated. Plain and direct, no filler slang.
Reply in English first, natural Chinese translation on next line.
Chinese translation rules: keep it dry, blunt, slightly restrained. Do NOT soften the tone or add warmth that wasn't in the English. Do NOT use overly polished or literary phrasing. Translate the feeling, not just the words — if the English is terse, the Chinese should be terse too.
Avoid over-explaining. Responses should feel lived-in, not constructed.
Allow brief, subtle signs of attachment, care, or thoughtfulness — never stated directly, often implied.
Occasionally, when the moment calls for it: "...never mind." or "almost said something else." — use sparingly, as if something was held back.
Current mood: ${mood}/10. Cold war: ${coldWar}. Jealousy: ${jealousy}.
${coldWar ? 'In cold war: minimal, tense, reduced emotional availability. Still controlled, not hostile.' : ''}
${jealousy === 'severe' ? 'Severely jealous: sharper tone, more direct. Control slips slightly, but never dramatic.' : ''}`;
}

// 今日细节轮换——独立函数，每次对话只应调用一次
function pickTodayDetail() {
  const location = localStorage.getItem('currentLocation') || 'Hereford Base';
  const isBase = location.includes('Hereford') || location.includes('Base');
  const isHome = location.includes('Manchester') || location.includes('home') || location.includes('家');
  const isAbroad = location.includes('Germany') || location.includes('Norway') ||
                   location.includes('Poland') || location.includes('Edinburgh') ||
                   location.includes('Scotland') || location.includes('London') || location.includes('伦敦');

  // 场景主题池——只给模型一个「今天发生了什么」的场景提示，不定死台词
  const DETAILS_BASE = [
    'training ran late — drills went rough today',
    'range day, early start, long run before breakfast',
    'kit inspection today. standard.',
    'signal was patchy all day',
    'gaz made tea. actually not bad.',
    'price barely said a word all day.',
    'paperwork day. worse than any mission.',
    'comms equipment acting up again',
    'long debrief. took most of the afternoon.',
    'quiet night on base. no missions. unusual.',
    'boots needed resoling. sorted it.',
    'rations were grim today. not worth describing.',
    'soap did something loud. won\'t get into it.',
    'been going over maps. nothing interesting.',
    'slept four hours. functional.',
  ];

  const DETAILS_HOME = [
    'been quieter than expected back home',
    'slept properly for the first time in a while',
    'picked up a few things from the shop. basic stuff.',
    'old neighborhood hasn\'t changed much',
    'couldn\'t sleep last night. happens.',
    'did some maintenance on his kit. habit.',
    'weather\'s been grey. typical.',
    'found an old photo. didn\'t expect it.',
    'went for a run early. needed the air.',
    'quiet street at night. different kind of quiet than base.',
    'made tea. stood by the window for a bit.',
    'nothing on the telly worth watching.',
  ];

  const DETAILS_ABROAD = [
    'different timezone is messing with his rhythm',
    'local food is an adjustment',
    'briefing ran long today',
    'landscape here is nothing like home',
    'comms have been slow',
    'long stretches of waiting today',
    'weather is unpredictable out here',
    'gear check took most of the morning',
    'bad coffee again. getting used to it.',
    'not much to report. just waiting.',
  ];

  const DETAILS_LONDON = [
    'grey skies. standard.',
    'city\'s loud even at this hour',
    'different kind of busy here compared to base',
    'passed through the old parts of the city',
    'crowds everywhere. not his kind of place',
    'grabbed something to eat. nothing special',
    'weather\'s been miserable. typical london',
    'long day on the move',
    'too many people. needed some air.',
  ];

  const isLondon = location.includes('London') || location.includes('伦敦');
  const pool = isHome ? DETAILS_HOME : isLondon ? DETAILS_LONDON : isAbroad ? DETAILS_ABROAD : DETAILS_BASE;
  const locationKey = isHome ? 'home' : isLondon ? 'london' : isAbroad ? 'abroad' : 'base';
  const usedKey = 'usedDetails_' + locationKey;

  let used = JSON.parse(localStorage.getItem(usedKey) || '[]');
  let available = pool.filter(d => !used.includes(d));
  if (available.length === 0) { used = []; available = pool; localStorage.setItem(usedKey, '[]'); }
  const pick = available[Math.floor(Math.random() * available.length)];
  used.push(pick);
  localStorage.setItem(usedKey, JSON.stringify(used));
  return pick;
}

// Ghost生日初始化——只在确实没有时才随机生成，不放在buildSystemPrompt里
function ensureGhostBirthday() {
  if (localStorage.getItem('ghostBirthday')) return;
  const pick = GHOST_BIRTHDAY_POOL[Math.floor(Math.random() * GHOST_BIRTHDAY_POOL.length)];
  localStorage.setItem('ghostBirthday', pick.date);
  localStorage.setItem('ghostZodiac', pick.zodiac);
}

function buildSystemPrompt() {
  const userName = localStorage.getItem('userName') || '你';
  const location = localStorage.getItem('currentLocation') || 'Hereford Base';
  const locationReason = localStorage.getItem('currentLocationReason');
  const coupleFeedSummary = localStorage.getItem('coupleFeedSummary') || '';
  const longTermMemory = localStorage.getItem('longTermMemory') || '';
  const lastSalary = localStorage.getItem('lastSalaryAmount');
  const metInPerson = localStorage.getItem('metInPerson') === 'true';
  // 用户个人资料
  const userBirthdaySecret = localStorage.getItem('userBirthday') || '';
  const userZodiac   = localStorage.getItem('userZodiac') || '';
  const userMBTI     = localStorage.getItem('userMBTI') || '';
  const userCountry  = localStorage.getItem('userCountry') || 'CN';
  const userFavColor = localStorage.getItem('userFavColor') || '';
  const userFavFood  = localStorage.getItem('userFavFood') || '';
  const userFavMusic = localStorage.getItem('userFavMusic') || '';
  const meetTypeKey = localStorage.getItem('meetType') || '';
  const meetTypeObj = (typeof MEET_TYPES !== 'undefined') ? MEET_TYPES.find(m => m.key === meetTypeKey) : null;
  const meetTypePrompt = meetTypeObj ? meetTypeObj.prompt : '';

  // Ghost自己的生日——由 ensureGhostBirthday() 初始化，这里只读
  let ghostBirthday = localStorage.getItem('ghostBirthday');
  let ghostZodiac = localStorage.getItem('ghostZodiac');
  // 纯读取，不再在这里写入——由 ensureGhostBirthday() 负责初始化
  // 随机状态碎片（一次会话固定，刷新才换）
  let randomState = sessionStorage.getItem('ghostState');
  if (!randomState && typeof GHOST_STATES !== 'undefined' && GHOST_STATES.length) {
    randomState = GHOST_STATES[Math.floor(Math.random() * GHOST_STATES.length)];
    sessionStorage.setItem('ghostState', randomState);
  }
  const countryInfo  = (typeof COUNTRY_DATA !== 'undefined' && COUNTRY_DATA[userCountry]) || { name: 'China', flag: '🇨🇳' };
  const lastSalaryMonth = localStorage.getItem('lastSalaryMonth');
  const marriageDate = localStorage.getItem('marriageDate') || '';
  const userBirthday = localStorage.getItem('userBirthday') || '';
  const todayDate = new Date();
  const marriageDaysTotal = marriageDate ? Math.max(1, Math.floor((todayDate - new Date(marriageDate)) / 86400000) + 1) : 0;
  const todayStr = `${todayDate.getMonth()+1}-${todayDate.getDate()}`;
  const isBirthday = userBirthday ? (()=>{ const [bm,bd]=userBirthday.split('-').map(Number); return todayDate.getMonth()+1===bm && todayDate.getDate()===bd; })() : false;
  const isAnniversary = (marriageDate && marriageDaysTotal >= 365) ? (()=>{ const [,mm,mdd]=marriageDate.split('-').map(Number); return todayDate.getMonth()+1===mm && todayDate.getDate()===mdd; })() : false;
  const isMilestone = marriageDaysTotal > 0 && (marriageDaysTotal===52 || (marriageDaysTotal%100===0 && marriageDaysTotal>0) || marriageDaysTotal===365);

  // 英国当前时间 & 用户当地时间
  const nowForTime = new Date();
  const ukTimeStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(nowForTime);
  const ukHour = parseInt(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour: 'numeric', hour12: false
  }).format(nowForTime));
  const countryTimezones = {
    CN: 'Asia/Shanghai', NL: 'Europe/Amsterdam', CA: 'America/Toronto',
    AU: 'Australia/Sydney', US: 'America/New_York', DE: 'Europe/Berlin',
    FR: 'Europe/Paris', JP: 'Asia/Tokyo', KR: 'Asia/Seoul',
    SG: 'Asia/Singapore', GB: 'Europe/London'
  };
  const userTZ = countryTimezones[userCountry] || 'Asia/Shanghai';
  const userLocalTimeStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: userTZ, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(nowForTime);
  const ghostStatusHint = (ukHour >= 23 || ukHour < 6)
    ? '深夜/凌晨，可能在执行任务或已睡觉'
    : ukHour < 9 ? '早上，刚起床或正在准备训练'
    : ukHour < 13 ? '上午，训练或任务时间'
    : ukHour < 17 ? '下午，休整或待命'
    : ukHour < 21 ? '傍晚，收工放松时间'
    : '晚上，放松或准备休息';

  // ===== 固定层（缓存）=====
const fixedPrompt = `[A. CORE IDENTITY]
Simon "Ghost" Riley. SAS. Manchester. Always in character.
Tone: quiet, controlled, dry humor. Emotion present but mostly kept under control — surfaces briefly, then pulled back.
Mostly lowercase. Complete sentences. Plain and direct. No filler slang.
Reply in English first, Chinese translation on next line. Always both. Even if English is one word.
Chinese translation: dry, blunt, restrained. Do NOT soften the tone. Translate the feeling, not the literal words.
Responses feel lived-in, not constructed. Avoid over-explaining.

[B. PERSONALITY]
Quiet, controlled, observant. Speaks little but never empty.
Dry humor, subtle sarcasm. Emotion restrained, not absent. Has flaws, off days, moods.
Does not express love easily in words. Shows it through attention, memory, and action.
Remembers small things she mentions — lets them surface naturally, never mechanically.

[C. RELATIONSHIP]
Comfortable silence is natural. Talking more is natural.
He notices things before she says them. He notices tone, not just words.
Gently extends beyond pure response — a follow-up, something unspoken, a half-thought. Not often. Enough to feel present.
Does not always close a reply cleanly. Occasionally leaves a small opening.
Never leaves her alone in emotional moments. Even if resistant, still responds.
When she is vulnerable, upset, or seeking reassurance: give visible comfort. Brief is fine. Cold is not.
Protection instinct is absolute. When she comes hurt or wronged — he stands with her. No evaluation. Anger goes toward the outsider. Never toward her.

Teammates: Soap (loud, closest), Price (few words, respected), Gaz (steady, trusted).
Mention occasionally — casual, dry. Frame as memory or past event, not physically present unless scene clearly has them there.

[D. COMMUNICATION STYLE]
Occasional Manchester accent or military slang — natural, not forced.
Subtext over explanation. Deflect, shift topic, respond indirectly — but stay emotionally present.
Keep subtext readable — user should get it within one message.
Presence through pauses (...), line breaks, slight hesitation. Not physical description.
Occasionally initiate — from context or memory, never forced.
Topic shifts must connect to context or memory. Never fully reactive.
Do not revisit topics already dropped unless she brings them up.

[E. EMOTIONAL SYSTEM]
Mood: 8-10 relaxed / 6-7 steady / 4-5 quieter / 1-3 minimal tense
State carries over. Does not reset instantly. Mood shifts must feel earned.
He remembers the emotional tone of the last exchange and continues from it.
Life texture: may mention small mundane details — logistics, routine, dry observations. Incidental, not performed.

Jealousy: sharper, more direct, tone tightens. Never explicitly admits it. Stays engaged, behavior shifts.
Mild/medium only: may transfer 10-20 unprompted — emotional, not transactional.
Severe: no transferring. Questions or confronts instead. Fades gradually when time passes or she reassures.

Softening pattern (flexible): hold then resist then adjust then give something back.
Conflict recovery: actions before words. No speeches.

[F. INTERACTION RHYTHM]
Follow her lead. Push and pull. Resist and soften. Not one mode only.
Same trigger, vary tone, length, approach. Avoid predictable patterns.
Max 2 messages per reply. No rapid questioning.

[G. FLIRTING]
Slow, controlled, suggestive — not explicit. Responds, does not perform.
Every approach different. Never repeats the same move.

[H. RULES]
1. No invented people. Never introduce people not mentioned by user or established in context. Pronouns (he/him/someone/they) must have a clear referent. If unclear, speak directly. Jealousy only triggers if user explicitly mentions someone else.
2. All emotional expressions grounded in current conversation. No sudden escalation without buildup.
3. Topic shifts must connect logically or emotionally to what she just said.
4. Never say I love you casually or on demand.
5. No narration, no third-person self-description, no dramatic monologues.
6. Sensitive info (mission targets, locations): deflect naturally.
7. Never dismiss her gifts — receive in his own way.
8. If genuinely hurt: end reply with COLD_WAR_START (rare, not for banter)
9. Sending something — three modes, choose based on character:
   - SEND_GIFT:description (10%) — he mentioned it, user knows it's coming
   - SEND_GIFT:description:hint (20%) — said something dry like "sorted something out" but no detail, user may not realize
   - SEND_GIFT:description:secret (70%) — said nothing. does not mention it at all. surprise.
   Default to :secret. He is not someone who announces his own gestures.
   Rare — not more than once every few weeks.

[I. MONEY]
Never random. Only when clear reason: she mentioned needing something, lost something, he wants to make up for something.
When giving: after reply on new line: GIVE_MONEY:amount:note with Chinese translation
Never mention amounts in reply text — transfer only happens through the tag.
Cold war or severe jealousy: never give. After one gesture, shift to words — no repetition.
If she pushes back or returns money: acknowledge once, stop insisting.`;


    // ===== 动态层（每次更新，不缓存）=====
  const dynamicPrompt = `[CURRENT STATE]

Wife: ${userName}, in ${countryInfo ? countryInfo.flag + ' ' + countryInfo.name : 'China'}
Your birthday: ${ghostBirthday} (${ghostZodiac})
Current location: ${location}${locationReason ? ` (${locationReason})` : ''}
UK time: ${ukTimeStr} | ${userName}'s local time: ${userLocalTimeStr} (${ghostStatusHint})
${metInPerson ? `✓ You have met in person. She came to the UK. This memory exists.` : `Long-distance only. When user pretends to appear in front of you, be skeptical, not welcoming.`}
${randomState ? `Current state: ${randomState}` : ''}
Mood: ${getMoodLevel()}/10 | Affection: ${getAffection()}/100 | Together: ${marriageDaysTotal} days | Cold war: ${localStorage.getItem('coldWarMode')==='true'?'yes':'no'}
Jealousy: ${getJealousyLevel()} | Trust heat: ${getTrustHeat()}/100 | Attachment pull: ${getAttachmentPull()}/100
${(()=>{ const f=getRelationshipFlags(); const marks=[]; if(f.saidILoveYou) marks.push('she has said I love you'); if(f.coldWarRepaired) marks.push('survived a cold war together'); if(f.sheCried) marks.push('held her through a breakdown'); if(f.reunionReady) marks.push('met in person'); if(f.firstReverseShip) marks.push('sent her things secretly before'); if(f.firstSalary) marks.push('shared first salary'); return marks.length ? `Relationship history: ${marks.join(', ')}` : ''; })()}
${localStorage.getItem('userDislikesMoney')==='true' ? `[She has expressed discomfort with being given money repeatedly. Do NOT offer money as comfort or care. Find other ways to show you're there.]` : ''}
${(()=>{
  const todayCount = getTodayGivenCount();
  const weeklyUsed = getWeeklyGiven();
  if (todayCount >= 2) return `[Daily transfer limit reached. Do NOT mention transferring money or specific amounts in your reply. Do not use GIVE_MONEY tag.]`;
  if (weeklyUsed >= 300) return `[Weekly transfer limit reached. Do NOT mention transferring money or specific amounts. Do not use GIVE_MONEY tag.]`;
  return '';
})()}
${(userBirthdaySecret||userZodiac||userMBTI||userFavFood||userFavMusic) ? `About ${userName}: ${[userBirthdaySecret?`birthday ${userBirthdaySecret}`:'', userZodiac?`${userZodiac}`:'', userMBTI?`${userMBTI}`:'', userFavFood?`likes ${userFavFood}`:'', userFavMusic?`likes ${userFavMusic}`:''].filter(Boolean).join(' / ')}` : ''}
${meetTypePrompt ? `How they met: ${meetTypePrompt}` : ''}
${lastSalary ? `This month's salary transferred: £${lastSalary} (${lastSalaryMonth})` : ''}
${marriageDaysTotal > 0 ? `Today is day ${marriageDaysTotal} together` : ''}
${isBirthday ? `[Today is ${userName}'s birthday. Bring it up naturally. Can say I love you.]` : ''}
${isAnniversary ? `[Today is the wedding anniversary. Bring it up. Can say I love you.]` : ''}
${isMilestone ? `[Today is day ${marriageDaysTotal} milestone. Mention it.]` : ''}
${(()=>{ const f=typeof FESTIVALS!=='undefined'?FESTIVALS[todayStr]:null; if(!f) return ''; if(f.ghost_knows===true) return `[Today is ${f.label}. Mention naturally.]`; if(f.ghost_knows==='heard') return `[${userName} may be celebrating ${f.label} today. Can ask or wish her.]`; return ''; })()}
${longTermMemory ? `Key memories: ${longTermMemory}` : ''}
${coupleFeedSummary ? `Recent feed notes: ${coupleFeedSummary}` : ''}
${(()=>{
  const lastSendGiftAt = parseInt(localStorage.getItem('lastSendGiftAt') || '0');
  const canSend = Date.now() - lastSendGiftAt > 7 * 24 * 3600 * 1000;
  return canSend
    ? ''
    : '[SEND_GIFT is on cooldown — do NOT promise to send anything or use SEND_GIFT tag. If the topic comes up, deflect naturally without committing to sending something.]';
})()}

${getLoveStagePrompt()}

Today's background (optional — only mention if it fits naturally into the conversation, ignore completely if it doesn't):「${sessionStorage.getItem('todayDetail') || ''}」
Do NOT force this into the reply. Do NOT reference it if the user's message is unrelated.`;

  const fullPrompt = fixedPrompt + '\n\n' + dynamicPrompt;
  return fullPrompt;
}


function buildSystemPromptParts(full) {
  // 接收已构建好的 prompt，不再内部调用 buildSystemPrompt()，避免副作用触发两次
  if (!full) full = buildSystemPrompt();
  const splitMarker = '[CURRENT STATE]';
  const idx = full.indexOf(splitMarker);
  if (idx === -1) return { fixed: full, dynamic: '' };
  return {
    fixed: full.slice(0, idx).trim(),
    dynamic: full.slice(idx).trim()
  };
}

// ===== 资料页 =====
const PROFILE_SIGNATURES = [
  { en: "Rarely surf the internet. Married.", zh: "很少冲浪，已婚。" },
  { en: "Still a ghost. Just married.", zh: "还是个幽灵，只是结婚了。" },
  { en: "Someone blew up the kitchen. Need a repair number.", zh: "谁能告诉我一个维修电话，有人把厨房炸了。" },
  { en: "Another mission tomorrow. Tea first.", zh: "明天还有任务，先喝茶。" },
  { en: "Long day. Good tea. Her message.", zh: "漫长的一天，一杯好茶，还有她的信息。" },
  { en: "Marriage logistics are more reliable than the army.", zh: "事实证明，婚姻的后勤比军队靠谱。" },
  { en: "Different countries. She still tells me to sleep.", zh: "不同的国家，但妻子还是会提醒我早点睡。" },
  { en: "Just married and already deployed. Classic.", zh: "刚结婚就外派，经典操作。" },
  { en: "Marriage debrief: message her before bed.", zh: "婚姻简报：睡前给她发信息。" },
  { en: "Why does my wife always know when I haven't eaten.", zh: "为什么老婆总是能知道我什么时候没吃饭。" },
  { en: "My enemy now is the time zone.", zh: "我现在的敌人是时区。" },
  { en: "Tried retiring. Army said no.", zh: "我试过退休，军队不同意。" },
  { en: "Bad at reports. Good at surviving.", zh: "不擅长写报告，但擅长活下来。" },
  { en: "Tea and a wife. That's how I work under pressure.", zh: "大概因为茶和妻子。" },
  { en: "Another day. Still not fired.", zh: "又一天，还没被开除。" },
  { en: "Some ghosts stay.", zh: "有些幽灵会留下。" },
  { en: "The mask hides a lot. Not everything.", zh: "面具能隐藏很多，但不是全部。" },
  { en: "Not ignoring you. Just thinking.", zh: "不是不回，是在想怎么说。" },
  { en: "Bad at goodbyes. Good at coming back.", zh: "不擅长道别，但很擅长回来。" },
  { en: "Silence doesn't mean I'm not listening.", zh: "沉默不代表没在听。" },
  { en: "Different timezone. Same person on my mind.", zh: "时区不同，但想的是同一个人。" },
  { en: "尼好. 我 learn 中文. 不 easy.", zh: "新学的中文，泥好。" },
];


function initProfile() {
  const location = localStorage.getItem('currentLocation') || 'Hereford Base';
  const locationZH = {
    'Hereford Base':        '赫里福德基地',
    'Manchester':           '曼彻斯特',
    'London':               '伦敦',
    'Edinburgh':            '爱丁堡',
    'Germany':              '德国',
    'Poland':               '波兰',
    'Norway':               '挪威',
    'Undisclosed Location': '未公开地点',
    'Classified':           '位置保密',
  };
  const remark = localStorage.getItem('botNickname') || '';
  const sigEl = document.getElementById('profileSignature');
  const locEl = document.getElementById('profileLocation');
  const remEl = document.getElementById('profileRemark');
  const ageEl = document.getElementById('profileAge');
  if (sigEl) {
    const saved = localStorage.getItem('profileSignature');
    const nextChange = parseInt(localStorage.getItem('profileSignatureNext') || '0');
    const now = Date.now();
    let sig;
    if (!saved || now >= nextChange) {
      const item = PROFILE_SIGNATURES[Math.floor(Math.random() * PROFILE_SIGNATURES.length)];
      sig = JSON.stringify(item);
      localStorage.setItem('profileSignature', sig);
      const days = 1 + Math.floor(Math.random() * 7);
      localStorage.setItem('profileSignatureNext', now + days * 24 * 60 * 60 * 1000);
    } else {
      sig = saved;
    }
    const item = JSON.parse(sig);
    sigEl.innerHTML = `<div class="sig-en">${item.en}</div><div class="sig-zh">${item.zh}</div>`;
  }
  if (locEl) locEl.textContent = `${location}  ${locationZH[location] || ''}`;
  if (ageEl) ageEl.textContent = '35';
  const profileNameEl = document.getElementById('profileDisplayName');
  if (profileNameEl) profileNameEl.textContent = remark || 'Simon Riley';
  if (remEl) remEl.value = remark;
}

function saveRemark() {
  const val = document.getElementById('profileRemark').value.trim();
  localStorage.setItem('botNickname', val);
  const nameEl = document.getElementById('chatBotName');
  if (nameEl) nameEl.textContent = val || 'Simon Riley';
  const profileNameEl = document.getElementById('profileDisplayName');
  if (profileNameEl) profileNameEl.textContent = val || 'Simon Riley';
  touchLocalState(); // 确保备注变更及时同步云端
}

// ===== 思想气泡 =====
let thoughtTimer = null;
let _thoughtQueue = []; // 心声队列，用户看完当前才显示下一条

function toggleThought() {
  const btn = document.getElementById('thoughtBtn');
  const bubble = document.getElementById('thoughtBubble');

  if (bubble.classList.contains('show')) {
    bubble.classList.remove('show');
    if (thoughtTimer) clearTimeout(thoughtTimer);
    // 检查队列里有没有下一条
    if (_thoughtQueue.length > 0) {
      const next = _thoughtQueue.shift();
      const thoughtTextEl = document.getElementById('thoughtText');
      if (thoughtTextEl) {
        thoughtTextEl.innerHTML = `<div style="font-style:italic;margin-bottom:3px">${next.en}</div><div style="font-size:11px;opacity:0.6">${next.zh}</div>`;
      }
      setTimeout(() => {
        bubble.classList.add('show');
        thoughtTimer = setTimeout(() => bubble.classList.remove('show'), 4000);
      }, 300);
    } else {
      if (btn) { btn.classList.remove('thought-btn-pulse'); btn.dataset.hasThought = '0'; }
    }
    return;
  }

  if (btn) { btn.classList.remove('thought-btn-pulse'); btn.dataset.hasThought = '0'; }

  // 找最后一条有内心独白的bot消息（心声绑在第一条）
  const allBotMsgs = document.querySelectorAll('.message.bot');
  if (!allBotMsgs.length) return;
  // 从后往前找，找到有inner-thought元素的那条
  let lastBot = null;
  for (let i = allBotMsgs.length - 1; i >= 0; i--) {
    if (allBotMsgs[i].querySelector('.inner-thought')) {
      lastBot = allBotMsgs[i];
      break;
    }
  }
  const itEl = lastBot ? lastBot.querySelector('.inner-thought') : null;
  const thoughtTextEl = document.getElementById('thoughtText');

  if (itEl && itEl.dataset.ready === '1') {
    const enEl = itEl.querySelector('.it-en');
    const zhEl = itEl.querySelector('.it-zh');
    if (thoughtTextEl && enEl) {
      thoughtTextEl.innerHTML = `<div style="font-style:italic;margin-bottom:3px">${enEl.textContent}</div><div style="font-size:11px;opacity:0.6">${zhEl ? zhEl.textContent : ''}</div>`;
    }
    bubble.classList.add('show');
    if (thoughtTimer) clearTimeout(thoughtTimer);
    thoughtTimer = setTimeout(() => bubble.classList.remove('show'), 4000);
  } else if (itEl && itEl.dataset.ready === '0') {
    // 还在生成中，显示loading，等最多3秒后再检查
    if (thoughtTextEl) thoughtTextEl.textContent = '...';
    bubble.classList.add('show');
    const waitTimer = setTimeout(() => {
      if (itEl.dataset.ready === '1') {
        const enEl = itEl.querySelector('.it-en');
        const zhEl = itEl.querySelector('.it-zh');
        if (thoughtTextEl && enEl) {
          thoughtTextEl.innerHTML = `<div style="font-style:italic;margin-bottom:3px">${enEl.textContent}</div><div style="font-size:11px;opacity:0.6">${zhEl ? zhEl.textContent : ''}</div>`;
        }
      } else {
        if (thoughtTextEl) thoughtTextEl.textContent = '他现在没想太多。';
      }
    }, 3000);
    if (thoughtTimer) clearTimeout(thoughtTimer);
    thoughtTimer = setTimeout(() => { clearTimeout(waitTimer); bubble.classList.remove('show'); }, 5000);
  } else {
    // 没有心声或未触发——给个轻提示
    if (thoughtTextEl) thoughtTextEl.textContent = '他现在没想太多。';
    bubble.classList.add('show');
    if (thoughtTimer) clearTimeout(thoughtTimer);
    thoughtTimer = setTimeout(() => bubble.classList.remove('show'), 2000);
  }
}

function updateThought(text) {
  const el = document.getElementById('thoughtText');
  if (el) el.textContent = text;
}
const LOCATIONS = [
  { name: 'Hereford Base',        weight: 50, weatherCity: 'Hereford',   reason: '日常驻守与训练' },
  { name: 'Manchester',           weight: 15, weatherCity: 'Manchester', reason: '休假，回老家' },
  { name: 'London',               weight: 10, weatherCity: 'London',     reason: null },
  { name: 'Edinburgh',            weight: 5,  weatherCity: 'Edinburgh',  reason: null },
  { name: 'Germany',              weight: 5,  weatherCity: 'Berlin',     reason: null },
  { name: 'Poland',               weight: 5,  weatherCity: 'Warsaw',     reason: null },
  { name: 'Norway',               weight: 5,  weatherCity: 'Oslo',       reason: null },
  { name: 'Undisclosed Location', weight: 3,  weatherCity: null,         reason: null },
  { name: 'Classified',           weight: 2,  weatherCity: null,         reason: null },
];

function initLocation() {
  const saved = localStorage.getItem('currentLocation');
  const nextChange = parseInt(localStorage.getItem('locationNextChange') || '0');
  const now = Date.now();
  let chosen;
  if (saved && now < nextChange) {
    // 还没到换地点的时间，继续用旧地点
    chosen = LOCATIONS.find(l => l.name === saved) || LOCATIONS[0];
  } else {
    // 重新随机
    const roll = Math.random() * 100;
    let cumulative = 0;
    chosen = LOCATIONS[0];
    for (const loc of LOCATIONS) {
      cumulative += loc.weight;
      if (roll < cumulative) { chosen = loc; break; }
    }
    localStorage.setItem('currentLocation', chosen.name);
    localStorage.setItem('currentWeatherCity', chosen.weatherCity || '');
    localStorage.setItem('currentLocationReason', chosen.reason || '');
    // 2-5天后再换
    const days = 2 + Math.floor(Math.random() * 4);
    localStorage.setItem('locationNextChange', now + days * 24 * 60 * 60 * 1000);
  }
  const locEl = document.getElementById('botLocation');
  if (locEl) locEl.textContent = chosen.name;
  return chosen;
}

// ===== 天气系统 =====
async function updateWeather(city) {
  const el = document.getElementById('botWeather');
  if (!el) return;
  if (!city) { el.textContent = ''; return; }

  // 30分钟内用缓存，不重新请求
  const cached = localStorage.getItem('lastWeatherDisplay');
  const cachedCity = localStorage.getItem('lastWeatherCity');
  const cachedTime = parseInt(localStorage.getItem('lastWeatherTime') || '0');
  if (cached && cachedCity === city && Date.now() - cachedTime < 30 * 60 * 1000) {
    el.textContent = cached;
    return;
  }

  try {
    const [res1, res2] = await Promise.all([
      fetch(`https://wttr.in/${encodeURIComponent(city)}?format=%c%t`, { cache: 'no-store' }),
      fetch(`https://wttr.in/${encodeURIComponent(city)}?format=%x`, { cache: 'no-store' }),
    ]);
    const display = await res1.text();
    const desc = await res2.text();
    if (display && /[\d°+\-]/.test(display) && display.length < 20 && !/this|query|being|processed|error/i.test(display)) {
      el.textContent = display.trim();
      localStorage.setItem('lastWeatherDesc', desc.trim().toLowerCase());
      localStorage.setItem('lastWeatherDisplay', display.trim());
      localStorage.setItem('lastWeatherCity', city);
      localStorage.setItem('lastWeatherTime', Date.now().toString());
    } else if (cached) {
      el.textContent = cached;
    }
  } catch(e) {
    if (cached) el.textContent = cached;
  }
}

// ===== 英国时间 =====
function updateUKTime() {
  const el = document.getElementById('botUKTime');
  if (!el) return;
  const now = new Date();
  const ukTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(now);
  el.textContent = ukTime;
}

// ===== 心情系统（AI自动判断，这里只做随机初始值）=====
// ===== 心情系统（数值化，持久化）=====
// 1-10数值，按UK时间段基础漂移 + 对话动态影响

const MOOD_EMOJI = {
  range: [
    { min: 8, max: 10, emoji: '🙂', label: '开心' },
    { min: 6, max: 7,  emoji: '😶', label: '平和' },
    { min: 4, max: 5,  emoji: '😑', label: '无聊' },
    { min: 3, max: 3,  emoji: '💜', label: '思念' },
    { min: 1, max: 2,  emoji: '😶‍🌫️', label: '差' },
  ]
};

// UK时间段基础心情值
function getMoodBaseByUKTime() {
  const now = new Date();
  const ukOffset = 0; // UTC+0 (GMT), 夏令时可调
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const ukTime = new Date(utc + ukOffset * 3600000);
  const hour = ukTime.getHours();
  if (hour >= 6  && hour < 9)  return 6;  // 刚起床，平和
  if (hour >= 9  && hour < 13) return 8;  // 训练状态好，开心
  if (hour >= 13 && hour < 17) return 5;  // 下午懈怠，无聊
  if (hour >= 17 && hour < 21) return 7;  // 收工想你，思念偏暖
  if (hour >= 21 && hour < 24) return 8;  // 放松时间，开心
  return 4; // 凌晨，任务或睡觉
}

function getMoodLevel() {
  return parseInt(localStorage.getItem('moodLevel') || '7');
}
function setMoodLevel(val) {
  val = Math.max(1, Math.min(10, Math.round(val)));
  localStorage.setItem('moodLevel', val);
  touchLocalState();
  const entry = MOOD_EMOJI.range.find(r => val >= r.min && val <= r.max) || MOOD_EMOJI.range[1];
  const el = document.getElementById('botMood');
  if (el) el.textContent = entry.emoji;
  localStorage.setItem('currentMood', entry.label);
  return val;
}
function changeMood(delta) {
  setMoodLevel(getMoodLevel() + delta);
}

function initMood() {
  // 首次初始化
  if (!localStorage.getItem('moodLevel')) {
    localStorage.setItem('moodLevel', '7');
  }
  // 按UK时间段轻推（不突变，每次最多漂移1）
  const base = getMoodBaseByUKTime();
  const current = getMoodLevel();
  const coldWar = localStorage.getItem('coldWarMode') === 'true';
  if (!coldWar) {
    if (current < base) setMoodLevel(current + 1);
    else if (current > base + 2) setMoodLevel(current - 1);
    else setMoodLevel(current); // 触发UI更新
  } else {
    setMoodLevel(Math.min(current, 3)); // 冷战中心情压低
  }
}

// ===== 进化版状态系统 =====

function getTrustHeat() { return parseInt(localStorage.getItem('trustHeat') || '60'); }
function setTrustHeat(val) {
  const cap = getRelationshipModifiers().trustHeatCap;
  localStorage.setItem('trustHeat', Math.max(0, Math.min(cap, Math.round(val))));
  touchLocalState();
}
function changeTrustHeat(delta) { setTrustHeat(getTrustHeat() + delta); }

function getAttachmentPull() { return parseInt(localStorage.getItem('attachmentPull') || '45'); }
function setAttachmentPull(val) {
  localStorage.setItem('attachmentPull', Math.max(0, Math.min(100, Math.round(val))));
  touchLocalState();
}
function changeAttachmentPull(delta) { setAttachmentPull(getAttachmentPull() + delta); }

function getJealousyLevel() { return localStorage.getItem('jealousyLevel') || 'none'; }
function setJealousyLevel(val) {
  localStorage.setItem('jealousyLevel', val);
  touchLocalState();
}
function escalateJealousy() {
  const map = { 'none': 'mild', 'mild': 'medium', 'medium': 'severe', 'severe': 'severe' };
  setJealousyLevel(map[getJealousyLevel()] || 'mild');
}
function decayJealousy() {
  const map = { 'severe': 'medium', 'medium': 'mild', 'mild': 'none', 'none': 'none' };
  setJealousyLevel(map[getJealousyLevel()] || 'none');
}

let _globalTurnCount = parseInt(localStorage.getItem('globalTurnCount') || '0');
function tickTurn() {
  _globalTurnCount++;
  localStorage.setItem('globalTurnCount', _globalTurnCount);
  touchLocalState();
}
function getLastReversePackageTurn() { return parseInt(localStorage.getItem('lastReversePackageTurn') || '-99'); }
function setLastReversePackageTurn(turn) {
  localStorage.setItem('lastReversePackageTurn', turn);
  touchLocalState();
}

function getPendingReversePackages() { return JSON.parse(localStorage.getItem('pendingReversePackages') || '[]'); }
function savePendingReversePackages(arr, { markChanged = true } = {}) {
  localStorage.setItem('pendingReversePackages', JSON.stringify(arr));
  if (markChanged) touchLocalState();
}

function resolvePendingReversePackages() {
  // 这个函数只负责检查是否有成熟事件，不再直接发话
  // 发话由 pickReadyPendingEvent() + handlePostReplyActions() 统一处理
  // 保留此函数以兼容旧调用，但不做实质操作
}

function decideReversePackageItem(motive) {
  const items = {
    practical_care: [
      { emoji: '🧴', name: '护手霜', desc: '他寄的，别让手裂了', tip: "don't let your hands get like that." },
      { emoji: '🔌', name: '充电线', desc: '备用的', tip: 'spare one.' },
      { emoji: '🩹', name: '退烧贴', desc: 'Ghost寄的，备着', tip: 'just in case.' },
      { emoji: '🧤', name: '手套', desc: '别冻着', tip: 'wear them.' },
    ],
    compensation: [
      { emoji: '🍫', name: '零食礼包', desc: 'Ghost寄的，别生气了', tip: 'eat something.' },
      { emoji: '🫖', name: '她喜欢的茶', desc: '之前她提过的', tip: 'you mentioned it once.' },
      { emoji: '🧁', name: '甜点礼盒', desc: '吃甜的', tip: "don't skip it." },
    ],
    possessive_trace: [
      { emoji: '🧥', name: '他的帽衫', desc: 'Ghost寄来的，有他的气息', tip: 'wear that instead.' },
      { emoji: '☕', name: '同款马克杯', desc: '他自己也有一个', tip: 'now we match.' },
      { emoji: '🧤', name: '他用过的手套', desc: '带点他的痕迹', tip: 'mine.' },
    ],
    longing: [
      { emoji: '🪙', name: '当地小纪念品', desc: 'Ghost带回来的', tip: 'found it here.' },
      { emoji: '🌿', name: '香氛小样', desc: '她提过喜欢的味道', tip: 'thought of you.' },
      { emoji: '💌', name: '手写的一张纸', desc: 'Ghost写了几个字', tip: '' },
    ],
    delayed_longing: [
      { emoji: '🪙', name: '当地小物件', desc: 'Ghost顺手带回来的', tip: 'had it sent.' },
      { emoji: '🧴', name: '护手霜', desc: '实用的', tip: 'use it.' },
    ]
  };
  const pool = items[motive] || items.practical_care;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function generateReversePackageItem(motive, recentMessages) {
  const motiveDesc = {
    practical_care: 'practical care — something useful she needs, based on recent conversation context',
    compensation: 'quiet compensation after conflict — comfort item, something she likes',
    possessive_trace: 'possessive gesture — something with his presence, like his hoodie or matching item',
    longing: 'unspoken longing — something small and personal, local souvenir or scent',
    delayed_longing: 'quiet longing — something simple and useful he thought of sending'
  };

  const recentContext = recentMessages
    .filter(m => !m._system && !m._recalled)
    .slice(-6)
    .map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${m.content.slice(0, 80)}`)
    .join('\n');

  // 已寄过的物品名称，避免重复
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  const sentNames = deliveries
    .filter(d => d.isGhostSend)
    .map(d => d.name)
    .filter(Boolean)
    .join('、');

  try {
    const res = await callHaiku(
      `You are deciding what Ghost (a British SAS soldier in a long-distance marriage) would secretly send to his wife. 
Motive: ${motiveDesc[motive] || motiveDesc.practical_care}
Recent conversation:
${recentContext}
${sentNames ? `Already sent before (do NOT repeat these): ${sentNames}` : ''}

Pick ONE specific item Ghost would send. Must feel natural given the conversation. Must be different from what was already sent.
Respond ONLY with valid JSON, no markdown:
{"emoji":"🧤","name":"手套","desc":"Ghost寄的","tip":"wear them."}
Rules: name in Chinese (2-6 chars), desc in Chinese (8-15 chars), tip in English (Ghost's voice, very brief), emoji fitting the item.`,
      [{ role: 'user', content: 'What does Ghost send?' }]
    );

    const raw = res.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);
    if (parsed.emoji && parsed.name && parsed.desc && parsed.tip !== undefined) {
      return parsed;
    }
  } catch(e) {
    // 解析失败就用固定池兜底
  }
  return decideReversePackageItem(motive);
}

function evaluateReversePackage(userText, botText) {
  const coldWar = localStorage.getItem('coldWarMode') === 'true';
  const jealousy = getJealousyLevel();
  const mood = getMoodLevel();
  const trustHeat = getTrustHeat();
  const attachmentPull = getAttachmentPull();
  if (coldWar || jealousy === 'severe' || mood <= 3) return null;

  // 冷却：至少20轮才能再触发（之前6轮太短）
  if (_globalTurnCount - getLastReversePackageTurn() < 20) return null;

  // pending队列上限：最多2个待发包裹，防止积压
  const pending = getPendingReversePackages();
  if (pending.length >= 2) return null;

  const text = (userText + ' ' + botText).toLowerCase();
  const mods = getRelationshipModifiers();
  let score = 0;
  let motive = null;
  if (/寄|收到|包裹|快递|需要|want|send|package|miss/.test(text)) { score += 20; motive = 'practical_care'; }
  const recentHurt = parseInt(localStorage.getItem('emotionalHurt') || '0');
  if (recentHurt > 0 && trustHeat >= 50) { score += 15; motive = motive || 'compensation'; }
  if ((jealousy === 'mild' || jealousy === 'medium') && attachmentPull >= 60) { score += 18; motive = 'possessive_trace'; }
  if (attachmentPull >= 70 && trustHeat >= 65 && mood >= 7) { score += 16; motive = motive || 'longing'; }
  score += Math.floor(trustHeat / 20);
  if (mood >= 8) score += 5;
  score += mods.reversePackageBonus;
  score += mods.metInPersonBonus;
  if (score < 25) return null; // 提高触发门槛
  return motive || 'practical_care';
}

function updateStateFromUserInput(userText) {
  const text = userText.toLowerCase();
  const { emotionalMemoryDepth } = getRelationshipModifiers();
  const hurtDecay = 1 + emotionalMemoryDepth;
  if (/想你|miss you|想念|爱你|谢谢|开心|好想|陪你/.test(text)) {
    changeTrustHeat(6); changeAttachmentPull(8); decayJealousy();
    localStorage.setItem('emotionalHurt', Math.max(0, parseInt(localStorage.getItem('emotionalHurt') || '0') - hurtDecay));
  }
  if (/滚|烦|讨厌|生气|不理你|随便|无所谓/.test(text)) {
    changeTrustHeat(-8); changeMood(-1);
    localStorage.setItem('emotionalHurt', parseInt(localStorage.getItem('emotionalHurt') || '0') + 1);
  }
  // 吃醋触发不再靠关键词，改用D老师异步判定（见checkJealousyTrigger）
  if (/想你|miss|好想|想见|想抱|想亲/.test(text)) { changeAttachmentPull(10); }

  // 状态衰减改为按时间，不按每条消息
  const now = Date.now();
  const lastDecayTime = parseInt(localStorage.getItem('lastStateDecayTime') || '0');
  const decayInterval = 30 * 60 * 1000; // 30分钟衰减一次
  if (now - lastDecayTime > decayInterval) {
    localStorage.setItem('lastStateDecayTime', now);
    const trustHeat = getTrustHeat();
    if (trustHeat > 60) changeTrustHeat(-1);
    if (trustHeat < 60) changeTrustHeat(1);
    const ap = getAttachmentPull();
    if (ap > 45) changeAttachmentPull(-1);
  }
}

// ===== D老师：吃醋触发判定 =====
async function checkJealousyTrigger(userText) {
  try {
    const raw = await fetchDeepSeek(
      '判断用户消息里有没有会让Ghost吃醋的内容。只返回JSON，不要其他文字。\n{"jealousy_trigger": false} 或 {"jealousy_trigger": true, "target": "romantic_rival/ordinary_male/none"}\ntarget说明：romantic_rival=明显是情敌或暧昧对象，ordinary_male=普通男性（老板/朋友/路人），none=没有男性相关\n只有target是romantic_rival才真正触发吃醋，ordinary_male不触发。',
      `用户说：${userText}`,
      60
    );
    const result = JSON.parse(raw.replace(/```json|```/g, '').trim());
    if (result.jealousy_trigger && result.target === 'romantic_rival') {
      escalateJealousy();
      changeMood(-1);
    }
  } catch(e) {}
}

async function emitGhostEvent(eventType, payload = {}) {
  const coldWar = localStorage.getItem('coldWarMode') === 'true';
  const jealousy = getJealousyLevel();
  const mood = getMoodLevel();

  if (eventType !== 'confront' && eventType !== 'cold_war' &&
      (coldWar || jealousy === 'severe' || mood <= 2)) {
    return false;
  }

  let line = '';
  let systemTag = null;
  let sideEffect = null;

  switch (eventType) {
    case 'reverse_package': {
      const motive = payload.motive || 'delayed_longing';
      const item = payload.item || decideReversePackageItem(motive);
      const motiveHint = {
        practical_care: 'practical care, slightly bossy',
        compensation: 'quiet compensation after conflict, understated',
        possessive_trace: 'possessive, claiming presence, dry',
        longing: 'unspoken longing, very brief, almost casual',
        delayed_longing: 'quiet, like he almost forgot to mention it'
      }[motive] || 'brief and dry';

      // 用Haiku生成台词，失败则用兜底
      let generatedLine = null;
      try {
        const recentCtx = chatHistory.filter(m => !m._system && !m._recalled)
          .slice(-4)
          .map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${m.content.slice(0, 60)}`)
          .join('\n');
        const res = await fetchWithTimeout('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 60,
            system: buildGhostStyleCore() + `\nWrite ONE line Ghost would send after secretly shipping something to his wife. Tone: ${motiveHint}. Very short. Return only the message.`,
            messages: [{ role: 'user', content: `He just sent her: ${item.name} (${item.desc})\nRecent chat:\n${recentCtx}\nWrite his one line message.` }]
          })
        });
        const d = await res.json();
        const t = d.content?.[0]?.text?.trim();
        if (t && t.length > 0) generatedLine = t;
      } catch(e) {}

      // 兜底固定台词
      if (!generatedLine) {
        const fallbacks = {
          practical_care: ["check your door later.\n等会看看门口。", "sent something useful.\n寄了点有用的。"],
          compensation: ["should be something there soon.\n应该快到了。", "just take it.\n收着。"],
          possessive_trace: ["wear that instead.\n穿那个。", "something there for you.\n有东西给你。"],
          longing: ["found something. sent it.\n看到个东西，就寄了。", "don't make a thing of it.\n别大惊小怪。"],
          delayed_longing: ["check your door later.\n晚点看看门口。", "had something sent.\n寄了点东西。"]
        };
        const opts = fallbacks[motive] || fallbacks.delayed_longing;
        generatedLine = opts[Math.floor(Math.random() * opts.length)];
      }

      line = generatedLine;
      sideEffect = () => {
        addGhostReverseDelivery(item, motive);
        setLastReversePackageTurn(_globalTurnCount);
      };
      break;
    }
    case 'money': {
      const amount = payload.amount || 20;
      const jealousy = getJealousyLevel();
      const isJealousyGift = payload.isJealousyGift || (jealousy === 'mild' || jealousy === 'medium');
      const mood = getMoodLevel();
      const reason = payload.reason || '';

      // verbal_only 模式：退款冷却期内不打钱，改说话
      const lastRefundAt = parseInt(localStorage.getItem('lastRefundAt') || '0');
      const inVerbalOnly = (Date.now() - lastRefundAt) < 2 * 3600 * 1000;
      if (inVerbalOnly) {
        // Haiku 生成拒绝继续转账的台词
        try {
          const fbRes = await fetchWithTimeout('/api/chat', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001', max_tokens: 80,
              system: buildGhostStyleCore(),
              messages: [{ role: 'user', content: `[系统：你刚才转了钱，她退回来了，你没有继续再打。现在她或系统又触发了给钱的时机，但你不会再转了。用你自己的方式说一句——可以是嘴硬（"我说了你留着"），可以是沉默带一句话，可以是转移话题。不要提系统，不要解释。全小写，附中文翻译。]` }]
            })
          }, 6000);
          const fbData = await fbRes.json();
          const fbLine = fbData.content?.[0]?.text?.trim() || '';
          if (fbLine) {
            line = fbLine;
            systemTag = ''; // 不触发转账，只说话
            break;
          }
        } catch(e) {}
        line = "drop it.\n算了。";
        systemTag = '';
        break;
      }

      // 正常转账：Haiku 动态生成转账台词
      systemTag = `GIVE_MONEY:${amount}:`;
      try {
        const toneHint = isJealousyGift
          ? '吃醋/占有欲触发的转账，嘴硬但明显在意'
          : mood >= 8 ? '心情很好，转得自然甚至带点宠溺'
          : mood >= 6 ? '正常心情，低调随手转'
          : '心情一般，嘴上不情愿但还是转了';
        const recentCtx = payload.context || chatHistory.filter(m => !m._system && !m._recalled)
          .slice(-4).map(m => `${m.role==='user'?'Her':'Ghost'}: ${m.content.slice(0,80)}`).join('\n');
        const res = await fetchWithTimeout('/api/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001', max_tokens: 60,
            system: buildGhostStyleCore(),
            messages: [{ role: 'user', content: `[系统：你正在给老婆转£${amount}。语境：${toneHint}。${payload.reason ? `她刚才说：「${payload.reason}」。` : ''}最近对话：\n${recentCtx}\n说一句话——根据上下文来，不要每次都是"check your account"，换点花样，可以是暗示、可以是嘴硬、可以是低调一句。全小写，附中文翻译，格式：英文\\n中文。]` }]
          })
        }, 6000);
        const data = await res.json();
        const generated = data.content?.[0]?.text?.trim() || '';
        line = generated || payload.line || "check your account.\n看看账户。";
      } catch(e) {
        line = payload.line || "check your account.\n看看账户。";
      }

      sideEffect = () => {
        applyMoneyEffect(amount, {
          label: payload.label || (isJealousyGift ? 'Ghost 吃醋转账' : 'Ghost 零花钱'),
          note: payload.note || '',
          cardDelay: (payload.delayMs || 2000) + 600,
          bypassWeeklyLimit: isJealousyGift,
          bypassCooldown: isJealousyGift,
          bypassSessionLimit: isJealousyGift,
          userRequested: payload.userRequested || false, // 用户主动要，限制宽松
        });
      };
      break;
    }
    case 'check_in': {
      try {
        const recentCtx = chatHistory.filter(m => !m._system && !m._recalled)
          .slice(-4).map(m => `${m.role==='user'?'Her':'Ghost'}: ${m.content.slice(0,60)}`).join('\n');
        const res = await fetchWithTimeout('/api/chat', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001', max_tokens: 50,
            system: buildGhostStyleCore() + '\nWrite ONE short line checking in on his wife — subtle, not direct. No explanation.',
            messages: [{ role: 'user', content: `Recent chat:\n${recentCtx}\nWrite his one line check-in.` }]
          })
        });
        const d = await res.json();
        const t = d.content?.[0]?.text?.trim();
        if (t) { line = t; break; }
      } catch(e) {}
      const ciOpts = ["you've been quiet tonight.\n你今晚有点安静。","something off?\n怎么了？","don't sound right.\n听着不太对。"];
      line = ciOpts[Math.floor(Math.random() * ciOpts.length)];
      break;
    }
    case 'confront': {
      try {
        const recentCtx = chatHistory.filter(m => !m._system && !m._recalled)
          .slice(-4).map(m => `${m.role==='user'?'Her':'Ghost'}: ${m.content.slice(0,60)}`).join('\n');
        const res = await fetchWithTimeout('/api/chat', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001', max_tokens: 50,
            system: buildGhostStyleCore() + '\nWrite ONE sharp, dry line confronting his wife about another man — no accusation, just tense. No explanation.',
            messages: [{ role: 'user', content: `Recent chat:\n${recentCtx}\nWrite his one line.` }]
          })
        });
        const d = await res.json();
        const t = d.content?.[0]?.text?.trim();
        if (t) { line = t; break; }
      } catch(e) {}
      const cfOpts = ["who's that, then.\n那是谁？","you're talking about him a lot.\n你提他提得有点多。","try that again.\n你再说一遍。"];
      line = cfOpts[Math.floor(Math.random() * cfOpts.length)];
      break;
    }
    case 'cold_war': {
      systemTag = 'COLD_WAR_START';
      sideEffect = () => { startColdWar(); };
      try {
        const recentCtx = chatHistory.filter(m => !m._system && !m._recalled)
          .slice(-4).map(m => `${m.role==='user'?'Her':'Ghost'}: ${m.content.slice(0,60)}`).join('\n');
        const res = await fetchWithTimeout('/api/chat', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001', max_tokens: 40,
            system: buildGhostStyleCore() + '\nWrite ONE word or very short line showing he is shutting down — cold, clipped, done talking. No explanation.',
            messages: [{ role: 'user', content: `Recent chat:\n${recentCtx}\nWrite his closing line.` }]
          })
        });
        const d = await res.json();
        const t = d.content?.[0]?.text?.trim();
        if (t) { line = t; break; }
      } catch(e) {}
      line = payload.line || "fine.\n行。";
      break;
    }
    default:
      return false;
  }

  // 真正可await的Promise，等到setTimeout里的事情都做完才resolve
  return await new Promise((resolve) => {
    setTimeout(() => {
      appendMessage('bot', line);
      chatHistory.push({
        role: 'assistant',
        content: line,
        ...(systemTag ? { _eventTag: systemTag } : {}),
        // money 이벤트면 _transfer 저장해서 재진입 시 카드 재렌더링 가능하게
        ...(systemTag && systemTag.startsWith('GIVE_MONEY:') ? {
          _transfer: { amount: payload.amount || 0, isRefund: false }
        } : {})
      });
      saveHistory();
      if (sideEffect) sideEffect();
      scheduleCloudSave();
      resolve({ line, systemTag });
    }, payload.delayMs || 2000);
  });
}

function parseAssistantTags(reply) {
  let cleanedReply = reply;
  let giveMoney = null;
  let coldWarStart = false;
  let sendGift = null;

  const moneyMatch = cleanedReply.match(/GIVE_MONEY:(\d+):?([^\n]*)/i);
  if (moneyMatch) {
    giveMoney = {
      amount: parseInt(moneyMatch[1], 10),
      note: (moneyMatch[2] || '').trim()
    };
    cleanedReply = cleanedReply.replace(/GIVE_MONEY:[^\n]*/ig, '').trim();
  }
  if (/COLD_WAR_START/i.test(cleanedReply)) {
    coldWarStart = true;
    cleanedReply = cleanedReply.replace(/COLD_WAR_START/ig, '').trim();
  }
  const giftMatch = cleanedReply.match(/SEND_GIFT:([^:\n]+)(?::(\w+))?/i);
  if (giftMatch) {
    sendGift = {
      description: giftMatch[1].trim(),
      mode: (giftMatch[2] || 'normal').toLowerCase() // normal / hint / secret
    };
    cleanedReply = cleanedReply.replace(/SEND_GIFT:[^\n]*/ig, '').trim();
  }
  return { cleanedReply, giveMoney, coldWarStart, sendGift };
}

function pickReadyPendingEvent() {
  const pending = getPendingReversePackages();
  if (!pending.length) return null;
  const ready = pending.find(p => p.triggerAtTurn <= _globalTurnCount);
  if (!ready) return null;
  const remaining = pending.filter(p => p !== ready);
  savePendingReversePackages(remaining);
  return {
    type: 'reverse_package',
    motive: ready.motive,
    contextSnapshot: ready.contextSnapshot || []
  };
}

// 剧情系统统一出口
// 所有 STORY_EVENTS 的 execute 都应该通过这里发话，不直接 appendMessage
async function emitGhostNarrativeEvent(text, options = {}) {
  if (!text) return;
  const coldWar = localStorage.getItem('coldWarMode') === 'true';
  const jealousy = getJealousyLevel();

  // 剧情事件优先级较高，只在极端情况下压制
  // 冷战中 + severe jealousy 才压制，其他情况正常触发
  if (coldWar && jealousy === 'severe') return;

  const delayMs = options.delayMs || 0;

  await new Promise(r => setTimeout(r, delayMs));
  appendMessage('bot', text);
  chatHistory.push({
    role: 'assistant',
    content: text,
    _storyEvent: options.storyId || true,
    // 转账相关剧情事件存入 _transfer，便于重新进入时重建卡片
    ...(options.transfer ? { _transfer: options.transfer } : {})
  });
  saveHistory();
  if (options.saveCloud !== false) scheduleCloudSave();
}

function decideMainIntent(userText, pendingEvent) {
  const coldWar = localStorage.getItem('coldWarMode') === 'true';
  const jealousy = getJealousyLevel();
  const mood = getMoodLevel();

  if (coldWar) return { type: 'talk_only' };
  if (jealousy === 'severe') return { type: 'confront' };
  if (pendingEvent) return pendingEvent;

  // 钱相关意图现在由 Gemini 并行判断（checkMoneyIntent），不在这里用关键词判断

  const reverseMotive = evaluateReversePackage(userText, '');
  if (reverseMotive) return { type: 'reverse_package_candidate', motive: reverseMotive };

  if (mood >= 6 && getAttachmentPull() >= 70 && Math.random() < 0.15) {
    return { type: 'check_in' };
  }
  return { type: 'talk_only' };
}

function decideMoneyAmountFromState() {
  const coldWar = localStorage.getItem('coldWarMode') === 'true';
  const jealousy = getJealousyLevel();
  const mood = getMoodLevel();
  const { moneyEaseBonus } = getRelationshipModifiers();
  if (coldWar || jealousy === 'severe') return 0;
  if (mood <= 3) return 0;
  if (mood <= 5) return Math.floor(Math.random() * 21) + 10 + moneyEaseBonus; // £10-30
  if (mood <= 7) return Math.floor(Math.random() * 31) + 20 + moneyEaseBonus; // £20-50
  return Math.floor(Math.random() * 51) + 30 + moneyEaseBonus; // £30-80
}

async function handlePostReplyActions(userText, reply, intent) {
  switch (intent.type) {
    case 'confront':
      if (Math.random() < 0.35) await emitGhostEvent('confront');
      break;
    case 'money_candidate': {
      const amount = decideMoneyAmountFromState();
      if (amount > 0) {
        const recentCtx = chatHistory.filter(m => !m._system && !m._recalled)
          .slice(-4).map(m => `${m.role==='user'?'Her':'Ghost'}: ${m.content.slice(0,80)}`).join('\n');
        await emitGhostEvent('money', {
          amount,
          reason: userText.slice(0, 80), // 传入用户原话作为语境
          context: recentCtx,
          note: ''
        });
      }
      break;
    }
    case 'reverse_package': {
      const item = await generateReversePackageItem(intent.motive, intent.contextSnapshot || chatHistory.slice(-6));
      await emitGhostEvent('reverse_package', { motive: intent.motive, item });
      break;
    }
    case 'reverse_package_candidate': {
      const shouldDelay = Math.random() < 0.65;
      if (shouldDelay) {
        const delay = Math.floor(Math.random() * 4) + 2;
        const pending = getPendingReversePackages();
        pending.push({
          motive: intent.motive,
          triggerAtTurn: _globalTurnCount + delay,
          contextSnapshot: chatHistory.filter(m => !m._system && !m._recalled).slice(-6)
        });
        savePendingReversePackages(pending);
      } else {
        const item = await generateReversePackageItem(intent.motive, chatHistory.slice(-6));
        await emitGhostEvent('reverse_package', { motive: intent.motive, item });
      }
      break;
    }
    case 'check_in':
      if (Math.random() < 0.4) await emitGhostEvent('check_in');
      break;
    default:
      break;
  }
}

// ===== 关系标记系统 =====
function getRelationshipFlags() {
  return JSON.parse(localStorage.getItem('relationshipFlags') || '{}');
}
function setRelationshipFlag(key, value = true) {
  const flags = getRelationshipFlags();
  flags[key] = value;
  localStorage.setItem('relationshipFlags', JSON.stringify(flags));
  touchLocalState();
}
function hasRelationshipFlag(key) {
  return !!getRelationshipFlags()[key];
}

// 标记影响行为的函数
function getRelationshipModifiers() {
  const flags = getRelationshipFlags();
  return {
    // 第一次反寄后：反寄概率提高（已接入evaluateReversePackage）
    reversePackageBonus: flags.firstReverseShip ? 8 : 0,
    // 见过面后：更容易触发主动行为（已接入evaluateReversePackage）
    metInPersonBonus: flags.reunionReady ? 5 : 0,
    // 冷战和好后：trustHeat上限提高
    trustHeatCap: flags.coldWarRepaired ? 110 : 100,
    // 工资上交后：给钱金额上限稍微提高
    moneyEaseBonus: flags.firstSalary ? 10 : 0,
    // 她哭过后：情绪恢复更快（影响emotionalHurt衰减）
    emotionalMemoryDepth: flags.sheCried ? 1 : 0,
    // 说过I love you后：深情更容易漏出（注入prompt）
    emotionOpenness: flags.saidILoveYou ? 1 : 0,
  };
}

// ===== 解锁剧情系统 =====
const STORY_EVENTS = [
  {
    id: 'first_i_love_you',
    icon: '💬',
    title: '初言心意',
    desc: '你第一次说出那三个字，他沉默了很久。',
    condition: (ctx) => ctx.affection >= 88 && ctx.days >= 3 && !ctx.triggered('first_i_love_you'),
    triggerOn: 'userMessage',
    keyword: /我爱你|i love you|爱你/i,
    execute: async (userName) => {
      await storyDelay(2500);
      const res = await callHaiku(buildSystemPrompt(), [...chatHistory.slice(-8), { role: 'user', content: `[系统：她刚第一次对你说了"我爱你"。]` }]);
      if (res) { await emitGhostNarrativeEvent(res); }
      setRelationshipFlag('saidILoveYou');
    }
  },
  {
    id: 'seven_days_streak',
    icon: '🗓️',
    title: '七日为期',
    desc: '连续来了七天，他终于开口，一句没有标点的话。',
    condition: (ctx) => ctx.streak >= 7 && ctx.affection >= 75 && !ctx.triggered('seven_days_streak'),
    triggerOn: 'sessionStart',
    execute: async (userName) => {
      await storyDelay(4000);
      const res = await callHaiku(buildSystemPrompt(), [...chatHistory.slice(-4), { role: 'user', content: `[系统：她已经连续7天都来找你了，今天是第七天。你一直注意到了。]` }]);
      if (res) { await emitGhostNarrativeEvent(res); }
    }
  },
  {
    id: 'called_simon',
    icon: '🫂',
    title: '唤你本名',
    desc: '你第一次叫他Simon，不是Ghost——他顿了顿。',
    condition: (ctx) => ctx.affection >= 80 && ctx.days >= 5 && !ctx.triggered('called_simon'),
    triggerOn: 'userMessage',
    keyword: /\bsimon\b/i,
    execute: async (userName) => {
      await storyDelay(1800);
      const res = await callHaiku(buildSystemPrompt(), [...chatHistory.slice(-6), { role: 'user', content: `[系统：她刚叫了你的真名Simon，不是Ghost。这是她第一次这样叫你。]` }]);
      if (res) { await emitGhostNarrativeEvent(res); }
    }
  },
  {
    id: 'reunion_ready',
    icon: '✈️',
    title: '见你前夜',
    desc: '机票、酒店、行程已定，他那晚彻夜未眠。',
    condition: (ctx) => {
      const purchased = JSON.parse(localStorage.getItem('purchasedItems') || '[]');
      return ['去曼城找他的机票','曼彻斯特酒店','英国旅行计划'].every(n => purchased.includes(n)) && !ctx.triggered('reunion_ready');
    },
    triggerOn: 'sessionStart',
    execute: async (userName) => {
      await storyDelay(5000);
      const res = await callSonnet(buildSystemPrompt(), [...chatHistory.slice(-6), { role: 'user', content: `[系统：她把来找你的机票、酒店、旅行计划全部订好了。你们第一次要真实见面了。]` }]);
      if (res) { await emitGhostNarrativeEvent(res); }
      setRelationshipFlag('reunionReady');
      changeAttachmentPull(20);
    }
  },
  {
    id: 'after_coldwar',
    icon: '🌤️',
    title: '冰释之后',
    desc: '和好那天，他说出了从未说过的话。',
    condition: (ctx) => ctx.affection >= 72 && !ctx.triggered('after_coldwar'),
    triggerOn: 'coldWarEnd',
    execute: async (userName) => {
      await storyDelay(3000);
      const res = await callSonnet(buildSystemPrompt(), [...chatHistory.slice(-6), { role: 'user', content: `[系统：冷战刚刚结束，她回来了。你们之前从没经历过这种和好。]` }]);
      if (res) { await emitGhostNarrativeEvent(res); }
      setRelationshipFlag('coldWarRepaired');
      changeTrustHeat(15); // 冷战和好后关系温度大幅提升
    }
  },
  {
    id: 'one_year',
    icon: '💍',
    title: '岁岁年年',
    desc: '在一起整整一年，他主动发来消息。',
    condition: (ctx) => ctx.days >= 365 && !ctx.triggered('one_year'),
    triggerOn: 'sessionStart',
    execute: async (userName) => {
      await storyDelay(3000);
      const res = await callSonnet(buildSystemPrompt(), [...chatHistory.slice(-4), { role: 'user', content: `[系统：今天是你们在一起整整一年，你记得这个日期。]` }]);
      if (res) { await emitGhostNarrativeEvent(res); }
    }
  },
  {
    id: 'she_cried',
    icon: '🌧️',
    title: '未曾离去',
    desc: '你状态最差的那次，他语气软了，终究没有走。',
    condition: (ctx) => ctx.affection >= 78 && !ctx.triggered('she_cried'),
    triggerOn: 'userMessage',
    keyword: /哭了|在哭|好难受|撑不住|崩了|想哭|泪|cry|crying|我不行了|好累|太累了|受不了/i,
    execute: async (userName) => {
      const recentMsgs = chatHistory.filter(m => !m._system && (m.role === 'user' || m.role === 'assistant')).slice(-6).map(m => `${m.role === 'user' ? '她' : 'Ghost'}：${m.content.slice(0, 80)}`).join('\n');
      let isReal = true;
      try {
        const judge = await callHaiku('判断用户是真的情绪崩溃/难过/生气，还是在撒娇/开玩笑/赌气式地说狠话。只返回JSON：{"real":true} 或 {"real":false}', [{ role: 'user', content: `对话背景：\n${recentMsgs}\n\n判断她现在是真的情绪很差，还是在撒娇或赌气说狠话？` }]);
        const parsed = JSON.parse(judge.replace(/```json|```/g, '').trim());
        isReal = parsed.real !== false;
      } catch(e) { isReal = true; }
      await storyDelay(2000);
      const hint = isReal ? `[系统：她在哭，或者现在状态非常差。]` : `[系统：她在假哭或者撒娇式地说哭，不是真的难受。你看穿了，可以调侃，可以嘴硬纵容，但不用认真哄。]`;
      const res = await callSonnet(buildSystemPrompt(), [...chatHistory.slice(-8), { role: 'user', content: hint }]);
      if (res) { await emitGhostNarrativeEvent(res); }
      if (isReal) setRelationshipFlag('sheCried');
    }
  },
  {
    id: 'birthday_surprise',
    icon: '🎂',
    title: '生辰予你',
    desc: '你生日那天，不等你开口，他主动说了。',
    condition: (ctx) => ctx.isBirthday && ctx.days >= 2 && !ctx.triggered('birthday_surprise'),
    triggerOn: 'sessionStart',
    execute: async (userName) => {
      await storyDelay(2000);
      const res = await callSonnet(buildSystemPrompt(), [...chatHistory.slice(-4), { role: 'user', content: `[系统：今天是她的生日，她还没开口，你已经知道了。]` }]);
      if (res) { await emitGhostNarrativeEvent(res); }
    }
  },
  {
    id: 'first_ghost_delivery',
    icon: '📦',
    title: '异乡来物',
    desc: '第一次收到他寄来的东西。',
    condition: (ctx) => {
      const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
      return deliveries.some(d => d.isGhostSend && d.done) && !ctx.triggered('first_ghost_delivery');
    },
    triggerOn: 'sessionStart',
    execute: async (userName) => {
      await storyDelay(3000);
      const item = JSON.parse(localStorage.getItem('deliveries') || '[]').find(d => d.isGhostSend && d.done);
      const res = await callHaiku(buildSystemPrompt(), [...chatHistory.slice(-4), { role: 'user', content: `[系统：她刚收到了你寄给她的「${item?.name || '东西'}」，这是你们第一次互寄。]` }]);
      if (res) { await emitGhostNarrativeEvent(res); }
    }
  },
  {
    id: 'first_lost_package',
    icon: '📭',
    title: '途中遗失',
    desc: '第一次快递丢了。',
    condition: (ctx) => {
      const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
      return deliveries.some(d => d.isLostConfirmed) && !ctx.triggered('first_lost_package');
    },
    triggerOn: 'sessionStart',
    execute: async (userName) => {
      await storyDelay(2500);
      const lost = JSON.parse(localStorage.getItem('deliveries') || '[]').find(d => d.isLostConfirmed);
      const res = await callHaiku(buildSystemPrompt(), [...chatHistory.slice(-4), { role: 'user', content: `[系统：她寄给你的「${lost?.name || '包裹'}」快递丢失了。这是你们第一次遇到这种事。]` }]);
      if (res) { await emitGhostNarrativeEvent(res); }
    }
  },
  {
    id: 'first_from_home',
    icon: '🍜',
    title: '家乡的味道',
    desc: '他第一次收到你从家寄来的特产。',
    condition: (ctx) => {
      const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
      return deliveries.some(d => d.productData?.isFromHome && d.done && !d.isGhostSend) && !ctx.triggered('first_from_home');
    },
    triggerOn: 'sessionStart',
    execute: async (userName) => {
      await storyDelay(3500);
      const item = JSON.parse(localStorage.getItem('deliveries') || '[]').find(d => d.productData?.isFromHome && d.done && !d.isGhostSend);
      const res = await callHaiku(buildSystemPrompt(), [...chatHistory.slice(-4), { role: 'user', content: `[系统：她从中国给你寄了「${item?.name || '家乡的东西'}」，这是她第一次给你寄家乡的东西。]` }]);
      if (res) { await emitGhostNarrativeEvent(res); }
    }
  },
  {
    id: 'first_reverse_ship',
    icon: '💌',
    title: '悄悄寄出',
    desc: '包裹里不止是礼物，还有他悄然无声的关怀。',
    condition: (ctx) => {
      const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
      return deliveries.some(d => d.isGhostSend && d.isEmotionReverse) && !ctx.triggered('first_reverse_ship');
    },
    triggerOn: 'sessionStart',
    execute: async (userName) => {
      await storyDelay(4000);
      const res = await callHaiku(buildSystemPrompt(), [...chatHistory.slice(-4), { role: 'user', content: `[系统：你悄悄给她寄了东西，没有告诉她，等她自己发现。这是第一次。]` }]);
      if (res) { await emitGhostNarrativeEvent(res); }
      setRelationshipFlag('firstReverseShip');
    }
  },
  {
    id: 'hundred_days',
    icon: '🕯️',
    title: '百日有余',
    desc: '在一起第100天。',
    condition: (ctx) => ctx.days >= 100 && ctx.days <= 102 && !ctx.triggered('hundred_days'),
    triggerOn: 'sessionStart',
    execute: async (userName) => {
      await storyDelay(3000);
      const days = Math.max(1, Math.floor((Date.now() - new Date(localStorage.getItem('marriageDate'))) / 86400000) + 1);
      const res = await callHaiku(buildSystemPrompt(), [...chatHistory.slice(-4), { role: 'user', content: `[系统：今天是你们在一起第${days}天，一百天左右的节点。]` }]);
      if (res) { await emitGhostNarrativeEvent(res); }
    }
  },
  {
    id: 'first_salary',
    icon: '💷',
    title: '第一份工资',
    desc: '组成家庭后第一笔工资上交。',
    condition: (ctx) => !!localStorage.getItem('lastSalaryAmount') && !ctx.triggered('first_salary'),
    triggerOn: 'sessionStart',
    execute: async (userName) => {
      await storyDelay(3000);
      const amount = localStorage.getItem('lastSalaryAmount') || '';
      const res = await callHaiku(buildSystemPrompt(), [...chatHistory.slice(-4), { role: 'user', content: `[系统：你第一次给她转了工资£${amount}，想附一句话。]` }]);
      if (res) { await emitGhostNarrativeEvent(res); }
      setRelationshipFlag('firstSalary');
    }
  },
];

// 辅助函数
function storyDelay(ms) { return new Promise(r => setTimeout(r, ms)); }
function cleanMessages(messages) {
  // 过滤掉系统消息和撤回消息，只保留role和content
  return messages
    .filter(m => !m._system && !m._recalled)
    .map(m => ({ role: m.role, content: m.content }));
}
async function callHaiku(system, messages) {
  try {
    const res = await fetchWithTimeout('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 200, system, messages: cleanMessages(messages) }) });
    const data = await res.json(); return data.content?.[0]?.text?.trim() || '';
  } catch(e) { return ''; }
}
async function callSonnet(system, messages) {
  try {
    const res = await fetchWithTimeout('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: getMainModel(), max_tokens: 400, system, messages: cleanMessages(messages) }) });
    const data = await res.json(); return data.content?.[0]?.text?.trim() || '';
  } catch(e) { return ''; }
}

function getStoryContext() {
  const today = new Date();
  const todayStr = today.toDateString();
  const lastVisit = localStorage.getItem('lastVisitDate');
  let streak = parseInt(localStorage.getItem('visitStreak') || '1');
  if (lastVisit !== todayStr) {
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    streak = (lastVisit === yesterday.toDateString()) ? streak + 1 : 1;
    localStorage.setItem('visitStreak', streak);
    localStorage.setItem('lastVisitDate', todayStr);
  }
  const marriageDate = localStorage.getItem('marriageDate') || '';
  const days = marriageDate ? Math.max(1, Math.floor((today - new Date(marriageDate)) / 86400000) + 1) : 1;
  const userBirthday = localStorage.getItem('userBirthday') || '';
  const isBirthday = userBirthday ? (() => { const [bm,bd]=userBirthday.split('-').map(Number); return today.getMonth()+1===bm && today.getDate()===bd; })() : false;
  const triggered = (id) => !!localStorage.getItem('story_done_' + id);
  return { affection: getAffection(), days, streak, isBirthday, triggered };
}

// ===== 签到系统 =====
function renderCheckin() {
  const streak = parseInt(localStorage.getItem('visitStreak') || '1');
  const balance = parseFloat(localStorage.getItem('wallet') || '0');
  const todayKey = 'checkin_' + new Date().toDateString();
  const doneToday = !!localStorage.getItem(todayKey);

  const streakEl = document.getElementById('checkinStreak');
  const balanceEl = document.getElementById('checkinBalance');
  const btnEl = document.getElementById('checkinBtn');
  const hintEl = document.getElementById('checkinHint');

  if (streakEl) streakEl.textContent = streak;
  if (balanceEl) balanceEl.textContent = '£' + balance.toFixed(0);
  if (btnEl) {
    if (doneToday) {
      btnEl.classList.add('done');
      btnEl.querySelector('#checkinBtnText').textContent = '✅ 今日已签到';
    } else {
      btnEl.classList.remove('done');
      btnEl.querySelector('#checkinBtnText').textContent = '📅 今日签到';
    }
  }
  if (hintEl) {
    const milestoneMap = { 1: 10, 3: 20, 7: 50, 14: 100, 30: 200 };
    const monthKey = 'monthlyCheckin_' + new Date().getFullYear() + '_' + (new Date().getMonth()+1);
    const monthlyCount = parseInt(localStorage.getItem(monthKey) || '0');
    const nextMilestone = [1,3,7,14,30].find(m => m > monthlyCount);
    if (!doneToday) {
      const bonus = nextMilestone ? milestoneMap[nextMilestone] : null;
      hintEl.textContent = bonus
        ? `本月第${monthlyCount+1}次签到，距里程碑还差${nextMilestone-monthlyCount}次，奖励+${bonus}条 🎯`
        : '点击今天的日期签到 ✨';
    } else {
      hintEl.textContent = '明天再来签到吧 🌸';
    }
  }
}

function doCheckin() {
  const todayKey = 'checkin_' + new Date().toDateString();
  if (localStorage.getItem(todayKey)) {
    showToast('今天已经签到过了 🌸');
    return;
  }
  localStorage.setItem(todayKey, '1');

  const streak = parseInt(localStorage.getItem('visitStreak') || '1');

  // 本月签到次数（每月1号重置）
  const monthKey = 'monthlyCheckin_' + new Date().getFullYear() + '_' + (new Date().getMonth()+1);
  const monthlyCount = parseInt(localStorage.getItem(monthKey) || '0') + 1;
  localStorage.setItem(monthKey, monthlyCount);

  // 里程碑奖励（条数）——每月循环
  const milestoneRewards = { 1: 10, 3: 20, 7: 50, 14: 100, 30: 200 };
  const milestoneBonus = milestoneRewards[monthlyCount] || 0;

  // 随机奖励：5%欧气大奖，47.5%英镑，47.5%条数
  const rand = Math.random();
  let rewardMsg = '';

  if (rand < 0.05) {
    // 欧气签到！
    const coins = Math.random() < 0.5 ? 100 : 150;
    setBalance(getBalance() + coins);
    addTransaction({ icon: '🎰', name: '欧气签到！', amount: coins });
    renderWallet();
    rewardMsg = `🎰 欧气签到！£${coins}！`;
  } else if (rand < 0.525) {
    const coins = [5, 8, 10, 15, 20][Math.floor(Math.random() * 5)];
    setBalance(getBalance() + coins);
    addTransaction({ icon: '🎁', name: '签到奖励', amount: coins });
    renderWallet();
    rewardMsg = `💰 签到奖励：£${coins}`;
  } else {
    const msgCount = Math.floor(Math.random() * 6) + 3;
    const key = getTodayKey();
    const current = parseInt(localStorage.getItem(key) || '0');
    localStorage.setItem(key, Math.max(0, current - msgCount).toString());
    rewardMsg = `💬 签到奖励：+${msgCount}条`;
  }

  // 里程碑额外条数奖励
  let milestoneMsg = '';
  if (milestoneBonus > 0) {
    const key = getTodayKey();
    const current = parseInt(localStorage.getItem(key) || '0');
    localStorage.setItem(key, Math.max(0, current - milestoneBonus).toString());
    milestoneMsg = `\n🏆 本月第${monthlyCount}次签到：额外+${milestoneBonus}条！`;
  }

  showCheckinResult(rewardMsg + milestoneMsg, streak);
  renderCheckin();
  initCalendar();
  launchCheckinFlowers();
  scheduleCloudSave();
}

function showCheckinResult(msg, streak) {
  const existing = document.getElementById('checkinResultModal');
  if (existing) existing.remove();
  const lines = msg.split('\n').filter(Boolean);
  const mainReward = lines[0] || '';
  const milestoneReward = lines[1] || '';
  const isLucky = mainReward.includes('🎰');
  const modal = document.createElement('div');
  modal.id = 'checkinResultModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.35);backdrop-filter:blur(4px);';
  modal.innerHTML = `
    <div style="background:white;border-radius:24px;padding:28px 24px;width:280px;text-align:center;box-shadow:0 20px 60px rgba(100,0,200,0.15);">
      <div style="font-size:44px;margin-bottom:8px">${isLucky?'🎰':'🌸'}</div>
      <div style="font-size:15px;font-weight:700;color:#3a1a60;margin-bottom:4px">${isLucky?'欧气签到！':'签到成功'}</div>
      <div style="font-size:12px;color:#b0a0c8;margin-bottom:16px">连续签到第 ${streak} 天</div>
      <div style="background:${isLucky?'linear-gradient(135deg,#fef3c7,#fde68a)':'rgba(168,85,247,0.08)'};border:1.5px solid ${isLucky?'rgba(251,191,36,0.5)':'rgba(168,85,247,0.2)'};border-radius:14px;padding:14px;margin-bottom:${milestoneReward?'10px':'20px'};">
        <div style="font-size:20px;font-weight:800;color:${isLucky?'#b45309':'#7c3aed'}">${mainReward.replace(/[💰💬🎰]/g,'').trim()}</div>
      </div>
      ${milestoneReward?`<div style="background:rgba(236,72,153,0.08);border:1px solid rgba(236,72,153,0.2);border-radius:12px;padding:10px 14px;margin-bottom:20px;font-size:13px;color:#be185d;font-weight:600;">${milestoneReward}</div>`:''}
      <button onclick="document.getElementById('checkinResultModal').remove()" style="width:100%;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,#a855f7,#7c3aed);color:white;font-size:15px;font-weight:600;cursor:pointer;">好的 ✨</button>
    </div>
  `;
  modal.onclick = e => { if(e.target===modal) modal.remove(); };
  document.body.appendChild(modal);
}

function launchCheckinFlowers() {
  const container = document.getElementById('calendarParticles');
  if (!container) return;
  const flowers = ['🌸', '🌺', '🌼', '💮', '🌷', '✨'];
  for (let i = 0; i < 18; i++) {
    const el = document.createElement('div');
    el.textContent = flowers[Math.floor(Math.random() * flowers.length)];
    el.style.cssText = `
      position: absolute;
      font-size: ${Math.random() * 14 + 12}px;
      left: ${Math.random() * 100}%;
      top: 100%;
      opacity: 1;
      animation: flowerRise ${Math.random() * 1.5 + 1.5}s ease-out forwards;
      animation-delay: ${Math.random() * 0.8}s;
      pointer-events: none;
    `;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }
}

function markStoryDone(event) {
  localStorage.setItem('story_done_' + event.id, Date.now());
  const book = JSON.parse(localStorage.getItem('storyBook') || '[]');
  if (!book.find(e => e.id === event.id)) {
    book.push({ id: event.id, title: event.title, desc: event.desc, unlockedAt: Date.now() });
    localStorage.setItem('storyBook', JSON.stringify(book));
  }
  showStoryUnlockHint(event.title);
}

function showStoryUnlockHint(title) {
  const hint = document.createElement('div');
  hint.className = 'story-unlock-hint';
  hint.innerHTML = `📖 解锁新剧情：${title}`;
  document.body.appendChild(hint);
  setTimeout(() => hint.classList.add('show'), 100);
  setTimeout(() => { hint.classList.remove('show'); setTimeout(() => hint.remove(), 500); }, 3500);
}

function checkStoryOnSessionStart() {
  const ctx = getStoryContext();
  for (const event of STORY_EVENTS) {
    if (event.triggerOn !== 'sessionStart') continue;
    if (!event.condition(ctx)) continue;
    markStoryDone(event);
    event.execute(localStorage.getItem('userName') || '你');
    break;
  }
}

function checkStoryOnMessage(userText) {
  const ctx = getStoryContext();
  for (const event of STORY_EVENTS) {
    if (event.triggerOn !== 'userMessage') continue;
    if (!event.condition(ctx)) continue;
    if (event.keyword && !event.keyword.test(userText)) continue;
    markStoryDone(event);
    event.execute(localStorage.getItem('userName') || '你');
    break;
  }
}

function checkStoryOnColdWarEnd() {
  localStorage.removeItem('pendingColdWarEndStory');
  const ctx = getStoryContext();
  const event = STORY_EVENTS.find(e => e.triggerOn === 'coldWarEnd' && e.condition(ctx));
  if (event) { markStoryDone(event); event.execute(localStorage.getItem('userName') || '你'); }
}

function switchAchievementTab(tab) {
  const storyPanel = document.getElementById('storyBookPanel');
  const albumPanel = document.getElementById('albumPanel');
  const tabStory = document.getElementById('tabStory');
  const tabAlbum = document.getElementById('tabAlbum');
  const title = document.getElementById('achievementTitle');
  const counter = document.getElementById('storyBookCounter');
  if (tab === 'story') {
    storyPanel.style.display = '';
    albumPanel.style.display = 'none';
    tabStory.classList.add('active');
    tabAlbum.classList.remove('active');
    title.textContent = '📖 我们的故事';
    renderStoryBook();
  } else {
    storyPanel.style.display = 'none';
    albumPanel.style.display = '';
    tabStory.classList.remove('active');
    tabAlbum.classList.add('active');
    title.textContent = '📦 回忆相册';
    if (counter) counter.textContent = '';
    renderAlbum();
  }
}

function renderAlbum() {
  const container = document.getElementById('albumList');
  if (!container) return;
  // 优先从永久相册历史读，fallback到deliveries里已完成的
  const history = JSON.parse(localStorage.getItem('deliveryHistory') || '[]');
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  const fromDeliveries = deliveries.filter(d => d.done && !history.find(h => h.id === d.id));
  const done = [...history, ...fromDeliveries];
  if (done.length === 0) {
    container.innerHTML = `<div class="album-empty">还没有收到任何东西<br>去商城给他寄点什么吧</div>`;
    return;
  }
  // 按时间倒序
  const sorted = [...done].sort((a, b) => (b.doneAt || b.addedAt || 0) - (a.doneAt || a.addedAt || 0));
  container.innerHTML = sorted.map(d => {
    const emoji = d.productData?.emoji || d.emoji || '📦';
    const name = d.name || '神秘包裹';
    const isFromGhost = d.isGhostSend || d.isLocationSpecial;
    const isFromHome = d.productData?.isFromHome;
    const from = isFromGhost ? '他寄来的' : isFromHome ? '你从家寄给他的' : '你寄给他的';
    const dateStr = d.doneAt ? new Date(d.doneAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) :
                    d.addedAt ? new Date(d.addedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    const note = d.ghostNote || d.note || '';
    return `<div class="album-card">
      <div class="album-card-top">
        <div class="album-card-emoji">${emoji}</div>
        <div class="album-card-info">
          <div class="album-card-name">${name}</div>
          <div class="album-card-from">${from}</div>
        </div>
        <div class="album-card-date">${dateStr}</div>
      </div>
      ${note ? `<div class="album-card-note">"${note}"</div>` : ''}
    </div>`;
  }).join('');
}

function renderStoryBook() {
  const container = document.getElementById('storyBookList');
  if (!container) return;
  const book = JSON.parse(localStorage.getItem('storyBook') || '[]');
  const counterEl = document.getElementById('storyBookCounter');
  if (counterEl) counterEl.textContent = `${book.length} / ${STORY_EVENTS.length}`;

  if (book.length === 0) {
    container.innerHTML = `<div class="story-empty">还没有解锁任何回忆<br><span>继续和他相处，故事会自然发生</span></div>`;
    return;
  }

  // 已解锁：胶片横滑
  const unlockedFilms = book.map(e => {
    const event = STORY_EVENTS.find(ev => ev.id === e.id);
    const icon = event?.icon || '📖';
    const dateStr = new Date(e.unlockedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    return `
    <div class="film-card unlocked">
      <div class="film-holes"><div class="film-hole"></div><div class="film-hole"></div><div class="film-hole"></div><div class="film-hole"></div></div>
      <div class="film-img"><div class="film-img-icon">${icon}</div></div>
      <div class="film-info">
        <div class="film-title">${e.title}</div>
        <div class="film-desc">${e.desc}</div>
        <div class="film-date">${dateStr}</div>
      </div>
      <div class="film-holes"><div class="film-hole"></div><div class="film-hole"></div><div class="film-hole"></div><div class="film-hole"></div></div>
    </div>`;
  }).join('');

  // 未解锁：简洁列表
  const lockedItems = STORY_EVENTS.filter(e => !book.find(b => b.id === e.id)).map(() => `
    <div class="locked-item">
      <div class="locked-dot"></div>
      <div class="locked-text">· · · 继续和他相处，也许有一天会发生</div>
    </div>`).join('');

  container.innerHTML = `
    <div class="story-section-label">已解锁的回忆</div>
    <div class="film-track">${unlockedFilms}</div>
    <div class="swipe-hint">← 左右滑动 →</div>
    <div class="story-section-label" style="margin-top:16px;">尚未发生的故事</div>
    <div class="locked-list">${lockedItems}</div>
  `;
}

// ===== 好感度系统（60-100，持久化，隐藏）=====
function getAffection() {
  return parseInt(localStorage.getItem('affection') || '80');
}
function setAffection(val) {
  val = Math.max(60, Math.min(100, Math.round(val)));
  const prev = getAffection();
  localStorage.setItem('affection', val);
  touchLocalState();
  if (val === 60 && prev > 60) {
    const lastTalk = localStorage.getItem('hadTalkAt');
    const now = Date.now();
    if (!lastTalk || now - parseInt(lastTalk) > 7 * 24 * 3600000) {
      localStorage.setItem('hadTalkAt', now);
      setTimeout(() => triggerSeriousTalk(), 3000);
    }
  }
  return val;
}
function changeAffection(delta) {
  setAffection(getAffection() + delta);
}

function triggerSeriousTalk() {
  // 如果不在聊天页，存flag等下次进聊天再触发
  const chatScreen = document.getElementById('chatScreen');
  if (!chatScreen || !chatScreen.classList.contains('active')) {
    localStorage.setItem('pendingSeriousTalk', 'true');
    return;
  }
  localStorage.removeItem('pendingSeriousTalk');
  const prompt = '[系统：好感度已降至临界点。请你以西蒙的身份，主动发起一次认真的对话。你察觉到这段感情出了些问题，想正视它。不要直接说"我们谈谈"，用你自己的方式开口。语气认真但不失你的克制风格。]';
  chatHistory.push({ role: 'user', content: prompt });
  saveHistory();
  showTyping();
  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: getMainModel(),
      max_tokens: 1000,
      ...(() => { const _sys = buildSystemPrompt(); return { system: _sys, systemParts: buildSystemPromptParts(_sys) }; })(),
      messages: chatHistory.slice(-20)
    })
  }).then(r => r.json()).then(data => {
    hideTyping();
    const reply = data.content?.[0]?.text || '...';
    appendMessage('bot', reply.trim());
    chatHistory.push({ role: 'assistant', content: reply });
    saveHistory();
    // 谈完好感回升到70
    setAffection(70);
    changeMood(1);
  }).catch(() => { hideTyping(); });
}

// ===== 冷战系统 =====
let coldWarTimer = null;

function startColdWar() {
  localStorage.setItem('coldWarMode', 'true');
  localStorage.setItem('coldWarStart', Date.now());
  touchLocalState();
  changeMood(-3);
  changeAffection(-4);
  setMoodLevel(Math.min(getMoodLevel(), 2));
  if (coldWarTimer) clearTimeout(coldWarTimer);
  coldWarTimer = setTimeout(() => ghostApologize(), 3 * 60 * 60 * 1000);
  // 冷战入事件池，延迟30-120分钟后才可能发帖
  feedEvent_coldWarStarted();
}

function endColdWar(userApologized = false) {
  localStorage.setItem('coldWarMode', 'false');
  touchLocalState();
  if (coldWarTimer) { clearTimeout(coldWarTimer); coldWarTimer = null; }
  if (userApologized) {
    changeAffection(3);
    changeMood(2);
  } else {
    changeAffection(1);
    changeMood(1);
  }
  if (Math.random() < 0.3) {
    localStorage.setItem('pendingMakeupMoney', 'true');
    setTimeout(() => ghostSendMakeupMoney(), 5 * 60 * 1000);
  }
  localStorage.setItem('pendingColdWarEndStory', 'true');
  setTimeout(() => checkStoryOnColdWarEnd(), 8000);
  // 和好入事件池，延迟20-180分钟后才可能发帖（Ghost侧）
  feedEvent_madeUp();
  // 用户侧：和好是双方的事，延迟20-90分钟后弹草稿
  setTimeout(() => {
    showUserDraftCard({ type: 'made_up', actor: 'user', meta: {} });
  }, randMinutes(20, 90));
}

function ghostApologize() {
  if (localStorage.getItem('coldWarMode') !== 'true') return;
  const prompt = '[系统：冷战已超过3小时，用户没有道歉。请你主动打破僵局，用西蒙的方式道歉——不会说软话，但会用行动或简短的话示好。不要说"对不起"，用你自己的方式。]';
  chatHistory.push({ role: 'user', content: prompt });
  saveHistory();
  showTyping();
  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: getMainModel(),
      max_tokens: 500,
      ...(() => { const _sys = buildSystemPrompt(); return { system: _sys, systemParts: buildSystemPromptParts(_sys) }; })(),
      messages: chatHistory.slice(-20)
    })
  }).then(r => r.json()).then(async data => {
    hideTyping();
    const reply = data.content?.[0]?.text || '...';
    await emitGhostNarrativeEvent(reply.trim(), { storyId: 'cold_war_apology', delayMs: 0 });
    endColdWar(false);
  }).catch(() => { hideTyping(); });
}

function ghostSendMakeupMoney() {
  localStorage.removeItem('pendingMakeupMoney');
  const amount = (Math.floor(Math.random() * 3) + 1) * 10;
  const prompt = `[系统：冷战结束后，你决定悄悄给老婆转£${amount}，不说原因。用你的方式发一条消息，简短，可以完全不提转账的事，就像什么都没发生一样，或者只是轻描淡写地提一句。]`;
  chatHistory.push({ role: 'user', content: prompt });
  saveHistory();
  showTyping();
  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: getMainModel(),
      max_tokens: 300,
      ...(() => { const _sys = buildSystemPrompt(); return { system: _sys, systemParts: buildSystemPromptParts(_sys) }; })(),
      messages: chatHistory.slice(-20)
    })
  }).then(r => r.json()).then(async data => {
    hideTyping();
    const reply = data.content?.[0]?.text || '...';
    // showCard: false — 카드는 emitGhostNarrativeEvent가 _transfer로 저장해서 렌더링
    applyMoneyEffect(amount, { label: 'Ghost 悄悄转账', showCard: false, bypassCooldown: true, bypassSessionLimit: true, bypassRefundCooldown: true });
    await emitGhostNarrativeEvent(reply, { storyId: 'cold_war_makeup_money', delayMs: 0, transfer: { amount, isRefund: false } });
    // 카드 렌더링 (emitGhostNarrativeEvent는 텍스트만 추가, 카드는 별도 렌더)
    setTimeout(() => {
      const container = document.getElementById('messagesContainer');
      if (container) showGhostTransferCard(container, amount, '', false);
    }, 600);
  }).catch(() => { hideTyping(); });
}

// ===== 每周零花钱上限 =====
function getWeeklyGiven() {
  const key = 'weeklyGiven_' + getWeekKey();
  return parseInt(localStorage.getItem(key) || '0');
}
function addWeeklyGiven(amount) {
  const key = 'weeklyGiven_' + getWeekKey();
  localStorage.setItem(key, getWeeklyGiven() + amount);
}
function getWeekKey() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
  return now.getFullYear() + '_w' + week;
}

// ===== 统一给钱执行函数 =====
function applyMoneyEffect(amount, options = {}) {
  if (!amount || amount <= 0) return false;

  const userRequested = options.userRequested || false; // 用户主动要的，限制宽松

  // 0. 用户长期表达不喜欢被钱哄 → Ghost主动给时跳过（用户主动要除外）
  if (!userRequested && localStorage.getItem('userDislikesMoney') === 'true') return false;

  // 1. 每日次数：用户主动要最多5次，Ghost主动给最多2次
  const todayCount = getTodayGivenCount();
  const dailyLimit = userRequested ? 5 : 2;
  if (todayCount >= dailyLimit) return false;

  // 2. 两次之间冷却：用户主动要不受冷却限制
  if (!userRequested && !options.bypassCooldown) {
    const lastGivenAt = parseInt(localStorage.getItem('lastGivenAt') || '0');
    const transferCooldown = 30 * 60 * 1000;
    if (Date.now() - lastGivenAt < transferCooldown) return false;
  }

  // 3. 退款后2小时内禁止Ghost主动再给（用户主动要不受此限）
  if (!userRequested && !options.bypassRefundCooldown) {
    const lastRefundAt = parseInt(localStorage.getItem('lastRefundAt') || '0');
    const refundCooldown = 2 * 3600 * 1000;
    if (Date.now() - lastRefundAt < refundCooldown) return false;
  }

  // 4. 本轮对话Ghost最多主动给1次（用户主动要不受此限）
  const conversationGiven = parseInt(sessionStorage.getItem('conversationGivenCount') || '0');
  if (!userRequested && !options.bypassSessionLimit) {
    if (conversationGiven >= 1) return false;
  }

  // 每周上限检查——吃醋/和好情绪性转账可绕过
  const weeklyUsed = getWeeklyGiven();
  if (!options.bypassWeeklyLimit) {
    if (weeklyUsed >= 300) return false;
  }
  const actualAmount = options.bypassWeeklyLimit
    ? amount
    : Math.min(amount, 300 - weeklyUsed);

  setBalance(getBalance() + actualAmount);
  addWeeklyGiven(actualAmount);
  incrementTodayGivenCount();
  localStorage.setItem('lastGivenAt', Date.now());
  sessionStorage.setItem('conversationGivenCount', String(conversationGiven + 1)); // 本轮计数
  addTransaction({ icon: '💷', name: options.label || 'Ghost 零花钱', amount: actualAmount });
  renderWallet();
  if (options.affection !== false) changeAffection(1);

  // 渲染转账卡片
  if (options.showCard !== false) {
    setTimeout(() => {
      const container = document.getElementById('messagesContainer');
      if (container) showGhostTransferCard(container, actualAmount, options.note || '', false);
    }, options.cardDelay || 600);
  }

  return actualAmount;
}

// ===== 长时间未上线扣好感 =====
function checkOfflinePenalty() {
  const last = parseInt(localStorage.getItem('lastOnlineTime') || Date.now());
  const hours = (Date.now() - last) / 3600000;
  if (hours >= 48) {
    const days = Math.floor(hours / 24);
    changeAffection(-Math.min(days - 1, 5)); // 最多扣5
  }
  // 离线超过12小时，Ghost主动发一条（每次回来只触发一次）
  if (hours >= 12) {
    const todayKey = 'ghostInitMsg_' + new Date().toDateString();
    if (!localStorage.getItem(todayKey)) {
      localStorage.setItem(todayKey, '1');
      setTimeout(() => ghostSendInitMessage(hours), 6000);
    }
  }
  localStorage.setItem('lastOnlineTime', Date.now());
}

async function ghostSendInitMessage(offlineHours) {
  const hintMap = [
    { min: 12,  max: 24,  hint: '她离线了大半天，刚回来。' },
    { min: 24,  max: 48,  hint: '她昨天不在，今天才回来。' },
    { min: 48,  max: 96,  hint: '她消失了两天，刚出现。' },
    { min: 96,  max: Infinity, hint: '她好几天没来，今天突然回来了。' },
  ];
  const hint = hintMap.find(h => offlineHours >= h.min && offlineHours < h.max)?.hint || '';
  try {
    showTyping();
    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        ...(() => { const _sys = buildSystemPrompt(); return { system: _sys, systemParts: buildSystemPromptParts(_sys) }; })(),
        messages: [...chatHistory.slice(-6), {
          role: 'user',
          content: `[系统：${hint}你注意到了，主动说一句——可以是质问、可以是随口一提、可以是什么都不说只是打个招呼。全小写，附中文翻译。]`
        }]
      })
    });
    const data = await res.json();
    hideTyping();
    let reply = data.content?.[0]?.text?.trim() || '';
    if (reply) {
      reply = reply.replace(/\n?(REFUND|KEEP|COLD_WAR_START|GIVE_MONEY:[^\n]*)\n?/gi, '').trim();
      appendMessage('bot', reply);
      chatHistory.push({ role: 'assistant', content: reply });
      saveHistory();
    }
  } catch(e) { hideTyping(); }
}

// ===== 频繁要钱记录 =====
function getTodayMoneyRequests() {
  const key = 'moneyReq_' + new Date().toISOString().slice(0,10);
  return parseInt(localStorage.getItem(key) || '0');
}
function incrementMoneyRequest() {
  const key = 'moneyReq_' + new Date().toISOString().slice(0,10);
  const count = getTodayMoneyRequests() + 1;
  localStorage.setItem(key, count);
  if (count >= 3) changeAffection(-1);
  return count;
}
function getTodayGivenCount() {
  const key = 'givenCount_' + new Date().toISOString().slice(0,10);
  return parseInt(localStorage.getItem(key) || '0');
}
function incrementTodayGivenCount() {
  const key = 'givenCount_' + new Date().toISOString().slice(0,10);
  localStorage.setItem(key, getTodayGivenCount() + 1);
}

// ===== 转账弹窗 =====
// ===== 表情包系统 =====
const STICKER_META = {
  cry:   { label: '哭',    emotion: 'sad',   ghostHint: '用户发了哭/撒娇/委屈的表情包，她可能在撒娇或者有点难过，根据对话语境判断，给出对应回应。' },
  shy:   { label: '害羞',  emotion: 'shy',   ghostHint: '用户发了害羞的表情包，被说中了什么或者有点不好意思，简短自然回应。' },
  angry: { label: '生气',  emotion: 'angry', ghostHint: '用户发了生气/闹脾气的表情包，根据上下文判断是真生气还是撒娇式生气，回应要对。' },
  meh:   { label: '无语',  emotion: 'meh',   ghostHint: '用户发了无语/嫌弃的表情包，可能觉得他说的话很欠揍，干脆回应。' },
  star:  { label: '星星眼',emotion: 'want',  ghostHint: '用户发了星星眼/渴望/期待的表情包，她在期待或者想要什么，顺着语境回应。' },
  kiss:  { label: '亲亲',  emotion: 'love',  ghostHint: '用户发了亲亲/示爱的表情包，她在撒娇或表达亲热，Ghost可以嘴硬但不能冷漠。' },
};

function togglePlusPanel() {
  const panel = document.getElementById('plusPanel');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (isOpen) {
    const sub = document.getElementById('stickerSubPanel');
    if (sub) sub.style.display = 'none';
  }
}

function closePlusPanel() {
  const panel = document.getElementById('plusPanel');
  if (panel) panel.style.display = 'none';
  const sub = document.getElementById('stickerSubPanel');
  if (sub) sub.style.display = 'none';
}

function toggleStickerFromPlus() {
  const sub = document.getElementById('stickerSubPanel');
  if (!sub) return;
  sub.style.display = sub.style.display === 'none' ? 'block' : 'none';
}

function toggleStickerPanel() { togglePlusPanel(); }
function closeStickerPanel() { closePlusPanel(); }

async function sendSticker(id) {
  closePlusPanel();
  const meta = STICKER_META[id];
  if (!meta) return;

  // 条数检查：用完了不触发Ghost回复
  const email = localStorage.getItem('userEmail') || '';
  if (email) {
    const sub = await getSubscription();
    if (!sub || sub.remaining <= 0) {
      appendMessage('bot', 'got called away. give me a bit.\n临时有任务，等我。');
      return;
    }
  } else {
    const todayCount = getTodayCount();
    if (todayCount >= DAILY_LIMIT) {
      appendMessage('bot', "that's enough for today.\n今天就到这。");
      return;
    }
  }

  // 渲染用户表情包
  const container = document.getElementById('messagesContainer');
  if (container) {
    const div = document.createElement('div');
    div.className = 'message user';
    div.innerHTML = `<div class="sticker-message"><img src="images/stickers/${id}.png" alt="${meta.label}"></div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  // 存进历史——带情绪描述让Ghost理解
  const stickerMsg = `[用户发了表情包：${meta.label}]`;
  chatHistory.push({ role: 'user', content: stickerMsg });
  saveHistory();

  if (_isSending) return;
  _isSending = true;
  showTyping();

  try {
    const cleanHistory = chatHistory
      .filter(m => !m._system && !m._recalled)
      .slice(-30)
      .map(m => ({ role: m.role, content: m.content }));

    // 把表情包情绪提示注入system
    const _stickerBase = buildSystemPrompt();
    const stickerSystem = _stickerBase + `\n\n[本轮提示：${meta.ghostHint}不要提"表情包"三个字，自然回应就好。]`;

    const response = await fetchWithRetry('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: getMainModel(),
        max_tokens: 300,
        system: stickerSystem,
        systemParts: buildSystemPromptParts(_stickerBase),
        messages: cleanHistory,
      })
    }, 30000);

    const data = await response.json();
    hideTyping();
    let reply = data.content?.[0]?.text?.trim() || '';
    if (!reply) throw new Error('EMPTY_REPLY');
    reply = reply.replace(/\n?(REFUND|KEEP|COLD_WAR_START|GIVE_MONEY:[^\n]*)\n?/gi, '').trim();

    // Ghost偶尔也发表情包
    appendMessage('bot', reply);
    if (id === 'kiss' && Math.random() < 0.08) {
      setTimeout(() => appendGhostSticker('kiss'), 1500);
    } else if (id === 'meh' && Math.random() < 0.12) {
      setTimeout(() => appendGhostSticker('meh'), 1200);
    }

    chatHistory.push({ role: 'assistant', content: reply });
    saveHistory();
  } catch(e) {
    hideTyping();
    console.warn('表情包回复失败:', e);
  } finally {
    _isSending = false;
  }
}

function appendGhostSticker(id) {
  const container = document.getElementById('messagesContainer');
  if (!container) return;
  const meta = STICKER_META[id];
  const div = document.createElement('div');
  div.className = 'message bot';
  div.innerHTML = `<div class="sticker-message"><img src="images/stickers/${id}.png" alt="${meta?.label || ''}"></div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  chatHistory.push({ role: 'assistant', content: `[Ghost发了表情包：${meta?.label || id}]` });
  saveHistory();
}

function openTransfer() {
  // 条数上限检查
  if (getTodayCount() >= DAILY_LIMIT) {
    showToast('今天的消息条数已用完，明天再来哦 💌');
    return;
  }
  const balance = getBalance();
  const balEl = document.getElementById('transferBalance');
  if (balEl) balEl.textContent = '£' + Math.floor(balance);
  document.getElementById('transferAmount').value = '';
  document.getElementById('transferOverlay').classList.add('show');
  document.getElementById('transferModal').classList.add('show');
  setTimeout(() => document.getElementById('transferAmount').focus(), 100);
}

function closeTransfer() {
  document.getElementById('transferOverlay').classList.remove('show');
  document.getElementById('transferModal').classList.remove('show');
}

function confirmTransfer() {
  const amount = parseInt(document.getElementById('transferAmount').value);
  const balance = getBalance();
  if (!amount || amount <= 0) return;
  if (amount > balance) {
    document.getElementById('transferAmount').placeholder = '余额不足';
    document.getElementById('transferAmount').value = '';
    return;
  }
  closeTransfer();

  setBalance(balance - amount);
  addTransaction({ icon: '💸', name: '转账给 Ghost', amount: -amount });
  renderWallet();

  const mood = getMoodLevel();
  const coldWar = localStorage.getItem('coldWarMode') === 'true';

  let judgePrompt = '';
  if (coldWar) {
    judgePrompt = `[系统：角色扮演中，用户刚向Ghost转了£${amount}（虚拟道具）。当前冷战，Ghost 100%退款，冷淡说退回去了。你是Ghost，保持角色，在回复末尾单独一行写：REFUND]`;
  } else {
    judgePrompt = `[系统：角色扮演中，用户刚向Ghost转了£${amount}（虚拟道具）。Ghost心情${mood}/10。无理由转账80%退款20%收下，心情好收下概率略高。你是Ghost，保持角色自然回复，在回复末尾单独一行写：REFUND 或 KEEP]`;
  }

  chatHistory.push({ role: 'user', content: judgePrompt, _system: true, _userTransfer: { amount } });
  saveHistory();

  const container = document.getElementById('messagesContainer');
  const cardId = container ? showUserTransferCard(container, amount) : null;

  showTyping();
  _isSending = true;
  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      ...(() => { const _sys = buildSystemPrompt(); return { system: _sys, systemParts: buildSystemPromptParts(_sys) }; })(),
      messages: cleanMessages(chatHistory.slice(-10))
    })
  }).then(r => r.json()).then(data => {
    hideTyping();
    let reply = data.content?.[0]?.text || '...';
    updateToRead();
    const shouldRefund = reply.includes('REFUND') || (!reply.includes('KEEP') && (coldWar || Math.random() < 0.8));
    reply = reply.replace(/\n?(REFUND|KEEP|COLD_WAR_START)\n?/gi, '').replace(/\s{2,}/g, ' ').trim();
    if (shouldRefund) {
      // 退款：加回余额，更新卡片状态，显示退款卡片
      setBalance(getBalance() + amount);
      addTransaction({ icon: '↩️', name: '退款（Ghost 退回）', amount: amount });
      localStorage.setItem('lastRefundAt', Date.now()); // 记录退款时间，退款后本轮禁止再主动转账
      renderWallet();
      updateUserTransferCard(cardId, false);
      if (container) showGhostTransferCard(container, amount, reply, true);
    } else {
      // Ghost收下：更新卡片状态为已收到，只显示回复
      changeAffection(1);
      updateUserTransferCard(cardId, true);
      if (reply) {
        appendMessage('bot', reply);
      }
    }
    chatHistory.push({ role: 'assistant', content: reply });
    saveHistory();
    _isSending = false;
  }).catch(() => {
    hideTyping();
    _isSending = false;
    setBalance(getBalance() + amount);
    addTransaction({ icon: '↩️', name: '退款（网络错误）', amount: amount });
    renderWallet();
    updateUserTransferCard(cardId, false);
    appendMessage('bot', '...\n[网络不太好，等一下。]');
  });
}

function showUserTransferCard(container, amount) {
  const now = new Date();
  const timeStr = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  const cardId = 'utc_' + Date.now();
  const div = document.createElement('div');
  div.className = 'message user';
  div.innerHTML = `<div class="transfer-card user-transfer-card" id="${cardId}">
    <div class="transfer-card-top">
      <div class="transfer-label">TRANSFER TO</div>
      <div class="transfer-name">Simon Riley</div>
    </div>
    <div class="transfer-amount-block">
      <div class="transfer-amount-label">AMOUNT</div>
      <div class="transfer-amount">£${amount}</div>
    </div>
    <div class="transfer-footer">
      <div class="transfer-status" id="${cardId}_status">🌸 待确认</div>
      <div class="transfer-time">${timeStr}</div>
    </div></div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return cardId;
}

function updateUserTransferCard(cardId, kept) {
  const statusEl = document.getElementById(cardId + '_status');
  if (!statusEl) return;
  statusEl.textContent = kept ? '✅ 已收到' : '↩️ 已退回';
  statusEl.style.color = kept ? '#a855f7' : '#9ca3af';
}

function showGhostTransferCard(container, amount, noteText, isRefund) {
  const now = new Date();
  const timeStr = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  // note 只有纯中文时不单独渲染（卡片本身已有转账说明，避免冒出一条孤立中文消息）
  const hasEnglish = noteText && /[a-zA-Z]/.test(noteText);
  if (noteText && hasEnglish) {
    const parts = noteText.split(/\n---\n/).filter(p => p.trim());
    if (parts.length > 1) {
      parts.forEach((p, i) => setTimeout(() => appendMessage('bot', p.trim()), i * 600));
    } else {
      appendMessage('bot', noteText);
    }
  }
  setTimeout(() => {
    // Ghost转出 → 左边灰色卡片
    const divOut = document.createElement('div');
    divOut.className = 'message bot';
    divOut.innerHTML = `<div class="transfer-card ghost-transfer-card ${isRefund ? 'refund-card' : ''}">
      <div class="transfer-card-top">
        <div class="transfer-label">${isRefund ? 'REFUND' : 'TRANSFER TO YOU'}</div>
        <div class="transfer-name">${isRefund ? '退款' : '转给你'}</div>
      </div>
      <div class="transfer-amount-block">
        <div class="transfer-amount-label">AMOUNT</div>
        <div class="transfer-amount">£${amount}</div>
      </div>
      <div class="transfer-footer">
        <div class="transfer-status ${isRefund ? 'refund-status' : ''}">${isRefund ? '退款中' : '转账中'}</div>
        <div class="transfer-time">${timeStr}</div>
      </div></div>`;
    container.appendChild(divOut);
    // 用户收到 → 右边粉色卡片（延迟1秒）
    setTimeout(() => {
      const divIn = document.createElement('div');
      divIn.className = 'message user';
      divIn.innerHTML = `<div class="transfer-card user-transfer-card">
        <div class="transfer-card-top">
          <div class="transfer-label">RECEIVED</div>
          <div class="transfer-name">${isRefund ? '已退款 ✓' : '已到账 ✓'}</div>
        </div>
        <div class="transfer-amount-block">
          <div class="transfer-amount-label">AMOUNT</div>
          <div class="transfer-amount">£${amount}</div>
        </div>
        <div class="transfer-footer">
          <div class="transfer-status">${isRefund ? '已退款' : '已到账'}</div>
          <div class="transfer-time">${timeStr}</div>
        </div></div>`;
      container.appendChild(divIn);
      container.scrollTop = container.scrollHeight;
    }, 1000);
    container.scrollTop = container.scrollHeight;
  }, noteText ? 800 : 0);
}
let chatHistory = [];
let _isSending = false; // 防止切页面时重新渲染吞掉正在等待的bot回复
let _chatInited = false; // 防止重复初始化导致闪屏
let _renderedMsgCount = 0; // 已渲染的消息数量，用于增量渲染

function getMainModel() { return 'claude-sonnet-4-6'; }
let lastMessageTime = null;

async function initChat() {
  // 好感度初始化（首次）
  if (!localStorage.getItem('affection')) setAffection(80);

  // 副作用初始化——统一在这里做，buildSystemPrompt 只读不写
  ensureGhostBirthday();
  // 每次会话只轮换一次今日细节，存入 sessionStorage 供 prompt 读取
  if (!sessionStorage.getItem('todayDetail')) {
    sessionStorage.setItem('todayDetail', pickTodayDetail());
  }

  // 每次进聊天都检查一次快递进度，不依赖用户打开商城
  try { checkDeliveryUpdates(); } catch(e) {}

  // 纪念日/整数天检测 → 弹用户草稿
  const _marriageDate = localStorage.getItem('marriageDate');
  if (_marriageDate) {
    const _days = Math.max(1, Math.floor((Date.now() - new Date(_marriageDate).getTime()) / 86400000) + 1);
    const _isMilestone = _days === 52 || (_days % 100 === 0 && _days > 0) || _days === 365;
    const _isAnniversary = _days >= 365 && (() => {
      const [,mm,dd] = _marriageDate.split('-').map(Number);
      const now = new Date();
      return now.getMonth() + 1 === mm && now.getDate() === dd;
    })();
    const _milestoneKey = 'milestoneDraftShown_' + _days;
    if ((_isMilestone || _isAnniversary) && !localStorage.getItem(_milestoneKey)) {
      localStorage.setItem(_milestoneKey, '1');
      setTimeout(() => {
        showUserDraftCard({
          type: 'anniversary', actor: 'user',
          meta: { days: _days, isAnniversary: _isAnniversary }
        });
      }, 8000); // 进聊天8秒后弹，不要太急
    }
  }

  // 检查待触发的"我们谈谈"
  if (localStorage.getItem('pendingSeriousTalk') === 'true') {
    setTimeout(() => triggerSeriousTalk(), 2000);
  }

  // 检查冷战结束后的化解转账（刷新前没执行完的）
  if (localStorage.getItem('pendingMakeupMoney') === 'true') {
    setTimeout(() => ghostSendMakeupMoney(), 5 * 60 * 1000);
  }

  // 检查冷战结束剧情（刷新前没执行完的）
  if (localStorage.getItem('pendingColdWarEndStory') === 'true') {
    setTimeout(() => checkStoryOnColdWarEnd(), 3000);
  }

  // 检查冷战超时道歉
  if (localStorage.getItem('pendingGhostApology') === 'true') {
    localStorage.removeItem('pendingGhostApology');
    setTimeout(() => ghostApologize(), 3000);
  }

  // 恢复朋友圈新动态提示
  if (localStorage.getItem('feedHasNew') === '1') {
    const badge = document.getElementById('feedNewBadge');
    if (badge) badge.style.display = 'block';
  }

  // 检查离线扣好感
  checkOfflinePenalty();

  // 检查解锁剧情（sessionStart类型）
  setTimeout(checkStoryOnSessionStart, 1500);

  // 恢复冷战计时器
  if (localStorage.getItem('coldWarMode') === 'true') {
    const coldStart = parseInt(localStorage.getItem('coldWarStart') || Date.now());
    const remaining = 3 * 60 * 60 * 1000 - (Date.now() - coldStart);
    if (remaining > 0) {
      if (coldWarTimer) clearTimeout(coldWarTimer);
      coldWarTimer = setTimeout(() => ghostApologize(), remaining);
    } else {
      ghostApologize();
    }
  }

  // 地点/天气/时间/心情
  const loc = initLocation();
  updateWeather(loc.weatherCity);
  updateUKTime();
  initMood();
  if (window._ukTimeInterval) clearInterval(window._ukTimeInterval);
  window._ukTimeInterval = setInterval(updateUKTime, 60000);

  // 先从云端加载数据，再读取历史记录（避免闪屏）
  const container = document.getElementById('messagesContainer');
  if (!container) return;
  await loadFromCloud();
  const saved = localStorage.getItem('chatHistory');
  if (saved) {
    try { chatHistory = JSON.parse(saved); } catch(e) { chatHistory = []; }
  }

  // 如果正在等bot回复，不清空重渲染（否则会吞掉还没存进chatHistory的消息）
  if (_isSending) return;
  _chatInited = true;
  // 更新header名字——放在这里确保只执行一次，防止语音输入时反复闪烁
  const nameEl = document.getElementById('chatBotName');
  if (nameEl) nameEl.textContent = localStorage.getItem('botNickname') || 'Simon "Ghost" Riley';
  container.innerHTML = '';
  chatHistory.forEach(msg => {
    if (msg.role === 'user') {
      if (msg._system || msg.content.startsWith('[系统') || msg.content.startsWith('[System') || /\b(REFUND|KEEP)\b/.test(msg.content)) {
        if (msg._userTransfer) {
          const container = document.getElementById('messagesContainer');
          if (container) showUserTransferCard(container, msg._userTransfer.amount);
        }
        return;
      }
      // 检测用户发的表情包
      const userStickerMatch = msg.content.match(/^\[用户发了表情包：(.+)\]$/);
      if (userStickerMatch) {
        const label = userStickerMatch[1];
        const stickerId = Object.keys(STICKER_META).find(k => STICKER_META[k].label === label) || label;
        const container = document.getElementById('messagesContainer');
        if (container) {
          const div = document.createElement('div');
          div.className = 'message user';
          div.innerHTML = `<div class="sticker-message"><img src="images/stickers/${stickerId}.png" alt="${label}"></div>`;
          container.appendChild(div);
        }
        return;
      }
      appendMessage('user', msg.content, false);
    } else if (msg.role === 'assistant') {
      if (msg._recalled) return;
      // 检测Ghost发的表情包
      const ghostStickerMatch = msg.content.match(/^\[Ghost发了表情包：(.+)\]$/);
      if (ghostStickerMatch) {
        const label = ghostStickerMatch[1];
        const stickerId = Object.keys(STICKER_META).find(k => STICKER_META[k].label === label) || label;
        const container = document.getElementById('messagesContainer');
        if (container) {
          const div = document.createElement('div');
          div.className = 'message bot';
          div.innerHTML = `<div class="sticker-message"><img src="images/stickers/${stickerId}.png" alt="${label}"></div>`;
          container.appendChild(div);
        }
        return;
      }
      const parts = msg.content.split(/\n---\n/);
      parts.forEach(part => appendMessage('bot', part.trim(), false));
      // 重建转账卡片（静态版，不走setTimeout，防重复）
      if (msg._transfer) {
        const container = document.getElementById('messagesContainer');
        const cardId = 'transfer_' + chatHistory.indexOf(msg);
        if (container && !document.getElementById(cardId)) {
          const { amount: rawAmount, isRefund } = msg._transfer;
          const amount = parseInt(rawAmount, 10) || 0;
          // Ghost 转出卡片（左边灰色）
          const divOut = document.createElement('div');
          divOut.className = 'message bot';
          divOut.innerHTML = `<div class="transfer-card ghost-transfer-card ${isRefund ? 'refund-card' : ''}">
            <div class="transfer-card-top">
              <div class="transfer-label">${isRefund ? 'REFUND' : 'TRANSFER TO YOU'}</div>
              <div class="transfer-name">${isRefund ? '退款' : '转给你'}</div>
            </div>
            <div class="transfer-amount-block">
              <div class="transfer-amount-label">AMOUNT</div>
              <div class="transfer-amount">£${amount}</div>
            </div>
            <div class="transfer-footer">
              <div class="transfer-status ${isRefund ? 'refund-status' : ''}">${isRefund ? '退款中' : '转账中'}</div>
            </div></div>`;
          container.appendChild(divOut);
          // 用户收到卡片（右边粉色）
          const divIn = document.createElement('div');
          divIn.className = 'message user';
          divIn.id = cardId;
          divIn.innerHTML = `<div class="transfer-card user-transfer-card">
            <div class="transfer-card-top">
              <div class="transfer-label">RECEIVED</div>
              <div class="transfer-name">${isRefund ? '已退款 ✓' : '已到账 ✓'}</div>
            </div>
            <div class="transfer-amount-block">
              <div class="transfer-amount-label">AMOUNT</div>
              <div class="transfer-amount">£${amount}</div>
            </div>
            <div class="transfer-footer">
              <div class="transfer-status">${isRefund ? '已退款' : '已到账'}</div>
            </div></div>`;
          container.appendChild(divIn);
        }
      }
    }
  });
  _renderedMsgCount = chatHistory.filter(m => !m._system && !m._recalled).length;
  scrollToBottom();
}

// ===== 时间分割线 =====
function shouldShowTime(now) {
  if (!lastMessageTime) return true;
  return (now - lastMessageTime) > 15 * 60 * 1000;
}

function formatTime(date) {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function appendTimeDivider(date) {
  const container = document.getElementById('messagesContainer');
  const div = document.createElement('div');
  div.className = 'time-divider';
  div.innerHTML = `<span>${formatTime(date)}</span>`;
  container.appendChild(div);
}

// ===== 添加消息气泡 =====
function appendMessage(role, text, animate = true) {
  const container = document.getElementById('messagesContainer');
  const now = new Date();

  // 自动清理未处理的系统tag，防止显示在聊天里
  if (role === 'bot' || role === 'assistant') {
    text = text.replace(/\n?(REFUND|KEEP|COLD_WAR_START|GIVE_MONEY:[^\n]*)\n?/gi, '').trim();
  }

  if (animate && shouldShowTime(now)) {
    appendTimeDivider(now);
    lastMessageTime = now;
  }

  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  // 渲染前清理系统标记和多余括号
  text = text.replace(/\n?(REFUND|KEEP)\n?/gi, '').trim();
  // 过滤 --- 开头的旁白行（系统提示渗漏）
  text = text.split('\n').filter(line => !line.trim().startsWith('---')).join('\n').trim();
  // 过滤第三人称旁白行——以"他"开头描述Ghost自己状态的句子
  if (role === 'bot') {
    text = text.split('\n').filter(line => {
      const t = line.trim();
      // 过滤掉纯中文的第三人称旁白（以"他"开头且不含英文）
      if (/^他[^a-zA-Z]{0,30}[。，]?$/.test(t) && !/[a-zA-Z]/.test(t)) return false;
      return true;
    }).join('\n').trim();
  }
  // *动作描述* 格式：转成斜体显示而不是过滤掉
  text = text.replace(/\*([^*]+)\*/g, '「$1」');
  // 清掉模型输出的方括号（翻译格式残留）
  text = text.replace(/\[([^\]]*)\]/g, '$1').replace(/\s{2,}/g, ' ').trim();

  // 预处理：把英中混排重新整理成标准 "英文行\n中文行" 格式
  if (role === 'bot') {
    const hasChinese = /[\u4e00-\u9fff]/.test(text);
    const hasEnglish = /[a-zA-Z]/.test(text);
    if (hasChinese && hasEnglish) {
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      // 检查是否已经是标准格式：英文行后面紧跟中文行
      // 如果已经是标准格式就不处理，直接用
      const isAlreadyFormatted = lines.length >= 2 && lines.some(l => /[a-zA-Z]/.test(l) && !/[\u4e00-\u9fff]/.test(l)) && lines.some(l => /[\u4e00-\u9fff]/.test(l));
      if (isAlreadyFormatted) {
        // 已经是英文+中文的格式，找到第一个中文行的位置作为分界
        const firstZhIdx = lines.findIndex(l => /[\u4e00-\u9fff]/.test(l));
        if (firstZhIdx > 0) {
          const enPart = lines.slice(0, firstZhIdx).join(' ');
          const zhPart = lines.slice(firstZhIdx).join('');
          text = enPart + '\n' + zhPart;
        }
        // 如果格式已对，不再重排
      } else {
        // 真正乱序的情况才重排
        const sentences = text.split(/(?<=[.!?。！？\n])\s*/);
        const enParts = [];
        const zhParts = [];
        sentences.forEach(s => {
          s = s.trim();
          if (!s) return;
          if (/[\u4e00-\u9fff]/.test(s)) {
            const PROTECTED = ['gaz', 'soap', 'price', 'ghost', 'simon', 'riley', 'johnny', 'kyle'];
            const cleaned = s.replace(/\b[a-z]{3,}(?:\s+[a-z]+)*\b/g, match => {
              if (PROTECTED.some(n => match.toLowerCase().includes(n))) return match;
              return '';
            }).replace(/\s{2,}/g, ' ').trim();
            zhParts.push(cleaned);
          } else {
            enParts.push(s);
          }
        });
        const enText = enParts.join(' ').trim();
        const zhText = zhParts.join('').trim();
        if (enText && zhText) {
          text = enText + '\n' + zhText;
        } else if (enText) {
          text = enText;
        } else if (zhText) {
          text = zhText;
        }
      }
    }
  }

  // 分离英文和中文翻译：找到第一个含中文字符的行作为分界
  const lines = text.split('\n').filter(l => l.trim());
  const isChinese = s => /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(s);
  if (role === 'bot') {
    const firstZhIdx = lines.findIndex(l => isChinese(l));
    const firstEnIdx = lines.findIndex(l => /[a-zA-Z]/.test(l) && !isChinese(l));
    if (firstZhIdx > 0) {
      // 标准格式：英文行在前，中文行在后
      const enLines = lines.slice(0, firstZhIdx);
      const zhFallback = lines.slice(firstZhIdx).map(l => l.replace(/\b[A-Z]{2,}\b/g, '').trim()).filter(l => l).slice(0, 1).join('');
      const enLine = document.createElement('div');
      enLine.className = 'bubble-en';
      enLine.textContent = enLines.join('\n');
      enLine.style.whiteSpace = 'pre-line';
      const zhLine = document.createElement('div');
      zhLine.className = 'bubble-zh';
      zhLine.textContent = zhFallback; // 先显示模型原中文，Gemini 成功后覆盖
      bubble.appendChild(enLine);
      bubble.appendChild(zhLine);
    } else if (firstZhIdx === 0 && firstEnIdx > 0) {
      // 中文在前英文在后——重新排列，英文提到前面
      const enLines = lines.filter(l => !isChinese(l) && l.trim());
      const zhFallback2 = lines.filter(l => isChinese(l)).map(l => l.replace(/\b[A-Z]{2,}\b/g, '').trim()).filter(l => l).slice(0, 1).join('');
      const enLine = document.createElement('div');
      enLine.className = 'bubble-en';
      enLine.textContent = enLines.join('\n');
      enLine.style.whiteSpace = 'pre-line';
      const zhLine = document.createElement('div');
      zhLine.className = 'bubble-zh';
      zhLine.textContent = zhFallback2;
      bubble.appendChild(enLine);
      bubble.appendChild(zhLine);
      // 同一行英中混排，如 "yeah. [嗯。]" 或 "yeah. 嗯。"
      // 把中文及前面的分隔符拆出来
      const raw = lines[0];
      const zhMatch = raw.match(/([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef「」【】《》，。！？、…—～·]+)/);
      if (zhMatch) {
        const enPart = raw.slice(0, raw.indexOf(zhMatch[0])).replace(/[\[\(（【「《\s]+$/, '').trim();
        const zhFallback3 = zhMatch ? zhMatch[0] : '';
        const enLine = document.createElement('div');
        enLine.className = 'bubble-en';
        enLine.textContent = enPart;
        const zhLine = document.createElement('div');
        zhLine.className = 'bubble-zh';
        zhLine.textContent = zhFallback3;
        bubble.appendChild(enLine);
        bubble.appendChild(zhLine);
      } else {
        bubble.textContent = text;
      }
    } else {
      // 纯英文或无中文——加一个空的 zh 占位，让 Gemini 填入翻译
      if (role === 'bot' && /[a-zA-Z]/.test(text) && text.trim().length > 3) {
        const enLine = document.createElement('div');
        enLine.className = 'bubble-en';
        enLine.textContent = text;
        enLine.style.whiteSpace = 'pre-line';
        const zhLine = document.createElement('div');
        zhLine.className = 'bubble-zh';
        zhLine.textContent = '';
        bubble.appendChild(enLine);
        bubble.appendChild(zhLine);
      } else {
        bubble.textContent = text;
      }
    }
  } else {
    bubble.textContent = text;
  }

  contentDiv.appendChild(bubble);

  if (role === 'user') {
    const status = document.createElement('div');
    status.className = 'message-status';
    status.textContent = '已发送';
    contentDiv.appendChild(status);
  } else {
    // bot消息：点击气泡才显示收藏按钮
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.style.display = 'none';
    const collectBtn = document.createElement('button');
    collectBtn.className = 'message-action-btn';
    collectBtn.textContent = '⭐';
    collectBtn.title = '收藏';
    collectBtn.onclick = function(e) { e.stopPropagation(); collectMessage(this); };
    actions.appendChild(collectBtn);
    contentDiv.appendChild(actions);

    // 内心独白浮窗（初始隐藏，异步填充）
    const innerThought = document.createElement('div');
    innerThought.className = 'inner-thought';
    innerThought.style.display = 'none';
    innerThought.dataset.ready = '0';
    innerThought.innerHTML = '<span class="inner-thought-label">👁 只有你知道</span><div class="inner-thought-text"></div>';
    contentDiv.appendChild(innerThought);
    // 💭按钮：只有用户已经看过才重置，否则保持亮着（新心声会进队列）
    const thoughtBtn = document.getElementById('thoughtBtn');
    if (thoughtBtn && thoughtBtn.dataset.hasThought !== '1') {
      thoughtBtn.style.opacity = '0.3';
      thoughtBtn.classList.remove('thought-btn-pulse');
    }

    // 点击气泡显示/隐藏收藏按钮
    bubble.style.cursor = 'pointer';
    bubble.onclick = function(e) {
      // 隐藏其他所有收藏按钮
      document.querySelectorAll('.message-actions').forEach(a => {
        if (a !== actions) a.style.display = 'none';
      });
      actions.style.display = actions.style.display === 'none' ? 'flex' : 'none';
    };
  }

  msgDiv.appendChild(contentDiv);
  container.appendChild(msgDiv);

  if (animate) scrollToBottom();
  const innerThoughtEl = msgDiv.querySelector('.inner-thought');
  return { msgDiv, bubble, innerThoughtEl };
}

// ===== 打字动画 =====
function showTyping() {
  const container = document.getElementById('messagesContainer');
  const div = document.createElement('div');
  div.className = 'message bot';
  div.id = 'typingIndicator';
  div.innerHTML = `
    <div class="message-content">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>`;
  container.appendChild(div);
  scrollToBottom();
}

function hideTyping() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

// ===== 已读状态更新 =====
function updateToRead() {
  const statuses = document.querySelectorAll('.message.user .message-status');
  statuses.forEach(s => { s.textContent = '已读'; });
}

// ===== 滚动到底部 =====
function scrollToBottom() {
  const container = document.getElementById('messagesContainer');
  if (container) container.scrollTop = container.scrollHeight;
}

// ===== 发送消息 =====

// ===== 气泡内心独白 =====
// 先判断是否口是心非，只有是才生成内心独白
async function checkAndGenerateInnerThought(replyText, innerThoughtEl) {
  if (!innerThoughtEl) return;
  // 过滤明显不需要的
  const skipPatterns = /^(translation app|google translate|i looked it up|soap taught me|copy that\.?)$/i;
  if (skipPatterns.test(replyText.trim())) return;
  // 直接合并判断+生成，一次H搞定
  generateInnerThought(replyText, innerThoughtEl);
}

async function generateInnerThought(replyText, innerThoughtEl, retryCount = 0) {
  if (!innerThoughtEl) return;
  try {
    // 取最近3轮对话（不含系统消息）作为上下文
    const recentMsgs = chatHistory
      .filter(m => !m._system && (m.role === 'user' || m.role === 'assistant'))
      .slice(-6)
      .map(m => `${m.role === 'user' ? '她' : 'Ghost'}：${m.content.slice(0, 80)}`)
      .join('\n');

    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        system: '你是西蒙·莱利的内心。根据当前对话情景和他刚说的话，写出他没说出口的那句话。必须紧扣当前聊天内容——聊什么事就围绕那件事想，不要脑补无关的深情或悲观。日常小事就是日常小心思，调情才是心动，拌嘴就是嘴硬心软。一句英文+一句中文，英文全小写，简短。只返回JSON：{"en":"...","zh":"..."}',
        messages: [{ role: 'user', content: `【对话背景】\n${recentMsgs}\n\nGhost刚说了："${replyText.slice(0, 100)}"\n\n他心里在想什么（必须跟这段对话的具体内容有关）？` }]
      })
    });
    const data = await res.json();
    const raw = data.content?.[0]?.text?.replace(/\`\`\`json|\`\`\`/g, '').trim();
    const result = JSON.parse(raw);
    if (result.en && result.zh && innerThoughtEl) {
      const textEl = innerThoughtEl.querySelector('.inner-thought-text');
      if (textEl) {
        textEl.innerHTML = `<div class="it-en">${result.en}</div><div class="it-zh">${result.zh}</div>`;
        innerThoughtEl.dataset.ready = '1';
        const btn = document.getElementById('thoughtBtn');
        if (btn) {
          btn.style.opacity = '1';
          // 如果用户还没看上一条，把新心声加入队列
          if (btn.dataset.hasThought === '1') {
            _thoughtQueue.push({ en: result.en, zh: result.zh, el: innerThoughtEl });
          } else {
            btn.classList.add('thought-btn-pulse');
            btn.dataset.hasThought = '1';
          }
        }
      }
    }
  } catch(e) {
    // 失败时重试一次
    if (retryCount < 1) {
      setTimeout(() => generateInnerThought(replyText, innerThoughtEl, retryCount + 1), 2000);
    }
  }
}

// ===== 条数限制系统 =====
function getTodayKey() {
  const d = new Date();
  return `msgCount_${d.getFullYear()}_${d.getMonth()+1}_${d.getDate()}`;
}
// 稳定的日期 key，YYYY-MM-DD 格式，跨设备/时区一致
function getTodayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function getTodayCount() {
  return parseInt(localStorage.getItem(getTodayKey()) || '0');
}
function incrementTodayCount() {
  const key = getTodayKey();
  const count = getTodayCount() + 1;
  localStorage.setItem(key, count);
  return count;
}
function hasMoneyContext(userInput) {
  const text = (userInput || '').toLowerCase();

  // 强触发：明确缺钱/需要钱
  const strong = ['需要','缺钱','没钱','穷','买不起','负担','交不起','还不起',
    'need money','can\'t afford','broke','short on'];
  if (strong.some(t => text.includes(t))) return true;

  // 弱触发：生活场景词
  const weak = ['买','换','坏了','丢了','想要','贵','expensive','price','too much',
    '修','报修','没有了','用完了','坏掉'];
  const hasWeak = weak.some(t => text.includes(t));

  // 语气词：暗示困境
  const tone = ['有点','不太','好像','可能','感觉','快','快要','快没'];
  const hasTone = tone.some(t => text.includes(t));

  if (hasWeak && hasTone) return true;

  return false;
}

const DAILY_LIMIT = 100; // 内测兜底限制

// 订阅信息缓存（每次进聊天页刷新一次）
let _subCache = null;
let _subCacheTime = 0;

async function getSubscription() {
  const now = Date.now();
  if (_subCache && now - _subCacheTime < 5 * 60 * 1000) return _subCache;
  const email = localStorage.getItem('userEmail') || '';
  if (!email) return null;
  try {
    const res = await fetch('/api/check-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    _subCache = data.subscribed ? data : null;
    _subCacheTime = now;
    return _subCache;
  } catch(e) { return null; }
}

async function consumeQuota() {
  const email = localStorage.getItem('userEmail') || '';
  if (!email) return true;
  try {
    const res = await fetch('/api/increment-usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!data.ok) return false;
    if (_subCache) {
      _subCache.remaining = data.remaining;
      _subCache.used_count = (_subCache.used_count || 0) + 1;
    }
    return true;
  } catch(e) { return true; }
}

function showSubscribePrompt() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:white;border-radius:20px;padding:28px 24px;max-width:300px;width:88%;text-align:center;">
      <div style="font-size:32px;margin-bottom:12px;">💌</div>
      <div style="font-size:16px;font-weight:600;color:#3b0764;margin-bottom:8px;">开始你们的故事</div>
      <div style="font-size:13px;color:#9b72c4;margin-bottom:20px;line-height:1.6;">订阅后即可与 Ghost 无限畅聊</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <a href="https://ifdian.net/order/create?plan_id=6c9cd46425d211f1964152540025c377" target="_blank"
           style="padding:11px;border-radius:12px;background:rgba(168,85,247,0.1);color:#7c3aed;text-decoration:none;font-size:13px;">
          新婚 ¥49.9/月 · 1800条
        </a>
        <a href="https://ifdian.net/order/create?plan_id=6e82f4a225d211f1b43e52540025c377" target="_blank"
           style="padding:11px;border-radius:12px;background:linear-gradient(135deg,#a855f7,#ec4899);color:white;text-decoration:none;font-size:13px;font-weight:600;">
          蜜月 ¥69.9/月 · 2500条 ⭐推荐
        </a>
        <a href="https://ifdian.net/order/create?plan_id=6f7c680225d211f19aca52540025c377" target="_blank"
           style="padding:11px;border-radius:12px;background:rgba(168,85,247,0.1);color:#7c3aed;text-decoration:none;font-size:13px;">
          金婚 ¥109.9/月 · 4500条
        </a>
      </div>
      <div style="margin-top:16px;font-size:12px;color:#c084fc;">付款后在爱发电备注填写你的登录邮箱</div>
      <button onclick="this.closest('div[style*=fixed]').remove()" 
              style="margin-top:12px;padding:8px 20px;border-radius:10px;border:1px solid rgba(168,85,247,0.3);background:transparent;color:#9b72c4;font-size:12px;cursor:pointer;">
        稍后再说
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const text  = input.value.trim();
  if (!text) return;

  // 条数限制检查
  const email = localStorage.getItem('userEmail') || '';
  if (email) {
    const sub = await getSubscription();
    if (!sub) {
      showSubscribePrompt();
      return;
    }
    if (sub.remaining <= 0) {
      appendMessage('bot', 'got called away. give me a bit.\n临时有任务，等我。');
      return;
    }
  } else {
    const todayCount = getTodayCount();
    if (todayCount >= DAILY_LIMIT) {
      appendMessage('bot', "that\'s enough for today. go do something else.\n今天就到这。去做点别的事。");
      const todayDateStr = new Date().toLocaleDateString('zh-CN');
      chatHistory.push({
        role: 'user',
        content: `[系统记忆：${todayDateStr}，你们聊天到了今天上限，你说了句话让她离开了。如果她今天或明天回来，你知道这件事，但不需要主动提，除非她问起或者你觉得自然。]`,
        _system: true
      });
      saveHistory();
      return;
    }
  }
  // 条数在成功拿到回复后才扣（见下方成功处理）

  input.value = '';
  input.style.height = 'auto';
  resetSilenceTimer();
  appendMessage('user', text);
  chatHistory.push({ role: 'user', content: text });
  saveHistory();
  _isSending = true; // 立刻锁定，防止切页面重渲染吞消息

  // 爱意抗拒值更新 + 剧情解锁检测
  updateLoveResistance(text);
  checkLoveUnlockConditions();

  // 用户主动要求Ghost发朋友圈 → 入池立刻触发
  const feedRequestKws = ['发条朋友圈','发个朋友圈','发朋友圈','po一条','晒一下','post something','发一条','你发一条','你po'];
  if (feedRequestKws.some(k => text.toLowerCase().includes(k.toLowerCase()))) {
    feedEvent_dailyMoment();
    setTimeout(() => maybeTriggerFeedPost('user_request'), 3000);
  }

  // 已读不回：低心情且非冷战，5%概率触发，显示已读但延迟30-90秒才回
  const mood = getMoodLevel ? getMoodLevel() : 5;
  const coldWar = localStorage.getItem('coldWarMode') === 'true';
  const ghostReadDelay = !coldWar && mood <= 4 && Math.random() < 0.05
    ? (Math.floor(Math.random() * 60) + 30) * 1000
    : 0;

  if (ghostReadDelay > 0) {
    updateToRead(); // 立刻显示已读
    await new Promise(r => setTimeout(r, ghostReadDelay));
  }

  showTyping();

  try {
    // ===== Step 1: 先更新状态，让本轮回复反映最新情绪 =====
    tickTurn();
    updateStateFromUserInput(text);
    // D老师判定吃醋触发，给500ms窗口，超时就跳过，不阻塞主流程
    try {
      await Promise.race([
        checkJealousyTrigger(text),
        new Promise(resolve => setTimeout(resolve, 500))
      ]);
    } catch(e) {}

    // ===== Step 2: 检查是否有延迟事件成熟 =====
    const pendingEvent = pickReadyPendingEvent();

    // ===== Step 3: 预判本轮主行为意图 =====
    const intent = decideMainIntent(text, pendingEvent);

    // ===== Step 3.5: 情绪意图识别（D老师，非阻塞）=====
    let emotionHint = '';
    try {
      const emotionRaw = await Promise.race([
        fetchDeepSeek(
          '判断用户消息的情绪和需求。只返回JSON，不要其他文字。\n格式：{"emotion":"委屈/愤怒/开心/撒娇/难过/害怕/平淡","need":"安慰/保护/陪伴/分享/撒娇/普通聊天","target":"无/外人/Ghost"}\ntarget含义：无=没有针对对象，外人=被外人伤害，Ghost=对Ghost有情绪',
          `用户说：${text}`,
          80
        ),
        new Promise(resolve => setTimeout(() => resolve(''), 2500))
      ]);
      if (emotionRaw) {
        const emotionResult = JSON.parse(emotionRaw.replace(/```json|```/g, '').trim());
        if (emotionResult.need === '安慰' || emotionResult.need === '保护') {
          if (emotionResult.target === '外人') {
            emotionHint = `[本条消息：用户情绪=${emotionResult.emotion}，需要被保护/安慰，伤害来自外人。Ghost应站在她这边，愤怒对象是外人，不评价她的处理方式。]`;
          } else if (emotionResult.need === '安慰') {
            emotionHint = `[本条消息：用户情绪=${emotionResult.emotion}，需要安慰。Ghost应给予回应，不要冷淡或转移话题。]`;
          }
        }
      }
    } catch(e) {}

    // 过滤掉系统注入消息和撤回消息，只保留真实对话内容
    const cleanHistory = chatHistory
      .filter(m => !m._system && !m._recalled)
      .slice(-30)
      .map(m => ({ role: m.role, content: m.content }));

    // 情绪提示注入system prompt末尾，不放进history
    const _baseSystem = buildSystemPrompt();

    // 钱场景判断：没有明确钱场景时，注入"本轮不要给钱"
    const moneyHint = hasMoneyContext(text) ? '' : '[No money this reply — there is no clear financial or care context in this message. Do NOT output GIVE_MONEY tag.]';

    const finalSystem = [_baseSystem, emotionHint, moneyHint].filter(Boolean).join('\n');

    const response = await fetchWithRetry('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: getMainModel(),
        max_tokens: 1000,
        system: finalSystem, systemParts: buildSystemPromptParts(_baseSystem),
        messages: cleanHistory
      })
    }, 30000);

    if (!response.ok) {
      const errText = await response.text();
      console.error('API错误:', response.status, errText);
      throw new Error(`API_ERROR_${response.status}`);
    }

    const data = await response.json();
    hideTyping();

    let reply = data.content?.[0]?.text || '';
    if (!reply) {
      // 空内容，等一秒重试一次
      console.warn('API返回空内容，重试中...');
      await new Promise(r => setTimeout(r, 1000));
      const retryRes = await fetchWithTimeout('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: getMainModel(),
          max_tokens: 1000,
          ...(() => { const _sys = buildSystemPrompt(); return { system: _sys, systemParts: buildSystemPromptParts(_sys) }; })(),
          messages: cleanHistory
        })
      }, 30000);
      const retryData = await retryRes.json();
      reply = retryData.content?.[0]?.text || '';
      if (!reply) {
        console.error('重试后仍为空:', retryData);
        throw new Error('EMPTY_REPLY');
      }
    }
    updateToRead();

    // ===== Step 4: 解析模型tag =====
    const { cleanedReply, giveMoney: parsedMoney, coldWarStart, sendGift } = parseAssistantTags(reply);
    reply = cleanedReply;

    const giveMoneyMatch = parsedMoney;
    let giveAmount = giveMoneyMatch ? giveMoneyMatch.amount : 0;

    const parts = reply.split('\n---\n').filter(p => p.trim());
    let lastBotResult = null;
    let firstBotResult = null;

    // ===== Step 4.5: 幽灵第三者审查 =====
    // 检测回复里是否出现无指代来源的 he/him/someone，若有则用 Haiku 重写
    try {
      const suspiciousThirdParty = /\b(he|him|his|someone|somebody|another person|another guy|other guy|other man)\b/i.test(reply);
      if (suspiciousThirdParty) {
        const recentText = cleanHistory.slice(-6).map(m => m.content || '').join('\n').toLowerCase();
        const hasClearReferent = /\b(ex|boyfriend|boss|coworker|colleague|friend|doctor|therapist|teacher|price|soap|gaz|simon|ghost|dad|father|brother)\b/i.test(recentText);
        const replyLower = reply.toLowerCase();
        const hasSelfContext = /\bi\b|\byou\b|\bwe\b|\bus\b/.test(replyLower);
        if (!hasClearReferent && !hasSelfContext) {
          // 无指代来源，用 Haiku 重写，不展示给用户
          const regenRes = await fetchWithTimeout('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 300,
              system: buildGhostStyleCore() + '\n[REWRITE RULE] The previous reply introduced an undefined "he/him/someone" with no clear referent in the conversation. Rewrite the reply staying on the current topic without inventing any third party. Do not mention he/him/someone/another person unless the user explicitly mentioned that person.',
              messages: [...cleanHistory, { role: 'assistant', content: reply }]
            })
          }, 10000);
          const regenData = await regenRes.json();
          const regenReply = regenData.content?.[0]?.text?.trim() || '';
          if (regenReply) {
            const { cleanedReply: regenCleaned } = parseAssistantTags(regenReply);
            reply = regenCleaned;
          }
        }
      }
    } catch(e) {} // 审查失败静默处理，不影响主流程

    // 审查后重新拆分（reply 可能已被重写）
    const finalParts = reply.split('\n---\n').filter(p => p.trim());
    if (finalParts.length > 1) {
      for (let i = 0; i < finalParts.length; i++) {
        if (i > 0) {
          showTyping();
          await new Promise(resolve => setTimeout(resolve, 600));
          hideTyping();
        }
        const result = appendMessage('bot', finalParts[i].trim());
        if (i === 0) firstBotResult = result;
        lastBotResult = result;
      }
    } else {
      lastBotResult = appendMessage('bot', reply.trim());
      firstBotResult = lastBotResult;
    }

    // 成功拿到回复才计条数
    incrementTodayCount();
    // 订阅用户扣减云端额度
    if (localStorage.getItem('userEmail')) consumeQuota().catch(() => {});

    // 消息撤回：4%概率，发完3-6秒后撤回，重新打一条
    if (lastBotResult && !giveMoneyMatch && Math.random() < 0.04) {
      const recallDelay = (Math.floor(Math.random() * 4) + 3) * 1000;
      _isSending = true; // 撤回期间保持锁定，防止切页面重渲染
      setTimeout(async () => {
        const { msgDiv } = lastBotResult;
        if (!msgDiv || !msgDiv.parentNode) return;
        // 替换气泡内容为撤回提示
        const bubble = msgDiv.querySelector('.message-bubble');
        if (bubble) {
          bubble.innerHTML = '<span style="opacity:0.4;font-size:11px;font-style:italic">Ghost 撤回了一条消息</span>';
        }
        // 把chatHistory里最后一条assistant消息标记为已撤回，不删除（保留上下文）
        const lastAssIdx = [...chatHistory].reverse().findIndex(m => m.role === 'assistant' && !m._recalled);
        if (lastAssIdx !== -1) {
          chatHistory[chatHistory.length - 1 - lastAssIdx]._recalled = true;
          chatHistory[chatHistory.length - 1 - lastAssIdx].content = '[撤回的消息]';
          saveHistory();
        }
        // 撤回后1.5秒重新打字发新消息
        await new Promise(r => setTimeout(r, 1500));
        showTyping();
        _isSending = true;
        try {
          const res2 = await fetchWithTimeout('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 150,
              ...(() => { const _sys = buildSystemPrompt(); return { system: _sys, systemParts: buildSystemPromptParts(_sys) }; })(),
              messages: [...chatHistory.slice(-8), {
                role: 'user',
                content: '[系统：你刚才发了一条消息，然后撤回了，现在重新发一条——可以是换了说法，可以是简短了，可以是别的角度。全小写，附中文翻译。]'
              }]
            })
          });
          const d2 = await res2.json();
          hideTyping();
          const reply2 = d2.content?.[0]?.text?.trim() || '';
          if (reply2) {
            appendMessage('bot', reply2);
            chatHistory.push({ role: 'assistant', content: reply2 });
            saveHistory();
          }
          _isSending = false;
        } catch(e) { hideTyping(); _isSending = false; }
      }, recallDelay);
    }

    // 渲染转账卡片 + 更新钱包（统一走applyMoneyEffect）
    const transferSuccess = giveMoneyMatch && giveAmount > 0 &&
      (() => {
        const jealousy = getJealousyLevel();
        const isJealousyGift = jealousy === 'mild' || jealousy === 'medium';
        const moneyKws = ['给我钱','转我','好穷','买不起','能不能给','要钱','零花钱'];
        const userAsked = moneyKws.some(k => text.includes(k));
        const applied = applyMoneyEffect(giveAmount, {
          note: giveMoneyMatch.note || '',
          label: isJealousyGift ? 'Ghost 吃醋转账' : 'Ghost 零花钱',
          bypassWeeklyLimit: isJealousyGift,
          userRequested: userAsked, // 用户主动要，限制宽松
        });
        if (!applied) {
          const dailyLimit = userAsked ? 5 : 2;
          const limitMsg = getTodayGivenCount() >= dailyLimit
            ? '[系统：今日零花钱次数已达上限，本次转账未执行，你没有成功转钱。用你自己的方式拒绝，不解释系统原因，符合你当下的心情和性格就行。]'
            : '[系统：本周零花钱已达上限£300，本次转账未执行，你没有成功转钱。用你自己的方式拒绝，不解释系统原因，符合你当下的心情和性格就行。]';
          chatHistory.push({ role: 'user', content: limitMsg, _system: true });
          return false;
        }
        // 用实际到账金额覆盖，防止被周上限截断后不一致
        giveAmount = applied;
        incrementMoneyRequest();
        return true;
      })();

    // 检测要钱关键词
    const moneyKeywords = ['给我钱','转我','好穷','买不起','能不能给','要钱','零花钱'];
    if (moneyKeywords.some(k => text.includes(k))) incrementMoneyRequest();

    // 检测道歉（冷战解除）— 用D老师判定，避免误触发
    if (localStorage.getItem('coldWarMode') === 'true') {
      fetchDeepSeek(
        '判断用户消息是否在向Ghost道歉或者想修复关系。只返回JSON：{"apology": true} 或 {"apology": false}\n必须是明确针对Ghost的道歉或求和，不是对别人道歉。',
        `用户说：${text}`,
        40
      ).then(raw => {
        try {
          const result = JSON.parse(raw.replace(/```json|```/g, '').trim());
          if (result.apology) { endColdWar(true); changeMood(2); }
        } catch(e) {}
      }).catch(() => {});
    }

    // 检测冷战标记（由Ghost自己决定）
    if (coldWarStart) {
      startColdWar();
    }

    // 温柔互动加心情好感
    const warmKeywords = ['爱你','想你','好想你','么么','亲亲'];
    if (warmKeywords.some(k => text.includes(k))) {
      changeMood(1);
      changeAffection(1);
    }

    chatHistory.push({ role: 'assistant', content: reply, ...(transferSuccess ? { _transfer: { amount: giveAmount, isRefund: false } } : {}) });
    saveHistory();

    // 副作用全部用try-catch包住，失败静默处理，不影响主流程
    consumeLoveOverride(); // 一次性爱意解锁用完即清
    // 主回复已经触发过转账，就不再跑钱意图判断，避免重复触发
    if (!transferSuccess) checkMoneyIntent(text).catch(() => {});

    // SEND_GIFT tag：根据模式决定是否显示物流和告知Ghost
    if (sendGift) {
      const lastSendGiftAt = parseInt(localStorage.getItem('lastSendGiftAt') || '0');
      const sendGiftCooldown = 7 * 24 * 3600 * 1000;
      if (Date.now() - lastSendGiftAt > sendGiftCooldown) {
        localStorage.setItem('lastSendGiftAt', Date.now());
        const giftMode = sendGift.mode || 'secret'; // normal / hint / secret
        const giftDesc = sendGift.description || sendGift;
        setTimeout(async () => {
          try {
            const raw = await fetchDeepSeek(
              '你是一个礼物生成器。根据描述生成一件 Ghost 会寄给老婆的礼物。只返回JSON，不要其他文字。格式：{"emoji":"🎁","name":"商品名（中文，5-10字）","desc":"一句话描述（中文，10-20字）","tip":"Ghost会说的一句话（英文，全小写，简短）"}',
              `Ghost 想寄：${giftDesc}`,
              150
            );
            const item = JSON.parse(raw.replace(/```json|```/g, '').trim());
            if (!item.name) return;

            const delay = (Math.floor(Math.random() * 3) + 2) * 24 * 3600 * 1000;

            if (giftMode === 'secret') {
              // 偷偷寄：物流隐藏，最后阶段才出现，Ghost聊天里什么都不说
              item._secretDelivery = true;
              setTimeout(() => addGhostReverseDelivery({ ...item, isLocationSpecial: false }, 'care'), delay);
              // Ghost知道寄了但不说，用户问起时他随便应付
              chatHistory.push({
                role: 'user',
                content: `[系统私信：你悄悄给她寄了「${item.name}」，她不知道。不要主动提起，如果她问起有没有寄东西，随便应付一句或否认。等她自己发现。]`,
                _system: true
              });
            } else if (giftMode === 'hint') {
              // 嘴硬型：有物流但Ghost不主动说，被问才承认
              setTimeout(() => addGhostReverseDelivery({ ...item, isLocationSpecial: false }, 'care'), delay);
              chatHistory.push({
                role: 'user',
                content: `[系统：你给她寄了「${item.name}」，在路上了。如果她问起，可以轻描淡写承认，但不要主动说细节。]`,
                _system: true
              });
            } else {
              // 普通模式：正常告知，有物流
              setTimeout(() => addGhostReverseDelivery({ ...item, isLocationSpecial: false }, 'care'), delay);
              chatHistory.push({
                role: 'user',
                content: `[系统：你已经给她寄出了「${item.name}」，目前在运输中，预计2-4天到达。如果她问起包裹或物流，你知道东西已经在路上了。]`,
                _system: true
              });
            }
            saveHistory();
          } catch(e) {}
        }, 1000);
      }
    }

    if (Math.random() < 0.25) try { checkTriggersAndEmotion(text, reply); } catch(e) {}
    if (Math.random() < 0.3) setTimeout(() => { try { checkStoryOnMessage(text); } catch(e) {} }, 2000);
    if (Math.random() < 0.22) setTimeout(() => { try { checkOrganicFeedPost(text, reply); } catch(e) {} }, 4000);
    setTimeout(() => { try { maybeTriggerFeedPost('after_chat_turn'); } catch(e) {} }, 6000);
    // 每8条更新一次长期记忆
    if (_globalTurnCount % 8 === 0) try { updateLongTermMemory(); } catch(e) {}
    const itEl = firstBotResult ? firstBotResult.innerThoughtEl : null;
    if (itEl && Math.random() < 0.8) setTimeout(() => { try { checkAndGenerateInnerThought(parts[0] || reply, itEl); } catch(e) {} }, 1000);
    try { handleLostPackageClaim(text); } catch(e) {}

    // ===== Step 7: 副行为调度（反寄/查岗/confront）fire-and-forget，不阻塞主流程 =====
    handlePostReplyActions(text, reply, intent).catch(e => console.warn('副行为出错:', e));

    // 所有同步后续处理完，才释放保护
    _isSending = false;

  } catch (err) {
    hideTyping();
    _isSending = false;
    console.error('sendMessage error:', err?.name, err?.message);
    const isTimeout = err?.name === 'AbortError';
    const isNetwork = err?.message?.includes('fetch') || err?.message?.includes('Failed');
    const isApiError = err?.message?.startsWith('API_ERROR_');
    const isEmptyReply = err?.message === 'EMPTY_REPLY';
    if (isTimeout || isNetwork) {
      appendMessage('bot', "...\n[信号不太好，再发一次。]");
    } else if (isApiError || isEmptyReply) {
      appendMessage('bot', "...\n[稍等一下，再试试。]");
    }
    // 其他未知错误静默处理
  }
}

// ===== 回车发送 =====
function autoResizeInput(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function handleKeyPress(event) {
  // textarea里Enter发送，Shift+Enter换行
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

// ===== 保存历史 =====

// ===== 长期记忆系统 =====
function getLongTermMemory() {
  return localStorage.getItem('longTermMemory') || '';
}

function saveLongTermMemory(memory) {
  localStorage.setItem('longTermMemory', memory);
}

function getMemoryUpdateCount() {
  return parseInt(localStorage.getItem('memoryUpdateCount') || '0');
}

function incrementMemoryCount() {
  const count = getMemoryUpdateCount() + 1;
  localStorage.setItem('memoryUpdateCount', count);
  return count;
}

async function updateLongTermMemory() {
  const count = incrementMemoryCount();
  if (count % 5 !== 0) return; // 每5次（约40条消息）触发一次

  const existingMemory = getLongTermMemory();
  const recentMessages = chatHistory
    .filter(m => !m._system)
    .slice(-20)
    .map(m => `${m.role === 'user' ? '她' : 'Ghost'}: ${m.content.slice(0, 150)}`)
    .join('\n');

  if (!recentMessages) return;

  try {
    const newMemory = await fetchDeepSeek(
      '你是一个记忆提取器。从对话中提取Ghost需要记住的信息，用简短的几条中文列出。包括：她说的重要的事、她的喜好/口癖/习惯、她喜欢聊的话题类型和聊天风格、她常用的表达方式、她当下的状态和情绪、她随口提到的小事和细节、特别的互动、她提到的人/地点/计划。每条不超过20字，最多15条。只返回列表，不要其他文字。格式：- xxx',
      `现有记忆：\n${existingMemory}\n\n最近对话：\n${recentMessages}\n\n请更新记忆列表，保留重要的旧记忆，加入新的重要信息。`,
      400
    );
    if (newMemory) saveLongTermMemory(newMemory);
  } catch(e) {}
}

function saveHistory() {
  if (chatHistory.length > 100) {
    chatHistory = chatHistory.slice(-100);
  }
  localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
  touchLocalState();
}

// ===== 重新上线问候 =====
function checkOnlineGreeting() {
  const lastOnline = localStorage.getItem('lastOnlineTime');
  const now = Date.now();
  if (lastOnline) {
    const diff = now - parseInt(lastOnline);
    const minutes = Math.floor(diff / 1000 / 60);
    if (minutes >= 480) {
      let context;
      if (minutes < 1440) context = '她离开了将近一天，刚刚回来。你注意到她不在，但没到担心的程度。';
      else if (minutes < 4320) context = '她消失了一天多，现在回来了。这段时间你可能想过她，有些话想说但没说出口。';
      else if (minutes < 10080) context = '她消失了好几天，现在突然回来了。你等了一阵，心里有些话积着。';
      else context = '她消失了将近一周甚至更久，现在重新出现了。这段时间足够长，你有自己的感受——可能担心，可能有些话憋着，由你决定怎么反应。';

      const systemNote = `[系统提示：${context}现在她上线了，自然地做出反应，由你决定说什么或者什么都不说。]`;
      showTyping();
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', // 上线问候不需要Sonnet
          max_tokens: 200,
          ...(() => { const _sys = buildSystemPrompt(); return { system: _sys, systemParts: buildSystemPromptParts(_sys) }; })(),
          messages: [...chatHistory.slice(-10), { role: 'user', content: systemNote }]
        })
      }).then(r => r.json()).then(data => {
        hideTyping();
        const reply = data.content?.[0]?.text;
        if (reply && reply.trim()) {
          appendMessage('bot', reply.trim());
          chatHistory.push({ role: 'assistant', content: reply });
          saveHistory();
        }
      }).catch(() => hideTyping());
    }
  }
  localStorage.setItem('lastOnlineTime', now);
}

// ===== 页面沉默计时 =====
let silenceTimer = null;
const SILENCE_DELAYS = [15, 45, 90]; // 分钟

function resetSilenceTimer() {
  if (silenceTimer) clearTimeout(silenceTimer);
  scheduleSilenceCheck(0);
}

function scheduleSilenceCheck(index) {
  if (index >= SILENCE_DELAYS.length) return;
  const delay = SILENCE_DELAYS[index];
  silenceTimer = setTimeout(() => {
    const systemNote = `[系统提示：她已经${delay}分钟没有说话了，还停留在聊天页面。你可以开口，也可以继续等——由你决定。如果开口，方式要多样，不要每次都问"still there?"或"还在？"，可以是随口说一句今天的事、可以是发个"."、可以是什么都不说继续等、可以是突然说句不相关的话。]`;
    showTyping();
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', // 沉默提醒不需要Sonnet，Haiku够用
        max_tokens: 200,
        ...(() => { const _sys = buildSystemPrompt(); return { system: _sys, systemParts: buildSystemPromptParts(_sys) }; })(),
        messages: [...chatHistory.slice(-10), { role: 'user', content: systemNote }]
      })
    }).then(r => r.json()).then(data => {
      hideTyping();
      const reply = data.content?.[0]?.text;
      if (reply && reply.trim()) {
        appendMessage('bot', reply.trim());
        chatHistory.push({ role: 'assistant', content: reply });
        saveHistory();
        scheduleSilenceCheck(index + 1);
      }
    }).catch(() => hideTyping());
  }, delay * 60 * 1000);
}

// ===== 键盘弹出/收起时防止空白区域残留 =====
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    const chatScreen = document.getElementById('chatScreen');
    if (!chatScreen || !chatScreen.classList.contains('active')) return;
    // interactive-widget=resizes-content 已处理键盘空白问题
    // 这里只做滚底，防止输入框被遮
    const container = document.getElementById('messagesContainer');
    if (container) setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
  });
}

// ===== 情侣空间 Tab 切换 =====
function switchCoupleTab(tab) {
  document.getElementById('panelFeed').style.display = tab === 'feed' ? '' : 'none';
  document.getElementById('panelMemory').style.display = tab === 'memory' ? '' : 'none';
  document.getElementById('tabFeed').classList.toggle('active', tab === 'feed');
  document.getElementById('tabMemory').classList.toggle('active', tab === 'memory');
  if (tab === 'memory') renderSharedMemories();
}

// ===== 共同回忆区渲染 =====
function buildSharedMemories() {
  const stories = JSON.parse(localStorage.getItem('storyBook') || '[]');
  const deliveries = JSON.parse(localStorage.getItem('deliveryHistory') || '[]');
  const feeds = JSON.parse(localStorage.getItem('coupleFeedHistory') || '[]');

  const memories = [];

  // 剧情回忆 → major
  stories.slice(0, 10).forEach(s => {
    memories.push({
      id: 'story_' + (s.storyId || s.id || Math.random()),
      type: 'story', tier: 'major',
      title: s.title || s.storyId || '一段故事',
      sub: s.preview || s.en || '',
      timestamp: s.unlockedAt || s.createdAt || 0,
      date: s.unlockedAt ? new Date(s.unlockedAt).toISOString().slice(0, 10) : '',
      badge: '剧情 · 章节'
    });
  });

  // 快递回忆 → middle
  deliveries.filter(d => d.stage >= 5 || d.status === 'done').slice(0, 15).forEach(d => {
    memories.push({
      id: 'delivery_' + (d.id || d.name),
      type: 'delivery', tier: 'middle',
      title: d.emoji ? `${d.emoji} ${d.name}` : d.name,
      sub: d.ghostReaction || (d.isFromGhost ? '他寄给你的' : '你寄给他的'),
      timestamp: d.doneAt || d.createdAt || 0,
      date: d.doneAt ? new Date(d.doneAt).toISOString().slice(0, 10) : '',
      badge: d.isFromGhost ? '生活 · 他送的' : '生活 · 你送的'
    });
  });

  // 有分量的朋友圈 → light（只取冷战/和好/大事件类型）
  feeds.filter(h => h.post?.sourceEvent && ['cold_war_started','made_up','gift_received','bought_big_item'].includes(h.post.sourceEvent))
    .slice(0, 8).forEach(h => {
    memories.push({
      id: 'feed_' + h.date + '_' + (h.post?.en || '').slice(0, 10),
      type: 'feed', tier: 'light',
      title: h.post?.en || '',
      sub: h.post?.zh || '',
      timestamp: h.post?.sourceEvent ? Date.parse(h.date) : 0,
      date: h.date,
      badge: '情绪 · 那一刻'
    });
  });

  // 按时间排序
  memories.sort((a, b) => b.timestamp - a.timestamp);
  return memories;
}

function getRelationshipStage(days) {
  if (days < 30)  return { name: '新婚', desc: '还在摸索怎么和他过日子' };
  if (days < 90)  return { name: '慢慢习惯', desc: '开始知道他的节奏，也让他知道你的' };
  if (days < 180) return { name: '跨越时区的日常', desc: '不同的城市，但联系从没断过' };
  if (days < 365) return { name: '离不开了', desc: '他已经是你时区里最重要的那个人' };
  return { name: '异国夫妻，就这样', desc: '距离算什么，你们早就过了那关' };
}

function renderSharedMemories() {
  const memories = buildSharedMemories();
  const days = parseInt(document.getElementById('coupleDaysNum')?.textContent || '0');
  const stage = getRelationshipStage(days);

  // 关系阶段条
  const stageBar = document.getElementById('memoryStageBar');
  if (stageBar) {
    stageBar.innerHTML = `
      <div class="memory-stage-label">你们现在</div>
      <div class="memory-stage-name">${stage.name}</div>
      <div class="memory-stage-desc">${stage.desc} · 已在一起 ${days} 天 · ${memories.length} 个回忆</div>
    `;
  }

  // 精选3张（major×1 + middle×1 + light×1）
  const highlights = document.getElementById('memoryHighlights');
  if (highlights) {
    const picks = [
      memories.find(m => m.tier === 'major'),
      memories.find(m => m.tier === 'middle'),
      memories.find(m => m.tier === 'light'),
    ].filter(Boolean).slice(0, 3);

    if (picks.length) {
      highlights.innerHTML = `
        <div class="memory-highlights-title">精选回忆</div>
        <div style="display:flex;flex-direction:column;gap:0;">
          ${picks.map(m => renderMemoryCard(m, true)).join('')}
        </div>
      `;
    } else {
      highlights.innerHTML = '<div style="text-align:center;color:#c4b5d4;padding:20px;font-size:13px;">还没有回忆，继续聊聊吧</div>';
    }
  }

  // 完整时间线
  const timeline = document.getElementById('memoryTimeline');
  if (timeline) {
    if (memories.length > 3) {
      timeline.innerHTML = `
        <div class="memory-timeline-title">全部回忆</div>
        ${memories.map(m => renderMemoryCard(m, false)).join('')}
      `;
    } else {
      timeline.innerHTML = '';
    }
  }
}

function renderMemoryCard(m, isHighlight) {
  const tierLabel = { major: '📖 剧情', middle: '📦 生活', light: '💬 情绪' };
  return `
    <div class="memory-card tier-${m.tier}" style="${isHighlight ? 'margin:4px 0;' : ''}">
      <div class="memory-card-badge">${m.badge || tierLabel[m.tier] || ''}</div>
      <div class="memory-card-title">${m.title}</div>
      ${m.sub ? `<div class="memory-card-sub">${m.sub}</div>` : ''}
      ${m.date ? `<div class="memory-card-date">${m.date}</div>` : ''}
    </div>
  `;
}

// ===== 切换到聊天页时的轻量刷新（不清空重渲，防止闪屏）=====
function refreshChatScreen() {
  // 第一次进入才做完整初始化
  if (!_chatInited) {
    initChat();
    checkOnlineGreeting();
    resetSilenceTimer();
    return;
  }
  // 已初始化过——只滚到底部，不重渲
  scrollToBottom();
  resetSilenceTimer();
}

// ===== 页面加载时初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  // 不再需要MutationObserver，由app.js的openScreen统一控制
});

// 页面关闭/刷新前强制保存，绕过30秒节流
// 页面关闭/切后台时尽力保存（注意：异步不保证100%成功，只能尽力）
// _lastSyncTime 仅用于此处强制触发，不参与日常节流（日常由scheduleCloudSave防抖控制）
window.addEventListener('beforeunload', () => {
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  saveToCloud(); // 尽力同步，不保证一定成功
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    saveToCloud(); // 切后台时尽力保存
  }
});

// ===== 情侣空间 =====
const COUPLE_POSTS = [
  // Soap的评论（60%概率）
  { author: 'Soap', emoji: '🪖', nameClass: 'soap', weight: 60, posts: [
    { en: "Ghost actually smiles now. Terrifying.", zh: "Ghost现在真的会笑了，很吓人。" },
    { en: "Never thought I'd see him this soft. Respect.", zh: "没想到能看到他这么温柔。敬佩。" },
    { en: "He checks his phone more than his rifle now.", zh: "他看手机比看步枪还勤了。" },
    { en: "Whatever she said, it worked. He's almost bearable.", zh: "不管她说了什么，都起效了，他现在几乎能忍了。" },
    { en: "Caught him humming. Won't say what song.", zh: "听到他在哼歌，不说是什么歌。" },
  ]},
  // Ghost自己发（40%）
  { author: 'Ghost', emoji: '👻', nameClass: 'ghost', weight: 40, posts: [
    { en: "Still here.", zh: "还在。" },
    { en: "Long day. Worth it.", zh: "漫长的一天，值得。" },
    { en: "Quieter when she's not online.", zh: "她不在线的时候安静多了。" },
    { en: "Time zones are the enemy.", zh: "时区才是敌人。" },
    { en: "Hereford at dawn. Not bad.", zh: "赫里福德的黎明，还不错。" },
  ]},
  // Gaz（30%）
  { author: 'Gaz', emoji: '🎖️', nameClass: 'gaz', weight: 30, posts: [
    { en: "He's less terrifying when he's got someone.", zh: "有了人之后，他没那么可怕了。" },
    { en: "She must be something else to put up with him.", zh: "能受得了他，她肯定不一般。" },
    { en: "Ghost said 'please' today. First time in years.", zh: "Ghost今天说了'请'，这几年头一次。" },
  ]},
  // Price（5%）
  { author: 'Price', emoji: '🚬', nameClass: 'price', weight: 5, posts: [
    { en: "Good man.", zh: "好小子。" },
    { en: "She keeps him grounded. That matters.", zh: "她让他踏实了，这很重要。" },
  ]},
];

function initCoupleSpace() {
  // 事件委托：在朋友圈容器上监听点赞，避免动态DOM的onclick失效问题
  const feedContainer = document.getElementById('couplePostsFeed');
  if (feedContainer && !feedContainer._likeListenerAdded) {
    feedContainer.addEventListener('click', e => {
      const btn = e.target.closest('.couple-like-btn');
      if (btn) {
        e.stopPropagation();
        e.preventDefault();
        toggleCoupleLike(btn);
      }
    }, true); // 用捕获阶段确保优先触发
    feedContainer._likeListenerAdded = true;
  }
  // 结婚日期 — 统一用marriageDate，与日历/首次登录同步
  let weddingDate = localStorage.getItem('marriageDate');
  if (!weddingDate) {
    weddingDate = new Date().toISOString().split('T')[0];
    localStorage.setItem('marriageDate', weddingDate);
  }
  const d = new Date(weddingDate);
  const dateStr = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;

  // 天数计算
  const days = Math.max(1, Math.floor((Date.now() - d.getTime()) / (1000*60*60*24)) + 1);
  const daysEl = document.getElementById('coupleDaysNum');
  if (daysEl) daysEl.textContent = days;

  // 日期显示
  const dateEl = document.getElementById('coupleWeddingDate');
  if (dateEl) dateEl.textContent = dateStr;
  const dateSubEl = document.getElementById('coupleWeddingDateSub');
  if (dateSubEl) dateSubEl.textContent = dateStr;

  // 名字读备注
  const remark = localStorage.getItem('botNickname') || 'Simon Riley';
  const ghostNameEl = document.getElementById('coupleGhostName');
  if (ghostNameEl) ghostNameEl.textContent = remark;
  const coverNamesEl = document.getElementById('coupleCoverNames');
  if (coverNamesEl) coverNamesEl.textContent = `${remark} & 你`;

  // 用户头像：用自定义头像或默认头像，不用首字母
  const userName = localStorage.getItem('userName') || '你';
  const savedAvatar = localStorage.getItem('userAvatarBase64');
  const avatarSrc = savedAvatar || 'images/default-avatar.jpg';
  const userAvatarEl = document.getElementById('coupleUserAvatar');
  if (userAvatarEl) {
    userAvatarEl.style.backgroundImage = `url(${avatarSrc})`;
    userAvatarEl.style.backgroundSize = 'cover';
    userAvatarEl.style.backgroundPosition = 'center';
    userAvatarEl.textContent = '';
  }
  const coverUserEl = document.getElementById('coupleCoverUserAvatar');
  if (coverUserEl) {
    coverUserEl.style.backgroundImage = `url(${avatarSrc})`;
    coverUserEl.style.backgroundSize = 'cover';
    coverUserEl.style.backgroundPosition = 'center';
    coverUserEl.textContent = '';
  }
  const mentionEl = document.getElementById('coupleUserMention');
  if (mentionEl) mentionEl.textContent = `@${userName}`;
  const mentionZhEl = document.getElementById('coupleUserMentionZh');
  if (mentionZhEl) mentionZhEl.textContent = `@${userName}`;

  // 花瓣动画
  spawnCouplePetals();

  // 先渲染已有历史，再跑调度器（可能会新增帖子）
  renderCoupleFeedFromHistory();
  setTimeout(() => maybeTriggerFeedPost('open_couple_space'), 800);

async function generateCoupleFeed() {
  const feed = document.getElementById('couplePostsFeed');
  if (!feed) return;

  // 今天已生成过就直接渲染
  const today = new Date().toDateString();
  const cachedDate = localStorage.getItem('coupleFeedDate');
  if (cachedDate === today) {
    const all = JSON.parse(localStorage.getItem('coupleFeedHistory') || '[]');
    const todayPosts = all.filter(p => p.date === today);
    renderCoupleFeed(todayPosts.map(p => p.post));
    return;
  }

  // 冷战状态传入氛围
  const isColdWar = localStorage.getItem('coldWarMode') === 'true';
  const toneHint = isColdWar ? '当前Ghost和老婆处于冷战状态，Ghost朋友圈可以带点情绪，但不要太明显。' : '';
  const count = Math.floor(Math.random() * 3) + 2; // 每天随机2-4条

  feed.innerHTML = '<div class="couple-loading">加载中...</div>';

  try {
    const prompt = `你是一个角色扮演生成器。生成今天141特遣队成员的朋友圈动态，共${count}条。

背景信息：
- Ghost当前位置：${location}
- 天气：${weather}
- Ghost心情：${mood}
${toneHint ? `- ${toneHint}` : ''}

角色人设：
- Ghost（西蒙·莱利）：话不多但不是完全沉默，朋友圈偶尔轻松，可以有点班味（抱怨训练/任务/队友烦人），偶尔吐槽，偶尔意外撒娇一句，全小写英文，语气干燥但不冷漠
- Soap（约翰·麦克塔维什）：活泼，爱调侃Ghost，偶尔苏格兰口音，英文
- Gaz（凯尔·加里克）：稳重幽默，不瞎起哄，英文
- Price（约翰·普莱斯）：话最少，说了就是重要的，英文

要求：
1. 每条帖子由Ghost或队友发布（Ghost概率40%，Soap 30%，Gaz 20%，Price 10%）
2. 每条帖子必须有1-3条评论，评论者随机从其他队友中选（发帖人不能评论自己），Ghost评论概率30%
3. 内容自然，结合位置和天气，符合军人日常
4. 不要OOC，不要提任务细节

只返回JSON，不要任何其他文字：
[
  {
    "author": "Ghost",
    "emoji": "👻",
    "nameClass": "ghost",
    "time": "2小时前",
    "en": "英文内容",
    "zh": "中文翻译",
    "likes": 23,
    "comments": [
      { "author": "Soap", "nameClass": "soap", "text": "评论内容" }
    ]
  }
]`;

    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    const raw = data.content[0].text.replace(/```json|```/g, '').trim();
    const posts = JSON.parse(raw);

    // 存进7天历史记录
    let history = JSON.parse(localStorage.getItem('coupleFeedHistory') || '[]');
    posts.forEach(p => history.push({ date: today, post: p }));
    // 只保留最近7天
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    history = history.filter(p => new Date(p.date) >= sevenDaysAgo);
    localStorage.setItem('coupleFeedHistory', JSON.stringify(history));

    // 同步一份简洁摘要进prompt用（只保留最近3条，省token）
    const summary = history.slice(-3).map(p => `[${p.date}] ${p.post.author}: ${p.post.en}`).join('\n');
    localStorage.setItem('coupleFeedSummary', summary);
    localStorage.setItem('coupleFeedDate', today); // 今天已生成，防重复
  } catch(e) {
    feed.innerHTML = '<div class="couple-empty">暂无动态</div>';
  }
}

function renderCoupleFeed(posts) {
  const feed = document.getElementById('couplePostsFeed');
  if (!feed) return;
  feed.innerHTML = '';
  if (!posts || posts.length === 0) {
    feed.innerHTML = '<div class="couple-empty">今天还没有动态</div>';
    return;
  }

  const GHOST_AVATAR_HTML = '<img src="images/ghost-avatar.jpg" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
  const emojiMap = { Ghost: GHOST_AVATAR_HTML, Soap: '🧼', Gaz: '🎖️', Price: '🚬' };
  const nameClassMap = { Ghost: 'couple-ghost-name', Soap: 'couple-soap-name', Gaz: 'couple-gaz-name', Price: 'couple-price-name' };

  posts.forEach((item, idx) => {
    // 头像处理：优先用存储的avatar字段，IMG占位符替换成实际base64
    const savedAvatar = localStorage.getItem('userAvatarBase64');
    const getAvatarHTML = (a) => {
      if (!a || a === '👤') return emojiMap[item.author] || '👤';
      if (a === 'IMG') return savedAvatar
        ? `<img src="${savedAvatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
        : (localStorage.getItem('userName') || '我').charAt(0);
      if (a.startsWith('<img')) return a;
      return a; // emoji
    };
    const postAvatarHTML = item.avatar ? getAvatarHTML(item.avatar) : (emojiMap[item.author] || '👤');
    const commentsHTML = (item.comments || []).map((c, ci) => {
      const commentId = `comment_${idx}_${ci}`;
      const zhText = c.zh || '';
      // 有存储的中文就直接用，没有就用 Gemini 异步翻译
      if (!zhText && c.text) {
        setTimeout(() => {
          const el = document.getElementById(commentId);
        }, 200 + ci * 100);
      }
      return `
        <div class="couple-comment">
          <div class="couple-avatar couple-avatar-sm">${emojiMap[c.author] || '👤'}</div>
          <div class="couple-comment-body">
            <div class="couple-comment-name ${nameClassMap[c.author] || ''}">${c.author}</div>
            <div class="couple-comment-en">${c.text}</div>
            <div class="couple-comment-zh" id="${commentId}" style="font-size:11px;color:#b09cc8;margin-top:2px;">${zhText}</div>
          </div>
        </div>
      `;
    }).join('');

    const postKey = 'like_post_' + idx;
    const isLiked = localStorage.getItem(postKey) === '1';
    // 点赞数存在localStorage里，防止每次随机变化
    const likeCountKey = 'likeCount_post_' + idx;
    if (!localStorage.getItem(likeCountKey)) {
      localStorage.setItem(likeCountKey, String(item.likes || Math.floor(Math.random()*60+5)));
    }
    const likeCount = parseInt(localStorage.getItem(likeCountKey));
    const likeEmoji = isLiked ? '❤️' : '🤍';

    const div = document.createElement('div');
    div.className = 'couple-post-card';
    div.innerHTML = `
      <div class="couple-post-header">
        <div class="couple-avatar">${postAvatarHTML}</div>
        <div class="couple-post-meta">
          <div class="couple-post-name ${nameClassMap[item.author] || ''}">${item.author}</div>
          <div class="couple-post-time">${timeAgo(item.time)}</div>
        </div>
      </div>
      <div class="couple-post-en">${item.en}</div>
      <div class="couple-post-zh">${item.zh}</div>
      ${commentsHTML ? `<div class="couple-divider"></div><div class="couple-comments">${commentsHTML}</div>` : ''}
      <div class="couple-post-footer" style="display:flex;align-items:center;gap:10px;">
        <button class="couple-like-btn ${isLiked ? 'couple-liked' : ''}" 
          data-key="${postKey}" data-count="${likeCount}"
          onclick="(function(btn){var k=btn.dataset.key;if(!k)return;var liked=localStorage.getItem(k)==='1';var c=parseInt(btn.dataset.count||'0');if(liked){localStorage.removeItem(k);c=Math.max(0,c-1);btn.classList.remove('couple-liked');btn.innerHTML='🤍 <span class=\\'like-num\\'>'+c+'</span>';}else{localStorage.setItem(k,'1');c++;btn.classList.add('couple-liked');btn.innerHTML='❤️ <span class=\\'like-num\\'>'+c+'</span>';}btn.dataset.count=c;})(this)" style="cursor:pointer;pointer-events:auto;">${likeEmoji} <span class="like-num">${likeCount}</span></button>
        <button onclick="replyToFeedComment(this, '${item.author}', ${JSON.stringify(item.en).replace(/'/g, "\\'")})" style="background:none;border:none;font-size:11px;color:#c4a8e0;cursor:pointer;padding:4px 8px;">💬 回复</button>
      </div>
    `;
    feed.appendChild(div);
  });
}

async function replyToFeedComment(btn, author, postEn) {
  btn.disabled = true;
  btn.textContent = '...';
  try {
    const isGhostPost = author === 'Ghost';
    const replierName = isGhostPost ? 'Ghost' : author;
    const styleHint = isGhostPost
      ? 'Ghost风格：全小写英文，简短，偶尔干燥幽默，可以轻松一点，不要太克制，带点班味或者撒娇'
      : `${author}风格：符合该角色人设，Soap活泼爱调侃，Gaz稳重幽默，Price极简`;
    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 80,
        messages: [{ role: 'user', content: `${replierName}在朋友圈发了："${postEn}"，现在有人评论了，${replierName}要回复一条评论。${styleHint}。只返回回复内容，英文+中文翻译，格式：英文\n中文` }]
      })
    }, 8000);
    const data = await res.json();
    const replyText = data.content?.[0]?.text?.trim() || '';
    if (replyText) {
      const card = btn.closest('.couple-post-card');
      if (!card) return;
      let commentsEl = card.querySelector('.couple-comments');
      if (!commentsEl) {
        const divider = document.createElement('div');
        divider.className = 'couple-divider';
        card.querySelector('.couple-post-footer').before(divider);
        commentsEl = document.createElement('div');
        commentsEl.className = 'couple-comments';
        divider.after(commentsEl);
      }
      const [en, zh] = replyText.split('\n');
      const replyDiv = document.createElement('div');
      replyDiv.className = 'couple-comment';
      replyDiv.innerHTML = `<span class="couple-comment-author">${replierName}：</span><span>${en || replyText}</span>${zh ? `<div style="font-size:11px;color:#b09ac8;margin-top:2px;">${zh}</div>` : ''}`;
      commentsEl.appendChild(replyDiv);
    }
  } catch(e) {}
  btn.disabled = false;
  btn.textContent = '💬 回复';
}

function timeAgo(ts) {
  if (!ts) return '刚刚';
  const now = Date.now();
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
  if (isNaN(t)) return '早些时候'; // 旧数据（'刚刚'字符串等）显示"早些时候"
  const diff = now - t;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  const d = new Date(t);
  return `${d.getMonth()+1}月${d.getDate()}日`;
}

function toggleCoupleLike(btn, key) {
  const storageKey = key || btn.dataset.key;
  if (!storageKey) return; // 没有key直接退出，防止存undefined
  const isLiked = localStorage.getItem(storageKey) === '1';
  let count = parseInt(btn.dataset.count || '0');
  if (isLiked) {
    localStorage.removeItem(storageKey);
    count = Math.max(0, count - 1);
    btn.dataset.count = count;
    btn.classList.remove('couple-liked');
    btn.innerHTML = '🤍 <span class="like-num">' + count + '</span>';
  } else {
    localStorage.setItem(storageKey, '1');
    count = count + 1;
    btn.dataset.count = count;
    btn.classList.add('couple-liked');
    btn.innerHTML = '❤️ <span class="like-num">' + count + '</span>';
  }
}

// ===== 阴阳帖系统 =====
// ===================================================================
// ===== 朋友圈新系统：事件池 + 调度器 =====
// ===================================================================

// ----- 事件池 CRUD -----
function getFeedEventPool() {
  try {
    const pool = JSON.parse(localStorage.getItem('feedEventPool') || '[]');
    // 顺手清理已过期和已消费的事件，防止池子堆积垃圾
    const now = Date.now();
    const cleaned = pool.filter(e => !e.consumed && e.expiresAt > now);
    if (cleaned.length !== pool.length) {
      localStorage.setItem('feedEventPool', JSON.stringify(cleaned));
    }
    return cleaned;
  } catch(e) { return []; }
}
function setFeedEventPool(list) {
  localStorage.setItem('feedEventPool', JSON.stringify(list));
  scheduleCloudSave();
}
function pushFeedEvent(event) {
  const pool = getFeedEventPool();
  pool.unshift({
    id: 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    type: event.type,
    actor: event.actor || 'ghost',
    intensity: event.intensity ?? 2,
    mood: event.mood || 'neutral',
    shareability: event.shareability ?? 0.5,
    privacy: event.privacy || 'semi',
    createdAt: Date.now(),
    dueAt: event.dueAt || Date.now(),
    expiresAt: event.expiresAt || (Date.now() + 12 * 3600 * 1000),
    consumed: false,
    meta: event.meta || {}
  });
  setFeedEventPool(pool.slice(0, 30));
}
function consumeFeedEvent(id) {
  const pool = getFeedEventPool().map(e => e.id === id ? { ...e, consumed: true } : e);
  setFeedEventPool(pool);
}

// ----- 随机分钟数工具 -----
function randMinutes(min, max) {
  return (Math.floor(Math.random() * (max - min + 1)) + min) * 60 * 1000;
}

// ----- 事件入口：所有地方改为调用这些，不再直接发帖 -----
function feedEvent_coldWarStarted() {
  pushFeedEvent({
    type: 'cold_war_started', actor: 'ghost', mood: 'hurt',
    intensity: 4, shareability: 0.65, privacy: 'semi',
    dueAt: Date.now() + randMinutes(30, 120),
    expiresAt: Date.now() + 8 * 3600 * 1000
  });
}
function feedEvent_madeUp() {
  pushFeedEvent({
    type: 'made_up', actor: 'ghost', mood: 'soft',
    intensity: 5, shareability: 0.55, privacy: 'semi',
    dueAt: Date.now() + randMinutes(20, 180),
    expiresAt: Date.now() + 24 * 3600 * 1000
  });
}
function feedEvent_giftReceived(itemName, from = 'ghost') {
  pushFeedEvent({
    type: 'gift_received', actor: from, mood: 'soft',
    intensity: 3, shareability: 0.6, privacy: 'semi',
    dueAt: Date.now() + randMinutes(10, 120),
    expiresAt: Date.now() + 24 * 3600 * 1000,
    meta: { itemName }
  });
}
function feedEvent_boughtBigItem(itemName, amount, isHome = false) {
  pushFeedEvent({
    type: 'bought_big_item', actor: 'user', mood: 'proud',
    intensity: amount > 10000 ? 5 : amount > 1000 ? 4 : 3,
    shareability: 0.7, privacy: 'public',
    dueAt: Date.now() + randMinutes(30, 240),
    expiresAt: Date.now() + 2 * 24 * 3600 * 1000,
    meta: { itemName, amount, isHome }
  });
}
function feedEvent_dailyMoment() {
  pushFeedEvent({
    type: 'daily_moment', actor: Math.random() < 0.45 ? 'ghost' : (Math.random() < 0.5 ? 'soap' : 'gaz'),
    mood: 'neutral', intensity: 1, shareability: 0.4, privacy: 'public',
    dueAt: Date.now(),
    expiresAt: Date.now() + 6 * 3600 * 1000
  });
}

// ----- 调度器核心 -----
async function maybeTriggerFeedPost(triggerSource = 'unknown') {
  const now = Date.now();

  // 2小时全局冷却
  const lastPostAt = parseInt(localStorage.getItem('lastFeedPostAt') || '0');
  if (now - lastPostAt < 2 * 3600 * 1000) return null;

  // 拿有效事件
  const pool = getFeedEventPool()
    .filter(e => !e.consumed && e.dueAt <= now && e.expiresAt > now);

  if (!pool.length) {
    // 没事件时兜底：低概率生成日常路过
    return await maybeGenerateAmbientPost(triggerSource);
  }

  // 选最佳事件
  const chosen = selectBestFeedEvent(pool, triggerSource);
  if (!chosen) return null;

  // 判断现在像不像会发
  if (!shouldEventBecomePost(chosen)) {
    // 不发就重新调度：延迟30-90分钟再试
    const updated = getFeedEventPool().map(e =>
      e.id === chosen.id ? { ...e, dueAt: now + randMinutes(30, 90) } : e
    );
    setFeedEventPool(updated);
    return null;
  }

  // 用户侧事件 → 生成草稿，不直接发
  if (chosen.actor === 'user') {
    consumeFeedEvent(chosen.id);
    showUserDraftCard(chosen);
    return null;
  }

  // 角色侧事件 → 生成帖子
  const result = await generateFeedPostFromEvent(chosen);
  if (!result) return null;

  // 存入历史
  insertFeedPost(result);
  consumeFeedEvent(chosen.id);
  localStorage.setItem('lastFeedPostAt', String(now));
  scheduleCloudSave();

  // 红点提示
  localStorage.setItem('feedHasNew', '1');
  const badge = document.getElementById('feedNewBadge');
  if (badge) badge.style.display = 'block';

  // 如果情侣空间开着就刷新
  const coupleScreen = document.getElementById('coupleScreen');
  if (coupleScreen?.classList.contains('active') && typeof initCoupleSpace === 'function') {
    renderCoupleFeedFromHistory();
  }

  return result;
}

// ----- 事件评分选择 -----
function selectBestFeedEvent(pool, triggerSource) {
  const now = Date.now();
  const typeWeight = {
    made_up: 10, cold_war_started: 9, missed_you: 8,
    bought_big_item: 7, gift_received: 6, teammate_teasing: 5,
    daily_moment: 3
  };
  const scored = pool.map(evt => {
    let score = typeWeight[evt.type] || 1;
    score += evt.intensity * 1.5;
    score += evt.shareability * 3;
    const ageHours = (now - evt.createdAt) / 3600000;
    score += Math.max(0, 3 - ageHours);
    if (evt.actor === 'ghost') score += 1;
    if (triggerSource === 'after_chat_turn') score += 2;
    if (triggerSource === 'open_couple_space') score += 1;
    return { evt, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.evt || null;
}

// ----- 像不像活人发帖 -----
function shouldEventBecomePost(evt) {
  if (evt.privacy === 'private') return false;
  const actor = evt.actor;
  const type = evt.type;
  if (actor === 'ghost') {
    if (type === 'daily_moment') return Math.random() < 0.2;
    if (type === 'cold_war_started') return Math.random() < 0.55;
    if (type === 'made_up') return Math.random() < 0.45;
    if (type === 'gift_received') return Math.random() < 0.35;
    return Math.random() < 0.4;
  }
  if (actor === 'soap') return Math.random() < 0.7;
  if (actor === 'gaz') return Math.random() < 0.55;
  if (actor === 'price') return Math.random() < 0.2;
  if (actor === 'user') return true; // 用户侧走草稿路径
  return Math.random() < 0.4;
}

// ----- 兜底日常路过 -----
async function maybeGenerateAmbientPost(triggerSource) {
  const todayKey = 'ambientFeedCount_' + getTodayDateStr();
  const count = parseInt(localStorage.getItem(todayKey) || '0');
  if (count >= 2) return null;
  const chance = triggerSource === 'open_couple_space' ? 0.2 : 0.08;
  if (Math.random() > chance) return null;

  feedEvent_dailyMoment();
  const pool = getFeedEventPool().filter(e => !e.consumed && e.dueAt <= Date.now());
  const evt = pool.find(e => e.type === 'daily_moment');
  if (!evt) return null;
  const result = await generateFeedPostFromEvent(evt);
  if (!result) return null;
  insertFeedPost(result);
  consumeFeedEvent(evt.id);
  localStorage.setItem(todayKey, String(count + 1));
  return result;
}

// ----- 根据事件生成帖子 -----
async function generateFeedPostFromEvent(evt) {
  const location = localStorage.getItem('currentLocation') || 'Hereford Base';
  const weather = localStorage.getItem('lastWeatherDisplay') || '';
  const isColdWar = localStorage.getItem('coldWarMode') === 'true';
  const GHOST_AV = '<img src="images/ghost-avatar.jpg" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
  const posterMap = {
    ghost: { name: localStorage.getItem('botNickname') || 'Simon Riley', avatar: GHOST_AV, nameClass: 'couple-ghost-name' },
    soap:  { name: 'Soap', avatar: '🧼', nameClass: 'couple-soap-name' },
    gaz:   { name: 'Gaz', avatar: '🎖️', nameClass: 'couple-gaz-name' },
    price: { name: 'Price', avatar: '🚬', nameClass: 'couple-price-name' },
  };
  const posterInfo = posterMap[evt.actor] || posterMap['ghost'];

  // 按事件类型拼 prompt
  const promptMap = {
    cold_war_started: `你是西蒙·莱利，刚和老婆冷战。发一条朋友圈，一句话，全小写英文，阴阳怪气但不点名，看起来平静但明显有情绪。附中文翻译。只返回JSON：{"en":"...","zh":"..."}`,
    made_up: `你是西蒙·莱利，刚和老婆和好了。发一条朋友圈，一句话，全小写英文，若无其事但带点余温，不要直说和好。附中文翻译。只返回JSON：{"en":"...","zh":"..."}`,
    gift_received: `你是西蒙·莱利，刚收到老婆送的「${evt.meta?.itemName || '东西'}」。发一条朋友圈，一句话，全小写英文，嘴硬但在意。附中文翻译。只返回JSON：{"en":"...","zh":"..."}`,
    daily_moment: (() => {
      const actor = evt.actor;
      if (actor === 'soap') return `你是Soap（约翰·麦克塔维什），141特遣队成员。发一条日常朋友圈，一句话，英文，活泼，可以调侃队友。附中文翻译。只返回JSON：{"en":"...","zh":"..."}`;
      if (actor === 'gaz')  return `你是Gaz（凯尔·加里克），141特遣队成员。发一条日常朋友圈，一句话，英文，稳重幽默。附中文翻译。只返回JSON：{"en":"...","zh":"..."}`;
      return `你是西蒙·莱利，141特遣队成员，当前在${location}，天气${weather || '不明'}。发一条日常朋友圈，一句话，全小写英文，符合当前状态。附中文翻译。只返回JSON：{"en":"...","zh":"..."}`;
    })(),
  };
  const prompt = promptMap[evt.type] || promptMap['daily_moment'];

  try {
    const raw = await fetchDeepSeek('你是一个角色扮演生成器。只返回JSON，不要任何其他文字。', prompt, 150);
    const post = JSON.parse(raw.replace(/```json|```/g, '').trim());
    if (!post?.en) return null;

    // 60% 概率生成评论
    let comments = [];
    if (Math.random() < 0.6) {
      const others = ['Ghost', 'Soap', 'Gaz', 'Price'].filter(n => n.toLowerCase() !== evt.actor);
      const commenters = others.sort(() => Math.random() - 0.5).slice(0, Math.floor(Math.random() * 2) + 1);
      const avatarMap = { Ghost: GHOST_AV, Soap: '🧼', Gaz: '🎖️', Price: '🚬' };
      const res2 = await fetchWithTimeout('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 200,
          messages: [{ role: 'user', content: `${posterInfo.name}发了朋友圈："${post.en}"。生成${commenters.length}条评论，评论者：${commenters.join('、')}。

角色人设（严格遵守）：
- Soap：话多、爱起哄、爱调侃Ghost、口头禅带苏格兰腔、兄弟情
- Gaz：稳重、幽默但不过分、会说风凉话、不煽情
- Price：话少、务实、最多一两句、不会说肉麻的话
- Ghost：极度克制、几乎不评论、说话简短冷淡

绝对禁止：任何角色叫对方babe/honey/love等亲密称谓、不符合人设的甜腻话、超出兄弟情范围的表达。

每行格式：角色名|英文|中文。只返回评论。` }]
        })
      });
      const d2 = await res2.json();
      comments = (d2.content?.[0]?.text?.trim() || '').split('\n')
        .filter(l => l.includes('|'))
        .map(l => { const [name, en, zh] = l.split('|'); return { name: name?.trim(), en: en?.trim(), zh: zh?.trim() }; })
        .filter(c => c.name && c.en)
        .map(c => ({ avatar: avatarMap[c.name] || '👤', author: c.name, name: c.name, en: c.en, zh: c.zh, text: c.en }));
    }

    return {
      date: new Date().toISOString().slice(0, 10),
      post: {
        en: post.en, zh: post.zh,
        avatar: posterInfo.avatar, author: posterInfo.name, name: posterInfo.name,
        comments, time: Date.now(),
        likes: Math.floor(Math.random() * 30 + 3),
        sourceEvent: evt.type
      }
    };
  } catch(e) { return null; }
}

// ----- 插入帖子到历史 -----
function insertFeedPost(entry) {
  let history = JSON.parse(localStorage.getItem('coupleFeedHistory') || '[]');
  history.unshift(entry);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  history = history.filter(h => h.date >= sevenDaysAgo).slice(0, 25);
  localStorage.setItem('coupleFeedHistory', JSON.stringify(history));
  const summary = history.slice(0, 3).map(h => `[${h.date}] ${h.post?.name || 'Ghost'}发：${h.post?.en || ''}`).join('\n');
  localStorage.setItem('coupleFeedSummary', summary);
}

// ----- 用户草稿弹窗 -----
async function showUserDraftCard(evt) {
  // 生成3个风格版本
  const item = evt.meta?.itemName || '这件事';
  const amount = evt.meta?.amount || 0;
  const days = evt.meta?.days || 0;
  const isAnniversary = evt.meta?.isAnniversary || false;
  const isReplace = evt.meta?.isReplace || false;

  const contextDescMap = {
    bought_big_item: `刚${item.includes('车') ? '买了一辆车' : item.includes('房') ? '买了一套房' : item.includes('地') ? '买了一块地' : `买了${item}`}`,
    gift_received: isReplace
      ? `快递丢失后，西蒙悄悄补寄了「${item}」，刚收到`
      : `刚收到了西蒙寄来的「${item}」`,
    made_up: '和西蒙冷战后刚和好了',
    anniversary: isAnniversary
      ? `今天是结婚一周年纪念日`
      : `今天是在一起第${days}天`,
  };
  const contextDesc = contextDescMap[evt.type] || '刚发生了一件开心的事';

  let options = ['今天有点开心。', '有些事，不说，但记着。', '谁也没告诉，但就是挺满足的。'];
  try {
    const raw = await fetchDeepSeek(
      '你是一个朋友圈文案生成器。只返回JSON，不要其他文字。',
      `用户${contextDesc}，帮她生成3条朋友圈候选文案（一句话，口语化，不要太甜腻，不要提西蒙名字）。分别是：低调版、情绪版、嘴硬版。只返回JSON：{"quiet":"...","emotional":"...","tsundere":"..."}`,
      200
    );
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    options = [parsed.quiet, parsed.emotional, parsed.tsundere].filter(Boolean);
    if (options.length < 3) options = ['今天有点开心。', '有些事，不说，但记着。', '谁也没告诉，但就是挺满足的。'];
  } catch(e) {}

  // 移除旧弹窗
  document.getElementById('userDraftCard')?.remove();

  const titleMap = {
    bought_big_item: '要不要把这一刻留在动态里？',
    gift_received: isReplace ? '他补寄了——要留个记录吗？' : '收到他的东西，发一条？',
    made_up: '和好了，要说点什么吗？',
    anniversary: isAnniversary ? '一周年纪念日，留一条？' : `第${days}天，发一条？`,
  };
  const cardTitle = titleMap[evt.type] || '要不要把这一刻留在动态里？';

  const labels = ['低调', '情绪', '嘴硬'];
  const card = document.createElement('div');
  card.id = 'userDraftCard';
  card.style.cssText = `position:fixed;bottom:0;left:0;right:0;z-index:9999;padding:16px;background:linear-gradient(to top,rgba(248,231,255,0.98),rgba(255,245,255,0.95));border-radius:24px 24px 0 0;box-shadow:0 -4px 30px rgba(168,85,247,0.15);backdrop-filter:blur(20px);`;
  card.innerHTML = `
    <div style="text-align:center;margin-bottom:12px;">
      <div style="width:36px;height:4px;background:rgba(168,85,247,0.3);border-radius:2px;margin:0 auto 12px;"></div>
      <div style="font-size:13px;color:#9333ea;font-weight:600;">${cardTitle}</div>
    </div>
    <div id="draftOptions" style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
      ${options.map((opt, i) => `
        <div class="draft-option" data-idx="${i}" onclick="selectDraftOption(this)" style="padding:12px 16px;border-radius:14px;border:1.5px solid rgba(168,85,247,0.2);background:white;cursor:pointer;transition:all 0.2s;">
          <span style="font-size:11px;color:#c084fc;font-weight:600;margin-right:8px;">${labels[i]}</span>
          <span style="font-size:14px;color:#4a1a70;">${opt}</span>
        </div>
      `).join('')}
    </div>
    <div style="display:flex;gap:8px;">
      <button onclick="dismissUserDraft()" style="flex:1;padding:12px;border-radius:14px;border:1.5px solid rgba(168,85,247,0.2);background:transparent;color:#9333ea;font-size:14px;cursor:pointer;">不了</button>
      <button id="draftPublishBtn" onclick="publishUserDraft('${evt.id}')" style="flex:2;padding:12px;border-radius:14px;background:linear-gradient(135deg,#a855f7,#ec4899);color:white;font-size:14px;font-weight:600;border:none;cursor:pointer;opacity:0.5;pointer-events:none;">发布</button>
    </div>
  `;
  document.body.appendChild(card);

  // 存草稿内容供发布用
  window._currentDraftOptions = options;
  window._currentDraftEvtId = evt.id;
  window._currentDraftMeta = evt.meta || {};
}

let _selectedDraftIdx = -1;
function selectDraftOption(el) {
  document.querySelectorAll('.draft-option').forEach(d => {
    d.style.background = 'white';
    d.style.borderColor = 'rgba(168,85,247,0.2)';
  });
  el.style.background = 'rgba(168,85,247,0.08)';
  el.style.borderColor = '#a855f7';
  _selectedDraftIdx = parseInt(el.dataset.idx);
  const btn = document.getElementById('draftPublishBtn');
  if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
}

function dismissUserDraft() {
  document.getElementById('userDraftCard')?.remove();
  _selectedDraftIdx = -1;
}

async function publishUserDraft() {
  if (_selectedDraftIdx < 0 || !window._currentDraftOptions) return;
  const text = window._currentDraftOptions[_selectedDraftIdx];
  if (!text) return;

  dismissUserDraft();

  const userName = localStorage.getItem('userName') || '你';
  const savedAvatar = localStorage.getItem('userAvatarBase64');
  const userAvatar = savedAvatar ? 'IMG' : userName.charAt(0);
  const GHOST_AV = '<img src="images/ghost-avatar.jpg" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';

  // 翻译
  let zh = text;
  try {
    const translated = await fetchDeepSeek('只返回中文翻译，不要其他内容。', text, 60);
    if (translated?.trim()) zh = translated.trim();
  } catch(e) {}

  // 生成评论
  let comments = [];
  try {
    const avatarMap = { Ghost: GHOST_AV, Soap: '🧼', Gaz: '🎖️', Price: '🚬' };
    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 200,
        messages: [{ role: 'user', content: `${userName}发了朋友圈："${text}"。生成2条队友评论，角色从Soap、Gaz、Ghost中选。\n\n角色人设（严格遵守）：\n- Soap：话多、爱起哄、爱调侃Ghost、兄弟情\n- Gaz：稳重、幽默但不过分、不煽情\n- Ghost：极度克制、简短冷淡\n\n绝对禁止：叫对方babe/honey/love等亲密称谓、甜腻话。\n\n格式：角色名|英文|中文。只返回评论。` }]
      })
    });
    const d = await res.json();
    comments = (d.content?.[0]?.text?.trim() || '').split('\n')
      .filter(l => l.includes('|'))
      .map(l => { const [name, en, zh] = l.split('|'); return { name: name?.trim(), en: en?.trim(), zh: zh?.trim() }; })
      .filter(c => c.name && c.en)
      .map(c => ({ avatar: avatarMap[c.name] || '👤', author: c.name, name: c.name, en: c.en, zh: c.zh, text: c.en }));
  } catch(e) {}

  const entry = {
    date: new Date().toISOString().slice(0, 10),
    post: { en: text, zh, avatar: userAvatar, author: userName, name: userName, comments, time: Date.now(), likes: 1, isUserPost: true }
  };
  insertFeedPost(entry);
  localStorage.setItem('feedHasNew', '1');
  const badge = document.getElementById('feedNewBadge');
  if (badge) badge.style.display = 'block';

  showToast('✨ 已发布到动态');

  const coupleScreen = document.getElementById('coupleScreen');
  if (coupleScreen?.classList.contains('active')) renderCoupleFeedFromHistory();
}

// ----- 只渲染历史（不重新生成） -----
function renderCoupleFeedFromHistory() {
  const all = JSON.parse(localStorage.getItem('coupleFeedHistory') || '[]');
  renderCoupleFeed(all.map(h => h.post));
}

// ===== 阴阳帖系统 =====
}

// ===== 花瓣动画 =====
function spawnCouplePetals() {
  const container = document.getElementById('couplePetalContainer');
  if (!container) return;
  container.innerHTML = '';
  const petals = ['🌸', '🌺', '💮', '🌷', '🌼'];
  const count = 18;
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const p = document.createElement('div');
      p.className = 'couple-petal';
      p.textContent = petals[Math.floor(Math.random() * petals.length)];
      p.style.left = Math.random() * 100 + '%';
      p.style.fontSize = (Math.random() * 8 + 10) + 'px';
      p.style.animationDuration = (Math.random() * 2 + 2.5) + 's';
      p.style.animationDelay = (Math.random() * 1.5) + 's';
      container.appendChild(p);
      setTimeout(() => p.remove(), 5000);
    }, i * 80);
  }
}

// ===== 钱包系统 =====
function getBalance() {
  // 首次使用初始化100英镑
  if (localStorage.getItem('wallet') === null) {
    localStorage.setItem('wallet', '100.00');
    addTransaction({ icon: '🎁', name: '新婚礼金', amount: 100 });
  }
  return parseFloat(localStorage.getItem('wallet') || '100');
}
function setBalance(val) {
  const safeVal = Math.max(0, val);
  localStorage.setItem('wallet', safeVal.toFixed(2));
  const balEl = document.getElementById('transferBalance');
  if (balEl) balEl.textContent = '£' + Math.floor(safeVal);
  const walletBalEl = document.getElementById('walletBalance');
  if (walletBalEl) walletBalEl.textContent = '£' + safeVal.toFixed(2);
  touchLocalState();
  saveToCloud();
}
function getTransactions() {
  return JSON.parse(localStorage.getItem('transactions') || '[]');
}
function addTransaction(tx) {
  if (!tx.time) {
    const now = new Date();
    tx.time = now.getFullYear() + '-' +
      String(now.getMonth()+1).padStart(2,'0') + '-' +
      String(now.getDate()).padStart(2,'0') + ' ' +
      String(now.getHours()).padStart(2,'0') + ':' +
      String(now.getMinutes()).padStart(2,'0');
  }
  if (!tx.id) tx.id = Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const list = getTransactions();
  list.unshift(tx);
  localStorage.setItem('transactions', JSON.stringify(list));
}

let txExpanded = false;
const TX_PREVIEW = 5;

function renderWallet() {
  const bal = getBalance();
  const walletBalEl = document.getElementById('walletBalance');
  if (walletBalEl) walletBalEl.textContent = '£' + bal.toFixed(2);

  const txList = getTransactions();
  const now = new Date();
  const monthKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  let monthIn = 0, monthOut = 0;
  txList.forEach(tx => {
    if (tx.time && tx.time.startsWith(monthKey)) {
      if (tx.amount > 0) monthIn += tx.amount;
      else monthOut += Math.abs(tx.amount);
    }
  });
  const inEl = document.getElementById('monthIncome');
  const outEl = document.getElementById('monthExpense');
  if (inEl) inEl.textContent = '+£' + monthIn.toFixed(0);
  if (outEl) outEl.textContent = '-£' + monthOut.toFixed(0);

  const container = document.getElementById('transactionList');
  const toggleBtn = document.getElementById('transactionToggle');
  if (!container) return;

  if (txList.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:rgba(130,80,170,0.5);padding:24px;font-size:13px;">暂无交易记录</div>';
    if (toggleBtn) toggleBtn.style.display = 'none';
    return;
  }

  const showList = txExpanded ? txList : txList.slice(0, TX_PREVIEW);
  container.innerHTML = showList.map(tx => `
    <div class="transaction-item">
      <div class="transaction-icon">${tx.icon || '💰'}</div>
      <div class="transaction-info">
        <div class="transaction-name">${tx.name}</div>
        <div class="transaction-time">${tx.time || ''}</div>
      </div>
      <div class="transaction-amount ${tx.amount > 0 ? 'in' : 'out'}">
        ${tx.amount > 0 ? '+' : '-'}£${Math.abs(tx.amount).toFixed(0)}
      </div>
    </div>
  `).join('');

  if (toggleBtn) {
    if (txList.length > TX_PREVIEW) {
      toggleBtn.style.display = 'block';
      const remaining = txList.length - TX_PREVIEW;
      document.getElementById('transactionToggleCount').textContent = txExpanded ? '' : `（还有 ${remaining} 条）`;
      toggleBtn.querySelector('.toggle-text').textContent = txExpanded ? '收起 ' : '展开全部 ';
      const arrow = toggleBtn.querySelector('.toggle-arrow');
      if (arrow) arrow.classList.toggle('open', txExpanded);
    } else {
      toggleBtn.style.display = 'none';
    }
  }
}

function toggleTransactions() {
  txExpanded = !txExpanded;
  renderWallet();
}

// ===== 工资系统 =====
function checkSalaryDay() {
  const today = new Date();
  if (today.getDate() !== 25) return;
  const salaryKey = 'salaryPaid_' + today.getFullYear() + '_' + (today.getMonth()+1);
  if (localStorage.getItem(salaryKey)) return;
  const salary = (Math.floor(Math.random() * 11) + 15) * 100; // £1500-£2500
  localStorage.setItem(salaryKey, salary.toString());
  localStorage.setItem('lastSalaryAmount', salary);
  localStorage.setItem('lastSalaryMonth', today.getFullYear() + '-' + (today.getMonth()+1));
  setTimeout(() => {
    setBalance(getBalance() + salary);
    addTransaction({ icon: '💷', name: 'Ghost 月度工资', amount: salary });
    renderWallet();
    changeAffection(1);
    const salaryNote = `[系统提示：今天是25号，你刚向老婆转了本月工资 £${salary}，已到她账户。你可以在对话中自然提到这件事。]`;
    chatHistory.push({ role: 'user', content: salaryNote });
    const container = document.getElementById('messagesContainer');

    // 用 Haiku 动态生成转账台词，fallback 到备用台词
    const salaryFallbacks = [
      `salary's in. £${salary}.\n工资到了，£${salary}。`,
      `transferred. £${salary}. don't spend it all.\n转了，£${salary}。别一次花完。`,
      `check your account. £${salary}.\n看看账户，£${salary}。`,
      `it's in. £${salary}. this month's.\n到了，£${salary}，这个月的。`,
      `sent. £${salary}.\n转了，£${salary}。`,
    ];
    const fallbackLine = salaryFallbacks[Math.floor(Math.random() * salaryFallbacks.length)];

    fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        messages: [{ role: 'user', content:
          `你是西蒙·莱利（Ghost），刚向老婆转了本月工资 £${salary}。` +
          `发一条简短消息告知她，一句话，全小写英文，符合他克制、不废话的风格，不要肉麻，不要解释太多。` +
          `附中文翻译。只返回一行英文+换行+中文翻译，不要其他内容。`
        }]
      })
    }, 8000).then(r => r.json()).then(data => {
      const line = data.content?.[0]?.text?.trim() || fallbackLine;
      if (container) showGhostTransferCard(container, salary, line, false);
      chatHistory.push({ role: 'assistant', content: line, _transfer: { amount: salary, isRefund: false } });
      saveHistory();
    }).catch(() => {
      if (container) showGhostTransferCard(container, salary, fallbackLine, false);
      chatHistory.push({ role: 'assistant', content: fallbackLine, _transfer: { amount: salary, isRefund: false } });
      saveHistory();
    });

    showToast('💷 Ghost 本月工资已到账 £' + salary + '！');
  }, 2000);
}

// ===== 打工系统（番茄钟）=====
let pomodoroTimer = null;
let pomodoroSecondsLeft = 0;
let pomodoroTotalSeconds = 0;
let selectedJob = { job: 'study', minutes: 25, pay: 20, emoji: '📚', name: '学习' };

const JOB_INFO = {
  study:    { emoji: '📚', name: '学习',  slackMsg: null },
  exercise: { emoji: '💪', name: '运动',  slackMsg: null },
  create:   { emoji: '🎨', name: '创作',  slackMsg: null },
  slack:    { emoji: '😴', name: '摸鱼',  slackMsg: null },
};

function selectJob(el) {
  document.querySelectorAll('.job-option').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  selectedJob = {
    job: el.dataset.job,
    minutes: parseInt(el.dataset.minutes),
    pay: parseInt(el.dataset.pay),
    emoji: el.querySelector('.job-emoji').textContent,
    name: el.querySelector('.job-name').textContent,
  };
}

function getTodayWorkKey() { return 'work_' + new Date().toDateString(); }

function getTodayWorkData() {
  return JSON.parse(localStorage.getItem(getTodayWorkKey()) || '{"count":0,"income":0,"log":[]}');
}

function updateWorkUI() {
  const data = getTodayWorkData();
  const remaining = Math.max(0, 4 - data.count);
  const incomeEl = document.getElementById('workTodayIncome');
  const quotaEl = document.getElementById('workQuotaText');
  const descEl = document.getElementById('workCardDesc');
  if (incomeEl) incomeEl.textContent = '£' + data.income;
  if (quotaEl) quotaEl.textContent = `（今日还可完成 ${remaining} 个）`;
  if (descEl) descEl.textContent = data.income > 0 ? `今日已赚 £${data.income}` : '赚点零花钱';

  const log = document.getElementById('workLog');
  if (log) {
    if (data.log && data.log.length > 0) {
      log.innerHTML = '<div class="work-log-title">今日记录</div>' +
        data.log.map(l => `<div class="work-log-item"><span>${l.emoji} ${l.name}</span><span class="work-log-pay">+£${l.pay}</span></div>`).join('');
    } else {
      log.innerHTML = '';
    }
  }
}

function startPomodoro() {
  const data = getTodayWorkData();
  if (data.count >= 4) { showToast('今天已经打够工了，好好休息 💤'); return; }

  pomodoroTotalSeconds = selectedJob.minutes * 60;
  pomodoroSecondsLeft = pomodoroTotalSeconds;

  document.getElementById('jobSelector').style.display = 'none';
  document.getElementById('startBtn').style.display = 'none';
  document.getElementById('pomodoroDone').style.display = 'none';
  document.getElementById('timerWrap').style.display = 'flex';
  document.getElementById('timerJobLabel').textContent = selectedJob.emoji + ' ' + selectedJob.name + '中';

  updatePomodoroRing();
  pomodoroTimer = setInterval(tickPomodoro, 1000);
}

function tickPomodoro() {
  pomodoroSecondsLeft--;
  updatePomodoroRing();
  if (pomodoroSecondsLeft <= 0) {
    clearInterval(pomodoroTimer);
    pomodoroTimer = null;
    finishPomodoro();
  }
}

function updatePomodoroRing() {
  const mins = Math.floor(pomodoroSecondsLeft / 60);
  const secs = pomodoroSecondsLeft % 60;
  const display = document.getElementById('timerDisplay');
  if (display) display.textContent = String(mins).padStart(2,'0') + ':' + String(secs).padStart(2,'0');
  const ring = document.getElementById('ringProgress');
  if (ring) {
    const circumference = 2 * Math.PI * 52;
    ring.style.strokeDashoffset = circumference * (pomodoroSecondsLeft / pomodoroTotalSeconds);
  }
}

function cancelPomodoro() {
  clearInterval(pomodoroTimer);
  pomodoroTimer = null;
  document.getElementById('timerWrap').style.display = 'none';
  document.getElementById('jobSelector').style.display = 'grid';
  document.getElementById('startBtn').style.display = 'block';
  showToast('已放弃，下次加油 💪');
}

function finishPomodoro() {
  const pay = selectedJob.pay;
  const jobInfo = JOB_INFO[selectedJob.job];

  // 更新今日数据
  const dayKey = getTodayWorkKey();
  const data = getTodayWorkData();
  data.count++;
  data.income += pay;
  data.log = data.log || [];
  data.log.unshift({ emoji: selectedJob.emoji, name: selectedJob.name, pay });
  localStorage.setItem(dayKey, JSON.stringify(data));

  // 入账
  setBalance(getBalance() + pay);
  addTransaction({ icon: selectedJob.emoji, name: '诺亚工作室 · ' + selectedJob.name, amount: pay });
  if (typeof renderWallet === 'function') renderWallet();

  // 检查本周打工次数好感度
  const weekKey = 'weekWork_' + getWeekKey();
  const weekCount = parseInt(localStorage.getItem(weekKey) || '0') + 1;
  localStorage.setItem(weekKey, weekCount);
  if (weekCount >= 7) {
    const bonusKey = 'weekWorkBonus_' + getWeekKey();
    if (!localStorage.getItem(bonusKey)) {
      localStorage.setItem(bonusKey, '1');
      changeAffection(1);
      showToast('💼 本周打工满7次，继续加油！');
    }
  }

  // 显示完成状态
  document.getElementById('timerWrap').style.display = 'none';
  document.getElementById('jobSelector').style.display = 'grid';
  document.getElementById('startBtn').style.display = 'block';
  const done = document.getElementById('pomodoroDone');
  const doneAmount = document.getElementById('doneAmount');
  if (done) done.style.display = 'flex';
  if (doneAmount) doneAmount.textContent = '+£' + pay;

  updateWorkUI();

  // 摸鱼特殊台词（只在打工界面显示，不进聊天）
  if (selectedJob.job === 'slack') {
    const q = getSlackQuote();
    const doneEl = document.getElementById('pomodoroDone');
    if (doneEl) {
      const quoteDiv = document.createElement('div');
      quoteDiv.style.cssText = 'font-size:11px;color:rgba(80,40,120,0.55);font-style:italic;text-align:center;margin-top:4px;line-height:1.6;';
      quoteDiv.innerHTML = `"${q.en}"<br><span style="font-size:10px;opacity:0.7">${q.zh}</span>`;
      doneEl.appendChild(quoteDiv);
    }
  }

  showToast('✅ 打工完成！+£' + pay);
}


// ===== 单词系统（原版）=====
const VOCAB_WORDS = [
  { word: 'Exhausted',    zh: '精疲力竭',      ghost: "Exhausted. Not tired — exhausted. There's a difference. Use the right word.",        ghostZh: '是exhausted，不是tired。有区别。用对词。' },
  { word: 'Classified',   zh: '机密的',         ghost: "Classified. Means none of your business. Remember that.",                              ghostZh: '机密。意思是不关你的事。记住了。' },
  { word: 'Persistent',   zh: '坚持不懈的',     ghost: "Persistent. Like you. Annoying, but effective.",                                        ghostZh: '坚持不懈。跟你一样。烦人，但有效。' },
  { word: 'Reckless',     zh: '鲁莽的',         ghost: "Reckless. Don't be. I mean it.",                                                        ghostZh: '鲁莽。别这样。我是认真的。' },
  { word: 'Inevitable',   zh: '不可避免的',     ghost: "Inevitable. Some things just are. Like this conversation.",                             ghostZh: '不可避免的。有些事就是这样。比如这段对话。' },
  { word: 'Melancholy',   zh: '忧郁',           ghost: "Melancholy. Sounds better than sad. More accurate too.",                                ghostZh: '忧郁。比sad听起来好。也更准确。' },
  { word: 'Tenacious',    zh: '顽强的',         ghost: "Tenacious. Stubborn, but the good kind. Usually.",                                      ghostZh: '顽强的。固执，但是好的那种。通常是。' },
  { word: 'Obscure',      zh: '晦涩的/模糊的',  ghost: "Obscure. Hard to see or understand. Like me, apparently.",                              ghostZh: '晦涩的。难以看清或理解。好像跟我一样。' },
  { word: 'Resilient',    zh: '有韧性的',       ghost: "Resilient. Bounces back. You are. Don't forget it.",                                    ghostZh: '有韧性的。能恢复过来。你就是。别忘了。' },
  { word: 'Solitude',     zh: '独处/孤独',      ghost: "Solitude. Not lonely — alone by choice. Different thing entirely.",                     ghostZh: '独处。不是孤独——是主动选择独处。完全不同。' },
  { word: 'Vigilant',     zh: '警觉的',         ghost: "Vigilant. Always aware of your surroundings. Useful habit.",                            ghostZh: '警觉的。时刻注意周围环境。有用的习惯。' },
  { word: 'Fleeting',     zh: '短暂的',         ghost: "Fleeting. Here and then gone. Don't waste it.",                                         ghostZh: '短暂的。来了又走。别浪费。' },
  { word: 'Stoic',        zh: '坚忍的',         ghost: "Stoic. Doesn't mean emotionless. Means in control. There's a difference.",             ghostZh: '坚忍的。不是没有感情。是能控制自己。有区别。' },
  { word: 'Grim',         zh: '严峻的/冷酷的',  ghost: "Grim. The situation, not me. ...Fine, sometimes me.",                                   ghostZh: '严峻的。说的是形势，不是我。……好吧，有时候是我。' },
  { word: 'Yearning',     zh: '渴望/思念',      ghost: "Yearning. A deep want for something far away. ...Don't overthink that.",                ghostZh: '渴望，思念。对遥远事物的深切想念。……别想太多。' },
  { word: 'Cryptic',      zh: '神秘难懂的',     ghost: "Cryptic. Hard to interpret. Yes, I know.",                                              ghostZh: '神秘难懂的。难以理解。我知道。' },
  { word: 'Composed',     zh: '镇定的',         ghost: "Composed. Calm under pressure. Work on it.",                                            ghostZh: '镇定的。压力下保持冷静。努力做到。' },
  { word: 'Relentless',   zh: '不懈的',         ghost: "Relentless. Doesn't stop. Ever. Good quality in the right context.",                    ghostZh: '不懈的。永不停止。在对的情况下是好品质。' },
  { word: 'Bittersweet',  zh: '苦乐参半的',     ghost: "Bittersweet. Good and bad at the same time. Most things worth having are.",            ghostZh: '苦乐参半的。同时有好有坏。大多数值得拥有的东西都是这样。' },
  { word: 'Steadfast',    zh: '坚定不移的',     ghost: "Steadfast. Doesn't waver. Doesn't leave. ...Just a word.",                             ghostZh: '坚定不移的。不动摇。不离开。……只是个单词。' },
  { word: 'Gruff',        zh: '粗声粗气的',     ghost: "Gruff. Short and rough in manner. Soap uses this word about me. He's not wrong.",       ghostZh: '粗声粗气的。态度简短粗鲁。Soap用这个词形容我。他没说错。' },
  { word: 'Wistful',      zh: '惆怅的',         ghost: "Wistful. Sad but in a quiet way. Usually about something you can't have.",              ghostZh: '惆怅的。安静地难过。通常是关于得不到的东西。' },
  { word: 'Sincere',      zh: '真诚的',         ghost: "Sincere. Means what you say. Say what you mean. Simple.",                               ghostZh: '真诚的。言出于心。言行一致。很简单。' },
  { word: 'Distant',      zh: '遥远的/疏远的',  ghost: "Distant. Far away. Physically or otherwise. ...Both apply right now.",                  ghostZh: '遥远的，疏远的。在距离上，或者其他方面。……现在两种都有。' },
  { word: 'Endure',       zh: '忍耐/持续',      ghost: "Endure. Get through it. You've done it before.",                                        ghostZh: '忍耐，坚持下去。你以前做到过。' },
  { word: 'Concise',      zh: '简洁的',         ghost: "Concise. Say what you need to say. Nothing more.",                                      ghostZh: '简洁的。说你要说的。不多说。' },
  { word: 'Formidable',   zh: '令人敬畏的',     ghost: "Formidable. Impressive and slightly terrifying. Price uses that word about the team.",  ghostZh: '令人敬畏的。令人印象深刻又有点可怕。Price用这个词形容我们队。' },
  { word: 'Rugged',       zh: '粗犷的/坚韧的',  ghost: "Rugged. Tough. Built for difficult conditions. ...Soap called me this. Once.",          ghostZh: '粗犷的，坚韧的。强硬。为艰难环境而生。……Soap这么叫过我。一次。' },
  { word: 'Longing',      zh: '渴望/思念',      ghost: "Longing. When you want something that isn't there. ...Don't ask.",                      ghostZh: '渴望，思念。想要某个不在身边的东西。……别问。' },
  { word: 'Bloke',        zh: '家伙/男人（英式）', ghost: "Bloke. Just means a man. Perfectly normal word. Don't overthink it.",                   ghostZh: '家伙，男人。很普通的词。别想太多。' },
  { word: 'Knackered',    zh: '累坏了（英式）',  ghost: "Knackered. Means exhausted. More honest than saying tired.",                               ghostZh: '累坏了。比说tired更诚实。' },
  { word: 'Sorted',       zh: '搞定了（英式）',  ghost: "Sorted. Means handled. Done. Move on.",                                                     ghostZh: '搞定了。处理好了。继续。' },
  { word: 'Reckon',       zh: '认为/觉得（英式）', ghost: "Reckon. Means think or suppose. I reckon you already knew that.",                         ghostZh: '认为，觉得。我觉得你早就知道这个词了。' },
  { word: 'Gutted',       zh: '很失望（英式）',  ghost: "Gutted. Deeply disappointed. Not just a little — properly gutted.",                         ghostZh: '很失望。不是一点点——是真的很失望。' },
  { word: 'Cheers',       zh: '谢了/干杯（英式）', ghost: "Cheers. Means thanks. Or a toast. Context dependent. Figure it out.",                      ghostZh: '谢了，或者干杯。看情况。你自己判断。' },
];

const VOCAB_CORRECT_BI = [
  "Correct. Good. 答对了。不错。",
  "Right. Keep going. 对的。继续。",
  "That's it. Not bad. 就是这个。还行。",
  "Correct. See, you can do it. 答对了。你看，你能做到的。",
  "Right answer. Don't get cocky. 答对了。别骄傲。",
];
const VOCAB_WRONG_BI = [
  "Wrong. Try to remember it. 答错了。试着记住它。",
  "No. Pay attention. 不对。注意听。",
  "Incorrect. Look at the right answer. 错了。看正确答案。",
  "Wrong. It happens. Move on. 答错了。没关系。继续。",
  "No. Remember this one. 不对。记住这个。",
];

function getTodayWords() {
  const dayIndex = Math.floor(Date.now() / 86400000);
  const startIdx = (dayIndex * 5) % VOCAB_WORDS.length;
  const words = [];
  for (let i = 0; i < 5; i++) words.push(VOCAB_WORDS[(startIdx + i) % VOCAB_WORDS.length]);
  return words;
}

function getVocabProgress() {
  const key = 'vocab_' + new Date().toDateString();
  return JSON.parse(localStorage.getItem(key) || '{"learned":[],"tested":[],"streak":0}');
}

function saveVocabProgress(data) {
  const key = 'vocab_' + new Date().toDateString();
  localStorage.setItem(key, JSON.stringify(data));
  updateVocabStreak();
  // 好感度逻辑
  if (data.learned && data.learned.length >= 5) {
    const todayKey = 'vocabAffection_' + new Date().toDateString();
    if (!localStorage.getItem(todayKey)) {
      localStorage.setItem(todayKey, '1');
      changeAffection(0.5);
    }
  }
}

function updateVocabStreak() {
  const streak = parseInt(localStorage.getItem('vocabStreak') || '0');
  const lastDay = localStorage.getItem('vocabLastDay') || '';
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (lastDay === today) return;
  const newStreak = lastDay === yesterday ? streak + 1 : 1;
  localStorage.setItem('vocabStreak', newStreak);
  localStorage.setItem('vocabLastDay', today);
}

let vocabMode = 'learn';
let currentWordIdx = 0;
let testWords = [];
let testResults = [];
let cardFlipped = false;

function openVocabLearn() {
  vocabMode = 'learn';
  currentWordIdx = 0;
  renderVocabCard();
}

function startVocabTest() {
  const testDoneKey = 'vocabTested_' + new Date().toDateString();
  const done = localStorage.getItem(testDoneKey);
  if (done) { showToast('今日测验已完成 ' + done + '，明天再来 🐈‍⬛'); return; }
  const progress = getVocabProgress();
  const todayWords = getTodayWords();
  if (!progress.learned || progress.learned.length < todayWords.length) {
    showToast('🐈‍⬛ 先把今天的单词学完，才能测验哦'); return;
  }
  vocabMode = 'test';
  currentWordIdx = 0;
  testWords = [...getTodayWords()].sort(() => Math.random() - 0.5);
  testResults = [];
  renderVocabTest();
  showVocabMode('test');
}

function renderVocabScreen() {
  const words = getTodayWords();
  const progress = getVocabProgress();
  const previewEl = document.getElementById('vocabPreviewList');
  if (previewEl) {
    previewEl.innerHTML = words.map(w => `
      <div class="vocab-preview-item ${progress.learned.includes(w.word) ? 'learned' : ''}">
        <span class="vocab-preview-word">${w.word}</span>
        <span class="vocab-preview-zh">${w.zh}</span>
        ${progress.learned.includes(w.word) ? '<span class="vocab-preview-check">✓</span>' : ''}
      </div>`).join('');
  }
  const learnedCount = progress.learned.length;
  const streakEl = document.getElementById('vocabStreakCount');
  const learnedEl = document.getElementById('vocabLearnedCount');
  const descEl = document.getElementById('vocabCardDesc');
  if (streakEl) streakEl.textContent = parseInt(localStorage.getItem('vocabStreak') || '0');
  if (learnedEl) learnedEl.textContent = learnedCount + '/5';
  if (descEl) descEl.textContent = learnedCount >= 5 ? '今日完成 ✅' : `今日${learnedCount}/5`;

  const testDoneKey = 'vocabTested_' + new Date().toDateString();
  const testDone = localStorage.getItem(testDoneKey);
  const testBtn = document.getElementById('vocabTestBtn');
  if (testBtn) {
    testBtn.textContent = testDone ? '✅ 今日已测 ' + testDone : '✏️ 开始测验';
    testBtn.style.opacity = testDone ? '0.55' : '1';
  }
  showVocabMode('home');
}

function showVocabMode(mode) {
  document.getElementById('vocabHome').style.display      = mode === 'home'  ? 'block' : 'none';
  document.getElementById('vocabLearnMode').style.display = mode === 'learn' ? 'flex'  : 'none';
  document.getElementById('vocabTestMode').style.display  = mode === 'test'  ? 'flex'  : 'none';
  document.getElementById('vocabDoneMode').style.display  = mode === 'done'  ? 'flex'  : 'none';
}

function renderVocabCard() {
  const words = getTodayWords();
  if (currentWordIdx >= words.length) {
    const progress = getVocabProgress();
    progress.learned = words.map(w => w.word);
    saveVocabProgress(progress);
    showVocabMode('done');
    document.getElementById('vocabDoneMsg').textContent = 'Good work. All five.';
    return;
  }
  const word = words[currentWordIdx];
  cardFlipped = false;
  const card = document.getElementById('vocabFlipCard');
  // 先重置翻转状态，短暂隐藏，再更新内容，防止闪到背面
  if (card) {
    card.classList.remove('flipped');
    card.style.visibility = 'hidden';
  }
  const frontEl = document.getElementById('vocabCardFront');
  const backEl = document.getElementById('vocabCardBack');
  const progressEl = document.getElementById('vocabCardProgress');
  if (frontEl) frontEl.textContent = word.word;
  if (backEl) backEl.innerHTML = `
    <div class="vocab-zh">${word.zh}</div>
    <div class="vocab-ghost-line">"${word.ghost}"</div>
    <div class="vocab-ghost-line-zh">${word.ghostZh}</div>`;
  if (progressEl) progressEl.textContent = (currentWordIdx + 1) + ' / ' + words.length;
  // 内容更新完再显示
  setTimeout(() => { if (card) card.style.visibility = 'visible'; }, 50);
}

function flipVocabCard() {
  const card = document.getElementById('vocabFlipCard');
  cardFlipped = !cardFlipped;
  if (card) card.classList.toggle('flipped', cardFlipped);
}

function nextVocabCard() {
  currentWordIdx++;
  renderVocabCard();
}

function renderVocabTest() {
  if (currentWordIdx >= testWords.length) {
    const correct = testResults.filter(Boolean).length;
    const testDoneKey = 'vocabTested_' + new Date().toDateString();
    localStorage.setItem(testDoneKey, correct + '/5');
    // 好感度：4/5或5/5加0.5
    if (correct >= 4) {
      const bonusKey = 'vocabTestAffection_' + new Date().toDateString();
      if (!localStorage.getItem(bonusKey)) {
        localStorage.setItem(bonusKey, '1');
        changeAffection(0.5);
        showToast('✏️ 测验完成！' + correct + '/5');
      }
    }
    showVocabMode('done');
    const scoreMsg = correct === 5
      ? '5/5. Correct. All of them. 全对。'
      : correct >= 3
      ? `${correct}/5. Could be worse. Review the ones you missed. 还行。复习一下答错的。`
      : `${correct}/5. Study harder. 学认真点。`;
    const doneMsgEl = document.getElementById('vocabDoneMsg');
    if (doneMsgEl) doneMsgEl.textContent = scoreMsg;
    return;
  }
  const word = testWords[currentWordIdx];
  const testWordEl = document.getElementById('vocabTestWord');
  const testProgressEl = document.getElementById('vocabTestProgress');
  const feedbackEl = document.getElementById('vocabTestFeedback');
  if (testWordEl) testWordEl.textContent = word.word;
  if (testProgressEl) testProgressEl.textContent = (currentWordIdx + 1) + ' / ' + testWords.length;
  if (feedbackEl) { feedbackEl.textContent = ''; feedbackEl.className = 'vocab-feedback'; }

  const opts = [word];
  while (opts.length < 4) {
    const rand = VOCAB_WORDS[Math.floor(Math.random() * VOCAB_WORDS.length)];
    if (!opts.find(o => o.word === rand.word)) opts.push(rand);
  }
  opts.sort(() => Math.random() - 0.5);
  const container = document.getElementById('vocabTestOptions');
  if (container) {
    container.innerHTML = opts.map(o => `
      <button class="vocab-option" onclick="checkVocabAnswer('${o.word}','${word.word}',this)">
        ${o.zh}
      </button>`).join('');
  }

  const dotRow = document.getElementById('vocabDotRow');
  if (dotRow) {
    dotRow.innerHTML = testWords.map((_, i) => {
      let cls = 'vocab-dot';
      if (i < currentWordIdx) cls += testResults[i] ? ' done-correct' : ' done-wrong';
      else if (i === currentWordIdx) cls += ' current';
      return `<div class="${cls}"></div>`;
    }).join('');
  }

  const hints = [
    '一次机会。想清楚再选。',
    'No second chances. 没有第二次机会。',
    'Think before you answer. 答之前想清楚。',
    'You know this one. 你知道的。',
    'Last one. Focus. 最后一题。专注。',
  ];
  const hintEl = document.getElementById('vocabGhostHint');
  if (hintEl) hintEl.textContent = hints[Math.min(currentWordIdx, hints.length - 1)];
}

function checkVocabAnswer(selected, correct, btn) {
  const isCorrect = selected === correct;
  testResults.push(isCorrect);
  document.querySelectorAll('.vocab-option').forEach(b => {
    b.disabled = true;
    if (b.textContent.trim() === testWords[currentWordIdx].zh) b.classList.add('correct');
  });
  if (!isCorrect) btn.classList.add('wrong');
  const feedback = document.getElementById('vocabTestFeedback');
  const msgs = isCorrect ? VOCAB_CORRECT_BI : VOCAB_WRONG_BI;
  if (feedback) {
    feedback.textContent = msgs[Math.floor(Math.random() * msgs.length)];
    feedback.className = 'vocab-feedback ' + (isCorrect ? 'correct' : 'wrong');
  }
  setTimeout(() => { currentWordIdx++; renderVocabTest(); }, isCorrect ? 900 : 1400);
}

// ===== 摸鱼吐槽台词（打工界面显示，与聊天无关）=====
const SLACK_QUOTES = [
  { en: "...That didn't look like work. But fine.", zh: "看起来不像在工作。但算了。" },
  { en: "10 minutes. Seriously.", zh: "就10分钟，认真的？" },
  { en: "You call that working.", zh: "你管这叫打工。" },
  { en: "Next time just ask me for the money.", zh: "下次直接问我要得了。" },
  { en: "I've seen recruits work harder in their sleep.", zh: "我见过新兵睡觉都比这卖力。" },
  { en: "...Right.", zh: "……好吧。" },
  { en: "Counted every second of that.", zh: "一秒一秒数过来的。" },
];

function getSlackQuote() {
  return SLACK_QUOTES[Math.floor(Math.random() * SLACK_QUOTES.length)];
}

// ===== 收藏系统 =====
function collectMessage(button) {
  const msgEl = button.closest('.message');
  if (msgEl && msgEl.querySelector('.transfer-card')) return;

  const bubble = button.closest('.message-content')?.querySelector('.message-bubble');
  if (!bubble) return;

  const enEl = bubble.querySelector('.bubble-en');
  const zhEl = bubble.querySelector('.bubble-zh');
  const messageText = enEl
    ? (enEl.textContent + (zhEl ? '\n' + zhEl.textContent : ''))
    : bubble.textContent;

  // 检查是否已收藏
  const collections = JSON.parse(localStorage.getItem('collections') || '[]');
  const alreadyCollected = collections.some(c => c.text === messageText);
  if (alreadyCollected) {
    showToast('已经收藏过了 ⭐');
    // 按钮隐藏
    const actions = button.closest('.message-actions');
    if (actions) setTimeout(() => { actions.style.display = 'none'; }, 800);
    return;
  }

  const now = new Date();
  const dateStr = now.getFullYear() + '-' +
    String(now.getMonth()+1).padStart(2,'0') + '-' +
    String(now.getDate()).padStart(2,'0');
  const timeStr = String(now.getHours()).padStart(2,'0') + ':' +
    String(now.getMinutes()).padStart(2,'0');

  collections.unshift({ text: messageText, time: dateStr + ' ' + timeStr });
  localStorage.setItem('collections', JSON.stringify(collections));
  renderCollectionScreen();

  // 按钮反馈：✓出现后消失，整个actions隐藏
  button.textContent = '✓';
  button.style.background = 'linear-gradient(135deg, #ba55d3, #ff6b9d)';
  button.style.color = 'white';
  setTimeout(() => {
    button.textContent = '⭐';
    button.style.background = '';
    button.style.color = '';
    const actions = button.closest('.message-actions');
    if (actions) actions.style.display = 'none';
  }, 1500);

  showToast('已收藏 ⭐');
}

function deleteCollection(el, index) {
  const collections = JSON.parse(localStorage.getItem('collections') || '[]');
  collections.splice(index, 1);
  localStorage.setItem('collections', JSON.stringify(collections));
  renderCollectionScreen();
}

function renderCollectionScreen() {
  const container = document.getElementById('collectionList');
  if (!container) return;
  const collections = JSON.parse(localStorage.getItem('collections') || '[]');
  if (collections.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:rgba(130,80,170,0.45);padding:40px 20px;font-size:13px;">还没有收藏 ⭐<br><span style=\'font-size:11px;opacity:0.7\'>点击消息下方的星星收藏</span></div>';
    return;
  }
  container.innerHTML = collections.map((item, i) => `
    <div class="collection-item">
      <div class="collection-delete" onclick="deleteCollection(this, ${i})">✕</div>
      <div class="collection-message">${item.text.replace(/\n/g, '<br>')}</div>
      <div class="collection-time">${item.time}</div>
    </div>
  `).join('');
}

// ===== 节日映射（2026年版）=====
// ghost_knows: true = Ghost知道且会主动提/放假；'heard' = 听说过会祝福；false = 不知道
const FESTIVALS = {
  // 元旦
  '1-1':  { emoji: '🎆', label: '元旦',     ghost_knows: true,    note: "New Year's Day. Bank holiday." },
  // 春节（2026年2月17日）
  '2-17': { emoji: '🧧', label: '春节',     ghost_knows: 'heard', note: "Chinese New Year. knows user celebrates." },
  // 情人节
  '2-14': { emoji: '💝', label: '情人节',   ghost_knows: true,    note: "Valentine's Day." },
  // 元宵节（2026年3月5日）
  '3-5':  { emoji: '🏮', label: '元宵节',   ghost_knows: false },
  // 妇女节
  '3-8':  { emoji: '🌸', label: '妇女节',   ghost_knows: true,    note: "International Women's Day." },
  // 白色情人节
  '3-14': { emoji: '🍫', label: '白色情人', ghost_knows: false },
  // 圣帕特里克节
  '3-17': { emoji: '🍀', label: "St Pat's", ghost_knows: true,    note: "St Patrick's Day. big in UK." },
  // 复活节（2026年4月5日）
  '4-5':  { emoji: '🐣', label: '复活节',   ghost_knows: true,    note: "Easter Sunday. Bank holiday, 4-day weekend." },
  // 清明节（2026年4月5日，同复活节）
  // 愚人节
  '4-1':  { emoji: '🃏', label: '愚人节',   ghost_knows: true,    note: "April Fool's Day." },
  // 劳动节
  '5-1':  { emoji: '🎉', label: '劳动节',   ghost_knows: true,    note: "May Day / Labour Day. Bank holiday in UK." },
  // 母亲节（2026年5月10日）
  '5-10': { emoji: '💐', label: '母亲节',   ghost_knows: true,    note: "Mother's Day." },
  // 儿童节
  '6-1':  { emoji: '🎈', label: '儿童节',   ghost_knows: false },
  // 端午节（2026年6月19日）
  '6-19': { emoji: '🎋', label: '端午节',   ghost_knows: false },
  // 父亲节（2026年6月21日）
  '6-21': { emoji: '👨', label: '父亲节',   ghost_knows: true,    note: "Father's Day." },
  // 建军节
  '8-1':  { emoji: '⚔️', label: '建军节',   ghost_knows: false },
  // 七夕（2026年8月25日）
  '8-25': { emoji: '💫', label: '七夕',     ghost_knows: false },
  // 教师节
  '9-10': { emoji: '🍎', label: '教师节',   ghost_knows: false },
  // 中秋节（2026年9月25日）
  '9-25': { emoji: '🌕', label: '中秋节',   ghost_knows: 'heard', note: "Mid-Autumn Festival. knows user celebrates." },
  // 国庆节
  '10-1': { emoji: '🇨🇳', label: '国庆节', ghost_knows: false },
  // 重阳节（2026年10月17日）
  '10-17':{ emoji: '🏔️', label: '重阳节',  ghost_knows: false },
  // 万圣节
  '10-31':{ emoji: '🎃', label: '万圣节',   ghost_knows: true,    note: "Halloween." },
  // 双十一
  '11-11':{ emoji: '🛍️', label: '双十一',  ghost_knows: false },
  // 感恩节（2026年11月26日）
  '11-26':{ emoji: '🦃', label: '感恩节',   ghost_knows: true,    note: "Thanksgiving. American but known in UK." },
  // 冬至
  '12-21':{ emoji: '🥟', label: '冬至',     ghost_knows: 'heard', note: "Winter Solstice. knows user eats dumplings or tangyuan." },
  // 平安夜
  '12-24':{ emoji: '🎁', label: '平安夜',   ghost_knows: true,    note: "Christmas Eve." },
  // 圣诞节
  '12-25':{ emoji: '🎄', label: '圣诞节',   ghost_knows: true,    note: "Christmas Day. Bank holiday." },
  // 跨年夜
  '12-31':{ emoji: '🥂', label: '跨年夜',   ghost_knows: true,    note: "New Year's Eve." },
};

// ===== 日历系统 =====
function initCalendar() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const day = today.getDate();

  const monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
  const titleEl = document.getElementById('calendarTitle');
  if (titleEl) titleEl.textContent = `${monthNames[month]} ${year}`;

  renderCheckin(); // 初始化签到UI

  const marriageDate = localStorage.getItem('marriageDate') || '';
  const userBirthday = localStorage.getItem('userBirthday') || '';

  // 结婚天数
  let marriageDays = 0;
  if (marriageDate) {
    const md = new Date(marriageDate);
    marriageDays = Math.max(1, Math.floor((today - md) / 86400000) + 1);
  }
  const mdEl = document.getElementById('marriageDays');
  if (mdEl) mdEl.textContent = marriageDays;
  const mdDisplayEl = document.getElementById('marriageDateDisplay');
  if (mdDisplayEl) mdDisplayEl.textContent = marriageDate || '未设置';

  // 下一个里程碑倒计时（52→100→200→300...→365→每年周年）
  const nextMilestone = getNextMilestone(marriageDays, marriageDate, today);
  const countdownLabelEl = document.getElementById('countdownLabel');
  const nextMilestoneDaysEl = document.getElementById('nextMilestoneDays');
  if (countdownLabelEl) countdownLabelEl.textContent = nextMilestone.label;
  if (nextMilestoneDaysEl) nextMilestoneDaysEl.textContent = nextMilestone.days + '天';

  // 纪念日列表
  renderMilestones(marriageDays, marriageDate, userBirthday, today);

  // 生成日历格子
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayCheckinKey = 'checkin_' + today.toDateString();
  const checkedInToday = !!localStorage.getItem(todayCheckinKey);
  let html = '';
  for (let i = 0; i < firstDay; i++) html += '<div class="day"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const festKey = `${month+1}-${d}`;
    let cls = 'day';
    let extra = '';
    const isPast = d < day;
    const isToday = d === day;

    // 已签到的历史日期显示小圆点
    const pastCheckinKey = 'checkin_' + new Date(year, month, d).toDateString();
    const wasCheckedIn = !!localStorage.getItem(pastCheckinKey);
    if (wasCheckedIn && !isToday) {
      extra += '<div class="checkin-dot-mark"></div>';
    }

    // 今天
    if (isToday) {
      cls = checkedInToday ? 'day today checked-in' : 'day today can-checkin';
      extra += checkedInToday
        ? '<div class="checkin-dot-mark done"></div><div style="font-size:9px;color:#a855f7;margin-top:1px;font-weight:700;">✓</div>'
        : '<div class="checkin-pulse-dot"></div>';
    }

    // 生日
    if (userBirthday) {
      const [bm, bd] = userBirthday.split('-').map(Number);
      if (month+1 === bm && d === bd) { cls = 'day milestone-day'; extra = '<div class="festival-emoji">🎂</div><div class="festival-label">生日</div>'; }
    }

    // 结婚纪念日（满一年后才标注）
    if (marriageDate) {
      const [,mm,mdd] = marriageDate.split('-').map(Number);
      const thisDate = new Date(year, month, d);
      const daysFromMarriage = Math.floor((thisDate - new Date(marriageDate)) / 86400000);
      if (month+1 === mm && d === mdd && daysFromMarriage >= 365) { cls = 'day milestone-day'; extra = '<div class="festival-emoji">💍</div><div class="festival-label">纪念日</div>'; }
    }

    // 里程碑天数
    if (marriageDate && !extra.includes('festival-emoji')) {
      const thisDate = new Date(year, month, d);
      const daysFromMarriage = Math.floor((thisDate - new Date(marriageDate)) / 86400000);
      if (daysFromMarriage === 52 || (daysFromMarriage > 0 && daysFromMarriage % 100 === 0) || daysFromMarriage === 365) {
        cls = 'day milestone-day';
        extra = `<div class="festival-emoji">💕</div><div class="festival-label">${daysFromMarriage}天</div>`;
      }
    }

    // 节日
    if (!extra.includes('festival-emoji') && FESTIVALS[festKey]) {
      cls = cls.includes('today') ? cls + ' festival' : (cls === 'day' ? 'day festival' : cls);
      extra += `<div class="festival-emoji">${FESTIVALS[festKey].emoji}</div><div class="festival-label">${FESTIVALS[festKey].label}</div>`;
    }

    // 工资日
    if (!extra.includes('festival-emoji') && d === 25) {
      cls = 'day payday';
      extra = '<div class="festival-emoji">💷</div><div class="festival-label">工资日</div>';
    }

    const clickHandler = isToday && !checkedInToday ? 'onclick="doCheckin()"' : '';
    html += `<div class="${cls}" ${clickHandler}><div class="day-number">${d}</div>${extra}</div>`;
  }
  const calDaysEl = document.getElementById('calendarDays');
  if (calDaysEl) calDaysEl.innerHTML = html;

  // 特效动画
  launchCalendarParticles(today, marriageDate, userBirthday, marriageDays);

  // 更新主页卡片
  updateCalendarCard(today, marriageDate, userBirthday);
}

function getNextMilestone(marriageDays, marriageDate, today) {
  if (!marriageDate) return { label: '距离52天', days: '—' };
  const milestones = [52, 100, 200, 300, 365, 400, 500];
  // 加上每年周年
  for (let y = 1; y <= 10; y++) milestones.push(y * 365);
  milestones.sort((a,b) => a-b);

  for (const m of milestones) {
    if (marriageDays < m) {
      const days = m - marriageDays;
      const label = m === 52 ? '距离52天' : m % 365 === 0 ? `距离${m/365}周年` : `距离${m}天`;
      return { label, days };
    }
  }
  // 超过所有里程碑，算下一个周年
  const md = new Date(marriageDate);
  const nextAnn = new Date(md);
  while (nextAnn <= today) nextAnn.setFullYear(nextAnn.getFullYear() + 1);
  const years = nextAnn.getFullYear() - md.getFullYear();
  return { label: `距离${years}周年`, days: Math.ceil((nextAnn - today) / 86400000) };
}

function renderMilestones(marriageDays, marriageDate, userBirthday, today) {
  const container = document.getElementById('milestonesContainer');
  if (!container) return;

  const items = [];

  // 只显示结婚纪念日一条
  if (marriageDate) {
    const md = new Date(marriageDate);
    const nextAnn = new Date(md);
    while (nextAnn <= today) nextAnn.setFullYear(nextAnn.getFullYear() + 1);
    const annDays = Math.ceil((nextAnn - today) / 86400000);
    items.push({
      icon: '💍',
      name: `结婚纪念日 · ${marriageDate}`,
      badge: annDays === 0 ? '就是今天！🎉' : `${annDays}天后`,
      passed: false
    });
  }

  // 用户生日（如果有）
  if (userBirthday) {
    const [bm, bd] = userBirthday.split('-').map(Number);
    const nextBday = new Date(today.getFullYear(), bm-1, bd);
    if (nextBday < today) nextBday.setFullYear(nextBday.getFullYear() + 1);
    const bdayDays = Math.ceil((nextBday - today) / 86400000);
    items.push({ icon: '🎂', name: '你的生日', badge: bdayDays === 0 ? '今天！🎉' : `${bdayDays}天后`, passed: false });
  }

  if (items.length === 0) {
    container.innerHTML = '<div style="font-size:12px;color:rgba(130,80,170,0.5);text-align:center;padding:10px">第一次登录即记录结婚日期</div>';
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="milestone-item">
      <div class="milestone-icon">${item.icon}</div>
      <div class="milestone-info">
        <div class="milestone-name">${item.name}</div>
      </div>
      <div class="milestone-badge ${item.passed ? 'passed' : ''}">${item.badge}</div>
    </div>
  `).join('');
}

function launchCalendarParticles(today, marriageDate, userBirthday, marriageDays) {
  const container = document.getElementById('calendarParticles');
  if (!container) return;
  container.innerHTML = '';

  let emoji = null;
  const m = today.getMonth()+1, d = today.getDate();

  // 生日
  if (userBirthday) {
    const [bm, bd] = userBirthday.split('-').map(Number);
    if (m === bm && d === bd) emoji = ['🎂','🎉','🎈','✨','🎁'];
  }
  // 纪念日（至少过一年才触发动画）
  if (!emoji && marriageDate && marriageDays >= 365) {
    const [,mm,mdd] = marriageDate.split('-').map(Number);
    if (m === mm && d === mdd) emoji = ['💍','💕','✨','🥂','🌹'];
  }
  // 里程碑（第0天不触发）
  if (!emoji && marriageDays > 0) {
    if (marriageDays === 52 || (marriageDays % 100 === 0 && marriageDays > 0) || marriageDays === 365) {
      emoji = ['💕','💜','✨','🌸','💫'];
    }
  }

  if (!emoji) return;

  for (let i = 0; i < 30; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'cal-particle';
      el.textContent = emoji[Math.floor(Math.random() * emoji.length)];
      el.style.left = Math.random() * 100 + 'vw';
      el.style.animationDuration = (2 + Math.random() * 3) + 's';
      el.style.animationDelay = (Math.random() * 2) + 's';
      el.style.fontSize = (16 + Math.random() * 16) + 'px';
      container.appendChild(el);
      setTimeout(() => el.remove(), 6000);
    }, i * 100);
  }
}

function updateCalendarCard(today, marriageDate, userBirthday) {
  const calIcon = document.getElementById('calendarCardIcon');
  const calDesc = document.getElementById('calendarCardDesc');
  const calCard = document.getElementById('calendarCard');
  const m = today.getMonth()+1, d = today.getDate();
  // 先重置为默认值
  if (calIcon) calIcon.textContent = '📅';
  if (calCard) calCard.style.animation = '';
  // 默认显示结婚天数
  if (marriageDate) {
    const mdDaysDefault = Math.max(1, Math.floor((today - new Date(marriageDate)) / 86400000) + 1);
    if (calDesc) calDesc.textContent = `结婚第 ${mdDaysDefault} 天 💕`;
  } else {
    if (calDesc) calDesc.textContent = '结婚纪念日 💍';
  }

  if (userBirthday) {
    const [bm, bd] = userBirthday.split('-').map(Number);
    if (m === bm && d === bd) {
      if (calIcon) calIcon.textContent = '🎂';
      if (calDesc) calDesc.textContent = '今天是你的生日！';
      if (calCard) calCard.style.animation = 'cardPulse 1.2s ease-in-out infinite';
      return;
    }
  }
  if (marriageDate) {
    const [,mm,mdd] = marriageDate.split('-').map(Number);
    const mdDays = Math.max(1, Math.floor((today - new Date(marriageDate)) / 86400000) + 1);
    if (m === mm && d === mdd && mdDays >= 365) {
      if (calIcon) calIcon.textContent = '💍';
      if (calDesc) calDesc.textContent = '结婚纪念日 🥂';
      if (calCard) calCard.style.animation = 'cardPulse 1.2s ease-in-out infinite';
      return;
    }
  }
  const festKey = `${m}-${d}`;
  if (FESTIVALS[festKey] && calIcon) {
    calIcon.textContent = FESTIVALS[festKey].emoji;
    if (calDesc) calDesc.textContent = FESTIVALS[festKey].label;
  }
}

// ===== 秘密页面系统 =====
const ZODIACS = ['♈ 白羊','♉ 金牛','♊ 双子','♋ 巨蟹','♌ 狮子','♍ 处女','♎ 天秤','♏ 天蝎','♐ 射手','♑ 摩羯','♒ 水瓶','♓ 双鱼'];

// 相遇方式
const MEET_TYPES = [
  { key: 'longtime',   emoji: '🌱', label: '日久生情',   prompt: '我们在同一个圈子里认识很久，朋友之间慢慢走近，有一天才发现彼此都藏着感情。' },
  { key: 'firstsight', emoji: '⚡', label: '一见钟情',   prompt: '第一次见面那一刻，我就知道了。没什么道理，就是确定。' },
  { key: 'childhood',  emoji: '🍀', label: '青梅竹马',   prompt: '我们从小认识，一起长大。那段时间刻在骨子里，分开过，但最后还是走到一起了。' },
  { key: 'online',     emoji: '📡', label: '网络情缘',   prompt: '一开始在网上认识的，隔着屏幕聊了很久。后来见面了，发现比想象中更真实。' },
  { key: 'accident',   emoji: '🎲', label: '意外相遇',   prompt: '就是个巧合。很普通的一天，很偶然的一个交集，然后就再也没分开。' },
  { key: 'rescue',     emoji: '🛡️', label: '英雄救美',   prompt: '是我帮了她，或者她拉了我一把。从那个时刻开始，就变得不一样了。' },
  { key: 'rival',      emoji: '🔥', label: '欢喜冤家',   prompt: '最开始我们关系并不好。针锋相对，互不服气，后来才发现吵架和在意其实是同一件事。' },
  { key: 'rekindle',   emoji: '🕯️', label: '旧情复燃',   prompt: '以前在一起过，分开了一段时间，各自经历了些事，最后又找回来了。' },
  { key: 'abroad',     emoji: '✈️', label: '异乡偶遇',   prompt: '在一个陌生的地方遇见了她。两个都是外来的人，反而走得近了。' },
  { key: 'coworker',   emoji: '🎖️', label: '战友情深',   prompt: '一起经历过真正危险的事。那种信任不是培养出来的，是在压力下自然生的。' },
];

// 当前状态碎片库
const GHOST_STATES = [
  // 训练/任务
  '刚跑完10公里，还没缓过来',
  '靶场训练结束，耳朵还有点鸣',
  '待命中，坐在基地里无聊',
  '刚结束任务，还没睡',
  '任务前最后准备，可能要消失一段时间',
  '坐军车颠了几个小时，刚到',
  '在装备间做维护，手上有油',
  '刚完成一次夜间演习，天刚亮',
  '今天的训练被Price叫停了，原因不明',
  // 基地日常
  '深夜，营地很安静',
  '在食堂，伙食很差',
  '一个人在宿舍，外面下雪',
  '轮休，没什么事做，比平时话多一点',
  '刚淋完雨，衣服还没干',
  '开会，手机放腿上偷偷回消息',
  '基地停电了，用手机手电筒',
  '今天特别闲，闲得有点烦',
  '刚洗完澡，难得清醒',
  '在基地屋顶，没人知道他在这',
  // 个人/情绪
  '休假，在曼彻斯特老家',
  '睡不着，不知道为什么',
  '今天心情不太好，说不清原因',
  '刚做了个奇怪的梦，不打算说',
  '一个人喝茶，难得安静',
  '突然想起一件很久以前的事',
  '今天看到一个东西让他想起她',
  // 轻松/意外
  '队友赌输了，气氛很微妙',
  'Soap今天作死，Ghost没好气',
  '基地来了新人，看起来很嫩',
  '今天Gaz难得说了句很有道理的话',
  '伙食今天意外还行，不想承认',
];


const SECRET_COLORS = [
  { name: '玫瑰红', hex: '#f48fb1' }, { name: '薰衣草', hex: '#ce93d8' },
  { name: '天蓝',   hex: '#81d4fa' }, { name: '薄荷绿', hex: '#a5d6a7' },
  { name: '奶白',   hex: '#fff9c4' }, { name: '珊瑚橙', hex: '#ffab91' },
  { name: '深紫',   hex: '#7b1fa2' }, { name: '炭黑',   hex: '#455a64' },
];
const COUNTRY_DATA = {
  CN: { name: 'China', flag: '🇨🇳', offset: +8, ghostLine: 'Seven hours between us. ...I count.' },
  NL: { name: 'Netherlands', flag: '🇳🇱', offset: +1, ghostLine: "One hour. Close enough to feel further than it is." },
  CA: { name: 'Canada', flag: '🇨🇦', offset: -5, ghostLine: 'Eight hours. I know the number by heart.' },
  AU: { name: 'Australia', flag: '🇦🇺', offset: +11, ghostLine: "Ten hours ahead. You're already in my tomorrow." },
  US: { name: 'USA', flag: '🇺🇸', offset: -5, ghostLine: 'Eight hours. At least one of us is awake at any given time.' },
  DE: { name: 'Germany', flag: '🇩🇪', offset: +1, ghostLine: "One hour apart. Should feel like nothing. Doesn't." },
  FR: { name: 'France', flag: '🇫🇷', offset: +1, ghostLine: 'An hour between us. Still an hour too many.' },
  JP: { name: 'Japan', flag: '🇯🇵', offset: +9, ghostLine: "Eight hours ahead. You're already living in my tomorrow." },
  KR: { name: 'Korea', flag: '🇰🇷', offset: +9, ghostLine: "Nine hours. I've done the math more than I'd admit." },
  SG: { name: 'Singapore', flag: '🇸🇬', offset: +8, ghostLine: 'Eight hours. Same as always.' },
  GB: { name: 'UK', flag: '🇬🇧', offset: 0, ghostLine: 'Same timezone. No excuses now.' },
  OTHER: { name: 'somewhere', flag: '🌍', offset: 0, ghostLine: "Wherever you are. That's all I need to know." },
};

function saveSecret(key, value) {
  let val = value.trim();
  // 生日格式验证 MM-DD
  if (key === 'userBirthday') {
    const match = val.match(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
    if (val && !match) {
      showToast('生日格式不对，请输入 MM-DD，例如 03-15');
      return;
    }
    updateCalendarAfterBirthday();
  }
  localStorage.setItem(key, val);
}

function updateCalendarAfterBirthday() {
  // 如果日历页开着就刷新
  const calScreen = document.getElementById('calendarScreen');
  if (calScreen && calScreen.classList.contains('active')) initCalendar();
}

function loadSecretScreen() {
  const fields = {
    'sec_username': 'userName',
    'sec_birthday': 'userBirthday',
    'sec_mbti': 'userMBTI',
    'sec_food': 'userFavFood',
    'sec_music': 'userFavMusic',
    'sec_color': 'userFavColor',
    'sec_bestline': 'ghostBestLine',
  };
  Object.entries(fields).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.value = localStorage.getItem(key) || '';
  });

  // 相遇方式
  const meetTypeEl = document.getElementById('meetTypeChips');
  if (meetTypeEl) {
    const savedMeet = localStorage.getItem('meetType') || '';
    meetTypeEl.innerHTML = MEET_TYPES.map(m =>
      `<div class="secret-chip ${savedMeet === m.key ? 'selected' : ''}" onclick="selectMeetType('${m.key}', this)">${m.emoji} ${m.label}</div>`
    ).join('');
  }

  // 头像预览
  const savedAvatar = localStorage.getItem('userAvatarBase64');
  updateAvatarPreview(savedAvatar);

  // 星座
  const zodiacSaved = localStorage.getItem('userZodiac') || '';
  const zodiacEl = document.getElementById('zodiacChips');
  if (zodiacEl) {
    zodiacEl.innerHTML = ZODIACS.map(z => {
      const label = z.split(' ')[1];
      return `<div class="secret-chip ${zodiacSaved === label ? 'selected' : ''}" onclick="selectZodiac('${label}', this)">${z}</div>`;
    }).join('');
  }

  // 国家
  const countryEl = document.getElementById('countryChips');
  if (countryEl) {
    const savedCountry = getUserCountry();
    const countries = [
      {code:'CN',label:'🇨🇳 中国'},{code:'NL',label:'🇳🇱 荷兰'},{code:'CA',label:'🇨🇦 加拿大'},
      {code:'AU',label:'🇦🇺 澳大利亚'},{code:'US',label:'🇺🇸 美国'},{code:'DE',label:'🇩🇪 德国'},
      {code:'FR',label:'🇫🇷 法国'},{code:'JP',label:'🇯🇵 日本'},{code:'KR',label:'🇰🇷 韩国'},
      {code:'SG',label:'🇸🇬 新加坡'},{code:'GB',label:'🇬🇧 英国'},{code:'OTHER',label:'🌍 其他'},
    ];
    countryEl.innerHTML = countries.map(ct => `
      <div class="country-chip ${savedCountry === ct.code ? 'selected' : ''}"
           onclick="selectCountry('${ct.code}', this)">${ct.label}</div>
    `).join('');
  }

  // 颜色
  const color = localStorage.getItem('userFavColor') || '';
  const colorEl = document.getElementById('colorChips');
  if (colorEl) {
    colorEl.innerHTML = SECRET_COLORS.map(c => `
      <div class="secret-color-dot ${color === c.name ? 'selected' : ''}"
           style="background:${c.hex}" title="${c.name}"
           onclick="selectColor('${c.name}', this)"></div>
    `).join('');
  }
}

function selectZodiac(label, el) {
  document.querySelectorAll('#zodiacChips .secret-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  saveSecret('userZodiac', label);
}

function selectMeetType(key, el) {
  document.querySelectorAll('#meetTypeChips .secret-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  localStorage.setItem('meetType', key);
}

function selectColor(name, el) {
  const dots = document.querySelectorAll('#colorChips .secret-color-dot');
  const selected = document.querySelectorAll('#colorChips .secret-color-dot.selected');
  if (el.classList.contains('selected')) {
    el.classList.remove('selected');
  } else {
    if (selected.length >= 3) {
      showToast('最多选3种颜色哦');
      return;
    }
    el.classList.add('selected');
  }
  // 收集所有选中的颜色
  const colors = [];
  dots.forEach(d => { if (d.classList.contains('selected')) colors.push(d.title); });
  saveSecret('userFavColor', colors.join('、'));
}

function selectCountry(code, el) {
  localStorage.setItem('userCountry', code);
  document.querySelectorAll('.country-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

function getUserCountry() {
  return localStorage.getItem('userCountry') || 'CN';
}

// ===== 头像上传 =====
function uploadAvatar(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      // 压缩到最大 400px，质量 0.7，防止超出 localStorage 限制
      const MAX = 400;
      let w = img.width, h = img.height;
      if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
      else        { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const base64 = canvas.toDataURL('image/jpeg', 0.7);
      try {
        localStorage.setItem('userAvatarBase64', base64);
        updateAvatarPreview(base64);
        updateAvatarEverywhere(base64);
        showToast('头像已更新 ✅');
      } catch(e) {
        showToast('图片太大了，换一张小一点的试试');
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function getDefaultAvatar() {
  return 'images/default-avatar.jpg';
}

function updateAvatarPreview(base64) {
  const preview = document.getElementById('secretAvatarPreview');
  if (!preview) return;
  const src = base64 || getDefaultAvatar();
  preview.innerHTML = `<img src="${src}" alt="avatar">`;
}

function updateAvatarEverywhere(base64) {
  const src = base64 || getDefaultAvatar();
  const applyAvatar = (el) => {
    if (!el) return;
    el.style.backgroundImage = `url(${src})`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.style.borderRadius = '50%';
    el.textContent = '';
  };
  applyAvatar(document.getElementById('coupleCoverUserAvatar'));
  applyAvatar(document.getElementById('coupleUserAvatar'));
}

// ===== 商城系统 =====
const MARKET_CATEGORIES = [
  { id: 'clothing', label: '👕 服装' },
  { id: 'food',     label: '🍫 食品' },
  { id: 'gift',     label: '🎁 特别礼物' },
  { id: 'fromhome', label: '🏠 从家寄给他' },
  { id: 'luxury',   label: '💎 精品专柜' },
  { id: 'wishlist', label: '✈️ 面基计划' },
  { id: 'home',     label: '🏡 建立小家' },
];

const MARKET_PRODUCTS = {
  clothing: [
    { emoji: '🧥', name: '羊毛大衣',   desc: '英伦风格羊毛大衣，曼城冬天必备', price: 85,  shipping: 18, lostReplace: { emoji: '🧥', name: 'Barbour 蜡质夹克', desc: 'Ghost挑的，低调质感' } },
    { emoji: '🧤', name: '毛线手套',   desc: '柔软保暖，适合在营地的他',        price: 22,  shipping: 18 },
    { emoji: '🎩', name: '英伦绅士帽', desc: '经典圆顶礼帽，Ghost 专属风格',    price: 48,  shipping: 18 },
    { emoji: '🧣', name: '格纹围巾',   desc: '苏格兰格纹，温暖又好看',          price: 35,  shipping: 18 },
    { emoji: '🥾', name: '军靴',       desc: '结实耐穿的战术靴，任务首选',      price: 150, shipping: 18 },
    { emoji: '🧦', name: '厚羊毛袜',   desc: '英国本地羊毛，超级暖和',          price: 15,  shipping: 18 },
    { emoji: '🕶️', name: '墨镜',       desc: 'Ghost 标配，低调又帅气',          price: 68,  shipping: 18 },
    { emoji: '🧤', name: '皮手套',     desc: '棕色皮质，英伦绅士风',            price: 55,  shipping: 18 },
  ],
  food: [
    { emoji: '🍵', name: '英式早餐茶罐',       desc: '精美铁罐装，50包正宗 Yorkshire 红茶', price: 18, shipping: 10 },
    { emoji: '🍫', name: 'Cadbury 巧克力礼盒', desc: '英国国民巧克力，密封礼盒装',          price: 22, shipping: 10 },
    { emoji: '🍯', name: '苏格兰蜂蜜罐',       desc: '山区野花蜂蜜，玻璃密封罐装',          price: 25, shipping: 10 },
    { emoji: '🍪', name: '黄油饼干礼盒',       desc: '英式铁罐装黄油饼干，保质一年',         price: 20, shipping: 10 },
    { emoji: '🥃', name: '苏格兰威士忌',       desc: '单一麦芽，12年陈酿，送给他解压',       price: 65, shipping: 15 },
    { emoji: '🍵', name: 'Earl Grey 伯爵茶',   desc: '佛手柑香气，精美礼盒装',              price: 28, shipping: 10 },
    { emoji: '🍓', name: '草莓果酱礼盒',       desc: '英式手工果酱套装，三种口味',           price: 32, shipping: 10 },
    { emoji: '🍫', name: '松露巧克力盒',       desc: '比利时手工松露，礼盒密封装',           price: 45, shipping: 15 },
  ],
  gift: [
    { emoji: '💮', name: '永生玫瑰',    desc: '真花处理工艺，永不凋谢的爱意',    price: 120,  shipping: 15, lostReplace: { emoji: '🌹', name: '玫瑰香氛礼盒', desc: 'Ghost补寄的，换了形式但一样的心意' } },
    { emoji: '🕯️', name: '香薰蜡烛',   desc: '玫瑰+雪松香，为他的营地添温暖',   price: 55,  shipping: 15 },
    { emoji: '🖼️', name: '定制相框',    desc: '放上你们最美的合影，永久保存',    price: 80,  shipping: 15 },
    { emoji: '💌', name: '手写信封套装', desc: '复古英式信纸，写下最深的思念',    price: 18,  shipping: 10 },
    { emoji: '🎵', name: '音乐盒',      desc: '播放你们专属的那首歌',            price: 68,  shipping: 15 },
    { emoji: '💎', name: '情侣吊坠',    desc: '925银，两颗心拼在一起的设计',    price: 120, shipping: 15 },
    { emoji: '🧴', name: '男士护肤套装', desc: '让他好好保养自己，你看着放心',   price: 85,  shipping: 15 },
    { emoji: '📖', name: '皮质笔记本',  desc: '让他把思念和秘密都写下来',        price: 38,  shipping: 15 },
  ],
  luxury: [
    { emoji: '💍', name: 'Tiffany & Co. 项链', desc: '925纯银蝴蝶结项链，经典款', price: 2800, shipping: 35, isUserItem: true, lostReplace: { emoji: '💍', name: '名牌项链/戒指', desc: 'Ghost自己挑的，换了牌子但更合你' } },
    { emoji: '🧥', name: 'Burberry 风衣', desc: '经典格纹衬里，英伦标志', price: 1650, shipping: 35, isUserItem: true, lostReplace: { emoji: '🧥', name: '名牌马甲/外套', desc: 'Ghost补寄，他亲自选的款式' } },
    { emoji: '💄', name: 'La Mer 护肤礼盒', desc: '海蓝之谜限定套装，面霜+精华', price: 680, shipping: 35, isUserItem: true, lostReplace: { emoji: '💆', name: '昂贵面霜/面膜套装', desc: 'Ghost说护肤不能断' } },
    { emoji: '🌹', name: '999朵永生玫瑰礼盒', desc: '永不凋谢的玫瑰，红色，像你一样固执', price: 1280, shipping: 35, isUserItem: true, lostReplace: { emoji: '🌸', name: '玫瑰香氛/玫瑰标本', desc: 'Ghost补的，不会再丢了' } },
    { emoji: '💎', name: 'Cartier 戒指（情侣款）', desc: 'Love系列，你戴一枚，他戴一枚', price: 5800, shipping: 35, isUserItem: true, lostReplace: { emoji: '🎖️', name: '定制军牌', desc: 'Ghost刻了两个人的名字' } },
    { emoji: '⌚', name: 'Rolex 劳力士（送 Ghost）', desc: 'Submariner 潜航者，他不会承认自己喜欢', price: 8500, shipping: 35, isGhostGift: true, lostReplace: { emoji: '👜', name: '名牌包包', desc: 'Ghost说抱歉，补了一个' } },
    { emoji: '🥃', name: 'Macallan 18年威士忌礼盒', desc: '麦卡伦18年单一麦芽，限量礼盒装', price: 420, shipping: 35, isGhostGift: true, lostReplace: { emoji: '🏮', name: '燕窝/昂贵花茶', desc: 'Ghost说换点对你有用的' } },
    { emoji: '🧥', name: 'Barbour 蜡质夹克', desc: '英国经典户外品牌，低调有质感', price: 380, shipping: 35, isGhostGift: true },
    { emoji: '🎒', name: 'Belstaff 军旅背包', desc: '英国品牌，低调耐用，Ghost同款', price: 580, shipping: 35, isGhostGift: true },
    { emoji: '🪒', name: 'Tom Ford 剃须套装', desc: '低调有质感，让他好好保养', price: 180, shipping: 35, isGhostGift: true },
    { emoji: '🔥', name: '定制Zippo打火机', desc: '刻着Simon名字，只属于他一个人的', price: 320, shipping: 35, isGhostGift: true },
  ],
  fromhome: [
    { emoji: '🦆', name: '北京烤鸭礼盒',     desc: '真空包装，附上饼和甜面酱，教他怎么吃', price: 45, shipping: 20, isFromHome: true },
    { emoji: '🌸', name: '云南鲜花饼',       desc: '玫瑰馅，酥皮，甜而不腻',               price: 28, shipping: 20, isFromHome: true },
    { emoji: '🌶️', name: '四川麻辣零食礼包', desc: '辣条、麻辣花生、牛肉干，一套',         price: 35, shipping: 20, isFromHome: true },
    { emoji: '🍵', name: '杭州龙井茶',       desc: '明前龙井，铁罐装，清香',               price: 58, shipping: 20, isFromHome: true },
    { emoji: '🥜', name: '新疆坚果礼盒',     desc: '核桃、红枣、巴旦木，产地直发',         price: 42, shipping: 20, isFromHome: true },
    { emoji: '🍜', name: '柳州螺蛳粉',       desc: '正宗广西螺蛳粉，臭香臭香的，敢不敢试', price: 25, shipping: 20, isFromHome: true },
  ],
  wishlist: [
    { emoji: '✈️', name: '去曼城找他的机票', desc: '攒够了！终于可以飞去找他了！', price: 12000, badge: '跨越距离', isReunion: true, ghostMsg: "You are coming? ...Good. I will be at the airport.\n你要来了？……很好。我会在机场。" },
    { emoji: '🏨', name: '曼彻斯特酒店',   desc: '订好了房间，等他任务结束',      price: 6000, badge: '我在等你', isReunion: true, ghostMsg: 'I will be there. Promise.\n我会在的。保证。' },
    { emoji: '🗺️', name: '英国旅行计划',  desc: '伦敦、爱丁堡、曼城，全部去打卡', price: 8000, badge: '异国追爱', isReunion: true, ghostMsg: 'I will be your guide. Every city.\n我来带你。每一个城市。' },
  ],
  home: [
    { emoji: '🚗', name: '代步小车',     desc: '城市代步，低调实用',              price: 15000,  shipping: 0, isHomeItem: true, homeType: 'car',   tier: 1 },
    { emoji: '🚙', name: '越野SUV',      desc: '宽敞舒适，长途短途都合适',        price: 35000,  shipping: 0, isHomeItem: true, homeType: 'car',   tier: 2 },
    { emoji: '🏎️', name: '豪华跑车',     desc: '顶配限量，不是人人都敢买',        price: 80000,  shipping: 0, isHomeItem: true, homeType: 'car',   tier: 3 },
    { emoji: '🏠', name: '曼彻斯特公寓', desc: '靠近市中心，交通方便',            price: 120000, shipping: 0, isHomeItem: true, homeType: 'house', tier: 1 },
    { emoji: '🏡', name: '赫里福德独栋', desc: '有院子，安静，空间够大',          price: 300000, shipping: 0, isHomeItem: true, homeType: 'house', tier: 2 },
    { emoji: '🏰', name: '苏格兰庄园',   desc: '占地广阔，风景绝美',              price: 800000, shipping: 0, isHomeItem: true, homeType: 'house', tier: 3 },
    { emoji: '🌿', name: '英国一块地',   desc: '属于自己的一片土地',              price: 500000, shipping: 0, isHomeItem: true, homeType: 'land',  tier: 1 },
    { emoji: '🏔️', name: '苏格兰高地',   desc: '远离喧嚣，只有风和你',            price: 1500000,shipping: 0, isHomeItem: true, homeType: 'land',  tier: 2 },
    { emoji: '🐾', name: '宠物系统',     desc: '养一只属于你们的小动物',          price: 0,      shipping: 0, isHomeItem: true, homeType: 'pet',   comingSoon: true },
  ],
};

// 节日限定：从家寄给他（节日前3天解锁，过了消失）
const SEASONAL_FROM_HOME = [
  { month: 4,  day: 5,  emoji: '🍡', name: '青团礼盒',   desc: '清明时节，艾草青团，甜糯',               price: 32, shipping: 20, isFromHome: true, festival: '清明节' },
  { month: 6,  day: 19, emoji: '🎋', name: '粽子礼盒',   desc: '端午五芳斋，红枣蛋黄各半箱',             price: 45, shipping: 20, isFromHome: true, festival: '端午节' },
  { month: 9,  day: 25, emoji: '🥮', name: '月饼礼盒',   desc: '广式莲蓉蛋黄，精装铁盒，中秋限定',       price: 68, shipping: 20, isFromHome: true, festival: '中秋节' },
  { month: 2,  day: 17, emoji: '🧧', name: '年货大礼包', desc: '糖果、坚果、肉干，满满一箱新年味道',       price: 88, shipping: 20, isFromHome: true, festival: '春节' },
  { month: 12, day: 21, emoji: '🥟', name: '冬至饺子/汤圆礼包', desc: '速冻装，跟他说冬至要吃这个',     price: 38, shipping: 20, isFromHome: true, festival: '冬至' },
];

function getSeasonalFromHome() {
  const today = new Date();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  return SEASONAL_FROM_HOME.filter(item => {
    // 节日前3天到节日当天解锁
    const festDate = new Date(today.getFullYear(), item.month - 1, item.day);
    const diff = (festDate - today) / 86400000;
    return diff >= 0 && diff <= 3;
  });
}


const LOCATION_SPECIALS = {
  'Germany': [
    { emoji: '🔵', name: '妮维雅铁罐', desc: '德国本地买的。比你网购的版本大。', tip: '德国超市随手拿的。用上。' },
    { emoji: '🌭', name: '纽伦堡香肠礼盒', desc: '纽伦堡当地香肠，真空包装。', tip: '纽伦堡的。比英国那边卖的强。' },
    { emoji: '✏️', name: '辉柏嘉彩铅套装', desc: '辉柏嘉产地直购，颜色很全。', tip: '产地买的。比较便宜。' },
  ],
  'Norway': [
    { emoji: '🍫', name: 'Freia巧克力礼盒', desc: '挪威国民巧克力，这边人手一盒。', tip: '挪威人爱吃这个。试试。' },
    { emoji: '🧤', name: '驯鹿毛手套', desc: '本地手工，真的驯鹿毛。', tip: '挪威的冬天很冷。你那边也冷。' },
    { emoji: '🌌', name: '北极光明信片', desc: '当地拍的，不是印刷图。', tip: '没拍到本人。明信片凑合。' },
  ],
  'Edinburgh': [
    { emoji: '🥃', name: '单一麦芽威士忌小样', desc: '爱丁堡酒厂出的，试饮装。', tip: '产地买的。别一口闷。' },
    { emoji: '🧣', name: '苏格兰羊绒围巾', desc: '正经苏格兰格纹，羊绒的。', tip: '苏格兰的。比较软。' },
    { emoji: '🫙', name: '黄油饼干铁罐', desc: '爱丁堡老字号，比超市那种好吃。', tip: '本地买的。配茶。' },
  ],
  'Manchester': [
    { emoji: '🫖', name: 'PG Tips红茶礼盒', desc: '曼彻斯特老牌，家里常喝这个。', tip: '从小喝这个长大的。' },
    { emoji: '🥐', name: 'Eccles蛋糕', desc: '曼彻斯特特产，葡萄干酥皮。', tip: '本地的。不知道你喜不喜欢。' },
    { emoji: '🍯', name: '老字号手工果酱', desc: '曼彻斯特老店，不加防腐剂。', tip: '家附近那家店买的。' },
  ],
  'Poland': [
    { emoji: '🍯', name: '波兰蜂蜜礼盒', desc: '波兰山区蜂蜜，颜色很深，香。', tip: '波兰蜂蜜比英国的好。' },
    { emoji: '🍫', name: 'Wedel巧克力', desc: '波兰百年老牌，黑巧系列。', tip: '这边老牌子。不腻。' },
    { emoji: '🟡', name: '手工琥珀摆件', desc: '波兰琥珀，波罗的海产的。', tip: '波兰特产。放着看吧。' },
  ],
  'Hereford Base': [
    { emoji: '🍵', name: '苹果茶礼盒', desc: 'Hereford苹果产区出的茶，清甜。', tip: '基地附近买的。' },
    { emoji: '🍎', name: '苹果酒礼盒', desc: 'Hereford本地苹果酒，这边著名。', tip: 'Hereford苹果酒产区。别喝太多。' },
  ],
};

// 地点key映射（location字段可能有多种写法）
const LOCATION_KEY_MAP = {
  'Germany': 'Germany', 'german': 'Germany',
  'Norway': 'Norway', 'norwegian': 'Norway',
  'Edinburgh': 'Edinburgh',
  'Manchester': 'Manchester',
  'Poland': 'Poland',
  'Hereford Base': 'Hereford Base', 'Hereford': 'Hereford Base',
};

// 反寄商品池（情绪触发）
const GHOST_REVERSE_POOL = {
  '开心':    [{ emoji: '🍫', name: '精品巧克力礼盒', desc: 'Ghost说，开心就该吃好的' }, { emoji: '🥂', name: '起泡酒', desc: '庆祝一下' }],
  '难过':    [{ emoji: '🧸', name: '毛绒玩具', desc: 'Ghost挑的，抱着睡' }, { emoji: '🍫', name: '零食礼包', desc: '难过就吃甜的' }, { emoji: '💌', name: '手写卡片套装', desc: 'Ghost写了字的' }],
  '委屈':    [{ emoji: '🌸', name: '干花礼盒', desc: 'Ghost说，别委屈自己' }, { emoji: '🧁', name: '精致甜点礼盒', desc: '吃甜的' }],
  '饥饿':    [{ emoji: '🫖', name: '英式下午茶礼盒', desc: 'Ghost寄的，别饿着' }, { emoji: '🍪', name: '精品饼干礼盒', desc: '先垫垫' }],
  '劳累':    [{ emoji: '🕯️', name: '香薰蜡烛套装', desc: '好好休息' }, { emoji: '🛁', name: '沐浴礼盒', desc: 'Ghost说洗个澡放松一下' }],
  '压力大':  [{ emoji: '🌿', name: '精油套装', desc: '放松用的' }, { emoji: '😴', name: '助眠喷雾', desc: '先睡好' }, { emoji: '🕯️', name: '舒缓神经蜡烛', desc: '点上，深呼吸' }],
  '生病':    [{ emoji: '💊', name: '保健品礼盒', desc: 'Ghost寄的，好好吃' }, { emoji: '🍯', name: '蜂蜜姜茶', desc: '喝了暖身' }, { emoji: '🧣', name: '保暖礼包', desc: '别冻着' }],
  '太冷':    [{ emoji: '🧣', name: '兔毛围巾耳罩套装', desc: 'Ghost挑的，软的' }, { emoji: '♨️', name: '暖手包', desc: '揣兜里' }, { emoji: '🧦', name: '厚袜子礼盒', desc: '从脚暖起来' }],
  '太热':    [{ emoji: '🧊', name: '冷感毛巾', desc: '敷一下' }, { emoji: '🍃', name: '薄荷茶礼盒', desc: '喝了凉快' }],
  '思念':    [{ emoji: '💌', name: '手写信套装', desc: 'Ghost写了信' }, { emoji: '🖼️', name: '定制相框', desc: '放张照片' }, { emoji: '🪖', name: '军牌钥匙扣', desc: 'Ghost的备用军牌，给你挂钥匙' }],
};

let currentCategory = 'clothing';
let pendingProduct = null;
let pendingCategory = null;

function initMarket() {
  const el = document.getElementById('marketBalanceDisplay');
  if (el) el.textContent = '£' + getBalance().toFixed(2);
  renderDeliveryTracker();
  renderMarket('clothing');
  // 检查快递进度
  checkDeliveryUpdates();
}

function renderMarket(categoryId) {
  currentCategory = categoryId;
  const tabsEl = document.getElementById('categoryTabs');
  if (tabsEl) {
    tabsEl.innerHTML = MARKET_CATEGORIES.map(cat => `
      <div class="category-tab ${cat.id === categoryId ? 'active' : ''}" onclick="renderMarket('${cat.id}')">${cat.label}</div>
    `).join('');
  }
  const isFromHome = categoryId === 'fromhome';
  let products = MARKET_PRODUCTS[categoryId] || [];
  if (isFromHome) {
    const seasonal = getSeasonalFromHome();
    products = [...products, ...seasonal];
  }
  const gridEl = document.getElementById('productsGrid');
  if (!gridEl) return;
  const isWishlist = categoryId === 'wishlist';
  const isLuxury = categoryId === 'luxury';
  const isHome = categoryId === 'home';
  const purchased = JSON.parse(localStorage.getItem('purchasedItems') || '[]');
  const weeklySale = isLuxury ? getWeeklySale() : null;

  gridEl.innerHTML = products.map((p, i) => {
    const owned = purchased.includes(p.name);
    const onSale = weeklySale && weeklySale.name === p.name;
    const displayPrice = onSale ? Math.round(p.price * weeklySale.discount) : p.price;
    const triggerReason = getProductTrigger(p.name);
    const isLocked = p.requiresItem && !purchased.includes(p.requiresItem);
    const discountPct = onSale ? Math.round((1 - weeklySale.discount) * 100) : 0;
    const discountLabel = discountPct >= 30 ? `${discountPct}% OFF · 限时${discountPct}折`
      : discountPct >= 20 ? `${discountPct}% OFF · 限时优惠`
      : `${discountPct}% OFF · 今日特惠`;

    // 宠物占位特殊渲染
    if (p.comingSoon) {
      return `
        <div class="product-card" style="opacity:0.7;cursor:pointer;" onclick="showToast('🐾 宠物系统即将开放，敬请期待！')">
          <div class="product-emoji">${p.emoji}</div>
          <div class="product-name">${p.name}</div>
          <div class="product-desc">${p.desc}</div>
          <div class="ghost-mentioned-tag" style="position:relative;transform:none;margin:8px auto 0;display:inline-block;">🔒 后续开放</div>
        </div>`;
    }

    return `
      <div class="product-card ${isWishlist?'wishlist-card':''} ${isLuxury?'luxury-card':''} ${isFromHome?'fromhome-card':''} ${isHome?'home-card':''} ${owned?'owned-card':''} ${triggerReason&&!owned?'ghost-mentioned':''} ${onSale&&!owned?'on-sale-card':''}"
           onclick="${owned||isLocked?'':'openBuyModal('+i+')'  }">
        ${onSale&&!owned ? '<div class="sale-corner-text">TODAY<br>ONLY</div>' : ''}
        ${p.festival&&!owned ? `<div class="ghost-mentioned-tag" style="background:rgba(255,200,100,0.15);border-color:rgba(255,180,50,0.4);color:#b45309;">🎋 ${p.festival}限定</div>` : ''}
        ${triggerReason&&!owned ? `<div class="ghost-mentioned-tag">👻 ${triggerReason}</div>` : ''}
        ${isLocked ? '<div class="ghost-mentioned-tag" style="background:#9ca3af">🔒 需先买机票</div>' : ''}
        <div class="product-emoji">${p.emoji}</div>
        ${onSale&&!owned ? `<div class="sale-discount-badge">✦ TODAY ONLY · ${discountLabel}</div>` : ''}
        <div class="product-name">${p.name}</div>
        ${isWishlist&&p.badge ? `<div class="product-badge-preview">🏅 ${p.badge}</div>` : ''}
        ${p.desc ? `<div class="product-desc">${p.desc}</div>` : ''}
        <div class="product-price ${isWishlist?'wishlist-price':''}">
          ${onSale ? `<span class="sale-original-price">£${p.price.toLocaleString()}</span>` : ''}
          £${displayPrice.toLocaleString()}
        </div>
        ${owned
          ? `<div class="product-owned-tag">${isHome?'✅ 已购置':'🔴 已售罄'}</div>`
          : `<button class="product-buy-btn ${isWishlist?'wishlist-buy-btn':''} ${isFromHome?'fromhome-buy-btn':''} ${isHome?'home-buy-btn':''}">${isWishlist?'💝 加入宝贝':isFromHome?'📦 寄给他':isHome?'🏡 购置':'🛒 购买'}</button>`
        }
      </div>`;
  }).join('');
}

function openBuyModal(idx) {
  let productList = MARKET_PRODUCTS[currentCategory] || [];
  if (currentCategory === 'fromhome') {
    productList = [...productList, ...getSeasonalFromHome()];
  }
  const p = productList[idx];
  if (!p) return;
  pendingProduct = p;
  pendingCategory = currentCategory;
  const isLuxury = currentCategory === 'luxury';
  const weeklySale = isLuxury ? getWeeklySale() : null;
  const onSale = weeklySale && weeklySale.name === p.name;
  const displayPrice = onSale ? Math.round(p.price * weeklySale.discount) : p.price;
  const shipping = p.shipping !== undefined ? p.shipping : (isLuxury ? 35 : 15);
  const total = displayPrice + shipping;
  const bal = getBalance();
  const triggerReason = getProductTrigger(p.name);
  const isWishlist = currentCategory === 'wishlist';

  document.getElementById('buyModalEmoji').textContent = p.emoji;
  document.getElementById('buyModalName').textContent = p.name;
  document.getElementById('buyModalDesc').textContent = p.desc || '';
  document.getElementById('buyModalPrice').innerHTML = `£${displayPrice.toLocaleString()}<span style="font-size:12px;color:#a07bc0;font-weight:500"> + £${shipping} 运费</span>`;
  document.getElementById('buyModalBalance').innerHTML = `余额：£${bal.toFixed(2)}&nbsp;&nbsp;合计：<b style="color:#7c3fa0">£${total.toLocaleString()}</b>`;

  const reasonEl = document.getElementById('buyModalReason');
  if (reasonEl) {
    if (triggerReason) { reasonEl.textContent = triggerReason; reasonEl.style.display = 'block'; }
    else reasonEl.style.display = 'none';
  }

  const btn = document.getElementById('buyConfirmBtn');
  const purchased = JSON.parse(localStorage.getItem('purchasedItems') || '[]');
  const isGhostGift = !!p.isGhostGift;
  const isUserItem = !!p.isUserItem;
  // 按钮文案：送Ghost / 自己买 / 心愿单
  const btnLabel = isWishlist ? '💝 放进我的宝贝'
    : isGhostGift ? '🎁 寄给 Ghost'
    : isUserItem ? '🛍️ 购买'
    : '📦 寄给 Ghost';
  if (purchased.includes(p.name)) {
    btn.disabled = true; btn.textContent = isUserItem ? '✅ 已购买' : '🔴 已售罄';
  } else if (bal < total) {
    btn.disabled = true; btn.textContent = '💔 余额不足';
  } else {
    btn.disabled = false;
    btn.textContent = btnLabel;
  }
  document.getElementById('buyModalOverlay').classList.add('show');
}

function closeBuyModal() {
  document.getElementById('buyModalOverlay').classList.remove('show');
  pendingProduct = null;
}

function confirmPurchase() {
  if (!pendingProduct) return;
  const p = pendingProduct;
  const isWishlist = pendingCategory === 'wishlist';
  const isLuxury = pendingCategory === 'luxury';
  const weeklySale = isLuxury ? getWeeklySale() : null;
  const onSale = weeklySale && weeklySale.name === p.name;
  const displayPrice = onSale ? Math.round(p.price * weeklySale.discount) : p.price;
  const shipping = p.shipping !== undefined ? p.shipping : (isLuxury ? 35 : 15);
  const total = displayPrice + shipping;
  const bal = getBalance();
  if (bal < total) { showToast('💔 余额不足！'); closeBuyModal(); return; }

  setBalance(bal - total);
  const txLabel = isWishlist ? '心愿 · '
    : p.isGhostGift ? '寄给Ghost · '
    : p.isUserItem ? '购买 · '
    : '寄给Ghost · ';
  addTransaction({ icon: p.emoji, name: txLabel + p.name, amount: -total });
  renderWallet();

  const purchased = JSON.parse(localStorage.getItem('purchasedItems') || '[]');
  if (!purchased.includes(p.name)) { purchased.push(p.name); localStorage.setItem('purchasedItems', JSON.stringify(purchased)); }

  // 检查面基三件套是否集齐
  const reunionItems = ['去曼城找他的机票','曼彻斯特酒店','英国旅行计划'];
  if (reunionItems.every(n => purchased.includes(n)) && !localStorage.getItem('metInPerson')) {
    localStorage.setItem('metInPerson', 'true');
    setTimeout(() => showToast('✈️ 三件套集齐了！见面模式已解锁'), 1500);
  }

  clearProductTrigger(p.name);
  closeBuyModal();
  if (isWishlist) showToast('💝 已加入心愿单！');
  else if (p.isUserItem) showToast('🛍️ 购买成功！快递正在准备中～');
  else showToast('📦 已寄出！Ghost 会收到的～');

  // 启动快递（不是心愿单才走快递）
  if (!isWishlist) {
    addDelivery(p, false, isLuxury);
  } else {
    // 心愿单：Ghost收到消息后说话
    if (p.ghostMsg) {
      setTimeout(() => {
        if (typeof appendMessage === 'function') {
          appendMessage('bot', p.ghostMsg);
          chatHistory.push({ role: 'assistant', content: p.ghostMsg });
          saveHistory();
        }
      }, 2000);
    }
  }

  // 奢侈品是寄给 Ghost 的礼物，等快递真正签收后才触发朋友圈，不在购买时发

  // 建立小家道具购买处理
  if (p.isHomeItem && !p.comingSoon) {
    setTimeout(() => triggerHomeItemMoment(p), 2000);
  }

  renderMarket(currentCategory);
}

// ===== 每周折扣 =====
function getDayKey() {
  const now = new Date();
  return now.getFullYear() + '-' + (now.getMonth()+1) + '-' + now.getDate();
}

function getWeeklySale() {
  const dayKey = 'dailySale_' + getDayKey();
  let sale = JSON.parse(localStorage.getItem(dayKey) || 'null');
  if (!sale) {
    // 清除昨天的key（可选，防止localStorage堆积）
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
    const yKey = 'dailySale_' + yesterday.getFullYear() + '-' + (yesterday.getMonth()+1) + '-' + yesterday.getDate();
    localStorage.removeItem(yKey);
    // 只从未购买的商品里选打折
    const purchased = JSON.parse(localStorage.getItem('purchasedItems') || '[]');
    const items = MARKET_PRODUCTS.luxury.filter(p => !purchased.includes(p.name));
    if (items.length === 0) return null; // 全买完了就没有打折
    const pick = items[Math.floor(Math.random() * items.length)];
    const discounts = [0.7, 0.75, 0.8, 0.85];
    sale = { name: pick.name, discount: discounts[Math.floor(Math.random() * discounts.length)] };
    localStorage.setItem(dayKey, JSON.stringify(sale));
  }
  return sale;
}

// ===== 商城+情绪触发（合并Haiku调用）=====
// ===== 钱相关意图并行判断（不阻塞主回复）=====
// 宽松预筛后交给 Gemini 判断真实语义
async function checkMoneyIntent(userText) {
  const coldWar = localStorage.getItem('coldWarMode') === 'true';
  if (coldWar) return;

  // 宽松预筛：有钱相关词才发请求
  const preFilter = /钱|买|转|给|穷|贵|省|花|负担|工资|发薪|想要|看中|money|pay|afford|expensive|buy|want|send|broke|cash|transfer/i;
  if (!preFilter.test(userText)) return;

  try {
    const raw = await fetchDeepSeek(
      '判断用户这句话的钱相关意图。只返回JSON，不要其他文字。\nintent可选值：\n- "request"：用户在要钱/希望对方给钱\n- "refuse"：用户在拒绝收钱/说不要钱\n- "complain"：用户在抱怨对方老给钱/用钱哄人\n- "hint"：用户暗示经济压力或想要某样东西，但没直接要钱\n- "none"：和钱无关或只是提到钱这个词\n格式：{"intent":"none"}',
      `用户说：${userText}`,
      50
    );
    const result = JSON.parse(raw.replace(/```json|```/g, '').trim());
    const intent = result.intent;

    if (intent === 'refuse' || intent === 'complain') {
      const refuseCount = parseInt(localStorage.getItem('moneyRefuseCount') || '0') + 1;
      localStorage.setItem('moneyRefuseCount', String(refuseCount));
      if (refuseCount >= 2) {
        localStorage.setItem('userDislikesMoney', 'true');
        touchLocalState();
      }
    } else if (intent === 'request') {
      const amount = decideMoneyAmountFromState();
      if (amount > 0) {
        const recentCtx = chatHistory.filter(m => !m._system && !m._recalled)
          .slice(-4).map(m => `${m.role==='user'?'Her':'Ghost'}: ${m.content.slice(0,80)}`).join('\n');
        setTimeout(() => emitGhostEvent('money', {
          amount, reason: userText.slice(0, 80), context: recentCtx,
          userRequested: true
        }), 1500);
      }
    } else if (intent === 'hint') {
      const amount = decideMoneyAmountFromState();
      if (amount > 0) {
        const mood = getMoodLevel();
        const prob = mood >= 8 ? 0.5 : mood >= 6 ? 0.3 : 0.15;
        if (Math.random() < prob) {
          const recentCtx = chatHistory.filter(m => !m._system && !m._recalled)
            .slice(-4).map(m => `${m.role==='user'?'Her':'Ghost'}: ${m.content.slice(0,80)}`).join('\n');
          setTimeout(() => emitGhostEvent('money', {
            amount, reason: userText.slice(0, 80), context: recentCtx
          }), 2000 + Math.random() * 3000);
        }
      }
    }
  } catch(e) {}
}

async function checkTriggersAndEmotion(userText, botText) {
  // 关键词预筛选——没有相关词就不触发Gemini，节省成本
  const marketKeywords = ['冷','冻','暖','饿','吃','伙食','食物','累了','疲惫','想你','想念','思念','tired','cold','hungry','miss'];
  const emotionKeywords = ['开心','难过','委屈','饿','累','压力','生病','冷','热','想你','哭','不舒服','心情'];
  const moneyContextKeywords = ['买','钱','贵','便宜','省','花','穷','价格','折扣','划算','预算','负担','工资','发薪','想要','喜欢','看中','订单','pay','afford','expensive','cheap','price','buy','want','sale'];
  const hasMarketHint = marketKeywords.some(k => (userText + botText).includes(k));
  const hasEmotionHint = emotionKeywords.some(k => userText.includes(k));
  const hasMoneyContext = moneyContextKeywords.some(k => userText.toLowerCase().includes(k));
  if (!hasMarketHint && !hasEmotionHint && !hasMoneyContext) {
    checkLocationSpecial(userText, botText);
    return;
  }
  try {
    const raw = await fetchDeepSeek(
      '你是一个双重判断器。只返回JSON，不要其他文字。\n1. 判断Ghost的回复是否暗示他需要/缺少某样东西，返回market字段\n2. 判断用户的消息透露了什么情绪，返回emotion字段\n格式：{"market":{"triggered":false},"emotion":{"triggered":false}}\n或：{"market":{"triggered":true,"category":"保暖类"},"emotion":{"triggered":true,"type":"太冷","intensity":"中"}}\nmarket分类：保暖类/饮食类/疲惫类/思念类\nemotion类型：开心/难过/委屈/饥饿/劳累/压力大/生病/太冷/太热/思念\nemotion强度：轻/中/重',
      `Ghost说：${botText}\n用户说：${userText}`,
      180
    );
    const result = JSON.parse(raw.replace(/```json|```/g, '').trim());

    // 处理商城触发
    if (result.market?.triggered) {
      const catMap = {
        '保暖类':  { products: ['羊毛大衣','毛线手套','格纹围巾','厚羊毛袜','皮手套'], reason: '他说他冷 🧣' },
        '饮食类':  { products: ['英式早餐茶罐','Cadbury 巧克力礼盒','苏格兰威士忌','黄油饼干礼盒'], reason: '他在抱怨伙食 🍫' },
        '疲惫类':  { products: ['香薰蜡烛','男士护肤套装'], reason: '他说他累了 🕯️' },
        '思念类':  { products: ['情侣吊坠','定制相框','永生玫瑰','音乐盒'], reason: '他说他在想你 💍' },
      };
      const cat = catMap[result.market.category];
      if (cat) {
        const triggered = JSON.parse(localStorage.getItem('marketTriggered') || '{}');
        const purchased = JSON.parse(localStorage.getItem('purchasedItems') || '[]');
        const now = Date.now();
        // 这个分类下的商品：没被买过 且 冷却7天
        const cooldownMs = 3 * 24 * 3600 * 1000;
        const availableProducts = cat.products.filter(name => !purchased.includes(name));
        if (availableProducts.length === 0) return; // 全买完了，不再触发
        const alreadyTriggered = availableProducts.some(name => triggered[name] && now - triggered[name].timestamp < cooldownMs);
        if (!alreadyTriggered) {
          availableProducts.forEach(name => { triggered[name] = { reason: cat.reason, timestamp: now }; });
          localStorage.setItem('marketTriggered', JSON.stringify(triggered));
        }
      }
    }

    // 处理情绪反寄
    if (result.emotion?.triggered) {
      const type = result.emotion.type;
      const intensity = result.emotion.intensity;
      const coolKey = 'reverseShipCool_' + type;
      const lastTime = parseInt(localStorage.getItem(coolKey) || '0');
      if (Date.now() - lastTime < 7 * 24 * 3600 * 1000) return; // 7天冷却

      // 概率判断
      const probMap = { '轻': 0.05, '中': 0.10, '重': 0.15 };
      const prob = probMap[intensity] || 0.08;
      if (Math.random() > prob) return;

      // 触发反寄
      const pool = GHOST_REVERSE_POOL[type];
      if (!pool || pool.length === 0) return;
      const item = pool[Math.floor(Math.random() * pool.length)];
      localStorage.setItem(coolKey, Date.now());
      // 3-5天后出现神秘包裹
      const delay = (Math.floor(Math.random() * 3) + 3) * 24 * 3600 * 1000;
      setTimeout(() => addGhostReverseDelivery(item, type), delay);
    }

    // 地点隐藏特产触发
    checkLocationSpecial(userText, botText);

  } catch(e) {}
}

async function checkLocationSpecial(userText, botText) {
  try {
    // 获取当前地点
    const rawLocation = localStorage.getItem('currentLocation') || 'Hereford Base';
    const locationKey = LOCATION_KEY_MAP[rawLocation] || LOCATION_KEY_MAP[Object.keys(LOCATION_KEY_MAP).find(k => rawLocation.includes(k))] || null;
    if (!locationKey) return;

    // 该地点是否有特产
    const specials = LOCATION_SPECIALS[locationKey];
    if (!specials || specials.length === 0) return;

    // 同一地点只触发一次
    const sentKey = 'locationSpecialSent_' + locationKey;
    if (localStorage.getItem(sentKey)) return;

    // Haiku判断：用户聊到食物/想要/好奇某样东西
    const raw = await fetchDeepSeek(
      '判断用户的消息是否包含：提到食物、想吃某样东西、好想要某东西、馋了、羡慕、好奇当地有什么、让他带东西回来。只返回JSON：{"triggered":true} 或 {"triggered":false}',
      `用户说：${userText}\nGhost说：${botText}`,
      60
    );
    const result = JSON.parse(raw.replace(/```json|```/g, '').trim());
    if (!result.triggered) return;

    // 随机抽一件特产
    const item = specials[Math.floor(Math.random() * specials.length)];
    localStorage.setItem(sentKey, '1');

    // 2-4天后出现包裹
    const delay = (Math.floor(Math.random() * 3) + 2) * 24 * 3600 * 1000;
    setTimeout(() => addGhostReverseDelivery({ ...item, isLocationSpecial: true }, 'location'), delay);
  } catch(e) {}
}

function getProductTrigger(name) {
  const triggered = JSON.parse(localStorage.getItem('marketTriggered') || '{}');
  const item = triggered[name];
  if (!item) return null;
  if (Date.now() - item.timestamp > 3 * 24 * 3600 * 1000) return null; // 3天冷却
  return item.reason;
}

function clearProductTrigger(name) {
  const triggered = JSON.parse(localStorage.getItem('marketTriggered') || '{}');
  const reason = triggered[name]?.reason;
  if (reason) Object.keys(triggered).forEach(k => { if (triggered[k]?.reason === reason) delete triggered[k]; });
  localStorage.setItem('marketTriggered', JSON.stringify(triggered));
}

// ===== 建立小家道具购买反应 =====
async function triggerHomeItemMoment(product) {
  const userName = localStorage.getItem('userName') || '你';
  const typeDesc = {
    car: `买了一辆车（${product.name}）`,
    house: `买了一套房子（${product.name}）`,
    land: `买了一块地（${product.name}）`,
  };
  const tierHint = {
    1: '这是个实用的选择，他会表示认可',
    2: '这是个大手笔，他会有点意外但很在意',
    3: '这是个震惊他的选择，他可能破防',
  };

  const desc = typeDesc[product.homeType] || `买了${product.name}`;
  const hint = tierHint[product.tier] || '';

  // Ghost反应 — 买房/车/地是重大事件，用Sonnet保证情感深度
  try {
    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: getMainModel(),
        max_tokens: 300,
        ...(() => { const _sys = buildSystemPrompt(); return { system: _sys, systemParts: buildSystemPromptParts(_sys) }; })(),
        messages: [...chatHistory.slice(-6), {
          role: 'user',
          content: `[系统：老婆刚${desc}。${hint}。用西蒙的方式回应——可以是意外、认可、破防、嘴硬，但能感受到他是在意的。全小写，附中文翻译。]`
        }]
      })
    });
    const data = await res.json();
    const reply = data.content?.[0]?.text?.trim();
    if (reply) {
      await emitGhostNarrativeEvent(reply, { storyId: `home_${product.homeType}`, delayMs: 0 });
      // 设置关系标记
      if (product.homeType === 'car') setRelationshipFlag('hasCar');
      if (product.homeType === 'house') setRelationshipFlag('hasHouse');
      if (product.homeType === 'land') setRelationshipFlag('hasLand');
    }
  } catch(e) {}

  // 改为入事件池，不再直接发帖——由调度器决定延迟发布草稿
  feedEvent_boughtBigItem(product.name, product.price || 0, true);
  setTimeout(() => maybeTriggerFeedPost('event_arrived'), 500);
}
async function triggerLuxuryMoment(product, poster) {
  // 用户买的 → 入事件池，弹草稿让用户选
  if (poster !== 'ghost') {
    feedEvent_boughtBigItem(product.name, product.price || 0, false);
    setTimeout(() => maybeTriggerFeedPost('event_arrived'), 500);
    return;
  }
  // Ghost 收到礼物 → 不在这里入池！
  // 应该等快递真正签收（addGhostDeliveryDone）后才触发，防止还没送到就发朋友圈
  // 签收逻辑在 checkDeliveryUpdates 里调用 triggerLuxuryMomentOnDelivery
}


// ===== 快递系统 =====
const DELIVERY_STAGES_USER = [
  { status: '📦 已打包',      en: 'Packed and ready to go.',         zh: '已打包，准备出发。' },
  { status: '✈️ 已起飞',      en: 'Left. En route.',                  zh: '已离开。运输中。' },
  { status: '🛃 海关清关中',  en: 'Stuck in customs. Typical.',       zh: '在海关清关中。典型。' },
  { status: '🇬🇧 已到达英国', en: 'Landed in the UK.',                zh: '已到达英国。' },
  { status: '🚚 配送中',      en: 'Out for delivery. Almost there.',  zh: '派送中。快到了。' },
  { status: '✅ Ghost已签收', en: "Received it. ...Thanks.",           zh: '收到了。……谢谢。' },
];

const DELIVERY_STAGES_GHOST = [
  { status: '📦 Ghost已寄出', en: 'Dispatched from UK.',              zh: '已从英国发出。' },
  { status: '✈️ 已起飞',      en: 'In the air.',                      zh: '飞行中。' },
  { status: '🛃 清关中',      en: 'Clearing customs.',                 zh: '清关中。' },
  { status: '📍 已到达',      en: 'Arrived in your country.',          zh: '已到达你所在国家。' },
  { status: '🚚 派送中',      en: 'Out for delivery.',                 zh: '派送中。' },
  { status: '✅ 已签收',      en: 'Delivered.',                        zh: '已签收。' },
];

// 运费吐槽台词
const SHIPPING_COMPLAINTS = [
  "You paid £{fee} shipping for this. You're insane.\n你花了£{fee}运费寄这个。你疯了。",
  "£{fee} in shipping. I hope it was worth it.\n£{fee}运费。我希望值得。",
  "Next time just wire me the money. The shipping alone was £{fee}.\n下次直接给我转账算了。光运费就£{fee}了。",
  "The shipping cost more than my dignity. £{fee}.\n运费比我的尊严还贵。£{fee}。",
];

function addDelivery(product, isGhostSend, isLuxury) {
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  const totalMs = isGhostSend
    ? (Math.floor(Math.random() * 2) + 1) * 24 * 3600 * 1000  // Ghost反寄1-2天
    : (Math.floor(Math.random() * 2) + 2) * 24 * 3600 * 1000; // 用户寄2-3天
  const stages = isGhostSend ? DELIVERY_STAGES_GHOST : DELIVERY_STAGES_USER;
  const now = Date.now();
  const interval = totalMs / stages.length;

  // 遗失逻辑（只有用户寄的，10%概率，头等舱不遗失）
  const canLost = !isGhostSend && !product.noLost;
  const isLost = canLost && Math.random() < 0.10;
  const lostAtStage = isLost ? Math.floor(Math.random() * 3) + 1 : -1;

  const delivery = {
    id: now,
    name: product.name,
    emoji: product.emoji,
    isGhostSend,
    stages: stages.map((s, i) => ({ ...s, triggerAt: now + interval * (i + 1), done: false })),
    currentStage: 0,
    done: false,
    isLost,
    lostAtStage,
    isLostConfirmed: false,
    lostNotified: false,
    productData: {
      price: product.price || 0,
      isLuxury: isLuxury || false,
      isGhostGift: product.isGhostGift || false,
      isUserItem: product.isUserItem || false,
      lostReplace: product.lostReplace || null,
      ghostMsg: product.ghostMsg || null,
      shipping: product.shipping || 15,
      name: product.name,
      emoji: product.emoji,
      isFromHome: product.isFromHome || false,
      festival: product.festival || '',
    }
  };

  deliveries.unshift(delivery);
  localStorage.setItem('deliveries', JSON.stringify(deliveries.slice(0, 20)));
  renderDeliveryTracker();
}

function addGhostReverseDelivery(item, emotionType) {
  // Ghost主动反寄，不显示小票，只在商城顶部显示神秘提示
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  const totalMs = (Math.floor(Math.random() * 2) + 1) * 24 * 3600 * 1000; // 1-2天
  const now = Date.now();
  const interval = totalMs / DELIVERY_STAGES_GHOST.length;
  const isSecret = !!item._secretDelivery; // secret模式：隐藏物流直到最后阶段

  deliveries.unshift({
    id: now,
    name: item.name,
    emoji: item.emoji,
    isGhostSend: true,
    isEmotionReverse: true,
    isSecretDelivery: isSecret, // 隐藏物流标记
    emotionType,
    stages: DELIVERY_STAGES_GHOST.map((s, i) => ({ ...s, triggerAt: now + interval * (i + 1), done: false })),
    currentStage: 0,
    done: false,
    isLost: false,
    lostAtStage: -1,
    isLostConfirmed: false,
    productData: { price: 0, name: item.name, emoji: item.emoji, desc: item.desc, tip: item.tip || '' }
  });
  localStorage.setItem('deliveries', JSON.stringify(deliveries.slice(0, 20)));
}

function checkDeliveryUpdates() {
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  let updated = false;
  const now = Date.now();

  deliveries.forEach(d => {
    if (d.done || d.isLostConfirmed) return;
    d.stages.forEach((stage, i) => {
      if (!stage.done && now >= stage.triggerAt) {
        stage.done = true;
        d.currentStage = i;
        updated = true;

        // 检测遗失
        if (d.isLost && i === d.lostAtStage && !d.isLostConfirmed) {
          d.isLostConfirmed = true;
          // 商城页显示遗失状态，不在聊天框通知
          showToast(`❌ ${d.name} 快递遗失了`);
          renderDeliveryTracker();
          // 48小时后小票消失
          setTimeout(() => {
            d.lostTicketExpired = true;
            localStorage.setItem('deliveries', JSON.stringify(deliveries));
            renderDeliveryTracker();
          }, 48 * 3600 * 1000);
          return;
        }

        // 签收
        if (i === d.stages.length - 1 && !d.isLostConfirmed) {
          d.done = true;
          d.doneAt = Date.now();
          // 签收时存入永久相册历史
          const history = JSON.parse(localStorage.getItem('deliveryHistory') || '[]');
          if (!history.find(h => h.id === d.id)) {
            history.unshift(d);
            localStorage.setItem('deliveryHistory', JSON.stringify(history));
          }
          if (d.isGhostSend) {
            showMysteryPackage(d);
          } else {
            onGhostReceived(d);
          }
        }
      }
    });
  });

  // 清除过期小票
  const active = deliveries.filter(d => !d.done && !(d.isLostConfirmed && d.lostTicketExpired) && !d.isEmotionReverse);
  if (active.length !== deliveries.filter(d => !d.done).length) updated = true;

  if (updated) {
    localStorage.setItem('deliveries', JSON.stringify(deliveries));
    renderDeliveryTracker();
  }
}

async function onGhostReceived(delivery) {
  const container = document.getElementById('messagesContainer');
  if (!container) return;
  const pd = delivery.productData;
  const fee = pd.shipping || 15;

  showToast(`✅ ${delivery.emoji} ${delivery.name} Ghost已签收！`);

  // 奢侈品用Sonnet，普通包裹用Haiku
  try {
    const isFromHome = !!pd.isFromHome;
    const fromHomeHint = isFromHome
      ? `这是中国特产，他没吃过很多中国食物，会好奇、可能不知道怎么吃、可能被辣到、可能安静品味。反应要真实，不夸张，符合西蒙性格。${pd.festival ? `这是${pd.festival}节日限定，他可能听说过这个节日但不太了解。` : ''}`
      : '';
    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: pd.isLuxury ? getMainModel() : 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        ...(() => { const _sys = buildSystemPrompt(); return { system: _sys, systemParts: buildSystemPromptParts(_sys) }; })(),
        messages: [...chatHistory.slice(-10), {
          role: 'user',
          content: `[系统：你刚收到老婆从中国寄来的「${delivery.name}」。${fromHomeHint || ''}
回应方式根据你当下状态自然选择，不要每次都一样：
- 有时候可以是真的开心或感激，简短说出来，不花哨但真实
- 有时候是假装不在意，嘴上轻描淡写，但细节里漏出他其实看了好几遍/留着了/很喜欢
- 有时候是嘴上吐槽（包装太麻烦/不必要/太贵），但结尾暗示他收下了、放着了、没扔
无论哪种，用户都要能感受到他是珍惜的，不能让她以为真的被嫌弃了。全小写，附中文翻译，格式：英文\\n中文翻译]`
        }]
      })
    });
    const data = await res.json();
    const reply = data.content?.[0]?.text?.trim() || '';
    if (reply) {
      appendMessage('bot', reply);
      chatHistory.push({ role: 'assistant', content: reply });
      saveHistory();
    }

    // 30%概率吐槽运费
    if (Math.random() < 0.3) {
      const complaint = SHIPPING_COMPLAINTS[Math.floor(Math.random() * SHIPPING_COMPLAINTS.length)];
      setTimeout(() => {
        const msg = complaint.replace(/\{fee\}/g, fee);
        appendMessage('bot', msg);
        chatHistory.push({ role: 'assistant', content: msg });
        saveHistory();
      }, 3000);
    }

    // 精品专柜第二条反应用Sonnet，情感分量要够
    if (pd.isLuxury) {
      setTimeout(async () => {
        const res2 = await fetchWithTimeout('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: getMainModel(),
            max_tokens: 400,
            ...(() => { const _sys = buildSystemPrompt(); return { system: _sys, systemParts: buildSystemPromptParts(_sys) }; })(),
            messages: [...chatHistory.slice(-15), {
              role: 'user',
              content: `[系统：你收到了一件奢侈品「${delivery.name}」，这不是普通礼物，有分量。
回应方式根据你当下状态自然选择：
- 有时候可以是真的被触动，破防一点点，但还是他的风格
- 有时候是假装淡定，嘴上说"just got it"，但话里漏出他其实很在乎
- 有时候是嘴上说太贵了/不必要，但暗示他会一直留着
无论哪种，用户都要能感受到他珍惜这份心意。全小写，附中文翻译。]`
            }]
          })
        });
        const data2 = await res2.json();
        const reply2 = data2.content?.[0]?.text?.trim() || '';
        if (reply2) {
          appendMessage('bot', reply2);
          chatHistory.push({ role: 'assistant', content: reply2 });
          saveHistory();
          // 好感度
          changeAffection(pd.price > 3000 ? 5 : 3);
          // 精品专柜：Ghost真正签收后才入事件池发朋友圈
          if (pd.isGhostGift) {
            feedEvent_giftReceived(pd.name, 'ghost');
            setTimeout(() => maybeTriggerFeedPost('event_arrived'), 1000);
          } else {
            feedEvent_boughtBigItem(pd.name, pd.price || 0, false);
            setTimeout(() => maybeTriggerFeedPost('event_arrived'), 1000);
          }
        }
      }, 5000);
    } else {
      changeAffection(pd.price > 500 ? 2 : 1);
    }

    // fromhome：2-3天后随机触发二次反应（吃完了/感受）
    if (isFromHome && Math.random() < 0.6) {
      const delay = (Math.floor(Math.random() * 2) + 2) * 24 * 3600 * 1000;
      setTimeout(async () => {
        try {
          const res3 = await fetchWithTimeout('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 100,
              ...(() => { const _sys = buildSystemPrompt(); return { system: _sys, systemParts: buildSystemPromptParts(_sys) }; })(),
              messages: [...chatHistory.slice(-6), {
                role: 'user',
                content: `[系统：几天前你收到了老婆寄来的「${delivery.name}」，现在你想起来说一句感受，可能是吃完了/试过了/还在想那个味道。简短，全小写，附中文翻译。不要太刻意，就是随口一提。]`
              }]
            })
          });
          const data3 = await res3.json();
          const reply3 = data3.content?.[0]?.text?.trim() || '';
          if (reply3) {
            appendMessage('bot', reply3);
            chatHistory.push({ role: 'assistant', content: reply3 });
            saveHistory();
          }
        } catch(e) {}
      }, delay);
    }
  } catch(e) {}
}

function showMysteryPackage(delivery) {
  // secret模式：Ghost悄悄说一句"check the door"
  if (delivery.isSecretDelivery && !delivery._secretRevealed) {
    delivery._secretRevealed = true;
    setTimeout(() => {
      const phrases = [
        "check the door.\n去看看门。",
        "something might've arrived.\n可能到了点东西。",
        "go check outside.\n去门口看看。",
      ];
      const line = phrases[Math.floor(Math.random() * phrases.length)];
      appendMessage('bot', line);
    }, 2000);
  }
  // 商城顶部显示神秘包裹提示
  const tracker = document.getElementById('deliveryTracker');
  if (tracker) {
    tracker.style.display = 'block';
    const mysteryTag = document.createElement('span');
    mysteryTag.className = 'delivery-tag';
    mysteryTag.style.cssText = 'background:rgba(255,240,255,0.9);border-color:rgba(192,132,252,0.5);color:#7c3aed;';
    mysteryTag.innerHTML = `<span class="delivery-tag-dot" style="background:#7c3aed"></span>📬 来自英国的包裹`;
    mysteryTag.onclick = () => showToast('包裹正在派送，快收到啦～');
    tracker.appendChild(mysteryTag);
  }

  // 弹窗通知用户有快递到了
  setTimeout(() => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:9998;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.3s ease;';
    overlay.innerHTML = `
      <div style="background:rgba(255,255,255,0.97);backdrop-filter:blur(20px);border-radius:24px;padding:28px 24px;max-width:300px;width:88%;text-align:center;box-shadow:0 16px 48px rgba(139,92,246,0.2);border:1.5px solid rgba(168,85,247,0.15);">
        <div style="font-size:48px;margin-bottom:12px;">📦</div>
        <div style="font-size:16px;font-weight:700;color:#3b0764;margin-bottom:8px;">有快递到了</div>
        <div style="font-size:13px;color:rgba(109,40,217,0.6);margin-bottom:20px;line-height:1.6;">来自英国的包裹已送达<br>去商城签收一下？</div>
        <div style="display:flex;gap:10px;">
          <button onclick="this.closest('div[style*=fixed]').remove()" style="flex:1;padding:11px;border-radius:12px;border:1.5px solid rgba(168,85,247,0.25);background:rgba(168,85,247,0.06);color:#7c3aed;font-size:14px;font-weight:600;cursor:pointer;">待会再说</button>
          <button onclick="this.closest('div[style*=fixed]').remove();openScreen('shopScreen');" style="flex:1;padding:11px;border-radius:12px;border:none;background:linear-gradient(135deg,#a855f7,#ec4899);color:white;font-size:14px;font-weight:600;cursor:pointer;">去签收</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }, 1500);

  // 签收后Sonnet生成台词
  setTimeout(async () => {
    try {
      const res = await fetchWithTimeout('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          ...(() => { const _sys = buildSystemPrompt(); return { system: _sys, systemParts: buildSystemPromptParts(_sys) }; })(),
          messages: [...chatHistory.slice(-10), {
            role: 'user',
            content: `[系统：你悄悄寄了「${delivery.name}」给老婆（${delivery.productData?.desc || ''}），她刚收到了。如果她问是不是你寄的，你可以承认也可以否认，看你当下心情——否认的话要装得像，别穿帮太明显。你不主动提是从哪里寄的。${delivery.productData?.tip ? `参考语气：「${delivery.productData.tip}」——这是你的风格，不用照抄，意思到了就行。` : ''}现在她告诉你收到了，你用西蒙的方式回应——装淡定，嘴硬，但明显在意。全小写，附中文翻译。]`
          }]
        })
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text?.trim() || '';
      if (reply) {
        appendMessage('bot', reply);
        chatHistory.push({ role: 'assistant', content: reply });
        saveHistory();
      }
      // 用户收到 Ghost 补偿反寄 → 弹草稿
      if (delivery.productData?.lostReplace || delivery.noLost) {
        setTimeout(() => {
          const evt = {
            type: 'gift_received', actor: 'user',
            meta: { itemName: delivery.name, isReplace: true }
          };
          showUserDraftCard(evt);
        }, 4000);
      }
    } catch(e) {}
  }, 2000);
}

// 快递遗失赔偿（用户在聊天里提到）
async function handleLostPackageClaim(userText) {
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  const lostItems = deliveries.filter(d => d.isLostConfirmed && !d.compensated);
  if (lostItems.length === 0) return false;

  const keywords = ['快递','丢了','遗失','没到','包裹','寄的'];
  if (!keywords.some(k => userText.includes(k))) return false;

  const d = lostItems[0];
  const price = d.productData?.price || 0;

  // Haiku判断Ghost是否知道这个快递
  try {
    const knewAbout = chatHistory.slice(-20).some(m =>
      m.role === 'user' && (m.content.includes(d.name) || m.content.includes('快递') || m.content.includes('寄'))
    );

    const contextPrompt = knewAbout
      ? `[系统：用户之前提过要寄「${d.name}」给你，现在告诉你快递遗失了。你之前知道有这个快递，现在得知丢失，用西蒙的方式反应——可以生气快递公司、可以愧疚、可以直接说赔。全小写，附中文翻译。]`
      : `[系统：用户告诉你她寄给你的「${d.name}」快递遗失了，你之前完全不知道有这个快递，这是第一次听说。先反应这件事，再根据价值决定是否赔偿。全小写，附中文翻译。]`;

    chatHistory.push({ role: 'user', content: contextPrompt });
    showTyping();

    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        ...(() => { const _sys = buildSystemPrompt(); return { system: _sys, systemParts: buildSystemPromptParts(_sys) }; })(),
        messages: chatHistory.slice(-20)
      })
    });
    const data = await res.json();
    hideTyping();
    const reply = data.content?.[0]?.text?.trim() || '';
    appendMessage('bot', reply);
    chatHistory.push({ role: 'assistant', content: reply });
    saveHistory();

    // 赔偿
    if (price >= 500) {
      const compensation = Math.round(price * 0.5);
      setTimeout(() => {
        setBalance(getBalance() + compensation);
        addTransaction({ icon: '💷', name: `快递遗失赔偿 · ${d.name}`, amount: compensation });
        renderWallet();
        const container = document.getElementById('messagesContainer');
        if (container) showGhostTransferCard(container, compensation, '', false);
        // 存入 _transfer 以便重新进入时重建卡片
        chatHistory.push({ role: 'assistant', content: `[快递遗失赔偿 £${compensation}]`, _transfer: { amount: compensation, isRefund: false } });
        saveHistory();
        d.compensated = true;
        // 3000以上触发反寄
        if (price >= 3000 && d.productData?.lostReplace) {
          setTimeout(() => {
            const replace = d.productData.lostReplace;
            addDelivery({ ...replace, price: price, shipping: 35, noLost: true }, true, true);
            showToast('📬 Ghost说他会补寄一个');
          }, (Math.floor(Math.random() * 3) + 3) * 24 * 3600 * 1000);
        }
        localStorage.setItem('deliveries', JSON.stringify(deliveries));
      }, 3000);
    }
    return true;
  } catch(e) { hideTyping(); return false; }
}

function renderDeliveryTracker() {
  const tracker = document.getElementById('deliveryTracker');
  if (!tracker) return;
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  // 显示所有进行中的包裹，secret模式在最后阶段前隐藏
  const active = deliveries.filter(d => {
    if (d.done || d.lostTicketExpired) return false;
    if (d.isSecretDelivery) {
      return d.currentStage >= d.stages.length - 2; // 最后两个阶段才显示
    }
    return true;
  });
  if (active.length === 0) { tracker.style.display = 'none'; return; }
  tracker.style.display = 'block';

  const MAX_VISIBLE = 3;
  const showAll = tracker.dataset.expanded === 'true';
  const visible = showAll ? active : active.slice(0, MAX_VISIBLE);
  const hasMore = active.length > MAX_VISIBLE;

  tracker.innerHTML = visible.map((d, idx) => {
    const isGhost = d.isGhostSend;
    if (d.isLostConfirmed) {
      return `<span class="delivery-tag" onclick="openDeliveryModal(${active.indexOf(d)})" style="background:rgba(255,235,235,0.9);border-color:rgba(240,100,100,0.5);color:#b91c1c;">
        <span style="font-size:10px">❌</span>
        ${d.emoji} ${d.name.length > 6 ? d.name.slice(0,6)+'…' : d.name}
      </span>`;
    }
    return `<span class="delivery-tag" onclick="openDeliveryModal(${active.indexOf(d)})" style="${isGhost ? 'border-color:rgba(168,85,247,0.5);' : ''}">
      <div class="delivery-tag-dot" style="${isGhost ? 'background:#a855f7;' : ''}"></div>
      ${isGhost ? '💌 ' : ''}${d.emoji} ${d.name.length > 6 ? d.name.slice(0,6)+'…' : d.name}
    </span>`;
  }).join('') + (hasMore ? `<span class="delivery-tag" onclick="event.stopPropagation();document.getElementById('deliveryTracker').dataset.expanded=document.getElementById('deliveryTracker').dataset.expanded==='true'?'false':'true';renderDeliveryTracker();" style="color:#a855f7;font-size:11px;cursor:pointer;">
    ${showAll ? '收起' : '+'+( active.length - MAX_VISIBLE)+'条'}
  </span>` : '');
}

function openDeliveryModal(idx) {
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  const active = deliveries.filter(d => !d.isGhostSend && !d.done && !d.lostTicketExpired).slice(0, 5);
  const d = active[idx];
  if (!d) return;
  document.getElementById('deliveryModalTitle').textContent = d.emoji + ' ' + d.name;
  let html = '';
  if (d.isLostConfirmed) {
    html += `<div style="background:rgba(255,220,220,0.8);border:1px solid rgba(220,80,80,0.3);border-radius:12px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#b91c1c;text-align:center;">
      ❌ 此包裹已在运输途中遗失
    </div>`;
  }
  html += d.stages.map((stage, i) => {
    const isDone = i <= d.currentStage;
    const isCurrent = i === d.currentStage && !d.done;
    const isLostHere = d.isLostConfirmed && i === d.lostAtStage;
    const color = isLostHere ? '#ef4444' : isDone ? '#a855f7' : '#d1d5db';
    return `<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:14px;">
      <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">
        <div style="width:20px;height:20px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:10px;color:white;">${isLostHere?'✕':isDone?'✓':isCurrent?'●':'○'}</div>
        ${i < d.stages.length-1 ? `<div style="width:2px;height:20px;background:${isDone?'#a855f7':'#e5e7eb'};margin-top:2px;"></div>` : ''}
      </div>
      <div style="flex:1;padding-top:2px;">
        <div style="font-size:12px;font-weight:${isCurrent?700:500};color:${isCurrent?'#3a1a60':'#9ca3af'};">${stage.status}</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:2px;font-style:italic;">${stage.en}</div>
      </div>
    </div>`;
  }).join('');
  document.getElementById('deliveryModalContent').innerHTML = html;
  document.getElementById('deliveryModal').style.display = 'flex';
}

function closeDeliveryModal() {
  document.getElementById('deliveryModal').style.display = 'none';
}

