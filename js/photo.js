// ===== 图片系统 (photo.js) =====
// 简化版：图片直接传给模型看，Storage异步上传

const AVATAR_BUCKET = 'avatars';
const PHOTO_BUCKET  = 'photos';

let _pendingAvatarChoice = null;

// ===== IndexedDB 图片存储 =====
// 把 base64 存 IndexedDB，不存 localStorage，防止超限丢记录

const PHOTO_IDB_NAME    = 'GhostPhotoStore';
const PHOTO_IDB_VERSION = 1;
const PHOTO_IDB_STORE   = 'photos';

function _openPhotoDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PHOTO_IDB_NAME, PHOTO_IDB_VERSION);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(PHOTO_IDB_STORE, { keyPath: 'key' });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function savePhotosToIDB(key, base64List) {
  try {
    const db = await _openPhotoDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(PHOTO_IDB_STORE, 'readwrite');
      const store = tx.objectStore(PHOTO_IDB_STORE);
      store.put({ key, base64List, savedAt: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror    = e => reject(e.target.error);
    });
  } catch(e) {
    console.warn('[PhotoIDB] 存储失败:', e);
    return false;
  }
}

async function loadPhotosFromIDB(key) {
  try {
    const db = await _openPhotoDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(PHOTO_IDB_STORE, 'readonly');
      const store = tx.objectStore(PHOTO_IDB_STORE);
      const req   = store.get(key);
      req.onsuccess = e => resolve(e.target.result?.base64List || null);
      req.onerror   = e => reject(e.target.error);
    });
  } catch(e) {
    console.warn('[PhotoIDB] 读取失败:', e);
    return null;
  }
}

// 清理30天前的旧图片
async function cleanOldPhotosFromIDB() {
  try {
    const db        = await _openPhotoDB();
    const threshold = Date.now() - 30 * 24 * 3600 * 1000;
    const tx    = db.transaction(PHOTO_IDB_STORE, 'readwrite');
    const store = tx.objectStore(PHOTO_IDB_STORE);
    const req   = store.openCursor();
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (!cursor) return;
      if (cursor.value.savedAt < threshold) cursor.delete();
      cursor.continue();
    };
  } catch(e) {}
}


function compressImageToBase64(dataUrl, maxWidth = 800, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      try {
        // 等待图片完全解码，防止canvas画出全黑（华为/手机拍照常见问题）
        // 最多重试3次，每次间隔递增
        let decoded = false;
        if (img.decode) {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await img.decode();
              decoded = true;
              break;
            } catch(e) {
              console.warn(`[photo] img.decode() 第${attempt+1}次失败:`, e.message || e);
              // 递增等待：200ms, 500ms, 1000ms
              await new Promise(r => setTimeout(r, [200, 500, 1000][attempt]));
            }
          }
        }
        // 多等几帧，华为等机型一帧不够
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => setTimeout(r, decoded ? 150 : 500));
        const canvas = document.createElement('canvas');
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        // 宽高为0说明图片没加载成功
        if (w === 0 || h === 0) {
          reject(new Error('图片尺寸为0，加载失败'));
          return;
        }
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        // 白色背景，防止PNG透明区域变黑
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        // 黑图检测：采样中心区域像素，如果全黑就报错
        try {
          const sampleSize = Math.min(32, w, h);
          const sx = Math.floor((w - sampleSize) / 2);
          const sy = Math.floor((h - sampleSize) / 2);
          const pixels = ctx.getImageData(sx, sy, sampleSize, sampleSize).data;
          let totalBrightness = 0;
          const pixelCount = pixels.length / 4;
          for (let i = 0; i < pixels.length; i += 4) {
            totalBrightness += pixels[i] + pixels[i+1] + pixels[i+2]; // R+G+B
          }
          const avgBrightness = totalBrightness / (pixelCount * 3); // 0-255
          if (avgBrightness < 3) {
            // 几乎纯黑（avg < 3），很可能是decode失败导致的全黑canvas
            console.warn('[photo] 检测到黑图，avgBrightness:', avgBrightness.toFixed(1));
            // 不直接reject，尝试用原始dataUrl的base64（未经canvas处理）
            // 这样至少传原图给模型，虽然可能大一点但不会是全黑
            const fallbackB64 = dataUrl.split(',')[1];
            if (fallbackB64 && fallbackB64.length > 100) {
              console.log('[photo] 黑图降级：使用原始base64');
              resolve(fallbackB64);
              return;
            }
            reject(new Error('图片渲染全黑，decode可能失败'));
            return;
          }
        } catch(pixelErr) {
          // getImageData可能因跨域失败，忽略检测继续
          console.warn('[photo] 黑图检测跳过:', pixelErr.message);
        }

        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed.split(',')[1]);
      } catch(e) { reject(e); }
    };
    img.onerror = (e) => {
      console.error('[photo] img.onerror 图片加载失败:', e);
      reject(new Error('图片加载失败'));
    };
    img.src = dataUrl;
  });
}

