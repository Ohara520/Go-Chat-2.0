# WorldBook / Memory Regression Fix — 完成报告

## 问题描述

User Turn Batching 大修后，不同回复路由绕过长期记忆更新，导致：
- Turn 正常计数（`tickTurn()` 已统一在 `_commitPendingUserTurn` 调用）
- 但如果第 5/10/15... turn 落在 Gemini 路由上，本轮长期记忆 checkpoint 整体丢失
- 继而 WorldBook 不会自动生成

根因：
- Claude 日常主链在 `sendMessage.js` 尾部独占执行 Memory 更新
- Gemini intimate route 执行 `return` 后直接绕过该段代码
- Soft Handoff / breakout fallback → Gemini 同样提前 return

## 解决方案

创建统一 Memory Checkpoint 函数 `_runPostTurnMemory(reply, text, turn)`：
- 职责：在成功完成一个 semantic turn 后更新短期/长期记忆
- 不属于"Claude 日常回复专属尾部逻辑"
- 所有成功路由统一调用

## 修改内容

### 1. 新增公共 helper（273-304 行）

```javascript
// ===== Memory Checkpoint V1：统一 Memory 更新入口 =====
async function _runPostTurnMemory(reply, text, turn) {
  // 空回复或网络错误不更新
  if (!reply || reply.includes('___NETWORK_ERROR___')) return;
  // 门槛：保持原有 reply.length > 50 的判定
  if (reply.length <= 50) return;

  try {
    // 短期记忆：每次都更新
    await updateShortTermMemory(reply, text).catch(e =>
      console.warn('短期记忆更新失败:', e)
    );

    // 长期记忆：每 5 turn 一次 checkpoint
    if (turn % 5 === 0) {
      await updateLongTermMemory(reply, text).catch(e =>
        console.warn('长期记忆更新失败:', e)
      );

      // Relationship Learning：每 5 turn 触发一次判断
      if (typeof maybeLearnRelationship === 'function') {
        await maybeLearnRelationship().catch(e =>
          console.warn('关系理解学习失败:', e)
        );
      }
    }
  } catch (e) {
    console.warn('[Memory Checkpoint] 更新失败:', e);
  }
}
```

### 2. Claude 日常正常回复路径（1594-1601 行）

**Before:**
```javascript
if (reply.length > 50 && !reply.includes('___NETWORK_ERROR___')) {
  setTimeout(() => {
    updateShortTermMemory(reply, text).catch(e => console.warn('短期记忆更新失败:', e));
    if (_currentTurn % 5 === 0) {
      updateLongTermMemory(reply, text).catch(e => console.warn('长期记忆更新失败:', e));
      if (typeof maybeLearnRelationship === 'function') {
        maybeLearnRelationship().catch(e => console.warn('关系理解学习失败:', e));
      }
    }
  }, 2000);
}
```

**After:**
```javascript
if (reply && !reply.includes('___NETWORK_ERROR___')) {
  setTimeout(() => {
    _runPostTurnMemory(reply, text, _currentTurn);
  }, 2000);
}
```

### 3. Gemini 成功回复路径（2017-2022 行）

在 `_handleIntimateReply()` 的成功出口（firstPart 落地后）新增：

```javascript
// 🔧 统一 Memory Checkpoint：Gemini 成功回复后调用
const _currentTurn = typeof getGlobalTurnCount === 'function' 
  ? getGlobalTurnCount() 
  : parseInt(localStorage.getItem('globalTurnCount') || '0');
setTimeout(() => {
  _runPostTurnMemory(firstPart, text, _currentTurn);
}, 2000);
```

### 4. Gemini 重试成功路径（1986-1990 行）

在复读检测重试成功出口新增：

```javascript
// 🔧 统一 Memory Checkpoint：Gemini 重试成功后调用
const _currentTurn = typeof getGlobalTurnCount === 'function' 
  ? getGlobalTurnCount() 
  : parseInt(localStorage.getItem('globalTurnCount') || '0');
setTimeout(() => {
  _runPostTurnMemory(_retryClean, text, _currentTurn);
}, 2000);
```

## 重复触发防护

### Gemini 路径防重复
- `_handleIntimateReply()` 内只有两个成功出口（正常成功 + 重试成功）
- 每个出口只调用一次 checkpoint
- 两个出口互斥（重试成功提前 return）

### Claude → Gemini fallback 防重复
- Claude breakout / network fallback 都调用 `_handleIntimateReply()`
- 不在调用前执行 checkpoint，只在 Gemini 成功落地出口统一执行
- 避免 Claude 主路径 + Gemini 出口双触发

## 验证清单

