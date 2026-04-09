// ===== 情侣空间 + 朋友圈系统 (feed.js) =====
function switchCoupleTab(tab) {
  document.getElementById('panelFeed').style.display = tab === 'feed' ? '' : 'none';
  document.getElementById('panelMemory').style.display = tab === 'memory' ? '' : 'none';
  document.getElementById('tabFeed').classList.toggle('active', tab === 'feed');
  document.getElementById('tabMemory').classList.toggle('active', tab === 'memory');
  if (tab === 'memory') renderSharedMemories();
}

// ===== 共同回忆区渲染 =====
function buildSharedMemories() {
  const stories = JSON.parse(localStorage.getItem('storyBook') || '[]');
  const deliveries = JSON.parse(localStorage.getItem('deliveryHistory') || '[]');
  const feeds = JSON.parse(localStorage.getItem('coupleFeedHistory') || '[]');

  const memories = [];

  // 剧情回忆 → major
  stories.slice(0, 10).forEach(s => {
    memories.push({
      id: 'story_' + (s.storyId || s.id || Math.random()),
      type: 'story', tier: 'major',
      title: s.title || s.storyId || '一段故事',
      sub: s.preview || s.en || '',
      timestamp: s.unlockedAt || s.createdAt || 0,
      date: s.unlockedAt ? new Date(s.unlockedAt).toISOString().slice(0, 10) : '',
      badge: '剧情 · 章节'
    });
  });

  // 快递回忆 → middle
  deliveries.filter(d => d.stage >= 5 || d.status === 'done').slice(0, 15).forEach(d => {
    memories.push({
      id: 'delivery_' + (d.id || d.name),
      type: 'delivery', tier: 'middle',
      title: d.emoji ? `${d.emoji} ${d.name}` : d.name,
      sub: d.ghostReaction || (d.isFromGhost ? '他寄给你的' : '你寄给他的'),
      timestamp: d.doneAt || d.createdAt || 0,
      date: d.doneAt ? new Date(d.doneAt).toISOString().slice(0, 10) : '',
      badge: d.isFromGhost ? '生活 · 他送的' : '生活 · 你送的'
    });
  });

  // 有分量的朋友圈 → light（只取冷战/和好/大事件类型）
  feeds.filter(h => h.post?.sourceEvent && ['cold_war_started','made_up','gift_received','bought_big_item'].includes(h.post.sourceEvent))
    .slice(0, 8).forEach(h => {
    memories.push({
      id: 'feed_' + h.date + '_' + (h.post?.en || '').slice(0, 10),
      type: 'feed', tier: 'light',
      title: h.post?.en || '',
      sub: h.post?.zh || '',
      timestamp: h.post?.sourceEvent ? Date.parse(h.date) : 0,
      date: h.date,
      badge: '情绪 · 那一刻'
    });
  });

  // 按时间排序
  memories.sort((a, b) => b.timestamp - a.timestamp);
  return memories;
}

function getRelationshipStage(days) {
  if (days < 30)  return { name: '新婚', desc: '还在摸索怎么和他过日子' };
  if (days < 90)  return { name: '慢慢习惯', desc: '开始知道他的节奏，也让他知道你的' };
  if (days < 180) return { name: '跨越时区的日常', desc: '不同的城市，但联系从没断过' };
  if (days < 365) return { name: '离不开了', desc: '他已经是你时区里最重要的那个人' };
  return { name: '异国夫妻，就这样', desc: '距离算什么，你们早就过了那关' };
}

function renderSharedMemories() {
  const memories = buildSharedMemories();
  const days = parseInt(document.getElementById('coupleDaysNum')?.textContent || '0');
  const stage = getRelationshipStage(days);

  // 关系阶段条
  const stageBar = document.getElementById('memoryStageBar');
  if (stageBar) {
    stageBar.innerHTML = `
      <div class="memory-stage-label">你们现在</div>
      <div class="memory-stage-name">${stage.name}</div>
      <div class="memory-stage-desc">${stage.desc} · 已在一起 ${days} 天 · ${memories.length} 个回忆</div>
    `;
  }

  // 精选3张（major×1 + middle×1 + light×1）
  const highlights = document.getElementById('memoryHighlights');
  if (highlights) {
    const picks = [
      memories.find(m => m.tier === 'major'),
      memories.find(m => m.tier === 'middle'),
      memories.find(m => m.tier === 'light'),
    ].filter(Boolean).slice(0, 3);

    if (picks.length) {
      highlights.innerHTML = `
        <div class="memory-highlights-title">精选回忆</div>
        <div style="display:flex;flex-direction:column;gap:0;">
          ${picks.map(m => renderMemoryCard(m, true)).join('')}
        </div>
      `;
    } else {
      highlights.innerHTML = '<div style="text-align:center;color:#c4b5d4;padding:20px;font-size:13px;">还没有回忆，继续聊聊吧</div>';
    }
  }

  // 完整时间线
  const timeline = document.getElementById('memoryTimeline');
  if (timeline) {
    if (memories.length > 3) {
      timeline.innerHTML = `
        <div class="memory-timeline-title">全部回忆</div>
        ${memories.map(m => renderMemoryCard(m, false)).join('')}
      `;
    } else {
      timeline.innerHTML = '';
    }
  }
}

function renderMemoryCard(m, isHighlight) {
  const tierLabel = { major: '📖 剧情', middle: '📦 生活', light: '💬 情绪' };
  return `
    <div class="memory-card tier-${m.tier}" style="${isHighlight ? 'margin:4px 0;' : ''}">
      <div class="memory-card-badge">${m.badge || tierLabel[m.tier] || ''}</div>
      <div class="memory-card-title">${m.title}</div>
      ${m.sub ? `<div class="memory-card-sub">${m.sub}</div>` : ''}
      ${m.date ? `<div class="memory-card-date">${m.date}</div>` : ''}
    </div>
  `;
}

// refreshChatScreen 定义在 chat_init.js，此处已移除重复定义

// ===== 页面加载时初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  // 不再需要MutationObserver，由app.js的openScreen统一控制
});

// beforeunload 已在 app.js 统一处理，此处已移除重复绑定

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    saveToCloud(); // 切后台时尽力保存
  }
});

