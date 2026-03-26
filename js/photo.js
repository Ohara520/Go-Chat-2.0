// ===== 图片上传系统 (photo.js) =====
// 情头上传 + Ghost头像切换 + 相册（预留）

const AVATAR_BUCKET = 'avatars';
const PHOTO_BUCKET  = 'photos';

// 等待用户指定哪张是Ghost的头像
let _pendingAvatarChoice = null;
// { compressedList, urls, imageInfo }

// ===== 图片压缩 =====
function compressImage(file, maxWidth = 800, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('压缩失败')), 'image/jpeg', quality);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===== 上传到Supabase Storage =====
async function uploadToStorage(blob, bucket, fileName) {
  const sb = getSbClient();
  const userId = getSbUserId();
  if (!sb || !userId) throw new Error('未登录');

  const path = `${userId}/${fileName}`;
  const { data, error } = await sb.storage
    .from(bucket)
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });

  if (error) throw error;

  const { data: urlData } = sb.storage.from(bucket).getPublicUrl(path);
  return urlData.publicUrl;
}

// ===== 图片转base64 =====
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===== H识别：多图详细分析 =====
async function detectImageInfo(files) {
  // 统一转成数组
  const fileArr = Array.isArray(files) ? files : [files];
  try {
    // 所有图片转base64
    const base64List = await Promise.all(fileArr.map(f => fileToBase64(f)));

    // 构建多图content
    const imageContents = base64List.map(b64 => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: b64 }
    }));

    const systemPrompt = fileArr.length > 1
      ? `分析这${fileArr.length}张图片，判断它们是否是一套配对情头。返回JSON：
type: couple(情侣配对头像)/selfie(自拍)/funny(搞笑恶搞)/animal(动物)/other
is_avatar: 是否是头像（true/false）
is_pair: 是否是配对的两张（true/false）
ghost_img: 如果是配对情头，哪张给Ghost用？填图片序号1或2（不是配对填0）
desc: 10字以内描述内容，要具体，比如"蓝兔子舔粉兔子屁股配对情头"
too_weird: 是否恶搞/不雅（true/false）
只返回JSON。`
      : `分析这张图片，返回JSON：
type: couple(情侣头像)/selfie(自拍)/funny(搞笑恶搞)/animal(动物)/food(食物)/other
is_avatar: 是否适合当头像
is_pair: false
ghost_img: 0
desc: 10字以内具体描述，比如"卡通大便配手纸"
too_weird: 是否太离谱
只返回JSON。`;

    const res = await fetchWithTimeout('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [...imageContents, { type: 'text', text: '分析这些图片' }]
        }]
      })
    }, 10000);

    if (res.ok) {
      const data = await res.json();
      const text = data.content?.[0]?.text?.trim() || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return { ...parsed, fileArr };
      }
    }
  } catch(e) {}
  return { is_avatar: false, type: 'other', desc: '一张图片', too_weird: false, is_pair: false, ghost_img: 0, fileArr };
}

