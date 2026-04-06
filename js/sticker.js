// ===== 表情包系统 (sticker.js) =====

// ===== Ghost表情包池（按情绪/场景分类）=====
const GHOST_STICKER_POOL = {

  // 开心/兴奋
  happy: ['😄', '😁', '🤩', '😆'],

  // 好笑/大笑
  laugh: ['😂', '🤣', '😹'],

  // 微笑/愉悦
  smile: ['🙂', '😊', '☺️'],

  // 坏笑/恶作剧
  smirk: ['😈', '😏', '🤭'],

  // 眨眼/调情
  wink: ['😜', '😝', '🤪'],

  // 轻松/放松
  chill: ['😌', '😎', '🧘'],

  // 爱意/迷恋
  love: ['🥰', '😍', '💕', '❤️'],

  // 得意/自豪
  proud: ['😏', '😎', '🦾', '💅'],

  // 无奈/不耐烦
  annoyed: ['😑', '🙄', '😒', '💀'],

  // 失望/悲伤
  sad: ['😞', '😔', '🥺', '😢'],

  // 愤怒/不满
  angry: ['😠', '😡', '🤬', '💢'],

  // 极度愤怒
  rage: ['😤', '🤬', '💥', '🔥'],

  // 哭泣/悲伤
  cry: ['😭', '😢', '🥲'],

  // 痛苦/挣扎
  pain: ['😣', '😖', '😫'],

  // 惊恐/害怕
  scared: ['😱', '😨', '😰'],

  // 困惑/迷茫
  confused: ['😕', '🤔', '😶'],

  // 大哭/伤心
  heartbroken: ['💔', '😭', '🥹'],

  // 焦虑/紧张
  tense: ['😬', '😰', '😅'],

  // 惊讶/震惊
  shocked: ['😲', '😮', '🫢', '👀'],

  // 尴尬/窘迫
  awkward: ['😅', '😓', '🙈'],

  // 倒立笑脸/困惑
  upside: ['🙃'],

  // 贪吃/想吃东西
  hungry: ['😋', '🤤', '😛'],

  // 吐舌头/搞笑
  tongue: ['😛', '😝', '🤪'],

  // 钱眼/贪财好运
  money: ['🤑', '💰', '💸'],

  // 书呆子/学习
  nerd: ['🤓', '📚', '🧐'],

  // 拥抱/友好
  hug: ['🤗', '🫂'],

  // 翻白眼/不信
  eyeroll: ['🙄', '😒', '💀'],

  // 思考
  think: ['🤔', '🧐', '💭'],

  // 生气/发热/不舒服
  sick: ['🤒', '🤧', '😷'],

  // 困/无聊
  tired: ['😴', '🥱', '😪'],

  // 天使/善良
  angel: ['😇', '👼'],

  // 亲亲/撒娇
  kiss: ['😘', '💋', '🥰'],

  // 忧愁/担心
  worry: ['😟', '😥', '🫤'],

  // 悲伤/更深的悲伤
  deep_sad: ['😞', '😩', '💔'],

  // 无言/沉默
  silent: ['😶', '🫥', '🤐'],

  // 无表情/中立
  neutral: ['😐', '😑', '🫤'],

  // 惊讶/轻微恐惧
  mild_shock: ['😯', '😦', '🫨'],

  // 晕眩/受伤/搞笑
  dizzy: ['😵', '💫', '🌀'],

  // 恶魔/恶意
  evil: ['😈', '👿', '💀'],

  // 鬼魂/鬼魂吓人
  ghost_face: ['👻', '💀', '🫣'],

  // 恶心/不想打招呼
  disgusted: ['🤢', '🤮', '😬'],

  // 醉酒/迷糊
  drunk: ['🥴', '😵', '🍺'],

  // 非常开心/爱
  overjoyed: ['🥳', '🎉', '😻'],

  // 流口水/贪吃
  drool: ['🤤', '😋'],

  // 安静/保密
  shush: ['🤫', '🫢', '🤐'],

  // 疯狂/古怪
  crazy: ['🤪', '😜', '🤡'],

  // 愤怒/极度咆哮
  roar: ['🦁', '😤', '🔥'],

  // 打喷嚏/感冒
  sneeze: ['🤧', '😷'],

  // 搞搞/不好意思
  shy: ['😳', '🙈', '🫣'],

  // 牛气/冒险精神
  cool: ['😎', '🤙', '💪'],

  // 头爆炸/超级震惊
  mind_blown: ['🤯', '💥', '😱'],

  // 长鼻子/说谎
  liar: ['🤥', '🤭'],

  // 庆祝
  celebrate: ['🥳', '🎊', '🎉'],

  // 不懂/困惑理解
  dunno: ['🤷', '😕', '❓'],

  // 恶心/厌恶
  gross: ['🤢', '🤮', '😖'],

  // 吃吃/非常恶心
  yuck: ['🤮', '🤢', '🫠'],

  // 小丑/大笑
  clown: ['🤡', '😹'],

  // 热/身体热
  hot: ['😓', '🌡️', '💦'],

  // 性感/火辣/撩人（suggestive场景也走这个池）
  sexy: ['🥵', '🔥', '💋', '😈'],

  // 冷/冷漠
  cold: ['🥶', '❄️'],

  // 便便/搞笑/显示很糟
  poop: ['💩', '😂'],

  // 骷髅/死亡危险
  skull: ['💀', '☠️'],

  // 外星人/神秘
  alien: ['👽', '🛸', '🤖'],

  // 外星生物/游戏或科幻
  scifi: ['👾', '🎮', '🤖'],

  // 日本鬼怪/恶鬼恐怖
  yokai: ['👹', '👺', '😤'],

  // 鬼怪/恐怖或恶魔
  demon: ['😈', '👿', '💀'],

  // 机器人/AI科技
  robot: ['🤖', '⚙️'],

  // 打哈欠/无聊困倦
  yawn: ['🥱', '😴', '💤'],

  // 侦探/探索发现
  detective: ['🕵️', '🔍', '🧐'],

  // 微笑泪水/高兴中有些悲伤
  bittersweet: ['🥹', '😊', '🫠'],
};


