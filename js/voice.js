// ============================================================
// voice.js — 语音功能 v2.1（V4 修复版）
//
// 两种形态：
//   ① 日常聊天  → 语音条（播放键 + 波形 + 时长 + 转文字）
//   ② 约会场景  → 气泡右下角小喇叭🔊，点击播放
//
// 依赖：api.js（fetchWithTimeout 已存在）
// 加载顺序：api.js → voice.js → dates.js → dates_voice_patch.js
// 样式：css/voice.css
// ============================================================


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ① 配置（初始为 null，等待用户配置初始化）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const VOICE_CONFIG = {
  voiceId:  null,  // 初始 null，禁止写死默认值，等待用户配置初始化
  modelId:  null,  // 初始 null，禁止写死默认值，等待用户配置初始化
  voiceSettings: {
    stability:         0.75,
    similarity_boost:  0.82,
  },
  apiEndpoint: '/api/tts',
  cacheMax: 30,
  voiceChance: 0.22,            // 日常触发概率
  minIntimacyForVoice: 20,      // 最低亲密度
  maxTextLengthForVoice: 65,    // 超过这个字数不触发（语音条适合短句）
};

// 平台默认配置（仅在用户无配置时使用）
const PLATFORM_DEFAULTS = {
  voiceId: 'QHVs2huJe5wggzgIHMIi',
  modelId: 'eleven_v4',  // V1.1 更新为 v4
};

// 用户配置初始化标志
let _userConfigLoaded = false;

// 初始化用户语音配置（在页面加载后调用）
async function initUserVoiceConfig() {
  if (_userConfigLoaded) return;

  try {
    const { data: { session } } = await window.sbClient.auth.getSession();
    if (!session) {
      // 未登录：使用平台默认
      VOICE_CONFIG.voiceId = PLATFORM_DEFAULTS.voiceId;
      VOICE_CONFIG.modelId = PLATFORM_DEFAULTS.modelId;
      _userConfigLoaded = true;
      return;
    }

    const res = await fetch('/api/voice-config', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    });

    if (res.ok) {
      const config = await res.json();
      // 用户配置优先
      VOICE_CONFIG.voiceId = config.voice_id || PLATFORM_DEFAULTS.voiceId;
      VOICE_CONFIG.modelId = config.model_id || PLATFORM_DEFAULTS.modelId;
      _userConfigLoaded = true;
    } else {
      // 读取失败：使用平台默认
      VOICE_CONFIG.voiceId = PLATFORM_DEFAULTS.voiceId;
      VOICE_CONFIG.modelId = PLATFORM_DEFAULTS.modelId;
      _userConfigLoaded = true;
    }
  } catch (e) {
    console.warn('[voice] Failed to load user config:', e?.message);
    // 异常：使用平台默认
    VOICE_CONFIG.voiceId = PLATFORM_DEFAULTS.voiceId;
    VOICE_CONFIG.modelId = PLATFORM_DEFAULTS.modelId;
    _userConfigLoaded = true;
  }
}

// 页面加载时自动初始化
if (typeof window !== 'undefined' && window.sbClient) {
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(initUserVoiceConfig, 1000);
  });

  // 监听登录状态变化，清空缓存并重新加载配置
  window.sbClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
      console.log('[voice] Auth state changed, clearing cache and reloading config');
      clearVoiceCache();
      _userConfigLoaded = false;
      initUserVoiceConfig();
    }
  });
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ② 音频缓存（按 user_id + voice_id + model_id + text 隔离）
// 修复：不同用户/配置不能复用音频，账号切换/配置更新自动失效
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const _voiceCache = new Map();
let _currentCacheKey = null; // 当前缓存配置标识（user_id + voice_id + model_id）

// 生成缓存键：user_id + voice_id + model_id + text
function _vcKey(text, userId, voiceId, modelId) {
  const configKey = `${userId || 'anon'}:${voiceId || 'default'}:${modelId || 'default'}`;
  const textKey = (text || '').trim().slice(0, 80);
  return `${configKey}:${textKey}`;
}

// 获取缓存
function _vcGet(text, userId, voiceId, modelId) {
  const key = _vcKey(text, userId, voiceId, modelId);
  return _voiceCache.get(key) || null;
}

