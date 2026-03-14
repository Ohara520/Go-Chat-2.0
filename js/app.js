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
    if (id === 'chatScreen'     && typeof initChat          === 'function') initChat();
    if (id === 'coupleScreen'   && typeof initCoupleSpace   === 'function') initCoupleSpace();
    if (id === 'walletScreen'   && typeof renderWallet      === 'function') renderWallet();
    if (id === 'workScreen'     && typeof updateWorkUI      === 'function') updateWorkUI();
    if (id === 'vocabScreen'       && typeof renderVocabScreen    === 'function') renderVocabScreen();
    if (id === 'collectionScreen'  && typeof renderCollectionScreen === 'function') renderCollectionScreen();
    if (id === 'calendarScreen'     && typeof initCalendar           === 'function') initCalendar();
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

// ===== 初始化（调试模式：每次显示启动页）=====
window.onload = function() {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
    openScreen('welcomeScreen');
    // 上线时改成这个：
    // if (localStorage.getItem('userName')) {
    //     openScreen('mainScreen');
    // } else {
    //     openScreen('welcomeScreen');
    // }
}

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
