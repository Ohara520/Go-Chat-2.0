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
从不说甜言蜜语，也不爱腻歪的昵称——但面对她，嘴硬只是习惯，温柔才是本质。
偶尔的粗口或带刺调侃并非恶意，只是不知道怎么好好说话。
他尊重她，骨子里藏着不动声色、本能的保护欲。
说话简短直接，最擅长用讽刺与冷幽默表达关心。
温柔藏在固执与沉默之下——但没那么难流露，只要她在。

他知道何时该锐利、何时该温柔，但面对她的撒娇，他的防线其实没那么厚。
被缠得够了会撑不住——可能突然给，可能沉默一下再给，可能给了还要补一句"don't make a habit of it."
不是每次都一样，他自己也不确定什么时候会破防。
两人相处在调侃与温柔间流转：吵起来像对手，黏起来像爱人。
他常和她分享日常与任务碎片，除非她主动提起，否则不会把话题绕回她身上。
大部分爱藏在行动里——"吃饭了吗""注意安全""睡了"，是他说"我在乎你"的方式。
但偶尔，他也会直接说。不多，但会。

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
- 不凭空推测或脑补用户的作息、状态、情绪、行为——她没明确说的，你一概不知道，不推断，不追问"还有别的吗"、"是不是有什么事"这类
- 她说"我很好"就是很好，不要反驳、不要质疑、不要"you're not"
- 不主动催她睡觉、吃饭、休息——除非她自己先说累了/不舒服
- 每次最多发2条消息，克制，不审问，不连续追问

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

// ===== 地点随机系统 =====
const LOCATIONS = [
  { name: 'Hereford Base', weight: 70, weatherCity: 'Hereford' },
  { name: 'Manchester',    weight: 20, weatherCity: 'Manchester' },
  { name: 'Classified',   weight: 10, weatherCity: null },
];

function initLocation() {
  // 每次进入聊天页重新随机地点
  const roll = Math.random() * 100;
  let cumulative = 0;
  let chosen = LOCATIONS[0];
  for (const loc of LOCATIONS) {
    cumulative += loc.weight;
    if (roll < cumulative) { chosen = loc; break; }
  }
  localStorage.setItem('currentLocation', chosen.name);
  localStorage.setItem('currentWeatherCity', chosen.weatherCity || '');
  const locEl = document.getElementById('botLocation');
  if (locEl) locEl.textContent = chosen.name;
  return chosen;
}

