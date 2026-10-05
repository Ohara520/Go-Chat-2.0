// ============================================================
// lifeEventsMigration.js — Legacy → Life Events V1 Migration
//
// 职责：
//   - 一次性迁移：从业务历史数据 + storyBook fallback 生成初始纪念
//   - 仅在老用户首次进入 Life Events V1 时执行一次
//   - 幂等，防止重复迁移
//
// 依赖：lifeEvents.js
// ============================================================


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Migration 主函数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function migrateLifeEventsV1() {
  // 幂等检查
  if (localStorage.getItem('lifeEventsV1MigrationDone') === 'true') {
    console.log('[Life Events V1 Migration] Already done, skipping.');
    return;
  }

  console.log('[Life Events V1 Migration] Starting...');
  const now = Date.now();

  // 1. first_takeout
  _migrateTakeout(now);

  // 2. first_package_sent
  _migratePackageSent(now);

  // 3. first_package_received
  _migratePackageReceived(now);

  // 4-6. Housing (shared_home / purchased / move)
  _migrateHousing(now);

  // 7. first_reunion_plan
  _migrateReunionPlan(now);

  // 8. first_reunion
  _migrateReunion(now);

  // 完成标记
  localStorage.setItem('lifeEventsV1MigrationDone', 'true');
  console.log('[Life Events V1 Migration] Complete.');
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. first_takeout
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _migrateTakeout(now) {
  // 业务历史优先：找最早的已送达外卖
  const takeouts = JSON.parse(localStorage.getItem('takeoutOrders') || '[]');
  const delivered = takeouts
    .filter(t => t.status === 'delivered' && t.deliveredAt)
    .sort((a, b) => a.deliveredAt - b.deliveredAt);

  if (delivered.length > 0) {
    const first = delivered[0];
    _recordKeepsake('first_takeout', first.deliveredAt, now);
    console.log(`[Migration] first_takeout: ${new Date(first.deliveredAt).toISOString()}`);
    return;
  }

  // Fallback: storyBook 中可能有旧记录
  const storyBook = JSON.parse(localStorage.getItem('storyBook') || '[]');
  const takeoutStory = storyBook.find(s => s.storyId === 'first_takeout' || s.title === '第一次送餐');
  if (takeoutStory && takeoutStory.unlockedAt) {
    _recordKeepsake('first_takeout', takeoutStory.unlockedAt, now);
    console.log(`[Migration] first_takeout (fallback): ${new Date(takeoutStory.unlockedAt).toISOString()}`);
    return;
  }

  console.log('[Migration] first_takeout: no reliable history, skipping.');
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. first_package_sent (用户寄给 Ghost)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _migratePackageSent(now) {
  // 业务历史：deliveries 中 Ghost 已签收的第一条
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  const sent = deliveries
    .filter(d => !d.isGhostSend && d.done && d.doneAt)
    .sort((a, b) => a.doneAt - b.doneAt);

  if (sent.length > 0) {
    const first = sent[0];
    _recordKeepsake('first_package_sent', first.doneAt, now);
    console.log(`[Migration] first_package_sent: ${new Date(first.doneAt).toISOString()}`);
    return;
  }

  // Fallback: storyBook
  const storyBook = JSON.parse(localStorage.getItem('storyBook') || '[]');
  const story = storyBook.find(s => s.storyId === 'first_package_sent' || s.title?.includes('寄给他'));
  if (story && story.unlockedAt) {
    _recordKeepsake('first_package_sent', story.unlockedAt, now);
    console.log(`[Migration] first_package_sent (fallback): ${new Date(story.unlockedAt).toISOString()}`);
    return;
  }

  console.log('[Migration] first_package_sent: no reliable history, skipping.');
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. first_package_received (Ghost 寄给用户)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _migratePackageReceived(now) {
  // 业务历史：Ghost 寄出的快递已签收
  const deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
  const received = deliveries
    .filter(d => d.isGhostSend && d.done && d.doneAt)
    .sort((a, b) => a.doneAt - b.doneAt);

  if (received.length > 0) {
    const first = received[0];
    _recordKeepsake('first_package_received', first.doneAt, now);
    console.log(`[Migration] first_package_received: ${new Date(first.doneAt).toISOString()}`);
    return;
  }

  // Fallback: storyBook
  const storyBook = JSON.parse(localStorage.getItem('storyBook') || '[]');
  const story = storyBook.find(s => s.storyId === 'first_package_received' || s.title?.includes('他寄'));
  if (story && story.unlockedAt) {
    _recordKeepsake('first_package_received', story.unlockedAt, now);
    console.log(`[Migration] first_package_received (fallback): ${new Date(story.unlockedAt).toISOString()}`);
    return;
  }

  console.log('[Migration] first_package_received: no reliable history, skipping.');
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4-6. Housing (shared_home / purchased / move)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _migrateHousing(now) {
  // 当前系统没有真实 housing 历史数据，只能依赖 storyBook fallback
  const storyBook = JSON.parse(localStorage.getItem('storyBook') || '[]');

  // first_shared_home
  const sharedHomeStory = storyBook.find(s =>
    s.storyId === 'first_shared_home' || s.title?.includes('第一个家')
  );
  if (sharedHomeStory && sharedHomeStory.unlockedAt) {
    _recordKeepsake('first_shared_home', sharedHomeStory.unlockedAt, now);
    console.log(`[Migration] first_shared_home (fallback): ${new Date(sharedHomeStory.unlockedAt).toISOString()}`);
  } else {
    console.log('[Migration] first_shared_home: no reliable history, skipping.');
  }

  // first_home_purchased
  const purchasedStory = storyBook.find(s =>
    s.storyId === 'first_home_purchased' || s.title?.includes('买下')
  );
  if (purchasedStory && purchasedStory.unlockedAt) {
    _recordKeepsake('first_home_purchased', purchasedStory.unlockedAt, now);
    console.log(`[Migration] first_home_purchased (fallback): ${new Date(purchasedStory.unlockedAt).toISOString()}`);
  } else {
    console.log('[Migration] first_home_purchased: no reliable history, skipping.');
  }

  // first_move
  const moveStory = storyBook.find(s =>
    s.storyId === 'first_move' || s.title?.includes('搬家')
  );
  if (moveStory && moveStory.unlockedAt) {
    _recordKeepsake('first_move', moveStory.unlockedAt, now);
    console.log(`[Migration] first_move (fallback): ${new Date(moveStory.unlockedAt).toISOString()}`);
  } else {
    console.log('[Migration] first_move: no reliable history, skipping.');
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. first_reunion_plan
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _migrateReunionPlan(now) {
  // 当前系统没有 reunion plan 业务数据，只能 storyBook fallback
  const storyBook = JSON.parse(localStorage.getItem('storyBook') || '[]');
  const story = storyBook.find(s =>
    s.storyId === 'first_reunion_plan' || s.title?.includes('确定见面') || s.title?.includes('行程')
  );

  if (story && story.unlockedAt) {
    _recordKeepsake('first_reunion_plan', story.unlockedAt, now);
    console.log(`[Migration] first_reunion_plan (fallback): ${new Date(story.unlockedAt).toISOString()}`);
  } else {
    console.log('[Migration] first_reunion_plan: no reliable history, skipping.');
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. first_reunion
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _migrateReunion(now) {
  // 当前系统没有真实 reunion 完成数据，只能 storyBook fallback
  const storyBook = JSON.parse(localStorage.getItem('storyBook') || '[]');
  const story = storyBook.find(s =>
    s.storyId === 'first_reunion' || s.title?.includes('来到身边') || s.title?.includes('Reunion')
  );

  if (story && story.unlockedAt) {
    _recordKeepsake('first_reunion', story.unlockedAt, now);
    console.log(`[Migration] first_reunion (fallback): ${new Date(story.unlockedAt).toISOString()}`);
  } else {
    console.log('[Migration] first_reunion: no reliable history, skipping.');
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper：记录纪念
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _recordKeepsake(key, occurredAt, recordedAt) {
  if (typeof recordLifeEvent !== 'function') {
    console.error('[Migration] recordLifeEvent not available.');
    return;
  }

  recordLifeEvent({
    type: 'keepsake',
    keepsake: { key },
    occurredAt,
    recordedAt,
    migrated: true
  });
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 暴露给全局
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if (typeof window !== 'undefined') {
  window.migrateLifeEventsV1 = migrateLifeEventsV1;
}