// 设置缓存
function _vcSet(text, url, userId, voiceId, modelId) {
  if (!text || !url) return;
  const key = _vcKey(text, userId, voiceId, modelId);
  _voiceCache.set(key, url);

  // 更新当前配置标识
  const configKey = `${userId || 'anon'}:${voiceId || 'default'}:${modelId || 'default'}`;
  if (_currentCacheKey && _currentCacheKey !== configKey) {
    // 配置变更：清空旧配置的缓存
    clearVoiceCache();
  }
  _currentCacheKey = configKey;

  // LRU 淘汰
  if (_voiceCache.size > VOICE_CONFIG.cacheMax) {
    const oldKey = _voiceCache.keys().next().value;
    const oldUrl = _voiceCache.get(oldKey);
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    _voiceCache.delete(oldKey);
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ③ TTS 调用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// V1.2：智能截断 - 按句子边界截断，避免切断关键情绪词
function smartTruncate(text, maxLen) {
  if (!text || text.length <= maxLen) return text;

  // 1. 优先在句号、问号、感叹号截断（保留完整句子）
  const sentenceEndRegex = /[.!?]+\s*/g;
  let lastEnd = 0;
  let match;

  while ((match = sentenceEndRegex.exec(text)) !== null) {
    if (match.index + match[0].length <= maxLen) {
      lastEnd = match.index + match[0].length;
    } else {
      break;
    }
  }

  // 如果找到合理的句子边界（至少截取了 60%）
  if (lastEnd > maxLen * 0.6) {
    return text.slice(0, lastEnd).trim();
  }

  // 2. 否则在逗号、省略号截断
  const phraseEndRegex = /[,;]\s*|\.\.\.\s*/g;
  lastEnd = 0;

  while ((match = phraseEndRegex.exec(text)) !== null) {
    if (match.index + match[0].length <= maxLen) {
      lastEnd = match.index + match[0].length;
    } else {
      break;
    }
  }

  if (lastEnd > maxLen * 0.6) {
    return text.slice(0, lastEnd).trim();
  }

  // 3. 最后在空格截断（避免切断单词）
  const spaceIdx = text.slice(0, maxLen).lastIndexOf(' ');
  if (spaceIdx > maxLen * 0.7) {
    return text.slice(0, spaceIdx).trim();
  }

  // 4. 兜底：硬切
  return text.slice(0, maxLen).trim();
}

async function generateVoice(text, customVoiceId, customModelId) {
  if (!text || !text.trim()) return null;

  try {
    // 获取 Supabase Access Token + User ID
    let userId = null;
    const headers = { 'Content-Type': 'application/json' };
    if (window.sbClient) {
      try {
        const { data: { session } } = await window.sbClient.auth.getSession();
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
          userId = session.user?.id || null;
        }
      } catch (authErr) {
        console.warn('[voice] Failed to get auth token:', authErr?.message);
      }
    }

    // 如果没有 token，请求会被后端拒绝（401）
    if (!headers['Authorization']) {
      console.warn('[voice] No access token available, TTS will fail');
      return null;
    }

    // 确定使用的 voice_id 和 model_id
    // 优先级：调用参数 > 用户配置(VOICE_CONFIG) > 平台默认
    const finalVoiceId = customVoiceId || VOICE_CONFIG.voiceId || PLATFORM_DEFAULTS.voiceId;
    const finalModelId = customModelId || VOICE_CONFIG.modelId || PLATFORM_DEFAULTS.modelId;

    // 检查缓存（按 user + voice_id + model_id + text 隔离）
    const cached = _vcGet(text, userId, finalVoiceId, finalModelId);
    if (cached) return cached;

    // V1.2：智能截断替代硬切
    const truncatedText = smartTruncate(text.trim(), 500);

    const res = await fetchWithTimeout(VOICE_CONFIG.apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text: truncatedText,
        voice_id: finalVoiceId,
        model_id: finalModelId,
        voice_settings: VOICE_CONFIG.voiceSettings,
      }),
    }, 18000);

    if (!res.ok) {
      // 401 = 鉴权失败（可能是语音 Key 失效，而非登录过期）
      if (res.status === 401) {
        const errData = await res.json().catch(() => ({}));
        // 区分：语音 Key 失效 vs 登录过期
        if (errData.error && errData.error.includes('API Key')) {
          console.warn('[voice] Voice API Key invalid:', errData.error);
        } else {
          console.warn('[voice] TTS authentication failed (401)');
        }
      }
      console.warn('[voice] TTS HTTP', res.status);
      return null;
    }

    const blob = await res.blob();
    if (!blob || blob.size < 100) return null;
    const url = URL.createObjectURL(blob);
    _vcSet(text, url, userId, finalVoiceId, finalModelId);
    return url;
  } catch (e) {
    console.warn('[voice] generateVoice error:', e?.message);
    return null;
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ④ 全局播放管理（同时只播一条）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let _globalAudio  = null;
let _globalStopFn = null;

function _stopCurrent() {
  if (_globalStopFn) { _globalStopFn(); _globalStopFn = null; }
  if (_globalAudio)  { _globalAudio.pause(); _globalAudio.currentTime = 0; _globalAudio = null; }
}

// 防 XSS
function _esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ③-B 缓存清理：配置变更或退出登录时清空音频缓存
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function clearVoiceCache() {
  _voiceCache.forEach(url => {
    try { URL.revokeObjectURL(url); } catch(e) {}
  });
  _voiceCache.clear();
  _currentCacheKey = null;
}
window.clearVoiceCache = clearVoiceCache;

// 暴露 generateVoice（供约会场景等调用）
window.generateVoiceWithConfig = generateVoice;


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⑤ 日常聊天：语音条组件
//
//  外观：
//  ┌──────────────────────────────────┐
//  │ [▶]  ▁▃▅▇▅▃▁  0:03  [文字]      │
//  │ （点"文字"后展开）               │
//  │ "yeah. don't overthink it."      │
//  └──────────────────────────────────┘
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function createVoiceBar(text) {
  const wrap = document.createElement('div');
  wrap.className = 'vc-bar-wrap';

  const bars = [3,5,8,11,13,11,8,5,3].map(h =>
    `<span class="vc-bar" style="height:${h}px"></span>`
  ).join('');

  wrap.innerHTML = `
    <div class="vc-bar-main">
      <button class="vc-play-btn" aria-label="播放">
        <svg class="vc-icon-play" viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
        <svg class="vc-icon-pause" viewBox="0 0 24 24" width="15" height="15" fill="currentColor" style="display:none">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
        </svg>
        <span class="vc-icon-spin" style="display:none" aria-hidden="true"></span>
      </button>
      <div class="vc-waveform">${bars}</div>
      <span class="vc-duration">—</span>
      <button class="vc-txt-btn">文字</button>
    </div>
    <div class="vc-transcript" style="display:none">${_esc(text)}</div>
  `;

  const playBtn   = wrap.querySelector('.vc-play-btn');
  const iPlay     = wrap.querySelector('.vc-icon-play');
  const iPause    = wrap.querySelector('.vc-icon-pause');
  const iSpin     = wrap.querySelector('.vc-icon-spin');
  const durEl     = wrap.querySelector('.vc-duration');
  const txtBtn    = wrap.querySelector('.vc-txt-btn');
  const transcript= wrap.querySelector('.vc-transcript');

  let _url = null, _audio = null, _loading = false, _txtShown = false;

  function _fmt(s) {
    if (!isFinite(s) || s < 0) return '—';
    return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  }
  function _setIdle()    { iPlay.style.display=''; iPause.style.display='none'; iSpin.style.display='none'; wrap.classList.remove('vc-playing'); }
  function _setPlaying() { iPlay.style.display='none'; iPause.style.display=''; iSpin.style.display='none'; wrap.classList.add('vc-playing'); }
  function _setLoading() { iPlay.style.display='none'; iPause.style.display='none'; iSpin.style.display=''; wrap.classList.remove('vc-playing'); }

  async function _play() {
    if (_loading) return;
    _stopCurrent();
    if (!_url) {
      _loading = true; _setLoading();
      _url = await generateVoice(text);
      _loading = false;
      if (!_url) { _setIdle(); return; }
    }
    _audio = new Audio(_url);
    _globalAudio  = _audio;
    _globalStopFn = () => { _audio.pause(); _setIdle(); };
    _audio.onloadedmetadata = () => { durEl.textContent = _fmt(_audio.duration); };
    _audio.ontimeupdate     = () => { durEl.textContent = _fmt(_audio.currentTime); };
    _audio.onended  = () => { _setIdle(); durEl.textContent = _fmt(_audio.duration); _globalAudio = null; _globalStopFn = null; };
    _audio.onerror  = () => { _setIdle(); _globalAudio = null; };
    _setPlaying();
    _audio.play().catch(() => _setIdle());
  }

  playBtn.addEventListener('click', () => {
    if (_audio && !_audio.paused) { _audio.pause(); _setIdle(); }
    else _play();
  });

  // 转文字按钮
  txtBtn.addEventListener('click', () => {
    _txtShown = !_txtShown;
    transcript.style.display = _txtShown ? 'block' : 'none';
    txtBtn.classList.toggle('vc-txt-active', _txtShown);
    txtBtn.textContent = _txtShown ? '收起' : '文字';
  });

  // 按需合成：仅在用户点击播放时请求 TTS，避免消耗用户额度。

  return wrap;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⑥ 为消息添加语音按钮（不主动生成，点击时才调用 TTS）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function addVoiceButtonToMessage(contentDiv, messageText, voiceText) {
  if (!contentDiv || !messageText || !messageText.trim()) return;

  // 过滤：超长文本不适合语音
  if (messageText.length > 300) return;

  // V1.2：优先使用 voiceText（TTS 专用），否则降级到 messageText
  const textForTTS = voiceText || messageText;

  const voiceBtn = document.createElement('button');
  voiceBtn.type = 'button';
  voiceBtn.className = 'message-voice-btn';
  voiceBtn.setAttribute('aria-label', '播放语音');
  voiceBtn.title = '播放语音';

  // 复古线稿小喇叭 SVG（奶油信纸风格）
  voiceBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M11 5L6 9H2v6h4l5 4V5z"/>
      <path d="M15.5 8.5c.8.8 1.3 2 1.3 3.2s-.5 2.4-1.3 3.2"/>
      <path d="M18.4 5.6a9 9 0 0 1 0 12.8"/>
    </svg>
  `;

  let _url = null;
  let _audio = null;
  let _loading = false;

  async function _play() {
    if (_loading) return;
    _stopCurrent();

    // 首次点击：生成语音（使用 voiceText）
    if (!_url) {
      _loading = true;
      voiceBtn.classList.add('voice-btn-loading');
      _url = await generateVoice(textForTTS);
      _loading = false;
      voiceBtn.classList.remove('voice-btn-loading');

      if (!_url) {
        voiceBtn.classList.add('voice-btn-error');
        setTimeout(() => voiceBtn.classList.remove('voice-btn-error'), 2000);
        return;
      }
    }

    // 播放
    _audio = new Audio(_url);
    _globalAudio = _audio;
    _globalStopFn = () => {
      _audio.pause();
      voiceBtn.classList.remove('voice-btn-playing');
    };

    voiceBtn.classList.add('voice-btn-playing');

    _audio.onended = () => {
      voiceBtn.classList.remove('voice-btn-playing');
      _globalAudio = null;
      _globalStopFn = null;
    };

    _audio.onerror = () => {
      voiceBtn.classList.remove('voice-btn-playing');
      voiceBtn.classList.add('voice-btn-error');
      setTimeout(() => voiceBtn.classList.remove('voice-btn-error'), 2000);
      _globalAudio = null;
    };

    _audio.play().catch(() => {
      voiceBtn.classList.remove('voice-btn-playing');
    });
  }

  voiceBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (_audio && !_audio.paused) {
      _audio.pause();
      voiceBtn.classList.remove('voice-btn-playing');
    } else {
      _play();
    }
  });

  // 插入到 contentDiv（在 inner-thought 之前）
  const innerThought = contentDiv.querySelector('.inner-thought');
  if (innerThought) {
    contentDiv.insertBefore(voiceBtn, innerThought);
  } else {
    contentDiv.appendChild(voiceBtn);
  }
}

window.addVoiceButtonToMessage = addVoiceButtonToMessage;


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⑦ 旧版：追加独立语音消息到聊天框（已废弃，保留向后兼容）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function appendVoiceMessage(text) {
  const container = document.getElementById('messagesContainer');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'message bot-message vc-message-row';

  // 头像（和普通 bot 消息保持一致）
  const av = document.createElement('div');
  av.className = 'message-avatar bot-avatar';
  av.innerHTML = `<img src="images/ghost-avatar.jpg" class="ghost-avatar-img" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">`;

  row.appendChild(av);
  row.appendChild(createVoiceBar(text));
  container.appendChild(row);
  requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
}
window.appendVoiceMessage = appendVoiceMessage;


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⑦ 日常聊天：Ghost 回复后随机触发语音条
//    用法：在 sendMessage.js 的 appendMessage('bot', reply) 后面加：
//      maybeTriggerVoice(reply);
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function maybeTriggerVoice(botReply) {
  if (!botReply || botReply.length > VOICE_CONFIG.maxTextLengthForVoice) return;
  const intimacy = (typeof getTrustHeat === 'function') ? getTrustHeat() : 50;
  if (intimacy < VOICE_CONFIG.minIntimacyForVoice) return;
  if (Math.random() > VOICE_CONFIG.voiceChance) return;

  // 每天最多触发5条语音
  const _dayKey = 'voiceCount_' + new Date().toDateString();
  const _todayCount = parseInt(localStorage.getItem(_dayKey) || '0');
  if (_todayCount >= 5) return;
  localStorage.setItem(_dayKey, _todayCount + 1);

  setTimeout(() => appendVoiceMessage(botReply), 900);
}
window.maybeTriggerVoice = maybeTriggerVoice;


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⑧ 约会场景：给每条 Ghost 气泡注入小喇叭🔊
//    外观：气泡右下角一个小圆形喇叭按钮
//    dates_voice_patch.js 在 renderDateScene 后会自动调用此函数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function installDateVoiceButtons() {
  const container = document.getElementById('dateSceneBubbles');
  if (!container) return;

  container.querySelectorAll('.date-bubble-ghost:not([data-vi])').forEach(bubble => {
    bubble.dataset.vi = '1';

    const textEl = bubble.querySelector('.date-bubble-text');
    const text = textEl ? textEl.textContent.trim() : '';
    if (!text) return;

    const btn = document.createElement('button');
    btn.className = 'date-spk-btn';
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`;
    btn.type = 'button';
    btn.setAttribute('aria-label', '播放 Ghost 的声音');
    btn.title = '播放 Ghost 的声音';

    let _url = null, _audio = null, _loading = false;

    btn.addEventListener('click', async () => {
      if (_loading) return;

      // 正在播 → 停止
      if (_audio && !_audio.paused) {
        _audio.pause(); _audio.currentTime = 0;
        btn.classList.remove('date-spk-playing');
        return;
      }

      _stopCurrent();

      if (!_url) {
        _loading = true;
        btn.classList.add('date-spk-loading');
        _url = await generateVoice(text);
        _loading = false;
        btn.classList.remove('date-spk-loading');
        if (!_url) return;
      }

      _audio = new Audio(_url);
      _globalAudio  = _audio;
      _globalStopFn = () => { _audio.pause(); btn.classList.remove('date-spk-playing'); };

      _audio.onended = () => {
        btn.classList.remove('date-spk-playing');
        _globalAudio = null; _globalStopFn = null;
      };
      _audio.onerror = () => { btn.classList.remove('date-spk-playing'); _globalAudio = null; };

      btn.classList.add('date-spk-playing');
      _audio.play().catch(() => btn.classList.remove('date-spk-playing'));

    });

    bubble.appendChild(btn);
  });
}
window.installDateVoiceButtons = installDateVoiceButtons;

// 每秒检查一次约会页面，有气泡就注入喇叭
// 解决：patch 安装前 renderDateScene 已经跑了，气泡没有喇叭的问题
setInterval(() => {
  const screen = document.getElementById('dateSceneScreen');
  if (screen && screen.classList.contains('active')) {
    installDateVoiceButtons();
  }
}, 1000);


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⑨ 后端路由参考（复制到 api/tts.js）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/*
  export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    const { text, voice_id, model_id, voice_settings } = req.body;
    if (!text) return res.status(400).json({ error: 'no text' });
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': process.env.ELEVENLABS_API_KEY },
        body: JSON.stringify({ text, model_id, voice_settings }),
      }
    );
    if (!upstream.ok) return res.status(upstream.status).json({ error: await upstream.text() });
    const buf = await upstream.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(Buffer.from(buf));
  }
*/