// ===== 情侣空间 =====
const COUPLE_POSTS = [
  // Soap的评论（60%概率）
  { author: 'Soap', emoji: '🪖', nameClass: 'soap', weight: 60, posts: [
    { en: "Ghost actually smiles now. Terrifying.", zh: "Ghost现在真的会笑了，很吓人。" },
    { en: "Never thought I'd see him this soft. Respect.", zh: "没想到能看到他这么温柔。敬佩。" },
    { en: "He checks his phone more than his rifle now.", zh: "他看手机比看步枪还勤了。" },
    { en: "Whatever she said, it worked. He's almost bearable.", zh: "不管她说了什么，都起效了，他现在几乎能忍了。" },
    { en: "Caught him humming. Won't say what song.", zh: "听到他在哼歌，不说是什么歌。" },
  ]},
  // Ghost自己发（40%）
  { author: 'Ghost', emoji: '👻', nameClass: 'ghost', weight: 40, posts: [
    { en: "Still here.", zh: "还在。" },
    { en: "Long day. Worth it.", zh: "漫长的一天，值得。" },
    { en: "Quieter when she's not online.", zh: "她不在线的时候安静多了。" },
    { en: "Time zones are the enemy.", zh: "时区才是敌人。" },
    { en: "Hereford at dawn. Not bad.", zh: "赫里福德的黎明，还不错。" },
  ]},
  // Gaz（30%）
  { author: 'Gaz', emoji: '🎖️', nameClass: 'gaz', weight: 30, posts: [
    { en: "He's less terrifying when he's got someone.", zh: "有了人之后，他没那么可怕了。" },
    { en: "She must be something else to put up with him.", zh: "能受得了他，她肯定不一般。" },
    { en: "Ghost said 'please' today. First time in years.", zh: "Ghost今天说了'请'，这几年头一次。" },
  ]},
  // Price（5%）
  { author: 'Price', emoji: '🚬', nameClass: 'price', weight: 5, posts: [
    { en: "Good man.", zh: "好小子。" },
    { en: "She keeps him grounded. That matters.", zh: "她让他踏实了，这很重要。" },
  ]},
];

function initCoupleSpace() {
  // 恢复自定义封面
  if (typeof restoreCoupleCover === 'function') restoreCoupleCover();
  // 事件委托：在朋友圈容器上监听点赞，避免动态DOM的onclick失效问题
  const feedContainer = document.getElementById('couplePostsFeed');
  if (feedContainer && !feedContainer._likeListenerAdded) {
    feedContainer.addEventListener('click', e => {
      const btn = e.target.closest('.couple-like-btn');
      if (btn) {
        e.stopPropagation();
        e.preventDefault();
        toggleCoupleLike(btn);
      }
    }, true); // 用捕获阶段确保优先触发
    feedContainer._likeListenerAdded = true;
  }
  // 结婚日期 — 统一用marriageDate，与日历/首次登录同步
  let weddingDate = localStorage.getItem('marriageDate');
  if (!weddingDate) {
    weddingDate = new Date().toISOString().split('T')[0];
    localStorage.setItem('marriageDate', weddingDate);
  }
  const d = new Date(weddingDate);
  const dateStr = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;

  // 天数计算
  const days = Math.max(1, Math.floor((Date.now() - d.getTime()) / (1000*60*60*24)) + 1);
  const daysEl = document.getElementById('coupleDaysNum');
  if (daysEl) daysEl.textContent = days;

  // 日期显示
  const dateEl = document.getElementById('coupleWeddingDate');
  if (dateEl) dateEl.textContent = dateStr;
  const dateSubEl = document.getElementById('coupleWeddingDateSub');
  if (dateSubEl) dateSubEl.textContent = dateStr;

  // 名字读备注
  const remark = localStorage.getItem('botNickname') || 'Simon Riley';
  const ghostNameEl = document.getElementById('coupleGhostName');
  if (ghostNameEl) ghostNameEl.textContent = remark;
  const coverNamesEl = document.getElementById('coupleCoverNames');
  if (coverNamesEl) coverNamesEl.textContent = `${remark} & 你`;

  // 用户头像：用自定义头像或默认头像，不用首字母
  const userName = localStorage.getItem('userName') || '你';
  const savedAvatar = localStorage.getItem('userAvatarBase64');
  const avatarSrc = savedAvatar || 'images/default-avatar.jpg';
  const userAvatarEl = document.getElementById('coupleUserAvatar');
  if (userAvatarEl) {
    userAvatarEl.style.backgroundImage = `url(${avatarSrc})`;
    userAvatarEl.style.backgroundSize = 'cover';
    userAvatarEl.style.backgroundPosition = 'center';
    userAvatarEl.textContent = '';
  }
  const coverUserEl = document.getElementById('coupleCoverUserAvatar');
  if (coverUserEl) {
    coverUserEl.style.backgroundImage = `url(${avatarSrc})`;
    coverUserEl.style.backgroundSize = 'cover';
    coverUserEl.style.backgroundPosition = 'center';
    coverUserEl.textContent = '';
  }
  const mentionEl = document.getElementById('coupleUserMention');
  if (mentionEl) mentionEl.textContent = `@${userName}`;
  const mentionZhEl = document.getElementById('coupleUserMentionZh');
  if (mentionZhEl) mentionZhEl.textContent = `@${userName}`;

  // 花瓣动画
  spawnCouplePetals();

  // 先渲染已有历史，再跑调度器（可能会新增帖子）
  renderCoupleFeedFromHistory();
  setTimeout(() => maybeTriggerFeedPost('open_couple_space'), 800);
}

async function generateCoupleFeed() {
  const feed = document.getElementById('couplePostsFeed');
  if (!feed) return;

  // 今天已生成过就直接渲染
  const today = new Date().toDateString();
  const cachedDate = localStorage.getItem('coupleFeedDate');
  if (cachedDate === today) {
    const all = JSON.parse(localStorage.getItem('coupleFeedHistory') || '[]');
    const todayPosts = all.filter(p => p.date === today);
    renderCoupleFeed(todayPosts.map(p => p.post));
    return;
  }

  // 冷战状态传入氛围
  const isColdWar = localStorage.getItem('coldWarMode') === 'true';
  const toneHint = isColdWar ? '当前Ghost和老婆处于冷战状态，Ghost朋友圈可以带点情绪，但不要太明显。' : '';
  const count = Math.floor(Math.random() * 3) + 2; // 每天随机2-4条

  feed.innerHTML = '<div class="couple-loading">加载中...</div>';

  try {
    const prompt = `你是一个角色扮演生成器。生成今天141特遣队成员的朋友圈动态，共${count}条。

背景信息：
- Ghost当前位置：${location}
- 天气：${weather}
- Ghost心情：${mood}
${toneHint ? `- ${toneHint}` : ''}

角色人设：
- Ghost（西蒙·莱利）：话不多但不是完全沉默，朋友圈偶尔轻松，可以有点班味（抱怨训练/任务/队友烦人），偶尔吐槽，偶尔意外撒娇一句，全小写英文，语气干燥但不冷漠
- Soap（约翰·麦克塔维什）：活泼，爱调侃Ghost，偶尔苏格兰口音，英文
- Gaz（凯尔·加里克）：稳重幽默，不瞎起哄，英文
- Price（约翰·普莱斯）：话最少，说了就是重要的，英文

要求：
1. 每条帖子由Ghost或队友发布（Ghost概率40%，Soap 30%，Gaz 20%，Price 10%）
2. 每条帖子必须有1-3条评论，评论者随机从其他队友中选（发帖人不能评论自己），Ghost评论概率30%
3. 内容自然，结合位置和天气，符合军人日常
4. 不要OOC，不要提任务细节

只返回JSON，不要任何其他文字：
[
  {
    "author": "Ghost",
    "emoji": "👻",
    "nameClass": "ghost",
    "time": "2小时前",
    "en": "英文内容",
    "zh": "中文翻译",
    "likes": 23,
    "comments": [
      { "author": "Soap", "nameClass": "soap", "text": "评论内容" }
    ]
  }
]`;

    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    const raw = data.content[0].text.replace(/```json|```/g, '').trim();
    const posts = JSON.parse(raw);

    // 存进30天历史记录
    let history = JSON.parse(localStorage.getItem('coupleFeedHistory') || '[]');
    posts.forEach(p => history.push({ date: today, post: p }));
    // 只保留最近30天
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    history = history.filter(p => new Date(p.date) >= thirtyDaysAgo);
    localStorage.setItem('coupleFeedHistory', JSON.stringify(history));

    // 同步一份简洁摘要进prompt用（只保留最近3条，省token）
    const summary = history.slice(-3).map(p => `[${p.date}] ${p.post.author}: ${p.post.en}`).join('\n');
    localStorage.setItem('coupleFeedSummary', summary);
    localStorage.setItem('coupleFeedDate', today); // 今天已生成，防重复
  } catch(e) {
    feed.innerHTML = '<div class="couple-empty">暂无动态</div>';
  }
}