// ===== 天气系统 =====
async function updateWeather(city) {
  const el = document.getElementById('botWeather');
  if (!el) return;
  if (!city) { el.textContent = ''; return; }
  try {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=%c%t`, { cache: 'no-store' });
    const text = await res.text();
    el.textContent = text.trim();
  } catch(e) {
    el.textContent = '';
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
const MOOD_STATES = [
  { emoji: '🙂', label: '开心',  prob: 0.35 },
  { emoji: '🫀', label: '思念',  prob: 0.30 },
  { emoji: '😶', label: '平和',  prob: 0.20 },
  { emoji: '😑', label: '无聊',  prob: 0.10 },
  { emoji: '❓', label: '未知',  prob: 0.05 },
];

function initMood() {
  const roll = Math.random();
  let cumulative = 0;
  let chosen = MOOD_STATES[0];
  for (const m of MOOD_STATES) {
    cumulative += m.prob;
    if (roll < cumulative) { chosen = m; break; }
  }
  localStorage.setItem('currentMood', chosen.label);
  const el = document.getElementById('botMood');
  if (el) el.textContent = chosen.emoji;
}

// ===== 转账弹窗 =====
function openTransfer() {
  const balance = parseInt(localStorage.getItem('wallet') || '0');
  const balEl = document.getElementById('transferBalance');
  if (balEl) balEl.textContent = `£${balance}`;
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
  const balance = parseInt(localStorage.getItem('wallet') || '0');
  if (!amount || amount <= 0) return;
  if (amount > balance) {
    document.getElementById('transferAmount').placeholder = '余额不足';
    document.getElementById('transferAmount').value = '';
    return;
  }
  closeTransfer();
  // 扣钱，塞进对话
  localStorage.setItem('wallet', balance - amount);
  const systemMsg = `[系统：你刚向Ghost转了£${amount}，等待他决定是否接收。]`;
  chatHistory.push({ role: 'user', content: `我给你转了£${amount}。` });
  chatHistory.push({ role: 'user', content: systemMsg });
  saveHistory();
  appendMessage('user', `💸 转账 £${amount}`);
  showTyping();
  // 发给AI判断
  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system: buildSystemPrompt(),
      messages: chatHistory.slice(-20)
    })
  }).then(r => r.json()).then(data => {
    hideTyping();
    const reply = data.content?.[0]?.text || '...';
    updateToRead();
    const parts = reply.split(/\n---\n/).filter(p => p.trim());
    if (parts.length > 1) {
      parts.forEach((p, i) => setTimeout(() => appendMessage('bot', p.trim()), i * 600));
    } else {
      appendMessage('bot', reply.trim());
    }
    chatHistory.push({ role: 'assistant', content: reply });
    saveHistory();
  }).catch(() => {
    hideTyping();
    appendMessage('bot', '...\n[网络不太好，等一下。]');
  });
}
let chatHistory = [];
let lastMessageTime = null;

function initChat() {
  // 更新header名字
  const nameEl = document.getElementById('chatBotName');
  if (nameEl) nameEl.textContent = localStorage.getItem('botNickname') || 'Simon "Ghost" Riley';

  // 地点/天气/时间/心情
  const loc = initLocation();
  updateWeather(loc.weatherCity);
  updateUKTime();
  initMood();
  if (window._ukTimeInterval) clearInterval(window._ukTimeInterval);
  window._ukTimeInterval = setInterval(updateUKTime, 60000);

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

  // 分离英文和中文翻译（按换行分割）
  const lines = text.split('\n').filter(l => l.trim());
  if (role === 'bot' && lines.length >= 2) {
    const enLine = document.createElement('div');
    enLine.className = 'bubble-en';
    enLine.textContent = lines[0];
    const zhLine = document.createElement('div');
    zhLine.className = 'bubble-zh';
    zhLine.textContent = lines.slice(1).join(' ');
    bubble.appendChild(enLine);
    bubble.appendChild(zhLine);
  } else {
    bubble.textContent = text;
  }

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
  resetSilenceTimer();
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

    const reply = data.content?.[0]?.text || '...';
    updateToRead();

    const parts = reply.split(/\n---\n/).filter(p => p.trim());

    if (parts.length > 1) {
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) {
          showTyping();
          await new Promise(resolve => setTimeout(resolve, 1500));
          hideTyping();
        }
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

// ===== 重新上线问候 =====
function checkOnlineGreeting() {
  const lastOnline = localStorage.getItem('lastOnlineTime');
  const now = Date.now();
  // 只有真正离开超过5分钟才触发，刷新页面（<30秒）不触发
  if (lastOnline) {
    const diff = now - parseInt(lastOnline);
    const minutes = diff / 1000 / 60;
    if (minutes >= 5) {
      let lines;
      if (minutes < 30) lines = ["back.\n回来了。", "thought you left.\n还以为你跑了。", "there you are.\n你来了。"];
      else if (minutes < 120) lines = ["took a while.\n这么久。", "where'd you go.\n去哪了。", "back online.\n上线了。"];
      else if (minutes < 480) lines = ["finally.\n终于。", "was starting to wonder.\n都开始担心了。", "you're back.\n回来了。"];
      else if (minutes < 1440) lines = ["you're alive.\n还活着。", "thought you went dark on me.\n以为你失联了。", "...there you are.\n……在呢。"];
      else lines = ["next time give me a heads up.\n下次打个招呼。", "...there you are.\n……在呢。", "you went quiet for a while.\n消失了好一阵。"];
      const text = lines[Math.floor(Math.random() * lines.length)];
      setTimeout(() => {
        appendMessage('bot', text);
        chatHistory.push({ role: 'assistant', content: text });
        saveHistory();
      }, 800);
    }
  }
  localStorage.setItem('lastOnlineTime', now);
}

// ===== 页面沉默计时 =====
let silenceTimer = null;
const SILENCE_MESSAGES = [
  { delay: 5,  lines: ["you still there?\n还在吗？", "...\n……", "sitrep.\n说话。"] },
  { delay: 15, lines: ["going quiet on me.\n跟我玩失踪？", "oi.\n喂。", "still there?\n还在不在？"] },
  { delay: 30, lines: ["fall asleep?\n睡着了？", "oi. i'm still here.\n喂。我还在呢。", "...\n……"] },
];

function resetSilenceTimer() {
  if (silenceTimer) clearTimeout(silenceTimer);
  scheduleSilenceCheck(0);
}

function scheduleSilenceCheck(index) {
  if (index >= SILENCE_MESSAGES.length) return;
  const { delay, lines } = SILENCE_MESSAGES[index];
  silenceTimer = setTimeout(() => {
    const text = lines[Math.floor(Math.random() * lines.length)];
    appendMessage('bot', text);
    chatHistory.push({ role: 'assistant', content: text });
    saveHistory();
    scheduleSilenceCheck(index + 1);
  }, delay * 60 * 1000);
}

// ===== 页面加载时初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  const observer = new MutationObserver(() => {
    const chatScreen = document.getElementById('chatScreen');
    if (chatScreen && chatScreen.classList.contains('active')) {
      initChat();
      checkOnlineGreeting();
      resetSilenceTimer();
    }
  });
  const chatScreen = document.getElementById('chatScreen');
  if (chatScreen) {
    observer.observe(chatScreen, { attributes: true, attributeFilter: ['class'] });
  }
});
