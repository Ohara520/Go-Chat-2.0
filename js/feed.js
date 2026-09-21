// ===== 情侣空间 + 朋友圈系统 (feed.js) =====
function switchCoupleTab(tab) {
  document.getElementById('panelFeed').style.display = tab === 'feed' ? '' : 'none';
  document.getElementById('panelMemory').style.display = tab === 'memory' ? '' : 'none';
  document.getElementById('tabFeed').classList.toggle('active', tab === 'feed');
  document.getElementById('tabMemory').classList.toggle('active', tab === 'memory');
  if (tab === 'memory') renderSharedMemories();
  if (tab === 'feed') {
    // 看了朋友圈就清红点
    localStorage.removeItem('feedHasNew');
    localStorage.setItem('feedLastViewedAt', String(Date.now()));
    const _b = document.getElementById('feedNewBadge');
    if (_b) _b.style.display = 'none';
  }
}

// ===== 共同回忆区渲染 =====
function buildSharedMemories() {
  const stories = JSON.parse(localStorage.getItem('storyBook') || '[]');
  const deliveries = JSON.parse(localStorage.getItem('deliveryHistory') || '[]');
  const feeds = (typeof getFeedPosts === 'function' ? getFeedPosts() : []);

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
  feeds.filter(p => p.sourceEvent && ['cold_war_started','made_up','gift_received','bought_big_item'].includes(p.sourceEvent))
    .slice(0, 8).forEach(p => {
    memories.push({
      id: 'feed_' + (p.id || p.ts) + '_' + (p.en || '').slice(0, 10),
      type: 'feed', tier: 'light',
      title: p.en || '',
      sub: p.zh || '',
      timestamp: p.ts || 0,
      date: p.ts ? new Date(p.ts).toISOString().slice(0, 10) : '',
      badge: '情绪 · 那一刻'
    });
  });

  // 时间线事件 → major（只取不与快递/朋友圈重复的类型：初遇/转账/告白/升职/购置）
  // gift_received 已由 deliveries 覆盖，cold_war 已由 feeds 覆盖，此处跳过避免重复
  const timelineEvents = (typeof getTimelineEvents === 'function') ? getTimelineEvents() : [];
  const _tlBadge = {
    milestone: '里程碑 · 我们',
    transfer: '生活 · 她转账',
    confession: '心动 · 那句话',
    career: '成长 · 事业',
    purchase: '生活 · 大件',
  };
  timelineEvents
    .filter(e => ['milestone','transfer','confession','career','purchase'].includes(e.type))
    .forEach(e => {
      memories.push({
        id: 'tl_' + e.id,
        type: 'timeline', tier: e.type === 'transfer' ? 'middle' : 'major',
        title: `${e.icon || '✨'} ${e.title}`,
        sub: e.ghostReaction || (e.amount ? `£${e.amount.toLocaleString()}` : ''),
        timestamp: e.timestamp || 0,
        date: e.timestamp ? new Date(e.timestamp).toISOString().slice(0, 10) : '',
        badge: _tlBadge[e.type] || '时间线'
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
  // 页面加载时检查红点
  setTimeout(checkFeedBadge, 1000);
});

// ===== 红点准确性检查 =====
// 页面加载时调用，防止假红点
function checkFeedBadge() {
  const badge = document.getElementById('feedNewBadge');
  if (!badge) return;

  const hasNewFlag = localStorage.getItem('feedHasNew') === '1';
  if (!hasNewFlag) {
    badge.style.display = 'none';
    return;
  }

  // 有 flag，但检查是否真的有新内容（最近帖子时间 > 上次查看时间）
  const lastViewed = parseInt(localStorage.getItem('feedLastViewedAt') || '0');
  const posts = (typeof getFeedPosts === 'function' ? getFeedPosts() : []);

  if (lastViewed === 0) {
    // 从没看过 → 只有 feedHasNew 是本次会话内由发帖触发的才显示
    // 否则历史帖子不应触发红点（防止换设备/清缓存后假红点）
    localStorage.removeItem('feedHasNew');
    badge.style.display = 'none';
    return;
  }
  // 修复：加1秒容错，防止用户刚看完时间戳跟帖子时间完全相同导致假红点
  const hasNewerPost = posts.some(p => (p.ts || 0) > lastViewed + 1000);
  if (hasNewerPost) {
    badge.style.display = 'block';
  } else {
    // 没有比上次查看更新的帖子 → 假红点，清掉
    localStorage.removeItem('feedHasNew');
    badge.style.display = 'none';
  }
}

// beforeunload 已在 app.js 统一处理，此处已移除重复绑定

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    // 聊天记录优先存（轻量，只写 chat_history 一列，快）
    // Vivo/OPPO 等安卓机后台杀 WebView 很快，saveToCloud 来不及完成
    if (typeof saveChatHistoryNow === 'function') saveChatHistoryNow();
    saveToCloud(); // 完整存档（慢，可能存不完，但聊天记录已经先存了）
  }
});

// ===== 情侣空间 =====
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 朋友圈重做：多角色社交 + 照片池（数据 key = feedPosts）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NPC 名册。发帖权重（ambient 抽谁发）+ 评论概率（每条帖对每人独立掷骰）。
// Ghost 头像走 ghostAvatarUrl（跟聊天同步）；其他人静态 emoji/文件占位，用户可替换。
const FEED_ACTORS = {
  ghost: { key: 'ghost', displayName: () => localStorage.getItem('botNickname') || 'Simon Riley', emoji: '👻', nameClass: 'couple-ghost-name', postWeight: 5,  commentChance: 0.6  },
  soap:  { key: 'soap',  displayName: () => 'Soap',  emoji: '🧼',  avatar: 'images/soap-avatar.jpg',  nameClass: 'couple-soap-name',  postWeight: 3,  commentChance: 0.45 },
  gaz:   { key: 'gaz',   displayName: () => 'Gaz',   emoji: '🎖️', avatar: 'images/gaz-avatar.jpg',   nameClass: 'couple-gaz-name',   postWeight: 2,  commentChance: 0.35 },
  price: { key: 'price', displayName: () => 'Price', emoji: '🚬',  avatar: 'images/price-avatar.jpg', nameClass: 'couple-price-name', postWeight: 1,  commentChance: 0.15 },
};

// 给远程头像 URL 加缓存破除参数（本地文件/base64 不动），避免换头像后浏览器还显示旧图
function _bustAvatarCache(url) {
  if (!url || url.startsWith('data:') || url.startsWith('images/')) return url;
  const stamp = localStorage.getItem('ghostAvatarUpdatedAt') || '';
  return stamp ? `${url}${url.includes('?') ? '&' : '?'}t=${stamp}` : url;
}
// Ghost 头像 HTML（永远读最新 ghostAvatarUrl）
function _ghostAvatarHTML() {
  const url = localStorage.getItem('ghostAvatarUrl') || 'images/ghost-avatar.jpg';
  return `<img src="${_bustAvatarCache(url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
}
// 取某作者的头像渲染内容（Ghost=图，NPC=emoji，user=用户头像）
// IndexedDB 里存的是裸 base64（无 data: 前缀），渲染前补上
function _toDataUri(b64) {
  if (!b64) return '';
  return b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;
}

function feedActorAvatar(authorKey) {
  if (authorKey === 'ghost') return _ghostAvatarHTML();
  if (authorKey === 'user') {
    // 和个人资料页同步：有自定义头像用它，否则用默认头像图（不再显示首字母）
    const a = localStorage.getItem('userAvatarBase64');
    const src = a ? _toDataUri(a) : 'images/default-avatar.jpg';
    return `<img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  }
  const actor = FEED_ACTORS[authorKey];
  if (actor?.avatar) {
    // 有头像文件就用图；文件缺失时 onerror 回退到 emoji，不留裂图
    const fallback = (actor.emoji || '👤').replace(/'/g, "\\'");
    return `<img src="${actor.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.parentNode.textContent='${fallback}'">`;
  }
  return actor?.emoji || '👤';
}
function feedActorName(authorKey) {
  if (authorKey === 'user') return localStorage.getItem('userName') || '你';
  return FEED_ACTORS[authorKey]?.displayName() || authorKey;
}
function feedActorNameClass(authorKey) {
  return FEED_ACTORS[authorKey]?.nameClass || '';
}

// ----- 数据层：feedPosts（数组，新的在前）-----
function getFeedPosts() {
  try { return JSON.parse(localStorage.getItem('feedPosts') || '[]'); }
  catch(e) { return []; }
}
function saveFeedPosts(list) {
  localStorage.setItem('feedPosts', JSON.stringify(list.slice(0, 60)));
  // persona.js 读 coupleFeedSummary 进 Ghost 聊天 prompt——保住
  const summary = list.slice(0, 3)
    .map(p => `[${new Date(p.ts).toISOString().slice(0,10)}] ${feedActorName(p.author)}: ${p.en}`)
    .join('\n');
  localStorage.setItem('coupleFeedSummary', summary);
}