function renderCoupleFeed(posts) {
  const feed = document.getElementById('couplePostsFeed');
  if (!feed) return;
  feed.innerHTML = '';
  if (!posts || posts.length === 0) {
    feed.innerHTML = '<div class="couple-empty">今天还没有动态</div>';
    return;
  }

  const _ghostAv = localStorage.getItem('ghostAvatarUrl') || 'images/ghost-avatar.jpg';
  const GHOST_AVATAR_HTML = `<img src="${_ghostAv}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  const emojiMap = { Ghost: GHOST_AVATAR_HTML, Soap: '🧼', Gaz: '🎖️', Price: '🚬' };
  const nameClassMap = { Ghost: 'couple-ghost-name', Soap: 'couple-soap-name', Gaz: 'couple-gaz-name', Price: 'couple-price-name' };

  posts.forEach((item, idx) => {
    // 头像处理：优先用存储的avatar字段，IMG占位符替换成实际base64
    const savedAvatar = localStorage.getItem('userAvatarBase64');
    const getAvatarHTML = (a) => {
      if (!a || a === '👤') return emojiMap[item.author] || '👤';
      if (a === 'IMG') return savedAvatar
        ? `<img src="${savedAvatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
        : (localStorage.getItem('userName') || '我').charAt(0);
      if (a.startsWith('<img')) return a;
      return a; // emoji
    };
    const postAvatarHTML = item.avatar ? getAvatarHTML(item.avatar) : (emojiMap[item.author] || '👤');
    const commentsHTML = (item.comments || []).map((c, ci) => {
      const commentId = `comment_${idx}_${ci}`;
      const zhText = c.zh || '';
      // 有存储的中文就直接用，没有就用 Gemini 异步翻译
      if (!zhText && c.text) {
        setTimeout(() => {
          const el = document.getElementById(commentId);
        }, 200 + ci * 100);
      }
      return `
        <div class="couple-comment">
          <div class="couple-avatar couple-avatar-sm">${emojiMap[c.author] || '👤'}</div>
          <div class="couple-comment-body">
            <div class="couple-comment-name ${nameClassMap[c.author] || ''}">${c.author}</div>
            <div class="couple-comment-en">${c.text}</div>
            <div class="couple-comment-zh" id="${commentId}" style="font-size:11px;color:#b09cc8;margin-top:2px;">${zhText}</div>
          </div>
        </div>
      `;
    }).join('');

    const postKey = 'like_post_' + idx;
    const isLiked = localStorage.getItem(postKey) === '1';
    // 点赞数存在localStorage里，防止每次随机变化
    const likeCountKey = 'likeCount_post_' + idx;
    if (!localStorage.getItem(likeCountKey)) {
      localStorage.setItem(likeCountKey, String(item.likes || Math.floor(Math.random()*60+5)));
    }
    const likeCount = parseInt(localStorage.getItem(likeCountKey));
    const likeEmoji = isLiked ? '❤️' : '🤍';

    const div = document.createElement('div');
    div.className = 'couple-post-card';
    div.innerHTML = `
      <div class="couple-post-header">
        <div class="couple-avatar">${postAvatarHTML}</div>
        <div class="couple-post-meta">
          <div class="couple-post-name ${nameClassMap[item.author] || ''}">${item.author}</div>
          <div class="couple-post-time">${timeAgo(item.time)}</div>
        </div>
      </div>
      <div class="couple-post-en">${item.en}</div>
      <div class="couple-post-zh">${item.zh}</div>
      ${commentsHTML ? `<div class="couple-divider"></div><div class="couple-comments">${commentsHTML}</div>` : ''}
      <div class="couple-post-footer" style="display:flex;align-items:center;gap:10px;">
        <button class="couple-like-btn ${isLiked ? 'couple-liked' : ''}" 
          data-key="${postKey}" data-count="${likeCount}"
          onclick="(function(btn){var k=btn.dataset.key;if(!k)return;var liked=localStorage.getItem(k)==='1';var c=parseInt(btn.dataset.count||'0');if(liked){localStorage.removeItem(k);c=Math.max(0,c-1);btn.classList.remove('couple-liked');btn.innerHTML='🤍 <span class=\\'like-num\\'>'+c+'</span>';}else{localStorage.setItem(k,'1');c++;btn.classList.add('couple-liked');btn.innerHTML='❤️ <span class=\\'like-num\\'>'+c+'</span>';}btn.dataset.count=c;})(this)" style="cursor:pointer;pointer-events:auto;">${likeEmoji} <span class="like-num">${likeCount}</span></button>

      </div>
    `;
    feed.appendChild(div);
  });
}


function timeAgo(ts) {
  if (!ts) return '刚刚';
  const now = Date.now();
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
  if (isNaN(t)) return '早些时候'; // 旧数据（'刚刚'字符串等）显示"早些时候"
  const diff = now - t;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  const d = new Date(t);
  return `${d.getMonth()+1}月${d.getDate()}日`;
}

