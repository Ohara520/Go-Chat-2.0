// ===== 图片系统 (photo.js) =====
// 简化版：图片直接传给模型看，Storage异步上传

const AVATAR_BUCKET = 'avatars';
const PHOTO_BUCKET  = 'photos';

let _pendingAvatarChoice = null;

// ===== 图片压缩（输入dataURL，输出base64）=====
function compressImageToBase64(dataUrl, maxWidth = 800, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed.split(',')[1]);
    };
    img.onerror = reject;
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

// ===== 更新Ghost头像 =====
function updateGhostAvatar(url) {
  document.querySelectorAll('.ghost-avatar-img').forEach(el => {
    el.src = url + (url.startsWith('data:') ? '' : '?t=' + Date.now());
  });
  if (!url.startsWith('data:')) {
    localStorage.setItem('ghostAvatarUrl', url);
    if (typeof touchLocalState === 'function') touchLocalState();
  }
}

// ===== 恢复Ghost头像 =====
function restoreGhostAvatar() {
  const url = localStorage.getItem('ghostAvatarUrl');
  if (!url) return;
  document.querySelectorAll('.ghost-avatar-img').forEach(el => { el.src = url; });
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
      const b64 = await compressImageToBase64(dataUrl, 800, 0.82);
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

    // 3. 存入聊天历史（带base64供后续文字消息使用）
    if (typeof chatHistory !== 'undefined') {
      chatHistory.push({
        role: 'user',
        content: `[用户发了${base64List.length}张图片]`,
        _photoBase64: base64List // 供后续文字消息携带图片用
      });
      if (typeof saveHistory === 'function') saveHistory();
    }

    // 4. 判断场景
    const recentText = typeof chatHistory !== 'undefined'
      ? chatHistory.filter(m => !m._system && !m._recalled).slice(-20).map(m => m.content || '').join(' ')
      : '';
    // 检测情头上下文：最近20条 OR sessionStorage有标记
    const _avatarKeyword = /couple.*profile|profile.*picture|情头|换头像|couple avatar|switch.*avatar|换嘛|换一下|换个头|情侣头像|头像.*换|换.*头像/i;
    const isAvatarContext = _avatarKeyword.test(recentText) || sessionStorage.getItem('avatarRequestPending') === '1';
    // 用户提过换情头，记录pending状态
    if (_avatarKeyword.test(recentText)) sessionStorage.setItem('avatarRequestPending', '1');
    console.log('[photo] isAvatarContext:', isAvatarContext);

    const photoHint = isAvatarContext
      ? `[场景：她发来了情侣头像图片想换情头。
看图做出Ghost式真实反应：
- 说清楚你看到了什么，要具体（比如"a blue rabbit with its tongue out"不是"cute"）
- 如果图很离谱/搞笑，要吐槽那个具体的细节，干燥地嘲讽
- 可以嘴硬，但90%最终换上——如果换了，用"fine. it's up."/"already set it."/"done."等自然带出
- 只有真的不雅/色情内容才能拒绝。不能因为颜色不对、不够帅、风格不喜欢而拒绝——那种情况嘴硬吐槽完就换上。
英文回复，1-2句话，不要太礼貌，不要用"cute"这种通用词。]`
      : `[场景：她发来了图片。直接说你看到了什么，具体描述，Ghost式反应，1句话。]`;

    // 5. 发给H看图回复
    if (typeof showTyping === 'function') showTyping();

    const _sys = typeof buildSystemPrompt === 'function' ? buildSystemPrompt() : '';
    const cleanMsgs = typeof chatHistory !== 'undefined'
      ? chatHistory.filter(m => !m._system && !m._recalled).slice(-6).map(m => ({
          role: m.role,
          content: m.content?.slice(0, 150) || ''
        }))
      : [];

    // 构建带图片的最后一条消息，用实际mime类型
    const imageContents = base64List.map((b64, i) => ({
      type: 'image',
      source: { type: 'base64', media_type: items[i]?.type || 'image/jpeg', data: b64 }
    }));

    const lastUserText = cleanMsgs.filter(m => m.role === 'user').slice(-1)[0]?.content || 'here.';
    const msgsWithPhoto = [
      ...cleanMsgs.filter(m => m.content && !m.content.includes('[用户发了')).slice(0, -1),
      {
        role: 'user',
        content: [...imageContents, { type: 'text', text: lastUserText }]
      }
    ];

    let reply = '';

    // S直接看图回复（支持vision）
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
              content: [
                ...imageContents,
                { type: 'text', text: '.' }
              ]
            }
          ]
        })
      }, 20000);
      if (sRes.ok) {
        const sData = await sRes.json();
        const text = sData.content?.[0]?.text?.trim() || '';
        const isBreakout = /I'm Claude, made by|I cannot continue|I need to stop/i.test(text);
        if (!isBreakout && text) reply = text;
      }
    } catch(e) {}

    // S失败，G兜底
    if (!reply && typeof fetchDeepSeek === 'function') {
      const core = typeof buildGhostStyleCore === 'function' ? buildGhostStyleCore() : '';
      reply = await fetchDeepSeek(
        core + '\n' + photoHint + '\nRespond as Ghost. English only. Short.',
        recentText.slice(-200), 150
      ).catch(() => '');
    }

    if (!reply) reply = 'noted.';

    if (typeof hideTyping === 'function') hideTyping();

    // 6. 显示回复
    if (typeof appendMessage === 'function') appendMessage('bot', reply);
    if (typeof chatHistory !== 'undefined') {
      chatHistory.push({ role: 'assistant', content: reply });
      if (typeof saveHistory === 'function') saveHistory();
    }

    // 7. 判断是否换头像
    if (isAvatarContext) {
      // 默认换，除非明确拒绝
      const refused = /not putting|won\'t put|not happening|not doing that/i.test(reply);
      const willSwitch = !refused && Math.random() < 0.90;
      console.log('[photo] 换头像判断: refused=', refused, 'willSwitch=', willSwitch, 'reply=', reply.slice(0, 50));

      if (willSwitch) {
        // 多张图选第二张（通常是Ghost的那张），单张直接用
        const ghostIdx = base64List.length > 1 ? 1 : 0;
        const ghostB64 = base64List[ghostIdx];

        // 先用base64临时显示
        updateGhostAvatar(`data:image/jpeg;base64,${ghostB64}`);
        sessionStorage.removeItem('avatarRequestPending'); // 换上了，清除pending

        // 异步上传Storage，完成后更新为正式URL
        uploadToStorage(ghostB64, AVATAR_BUCKET, `avatar_${Date.now()}.jpg`).then(url => {
          if (url) {
            updateGhostAvatar(url);
            localStorage.setItem('ghostAvatarUrl', url);
          }
        });
      }
    }

    // 8. 异步上传所有图片到Storage，完成后更新历史记录和气泡
    const photoUrls = new Array(base64List.length).fill(null);
    const photoMsgIdx = chatHistory.length - (reply ? 2 : 1); // 找到刚存的图片消息
    const uploadPromises = base64List.map((b64, i) =>
      uploadToStorage(b64, PHOTO_BUCKET, `photo_${Date.now()}_${i}.jpg`).then(url => {
        if (url) {
          photoUrls[i] = url;
          // 更新气泡里的img src
          const imgs = container ? container.querySelectorAll(`img[src^="data:image"]`) : [];
          const targetImg = Array.from(imgs).find(img => img.src.includes(base64List[i].slice(0, 20)));
          if (targetImg) targetImg.src = url;
        }
      })
    );
    Promise.all(uploadPromises).then(() => {
      // 存入历史记录，重建时可以显示图片
      const validUrls = photoUrls.filter(Boolean);
      if (validUrls.length > 0 && typeof chatHistory !== 'undefined') {
        const msgIdx = chatHistory.findIndex(m => m.content && m.content.includes('[用户发了') && !m._photoUrls);
        if (msgIdx !== -1) {
          chatHistory[msgIdx]._photoUrls = validUrls;
          if (typeof saveHistory === 'function') saveHistory();
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
  updateGhostAvatar(`data:image/jpeg;base64,${ghostB64}`);
  uploadToStorage(ghostB64, AVATAR_BUCKET, `avatar_${Date.now()}.jpg`).then(url => {
    if (url) updateGhostAvatar(url);
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

// ===== 按钮触发 =====
function triggerPhotoUpload() {
  const input = document.getElementById('photoFileInput');
  if (input) { input.value = ''; input.click(); }
}

async function handlePhotoInputChange(e) {
  const files = Array.from(e.target.files || []).slice(0, 3);
  e.target.value = '';
  if (files.length === 0) return;
  try {
    const fileDataList = await Promise.all(files.map(f => new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = ev => res({ base64: ev.target.result.split(',')[1], type: f.type, size: f.size });
      reader.onerror = rej;
      reader.readAsDataURL(f);
    })));
    handlePhotoUpload(fileDataList);
  } catch(e) {
    if (typeof showToast === 'function') showToast('读取图片失败，请重试');
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
      if (url) updateGhostAvatar(url);
    });
    reply = "changed.";
    sessionStorage.removeItem('avatarRequestPending');
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
