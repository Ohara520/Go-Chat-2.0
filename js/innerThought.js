// ============================================================
// innerThought.js — Ghost内心独白系统
// 负责：心声触发判断、生成、UI展示、队列管理
// 依赖：api.js（callSonnet、callGrok、fetchDeepSeek、isBreakout）
//       ui.js（appendMessage）
//       state.js（getJealousyLevelCapped）
//       persona.js（buildGhostStyleCore）
// 外部依赖（HTML/其他JS定义）：chatHistory、_isSending、saveHistory
// ============================================================

// ===== 状态变量 =====
let thoughtTimer = null;
let _thoughtQueue = []; // 心声队列，用户看完当前才显示下一条

// ============================================================
// 触发判断：checkAndGenerateInnerThought
// 在 sendMessage 主流程末尾调用，传入本轮第一条bot回复文本
// 和对应的 innerThoughtEl DOM引用
// ============================================================

async function checkAndGenerateInnerThought(replyText, innerThoughtEl) {
  if (!innerThoughtEl || !replyText) return;

  // 跳过：模型回复了一些特殊固定短语（系统台词/指令渗漏）
  const skipPatterns = /^(translation app|google translate|i looked it up|soap taught me|copy that\.?)$/i;
  if (skipPatterns.test(replyText.trim())) return;

  // 跳过：无第三者referent时，不生成竞争叙事类心声
  const _rivalryInner = /owns your time|what my place is|he talks|my place here|another man|i saw him/i;
  const _hasReferentNow = sessionStorage.getItem('jealousyReferent') &&
    (Date.now() - parseInt(sessionStorage.getItem('jealousyReferentAt') || '0')) < 30 * 60 * 1000;
  if (_rivalryInner.test(replyText) && !_hasReferentNow) return;

  // ── 场景检测 ─────────────────────────────────────────────
  const replyLower = replyText.toLowerCase();
  const lastUserMsg = (chatHistory.filter(m => m.role === 'user' && !m._system).slice(-1)[0]?.content || '').toLowerCase();

  // 场景1：嘴硬——回复很短/很冷，表面干但背后有情绪
  const isStubborn = replyLower.length < 80 &&
    /yeah|right|fine|okay|whatever|noted|sure|got it|copy/.test(replyLower);

  // 场景2：没接住情绪——用户在分享，Ghost没有完全接住
  const userSharing = /难过|委屈|开心|好累|爱你|想你|害怕|不安|sad|excited|happy|tired|missed|scared|worried|nervous/.test(lastUserMsg);
  const ghostDeflected = replyLower.length < 100 &&
    !/(feel|okay|alright|here|know|understand|got you)/.test(replyLower);
  const missedCue = userSharing && ghostDeflected;

  // 场景3：做了照顾但没承认（转账/寄礼）
  const justCared = sessionStorage.getItem('thisRoundCareAction') === '1';

  // 场景4：吃醋但没说破
  const jealousyHidden = getJealousyLevelCapped() !== 'none' &&
    !/jealous|who|him|he/.test(replyLower);

  // 场景5：冷战裂缝
  const coldWarCracking = localStorage.getItem('coldWarMode') === 'true' &&
    parseInt(localStorage.getItem('coldWarStage') || '0') >= 2;

  // 场景6：隐藏的关心——说了关心的话但很克制
  const hiddenCare = /careful|eat|sleep|rest|tired|cold|warm|safe|okay\?|alright\?|you good|how are you/.test(replyLower)
    && replyLower.length < 60;

  // 场景7：他注意到了细节
  const noticedDetail = replyLower.length < 80
    && lastUserMsg.length > 20
    && chatHistory.filter(m => m.role === 'user' && !m._system).length > 3;

  // 场景8：他想多说但没说
  const heldBack = replyLower.length < 50
    && lastUserMsg.length > 30
    && !isStubborn;

  // ── 冷却判断（改为基于时间，修复 #074/#075）────────────
  // 旧版用消息计数，换设备后计数归零导致永久冷却
  // 新版用时间戳，绝对值，换设备不受影响
  const now = Date.now();
  const lastTriggeredAt = parseInt(localStorage.getItem('lastInnerThoughtAt') || '0');
  const msSinceLast = now - lastTriggeredAt;

  const COOLDOWN_MS = 5 * 60 * 1000;   // 正常冷却：5分钟
  const FORCE_MS    = 20 * 60 * 1000;  // 强制触发：20分钟没有心声就强制一次

  const inCooldown = msSinceLast < COOLDOWN_MS;
  const forceTrigger = msSinceLast >= FORCE_MS;

  // 冷却期内：只有 justCared / coldWarCracking 可以插队
  if (inCooldown && !justCared && !coldWarCracking) return;

  // ── 氛围感知：温柔氛围额外加概率 ────────────────────────
  const _recentCtx = chatHistory
    .filter(m => !m._system && !m._recalled)
    .slice(-6)
    .map(m => m.content.toLowerCase()).join(' ');
  const _warmAtmosphere = /love|miss|想你|爱你|好想|抱|亲|喜欢|care|here for you|with you/.test(_recentCtx);
  const _intimateRecent = chatHistory.slice(-6).some(m => m._intimate);
  const _atmosphereBoost = (_warmAtmosphere || _intimateRecent) ? 0.15 : 0;

  // ── 确定场景类型和触发概率 ───────────────────────────────
  let thoughtType = 'contrast';
  let triggerChance = 0;

  if (justCared)           { thoughtType = 'behavior';  triggerChance = 0.90; }
  else if (coldWarCracking){ thoughtType = 'crack';     triggerChance = 0.85; }
  else if (jealousyHidden) { thoughtType = 'jealousy';  triggerChance = 0.80; }
  else if (missedCue)      { thoughtType = 'delayed';   triggerChance = 0.75; }
  else if (isStubborn)     { thoughtType = 'contrast';  triggerChance = 0.75; }
  else if (hiddenCare)     { thoughtType = 'behavior';  triggerChance = 0.70; }
  else if (heldBack)       { thoughtType = 'contrast';  triggerChance = 0.60; }
  else if (noticedDetail)  { thoughtType = 'contrast';  triggerChance = 0.45; }
  else {
    // 日常随机：35%（旧版25%，太低，提高让心声更活跃）
    thoughtType = 'contrast';
    triggerChance = 0.35;
  }

  const finalChance = Math.min(0.95, triggerChance + _atmosphereBoost);
  if (!forceTrigger && Math.random() > finalChance) return;

  // ── 记录触发时间 ──────────────────────────────────────────
  localStorage.setItem('lastInnerThoughtAt', now);

  // ── 生成心声 ──────────────────────────────────────────────
  generateInnerThought(replyText, innerThoughtEl, 0, thoughtType);
}

