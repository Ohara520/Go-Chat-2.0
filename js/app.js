// ===== Ghost 档案默认值（共享函数，startChat 和 window.onload 共用）=====
function _ensureGhostProfileDefaults() {
  if (!localStorage.getItem('ghostBirthday')) {
    const _months = [31,28,31,30,31,30,31,31,30,31,30,31];
    const _m = Math.floor(Math.random() * 12) + 1;
    const _d = Math.floor(Math.random() * _months[_m-1]) + 1;
    const _y = 1991 + Math.floor(Math.random() * 4);
    const _bday = `${_y}-${String(_m).padStart(2,'0')}-${String(_d).padStart(2,'0')}`;
    localStorage.setItem('ghostBirthday', _bday);
    const _zodiacMap = [
      [1,20,'摩羯座'],[2,19,'水瓶座'],[3,21,'双鱼座'],[4,20,'白羊座'],
      [5,21,'金牛座'],[6,22,'双子座'],[7,23,'巨蟹座'],[8,23,'狮子座'],
      [9,23,'处女座'],[10,24,'天秤座'],[11,23,'天蝎座'],[12,22,'射手座'],[1,19,'摩羯座']
    ];
    const _zodiacEnMap = {
      '摩羯座':'Capricorn','水瓶座':'Aquarius','双鱼座':'Pisces','白羊座':'Aries',
      '金牛座':'Taurus','双子座':'Gemini','巨蟹座':'Cancer','狮子座':'Leo',
      '处女座':'Virgo','天秤座':'Libra','天蝎座':'Scorpio','射手座':'Sagittarius'
    };
    let _zodiac = '摩羯座';
    for (let i = 0; i < _zodiacMap.length - 1; i++) {
      const [sm, sd, name] = _zodiacMap[i];
      const [em, ed] = _zodiacMap[i+1];
      if ((_m === sm && _d >= sd) || (_m === em && _d < ed)) { _zodiac = name; break; }
    }
    localStorage.setItem('ghostZodiac', _zodiac);
    localStorage.setItem('ghostZodiacEn', _zodiacEnMap[_zodiac] || _zodiac);
  }
  if (!localStorage.getItem('ghostHeight')) {
    const _heights = ['182cm','183cm','185cm','186cm','188cm','189cm','190cm','191cm'];
    localStorage.setItem('ghostHeight', _heights[Math.floor(Math.random() * _heights.length)]);
  }
  if (!localStorage.getItem('ghostWeight')) {
    const _w = 88 + Math.floor(Math.random() * 10);
    localStorage.setItem('ghostWeight', _w + 'kg');
  }
  if (!localStorage.getItem('ghostBloodType')) {
    const _types = ['A','A','B','O','O','O','AB'];
    localStorage.setItem('ghostBloodType', _types[Math.floor(Math.random() * _types.length)]);
  }
  if (!localStorage.getItem('ghostHometown')) {
    localStorage.setItem('ghostHometown', 'Manchester, UK');
  }
  if (!localStorage.getItem('metInPerson')) {
    localStorage.setItem('metInPerson', 'true');
  }
}

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
    if (id === 'profileScreen'  && typeof renderPhoneProfile === 'function') setTimeout(renderPhoneProfile, 80);
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
    if (id === 'takeoutScreen'      && typeof initTakeoutScreen      === 'function') initTakeoutScreen();
    if (id === 'achievementScreen'  && typeof switchAchievementTab   === 'function') switchAchievementTab('story');
}

function goBack() {
    openScreen('mainScreen');
    if (typeof showTabBar === 'function') showTabBar();
}