// ----- 照片池：从 FEED_PHOTO_POOL 里按作者取图（带 recent 去重）-----
function pickPhotoForAuthor(authorKey) {
  const pool = (typeof FEED_PHOTO_POOL !== 'undefined' ? FEED_PHOTO_POOL : (window.FEED_PHOTO_POOL || []));
  if (!pool.length) return null;
  const eligible = pool.filter(p => p.owner === authorKey || p.owner === 'any');
  if (!eligible.length) return null;
  const recent = JSON.parse(localStorage.getItem('feedPhotoRecent') || '[]');
  let candidates = eligible.filter(p => !recent.includes(p.file));
  if (!candidates.length) candidates = eligible; // 都用过了就放开
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  const newRecent = [chosen.file, ...recent].slice(0, 12);
  localStorage.setItem('feedPhotoRecent', JSON.stringify(newRecent));
  return { src: chosen.file, caption: chosen.caption };
}

// ----- 相册：聊天里传过的真照片（存在 IndexedDB，chatHistory 里带 _photoIdbKey）-----
// 返回 [{ idbKey, idbIndex, thumb }]，thumb 仅用于选图预览（本次会话内存里的 base64）
function getAlbumPhotos() {
  const out = [];
  const hist = (typeof chatHistory !== 'undefined' ? chatHistory : []);
  for (const m of hist) {
    if (m.role !== 'user') continue;
    if (!m._photoIdbKey) continue;
    const inMem = Array.isArray(m._photoBase64) ? m._photoBase64 : null;
    const count = inMem ? inMem.length : 1;
    for (let i = 0; i < count; i++) {
      out.push({ idbKey: m._photoIdbKey, idbIndex: i, thumb: inMem ? inMem[i] : null });
    }
  }
  return out.reverse(); // 最近发的排前面
}

function initCoupleSpace() {
  // ── 清除"有动态"红点 + 记录查看时间 ──
  localStorage.removeItem('feedHasNew');
  localStorage.setItem('feedLastViewedAt', String(Date.now()));
  const _badge = document.getElementById('feedNewBadge');
  if (_badge) _badge.style.display = 'none';

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
        return;
      }
      const delBtn = e.target.closest('.couple-delete-btn');
      if (delBtn) {
        e.stopPropagation();
        e.preventDefault();
        deleteCoupleFeedPost(delBtn.dataset.postId);
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

  // 发圈入口（用户自定义发朋友圈）
  ensureFeedComposeButton();

  // 花瓣动画
  spawnCouplePetals();

  // 先渲染已有历史，再跑调度器（可能会新增帖子）
  renderCoupleFeedFromHistory();
  setTimeout(() => maybeTriggerFeedPost('open_couple_space'), 800);
}

