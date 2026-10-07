// ============================================================
// triggers.js — 地点特产触发（Batch 2 清理后）
//
// 职责：地点特产反寄触发（来自 events.js）
//
// 依赖：events.js
// 注意：checkLocationSpecialTrigger 定义在 events.js，这里直接调用
//
// 已删除：
//   - mood_change 判断（Phase 3G-1 已停止 AI 自动生产 mood）
//   - market 商城高亮触发（无实际消费者）
//   - emotion 情绪反寄触发（REVERSE_DELIVERY_ENABLED=false，属于旧行为导演链）
// ============================================================

// checkLocationSpecialTrigger 包装器：仅调用地点特产逻辑
async function checkTriggersAndEmotion(userText, _botText) {
  if (typeof checkLocationSpecialTrigger === 'function') {
    checkLocationSpecialTrigger(userText).catch(() => {});
  }
}
