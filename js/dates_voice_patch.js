// ============================================================
// dates_voice_patch.js — 约会系统语音补丁 v1.0
//
// 作用：
//   不改动你的 dates.js 原文件
//   通过 hook renderDateScene 的方式，在约会气泡渲染后
//   自动调用 installDateVoiceButtons()（来自 voice.js）
//
// 加载顺序：
//   api.js → voice.js → dates.js → dates_voice_patch.js
//
// ============================================================

(function _installDateVoicePatch() {

  // 等 dates.js 里的 renderDateScene 挂到 window
  function _tryPatch() {
    if (typeof renderDateScene !== 'function') {
      // dates.js 还没加载完，50ms 后重试
      setTimeout(_tryPatch, 50);
      return;
    }

    // 避免重复 patch
    if (window.renderDateScene && window.renderDateScene._voicePatched) return;

    const _origRender = window.renderDateScene || renderDateScene;

    window.renderDateScene = function(...args) {
      // 先执行原来的渲染
      const result = _origRender.apply(this, args);

      // 渲染完 DOM 后，注入播放按钮
      // 用 requestAnimationFrame 确保 DOM 已更新
      requestAnimationFrame(() => {
        if (typeof installDateVoiceButtons === 'function') {
          installDateVoiceButtons();
        }
      });

      return result;
    };

    window.renderDateScene._voicePatched = true;
    console.log('[dates_voice_patch] renderDateScene 已 patch，约会语音按钮已启用');
  }

  // DOM 就绪后开始尝试 patch
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _tryPatch);
  } else {
    _tryPatch();
  }

})();