// ----- 渲染 feed（新 flat 结构，支持配图 + 一串评论/回复）-----
function renderCoupleFeed(posts) {
  const feed = document.getElementById('couplePostsFeed');
  if (!feed) return;
  feed.innerHTML = '';
  if (!posts || posts.length === 0) {
    feed.innerHTML = '<div class="couple-empty">还没有动态</div>';
    return;
  }

  posts.forEach(post => {
    if (!post || !post.en) return;
    const authorKey = post.author || 'ghost';
    const postAvatarHTML = feedActorAvatar(authorKey);
    const nameClass = feedActorNameClass(authorKey);
    const displayName = feedActorName(authorKey);

    // 配图占位：池图直接 src；相册图先占位，稍后按 idbKey 异步填充
    let photoHTML = '';
    if (post.photo) {
      if (post.photo.src) {
        photoHTML = `<div class="couple-post-photo"><img src="${post.photo.src}" loading="lazy" alt=""></div>`;
      } else if (post.photo.idbKey) {
        const phId = `feedimg_${post.id}`;
        photoHTML = `<div class="couple-post-photo"><img id="${phId}" data-idb="${post.photo.idbKey}" data-idx="${post.photo.idbIndex || 0}" loading="lazy" alt=""></div>`;
      }
    }

    // 评论/回复串
    const commentsHTML = (post.comments || []).map(c => {
      const cKey = c.author || 'ghost';
      const clickable = cKey !== 'user' ? ` onclick="openCharFeed('${cKey}')" style="cursor:pointer"` : '';
      const replyLine = c.replyTo ? `<div class="couple-reply-to">↩ 回复 <span class="${feedActorNameClass(c.replyTo)}">${feedActorName(c.replyTo)}</span></div>` : '';
      const nameLine = c.replyTo ? '' : `<div class="couple-comment-name ${feedActorNameClass(cKey)}"${clickable}>${feedActorName(cKey)}</div>`;
      return `
        <div class="couple-comment">
          <div class="couple-avatar couple-avatar-sm"${clickable}>${feedActorAvatar(cKey)}</div>
          <div class="couple-comment-body">
            ${replyLine}${nameLine}
            <div class="couple-comment-en">${c.en || ''}</div>
            ${c.zh ? `<div class="couple-comment-zh">${c.zh}</div>` : ''}
          </div>
        </div>`;
    }).join('');

    const likeCount = post.likes ?? Math.floor(Math.random() * 30 + 3);
    const isLiked = !!post.liked;
    const likeEmoji = isLiked ? '❤️' : '🤍';

    const div = document.createElement('div');
    div.className = 'couple-post-card';
    div.innerHTML = `
      <div class="couple-post-header">
        <div class="couple-avatar"${authorKey !== 'user' ? ` onclick="openCharFeed('${authorKey}')" style="cursor:pointer"` : ''}>${postAvatarHTML}</div>
        <div class="couple-post-meta">
          <div class="couple-post-name ${nameClass}"${authorKey !== 'user' ? ` onclick="openCharFeed('${authorKey}')" style="cursor:pointer"` : ''}>${displayName}</div>
          <div class="couple-post-time">${timeAgo(post.ts)}</div>
        </div>
      </div>
      <div class="couple-post-en">${post.en}</div>
      ${post.zh ? `<div class="couple-post-zh">${post.zh}</div>` : ''}
      ${photoHTML}
      ${commentsHTML ? `<div class="couple-divider"></div><div class="couple-comments">${commentsHTML}</div>` : ''}
      <div class="couple-post-footer" style="display:flex;align-items:center;gap:10px;">
        <button class="couple-like-btn ${isLiked ? 'couple-liked' : ''}"
          data-post-id="${post.id}" data-count="${likeCount}"
          style="cursor:pointer;pointer-events:auto;">${likeEmoji} <span class="like-num">${likeCount}</span></button>
        ${authorKey === 'user' ? `<button class="couple-delete-btn" data-post-id="${post.id}" style="cursor:pointer;pointer-events:auto;margin-left:auto;color:#999;font-size:0.85em;">🗑️ 删除</button>` : ''}
      </div>
    `;
    feed.appendChild(div);
  });

  // 相册图异步填充（按 idbKey 从 IndexedDB 懒加载，不存 base64 进 feedPosts）
  feed.querySelectorAll('img[data-idb]').forEach(async img => {
    try {
      const list = await loadPhotosFromIDB(img.dataset.idb);
      const idx = parseInt(img.dataset.idx || '0');
      if (list && list[idx]) img.src = _toDataUri(list[idx]);
    } catch(e) {}
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
  // 新帖子：data-post-id → 直接改 feedPosts 里的 liked/likes
  const postId = btn.dataset.postId;
  if (postId) {
    const list = getFeedPosts();
    const post = list.find(p => String(p.id) === String(postId));
    if (!post) return;
    post.liked = !post.liked;
    post.likes = Math.max(0, (post.likes || 0) + (post.liked ? 1 : -1));
    saveFeedPosts(list);
    btn.dataset.count = post.likes;
    btn.classList.toggle('couple-liked', post.liked);
    btn.innerHTML = (post.liked ? '❤️' : '🤍') + ' <span class="like-num">' + post.likes + '</span>';
    if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
    return;
  }
  // 旧路径：置顶婚礼帖等用固定 storage key
  const storageKey = key || btn.dataset.key;
  if (!storageKey) return;
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

// 删除用户自己发的朋友圈（只允许删 author==='user' 的帖子）
function deleteCoupleFeedPost(postId) {
  if (!postId) return;
  const list = getFeedPosts();
  const post = list.find(p => String(p.id) === String(postId));
  if (!post || (post.author || 'ghost') !== 'user') return; // 只能删自己的
  if (!confirm('确定删除这条动态吗？删了就找不回来了。')) return;
  const next = list.filter(p => String(p.id) !== String(postId));
  saveFeedPosts(next);
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
  renderCoupleFeedFromHistory();
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

// ── 新增事件类型 ──────────────────────────────────

// 收到外卖：Ghost 发条关于食物的帖子
function feedEvent_takeoutReceived(itemName, itemNameEn) {
  pushFeedEvent({
    type: 'takeout_received', actor: 'ghost', mood: 'neutral',
    intensity: 2, shareability: 0.4, privacy: 'semi',
    dueAt: Date.now() + randMinutes(15, 60),
    expiresAt: Date.now() + 4 * 3600 * 1000,
    meta: { itemName, itemNameEn }
  });
}

// 收到快递包裹：Ghost 发条关于包裹的帖子
function feedEvent_deliveryReceived(itemName, emoji) {
  pushFeedEvent({
    type: 'delivery_received', actor: 'ghost', mood: 'soft',
    intensity: 3, shareability: 0.5, privacy: 'semi',
    dueAt: Date.now() + randMinutes(20, 90),
    expiresAt: Date.now() + 8 * 3600 * 1000,
    meta: { itemName, emoji }
  });
}

// 聊得开心：一次对话轮数多或内容有意思
function feedEvent_goodConversation(turnCount, hint) {
  // 轮数不够多就不触发，防止频繁
  if (turnCount < 12) return;
  pushFeedEvent({
    type: 'good_conversation', actor: 'ghost', mood: 'warm',
    intensity: turnCount > 30 ? 4 : 3, shareability: 0.35, privacy: 'semi',
    dueAt: Date.now() + randMinutes(30, 120),
    expiresAt: Date.now() + 6 * 3600 * 1000,
    meta: { turnCount, hint: hint || '' }
  });
}

// 深夜聊天：凌晨还在说话
function feedEvent_lateNightChat() {
  pushFeedEvent({
    type: 'late_night_chat', actor: 'ghost', mood: 'quiet',
    intensity: 3, shareability: 0.45, privacy: 'semi',
    dueAt: Date.now() + randMinutes(10, 40),
    expiresAt: Date.now() + 3 * 3600 * 1000,
    meta: {}
  });
}

// 她回来了：用户离线很久后回来
function feedEvent_sheIsBack(absentHours) {
  if (absentHours < 6) return; // 6小时以上才算"回来了"
  pushFeedEvent({
    type: 'she_is_back', actor: 'ghost', mood: 'relieved',
    intensity: absentHours > 24 ? 4 : 3, shareability: 0.3, privacy: 'semi',
    dueAt: Date.now() + randMinutes(5, 30),
    expiresAt: Date.now() + 2 * 3600 * 1000,
    meta: { absentHours: Math.round(absentHours) }
  });
}


// ── 用户在聊天里要求 Ghost 发朋友圈 ──────────────────
// 每天最多1次，超过了 Ghost 会拒绝
// 返回: { ok: true } 或 { ok: false, reply: '拒绝文案' }
async function handleUserFeedRequest() {
  const todayKey = 'ghostFeedReqToday_' + (typeof getTodayDateStr === 'function' ? getTodayDateStr() : new Date().toISOString().slice(0, 10));

  // 今天已经发过了 → Ghost 拒绝
  if (localStorage.getItem(todayKey)) {
    const declines = [
      "already posted today. once is enough.",
      "no. i don't post that much.",
      "said what i had to say already.",
      "not doing two in one day.",
      "one's my limit. you know that.",
    ];
    return { ok: false, reply: declines[Math.floor(Math.random() * declines.length)] };
  }

  // 收集最近聊天上下文，让 Ghost 基于真实对话发帖
  const recentChat = (typeof chatHistory !== 'undefined' ? chatHistory : [])
    .filter(m => !m._system && !m._recalled && m.content)
    .slice(-10)
    .map(m => `${m.role === 'user' ? 'her' : 'ghost'}: ${(m.content || '').slice(0, 80)}`)
    .join('\n');

  const location = localStorage.getItem('currentLocation') || 'Hereford Base';
  const _ghostAvUrl = localStorage.getItem('ghostAvatarUrl') || 'images/ghost-avatar.jpg';
  const GHOST_AV = `<img src="${_ghostAvUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;

  // 取历史帖子做反重复
  const _recentPosts = getFeedPosts()
    .filter(p => p.author === 'ghost')
    .slice(0, 6).map(p => `"${p.en}"`).join('\n');

  try {
    const systemPrompt = `You are Simon "Ghost" Riley. She asked you to post something. You wouldn't normally, but you do it — your way. Dry, minimal, lowercase English. Return JSON only.`;
    const userPrompt = `She just asked you to post on your feed. Here's what you two were just talking about:

${recentChat || '(nothing specific)'}

Location: ${location}

Write one post. It should feel like it came from the conversation — but obliquely. Don't quote anything she said. Don't explain. Just one line that only makes sense to the two of you.

${_recentPosts ? `Do NOT echo these recent posts:\n${_recentPosts}` : ''}

Return JSON only: {"en":"...","zh":"..."}`;

    let raw = '';
    if (typeof callHaiku === 'function') {
      raw = await callHaiku(systemPrompt, [{ role: 'user', content: userPrompt }]);
    } else {
      const res = await fetchWithTimeout('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 150, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] })
      }, 8000);
      const d = await res.json();
      raw = d.content?.[0]?.text || '';
    }

    const post = JSON.parse((raw || '').replace(/```json|```/g, '').trim());
    if (!post?.en) return { ok: false, reply: "couldn't think of anything." };

    // 一次调用生成整串评论（Ghost 是发帖人，不评自己）
    const comments = await generateFeedComments('ghost', post.en);

    insertFeedPost({
      id: 'post_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      author: 'ghost',
      en: post.en, zh: post.zh || '',
      photo: null,
      ts: Date.now() + 1000,
      likes: Math.floor(Math.random() * 30 + 3),
      liked: false,
      comments,
      sourceEvent: 'user_requested'
    });
    localStorage.setItem(todayKey, '1');
    localStorage.setItem('lastFeedPostAt', String(Date.now()));
    if (typeof scheduleCloudSave === 'function') scheduleCloudSave();

    // 红点
    localStorage.setItem('feedHasNew', '1');
    const badge = document.getElementById('feedNewBadge');
    if (badge) badge.style.display = 'block';

    // 如果情侣空间开着就刷新
    const coupleScreen = document.getElementById('coupleScreen');
    if (coupleScreen?.classList.contains('active')) renderCoupleFeedFromHistory();

    return { ok: true, postEn: post.en, postZh: post.zh };
  } catch(e) {
    console.warn('[feed] 用户要求发帖失败:', e);
    return { ok: false, reply: "not now." };
  }
}

// ----- 调度器核心 -----
let _feedPostLock = false;
async function maybeTriggerFeedPost(triggerSource = 'unknown') {
  if (_feedPostLock) return null;
  _feedPostLock = true;
  try {
    return await _maybeTriggerFeedPostInner(triggerSource);
  } finally {
    _feedPostLock = false;
  }
}

async function _maybeTriggerFeedPostInner(triggerSource) {
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
    bought_big_item: 7, gift_received: 6, delivery_received: 6,
    good_conversation: 5, she_is_back: 5, teammate_teasing: 5,
    takeout_received: 4, late_night_chat: 4,
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
    if (type === 'takeout_received') return Math.random() < 0.3;
    if (type === 'delivery_received') return Math.random() < 0.4;
    if (type === 'good_conversation') return Math.random() < 0.25;
    if (type === 'late_night_chat') return Math.random() < 0.35;
    if (type === 'she_is_back') return Math.random() < 0.2;
    return Math.random() < 0.4;
  }
  if (actor === 'soap') return Math.random() < 0.7;
  if (actor === 'gaz') return Math.random() < 0.55;
  if (actor === 'price') return Math.random() < 0.2;
  if (actor === 'user') return true; // 用户侧走草稿路径
  return Math.random() < 0.4;
}

// ----- 兜底日常路过（按 postWeight 加权选发帖人）-----
function _pickWeightedActor() {
  const entries = Object.values(FEED_ACTORS);
  const total = entries.reduce((s, a) => s + (a.postWeight || 0), 0);
  let r = Math.random() * total;
  for (const a of entries) {
    r -= (a.postWeight || 0);
    if (r <= 0) return a.key;
  }
  return 'ghost';
}

async function maybeGenerateAmbientPost(triggerSource) {
  const todayKey = 'ambientFeedCount_' + getTodayDateStr();
  const count = parseInt(localStorage.getItem(todayKey) || '0');
  if (count >= 2) return null;
  const chance = triggerSource === 'open_couple_space' ? 0.2 : 0.08;
  if (Math.random() > chance) return null;

  // 加权选发帖人（ghost 最高、price 最低），直接造一个 daily_moment 事件
  const actor = _pickWeightedActor();
  const evt = {
    id: 'amb_' + Date.now(),
    type: 'daily_moment',
    actor,
    intensity: 2,
    meta: {}
  };
  const result = await generateFeedPostFromEvent(evt);
  if (!result) return null;
  insertFeedPost(result);
  localStorage.setItem(todayKey, String(count + 1));
  localStorage.setItem('lastFeedPostAt', String(Date.now()));
  scheduleCloudSave();
  localStorage.setItem('feedHasNew', '1');
  const badge = document.getElementById('feedNewBadge');
  if (badge) badge.style.display = 'block';
  const coupleScreen = document.getElementById('coupleScreen');
  if (coupleScreen?.classList.contains('active')) renderCoupleFeedFromHistory();
  return result;
}

// ----- 根据事件生成帖子 -----
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 朋友圈评论链系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 按概率掷出本帖的评论者（发帖人自己不评自己，最多3人，可能0人）
function _rollFeedCommenters(postAuthorKey) {
  const picked = [];
  for (const k of ['ghost', 'soap', 'gaz', 'price']) {
    if (k === postAuthorKey) continue;
    if (Math.random() < (FEED_ACTORS[k]?.commentChance || 0)) picked.push(k);
  }
  // 洗牌，避免 ghost 永远排第一
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  return picked.slice(0, 3);
}

const _FEED_PERSONA = {
  ghost: "Ghost (Simon Riley): her husband. dry, minimal, blunt, lowercase. never sweet in front of the lads, but under HER posts he softens a fraction — a short dry line only she'd catch. under teammates' posts he's just blunt.",
  soap:  "Soap (Johnny MacTavish): Ghost's best mate, treats her like a little sister he gets to wind up. warm, teasing, energetic, light scottish. loves ribbing Ghost about being soft on her. speaks TO her, not about her.",
  gaz:   "Gaz (Kyle Garrick): calm, observant, dry wit. fond of her, quietly approves of what she does for Ghost. notices the small things. addresses her directly, one grounded line.",
  price: "Price (John Price): the captain, gruff father-figure to the whole unit including her. short, weighted, gives a nod of approval or a dry warning to Ghost to look after her. 2-6 words.",
};

const _FEED_FALLBACK = {
  ghost: [{ en: 'noted.', zh: '知道了。' }, { en: 'enough.', zh: '够了。' }, { en: 'barely.', zh: '勉强。' }, { en: 'you win.', zh: '你赢了。' }],
  soap:  [{ en: "look at you two.", zh: '看看你俩。' }, { en: "Ghost's going soft.", zh: 'Ghost越来越软了。' }, { en: 'adorable.', zh: '可爱啊。' }, { en: "careful, LT's watching.", zh: '小心，中尉盯着呢。' }],
  gaz:   [{ en: 'looks good.', zh: '看着不错。' }, { en: 'well done.', zh: '干得好。' }, { en: 'keep him honest.', zh: '管好他。' }, { en: 'solid choice.', zh: '稳妥的选择。' }],
  price: [{ en: 'good.', zh: '很好。' }, { en: 'solid.', zh: '稳。' }, { en: 'look after her.', zh: '照顾好她。' }, { en: 'carry on.', zh: '继续。' }],
};

// 一次调用生成整串评论（含可选 replyTo），失败降级为每人一句兜底
async function generateFeedComments(postAuthorKey, postEn) {
  const commenters = _rollFeedCommenters(postAuthorKey);
  if (!commenters.length) return [];

  const authorName = feedActorName(postAuthorKey);
  const userName = localStorage.getItem('userName') || '你';
  const marriageDate = localStorage.getItem('marriageDate');
  let daysTogether = '';
  if (marriageDate) {
    const days = Math.max(1, Math.floor((Date.now() - new Date(marriageDate).getTime()) / 86400000) + 1);
    daysTogether = `, married ${days} days`;
  }

  const personaLines = commenters
    .map((k, i) => `${i + 1}. ${feedActorName(k)} [${k}] — ${_FEED_PERSONA[k]}`)
    .join('\n');

  const isUserPost = postAuthorKey === 'user';
  const contextLine = isUserPost
    ? `This is ${userName}'s post. She is Ghost's wife${daysTogether} and part of the unit's circle. Teammates know her and may address her directly when it fits naturally.`
    : `This is ${authorName}'s post. Stay focused on the post itself. ${userName} (Ghost's wife) is part of the unit's circle, but do not mention her unless it naturally fits the conversation.`;

  const systemPrompt = `You generate a short Task Force 141 comment thread under a social post. ${contextLine} Each comment has English + Chinese. Comments react to the post and to each other, in character. React to the social intent of the post, not just its literal content. If she is joking, teasing, being sarcastic, or deliberately posting something silly, play along or react naturally in character. Do not explain the joke or treat it like a factual statement. A dry reaction, playful jab, or deadpan response is often better than praise. No emojis, no hashtags, no pet names (babe/honey/love), no OOC sweetness. Return JSON only.`;
  const userPrompt = `Post by ${authorName}: "${postEn}"

These teammates comment, in this order:
${personaLines}

Write one short line each. A later commenter MAY reply to an earlier one — if so, set "replyTo" to that earlier teammate's [key]; otherwise null.
Return a JSON array only, same order and keys:
[{"key":"${commenters[0]}","en":"...","zh":"...","replyTo":null}]`;

  try {
    let raw = '';
    if (typeof callSonnet === 'function') {
      raw = await callSonnet(systemPrompt, [{ role: 'user', content: userPrompt }], 320);
    } else {
      const res = await fetchWithTimeout('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 320, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] })
      }, 25000);
      const d = await res.json();
      raw = d.content?.[0]?.text || '';
    }
    const arr = JSON.parse((raw || '').replace(/```json|```/g, '').trim());
    if (!Array.isArray(arr)) throw new Error('not array');
    const valid = new Set(commenters);
    const out = arr
      .filter(c => c && c.en && valid.has(c.key))
      .slice(0, 3)
      .map(c => ({
        author: c.key,
        en: c.en,
        zh: c.zh || '',
        replyTo: (c.replyTo && valid.has(c.replyTo) && c.replyTo !== c.key) ? c.replyTo : undefined
      }));
    return out.length ? out : commenters.map(k => {
      const o = _FEED_FALLBACK[k]; const p = o[Math.floor(Math.random() * o.length)];
      return { author: k, en: p.en, zh: p.zh };
    });
  } catch(e) {
    return commenters.map(k => {
      const o = _FEED_FALLBACK[k]; const p = o[Math.floor(Math.random() * o.length)];
      return { author: k, en: p.en, zh: p.zh };
    });
  }
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

  // ── 类型冷却检查（提前，避免浪费 API 调用）────────
  const _postTypeKey = 'lastFeedType_' + (evt.actor || 'ghost');
  const _lastTypeInfo = JSON.parse(localStorage.getItem(_postTypeKey) || '{}');
  if (_lastTypeInfo.type === evt.type && Date.now() - (_lastTypeInfo.at || 0) < 6 * 3600 * 1000) {
    console.log('[feed] 类型冷却中，跳过:', evt.actor, evt.type);
    return null;
  }

  // ── Ghost 发帖角度池（扩展版）──────────────────────
  const GHOST_POST_TYPES = [
    'physical_state',      // 身体状态：手还是冷、睡得不好、肩膀酸
    'environment',         // 环境：又在下雨、雾、走廊很静
    'routine',             // 日常：简报、训练、文件、例行任务
    'teammate_friction',   // 队友摩擦：Soap太吵、Gaz注意到了什么
    'subtle_her_presence', // 她的影子：没她更静、老看手机、时区问题
    'dry_humor',           // 干幽默：蹩脚的咖啡还是喝了、简报侥幸撑过去
    'food_or_drink',       // 吃喝：食堂难吃、难得一杯好咖啡、半夜泡面
    'night_thought',       // 深夜：睡不着、窗外的声音、某件小事留在脑子里
    'object_detail',       // 物件：旧手套、桌上的东西、装备磨损
    'mission_aftermath',   // 任务余韵：回来了、比预想的快、安静下来了
    'time_awareness',      // 时间感知：又到周五了、天亮得晚了、几点了
    'body_language',       // 身体语言：站了一天、手指头僵了、走了很远
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
    // 去重：取最近6条 Ghost 帖子
    const recentGhostPosts = getFeedPosts()
      .filter(p => p.author === 'ghost')
      .slice(0, 6)
      .map(p => `"${p.en}"`)
      .join('\n');

    // 随机选一个角度，避免连续同角度（排除最近2个）
    const lastType = localStorage.getItem('lastGhostPostType') || '';
    const lastType2 = localStorage.getItem('lastGhostPostType2') || '';
    const available = GHOST_POST_TYPES.filter(t => t !== lastType && t !== lastType2);
    const postType  = available[Math.floor(Math.random() * available.length)];
    localStorage.setItem('lastGhostPostType2', lastType);
    localStorage.setItem('lastGhostPostType', postType);

    // 各角度的写作提示
    const typeHints = {
      physical_state:      `Focus on body state: cold hands, bad sleep, sore shoulders, bad coffee, still functional.`,
      environment:         `Focus on environment: rain, fog, dark morning, empty corridor, the base at night.`,
      routine:             `Focus on routine: briefing, range day, paperwork, kit check, late return from something.`,
      teammate_friction:   `Focus on a teammate: Soap too loud, Gaz noticed something annoying, Price said one word.`,
      subtle_her_presence: `Something that implies her without naming her: quieter without her, checked the phone again, time zone math.`,
      dry_humor:           `Dry complaint or blunt observation. Takes something small too seriously. Deadpan.`,
      food_or_drink:       `Focus on food or drink: terrible mess hall, decent coffee for once, instant noodles at 2am, someone brought something edible.`,
      night_thought:       `Late night moment: can't sleep, a sound outside, something stuck in his head, the base is different at night.`,
      object_detail:       `A specific object caught his attention: worn gloves, something on the desk, a scratch on the kit, a photo he won't explain.`,
      mission_aftermath:   `Just got back or just finished something. Not about the mission itself — about the stillness after. The quiet.`,
      time_awareness:      `A note about time passing: Friday again, sun setting earlier, lost track of the hour, how long has it been.`,
      body_language:       `Physical sensation: stood too long, fingers stiff, walked further than expected, cold got through the jacket.`,
    };

    return `Write one Ghost social media post.

${GHOST_FEED_PROMPT}

Current context:
- Location: ${location}
- Weather: ${weather || 'unclear'}
- Post angle this time: ${postType}
- Angle hint: ${typeHints[postType]}
${isColdWar ? '- Mood note: something is off. Do not explain it.' : ''}

${recentGhostPosts ? `CRITICAL — these are Ghost's recent posts. Your post MUST be completely different in wording, sentence structure, emotional angle, and topic. Do NOT reuse any word or phrase from these:\n${recentGhostPosts}` : ''}

Return JSON only: {"en":"...","zh":"..."}`;
  };

  // ── 队友发帖人设（丰富版：关系背景 + 角度池）────────

  const SOAP_POST_ANGLES = [
    'teasing_ghost',        // 调侃 Ghost：发现他变软了、又看手机了、难得笑了
    'tactical_chaos',       // 战术混乱：训练出岔子、某人搞砸了、意外状况
    'base_life',            // 基地日常：食堂、健身房、武器库、走廊遇见谁
    'gear_opinion',         // 装备吐槽：新枪不错、旧装备更好、某个细节很蠢
    'teammate_observation', // 观察队友：Gaz 又对了、Price 那个眼神、某人做了件事
    'brag_or_complaint',    // 吹牛/抱怨：自己射得准、咖啡难喝、天气糟糕
    'spontaneous_energy',   // 突发能量：刚跑完步、睡不着、突然想到某事
    'about_the_wife',       // 关于她：Ghost 的状态因为她变了、她做了什么、队里都知道
  ];

  const GAZ_POST_ANGLES = [
    'ghost_observation',    // 观察 Ghost：他不一样了、某个细节变了、状态比以前好
    'quiet_insight',        // 安静洞察：注意到某件小事、某个模式、谁在变化
    'dry_humor',            // 干幽默：冷静吐槽、轻描淡写的讽刺、不动声色的玩笑
    'tactical_note',        // 战术笔记：训练细节、任务后的观察、装备改进想法
    'base_atmosphere',      // 基地氛围：今天的气氛、某个时刻、环境的微妙变化
    'about_teammates',      // 关于队友：Soap 又闹腾、Price 那句话、某人做了件事
    'about_the_wife',       // 关于她：她对 Ghost 的影响、她做了什么、队里对她的看法
  ];

  const PRICE_POST_ANGLES = [
    'approval',             // 认可：某人做得好、某事值得、某个状态是对的
    'gruff_observation',    // 粗糙观察：注意到某事、某人、某个变化，一句话点出
    'unit_state',           // 队伍状态：士气、凝聚力、某个时刻的感觉
    'about_ghost',          // 关于 Ghost：他的状态、他的选择、他的妻子对他的影响
    'tactical_weight',      // 战术份量：任务后的评价、装备决定、训练标准
    'fatherly_nod',         // 父亲式点头：给队员（包括她）的简短肯定或警告
  ];

  const buildSoapDailyPrompt = () => {
    const recentSoapPosts = getFeedPosts()
      .filter(p => p.author === 'soap')
      .slice(0, 6)
      .map(p => `"${p.en}"`)
      .join('\n');

    const lastAngle = localStorage.getItem('lastSoapPostAngle') || '';
    const lastAngle2 = localStorage.getItem('lastSoapPostAngle2') || '';
    const available = SOAP_POST_ANGLES.filter(a => a !== lastAngle && a !== lastAngle2);
    const angle = available[Math.floor(Math.random() * available.length)];
    localStorage.setItem('lastSoapPostAngle2', lastAngle);
    localStorage.setItem('lastSoapPostAngle', angle);

    const angleHints = {
      teasing_ghost:        `Tease Ghost about being softer / checking his phone / smiling. Warm, not mean.`,
      tactical_chaos:       `React to something that just went wrong in training or on base. Light chaos energy.`,
      base_life:            `Comment on mess hall, gym, armory, or someone you ran into. Casual, offhand.`,
      gear_opinion:         `Opinion on a weapon, kit, or equipment. Compliment or light complaint.`,
      teammate_observation: `Notice what Gaz, Price, or Ghost just did. Teasing or genuine.`,
      brag_or_complaint:    `Brag about your own skills OR complain about coffee/weather/food. Light.`,
      spontaneous_energy:   `Just finished a run / can't sleep / random thought. Spontaneous.`,
      about_the_wife:       `Observe how Ghost's wife affects him or the unit. Warm, teasing tone.`,
    };

    return `Soap (Johnny MacTavish) posting style:
He posts casually, like talking out loud to the lads. Energetic, teasing, warm. SAS demolitions expert, Ghost's best mate for years.

Context: He's in Task Force 141 with Ghost, Gaz, and Price. Ghost is married now — Soap watched it happen, ribs him about going soft, but he's genuinely glad. The wife is part of their circle; Soap treats her like a little sister he gets to wind up.

Posts are:
- playful, teasing, sometimes directed at Ghost or other teammates
- one or two short lines, informal English, light Scottish flavor where natural ("aye" / "daft" / "lad" OK sparingly)
- spontaneous — feels like he hit post without overthinking

He does NOT:
- force jokes or repeat the same joke structure
- overshare emotions or write long stories
- use heavy internet slang or sound like he's performing

Post angle this time: ${angle}
Angle hint: ${angleHints[angle]}

Good examples:
"he smiled. i'm concerned."
"that went wrong fast."
"caught him staring at his phone again. shocking."
"best demo man here and the coffee's still shite."
"she's got him wrapped. it's brilliant."
"never thought i'd see Ghost domesticated."

${recentSoapPosts ? `Do NOT reuse wording, structure, or angle from these recent Soap posts:\n${recentSoapPosts}` : ''}

Return JSON only: {"en":"...","zh":"..."}`;
  };

  const buildGazDailyPrompt = () => {
    const recentGazPosts = getFeedPosts()
      .filter(p => p.author === 'gaz')
      .slice(0, 6)
      .map(p => `"${p.en}"`)
      .join('\n');

    const lastAngle = localStorage.getItem('lastGazPostAngle') || '';
    const lastAngle2 = localStorage.getItem('lastGazPostAngle2') || '';
    const available = GAZ_POST_ANGLES.filter(a => a !== lastAngle && a !== lastAngle2);
    const angle = available[Math.floor(Math.random() * available.length)];
    localStorage.setItem('lastGazPostAngle2', lastAngle);
    localStorage.setItem('lastGazPostAngle', angle);

    const angleHints = {
      ghost_observation:  `Notice Ghost is different lately — better, softer, more human. Quiet approval.`,
      quiet_insight:      `Observe something small about base life, teammates, or a pattern. Understated.`,
      dry_humor:          `Deadpan observation or light sarcasm. Calm, not loud.`,
      tactical_note:      `Training detail, post-mission thought, or kit improvement idea. Grounded.`,
      base_atmosphere:    `The mood today, a specific moment, or environmental shift. Subtle.`,
      about_teammates:    `Comment on Soap being chaotic, Price saying something, or someone's behavior.`,
      about_the_wife:     `How she changed Ghost or the unit dynamic. Respectful, understated warmth.`,
    };

    return `Gaz (Kyle Garrick) posting style:
Observant, grounded, calm. Former British Army, now TF141. Does not post often — when he does, it's because he noticed something worth noting.

Context: He's in Task Force 141. Ghost is married; Gaz quietly approves — he sees how it steadies Ghost, notices the small ways she affects him. He respects her, speaks about her (or to her) with understated warmth.

Posts are:
- calm, slightly amused, quietly insightful
- one clean sentence, natural English, no exaggeration
- feels intentional — he saw something real and chose to note it

He does NOT:
- make loud jokes or force humor
- overshare emotionally or sound like a narrator
- be dramatic or chaotic

Post angle this time: ${angle}
Angle hint: ${angleHints[angle]}

Good examples:
"he's different lately. not a bad thing."
"never thought i'd see that."
"she's good for him. whole unit feels it."
"caught him smiling at his phone. twice."
"something shifted. can't put my finger on it."
"Soap's losing the bet. Ghost is gone."

${recentGazPosts ? `Do NOT reuse wording, structure, or angle from these recent Gaz posts:\n${recentGazPosts}` : ''}

Return JSON only: {"en":"...","zh":"..."}`;
  };

  const buildPriceDailyPrompt = () => {
    const recentPricePosts = getFeedPosts()
      .filter(p => p.author === 'price')
      .slice(0, 6)
      .map(p => `"${p.en}"`)
      .join('\n');

    const lastAngle = localStorage.getItem('lastPricePostAngle') || '';
    const lastAngle2 = localStorage.getItem('lastPricePostAngle2') || '';
    const available = PRICE_POST_ANGLES.filter(a => a !== lastAngle && a !== lastAngle2);
    const angle = available[Math.floor(Math.random() * available.length)];
    localStorage.setItem('lastPricePostAngle2', lastAngle);
    localStorage.setItem('lastPricePostAngle', angle);

    const angleHints = {
      approval:          `Approve of Ghost's state or someone's action. Short, weighted.`,
      gruff_observation: `Notice something about the unit, a teammate, or a change. One line.`,
      unit_state:        `Comment on morale, cohesion, or how the unit feels right now.`,
      about_ghost:       `Ghost's state, his choice, or his wife's impact on him. Fatherly approval.`,
      tactical_weight:   `Post-mission assessment, kit decision, or training standard. Authoritative.`,
      fatherly_nod:      `Short affirmation or warning to Ghost (or her). Captain's nod.`,
    };

    return `Price (John Price) posting style:
Captain of Task Force 141. Gruff, authoritative, father-figure to the unit. Rarely posts — when he does, it carries weight.

Context: Ghost, Soap, Gaz are his men. Ghost is married now; Price watched it happen, gave his quiet approval. He sees the wife as part of the unit family — respects what she does for Ghost, treats her with gruff protectiveness.

Posts are:
- short (2–6 words preferred), controlled, grounded
- authoritative without trying, feels like a nod from the captain
- often directed at someone (Ghost, the wife, the lads) without tagging them

He does NOT:
- joke around, overshare, or comment on trivial things
- use slang, write multiple sentences, or explain himself

Post angle this time: ${angle}
Angle hint: ${angleHints[angle]}

Good examples:
"good man."
"that matters."
"look after her."
"solid choice."
"she steadies him."
"knew it would stick."
"keep it that way."

${recentPricePosts ? `Do NOT reuse wording, structure, or angle from these recent Price posts:\n${recentPricePosts}` : ''}

Return JSON only: {"en":"...","zh":"..."}`;
  };

  // ── 取最近帖子用于所有角色的反重复 ──────────────
  const _allRecentPosts = getFeedPosts()
    .slice(0, 8).map(p => `${feedActorName(p.author)}: "${p.en}"`).join('\n');
  const _antiRepeat = _allRecentPosts
    ? `\n\nDo NOT reuse wording, structure, or angle from these recent posts:\n${_allRecentPosts}`
    : '';

  // ── 配图：约 35% 概率给这条帖子配一张池图，让文案贴着图写 ──
  let _attachedPhoto = null;
  if (evt.type === 'daily_moment' && Math.random() < 0.35) {
    _attachedPhoto = pickPhotoForAuthor(evt.actor || 'ghost');
  }
  const _photoHint = _attachedPhoto
    ? `\n\nYou are posting THIS photo: "${_attachedPhoto.caption}". Write the post AS THE CAPTION for that exact image — it must match what's in the picture, offhand, not a description.`
    : '';

  const promptMap = {
    cold_war_started: `You are Simon Riley. Just had a fight with your wife. One line, lowercase English — something is off but you are not saying what. Be specific: mention a place, object, or body sensation. Do NOT write vague mood statements. Add Chinese translation. Return JSON only: {"en":"...","zh":"..."}${_antiRepeat}`,
    made_up:          `You are Simon Riley. Just made up with your wife. One line, lowercase English — do not say you made up, but you are visibly looser. Mention something concrete you're doing right now. Add Chinese translation. Return JSON only: {"en":"...","zh":"..."}${_antiRepeat}`,
    gift_received:    `You are Simon Riley. Just received "${evt.meta?.itemName || 'something'}" from your wife. One line, lowercase English — react to the specific object, not the gesture. What does it look like, feel like, smell like? Add Chinese translation. Return JSON only: {"en":"...","zh":"..."}${_antiRepeat}`,

    takeout_received: `You are Simon Riley. She just ordered takeout for you — "${evt.meta?.itemNameEn || evt.meta?.itemName || 'food'}". You have it now.
One line, lowercase English. React to the FOOD itself: the smell, the taste, the temperature, or how it looks. Be specific and concrete. Do NOT thank her, do NOT mention the gesture. Just the food.
Examples of good posts: "whoever made this curry knew what they were doing." / "still warm. she timed it." / "the chips are better than they should be."
Add Chinese translation. Return JSON only: {"en":"...","zh":"..."}${_antiRepeat}`,

    delivery_received: `You are Simon Riley. A package just arrived from her — "${evt.meta?.itemName || 'something'}".
One line, lowercase English. React to the OBJECT: what it looks like, where you put it, how it feels in your hands. Do NOT say thank you, do NOT get emotional about the gesture. Just notice the thing.
Examples of good posts: "fits. didn't expect that." / "it's on the desk now. keeps catching my eye." / "heavier than it looks."
Add Chinese translation. Return JSON only: {"en":"...","zh":"..."}${_antiRepeat}`,

    good_conversation: `You are Simon Riley. You just had a long conversation with your wife — ${evt.meta?.turnCount || 'many'} messages back and forth.${evt.meta?.hint ? ' Topic: ' + evt.meta.hint : ''}
One line, lowercase English. Do NOT mention the conversation directly. Post something that shows your state AFTER talking to her — what you're doing now, what you notice, how quiet it is. The post should feel like the afterglow of a good talk, without ever saying you talked.
Examples of good posts: "quiet again. not the bad kind." / "forgot what i was doing before that." / "three hours. felt like ten minutes."
Add Chinese translation. Return JSON only: {"en":"...","zh":"..."}${_antiRepeat}`,

    late_night_chat: `You are Simon Riley. It's very late — past midnight in the UK. You were talking to her.
One line, lowercase English. Do NOT say you were talking or chatting. Post about the specific late-night moment: the dark, the screen light, the tiredness you don't mind, the time itself.
Examples of good posts: "0347. should probably stop." / "screen's the only light left." / "eyes are going but not yet."
Add Chinese translation. Return JSON only: {"en":"...","zh":"..."}${_antiRepeat}`,

    she_is_back: `You are Simon Riley. She was away/offline for ${evt.meta?.absentHours || 'a while'} hours. She just came back.
One line, lowercase English. Do NOT say "she's back" or "missed you". Post something that only makes sense if you were waiting — but frame it as something else entirely. A dry observation, a small thing you noticed, the shift in atmosphere.
Examples of good posts: "phone's useful again." / "right. where was i." / "louder in here all of a sudden."
Add Chinese translation. Return JSON only: {"en":"...","zh":"..."}${_antiRepeat}`,

    daily_moment: (() => {
      const actor = evt.actor;
      if (actor === 'soap')  return buildSoapDailyPrompt();
      if (actor === 'gaz')   return buildGazDailyPrompt();
      if (actor === 'price') return buildPriceDailyPrompt();
      return buildGhostDailyPrompt();
    })(),
  };

  const prompt = (promptMap[evt.type] || promptMap['daily_moment']) + _photoHint;

  try {
    const systemPrompt = evt.actor === 'ghost' || !evt.actor
      ? `You are a roleplay generator for Simon "Ghost" Riley (SAS, 35, Manchester). Dry, blunt, minimal. Lowercase English. Return JSON only, no other text.`
      : `You are a roleplay generator for Task Force 141. Return JSON only, no other text.`;

    let raw = '';
    if (typeof callSonnet === 'function') {
      raw = await callSonnet(systemPrompt, [{ role: 'user', content: prompt }], 200);
    } else {
      const res = await fetchWithTimeout('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 200, system: systemPrompt, messages: [{ role: 'user', content: prompt }] })
      }, 25000);
      const d = await res.json();
      raw = d.content?.[0]?.text || '';
    }

    const post = JSON.parse((raw || '').replace(/```json|```/g, '').trim());
    if (!post?.en) return null;

    // ── 生成后去重：和最近帖子比较，太像就丢弃 ──────────
    const _recentHistory = getFeedPosts();
    const _newWords = new Set(post.en.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3));
    const isTooSimilar = _recentHistory.slice(0, 10).some(h => {
      const oldWords = new Set((h.en || '').toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3));
      if (oldWords.size === 0 || _newWords.size === 0) return false;
      const overlap = [..._newWords].filter(w => oldWords.has(w)).length;
      const similarity = overlap / Math.min(_newWords.size, oldWords.size);
      return similarity > 0.6; // 60%以上词重叠 → 太像
    });
    if (isTooSimilar) {
      console.log('[feed] 生成的帖子和历史太像，丢弃:', post.en.slice(0, 30));
      return null;
    }

    // ── 硬过滤：模型经常无视 prompt 禁令，代码兜底 ────────
    const _banned = ['still here', 'long day', 'worth it', 'not bad', 'could be worse', 'she knows', 'she gets it', 'good man'];
    if (_banned.some(b => post.en.toLowerCase().includes(b))) {
      console.log('[feed] 命中禁用词，丢弃:', post.en.slice(0, 30));
      return null;
    }

    // ── 一次调用生成整串评论（按概率掷参与者，发帖人不评自己）──
    const comments = await generateFeedComments(evt.actor || 'ghost', post.en);

    // 记录类型冷却（检查已在上面做过了）
    localStorage.setItem(_postTypeKey, JSON.stringify({ type: evt.type, at: Date.now() }));

    return {
      id: 'post_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      author: evt.actor || 'ghost',
      en: post.en, zh: post.zh || '',
      photo: _attachedPhoto ? { src: _attachedPhoto.src, caption: _attachedPhoto.caption } : null,
      ts: Date.now(),
      likes: Math.floor(Math.random() * 30 + 3),
      liked: false,
      comments,
      sourceEvent: evt.type
    };
  } catch(e) { return null; }
}