// ===== 启动页 =====
async function startChat() {
    const name = document.getElementById('userNameInput').value.trim();
    if (!name) {
        document.getElementById('userNameInput').placeholder = '先输入昵称哦～';
        return;
    }

    // 已验证过的用户直接进
    if (!localStorage.getItem('betaVerified')) {
        const codeInput = document.getElementById('betaCodeInput');
        const errorEl = document.getElementById('betaCodeError');
        const code = codeInput ? codeInput.value.trim().toUpperCase() : '';

        if (!code) {
            if (errorEl) { errorEl.textContent = '请输入邀请码'; errorEl.style.display = 'block'; }
            return;
        }

        // 先本地校验格式，再调接口验证
        try {
            if (errorEl) { errorEl.textContent = '验证中…'; errorEl.style.display = 'block'; }
            const email = localStorage.getItem('userEmail') || localStorage.getItem('sb_user_email') || '';
            const res = await fetch('/api/check-invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, email }),
            });
            const data = await res.json();

            if (!data.ok) {
                const msg = data.reason === 'used' ? '该邀请码已被使用' : '邀请码无效，请检查后重试';
                if (errorEl) { errorEl.textContent = msg; errorEl.style.display = 'block'; }
                if (codeInput) codeInput.value = '';
                return;
            }

            localStorage.setItem('betaVerified', '1');
            localStorage.setItem('betaCode', code);
        } catch(e) {
            if (errorEl) { errorEl.textContent = '网络错误，请稍后重试'; errorEl.style.display = 'block'; }
            return;
        }
    }

    localStorage.setItem('userName', name);

    // Ghost 档案默认值
    _ensureGhostProfileDefaults();

    // 首次登录自动记录结婚日期
    if (!localStorage.getItem('marriageDate')) {
        const today = new Date();
        const dateStr = today.getFullYear() + '-' +
            String(today.getMonth()+1).padStart(2,'0') + '-' +
            String(today.getDate()).padStart(2,'0');
        localStorage.setItem('marriageDate', dateStr);
    }
    openScreen('mainScreen');
    if (typeof showTabBar === 'function') showTabBar();
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
        'background:linear-gradient(135deg,#d8edd8,#eaf2e0)',
        'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px',
    ].join(';');
    loadingEl.innerHTML = `
        <div style="font-size:48px">👻</div>
        <div style="font-size:15px;color:#2d6028;font-weight:600;">正在恢复你们的故事…</div>
        <div style="width:120px;height:4px;background:rgba(90,154,70,0.2);border-radius:2px;overflow:hidden;">
          <div id="appLoadingBar" style="height:100%;width:0%;background:linear-gradient(90deg,#5a9a46,#7dba5a);border-radius:2px;transition:width 0.4s ease;"></div>
        </div>
    `;
    document.body.appendChild(loadingEl);

    const bar = document.getElementById('appLoadingBar');
    let barPct = 10;
    const barTick = setInterval(() => {
        barPct = Math.min(barPct + 8, 85);
        if (bar) bar.style.width = barPct + '%';
    }, 300);

    // ── 云端数据加载（带超时，防止无限等待卡住用户）─────────
    if (typeof loadFromCloud === 'function') {
        try {
            await Promise.race([
                loadFromCloud(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('cloud load timeout')), 8000))
            ]);
            // 加载成功：允许正常云端保存
            sessionStorage.removeItem('cloudLoadFailed');
        } catch(e) {
            console.warn('[app] 云端加载超时或失败，使用本地数据', e.message);
            // 标记加载失败：saveToCloud 会检查此标记，跳过保存防止覆盖
            sessionStorage.setItem('cloudLoadFailed', '1');
            // 后台静默重试一次（不阻塞页面）
            setTimeout(async () => {
                try {
                    if (typeof loadFromCloud === 'function') await loadFromCloud();
                    sessionStorage.removeItem('cloudLoadFailed');
                    console.log('[app] 后台云端重试成功，已恢复正常保存');
                } catch(e2) {
                    console.warn('[app] 后台重试也失败', e2.message);
                }
            }, 15000);
        }
    }

    clearInterval(barTick);
    if (bar) bar.style.width = '100%';
    await new Promise(r => setTimeout(r, 300)); // 让进度条走到100%
    loadingEl.remove();

    // ── 云端加载完成后再进主页 ───────────────────────────────

    // 已有用户兜底：Ghost 档案数据（与 startChat 共享逻辑）
    _ensureGhostProfileDefaults();

    openScreen('mainScreen');
    if (typeof showTabBar === 'function') showTabBar();

    // ── 包裹通知徽章更新 ─────────────────────────────────────
    if (typeof _updateMarketCardBadge === 'function') _updateMarketCardBadge();

    // ── 职业系统每日检查（升级、工资、被动收入、打赏）──────────
    if (typeof dailyCareerCheck === 'function') dailyCareerCheck();
    // 更新主页职业卡片描述
    const _careerDesc = document.getElementById('careerCardDesc');
    if (_careerDesc && typeof getCareerSummary === 'function') {
      const _summary = getCareerSummary();
      if (_summary !== '暂未选择职业') _careerDesc.textContent = _summary;
    }

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

    // ── 外卖进度检查（每2分钟）──────────────────────────────
    if (typeof checkTakeoutUpdates === 'function') {
        checkTakeoutUpdates();
        setInterval(checkTakeoutUpdates, 2 * 60 * 1000);
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
