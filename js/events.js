// ===================================================
// events.js — Ghost 主动行为 & 剧情系统
//
// 职责分区：
// ① Active Events — Ghost 主动做的事
//    emitGhostEvent / emitGhostNarrativeEvent
//    life_ping / check_in / reverse_package / money / confront / cold_war
//    handlePostReplyActions / pickReadyPendingEvent
//
// ② Story System — 关系里程碑触发
//    STORY_EVENTS / checkStoryOn* / markStoryDone
//
// 依赖：state.js / money.js / persona.js / cloud.js
// ===================================================


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ① ACTIVE EVENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Life Ping 场景池 ──────────────────────────────

const LIFE_PING_SCENES = [
  { key: 'range',      hint: 'Training ran long or went rough today.',        weight: 10 },
  { key: 'sleep',      hint: 'Bad sleep last night.',                          weight: 10 },
  { key: 'rain',       hint: 'Raining again. Typical UK weather.',            weight: 12 },
  { key: 'food',       hint: 'Ate something. Nothing special.',               weight: 8  },
  { key: 'team',       hint: 'Minor irritation with the team today.',         weight: 10 },
  { key: 'paperwork',  hint: 'Admin and paperwork. Tedious.',                 weight: 6  },
  { key: 'equipment',  hint: 'Kit issue or equipment maintenance.',           weight: 6  },
  { key: 'run',        hint: 'Morning run. Done.',                            weight: 8  },
  { key: 'quiet',      hint: 'Quiet evening. Nothing happening.',             weight: 8  },
  { key: 'tea',        hint: 'Making tea. Small domestic moment.',            weight: 6  },
];

function pickLifePingScene() {
  const mood    = getMoodLevel();
  const coldWar = localStorage.getItem('coldWarMode') === 'true';

  // 最近2次场景去重
  const recentKeys = (() => {
    try { return JSON.parse(localStorage.getItem('lifePingSceneHistory') || '[]'); }
    catch(e) { return []; }
  })();

  const weighted = LIFE_PING_SCENES.map(s => {
    let w = s.weight;

    // mood调整
    if (mood <= 3) {
      if (['quiet','sleep','team','paperwork'].includes(s.key)) w *= 1.5;
      if (['run','tea'].includes(s.key)) w *= 0.5;
    } else if (mood >= 7) {
      if (['run','tea','food'].includes(s.key)) w *= 1.4;
    }

    // 冷战调整
    if (coldWar) {
      if (['tea','quiet','food'].includes(s.key)) w *= 0.4;
      if (['paperwork','equipment','range'].includes(s.key)) w *= 1.5;
    }

    // 去重降权
    const recentIdx = recentKeys.indexOf(s.key);
    if (recentIdx === 0) w *= 0.2; // 上次用过
    if (recentIdx === 1) w *= 0.5; // 上上次用过

    return { ...s, w };
  });

  // 加权随机
  const total = weighted.reduce((sum, s) => sum + Math.max(0, s.w), 0);
  let r = Math.random() * total;
  let picked = weighted[0];
  for (const s of weighted) {
    r -= Math.max(0, s.w);
    if (r <= 0) { picked = s; break; }
  }

  // 记录历史（最多保留2条）
  const newHistory = [picked.key, ...recentKeys].slice(0, 2);
  localStorage.setItem('lifePingSceneHistory', JSON.stringify(newHistory));

  return picked;
}

function buildLifePingPrompt(scene) {
  const mood = getMoodLevel();
  const moodHint =
    mood <= 3 ? 'He is tired or low.' :
    mood >= 8 ? 'He is in a decent mood.' :
    '';

  return `Send one short Ghost-style message about his day.

Scene: ${scene.hint}
${moodHint}

Rules:
- One or two short lines maximum
- English only
- No translation
- No emojis
- No hashtags
- No narration
- No explanation
- No romantic content
- No flirting
- No emotional confession
- Sounds like a real message, not a post
- Feels unplanned, like something sent in the moment
- Dry. Lowercase where natural.`;
}

async function generateLifePing() {
  const scene = pickLifePingScene();
  try {
    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 60,
        system: buildGhostStyleCore() + '\n' + buildLifePingPrompt(scene),
        messages: [{ role: 'user', content: 'Send your message.' }]
      })
    }, 5000);
    const data = await res.json();
    const text = data.content?.[0]?.text?.trim();
    if (text && text.length > 0) return text;
  } catch(e) {}

  // 兜底
  const fallbacks = {
    range: 'ran long.', sleep: "bad night.", rain: 'still raining.',
    food: 'ate something.', team: "won't shut up.", paperwork: 'reports all day.',
    equipment: 'kit issue.', run: 'morning done.', quiet: 'quiet tonight.', tea: 'making tea.'
  };
  return fallbacks[scene.key] || 'still here.';
}


// ── 工具函数 ─────────────────────────────────────