// ===== 上传到Supabase Storage（异步，不阻塞）=====
async function uploadToStorage(base64, bucket, fileName) {
  try {
    const sb = typeof getSbClient === 'function' ? getSbClient() : null;
    const userId = typeof getSbUserId === 'function' ? getSbUserId() : null;
    if (!sb || !userId) return null;
    const binary = atob(base64.replace(/\s/g, ''));
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    const blob = new Blob([arr], { type: 'image/jpeg' });
    const path = `${userId}/${fileName}`;
    const { error } = await sb.storage.from(bucket).upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
    if (error) return null;
    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  } catch(e) { return null; }
}

// ===== 把头像URL写入云端 =====
// 修复：不再单独upsert profile（会被后来的saveToCloud覆盖掉）
// 改为：写入localStorage后触发完整的scheduleCloudSave，让saveToCloud统一处理
async function saveAvatarUrlToProfile(url) {
  if (!url || url.startsWith('data:')) return; // 只存正式URL，不存base64

  // 写入localStorage（saveToCloud会从这里读）
  localStorage.setItem('ghostAvatarUrl', url);
  if (typeof touchLocalState === 'function') touchLocalState();

  // 触发完整云端保存（urgent=true，2秒内执行）
  // saveToCloud里会读localStorage.ghostAvatarUrl并存入profile
  if (typeof scheduleCloudSave === 'function') {
    scheduleCloudSave(true);
    console.log('[avatar] 已触发云端保存:', url.slice(0, 60));
  }
}

// ===== Avatar State V1：唯一头像状态 / 渲染 / 云同步 =====
const DEFAULT_GHOST_AVATAR = 'images/ghost-avatar.jpg';

function _avatarVersionedUrl(url, stamp) {
  if (!url || url.startsWith('data:') || url.startsWith('images/')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}t=${stamp || Date.now()}`;
}

function _avatarFallbackSrc() {
  const b64 = localStorage.getItem('ghostAvatarBase64');
  return b64 ? `data:image/jpeg;base64,${b64}` : DEFAULT_GHOST_AVATAR;
}

function _renderGhostAvatar(url) {
  const stamp = localStorage.getItem('ghostAvatarUpdatedAt') || '';

  // 修复 Bug：正式 URL 不存在或为 data: 时，优先渲染待上传的 base64
  if (!url || url.startsWith('data:')) {
    const b64 = localStorage.getItem('ghostAvatarBase64');
    if (b64) {
      // 待上传头像：用 base64 + 时间戳防缓存
      const src = `data:image/jpeg;base64,${b64}#t=${stamp || Date.now()}`;
      document.querySelectorAll('.ghost-avatar-img').forEach(el => {
        el.src = src;
      });
      return;
    }
  }

  // 正式 URL 存在：用版本化 URL
  const src = url ? _avatarVersionedUrl(url, stamp) : _avatarFallbackSrc();
  document.querySelectorAll('.ghost-avatar-img').forEach(el => {
    el.onerror = () => {
      el.onerror = null;
      el.src = _avatarFallbackSrc();
    };
    el.src = src;
  });
}

function updateGhostAvatar(url) {
  if (!url) return;
  const stamp = Date.now();
  localStorage.setItem('ghostAvatarUrl', url);
  localStorage.setItem('ghostAvatarUpdatedAt', String(stamp));
  _renderGhostAvatar(url);
  if (typeof touchLocalState === 'function') touchLocalState();
  saveAvatarUrlToProfile(url);

  // 修复Bug #1: 换头像后强制刷新聊天页顶部头像
  // 即使在聊天页面不切屏，也要立即更新显示
  requestAnimationFrame(() => {
    console.log('[avatar] 强制刷新所有页面的头像显示');
    refreshGhostAvatar();
  });
}

// 切页面只读同一个 Avatar State，不再自己猜版本。
function refreshGhostAvatar() {
  const url = localStorage.getItem('ghostAvatarUrl') || '';
  _renderGhostAvatar(url);
}

