// ============================================================
// ambient.js — 氛围音乐系统
// 依赖：无（纯UI，不依赖其他模块）
// ============================================================

let _ambientAudio = null;
let _ambientPlaying = null;
let _ambientVolume = 0.6;

function toggleAmbient() {
  const body = document.getElementById('ambientBody');
  const arrow = document.getElementById('ambientArrow');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (arrow) arrow.classList.toggle('open', !isOpen);
}

function toggleTrack(el) {
  const id = el.dataset.id;
  const file = el.dataset.file;
  const color = el.dataset.color;
  const glow = el.dataset.glow;

  if (_ambientPlaying === id) {
    stopAmbient();
    return;
  }

  if (_ambientAudio) {
    _ambientAudio.pause();
    _ambientAudio = null;
  }

  _ambientAudio = new Audio(file);
  _ambientAudio.loop = true;
  _ambientAudio.volume = _ambientVolume;
  _ambientAudio.play().catch(e => console.warn('音频播放失败:', e));
  _ambientPlaying = id;

  document.querySelectorAll('.ambient-track').forEach(t => {
    t.classList.remove('playing');
    const wave = t.querySelector('.ambient-wave');
    if (wave) wave.remove();
  });
  el.classList.add('playing');

  const wave = document.createElement('div');
  wave.className = 'ambient-wave';
  wave.innerHTML = [0,1,2,3,4].map(i =>
    `<div class="ambient-wave-bar" style="background:${color};animation-delay:${i*0.13}s"></div>`
  ).join('');
  el.appendChild(wave);

  const subtitle = document.getElementById('ambientSubtitle');
  const name = el.querySelector('.ambient-track-name')?.textContent || '';
  if (subtitle) subtitle.innerHTML = `${name} · 播放中 <span style="display:inline-flex;align-items:center;gap:2px">${[0,1,2].map(i=>`<span style="display:inline-block;width:2px;height:8px;border-radius:1px;background:${color};animation:wave 0.9s ease-in-out infinite;animation-delay:${i*0.15}s"></span>`).join('')}</span>`;

  updateAmbientPulse(color, glow);
}

function stopAmbient() {
  if (_ambientAudio) {
    _ambientAudio.pause();
    _ambientAudio = null;
  }
  _ambientPlaying = null;
  document.querySelectorAll('.ambient-track').forEach(t => {
    t.classList.remove('playing');
    const wave = t.querySelector('.ambient-wave');
    if (wave) wave.remove();
  });
  const subtitle = document.getElementById('ambientSubtitle');
  if (subtitle) subtitle.textContent = '点击开启专注氛围';
  const pulse = document.getElementById('ambientPulse');
  if (pulse) pulse.style.display = 'none';
}

function setAmbientVolume(val) {
  _ambientVolume = val / 100;
  if (_ambientAudio) _ambientAudio.volume = _ambientVolume;
  const fill = document.getElementById('ambientVolumeFill');
  if (fill) fill.style.width = val + '%';
}

function updateAmbientPulse(color, glow) {
  const pulse = document.getElementById('ambientPulse');
  if (!pulse) return;
  const workScreen = document.getElementById('workScreen');
  if (!workScreen || !workScreen.classList.contains('active')) return;
  pulse.style.display = 'block';
  const r1 = document.getElementById('pulseRing1');
  const r2 = document.getElementById('pulseRing2');
  const r3 = document.getElementById('pulseRing3');
  if (r1) r1.style.borderColor = color + '38';
  if (r2) r2.style.borderColor = color + '48';
  if (r3) r3.style.background = `radial-gradient(circle, ${glow}88, transparent 70%)`;
}

// 离开打工页时隐藏光晕（音乐继续）
function onWorkScreenHide() {
  const pulse = document.getElementById('ambientPulse');
  if (pulse) pulse.style.display = 'none';
}

// 进入打工页时恢复光晕
function onWorkScreenShow() {
  if (_ambientPlaying) {
    const el = document.querySelector(`.ambient-track[data-id="${_ambientPlaying}"]`);
    if (el) updateAmbientPulse(el.dataset.color, el.dataset.glow);
  }
}
