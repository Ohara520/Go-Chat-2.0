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
// UI：世界书管理面板
// ===================================================

function renderWorldBook() {
  const list = document.getElementById('worldBookList');
  if (!list) return;
  const entries = getWorldBookEntries();
  if (entries.length === 0) {
    list.innerHTML = `<div style="text-align:center;color:#a8c8a0;font-size:13px;padding:40px 0;">还没有记忆条目<br>点上面「添加记忆」，或聊着聊着他会自己记住</div>`;
    return;
  }
  // 手动的排前面，其次按最近命中
  entries.sort((a, b) => {
    if ((a.source === 'manual') !== (b.source === 'manual')) return a.source === 'manual' ? -1 : 1;
    return (b.lastHit || 0) - (a.lastHit || 0);
  });
  list.innerHTML = entries.map(e => {
    const tags = (e.keywords || []).map(k =>
      `<span style="display:inline-block;background:rgba(90,160,70,0.12);color:#3d7a2d;font-size:11px;padding:2px 8px;border-radius:8px;margin:0 4px 4px 0;">${_wbEsc(k)}</span>`
    ).join('');
    const badge = e.source === 'auto'
      ? `<span style="font-size:10px;color:#a8a8a8;">自动</span>`
      : `<span style="font-size:10px;color:#7dba5a;">手动</span>`;
    const off = e.enabled === false;
    return `<div style="background:rgba(255,255,255,0.6);backdrop-filter:blur(14px);border-radius:14px;
      padding:12px 14px;border:1px solid rgba(255,255,255,0.85);margin-bottom:10px;${off ? 'opacity:0.5;' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div>${badge}</div>
        <div style="display:flex;gap:12px;">
          <span onclick="toggleWorldBookEntry('${e.id}')" style="font-size:12px;color:#7aaa7a;cursor:pointer;">${off ? '启用' : '停用'}</span>
          <span onclick="openWorldBookEditor('${e.id}')" style="font-size:12px;color:#5a9a46;cursor:pointer;">编辑</span>
          <span onclick="deleteWorldBookEntry('${e.id}')" style="font-size:12px;color:#e57373;cursor:pointer;">删除</span>
        </div>
      </div>
      <div style="margin-bottom:6px;">${tags}</div>
      <div style="font-size:13px;color:#1e3d20;line-height:1.6;">${_wbEsc(e.content)}</div>
    </div>`;
  }).join('');
}

function _wbEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function openWorldBookEditor(id) {
  const modal = document.getElementById('worldBookEditor');
  if (!modal) return;
  const titleEl = document.getElementById('wbEditorTitle');
  const idEl = document.getElementById('wbEditId');
  const kwEl = document.getElementById('wbEditKeywords');
  const cEl = document.getElementById('wbEditContent');
  if (id) {
    const e = getWorldBookEntries().find(x => x.id === id);
    if (e) {
      titleEl.textContent = '编辑记忆';
      idEl.value = e.id;
      kwEl.value = (e.keywords || []).join(', ');
      cEl.value = e.content || '';
    }
  } else {
    titleEl.textContent = '添加记忆';
    idEl.value = '';
    kwEl.value = '';
    cEl.value = '';
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
  if (!content.trim()) { if (typeof showToast === 'function') showToast('写点内容吧'); return; }
  if (!keywords.trim()) { if (typeof showToast === 'function') showToast('至少写一个关键词'); return; }
  const saved = addWorldBookEntry({ keywords, content, source: 'manual', id });
  if (!saved && !id) { if (typeof showToast === 'function') showToast('这条已经存在了'); return; }
  closeWorldBookEditor();
  renderWorldBook();
  if (typeof saveToCloud === 'function') saveToCloud().catch(() => {});
  if (typeof showToast === 'function') showToast('已保存 📖');
}

function deleteWorldBookEntry(id) {
  if (!confirm('删除这条记忆？')) return;
  removeWorldBookEntry(id);
  renderWorldBook();
  if (typeof saveToCloud === 'function') saveToCloud().catch(() => {});
}

function toggleWorldBookEntry(id) {
  const e = getWorldBookEntries().find(x => x.id === id);
  if (e) setWorldBookEnabled(id, e.enabled === false);
  renderWorldBook();
}