// 获取最近对话上下文（多处复用）
function getRecentCtx(n = 4, maxChars = 60) {
  if (typeof chatHistory === 'undefined') return '';
  return chatHistory
    .filter(m => !m._system && !m._recalled)
    .slice(-n)
    .map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${String(m.content || '').slice(0, maxChars)}`)
    .join('\n');
}

// 获取最近消息（用于 API messages 参数）
function getRecentMessages(n = 4) {
  if (typeof chatHistory === 'undefined') return [];
  return chatHistory.filter(m => !m._system).slice(-n);
}

// 带 recentCtx 的标准 callHaiku 调用
async function callHaikuWithCtx(systemPrompt, writePrompt, n = 4) {
  const recentCtx = getRecentCtx(n);
  return await callHaiku(
    systemPrompt,
    [
      ...getRecentMessages(n),
      {
        role: 'user',
        content: recentCtx
          ? `Recent chat:\n${recentCtx}\n\n${writePrompt}`
          : writePrompt
      }
    ]
  );
}

// 带 recentCtx 的 Grok 调用（替换Haiku台词生成，不破防，价格低）
async function callGrokWithCtx(systemPrompt, writePrompt, n = 4) {
  const recentCtx = getRecentCtx(n);
  const userContent = recentCtx
    ? `Recent chat:\n${recentCtx}\n\n${writePrompt}`
    : writePrompt;
  return await callGrok(systemPrompt, userContent, 100);
}

// ── 事件冷却管理 ──────────────────────────────────
// 目前只纳入 life_ping，其他事件由调用方控制频率
// 如需新增，在 map 里加即可

function getEventCooldownMs(eventType) {
  const map = {
    life_ping: 3 * 3600 * 1000,
  };
  return map[eventType] || 0;
}

function isEventCoolingDown(eventType) {
  const cooldown = getEventCooldownMs(eventType);
  if (!cooldown) return false;
  const lastAt = parseInt(localStorage.getItem(`lastEventAt_${eventType}`) || '0');
  return Date.now() - lastAt < cooldown;
}

function markEventTriggered(eventType) {
  if (!getEventCooldownMs(eventType)) return;
  localStorage.setItem(`lastEventAt_${eventType}`, Date.now());
}

// ── 转账语气兜底文案（money case 和 catch 共用）──
const MONEY_MOTIVE_DEFAULTS = {
  practical:    "sort it.",
  care:         "eat something.",
  celebration:  "don't waste it.",
  compensation: "take it.",
};


// ── emitGhostEvent 主入口 ────────────────────────

async function emitGhostEvent(eventType, payload = {}) {
  const coldWar  = localStorage.getItem('coldWarMode') === 'true';
  const jealousy = getJealousyLevelCapped();
  const mood     = getMoodLevel();

  if (eventType !== 'confront' && eventType !== 'cold_war' &&
      (coldWar || jealousy === 'severe' || mood <= 2)) {
    return false;
  }

  // 吃醋刚触发第一轮：只改语气，不触发物质行为
  const _jealousyJustNow = sessionStorage.getItem('jealousyJustTriggered') === '1' &&
    Date.now() - parseInt(sessionStorage.getItem('jealousyJustTriggeredAt') || '0') < 60000;
  if (_jealousyJustNow && (eventType === 'money' || eventType === 'reverse_package')) return false;
  if (_jealousyJustNow) sessionStorage.removeItem('jealousyJustTriggered');

  let line = '';
  let systemTag    = null;
  let sideEffect   = null;
  let transferAmount = null; // 最终转账金额，用于 _transfer 记录，避免和 payload.amount 脱节

  switch (eventType) {

    case 'life_ping': {
      if (isEventCoolingDown('life_ping')) return false;
      markEventTriggered('life_ping');
      line = await generateLifePing();
      break;
    }

    case 'check_in': {
      // 读最近聊天 + 检测离开信号
      const _recentForCI = (typeof chatHistory !== 'undefined')
        ? chatHistory.filter(m => !m._system && !m._recalled).slice(-8)
            .map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${(m.content || '').slice(0, 100)}`).join('\n')
        : '';
      const _lastUserMsg = (typeof chatHistory !== 'undefined')
        ? (chatHistory.filter(m => m.role === 'user' && !m._system).slice(-1)[0]?.content || '')
        : '';
      const _leftSignal = /去吃|去洗|去睡|去忙|先去|回来|好了吗|吃了吗|洗完|睡着|eating|shower|bath|sleep|brb|back|done|finished|busy now/i.test(_lastUserMsg);

      // 防重复池
      const _ciPool = (() => { try { return JSON.parse(localStorage.getItem('checkInReplyPool') || '[]'); } catch(e) { return []; } })();
      const _ciNoRepeat = _ciPool.length > 0
        ? `\n\nDo not reuse or echo these recent lines: ${_ciPool.map(l => `"${l}"`).join(', ')}. Vary completely.`
        : '';

      try {
        const mood = getMoodLevel();
        const moodHint =
          mood <= 3 ? 'Lean more toward observe than care.'
          : mood >= 7 ? 'Care can surface a little more, but still restrained.'
          : '';
        const _followUpHint = _leftSignal
          ? `\n\nIMPORTANT: She mentioned leaving or doing something. This is a natural follow-up — ask if she is back / done / ate / okay. Keep it short and dry, not warm.`
          : '';
        const _contextBlock = _recentForCI
          ? `\n\nRecent conversation:\n${_recentForCI}\n\nUse this context. If she mentioned leaving, follow up. If the conversation had a specific topic, let that subtly color what he sends.`
          : '';
        const t = await callGrokWithCtx(
          buildGhostStyleCore() + `
Send ONE short check-in line to his wife.
Choose ONE intent internally (do not label it):
- check: brief, slightly controlling, like he is keeping track
- care: practical concern, understated, not soft
- observe: noticing a shift in her behavior, low-key

How to write:
- Often drop the subject
- Keep it short — 1–4 words preferred
- Can be a fragment, not a full sentence
- Slightly blunt is fine

Avoid:
- full polite questions
- emotional reassurance
- sweetness or romantic tone
- anything careful, soft, or chatty
- repeating the same wording as recent messages

Rules:
- English only
- Feels like he sent it without thinking
- Dry. Casual. Real.
${moodHint}${_followUpHint}${_contextBlock}${_ciNoRepeat}`,
          `Write his check-in.`
        );
        if (t && t.trim()) {
          line = t.trim().split('\n').slice(0, 2).join('\n');
          _ciPool.push(line); localStorage.setItem('checkInReplyPool', JSON.stringify(_ciPool.slice(-6)));
          sideEffect = () => {
            const cnt = parseInt(localStorage.getItem('checkInCount') || '0');
            localStorage.setItem('checkInCount', cnt + 1);
          };
          break;
        }
      } catch(e) {}
      // fallback：更多样化，过滤用过的
      const _ciAllOpts = [
        "still up.", "ate yet.", "where'd you go.", "quiet again.",
        "back yet.", "all good.", "done?", "still there.",
        "how long.", "eating?", "you okay.", "check in.",
      ];
      const _unusedOpts = _ciAllOpts.filter(o => !_ciPool.includes(o));
      const _ciOpts = _unusedOpts.length > 0 ? _unusedOpts : _ciAllOpts;
      line = _leftSignal ? "back yet." : _ciOpts[Math.floor(Math.random() * _ciOpts.length)];
      _ciPool.push(line); localStorage.setItem('checkInReplyPool', JSON.stringify(_ciPool.slice(-6)));
      sideEffect = () => {
        const cnt = parseInt(localStorage.getItem('checkInCount') || '0');
        localStorage.setItem('checkInCount', cnt + 1);
      };
      break;
    }

    case 'reverse_package': {
      const motive = payload.motive || 'delayed_longing';
      const item   = payload.item || decideReversePackageItem(motive);
      const motiveHint = {
        practical_care:   'He sent it because it needed doing. Not a gesture — just handling it. Slightly bossy about it.',
        compensation:     'Something happened between them. He is not apologizing out loud. This is what he does instead.',
        possessive_trace: 'He wanted her to have something of his. He will not say that. But it is why.',
        longing:          'He found it and thought of her. That is the whole reason. He will not admit that either.',
        delayed_longing:  'He sent it a while ago and is only mentioning it now. Like it almost slipped his mind.',
      }[motive] || 'Brief. Dry. Like it is nothing.';

      let generatedLine = null;
      try {
        const t = await callGrokWithCtx(
          buildGhostStyleCore() + `
He sent something to his wife. She does not know yet, or just found out.
He is saying one line — the only line he will say about it.

His internal state: ${motiveHint}
Item context: ${item.desc}

How to write:
- Do not name the item
- Do not explain why he sent it
- Do not announce it like a delivery update
- Do not be sweet, romantic, or soft
- Drop the subject where natural
- Short. Offhand. Like it cost him nothing to say.

Usually one line.
Occasionally two very short lines — only if the second adds weight, not explanation.

English only.`,
          `Write his line.`
        );
        if (t && t.trim()) generatedLine = t.trim().split('\n').slice(0, 2).join('\n');
      } catch(e) {}

      if (!generatedLine) {
        const fallbacks = {
          practical_care:   ["check your door.", "use it."],
          compensation:     ["just take it.", "check later."],
          possessive_trace: ["keep it.", "something there for you."],
          longing:          ["found something. sent it.", "don't make it a thing."],
          delayed_longing:  ["should be there by now.", "check your door."],
        };
        const opts = fallbacks[motive] || fallbacks.delayed_longing;
        generatedLine = opts[Math.floor(Math.random() * opts.length)];
      }

      line = generatedLine;
      sideEffect = () => {
        if (typeof addGhostReverseDelivery === 'function') addGhostReverseDelivery(item, motive);
        setLastReversePackageTurn(_globalTurnCount);
      };
      break;
    }

    case 'money': {
      const userText       = payload.userText || '';
      const justHadTension = !!payload.justHadTension;
      const jealousyGift   = !!payload.isJealousyGift;

      // 退款冷却期内：只说话，不转
      // 注意：这和 isMoneyRefuseActive() 不同
      // isMoneyRefuseActive() = 用户刷钱/拒绝态还在
      // isPostRefundVerbalOnly = 她刚把钱退回来，Ghost 暂时只说话不再转
      const lastRefundAt = parseInt(localStorage.getItem('lastRefundAt') || '0');
      const isPostRefundVerbalOnly = (Date.now() - lastRefundAt) < 2 * 3600 * 1000;

      if (isPostRefundVerbalOnly) {
        try {
          const fbLine = await callGrok(
            buildGhostStyleCore() + `
You were going to send money, but you do not.
Say one short line instead.

Dry. Stubborn if needed.
Do not mention the system.
Lowercase where natural.
English only.
One line only.`,
            userText
              ? `She said: "${userText}"\nWrite his line.`
              : `Write his line.`,
            80
          );
          if (fbLine && fbLine.trim()) {
            line = fbLine.trim().split('\n')[0];
            systemTag = '';
            break;
          }
        } catch(e) {}
        line = "drop it."; systemTag = ''; break;
      }

      // 吃醋转账：单独走规则
      let motive = null;
      if (jealousyGift) {
        if (!canJealousyTriggerMoney()) return false;
        motive = 'care';
      } else {
        const result = shouldGiveMoney(userText, {
          justHadTension,
          mood:  getMoodLevel(),
          trust: getTrustHeat()
        });
        if (!result?.ok) {
          if (isMoneyAsk(userText)) {
            const pattern = getMoneyAskPattern();
            line = await generateMoneyRefuseLine(pattern === 'none' ? 'light' : pattern);
            systemTag = '';
            break;
          }
          return false;
        }
        motive = result.motive;
      }

      const amount = decideMoneyAmountFromState(motive);
      if (!amount || amount <= 0) return false;

      transferAmount = amount; // 记录最终金额，统一输出时用
      systemTag = `GIVE_MONEY:${amount}:`;

      try {
        const toneHint = jealousyGift
          ? 'jealousy-driven — possessive, guarded, but clearly cares'
          : {
              practical:    'practical — brief, like he is just handling it',
              care:         'care — understated, no softness added',
              celebration:  'special day — restrained, not sentimental',
              compensation: 'quiet compensation — no apology speech, no drama'
            }[motive] || 'brief and dry';

        const recentCtx = payload.context || getRecentCtx(4, 80);
        const userContent = [
          userText ? `She said: "${userText}"` : '',
          recentCtx ? `Recent chat:\n${recentCtx}` : '',
          'Write his one line.'
        ].filter(Boolean).join('\n');

        const generated = await callGrok(
          buildGhostStyleCore() + `
Ghost has sent her money.

Amount: £${amount}
Tone: ${toneHint}

Say one short line.
Do not explain too much.
Do not be sweet.
Do not be romantic.
Do not turn it into a speech.
Lowercase where natural.
English only.
One line only.`,
          userContent,
          80
        );

        line = (generated || '').trim().split('\n')[0] || MONEY_MOTIVE_DEFAULTS[motive] || "check it.";
      } catch(e) {
        line = MONEY_MOTIVE_DEFAULTS[motive] || "check it.";
      }

      sideEffect = () => {
        applyMoneyEffect(amount, {
          motive,                                                          // 【已接新 motive 体系】
          label:              payload.label || (jealousyGift ? 'Ghost 吃醋转账' : 'Ghost 零花钱'),
          note:               payload.note || '',
          bypassWeeklyLimit:  false,
          bypassCooldown:     jealousyGift,
          bypassSessionLimit: jealousyGift,
          userRequested:      payload.userRequested || false,
        });
      };
      break;
    }

    case 'confront': {
      try {
        const t = await callGrokWithCtx(
          buildGhostStyleCore() + `
Write ONE short line — Ghost noticing another man in the conversation.
Not an accusation. Just tension. Dry. Direct.
No explanation. English only.`,
          `Write his line.`
        );
        if (t && t.trim()) { line = t.trim().split('\n')[0]; break; }
      } catch(e) {}
      const cfOpts = ["who's that, then.", "you're talking about him a lot.", "try that again."];
      line = cfOpts[Math.floor(Math.random() * cfOpts.length)];
      break;
    }

    case 'cold_war': {
      systemTag = 'COLD_WAR_START';
      sideEffect = () => {
        if (typeof startColdWar === 'function') startColdWar();
      };
      try {
        const t = await callGrokWithCtx(
          buildGhostStyleCore() + `
Write ONE word or very short line — he is shutting down.
Cold. Clipped. Done talking.
No explanation. English only.`,
          `Write his closing line.`
        );
        if (t && t.trim()) { line = t.trim().split('\n')[0]; break; }
      } catch(e) {}
      line = payload.line || "fine.";
      break;
    }

    default:
      return false;
  }

  // 统一输出逻辑
  return await new Promise(resolve => {
    setTimeout(() => {
      if (typeof appendMessage === 'function') appendMessage('bot', line);
      if (typeof chatHistory !== 'undefined') {
        chatHistory.push({
          role: 'assistant',
          content: line,
          ...(systemTag ? { _eventTag: systemTag } : {}),
          ...(systemTag && systemTag.startsWith('GIVE_MONEY:') ? {
            _transfer: { amount: transferAmount || 0, isRefund: false }
          } : {})
        });
        if (typeof saveHistory === 'function') saveHistory();
      }
      if (sideEffect) sideEffect();
      if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
      resolve({ line, systemTag });
    }, payload.delayMs || 2000);
  });
}


