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

  // 性感/火辣/撩人
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
const USER_STICKER_REACTIONS = {
  // 用户发爱心类
  love_reaction: {
    triggers: ['❤️','💕','💗','💖','💓','🥰','😍','💝','💞','💘','🫶'],
    responses: ['neutral', 'eyeroll', 'eyeroll', 'skull'],
    chance: 0.35
  },
  // 用户发哭泣类
  cry_reaction: {
    triggers: ['😭','😢','🥺','💔'],
    responses: ['worry', 'hug', 'sad', 'neutral'],
    chance: 0.35
  },
  // 用户发搞笑类
  funny_reaction: {
    triggers: ['😂','🤣','😹','💀'],
    responses: ['laugh', 'smirk', 'skull'],
    chance: 0.35
  },
  // 用户发生气类
  angry_reaction: {
    triggers: ['😡','🤬','😤','💢'],
    responses: ['neutral', 'tense', 'skull', 'annoyed'],
    chance: 0.3
  },
  // 用户发撒娇类
  cute_reaction: {
    triggers: ['🥺','🥹','😳','🫣','🙈'],
    responses: ['eyeroll', 'smirk', 'neutral', 'annoyed'],
    chance: 0.3
  },
  // 用户发亲亲类
  kiss_reaction: {
    triggers: ['😘','💋','🫦'],
    responses: ['neutral', 'eyeroll', 'smirk', 'skull', 'sexy'],
    chance: 0.4
  },
  // 用户发性感/暗示类
  sexy_reaction: {
    triggers: ['🥵','🔥','💦','😏','🍆','🍑','🫦','😈','👅'],
    responses: ['sexy', 'smirk', 'eyeroll', 'skull'],
    chance: 0.45
  },
};

// ===== 核心函数 =====

// 冷淡/克制的池子
const COLD_POOLS = new Set(['eyeroll','skull','neutral','silent','annoyed','tense','cold']);

// 从池子里随机抽一个emoji
// 冷淡池子直接随机，热情池子有30%概率被替换成冷淡的
function pickStickerFromPool(poolName) {
  // 热情池子有概率降级成更克制的
  if (!COLD_POOLS.has(poolName) && Math.random() < 0.3) {
    const coldFallback = ['eyeroll','skull','neutral','annoyed'];
    poolName = coldFallback[Math.floor(Math.random() * coldFallback.length)];
  }
  const pool = GHOST_STICKER_POOL[poolName];
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}


// 检测用户消息里的emoji，决定Ghost是否回应
function checkUserSticker(userText) {
  for (const [key, config] of Object.entries(USER_STICKER_REACTIONS)) {
    const hasEmoji = config.triggers.some(e => userText.includes(e));
    if (!hasEmoji) continue;
    if (Math.random() > config.chance) continue;

    // 冷却：同类反应2分钟内不重复
    const coolKey = 'userStickerCool_' + key;
    const lastAt = parseInt(localStorage.getItem(coolKey) || '0');
    if (Date.now() - lastAt < 2 * 60 * 1000) continue;
    localStorage.setItem(coolKey, Date.now());

    const poolName = config.responses[Math.floor(Math.random() * config.responses.length)];
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

// ===== 对外暴露的主入口 =====


// 在用户发消息后调用这个，检测emoji并回应
function triggerGhostStickerByUserInput(userText, delayMs = 1200) {
  const emoji = checkUserSticker(userText);
  if (emoji) sendGhostStickerMessage(emoji, delayMs);
}