// ===== 用户发emoji时Ghost的反应池 =====
// 精简为6组，边界清晰，Ghost风格更稳
const USER_STICKER_REACTIONS = {

  // 用户发爱意/想念
  affection_reaction: {
    triggers: ['❤️','💕','💗','💖','💓','🥰','😍','💝','💞','💘','🫶'],
    responses: ['neutral', 'smirk', 'eyeroll', 'skull'],
    chance: 0.28
  },

  // 用户明显难过/哭
  upset_reaction: {
    triggers: ['😭','😢','💔'],
    responses: ['worry', 'neutral', 'silent'],
    chance: 0.38
  },

  // 用户发搞笑/死了算了这种
  funny_reaction: {
    triggers: ['😂','🤣','😹','💀'],
    responses: ['laugh', 'smirk', 'skull'],
    chance: 0.35
  },

  // 用户发火/情绪上来
  angry_reaction: {
    triggers: ['😡','🤬','😤','💢'],
    responses: ['neutral', 'tense', 'annoyed', 'skull'],
    chance: 0.26
  },

  // 用户撒娇/装可怜/要他看自己
  tease_reaction: {
    triggers: ['🥺','🥹','😳','🫣','🙈'],
    responses: ['eyeroll', 'smirk', 'neutral'],
    chance: 0.24
  },

  // 用户发亲亲/暗示/明显撩（suggestive走sexy池）
  suggestive_reaction: {
    triggers: ['😘','💋','🫦','🥵','🔥','💦','😏','😈','👅'],
    responses: ['sexy', 'smirk', 'eyeroll', 'skull'],
    chance: 0.32
  },
};


// ===== 核心函数 =====

// 冷淡/克制的池子
const COLD_POOLS = new Set(['eyeroll','skull','neutral','silent','annoyed','tense','cold']);

// 从池子里随机抽一个emoji
// 冷淡池子直接随机，热情池子有30%概率降级成克制的
function pickStickerFromPool(poolName) {
  if (!COLD_POOLS.has(poolName) && Math.random() < 0.3) {
    const coldFallback = ['eyeroll','skull','neutral','annoyed'];
    poolName = coldFallback[Math.floor(Math.random() * coldFallback.length)];
  }
  const pool = GHOST_STICKER_POOL[poolName];
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}


