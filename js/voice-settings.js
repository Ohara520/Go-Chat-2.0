// js/voice-settings.js — 语音设置 UI 逻辑
// 依赖: voice.js (clearVoiceCache), api.js (fetchWithTimeout)
// 模型列表统一来源: utils/elevenlabs-models.js (后端共用)

let _voiceSettingsState = {
  hasApiKey: false,
  provider: 'elevenlabs',
  voiceId: null,
  modelId: 'eleven_turbo_v2_5',
  autoPlay: false,
};

// 模型选项（从后端模型配置生成，保持一致）
const MODEL_OPTIONS = [
  { value: 'eleven_turbo_v2_5', label: 'Turbo v2.5（推荐）' },
  { value: 'eleven_flash_v2_5', label: 'Flash v2.5（超快速）' },
  { value: 'eleven_turbo_v2', label: 'Turbo v2' },
  { value: 'eleven_multilingual_v2', label: 'Multilingual v2（多语言）' },
  { value: 'eleven_flash_v2', label: 'Flash v2' },
  { value: 'eleven_multilingual_v1', label: 'Multilingual v1' },
  { value: 'eleven_monolingual_v1', label: 'English v1（英语）' },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ① 渲染语音设置界面
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function renderVoiceSettings() {
  const container = document.getElementById('meDetailBody');
  if (!container) return;

  container.innerHTML = `
    <div class="voice-settings-container" style="position:relative;">
      <div class="voice-settings-loading" id="voiceSettingsLoading">
        <div class="voice-settings-spinner"></div>
      </div>

      <div class="voice-settings-eyebrow">GO CHAT · VOICE SETTINGS</div>
      <h3 class="voice-settings-title">语音设置</h3>
      <p class="voice-settings-subtitle">自定义 Ghost 的声音与音色</p>

      <div class="voice-settings-rule"></div>

      <!-- 状态提示 -->
      <div id="voiceStatusCard" class="voice-settings-status status-info" style="display:none;">
        <span class="voice-settings-status-icon"></span>
        <div id="voiceStatusText"></div>
      </div>

      <!-- API Key -->
      <div class="voice-settings-group">
        <label class="voice-settings-label">ELEVENLABS API KEY</label>
        <input
          type="password"
          id="voiceApiKeyInput"
          class="voice-settings-input"
          placeholder="sk-..."
          autocomplete="off"
          spellcheck="false"
        >
        <div class="voice-settings-hint">
          未配置时使用平台默认密钥。
          <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noopener noreferrer">获取 API Key ↗</a>
        </div>
      </div>

      <!-- Voice ID -->
      <div class="voice-settings-group">
        <label class="voice-settings-label">VOICE ID</label>
        <input
          type="text"
          id="voiceVoiceIdInput"
          class="voice-settings-input"
          placeholder="留空使用默认音色"
          autocomplete="off"
          spellcheck="false"
        >
        <div class="voice-settings-hint">
          控制声音音色。
          <a href="https://elevenlabs.io/voice-library" target="_blank" rel="noopener noreferrer">浏览音色库 ↗</a>
        </div>
      </div>

      <!-- Model ID -->
      <div class="voice-settings-group">
        <label class="voice-settings-label">MODEL ID</label>
        <select id="voiceModelIdSelect" class="voice-settings-select">
          ${MODEL_OPTIONS.map(opt =>
            `<option value="${opt.value}">${opt.label}</option>`
          ).join('')}
        </select>
        <div class="voice-settings-hint">生成模型，影响速度与质量。</div>
      </div>

      <!-- Auto Play (暂时隐藏，V1 不实现自动播放触发) -->
      <div class="voice-settings-group" style="display:none;">
        <div class="voice-settings-switch-wrap" id="voiceAutoPlaySwitch" data-checked="false">
          <div class="voice-settings-switch-label">
            <strong>自动播放</strong>
            <small>每条语音消息自动播放</small>
          </div>
          <div class="voice-settings-toggle"></div>
        </div>
      </div>

      <div class="voice-settings-rule"></div>

      <!-- 操作按钮 -->
      <div class="voice-settings-actions">
        <button type="button" class="voice-settings-btn voice-settings-btn-secondary" onclick="voiceSettingsCancel()">取消</button>
        <button type="button" class="voice-settings-btn voice-settings-btn-primary" id="voiceSettingsSaveBtn" onclick="voiceSettingsSave()">保存设置</button>
      </div>

      <div style="margin-top:18px;">
        <button type="button" class="voice-settings-btn voice-settings-btn-danger" id="voiceSettingsDeleteBtn" onclick="voiceSettingsDeleteKey()" style="display:none;">删除 API Key</button>
      </div>
    </div>
  `;

  // 加载当前配置
  await _loadVoiceSettings();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ② 加载当前语音配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function _loadVoiceSettings() {
  _showLoading(true);

  try {
    const { data: { session } } = await window.sbClient.auth.getSession();
    if (!session) {
      _showStatus('error', '请先登录');
      _showLoading(false);
      return;
    }

    const res = await fetch('/api/voice-config', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      _showStatus('error', err.error || '加载配置失败');
      _showLoading(false);
      return;
    }

    const config = await res.json();
    _voiceSettingsState = config;

    // 填充表单
    document.getElementById('voiceVoiceIdInput').value = config.voice_id || '';
    document.getElementById('voiceModelIdSelect').value = config.model_id || 'eleven_turbo_v2_5';

    const autoPlaySwitch = document.getElementById('voiceAutoPlaySwitch');
    if (autoPlaySwitch) {
      autoPlaySwitch.dataset.checked = config.auto_play ? 'true' : 'false';
    }

    // 显示状态
    if (config.has_api_key) {
      _showStatus('success', '✓ 已配置私人 API Key');
      document.getElementById('voiceSettingsDeleteBtn').style.display = 'block';
      document.getElementById('voiceApiKeyInput').placeholder = '留空保持不变，填写以更换';
    } else {
      _showStatus('info', '当前使用平台默认密钥');
      document.getElementById('voiceSettingsDeleteBtn').style.display = 'none';
      document.getElementById('voiceApiKeyInput').placeholder = 'sk-...';
    }

  } catch (err) {
    console.error('[voice-settings] Load error:', err);
    _showStatus('error', '网络错误，请重试');
  } finally {
    _showLoading(false);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ③ 保存语音配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function voiceSettingsSave() {
  _showLoading(true);
  _hideStatus();

  try {
    const { data: { session } } = await window.sbClient.auth.getSession();
    if (!session) {
      _showStatus('error', '登录已过期，请重新登录');
      _showLoading(false);
      return;
    }

    const apiKey = document.getElementById('voiceApiKeyInput').value.trim();
    const voiceId = document.getElementById('voiceVoiceIdInput').value.trim();
    const modelId = document.getElementById('voiceModelIdSelect').value;
    const autoPlay = document.getElementById('voiceAutoPlaySwitch')?.dataset.checked === 'true';

    // 参数校验
    if (apiKey && (apiKey.length < 10 || apiKey.length > 200)) {
      _showStatus('error', 'API Key 格式错误');
      _showLoading(false);
      return;
    }

    if (voiceId && !/^[a-zA-Z0-9_-]{1,100}$/.test(voiceId)) {
      _showStatus('error', 'Voice ID 格式错误');
      _showLoading(false);
      return;
    }

    // 构建请求体（只传变更的字段）
    const body = {
      model_id: modelId,
      auto_play: autoPlay,
    };

    if (voiceId) body.voice_id = voiceId;
    if (apiKey) body.api_key = apiKey;

    const res = await fetch('/api/voice-config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      _showStatus('error', err.error || '保存失败');
      _showLoading(false);
      return;
    }

    // 清空前端音频缓存（配置变更后缓存失效）
    if (typeof clearVoiceCache === 'function') {
      clearVoiceCache();
    }

    _showStatus('success', '✓ 保存成功');
    setTimeout(() => {
      _loadVoiceSettings(); // 重新加载以更新状态
    }, 800);

  } catch (err) {
    console.error('[voice-settings] Save error:', err);
    _showStatus('error', '网络错误，请重试');
  } finally {
    _showLoading(false);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ④ 删除 API Key
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function voiceSettingsDeleteKey() {
  if (!confirm('确定要删除您的私人 API Key 吗？删除后将使用平台默认密钥。')) {
    return;
  }

  _showLoading(true);
  _hideStatus();

  try {
    const { data: { session } } = await window.sbClient.auth.getSession();
    if (!session) {
      _showStatus('error', '登录已过期');
      _showLoading(false);
      return;
    }

    const res = await fetch('/api/voice-config', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      _showStatus('error', err.error || '删除失败');
      _showLoading(false);
      return;
    }

    // 清空音频缓存
    if (typeof clearVoiceCache === 'function') {
      clearVoiceCache();
    }

    // 清空输入框
    document.getElementById('voiceApiKeyInput').value = '';

    _showStatus('success', '✓ 已删除 API Key');
    setTimeout(() => {
      _loadVoiceSettings();
    }, 800);

  } catch (err) {
    console.error('[voice-settings] Delete error:', err);
    _showStatus('error', '网络错误');
  } finally {
    _showLoading(false);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⑤ 取消
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function voiceSettingsCancel() {
  if (typeof closeMeDetail === 'function') {
    closeMeDetail();
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⑥ UI 辅助
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function _showLoading(show) {
  const el = document.getElementById('voiceSettingsLoading');
  if (el) el.classList.toggle('show', show);
}

function _showStatus(type, text) {
  const card = document.getElementById('voiceStatusCard');
  const textEl = document.getElementById('voiceStatusText');
  if (!card || !textEl) return;

  card.className = `voice-settings-status status-${type}`;
  textEl.textContent = text;
  card.style.display = 'flex';

  const iconMap = {
    info: 'ℹ️',
    success: '✓',
    warning: '⚠️',
    error: '✕',
  };
  card.querySelector('.voice-settings-status-icon').textContent = iconMap[type] || '';
}

function _hideStatus() {
  const card = document.getElementById('voiceStatusCard');
  if (card) card.style.display = 'none';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⑦ 试听功能
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function voiceSettingsPreview() {
  const btn = document.getElementById('voicePreviewBtn');
  const btnText = document.getElementById('voicePreviewBtnText');
  if (!btn || !btnText) return;

  const originalText = btnText.textContent;
  btn.disabled = true;
  btnText.textContent = '⏳ 生成中...';
  _hideStatus();

  try {
    const { data: { session } } = await window.sbClient.auth.getSession();
    if (!session) {
      _showStatus('error', '登录已过期，请重新登录');
      btn.disabled = false;
      btnText.textContent = originalText;
      return;
    }

    // 读取当前表单配置
    const voiceId = document.getElementById('voiceVoiceIdInput').value.trim();
    const modelId = document.getElementById('voiceModelIdSelect').value;
    const previewText = 'Hello, this is a voice preview test.';

    // 构建请求（使用当前填写的配置，而非已保存的）
    const body = {
      text: previewText,
      model_id: modelId,
    };
    if (voiceId) body.voice_id = voiceId;

    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      let errorMsg = err.error || '试听失败';

      // 补充具体提示（根据 hint 字段）
      if (err.hint) {
        errorMsg += '\n' + err.hint;
      }

      _showStatus('error', errorMsg);
      btn.disabled = false;
      btnText.textContent = originalText;
      return;
    }

    // 播放音频
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    audio.onended = () => {
      URL.revokeObjectURL(url);
      btn.disabled = false;
      btnText.textContent = originalText;
      _showStatus('success', '✓ 试听完成');
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      btn.disabled = false;
      btnText.textContent = originalText;
      _showStatus('error', '音频播放失败');
    };

    _showStatus('info', '▶ 正在播放试听音频...');
    audio.play().catch((e) => {
      URL.revokeObjectURL(url);
      btn.disabled = false;
      btnText.textContent = originalText;
      _showStatus('error', '播放失败：' + (e.message || '未知错误'));
    });

  } catch (err) {
    console.error('[voice-settings] Preview error:', err);
    _showStatus('error', '网络错误，请重试');
    btn.disabled = false;
    btnText.textContent = originalText;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⑧ 开关切换（预留，V1 暂不启用）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
document.addEventListener('click', (e) => {
  const switchWrap = e.target.closest('.voice-settings-switch-wrap');
  if (!switchWrap) return;
  const current = switchWrap.dataset.checked === 'true';
  switchWrap.dataset.checked = current ? 'false' : 'true';
});

// 暴露到全局
window.renderVoiceSettings = renderVoiceSettings;
window.voiceSettingsSave = voiceSettingsSave;
window.voiceSettingsCancel = voiceSettingsCancel;
window.voiceSettingsDeleteKey = voiceSettingsDeleteKey;
window.voiceSettingsPreview = voiceSettingsPreview;
