# Go Chat · 语音系统 V1 补丁 V4 更新日志

**版本**: V4 (2024-10-10)  
**状态**: V3 第二轮审计修复版本（收尾版本）

---

## 🎯 **V4 修复目标**

V4 不是增加功能，而是**收口 V1**，确保上线后不会因为语音配置覆盖、模型兼容、账号切换产生隐蔽 BUG。

---

## 🔧 **V4 修复问题清单**

### **1. 修复 VOICE_CONFIG 默认覆盖问题** ✅

**问题**: V3 中 `VOICE_CONFIG` 仍写死默认值，会覆盖用户配置

**V3 代码**（错误）:
```javascript
const VOICE_CONFIG = {
  voiceId: 'QHVs2huJe5wggzgIHMIi',  // 写死默认值
  modelId: 'eleven_turbo_v2_5',      // 写死默认值
}
```

**V4 修复**:
```javascript
const VOICE_CONFIG = {
  voiceId: null,  // 初始 null，禁止写死，等待初始化
  modelId: null,  // 初始 null，禁止写死，等待初始化
}

// 平台默认配置（仅在用户无配置时使用）
const PLATFORM_DEFAULTS = {
  voiceId: 'QHVs2huJe5wggzgIHMIi',
  modelId: 'eleven_turbo_v2_5',
};

// initUserVoiceConfig() 逻辑：
// 1. 有用户配置 → 使用用户配置
// 2. 无用户配置 → 使用 PLATFORM_DEFAULTS
// 3. 读取失败 → 使用 PLATFORM_DEFAULTS
```

**最终优先级**:
```
调用参数
  ↓
用户配置 (VOICE_CONFIG)
  ↓
平台默认 (PLATFORM_DEFAULTS)
```

**影响文件**:
- `js/voice.js`

---

### **2. 修正文档关于模型列表的描述** ✅

**问题**: V3 文档写"后端+前端共用配置结构"，误导维护人员

**V3 描述**（误导）:
> 模型列表统一来源（后端+前端共用配置）

**V4 修正**:
> **后端模型白名单负责安全校验，前端维护同步展示列表。**
> 
> - 后端 `utils/elevenlabs-models.js`: `ALLOWED_MODELS` 白名单，强制校验
> - 前端 `js/voice-settings.js`: `MODEL_OPTIONS` 手动同步，用于下拉框显示
> - 不是完全共享，前端无法直接 import 后端 ES 模块
> - 维护时需同步更新两处

**影响文件**:
- `CHANGELOG_V4.md`
- `README_V4.txt`

---

### **3. 简化 ElevenLabs 参数兼容逻辑** ✅

**问题**: V3 过度处理不同模型参数，存在未来模型更新导致错误的风险

**V3 逻辑**（过度）:
```javascript
// 自行判断每个模型支持哪些参数
if (config.supportsStyle) settings.style = ...
if (config.supportsSpeakerBoost) settings.use_speaker_boost = ...
```

**V4 简化**:
```javascript
// V1 仅使用稳定的基础参数
const settings = {
  stability: baseSettings?.stability ?? 0.75,
  similarity_boost: baseSettings?.similarity_boost ?? 0.82,
};
// 不处理 style 和 speaker_boost
```

**原因**:
- 不同模型对 `style` 和 `use_speaker_boost` 的支持差异较大
- V1 优先保证调用稳定，不追求参数完整性
- 高级参数待后续版本根据实际需求扩展

**目标**: **稳定 > 功能数量**

**影响文件**:
- `utils/elevenlabs-models.js`: `buildVoiceSettings()` 函数简化

---

### **4. 增加登录状态变化缓存清理** ✅

**问题**: 缓存隔离已正确（`user_id + voice_id + model_id + text`），但缺少账号切换时清理

**V4 新增**:
```javascript
// 监听 Supabase 登录状态变化
window.sbClient.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
    console.log('[voice] Auth state changed, clearing cache');
    clearVoiceCache();
    _userConfigLoaded = false;
    initUserVoiceConfig();
  }
});
```

**触发场景**:
- 用户登录 (`SIGNED_IN`)
- 用户登出 (`SIGNED_OUT`)
- 用户切换账号 (`USER_UPDATED`)

**作用**:
- 自动清空音频缓存
- 重新加载新用户的语音配置
- 避免浏览器残留旧用户的音频

**影响文件**:
- `js/voice.js`

---

### **5. 重新验收** ✅

**检查文件**:
- [x] `api/tts.js` - 保持 V3 版本
- [x] `js/voice.js` - 修复默认覆盖 + 增加 auth 监听
- [x] `js/voice-settings.js` - 保持 V3 版本
- [x] `utils/elevenlabs-models.js` - 简化参数兼容
- [x] 部署文档 - 修正描述

**确认事项**:
- [x] 不修改钱包
- [x] 不修改套餐
- [x] 不修改记忆系统
- [x] 不执行 SQL
- [x] 不部署生产

---

## 📦 **V4 修改文件统计**

### **修改文件 (2)**
- `js/voice.js` - 修复默认覆盖 + auth 监听 + 平台默认分离
- `utils/elevenlabs-models.js` - 简化参数兼容（仅基础参数）

### **未修改文件（相对 V3）**
- `api/tts.js` - 保持 V3 版本
- `api/voice-config.js` - 保持 V3 版本
- `utils/voice-crypto.js` - 保持 V3 版本
- `js/voice-settings.js` - 保持 V3 版本
- `css/voice-settings.css` - 保持 V3 版本
- `css/voice.css` - 保持 V3 版本
- `index.html` - 保持 V3 版本
- `migrations/20261010_voice_settings.sql` - 保持 V3 版本

---

## ✅ **V4 验收标准**

### **核心修复**
- [x] `VOICE_CONFIG` 初始为 null，禁止写死默认值
- [x] 用户配置优先级正确：参数 > 用户 > 平台默认
- [x] 平台默认分离到 `PLATFORM_DEFAULTS`
- [x] auth 状态变化自动清缓存 + 重新加载配置
- [x] 简化参数兼容，V1 仅使用基础参数
- [x] 文档修正：后端校验 + 前端同步（非完全共享）

### **稳定性保证**
- [x] 语法检查全部通过
- [x] 未修改钱包/套餐/记忆
- [x] 未执行 SQL、未部署
- [x] 优先稳定 > 功能数量

---

## ⚠️ **V4 已知限制（明确未完成）**

1. **前端模型列表需手动同步后端**
   - 由于浏览器无法直接 import 后端 ES 模块
   - 维护时需同步更新 `utils/elevenlabs-models.js` 和 `js/voice-settings.js`

2. **限流器为内存实现**（单实例基础保护）
   - 生产环境建议接入 Redis/Vercel KV

3. **尚未真实联调测试**
   - 所有修复基于静态分析和语法检查
   - 需部署测试环境进行端到端验证

4. **密钥轮换需停机维护窗口**

5. **V1 不处理 style 和 speaker_boost 参数**
   - 待后续版本根据实际需求扩展
   - V1 优先保证调用稳定

---

## 🎯 **V4 核心目标达成**

- ✅ 修复默认值覆盖用户配置的隐蔽 BUG
- ✅ 账号切换自动清理缓存，避免浏览器残留
- ✅ 简化参数兼容，优先稳定性而非功能数量
- ✅ 文档修正，不误导未来维护人员
- ✅ V1 收口完成，可安全上线

---

**V4 补丁准备就绪，等待三方最终验收。**
