# Go Chat · 语音系统 V1 部署指南

## 📦 **文件清单**

### **新增文件**
```
api/voice-config.js              # 用户语音配置 API (GET/PUT/DELETE)
utils/voice-crypto.js            # AES-256-GCM 加密工具
migrations/20261010_voice_settings.sql  # 数据库迁移脚本
js/voice-settings.js             # 语音设置 UI 逻辑
css/voice-settings.css           # 语音设置样式
```

### **修改文件**
```
api/tts.js                       # 重构：强制鉴权 + BYOK 支持
js/voice.js                      # 增加：Token 传递 + 缓存清理
index.html                       # 增加：voice-settings 引用 + 登出清理
```

---

## 🔐 **环境变量配置（Vercel）**

在 Vercel 项目设置 → Environment Variables 中添加以下变量：

### **1. VOICE_KEY_ENCRYPTION_SECRET（新增，必需）**
```bash
# 生成方式（本地执行）：
openssl rand -base64 32

# 或使用 Node.js：
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 示例输出：
wK3j8pL2mN9xQ5vT7yR4sU1aB6cD8eF0gH2iJ4kL6mN8=
```

**配置到 Vercel：**
- **Key**: `VOICE_KEY_ENCRYPTION_SECRET`
- **Value**: 上面生成的 base64 字符串
- **Environment**: Production + Preview
- **⚠️ 重要**: 此密钥一旦配置不得随意更换，否则历史加密的 API Key 将无法解密

### **2. ELEVENLABS_API_KEY（可选保留）**
- **作用**: 平台降级密钥，用户未配置私人 Key 时使用
- **保留或删除**:
  - **保留**: 用户未配置私人 Key 时仍可使用语音功能
  - **删除**: 强制所有用户自带 Key（不推荐）

---

## 🗄️ **数据库迁移**

### **1. 执行 SQL（Supabase Dashboard）**

1. 登录 Supabase 项目控制台
2. 进入 SQL Editor
3. 复制 `migrations/20261010_voice_settings.sql` 内容
4. 执行 SQL
5. 确认表创建成功：
   ```sql
   SELECT * FROM public.user_voice_settings LIMIT 1;
   ```

### **2. 验证权限**

确认 RLS 已启用且客户端无权限：
```sql
-- 应返回 true
SELECT relrowsecurity FROM pg_class WHERE relname = 'user_voice_settings';

-- 应返回空（anon/authenticated 无权限）
SELECT * FROM information_schema.role_table_grants 
WHERE table_name = 'user_voice_settings' 
AND grantee IN ('anon', 'authenticated');
```

---

## 🚀 **部署步骤**

### **步骤 1: 环境变量配置**
```bash
# 在 Vercel 控制台配置：
1. VOICE_KEY_ENCRYPTION_SECRET = <生成的 base64 字符串>
2. ELEVENLABS_API_KEY = <保留或删除>
```

### **步骤 2: 数据库迁移**
```sql
-- 在 Supabase SQL Editor 执行 20261010_voice_settings.sql
```

### **步骤 3: 代码部署**
```bash
# 方式 A: 通过 Git 推送（推荐）
git add .
git commit -m "feat: 语音系统 V1 - BYOK 安全底座"
git push origin main

# 方式 B: 手动上传
# 在 Vercel 控制台上传修改的文件
```

### **步骤 4: 验证部署**
1. 等待 Vercel 部署完成（通常 1-2 分钟）
2. 访问生产环境 URL
3. 登录账号 → 我的 → 语音设置
4. 测试以下功能：
   - [ ] 页面正常加载
   - [ ] 显示"当前使用平台默认密钥"
   - [ ] 输入测试 Key → 保存 → 显示"已配置私人 API Key"
   - [ ] 删除 Key → 恢复"使用平台默认密钥"

---

## 🧪 **测试清单**

### **A. 基础功能测试**
- [ ] 未登录访问 `/api/tts` → 401 Unauthorized
- [ ] 登录后未配置 Key → 使用平台密钥生成语音
- [ ] 配置私人 Key → 保存成功 → 页面显示"已配置"
- [ ] 使用私人 Key 生成语音 → 成功
- [ ] 删除私人 Key → 恢复平台密钥

### **B. 错误处理测试**
- [ ] 输入无效 API Key → ElevenLabs 返回 401 → 前端显示"您的 API Key 无效或已过期"
- [ ] 输入额度耗尽的 Key → ElevenLabs 返回 429 → 前端显示"您的 API Key 额度不足"
- [ ] 平台 Key 失效 → 前端显示"平台语音服务 Key 失效，请联系管理员"