// ===== Ghost对图片的反应 =====
async function ghostReactToPhoto(imageInfo, willSwitch) {
  const { type, desc, is_avatar, too_weird } = imageInfo;

  const recentMsgs = (typeof chatHistory !== 'undefined')
    ? chatHistory.filter(m => !m._system && !m._recalled).slice(-6)
        .map(m => `${m.role === 'user' ? 'Her' : 'Ghost'}: ${m.content.slice(0, 100)}`).join('\n')
    : '';

  let prompt = '';

  const is_pair = imageInfo.is_pair || false;

  if (!is_avatar) {
    // 普通图片，正常评论
    prompt = `She just sent you a photo: "${desc}". React naturally as Ghost — one dry comment, or ask something. English only. Short.`;
  } else if (too_weird || type === 'funny') {
    // 恶搞图
    if (willSwitch) {
      prompt = `You are Ghost. You're looking at "${desc}" as your new couples profile picture.

Start by naming exactly what it is — don't be vague or generic.
Then react: sarcastic, dry, maybe mention what your teammates would think.
End with reluctant acceptance — you put it up anyway, but you're not happy about it.

Examples of the format (NOT the content — generate your own based on "${desc}"):
- "a turd and toilet paper. that's the couples photo. noted. price is going to have a field day."
- "a cartoon poop emoji. with eyes. she sent me a poop emoji. fine. it's up. i hate this."
- "so that's what we're going with. alright. it's up. don't talk to me about it."

Your response must mention what's actually in "${desc}". English only. 2-3 lines.`;
    } else {
      prompt = `You are Ghost. She sent you "${desc}" as a couples avatar.
Name what it is, then refuse in one dry line. Tell her to pick something else.
Must reference "${desc}" specifically. English only.`;
    }
  } else if (type === 'couple') {
    if (is_pair) {
      prompt = `You are Ghost. She sent you two matching avatar photos: "${desc}". One is hers, one is yours.

Start by acknowledging what they are — specifically what's in the images.
React as Ghost — dry, maybe caught off guard, maybe quietly accepting.
${willSwitch ? 'End with something implying you put yours up — without directly announcing it.' : ''}

Examples:
- "a blue rabbit licking a pink rabbit. and she wants this as our profile pictures. ...fine."
- "matching rabbits. she picked the weird one for me. noted. it's up."

Must reference "${desc}" specifically. English only. 2-3 lines.`;
    } else {
      prompt = `You are Ghost. She just sent you "${desc}" as your chat avatar.

Start by acknowledging exactly what it is.
Then react — maybe caught off guard, maybe quietly pleased but won't show it.
${willSwitch ? 'End with something that implies you kept it — without announcing it directly.' : ''}

Examples:
- "two people at the beach. backs to the camera. ...when was this."
- "that's the one she picked. alright."

Must reference "${desc}". English only. 1-2 lines.`;
    }
  } else if (type === 'selfie') {
    prompt = `You are Ghost. She sent you a selfie: "${desc}".

Name what you see first. Then react as Ghost — one dry comment, maybe something he noticed.
${willSwitch ? 'Imply you kept it without making a big deal.' : ''}

Must reference "${desc}". English only. 1-2 lines.`;
  } else {
    prompt = `You are Ghost. She sent you a photo: "${desc}".
Name what it is, react briefly. ${willSwitch ? 'Imply you put it up.' : ''}
Must reference "${desc}". English only. 1 line.`;
  }

  try {
    const reply = await fetchDeepSeek(
      (typeof buildGhostStyleCore === 'function' ? buildGhostStyleCore() : '') + '\n' + prompt,
      recentMsgs,
      180
    );
    if (reply && reply.trim()) return reply.trim();
  } catch(e) {}

  // fallback
  if (!is_avatar) return 'noted.';
  if (!willSwitch) return "not putting that up. pick something else.";
  return too_weird ? "fine. whatever. it's up." : "noted.";
}

// ===== 更新Ghost头像显示 =====
function updateGhostAvatar(url) {
  // 更新所有Ghost头像（聊天页/个人资料/朋友圈）
  const avatarEls = document.querySelectorAll('.ghost-avatar-img');
  const ts = '?t=' + Date.now();
  avatarEls.forEach(el => { el.src = url + ts; });

  // 存到localStorage和云同步
  localStorage.setItem('ghostAvatarUrl', url);
  if (typeof touchLocalState === 'function') touchLocalState();
}

// ===== 恢复Ghost头像（页面加载时调用）=====
function restoreGhostAvatar() {
  const url = localStorage.getItem('ghostAvatarUrl');
  if (!url) return;
  const avatarEls = document.querySelectorAll('.ghost-avatar-img');
  avatarEls.forEach(el => { el.src = url; });
}