// openScreen 切屏只改 CSS class，不增删 DOM，所以切屏后重渲染统一头像。
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const _prevOpenScreen = window.openScreen;
    if (typeof _prevOpenScreen === 'function') {
      window.openScreen = function(screenId) {
        _prevOpenScreen(screenId);
        requestAnimationFrame(() => refreshGhostAvatar());
      };
    }
  }, 0);
});

// 启动恢复：这里只显示本地 Avatar State。
// Cloud → Local 的版本裁决统一交给 cloud.js，避免两条 restore 链并行抢写。
async function restoreGhostAvatar() {
  refreshGhostAvatar();

  // 正式 URL 不存在时，base64 是待同步的本地头像；只重试上传，不再用延时抢写头像。
  const url = localStorage.getItem('ghostAvatarUrl');
  const b64 = localStorage.getItem('ghostAvatarBase64');
  if ((!url || url.startsWith('data:')) && b64) {
    refreshGhostAvatar();
    try {
      const retryUrl = await uploadToStorage(b64, AVATAR_BUCKET, `avatar_retry_${Date.now()}.jpg`);
      if (retryUrl) {
        updateGhostAvatar(retryUrl);
        localStorage.removeItem('ghostAvatarBase64');
      }
    } catch(e) {
      console.warn('[avatar] 待同步头像上传失败，保留本地备份');
    }
  }
}

// ===== 图片预览 =====
function showPhotoPreview(src) {
  let overlay = document.getElementById('photoPreviewOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'photoPreviewOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.onclick = () => { overlay.style.display = 'none'; };
    overlay.innerHTML = '<img id="photoPreviewImg" style="max-width:95%;max-height:90vh;border-radius:8px;object-fit:contain;" />';
    document.body.appendChild(overlay);
  }
  document.getElementById('photoPreviewImg').src = src;
  overlay.style.display = 'flex';
}

