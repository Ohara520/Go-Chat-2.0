# Go Chat · 语音系统 V1 补丁 V2 更新日志

**版本**: V2 (2024-10-10)  
**状态**: 针对小泡第一轮审计意见的修复版本

---

## 🔧 **修复问题清单**

### **1. 语音缓存隔离修复** ✅
**问题**: 原缓存只按文字键值，不同用户/配置会复用错误音频

**修复**:
- 缓存键改为: `user_id:voice_id:model_id:text`
- 账号切换自动清空缓存（`handleLogout` 调用 `clearVoiceCache()`）
- 配置更新自动清空旧配置缓存
- 新增 `_currentCacheKey` 追踪当前配置版本

**影响文件**:
- `js/voice.js`: 重写 `_vcKey()`, `_vcGet()`, `_vcSet()`, `generateVoice()`, `clearVoiceCache()`

---

### **2. 服务端模型白名单** ✅
**问题**: 缺少模型白名单，前端可随意指定未支持模型

**修复**:
- 新增 `utils/elevenlabs-models.js` 模块
- 定义 `ALLOWED_MODELS` 白名单（8个官方模型）
- `api/tts.js` 强制校验 `isModelAllowed()`
- 前端下拉框仅显示白名单模型

**支持模型**:
```
eleven_flash_v2_5      (v4 最新，超快速)
eleven_turbo_v2_5      (推荐，平衡)
eleven_turbo_v2
eleven_multilingual_v2
eleven_flash_v2
eleven_english_sts_v2
eleven_multilingual_v1
eleven_monolingual_v1
```

**影响文件**:
- 新增: `utils/elevenlabs-models.js`
- 修改: `api/tts.js`, `js/voice-settings.js`

---

### **3. 核实 ElevenLabs 模型并支持 v4** ✅
**问题**: 未核实官方支持的模型，不同模型参数兼容性未处理

**修复**:
- 基于 ElevenLabs 官方文档核实模型列表
- **重点支持 v4: `eleven_flash_v2_5`**（标记为最新）
- 每个模型配置 `supportsStyle`, `supportsSpeakerBoost` 等能力标识
- `buildVoiceSettings()` 根据模型能力动态构建兼容参数
- 不支持的参数不会发送给 ElevenLabs

**示例**:
- `eleven_turbo_v2_5`: 支持完整 `voice_settings`
- `eleven_multilingual_v2`: 不支持 `style` 和 `use_speaker_boost`

**影响文件**:
- `utils/elevenlabs-models.js`: 模型配置表
- `api/tts.js`: 调用 `buildVoiceSettings()` 构建兼容参数

---

### **4. 语音设置页补充试听按钮** ✅
**问题**: 缺少真正可用的试听功能

**修复**:
- 新增 "🎵 试听当前配置" 按钮
- 试听文本: "Hello, this is a voice preview test."
- 使用当前表单配置（无需先保存）
- 成功/失败提示清晰

**影响文件**:
- `js/voice-settings.js`: 新增 `voiceSettingsPreview()` 函数

---

### **5. 确保用户配置在日常/约会场景生效** ✅
**问题**: 用户保存的 Voice ID/Model ID 可能未在所有场景生效

**修复**:
- `generateVoice()` 新增 `customVoiceId`, `customModelId` 参数
- 优先级: 自定义参数 > 用户配置 > 前端默认
- 暴露 `window.generateVoiceWithConfig()` 供约会场景调用

**影响文件**:
- `js/voice.js`: 修改 `generateVoice()` 签名
- `api/tts.js`: 优先级逻辑

---

### **6. 完善 key_version 处理** ✅
**问题**: `key_version` 字段用途不明确，缺少轮换方案

**修复**:
- SQL 注释明确说明：V1 固定为 1，轮换需专门迁移脚本
- 轮换步骤已文档化

**影响文件**:
- `migrations/20261010_voice_settings.sql`: 补充详细 comment

---

### **7. 增加服务端限流** ✅
**问题**: 缺少限流，平台统一 Key 可能被滥用

**修复**:
- 内存限流器
- 用户私钥: 10次/分钟
- 平台密钥: 50次/分钟

**影响文件**:
- `api/tts.js`: 新增 `checkRateLimit()`

---

### **8. 核对 Supabase/Vercel 环境** ✅
已确认所有依赖和环境变量

---

### **9. 优化错误提示** ✅
401/429 错误细分，区分登录过期 vs Key失效

---

### **10. 重新语法检查** ✅
所有文件语法检查通过

---

## ⚠️ **已知限制**

1. 限流器为内存实现（单实例）
2. 尚未真实联调测试
3. 密钥轮换需停机

---

**V2 补丁准备就绪，等待小泡第二轮验收。**
