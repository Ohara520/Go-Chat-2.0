// ===== 表情包系统 (sticker.js) =====

// ============================================================
// STICKER_META + sendSticker（从 chat.js 拆分补全）
// ============================================================

const STICKER_META = {
  cry:   { label: '哭',    emotion: 'sad',     intensity: 2, type: 'vulnerable', ghostHint: 'She sent a crying / pouty sticker. Could be genuinely sad or just being dramatic — read the context and respond accordingly.' },
  shy:   { label: '害羞',  emotion: 'shy',     intensity: 2, type: 'approach',   ghostHint: 'She sent a shy / embarrassed sticker. Something landed and she is a little flustered. Brief, natural response.' },
  angry: { label: '生气',  emotion: 'angry',   intensity: 2, type: 'conflict',   ghostHint: 'She sent an angry / sulking sticker. Could be real or playful — read the context. Do not over-react either way.' },
  meh:   { label: '无语',  emotion: 'cold',    intensity: 1, type: 'distance',   ghostHint: 'She sent an eye-roll / done-with-you sticker. She thinks he said something dumb. Keep it dry.' },
  star:  { label: '星星眼',emotion: 'want',    intensity: 2, type: 'approach',   ghostHint: 'She sent a stars-in-eyes sticker. She is excited or wanting something — respond to what she is after.' },
  kiss:  { label: '亲亲',  emotion: 'love',    intensity: 3, type: 'intimate',   ghostHint: 'She sent a kiss / affection sticker. She is being sweet or flirty. Ghost can be dry but should not be cold.' },
  // Ghost猫猫系列（k教练无偿创作）
  'cat-tired':   { label: '累了',  emotion: 'tired',   intensity: 1, type: 'vulnerable', ghostHint: 'She sent a tired cat sticker. She is exhausted or playing it up. Brief response — can check on her.' },
  'cat-neutral': { label: '普通',  emotion: 'neutral', intensity: 1, type: 'neutral',    ghostHint: 'She sent a neutral sitting cat sticker. Tone is even — just follow the conversation naturally.' },
  'cat-confused':{ label: '疑惑',  emotion: 'confused',intensity: 1, type: 'distance',   ghostHint: 'She sent a confused / question-mark cat sticker. She does not get something — clarify briefly or turn it back.' },
  'cat-sleepy':  { label: '困了',  emotion: 'sleepy',  intensity: 1, type: 'vulnerable', ghostHint: 'She sent a sleepy cat sticker. She is drowsy or hinting she should sleep. Tell her to sleep or keep it short.' },
  'cat-proud':   { label: '得意',  emotion: 'proud',   intensity: 2, type: 'approach',   ghostHint: 'She sent a smug / thumbs-up cat sticker. She is pleased with herself. Dry acknowledgment.' },
  'cat-bored':   { label: '无聊',  emotion: 'bored',   intensity: 1, type: 'distance',   ghostHint: 'She sent a bored / daydreaming cat sticker. She has nothing to do or is waiting on him. Short response.' },
  'cat-rage':    { label: '生气',  emotion: 'rage',    intensity: 3, type: 'conflict',   ghostHint: 'She sent a puffed-up rage cat sticker. She is annoyed or pretending to be — read the context, do not dismiss it.' },
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
  const email = localStorage.getItem('userEmail') || localStorage.getItem('sb_user_email') || '';
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
  const stickerMsg = `[用户发了表情包id：${id}，标签：${meta.label}]`;
  chatHistory.push({ role: 'user', content: stickerMsg, _stickerId: id, _stickerType: meta.type });
  saveHistory();

  if (_isSending) return;
  _isSending = true;
  showTyping();

  // 所有表情包统一走 Sonnet，破防才降 Grok
  try {
    const cleanHistory = chatHistory
      .filter(m => !m._system && !m._recalled && !m._intimate)
      .slice(-30)
      .map(m => ({
        role: m.role,
        content: m._stickerId ? `*${m._stickerType || 'sent a sticker'}*` : m.content
      }));

    // ===== 情绪走势感知（最近3条表情的type）=====
    const recentStickerTypes = chatHistory
      .filter(m => m._stickerType)
      .slice(-3)
      .map(m => m._stickerType);

    const isStillVulnerable = recentStickerTypes.filter(t => t === 'vulnerable').length >= 2;
    const isEscalating = recentStickerTypes.includes('distance') && recentStickerTypes.includes('conflict');
    const isSeekingAttention = recentStickerTypes.filter(t => t === 'approach').length >= 2;

    // ===== 多状态回复hint =====
    const affection = getAffection ? getAffection() : 60;
    const coldWar = localStorage.getItem('coldWarMode') === 'true';
    const ukHour = new Date(new Date().getTime() + 0 * 3600000).getUTCHours();
    const isLateNight = ukHour >= 23 || ukHour < 5;

    let stateHint = '';
    if (isStillVulnerable) {
      stateHint = `She hasn't recovered yet. Stay a little longer with her.`;
    } else if (isEscalating) {
      stateHint = `Her mood is rising. Respond more carefully.`;
    } else if (isSeekingAttention) {
      stateHint = `She's leaning in. You can respond slightly warmer.`;
    } else if (coldWar) {
      stateHint = `Cold war is on. Keep it short, minimal. Still present, not hostile.`;
    } else if (affection >= 70) {
      stateHint = `High affection. He can be a little warmer here — still dry, but closer.`;
    } else if (affection < 40) {
      stateHint = `Lower affection. He's more guarded. Shorter. Less open.`;
    }
    if (isLateNight) stateHint += ` It's late night UK time — that shapes the tone.`;
    // 不要提模式本身，只调整语气
    stateHint += ` Do not explicitly mention patterns or repetition. Just adjust tone naturally.`;

    // 把表情包情绪提示注入system
    const _stickerBase = buildSystemPrompt();
    const characterLock = meta.type === 'vulnerable'
      ? '\n[CHARACTER LOCK] You are Ghost. Not a counselor. Not an assistant. React as Ghost would — brief, present, dry but not cold. Do not analyze her emotions. Do not offer help. Just be there.'
      : '';
    const stickerSystem = _stickerBase + `\n\n[Sticker context: ${meta.ghostHint}${stateHint ? ' ' + stateHint : ''} Do not mention "sticker" — just respond naturally.]` + characterLock;

    const response = await fetchWithRetry('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_SONNET,
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
    reply = reply.replace(/\n?(REFUND|(?<![a-zA-Z])KEEP(?![a-zA-Z])|COLD_WAR_START|GIVE_MONEY:[^\n]*)\n?/g, '').trim();

    // 破防检测：Grok 兜底，Haiku 会破防不能用
    if (isBreakout(reply)) {
      try {
        const recentCtx = chatHistory
          .filter(m => !m._system && !m._recalled).slice(-6)
          .map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${m.content.slice(0, 200)}`).join('\n');
        const grokFallback = await callGrok(recentCtx, 150, null, 'sticker');
        reply = (grokFallback && !isBreakout(grokFallback)) ? grokFallback.trim() : 'noted.';
      } catch(e) {
        reply = 'noted.';
      }
    }

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
    // 兜底：至少说一句
    const _fb = {
      vulnerable: ['hey.', 'i\'m here.', 'come on.'],
      conflict:   ['alright.', 'fine.', 'noted.'],
      distance:   ['okay.', 'sure.', '.'],
      approach:   ['mm.', 'go on.', 'what.'],
      neutral:    ['mm.', 'okay.', '.'],
    };
    const _opts = _fb[meta.type] || _fb.neutral;
    const _line = _opts[Math.floor(Math.random() * _opts.length)];
    appendMessage('bot', _line);
    chatHistory.push({ role: 'assistant', content: _line });
    saveHistory();
  } finally {
    _isSending = false;
  }
}