// ===== 主入口 =====
async function handlePhotoUpload(fileDataList) {
  const items = Array.isArray(fileDataList) ? fileDataList : [fileDataList];
  if (items.length === 0) return;

  if (typeof showToast === 'function') showToast('📤 发送中...');

  try {
    // 1. 压缩，得到base64
    const base64List = [];
    for (const item of items) {
      const mimeType = item.type || 'image/jpeg';
      const dataUrl = `data:${mimeType};base64,${item.base64 || item}`;
      const b64 = await compressImageToBase64(dataUrl, 800, 0.78);
      base64List.push(b64);
    }

    // 2. 显示图片气泡
    const previewSrcs = base64List.map(b64 => `data:image/jpeg;base64,${b64}`);
    const container = document.getElementById('messagesContainer');
    if (container) {
      const div = document.createElement('div');
      div.className = 'message user';
      div.style.cssText = 'display:flex;justify-content:flex-end;margin:4px 0;';
      div.innerHTML = `<div style="display:inline-flex;gap:6px;flex-wrap:wrap;max-width:280px;">
        ${previewSrcs.map((src, i) => `<img src="${src}" style="max-width:${previewSrcs.length > 1 ? '130px' : '220px'};border-radius:12px;display:block;cursor:pointer;" onclick="showPhotoPreview('${src}')" />`).join('')}
      </div>`;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }

    // 3. 存入 IndexedDB + chatHistory 只存 key（不存 base64，防止 localStorage 超限丢记录）
    if (typeof chatHistory !== 'undefined') {
      const _photoKey = 'photo_' + Date.now();
      await savePhotosToIDB(_photoKey, base64List);
      chatHistory.push({
        role: 'user',
        content: `[用户发了${base64List.length}张图片]`,
        _photoBase64: base64List,  // 内存里保留供本次会话使用
        _photoIdbKey: _photoKey,   // 持久化 key，刷新后从 IDB 恢复
      });
      if (typeof saveHistory === 'function') saveHistory();
      // 定期清理旧图片
      cleanOldPhotosFromIDB().catch(() => {});
    }

    // User Turn Batching V1: 图片进入 pending turn，不立即触发 Claude
    // 退休旧的独立 Claude 请求链（photoHint / msgsWithPhoto / fetchWithTimeout('/api/chat')）
    if (typeof _addToPendingUserTurn === 'function') {
      _addToPendingUserTurn({
        type: 'photo',
        content: `[用户发了${base64List.length}张图片]`,
        _photoBase64: base64List,
        timestamp: Date.now()
      });
    } else {
      console.warn('[photo] _addToPendingUserTurn 不存在，图片无法进入 pending turn');
    }

    // 保留 Photo V2 职责：
    // 1. 把最新图片存到 _lastReceivedPhotos 供头像命令使用
    window._avatarChangeIntent = null;
    _pendingAvatarChoice = null;
    window._lastReceivedPhotos = {
      base64List,
      isTwoPhotos: base64List.length > 1,
      sentAt: Date.now()
    };

    // 2. 异步上传图片到 Storage，完成后更新 chatHistory._photoUrls
    const photoUrls = new Array(base64List.length).fill(null);
    const _uploadTs = Date.now();
    const uploadPromises = base64List.map((b64, i) =>
      uploadToStorage(b64, PHOTO_BUCKET, `photo_${_uploadTs}_${i}.jpg`).then(url => {
        if (url) {
          photoUrls[i] = url;
          // 更新气泡里的img src（用URL替换base64）
          const imgs = container ? container.querySelectorAll(`img[src^="data:image"]`) : [];
          const targetImg = Array.from(imgs).find(img => {
            try { return img.src.includes(base64List[i].slice(0, 20)); } catch(e) { return false; }
          });
          if (targetImg) targetImg.src = url;
        }
      })
    );
    Promise.all(uploadPromises).then(() => {
      const validUrls = photoUrls.filter(Boolean);
      if (validUrls.length > 0 && typeof chatHistory !== 'undefined') {
        const msgIdx = chatHistory.findIndex(m =>
          m.content && m.content.includes('[用户发了') && !m._photoUrls
        );
        if (msgIdx !== -1) {
          chatHistory[msgIdx]._photoUrls = validUrls;
          delete chatHistory[msgIdx]._photoBase64; // 上传成功后清除base64
          if (typeof saveHistory === 'function') saveHistory();
          if (typeof scheduleCloudSave === 'function') scheduleCloudSave(true);
        }
      }
    });

    // 3. 异步生成图片描述（不阻塞，后续对话用）
    fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: typeof getMainModel === 'function' ? getMainModel() : 'claude-sonnet-4-6',
        max_tokens: 100,
        system: 'Describe the image in 1-2 sentences. Specific details: colors, objects, people, mood. English only. Start with "She sent a photo of".',
        messages: [{
          role: 'user',
          content: [
            ...base64List.map(b64 => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } })),
            { type: 'text', text: 'Describe this image briefly.' }
          ]
        }]
      })
    }, 10000).then(async res => {
      if (!res?.ok) return;
      const data = await res.json();
      const desc = data.content?.[0]?.text?.trim() || '';
      if (desc && typeof chatHistory !== 'undefined') {
        chatHistory.push({ role: 'user', content: `[Image: ${desc}]`, _system: true, _imageDesc: true });
        if (typeof saveHistory === 'function') saveHistory();
      }
    }).catch(() => {});

    if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
    if (typeof showToast === 'function') showToast('');

  } catch(err) {
    if (typeof hideTyping === 'function') hideTyping();
    if (typeof showToast === 'function') showToast('发送失败，请重试');
    console.error('图片发送失败:', err);
  }
}

// ===== Photo V2：头像协商 =====
// 系统只保存“正在讨论哪张图作为头像”的事实；Ghost 是否愿意换由模型在正常聊天里自己决定。
// 不使用拒绝次数、说服值、确认弹窗或固定回复。

function _pickAvatarIndexFromText(text, maxCount) {
  const t = String(text || '').toLowerCase();
  let idx = -1;
  if (/左|第一|1张|first|left|上面|左边/.test(t)) idx = 0;
  else if (/右|第二|2张|second|right|下面|右边/.test(t)) idx = 1;
  else if (/第三|3张|third/.test(t)) idx = 2;
  return idx >= 0 && idx < maxCount ? idx : -1;
}

function _setAvatarNegotiation(lastPhotos, userText) {
  const base64List = Array.isArray(lastPhotos?.base64List) ? lastPhotos.base64List.filter(Boolean) : [];
  if (!base64List.length) return false;
  const selectedIndex = base64List.length === 1 ? 0 : _pickAvatarIndexFromText(userText, base64List.length);
  window._avatarChangeIntent = {
    base64List,
    selectedIndex,
    startedAt: Date.now(),
    photoSentAt: lastPhotos.sentAt || Date.now(),
  };
  _pendingAvatarChoice = base64List.length > 1 && selectedIndex < 0 ? { base64List } : null;
  return true;
}

