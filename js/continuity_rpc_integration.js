// ===================================================
// continuity_rpc_integration.js — Continuity RPC 集成补丁 (v2)
// ===================================================
//
// 修复点：
//   F-INT-1  移除对 _saveContinuity 的包装（避免每次保存都触发脏标记）
//            改为仅在 record/update/complete/cancel 时标记
//   F-INT-2  _pruneContinuity 只在实际删除时写墓碑（不再无条件标记）
//   F-INT-3  角色切换时清除旧角色脏标记，防止串角色上传
//   F-INT-4  退出登录前尝试同步；登录后先加载云端再合并
//   F-INT-5  账号切换检测：userId 变化时不上传前账号数据
//
// 不包装 _saveContinuity 的原因：
//   _saveContinuity 是内部持久化函数，也在 _mergeCloudIntoLocal 后调用。
//   对云端数据的本地写入不应触发脏标记（否则会立刻上传刚收到的云端数据）。
//   只有用户/模型触发的 record/update/complete/cancel/prune 才代表"本地新修改"。
// ===================================================

(function() {
  'use strict';

  function _ready() {
    return typeof markContinuityDirty  === 'function'
        && typeof isContinuityDirty    === 'function'
        && typeof recordContinuity     === 'function';
  }

  if (!_ready()) {
    // 依赖未加载，延迟 100ms 后重试一次（脚本顺序问题的兜底）
    setTimeout(function() {
      if (_ready()) _init();
      else console.warn('[ContinuityRPC] Dependencies not available, integration skipped');
    }, 100);
    return;
  }

  _init();

  function _init() {
    _patchMutations();
    _patchPrune();
    _patchCharacterSwitch();
    _patchCloudSave();
    _patchCloudLoad();
    _patchLogout();
    console.log('[ContinuityRPC] Integration patch v2 loaded');
  }

  // ── F-INT-1: 包装写操作（仅标记脏数据，不触发 _saveContinuity）──
  function _patchMutations() {
    const ops = [
      { name: 'recordContinuity',   wrap: function(orig, args) { return orig.apply(this, args); } },
      { name: 'updateContinuity',   wrap: function(orig, args) { return orig.apply(this, args); } },
      { name: 'completeContinuity', wrap: function(orig, args) { return orig.apply(this, args); } },
      { name: 'cancelContinuity',   wrap: function(orig, args) { return orig.apply(this, args); } }
    ];

    ops.forEach(function(op) {
      if (typeof window[op.name] !== 'function') return;
      var orig = window[op.name];
      window[op.name] = function() {
        var result = op.wrap(orig, arguments);
        // 标记脏数据（原函数已写 localStorage，这里只需标记需要上传）
        markContinuityDirty();
        return result;
      };
    });
  }

  // ── F-INT-2: 包装 _pruneContinuity（仅在实际删除时写墓碑）──────
  function _patchPrune() {
    if (typeof window._pruneContinuity !== 'function') return;

    var origPrune = window._pruneContinuity;
    window._pruneContinuity = function(items) {
      var pruned = origPrune.call(this, items);

      var prunedCount = items.length - pruned.length;
      if (prunedCount <= 0) return pruned;  // 无删除，不写墓碑

      // 找出被删除的 id
      var prunedIds = [];
      var prunedSet = new Set(pruned.map(function(p) { return p.id; }));
      items.forEach(function(it) {
        if (!prunedSet.has(it.id)) prunedIds.push(it.id);
      });

      // 写入墓碑
      _addTombstones(prunedIds);
      markContinuityDirty();
      return pruned;
    };
  }

  function _addTombstones(ids) {
    var now = Date.now();
    var raw = localStorage.getItem('continuityTombstones');
    var tombstones = [];
    try { tombstones = JSON.parse(raw) || []; } catch(e) {}

    var existing = new Set(tombstones.map(function(t) { return t.id; }));
    ids.forEach(function(id) {
      if (!existing.has(id)) {
        tombstones.push({ id: id, deletedAt: now });
      }
    });

    // 客户端保留最新 1000 条，180 天内
    var maxAge = 180 * 24 * 60 * 60 * 1000;
    tombstones = tombstones
      .filter(function(t) { return (now - t.deletedAt) <= maxAge; })
      .slice(-1000);

    try {
      localStorage.setItem('continuityTombstones', JSON.stringify(tombstones));
    } catch(e) {
      console.error('[ContinuityRPC] Failed to write tombstones:', e);
    }
  }

  // ── F-INT-3: 角色切换时清除旧角色脏标记 ──────────────────────
  function _patchCharacterSwitch() {
    if (typeof window.switchCharacter !== 'function') return;

    var origSwitch = window.switchCharacter;
    window.switchCharacter = async function(newCharId) {
      // 切换前：清除旧角色脏标记（旧角色数据已由 _saveCharacterData 持久化）
      // 注意：此时 getCurrentCharacter() 仍返回旧角色
      var oldDirtyKey = '_continuityDirty_'
        + ((typeof getSbUserId === 'function' ? getSbUserId() : '') || 'anon')
        + '_' + ((typeof getCurrentCharacter === 'function' ? getCurrentCharacter() : '') || 'ghost');
      sessionStorage.removeItem(oldDirtyKey);

      // 执行原切换逻辑
      await origSwitch.call(this, newCharId);

      // 切换后：新角色本地数据刚加载，与云端一致性未知，标记脏数据等待同步
      // （如果云端有更新，下次 loadContinuityFromCloud 会合并）
      markContinuityDirty();
    };
  }

  // ── F-INT-5: 包装 saveToCloud（检查 userId 防止串账号）──────────
  function _patchCloudSave() {
    if (typeof window.saveToCloud !== 'function') return;

    var origSave = window.saveToCloud;
    var _lastSyncUserId = null;

    window.saveToCloud = async function(immediate) {
      await origSave.apply(this, arguments);

      // F-INT-5: 检查账号是否切换
      var currentUserId = (typeof getSbUserId === 'function') ? getSbUserId() : null;
      if (_lastSyncUserId && _lastSyncUserId !== currentUserId) {
        // 账号已切换，不上传前账号的脏数据
        console.warn('[ContinuityRPC] User changed, skip continuity sync');
        sessionStorage.removeItem('_continuityDirty_' + _lastSyncUserId + '_ghost');
        sessionStorage.removeItem('_continuityDirty_' + _lastSyncUserId + '_keegan');
        _lastSyncUserId = currentUserId;
        return;
      }
      _lastSyncUserId = currentUserId;

      if (typeof saveContinuity === 'function') {
        try { await saveContinuity(); } catch(e) {
          console.error('[ContinuityRPC] saveContinuity failed:', e);
        }
      }
    };
  }

  // ── F-INT-4a: 包装 loadFromCloud（登录后先加载云端 Continuity）──
  function _patchCloudLoad() {
    if (typeof window.loadFromCloud !== 'function') return;

    var origLoad = window.loadFromCloud;
    window.loadFromCloud = async function() {
      await origLoad.apply(this, arguments);

      if (typeof loadContinuityFromCloud === 'function') {
        try { await loadContinuityFromCloud(); } catch(e) {
          console.error('[ContinuityRPC] loadContinuityFromCloud failed:', e);
        }
      }
    };
  }

  // ── F-INT-4b: 退出登录前强制同步 ──────────────────────────────
  function _patchLogout() {
    // 项目用 signOut 或 logOut，尝试包装常见命名
    var logoutFnName = null;
    ['signOut', 'logOut', 'logout', 'handleLogout'].forEach(function(name) {
      if (typeof window[name] === 'function' && !logoutFnName) logoutFnName = name;
    });

    if (!logoutFnName) {
      // 未找到退出函数，监听 Supabase auth state 变化作为兜底
      _watchAuthState();
      return;
    }

    var origLogout = window[logoutFnName];
    window[logoutFnName] = async function() {
      // 退出前同步（最多等 3 秒）
      if (typeof saveContinuity === 'function' && isContinuityDirty()) {
        try {
          await Promise.race([
            saveContinuity(),
            new Promise(function(_, rej) { setTimeout(function() { rej(new Error('timeout')); }, 3000); })
          ]);
        } catch(e) {
          console.warn('[ContinuityRPC] Pre-logout sync failed:', e.message);
        }
      }
      return origLogout.apply(this, arguments);
    };
  }

  function _watchAuthState() {
    // 当 Supabase 客户端可用时，监听 SIGNED_OUT 事件前尝试同步
    var checkInterval = setInterval(function() {
      var sb = typeof getSbClient === 'function' ? getSbClient() : null;
      if (!sb) return;
      clearInterval(checkInterval);
      sb.auth.onAuthStateChange(function(event) {
        if (event === 'SIGNED_OUT') {
          // 清除当前用户的所有脏标记（已退出，无法再同步）
          ['ghost', 'keegan'].forEach(function(cid) {
            var uid = (typeof getSbUserId === 'function' ? getSbUserId() : '') || '';
            sessionStorage.removeItem('_continuityDirty_' + uid + '_' + cid);
          });
        }
      });
    }, 500);
    // 最多等 10 秒
    setTimeout(function() { clearInterval(checkInterval); }, 10000);
  }

})();
