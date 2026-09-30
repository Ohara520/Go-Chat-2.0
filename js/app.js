// ===== Ghost 档案默认值（共享函数，startChat 和 window.onload 共用）=====
function _ensureGhostProfileDefaults() {
  if (!localStorage.getItem('ghostBirthday')) {
    const _months = [31,28,31,30,31,30,31,31,30,31,30,31];
    const _m = Math.floor(Math.random() * 12) + 1;
    const _d = Math.floor(Math.random() * _months[_m-1]) + 1;
    const _y = 1994; // 年龄锁死 32 岁，生日年份固定，避免与 prompt 的 "32 years old" 打架
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
  // 身高锁死 193cm（无条件覆盖，含老用户的旧随机值）
  localStorage.setItem('ghostHeight', '193cm');
  // 老用户生日年份归一到 1994（保留月日/星座），与锁死的 32 岁保持一致
  {
    const _bd = localStorage.getItem('ghostBirthday');
    if (_bd && _bd.slice(0, 4) !== '1994') {
      localStorage.setItem('ghostBirthday', '1994' + _bd.slice(4));
    }
  }
  if (!localStorage.getItem('ghostHometown')) {
    localStorage.setItem('ghostHometown', 'Manchester, UK');
  }
  if (!localStorage.getItem('metInPerson')) {
    // 核心设定：异国、从未见面。默认应为 false，靠重逢剧情（三件套/机票）才翻 true。
    localStorage.setItem('metInPerson', 'false');
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
    if (id === 'careerScreen'     && typeof updateWorkUI      === 'function') updateWorkUI();
    // 修复(#25)：原来这里把 diaryScreen 派发给已删除的 renderVocabScreen，
    // 它会去操作不存在的 vocab DOM 抛错，导致 openScreen 整个中断——卡片的
    // onclick 里 openScreen() 之后的 setTimeout(生成+渲染) 永远不注册，
    // 于是所有人日记都是空白、从不生成。改成直接驱动日记生成与渲染。
    if (id === 'diaryScreen') {
      if (typeof generateDiaryEntry === 'function') { Promise.resolve(generateDiaryEntry()).then(() => { if (typeof renderDiary === 'function') renderDiary(); }).catch(() => { if (typeof renderDiary === 'function') renderDiary(); }); }
      else if (typeof renderDiary === 'function') renderDiary();
    }
    if (id === 'collectionScreen'  && typeof renderCollectionScreen === 'function') renderCollectionScreen();
    if (id === 'calendarScreen'     && typeof initCalendar           === 'function') initCalendar();
    if (id === 'secretScreen'       && typeof loadSecretScreen        === 'function') loadSecretScreen();
    if (id === 'marketScreen'       && typeof initMarket             === 'function') { initMarket(); checkDeliveryUpdates(); }
    if (id === 'takeoutScreen'      && typeof initTakeoutScreen      === 'function') initTakeoutScreen();
    if (id === 'deliveryScreen'     && typeof renderDeliveryPage     === 'function') renderDeliveryPage();
    if (id === 'achievementScreen'  && typeof switchAchievementTab   === 'function') switchAchievementTab('story');
    // 回到主页时按当前时间重算外卖餐段提示，避免跨餐段后仍留着旧提示
    if (id === 'mainScreen'         && typeof updateTakeoutCardHint  === 'function') updateTakeoutCardHint();
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

        // 时间线：记录第一次见面（仅首次）
        if (typeof addTimelineEvent === 'function') {
            addTimelineEvent({ type: 'milestone', title: '第一次遇见他', icon: '💕' });
        }
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

    // ── 账号身份就绪：等登录检测确认 user_id、必要时清空上一账号的脏数据 ──
    // 必须在 loadFromCloud 之前完成，否则会用残留旧 user_id 查询/污染云端（账号串号 bug）
    if (window.__authReady) {
        try { await window.__authReady; } catch(e) {}
    }

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

    // Memory ↔ auto WorldBook 关联迁移（云端合并后跑一次，自愈半绑定 + 时间回填）
    if (typeof linkAutoWorldBookMemories === 'function') {
      try { linkAutoWorldBookMemories(); } catch (e) { console.warn('[link] migration failed', e); }
    }

    // 恢复约会 session：如果有进行中的约会，直接恢复约会界面而不是主页
    const _activeDate = localStorage.getItem('activeDateSession');
    if (_activeDate) {
      try {
        const _ds = JSON.parse(_activeDate);
        if (_ds && !_ds.ended) {
          openScreen('mainScreen');
          if (typeof showTabBar === 'function') showTabBar();
          if (typeof resumeDateScene === 'function') {
            resumeDateScene();
          } else {
            // dates.js 可能还没加载完，延迟重试
            setTimeout(() => {
              if (typeof resumeDateScene === 'function') resumeDateScene();
            }, 500);
          }
        } else {
          openScreen('mainScreen');
          if (typeof showTabBar === 'function') showTabBar();
        }
      } catch(e) {
        openScreen('mainScreen');
        if (typeof showTabBar === 'function') showTabBar();
      }
    } else {
      openScreen('mainScreen');
      if (typeof showTabBar === 'function') showTabBar();
    }

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

    // ── 会话事件检查（生日/周年/告白小作文/沉睡的剧情成就）──
    // 修复：checkStoryOnSessionStart 此前从未被调用，导致所有 session 事件
    // （含生日、结婚周年、大量成就）从不触发。这里在进主页后补上调用。
    if (typeof checkStoryOnSessionStart === 'function') {
      setTimeout(() => { try { checkStoryOnSessionStart(); } catch(e) { console.warn('[app] session事件检查失败', e); } }, 4000);
    }
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

// ===== ASSETS · HOMES 住宅列表 =====
function switchHomesTab(tab) {
    document.querySelectorAll('.homes-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.homesTab === tab);
    });
    const rent = document.getElementById('homesListRent');
    const buy  = document.getElementById('homesListBuy');
    if (rent) rent.style.display = tab === 'rent' ? 'block' : 'none';
    if (buy)  buy.style.display  = tab === 'buy'  ? 'block' : 'none';
}

// 详情页数据驱动（同一套模板，按房源切换内容）
const HOME_DATA = {
    'hartley-court': {
        titleEn: 'Hartley Court',
        titleZh: '哈特利公寓',
        loc: 'Manchester, UK',
        lead: '位于曼彻斯特一栋老式砖楼内的一居室公寓。客厅、厨房和卧室空间紧凑，但基础生活设施齐全，适合日常居住。',
        layout: '1室1厅1卫',
        area: '约 50 ㎡',
        feats: ['老式砖楼', '一居室', '基础家具', '独立厨房', '独立卫浴', '木地板 & 老式窗户'],
        desc: 'Hartley Court 位于曼彻斯特一处安静的住宅街区，属于典型的英式老式砖楼。公寓为一居室设计，客厅、厨房和卧室空间紧凑但实用，保留着建筑原有的木地板、老式窗户与暖气。家具和装修虽已有些年头，但基础设施齐全，整体氛围温馨而有生活气息，适合日常居住。',
        rent: 1000,
        deposit: 1000,
        images: [
            { src: 'images/assets/homes/hartley-court/living-room.png', alt: '客厅' },
            { src: 'images/assets/homes/hartley-court/exterior.png', alt: '外观' }
        ]
    },
    'willow-court': {
        titleEn: 'Willow Court',
        titleZh: '维洛公寓',
        loc: 'Manchester, UK',
        lead: 'Willow Court 位于曼彻斯特一处普通住宅社区，是一套空间舒适的现代两居室公寓。室内采用简洁的现代装修，拥有独立厨房、卫浴及阳台，基础家具齐全。',
        layout: '2室1厅1卫',
        area: '约 85 ㎡',
        feats: ['普通住宅社区', '两居室', '独立阳台', '基础现代装修', '独立厨房', '独立卫浴'],
        desc: 'Willow Court 位于曼彻斯特一处普通住宅社区，是一套空间舒适的现代两居室公寓。室内采用简洁的现代装修，拥有独立厨房、卫浴及阳台，基础家具齐全。相比传统的一居室，提供了更充裕的日常生活与个人活动空间。',
        rent: 1958,
        deposit: 1958,
        images: [
            { src: 'images/assets/homes/willow-court/living-room.png', alt: '客厅' },
            { src: 'images/assets/homes/willow-court/exterior.png', alt: '外观' },
            { src: 'images/assets/homes/willow-court/bedroom.png', alt: '卧室' }
        ]
    },
    'meridian-residences': {
        titleEn: 'The Meridian Residences',
        titleZh: '云际公寓',
        loc: 'Manchester, UK',
        lead: '位于曼彻斯特的高层城市景观公寓。室内空间宽敞，采用现代暖色系精装修，配有全景落地窗、独立衣帽间及一间可自由规划的房间，适合不同阶段的家庭生活需求。',
        layout: '3室2卫·开放式客餐厅',
        area: '约 125 ㎡',
        feats: ['高层城市景观', '全景落地窗', '独立衣帽间', '自由规划房间', '开放式厨房', '现代精装修'],
        desc: 'The Meridian Residences 位于曼彻斯特高层住宅建筑内，拥有开阔的城市景观。室内采用现代暖色系装修，开放式客餐厅与厨房相连，落地窗为公共生活区域带来充足采光。主卧配有独立衣帽间，另外设有一间可以根据家庭需求自由规划的房间，可用作书房、宠物房或未来的婴儿房，为不同阶段的生活保留空间。',
        rent: 2850,
        deposit: 2850,
        images: [
            { src: 'images/assets/homes/meridian-residences/living-room.png', alt: '客厅' },
            { src: 'images/assets/homes/meridian-residences/exterior.png', alt: '外观' },
            { src: 'images/assets/homes/meridian-residences/master-bedroom.png', alt: '主卧' },
            { src: 'images/assets/homes/meridian-residences/flex-room.png', alt: '自由规划房间' }
        ]
    }
};

let currentHomeId = null;

function fmtGBP(n) {
    return n.toLocaleString('en-GB');
}

function openHomeDetail(id) {
    const data = HOME_DATA[id];
    if (!data) {
        showToast('住宅详情页即将上线');
        return;
    }
    currentHomeId = id;

    const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.textContent = val; };
    set('hdTitleEn', data.titleEn);
    set('hdTitleZh', data.titleZh);
    set('hdLoc', data.loc);
    set('hdLead', data.lead);
    set('hdSpecLayout', data.layout);
    set('hdSpecArea', data.area);
    set('hdDesc', data.desc);
    set('hdPcNum', fmtGBP(data.rent));
    set('hdPcRent', '£ ' + fmtGBP(data.rent));
    set('hdPcDeposit', '£ ' + fmtGBP(data.deposit));
    set('hdPcTotal', '£ ' + fmtGBP(data.rent + data.deposit));

    const feats = document.getElementById('hdFeats');
    if (feats) {
        feats.innerHTML = '';
        data.feats.forEach(f => {
            const span = document.createElement('span');
            span.className = 'hd-feat';
            span.textContent = f;
            feats.appendChild(span);
        });
    }

    const thumbs = document.getElementById('hdThumbs');
    if (thumbs) {
        thumbs.innerHTML = '';
        data.images.forEach((img, i) => {
            const t = document.createElement('div');
            t.className = 'hd-thumb' + (i === 0 ? ' active' : '');
            t.onclick = function () { switchHomeImg(i, this); };
            const im = document.createElement('img');
            im.src = img.src;
            im.alt = img.alt;
            t.appendChild(im);
            thumbs.appendChild(t);
        });
    }

    switchHomeImg(0);
    openScreen('homeDetailScreen');
    const screen = document.getElementById('homeDetailScreen');
    if (screen) screen.scrollTop = 0;
}

// 主图 / 缩略图切换
function switchHomeImg(index, el) {
    const data = HOME_DATA[currentHomeId];
    if (!data) return;
    const imgs = data.images;
    if (!imgs || !imgs[index]) return;
    const main = document.getElementById('hdMainImg');
    if (main) main.src = imgs[index].src;
    const count = document.getElementById('hdCount');
    if (count) count.textContent = (index + 1) + ' / ' + imgs.length;
    const thumbs = document.querySelectorAll('#hdThumbs .hd-thumb');
    thumbs.forEach((t, i) => t.classList.toggle('active', i === index));
    if (el && !el.classList.contains('active')) {
        el.classList.add('active');
    }
}