// ── emitGhostNarrativeEvent ──────────────────────

async function emitGhostNarrativeEvent(text, options = {}) {
  if (!text) return;
  const coldWar  = localStorage.getItem('coldWarMode') === 'true';
  const jealousy = getJealousyLevelCapped();

  if (coldWar && !options.forceColdWar) return;
  if (jealousy === 'severe' && !options.forceJealousy) return;

  const delayMs = options.delayMs !== undefined ? options.delayMs : 1500;

  await new Promise(resolve => setTimeout(resolve, delayMs));

  if (typeof appendMessage === 'function') appendMessage('bot', text);
  if (typeof chatHistory !== 'undefined') {
    chatHistory.push({
      role: 'assistant',
      content: text,
      _storyId: options.storyId || null,
      ...(options.transfer ? { _transfer: options.transfer } : {})
    });
    if (typeof saveHistory === 'function') saveHistory();
  }
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
}


// pickReadyPendingEvent 已移至 sendMessage.js，此处删除重复定义


// ── handlePostReplyActions ───────────────────────
// 只做"回复后状态结算"，不做内容决策

async function handlePostReplyActions(userText, reply, intent) {
  switch (intent.type) {
    case 'confront':
      if (Math.random() < 0.35) await emitGhostEvent('confront');
      break;

    case 'money_candidate': {
      // 不在外层算 amount——emitGhostEvent('money') 内部会自己走
      // shouldGiveMoney() → decideMoneyAmountFromState(motive) 的完整链路
      await emitGhostEvent('money', {
        userText: userText.slice(0, 80),
        context:  getRecentCtx(4, 80),
        note:     ''
      });
      break;
    }

    case 'reverse_package': {
      const item = await generateReversePackageItem(intent.motive, intent.contextSnapshot || (typeof chatHistory !== 'undefined' ? chatHistory.slice(-6) : []));
      await emitGhostEvent('reverse_package', { motive: intent.motive, item });
      break;
    }

    case 'check_in':
      if (Math.random() < 0.3) await emitGhostEvent('life_ping', {});
      else if (Math.random() < 0.4) await emitGhostEvent('check_in');
      break;

    default:
      break;
  }
}


