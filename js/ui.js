// ============================================================
// ui.js — 界面工具层
// 负责：消息气泡渲染、打字动画、转账卡片、时间分割线、历史重建
// 依赖：api.js（isBreakout、safeParseJSON）
// 外部依赖（定义在其他文件，直接调用）：
//   showToast、collectMessage、showPhotoPreview、showUserDraftCard
//   renderGhostProfile、STICKER_META、chatHistory、saveHistory
// ============================================================

// ===== 状态变量 =====
let lastMessageTime = null; // 上一条消息的时间，用于时间分割线判断

// ===== 时间工具 =====

function formatTime(date) {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

// 两条消息间隔超过15分钟才显示时间分割线
function shouldShowTime(now) {
  if (!lastMessageTime) return true;
  return (now - lastMessageTime) > 15 * 60 * 1000;
}

function appendTimeDivider(date) {
  const container = document.getElementById('messagesContainer');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'time-divider';
  div.innerHTML = `<span>${formatTime(date)}</span>`;
  container.appendChild(div);
}

// ===== 滚动 =====

function scrollToBottom() {
  const container = document.getElementById('messagesContainer');
  if (container) container.scrollTop = container.scrollHeight;
}

// ===== 打字动画 =====

function showTyping() {
  // 防止重复插入
  if (document.getElementById('typingIndicator')) return;
  const container = document.getElementById('messagesContainer');
  if (!container) return;
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

// ===== 已读状态 =====

function updateToRead() {
  document.querySelectorAll('.message.user .message-status')
    .forEach(s => { s.textContent = '已读'; });
}

// ===== 文本清洗（bot回复专用）=====
// 统一在渲染前做一次，防止系统tag显示在气泡里
// 同时处理unlock tag解锁逻辑

const _UNLOCK_VALID_FIELDS = ['birthday', 'zodiac', 'height', 'weight', 'blood_type', 'hometown'];

function cleanBotText(text, scene = 'normal') {
  if (!text) return '';

  // 0. 破防检测 — 出口统一拦截
  if (typeof isBreakout === 'function' && isBreakout(text)) {
    // 加锁防止并发多次触发
    if (!_breakoutFallbackLock) {
      _breakoutFallbackLock = true;
      setTimeout(async () => {
        try {
          const recentCtx = (typeof chatHistory !== 'undefined' ? chatHistory : [])
            .filter(m => !m._system && !m._recalled)
            .slice(-6)
            .map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${m.content.slice(0, 200)}`)
            .join('\n');
          const fallback = typeof callGrok === 'function'
            ? await callGrok(recentCtx, 300, null, _currentBotScene)
            : '';
          if (fallback && typeof isBreakout === 'function' && !isBreakout(fallback)) {
            appendMessage('bot', fallback);
            if (typeof chatHistory !== 'undefined') {
              chatHistory.push({ role: 'assistant', content: fallback });
              if (typeof saveHistory === 'function') saveHistory();
            }
          }
        } catch(e) {}
        finally { _breakoutFallbackLock = false; }
      }, 0);
    }
    return ''; // 阻止原破防内容渲染
  }

  // 1. 去掉Ghost:前缀（Grok偶尔加）
  text = text.replace(/^ghost\s*:\s*/i, '').trim();

  // 2. 清除系统控制tag
  text = text.replace(/\n?(REFUND|(?<![a-zA-Z])KEEP(?![a-zA-Z])|COLD_WAR_START|GIVE_MONEY:[^\n]*)\n?/g, '').trim();

  // 3. 解析并处理 unlock tag（解锁资料，然后从文本里删掉）
  // 数组格式：{"unlock": ["height","weight"]}
  const unlockArr = text.match(/"unlock"\s*:\s*\[([^\]]+)\]/);
  if (unlockArr) {
    const fields = (unlockArr[1].match(/"([^"]+)"/g) || []).map(f => f.replace(/"/g, ''));
    fields.forEach(f => {
      if (_UNLOCK_VALID_FIELDS.includes(f)) localStorage.setItem(`ghostUnlocked_${f}`, 'true');
    });
    if (typeof renderGhostProfile === 'function') renderGhostProfile();
  } else {
    // 单个格式：{"unlock": "height"} 或 {'unlock': null}
    const unlockSingle = text.match(/"unlock"\s*:\s*"([^"]+)"/);
    if (unlockSingle) {
      const f = unlockSingle[1].trim();
      if (_UNLOCK_VALID_FIELDS.includes(f)) {
        localStorage.setItem(`ghostUnlocked_${f}`, 'true');
        if (typeof renderGhostProfile === 'function') renderGhostProfile();
      }
    }
  }
  // 全格式清除（含null、数组、单个、夹在中间的）
  text = text.replace(/\{[^}\]]*"unlock"[^}\]]*[\]]*\}/g, '').trim();
  text = text.replace(/\{\s*"unlock"\s*:\s*null\s*\}/g, '').trim();
  text = text.replace(/\{\s*'unlock'\s*:\s*null\s*\}/g, '').trim();
  text = text.replace(/'unlock'\s*:\s*null/g, '').trim();

  // 4. 过滤 --- 开头的系统旁白行
  text = text.split('\n')
    .filter(line => !line.trim().startsWith('---'))
    .join('\n').trim();

  // 5. 过滤纯中文第三人称旁白（以"他"开头、无英文、短句）
  text = text.split('\n').filter(line => {
    const t = line.trim();
    if (/^他[^a-zA-Z]{0,30}[。，]?$/.test(t) && !/[a-zA-Z]/.test(t)) return false;
    return true;
  }).join('\n').trim();

  // 6. 过滤系统指令方括号（保留 [silence] [He looks away] 等动作描写）
  text = text.replace(/\[(?:系统|System|SYSTEM|Tone|tone|Scene|scene|Context|context|Note|note|Hint|hint|Override|override|RULE|Rule)[^\]]{0,400}\]/g, '').trim();

  // 6.5 过滤第三人称旁白方括号（[She told him...] [He already knew...] 等模型滑落成叙事者的内容）
  text = text.replace(/\[(?:She|He|she|he|Ghost|They|they)[^\]]{0,600}\]/g, '').trim();

  // 6.6 过滤多行第三人称旁白块（以 [She/He 开头、跨行的叙事段落）
  text = text.replace(/\[(?:She|He|she|he|Ghost)[^\]]*(?:\n[^\]]*){0,10}\]/g, '').trim();

  // 7. 过滤【系统指令】全角括号
  text = text.replace(/【[^】]{0,400}】/g, '').trim();

  // 8. 删除 *动作描述*（异地设定，不应出现物理动作）
  text = text.replace(/\*[^*]+\*/g, '').trim();

  // 8.5 过滤物理接触/距离违规表达
  const distancePatterns = [
    /\bcome here\b/gi,
    /\bcome to me\b/gi,
    /\bcome back to me\b/gi,
    /\bi'?ll hold (you|her)\b/gi,
    /\blet me (pull|hold|touch|reach|grab|take)\b/gi,
    /\bpull(s|ed)? (you|her) (close|in|near)\b/gi,
    /\breach(es|ed)? (for|out|over)\b/gi,
    /\b(sits|sat|stands|stood|moves|moved|steps|stepped) (beside|next to|closer|toward)\b/gi,
  ];
  distancePatterns.forEach(p => { text = text.replace(p, '').trim(); });

  // 9. 清理多余空行和空格
  text = text.replace(/\n{2,}/g, '\n').replace(/\s{2,}/g, ' ').trim();

  return text;
}

// ===== 破防场景提示（由各模块在 appendMessage 前设置）=====
// 用于 cleanBotText 出口兜底时选择正确的 Grok scene
let _currentBotScene = 'normal';
function setBotScene(scene) { _currentBotScene = scene || 'normal'; }

// 破防兜底全局锁，防止多次并发触发 Grok 补充
let _breakoutFallbackLock = false;

// ===== 核心：appendMessage =====
// 返回 { msgDiv, bubble, innerThoughtEl }
// 失败/空内容返回 { msgDiv: null, bubble: null, innerThoughtEl: null }

function appendMessage(role, text, animate = true) {
  const container = document.getElementById('messagesContainer');
  if (!container) return { msgDiv: null, bubble: null, innerThoughtEl: null };

  const now = new Date();

  // bot消息：先清洗
  if (role === 'bot' || role === 'assistant') {
    text = cleanBotText(text);
  }

  // 空内容不渲染
  if (!text || !text.trim()) return { msgDiv: null, bubble: null, innerThoughtEl: null };

  // 时间分割线
  if (animate && shouldShowTime(now)) {
    appendTimeDivider(now);
    lastMessageTime = now;
  }

  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role === 'assistant' ? 'bot' : role}`;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  // ── bot消息渲染 ──────────────────────────────────────────
  if (role === 'bot' || role === 'assistant') {
    const isChinese = s => /[\u4e00-\u9fff]/.test(s);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const firstZhIdx = lines.findIndex(l => isChinese(l));

    let enText = '';

    if (firstZhIdx > 0) {
      // Ghost输出了双语：只取英文部分，中文忽略（翻译功能已移除）
      enText = lines.slice(0, firstZhIdx).join('\n');
    } else if (firstZhIdx === 0) {
      // 中文开头：如果有英文行就取英文，没有就直接显示中文
      const enLines = lines.filter(l => !isChinese(l));
      if (enLines.length > 0) {
        enText = enLines.join('\n');
      } else {
        // 纯中文：直接显示
        bubble.textContent = text;
        contentDiv.appendChild(bubble);
        msgDiv.appendChild(contentDiv);
        container.appendChild(msgDiv);
        if (animate) scrollToBottom();
        return { msgDiv, bubble, innerThoughtEl: null };
      }
    } else {
      // 纯英文
      enText = text;
    }

    // enText为空：不渲染空气泡
    if (!enText || !enText.trim()) {
      return { msgDiv: null, bubble: null, innerThoughtEl: null };
    }

    // 每句话单独一行（句号/问号/感叹号后跟空格换行）
    const formattedEn = enText
      .replace(/([.!?])\s+([a-zA-Z"'])/g, '$1\n$2')
      .replace(/([.!?])\s*$/gm, '$1')
      .trim();

    if (!formattedEn.trim()) return { msgDiv: null, bubble: null, innerThoughtEl: null };

    const enLine = document.createElement('div');
    enLine.className = 'bubble-en';
    enLine.textContent = formattedEn;
    enLine.style.whiteSpace = 'pre-line';
    bubble.appendChild(enLine);

  } else {
    // ── user消息 ──────────────────────────────────────────
    bubble.textContent = text;
  }

  contentDiv.appendChild(bubble);

  // ── 消息附件区 ──────────────────────────────────────────
  if (role === 'user') {
    // 用户消息：已读状态
    const status = document.createElement('div');
    status.className = 'message-status';
    status.textContent = '已读';
    contentDiv.appendChild(status);
  } else {
    // bot消息：收藏按钮（点击气泡才显示）
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.style.display = 'none';

    const collectBtn = document.createElement('button');
    collectBtn.className = 'message-action-btn';
    collectBtn.textContent = '⭐';
    collectBtn.title = '收藏';
    collectBtn.onclick = function(e) {
      e.stopPropagation();
      if (typeof collectMessage === 'function') collectMessage(this);
    };
    actions.appendChild(collectBtn);
    contentDiv.appendChild(actions);

    // 内心独白容器（初始隐藏，由 innerThought.js 异步填充）
    const innerThought = document.createElement('div');
    innerThought.className = 'inner-thought';
    innerThought.style.display = 'none';
    innerThought.dataset.ready = '0';
    innerThought.innerHTML = '<span class="inner-thought-label">👁 只有你知道</span><div class="inner-thought-text"></div>';
    contentDiv.appendChild(innerThought);

    // 心声按钮：新消息到来时重置（只在没有未读心声时才变暗）
    const thoughtBtn = document.getElementById('thoughtBtn');
    if (thoughtBtn && thoughtBtn.dataset.hasThought !== '1') {
      thoughtBtn.style.opacity = '0.3';
      thoughtBtn.classList.remove('thought-btn-pulse');
    }

    // 点击气泡：显示/隐藏收藏按钮，同时隐藏其他气泡的收藏按钮
    bubble.style.cursor = 'pointer';
    bubble.onclick = function(e) {
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

// ===== Ghost表情包 =====

function appendGhostSticker(id) {
  const container = document.getElementById('messagesContainer');
  if (!container) return;
  const meta = (typeof STICKER_META !== 'undefined') ? STICKER_META[id] : null;
  const div = document.createElement('div');
  div.className = 'message bot';
  div.innerHTML = `<div class="sticker-message"><img src="images/stickers/${id}.png" alt="${meta?.label || ''}"></div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  if (typeof chatHistory !== 'undefined') {
    chatHistory.push({ role: 'assistant', content: `[Ghost发了表情包：${meta?.label || id}]` });
    if (typeof saveHistory === 'function') saveHistory();
  }
}

// ===== 转账卡片 =====
// showUserTransferCard / updateUserTransferCard / showGhostTransferCard
// 定义在 money.js，不在这里重复定义

// ===== 历史记录重建渲染 =====
// initChat 调用，把 localStorage 里的 chatHistory 全部重建到 DOM

function renderChatHistory(chatHistory) {
  const container = document.getElementById('messagesContainer');
  if (!container) return;
  container.innerHTML = '';
  lastMessageTime = null; // 重置时间分割线状态

  chatHistory.forEach((msg, idx) => {
    // ── 用户消息 ────────────────────────────────────────────
    if (msg.role === 'user') {
      // 系统注入消息不渲染，但转账卡片要重建
      if (msg._system || msg.content.startsWith('[系统') || msg.content.startsWith('[System') ||
          /\b(REFUND|(?<![a-zA-Z])KEEP(?![a-zA-Z]))\b/.test(msg.content)) {
        if (msg._userTransfer) {
          showUserTransferCard(container, msg._userTransfer.amount);
        }
        return;
      }

      // 用户发的表情包
      const userStickerMatch = msg.content.match(/^\[用户发了表情包id：(.+)，标签：(.+)\]$/) ||
                               msg.content.match(/^\[用户发了表情包：(.+)\]$/);
      if (userStickerMatch) {
        const stickerId = userStickerMatch[1];
        const label = userStickerMatch[2] || userStickerMatch[1];
        const div = document.createElement('div');
        div.className = 'message user';
        div.innerHTML = `<div class="sticker-message"><img src="images/stickers/${stickerId}.png" alt="${label}"></div>`;
        container.appendChild(div);
        return;
      }

      // 用户发的图片
      const photoSrcs = (msg._photoUrls && msg._photoUrls.length > 0)
        ? msg._photoUrls
        : (msg._photoBase64 && msg._photoBase64.length > 0)
          ? msg._photoBase64.map(b64 => `data:image/jpeg;base64,${b64}`)
          : null;

      if (photoSrcs) {
        const div = document.createElement('div');
        div.className = 'message user';
        div.style.cssText = 'display:flex;justify-content:flex-end;margin:4px 0;';
        const maxW = photoSrcs.length > 1 ? '130px' : '220px';
        div.innerHTML = `<div style="display:inline-flex;gap:6px;flex-wrap:wrap;max-width:280px;">
          ${photoSrcs.map(src =>
            `<img src="${src}" style="max-width:${maxW};border-radius:12px;display:block;cursor:pointer;"
              onclick="if(typeof showPhotoPreview==='function')showPhotoPreview('${src}')" />`
          ).join('')}
        </div>`;
        container.appendChild(div);
        return;
      }

      appendMessage('user', msg.content, false);

    // ── assistant消息 ────────────────────────────────────────
    } else if (msg.role === 'assistant') {
      // 已撤回：显示撤回提示
      if (msg._recalled) {
        const div = document.createElement('div');
        div.className = 'message bot';
        div.innerHTML = `<div class="message-content"><div class="message-bubble">
          <span style="opacity:0.4;font-size:11px;font-style:italic">Ghost 撤回了一条消息</span>
        </div></div>`;
        container.appendChild(div);
        return;
      }

      // Ghost发的表情包
      const ghostStickerMatch = msg.content.match(/^\[Ghost发了表情包：(.+)\]$/);
      if (ghostStickerMatch) {
        const label = ghostStickerMatch[1];
        const meta = (typeof STICKER_META !== 'undefined') ? STICKER_META : {};
        const stickerId = Object.keys(meta).find(k => meta[k]?.label === label) || label;
        const div = document.createElement('div');
        div.className = 'message bot';
        div.innerHTML = `<div class="sticker-message"><img src="images/stickers/${stickerId}.png" alt="${label}"></div>`;
        container.appendChild(div);
        return;
      }

      // 普通消息（可能含 \n---\n 分段）
      const parts = msg.content.split(/\n---\n/).filter(p => p.trim());
      parts.forEach(part => appendMessage('bot', part.trim(), false));

      // 重建转账卡片（静态版，不走setTimeout延迟，防重复）
      if (msg._transfer) {
        const cardId = 'transfer_' + idx;
        if (!document.getElementById(cardId)) {
          const { amount: rawAmount, isRefund } = msg._transfer;
          const amount = parseInt(rawAmount, 10) || 0;
          const timeStr = formatTime(new Date());

          // Ghost转出卡片
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
            </div>
          </div>`;
          container.appendChild(divOut);

          // 用户收到卡片
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
            </div>
          </div>`;
          container.appendChild(divIn);
        }
      }
    }
  });

  scrollToBottom();
}


// ===== 气泡按钮长按菜单 =====
let _chatMenuTimer = null;

function startChatMenuTimer(e) {
  _chatMenuTimer = setTimeout(() => {
    showChatMenu(e);
  }, 600); // 长按600ms触发
}

function clearChatMenuTimer() {
  if (_chatMenuTimer) {
    clearTimeout(_chatMenuTimer);
    _chatMenuTimer = null;
  }
}

function showChatMenu(e) {
  e.preventDefault();
  const menu = document.getElementById('chatContextMenu');
  if (!menu) return;
  const btn = document.getElementById('thoughtBtn');
  const rect = btn ? btn.getBoundingClientRect() : { right: window.innerWidth - 10, top: 60 };
  menu.style.display = 'block';
  menu.style.right = (window.innerWidth - rect.right) + 'px';
  menu.style.top = (rect.bottom + 8) + 'px';
  setTimeout(() => document.addEventListener('click', hideChatMenuOnOutside), 10);
}

function hideChatMenu() {
  const menu = document.getElementById('chatContextMenu');
  if (menu) menu.style.display = 'none';
  document.removeEventListener('click', hideChatMenuOnOutside);
}

function hideChatMenuOnOutside(e) {
  const menu = document.getElementById('chatContextMenu');
  if (menu && !menu.contains(e.target)) hideChatMenu();
}

function clearRecentMessages() {
  if (!confirm('清理最近30条消息？这会让对话从这里重新开始。')) return;
  if (typeof chatHistory === 'undefined') return;
  // 保留系统消息和30条以前的历史
  const systemMsgs = chatHistory.filter(m => m._system);
  const realMsgs = chatHistory.filter(m => !m._system && !m._recalled);
  const keepMsgs = realMsgs.slice(0, Math.max(0, realMsgs.length - 30));
  chatHistory = [...keepMsgs, ...systemMsgs.slice(-5)];
  if (typeof saveHistory === 'function') saveHistory();
  // 重新渲染
  const container = document.getElementById('messagesContainer');
  if (container) container.innerHTML = '';
  if (typeof refreshChatScreen === 'function') refreshChatScreen();
  if (typeof showToast === 'function') showToast('已清理最近30条消息');
}
