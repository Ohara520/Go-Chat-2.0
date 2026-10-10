/* Temporary visual maintenance gate. Not a server-side security boundary. */
(function () {
  'use strict';
  var key = 'gochat_maintenance_admin';
  var unlocked = false;
  try { unlocked = localStorage.getItem(key) === '1'; } catch (_) {}
  if (unlocked) return;

  var style = document.createElement('style');
  style.textContent = [
    'html.gochat-maintenance-pending body{visibility:hidden!important}',
    '#gochat-maintenance{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;background:linear-gradient(155deg,#f9f6f0,#eee6da);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#58483d;box-sizing:border-box}',
    '#gochat-maintenance *{box-sizing:border-box}',
    '#gochat-maintenance .maintenance-card{width:min(100%,390px);padding:48px 28px 32px;text-align:center;border:1px solid rgba(135,110,90,.16);border-radius:22px;background:rgba(255,255,255,.68);box-shadow:0 20px 55px rgba(89,68,51,.08)}',
    '#gochat-maintenance .maintenance-brand{font-family:Georgia,serif;font-size:18px;letter-spacing:2px;margin-bottom:33px}',
    '#gochat-maintenance h1{font-size:23px;font-weight:500;letter-spacing:3px;margin:0 0 22px}',
    '#gochat-maintenance p{font-size:14px;line-height:2;color:#88776b;margin:0}',
    '#gochat-maintenance .maintenance-admin{display:block;margin:42px auto 0;border:0;background:none;color:#a89a90;font-size:12px;letter-spacing:1px;cursor:pointer;padding:10px}',
    '#gochat-maintenance .maintenance-form{display:none;margin-top:20px}',
    '#gochat-maintenance .maintenance-form.open{display:block}',
    '#gochat-maintenance input{width:100%;height:44px;padding:0 12px;border:1px solid #d9cfc4;border-radius:9px;background:#fff;color:#58483d;font-size:15px;outline:none}',
    '#gochat-maintenance .maintenance-submit{width:100%;height:43px;margin-top:12px;border:0;border-radius:9px;background:#725b4b;color:white;font-size:14px;cursor:pointer}',
    '#gochat-maintenance .maintenance-error{min-height:18px;margin-top:9px;font-size:12px;color:#ad635d}',
    '#gochat-maintenance .maintenance-submit:disabled{opacity:.6;cursor:wait}'
  ].join('');
  document.head.appendChild(style);
  document.documentElement.classList.add('gochat-maintenance-pending');

  function init() {
    var overlay = document.createElement('div');
    overlay.id = 'gochat-maintenance';
    overlay.innerHTML = '<div class="maintenance-card"><div class="maintenance-brand">Go Chat</div><h1>网站维护中</h1><p>网站目前正在维护，请耐心等待。<br>感谢您的理解与支持。</p><button type="button" class="maintenance-admin">管理员入口</button><form class="maintenance-form"><input type="password" autocomplete="current-password" placeholder="请输入管理员密码" aria-label="管理员密码" required><button type="submit" class="maintenance-submit">进入网站</button><div class="maintenance-error" role="status" aria-live="polite"></div></form></div>';
    document.body.appendChild(overlay);
    document.documentElement.classList.remove('gochat-maintenance-pending');
    var trigger = overlay.querySelector('.maintenance-admin');
    var form = overlay.querySelector('.maintenance-form');
    var input = form.querySelector('input');
    var submit = form.querySelector('button');
    var error = form.querySelector('.maintenance-error');
    trigger.addEventListener('click', function () {
      form.classList.toggle('open');
      if (form.classList.contains('open')) input.focus();
    });
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (!input.value) return;
      submit.disabled = true;
      error.textContent = '';
      try {
        var response = await fetch('/api/admin-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: input.value })
        });
        var result = await response.json();
        if (!response.ok || !result.ok) throw new Error('验证失败，请检查密码');
        try { localStorage.setItem(key, '1'); } catch (_) {}
        overlay.remove();
      } catch (e) {
        error.textContent = '密码错误或验证失败，请重试';
        input.value = '';
        input.focus();
      } finally {
        submit.disabled = false;
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
