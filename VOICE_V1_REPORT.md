# Go Chat · 语音系统 V1 完整实施报告

## 📋 **实施概览**

**目标**: 为 Go Chat 构建安全的 BYOK（Bring Your Own Key）语音系统底座，支持用户自定义 ElevenLabs API Key，同时保持平台降级能力。

**状态**: ✅ **代码开发完成，等待三方验收**

**实施时间**: 2024-10-10

---

## 📦 **交付文件清单**

### **新增文件（5个）**

| 文件路径 | 说明 | 行数 |
|---------|------|------|
| `api/voice-config.js` | 用户语音配置 API（GET/PUT/DELETE） | 180 |
| `utils/voice-crypto.js` | AES-256-GCM 加密/解密工具 | 98 |
| `migrations/20261010_voice_settings.sql` | 数据库迁移脚本 | 52 |
| `js/voice-settings.js` | 语音设置 UI 逻辑 | 247 |
| `css/voice-settings.css` | 语音设置样式（奶油信纸复古风格） | 278 |

### **修改文件（3个）**

| 文件路径 | 变更说明 | 变更行数 |
|---------|---------|---------|
| `api/tts.js` | 全量重构：强制鉴权 + BYOK + 用户/平台密钥路由 | 全文替换 |
| `js/voice.js` | 增加 Token 传递 + 缓存清理函数 | +30 |
| `index.html` | 引入 voice-settings 模块 + 登出清理缓存 | +3 CSS, +1 JS, +10 逻辑 |

### **文档（1个）**

| 文件路径 | 说明 |
|---------|------|
| `DEPLOY_VOICE_V1.md` | 部署指南（环境变量、迁移步骤、测试清单、回滚方案） |

---

## 🔐 **安全架构**

### **1. 数据库层**
```sql
user_voice_settings
├─ user_id (PK, FK → auth.users.id)
├─ api_key_ciphertext (AES-256-GCM 密文)
├─ api_key_iv (初始化向量)
├─ api_key_auth_tag (认证标签)
├─ key_version (密钥版本，预留轮换)
├─ voice_id, model_id, auto_play
└─ RLS: enabled, NO policies, anon/authenticated 权限已撤销
```

**安全特性**:
- ✅ 三件套完整性约束（全 null 或全非 null）
- ✅ 仅服务端 service role 可访问
- ✅ 客户端无法直接读写密钥字段

### **2. API 层**

#### **`POST /api/tts`（重构版）**
```
请求流程：
1. 验证 Authorization: Bearer <token>
2. 从 user_voice_settings 读取用户配置
3. 解密 API Key（如有）
4. 路由逻辑：
   ├─ 用户有私钥 → 使用用户密钥
   ├─ 用户无私钥 → 降级到平台密钥
   └─ 两者都无 → 返回 503
5. 调用 ElevenLabs
6. 错误处理：
   ├─ 用户密钥失效/额度不足 → 明确告知，不降级
   └─ 平台密钥失效 → 返回友好错误
7. 返回音频：Cache-Control: private, no-store
```

#### **`GET /api/voice-config`**
```json
{
  "has_api_key": true,
  "provider": "elevenlabs",
  "voice_id": "QHVs...",
  "model_id": "eleven_turbo_v2_5",
  "auto_play": false
}
```
**安全**: 不返回密钥原文，只返回 `has_api_key` 布尔值

#### **`PUT /api/voice-config`**
```json
{
  "api_key": "sk-...",  // 可选，填写则更新
  "voice_id": "xxx",
  "model_id": "eleven_turbo_v2_5",
  "auto_play": false
}
```
**安全**: 服务端加密后存储，日志不记录密钥

#### **`DELETE /api/voice-config`**
清除用户的 API Key（保留其他配置）

### **3. 加密层**

**算法**: AES-256-GCM
**密钥来源**: 环境变量 `VOICE_KEY_ENCRYPTION_SECRET`（32字节 base64）
**完整性校验**: GCM 认证标签自动校验，篡改自动失败

```javascript
// 加密
{ ciphertext, iv, authTag } = encrypt(plaintext)

// 解密
plaintext = decrypt(ciphertext, iv, authTag)
// 抛出异常：密钥错误 or 数据被篡改
```

---

## 🎨 **用户界面**