// 多图协商中，她后续说明“第一张/右边那张”等：只明确目标，不直接换。
async function checkPendingAvatarChoice(userText) {
  const pending = window._avatarChangeIntent;
  if (!pending || !Array.isArray(pending.base64List) || pending.base64List.length < 2) return false;
  if (Date.now() - pending.startedAt > 10 * 60 * 1000) { window._avatarChangeIntent = null; _pendingAvatarChoice = null; return false; }
  if (Number.isInteger(pending.selectedIndex) && pending.selectedIndex >= 0) return false;
  const chosenIdx = _pickAvatarIndexFromText(userText, pending.base64List.length);
  if (chosenIdx === -1) return false;
  pending.selectedIndex = chosenIdx;
  _pendingAvatarChoice = null;
  return false; // 继续正常聊天，让 Ghost 自己回应她的选择
}

// 识别“她正在提出/讨论把刚发的图作为 Ghost 头像”。这里只开启协商，不执行换头像。
async function checkAvatarCommand(userText) {
  const text = String(userText || '');
  const lastPhotos = window._lastReceivedPhotos;
  if (!lastPhotos || !Array.isArray(lastPhotos.base64List) || lastPhotos.base64List.length === 0) return false;

  // 已经在协商中时，不重复分类；后续说服/拒绝/改主意都交给正常聊天。
  if (window._avatarChangeIntent) {
    // 新的明确头像请求可以替换旧候选；普通图片不沿用旧授权。
    if (!/(?:头像|avatar|profile\s*pic|profile\s*picture|pfp|大头照)/i.test(text)) return false;
    window._avatarChangeIntent = null;
    _pendingAvatarChoice = null;
  }

  // 初次进入头像话题必须有头像领域信号，避免“用这个吧/就它了”把普通分享误判成头像。
  // 既然用户已经明确说到“头像/avatar/profile pic”，这本身就是足够可靠的领域事实：
  // 直接建立协商，不再先依赖一次 Haiku 网络分类。Simon 是否答应仍由正常聊天决定。
  const hasAvatarSignal = /头像|avatar|profile\s*pic|profile\s*picture|pfp|icon|大头照/i.test(text);
  if (!hasAvatarSignal) return false;
  // 只绑定近期真实发送的图片，不能把几小时前的普通图片作为头像候选。
  if (!lastPhotos.sentAt || Date.now() - lastPhotos.sentAt > 10 * 60 * 1000) return false;

  _setAvatarNegotiation(lastPhotos, text);
  return false; // 永远不拦截主聊天；Ghost 必须亲自回应
}

// 给当前模型的事实提示：只说明正在讨论头像，不规定他应该答应还是拒绝。
function getAvatarNegotiationContext() {
  const pending = window._avatarChangeIntent;
  if (!pending || !Array.isArray(pending.base64List) || !pending.base64List.length) return '';
  if (Date.now() - pending.startedAt > 10 * 60 * 1000) { window._avatarChangeIntent = null; _pendingAvatarChoice = null; return ''; }
  const count = pending.base64List.length;
  if (count === 1) {
    return `[AVATAR CHANGE CAPABILITY: You CAN change your avatar. When you agree to use the photo she sent, the system will automatically update your profile picture in the background. This is a real feature that works.

Current situation: She sent a photo and is asking you to use it as your avatar. Whether you want to use it is your decision. If you agree, just respond naturally in character (e.g., "alright, done" or "changed it"). The system handles the actual change automatically.

IMPORTANT: Do NOT say "I can't change my avatar" or "that's not something I can do" — you CAN, and the system will do it for you when you agree. If you don't want to change it, refuse in character, but don't claim technical limitations that don't exist.]`;
  }
  if (Number.isInteger(pending.selectedIndex) && pending.selectedIndex >= 0) {
    return `[AVATAR CHANGE CAPABILITY: You CAN change your avatar. The system will automatically update it when you agree.

Current situation: She is discussing image ${pending.selectedIndex + 1} of the recent images as your potential avatar. If you agree to use it, respond naturally — the system handles the change automatically.

IMPORTANT: Do NOT claim you can't change your avatar. You can. If you don't want to, refuse in character, but don't invent technical limitations.]`;
  }
  return `[AVATAR CHANGE CAPABILITY: You CAN change your avatar when you agree to use one of the photos she sent.

Current situation: She sent ${count} images as potential avatars, but no single image has been selected yet. You may respond naturally; if the target is unclear, that uncertainty is real. When you agree to use a specific one, the system will handle the change automatically.

IMPORTANT: Don't say you can't change your avatar. You can.]`;
}

