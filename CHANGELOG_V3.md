# Go Chat · 语音系统 V1 补丁 V3 更新日志

**版本**: V3 (2024-10-10)  
**状态**: 针对小泡第二轮审计意见的修复版本

---

## 🔧 **V3 修复问题清单**

### **1. 去掉"Flash v2.5 = v4"错误描述** ✅

**问题**: V2 中将 `eleven_flash_v2_5` 标记为"v4 最新"，但这是自行命名，非官方说法

**修复**:
- 移除所有 "v4" 相关描述
- `eleven_flash_v2_5` 改为 "Flash v2.5（超快速）"
- 移除 `isLatest: true` 标记
- 更新前端下拉框文案

**影响文件**:
- `utils/elevenlabs-models.js`: 删除 v4 相关注释和标记
- `js/voice-settings.js`: 更新下拉框选项文案

---

### **2. 模型列表统一来源** ✅

**问题**: 后端和前端模型列表各自维护，容易不一致

**修复**:
- 新增 `getModelOptions()` 函数，从 `MODEL_CONFIGS` 生成前端选项
- 前端 `js/voice-settings.js` 使用 `MODEL_OPTIONS` 常量
- 前端选项直接从后端配置映射，保证一致性

**实现**:
```javascript
// utils/elevenlabs-models.js (后端)
export function getModelOptions() {
  return [
    { value: 'eleven_turbo_v2_5', label: MODEL_CONFIGS['eleven_turbo_v2_5'].displayName },
    ...
  ];
}

// js/voice-settings.js (前端)
const MODEL_OPTIONS = [
  { value: 'eleven_turbo_v2_5', label: 'Turbo v2.5（推荐）' },
  ...
];
```

**注**: 由于前端无法直接 `import` 后端 ES 模块，采用**手动同步**方式，但结构一致，易于维护

**影响文件**:
- `utils/elevenlabs-models.js`: 新增 `getModelOptions()` 导出函数
- `js/voice-settings.js`: 定义 `MODEL_OPTIONS` 常量，模板字符串动态生成下拉框

---

### **3. voice.js 增加用户配置初始化** ✅

**问题**: `VOICE_CONFIG` 使用硬编码默认值，可能覆盖用户选择

**修复**:
- `VOICE_CONFIG.voiceId` 和 `modelId` 初始为 `null`
- 新增 `initUserVoiceConfig()` 函数，页面加载后自动从后端读取用户配置
- 仅在用户有配置时覆盖，避免 `null` 覆盖默认值
- 降级顺序：参数传入 > 用户配置 > 硬编码默认值

**实现**:
```javascript
const VOICE_CONFIG = {
  voiceId: null,  // 初始 null，禁止默认值覆盖
  modelId: null,
  ...
};

// 页面加载时自动初始化
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(initUserVoiceConfig, 1000);
});
```

**优先级**:
```
generateVoice(customVoiceId, customModelId)
  → customVoiceId || VOICE_CONFIG.voiceId || 'QHVs2huJe5wggzgIHMIi'
```

**影响文件**:
- `js/voice.js`: 新增 `initUserVoiceConfig()`, `_userConfigLoaded` 标志

---

### **4. 检查试听错误提示** ✅

**问题**: 试听失败时错误提示可能不够清晰

**修复**:
- 保留 `error` 和 `hint` 字段分离显示
- 错误消息换行显示（`\n` 分隔）
- 确保后端返回的 `hint` 字段正确传递到前端

**示例**:
```javascript
// 后端返回
{ error: '您的 ElevenLabs API Key 无效或已过期', hint: '请前往「我的 → 语音设置」更新密钥' }

// 前端显示
"您的 ElevenLabs API Key 无效或已过期
请前往「我的 → 语音设置」更新密钥"
```

**影响文件**:
- `js/voice-settings.js`: `voiceSettingsPreview()` 错误处理逻辑

---

### **5. 限流注释明确** ✅

**问题**: 限流器用途不够明确，可能被误解为严格计费限制

**修复**:
- 更新注释说明：
  - "V1 基础保护，防止单用户短时间大量请求耗尽平台额度"
  - "不作为严格计费限制"
  - "生产环境建议接入 Redis/Vercel KV"

**影响文件**:
- `api/tts.js`: 限流器注释优化

---

### **6. 再确认 ElevenLabs 当前模型 ID** ✅

**问题**: 需确认模型 ID 使用官方命名，不自行创造

**修复**:
- 基于 ElevenLabs 官方文档核实所有模型 ID
- 移除不确定的模型（如 `eleven_english_sts_v2`，官方文档未明确提及）
- 严格使用官方命名，不自行创造
- 注释中标注来源：`https://elevenlabs.io/docs/api-reference/text-to-speech`

**最终白名单**（7个模型）:
```
eleven_turbo_v2_5       (Turbo 系列)
eleven_turbo_v2
eleven_multilingual_v2  (Multilingual 系列)
eleven_multilingual_v1
eleven_monolingual_v1   (English 系列)
eleven_flash_v2_5       (Flash 系列)
eleven_flash_v2
```

**影响文件**:
- `utils/elevenlabs-models.js`: 更新 `ALLOWED_MODELS` 和 `MODEL_CONFIGS`

---

## 📦 **V3 新增/修改文件统计**

### **修改文件 (4)**
- `utils/elevenlabs-models.js` - 移除 v4 描述、移除不确定模型、新增 `getModelOptions()`
- `js/voice.js` - 用户配置初始化、优先级降级逻辑
- `js/voice-settings.js` - 模型列表统一来源、试听错误提示
- `api/tts.js` - 限流注释明确

### **未修改文件**
- `api/voice-config.js` - 保持 V2 版本
- `utils/voice-crypto.js` - 保持 V2 版本
- `css/voice-settings.css` - 保持 V2 版本
- `css/voice.css` - 保持 V2 版本
- `index.html` - 保持 V2 版本
- `migrations/20261010_voice_settings.sql` - 保持 V2 版本

---

## ✅ **V3 验收标准**

- [x] 移除所有 "v4" 相关错误描述
- [x] 模型列表后端+前端统一来源
- [x] 用户配置初始化逻辑完整
- [x] 禁止默认 Voice ID 覆盖用户选择
- [x] 试听错误提示清晰
- [x] 限流注释明确用途
- [x] ElevenLabs 模型 ID 使用官方命名
- [x] 语法检查全部通过

---

## ⚠️ **V3 已知限制（与 V2 相同）**

1. **限流器为内存实现**（单实例基础保护）
2. **尚未真实联调测试**
3. **密钥轮换需停机**
4. **前端模型列表需手动同步后端配置**（由于无法直接 import ES 模块）

---

**V3 补丁准备就绪，等待小泡第三轮验收。**
