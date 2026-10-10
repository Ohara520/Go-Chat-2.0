-- Go Chat · Voice V1 (BYOK) — 用户语音配置表
-- 创建时间: 2024-10-10
-- 说明: 支持用户自带 ElevenLabs API Key，密钥在服务端加密存储
--
-- 安全要求:
--   1. 所有密钥字段必须在服务端使用 AES-256-GCM 加密后存储
--   2. RLS 开启，但不设 policy，只允许服务端 service role 访问
--   3. 撤销 anon 和 authenticated 角色的所有权限
--   4. 环境变量 VOICE_KEY_ENCRYPTION_SECRET 必须配置（32字节base64）

create table if not exists public.user_voice_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- 当前仅支持 ElevenLabs，预留扩展空间
  provider text not null default 'elevenlabs' check (provider = 'elevenlabs'),

  -- AES-256-GCM 加密三件套（全 null 或全非 null）
  api_key_ciphertext text,
  api_key_iv text,
  api_key_auth_tag text,
  key_version int not null default 1,  -- 预留密钥轮换版本（V1 固定为 1，轮换需迁移脚本）

  -- 语音配置
  voice_id text,
  model_id text not null default 'eleven_turbo_v2_5',
  auto_play boolean not null default false,

  -- 预留实时语音通话字段（本次不实现）
  -- mode text check (mode in ('tts', 'realtime')),  -- 未来扩展

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 三件套一致性约束
  constraint voice_key_fields_together check (
    (api_key_ciphertext is null and api_key_iv is null and api_key_auth_tag is null)
    or
    (api_key_ciphertext is not null and api_key_iv is not null and api_key_auth_tag is not null)
  )
);

-- 启用 RLS（但不创建 policy，强制服务端访问）
alter table public.user_voice_settings enable row level security;

-- 撤销客户端角色的所有权限
revoke all on table public.user_voice_settings from anon, authenticated;

-- 索引：user_id 已是主键自带索引，暂不需要额外索引

comment on table public.user_voice_settings is
  '用户自定义语音配置（BYOK）。加密字段仅服务端可访问，客户端禁止直接读写。';
comment on column public.user_voice_settings.api_key_ciphertext is
  'AES-256-GCM 加密后的 API Key（ciphertext）';
comment on column public.user_voice_settings.api_key_iv is
  'AES-256-GCM 初始化向量（IV），每次加密随机生成';
comment on column public.user_voice_settings.api_key_auth_tag is
  'AES-256-GCM 认证标签（auth tag），用于完整性校验';
comment on column public.user_voice_settings.key_version is
  '密钥版本号，当前固定为 1。如需轮换 VOICE_KEY_ENCRYPTION_SECRET，需执行专门的迁移脚本：
   1. 使用新密钥重新加密所有现有密钥（需同时持有新旧密钥）
   2. 更新 key_version = 2
   3. 删除环境变量中的旧密钥
   V1 不支持在线轮换，轮换需停机维护窗口';
