-- ===================================================
-- Go Chat · Continuity V1 云同步 RPC 方案 (v2)
-- 创建时间: 2026-11-04
-- 修订时间: 2026-11-04 (代码审计修复)
-- 修复：版本控制漏洞、updated_at 污染、无效版本递增、速率限制、墓碑上限
-- ===================================================

-- ========== 阶段 1: 创建事件主表 ==========
CREATE TABLE IF NOT EXISTS public.continuity_events (
  user_id       UUID  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id  TEXT  NOT NULL,
  event_id      TEXT  NOT NULL,

  type          TEXT  NOT NULL,
  subject       TEXT  NOT NULL CHECK (length(subject) <= 200),
  status        TEXT  NOT NULL
    CHECK (status IN ('pending', 'ongoing', 'completed', 'cancelled')),
  summary       TEXT  CHECK (summary IS NULL OR length(summary) <= 1000),

  source        TEXT  CHECK (source IS NULL OR length(source) <= 100),
  source_id     TEXT  CHECK (source_id IS NULL OR length(source_id) <= 100),

  -- 客户端时间戳（毫秒），辅助信息，不用于版本仲裁
  mentioned_at  BIGINT,
  started_at    BIGINT,
  client_updated_at BIGINT NOT NULL,   -- 原 updated_at，重命名避免语义混淆
  completed_at  BIGINT,
  cancelled_at  BIGINT,

  planned_date      TEXT  CHECK (planned_date IS NULL OR planned_date ~ '^\d{4}-\d{2}-\d{2}$'),
  planned_day_part  TEXT
    CHECK (planned_day_part IS NULL OR planned_day_part IN ('morning','afternoon','evening','night')),

  changes       JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- 服务端权威版本号（每次有效写入 +1，仅在实际内容变更时递增）
  version       INT   NOT NULL DEFAULT 1,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, character_id, event_id),
  CHECK (length(event_id) <= 64),
  CHECK (character_id IN ('ghost', 'keegan'))
);

CREATE INDEX IF NOT EXISTS idx_continuity_user_char
  ON continuity_events(user_id, character_id);
CREATE INDEX IF NOT EXISTS idx_continuity_active
  ON continuity_events(user_id, character_id, status)
  WHERE status IN ('pending', 'ongoing');

COMMENT ON TABLE  continuity_events IS 'Continuity V1 事件主表；版本号由服务端权威管理';
COMMENT ON COLUMN continuity_events.version IS
  '服务端递增版本号。仅当内容实际变化时 +1；重复请求不递增';
COMMENT ON COLUMN continuity_events.client_updated_at IS
  '客户端上报的修改时间戳（毫秒）。仅用于同版本同优先级时的辅助排序，不用于版本仲裁';

-- ========== 阶段 2: 墓碑表 ==========
CREATE TABLE IF NOT EXISTS public.continuity_tombstones (
  user_id       UUID  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id  TEXT  NOT NULL CHECK (character_id IN ('ghost', 'keegan')),
  event_id      TEXT  NOT NULL CHECK (length(event_id) <= 64),
  deleted_at    BIGINT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, character_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_tombstones_user_char
  ON continuity_tombstones(user_id, character_id);

COMMENT ON TABLE continuity_tombstones IS
  '已删除事件的墓碑；防止旧设备复活已清理事件。保留 180 天后滚动清理';

-- ========== 阶段 3: RLS ==========
ALTER TABLE public.continuity_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.continuity_tombstones  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'continuity_events' AND policyname = 'continuity_events_user_policy'
  ) THEN
    CREATE POLICY continuity_events_user_policy ON continuity_events
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'continuity_tombstones' AND policyname = 'continuity_tombstones_user_policy'
  ) THEN
    CREATE POLICY continuity_tombstones_user_policy ON continuity_tombstones
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ========== 阶段 4: 状态优先级（IMMUTABLE，可被查询计划缓存）==========
CREATE OR REPLACE FUNCTION get_status_priority(p_status TEXT)
RETURNS INT LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
BEGIN
  RETURN CASE p_status
    WHEN 'completed' THEN 100
    WHEN 'cancelled' THEN 100
    WHEN 'ongoing'   THEN  50
    WHEN 'pending'   THEN  50
    ELSE 0
  END;
END;
$$;