// ── checkLocationSpecialTrigger ──────────────────
// 特产反寄触发器
// 原 checkLocationSpecial(userText, botText) 搬至此处，botText 已去除
// 本质是 reverse_package 的特殊来源，统一由 addGhostReverseDelivery 处理记忆注入
//
// 【低优先级】sentKey 后续改成带周期（如30天），防止地点永久失效

async function checkLocationSpecialTrigger(userText) {
  try {
    // ── 获取当前地点 ──────────────────────────────
    const rawLocation = localStorage.getItem('currentLocation') || 'Hereford Base';
    const locationKey = LOCATION_KEY_MAP?.[rawLocation]
      || LOCATION_KEY_MAP?.[Object.keys(LOCATION_KEY_MAP || {}).find(k => rawLocation.includes(k))]
      || null;
    if (!locationKey) return;

    // ── 该地点是否有特产 ──────────────────────────
    const specials = LOCATION_SPECIALS?.[locationKey];
    if (!specials || specials.length === 0) return;

    // ── 7天冷却（同地点每7天最多触发一次）────
    const sentKey  = 'locationSpecialSent_' + locationKey;
    const lastSent = parseInt(localStorage.getItem(sentKey) || '0');
    if (lastSent && Date.now() - lastSent < 7 * 24 * 3600 * 1000) return;

    // ── 关系门槛检查 ─────────────────────────────
    const trust     = typeof getTrustHeat      === 'function' ? getTrustHeat()      : 60;
    const attach    = typeof getAttachmentPull === 'function' ? getAttachmentPull() : 45;
    const affection = typeof getAffection      === 'function' ? getAffection()      : 60;
    const mode      = localStorage.getItem('marriageType') || 'established';
    // slowBurn 阶段不触发对话版（克制期不主动寄东西）
    if (mode === 'slowBurn') return;
    if (trust < 50 || affection < 60) return;

    // ── 关键词前筛（改为 OR，命中其一即可）────────
    const input = (userText || '').toLowerCase();

    const locationWords = [
      '当地','英国','曼城','伦敦','苏格兰','那边','你们那边',
      'local','manchester','uk','british','edinburgh','norway','germany',
      'poland','hereford','london','amsterdam','paris','dublin','tokyo',
      'japan','france','ireland','netherlands',
    ];
    const interestWords = [
      '想要','喜欢','好奇','想看','想试试','好吃','有意思','特产','带回来',
      '吃','馋','羡慕','茶','巧克力','围巾','明信片','小物','挂件','香薰',
      'curious','want','like','bring back','local thing','food','chocolate',
      'scarf','souvenir','miss','try','taste',
    ];

    const hasLocation = locationWords.some(w => input.includes(w));
    const hasInterest = interestWords.some(w => input.includes(w));
    // 改为 OR：命中其一就进入语义判断
    if (!hasLocation && !hasInterest) return;

    // ── Haiku 语义判断 ───────────────────────────
    let triggered = false;
    try {
      const raw = await callHaiku(
        `判断用户的消息是否包含以下任意一种意图：
1. 提到想吃、馋、好奇当地食物或特产
2. 对当地文化、天气、生活习惯、小店表现出兴趣
3. 提到想要某件当地小物件（围巾、明信片、茶、小挂件等）
4. 问"你那边是不是有这种…""当地会不会有…"之类
只返回JSON：{"triggered":true} 或 {"triggered":false}，不要其他文字。`,
        [{ role: 'user', content: userText }]
      );
      const result = JSON.parse((raw || '').replace(/```json|```/g, '').trim());
      triggered = result.triggered === true;
    } catch(e) {
      // 模型失败：前筛两个都命中才保守触发
      triggered = hasLocation && hasInterest;
    }
    if (!triggered) return;

    // ── 随机抽一件特产 ────────────────────────────
    const item = specials[Math.floor(Math.random() * specials.length)];

    // ── 写入冷却时间戳 ────────────────────────────
    localStorage.setItem(sentKey, Date.now().toString());

    // ── 2-4天后出现包裹 ──────────────────────────
    const delay = (Math.floor(Math.random() * 3) + 2) * 24 * 3600 * 1000;
    setTimeout(() => {
      if (typeof addGhostReverseDelivery === 'function') {
        addGhostReverseDelivery({ ...item, isLocationSpecial: true }, 'location_special');
      }
    }, delay);

  } catch(e) {}
}


// ── 主动触发：Ghost在某地点待够3天自动反寄 ──────────────
// 在 initChat 或每日签到后调用
function checkLocationSpecialAutoTrigger() {
  try {
    const rawLocation = localStorage.getItem('currentLocation') || '';
    if (!rawLocation) return;

    const locationKey = LOCATION_KEY_MAP?.[rawLocation]
      || LOCATION_KEY_MAP?.[Object.keys(LOCATION_KEY_MAP || {}).find(k => rawLocation.includes(k))]
      || null;
    if (!locationKey) return;

    const specials = LOCATION_SPECIALS?.[locationKey];
    if (!specials || specials.length === 0) return;

    // 同地点7天冷却
    const sentKey  = 'locationSpecialSent_' + locationKey;
    const lastSent = parseInt(localStorage.getItem(sentKey) || '0');
    if (lastSent && Date.now() - lastSent < 7 * 24 * 3600 * 1000) return;

    // 关系门槛（主动寄比对话触发更亲密，门槛更高）
    const trust     = typeof getTrustHeat      === 'function' ? getTrustHeat()      : 60;
    const affection = typeof getAffection      === 'function' ? getAffection()      : 60;
    const mode      = localStorage.getItem('marriageType') || 'established';
    // slowBurn 阶段绝对不主动寄，太出戏
    if (mode === 'slowBurn') return;
    if (trust < 65 || affection < 70) return;

    // Ghost在此地点待够3天才主动触发
    const arrivedKey = 'locationArrivedAt_' + locationKey;
    const arrivedAt  = parseInt(localStorage.getItem(arrivedKey) || '0');
    if (!arrivedAt) {
      // 第一次记录到达时间
      localStorage.setItem(arrivedKey, Date.now().toString());
      return;
    }
    const daysHere = (Date.now() - arrivedAt) / (24 * 3600 * 1000);
    if (daysHere < 2) return; // 修复：待满2天才触发

    // 40%概率主动触发（不是每次都触发，保留随机感）
    if (Math.random() > 0.4) return;

    const item = specials[Math.floor(Math.random() * specials.length)];
    localStorage.setItem(sentKey, Date.now().toString());

    const delay = (Math.floor(Math.random() * 3) + 2) * 24 * 3600 * 1000;
    setTimeout(() => {
      if (typeof addGhostReverseDelivery === 'function') {
        addGhostReverseDelivery({ ...item, isLocationSpecial: true }, 'location_special');
      }
    }, delay);

  } catch(e) {}
}




