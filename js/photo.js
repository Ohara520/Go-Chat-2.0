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

// ===== 更新Ghost头像 =====
function updateGhostAvatar(url) {
  document.querySelectorAll('.ghost-avatar-img').forEach(el => {
    el.src = url + (url.startsWith('data:') ? '' : '?t=' + Date.now());
  });
  if (!url.startsWith('data:')) {
    localStorage.setItem('ghostAvatarUrl', url);
    if (typeof touchLocalState === 'function') touchLocalState();

    // ✅ 同步写入Supabase数据库，换设备也不丢
    saveAvatarUrlToProfile(url);
  }
}

// ===== 恢复Ghost头像（优先从数据库读，保证多设备同步）=====
async function restoreGhostAvatar() {
  // 先用localStorage快速显示（避免白屏）
  const cached = localStorage.getItem('ghostAvatarUrl');
  if (cached) {
    document.querySelectorAll('.ghost-avatar-img').forEach(el => { el.src = cached; });
  }

  // 再从Supabase拉最新（换设备/清缓存也能恢复）
  try {
    const sb = typeof getSbClient === 'function' ? getSbClient() : null;
    const userId = typeof getSbUserId === 'function' ? getSbUserId() : null;
    if (!sb || !userId) return;

    const { data: row } = await sb
      .from('user_data')
      .select('profile')
      .eq('user_id', userId)
      .single();

    const url = row?.profile?.ghostAvatarUrl;
    if (url) {
      localStorage.setItem('ghostAvatarUrl', url);
      document.querySelectorAll('.ghost-avatar-img').forEach(el => { el.src = url; });
      console.log('[avatar] 从数据库恢复头像:', url);
    }
  } catch(e) {}

  // 2秒后再执行一次，防止被loadFromCloud覆盖
  setTimeout(async () => {
    const url = localStorage.getItem('ghostAvatarUrl');

    if (url && !url.startsWith('data:')) {
      // 有正式URL：确保DOM显示正确
      document.querySelectorAll('.ghost-avatar-img').forEach(el => {
        if (el.src !== url) el.src = url + '?t=' + Date.now();
      });
    } else {
      // 没有正式URL：检查是否有base64备份，有的话重试上传
      const b64 = localStorage.getItem('ghostAvatarBase64');
      if (b64) {
        console.log('[avatar] 检测到未上传的base64备份，重试上传...');
        // 先把base64显示出来
        const dataUrl = `data:image/jpeg;base64,${b64}`;
        document.querySelectorAll('.ghost-avatar-img').forEach(el => { el.src = dataUrl; });
        // 重试上传
        try {
          const retryUrl = await uploadToStorage(b64, AVATAR_BUCKET, `avatar_retry_${Date.now()}.jpg`);
          if (retryUrl) {
            updateGhostAvatar(retryUrl); // 更新DOM + localStorage + 写数据库
            localStorage.removeItem('ghostAvatarBase64'); // 上传成功，清除备份
            console.log('[avatar] 重试上传成功:', retryUrl);
          }
        } catch(e) {
          console.warn('[avatar] 重试上传失败，继续用base64显示');
        }
      }
    }
  }, 2000);
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

    // 4. photoHint — 模型只负责聊天，不判断头像，不自动换头像
    // 换头像只通过用户明确命令触发（checkAvatarCommand）
    const isTwoPhotos = base64List.length > 1;
    const photoHint = `[You just received ${isTwoPhotos ? 'two photos' : 'a photo'} from her.
React as Ghost. One line. Your honest first reaction to what you see.
IMPORTANT: You have NO ability to change avatars or profile pictures. You CANNOT set, update, or switch any avatar. Only she can trigger that by telling you to use it as an avatar. Do NOT say "I'll set this", "done, changed it", "avatar updated", or anything implying you performed an action. If the photo looks like a couple avatar, you may comment on it — but NEVER claim you are setting it.
English only. No translation. No AVATAR_SET tag.]`;

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

    const lastUserText = cleanMsgs.filter(m => m.role === 'user').slice(-1)[0]?.content || 'here.';
    const msgsWithPhoto = [
      ...cleanMsgs.filter(m => m.content && !m.content.includes('[用户发了')).slice(0, -1),
      {
        role: 'user',
        content: [...imageContents, { type: 'text', text: lastUserText }]
      }
    ];

    let reply = '';

    // 主模型直接看图回复
    try {
      const sRes = await fetchWithTimeout('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: typeof getMainModel === 'function' ? getMainModel() : 'claude-sonnet-4-6',
          max_tokens: 300,
          system: _sys + '\n' + photoHint,
          messages: [
            ...cleanMsgs.filter(m => m.content && !m.content.includes('[用户发了')).slice(0, -1),
            {
              role: 'user',
              content: [...imageContents, { type: 'text', text: cleanMsgs.filter(m => m.role === 'user').slice(-1)[0]?.content || '.' }]
            }
          ]
        })
      }, 30000);
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

    // 主模型失败或破防，走Grok兜底（支持识图）
    if (!reply || isBreakout(reply)) {
      try {
        const core = typeof buildGhostStyleCore === 'function' ? buildGhostStyleCore() : '';
        const grokPhotoRes = await fetchWithTimeout('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system: core + '\n' + photoHint,
            user: cleanMsgs.filter(m => m.role === 'user').slice(-1)[0]?.content || 'she sent a photo.',
            image_base64: base64List[0],
            max_tokens: 200
          })
        }, 15000);
        if (grokPhotoRes.ok) {
          const grokData = await grokPhotoRes.json();
          const grokText = grokData.text?.trim();
          // Grok 兜底也需要破防检测
          if (grokText && !isBreakout(grokText)) reply = grokText;
        } else {
          console.warn('[photo] Grok兜底返回非200:', grokPhotoRes.status);
        }
      } catch(e) {
        console.warn('[photo] Grok兜底请求失败:', e.message || e);
      }
    }

    if (!reply) reply = 'noted.';

    // AVATAR_SET 已废弃，头像只由用户明确命令触发
    reply = reply.replace(/\n?AVATAR_SET\n?/gi, '').trim();
    if (!reply) reply = 'noted.';

    if (typeof hideTyping === 'function') hideTyping();

    // 6. 显示回复
    if (typeof appendMessage === 'function') appendMessage('bot', reply);
    if (typeof chatHistory !== 'undefined') {
      chatHistory.push({ role: 'assistant', content: reply });

      // 生成图片描述（异步，不阻塞，后续对话用）
      fetchWithTimeout('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: typeof getMainModel === 'function' ? getMainModel() : 'claude-sonnet-4-5-20250929',
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
    window._lastReceivedPhotos = { base64List, isTwoPhotos };

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
    if (typeof resetSilenceTimer === 'function') resetSilenceTimer();

  } catch(e) {
    if (typeof hideTyping === 'function') hideTyping();
    if (typeof showToast === 'function') showToast('发送失败，请重试');
    console.error('图片发送失败:', e);
  }
}

