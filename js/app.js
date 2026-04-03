// ===== 页面导航 =====
function openScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
    const target = document.getElementById(id);
    target.style.display = 'flex';
    target.classList.add('active');
    if (id === 'profileScreen'  && typeof initProfile       === 'function') initProfile();
    if (id === 'chatScreen'     && typeof refreshChatScreen === 'function') refreshChatScreen();
    if (id === 'coupleScreen'   && typeof initCoupleSpace   === 'function') {
      initCoupleSpace();
      localStorage.removeItem('feedHasNew');
      const badge = document.getElementById('feedNewBadge');
      if (badge) badge.style.display = 'none';
    }
    if (id === 'walletScreen'   && typeof renderWallet      === 'function') renderWallet();
    if (id === 'workScreen'     && typeof updateWorkUI      === 'function') updateWorkUI();
    if (id === 'vocabScreen'       && typeof renderVocabScreen    === 'function') renderVocabScreen();
    if (id === 'collectionScreen'  && typeof renderCollectionScreen === 'function') renderCollectionScreen();
    if (id === 'calendarScreen'     && typeof initCalendar           === 'function') initCalendar();
    if (id === 'secretScreen'       && typeof loadSecretScreen        === 'function') loadSecretScreen();
    if (id === 'marketScreen'       && typeof initMarket             === 'function') { initMarket(); checkDeliveryUpdates(); }
    if (id === 'achievementScreen'  && typeof switchAchievementTab   === 'function') switchAchievementTab('story');
}

function goBack() {
    openScreen('mainScreen');
}

// ===== 启动页 =====
function startChat() {
    const name = document.getElementById('userNameInput').value.trim();
    if (!name) {
        document.getElementById('userNameInput').placeholder = '先输入昵称哦～';
        return;
    }

    // 内测码验证
    const BETA_CODES = [
        'GHOST-A1K9','GHOST-B2M7','GHOST-C3N5','GHOST-D4P8','GHOST-E5Q2',
        'GHOST-F6R4','GHOST-G7S6','GHOST-H8T3','GHOST-I9U1','GHOST-J0V9',
        'GHOST-K1W7','GHOST-L2X5','GHOST-M3Y8','GHOST-N4Z2','GHOST-O5A6',
        'GHOST-P6B4','GHOST-Q7C3','GHOST-R8D1','GHOST-S9E7','GHOST-T0F5',
        'GHOST-U1G9','GHOST-V2H3','GHOST-W3I6','GHOST-X4J8','GHOST-Y5K2',
        'GHOST-Z6L4','GHOST-A7M1','GHOST-B8N9','GHOST-C9O5','GHOST-D0P7'
    ];

    // 已验证过的用户直接进
    if (!localStorage.getItem('betaVerified')) {
        const codeInput = document.getElementById('betaCodeInput');
        const errorEl = document.getElementById('betaCodeError');
        const code = codeInput ? codeInput.value.trim().toUpperCase() : '';
        if (!BETA_CODES.includes(code)) {
            if (errorEl) errorEl.style.display = 'block';
            if (codeInput) codeInput.placeholder = '请输入正确的内测码';
            return;
        }
        localStorage.setItem('betaVerified', '1');
        localStorage.setItem('betaCode', code);
    }

    localStorage.setItem('userName', name);
    // 首次登录自动记录结婚日期
    if (!localStorage.getItem('marriageDate')) {
        const today = new Date();
        const dateStr = today.getFullYear() + '-' +
            String(today.getMonth()+1).padStart(2,'0') + '-' +
            String(today.getDate()).padStart(2,'0');
        localStorage.setItem('marriageDate', dateStr);
    }
    openScreen('mainScreen');
}

// ===== 初始化 =====
window.onload = async function() {
    // 检查冷战是否超时（页面关闭后重新打开）
    if (localStorage.getItem('coldWarMode') === 'true') {
        const coldStart = parseInt(localStorage.getItem('coldWarStart') || Date.now());
        const elapsed = Date.now() - coldStart;
        if (elapsed >= 3 * 60 * 60 * 1000) {
            localStorage.setItem('pendingGhostApology', 'true');
        }
    }

    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });

    // ── 显示 loading，等云端数据加载完再渲染 ──────────────────
    // 这是修复"换设备数据为空"的核心：必须等云端数据到了再进主页
    const loadingEl = document.createElement('div');
    loadingEl.id = 'appLoadingScreen';
    loadingEl.style.cssText = [
        'position:fixed;inset:0;z-index:99999',
        'background:linear-gradient(135deg,#e8d5f5,#f9d0e0)',
        'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px',
    ].join(';');
    loadingEl.innerHTML = `
        <div style="font-size:48px">👻</div>
        <div style="font-size:15px;color:#7c3aed;font-weight:600;">正在恢复你们的故事…</div>
        <div style="width:120px;height:4px;background:rgba(192,132,252,0.2);border-radius:2px;overflow:hidden;">
          <div id="appLoadingBar" style="height:100%;width:0%;background:linear-gradient(90deg,#a855f7,#ec4899);border-radius:2px;transition:width 0.4s ease;"></div>
        </div>
    `;
    document.body.appendChild(loadingEl);

    const bar = document.getElementById('appLoadingBar');
    let barPct = 10;
    const barTick = setInterval(() => {
        barPct = Math.min(barPct + 8, 85);
        if (bar) bar.style.width = barPct + '%';
    }, 300);

    // ── 云端数据加载（等待完成后再渲染，这是关键改动）─────────
    if (typeof loadFromCloud === 'function') {
        try { await loadFromCloud(); } catch(e) { console.warn('[app] 云端加载失败，使用本地数据', e); }
    }

    clearInterval(barTick);
    if (bar) bar.style.width = '100%';
    await new Promise(r => setTimeout(r, 300)); // 让进度条走到100%
    loadingEl.remove();

    // ── 云端加载完成后再进主页 ───────────────────────────────
    openScreen('mainScreen');

    // ── 恢复用户头像 ────────────────────────────────────────
    const savedAvatar = localStorage.getItem('userAvatarBase64');
    if (savedAvatar && typeof updateAvatarEverywhere === 'function') {
        setTimeout(() => updateAvatarEverywhere(savedAvatar), 300);
    }

    // ── 快递进度检查（每5分钟）──────────────────────────────
    if (typeof checkDeliveryUpdates === 'function') {
        checkDeliveryUpdates();
        setInterval(checkDeliveryUpdates, 5 * 60 * 1000);
    }

    // ── 刷新聊天记录显示 ─────────────────────────────────────
    if (typeof refreshChatScreen === 'function') refreshChatScreen();
}

// ===== 页面关闭前强制保存 =====
window.addEventListener('beforeunload', () => {
    if (typeof _saveTimer !== 'undefined' && _saveTimer) {
        clearTimeout(_saveTimer);
        _saveTimer = null;
    }
    if (typeof saveToCloud === 'function') {
        saveToCloud().catch(() => {});
    }
});

// ===== Toast 提示 =====
function showToast(msg, duration = 2500) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}