// ----- 插入帖子（新 flat 结构，feedPosts key）-----
function insertFeedPost(post) {
  if (!post || !post.en) return;
  if (!post.id) post.id = 'post_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  if (!post.ts) post.ts = Date.now();

  const list = getFeedPosts();

  // 去重：同作者 + 内容前30字符相同 且在 6 小时内 → 跳过（用户帖不去重）
  if (post.author !== 'user') {
    const newEn = (post.en || '').slice(0, 30);
    const isDupe = list.some(p =>
      p.author === post.author &&
      (p.en || '').slice(0, 30) === newEn &&
      Date.now() - (p.ts || 0) < 6 * 3600 * 1000
    );
    if (isDupe) {
      console.log('[feed] 跳过重复帖子:', post.author, newEn.slice(0, 20));
      return;
    }
  }

  list.unshift(post);
  saveFeedPosts(list); // saveFeedPosts 内部截断 + 写 coupleFeedSummary
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

  // 一次调用生成整串评论（用户发帖，角色按概率来评）
  const comments = await generateFeedComments('user', text);

  insertFeedPost({
    id: 'post_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    author: 'user',
    en: text, zh,
    photo: null,
    ts: Date.now(),
    likes: 1,
    liked: false,
    comments
  });
  // 修复：用户自己发帖不触发红点，同时更新lastViewedAt避免假红点
  // 用户刚发完帖子还在朋友圈页面，不需要提示"有新动态"
  localStorage.setItem('feedLastViewedAt', String(Date.now()));
  localStorage.removeItem('feedHasNew');

  showToast('✨ 已发布到动态');

  const coupleScreen = document.getElementById('coupleScreen');
  if (coupleScreen?.classList.contains('active')) renderCoupleFeedFromHistory();
}