// ===== 歧义修正：🥺等多义表情的上下文识别 =====
// 不花模型调用，纯关键词，让tease/upset边界更清晰
function getStickerToneHint(userText) {
  const t = String(userText || '').toLowerCase();
  if (/对不起|错了|别生气|i'm sorry|i was wrong/.test(t)) return 'repair';
  if (/想你|爱你|亲亲|love you|miss you/.test(t))         return 'affection';
  if (/看我|夸我|漂亮吗|cute|pretty|am i cute/.test(t))   return 'tease';
  if (/难过|委屈|哭|sad|cry|upset/.test(t))               return 'upset';
  if (/想要你|撩你|亲我|kiss me|want you/.test(t))         return 'suggestive';
  return 'none';
}


// 检测用户消息里的emoji，决定Ghost是否回应
function checkUserSticker(userText) {
  const toneHint = getStickerToneHint(userText);

  // 读统一状态，决定允许哪些池子
  const gs = (typeof getGhostResponseState === 'function') ? getGhostResponseState() : null;
  const warmth    = gs ? gs.warmth    : 1;
  const sharpness = gs ? gs.sharpness : 0;
  const intimacy  = gs ? gs.intimacy  : 1;

  for (const [key, config] of Object.entries(USER_STICKER_REACTIONS)) {
    const hasEmoji = config.triggers.some(e => userText.includes(e));
    if (!hasEmoji) continue;

    // 歧义修正
    if (key === 'tease_reaction' && (toneHint === 'repair' || toneHint === 'upset')) continue;
    if (key === 'upset_reaction' && toneHint === 'tease') continue;

    // 统一状态过滤：suggestive 需要 intimacy >= 2
    if (key === 'suggestive_reaction' && intimacy < 2) continue;

    // availability closed 时只允许 neutral/skull/annoyed
    if (gs && gs.availability === 'closed') {
      const coldOnly = new Set(['neutral', 'skull', 'annoyed', 'eyeroll']);
      const coldResponses = config.responses.filter(r => coldOnly.has(r));
      if (coldResponses.length === 0) continue;
    }

    if (Math.random() > config.chance) continue;

    // 冷却
    const coolKey = 'userStickerCool_' + key;
    const lastAt = parseInt(localStorage.getItem(coolKey) || '0');
    if (Date.now() - lastAt < 2 * 60 * 1000) continue;
    localStorage.setItem(coolKey, Date.now());

    // 根据 warmth/sharpness 选池子
    let poolName;
    if (gs && gs.availability === 'closed') {
      const coldOnly = ['neutral', 'skull', 'annoyed', 'eyeroll'];
      const available = config.responses.filter(r => coldOnly.includes(r));
      poolName = available[Math.floor(Math.random() * available.length)] || 'neutral';
    } else if (warmth <= 0 || sharpness >= 2) {
      // 冷淡状态：强制降级到冷池
      const coldFallback = ['eyeroll', 'skull', 'neutral', 'annoyed'];
      const available = config.responses.filter(r => coldFallback.includes(r));
      poolName = available.length > 0
        ? available[Math.floor(Math.random() * available.length)]
        : coldFallback[Math.floor(Math.random() * coldFallback.length)];
    } else {
      poolName = config.responses[Math.floor(Math.random() * config.responses.length)];
      // warmth 1：50%概率降级
      if (warmth === 1 && !COLD_POOLS.has(poolName) && Math.random() < 0.5) {
        const cold = ['eyeroll', 'skull', 'neutral', 'annoyed'];
        poolName = cold[Math.floor(Math.random() * cold.length)];
      }
    }

    return pickStickerFromPool(poolName);
  }
  return null;
}

// 发送Ghost表情包消息
function sendGhostStickerMessage(emoji, delayMs = 1000) {
  if (!emoji) return;
  setTimeout(() => {
    appendMessage('bot', emoji);
    if (typeof chatHistory !== 'undefined') {
      chatHistory.push({ role: 'assistant', content: emoji });
      if (typeof saveHistory === 'function') saveHistory();
    }
  }, delayMs);
}

// ===== 对外主入口 =====
// 在用户发消息后调用，检测emoji并决定Ghost是否回应
function triggerGhostStickerByUserInput(userText, delayMs = 1200) {
  const emoji = checkUserSticker(userText);
  if (emoji) sendGhostStickerMessage(emoji, delayMs);
}


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

  try {
    const cleanHistory = chatHistory
      .filter(m => !m._system && !m._recalled)
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
    const stickerSystem = _stickerBase + `\n\n[Sticker context: ${meta.ghostHint}${stateHint ? ' ' + stateHint : ''} Do not mention "sticker" — just respond naturally.]`;

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
    reply = reply.replace(/\n?(REFUND|(?<![a-zA-Z])KEEP(?![a-zA-Z])|COLD_WAR_START|GIVE_MONEY:[^\n]*)\n?/g, '').trim();

    if (typeof isBreakout === 'function' && isBreakout(reply)) {
      try {
        const recentCtx = cleanHistory.slice(-6)
          .map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${m.content.slice(0, 200)}`)
          .join('\n');
        const fallback = await callGrok('', recentCtx, 200, null, 'sticker');
        if (fallback && !isBreakout(fallback)) {
          reply = fallback.trim();
        } else {
          _isSending = false;
          hideTyping();
          return;
        }
      } catch(e) {
        _isSending = false;
        hideTyping();
        return;
      }
    }
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