// ===== 处理用户指定哪张是Ghost的 =====
async function checkPendingAvatarChoice(userText) {
  if (!_pendingAvatarChoice) return false;
  const { base64List } = _pendingAvatarChoice;
  const text = userText.toLowerCase();
  let chosenIdx = -1;
  if (/左|第一|1|first|左边|上/.test(text)) chosenIdx = 0;
  else if (/右|第二|2|second|右边|下/.test(text)) chosenIdx = 1;
  else if (/第三|3|third/.test(text)) chosenIdx = 2;
  if (chosenIdx === -1) return false;

  _pendingAvatarChoice = null;
  const ghostB64 = base64List[chosenIdx] || base64List[0];

  // 先临时显示
  updateGhostAvatar(`data:image/jpeg;base64,${ghostB64}`);

  // 异步上传并写库
  uploadToStorage(ghostB64, AVATAR_BUCKET, `avatar_${Date.now()}.jpg`).then(url => {
    if (url) updateGhostAvatar(url); // 自动调用saveAvatarUrlToProfile
  });

  if (typeof showTyping === 'function') showTyping();
  await new Promise(r => setTimeout(r, 800));
  if (typeof hideTyping === 'function') hideTyping();
  if (typeof appendMessage === 'function') appendMessage('bot', 'noted.');
  if (typeof chatHistory !== 'undefined') {
    chatHistory.push({ role: 'assistant', content: 'noted.' });
    if (typeof saveHistory === 'function') saveHistory();
  }
  return true;
}

