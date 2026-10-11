/**
 * Go Chat 更新公告弹窗 V1
 *
 * 功能：
 * - 首次打开 App 时展示最新更新内容
 * - 使用 localStorage 保存用户阅读状态
 * - 支持"知道了"和"不再提醒"两种操作
 *
 * 版本机制：
 * - 每次更新修改 UPDATE_NOTICE_VERSION
 * - 用户点击"知道了"：仅标记当前版本已读，下次新版本仍会显示
 * - 用户点击"不再提醒"：标记当前版本永久隐藏
 */

(function() {
  'use strict';

  // 当前公告版本（每次更新需修改此值）
  const UPDATE_NOTICE_VERSION = '20261011_voice';

  // localStorage 键名
  const STORAGE_KEY = 'go_chat_update_notice';

  // 更新日志数据（最新的放最前面）
  const UPDATE_LOGS = [
    {
      version: '20261011_voice',
      date: '2026.10.11',
      title: 'Update Letter',
      image: 'images/update-notice/dev-cat-bugfix.png',
      sections: [
        {
          title: '语音功能上线',
          content: [
            '新增 AI 语音播放功能。',
            '支持用户接入自己的 ElevenLabs API Key。',
            '支持自定义声音与模型选择。'
          ],
          note: '注：部分模型需要对应权限的 API Key，调试不同模型时可能需要重新配置 Key。'
        },
        {
          title: '界面优化',
          content: [
            '优化「我的」页面及设置界面。',
            '调整部分页面布局和视觉细节。'
          ]
        },
        {
          title: '问题修复',
          content: [
            '修复头像更换后异常回退问题。',
            '优化时间感知逻辑。',
            '提升整体稳定性。'
          ]
        }
      ]
    }
  ];

  /**
   * 初始化更新公告系统
   */
  function initUpdateNotice() {
    // 检查是否需要显示公告
    if (shouldShowNotice()) {
      showUpdateNotice();
    }
  }

  /**
   * 检查是否需要显示公告
   * @returns {boolean}
   */
  function shouldShowNotice() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        // 未记录，首次访问
        return true;
      }

      const data = JSON.parse(stored);

      // 检查当前版本是否已读或已隐藏
      if (data.version === UPDATE_NOTICE_VERSION) {
        // 同版本，检查是否已标记不再提醒
        return !data.dismissed;
      } else {
        // 新版本，需要显示
        return true;
      }
    } catch (e) {
      console.error('[UpdateNotice] Error checking notice status:', e);
      return true; // 出错时默认显示
    }
  }

  /**
   * 显示更新公告
   */
  function showUpdateNotice() {
    const latestUpdate = UPDATE_LOGS[0];

    // 创建遮罩和弹窗
    const overlay = document.createElement('div');
    overlay.className = 'update-notice-overlay';
    overlay.id = 'updateNoticeOverlay';

    // 构建内容区
    const sectionsHTML = latestUpdate.sections.map(section => {
      const contentHTML = section.content.map(line => line).join('<br>');
      const noteHTML = section.note ? `<div class="update-notice-note">${section.note}</div>` : '';

      return `
        <div class="update-notice-section">
          <div class="update-notice-section-title">${section.title}</div>
          <div class="update-notice-content">${contentHTML}</div>
          ${noteHTML}
        </div>
      `;
    }).join('');

    overlay.innerHTML = `
      <div class="update-notice-card">
        <div class="update-notice-header">
          <div class="update-notice-brand">GO CHAT</div>
          <div class="update-notice-title">${latestUpdate.title}</div>
          <div class="update-notice-date">${latestUpdate.date}</div>
          <img class="dev-cat" src="${latestUpdate.image}" alt="KK fan art">
        </div>

        <div class="update-notice-body">
          ${sectionsHTML}
        </div>

        <div class="update-notice-footer">
          <button class="update-notice-btn update-notice-btn-secondary" onclick="window.updateNoticeModule.dismiss()">
            不再提醒
          </button>
          <button class="update-notice-btn update-notice-btn-primary" onclick="window.updateNoticeModule.acknowledge()">
            知道了
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // 添加淡入动画
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });
  }

  /**
   * 隐藏更新公告
   */
  function hideUpdateNotice() {
    const overlay = document.getElementById('updateNoticeOverlay');
    if (overlay) {
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
      }, 300);
    }
  }

  /**
   * 用户点击"知道了"
   * 标记当前版本已读，但下次新版本仍会显示
   */
  function acknowledge() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: UPDATE_NOTICE_VERSION,
        dismissed: false,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.error('[UpdateNotice] Error saving acknowledge:', e);
    }
    hideUpdateNotice();
  }

  /**
   * 用户点击"不再提醒"
   * 标记当前版本永久隐藏
   */
  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: UPDATE_NOTICE_VERSION,
        dismissed: true,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.error('[UpdateNotice] Error saving dismiss:', e);
    }
    hideUpdateNotice();
  }

  // 暴露公共接口
  window.updateNoticeModule = {
    init: initUpdateNotice,
    acknowledge: acknowledge,
    dismiss: dismiss,
    getAllLogs: () => UPDATE_LOGS
  };

  // 页面加载完成后自动初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUpdateNotice);
  } else {
    initUpdateNotice();
  }

})();