function getStoryContext() {
  const flags = getRelationshipFlags();
  const triggered = (id) => {
    const book = JSON.parse(localStorage.getItem('storyBook') || '[]');
    return book.some(e => e.id === id);
  };
  return {
    triggered,
    flags,
    affection:   getAffection(),
    trust:       getTrustHeat(),
    mood:        getMoodLevel(),
    streak:      parseInt(localStorage.getItem('visitStreak') || '0'),
    marriageDays: (() => {
      const d = localStorage.getItem('marriageDate');
      return d ? Math.max(1, Math.floor((Date.now() - new Date(d)) / 86400000) + 1) : 0;
    })(),
    deliveries: JSON.parse(localStorage.getItem('deliveries') || '[]'),
  };
}

const STORY_EVENTS = [

  // ━━━ 起始确认 ━━━

  {
    id: 'first_i_love_you',
    icon: '💬',
    title: '初言心意',
    desc: '你第一次说出那三个字，他沉默了很久。',
    triggerOn: 'message',
    keyword: /我爱你|i love you/i,
    condition: (ctx) => ctx.affection >= 85 && !ctx.triggered('first_i_love_you'),
    execute: async () => {
      const res = await callGrokWithCtx(buildGhostStyleCore(), `[系统：她刚第一次对你说了"我爱你"。]`, 8);
      if (res) await emitGhostNarrativeEvent(res);
      setRelationshipFlag('saidILoveYou');
    }
  },

  {
    id: 'first_simon',
    icon: '🫂',
    title: '唤你本名',
    desc: '你第一次叫他Simon，不是Ghost——他顿了顿。',
    triggerOn: 'message',
    keyword: /\bsimon\b|\briley\b|西蒙|赖利/i,
    condition: (ctx) => ctx.affection >= 75 && ctx.trust >= 60 && !ctx.triggered('first_simon'),
    execute: async () => {
      const res = await callGrokWithCtx(buildGhostStyleCore(), `[系统：她刚叫了你的真名Simon，不是Ghost。这是她第一次这样叫你。]`, 6);
      if (res) await emitGhostNarrativeEvent(res);
      setRelationshipFlag('calledByName');
    }
  },

  {
    id: 'seven_day_streak',
    icon: '🗓️',
    title: '七日为期',
    desc: '连续来了七天，他终于开口，一句没有标点的话。',
    triggerOn: 'session',
    condition: (ctx) => parseInt(localStorage.getItem('visitStreak') || '0') >= 7 && !ctx.triggered('seven_day_streak'),
    execute: async () => {
      const res = await callGrokWithCtx(buildGhostStyleCore(), `[系统：她已经连续7天都来找你了，今天是第七天。你一直注意到了。]`, 4);
      if (res) await emitGhostNarrativeEvent(res);
    }
  },

  // ━━━ 照顾与察觉 ━━━

  {
    id: 'first_check_in',
    icon: '👁️',
    title: '留意于你',
    desc: '他第一次主动问你在哪，在做什么——不是顺口，是注意到了。',
    triggerOn: 'session',
    condition: (ctx) => {
      const count = parseInt(localStorage.getItem('checkInCount') || '0');
      return count >= 1 && ctx.trust >= 55 && !ctx.triggered('first_check_in');
    },
    execute: async () => {
      const res = await callGrokWithCtx(buildGhostStyleCore(), `[系统：你第一次主动找她，问她在干嘛或者有没有吃饭。不是顺口，是真的注意到了。]`, 4);
      if (res) await emitGhostNarrativeEvent(res);
    }
  },

  {
    id: 'first_notice_mood',
    icon: '🌧️',
    title: '无声相知',
    desc: '你没说，但他还是发现你状态不对。',
    triggerOn: 'message',
    keyword: /难过|不开心|好累|好烦|崩了|撑不住|不想说话|sad|tired|rough|not okay/i,
    condition: (ctx) => ctx.trust >= 60 && ctx.affection >= 70 && !ctx.triggered('first_notice_mood'),
    execute: async () => {
      const res = await callGrokWithCtx(buildGhostStyleCore(), `[系统：她没有明说，但你看出来她状态不对。你注意到了，用你的方式回应她。]`, 6);
      if (res) await emitGhostNarrativeEvent(res);
      setRelationshipFlag('sheCried');
    }
  },

  {
    id: 'first_mood_recovered',
    icon: '🌤️',
    title: '心归你处',
    desc: '那次他没再顶着情绪，是你把他拉回来的。',
    triggerOn: 'message',
    condition: (ctx) => {
      // 被用户哄回温过（updateMoodFromUserInput 触发后标记）
      return localStorage.getItem('moodRecoveredByUser') === 'true'
        && ctx.trust >= 55
        && !ctx.triggered('first_mood_recovered');
    },
    execute: async () => {
      const res = await callGrokWithCtx(buildGhostStyleCore(), `[系统：她把你哄回来了。你情绪低的时候，她说了什么让你松了一点。用你的方式承认这件事，或者别承认，但让她感觉到。]`, 6);
      if (res) await emitGhostNarrativeEvent(res);
      localStorage.removeItem('moodRecoveredByUser');
    }
  },

  // ━━━ 关系确认 ━━━

  {
    id: 'first_habit_formed',
    icon: '☕',
    title: '已成习惯',
    desc: '你不在的时候，他第一次觉得哪里不对。',
    triggerOn: 'session',
    condition: (ctx) => {
      const streak = parseInt(localStorage.getItem('visitStreak') || '0');
      return streak >= 5 && ctx.trust >= 65 && !ctx.triggered('first_habit_formed');
    },
    execute: async () => {
      const res = await callGrokWithCtx(buildGhostStyleCore(), `[系统：她已经连续几天都在，你开始习惯了。今天用一句话，自然地说出这种"习惯了"的感觉——不用解释，不用承认，就是说出来。]`, 4);
      if (res) await emitGhostNarrativeEvent(res);
    }
  },

  {
    id: 'first_future_assumption',
    icon: '🔭',
    title: '默然以待',
    desc: '他说起以后的时候，没有再问你会不会在。',
    triggerOn: 'message',
    condition: (ctx) => ctx.trust >= 70 && ctx.affection >= 78 && !ctx.triggered('first_future_assumption'),
    execute: async () => {
      const res = await callGrokWithCtx(buildGhostStyleCore(), `[系统：你说起以后某件事时，自然地把她算进去了——没有问她会不会在，就是默认了。用你的方式说一句带有未来感的话，轻的，不要太刻意。]`, 6);
      if (res) await emitGhostNarrativeEvent(res);
    }
  },

  {
    id: 'first_shared_routine',
    icon: '🫖',
    title: '日久有迹',
    desc: '那是一个很小的东西，但后来一直在。',
    triggerOn: 'session',
    condition: (ctx) => {
      const count = parseInt(localStorage.getItem('sharedRoutineCount') || '0');
      return count >= 3 && ctx.trust >= 65 && !ctx.triggered('first_shared_routine');
    },
    execute: async () => {
      const res = await callGrokWithCtx(buildGhostStyleCore(), `[系统：你们之间慢慢有了一个固定的小习惯——可能是某个时间、某句固定的话、或者某样东西。你注意到了，随口提一下，像是不经意说起，但其实你记得。]`, 4);
      if (res) await emitGhostNarrativeEvent(res);
    }
  },

  // ━━━ 物质与行为 ━━━

  {
    id: 'first_accept_gift',
    icon: '📦',
    title: '留而不言',
    desc: '那是他第一次没有退回你的东西。',
    triggerOn: 'message',
    condition: (ctx) => {
      const accepted = localStorage.getItem('firstUserGiftAccepted') === 'true';
      return accepted && !ctx.triggered('first_accept_gift');
    },
    execute: async () => {
      const res = await callGrokWithCtx(buildGhostStyleCore(), `[系统：她给你转了钱或送了东西，这次你没退。用你的方式回应——不用解释为什么收了，就是收了，然后继续。]`, 4);
      if (res) await emitGhostNarrativeEvent(res);
      localStorage.removeItem('firstUserGiftAccepted');
    }
  },

  {
    id: 'first_ghost_delivery',
    icon: '📮',
    title: '悄然寄至',
    desc: '他悄悄给你寄了东西，什么都没说。',
    triggerOn: 'message',
    condition: (ctx) => ctx.deliveries.some(d => d.isGhostSend && d.done) && !ctx.triggered('first_ghost_delivery'),
    execute: async () => {
      const d = getStoryContext().deliveries.find(d => d.isGhostSend && d.done);
      const res = await callGrokWithCtx(buildGhostStyleCore(), `[系统：她刚收到了你寄给她的「${d?.name || '东西'}」，这是你第一次主动给她寄东西。]`, 4);
      if (res) await emitGhostNarrativeEvent(res);
    }
  },

  {
    id: 'first_salary',
    icon: '💷',
    title: '薪日相托',
    desc: '发薪那天，他把钱转给了你。',
    triggerOn: 'message',
    condition: (ctx) => !!localStorage.getItem('lastSalaryAmount') && !ctx.triggered('first_salary'),
    execute: async () => {
      const amount = localStorage.getItem('lastSalaryAmount') || '';
      const res = await callGrokWithCtx(buildGhostStyleCore(), `[系统：你第一次给她转了工资£${amount}，想附一句话。]`, 4);
      if (res) await emitGhostNarrativeEvent(res);
      setRelationshipFlag('firstSalary');
    }
  },

  // ━━━ 保护与站队 ━━━

  {
    id: 'first_protective',
    icon: '🛡️',
    title: '唯你偏护',
    desc: '那一刻，他没有中立。',
    triggerOn: 'message',
    keyword: /欺负|骚扰|不公平|委屈|被针对|他们|她们|bully|unfair|harass|they|not fair/i,
    condition: (ctx) => ctx.trust >= 65 && !ctx.triggered('first_protective'),
    execute: async () => {
      const res = await callGrokWithCtx(buildGhostStyleCore(), `[系统：她遇到了一些让她委屈或不公平的事。你明显站在她这边——不是中立，不是讲道理，是偏向她。用你的方式表态，简短，但清楚。]`, 6);
      if (res) await emitGhostNarrativeEvent(res);
    }
  },

  // ━━━ 冲突与修复 ━━━

  {
    id: 'cold_war_repair',
    icon: '🌤️',
    title: '冰释之后',
    desc: '和好那天，他说出了从未说过的话。',
    triggerOn: 'coldWarEnd',
    condition: (ctx) => !ctx.triggered('cold_war_repair'),
    execute: async () => {
      const res = await callSonnet(buildSystemPrompt(), [...chatHistory.slice(-6), { role: 'user', content: `[系统：冷战刚刚结束，她回来了。你们之前从没经历过这种和好。]` }]);
      if (res) await emitGhostNarrativeEvent(res);
      setRelationshipFlag('coldWarRepaired');
      // 记录和好时间——供 '先行一步' 节点判断是否在3天内
      localStorage.setItem('coldWarRepairedAt', Date.now());
      changeTrustHeat(15);
    }
  },

  {
    id: 'post_conflict_initiative',
    icon: '🚶',
    title: '先行一步',
    desc: '这一次，是他先往前走了一步。',
    triggerOn: 'session',
    condition: (ctx) => {
      const repaired = ctx.flags.coldWarRepaired;
      const repairedAt = parseInt(localStorage.getItem('coldWarRepairedAt') || '0');
      const daysSince = (Date.now() - repairedAt) / 86400000;
      return repaired && daysSince <= 3 && ctx.trust >= 70 && !ctx.triggered('post_conflict_initiative');
    },
    execute: async () => {
      const res = await callGrokWithCtx(buildGhostStyleCore(), `[系统：冷战结束了，这次是你先开口靠近——不是等她来，是你先动了。用你的方式，主动一点点，但不要解释。]`, 4);
      if (res) await emitGhostNarrativeEvent(res);
    }
  },

  // ━━━ 重大节点 ━━━

  {
    id: 'first_meetup_plan',
    icon: '✈️',
    title: '见你前夜',
    desc: '机票、酒店、行程已定，他那晚彻夜未眠。',
    triggerOn: 'session',
    condition: (ctx) => ctx.flags.reunionReady && !ctx.triggered('first_meetup_plan'),
    execute: async () => {
      const res = await callSonnet(buildSystemPrompt(), [...chatHistory.slice(-6), { role: 'user', content: `[系统：她把来找你的机票、酒店、旅行计划全部订好了。你们第一次要真实见面了。]` }]);
      if (res) await emitGhostNarrativeEvent(res);
      changeAttachmentPull(20);
    }
  },

  {
    id: 'first_birthday',
    icon: '🎂',
    title: '生辰记得',
    desc: '你的生日，他早就知道了。',
    triggerOn: 'session',
    condition: (ctx) => {
      const birthday = localStorage.getItem('userBirthday');
      if (!birthday) return false;
      const [bm, bd] = birthday.split('-').map(Number);
      const now = new Date();
      return now.getMonth() + 1 === bm && now.getDate() === bd && !ctx.triggered('first_birthday');
    },
    execute: async () => {
      const res = await callGrokWithCtx(buildGhostStyleCore(), `[系统：今天是她的生日，她还没开口，你已经知道了。]`, 4);
      if (res) await emitGhostNarrativeEvent(res);
    }
  },

  {
    id: 'one_year',
    icon: '💍',
    title: '岁岁年年',
    desc: '在一起整整一年，他主动发来消息。',
    triggerOn: 'session',
    condition: (ctx) => ctx.marriageDays >= 365 && !ctx.triggered('one_year'),
    execute: async () => {
      const res = await callSonnet(buildSystemPrompt(), [...chatHistory.slice(-4), { role: 'user', content: `[系统：今天是你们在一起整整一年，你记得这个日期。]` }]);
      if (res) await emitGhostNarrativeEvent(res);
    }
  },

  // ━━━ 最高级亲密 ━━━

  {
    id: 'first_unspoken_understood',
    icon: '🌙',
    title: '不言而知',
    desc: '你没说，但他已经知道了。',
    triggerOn: 'message',
    condition: (ctx) => ctx.trust >= 75 && ctx.affection >= 82 && !ctx.triggered('first_unspoken_understood'),
    execute: async () => {
      const res = await callGrokWithCtx(buildGhostStyleCore(), `[系统：她没有明说，但你已经准确知道她在想什么或者需要什么。用你的方式回应，不用解释你是怎么知道的，就是知道了。]`, 6);
      if (res) await emitGhostNarrativeEvent(res);
    }
  },

  // ━━━ 快递与生活里程碑（从feed.js合并）━━━

  {
    id: 'first_lost_package',
    icon: '📭',
    title: '途中遗失',
    desc: '第一次快递丢了。',
    triggerOn: 'session',
    condition: (ctx) => {
      const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
      return deliveries.some(d => d.isLostConfirmed) && !ctx.triggered('first_lost_package');
    },
    execute: async () => {
      await new Promise(r => setTimeout(r, 2500));
      const lost = JSON.parse(localStorage.getItem('deliveries') || '[]').find(d => d.isLostConfirmed);
      const res = await callGrokWithCtx(buildGhostStyleCore(), `[系统：她寄给你的「${lost?.name || '包裹'}」快递丢失了。这是你们第一次遇到这种事。]`, 4);
      if (res) await emitGhostNarrativeEvent(res);
    }
  },

  {
    id: 'first_from_home',
    icon: '🍜',
    title: '家乡的味道',
    desc: '他第一次收到你从家寄来的特产。',
    triggerOn: 'session',
    condition: (ctx) => {
      const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
      return deliveries.some(d => d.productData?.isFromHome && d.done && !d.isGhostSend) && !ctx.triggered('first_from_home');
    },
    execute: async () => {
      await new Promise(r => setTimeout(r, 3500));
      const item = JSON.parse(localStorage.getItem('deliveries') || '[]').find(d => d.productData?.isFromHome && d.done && !d.isGhostSend);
      const res = await callGrokWithCtx(buildGhostStyleCore(), `[系统：她从中国给你寄了「${item?.name || '家乡的东西'}」，这是她第一次给你寄家乡的东西。]`, 4);
      if (res) await emitGhostNarrativeEvent(res);
    }
  },

  {
    id: 'first_reverse_ship',
    icon: '💌',
    title: '悄悄寄出',
    desc: '包裹里不止是礼物，还有他悄然无声的关怀。',
    triggerOn: 'session',
    condition: (ctx) => {
      const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
      return deliveries.some(d => d.isGhostSend && d.isEmotionReverse) && !ctx.triggered('first_reverse_ship');
    },
    execute: async () => {
      await new Promise(r => setTimeout(r, 4000));
      const res = await callGrokWithCtx(buildGhostStyleCore(), `[系统：你悄悄给她寄了东西，没有告诉她，等她自己发现。这是第一次。]`, 4);
      if (res) await emitGhostNarrativeEvent(res);
      setRelationshipFlag('firstReverseShip');
    }
  },

  {
    id: 'hundred_days',
    icon: '🕯️',
    title: '百日有余',
    desc: '在一起第100天。',
    triggerOn: 'session',
    condition: (ctx) => ctx.marriageDays >= 100 && ctx.marriageDays <= 102 && !ctx.triggered('hundred_days'),
    execute: async () => {
      await new Promise(r => setTimeout(r, 3000));
      const days = Math.max(1, Math.floor((Date.now() - new Date(localStorage.getItem('marriageDate'))) / 86400000) + 1);
      const res = await callGrokWithCtx(buildGhostStyleCore(), `[系统：今天是你们在一起第${days}天，一百天左右的节点。]`, 4);
      if (res) await emitGhostNarrativeEvent(res);
    }
  },

  // ━━━ 外卖 ━━━

  {
    id: 'first_takeout',
    icon: '🛵',
    title: '初尝烟火',
    desc: '你第一次给他点了外卖——隔着时区，把一顿热的送到他那里。',
    triggerOn: 'session',
    condition: (ctx) => {
      const history = JSON.parse(localStorage.getItem('takeoutHistory') || '[]');
      return history.length >= 1 && !ctx.triggered('first_takeout');
    },
    execute: async () => {
      await new Promise(r => setTimeout(r, 3000));
      const history = JSON.parse(localStorage.getItem('takeoutHistory') || '[]');
      const first = history[history.length - 1];
      const itemHint = first ? `第一次是「${first.name}」，从${first.cityLabel || '那边'}点的。` : '';
      const res = await callGrokWithCtx(
        buildGhostStyleCore(),
        `[系统：她给你点了外卖，食物送到了你那里。${itemHint}你没想到有人会这样照顾你——隔着半个地球，给你送一顿热的。用你的方式反应，不用多说，但让她感觉到你注意到了。]`,
        6
      );
      if (res) await emitGhostNarrativeEvent(res);
    }
  },

  {
    id: 'midnight_delivery',
    icon: '🌙',
    title: '夜半念及',
    desc: '那个深夜，她没睡，想的是他有没有吃东西。',
    triggerOn: 'session',
    condition: (ctx) => {
      const history = JSON.parse(localStorage.getItem('takeoutHistory') || '[]');
      const hasMidnight = history.some(o => o.feeLabel && o.feeLabel.includes('凌晨'));
      return hasMidnight && ctx.affection >= 75 && !ctx.triggered('midnight_delivery');
    },
    execute: async () => {
      await new Promise(r => setTimeout(r, 3000));
      const res = await callGrokWithCtx(
        buildGhostStyleCore(),
        `[系统：她在凌晨给你点了外卖。那个时间她应该在睡觉，但她没有，她想的是你有没有吃东西。你知道这意味着什么。用你的方式回应，不必把话说满。]`,
        6
      );
      if (res) await emitGhostNarrativeEvent(res);
    }
  },

  {
    id: 'city_collector',
    icon: '🗺️',
    title: '千里同食',
    desc: '你换到哪，她就给你点哪里的——她一直在跟着你的位置。',
    triggerOn: 'session',
    condition: (ctx) => {
      const history = JSON.parse(localStorage.getItem('takeoutHistory') || '[]');
      const cities = new Set(history.map(o => o.city).filter(Boolean));
      return cities.size >= 5 && ctx.affection >= 80 && ctx.trust >= 70 && !ctx.triggered('city_collector');
    },
    execute: async () => {
      await new Promise(r => setTimeout(r, 3000));
      const history = JSON.parse(localStorage.getItem('takeoutHistory') || '[]');
      const cities = [...new Set(history.map(o => o.cityLabel || o.city).filter(Boolean))].slice(0, 5);
      const res = await callGrokWithCtx(
        buildGhostStyleCore(),
        `[系统：她跟着你换过的城市，一一给你点过当地的外卖——${cities.join('、')}。她一直在注意你在哪里。你不知道该说什么，但你注意到了这件事。]`,
        6
      );
      if (res) await emitGhostNarrativeEvent(res);
    }
  },

];