// ===== 用户明确命令触发换头像（三层判断）=====
// 第一层：强正则 → 直接换（扩词版，覆盖常见口语）
// 第二层：弱信号（含头像相关词）+ 模型确认 → 确认后再换
// 第三层：零信号 → 完全不触发，不碰头像逻辑
async function checkAvatarCommand(userText) {
  const text = userText;

  // 有没有最近发过的图片（三层都需要，提前判断）
  const lastPhotos = window._lastReceivedPhotos;
  if (!lastPhotos || !lastPhotos.base64List || lastPhotos.base64List.length === 0) return false;

  // ── 第一层：强正则，明确意图直接换 ──
  const isStrongCommand = /用这个当头像|设为头像|换成这个|这个当(你的?)?头像|帮我换头像|给你换头像|换(一下|个)?头像|头像(就)?用这|做(你的?)?头像|当(你的?)?头像吧?|就这张|用上吧?|头像换了|头像换一下|就它了|用它吧|头像就这个|拿来当头像|当作头像|这张当头像|头像用这张|这个做头像|set.*avatar|use.*avatar|change.*avatar|make.*avatar|update.*avatar|this.*as.*avatar|avatar.*this/i.test(text);

  if (isStrongCommand) {
    return await _handleAvatarSet(lastPhotos, text);
  }

  // ── 第二层：弱信号门槛 + 模型确认 ──
  // 消息里至少沾了头像/avatar相关词，才值得问模型
  const hasWeakSignal = /头像|avatar|profile\s*pic|pfp|icon|大头|换.{0,2}(上|掉|了)|用.{0,3}(这|它|上)/i.test(text);
  if (!hasWeakSignal) return false; // 第三层：零信号，彻底跳过

  // 问模型：这句话是不是在要求换头像？
  try {
    const confirmRes = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        system: `You are a binary classifier. The user just sent a photo in a chat app. Now they sent a follow-up text message. Determine if they are asking to SET/CHANGE their avatar/profile picture to the photo they just sent.
Reply ONLY "yes" or "no". When in doubt, say "no".
Examples of YES: "头像用这个吧", "can this be my pfp", "帮我换上", "当头像", "就用它"
Examples of NO: "这个头像好丑", "你的头像是什么", "好看吗", "帮我看看这个", "头像在哪改"`,
        messages: [{ role: 'user', content: text }]
      })
    }, 8000);
    if (confirmRes.ok) {
      const confirmData = await confirmRes.json();
      const answer = (confirmData.content?.[0]?.text || '').trim().toLowerCase();
      console.log('[photo] 头像意图模型判断:', answer, '原文:', text);
      if (answer.startsWith('yes')) {
        return await _handleAvatarSet(lastPhotos, text);
      }
    }
  } catch(e) {
    console.warn('[photo] 头像意图判断请求失败:', e.message || e);
  }

  return false;
}