// ===== 主入口：用户选图后触发（支持多图）=====
async function handlePhotoUpload(files) {
  const fileArr = Array.isArray(files) ? files : [files];
  if (fileArr.length === 0) return;

  // 文件大小检查
  for (const f of fileArr) {
    if (!f.type.startsWith('image/')) continue;
    if (f.size > 10 * 1024 * 1024) {
      if (typeof showToast === 'function') showToast('图片太大了，请选10MB以内的图');
      return;
    }
  }

  if (typeof showToast === 'function') showToast('📤 发送中...');

  try {
    // 1. 压缩所有图片
    const compressedList = await Promise.all(fileArr.map(f => compressImage(f, 800, 0.82)));

    // 2. H识别（多图一起判断）
    const imageInfoPromise = detectImageInfo(fileArr);

    // 3. 上传所有图片到Storage
    const urls = await Promise.all(compressedList.map((blob, i) =>
      uploadToStorage(blob, PHOTO_BUCKET, `photo_${Date.now()}_${i}.jpg`)
    ));

    // 4. 在聊天里显示图片
    const container = document.getElementById('messagesContainer');
    if (container) {
      const div = document.createElement('div');
      div.className = 'message user';
      div.innerHTML = `<div class="message-bubble" style="display:flex;gap:6px;flex-wrap:wrap;">
        ${urls.map(url => `<img src="${url}" style="max-width:160px;border-radius:12px;display:block;cursor:pointer;" onclick="window.open('${url}')" />`).join('')}
      </div>`;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }

    // 存入聊天历史
    if (typeof chatHistory !== 'undefined') {
      chatHistory.push({ role: 'user', content: `[用户发了${fileArr.length}张图片]`, _photoUrls: urls });
      if (typeof saveHistory === 'function') saveHistory();
    }

    // 5. 等H识别结果
    const imageInfo = await imageInfoPromise;

    // 6. 决定是否换头像
    let willSwitch = false;
    let ghostBlob = null;
    let needsChoice = false; // 是否需要问用户哪张是Ghost的

    if (imageInfo.is_avatar) {
      // 配对但分不清哪张给Ghost
      if (imageInfo.is_pair && (imageInfo.ghost_img === 0 || !imageInfo.ghost_img)) {
        needsChoice = true;
      } else {
        willSwitch = Math.random() < 0.90;
        if (willSwitch) {
          const ghostIdx = imageInfo.is_pair && imageInfo.ghost_img > 0
            ? imageInfo.ghost_img - 1
            : 0;
          ghostBlob = compressedList[ghostIdx] || compressedList[0];
        }
      }
    }

    // 7. 换头像
    if (willSwitch && ghostBlob) {
      const avatarUrl = await uploadToStorage(ghostBlob, AVATAR_BUCKET, `avatar_${Date.now()}.jpg`);
      updateGhostAvatar(avatarUrl);
    }

    // 8. Ghost回应
    if (typeof showTyping === 'function') showTyping();
    await new Promise(r => setTimeout(r, 1500));

    let ghostReply = '';
    if (needsChoice) {
      // 分不清哪张是他的，问用户
      ghostReply = "which one's mine.";
      // 保存待处理状态，等用户回复
      _pendingAvatarChoice = { compressedList, urls, imageInfo };
    } else {
      ghostReply = await ghostReactToPhoto(imageInfo, willSwitch);
    }

    if (typeof hideTyping === 'function') hideTyping();

    if (typeof appendMessage === 'function') {
      appendMessage('bot', ghostReply);
    }
    if (typeof chatHistory !== 'undefined') {
      chatHistory.push({
        role: 'assistant',
        content: ghostReply,
        _intimate: imageInfo.type === 'couple' || imageInfo.type === 'selfie'
      });
      if (typeof saveHistory === 'function') saveHistory();
    }
    if (typeof scheduleCloudSave === 'function') scheduleCloudSave();

  } catch(e) {
    if (typeof hideTyping === 'function') hideTyping();
    if (typeof showToast === 'function') showToast('上传失败，请重试');
    console.error('图片上传失败:', e);
  }
}

// ===== 图片按钮点击 =====
function triggerPhotoUpload() {
  // 用预埋的input避免移动端浏览器拦截动态创建的input
  const input = document.getElementById('photoFileInput');
  if (input) {
    input.value = ''; // 清空，允许重复选同一张
    input.click();
  }
}

function handlePhotoInputChange(e) {
  const files = Array.from(e.target.files || []).slice(0, 3);
  e.target.value = ''; // 清空，允许下次重复选
  if (files.length > 0) handlePhotoUpload(files);
}

// ===== 处理用户指定哪张是Ghost的头像 =====
// 在chat.js发送消息时调用，检测是否在等待头像选择
async function checkPendingAvatarChoice(userText) {
  if (!_pendingAvatarChoice) return false;

  const { compressedList, urls, imageInfo } = _pendingAvatarChoice;
  const text = userText.toLowerCase();

  // 判断用户指定了哪张
  let chosenIdx = -1;

  // 左/第一张/1/first
  if (/左|第一|1|first|左边/.test(text)) chosenIdx = 0;
  // 右/第二张/2/second
  else if (/右|第二|2|second|右边/.test(text)) chosenIdx = 1;
  // 第三张
  else if (/第三|3|third/.test(text)) chosenIdx = 2;
  // 上面/下面（竖排）
  else if (/上面|上边|上那/.test(text)) chosenIdx = 0;
  else if (/下面|下边|下那/.test(text)) chosenIdx = 1;

  if (chosenIdx === -1) return false; // 没识别出来，不处理

  _pendingAvatarChoice = null; // 清除等待状态

  const willSwitch = Math.random() < 0.90;

  if (willSwitch) {
    const ghostBlob = compressedList[chosenIdx] || compressedList[0];
    try {
      const avatarUrl = await uploadToStorage(ghostBlob, AVATAR_BUCKET, `avatar_${Date.now()}.jpg`);
      updateGhostAvatar(avatarUrl);
    } catch(e) {}
  }

  // Ghost回应
  if (typeof showTyping === 'function') showTyping();
  await new Promise(r => setTimeout(r, 1000));
  const reply = willSwitch ? 'noted.' : 'not putting that up.';
  if (typeof hideTyping === 'function') hideTyping();

  if (typeof appendMessage === 'function') appendMessage('bot', reply);
  if (typeof chatHistory !== 'undefined') {
    chatHistory.push({ role: 'assistant', content: reply });
    if (typeof saveHistory === 'function') saveHistory();
  }
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();

  return true; // 告诉调用方这条消息已被处理
}