// 执行层的本地确定性兜底：识别”已经明确决定现在使用当前候选图”的承诺。
// 这里不决定 Simon 应不应该答应；只把他已经说出口的明确决定可靠落地。
// 修复：扩展识别范围，包含更多自然的同意表达。
function _hasExplicitAvatarCommitment(ghostReply) {
  const t = String(ghostReply || '').trim().toLowerCase()
    .replace(/['']/g, "'")
    .replace(/\s+/g, ' ');
  if (!t) return false;

  const explicitPatterns = [
    // 完成时态 - 已经换了
    /\bi (?:changed|set|switched|updated) (?:it|my avatar|my profile (?:pic|picture))\b/,
    /\b(?:i've|i have) (?:changed|set|switched|updated) (?:it|my avatar|my profile (?:pic|picture))\b/,
    /\b(?:changed|switched|updated) (?:it|my avatar)\b/,
    /\balready (?:changed|using) it\b/,
    // 将来时 - 会换/正在换
    /\bi(?:'ll| will) (?:use|set|make|switch to|change to|do) (?:it|that|this|mine|the (?:photo|picture|image))\b/,
    /\bi(?:'m| am) (?:using|setting|switching to|changing to) (?:it|that|this|the (?:photo|picture|image))\b/,
    /\b(?:changing|setting|switching|updating) (?:it|my avatar|my profile (?:pic|picture)) (?:now|then)\b/,
    // 同意/承诺
    /\bi agree (?:to )?(?:use|change|switch)/,
    /\b(?:yeah|yes|yep|sure|fine|alright|okay|ok)[\.,]?\s+(?:i'?ll do|done|changed|using it|switched)\b/,
    // 单独的确认+行动
    /\b(?:fine|alright|okay)\.?\s+(?:this|that) (?:one |works|is fine)\b/i,
    // 祈使/决定 - 用这张
    /\b(?:use|set|make) (?:it|that|this) (?:as )?(?:my )?(?:avatar|profile (?:pic|picture))\b/,
    // 中文表达 - 各种换头像的说法
    /(?:换|改|设|设置|换成|改成|用)(?:这张|这个|它|上)(?:了|吧|好了)?(?:当|做|成|为)?(?:我的)?(?:头像|大头照)/,
    /(?:我)?(?:已经|现在)?(?:把)?(?:头像)?(?:换成|改成|设成|设置成|用)(?:这张|这个|它)/,
    /(?:我)?(?:已经|现在)?(?:把)?(?:这张|这个|它)(?:换成|改成|设成|设置成|用(?:作|为)?)(?:我的)?(?:头像|大头照)/,
    /(?:我的)?(?:头像|大头照)(?:已经|现在)?(?:换好(?:了)?|换了|改了|设置好了|设好了|用上了)/,
    /(?:好|行|可以)(?:，|,)?(?:换了|用了|改了|就这张)/,
  ];
  return explicitPatterns.some(re => re.test(t));
}

// Ghost 正常回复后，后台只读取”他刚才是否已经明确决定使用这张图”。
// 拒绝/犹豫不会清空候选，因此她之后仍可继续聊、继续说服，他也可以自然改变主意。
async function evaluateAvatarNegotiationAfterReply(userText, ghostReply) {
  const pending = window._avatarChangeIntent;
  if (!pending || !Array.isArray(pending.base64List) || !pending.base64List.length) return false;
  if (!ghostReply || !String(ghostReply).trim()) return false;
  if (Date.now() - pending.startedAt > 10 * 60 * 1000) { window._avatarChangeIntent = null; _pendingAvatarChoice = null; return false; }
  // 头像协商只对本轮明确的头像请求授权，不能让日后普通图片/聊天触发旧候选。
  const avatarRequestThisTurn = /头像|avatar|profile\s*pic|profile\s*picture|pfp|大头照/i.test(String(userText || ''));
  if (!avatarRequestThisTurn) return false;

  try {
    const selected = Number.isInteger(pending.selectedIndex) && pending.selectedIndex >= 0
      ? pending.selectedIndex
      : (pending.base64List.length === 1 ? 0 : -1);
    // 没有明确目标时绝不执行；多图必须先知道是哪一张。
    if (selected < 0) {
      console.log('[avatar] 协商评估：目标图片未明确，跳过执行');
      return false;
    }

    // Simon 已经用了非常明确的执行式表达时，直接落地，不再把可靠性押在第二次模型请求上。
    // 例如 “Yeah, I changed it.” / “I'll use that one.”。
    if (_hasExplicitAvatarCommitment(ghostReply)) {
      console.log('[avatar] 协商评估：正则检测到明确承诺，执行换头像');
      const ghostB64 = pending.base64List[selected];
      if (!ghostB64) {
        console.warn('[avatar] 协商评估：base64 数据丢失，跳过执行');
        return false;
      }
      window._avatarChangeIntent = null;
      _pendingAvatarChoice = null;
      await _executeAvatarSet(ghostB64);
      return true;
    }

    // 其余自然表达仍交给语义分类器判断，保留对非固定措辞的理解能力。
    // 修复：放宽判断标准，承诺换头像即可执行，不要求必须"已经换了"
    // 安全阀：用户这轮必须明确提到头像话题，避免持续协商中的误触发
    // "这张"等指代词必须配合头像相关动作词，避免泛指其他物品
    const hasAvatarKeyword = /头像|avatar|profile\s*pic|profile\s*picture|pfp/i.test(userText);
    const hasAvatarAction = /换|change.*(?:picture|photo|avatar)|use.*(?:as.*)?(?:avatar|profile|picture)|set.*(?:avatar|picture)/i.test(userText);
    const hasThisReference = /这张|那张|this\s+(?:one|photo|picture|image)/i.test(userText);

    const userMentionsAvatar = hasAvatarKeyword || (hasAvatarAction && hasThisReference);

    if (!userMentionsAvatar) {
      console.log('[avatar] 协商评估：用户本轮未明确提及头像话题，跳过判断（防误触发）');
      return false;
    }

    console.log('[avatar] 协商评估：调用 Haiku 进行语义判断...');
    const targetFact = `The candidate is image ${selected + 1}.`;
    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        system: `You are reading an avatar negotiation between a wife and her husband. ${targetFact}\nDecide whether the husband's latest reply commits to using the specific candidate image as his avatar.\nReply only ACCEPT or UNRESOLVED.\nACCEPT requires: (1) wife explicitly asked about using it as avatar this turn, AND (2) husband clearly agrees. Simple evaluations like "looks good" or "decent" without commitment are UNRESOLVED. Generic agreement like "yeah alright" when she only asked "how is it" (not "use it as avatar") is UNRESOLVED. Only ACCEPT when he commits to the avatar change action.`,
        messages: [{ role: 'user', content: `Wife: ${String(userText || '').slice(0, 500)}\nHusband: ${String(ghostReply).slice(0, 700)}` }]
      })
    }, 8000);
    if (!res.ok) {
      console.warn('[avatar] 协商评估：Haiku 请求失败');
      return false;
    }
    const data = await res.json();
    const decision = (data.content?.[0]?.text || '').trim().toUpperCase();
    console.log('[avatar] 协商评估：Haiku 判断结果:', decision);
    if (!decision.startsWith('ACCEPT')) {
      console.log('[avatar] 协商评估：判断为未承诺，保持协商状态');
      return false;
    }

    console.log('[avatar] 协商评估：Haiku 判断为承诺，执行换头像');
    const ghostB64 = pending.base64List[selected];
    if (!ghostB64) {
      console.warn('[avatar] 协商评估：base64 数据丢失，跳过执行');
      return false;
    }
    window._avatarChangeIntent = null;
    _pendingAvatarChoice = null;
    await _executeAvatarSet(ghostB64);
    return true;
  } catch(e) {
    console.warn('[avatar] 头像协商决定读取失败:', e.message || e);
    return false;
  }
}

