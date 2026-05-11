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

  function _tryPatch() {
    // 等 dates.js 把 renderDateScene 挂到 window 上
    if (typeof window.renderDateScene !== 'function') {
      setTimeout(_tryPatch, 50);
      return;
    }

    // 避免重复 patch
    if (window.renderDateScene._voicePatched) return;

    const _origRender = window.renderDateScene;

    window.renderDateScene = function(...args) {
      const result = _origRender.apply(this, args);
      requestAnimationFrame(() => {
        if (typeof installDateVoiceButtons === 'function') {
          installDateVoiceButtons();
        }
      });
      return result;
    };

    window.renderDateScene._voicePatched = true;
    console.log('[dates_voice_patch] renderDateScene 已 patch，约会语音按钮已启用');

    // 关键修复：patch 完之后再检查一次，防止 dates.js 再次覆盖
    // 用 MutationObserver 监听 dateSceneBubbles 变化，随时补注入
    const observer = new MutationObserver(() => {
      if (typeof installDateVoiceButtons === 'function') {
        installDateVoiceButtons();
      }
    });
    const tryObserve = () => {
      const container = document.getElementById('dateSceneBubbles');
      if (container) {
        observer.observe(container, { childList: true, subtree: true });
      } else {
        setTimeout(tryObserve, 500);
      }
    };
    tryObserve();
  }

  // 等页面完全加载后再 patch，确保 dates.js 已经执行完
  if (document.readyState === 'complete') {
    setTimeout(_tryPatch, 100);
  } else {
    window.addEventListener('load', () => setTimeout(_tryPatch, 100));
  }

})();