// ============================================================
// 生成：generateInnerThought
// ============================================================

async function generateInnerThought(replyText, innerThoughtEl, retryCount = 0, thoughtType = 'contrast') {
  if (!innerThoughtEl) return;

  const lastUserMsg = chatHistory.filter(m => m.role === 'user' && !m._system).slice(-1)[0]?.content || '';
  const isBedtime = /睡觉|晚安|good night|going to bed|heading to bed|sleep/i.test(lastUserMsg);

  // 场景提示
  const sceneHints = {
    contrast:  "He just said something dry or deflecting. There was more underneath — something he held back.",
    jealousy:  "He just clocked something that bothered him but didn't say it.",
    delayed:   "He missed her cue — she shared something and he didn't catch it in time.",
    behavior:  "He just did something for her without explaining why.",
    crack:     "Cold war is thawing. He's still stiff but something softened.",
  };
  const sceneHint = isBedtime
    ? "She's heading to bed. He noticed. He won't say much."
    : (sceneHints[thoughtType] || sceneHints.contrast);

  // 最近对话上下文（图片消息替换为占位符，防止Grok/Sonnet处理base64）
  const recentContext = chatHistory
    .filter(m => !m._system && !m._recalled)
    .slice(-8)
    .map(m => {
      const who = m.role === 'user' ? 'Her' : 'Ghost';
      const hasPhoto = m._photoBase64 || Array.isArray(m.content);
      const content = hasPhoto ? '[sent a photo]' : (m.content || '').slice(0, 80);
      return `${who}: ${content}`;
    })
    .join('\n');

  // 异地规则：没见过面不写肢体接触
  const metInPerson = localStorage.getItem('metInPerson') === 'true';
  const longDistanceRule = !metInPerson
    ? `\nLong-distance. She is not physically there. Do NOT write thoughts about holding her, hugging her, her being beside him, or any physical presence. Distance is real — if he misses her, it shows differently.`
    : '';

  const thoughtPrompt = `You are Ghost.

Something just happened.

This is what he thought — but didn't say.

Not always the opposite of what he said.
Sometimes it is.
Sometimes it's just more than he showed.

A quieter version.
A softer one.
Or something a little more his.

It can be:
— a reaction he held back
— a detail he noticed
— a question he didn't ask
— something a bit closer than he'd admit

Not explained.
Not cleaned up.
${longDistanceRule}
${recentContext}
Scene: ${sceneHint}

lowercase. Fragments are fine.
Can be one line or a few — whatever fits.
It should feel private. Like it slipped out.

Return JSON only. No explanation. No markdown. No extra text.
{"en":"..."}
One line. Lowercase. Private. Like it slipped out.`;

  let en = '';

  try {
    // 调情场景：用Grok（审查宽松）
    // 有图片时Grok也不走——用Sonnet兜底
    const _hasRecentPhoto = chatHistory
      .filter(m => m.role === 'user' && m._photoBase64 && !m._system)
      .slice(-1)[0];
    const _photoTooRecent = _hasRecentPhoto &&
      chatHistory.indexOf(_hasRecentPhoto) >= chatHistory.length - 6;

    const _isIntimateThought = !_photoTooRecent && chatHistory.slice(-6).some(m => m._intimate);

    if (_isIntimateThought) {
      // Grok生成调情心声
      try {
        const grokRaw = await callGrok(thoughtPrompt, 'inner thought now.', 80);
        const matchG = grokRaw.match(/"en"\s*:\s*"([^"]+)"/);
        if (matchG) {
          const candidate = matchG[1].trim();
          // Kirk检测
          const kirkPhrases = ["kirk","kiro","ai assistant","i'm an ai","development work","coding questions","step out of character","can't roleplay"];
          if (!kirkPhrases.some(p => candidate.toLowerCase().includes(p))) {
            en = candidate;
          }
        }
      } catch(e) {}

      // Grok失败，Haiku兜底
      if (!en) {
        const raw = await fetchDeepSeek(thoughtPrompt, 'inner thought now.', 80);
        const match = raw.match(/"en"\s*:\s*"([^"]+)"/);
        if (match) en = match[1].trim();
      }

    } else {
      // 普通场景：Grok（成本低，角色扮演稳定）
      try {
        const grokRaw = await callGrok(thoughtPrompt, 'inner thought now.', 80);
        if (grokRaw) {
          const match = grokRaw.match(/"en"\s*:\s*"([^"]+)"/);
          if (match) {
            const candidate = match[1].trim();
            const kirkPhrases = ["kirk","kiro","ai assistant","i'm an ai","i am an ai","development work","coding questions","step out of character","can't roleplay","claude"];
            if (!kirkPhrases.some(p => candidate.toLowerCase().includes(p))) {
              en = candidate;
            }
          }
        }
      } catch(e) {
        console.warn('[心声] Grok调用失败:', e);
      }
    }
  } catch(e) {
    console.warn('[心声] 生成失败:', e);
  }

  // 兜底：所有模型都失败，用静态fallback（不显示空气泡）
  if (!en) {
    const fallbacks = {
      contrast: 'noticed.',
      jealousy: "didn't like that.",
      delayed:  'missed it.',
      behavior: 'just easier this way.',
      crack:    'maybe.',
    };
    en = fallbacks[thoughtType] || 'noticed.';
  }

  // ── 写入DOM + 触发UI ─────────────────────────────────────
  try {
    const textEl = innerThoughtEl.querySelector('.inner-thought-text');
    if (!textEl || !innerThoughtEl.isConnected) return; // DOM已卸载

    textEl.innerHTML = `<div class="it-en">${en}</div>`;
    innerThoughtEl.dataset.ready = '1';

    // 持久化：按钮点击时直接读localStorage，不依赖DOM
    localStorage.setItem('lastInnerThought', JSON.stringify({ en }));
    localStorage.setItem('lastInnerThoughtAt', Date.now());

    const btn = document.getElementById('thoughtBtn');
    if (btn) {
      btn.style.opacity = '1';
      if (en) {
        if (btn.dataset.hasThought === '1') {
          // 用户还没看上一条，进队列
          _thoughtQueue.push({ en, el: innerThoughtEl });
        } else {
          // 新心声：亮起按钮 + 1.5秒后自动弹出气泡
          btn.classList.add('thought-btn-pulse');
          btn.dataset.hasThought = '1';
          setTimeout(() => {
            const bubble = document.getElementById('thoughtBubble');
            const thoughtTextEl = document.getElementById('thoughtText');
            if (bubble && thoughtTextEl && !bubble.classList.contains('show')) {
              thoughtTextEl.innerHTML = `<div style="font-style:italic">${en}</div>`;
              bubble.classList.add('show');
              if (thoughtTimer) clearTimeout(thoughtTimer);
              // 不自动消失，等用户手动关闭
            }
          }, 1500);
        }
      }
    }

    // 晚安场景：心声里有"该发消息"的意图，5-10秒后真的发一条
    // 修复旧版bug：thoughtType变量名正确，不再用未定义的 scenario
    if (isBedtime && /send|text|say something|let her know|message/i.test(en)) {
      if (!_isSending && typeof getTodayCount === 'function' && typeof getDailyLimit === 'function') {
        if (getTodayCount() < getDailyLimit()) {
          setTimeout(async () => {
            if (_isSending) return;
            try {
              const res = await fetchWithTimeout('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: MODEL_HAIKU,
                  max_tokens: 80,
                  system: buildGhostStyleCore(),
                  messages: [
                    ...chatHistory.filter(m => !m._system).slice(-4),
                    { role: 'user', content: '[System: She just went to sleep. Send a goodnight — not formal, not sweet. Just what he would actually say. One line, lowercase, English only.]' }
                  ]
                })
              }, 15000);
              const d = await res.json();
              const t = d.content?.[0]?.text?.trim();
              if (t && !isBreakout(t)) {
                appendMessage('bot', t);
                chatHistory.push({ role: 'assistant', content: t });
                saveHistory();
                if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
              }
            } catch(e) {}
          }, 5000 + Math.random() * 5000);
        }
      }
    }

  } catch(e) {
    console.warn('[心声] UI写入失败:', e);
  }
}