// 执行头像更换：保留原有显示 / Storage / localStorage / 云端同步链路。
async function _executeAvatarSet(ghostB64) {
  console.log('[avatar] 开始执行头像更换...');
  window._lastReceivedPhotos = null;

  // 立即更新所有头像元素显示
  const avatarElements = document.querySelectorAll('.ghost-avatar-img');
  console.log(`[avatar] 找到 ${avatarElements.length} 个头像元素，立即更新显示`);
  const timestamp = Date.now();
  avatarElements.forEach(el => {
    // 强制破缓存：即使是base64也加参数，确保浏览器重新渲染
    el.src = `data:image/jpeg;base64,${ghostB64}#t=${timestamp}`;
  });

  try {
    localStorage.setItem('ghostAvatarBase64', ghostB64);
    console.log('[avatar] base64 已存入 localStorage');
  } catch(e) {
    console.warn('[avatar] base64 存 localStorage 失败（可能空间不足）:', e);
    if (typeof showToast === 'function') {
      showToast('⚠️ 存储空间不足，头像将在上传成功后同步');
    }
  }

  // 上传到云端存储
  console.log('[avatar] 开始上传到云端存储...');
  let uploadOk = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const url = await uploadToStorage(ghostB64, AVATAR_BUCKET, `avatar_${Date.now()}.jpg`);
      if (url) {
        console.log('[avatar] 上传成功，URL:', url);
        updateGhostAvatar(url);
        localStorage.removeItem('ghostAvatarBase64');
        uploadOk = true;
        if (typeof showToast === 'function') showToast('头像已更新 ✅');

        // 修复：强制刷新动态里的头像（重新渲染 feed posts）
        if (typeof renderFeed === 'function') {
          console.log('[avatar] 刷新动态显示');
          setTimeout(() => renderFeed(), 100);
        }
        break;
      }
    } catch(e) {
      console.warn(`[avatar] 上传第${attempt + 1}次失败:`, e);
    }
    if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
  }

  if (!uploadOk) {
    console.warn('[avatar] 上传失败，无可靠备份');
    // 检查 localStorage 是否也失败了
    const hasLocalBackup = !!localStorage.getItem('ghostAvatarBase64');
    if (hasLocalBackup) {
      // localStorage 成功，只是云端失败，可以显示并等待下次上传
      if (typeof showToast === 'function') showToast('头像已设置，网络同步中…');
      if (typeof renderFeed === 'function') {
        console.log('[avatar] 刷新动态显示（本地版本）');
        setTimeout(() => renderFeed(), 100);
      }
    } else {
      // localStorage 和云端都失败，没有任何持久化副本
      if (typeof showToast === 'function') showToast('⚠️ 头像保存失败，请重试');
      // 不刷新动态，避免显示无法持久化的临时状态
    }
  }

  // Ghost 已经在正常聊天中表达了自己的决定；执行层不再追加任何硬编码台词。
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
  console.log('[avatar] 头像更换完成');
}