### **语音设置页面**
- **入口**: 我的 → 语音设置
- **风格**: 奶油信纸复古风格（与 Go Chat 整体一致）
- **无 Emoji 图标**（符合要求）

**功能模块**:
1. **API Key 输入框**（密码框，已配置时提示"留空保持不变"）
2. **Voice ID 输入框**（可选，自定义音色）
3. **Model ID 下拉框**（Turbo v2.5 / v2 / Multilingual v2 / Monolingual v1）
4. **状态提示卡**（显示当前使用平台密钥 or 私人密钥）
5. **操作按钮**：保存设置 / 取消 / 删除 API Key

**响应式适配**: 移动端横竖屏完全兼容

---

## ✅ **三方确认决策落实**

| 决策点 | 实施情况 |
|--------|---------|
| 采用改良版方案 B（统一 `/api/tts`，强制验证） | ✅ 已实现 |
| 未配置私人 Key 可继续使用平台 Key | ✅ 已实现 |
| 私人 Key 失效禁止自动回退到平台 Key | ✅ 已实现（返回明确错误） |
| 新建 `user_voice_settings` 表 + RLS + 补充 `key_version` | ✅ 已实现 |
| AES-256-GCM 加密，密钥不出现在浏览器/日志/返回值 | ✅ 已实现 |
| 音频响应 `Cache-Control: private, no-store` | ✅ 已实现 |
| 前端缓存按用户隔离，配置变更/退出登录时清理 | ✅ 已实现 |
| V1 必须包含正式语音设置 UI | ✅ 已实现（完整功能） |
| 奶油信纸、玫瑰棕复古风格，不使用 emoji 图标 | ✅ 已实现 |
| 审计日志，禁止记录文本/密钥/敏感响应 | ✅ 已实现 |
| 不修改钱包 V4、套餐、聊天记忆等业务逻辑 | ✅ 零侵入 |
| 预留实时语音通话扩展字段 | ✅ SQL 注释预留 `mode` 字段 |
| SQL 文件命名为 `20261010_voice_settings.sql` | ✅ 已实现 |

---

## 🧪 **兼容性测试结果**

### **语法检查**
```bash
✓ voice-settings.js syntax OK
✓ voice-config.js syntax OK
✓ voice-crypto.js syntax OK
✓ voice.js syntax OK
✓ tts.js syntax OK
```

### **依赖检查**
- ✅ `@supabase/supabase-js@^2.39.0` 已安装（`package.json`）
- ✅ Node.js `crypto` 模块（内置，无需安装）
- ✅ 所有 API 使用现有 Supabase 连接模式（与 `check-subscription.js` 一致）

### **运行环境**
- ✅ Vercel Serverless Functions（Node.js 20+）
- ✅ 超时配置：`api/tts.js` 已在 `vercel.json` 配置 30s

---

## 🚀 **部署前检查清单**

### **环境变量（Vercel）**
- [ ] **必需**: `VOICE_KEY_ENCRYPTION_SECRET`（32字节 base64）
  - 生成方式: `openssl rand -base64 32`
  - ⚠️ **一旦配置不得随意更换**（会导致历史密钥无法解密）
- [ ] **可选**: `ELEVENLABS_API_KEY`（平台降级密钥）
  - 保留 = 用户未配置时可用
  - 删除 = 强制所有用户自带 Key

### **数据库（Supabase）**
- [ ] 执行 `migrations/20261010_voice_settings.sql`
- [ ] 验证表创建：`SELECT * FROM public.user_voice_settings LIMIT 1;`
- [ ] 验证 RLS：客户端无法直接查询该表

### **代码部署**
- [ ] 所有文件已提交到 Git
- [ ] `vercel.json` 已包含 `api/tts.js` 配置（已有，无需修改）
- [ ] `index.html` 已引入 `voice-settings.css` 和 `voice-settings.js`

---

## 🔄 **回滚方案**

### **紧急回滚（15分钟内）**
1. Vercel 控制台 → Deployments → 上一个版本 → Promote to Production
2. 或 `git revert <commit-hash> && git push`

### **数据库回滚**
```sql
DROP TABLE IF EXISTS public.user_voice_settings;
```
**影响**: 用户已保存的 API Key 配置丢失（但不影响其他功能）