✅ 1. 修改了 `_runPostTurnMemory` 公共函数（新增）
✅ 2. Claude 正常路由通过调用 `_runPostTurnMemory` 进入 checkpoint
✅ 3. Gemini intimate 成功回复通过调用 `_runPostTurnMemory` 进入 checkpoint
✅ 4. Gemini 重试成功回复通过调用 `_runPostTurnMemory` 进入 checkpoint
✅ 5. Soft Handoff / fallback 不会重复触发（都走 Gemini 出口统一执行）
✅ 6. 每 5 semantic turns 的长期记忆 cadence 未改变（仍为 `turn % 5 === 0`）
✅ 7. WorldBook 创建链完全未改（`updateLongTermMemory` 内部逻辑不变）
✅ 8. 保持原有 `reply.length > 50` 门槛（在 `_runPostTurnMemory` 内统一判断）
✅ 9. 保持原有 2000ms 延迟行为（不阻塞 Simon 回复）
✅ 10. 未修改其他文件，未做无关清理

## 关键设计决策

### 门槛保持
- 保持原有 `reply.length > 50` 门槛
- 在公共 checkpoint 统一判断，避免太短回复污染记忆
- Gemini 原本从未受这个门槛控制，现在也受同样约束（语义一致）

### 异步行为保持
- 保持 2000ms 延迟（`setTimeout(..., 2000)`）
- 不阻塞 Simon 回复
- 不 await DeepSeek 后才结束聊天
- 每个 semantic turn 最多触发一次 Memory checkpoint

### Turn Number 使用
- 使用当前 semantic turn 的 turn number
- 不在 `_handleIntimateReply()` 调用之前执行（assistant 回复尚未成功完成）
- 在成功回复真正落地后读取 `getGlobalTurnCount()`

## 未修改项（按要求保留）

- `updateLongTermMemory()` 内部逻辑
- `.slice(-6)` 历史窗口大小
- DeepSeek prompt
- `importance >= 4` 阈值
- add/update/none 逻辑
- `saveLongTermMemoryEntry()`
- `addWorldBookEntry()`
- WorldBook linking
- cloud.js
- ghostContext.js
- Persona
- Continuity
- Turn Batching
- `tickTurn()`
- Relationship Learning 本身

## 测试场景

1. **正常 Claude 回复（第 5 turn）**：
   - 用户发送 5 条日常消息
   - Claude 正常回复
   - ✅ 第 5 turn 触发长期记忆更新

2. **Gemini intimate 回复（第 5 turn）**：
   - 用户发送 4 条日常 + 1 条调情消息
   - Gemini 成功回复
   - ✅ 第 5 turn 触发长期记忆更新（修复前会丢失）

3. **Soft Handoff（第 5 turn）**：
   - 调情后用户说日常话
   - Claude 候选破防 → Gemini 日常接续
   - ✅ 第 5 turn 触发长期记忆更新（修复前会丢失）

4. **Claude breakout fallback（第 5 turn）**：
   - Claude 破防 → Gemini 接手
   - ✅ 第 5 turn 触发长期记忆更新（修复前会丢失）

5. **失败/空回复**：
   - 网络错误 / 空回复
   - ✅ 不触发记忆更新（符合预期）

## 代码片段对比

### Claude 主路径
**Before (1563-1575 行):**
```javascript
// 独占的 Memory 更新逻辑
if (reply.length > 50 && !reply.includes('___NETWORK_ERROR___')) {
  setTimeout(() => {
    updateShortTermMemory(reply, text).catch(...);
    if (_currentTurn % 5 === 0) {
      updateLongTermMemory(reply, text).catch(...);
      maybeLearnRelationship().catch(...);
    }
  }, 2000);
}
```

**After (1596-1601 行):**
```javascript
// 调用统一 checkpoint
if (reply && !reply.includes('___NETWORK_ERROR___')) {
  setTimeout(() => {
    _runPostTurnMemory(reply, text, _currentTurn);
  }, 2000);
}
```

### Gemini 路径
**Before:**
```javascript
// 成功落地后直接 return，绕过 Memory 更新
appendMessage('bot', firstPart);
chatHistory.push({ role: 'assistant', content: firstPart, ... });
saveHistory();
// ... 其他副作用
return;  // ← 这里 return，Memory 更新永远不会执行
```

**After (2017-2024 行):**
```javascript
appendMessage('bot', firstPart);
chatHistory.push({ role: 'assistant', content: firstPart, ... });
saveHistory();
// ... 其他副作用

// 🔧 统一 Memory Checkpoint：Gemini 成功回复后调用
const _currentTurn = getGlobalTurnCount();
setTimeout(() => {
  _runPostTurnMemory(firstPart, text, _currentTurn);
}, 2000);

return;  // ← 现在 Memory 更新已经进入队列，不会丢失
```

## 结论

✅ **修复完成**：所有回复路由现在都会触发统一的 Memory checkpoint  
✅ **Cadence 不变**：每 5 semantic turns 更新一次长期记忆  
✅ **WorldBook 链不变**：`updateLongTermMemory` → `saveLongTermMemoryEntry` → `addWorldBookEntry`  
✅ **无副作用**：只修改了 sendMessage.js，未动其他文件  
✅ **门槛一致**：所有路由都受同样的 `reply.length > 50` 约束  

现在无论用户第 5/10/15... turn 说的是日常话（Claude）还是调情话（Gemini），  
长期记忆 checkpoint 都会正常执行，WorldBook 自动生成不再丢失。