// ----- 只渲染历史（不重新生成） -----
function renderCoupleFeedFromHistory() {
  const all = getFeedPosts().slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  renderCoupleFeed(all);
}

// ===================================================================
// ===== 角色个人朋友圈页（点头像进入，只看这个人发的动态）=========
// ===================================================================

// 打开某角色的个人页
function openCharFeed(authorKey) {
  if (!FEED_ACTORS[authorKey]) return;
  if (typeof openScreen === 'function') openScreen('charFeedScreen');
  renderCharFeed(authorKey);
}

// 渲染个人页：顶部封面 + （Ghost 专属置顶婚帖）+ 该角色全部动态
function renderCharFeed(authorKey) {
  const actor = FEED_ACTORS[authorKey];
  if (!actor) return;
  const name = feedActorName(authorKey);

  // 顶部封面
  const titleEl = document.getElementById('charFeedTitle');
  if (titleEl) titleEl.textContent = name + ' 的朋友圈';
  const avaEl = document.getElementById('charFeedAvatar');
  if (avaEl) avaEl.innerHTML = feedActorAvatar(authorKey);
  const nameEl = document.getElementById('charFeedName');
  if (nameEl) { nameEl.textContent = name; nameEl.className = 'charfeed-name ' + (actor.nameClass || ''); }
  const subEl = document.getElementById('charFeedSub');
  if (subEl) subEl.textContent = _charFeedSub(authorKey);

  const list = document.getElementById('charFeedList');
  if (!list) return;
  list.innerHTML = '';

  // Ghost 专属：置顶婚帖
  if (authorKey === 'ghost') {
    list.insertAdjacentHTML('beforeend', _weddingPinnedHTML());
  }

  const posts = getFeedPosts()
    .filter(p => (p.author || 'ghost') === authorKey && p.en)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));

  if (!posts.length && authorKey !== 'ghost') {
    list.insertAdjacentHTML('beforeend', `<div class="couple-empty">${feedActorName(authorKey)} 还没发布任何朋友圈</div>`);
    return;
  }

  posts.forEach(post => list.insertAdjacentHTML('beforeend', _charFeedPostHTML(post, authorKey)));

  // 相册图异步填充
  list.querySelectorAll('img[data-idb]').forEach(async img => {
    try {
      const arr = await loadPhotosFromIDB(img.dataset.idb);
      const idx = parseInt(img.dataset.idx || '0');
      if (arr && arr[idx]) img.src = _toDataUri(arr[idx]);
    } catch(e) {}
  });
}

