// ============================================================
// lifeEventsView.js — 我们的纪念册 视觉层
//
// 职责：
//   - 渲染「我们的纪念册」页面
//   - 时间轴布局
//   - 纪念卡片展示
//
// 设计语言：
//   - 暖奶油白背景
//   - 深墨绿主文字
//   - 灰鼠尾草绿辅助文字
//   - 极浅鼠尾草绿时间轴
//   - 半透明暖白内容卡
//   - 很轻的纸张感 / 柔和阴影
//   - 安静、温柔、生活化
//
// 依赖：lifeEvents.js
// ============================================================


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 正式 Keepsake 配置表
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const KEEPSAKE_REGISTRY = {
  first_takeout: {
    title: '一餐送到手里',
    description: '第一次给他送到的饭',
    image: 'images/life-events/first-takeout.png',
    icon: '🍜'
  },
  first_package_sent: {
    title: '寄往你的远方',
    description: '第一次寄给他的包裹',
    image: 'images/life-events/first-package-sent.png',
    icon: '📦'
  },
  first_package_received: {
    title: '远方寄来的你',
    description: '第一次收到他寄来的包裹',
    image: 'images/life-events/first-package-received.png',
    icon: '📦'
  },
  first_shared_home: {
    title: '我们的第一个家',
    description: '第一个共同住所',
    image: 'images/life-events/first-shared-home.png',
    icon: '🏡'
  },
  first_home_purchased: {
    title: '属于我们的钥匙',
    description: '第一次买下共同房产',
    image: 'images/life-events/first-home-purchased.png',
    icon: '🔑'
  },
  first_move: {
    title: '搬进新的生活',
    description: '第一次搬家',
    image: 'images/life-events/first-move.png',
    icon: '📦'
  },
  first_reunion_plan: {
    title: '距离开始倒数',
    description: '第一次确定见面行程',
    image: 'images/life-events/first-reunion-plan.png',
    icon: '✈️'
  },
  first_reunion: {
    title: '终于来到身边',
    description: '第一次真正 Reunion',
    image: 'images/life-events/first-reunion.png',
    icon: '✈️'
  }
};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 渲染纪念册
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderLifeEventsAlbum() {
  const container = document.getElementById('lifeEventsAlbumContainer');
  if (!container) return;

  const events = typeof getKeepsakeEvents === 'function' ? getKeepsakeEvents() : [];

  // Hero header with title overlay
  let html = `
    <div class="life-events-hero">
      <img src="images/life-events/header.png" alt="我们的纪念册" class="life-events-hero-img">
      <div class="life-events-hero-overlay">
        <div class="life-events-hero-title">我们的纪念册</div>
        <div class="life-events-hero-subtitle">一起走过的日子，都留在这里。</div>
      </div>
    </div>
  `;

  // 空状态
  if (events.length === 0) {
    html += `
      <div class="life-events-empty">
        <div class="life-events-empty-text">这里还很空。</div>
        <div class="life-events-empty-sub">以后回头看的时候，<br>会慢慢多起来的。</div>
      </div>
    `;
    container.innerHTML = html;
    return;
  }

  // 按年份分组
  const byYear = typeof groupEventsByYear === 'function'
    ? groupEventsByYear(events)
    : {};

  const years = Object.keys(byYear).sort((a, b) => b - a); // 最新年份在前

  years.forEach(year => {
    const yearEvents = byYear[year];

    // 按月份分组
    const byMonth = {};
    yearEvents.forEach(e => {
      const d = new Date(e.occurredAt);
      const monthKey = String(d.getMonth() + 1).padStart(2, '0');
      if (!byMonth[monthKey]) byMonth[monthKey] = [];
      byMonth[monthKey].push(e);
    });

    const months = Object.keys(byMonth).sort((a, b) => b - a); // 最新月份在前

    // 年份标题
    html += `<div class="life-events-year">${year}</div>`;

    // 月份
    months.forEach(monthNum => {
      const monthEvents = byMonth[monthNum];
      const monthNames = ['', 'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
        'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
      const monthNameZh = ['', '一月', '二月', '三月', '四月', '五月', '六月',
        '七月', '八月', '九月', '十月', '十一月', '十二月'];
      const monthLabel = monthNameZh[parseInt(monthNum)];
      const monthLabelEn = monthNames[parseInt(monthNum)];

      html += `<div class="life-events-month">${monthLabel} <span class="life-events-month-en">${monthLabelEn}</span></div>`;

      // 日期和纪念内容
      monthEvents.forEach(event => {
        const d = new Date(event.occurredAt);
        const day = String(d.getDate()).padStart(2, '0');
        const monthShort = monthLabelEn.slice(0, 3).toUpperCase();

        const keepsake = event.keepsake || {};
        const keepsakeKey = keepsake.key || '';

        // 从配置表获取正式内容
        const config = KEEPSAKE_REGISTRY[keepsakeKey] || {};
        const title = config.title || keepsake.title || '纪念';
        const description = config.description || keepsake.description || '';
        const image = config.image || keepsake.image || '';
        const icon = config.icon || keepsake.icon || '📖';
        const location = keepsake.location || '';

        // 纪念卡
        html += `
          <div class="life-events-entry">
            <div class="life-events-date">
              <div class="life-events-day">${day}</div>
              <div class="life-events-month-short">${monthShort}</div>
            </div>
            <div class="life-events-timeline-dot"></div>
            <div class="life-events-card">
              <div class="life-events-card-header">
                <span class="life-events-card-icon">${icon}</span>
                <span class="life-events-card-title">${title}</span>
              </div>
              ${description ? `<div class="life-events-card-desc">${description}</div>` : ''}
              ${image ? `<div class="life-events-card-image"><img src="${image}" alt="${title}" loading="lazy"></div>` : ''}
              ${location ? `<div class="life-events-card-location">📍 ${location}</div>` : ''}
            </div>
          </div>
        `;
      });
    });
  });

  // 底部结束语
  html += `<div class="life-events-ending">未完待续。</div>`;

  container.innerHTML = html;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 样式注入
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function injectLifeEventsStyles() {
  if (document.getElementById('lifeEventsStyles')) return;

  const style = document.createElement('style');
  style.id = 'lifeEventsStyles';
  style.textContent = `
    /* 我们的纪念册 */
    #lifeEventsAlbumContainer {
      padding: 0;
      background: linear-gradient(180deg, #F7F4EF 0%, #FAF7F2 100%);
      min-height: 100vh;
      overflow-y: auto;
    }

    /* Hero 头图 */
    .life-events-hero {
      position: relative;
      width: 100%;
      margin-bottom: 24px;
      overflow: hidden;
    }
    .life-events-hero-img {
      width: 100%;
      height: auto;
      display: block;
    }
    .life-events-hero-overlay {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      width: 100%;
      padding: 0 20px;
    }
    .life-events-hero-title {
      font-size: 22px;
      font-weight: 600;
      color: #1F2421;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .life-events-hero-subtitle {
      font-size: 13px;
      color: rgba(92, 99, 93, 0.75);
      letter-spacing: 0.3px;
    }

    /* 内容区域 */
    .life-events-year,
    .life-events-month,
    .life-events-entry,
    .life-events-empty,
    .life-events-ending {
      padding-left: 20px;
      padding-right: 20px;
    }

    .life-events-year:first-of-type {
      margin-top: 8px;
    }

    /* 年份 */
    .life-events-year {
      font-size: 48px;
      font-weight: 300;
      color: rgba(92, 99, 93, 0.18);
      letter-spacing: 2px;
      margin: 32px 0 24px;
      text-align: center;
    }

    /* 月份 */
    .life-events-month {
      font-size: 15px;
      font-weight: 600;
      color: #5C635D;
      letter-spacing: 1px;
      margin: 28px 0 16px 40px;
    }
    .life-events-month-en {
      font-size: 11px;
      font-weight: 400;
      color: rgba(92, 99, 93, 0.45);
      letter-spacing: 1.5px;
      margin-left: 8px;
    }

    /* 纪念条目 */
    .life-events-entry {
      display: grid;
      grid-template-columns: 52px 2px 1fr;
      gap: 16px;
      margin-bottom: 36px;
      position: relative;
    }

    /* 日期 */
    .life-events-date {
      text-align: right;
      padding-top: 4px;
    }
    .life-events-day {
      font-size: 32px;
      font-weight: 600;
      color: #1F2421;
      line-height: 1;
      margin-bottom: 4px;
    }
    .life-events-month-short {
      font-size: 11px;
      font-weight: 500;
      color: rgba(92, 99, 93, 0.45);
      letter-spacing: 0.8px;
      text-transform: uppercase;
    }

    /* 时间轴 */
    .life-events-timeline-dot {
      position: relative;
      width: 1px;
      background: linear-gradient(180deg, rgba(199, 193, 183, 0.25), rgba(199, 193, 183, 0.12));
    }
    .life-events-timeline-dot::before {
      content: '';
      position: absolute;
      top: 12px;
      left: -3.5px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: rgba(92, 99, 93, 0.35);
      border: 1.5px solid #F7F4EF;
    }

    /* 纪念卡片 */
    .life-events-card {
      background: rgba(251, 249, 245, 0.85);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(231, 225, 215, 0.6);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 2px 12px rgba(31, 36, 33, 0.04);
    }
    .life-events-card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .life-events-card-icon {
      font-size: 16px;
      line-height: 1;
    }
    .life-events-card-title {
      font-size: 16px;
      font-weight: 600;
      color: #1F2421;
      letter-spacing: 0.3px;
      line-height: 1.3;
    }
    .life-events-card-desc {
      font-size: 13px;
      color: #5C635D;
      line-height: 1.6;
      margin-bottom: 12px;
    }
    .life-events-card-image {
      margin: 12px 0;
      border-radius: 8px;
      overflow: hidden;
    }
    .life-events-card-image img {
      width: 100%;
      height: auto;
      display: block;
      border-radius: 8px;
    }
    .life-events-card-location {
      font-size: 12px;
      color: rgba(92, 99, 93, 0.6);
      margin-top: 8px;
      letter-spacing: 0.3px;
    }

    /* 空状态 */
    .life-events-empty {
      text-align: center;
      padding: 120px 40px;
      color: #5C635D;
    }
    .life-events-empty-text {
      font-size: 16px;
      font-weight: 500;
      color: #1F2421;
      margin-bottom: 12px;
      letter-spacing: 0.5px;
    }
    .life-events-empty-sub {
      font-size: 14px;
      color: rgba(92, 99, 93, 0.6);
      line-height: 1.8;
    }

    /* 结束语 */
    .life-events-ending {
      text-align: center;
      font-size: 13px;
      color: rgba(92, 99, 93, 0.25);
      margin: 60px 0 40px;
      letter-spacing: 2px;
      padding-bottom: calc(80px + env(safe-area-inset-bottom));
    }
  `;

  document.head.appendChild(style);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 初始化
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function initLifeEventsView() {
  injectLifeEventsStyles();
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 暴露给全局
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if (typeof window !== 'undefined') {
  window.renderLifeEventsAlbum = renderLifeEventsAlbum;
  window.initLifeEventsView = initLifeEventsView;
}