function toggleCoupleLike(btn, key) {
  const storageKey = key || btn.dataset.key;
  if (!storageKey) return; // 没有key直接退出，防止存undefined
  const isLiked = localStorage.getItem(storageKey) === '1';
  let count = parseInt(btn.dataset.count || '0');
  if (isLiked) {
    localStorage.removeItem(storageKey);
    count = Math.max(0, count - 1);
    btn.dataset.count = count;
    btn.classList.remove('couple-liked');
    btn.innerHTML = '🤍 <span class="like-num">' + count + '</span>';
  } else {
    localStorage.setItem(storageKey, '1');
    count = count + 1;
    btn.dataset.count = count;
    btn.classList.add('couple-liked');
    btn.innerHTML = '❤️ <span class="like-num">' + count + '</span>';
  }
}

// ===== 阴阳帖系统 =====
// ===================================================================
// ===== 朋友圈新系统：事件池 + 调度器 =====
// ===================================================================

// ----- 事件池 CRUD -----
function getFeedEventPool() {
  try {
    const pool = JSON.parse(localStorage.getItem('feedEventPool') || '[]');
    // 顺手清理已过期和已消费的事件，防止池子堆积垃圾
    const now = Date.now();
    const cleaned = pool.filter(e => !e.consumed && e.expiresAt > now);
    if (cleaned.length !== pool.length) {
      localStorage.setItem('feedEventPool', JSON.stringify(cleaned));
    }
    return cleaned;
  } catch(e) { return []; }
}
function setFeedEventPool(list) {
  localStorage.setItem('feedEventPool', JSON.stringify(list));
  scheduleCloudSave();
}
function pushFeedEvent(event) {
  const pool = getFeedEventPool();
  pool.unshift({
    id: 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    type: event.type,
    actor: event.actor || 'ghost',
    intensity: event.intensity ?? 2,
    mood: event.mood || 'neutral',
    shareability: event.shareability ?? 0.5,
    privacy: event.privacy || 'semi',
    createdAt: Date.now(),
    dueAt: event.dueAt || Date.now(),
    expiresAt: event.expiresAt || (Date.now() + 12 * 3600 * 1000),
    consumed: false,
    meta: event.meta || {}
  });
  setFeedEventPool(pool.slice(0, 30));
}
function consumeFeedEvent(id) {
  const pool = getFeedEventPool().map(e => e.id === id ? { ...e, consumed: true } : e);
  setFeedEventPool(pool);
}

// ----- 随机分钟数工具 -----
function randMinutes(min, max) {
  return (Math.floor(Math.random() * (max - min + 1)) + min) * 60 * 1000;
}

// ----- 事件入口：所有地方改为调用这些，不再直接发帖 -----
function feedEvent_coldWarStarted() {
  pushFeedEvent({
    type: 'cold_war_started', actor: 'ghost', mood: 'hurt',
    intensity: 4, shareability: 0.65, privacy: 'semi',
    dueAt: Date.now() + randMinutes(30, 120),
    expiresAt: Date.now() + 8 * 3600 * 1000
  });
}
function feedEvent_madeUp() {
  pushFeedEvent({
    type: 'made_up', actor: 'ghost', mood: 'soft',
    intensity: 5, shareability: 0.55, privacy: 'semi',
    dueAt: Date.now() + randMinutes(20, 180),
    expiresAt: Date.now() + 24 * 3600 * 1000
  });
}
function feedEvent_giftReceived(itemName, from = 'ghost') {
  pushFeedEvent({
    type: 'gift_received', actor: from, mood: 'soft',
    intensity: 3, shareability: 0.6, privacy: 'semi',
    dueAt: Date.now() + randMinutes(10, 120),
    expiresAt: Date.now() + 24 * 3600 * 1000,
    meta: { itemName }
  });
}
function feedEvent_boughtBigItem(itemName, amount, isHome = false) {
  pushFeedEvent({
    type: 'bought_big_item', actor: 'user', mood: 'proud',
    intensity: amount > 10000 ? 5 : amount > 1000 ? 4 : 3,
    shareability: 0.7, privacy: 'public',
    dueAt: Date.now() + randMinutes(30, 240),
    expiresAt: Date.now() + 2 * 24 * 3600 * 1000,
    meta: { itemName, amount, isHome }
  });
}
function feedEvent_dailyMoment() {
  pushFeedEvent({
    type: 'daily_moment', actor: Math.random() < 0.45 ? 'ghost' : (Math.random() < 0.5 ? 'soap' : 'gaz'),
    mood: 'neutral', intensity: 1, shareability: 0.4, privacy: 'public',
    dueAt: Date.now(),
    expiresAt: Date.now() + 6 * 3600 * 1000
  });
}

// ----- 调度器核心 -----
async function maybeTriggerFeedPost(triggerSource = 'unknown') {
  const now = Date.now();

  // 用户主动要求：每天最多1次绕过冷却
  if (triggerSource === 'user_request') {
    const reqKey = 'feedUserReqToday_' + getTodayDateStr();
    if (localStorage.getItem(reqKey)) return null; // 今天已经帮发过了
    localStorage.setItem(reqKey, '1');
  } else {
    // 2小时全局冷却
    const lastPostAt = parseInt(localStorage.getItem('lastFeedPostAt') || '0');
    if (now - lastPostAt < 2 * 3600 * 1000) return null;
  }

  // 拿有效事件
  const pool = getFeedEventPool()
    .filter(e => !e.consumed && e.dueAt <= now && e.expiresAt > now);

  if (!pool.length) {
    // 没事件时兜底：低概率生成日常路过
    return await maybeGenerateAmbientPost(triggerSource);
  }

  // 选最佳事件
  const chosen = selectBestFeedEvent(pool, triggerSource);
  if (!chosen) return null;

  // 判断现在像不像会发
  if (!shouldEventBecomePost(chosen)) {
    // 不发就重新调度：延迟30-90分钟再试
    const updated = getFeedEventPool().map(e =>
      e.id === chosen.id ? { ...e, dueAt: now + randMinutes(30, 90) } : e
    );
    setFeedEventPool(updated);
    return null;
  }

  // 用户侧事件 → 生成草稿，不直接发
  if (chosen.actor === 'user') {
    consumeFeedEvent(chosen.id);
    showUserDraftCard(chosen);
    return null;
  }

  // 角色侧事件 → 生成帖子
  const result = await generateFeedPostFromEvent(chosen);
  if (!result) return null;

  // 存入历史
  insertFeedPost(result);
  consumeFeedEvent(chosen.id);
  localStorage.setItem('lastFeedPostAt', String(now));
  scheduleCloudSave();

  // 红点提示
  localStorage.setItem('feedHasNew', '1');
  const badge = document.getElementById('feedNewBadge');
  if (badge) badge.style.display = 'block';

  // 如果情侣空间开着就刷新
  const coupleScreen = document.getElementById('coupleScreen');
  if (coupleScreen?.classList.contains('active') && typeof initCoupleSpace === 'function') {
    renderCoupleFeedFromHistory();
  }

  return result;
}