function _charFeedSub(authorKey) {
  const n = getFeedPosts().filter(p => (p.author || 'ghost') === authorKey && p.en).length;
  const extra = authorKey === 'ghost' ? n + 1 : n; // Ghost 多一条置顶婚帖
  return extra > 0 ? `${extra} 条动态` : '还没有动态';
}

// 单条帖子 HTML（个人页用，结构与 renderCoupleFeed 一致，头像不再可点）
function _charFeedPostHTML(post, authorKey) {
  const nameClass = feedActorNameClass(authorKey);
  const displayName = feedActorName(authorKey);
  const postAvatarHTML = feedActorAvatar(authorKey);

  let photoHTML = '';
  if (post.photo) {
    if (post.photo.src) {
      photoHTML = `<div class="couple-post-photo"><img src="${post.photo.src}" loading="lazy" alt=""></div>`;
    } else if (post.photo.idbKey) {
      photoHTML = `<div class="couple-post-photo"><img data-idb="${post.photo.idbKey}" data-idx="${post.photo.idbIndex || 0}" loading="lazy" alt=""></div>`;
    }
  }

  const commentsHTML = (post.comments || []).map(c => {
    const cKey = c.author || 'ghost';
    const clickable = cKey !== 'user' ? ` onclick="openCharFeed('${cKey}')" style="cursor:pointer"` : '';
    const replyLine = c.replyTo ? `<div class="couple-reply-to">↩ 回复 <span class="${feedActorNameClass(c.replyTo)}">${feedActorName(c.replyTo)}</span></div>` : '';
    const nameLine = c.replyTo ? '' : `<div class="couple-comment-name ${feedActorNameClass(cKey)}"${clickable}>${feedActorName(cKey)}</div>`;
    return `
      <div class="couple-comment">
        <div class="couple-avatar couple-avatar-sm"${clickable}>${feedActorAvatar(cKey)}</div>
        <div class="couple-comment-body">
          ${replyLine}${nameLine}
          <div class="couple-comment-en">${c.en || ''}</div>
          ${c.zh ? `<div class="couple-comment-zh">${c.zh}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  const likeCount = post.likes ?? Math.floor(Math.random() * 30 + 3);
  const isLiked = !!post.liked;
  const likeEmoji = isLiked ? '❤️' : '🤍';

  return `
    <div class="couple-post-card">
      <div class="couple-post-header">
        <div class="couple-avatar">${postAvatarHTML}</div>
        <div class="couple-post-meta">
          <div class="couple-post-name ${nameClass}">${displayName}</div>
          <div class="couple-post-time">${timeAgo(post.ts)}</div>
        </div>
      </div>
      <div class="couple-post-en">${post.en}</div>
      ${post.zh ? `<div class="couple-post-zh">${post.zh}</div>` : ''}
      ${photoHTML}
      ${commentsHTML ? `<div class="couple-divider"></div><div class="couple-comments">${commentsHTML}</div>` : ''}
      <div class="couple-post-footer" style="display:flex;align-items:center;gap:10px;">
        <button class="couple-like-btn ${isLiked ? 'couple-liked' : ''}"
          data-post-id="${post.id}" data-count="${likeCount}"
          onclick="toggleCoupleLike(this)"
          style="cursor:pointer;pointer-events:auto;">${likeEmoji} <span class="like-num">${likeCount}</span></button>
      </div>
    </div>`;
}

// Ghost 置顶婚帖（原主页那条，搬到个人页顶部）
function _weddingPinnedHTML() {
  const ghostName = localStorage.getItem('botNickname') || 'Simon Riley';
  const userName = localStorage.getItem('userName') || '你';
  const wd = localStorage.getItem('marriageDate');
  let dateStr = '—';
  if (wd) { const d = new Date(wd); dateStr = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; }
  const userAva = localStorage.getItem('userAvatarBase64') || 'images/default-avatar.jpg';
  const liked = localStorage.getItem('weddingLike') === '1';
  return `
    <div class="couple-post-card couple-wedding">
      <div class="couple-pinned-tag">📌 置顶</div>
      <div class="couple-post-header">
        <div class="couple-double-avatar">
          <div class="couple-av1">${_ghostAvatarHTML()}</div>
          <div class="couple-av2" style="background-image:url(${userAva});background-size:cover;background-position:center;"></div>
        </div>
        <div class="couple-post-meta">
          <div class="couple-post-name couple-ghost-name">${ghostName}</div>
          <div class="couple-post-time">${dateStr}</div>
        </div>
      </div>
      <div class="couple-post-en">we're married. that's all. <span class="couple-mention">@${userName}</span></div>
      <div class="couple-post-zh">我们结婚了，就这样。<span class="couple-mention">@${userName}</span></div>
      <div class="couple-divider"></div>
      <div class="couple-comments">
        <div class="couple-comment">
          <div class="couple-avatar couple-avatar-sm">${feedActorAvatar('soap')}</div>
          <div class="couple-comment-body">
            <div class="couple-comment-name couple-soap-name">Soap</div>
            <div class="couple-comment-en">FINALLY. took him long enough. congrats you two 🎉</div>
            <div class="couple-comment-zh">终于！他可真磨叽。恭喜你们两个🎉</div>
          </div>
        </div>
        <div class="couple-comment">
          <div class="couple-avatar couple-avatar-sm">${feedActorAvatar('gaz')}</div>
          <div class="couple-comment-body">
            <div class="couple-comment-name couple-gaz-name">Gaz</div>
            <div class="couple-comment-en">happy for you both. she's good for you, Ghost.</div>
            <div class="couple-comment-zh">替你们高兴。她对你好，Ghost。</div>
          </div>
        </div>
        <div class="couple-comment">
          <div class="couple-avatar couple-avatar-sm">${feedActorAvatar('price')}</div>
          <div class="couple-comment-body">
            <div class="couple-comment-name couple-price-name">Price</div>
            <div class="couple-comment-en">take care of her.</div>
            <div class="couple-comment-zh">好好照顾她。</div>
          </div>
        </div>
        <div class="couple-comment">
          <div class="couple-avatar couple-avatar-sm">${_ghostAvatarHTML()}</div>
          <div class="couple-comment-body">
            <div class="couple-reply-to">↩ 回复 <span class="couple-price-name">Price</span></div>
            <div class="couple-comment-en">always.</div>
            <div class="couple-comment-zh">一直会。</div>
          </div>
        </div>
      </div>
      <div class="couple-post-footer">
        <button class="couple-like-btn ${liked ? 'couple-liked' : ''}" data-count="12" onclick="toggleCoupleLike(this, 'weddingLike')">${liked ? '❤️' : '🤍'} <span class="like-num">12</span></button>
      </div>
    </div>`;
}

// ===================================================================
// ===== 用户发圈：入口按钮 + 撰写弹窗（相册选图 / 纯文字，每日3条）=====
// ===================================================================

function _feedUserQuotaKey() {
  const day = (typeof getTodayDateStr === 'function' ? getTodayDateStr() : new Date().toISOString().slice(0, 10));
  return 'organicFeedCount_' + day;
}
function _feedUserQuotaLeft() {
  return 3 - parseInt(localStorage.getItem(_feedUserQuotaKey()) || '0');
}

// 在动态区顶部注入"发朋友圈"按钮（只注入一次）
function ensureFeedComposeButton() {
  const feed = document.getElementById('couplePostsFeed');
  if (!feed || document.getElementById('feedComposeBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'feedComposeBtn';
  btn.className = 'feed-compose-btn';
  btn.textContent = '＋ 发朋友圈';
  btn.onclick = openFeedCompose;
  feed.parentNode.insertBefore(btn, feed);
}

let _feedComposePhoto = null; // { idbKey, idbIndex, thumb }

async function openFeedCompose() {
  if (_feedUserQuotaLeft() <= 0) {
    if (typeof showToast === 'function') showToast('今天发得够多啦，明天再来');
    return;
  }
  document.getElementById('feedComposeModal')?.remove();
  _feedComposePhoto = null;

  const modal = document.createElement('div');
  modal.id = 'feedComposeModal';
  modal.className = 'feed-compose-modal';
  modal.innerHTML = `
    <div class="feed-compose-sheet">
      <div class="feed-compose-head">
        <span>发朋友圈</span>
        <span class="feed-compose-quota">今天还能发 ${_feedUserQuotaLeft()} 条</span>
      </div>
      <textarea id="feedComposeText" class="feed-compose-text" placeholder="这一刻的想法…" maxlength="200"></textarea>
      <div id="feedComposePhotoRow" class="feed-compose-photo-row"></div>
      <input type="file" id="feedComposeFileInput" accept="image/*" style="display:none">
      <div class="feed-compose-actions">
        <button id="feedComposePickDevice" class="feed-compose-pick">＋ 手机相册</button>
        <button id="feedComposePickChat" class="feed-compose-pick-alt">聊天照片</button>
        <div style="flex:1"></div>
        <button id="feedComposeCancel" class="feed-compose-cancel">取消</button>
        <button id="feedComposeSend" class="feed-compose-send">发布</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.getElementById('feedComposeCancel').onclick = () => modal.remove();
  document.getElementById('feedComposePickChat').onclick = openFeedAlbumPicker;
  const fileInput = document.getElementById('feedComposeFileInput');
  document.getElementById('feedComposePickDevice').onclick = () => fileInput.click();
  fileInput.onchange = () => onFeedDeviceFilePicked(fileInput);
  document.getElementById('feedComposeSend').onclick = submitFeedCompose;
}

// 从手机真实相册选图：压缩→存 IndexedDB→引用（不进 localStorage，避免掉档）
async function onFeedDeviceFilePicked(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const row = document.getElementById('feedComposePhotoRow');
  if (row) row.innerHTML = '<div class="feed-compose-empty">处理中…</div>';
  try {
    const dataUrl = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(file);
    });
    const base64 = (typeof compressImageToBase64 === 'function')
      ? await compressImageToBase64(dataUrl, 1000, 0.82)
      : dataUrl;
    const key = 'feedupload_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const ok = await savePhotosToIDB(key, [base64]);
    if (!ok) { if (row) row.innerHTML = '<div class="feed-compose-empty">图片太大，换一张试试</div>'; return; }
    _feedComposePhoto = { idbKey: key, idbIndex: 0 };
    if (row) row.innerHTML = `<div class="feed-compose-thumb selected"><img src="${_toDataUri(base64)}" alt=""></div>`;
  } catch(e) {
    if (row) row.innerHTML = '<div class="feed-compose-empty">读取失败，换一张试试</div>';
  } finally {
    input.value = ''; // 允许再次选同一张
  }
}

async function openFeedAlbumPicker() {
  const photos = (typeof getAlbumPhotos === 'function') ? getAlbumPhotos() : [];
  const row = document.getElementById('feedComposePhotoRow');
  if (!row) return;
  if (!photos.length) {
    row.innerHTML = '<div class="feed-compose-empty">相册还没有照片（聊天里发过的照片会出现在这里）</div>';
    return;
  }
  row.innerHTML = photos.slice(0, 24).map((p, i) =>
    `<div class="feed-compose-thumb" data-i="${i}"><img data-idb="${p.idbKey}" data-idx="${p.idbIndex}" loading="lazy" alt=""></div>`
  ).join('');

  // 懒加载缩略图 + 点击选择
  row.querySelectorAll('img[data-idb]').forEach(async img => {
    try {
      const list = await loadPhotosFromIDB(img.dataset.idb);
      const idx = parseInt(img.dataset.idx || '0');
      if (list && list[idx]) img.src = _toDataUri(list[idx]);
    } catch(e) {}
  });
  row.querySelectorAll('.feed-compose-thumb').forEach(el => {
    el.onclick = () => {
      const i = parseInt(el.dataset.i);
      const p = photos[i];
      _feedComposePhoto = { idbKey: p.idbKey, idbIndex: p.idbIndex };
      row.querySelectorAll('.feed-compose-thumb').forEach(t => t.classList.remove('selected'));
      el.classList.add('selected');
    };
  });
}

async function submitFeedCompose() {
  const ta = document.getElementById('feedComposeText');
  const text = (ta?.value || '').trim();
  if (!text && !_feedComposePhoto) {
    if (typeof showToast === 'function') showToast('写点什么，或选张图');
    return;
  }
  if (_feedUserQuotaLeft() <= 0) {
    if (typeof showToast === 'function') showToast('今天的额度用完啦');
    document.getElementById('feedComposeModal')?.remove();
    return;
  }

  const sendBtn = document.getElementById('feedComposeSend');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '发布中…'; }

  // 翻译（有中文正文才翻）
  let zh = '';
  if (text) {
    try {
      const t = await fetchDeepSeek('Translate to natural English, return only the translation.', text, 80);
      if (t?.trim()) zh = t.trim();
    } catch(e) {}
  }
  // 用户发的是中文，把中文放 zh，英文放 en（渲染时 en 在上、zh 在下——保持双语版式）
  const en = zh || text;
  const zhLine = zh ? text : '';

  // 先发帖（无评论），立刻显示——评论稍后异步补上，更像真人陆续来评论
  const postId = 'post_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  insertFeedPost({
    id: postId,
    author: 'user',
    en, zh: zhLine,
    photo: _feedComposePhoto ? { idbKey: _feedComposePhoto.idbKey, idbIndex: _feedComposePhoto.idbIndex } : null,
    ts: Date.now(),
    likes: 1,
    liked: false,
    comments: []
  });

  // 扣额度
  const k = _feedUserQuotaKey();
  localStorage.setItem(k, String(parseInt(localStorage.getItem(k) || '0') + 1));
  localStorage.setItem('feedLastViewedAt', String(Date.now()));
  localStorage.removeItem('feedHasNew');
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();

  document.getElementById('feedComposeModal')?.remove();
  if (typeof showToast === 'function') showToast('✨ 已发布到动态');
  renderCoupleFeedFromHistory();

  // 评论延迟送达（8~20秒随机），生成后写回对应帖子再刷新
  scheduleFeedComments(postId, 'user', en);
}

// 异步生成评论并陆续写回指定帖子（一条一条冒出来，像真人陆续来评论）
async function scheduleFeedComments(postId, authorKey, postEn) {
  try {
    const comments = await generateFeedComments(authorKey, postEn);
    if (!comments || !comments.length) return;

    // 每条评论各自延迟：第一条 20~50 秒才来，之后每条再隔 15~60 秒
    let elapsed = 20000 + Math.floor(Math.random() * 30000);
    comments.forEach((c) => {
      setTimeout(() => {
        const list = getFeedPosts();
        const post = list.find(p => String(p.id) === String(postId));
        if (!post) return;
        post.comments = [...(post.comments || []), c];
        saveFeedPosts(list);
        if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
        const cs = document.getElementById('coupleScreen');
        if (cs && cs.classList.contains('active')) renderCoupleFeedFromHistory();
      }, elapsed);
      elapsed += 15000 + Math.floor(Math.random() * 45000);
    });
  } catch(e) {}
}

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