// 内部：执行换头像流程（单张直接换，多张选或问）
async function _handleAvatarSet(lastPhotos, text) {
  const { base64List, isTwoPhotos } = lastPhotos;

  // 单张图 → 直接换
  if (!isTwoPhotos) {
    await _executeAvatarSet(base64List[0]);
    return true;
  }

  // 两张图 → 看用户有没有指定哪张
  let chosenIdx = -1;
  if (/左|第一|1张|first|left|上面|黑|深色|暗/.test(text)) chosenIdx = 0;
  else if (/右|第二|2张|second|right|下面|白|浅色|亮/.test(text)) chosenIdx = 1;

  if (chosenIdx !== -1) {
    await _executeAvatarSet(base64List[chosenIdx] || base64List[0]);
    return true;
  }

  // 没有指定哪张 → Ghost 问 which one
  _pendingAvatarChoice = { base64List };
  if (typeof showTyping === 'function') showTyping();
  await new Promise(r => setTimeout(r, 600));
  if (typeof hideTyping === 'function') hideTyping();
  const q = 'which one.';
  if (typeof appendMessage === 'function') appendMessage('bot', q);
  if (typeof chatHistory !== 'undefined') {
    chatHistory.push({ role: 'assistant', content: q });
    if (typeof saveHistory === 'function') saveHistory();
  }
  return true;
}

// 执行头像更换
async function _executeAvatarSet(ghostB64) {
  window._lastReceivedPhotos = null; // 用完清掉

  document.querySelectorAll('.ghost-avatar-img').forEach(el => {
    el.src = `data:image/jpeg;base64,${ghostB64}`;
  });
  localStorage.setItem('ghostAvatarBase64', ghostB64);

  uploadToStorage(ghostB64, AVATAR_BUCKET, `avatar_${Date.now()}.jpg`).then(url => {
    if (url) {
      updateGhostAvatar(url);
      localStorage.removeItem('ghostAvatarBase64');
      if (typeof showToast === 'function') showToast('头像已更新 ✅');
    }
  });

  if (typeof showTyping === 'function') showTyping();
  await new Promise(r => setTimeout(r, 600));
  if (typeof hideTyping === 'function') hideTyping();
  const reply = 'done.';
  if (typeof appendMessage === 'function') appendMessage('bot', reply);
  if (typeof chatHistory !== 'undefined') {
    chatHistory.push({ role: 'assistant', content: reply });
    if (typeof saveHistory === 'function') saveHistory();
  }
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

// ===== 检测是否想重新换头像 =====
async function checkAvatarReplace(userText) {
  const text = userText.toLowerCase();

  // 检测换头像意图
  const wantReplace = /换错了|换另.个|不喜欢这个|换一张|重新换|换回|换个别的|这个不好|不要这个|换掉|switch.*avatar|change.*avatar|different.*avatar|want.*change/i.test(text);
  if (!wantReplace) return false;

  // 有没有之前存的图片可以重新选
  const lastPhotoMsg = typeof chatHistory !== 'undefined'
    ? chatHistory.filter(m => m.role === 'user' && m._photoBase64 && m._photoBase64.length > 0).slice(-1)[0]
    : null;

  if (!lastPhotoMsg) return false; // 没有之前的图片，走正常流程

  const base64List = lastPhotoMsg._photoBase64;

  // Ghost回应
  if (typeof showTyping === 'function') showTyping();
  await new Promise(r => setTimeout(r, 800));

  let reply = '';
  if (base64List.length > 1) {
    // 多张图，问用户要哪张
    reply = "which one.";
    _pendingAvatarChoice = { base64List };
  } else {
    // 只有一张，直接换
    const ghostB64 = base64List[0];
    updateGhostAvatar(`data:image/jpeg;base64,${ghostB64}`);
    uploadToStorage(ghostB64, AVATAR_BUCKET, `avatar_${Date.now()}.jpg`).then(url => {
      if (url) updateGhostAvatar(url); // 自动调用saveAvatarUrlToProfile
    });
    reply = "changed.";
    // avatarRequestPending 已废弃，换头像改由模型通过AVATAR_SET决定
  }

  if (typeof hideTyping === 'function') hideTyping();
  if (typeof appendMessage === 'function') appendMessage('bot', reply);
  if (typeof chatHistory !== 'undefined') {
    chatHistory.push({ role: 'assistant', content: reply });
    if (typeof saveHistory === 'function') saveHistory();
  }
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
  return true;
}