### **环境变量回滚**
- 删除 `VOICE_KEY_ENCRYPTION_SECRET`
- 恢复 `ELEVENLABS_API_KEY`

---

## 📊 **后续监控建议**

### **API 指标**
- `/api/tts` 成功率 > 95%
- `/api/voice-config` 成功率 > 98%
- 401 错误（未登录）→ 预期，正常
- 429 错误（限流）→ 监控频率
- 502/503 错误 → 检查 ElevenLabs 或平台 Key

### **用户指标**
- 配置私人 Key 的用户占比
- 语音功能日活用户数
- 私人 Key 失效率（401/429）

---

## 🆘 **常见问题 FAQ**

### **Q: 部署后语音设置页面空白？**
**A**: 
1. 检查浏览器控制台是否有 JS 错误
2. 确认 `voice-settings.js` 和 `voice-settings.css` 正确加载
3. 确认 `index.html` 中引用顺序正确（`voice.js` → `voice-settings.js`）

### **Q: 保存 API Key 后仍显示"使用平台密钥"？**
**A**:
1. 检查 Vercel 环境变量 `VOICE_KEY_ENCRYPTION_SECRET` 是否配置
2. 查看 Vercel 函数日志，搜索 `[voice-config]` 错误
3. 确认 `utils/voice-crypto.js` 正确部署

### **Q: 解密失败（Decryption failed）？**
**A**:
- **原因**: `VOICE_KEY_ENCRYPTION_SECRET` 被更换
- **解决**: 恢复原密钥，或清空用户的 `api_key_ciphertext` 让用户重新配置

### **Q: 平台密钥失效？**
**A**:
1. 登录 ElevenLabs 控制台检查 Key 状态
2. 在 Vercel 更新 `ELEVENLABS_API_KEY`
3. 重新部署

---

## 🎯 **验收标准**

### **代码层面**
- [x] 新增 5 个文件，修改 3 个文件
- [x] 所有 JS 文件语法检查通过
- [x] 未修改钱包、套餐、记忆等业务逻辑
- [x] 代码注释完整，逻辑清晰

### **功能层面**
- [ ] 未登录用户访问 `/api/tts` → 401
- [ ] 登录用户未配置 Key → 使用平台密钥
- [ ] 配置私人 Key → 保存成功 → 生成语音成功
- [ ] 私人 Key 失效 → 明确错误，不降级
- [ ] 删除 Key → 恢复平台密钥
- [ ] 退出登录 → 音频缓存清空

### **安全层面**
- [ ] 浏览器 Network 面板 → GET `/api/voice-config` → 不返回密钥原文
- [ ] 数据库 `api_key_ciphertext` 字段为加密字符串
- [ ] Vercel 日志不包含密钥明文
- [ ] 用户 A/B 密钥完全隔离

### **UI 层面**
- [ ] 语音设置页面采用奶油信纸复古风格
- [ ] 无 Emoji 图标
- [ ] 移动端适配完成
- [ ] 状态提示清晰明确

---

## 📝 **待三方确认事项**

1. **环境变量 `VOICE_KEY_ENCRYPTION_SECRET` 生成**
   - 需要用户或运维在本地执行 `openssl rand -base64 32`
   - 生成后配置到 Vercel（不要在 Git 中保存）

2. **平台密钥 `ELEVENLABS_API_KEY` 保留策略**
   - 建议：保留（作为降级方案）
   - 或：删除（强制用户自带 Key）

3. **数据库迁移时间窗口**
   - SQL 执行时间 < 1 秒
   - 无需停机
   - 建议在低峰时段执行

4. **部署顺序确认**
   - 建议：环境变量 → 数据库 → 代码
   - 或：并行部署（代码部署前功能不可用）

---

## 📦 **交付物总结**

| 类型 | 数量 | 说明 |
|------|------|------|
| **新增文件** | 5 | API + 工具 + 迁移 + UI |
| **修改文件** | 3 | TTS API + 前端集成 + 缓存清理 |
| **文档** | 2 | 部署指南 + 实施报告 |
| **总代码行数** | ~900 | 包含注释和文档 |

---

**✅ 代码开发完成，等待小泡 + 用户最终验收。**

**验收通过后即可执行部署步骤（见 `DEPLOY_VOICE_V1.md`）。**