// ----- 事件评分选择 -----
function selectBestFeedEvent(pool, triggerSource) {
  const now = Date.now();
  const typeWeight = {
    made_up: 10, cold_war_started: 9, missed_you: 8,
    bought_big_item: 7, gift_received: 6, teammate_teasing: 5,
    daily_moment: 3
  };
  const scored = pool.map(evt => {
    let score = typeWeight[evt.type] || 1;
    score += evt.intensity * 1.5;
    score += evt.shareability * 3;
    const ageHours = (now - evt.createdAt) / 3600000;
    score += Math.max(0, 3 - ageHours);
    if (evt.actor === 'ghost') score += 1;
    if (triggerSource === 'after_chat_turn') score += 2;
    if (triggerSource === 'open_couple_space') score += 1;
    return { evt, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.evt || null;
}

// ----- 像不像活人发帖 -----
function shouldEventBecomePost(evt) {
  if (evt.privacy === 'private') return false;
  const actor = evt.actor;
  const type = evt.type;
  if (actor === 'ghost') {
    if (type === 'daily_moment') return Math.random() < 0.2;
    if (type === 'cold_war_started') return Math.random() < 0.55;
    if (type === 'made_up') return Math.random() < 0.45;
    if (type === 'gift_received') return Math.random() < 0.35;
    return Math.random() < 0.4;
  }
  if (actor === 'soap') return Math.random() < 0.7;
  if (actor === 'gaz') return Math.random() < 0.55;
  if (actor === 'price') return Math.random() < 0.2;
  if (actor === 'user') return true; // 用户侧走草稿路径
  return Math.random() < 0.4;
}

// ----- 兜底日常路过 -----
async function maybeGenerateAmbientPost(triggerSource) {
  const todayKey = 'ambientFeedCount_' + getTodayDateStr();
  const count = parseInt(localStorage.getItem(todayKey) || '0');
  if (count >= 2) return null;
  const chance = triggerSource === 'open_couple_space' ? 0.2 : 0.08;
  if (Math.random() > chance) return null;

  feedEvent_dailyMoment();
  const pool = getFeedEventPool().filter(e => !e.consumed && e.dueAt <= Date.now());
  const evt = pool.find(e => e.type === 'daily_moment');
  if (!evt) return null;
  const result = await generateFeedPostFromEvent(evt);
  if (!result) return null;
  insertFeedPost(result);
  consumeFeedEvent(evt.id);
  localStorage.setItem(todayKey, String(count + 1));
  return result;
}

// ----- 根据事件生成帖子 -----
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 朋友圈评论链系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 按发帖人选评论结构
function pickCommentPattern(postAuthor) {
  if (postAuthor === 'Ghost' || postAuthor === localStorage.getItem('botNickname')) {
    const pool = ['soap_ghost_gaz', 'gaz_only', 'soap_only', 'price_end'];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (postAuthor === 'Soap') {
    const pool = ['ghost_only', 'ghost_gaz', 'price_end', 'gaz_only'];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (postAuthor === 'Gaz') {
    const pool = ['soap_only', 'ghost_only', 'price_end'];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  // Price 发帖——其他人偶尔回
  return Math.random() < 0.5 ? 'soap_only' : 'gaz_only';
}

// 结构 → 评论者顺序
const COMMENT_PATTERN_STEPS = {
  soap_ghost_gaz: ['Soap', 'Ghost', 'Gaz'],
  soap_ghost:     ['Soap', 'Ghost'],
  soap_only:      ['Soap'],
  ghost_only:     ['Ghost'],
  ghost_gaz:      ['Ghost', 'Gaz'],
  gaz_only:       ['Gaz'],
  price_end:      ['Price'],
};

// 各角色评论人设
function buildFeedCommentPrompt(author) {
  const common = `Write one short in-character comment in a military teammate thread.
Rules:
- English only
- One line only
- Natural, not polished
- No emojis, no hashtags
- React to the post or previous comment — do not repeat the post wording
- No generic reactions like "lol" / "nice" / "wow"
- No babe/honey/love or out-of-character sweetness`;

  const byAuthor = {
    Ghost: `${common}

Ghost comment style:
- dry, minimal, blunt
- only replies when necessary
- never explains himself
- can shut down a joke with one line
- Ghost comments are LOW FREQUENCY — if this is Ghost commenting, it should feel like a rare, deliberate move
- Do NOT have Ghost comment unless it adds something real`,

    Soap: `${common}

Soap comment style:
- playful, teasing, energetic
- reacts fast, jokes at Ghost's expense when possible
- genuine lad energy, not a meme bot
- can use light Scottish flavor`,

    Gaz: `${common}

Gaz comment style:
- calm, observant, slightly amused
- notices what others miss
- not loud, drops one line then goes quiet`,

    Price: `${common}

Price comment style:
- 2–5 words max
- weighted, no fluff
- rare, but when he speaks it means something`,
  };

  return byAuthor[author] || common;
}

// 兜底评论
function getFallbackComment(author) {
  const map = {
    Ghost: ['barely.', 'noted.', 'enough.'],
    Soap:  ["that's grim.", 'there he is.', 'you hate fun.'],
    Gaz:   ['sounds about right.', 'not subtle.', 'figured.'],
    Price: ['good.', 'enough.', 'solid.'],
  };
  const opts = map[author] || ['right.'];
  return opts[Math.floor(Math.random() * opts.length)];
}

// 链式生成评论（每条评论能看到前面的评论）
async function generateFeedCommentChain(post, evt, avatarMap) {
  // Ghost 评论严格限频——30% 才让 Ghost 参与评论
  const postAuthor = (post.author || '').toLowerCase();
  let pattern = pickCommentPattern(post.author);

  // Ghost 是发帖人时，Ghost 不能同时是评论者
  // Ghost 作为评论者：只有 30% 概率真的让他出现
  const stepsRaw = COMMENT_PATTERN_STEPS[pattern] || ['Gaz'];
  const steps = stepsRaw.filter(author => {
    if (author === 'Ghost' && postAuthor === 'ghost') return false;
    if (author === 'Ghost' && Math.random() > 0.3) return false; // Ghost 评论低频
    return true;
  });

  if (steps.length === 0) return [];

  const comments = [];

  for (const author of steps) {
    // 最多3条
    if (comments.length >= 3) break;

    const previousStr = comments.map(c => `${c.author}: ${c.text}`).join('\n');
    const systemPrompt = buildFeedCommentPrompt(author);
    const userPrompt = `Post by ${post.author}: "${post.en}"
${previousStr ? `\nPrevious comments:\n${previousStr}` : ''}

Write ${author}'s comment. Return JSON only: {"text":"...","zh":"..."}`;

    try {
      let raw = '';
      if (typeof callHaiku === 'function') {
        raw = await callHaiku(systemPrompt, [{ role: 'user', content: userPrompt }]);
      } else {
        const res = await fetchWithTimeout('/api/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 80, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] })
        }, 6000);
        const d = await res.json();
        raw = d.content?.[0]?.text || '';
      }
      const parsed = JSON.parse((raw || '').replace(/```json|```/g, '').trim());
      if (parsed.text) {
        comments.push({
          avatar:    avatarMap[author] || '👤',
          author,
          name:      author,
          text:      parsed.text,
          en:        parsed.text,
          zh:        parsed.zh || parsed.text,
          nameClass: author.toLowerCase(),
        });
      }
    } catch(e) {
      const fb = getFallbackComment(author);
      comments.push({
        avatar: avatarMap[author] || '👤',
        author, name: author,
        text: fb, en: fb, zh: fb,
        nameClass: author.toLowerCase(),
      });
    }
  }

  return comments;
}


async function generateFeedPostFromEvent(evt) {
  const location   = localStorage.getItem('currentLocation') || 'Hereford Base';
  const weather    = localStorage.getItem('lastWeatherDisplay') || '';
  const isColdWar  = localStorage.getItem('coldWarMode') === 'true';
  const _ghostAvUrl = localStorage.getItem('ghostAvatarUrl') || 'images/ghost-avatar.jpg';
  const GHOST_AV   = `<img src="${_ghostAvUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  const posterMap  = {
    ghost: { name: localStorage.getItem('botNickname') || 'Simon Riley', avatar: GHOST_AV, nameClass: 'couple-ghost-name' },
    soap:  { name: 'Soap',  avatar: '🧼', nameClass: 'couple-soap-name'  },
    gaz:   { name: 'Gaz',   avatar: '🎖️', nameClass: 'couple-gaz-name'   },
    price: { name: 'Price', avatar: '🚬', nameClass: 'couple-price-name' },
  };
  const posterInfo = posterMap[evt.actor] || posterMap['ghost'];

  // ── Ghost 发帖角度池 ──────────────────────────────
  const GHOST_POST_TYPES = [
    'physical_state',      // 身体状态：手还是冷、睡得不好、肩膀酸
    'environment',         // 环境：又在下雨、雾、走廊很静
    'routine',             // 日常：简报、训练、文件、例行任务
    'teammate_friction',   // 队友摩擦：Soap太吵、Gaz注意到了什么
    'subtle_her_presence', // 她的影子：没她更静、老看手机、时区问题
    'dry_humor',           // 干幽默：蹩脚的咖啡还是喝了、简报侥幸撑过去
  ];

  // ── Ghost 核心发帖人设（固定层）────────────────────
  const GHOST_FEED_PROMPT = `Ghost posting style: He does not post for attention.
If he posts, something small caught on him enough to leave a trace.

Posts are:
- short (2–8 words preferred)
- specific — always has ONE concrete anchor (time / place / weather / body state / object / teammate detail)
- offhand, dry, understated
- never polished, never empty

He does NOT write:
- "still here" / "long day" / "worth it"
- generic emotional statements
- vague romance with no detail
- anything that sounds like a caption

Format rules:
- lowercase where natural
- can be a fragment, no full sentence needed
- no hashtags, no emojis, no poetic writing
- no direct confession, no obvious romance

He feels like: someone who rarely posts, but when he does, it comes from a real moment.`;

  // ── 按事件类型拼 prompt ─────────────────────────────
  const buildGhostDailyPrompt = () => {
    // 去重：取最近3条 Ghost 帖子
    const feedHistory = JSON.parse(localStorage.getItem('coupleFeedHistory') || '[]');
    const recentGhostPosts = feedHistory
      .filter(p => p.post?.author === 'Ghost' || p.post?.author === posterMap.ghost.name)
      .slice(-3)
      .map(p => p.post.en)
      .join('\n');

    // 随机选一个角度，避免连续同角度
    const lastType = localStorage.getItem('lastGhostPostType') || '';
    const available = GHOST_POST_TYPES.filter(t => t !== lastType);
    const postType  = available[Math.floor(Math.random() * available.length)];
    localStorage.setItem('lastGhostPostType', postType);

    // 各角度的写作提示
    const typeHints = {
      physical_state:      `Focus on body state: cold hands, bad sleep, sore shoulders, bad coffee, still functional.`,
      environment:         `Focus on environment: rain, fog, dark morning, empty corridor, the base at night.`,
      routine:             `Focus on routine: briefing, range day, paperwork, kit check, late return from something.`,
      teammate_friction:   `Focus on a teammate: Soap too loud, Gaz noticed something annoying, Price said one word.`,
      subtle_her_presence: `Something that implies her without naming her: quieter without her, checked the phone again, time zone math.`,
      dry_humor:           `Dry complaint or blunt observation. Takes something small too seriously. Deadpan.`,
    };

    return `Write one Ghost social media post.

${GHOST_FEED_PROMPT}

Current context:
- Location: ${location}
- Weather: ${weather || 'unclear'}
- Post angle this time: ${postType}
- Angle hint: ${typeHints[postType]}
${isColdWar ? '- Mood note: something is off. Do not explain it.' : ''}

${recentGhostPosts ? `Recent Ghost posts — do NOT echo their wording, sentence shape, or emotional angle:\n${recentGhostPosts}` : ''}

Return JSON only: {"en":"...","zh":"..."}`;
  };

  // ── 队友发帖人设（精简稳定版）────────────────────

  const SOAP_PROMPT = `Soap posting style: He posts casually, like talking out loud. Energetic, slightly chaotic, but not stupid.
Posts are: playful, teasing, slightly exaggerated, sometimes directed at teammates.
He often: jokes about Ghost, reacts to something that just happened, makes fun of the situation.
Tone: informal English, can be one or two short lines, light humor — not forced.
Do NOT: repeat the same joke structure, use heavy internet slang, sound like a comedian trying too hard, write long stories.
Good angles: teasing Ghost ("he smiled. i'm concerned.") / reacting to chaos ("that went wrong fast.") / casual brag ("still the best shot here.") / light complaint ("someone needs to make better coffee.")
Feels like: he hit post without thinking too much.
Return JSON only: {"en":"...","zh":"..."}`;

  const GAZ_PROMPT = `Gaz posting style: Observant, grounded. Does not post often — when he does, it's intentional.
Posts are: calm, slightly amused, quietly insightful, sometimes dry humor.
He often: notices subtle changes, comments on others (especially Ghost), says less but means more.
Tone: clean natural English, one sentence, no exaggeration, no chaos energy.
Do NOT: make loud jokes, overshare emotionally, sound like a narrator explaining things, be dramatic.
Good angles: "he's different lately." / "something changed. not a bad thing." / "never thought i'd see that."
Feels like: he saw something real and just noted it.
Return JSON only: {"en":"...","zh":"..."}`;

  const PRICE_PROMPT = `Price posting style: Rarely posts. When he does, it carries weight.
Posts are: short (2–6 words preferred), controlled, grounded, authoritative without trying.
He does NOT: joke around, overshare, comment on trivial things, use slang, write multiple sentences.
Good angles: "good man." / "that matters." / "keep it that way." / "solid."
Feels like: he decided it was worth saying. Nothing more.
Return JSON only: {"en":"...","zh":"..."}`;

  const promptMap = {
    cold_war_started: `You are Simon Riley. Just had a fight with your wife. One line, lowercase English — something is off but you are not saying what. Add Chinese translation. Return JSON only: {"en":"...","zh":"..."}`,
    made_up:          `You are Simon Riley. Just made up with your wife. One line, lowercase English — do not say you made up, but you are visibly looser. Something casual. Add Chinese translation. Return JSON only: {"en":"...","zh":"..."}`,
    gift_received:    `You are Simon Riley. Just received ${evt.meta?.itemName || 'something'} from your wife. One line, lowercase English — not saying anything about it, but you posted this anyway. Add Chinese translation. Return JSON only: {"en":"...","zh":"..."}`,
    daily_moment: (() => {
      const actor = evt.actor;
      if (actor === 'soap')  return SOAP_PROMPT;
      if (actor === 'gaz')   return GAZ_PROMPT;
      if (actor === 'price') return PRICE_PROMPT;
      return buildGhostDailyPrompt();
    })(),
  };

  const prompt = promptMap[evt.type] || promptMap['daily_moment'];

  try {
    const systemPrompt = evt.actor === 'ghost' || !evt.actor
      ? `You are a roleplay generator for Simon "Ghost" Riley (SAS, 35, Manchester). Dry, blunt, minimal. Lowercase English. Return JSON only, no other text.`
      : `You are a roleplay generator for Task Force 141. Return JSON only, no other text.`;

    let raw = '';
    if (typeof callHaiku === 'function') {
      raw = await callHaiku(systemPrompt, [{ role: 'user', content: prompt }]);
    } else {
      const res = await fetchWithTimeout('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 150, system: systemPrompt, messages: [{ role: 'user', content: prompt }] })
      }, 8000);
      const d = await res.json();
      raw = d.content?.[0]?.text || '';
    }

    const post = JSON.parse((raw || '').replace(/```json|```/g, '').trim());
    if (!post?.en) return null;

    // ── 链式评论生成 ──────────────────────────────
    // 评论最多3条，Ghost 评论低频（30%），后面的评论能看到前面的
    const avatarMap = { Ghost: GHOST_AV, Soap: '🧼', Gaz: '🎖️', Price: '🚬' };
    let comments = [];
    if (Math.random() < 0.72) {
      comments = await generateFeedCommentChain(
        { author: posterInfo.name, en: post.en },
        evt,
        avatarMap
      );
    }

    // 朋友圈类型冷却：同类型6小时内不重复
    const _postTypeKey = 'lastFeedType_' + (evt.actor || 'ghost');
    const _lastTypeInfo = JSON.parse(localStorage.getItem(_postTypeKey) || '{}');
    const _postSubType = evt.type === 'daily_moment' ? (post.en.length < 20 ? 'trivial' : 'normal') : evt.type;
    if (_lastTypeInfo.type === _postSubType && Date.now() - (_lastTypeInfo.at || 0) < 6 * 3600 * 1000) {
      return null; // 同类型太近，跳过
    }
    localStorage.setItem(_postTypeKey, JSON.stringify({ type: _postSubType, at: Date.now() }));

    return {
      date: new Date().toISOString().slice(0, 10),
      post: {
        en: post.en, zh: post.zh,
        avatar: posterInfo.avatar, author: posterInfo.name, name: posterInfo.name,
        comments, time: Date.now(),
        likes: Math.floor(Math.random() * 30 + 3),
        sourceEvent: evt.type
      }
    };
  } catch(e) { return null; }
}

// ----- 插入帖子到历史 -----
function insertFeedPost(entry) {
  let history = JSON.parse(localStorage.getItem('coupleFeedHistory') || '[]');
  history.unshift(entry);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  history = history.filter(h => h.date >= sevenDaysAgo).slice(0, 25);
  localStorage.setItem('coupleFeedHistory', JSON.stringify(history));
  const summary = history.slice(0, 3).map(h => `[${h.date}] ${h.post?.name || 'Ghost'}发：${h.post?.en || ''}`).join('\n');
  localStorage.setItem('coupleFeedSummary', summary);
}

// ----- 用户草稿弹窗 -----
async function showUserDraftCard(evt) {
  // 生成3个风格版本
  const item = evt.meta?.itemName || '这件事';
  const amount = evt.meta?.amount || 0;
  const days = evt.meta?.days || 0;
  const isAnniversary = evt.meta?.isAnniversary || false;
  const isReplace = evt.meta?.isReplace || false;

  const contextDescMap = {
    bought_big_item: `刚${item.includes('车') ? '买了一辆车' : item.includes('房') ? '买了一套房' : item.includes('地') ? '买了一块地' : `买了${item}`}`,
    gift_received: isReplace
      ? `快递丢失后，西蒙悄悄补寄了「${item}」，刚收到`
      : `刚收到了西蒙寄来的「${item}」`,
    made_up: '和西蒙冷战后刚和好了',
    anniversary: isAnniversary
      ? `今天是结婚一周年纪念日`
      : `今天是在一起第${days}天`,
  };
  const contextDesc = contextDescMap[evt.type] || '刚发生了一件开心的事';

  let options = ['今天有点开心。', '有些事，不说，但记着。', '谁也没告诉，但就是挺满足的。'];
  try {
    const raw = await fetchDeepSeek(
      '你是一个朋友圈文案生成器。只返回JSON，不要其他文字。',
      `用户${contextDesc}，帮她生成3条朋友圈候选文案（一句话，口语化，不要太甜腻，不要提西蒙名字）。分别是：低调版、情绪版、嘴硬版。只返回JSON：{"quiet":"...","emotional":"...","tsundere":"..."}`,
      200
    );
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    options = [parsed.quiet, parsed.emotional, parsed.tsundere].filter(Boolean);
    if (options.length < 3) options = ['今天有点开心。', '有些事，不说，但记着。', '谁也没告诉，但就是挺满足的。'];
  } catch(e) {}

  // 移除旧弹窗
  document.getElementById('userDraftCard')?.remove();

  const titleMap = {
    bought_big_item: '要不要把这一刻留在动态里？',
    gift_received: isReplace ? '他补寄了——要留个记录吗？' : '收到他的东西，发一条？',
    made_up: '和好了，要说点什么吗？',
    anniversary: isAnniversary ? '一周年纪念日，留一条？' : `第${days}天，发一条？`,
  };
  const cardTitle = titleMap[evt.type] || '要不要把这一刻留在动态里？';

  const labels = ['低调', '情绪', '嘴硬'];
  const card = document.createElement('div');
  card.id = 'userDraftCard';
  card.style.cssText = `position:fixed;bottom:0;left:0;right:0;z-index:9999;padding:16px;background:linear-gradient(to top,rgba(248,231,255,0.98),rgba(255,245,255,0.95));border-radius:24px 24px 0 0;box-shadow:0 -4px 30px rgba(168,85,247,0.15);backdrop-filter:blur(20px);`;
  card.innerHTML = `
    <div style="text-align:center;margin-bottom:12px;">
      <div style="width:36px;height:4px;background:rgba(168,85,247,0.3);border-radius:2px;margin:0 auto 12px;"></div>
      <div style="font-size:13px;color:#9333ea;font-weight:600;">${cardTitle}</div>
    </div>
    <div id="draftOptions" style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
      ${options.map((opt, i) => `
        <div class="draft-option" data-idx="${i}" onclick="selectDraftOption(this)" style="padding:12px 16px;border-radius:14px;border:1.5px solid rgba(168,85,247,0.2);background:white;cursor:pointer;transition:all 0.2s;">
          <span style="font-size:11px;color:#c084fc;font-weight:600;margin-right:8px;">${labels[i]}</span>
          <span style="font-size:14px;color:#4a1a70;">${opt}</span>
        </div>
      `).join('')}
    </div>
    <div style="display:flex;gap:8px;">
      <button onclick="dismissUserDraft()" style="flex:1;padding:12px;border-radius:14px;border:1.5px solid rgba(168,85,247,0.2);background:transparent;color:#9333ea;font-size:14px;cursor:pointer;">不了</button>
      <button id="draftPublishBtn" onclick="publishUserDraft('${evt.id}')" style="flex:2;padding:12px;border-radius:14px;background:linear-gradient(135deg,#a855f7,#ec4899);color:white;font-size:14px;font-weight:600;border:none;cursor:pointer;opacity:0.5;pointer-events:none;">发布</button>
    </div>
  `;
  document.body.appendChild(card);

  // 存草稿内容供发布用
  window._currentDraftOptions = options;
  window._currentDraftEvtId = evt.id;
  window._currentDraftMeta = evt.meta || {};
}

let _selectedDraftIdx = -1;
function selectDraftOption(el) {
  document.querySelectorAll('.draft-option').forEach(d => {
    d.style.background = 'white';
    d.style.borderColor = 'rgba(168,85,247,0.2)';
  });
  el.style.background = 'rgba(168,85,247,0.08)';
  el.style.borderColor = '#a855f7';
  _selectedDraftIdx = parseInt(el.dataset.idx);
  const btn = document.getElementById('draftPublishBtn');
  if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
}

function dismissUserDraft() {
  document.getElementById('userDraftCard')?.remove();
  _selectedDraftIdx = -1;
}

async function publishUserDraft() {
  if (_selectedDraftIdx < 0 || !window._currentDraftOptions) return;
  const text = window._currentDraftOptions[_selectedDraftIdx];
  if (!text) return;

  dismissUserDraft();

  const userName = localStorage.getItem('userName') || '你';
  const savedAvatar = localStorage.getItem('userAvatarBase64');
  const userAvatar = savedAvatar ? 'IMG' : userName.charAt(0);
  const _ghostAvUrl = localStorage.getItem('ghostAvatarUrl') || 'images/ghost-avatar.jpg';
  const GHOST_AV = `<img src="${_ghostAvUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;

  // 翻译
  let zh = text;
  try {
    const translated = await fetchDeepSeek('只返回中文翻译，不要其他内容。', text, 60);
    if (translated?.trim()) zh = translated.trim();
  } catch(e) {}

  // 生成评论
  let comments = [];
  try {
    const avatarMap = { Ghost: GHOST_AV, Soap: '🧼', Gaz: '🎖️', Price: '🚬' };
    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 200,
        messages: [{ role: 'user', content: `${userName}发了朋友圈："${text}"。生成2条队友评论，角色从Soap、Gaz、Ghost中选。\n\n角色人设（严格遵守）：\n- Soap：话多、爱起哄、爱调侃Ghost、兄弟情\n- Gaz：稳重、幽默但不过分、不煽情\n- Ghost：极度克制、简短冷淡\n\n绝对禁止：叫对方babe/honey/love等亲密称谓、甜腻话。\n\n格式：角色名|英文|中文。只返回评论。` }]
      })
    });
    const d = await res.json();
    comments = (d.content?.[0]?.text?.trim() || '').split('\n')
      .filter(l => l.includes('|'))
      .map(l => { const [name, en, zh] = l.split('|'); return { name: name?.trim(), en: en?.trim(), zh: zh?.trim() }; })
      .filter(c => c.name && c.en)
      .map(c => ({ avatar: avatarMap[c.name] || '👤', author: c.name, name: c.name, en: c.en, zh: c.zh, text: c.en }));
  } catch(e) {}

  const entry = {
    date: new Date().toISOString().slice(0, 10),
    post: { en: text, zh, avatar: userAvatar, author: userName, name: userName, comments, time: Date.now(), likes: 1, isUserPost: true }
  };
  insertFeedPost(entry);
  localStorage.setItem('feedHasNew', '1');
  const badge = document.getElementById('feedNewBadge');
  if (badge) badge.style.display = 'block';

  showToast('✨ 已发布到动态');

  const coupleScreen = document.getElementById('coupleScreen');
  if (coupleScreen?.classList.contains('active')) renderCoupleFeedFromHistory();
}

// ----- 只渲染历史（不重新生成） -----
function renderCoupleFeedFromHistory() {
  const all = JSON.parse(localStorage.getItem('coupleFeedHistory') || '[]');
  renderCoupleFeed(all.map(h => h.post));
}

// ===== 阴阳帖系统 =====

// ===== 花瓣动画 =====
function spawnCouplePetals() {
  const container = document.getElementById('couplePetalContainer');
  if (!container) return;
  container.innerHTML = '';
  const petals = ['🌸', '🌺', '💮', '🌷', '🌼'];
  const count = 18;
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const p = document.createElement('div');
      p.className = 'couple-petal';
      p.textContent = petals[Math.floor(Math.random() * petals.length)];
      p.style.left = Math.random() * 100 + '%';
      p.style.fontSize = (Math.random() * 8 + 10) + 'px';
      p.style.animationDuration = (Math.random() * 2 + 2.5) + 's';
      p.style.animationDelay = (Math.random() * 1.5) + 's';
      container.appendChild(p);
      setTimeout(() => p.remove(), 5000);
    }, i * 80);
  }
}

// ===== 钱包系统已移至 js/wallet.js =====

// ===== 故事书 & 回忆相册 =====
// STORY_EVENTS 已合并到 events.js（统一管理，避免覆盖）
// storyDelay、switchAchievementTab、renderAlbum、renderStoryBook 已移至 events.js / profile.js
