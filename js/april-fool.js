// ===== 愚人节主题系统 april-fool.js =====

const AF_EMOJIS = ['🤡','🌸','🎊','🎭','🌼','✨','🎉','💐','🃏','🌺'];

function afIsAprilFool() {
  const now = new Date();
  return now.getMonth() === 3 && now.getDate() === 1; // 4月1号
}

function afIsEnabled() {
  return localStorage.getItem('aprilFoolTheme') !== 'off';
}

function afFallAnimation() {
  const container = document.createElement('div');
  container.className = 'af-fall-container';
  document.body.appendChild(container);

  for (let i = 0; i < 30; i++) {
    const item = document.createElement('div');
    item.className = 'af-fall-item';
    item.textContent = AF_EMOJIS[Math.floor(Math.random() * AF_EMOJIS.length)];
    item.style.left = Math.random() * 100 + '%';
    item.style.fontSize = (16 + Math.random() * 16) + 'px';
    const duration = 1.5 + Math.random() * 2;
    const delay = Math.random() * 1;
    item.style.animation = `af-fall ${duration}s ${delay}s linear forwards`;
    container.appendChild(item);
  }

  setTimeout(() => container.remove(), 4000);
}

function afEnable() {
  document.body.classList.add('april-fool');
  localStorage.setItem('aprilFoolTheme', 'on');
  const banner = document.getElementById('aprilFoolBanner');
  const clownBtn = document.getElementById('afClownBtn');
  if (banner) banner.style.display = 'flex';
  if (clownBtn) clownBtn.classList.remove('visible');
  afFallAnimation();
}

function afDisable() {
  document.body.classList.remove('april-fool');
  localStorage.setItem('aprilFoolTheme', 'off');
  const banner = document.getElementById('aprilFoolBanner');
  const clownBtn = document.getElementById('afClownBtn');
  if (banner) banner.style.display = 'none';
  if (clownBtn) clownBtn.classList.add('visible');
}

function afToggle() {
  if (document.body.classList.contains('april-fool')) {
    afDisable();
  } else {
    afEnable();
  }
}

function afInit() {
  if (!afIsAprilFool()) return;

  // 首次进入默认开启
  if (localStorage.getItem('aprilFoolTheme') === null) {
    localStorage.setItem('aprilFoolTheme', 'on');
  }

  if (afIsEnabled()) {
    document.body.classList.add('april-fool');
  }

  // banner显示状态
  const banner = document.getElementById('aprilFoolBanner');
  const clownBtn = document.getElementById('afClownBtn');
  if (afIsEnabled()) {
    if (banner) banner.style.display = 'flex';
    if (clownBtn) clownBtn.classList.remove('visible');
  } else {
    if (banner) banner.style.display = 'none';
    if (clownBtn) clownBtn.classList.add('visible');
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', afInit);
