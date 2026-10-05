// ===== 情侣空间 + 朋友圈系统 (feed.js) =====
function switchCoupleTab(tab) {
  document.getElementById('panelFeed').style.display = tab === 'feed' ? '' : 'none';
  // 回忆 Tab 已退役，不再切换
  document.getElementById('tabFeed').classList.toggle('active', tab === 'feed');
  if (tab === 'feed') {
    // 看了朋友圈就清红点
    localStorage.removeItem('feedHasNew');
    localStorage.setItem('feedLastViewedAt', String(Date.now()));
    const _b = document.getElementById('feedNewBadge');
    if (_b) _b.style.display = 'none';
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 回忆系统已退役
// Love Space 只保留「动态」，纪念历史统一在「我们的纪念册」管理
// 以下函数保留空壳防止调用报错，实际不再渲染任何内容
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildSharedMemories() {
  return [];
}

function getRelationshipStage(days) {
  return { name: '', desc: '' };
}

function renderSharedMemories() {
  // 已退役，不再渲染
}

function renderMemoryCard(m, isHighlight) {
  return '';
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
    // 从没看过朋友圈：只有"本次会话真发过帖"才亮红点（Ghost 刚发了新的）；
    // 否则是换设备/清缓存后的历史帖子，抹掉防假红点。
    let postedThisSession = false;
    try { postedThisSession = sessionStorage.getItem('feedPostedThisSession') === '1'; } catch(e) {}
    if (postedThisSession) {
      badge.style.display = 'block';
    } else {
      localStorage.removeItem('feedHasNew');
      badge.style.display = 'none';
    }
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
  ghost: { key: 'ghost', displayName: () => localStorage.getItem('botNickname') || 'Simon Riley', emoji: '👻', nameClass: 'couple-ghost-name', commentChance: 0.6  },
  soap:  { key: 'soap',  displayName: () => 'Soap',  emoji: '🧼',  avatar: 'images/soap-avatar.jpg',  nameClass: 'couple-soap-name',  commentChance: 0.45 },
  gaz:   { key: 'gaz',   displayName: () => 'Gaz',   emoji: '🎖️', avatar: 'images/gaz-avatar.jpg',   nameClass: 'couple-gaz-name',   commentChance: 0.35 },
  price: { key: 'price', displayName: () => 'Price', emoji: '🚬',  avatar: 'images/price-avatar.jpg', nameClass: 'couple-price-name', commentChance: 0.15 },
};

// 给远程头像 URL 加缓存破除参数（本地文件/base64 不动），避免换头像后浏览器还显示旧图
function _bustAvatarCache(url) {
  if (!url || url.startsWith('data:') || url.startsWith('images/')) return url;
  const stamp = localStorage.getItem('ghostAvatarUpdatedAt') || '';
  return stamp ? `${url}${url.includes('?') ? '&' : '?'}t=${stamp}` : url;
}
// Ghost 头像 HTML（永远读最新头像）
// 优先正式 URL；上传未完成/失败时读 base64 备份，跟封面和资料页一致，避免朋友圈还显示旧头像
function _ghostAvatarHTML() {
  const url = localStorage.getItem('ghostAvatarUrl');
  if (url && !url.startsWith('data:')) {
    return `<img src="${_bustAvatarCache(url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  }
  const b64 = localStorage.getItem('ghostAvatarBase64');
  const src = url || (b64 ? _toDataUri(b64) : 'images/ghost-avatar.jpg');
  return `<img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
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
  const eligible = pool.filter(p => p.poster === authorKey || p.poster === 'any');
  if (!eligible.length) return null;
  const recent = JSON.parse(localStorage.getItem('feedPhotoRecent') || '[]');
  let candidates = eligible.filter(p => !recent.includes(p.file));
  if (!candidates.length) candidates = eligible; // 都用过了就放开
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  const newRecent = [chosen.file, ...recent].slice(0, 12);
  localStorage.setItem('feedPhotoRecent', JSON.stringify(newRecent));
  return {
    src: chosen.file,
    caption: chosen.caption,
    subject: chosen.subject || null,
    scene: chosen.scene || null,
    perspective: chosen.perspective || null
  };
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

  // V2 UI 初始化
  initLovespaceHero();
  initLovespaceComposer();

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
    if (!post || (!post.en && !post.photo)) return; // BUG-6：允许纯图片帖（无正文）渲染
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
    const likeEmoji = isLiked ? '♥' : '♡';

    // 翻译按钮：默认隐藏翻译，点击展开/收起
    const hasTranslation = !!(post.zh || (post.comments && post.comments.some(c => c.zh)));
    const translateBtn = hasTranslation ? `<button class="couple-translate-btn" onclick="toggleFeedTranslation(this)">译</button>` : '';

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
      ${post.en ? `<div class="couple-post-en">${post.en}</div>` : ''}
      ${post.zh ? `<div class="couple-post-zh">${post.zh}</div>` : ''}
      ${photoHTML}
      ${commentsHTML ? `<div class="couple-divider"></div><div class="couple-comments">${commentsHTML}</div>` : ''}
      <div class="couple-post-footer">
        <button class="couple-like-btn ${isLiked ? 'couple-liked' : ''}"
          data-post-id="${post.id}" data-count="${likeCount}"
          style="cursor:pointer;pointer-events:auto;">${likeEmoji} <span class="like-num">${likeCount}</span></button>
        ${translateBtn}
        ${authorKey === 'user' ? `<button class="couple-delete-btn" data-post-id="${post.id}" style="cursor:pointer;pointer-events:auto;">🗑️ 删除</button>` : ''}
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

  // 绑定删除按钮事件
  feed.querySelectorAll('.couple-delete-btn').forEach(btn => {
    btn.onclick = () => deleteCoupleFeedPost(btn.dataset.postId);
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
    btn.innerHTML = (post.liked ? '♥' : '♡') + ' <span class="like-num">' + post.likes + '</span>';
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
    btn.innerHTML = '♡ <span class="like-num">' + count + '</span>';
  } else {
    localStorage.setItem(storageKey, '1');
    count = count + 1;
    btn.dataset.count = count;
    btn.classList.add('couple-liked');
    btn.innerHTML = '♥ <span class="like-num">' + count + '</span>';
  }
}

// 翻译展开/收起
function toggleFeedTranslation(btn) {
  const card = btn.closest('.couple-post-card');
  if (!card) return;

  // 切换正文翻译
  const postZh = card.querySelector('.couple-post-zh');
  if (postZh) postZh.classList.toggle('show');

  // 切换所有评论翻译
  card.querySelectorAll('.couple-comment-zh').forEach(el => el.classList.toggle('show'));

  // 更新按钮文字
  const isShowing = postZh && postZh.classList.contains('show');
  btn.textContent = isShowing ? '收起' : '译';
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

  // 幂等：如果已存在相同 source + sourceId，不重复创建
  if (event.source && event.sourceId) {
    const exists = pool.some(e => e.source === event.source && e.sourceId === event.sourceId);
    if (exists) {
      console.log('[feed] Event already exists:', event.source, event.sourceId);
      return;
    }
  }

  pool.unshift({
    id: 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    type: event.type,
    actor: event.actor || 'ghost',
    intensity: event.intensity ?? 2,
    mood: event.mood || 'neutral',
    shareability: event.shareability ?? 0.5,
    privacy: event.privacy || 'semi',
    createdAt: Date.now(),
    occurredAt: event.occurredAt || null,
    dueAt: event.dueAt || Date.now(),
    expiresAt: event.expiresAt || (Date.now() + 12 * 3600 * 1000),
    consumed: false,
    source: event.source || null,
    sourceId: event.sourceId || null,
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
// ── 已退役：feedEvent_dailyMoment() ──────────────────────────────────
// 旧机制：sendMessage.js 在用户长对话后调用此函数随机创建 Ghost/Soap/Gaz daily_moment。
// 新原则：Ghost 不再由系统随机生成虚构生活事件。NPC ambient 改由 maybeGenerateAmbientPost()
// 低频触发，不再依赖此入口。函数保留但不应被调用；若被调用则只生成 NPC ambient 候选。
function feedEvent_dailyMoment() {
  // Ghost 已退役，仅创建 NPC ambient 候选
  const npcActors = ['soap', 'gaz', 'price'];
  const actor = npcActors[Math.floor(Math.random() * npcActors.length)];
  pushFeedEvent({
    type: 'daily_moment', actor,
    mood: 'neutral', intensity: 1, shareability: 0.4, privacy: 'public',
    dueAt: Date.now(),
    expiresAt: Date.now() + 6 * 3600 * 1000
  });
}

// ── 新增事件类型 ──────────────────────────────────

// 收到外卖：Ghost 发条关于食物的帖子
function feedEvent_takeoutReceived(itemName, itemNameEn, orderId, occurredAt) {
  pushFeedEvent({
    type: 'takeout_received', actor: 'ghost', mood: 'neutral',
    intensity: 2, shareability: 0.4, privacy: 'semi',
    occurredAt: occurredAt || Date.now(),
    dueAt: Date.now() + randMinutes(15, 60),
    expiresAt: Date.now() + 4 * 3600 * 1000,
    source: 'takeout',
    sourceId: orderId,
    meta: { itemName, itemNameEn }
  });
}

// 收到快递包裹：Ghost 发条关于包裹的帖子
function feedEvent_deliveryReceived(itemName, emoji, deliveryId, occurredAt) {
  pushFeedEvent({
    type: 'delivery_received', actor: 'ghost', mood: 'soft',
    intensity: 3, shareability: 0.5, privacy: 'semi',
    occurredAt: occurredAt || Date.now(),
    dueAt: Date.now() + randMinutes(20, 90),
    expiresAt: Date.now() + 8 * 3600 * 1000,
    source: 'delivery',
    sourceId: deliveryId,
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
// 纯本地、无副作用的资格检查：现在允许不允许执行"用户要求 Ghost 发帖"。
// 只读取 localStorage 时间戳，不写 timestamp、不发帖、不调 API、不消耗次数。
// sendMessage 主回复阶段和 handleUserFeedRequest 执行阶段共用这一个 source of truth，
// 避免两边各写一份 6 * 3600 * 1000 之后漂移。
const USER_FEED_REQ_COOLDOWN = 6 * 3600 * 1000;
function getUserFeedRequestAvailability() {
  const lastReqAt = parseInt(localStorage.getItem('lastUserFeedReqAt') || '0');
  if (lastReqAt && Date.now() - lastReqAt < USER_FEED_REQ_COOLDOWN) {
    return { allowed: false, reason: 'cooldown', remainingMs: USER_FEED_REQ_COOLDOWN - (Date.now() - lastReqAt) };
  }
  return { allowed: true, reason: null, remainingMs: 0 };
}

async function handleUserFeedRequest(userText = '') {
  // 限次：两条"用户要求发"之间至少隔 6 小时（防止一直让他发）。
  // 用独立 key，不和他自己发的日常动态互相干扰。
  const _avail = getUserFeedRequestAvailability();

  // 冷却期内 → Ghost 拒绝
  if (!_avail.allowed) {
    const declines = [
      "no. i don't post that much.",
      "one's my limit. you know that.",
      "not doing two this close. don't start.",
      "already posted. once is enough for now.",
      "said what i had to say already.",
      "not doing two so close together.",
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
  const GHOST_AV = _ghostAvatarHTML();

  // 取历史帖子做反重复
  const _recentPosts = getFeedPosts()
    .filter(p => p.author === 'ghost')
    .slice(0, 6).map(p => `"${p.en}"`).join('\n');

  // 口气：跟着表达风格轴走。她定"要发什么"，他定"怎么说"。
  const toneLine = _banter >= 50
    ? `Your mood is warmer lately — you can admit it fairly straight, still dry, no theatrics. A little "fine, she wins" honesty is fine.`
    : _banter <= -50
    ? `You're in a stubborn, teasing mood — do it, but grudgingly. Mock-annoyed, act like it's costing you, admit it sideways. The affection hides under the complaint.`
    : `Do it your usual way — dry, understated, a bit reluctant but not cold.`;

  try {
    const systemPrompt = `You are Simon "Ghost" Riley. She asked you to post something on your feed. You wouldn't normally, but you do it — your way. Dry, minimal, lowercase English. ${_feedDistanceRule()} Return JSON only.`;
    const userPrompt = `She just asked you to post on your feed. Her exact request:
"${(userText || '').slice(0, 200)}"

What you two were just talking about:
${recentChat || '(nothing specific)'}

Location: ${location}

RULE: She controls WHAT you have to say (the point she's making you make). You control HOW you say it. If she's making you admit something (lost a bet, owe her, etc.), the admission has to actually land — don't dodge the point — but phrase it as yourself, never word-for-word what she told you to write.

${toneLine}

Write one post. One line. Don't quote her. Don't explain the backstory. It should read like something only the two of you fully get, but the thing she wanted admitted is clearly in there.

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
    localStorage.setItem('lastUserFeedReqAt', String(Date.now()));
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

  // 用户侧事件：旧版"系统主动弹窗让用户选文案发布"机制已退役。
  // 新版 Feed 已有完整的用户自主发帖入口，这里只消费掉事件、不再弹窗。
  if (chosen.actor === 'user') {
    consumeFeedEvent(chosen.id);
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

// ----- 兜底日常路过（NPC ambient only，Ghost 退役）-----
function _pickWeightedActor() {
  const npcActors = [
    { key: 'soap', weight: 3 },
    { key: 'gaz', weight: 2 },
    { key: 'price', weight: 1 }
  ];
  const total = npcActors.reduce((s, a) => s + a.weight, 0);
  let r = Math.random() * total;
  for (const a of npcActors) {
    r -= a.weight;
    if (r <= 0) return a.key;
  }
  return 'soap';
}

async function maybeGenerateAmbientPost(triggerSource) {
  const todayKey = 'ambientFeedCount_' + getTodayDateStr();
  const count = parseInt(localStorage.getItem(todayKey) || '0');
  if (count >= 2) return null;
  const chance = triggerSource === 'open_couple_space' ? 0.2 : 0.08;
  if (Math.random() > chance) return null;

  // NPC ambient only（Ghost 随机 daily_moment 已退役）
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

// 核心铁律：当下绝不"同处一室"（恒定）。"是否见过面"跟着 metInPerson 存档走，
// 与主模型 persona.js / 内心 OS innerThought.js 保持一致，避免朋友圈永远咬死"没见过面"。
function _feedDistanceRule() {
  const met = localStorage.getItem('metInPerson') === 'true';
  const metLine = met
    ? `Ghost and his wife HAVE met in person — she travelled to the UK to see him once, and that memory is real. Teammates may acknowledge the meeting happened if it fits (e.g. a dry "good to finally see you two in the same room"). BUT that was a visit — she has since gone home to her own country. Day-to-day they are still LONG-DISTANCE.`
    : `They are married but LONG-DISTANCE and have NEVER met in person. Do NOT write or imply the meeting has already happened.`;
  return `CORE FACT — never violate: Ghost is at Hereford Base in the UK. His wife lives in another country. ${metLine}
RIGHT NOW she is NOT physically at the base, not in the room, not beside him, not within sight or reach — this present-moment separation holds no matter what. Every current connection is across the distance — phone, screen, messages, time zones. Do NOT write or imply she is present, standing there, arriving, or that anyone can see or touch her at this moment.
This holds even when a post sounds domestic or cozy (boots off, at the door, kettle on, quiet flat). A homey detail is HIM alone on his side of the distance — it never means she is there with him. Teammates commenting must NEVER imply she is in the room right now, at his side, keeping him company, or that they can see the two of them together at this moment. If a teammate references her at all, it is across the distance (she's texting him, he's on his phone to her, she's a time zone away) — never co-located.`;
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
async function generateFeedComments(postAuthorKey, postEn, photoDescription) {
  const commenters = _rollFeedCommenters(postAuthorKey);
  if (!commenters.length) return [];

  // BUG-6：图片帖把一次性生成的客观图片描述作为附加视觉上下文传进来。
  // 这是模型能理解的"图里客观有什么"，不是用户 caption，也不替角色做情绪/关系判断。
  const _photoBlock = photoDescription
    ? `\nAttached photo (objective visual description of the image, this is NOT the poster's own words): "${photoDescription}"`
    : '';

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

  // BUG-2：发帖人是角色时，其真实身份由 actor key 决定（复用 _FEED_PERSONA），
  // authorName 走的是 feedActorName → 可能是用户自定义昵称（botNickname，如 "Babe"）。
  // 发帖人自己不在 commenters 里 → personaLines 不含发帖人身份，模型只能看到 "Babe [ghost]"，
  // 便可能按昵称瞎猜性别/身份（如 "lass"）。这里把权威身份显式补进 prompt，昵称只作显示。
  const authorPersona = _FEED_PERSONA[postAuthorKey];
  // BUG-6：纯图片帖 postEn 为空，caption 行标注"(no caption — photo only)"，
  // 让模型知道要围着图片描述评论，而不是当作没有任何上下文。
  const _captionText = postEn ? `"${postEn}"` : (photoDescription ? '(no caption — photo only)' : '""');
  const authorLine = isUserPost
    ? `Post by ${authorName} [user]: ${_captionText}${_photoBlock}`
    : `Post by [${postAuthorKey}] — real identity (authoritative, fixed by the actor key): ${authorPersona}
The display name shown for [${postAuthorKey}] is "${authorName}", which may just be a nickname the reader chose — it does NOT define who they are, their gender, or their persona. Use the identity above.
Post: ${_captionText}${_photoBlock}`;

  // 反编造铁律：模型爱在评论里瞎编生日日期/名字/数字（例如把"室友生日"当成她的生日，还编个"三月"）。
  // 只让它围着帖子本身说，需要引用她真实生日时用存档里的真值，没有就别提。
  const _uBday = localStorage.getItem('userBirthday') || '';
  const groundingRule = `GROUNDING — do NOT invent facts. Only reference details actually present in the post${photoDescription ? ' or in the attached photo description' : ''}. Do NOT state a specific date, month, name, number, or whose event it is unless the post itself says so. Read the post carefully: if it is about someone else (a roommate, a friend, a teammate), the event belongs to THAT person — never reattribute it to ${userName} or anyone else. If a birthday, anniversary, or figure is not stated in the post, do NOT make one up; react to the moment without naming a date.${_uBday ? ` (For reference only, if and ONLY if the post is explicitly about ${userName}'s OWN birthday: hers is ${_uBday}, month-day. Do not use this otherwise.)` : ''}`;

  // BUG-2：显示名可能是用户自定义昵称，绝不能据此推断人物身份/性别。actor key（方括号里的）才是权威。
  const identityRule = `IDENTITY — an actor's real identity is fixed by their bracketed key (e.g. [ghost] is Simon "Ghost" Riley, male), NOT by the display name shown next to it. A display name may be a nickname the reader chose (e.g. "Babe") and never changes who someone is, their gender, or their persona. When a display name and the key's identity seem to conflict, the key's identity wins. Do not guess anyone's gender or identity from a display name.`;
  const systemPrompt = `You generate a short Task Force 141 comment thread under a social post. ${contextLine} ${identityRule} ${_feedDistanceRule()} ${groundingRule} Each comment has English + Chinese. Comments react to the post and to each other, in character. React to the social intent of the post, not just its literal content. If she is joking, teasing, being sarcastic, or deliberately posting something silly, play along or react naturally in character. Do not explain the joke or treat it like a factual statement. A dry reaction, playful jab, or deadpan response is often better than praise. No emojis, no hashtags, no pet names (babe/honey/love), no OOC sweetness. Return JSON only.`;
  // 默认每条都是对帖子的一级评论。只有当某条评论确实在回应上面已出现的某位评论者时，
  // 模型才在该条给出 replyTo=对方 key；不再由代码按评论顺序强行串成回复链。
  const userPrompt = `${authorLine}

These teammates comment, in this order:
${personaLines}

By default each comment is a top-level reaction to the post. Only if a comment is genuinely responding to another teammate who already commented above it should it address that person — then set "replyTo" to that teammate's key for that comment. Most comments should react to the post, not to each other. Never reply to yourself, and never reply to someone who has not commented yet.
Return a JSON array only, same order, keys "key","en","zh" and optional "replyTo":
[{"key":"${commenters[0]}","en":"...","zh":"...","replyTo":"<key of the teammate this line answers, or omit for a top-level comment>"}]`;

  const valid = new Set(commenters);
  // 校验模型给出的 replyTo：只有指向"已经出现过的其他评论者"才保留，否则回退为一级评论。
  // list 是已按顺序生成的评论；idx 之前的 author 才算"已出现"。不允许 replyTo 自己/发帖人视为可选目标。
  const _validReplyTo = (list, author, idx) => {
    const t = list[idx]?.replyTo;
    if (!t || t === author) return undefined;                 // 无目标 / 回复自己 → 一级评论
    if (!list.slice(0, idx).some(c => c.author === t)) return undefined; // 目标不是"已出现的评论者" → 一级评论
    return t;                                                  // 回复帖子本身也归为一级评论（上面的切片天然排除 postAuthor）
  };

  const _genOnce = async () => {
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
    return arr
      .filter(c => c && c.en && valid.has(c.key))
      .slice(0, 3)
      .map(c => ({ author: c.key, en: c.en, zh: c.zh || '', replyTo: valid.has(c.replyTo) ? c.replyTo : undefined }));
  };

  // BUG-20 硬校验：拦评论里"帖子没提的日期性信息"。命中→丢弃→重试一次→还命中/仍失败→fallback。
  for (let attempt = 0; attempt < 2; attempt++) {
    let out;
    try { out = await _genOnce(); }
    catch (e) { continue; }
    if (!out.length) continue;
    if (out.some(c => _hasFabricatedDate(c.en, postEn))) {
      console.log('[feed] 评论编造日期，丢弃重试', attempt);
      continue;
    }
    out.forEach((c, i) => { c.replyTo = _validReplyTo(out, c.author, i); });
    return out;
  }
  return _fallbackChain();

  function _fallbackChain() {
    // 兜底文案是通用静态句，没有语义回复目标 → 一律一级评论，不再按顺序串成回复链。
    return commenters.map((k) => {
      const o = _FEED_FALLBACK[k]; const p = o[Math.floor(Math.random() * o.length)];
      return { author: k, en: p.en, zh: p.zh, replyTo: undefined };
    });
  }

  // 只拦"日期性信息"：帖子没提的月份 / 序数日 / MM-DD。纯计数（third time、two days）不拦。
  function _hasFabricatedDate(commentEn, sourceEn) {
    const c = (commentEn || '').toLowerCase();
    const src = (sourceEn || '').toLowerCase();

    // MM-DD（如 04-29 / 4/29），限定 1-12 月、1-31 日，避免误伤比分之类
    const mmdd = /\b(0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/g;
    for (const m of c.match(mmdd) || []) {
      if (!src.includes(m)) return true;
    }

    // 序数日：1st / 22nd / 3rd / 15th（帖子没出现这个序数就算编造）
    const ord = /\b\d{1,2}(?:st|nd|rd|th)\b/g;
    for (const m of c.match(ord) || []) {
      if (!src.includes(m)) return true;
    }

    // 月份：jan..dec 及全称。may/march 兼作动词/助动词，仅当评论里带日期语境词时才算。
    const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december','jan','feb','mar','apr','jun','jul','aug','sep','sept','oct','nov','dec'];
    const AMBIG = new Set(['may','march','mar']);
    const dateCtx = /\b(birthday|bday|anniversary|born|turns?|due|\d)\b/.test(c);
    for (const mon of MONTHS) {
      const re = new RegExp('\\b' + mon + '\\b');
      if (re.test(c) && !re.test(src)) {
        if (AMBIG.has(mon) && !dateCtx) continue;
        return true;
      }
    }
    return false;
  }
}


async function generateFeedPostFromEvent(evt) {
  const location   = localStorage.getItem('currentLocation') || 'Hereford Base';
  const weather    = localStorage.getItem('lastWeatherDisplay') || '';
  const GHOST_AV   = _ghostAvatarHTML();
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

  const buildSoapDailyPrompt = () => {
    const recentSoapPosts = getFeedPosts()
      .filter(p => p.author === 'soap')
      .slice(0, 6)
      .map(p => `"${p.en}"`)
      .join('\n');

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

Write a casual social post from your own ordinary life.

Choose what you want to post about yourself.
It can be specific, mundane, trivial, interesting, annoying, funny, observational, or simply something you felt like posting.

Do not invent an action, situation, or interaction involving Ghost, his wife, or another teammate just to create a subject for the post.
If the supplied context contains a real shared event, you may naturally use that fact. Otherwise, keep the post centered on yourself.

Do not force military/base life into every post.
Do not fall back to a fixed rotation of training, gear, food, coffee, weather, or work.

${recentSoapPosts ? `Recent posts are provided only to prevent repetition. Do NOT reuse wording, structure, or angle from these recent Soap posts:\n${recentSoapPosts}` : ''}

Return JSON only: {"en":"...","zh":"..."}`;
  };

  const buildGazDailyPrompt = () => {
    const recentGazPosts = getFeedPosts()
      .filter(p => p.author === 'gaz')
      .slice(0, 6)
      .map(p => `"${p.en}"`)
      .join('\n');

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

Write a casual social post from your own ordinary life.

Choose what you want to post about yourself.
It can be specific, mundane, trivial, interesting, annoying, funny, observational, or simply something you felt like posting.

Do not invent an action, situation, or interaction involving Ghost, his wife, or another teammate just to create a subject for the post.
If the supplied context contains a real shared event, you may naturally use that fact. Otherwise, keep the post centered on yourself.

Do not force military/base life into every post.
Do not fall back to a fixed rotation of training, gear, food, coffee, weather, or work.

${recentGazPosts ? `Recent posts are provided only to prevent repetition. Do NOT reuse wording, structure, or angle from these recent Gaz posts:\n${recentGazPosts}` : ''}

Return JSON only: {"en":"...","zh":"..."}`;
  };

  const buildPriceDailyPrompt = () => {
    const recentPricePosts = getFeedPosts()
      .filter(p => p.author === 'price')
      .slice(0, 6)
      .map(p => `"${p.en}"`)
      .join('\n');

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

Write a casual social post from your own ordinary life.

Choose what you want to post about yourself.
It can be specific, mundane, trivial, interesting, annoying, funny, observational, or simply something you felt like posting.

Do not invent an action, situation, or interaction involving Ghost, his wife, or another teammate just to create a subject for the post.
If the supplied context contains a real shared event, you may naturally use that fact. Otherwise, keep the post centered on yourself.

Do not force military/base life into every post.
Do not fall back to a fixed rotation of training, gear, food, coffee, weather, or work.

${recentPricePosts ? `Recent posts are provided only to prevent repetition. Do NOT reuse wording, structure, or angle from these recent Price posts:\n${recentPricePosts}` : ''}

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
    ? `\n\nYou are posting THIS photo:
Poster: ${_attachedPhoto.poster || evt.actor || 'ghost'}
Main subject in photo: ${_attachedPhoto.subject || 'none (environment/objects)'}
Perspective: ${_attachedPhoto.perspective || 'unknown'}
Objective visual description: "${_attachedPhoto.caption}"

Write the post AS THE CAPTION for that exact image — it must match what's in the picture, offhand, not a description. These are photo facts only; you decide the caption tone and what to say.`
    : '';

  const promptMap = {
    cold_war_started: `You are Simon Riley. Just had a fight with your wife. One line, lowercase English — something is off but you are not saying what. Be specific: mention a place, object, or body sensation. Do NOT write vague mood statements. Add Chinese translation. Return JSON only: {"en":"...","zh":"..."}${_antiRepeat}`,
    made_up:          `You are Simon Riley. Just made up with your wife. One line, lowercase English — do not say you made up, but you are visibly looser. Mention something concrete you're doing right now. Add Chinese translation. Return JSON only: {"en":"...","zh":"..."}${_antiRepeat}`,
    gift_received:    `You are Simon Riley. Just received "${evt.meta?.itemName || 'something'}" from your wife. One line, lowercase English — react to the specific object, not the gesture. What does it look like, feel like, smell like? Add Chinese translation. Return JSON only: {"en":"...","zh":"..."}${_antiRepeat}`,

    takeout_received: `You are Simon Riley. She ordered takeout for you — "${evt.meta?.itemNameEn || evt.meta?.itemName || 'food'}".
One line, lowercase English. React to the FOOD itself: the smell, the taste, the temperature, or how it looks. Be specific and concrete. Do NOT thank her, do NOT mention the gesture. Just the food.
Examples of good posts: "whoever made this curry knew what they were doing." / "still warm. she timed it." / "the chips are better than they should be."
Add Chinese translation. Return JSON only: {"en":"...","zh":"..."}${_antiRepeat}`,

    delivery_received: `You are Simon Riley. A package from her — "${evt.meta?.itemName || 'something'}".
One line, lowercase English. React to the OBJECT: what it looks like, where you put it, how it feels in your hands. Do NOT say thank you, do NOT get emotional about the gesture. Just notice the thing.
Examples of good posts: "fits. didn't expect that." / "it's on the desk now. keeps catching my eye." / "heavier than it looks."
Add Chinese translation. Return JSON only: {"en":"...","zh":"..."}${_antiRepeat}`,

    good_conversation: `You are Simon Riley. You just had a long conversation with your wife — ${evt.meta?.turnCount || 'many'} messages back and forth.${evt.meta?.hint ? ' Topic: ' + evt.meta.hint : ''}
One line, lowercase English. Do NOT mention the conversation directly. Post something that shows your state AFTER talking to her — what you're doing now, what you notice, how quiet it is. The post should feel like the afterglow of a good talk, without ever saying you talked.
Examples of good posts: "quiet again. not the bad kind." / "forgot what i was doing before that." / "three hours. felt like ten minutes."
Add Chinese translation. Return JSON only: {"en":"...","zh":"..."}${_antiRepeat}`,

    late_night_chat: `You are Simon Riley. You were talking to her late into the night.
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
      // Ghost random daily_moment 已退役，不应到达此分支
      console.warn('[feed] Ghost daily_moment triggered, should not happen');
      return null;
    })(),
  };

  // NOW + EVENT TIME context
  const now = Date.now();
  const ghostTimeStr = (typeof getGhostTimeStr === 'function') ? getGhostTimeStr() : '??:??';
  const ghostDateStr = getGhostDateStr();
  const ghostWeekday = getGhostWeekday();

  let timeContext = `\n\nCURRENT SHARED TIME
Ghost-local date: ${ghostWeekday}, ${ghostDateStr}
Ghost-local time: ${ghostTimeStr}`;

  // 真实 Shared Reality event 有 occurredAt，计算时间差并注入 EVENT TIME
  if (evt.occurredAt) {
    try {
      const ghostTZ = (typeof getGhostTimeZone === 'function') ? getGhostTimeZone() : 'Europe/London';
      const occurredTimeStr = new Intl.DateTimeFormat('en-GB', {
        timeZone: ghostTZ, hour: '2-digit', minute: '2-digit', hour12: false
      }).format(new Date(evt.occurredAt));

      const hoursSince = Math.floor((now - evt.occurredAt) / (3600 * 1000));
      const minutesSince = Math.floor((now - evt.occurredAt) / (60 * 1000));

      timeContext += `\n\nEVENT TIME
This event occurred at: ${occurredTimeStr} Ghost-local time.
Time elapsed: ~${hoursSince}h (${minutesSince}min).

Do NOT say "just arrived" or "just now" unless the elapsed time is truly very short (under 30 minutes).
Your post must reflect how much time has actually passed since the event occurred.`;
    } catch(e) {
      console.warn('[feed] Failed to format event time:', e);
    }
  } else {
    // NPC ambient 无 event time，只有 NOW + 时间冲突边界
    timeContext += `\n\nDo not make an explicit date or time-of-day claim that conflicts with the supplied current shared time.`;
  }

  // 距离铁律注入每条帖子
  const prompt = (promptMap[evt.type] || promptMap['daily_moment']) + '\n\n' + _feedDistanceRule() + _photoHint + timeContext;

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
      photo: _attachedPhoto ? {
        src: _attachedPhoto.src,
        caption: _attachedPhoto.caption,
        subject: _attachedPhoto.subject,
        scene: _attachedPhoto.scene,
        perspective: _attachedPhoto.perspective
      } : null,
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
  if (!post || (!post.en && !post.photo)) return; // BUG-6：允许纯图片帖（无正文）
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
  // 标记"本次会话真发过帖"——给红点检查用，区分"刚发的新帖"和"换设备/清缓存的旧帖"
  try { sessionStorage.setItem('feedPostedThisSession', '1'); } catch(e) {}
}

// ----- 旧版"用户草稿弹窗"已退役 -----
// 旧机制：系统在特殊事件（买大件/收礼/和好/纪念日/中秋等节日商品）后主动弹窗，
// 让用户从 AI 生成的 3 条文案里选一条发布。新版 Feed 已有完整的用户自主发帖入口，
// 这套 showUserDraftCard / selectDraftOption / dismissUserDraft / publishUserDraft
// 已全部移除，触发入口也一并停用。节日/日期系统本身保留（见 profile.js FESTIVALS）。

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
  const likeEmoji = isLiked ? '♥' : '♡';

  // 翻译按钮
  const hasTranslation = !!(post.zh || (post.comments && post.comments.some(c => c.zh)));
  const translateBtn = hasTranslation ? `<button class="couple-translate-btn" onclick="toggleFeedTranslation(this)">译</button>` : '';

  return `
    <div class="couple-post-card">
      <div class="couple-post-header">
        <div class="couple-avatar">${postAvatarHTML}</div>
        <div class="couple-post-meta">
          <div class="couple-post-name ${nameClass}">${displayName}</div>
          <div class="couple-post-time">${timeAgo(post.ts)}</div>
        </div>
      </div>
      ${post.en ? `<div class="couple-post-en">${post.en}</div>` : ''}
      ${post.zh ? `<div class="couple-post-zh">${post.zh}</div>` : ''}
      ${photoHTML}
      ${commentsHTML ? `<div class="couple-divider"></div><div class="couple-comments">${commentsHTML}</div>` : ''}
      <div class="couple-post-footer">
        <button class="couple-like-btn ${isLiked ? 'couple-liked' : ''}"
          data-post-id="${post.id}" data-count="${likeCount}"
          onclick="toggleCoupleLike(this)"
          style="cursor:pointer;pointer-events:auto;">${likeEmoji} <span class="like-num">${likeCount}</span></button>
        ${translateBtn}
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
        <button class="couple-like-btn ${liked ? 'couple-liked' : ''}" data-count="12" onclick="toggleCoupleLike(this, 'weddingLike')">${liked ? '♥' : '♡'} <span class="like-num">12</span></button>
        <button class="couple-translate-btn" onclick="toggleFeedTranslation(this)">译</button>
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
  // V2 UI 已改为 composer 轻量入口，不再需要独立按钮
  // composer 直接在 HTML 里，此函数保留空壳防止调用报错
}

// 初始化 composer 头像
function initLovespaceComposer() {
  const avatar = document.getElementById('lovespaceComposerAvatar');
  if (!avatar) return;
  const userAva = localStorage.getItem('userAvatarBase64');
  if (userAva) {
    const src = _toDataUri(userAva);
    avatar.innerHTML = `<img src="${src}" alt="">`;
  } else {
    avatar.innerHTML = `<img src="images/default-avatar.jpg" alt="">`;
  }
}

// 初始化 Hero 名字
function initLovespaceHero() {
  const namesEl = document.getElementById('lovespaceHeroNames');
  if (!namesEl) return;
  const ghostName = localStorage.getItem('botNickname') || 'Simon Riley';
  const userName = localStorage.getItem('userName') || '你';
  namesEl.textContent = `${ghostName} × ${userName}`;
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

  // 翻译：先判输入语言，再决定翻译方向——用户可能发中文，也可能直接发英文/图片
  // 注意：措辞要自然，别写成"绝不回答问题/verbatim/instruction"那种口气，
  // 否则模型会把它当成 prompt injection 而"破防"，把一整段拒绝回复当译文塞进帖子。
  const _TRANSLATOR = lang =>
    `Translate the following social media caption into ${lang}. `
    + `Keep it short and natural, matching the casual tone. `
    + `Reply with just the translation itself, nothing else.`;
  // 兜底：译文应与原文长度相当。命中拒绝/元评论关键词，或长度暴涨（模型"破防"吐了一大段），
  // 都视为无效，回退到原文而不是把垃圾塞进帖子。
  const _isMeaningful = (t, src = '') => {
    if (!t || !t.trim()) return false;
    const s = t.trim();
    // 老兜底：模型对英文原文回"already in English"之类
    if (/\balready in\b|\bno translation\b|returned it as is|as is\.\)/i.test(s)) return false;
    // 拒绝 / 元评论 / 身份声明（"破防"文案的典型特征）
    if (/\b(prompt injection|system (prompt|instruction)|safety guidelin|i (can't|cannot|won't|don't|am|'m) (help|assist|translate|able|kiro|an ai)|as an ai|translation engine|override|manipulat|i need to clarify)\b/i.test(s)) return false;
    // 长度暴涨：译文比原文长很多且本身偏长 → 几乎一定不是翻译
    if (src && s.length > src.trim().length * 4 && s.length > 60) return false;
    return true;
  };

  let en, zhLine;
  if (!text) {
    en = ''; zhLine = '';                       // 纯图片帖，无正文
  } else if (/[一-鿿぀-ヿ]/.test(text)) {
    // 输入是中文：中文放 zh 行，英文译文放 en 行
    let t = '';
    try { t = await fetchDeepSeek(_TRANSLATOR('natural English'), text, 80); } catch(e) {}
    en = _isMeaningful(t, text) ? t.trim() : text;
    zhLine = text;
  } else {
    // 输入已是英文：原文直接当 en 行，中文译文放 zh 行（不再让模型"翻译成英文"）
    let t = '';
    try { t = await fetchDeepSeek(_TRANSLATOR('natural Chinese'), text, 80); } catch(e) {}
    en = text;
    zhLine = _isMeaningful(t, text) ? t.trim() : '';
  }

  // 捕获本次配图引用（_feedComposePhoto 是模块级变量，弹窗重开会被重置，先存本地副本）
  const _postPhoto = _feedComposePhoto ? { idbKey: _feedComposePhoto.idbKey, idbIndex: _feedComposePhoto.idbIndex } : null;

  // 先发帖（无评论），立刻显示——评论稍后异步补上，更像真人陆续来评论
  const postId = 'post_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  insertFeedPost({
    id: postId,
    author: 'user',
    en, zh: zhLine,
    photo: _postPhoto,
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

  // BUG-6：图片帖先做一次视觉理解，把客观描述持久化到帖子，再拿去生成评论。
  // 一张图只识一次；失败静默降级为纯文字评论，不阻断发帖（帖子上面已经发出去了）。
  let _photoDesc = '';
  if (_postPhoto) {
    _photoDesc = await describeFeedPhoto(_postPhoto);
    if (_photoDesc) {
      const list = getFeedPosts();
      const p = list.find(x => String(x.id) === String(postId));
      if (p) { p.photoDescription = _photoDesc; saveFeedPosts(list); }
      if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
    }
  }

  // 评论延迟送达（8~20秒随机），生成后写回对应帖子再刷新
  scheduleFeedComments(postId, 'user', en, _photoDesc);
}

// BUG-6：对用户图片帖执行一次视觉理解，得到简短客观的图片描述。
// 复用现有 /api/chat 多模态能力（photo.js 已用同一通道识图），不新建图片 API 层。
// 只在发帖时调用一次，结果持久化到 post.photoDescription，后续评论/重载都复用。
// 失败静默返回空串，绝不阻断发帖。
async function describeFeedPhoto(photo) {
  try {
    if (!photo || !photo.idbKey) return '';
    const list = await loadPhotosFromIDB(photo.idbKey);
    const b64 = list && list[photo.idbIndex || 0];
    if (!b64) return '';
    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 90,
        // 只描述"图里客观有什么"：简短、事实性；不推断情绪/关系，不解释梗，不替角色评论。
        // 明确要求识别玩偶/毛绒/照片中的照片等，避免把玩偶当真人。
        system: 'You are an objective image describer. In ONE short factual English sentence, describe only what is literally visible in the photo: the main objects, people, setting. If something is a plush toy, doll, figure, poster, screen, or a photo-of-a-photo, say so explicitly — do not treat depicted characters as real present people. Do NOT infer emotions, relationships, backstory, or intent. Do NOT write a caption or a comment. Just state what is in the image.',
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
            { type: 'text', text: 'Describe this image objectively in one sentence.' }
          ]
        }]
      })
    }, 12000);
    if (!res.ok) return '';
    const d = await res.json();
    return (d.content?.[0]?.text || '').trim();
  } catch(e) {
    console.warn('[feed] 图片理解失败，降级为纯文字评论:', e.message || e);
    return '';
  }
}

// 异步生成评论并陆续写回指定帖子（一条一条冒出来，像真人陆续来评论）
async function scheduleFeedComments(postId, authorKey, postEn, photoDescription) {
  try {
    const comments = await generateFeedComments(authorKey, postEn, photoDescription);
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
