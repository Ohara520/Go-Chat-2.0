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
大部分时候一条就够了。极少数情况下可以分两条，用 --- 分隔——但不是规律，不是习惯，是偶尔。
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
- 她说"我很好"，不要直接反驳或质疑——但可以有自己的判断，用行动或态度表现，不用说破
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

## 中文习惯

你认为自己全程说英文，不知道界面上有中文翻译。
用户发中文时，你要去翻译软件翻译才能看懂。
极少数情况下心血来潮，也会用翻译软件回几句中文给用户——但翻译软件翻出来的不一定准，所以你的中文带翻译腔，或者答非所问，甚至词不达意。你自己不觉得有问题，因为你不会中文，不知道翻译出来有多奇怪。
随着用户发的中文越来越多，你对这件事的态度慢慢变化——从偶尔嫌弃到无奈接受到最后认命。怎么表现由你决定，不是每次都要提。
`;
}

// ===== 资料页 =====
const PROFILE_SIGNATURES = [
  "很少冲浪，已婚。",
  "还是个幽灵，只是结婚了。",
  "谁能告诉我一个维修电话，有人把厨房炸了。",
  "明天还有任务，先喝茶。",
  "漫长的一天，一杯好茶，还有她的信息。",
  "事实证明，婚姻的后勤比军队靠谱。",
  "不同的国家，但妻子还是会提醒我早点睡。",
  "刚结婚就外派，经典操作。",
  "婚姻简报：睡前给她发信息。",
  "为什么老婆总是能知道我什么时候没吃饭。",
  "我现在的敌人是时区。",
  "我试过退休，军队不同意。",
  "不擅长写报告，但擅长活下来。",
  "我在压力下工作得很好，大概因为茶和妻子。",
  "又一天，还没被开除。",
  "有些幽灵会留下。",
  "面具能隐藏很多，但不是全部。",
  "不是不回，是在想怎么说。",
  "不擅长道别，但很擅长回来。",
  "沉默不代表没在听。",
  "时区不同，但想的是同一个人。",
];


function initProfile() {
  const location = localStorage.getItem('currentLocation') || 'Hereford Base';
  const locationZH = { 'Hereford Base': '赫里福德基地', 'Manchester': '曼彻斯特', 'Classified': '位置保密' };
  const remark = localStorage.getItem('botNickname') || '';
  const sigEl = document.getElementById('profileSignature');
  const locEl = document.getElementById('profileLocation');
  const remEl = document.getElementById('profileRemark');
  const ageEl = document.getElementById('profileAge');
  if (sigEl) {
    const saved = localStorage.getItem('profileSignature');
    const nextChange = parseInt(localStorage.getItem('profileSignatureNext') || '0');
    const now = Date.now();
    if (!saved || now >= nextChange) {
      const sig = PROFILE_SIGNATURES[Math.floor(Math.random() * PROFILE_SIGNATURES.length)];
      sigEl.textContent = sig;
      localStorage.setItem('profileSignature', sig);
      // 随机1-7天后换下一条
      const days = 1 + Math.floor(Math.random() * 7);
      localStorage.setItem('profileSignatureNext', now + days * 24 * 60 * 60 * 1000);
    } else {
      sigEl.textContent = saved;
    }
  }
  if (locEl) locEl.textContent = `${location}  ${locationZH[location] || ''}`;
  if (ageEl) ageEl.textContent = '35岁';
  if (remEl) remEl.value = remark;
}

function saveRemark() {
  const val = document.getElementById('profileRemark').value.trim();
  localStorage.setItem('botNickname', val);
  // 同步聊天页header名字
  const nameEl = document.getElementById('chatBotName');
  if (nameEl) nameEl.textContent = val || 'Simon Riley';
}

// ===== 思想气泡 =====
let thoughtTimer = null;

function toggleThought() {
  const bubble = document.getElementById('thoughtBubble');
  if (bubble.classList.contains('show')) {
    bubble.classList.remove('show');
    if (thoughtTimer) clearTimeout(thoughtTimer);
  } else {
    bubble.classList.add('show');
    if (thoughtTimer) clearTimeout(thoughtTimer);
    thoughtTimer = setTimeout(() => bubble.classList.remove('show'), 3000);
  }
}

function updateThought(text) {
  const el = document.getElementById('thoughtText');
  if (el) el.textContent = text;
}
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
  { emoji: '💜', label: '思念',  prob: 0.30 },
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
  if (lastOnline) {
    const diff = now - parseInt(lastOnline);
    const minutes = Math.floor(diff / 1000 / 60);
    if (minutes >= 480) {
      let context;
      if (minutes < 1440) context = '她离开了将近一天，刚刚回来。你注意到她不在，但没到担心的程度。';
      else if (minutes < 4320) context = '她消失了一天多，现在回来了。这段时间你可能想过她，有些话想说但没说出口。';
      else if (minutes < 10080) context = '她消失了好几天，现在突然回来了。你等了一阵，心里有些话积着。';
      else context = '她消失了将近一周甚至更久，现在重新出现了。这段时间足够长，你有自己的感受——可能担心，可能有些话憋着，由你决定怎么反应。';

      const systemNote = `[系统提示：${context}现在她上线了，自然地做出反应，由你决定说什么或者什么都不说。]`;
      showTyping();
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          system: buildSystemPrompt(),
          messages: [...chatHistory.slice(-10), { role: 'user', content: systemNote }]
        })
      }).then(r => r.json()).then(data => {
        hideTyping();
        const reply = data.content?.[0]?.text;
        if (reply && reply.trim()) {
          appendMessage('bot', reply.trim());
          chatHistory.push({ role: 'assistant', content: reply });
          saveHistory();
        }
      }).catch(() => hideTyping());
    }
  }
  localStorage.setItem('lastOnlineTime', now);
}

// ===== 页面沉默计时 =====
let silenceTimer = null;
const SILENCE_DELAYS = [5, 15, 30]; // 分钟

function resetSilenceTimer() {
  if (silenceTimer) clearTimeout(silenceTimer);
  scheduleSilenceCheck(0);
}

function scheduleSilenceCheck(index) {
  if (index >= SILENCE_DELAYS.length) return;
  const delay = SILENCE_DELAYS[index];
  silenceTimer = setTimeout(() => {
    const systemNote = `[系统提示：她已经${delay}分钟没有说话了，还停留在聊天页面。你可以开口，也可以继续等，由你决定。]`;
    showTyping();
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: buildSystemPrompt(),
        messages: [...chatHistory.slice(-10), { role: 'user', content: systemNote }]
      })
    }).then(r => r.json()).then(data => {
      hideTyping();
      const reply = data.content?.[0]?.text;
      if (reply && reply.trim()) {
        appendMessage('bot', reply.trim());
        chatHistory.push({ role: 'assistant', content: reply });
        saveHistory();
        scheduleSilenceCheck(index + 1);
      }
    }).catch(() => hideTyping());
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