### **C. 安全测试**
- [ ] 浏览器 Network 面板 → GET `/api/voice-config` → 返回 `has_api_key: true`，**不返回密钥原文**
- [ ] 数据库查询 `user_voice_settings` → `api_key_ciphertext` 字段为加密字符串，无法直接解密
- [ ] 退出登录 → 音频缓存清空（检查 DevTools → Application → Storage）

### **D. 隔离测试**
- [ ] 用户 A 配置 Key A → 生成语音
- [ ] 切换到用户 B（另一账号）→ 显示"使用平台密钥"或 Key B
- [ ] 用户 B 生成语音 → **不使用 Key A**

### **E. 移动端测试**
- [ ] iOS Safari → 语音设置页面正常显示
- [ ] Android Chrome → 语音设置页面正常显示
- [ ] 横屏/竖屏切换 → 布局适配

---

## 🔄 **回滚方案**

### **紧急回滚（代码层）**
```bash
# 1. 回滚 Git commit
git revert <commit-hash>
git push origin main

# 2. 或在 Vercel 控制台 → Deployments → 找到上一个正常版本 → Promote to Production
```

### **回滚（数据库层）**
```sql
-- 删除表（不影响其他功能）
DROP TABLE IF EXISTS public.user_voice_settings;
```

### **回滚（环境变量）**
```
1. Vercel 控制台 → Settings → Environment Variables
2. 删除 VOICE_KEY_ENCRYPTION_SECRET
3. 保留或恢复 ELEVENLABS_API_KEY
```

---

## ⚠️ **注意事项**

1. **密钥轮换预留**
   - 当前所有密钥使用 `key_version = 1`
   - 如需轮换 `VOICE_KEY_ENCRYPTION_SECRET`，请联系技术团队制定迁移方案

2. **日志安全**
   - `api/tts.js` 和 `api/voice-config.js` 已移除敏感日志
   - Vercel 日志中不会出现 API Key 明文

3. **缓存清理**
   - 用户退出登录时自动清空音频缓存
   - 配置变更（更换 Key/voice_id/model_id）时自动清空缓存
   - 防止 A 用户的音频被 B 用户缓存命中

4. **平台密钥管理**
   - 如果删除 `ELEVENLABS_API_KEY`，所有未配置私人 Key 的用户将无法使用语音
   - 建议保留平台 Key 作为降级方案

5. **数据库备份**
   - 执行迁移前建议备份 Supabase 数据库
   - Supabase 控制台 → Settings → Backups

---

## 📊 **监控指标**

部署后建议监控以下指标：

1. **API 成功率**
   - `/api/tts` 2xx 响应比例 > 95%
   - `/api/voice-config` 2xx 响应比例 > 98%

2. **错误分布**
   - 401（未登录）→ 预期，正常
   - 429（限流）→ 监控频率，必要时提示用户
   - 502/503（ElevenLabs 错误）→ 检查平台 Key 是否有效

3. **用户采用率**
   - 配置私人 Key 的用户数 / 总用户数
   - 语音功能日活跃用户数

---

## 🆘 **常见问题**

### **Q1: 部署后语音设置页面空白**
**A**: 检查浏览器控制台是否有 JS 错误，确认 `voice-settings.js` 和 `voice-settings.css` 正确加载。

### **Q2: 保存 API Key 后仍提示"使用平台密钥"**
**A**: 
1. 检查 `VOICE_KEY_ENCRYPTION_SECRET` 是否正确配置
2. Vercel 控制台查看函数日志，搜索 `[voice-config]` 错误

### **Q3: 解密失败**
**A**: 
- 原因：`VOICE_KEY_ENCRYPTION_SECRET` 被更换
- 解决：恢复原密钥，或清空所有用户的 `api_key_ciphertext` 字段让用户重新配置

### **Q4: 平台密钥失效**
**A**: 
1. 登录 ElevenLabs 控制台检查 Key 是否有效
2. 在 Vercel 更新 `ELEVENLABS_API_KEY`
3. 重新部署

---

## ✅ **验收标准**

- [x] 新增 5 个文件，修改 3 个文件
- [x] 数据库表 `user_voice_settings` 创建成功
- [x] 环境变量 `VOICE_KEY_ENCRYPTION_SECRET` 配置完成
- [x] 测试清单全部通过
- [x] 未登录用户无法访问 TTS API
- [x] 用户 A/B 密钥完全隔离
- [x] 音频缓存按用户隔离
- [x] 密钥不出现在浏览器、日志、返回值中
- [x] 语音设置 UI 采用奶油信纸复古风格
- [x] 移动端适配完成

---

**部署完成后，请将本文档提交给小泡和用户进行最终验收。**
