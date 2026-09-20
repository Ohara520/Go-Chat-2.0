// ===================================================
// worldbook.js — 轻量世界书（关键词检索记忆）
// 作用：用户提到某关键词时，自动把相关设定/旧话题注入 prompt，
//       补足 recallLongTermMemory 的中英不匹配、只字面匹配的短板。
// 依赖：无（纯 localStorage）。被 persona.js 调用。
// 数据：localStorage['worldBook'] = 条目数组
//   { id, keywords:[触发词...], content:"要注入的记忆", enabled:true,
//     source:'manual'|'auto', created:ts, lastHit:ts }
// ===================================================

function _wbLoad() {
  try {
    const arr = JSON.parse(localStorage.getItem('worldBook') || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function _wbSave(arr) {
  const trimmed = Array.isArray(arr) ? arr.slice(0, 100) : [];
  localStorage.setItem('worldBook', JSON.stringify(trimmed));
  if (typeof touchLocalState === 'function') touchLocalState();
}

// 新增/更新一条世界书。keywords 可传数组或逗号分隔字符串。
function addWorldBookEntry({ keywords, content, source = 'manual', id = null }) {
  if (!content || !content.trim()) return null;
  const kw = (Array.isArray(keywords) ? keywords : String(keywords || '').split(/[,，、\s]+/))
    .map(k => k.trim().toLowerCase()).filter(Boolean);
  if (kw.length === 0) return null;

  const arr = _wbLoad();
  if (id) {
    const idx = arr.findIndex(e => e.id === id);
    if (idx !== -1) {
      arr[idx].keywords = kw;
      arr[idx].content = content.trim();
      _wbSave(arr);
      return arr[idx];
    }
  }
  // content 去重：同内容不重复存
  if (arr.some(e => e.content.trim().toLowerCase() === content.trim().toLowerCase())) return null;

  const entry = {
    id: `wb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    keywords: kw,
    content: content.trim(),
    enabled: true,
    source,
    created: Date.now(),
    lastHit: 0,
  };
  arr.push(entry);
  _wbSave(arr);
  return entry;
}

function removeWorldBookEntry(id) {
  const arr = _wbLoad().filter(e => e.id !== id);
  _wbSave(arr);
}

function setWorldBookEnabled(id, enabled) {
  const arr = _wbLoad();
  const e = arr.find(x => x.id === id);
  if (e) { e.enabled = !!enabled; _wbSave(arr); }
}

function getWorldBookEntries() {
  return _wbLoad();
}

// 核心：按用户消息检索命中的世界书条目，返回注入 prompt 的文本。
// CJK 无空格，用双向 includes：关键词在消息里，或消息里出现关键词。
function recallWorldBook(userMessage, limit = 4) {
  const arr = _wbLoad();
  if (arr.length === 0 || !userMessage) return '';
  const msg = userMessage.toLowerCase();

  const hits = [];
  for (const e of arr) {
    if (e.enabled === false) continue;
    const matched = (e.keywords || []).some(k => k && msg.includes(k));
    if (matched) hits.push(e);
  }
  if (hits.length === 0) return '';

  // 最近命中过的排后面，给较少出现的设定让位，避免每轮都是同几条
  hits.sort((a, b) => (a.lastHit || 0) - (b.lastHit || 0));
  const picked = hits.slice(0, limit);

  const now = Date.now();
  picked.forEach(p => {
    const ref = arr.find(x => x.id === p.id);
    if (ref) ref.lastHit = now;
  });
  _wbSave(arr);

  const lines = picked.map(p => `- ${p.content}`).join('\n');
  return `\n[WORLD BOOK — recalled by keyword]\nRelevant things you know, brought up by what she just said. Weave in naturally only if it fits — do not recite:\n${lines}\n`;
}

// ===================================================
// UI —— 记忆世界书面板（沿用 index.html 玻璃拟态绿色风格）
// ===================================================

function _wbEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderWorldBook() {
  const box = document.getElementById('worldBookList');
  if (!box) return;
  const arr = getWorldBookEntries();

  if (arr.length === 0) {
    box.innerHTML = `<div style="text-align:center;color:#9cc38f;font-size:13px;padding:40px 16px;line-height:1.9;">
      还没有记忆条目<br>点上面「＋ 添加记忆」写第一条吧</div>`;
    return;
  }

  // 手动的排前面，其次按创建时间倒序
  const sorted = arr.slice().sort((a, b) =>
    (a.source === b.source ? (b.created || 0) - (a.created || 0) : (a.source === 'manual' ? -1 : 1)));

  box.innerHTML = sorted.map(e => {
    const kw = (e.keywords || []).map(k =>
      `<span style="display:inline-block;background:rgba(90,154,70,0.14);color:#2d6028;font-size:11px;
        padding:2px 9px;border-radius:10px;margin:0 5px 5px 0;">${_wbEsc(k)}</span>`).join('');
    const badge = e.source === 'auto'
      ? `<span style="font-size:10px;color:#a0a0a0;background:rgba(0,0,0,0.05);padding:1px 7px;border-radius:8px;">自动</span>`
      : `<span style="font-size:10px;color:#5a9a46;background:rgba(90,154,70,0.12);padding:1px 7px;border-radius:8px;">手动</span>`;
    const off = e.enabled === false;
    return `<div style="background:rgba(255,255,255,${off ? 0.35 : 0.6});backdrop-filter:blur(14px);
      border-radius:16px;padding:13px 15px;border:1px solid rgba(255,255,255,0.85);margin-bottom:11px;
      opacity:${off ? 0.6 : 1};">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        ${badge}
        <div style="flex:1;"></div>
        <button onclick="setWorldBookEnabled('${e.id}', ${off}); renderWorldBook();"
          style="border:none;background:none;cursor:pointer;font-size:12px;color:${off ? '#9cc38f' : '#5a9a46'};font-weight:600;">
          ${off ? '已关闭' : '开启中'}</button>
        <button onclick="openWorldBookEditor('${e.id}')"
          style="border:none;background:none;cursor:pointer;font-size:12px;color:#5a8a4a;">编辑</button>
        <button onclick="if(confirm('删除这条记忆？')){removeWorldBookEntry('${e.id}');renderWorldBook();}"
          style="border:none;background:none;cursor:pointer;font-size:12px;color:#c76a6a;">删除</button>
      </div>
      <div style="font-size:13.5px;color:#1e3d20;line-height:1.6;margin-bottom:9px;">${_wbEsc(e.content)}</div>
      <div>${kw}</div>
    </div>`;
  }).join('');
}

function openWorldBookEditor(id = null) {
  const modal = document.getElementById('worldBookEditor');
  const titleEl = document.getElementById('wbEditorTitle');
  const idEl = document.getElementById('wbEditId');
  const kwEl = document.getElementById('wbEditKeywords');
  const contentEl = document.getElementById('wbEditContent');
  if (!modal) return;

  if (id) {
    const e = getWorldBookEntries().find(x => x.id === id);
    if (e) {
      titleEl.textContent = '编辑记忆';
      idEl.value = e.id;
      kwEl.value = (e.keywords || []).join(', ');
      contentEl.value = e.content || '';
    }
  } else {
    titleEl.textContent = '添加记忆';
    idEl.value = '';
    kwEl.value = '';
    contentEl.value = '';
  }
  modal.style.display = 'flex';
}

function closeWorldBookEditor() {
  const modal = document.getElementById('worldBookEditor');
  if (modal) modal.style.display = 'none';
}

function saveWorldBookFromEditor() {
  const id = document.getElementById('wbEditId').value || null;
  const keywords = document.getElementById('wbEditKeywords').value;
  const content = document.getElementById('wbEditContent').value;

  if (!content.trim()) { alert('写点记忆内容吧'); return; }
  if (!keywords.trim()) { alert('至少写一个触发关键词'); return; }

  const saved = addWorldBookEntry({ keywords, content, source: 'manual', id });
  if (!saved && !id) { alert('这条记忆已经存在啦'); return; }

  closeWorldBookEditor();
  renderWorldBook();
}
