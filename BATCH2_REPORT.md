# Life Events V1 · Batch 2 完成报告

## 一、修改文件列表

### 新增文件
1. **js/lifeEvents/lifeEventsMigration.js** — Legacy → Life Events V1 一次性迁移

### 修改文件
2. **index.html**
   - 引入 `lifeEventsMigration.js`
   - 删除 Love Space「回忆」Tab 及其面板 DOM：
     - `tabMemory` 按钮
     - `panelMemory` 容器
     - `memoryStageBar`
     - `memoryHighlights`
     - `memoryTimeline`

3. **js/feed.js**
   - 退役 `buildSharedMemories()`、`getRelationshipStage()`、`renderSharedMemories()`、`renderMemoryCard()` — 保留空壳防止调用报错
   - 修改 `switchCoupleTab()` — 移除对 `panelMemory` 和 `tabMemory` 的引用

4. **js/app.js**
   - 在 `window.onload` 云端加载完成后添加：
     - `migrateLifeEventsV1()` 调用（老用户首次迁移）
     - `initLifeEventsView()` 调用（样式注入）

---

## 二、正式 Keepsake 配置位置

**js/lifeEvents/lifeEventsView.js** 第 26-75 行：

```javascript
const KEEPSAKE_REGISTRY = {
  first_takeout:          { title, description, image, icon },
  first_package_sent:     { ... },
  first_package_received: { ... },
  first_shared_home:      { ... },
  first_home_purchased:   { ... },
  first_move:             { ... },
  first_reunion_plan:     { ... },
  first_reunion:          { ... }
};
```

View 层通过 `keepsake.key` 查配置表，获取标题、说明、图片、图标，统一渲染。

---

## 三、header.png 接入位置

**js/lifeEvents/lifeEventsView.js** 第 88-93 行：

```javascript
// Hero header
let html = `
  <div class="life-events-hero">
    <img src="images/life-events/header.png" alt="我们的纪念册" class="life-events-hero-img">
  </div>
`;
```

不参与 Life Event 数据，只作为纪念册顶部视觉。

---

## 四、Legacy Migration 数据来源

### 1. first_takeout
- **业务数据优先**：`localStorage.takeoutOrders` → 最早 `status: 'delivered'` 记录的 `deliveredAt`
- **Fallback**：`storyBook` 中 `storyId === 'first_takeout'` 的 `unlockedAt`

### 2. first_package_sent
- **业务数据优先**：`localStorage.deliveries` → 最早非 Ghost 寄出且 `done: true` 的 `doneAt`
- **Fallback**：`storyBook` 中标题包含「寄给他」的记录

### 3. first_package_received
- **业务数据优先**：`localStorage.deliveries` → 最早 `isGhostSend: true` 且 `done: true` 的 `doneAt`
- **Fallback**：`storyBook` 中标题包含「他寄」的记录

### 4-6. Housing (shared_home / purchased / move)
- **无业务数据**：当前系统无 housing 历史
- **仅 Fallback**：`storyBook` 中匹配 `storyId` 或标题关键字的 `unlockedAt`

### 7. first_reunion_plan
- **无业务数据**
- **仅 Fallback**：`storyBook` 中标题包含「确定见面」或「行程」的记录

### 8. first_reunion
- **无业务数据**
- **仅 Fallback**：`storyBook` 中标题包含「来到身边」或「Reunion」的记录

---

## 五、找不到可靠历史数据的项目

以下纪念项目**没有强行迁移**，只在真实业务或 storyBook 中存在明确记录时才记录：

- **Housing 三项**（shared_home / purchased / move）— 当前系统无 housing 业务历史，只能依赖 storyBook fallback
- **Reunion 两项**（reunion_plan / reunion）— 当前系统无 reunion 业务数据，只能依赖 storyBook fallback

Migration 原则：**不猜、不造、不强行回填**。老用户如果历史中没有这些事实记录，纪念册就是空的，等新事件自然发生后才出现。

---

## 六、storyBook Fallback 实际匹配

Migration 会尝试匹配以下 **legacy storyBook key**：

- `first_takeout`
- `first_package_sent` / 标题含「寄给他」
- `first_package_received` / 标题含「他寄」
- `first_shared_home` / 标题含「第一个家」
- `first_home_purchased` / 标题含「买下」
- `first_move` / 标题含「搬家」
- `first_reunion_plan` / 标题含「确定见面」或「行程」
- `first_reunion` / 标题含「来到身边」或「Reunion」

**禁止迁移**的旧 Story 类型：
- `first_i_love_you`
- `first_simon`
- `first_notice_mood`
- `first_mood_recovered`
- `first_habit_formed`
- `first_future_assumption`
- `first_unspoken_understood`
- `first_protective`
- 其他情绪型 / 推测型 / 导演型成就

---

## 七、Love Space 删除内容

### 删除的 DOM（index.html）
- `<button id="tabMemory">` — 回忆 Tab 按钮
- `<div id="panelMemory">` — 回忆面板容器
- `<div id="memoryStageBar">` — 关系阶段条
- `<div id="memoryHighlights">` — 精选回忆
- `<div id="memoryTimeline">` — 完整时间线

### 退役的函数（js/feed.js）
- `buildSharedMemories()` — 改为返回空数组
- `getRelationshipStage()` — 改为返回空对象
- `renderSharedMemories()` — 改为空函数
- `renderMemoryCard()` — 改为返回空字符串

### 修改的调用
- `switchCoupleTab(tab)` — 移除对 `panelMemory` / `tabMemory` 的操作

---

## 八、残留引用检查结果

✅ **无残留引用**

检查结果：
- `index.html` — 0 处引用
- `js/*.js` — 0 处引用（feed.js 中是退役后的空壳定义，不是调用）

Love Space 现在只保留「动态」Tab，纪念历史统一在「我们的纪念册」管理。

---

## 九、Syntax Check 结果

✅ **全部通过**

```
node -c js/lifeEvents/lifeEventsView.js       ✓
node -c js/lifeEvents/lifeEventsMigration.js  ✓
node -c js/feed.js                             ✓
node -c js/app.js                              ✓
```

---

## 十、保留的数据

- **localStorage.storyBook** — 作为 legacy archive 保留，不删除
- **localStorage.deliveries** — 业务数据完整保留
- **localStorage.takeoutOrders** — 业务数据完整保留
- **Feed 动态数据** — 完整保留
- **Couple Profile** — 完整保留

本轮只停止 Love Space「回忆」UI 使用旧数据，不删除任何历史记录。

---

## 完成确认

✅ 正式素材（9 张 PNG）接入完成  
✅ 8 条正式纪念配置表建立  
✅ header.png 自然整合进纪念册顶部  
✅ Legacy Migration 建立，幂等，真实数据优先  
✅ Love Space「回忆」页完全退役  
✅ storyBook 保留为 archive  
✅ 无残留引用  
✅ Syntax check 全部通过  

**Batch 2 完成，未进行下一批工作。**
