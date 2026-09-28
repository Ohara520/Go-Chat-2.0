/* ═══════════════════════════════════════
   Delivery V1 — 展示层（只读）
   进入页面时重新读取 localStorage，不缓存独立 state。
   本文件禁止修改任何 Delivery 数据 / 状态机。
═══════════════════════════════════════ */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 仅展示层：去掉 status 开头的 emoji / 符号 / 空白，得到纯文字标签。
  // 不改原始 stage.status 数据。
  function stripLeadingEmoji(s) {
    return String(s == null ? '' : s).replace(/^[^\p{L}\p{N}]+/u, '');
  }

  function readList(key) {
    try {
      var arr = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  // 图片 + emoji fallback；图片加载失败时切回 emoji
  function thumbHtml(d, cls, emojiCls) {
    var emoji = esc(d && d.emoji ? d.emoji : '📦');
    if (d && d.image) {
      return '<div class="' + cls + '">' +
        '<img src="' + esc(d.image) + '" alt="" ' +
        'onerror="this.parentNode.innerHTML=&quot;<span class=\\&quot;' + emojiCls + '\\&quot;>' + emoji + '</span>&quot;">' +
        '</div>';
    }
    return '<div class="' + cls + '"><span class="' + emojiCls + '">' + emoji + '</span></div>';
  }

  function fmtDate(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function fmtDateTime(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var hh = ('0' + d.getHours()).slice(-2);
    var mm = ('0' + d.getMinutes()).slice(-2);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hh + ':' + mm;
  }

  var CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>';

  // 动态时间线：只读 stages / done / currentStage，不写数据
  function timelineHtml(d) {
    var stages = (d && Array.isArray(d.stages)) ? d.stages : [];
    if (!stages.length) return '';
    var cur = (typeof d.currentStage === 'number') ? d.currentStage : -1;
    var parts = ['<div class="dlv-timeline">'];
    for (var i = 0; i < stages.length; i++) {
      var s = stages[i] || {};
      var cls = 'dlv-tl-step';
      if (s.done) cls += ' done';
      else if (i === cur) cls += ' current';
      var label = esc(stripLeadingEmoji(s.status || ''));
      var dot = s.done ? CHECK_SVG : '';
      parts.push(
        '<div class="' + cls + '">' +
          '<div class="dlv-tl-dot">' + dot + '</div>' +
          '<div class="dlv-tl-label">' + label + '</div>' +
        '</div>'
      );
    }
    parts.push('</div>');
    return parts.join('');
  }

  // 当前物流状态文案：优先当前阶段 zh，否则最后已完成阶段
  function currentStatusText(d) {
    var stages = (d && Array.isArray(d.stages)) ? d.stages : [];
    if (!stages.length) return '';
    var cur = (typeof d.currentStage === 'number') ? d.currentStage : -1;
    if (cur >= 0 && cur < stages.length && stages[cur]) {
      return stages[cur].zh || stages[cur].status || '';
    }
    for (var i = stages.length - 1; i >= 0; i--) {
      if (stages[i] && stages[i].done) return stages[i].zh || stages[i].status || '';
    }
    return stages[0].zh || stages[0].status || '';
  }

  // ETA：最后一个 stage 的 triggerAt，异常则不显示
  function etaHtml(d) {
    var stages = (d && Array.isArray(d.stages)) ? d.stages : [];
    if (!stages.length) return '';
    var last = stages[stages.length - 1];
    if (!last || typeof last.triggerAt !== 'number') return '';
    var txt = fmtDate(last.triggerAt);
    if (!txt) return '';
    return '<div class="dlv-eta"><span class="dlv-eta-label">预计送达</span>' +
      '<span class="dlv-eta-date">' + txt + '</span></div>';
  }

  function transitCardHtml(d) {
    return '<div class="dlv-card">' +
      '<div class="dlv-card-top">' +
        thumbHtml(d, 'dlv-thumb', 'dlv-thumb-emoji') +
        '<div class="dlv-card-mid">' +
          '<div class="dlv-card-name">' + esc(d.name || '包裹') + '</div>' +
          '<div class="dlv-card-status">' + esc(currentStatusText(d)) + '</div>' +
        '</div>' +
        '<div class="dlv-card-right">' +
          etaHtml(d) +
        '</div>' +
      '</div>' +
      timelineHtml(d) +
    '</div>';
  }

  function historyCardHtml(d) {
    var dateHtml = '';
    if (typeof d.doneAt === 'number') {
      var t = fmtDateTime(d.doneAt);
      if (t) dateHtml = '<span class="dlv-hist-date">' + esc(t) + '</span>';
    }
    return '<div class="dlv-hist">' +
      thumbHtml(d, 'dlv-hist-thumb', 'dlv-hist-thumb-emoji') +
      '<div class="dlv-hist-mid">' +
        '<div class="dlv-hist-name">' + esc(d.name || '包裹') + '</div>' +
        '<div class="dlv-hist-meta">' +
          '<span class="dlv-hist-badge">' + CHECK_SVG + '已送达</span>' +
          dateHtml +
        '</div>' +
      '</div>' +
    '</div>';
  }

  var TRUCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.5h11v9H2z"/><path d="M13 9.5h4l3 3v3h-7z"/><circle cx="6" cy="17.5" r="1.6"/><circle cx="16.5" cy="17.5" r="1.6"/></svg>';
  var BOX_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/></svg>';

  // 主渲染：每次进入页面调用，重新读 localStorage
  function renderDeliveryPage() {
    var body = document.getElementById('deliveryBody');
    if (!body) return;

    var active = readList('deliveries').filter(function (d) {
      return d && !d.done && !d.isLostConfirmed;
    });
    var history = readList('deliveryHistory');

    // 三种空状态：两者都无 → 整页安静占位
    if (!active.length && !history.length) {
      body.innerHTML =
        '<div class="dlv-empty-full">' +
          '<div class="dlv-empty-full-icon">' + BOX_SVG + '</div>' +
          '<div class="dlv-empty-full-zh">还没有任何包裹</div>' +
          '<div class="dlv-empty-full-en">Nothing on its way yet.</div>' +
        '</div>';
      return;
    }

    var html = '';

    // 正在运输中
    html += '<div class="dlv-group">' +
      '<div class="dlv-group-head">' +
        '<span class="dlv-group-icon">' + TRUCK_SVG + '</span>' +
        '<span class="dlv-group-titles">' +
          '<span class="dlv-group-zh">正在运输中</span>' +
          '<span class="dlv-group-en">In Transit</span>' +
        '</span>' +
        '<span class="dlv-group-count">' + active.length + ' 件包裹</span>' +
      '</div>';
    if (active.length) {
      html += active.map(transitCardHtml).join('');
    } else {
      html += '<div class="dlv-empty">' +
        '<div class="dlv-empty-zh">目前没有在途包裹</div>' +
        '<div class="dlv-empty-en">All quiet for now.</div>' +
      '</div>';
    }
    html += '</div>';

    // 已送达
    html += '<div class="dlv-group">' +
      '<div class="dlv-group-head">' +
        '<span class="dlv-group-icon">' + BOX_SVG + '</span>' +
        '<span class="dlv-group-titles">' +
          '<span class="dlv-group-zh">已送达</span>' +
          '<span class="dlv-group-en">Delivered</span>' +
        '</span>' +
        '<span class="dlv-group-count">' + history.length + ' 件包裹</span>' +
      '</div>';
    if (history.length) {
      html += history.map(historyCardHtml).join('');
    } else {
      html += '<div class="dlv-empty">' +
        '<div class="dlv-empty-zh">还没有已送达的包裹</div>' +
        '<div class="dlv-empty-en">Nothing has arrived yet.</div>' +
      '</div>';
    }
    html += '</div>';

    body.innerHTML = html;
  }

  window.renderDeliveryPage = renderDeliveryPage;
})();