// ===== 按钮触发 =====
function triggerPhotoUpload() {
  const input = document.getElementById('photoFileInput');
  if (input) { input.value = ''; input.click(); }
}

async function handlePhotoInputChange(e) {
  // 华为等机型兼容：files 可能延迟到位，等一帧再读
  await new Promise(r => setTimeout(r, 100));
  const files = Array.from(e.target.files || []).slice(0, 3);
  e.target.value = '';
  if (files.length === 0) {
    if (typeof showToast === 'function') showToast('没有读取到图片，请重试');
    return;
  }
  try {
    const fileDataList = [];
    for (const f of files) {
      // 检查文件类型，不支持的格式给提示
      const type = f.type || '';
      if (type && !type.startsWith('image/')) {
        if (typeof showToast === 'function') showToast('请选择图片文件');
        return;
      }
      // HEIC/HEIF 格式华为常见，FileReader 可能读不到
      if (type === 'image/heic' || type === 'image/heif' || f.name?.toLowerCase().endsWith('.heic')) {
        if (typeof showToast === 'function') showToast('请先将图片转存为 JPG 格式再发送');
        return;
      }
      const data = await new Promise((res, rej) => {
        const reader = new FileReader();
        // 超时保护：5秒读不到就报错
        const timeout = setTimeout(() => rej(new Error('读取超时')), 5000);
        reader.onload = ev => {
          clearTimeout(timeout);
          const result = ev.target.result;
          if (!result || !result.includes(',')) {
            rej(new Error('文件内容为空'));
            return;
          }
          res({ base64: result.split(',')[1], type: f.type || 'image/jpeg', size: f.size });
        };
        reader.onerror = () => {
          clearTimeout(timeout);
          rej(new Error('读取失败'));
        };
        reader.readAsDataURL(f);
      });
      fileDataList.push(data);
    }
    if (fileDataList.length === 0) {
      if (typeof showToast === 'function') showToast('图片读取失败，请截图后重试');
      return;
    }
    handlePhotoUpload(fileDataList);
  } catch(err) {
    console.error('[photo] 读取图片失败:', err);
    if (typeof showToast === 'function') showToast('图片读取失败，请截图后重试 📸');
  }
}

// ===== 旧版“重新换头像”直执行逻辑已退休 =====
// Photo V2 中，换错/想换另一张也回到正常聊天协商；这里不再拦截或自动改头像。
async function checkAvatarReplace(userText) {
  return false;
}
