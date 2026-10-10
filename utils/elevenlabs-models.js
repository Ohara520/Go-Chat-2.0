// utils/elevenlabs-models.js — ElevenLabs 模型白名单与配置
// 基于 ElevenLabs 官方文档 (https://elevenlabs.io/docs/api-reference/text-to-speech)
// 模型 ID 严格使用官方命名，不自行创造

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 模型白名单（仅允许这些模型，服务端强制校验）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const ALLOWED_MODELS = [
  // V4（最新生成模型，推荐陪伴场景）
  'eleven_v4',

  // Flash 系列（超快速生成，低延迟）
  'eleven_flash_v2_5',
  'eleven_flash_v2',

  // Turbo 系列（快速生成，质量与速度平衡）
  'eleven_turbo_v2_5',
  'eleven_turbo_v2',

  // Multilingual 系列（多语言支持）
  'eleven_multilingual_v2',
  'eleven_multilingual_v1',

  // English 系列（英语优化，已过时但保留向后兼容）
  'eleven_monolingual_v1',
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 模型配置（用于前端下拉框显示 + 后端参数兼容性判断）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const MODEL_CONFIGS = {
  // V4（最新，情绪表现丰富，适合 AI 伴侣）
  'eleven_v4': {
    displayName: 'Eleven v4（推荐）- 情绪表现更丰富，适合角色陪伴',
    supportsVoiceSettings: true,
    supportsStyle: true,
    supportsSpeakerBoost: true,
    maxTextLength: 5000,
  },

  // Flash 系列（低延迟，适合快速交互）
  'eleven_flash_v2_5': {
    displayName: 'Flash v2.5 - 超快速，适合快速聊天',
    supportsVoiceSettings: true,
    supportsStyle: true,
    supportsSpeakerBoost: true,
    maxTextLength: 5000,
  },

  'eleven_flash_v2': {
    displayName: 'Flash v2 - 快速生成',
    supportsVoiceSettings: true,
    supportsStyle: true,
    supportsSpeakerBoost: true,
    maxTextLength: 5000,
  },

  // Turbo 系列（质量与速度平衡）
  'eleven_turbo_v2_5': {
    displayName: 'Turbo v2.5 - 质量与速度平衡',
    supportsVoiceSettings: true,
    supportsStyle: true,
    supportsSpeakerBoost: true,
    maxTextLength: 5000,
  },

  'eleven_turbo_v2': {
    displayName: 'Turbo v2 - 稳定可靠',
    supportsVoiceSettings: true,
    supportsStyle: true,
    supportsSpeakerBoost: true,
    maxTextLength: 5000,
  },

  // Multilingual 系列（多语言支持）
  'eleven_multilingual_v2': {
    displayName: 'Multilingual v2 - 多语言稳定',
    supportsVoiceSettings: true,
    supportsStyle: false,
    supportsSpeakerBoost: true,
    maxTextLength: 2500,
  },

  'eleven_multilingual_v1': {
    displayName: 'Multilingual v1 - 多语言支持',
    supportsVoiceSettings: true,
    supportsStyle: false,
    supportsSpeakerBoost: false,
    maxTextLength: 2500,
  },

  // English 系列（已过时，向后兼容）
  'eleven_monolingual_v1': {
    displayName: 'English v1 - 英语优化',
    supportsVoiceSettings: true,
    supportsStyle: false,
    supportsSpeakerBoost: false,
    maxTextLength: 2500,
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 工具函数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 获取模型配置
export function getModelConfig(modelId) {
  return MODEL_CONFIGS[modelId] || null;
}

// 校验模型是否支持
export function isModelAllowed(modelId) {
  return ALLOWED_MODELS.includes(modelId);
}

// 构建兼容的 voice_settings（V1 保守策略：仅使用基础参数）
export function buildVoiceSettings(modelId, baseSettings) {
  const config = getModelConfig(modelId);
  if (!config || !config.supportsVoiceSettings) {
    return undefined; // 不支持 voice_settings 的模型
  }

  // V1 仅使用稳定的基础参数，避免未来模型更新导致兼容性问题
  const settings = {
    stability: baseSettings?.stability ?? 0.75,
    similarity_boost: baseSettings?.similarity_boost ?? 0.82,
  };

  // V1 不处理 style 和 speaker_boost，待后续版本根据实际需求扩展
  // 原因：不同模型对这些参数的支持差异较大，V1 优先保证调用稳定

  return settings;
}

// 获取模型的最大文本长度
export function getMaxTextLength(modelId) {
  const config = getModelConfig(modelId);
  return config?.maxTextLength || 2500;
}

// 获取前端下拉框选项（按推荐顺序）
export function getModelOptions() {
  return [
    { value: 'eleven_v4', label: MODEL_CONFIGS['eleven_v4'].displayName },
    { value: 'eleven_flash_v2_5', label: MODEL_CONFIGS['eleven_flash_v2_5'].displayName },
    { value: 'eleven_turbo_v2_5', label: MODEL_CONFIGS['eleven_turbo_v2_5'].displayName },
    { value: 'eleven_multilingual_v2', label: MODEL_CONFIGS['eleven_multilingual_v2'].displayName },
    { value: 'eleven_turbo_v2', label: MODEL_CONFIGS['eleven_turbo_v2'].displayName },
    { value: 'eleven_flash_v2', label: MODEL_CONFIGS['eleven_flash_v2'].displayName },
    { value: 'eleven_multilingual_v1', label: MODEL_CONFIGS['eleven_multilingual_v1'].displayName },
    { value: 'eleven_monolingual_v1', label: MODEL_CONFIGS['eleven_monolingual_v1'].displayName },
  ];
}
