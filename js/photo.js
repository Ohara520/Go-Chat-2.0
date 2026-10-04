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

// 启动恢复：先显示本地；云端只在版本更新或本地为空时接管。
async function restoreGhostAvatar() {
  refreshGhostAvatar();

  try {
    const sb = typeof getSbClient === 'function' ? getSbClient() : null;
    const userId = typeof getSbUserId === 'function' ? getSbUserId() : null;
    if (sb && userId) {
      const { data: row } = await sb
        .from('user_data')
        .select('profile')
        .eq('user_id', userId)
        .single();

      const cloudUrl = row?.profile?.ghostAvatarUrl || '';
      const cloudAt = parseInt(row?.profile?.ghostAvatarUpdatedAt || '0');
      const localUrl = localStorage.getItem('ghostAvatarUrl') || '';
      const localAt = parseInt(localStorage.getItem('ghostAvatarUpdatedAt') || '0');
      if (cloudUrl && (!localUrl || (cloudAt > 0 && cloudAt > localAt))) {
        localStorage.setItem('ghostAvatarUrl', cloudUrl);
        if (cloudAt > 0) localStorage.setItem('ghostAvatarUpdatedAt', String(cloudAt));
        refreshGhostAvatar();
      }
    }
  } catch(e) {
    console.warn('[avatar] 云端头像恢复失败，继续使用本地头像');
  }

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

    // 4. photoHint — 图片是当前聊天的一部分，让模型结合最近上下文自然理解并回应
    // 这里只提供交流事实，不规定回复长度，也不把头像执行规则塞进普通看图提示
    const isTwoPhotos = base64List.length > 1;
    const photoHint = `[She just sent you ${isTwoPhotos ? 'the attached images' : 'the attached image'}.
Understand why she sent ${isTwoPhotos ? 'them' : 'it'} in the context of your recent conversation, and respond to her naturally as Simon.
The ${isTwoPhotos ? 'images are' : 'image is'} part of the conversation, not a request for a visual description.]`;

    // 5. 发给模型看图回复
    if (typeof showTyping === 'function') showTyping();

    const _sys = typeof buildSystemPrompt === 'function' ? buildSystemPrompt() : '';
    const cleanMsgs = typeof chatHistory !== 'undefined'
      ? chatHistory.filter(m => !m._system && !m._recalled).slice(-6).map(m => ({
          role: m.role,
          content: m.content?.slice(0, 150) || ''
        }))
      : [];

    // 压缩后统一用jpeg（canvas.toDataURL输出的是jpeg）
    const imageContents = base64List.map(b64 => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: b64 }
    }));
    console.log('[photo] 发给模型的图片数量:', imageContents.length, '第一张base64长度:', base64List[0]?.length);

    // 当前图片本身已经由多模态块表达；不要把“[用户发了N张图片]”占位符再次当成她说的话。
    const lastUserText = cleanMsgs
      .filter(m => m.role === 'user' && m.content && !m.content.includes('[用户发了'))
      .slice(-1)[0]?.content || 'here.';
    // 修复(#20)：构造合法的对话数组。
    // 旧代码 `.slice(0, -1)` 会连真正的上一条用户消息也删掉，且数组可能以
    // assistant 开头 → Anthropic 报 400 → 主模型直接失败掉进 'noted.' 兜底。
    // 这里：去掉占位的 [用户发了…] 行，再裁掉开头的 assistant 直到以 user 开头。
    function _buildPhotoHistory() {
      let arr = cleanMsgs.filter(m => m.content && !m.content.includes('[用户发了'));
      // 去掉末尾那条占位用户消息（图片本身用下面的多模态块表达）
      if (arr.length && arr[arr.length - 1].role === 'user') arr = arr.slice(0, -1);
      // Anthropic 要求 messages[0] 必须是 user
      while (arr.length && arr[0].role === 'assistant') arr = arr.slice(1);
      return arr;
    }
    const _photoHistory = _buildPhotoHistory();
    const msgsWithPhoto = [
      ..._photoHistory,
      {
        role: 'user',
        content: [...imageContents, { type: 'text', text: lastUserText }]
      }
    ];

    let reply = '';
    let _geminiHandledPhoto = false;

    // Photo V2：沿用聊天已有的亲密通道连续性，而非预判图片内容。
    // 最近一条真实 assistant 回复由 Gemini 亲密通道产生时，本轮图片直接交给 Gemini；
    // 其他情况先交给 Claude，只有失败或明确破防才由 Gemini 接手。
    const _lastRealAssistant = typeof chatHistory !== 'undefined'
      ? chatHistory.filter(m => m.role === 'assistant' && !m._system && !m._recalled).slice(-1)[0]
      : null;
    const _inIntimateSession = !!_lastRealAssistant?._intimate;

    // 日常图片：Claude 优先。亲密通道中的图片：跳过 Claude。
    if (!_inIntimateSession) try {
      const sRes = await fetchWithTimeout('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: typeof getMainModel === 'function' ? getMainModel() : 'claude-sonnet-4-6',
          max_tokens: 300,
          timeout_ms: 22000, // 看图比纯文字慢，给后端节点更长超时
          system: _sys + '\n' + photoHint,
          messages: msgsWithPhoto
        })
      }, 24000);
      if (sRes.ok) {
        const sData = await sRes.json();
        const text = sData.content?.[0]?.text?.trim() || '';
        // 使用全局 isBreakout，不用局部变量（局部变量会遮蔽全局函数）
        if (!isBreakout(text) && text) reply = text;
      } else {
        console.warn('[photo] 主模型返回非200:', sRes.status, await sRes.text().catch(() => ''));
      }
    } catch(e) {
      console.warn('[photo] 主模型请求失败:', e.message || e);
    }

    // 已处于亲密通道时直接 Gemini；日常图片仅在 Claude 失败或破防时兜底。
    if (_inIntimateSession || !reply || isBreakout(reply)) {
      try {
        const core = typeof buildSystemPromptParts === 'function'
          ? buildSystemPromptParts(null, { skipWorldBook: true }).fixed
          : (typeof buildGhostStyleCore === 'function' ? buildGhostStyleCore() : _sys);
        // Gemini 只在 Claude 无法正常接住本轮图片时接手。若当前聊天本来处于亲密上下文，
        // 给 Gemini 它现有的亲密 Persona；否则只给 Shared Ghost Core。图片本身不做预分类。
        const _recentIntimateContext = _inIntimateSession;
        const _geminiPersona = (_recentIntimateContext && typeof GEMINI_INTIMACY_PERSONA === 'string')
          ? '\n\n' + GEMINI_INTIMACY_PERSONA
          : '';
        const _adultContext = _recentIntimateContext
          ? '\nShe is your wife. Intimacy between you is natural and established. Even when things get close, you remain yourself.'
          : '';
        const geminiPhotoText = typeof callVeniceForCurrentChar === 'function'
          ? await callVeniceForCurrentChar(
              core + _adultContext + _geminiPersona + '\n' + photoHint,
              _photoHistory.slice(-6).map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${m.content}`).join('\n') + '\nHer: [sent the attached image]',
              200,
              '',
              [],
              base64List
            )
          : '';
        if (geminiPhotoText && !isBreakout(geminiPhotoText)) {
          reply = geminiPhotoText.trim();
          _geminiHandledPhoto = true;
        }
      } catch(e) {
        console.warn('[photo] Venice兜底请求失败:', e.message || e);
      }
    }

    // 修复(#20)：两个模型都失败时，旧代码硬塞 'noted.'，读起来像敷衍/冷淡。
    // 改成几句符合 Ghost(丈夫)语气的兜底，随机挑一句，至少不出戏。
    if (!reply) {
      const _fallbacks = ["look at you.", "noted — and saved.", "yeah? show me again later.", "mm. keeping that one."];
      reply = _fallbacks[Math.floor(Math.random() * _fallbacks.length)];
    }

    // AVATAR_SET 已废弃，头像只由用户明确命令触发
    reply = reply.replace(/\n?AVATAR_SET\n?/gi, '').trim();
    if (!reply) reply = "look at you.";

    if (typeof hideTyping === 'function') hideTyping();

    // 6. 显示回复
    if (typeof appendMessage === 'function') appendMessage('bot', reply);
    if (typeof chatHistory !== 'undefined') {
      chatHistory.push({ role: 'assistant', content: reply, ...(_inIntimateSession && _geminiHandledPhoto ? { _intimate: true } : {}) });

      // 生成图片描述（异步，不阻塞，后续对话用）
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

      if (typeof saveHistory === 'function') saveHistory();
    }

    // 7. 换头像由用户明确命令触发，发图时不自动执行
    // 把最新的图片存到 _lastReceivedPhotos 供后续命令使用
    // 加时间戳：超过5分钟后自动失效，防止聊了一会儿后误触发换头像
    window._lastReceivedPhotos = { base64List, isTwoPhotos, sentAt: Date.now() };

    // 8. 异步上传所有图片到Storage，完成后更新历史记录和气泡
    const photoUrls = new Array(base64List.length).fill(null);
    const _uploadTs = Date.now(); // 用时间戳定位这批图片对应的历史消息
    const uploadPromises = base64List.map((b64, i) =>
      uploadToStorage(b64, PHOTO_BUCKET, `photo_${_uploadTs}_${i}.jpg`).then(url => {
        if (url) {
          photoUrls[i] = url;
          // 更新气泡里的img src（用URL替换base64，减少内存占用）
          const imgs = container ? container.querySelectorAll(`img[src^="data:image"]`) : [];
          // 匹配方式：找src里包含这张图片base64前20字符的img
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
        // 找到对应的历史消息（还没有_photoUrls的那条发图消息）
        const msgIdx = chatHistory.findIndex(m =>
          m.content && m.content.includes('[用户发了') && !m._photoUrls
        );
        if (msgIdx !== -1) {
          chatHistory[msgIdx]._photoUrls = validUrls;
          // 修复问题3：_photoBase64 上传成功后清除（太大，不存云端）
          // _photoUrls 保留，cloud.js存档时需要包含它
          delete chatHistory[msgIdx]._photoBase64;
          if (typeof saveHistory === 'function') saveHistory();
          // 立刻存云端，确保 _photoUrls 被同步上去
          if (typeof scheduleCloudSave === 'function') scheduleCloudSave(true);
        }
      }
    });

    if (typeof scheduleCloudSave === 'function') scheduleCloudSave();

  } catch(e) {
    if (typeof hideTyping === 'function') hideTyping();
    if (typeof showToast === 'function') showToast('发送失败，请重试');
    console.error('图片发送失败:', e);
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
  };
  _pendingAvatarChoice = base64List.length > 1 && selectedIndex < 0 ? { base64List } : null;
  return true;
}

// 多图协商中，她后续说明“第一张/右边那张”等：只明确目标，不直接换。
async function checkPendingAvatarChoice(userText) {
  const pending = window._avatarChangeIntent;
  if (!pending || !Array.isArray(pending.base64List) || pending.base64List.length < 2) return false;
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
  if (window._avatarChangeIntent) return false;

  // 初次进入头像话题必须有头像领域信号，避免“用这个吧/就它了”把普通分享误判成头像。
  const hasAvatarSignal = /头像|avatar|profile\s*pic|profile\s*picture|pfp|icon|大头照/i.test(text);
  if (!hasAvatarSignal) return false;

  try {
    const confirmRes = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        system: `You are an intent classifier. The user recently sent one or more images and is now chatting with her husband. Decide whether her message is proposing or discussing using one of those recent images as HIS avatar/profile picture. This is only intent detection; do not decide whether he agrees. Reply only YES or NO. When uncertain, reply NO.`,
        messages: [{ role: 'user', content: text }]
      })
    }, 8000);
    if (confirmRes.ok) {
      const confirmData = await confirmRes.json();
      const answer = (confirmData.content?.[0]?.text || '').trim().toUpperCase();
      if (answer.startsWith('YES')) _setAvatarNegotiation(lastPhotos, text);
    }
  } catch(e) {
    console.warn('[photo] 头像协商意图判断失败:', e.message || e);
  }

  return false; // 永远不拦截主聊天；Ghost 必须亲自回应
}

// 给当前模型的事实提示：只说明正在讨论头像，不规定他应该答应还是拒绝。
function getAvatarNegotiationContext() {
  const pending = window._avatarChangeIntent;
  if (!pending || !Array.isArray(pending.base64List) || !pending.base64List.length) return '';
  const count = pending.base64List.length;
  if (count === 1) {
    return '[Current fact: the photo she recently sent is being discussed as a possible avatar for you. No avatar change has happened yet. Whether you want to use it is your decision.]';
  }
  if (Number.isInteger(pending.selectedIndex) && pending.selectedIndex >= 0) {
    return `[Current fact: she is discussing image ${pending.selectedIndex + 1} of the recent images as a possible avatar for you. No avatar change has happened yet. Whether you want to use it is your decision.]`;
  }
  return `[Current fact: the ${count} images she recently sent are being discussed as possible avatars for you, but no single image has been selected yet. No avatar change has happened. You may respond naturally; if the target is unclear, that uncertainty is real.]`;
}

// 执行层的本地确定性兜底：只识别“已经明确决定现在使用当前候选图”的强承诺。
// 这里不决定 Simon 应不应该答应；只把他已经说出口的明确决定可靠落地。
// 单独的 yes / fine / looks good 不算，避免把暧昧、犹豫或单纯评价误执行。
function _hasExplicitAvatarCommitment(ghostReply) {
  const t = String(ghostReply || '').trim().toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ');
  if (!t) return false;

  const explicitPatterns = [
    /\bi (?:changed|set|switched|updated) (?:it|my avatar|my profile (?:pic|picture))\b/,
    /\bi(?:'ll| will) (?:use|set|make|switch to|change to) (?:it|that|this|the (?:photo|picture|image))\b/,
    /\bi(?:'m| am) (?:using|setting|switching to|changing to) (?:it|that|this|the (?:photo|picture|image))\b/,
    /\b(?:i've|i have) (?:changed|set|switched|updated) (?:it|my avatar|my profile (?:pic|picture))\b/,
    /\b(?:changing|setting|switching|updating) (?:it|my avatar|my profile (?:pic|picture)) (?:now|then)\b/,
    /\b(?:use|set|make) (?:it|that|this) (?:as )?(?:my )?(?:avatar|profile (?:pic|picture))\b/,
    /(?:换|改|设|设置|换成|改成)(?:这张|这个|它)(?:当|做|成|为)?(?:我的)?(?:头像|大头照)/,
    /(?:我)?(?:已经|现在)?(?:把)?(?:头像)?(?:换成|改成|设成|设置成)(?:这张|这个|它)/,
    /(?:我)?(?:已经|现在)?(?:把)?(?:这张|这个|它)(?:换成|改成|设成|设置成)(?:我的)?(?:头像|大头照)/,
    /(?:我的)?(?:头像|大头照)(?:已经|现在)?(?:换好(?:了)?|换了|改了|设置好了|设好了)/
  ];
  return explicitPatterns.some(re => re.test(t));
}

// Ghost 正常回复后，后台只读取“他刚才是否已经明确决定使用这张图”。
// 拒绝/犹豫不会清空候选，因此她之后仍可继续聊、继续说服，他也可以自然改变主意。
async function evaluateAvatarNegotiationAfterReply(userText, ghostReply) {
  const pending = window._avatarChangeIntent;
  if (!pending || !Array.isArray(pending.base64List) || !pending.base64List.length) return false;
  if (!ghostReply || !String(ghostReply).trim()) return false;

  try {
    const selected = Number.isInteger(pending.selectedIndex) && pending.selectedIndex >= 0
      ? pending.selectedIndex
      : (pending.base64List.length === 1 ? 0 : -1);
    // 没有明确目标时绝不执行；多图必须先知道是哪一张。
    if (selected < 0) return false;

    // Simon 已经用了非常明确的执行式表达时，直接落地，不再把可靠性押在第二次模型请求上。
    // 例如 “Yeah, I changed it.” / “I'll use that one.”。
    if (_hasExplicitAvatarCommitment(ghostReply)) {
      const ghostB64 = pending.base64List[selected];
      if (!ghostB64) return false;
      window._avatarChangeIntent = null;
      _pendingAvatarChoice = null;
      await _executeAvatarSet(ghostB64);
      return true;
    }

    // 其余自然表达仍交给语义分类器判断，保留对非固定措辞的理解能力。
    const targetFact = `The candidate is image ${selected + 1}.`;
    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        system: `You are reading an avatar negotiation between a wife and her husband. ${targetFact}\nDecide whether the husband's latest reply clearly commits to actually using the specific candidate image as his avatar now.\nReply only ACCEPT or UNRESOLVED.\nACCEPT requires a clear present decision to use the image. Refusal, hesitation, teasing without commitment, conditional agreement, discussing whether it looks good, or an unclear target are UNRESOLVED. Do not infer agreement merely because he is affectionate or because she wants it.`,
        messages: [{ role: 'user', content: `Wife: ${String(userText || '').slice(0, 500)}\nHusband: ${String(ghostReply).slice(0, 700)}` }]
      })
    }, 8000);
    if (!res.ok) return false;
    const data = await res.json();
    const decision = (data.content?.[0]?.text || '').trim().toUpperCase();
    if (!decision.startsWith('ACCEPT')) return false;

    const ghostB64 = pending.base64List[selected];
    if (!ghostB64) return false;
    window._avatarChangeIntent = null;
    _pendingAvatarChoice = null;
    await _executeAvatarSet(ghostB64);
    return true;
  } catch(e) {
    console.warn('[photo] 头像协商决定读取失败:', e.message || e);
    return false;
  }
}