function markStoryDone(event) {
  const book = JSON.parse(localStorage.getItem('storyBook') || '[]');
  if (!book.find(e => e.id === event.id)) {
    book.push({ id: event.id, title: event.title, desc: event.desc, at: Date.now() });
    localStorage.setItem('storyBook', JSON.stringify(book));
    if (typeof touchLocalState === 'function') touchLocalState();
  }
}

function showStoryUnlockHint(title) {
  const el = document.getElementById('storyUnlockHint');
  if (!el) return;
  el.textContent = `📖 ${title} 已解锁`;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}

async function _triggerStory(event) {
  try {
    markStoryDone(event);
    showStoryUnlockHint(event.title);
    await event.execute();
  } catch(e) {
    console.warn('[story] 触发失败:', event.id, e);
  }
}

function checkStoryOnSessionStart() {
  const ctx = getStoryContext();

  // celebration fallback：生日/纪念日识别到但关系不够深，不给钱，Ghost说一句存在感
  _checkCelebrationFallback();

  for (const event of STORY_EVENTS) {
    if (event.triggerOn === 'session' && event.condition(ctx)) {
      setTimeout(() => _triggerStory(event), 3000);
      break; // 每次会话只触发一个
    }
  }
}

// Level < 2 时：生日/纪念日不给钱，但 Ghost 说一句
async function _checkCelebrationFallback() {
  if (typeof getMoneyComfortLevel === 'function' && getMoneyComfortLevel() >= 2) return;

  const userBirthday = localStorage.getItem('userBirthday');
  const isBirthday = userBirthday && (() => {
    const [bm, bd] = userBirthday.split('-').map(Number);
    const now = new Date();
    return now.getMonth() + 1 === bm && now.getDate() === bd;
  })();

  const marriageDate      = localStorage.getItem('marriageDate');
  const marriageDaysTotal = marriageDate
    ? Math.max(1, Math.floor((Date.now() - new Date(marriageDate)) / 86400000) + 1)
    : 0;
  const isAnniversary = marriageDate && marriageDaysTotal >= 365 && (() => {
    const [, mm, mdd] = marriageDate.split('-').map(Number);
    const now = new Date();
    return now.getMonth() + 1 === mm && now.getDate() === mdd;
  })();

  if (!isBirthday && !isAnniversary) return;

  const key = 'celebrationFallback_' + new Date().toISOString().slice(0, 10);
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, '1');

  const hint = isBirthday
    ? `Today is her birthday. You know. Not giving money — the relationship is not there yet. But you are not pretending you don't know either. One short line. Dry. Understated. Not sweet. Not cold. Just present. English only.`
    : `Today is your anniversary. You remember the date. Not giving money — not yet. One short line. Quiet acknowledgment. English only.`;

  setTimeout(async () => {
    try {
      const res = await callGrokWithCtx(
        buildGhostStyleCore() + '\n' + hint,
        'Write his line.',
        4
      );
      if (res && res.trim()) await emitGhostNarrativeEvent(res.trim(), { delayMs: 2000 });
    } catch(e) {}
  }, 5000);
}

