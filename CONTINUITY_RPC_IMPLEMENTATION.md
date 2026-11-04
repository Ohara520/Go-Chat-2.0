# Continuity RPC 实施方案

## 已完成文件

### 1. SQL 迁移文件
- `migrations/20261104_continuity_rpc.sql` - 数据库表结构 + RPC 函数

### 2. 前端同步模块
- `js/continuitySync.js` - RPC 调用、冲突处理、版本同步
- `js/continuity_rpc_integration.js` - 集成补丁（最小侵入）

### 3. 测试文件
- `test_continuity_rpc.html` - 7 个并发安全测试

## 核心机制

### 服务端版本控制
- 每次更新：version + 1（服务端递增）
- 冲突判断：client_version < cloud_version → 拒绝
- 兜底机制：updatedAt 时间戳二次比较

### 墓碑防复活
- 180 天保留期 + 1000 条上限
- RPC 三重检查：合并前、循环内、UPSERT WHERE 子句
- 超 90 天旧事件：服务端拒绝插入

### 变更队列
- 同步期间新修改进入 _pendingChanges 队列
- 同步完成后 flush，避免误标记已同步

### 冲突处理
- version_conflict / terminal_state_protected → 拉取云端覆盖本地
- event_deleted → 从本地移除
- 失败保留脏标记，下次重试

## 上线步骤

### 阶段 1: 数据库迁移（停机窗口）
```bash
# 1. 备份生产数据库
pg_dump -h <host> -U postgres go_chat_prod > backup_$(date +%Y%m%d).sql

# 2. 执行迁移
psql -h <host> -U postgres -d go_chat_prod -f migrations/20261104_continuity_rpc.sql

# 3. 验证表和函数
psql -h <host> -U postgres -d go_chat_prod -c "SELECT * FROM continuity_events LIMIT 1;"
psql -h <host> -U postgres -d go_chat_prod -c "SELECT atomic_merge_continuity(auth.uid()::UUID, 'ghost', '[]'::JSONB, '[]'::JSONB);"
```

### 阶段 2: 前端部署
```html
<!-- index.html 添加脚本引用（在 continuity.js 之后） -->
<script src="js/continuitySync.js"></script>
<script src="js/continuity_rpc_integration.js"></script>
```

### 阶段 3: 灰度测试（开发者账号，1-2 周）
1. 监控 Supabase Logs → Function Logs
2. 检查冲突率：`conflicts` 数组长度
3. 验证墓碑机制：删除事件后检查 continuity_tombstones 表

### 阶段 4: 全量发布
- Git commit + push
- CDN 刷新缓存

## 测试执行

### 环境要求
⚠️ **必须使用开发环境，不要连接生产数据库**

### 运行测试
1. 打开 `test_continuity_rpc.html`
2. 点击"检查环境"，确认表和 RPC 函数存在
3. 点击"运行全部测试"

### 预期结果
- 测试 1: ✅ 两个事件都保留
- 测试 2: ✅ 版本号递增
- 测试 3: ✅ completed 不被降级
- 测试 4: ✅ 已删除事件不复活
- 测试 5: ✅ Ghost/Keegan 数据隔离
- 测试 6: ✅ 重复提交幂等
- 测试 7: ✅ 91 天前事件被拒绝

## 回滚方案

### 前端回滚
```bash
# 移除新增的 <script> 标签
git revert <commit-hash>
git push origin main
```

### 数据库回滚
```sql
-- 删除 RPC 函数
DROP FUNCTION IF EXISTS atomic_merge_continuity;
DROP FUNCTION IF EXISTS get_status_priority;

-- 保留表和数据（不删除，便于修复后继续）
-- 如需彻底清理：
-- DROP TABLE continuity_tombstones;
-- DROP TABLE continuity_events;
```

### 降级模式
```javascript
// continuitySync.js 添加开关
const CONTINUITY_RPC_ENABLED = false; // 紧急降级

if (!CONTINUITY_RPC_ENABLED) {
  console.warn('[ContinuitySync] RPC disabled, local-only mode');
  return { disabled: true };
}
```

## 成本估算

### 单用户（月）
- RPC 调用：5-10 次/天 × 30 天 = 150-300 次
- 数据库存储：5-10 KB
- 函数计算：10-30 ms/次 × 300 次 = 3-9 秒

### 1000 活跃用户（月）
- RPC 调用：150K-300K 次
- 数据库存储：5-10 MB
- 成本估算：< $5 USD（Supabase 免费套餐足够）

## 已解决问题清单

| 问题 | 方案 |
|---|---|
| 终态保护 | 状态优先级函数 + DO UPDATE 内条件判断 |
| 墓碑防复活 | 180 天保留期 + RPC 三重检查 + 超时事件拒绝 |
| 并发安全 | 版本号控制 + 行级锁 + 事件 ID 排序 |
| 客户端时钟不可信 | 服务端递增版本号 + 时间戳兜底 |
| 同步期间新修改 | 变更队列机制 |
| 冲突处理 | 云端覆盖本地 + 本地保留脏标记重试 |
| 旧设备复活旧事件 | 90 天过时检查 + 墓碑永久防护 |

## 剩余风险

| 风险 | 严重性 | 缓解 |
|---|---|---|
| 客户端恶意篡改时间戳 | 低 | 版本号主控 + 仅影响自己 |
| 超 180 天离线 + 墓碑过期 | 极低 | 客户端过滤 + 服务端 90 天检查 |
| PostgreSQL 死锁 | 极低 | 事件 ID 排序 + 重试机制 |

## 联系信息

如遇问题，检查：
1. Supabase Dashboard → Logs → Function Logs
2. 浏览器 Console → `[ContinuitySync]` 日志
3. `continuity_events` 表数据完整性