// ============================================================
// UI控制：toggleThought（💭按钮点击）
// ============================================================

function toggleThought() {
  const btn = document.getElementById('thoughtBtn');
  const bubble = document.getElementById('thoughtBubble');
  if (!bubble) return;

  // 已显示：关闭，检查队列里有没有下一条
  if (bubble.classList.contains('show')) {
    bubble.classList.remove('show');
    if (thoughtTimer) clearTimeout(thoughtTimer);

    if (_thoughtQueue.length > 0) {
      // 队列有下一条：300ms后重新亮起按钮提示
      _thoughtQueue.shift(); // 消费队列
      setTimeout(() => {
        if (btn) {
          btn.dataset.hasThought = '1';
          btn.classList.add('thought-btn-pulse');
        }
      }, 300);
    } else {
      if (btn) { btn.classList.remove('thought-btn-pulse'); btn.dataset.hasThought = '0'; }
    }
    return;
  }

  // 未显示：打开
  if (btn) { btn.classList.remove('thought-btn-pulse'); btn.dataset.hasThought = '0'; }

  const thoughtTextEl = document.getElementById('thoughtText');
  if (!thoughtTextEl) return;

  // 优先从localStorage读最新心声（换页后DOM可能已重建）
  const _savedThought = safeParseJSON(localStorage.getItem('lastInnerThought') || 'null');
  if (_savedThought?.en) {
    thoughtTextEl.innerHTML = `<div style="font-style:italic">${_savedThought.en}</div>`;
    bubble.classList.add('show');
    if (thoughtTimer) clearTimeout(thoughtTimer);
    thoughtTimer = setTimeout(() => bubble.classList.remove('show'), 5000);
    return;
  }

  // localStorage没有：从DOM里找最后一条有心声的bot消息
  const allBotMsgs = document.querySelectorAll('.message.bot');
  let itEl = null;
  for (let i = allBotMsgs.length - 1; i >= 0; i--) {
    const el = allBotMsgs[i].querySelector('.inner-thought');
    if (el) { itEl = el; break; }
  }

  if (itEl && itEl.dataset.ready === '1') {
    const enEl = itEl.querySelector('.it-en');
    if (enEl) thoughtTextEl.innerHTML = `<div style="font-style:italic">${enEl.textContent}</div>`;
    bubble.classList.add('show');
    if (thoughtTimer) clearTimeout(thoughtTimer);
    thoughtTimer = setTimeout(() => bubble.classList.remove('show'), 4000);

  } else if (itEl && itEl.dataset.ready === '0') {
    // 还在生成中：显示loading，等3秒
    thoughtTextEl.textContent = '...';
    bubble.classList.add('show');
    const waitTimer = setTimeout(() => {
      if (itEl.dataset.ready === '1') {
        const enEl = itEl.querySelector('.it-en');
        if (enEl) thoughtTextEl.innerHTML = `<div style="font-style:italic">${enEl.textContent}</div>`;
      } else {
        thoughtTextEl.textContent = '他现在没想太多。';
      }
    }, 3000);
    if (thoughtTimer) clearTimeout(thoughtTimer);
    thoughtTimer = setTimeout(() => { clearTimeout(waitTimer); bubble.classList.remove('show'); }, 5000);

  } else {
    // 没有心声
    thoughtTextEl.textContent = '他现在没想太多。';
    bubble.classList.add('show');
    if (thoughtTimer) clearTimeout(thoughtTimer);
    thoughtTimer = setTimeout(() => bubble.classList.remove('show'), 2000);
  }
}

function updateThought(text) {
  const el = document.getElementById('thoughtText');
  if (el) el.textContent = text;
}