function checkStoryOnMessage(userText) {
  const ctx = getStoryContext();
  for (const event of STORY_EVENTS) {
    if (event.triggerOn !== 'message') continue;
    // 有 keyword 的先过关键词，没命中直接跳过——防止漏触发
    if (event.keyword && !event.keyword.test(userText)) continue;
    if (event.condition(ctx)) {
      setTimeout(() => _triggerStory(event), 1500);
      break;
    }
  }
}

function checkStoryOnColdWarEnd() {
  const ctx = getStoryContext();
  const event = STORY_EVENTS.find(e => e.triggerOn === 'coldWarEnd' && e.condition(ctx));
  if (event) setTimeout(() => _triggerStory(event), 8000);
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
    const dateStr = new Date(e.at || e.unlockedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    return `
    <div class="film-card unlocked">
      <div class="film-holes"><div class="film-hole"></div><div class="film-hole"></div><div class="film-hole"></div><div class="film-hole"></div></div>
      <div class="film-img"><div class="film-img-icon">${icon}</div></div>
      <div class="film-info">
        <div class="film-title">${e.title}</div>
        <div class="film-desc">${event?.desc || e.desc || ''}</div>
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


// ── triggerSeriousTalk ───────────────────────────
// 好感度跌到临界点时 Ghost 主动发起认真对话
// 由 state.js 的 setAffection() 触发

function triggerSeriousTalk() {
  const chatScreen = document.getElementById('chatScreen');
  if (!chatScreen || !chatScreen.classList.contains('active')) {
    localStorage.setItem('pendingSeriousTalk', 'true');
    return;
  }
  localStorage.removeItem('pendingSeriousTalk');

  const prompt = '[System: Affection has dropped to a critical point. Ghost initiates a serious conversation in his own way — not dramatic, not a speech. Brief. Real. He noticed something is off.]';
  if (typeof chatHistory !== 'undefined') {
    chatHistory.push({ role: 'user', content: prompt, _system: true });
    if (typeof saveHistory === 'function') saveHistory();
  }
  if (typeof showTyping === 'function') showTyping();

  const sys = typeof buildSystemPrompt === 'function' ? buildSystemPrompt() : '';
  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: getMainModel(),
      max_tokens: 1000,
      system: sys,
      messages: typeof chatHistory !== 'undefined' ? chatHistory.slice(-20) : []
    })
  }).then(r => r.json()).then(data => {
    if (typeof hideTyping === 'function') hideTyping();
    const reply = data.content?.[0]?.text || '...';
    if (typeof appendMessage === 'function') appendMessage('bot', reply.trim());
    if (typeof chatHistory !== 'undefined') {
      chatHistory.push({ role: 'assistant', content: reply });
      if (typeof saveHistory === 'function') saveHistory();
    }
    if (typeof setAffection === 'function') setAffection(70);
    if (typeof changeMood   === 'function') changeMood(1);
  }).catch(() => {
    if (typeof hideTyping === 'function') hideTyping();
  });
}