-- ========== 阶段 5: 原子合并 RPC ==========
-- 修复点：
--   F1. 版本控制：client_version 必须 = cloud_version 才允许更新（乐观锁）
--   F2. updated_at 不再用 GREATEST；仅版本有效写入时更新
--   F3. 版本号仅在内容实际发生变化时递增（幂等重试不递增）
--   F4. 输入校验：数组长度上限 50，字段长度限制
--   F5. 速率限制：单用户事件总数上限 200
--   F6. 墓碑云端上限：每个 (user, char) 保留最新 1000 条
--   F7. 版本冲突时返回云端最新记录，供客户端合并
CREATE OR REPLACE FUNCTION atomic_merge_continuity(
  p_user_id      UUID,
  p_character_id TEXT,
  p_events       JSONB,
  p_tombstones   JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_event         JSONB;
  v_tombstone     JSONB;
  v_tombstone_ids TEXT[];
  v_conflicts     JSONB := '[]'::JSONB;
  v_cloud_ver     INT;
  v_cloud_status  TEXT;
  v_cloud_row     continuity_events%ROWTYPE;
  v_client_ver    INT;
  v_client_prio   INT;
  v_cloud_prio    INT;
  v_now           BIGINT := EXTRACT(EPOCH FROM NOW())::BIGINT * 1000;
  v_max_age_ms    BIGINT := 90::BIGINT * 24 * 60 * 60 * 1000;
  v_event_count   INT;
  -- 内容指纹，用于判断是否真正变更（避免无效版本递增）
  v_new_fp        TEXT;
  v_old_fp        TEXT;
BEGIN
  -- ── 身份验证 ──
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: not authenticated';
  END IF;
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED: user_id mismatch';
  END IF;

  -- ── 参数校验 ──
  IF p_character_id NOT IN ('ghost', 'keegan') THEN
    RAISE EXCEPTION 'INVALID_ARG: unknown character_id %', p_character_id;
  END IF;
  IF jsonb_typeof(p_events) != 'array' THEN
    RAISE EXCEPTION 'INVALID_ARG: p_events must be array';
  END IF;
  IF jsonb_typeof(p_tombstones) != 'array' THEN
    RAISE EXCEPTION 'INVALID_ARG: p_tombstones must be array';
  END IF;
  -- F4: 数组长度上限
  IF jsonb_array_length(p_events) > 50 THEN
    RAISE EXCEPTION 'LIMIT_EXCEEDED: p_events max 50 items, got %',
      jsonb_array_length(p_events);
  END IF;
  IF jsonb_array_length(p_tombstones) > 200 THEN
    RAISE EXCEPTION 'LIMIT_EXCEEDED: p_tombstones max 200 items, got %',
      jsonb_array_length(p_tombstones);
  END IF;

  -- ── 阶段 A: 墓碑合并（先于任何事件操作）──
  FOR v_tombstone IN SELECT * FROM jsonb_array_elements(p_tombstones) LOOP
    -- 字段校验
    IF v_tombstone->>'event_id' IS NULL
       OR length(v_tombstone->>'event_id') > 64
       OR (v_tombstone->>'deleted_at')::BIGINT IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO continuity_tombstones (user_id, character_id, event_id, deleted_at)
    VALUES (
      p_user_id, p_character_id,
      v_tombstone->>'event_id',
      (v_tombstone->>'deleted_at')::BIGINT
    )
    ON CONFLICT (user_id, character_id, event_id) DO UPDATE SET
      -- 保留最新的删除时间（防止旧设备用更早的墓碑覆盖新墓碑）
      deleted_at = GREATEST(continuity_tombstones.deleted_at, EXCLUDED.deleted_at);
  END LOOP;

  -- F6: 墓碑云端上限 1000 条（删除最旧的，保留最新 1000）
  DELETE FROM continuity_tombstones
  WHERE user_id = p_user_id AND character_id = p_character_id
    AND event_id NOT IN (
      SELECT event_id FROM continuity_tombstones
      WHERE user_id = p_user_id AND character_id = p_character_id
      ORDER BY deleted_at DESC
      LIMIT 1000
    );

  -- 清理 180 天前的过期墓碑
  DELETE FROM continuity_tombstones
  WHERE user_id = p_user_id AND character_id = p_character_id
    AND deleted_at < (v_now - 180::BIGINT * 24 * 60 * 60 * 1000);

  -- 删除云端里已被标记的事件
  DELETE FROM continuity_events
  WHERE user_id = p_user_id AND character_id = p_character_id
    AND event_id IN (
      SELECT event_id FROM continuity_tombstones
      WHERE user_id = p_user_id AND character_id = p_character_id
    );

  -- 获取墓碑列表（用于事件合并阶段的内联检查）
  SELECT ARRAY_AGG(event_id) INTO v_tombstone_ids
  FROM continuity_tombstones
  WHERE user_id = p_user_id AND character_id = p_character_id;
  IF v_tombstone_ids IS NULL THEN
    v_tombstone_ids := ARRAY[]::TEXT[];
  END IF;

  -- ── 阶段 B: 事件合并 ──
  -- 按 event_id 字典序处理，统一顺序防止并发死锁
  FOR v_event IN
    SELECT value FROM jsonb_array_elements(p_events) AS value
    ORDER BY value->>'id'
  LOOP
    -- B1: 字段基础校验
    IF v_event->>'id' IS NULL OR length(v_event->>'id') > 64 THEN CONTINUE; END IF;
    IF v_event->>'status' NOT IN ('pending','ongoing','completed','cancelled') THEN CONTINUE; END IF;
    IF v_event->>'type' IS NULL THEN CONTINUE; END IF;
    IF v_event->>'subject' IS NULL OR length(v_event->>'subject') > 200 THEN CONTINUE; END IF;
    IF (v_event->>'version')::INT IS NULL OR (v_event->>'version')::INT < 1 THEN CONTINUE; END IF;

    -- B2: 墓碑检查（第一道防线）
    IF (v_event->>'id') = ANY(v_tombstone_ids) THEN
      v_conflicts := v_conflicts || jsonb_build_object(
        'event_id', v_event->>'id',
        'reason', 'event_deleted',
        'action', 'skipped'
      );
      CONTINUE;
    END IF;

    -- B3: 超时旧事件检查（防止超长期离线设备复活过时事件）
    IF (v_event->>'client_updated_at')::BIGINT < (v_now - v_max_age_ms) THEN
      -- 只拒绝云端不存在的过时事件；云端已有的允许通过（可能是状态更新）
      IF NOT EXISTS (
        SELECT 1 FROM continuity_events
        WHERE user_id = p_user_id
          AND character_id = p_character_id
          AND event_id = v_event->>'id'
      ) THEN
        v_conflicts := v_conflicts || jsonb_build_object(
          'event_id', v_event->>'id',
          'reason', 'event_too_old',
          'client_updated_at', v_event->>'client_updated_at'
        );
        CONTINUE;
      END IF;
    END IF;

    -- B4: 读取云端当前状态（FOR UPDATE 锁定行，防止并发覆写）
    SELECT * INTO v_cloud_row FROM continuity_events
    WHERE user_id = p_user_id
      AND character_id = p_character_id
      AND event_id = v_event->>'id'
    FOR UPDATE;

    v_client_ver  := (v_event->>'version')::INT;
    v_cloud_ver   := v_cloud_row.version;   -- NULL 表示云端无此事件

    -- B5: 版本控制（乐观锁，F1 修复核心）
    --
    -- INSERT（新事件）：client_version 必须 = 1
    -- UPDATE（已有事件）：client_version 必须 = cloud_version（乐观锁）
    --   client < cloud → 版本落后，拒绝，返回云端最新记录
    --   client > cloud → 异常（客户端版本超前），拒绝
    --   client = cloud → 允许，执行下一步检查
    IF v_cloud_ver IS NOT NULL THEN
      IF v_client_ver != v_cloud_ver THEN
        -- 版本不匹配：返回云端最新记录，客户端需合并后重试
        v_conflicts := v_conflicts || jsonb_build_object(
          'event_id',       v_event->>'id',
          'reason',         'version_conflict',
          'cloud_version',  v_cloud_ver,
          'client_version', v_client_ver,
          'action',         'rejected',
          -- 返回云端最新记录供客户端合并
          'cloud_record', jsonb_build_object(
            'id',               v_cloud_row.event_id,
            'status',           v_cloud_row.status,
            'summary',          v_cloud_row.summary,
            'version',          v_cloud_row.version,
            'client_updated_at', v_cloud_row.client_updated_at,
            'plannedDate',      v_cloud_row.planned_date,
            'plannedDayPart',   v_cloud_row.planned_day_part
          )
        );
        CONTINUE;
      END IF;
    ELSE
      -- 新事件：client_version 应为 1
      IF v_client_ver != 1 THEN
        v_conflicts := v_conflicts || jsonb_build_object(
          'event_id', v_event->>'id',
          'reason', 'invalid_initial_version',
          'client_version', v_client_ver
        );
        CONTINUE;
      END IF;
    END IF;

    -- B6: 终态保护（版本一致后再检查状态优先级）
    IF v_cloud_ver IS NOT NULL THEN
      v_cloud_prio  := get_status_priority(v_cloud_row.status);
      v_client_prio := get_status_priority(v_event->>'status');

      IF v_client_prio < v_cloud_prio THEN
        -- 非终态不得覆盖终态
        v_conflicts := v_conflicts || jsonb_build_object(
          'event_id',    v_event->>'id',
          'reason',      'terminal_state_protected',
          'cloud_status', v_cloud_row.status,
          'client_status', v_event->>'status',
          'action',      'rejected',
          'cloud_record', jsonb_build_object(
            'id',      v_cloud_row.event_id,
            'status',  v_cloud_row.status,
            'version', v_cloud_row.version
          )
        );
        CONTINUE;
      END IF;
    END IF;

    -- B7: F5 速率限制（单用户事件总数上限 200）
    SELECT COUNT(*) INTO v_event_count
    FROM continuity_events
    WHERE user_id = p_user_id AND character_id = p_character_id;

    IF v_cloud_ver IS NULL AND v_event_count >= 200 THEN
      v_conflicts := v_conflicts || jsonb_build_object(
        'event_id', v_event->>'id',
        'reason', 'event_limit_exceeded'
      );
      CONTINUE;
    END IF;

    -- B8: 计算内容指纹（F3：判断是否真正变更，避免无效版本递增）
    v_new_fp := v_event->>'status'
             || COALESCE(v_event->>'summary', '')
             || COALESCE(v_event->>'plannedDate', '')
             || COALESCE(v_event->>'plannedDayPart', '');

    IF v_cloud_ver IS NOT NULL THEN
      v_old_fp := v_cloud_row.status
               || COALESCE(v_cloud_row.summary, '')
               || COALESCE(v_cloud_row.planned_date, '')
               || COALESCE(v_cloud_row.planned_day_part, '');
    ELSE
      v_old_fp := NULL;
    END IF;

    -- B9: 执行 UPSERT（F2 修复：updated_at 不再用 GREATEST，F3 修复：内容无变化不递增版本）
    INSERT INTO continuity_events (
      user_id, character_id, event_id,
      type, subject, status, summary,
      source, source_id,
      mentioned_at, started_at, client_updated_at,
      completed_at, cancelled_at,
      planned_date, planned_day_part,
      changes, version
    ) VALUES (
      p_user_id, p_character_id, v_event->>'id',
      v_event->>'type',
      LEFT(v_event->>'subject', 200),
      v_event->>'status',
      LEFT(v_event->>'summary', 1000),
      LEFT(v_event->>'source', 100),
      LEFT(v_event->>'sourceId', 100),
      (v_event->>'mentionedAt')::BIGINT,
      (v_event->>'startedAt')::BIGINT,
      (v_event->>'client_updated_at')::BIGINT,
      (v_event->>'completedAt')::BIGINT,
      (v_event->>'cancelledAt')::BIGINT,
      v_event->>'plannedDate',
      v_event->>'plannedDayPart',
      COALESCE(v_event->'changes', '[]'::JSONB),
      1  -- 新事件从 1 开始
    )
    ON CONFLICT (user_id, character_id, event_id) DO UPDATE SET
      type             = EXCLUDED.type,
      subject          = EXCLUDED.subject,
      status           = EXCLUDED.status,
      summary          = EXCLUDED.summary,
      source           = EXCLUDED.source,
      source_id        = EXCLUDED.source_id,
      mentioned_at     = EXCLUDED.mentioned_at,
      started_at       = EXCLUDED.started_at,
      -- F2: client_updated_at 仅在内容实际变化时更新（不用 GREATEST）
      client_updated_at = CASE
        WHEN v_new_fp IS DISTINCT FROM v_old_fp THEN EXCLUDED.client_updated_at
        ELSE continuity_events.client_updated_at
      END,
      completed_at     = EXCLUDED.completed_at,
      cancelled_at     = EXCLUDED.cancelled_at,
      planned_date     = EXCLUDED.planned_date,
      planned_day_part = EXCLUDED.planned_day_part,
      changes          = EXCLUDED.changes,
      -- F3: 版本号仅在内容实际变化时递增；幂等重试不递增
      version = CASE
        WHEN v_new_fp IS DISTINCT FROM v_old_fp THEN continuity_events.version + 1
        ELSE continuity_events.version
      END,
      server_updated_at = CASE
        WHEN v_new_fp IS DISTINCT FROM v_old_fp THEN NOW()
        ELSE continuity_events.server_updated_at
      END
    -- F（墓碑二次防线）：并发写入期间若墓碑刚插入，此处阻止
    WHERE EXCLUDED.event_id != ALL(v_tombstone_ids);

  END LOOP;

  -- ── 阶段 C: 返回结果 ──
  RETURN jsonb_build_object(
    'success',         true,
    'conflicts',       v_conflicts,
    'tombstone_count', COALESCE(array_length(v_tombstone_ids, 1), 0),
    'server_timestamp', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION atomic_merge_continuity(UUID, TEXT, JSONB, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION atomic_merge_continuity(UUID, TEXT, JSONB, JSONB) TO authenticated;

COMMENT ON FUNCTION atomic_merge_continuity IS
  'Continuity 原子合并。乐观锁版本控制 + 终态保护 + 墓碑防复活 + 速率限制。'
  '版本号仅在内容变化时递增（幂等）。版本冲突时返回云端最新记录';
