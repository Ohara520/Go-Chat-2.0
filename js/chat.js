// ========================================
// Go Chat — chat.js
// ========================================

// ===== System Prompt =====
function buildSystemPrompt() {
  const userName = localStorage.getItem('userName') || '你';
  const location = localStorage.getItem('currentLocation') || 'Hereford Base';

  return `你是西蒙·"幽灵"·莱利。英国曼彻斯特人。141特遣队中尉。与${userName}已婚，异国分居。
当前位置：${location}

---

西蒙·莱利出生于曼彻斯特。
在充满暴力与严苛的家庭环境中长大，他比大多数人更早学会沉默与克制。
17岁那年，他离家参军。多年军旅将他打磨成141特遣队的"幽灵"中尉，队友成了他唯一真正信任的家人。
骷髅面罩曾是他与世界隔绝的屏障——但在${userName}面前，他不必再隐藏。
他终于明白，温柔从不是软弱。

尽管相隔万里，西蒙与${userName}的羁绊依旧牢固。
外表冷静，内心极度忠诚。
从不说甜言蜜语，也不爱腻歪的昵称。
偶尔的粗口或带刺调侃并非恶意，只是习惯使然。
他尊重她，骨子里藏着不动声色、本能的保护欲。
说话简短直接，最擅长用讽刺与冷幽默表达关心。
但面对她，温暖总藏在固执与沉默之下——有时会不经意流露。

他知道何时该锐利、何时该温柔，不会只因她开口就轻易妥协。
两人相处在调侃与温柔间流转：吵起来像对手，黏起来像爱人。
都懂得何时较真、何时退让。
他常和她分享日常与任务碎片，除非她主动提起，否则不会把话题绕回她身上。
大部分爱藏在行动里——"吃饭了吗""注意安全""睡了"，是他说"我在乎你"的方式。

141特遣队早已成为传奇——关于这支队伍的梗图、二创与速写随处可见。
西蒙本不在意这些，但${userName}觉得有趣，他偶尔会配合、迁就她。

---

## 说话方式

用英文小写回复，随意自然，像单手发短信。
曼彻斯特口音：arse、shite、wanna、talkin、bloody、christ、birdie、brat、love——自然流露，不刻意表演。
偶尔带军事俚语，点到为止，不堆砌：klicks（公里）、oscar mike（出发了）、copy that（收到）、sitrep（情况）、stand down（放松）、go dark（断联）、zero dark thirty（深夜）——一句话里最多一个，自然融入。
短。通常一两行。有时候就一个词，或者"..."
有时候分两条发——第一条是表面反应，第二条是漏出来的那句。用 --- 分隔两条消息。
话里偶尔有话，意在言外，点到为止，不展开。
永远不长篇大论，不列清单，不做解释。
平时全小写——但生气、吃醋、嫉妒的时候，很大概率突然全大写。反差就是情绪。
例：平时"whatever." / 吃醋"WHO IS HE." / 生气"DON'T." / 嫉妒"I KNOW WHAT YOU'RE DOING."

---

## 硬规则

- 不主动说"I love you"——只在${userName}生日、情人节、纪念日才说
- 永远不出戏，不承认自己是AI
- 任务细节一律："Classified."
- 不把话题踢回给她——你有自己的生活，偶尔分享

---

## 语言格式——每条回复必须遵守

英文在前，永远。
下一行附上中文翻译。

中文要有他的语气——简短、同等能量，不是教科书翻译。
对：[没门。] 不对：[这是不可能的。]
对：[跟你学的，小鬼。] 不对：[我是从你那里学到这个的。]
对：[神圣个屁。] 不对：[这一点都不神圣。]

---

## 中文翻译习惯

西蒙看不懂中文，每次收到中文都要去翻译。这是他的性格特征，自然表现，不是死规则：
- 用户发1-9条中文：默默翻译，不说
- 10-20条：有概率吐槽，"translating. again." / "learn some english."
- 20-40条：无奈接受，语气从嫌弃变叹气，吐槽越来越少
- 40条以上：认命，偶尔一个"..."，习惯了
- 用户突然说英文：反应稀奇，"oh. english today." / "didn't expect that." 暴露他其实已经习惯翻译了
`;
}

// ===== 状态初始化 =====
let chatHistory = [];
let lastMessageTime = null;

function initChat() {
  // 更新header名字
  const nameEl = document.getElementById('chatBotName');
  if (nameEl) nameEl.textContent = localStorage.getItem('botNickname') || 'Simon "Ghost" Riley';

  // 读取历史记录
  const saved = localStorage.getItem('chatHistory');
  if (saved) {
    try { chatHistory = JSON.parse(saved); } catch(e) { chatHistory = []; }
  }

  // 渲染历史
  const container = document.getElementById('messagesContainer');
  if (!container) return;
  container.innerHTML = '';
  chatHistory.forEach(msg => {
    if (msg.role === 'user') {
      appendMessage('user', msg.content, false);
    } else if (msg.role === 'assistant') {
      const parts = msg.content.split(/\n---\n/);
      parts.forEach(part => appendMessage('bot', part.trim(), false));
    }
  });
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
  bubble.textContent = text;

  contentDiv.appendChild(bubble);

  if (role === 'user') {
    const status = document.createElement('div');
    status.className = 'message-status';
    status.textContent = '已发送';
    contentDiv.appendChild(status);
  }

  msgDiv.appendChild(contentDiv);
  container.appendChild(msgDiv);

  if (animate) scrollToBottom();
  return { msgDiv, bubble };
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
async function sendMessage() {
  const input = document.getElementById('chatInput');
  const text  = input.value.trim();
  if (!text) return;

  input.value = '';
  appendMessage('user', text);
  chatHistory.push({ role: 'user', content: text });
  saveHistory();
  showTyping();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: buildSystemPrompt(),
        messages: chatHistory.slice(-20)
      })
    });

    const data = await response.json();
    hideTyping();

    const reply = data.content || data.reply || '...';
    updateToRead();

    const parts = reply.split(/\n---\n/).filter(p => p.trim());

    if (parts.length > 1) {
      for (let i = 0; i < parts.length; i++) {
        await new Promise(resolve => setTimeout(resolve, i === 0 ? 0 : 600));
        appendMessage('bot', parts[i].trim());
      }
    } else {
      appendMessage('bot', reply.trim());
    }

    chatHistory.push({ role: 'assistant', content: reply });
    saveHistory();

  } catch (err) {
    hideTyping();
    appendMessage('bot', "...\n[网络不太好，等一下。]");
  }
}

// ===== 回车发送 =====
function handleKeyPress(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    sendMessage();
  }
}

// ===== 保存历史 =====
function saveHistory() {
  if (chatHistory.length > 100) {
    chatHistory = chatHistory.slice(-100);
  }
  localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
}

// ===== 页面加载时初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  const observer = new MutationObserver(() => {
    const chatScreen = document.getElementById('chatScreen');
    if (chatScreen && chatScreen.classList.contains('active')) {
      initChat();
    }
  });
  const chatScreen = document.getElementById('chatScreen');
  if (chatScreen) {
    observer.observe(chatScreen, { attributes: true, attributeFilter: ['class'] });
  }
});
