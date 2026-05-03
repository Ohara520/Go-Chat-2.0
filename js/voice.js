// ============================================================
// voice.js — 语音功能 v2.0
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
// ① 配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const VOICE_CONFIG = {
  voiceId:  'QHVs2huJe5wggzgIHMIi',
  modelId:  'eleven_turbo_v2_5',
  voiceSettings: {
    stability:         0.75,
    similarity_boost:  0.82,
    style:             0.12,
    use_speaker_boost: true
  },
  apiEndpoint: '/api/tts',
  cacheMax: 30,
  voiceChance: 0.22,            // 日常触发概率
  minIntimacyForVoice: 20,      // 最低亲密度
  maxTextLengthForVoice: 65,    // 超过这个字数不触发（语音条适合短句）
};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ② 音频缓存（text → blob URL）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const _voiceCache = new Map();

function _vcKey(text) { return (text || '').trim().slice(0, 80); }
function _vcGet(text) { return _voiceCache.get(_vcKey(text)) || null; }
function _vcSet(text, url) {
  if (!text || !url) return;
  _voiceCache.set(_vcKey(text), url);
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

async function generateVoice(text) {
  if (!text || !text.trim()) return null;
  const cached = _vcGet(text);
  if (cached) return cached;
  try {
    const res = await fetchWithTimeout(VOICE_CONFIG.apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text:           text.trim().slice(0, 500),
        voice_id:       VOICE_CONFIG.voiceId,
        model_id:       VOICE_CONFIG.modelId,
        voice_settings: VOICE_CONFIG.voiceSettings,
      }),
    }, 18000);
    if (!res.ok) { console.warn('[voice] TTS HTTP', res.status); return null; }
    const blob = await res.blob();
    if (!blob || blob.size < 100) return null;
    const url = URL.createObjectURL(blob);
    _vcSet(text, url);
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
        <span class="vc-icon-spin" style="display:none">…</span>
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

  // 预加载
  setTimeout(() => generateVoice(text), 300);

  return wrap;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⑥ 追加语音消息到聊天框
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
    btn.innerHTML = `🔊`;
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

      // 顺手预热下一条
      const all = [...container.querySelectorAll('.date-bubble-ghost')];
      const idx = all.indexOf(bubble);
      if (idx >= 0 && idx + 1 < all.length) {
        const nxt = all[idx+1].querySelector('.date-bubble-text')?.textContent.trim();
        if (nxt) generateVoice(nxt);
      }
    });

    bubble.appendChild(btn);
  });
}
window.installDateVoiceButtons = installDateVoiceButtons;


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