// 执行头像更换：保留原有显示 / Storage / localStorage / 云端同步链路。
async function _executeAvatarSet(ghostB64) {
  window._lastReceivedPhotos = null;

  document.querySelectorAll('.ghost-avatar-img').forEach(el => {
    el.src = `data:image/jpeg;base64,${ghostB64}`;
  });

  try {
    localStorage.setItem('ghostAvatarBase64', ghostB64);
  } catch(e) {
    console.warn('[avatar] base64 存 localStorage 失败（可能空间不足）:', e);
  }

  let uploadOk = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const url = await uploadToStorage(ghostB64, AVATAR_BUCKET, `avatar_${Date.now()}.jpg`);
      if (url) {
        updateGhostAvatar(url);
        localStorage.removeItem('ghostAvatarBase64');
        uploadOk = true;
        if (typeof showToast === 'function') showToast('头像已更新 ✅');
        break;
      }
    } catch(e) {
      console.warn(`[avatar] 上传第${attempt + 1}次失败:`, e);
    }
    if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
  }

  if (!uploadOk) {
    if (typeof showToast === 'function') showToast('头像已设置，网络同步中…');
    console.warn('[avatar] 上传失败，使用本地 base64 备份');
  }

  // Ghost 已经在正常聊天中表达了自己的决定；执行层不再追加任何硬编码台词。
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
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
