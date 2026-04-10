// ===== Supabase 云端同步 =====
const _SB_URL = 'https://siahkenfoofkjrgevgma.supabase.co';
const _SB_KEY = 'sb_publishable_FNPLr9vwPZPrB4ifHBncXg_83CWekPD';

function getSbClient() {
  // 直接用index.html里已创建的sbClient，避免重复初始化
  if (window.sbClient) return window.sbClient;
  if (window._sbClient) return window._sbClient;
  if (window.supabase) {
    window._sbClient = window.supabase.createClient(_SB_URL, _SB_KEY);
    return window._sbClient;
  }
  return null;
}

function getSbUserId() {
  return localStorage.getItem('sb_user_id');
}

// 从云端加载数据到localStorage
async function loadFromCloud() {
  const sb = getSbClient();
  const userId = getSbUserId();
  if (!sb || !userId) return;
  try {
    const { data, error } = await sb
      .from('user_data')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return;

    // ── 时间戳 ──────────────────────────────────────────────
    const cloudTs = data.updated_at ? new Date(data.updated_at).getTime() : 0;
    const localTs = parseInt(localStorage.getItem('localUpdatedAt') || localStorage.getItem('chatUpdatedAt') || '0');
    const cloudIsNewer = cloudTs > localTs + 500; // 500ms容差，防止同设备误判

    // ── 1. 聊天记录：合并云端和本地，保留更多 ────────────────
    if (data.chat_history && data.chat_history.length > 0) {
      const localRaw = localStorage.getItem('chatHistory');
      const localHistory = localRaw ? JSON.parse(localRaw) : [];
      if (localHistory.length === 0) {
        // 本地空 → 无条件从云端恢复
        localStorage.setItem('chatHistory', JSON.stringify(data.chat_history));
        localStorage.setItem('chatUpdatedAt', cloudTs);
      } else {
        // 合并：把云端有但本地没有的消息补进来（按内容去重）
        const localContents = new Set(localHistory.map(m => m.role + '|' + (m.content || '').slice(0, 80)));
        const toAdd = data.chat_history.filter(m => !localContents.has(m.role + '|' + (m.content || '').slice(0, 80)));
        if (toAdd.length > 0) {
          // 云端的放前面（更早），本地的放后面（更新）
          const merged = [...toAdd, ...localHistory].slice(-300);
          localStorage.setItem('chatHistory', JSON.stringify(merged));
          localStorage.setItem('chatUpdatedAt', cloudTs);
        }
      }
    }

    // ── 2. Profile：每个字段独立，有值才覆盖，本地有就用本地 ──
    if (data.profile != null) {
      const p = data.profile;
      const setIfMissing = (key, val) => { if (val != null && val !== '' && !localStorage.getItem(key)) localStorage.setItem(key, val); };
      const setIfNewer = (key, val) => { if (val != null && val !== '' && cloudIsNewer) localStorage.setItem(key, val); };
      // 静态资料：本地没有才写（换设备恢复）
      setIfMissing('userName', p.userName);
      setIfMissing('marriageDate', p.marriageDate);
      // Ghost生日：云端有值就用云端的，保证多设备一致
      if (p.ghostBirthday) {
        localStorage.setItem('ghostBirthday', p.ghostBirthday);
        localStorage.setItem('ghostZodiac', p.ghostZodiac || localStorage.getItem('ghostZodiac') || '');
      } else {
        setIfMissing('ghostBirthday', p.ghostBirthday);
        setIfMissing('ghostZodiac', p.ghostZodiac);
      setIfMissing('ghostZodiacEn', p.ghostZodiacEn);
      }
      setIfMissing('meetType', p.meetType);
      setIfMissing('botNickname', p.botNickname);
      // 用户设置：云端更新才覆盖；本地没有时也恢复（换设备场景）
      const setIfNewerOrMissing = (key, val) => {
        if (val == null || val === '') return;
        if (!localStorage.getItem(key) || cloudIsNewer) localStorage.setItem(key, val);
      };
      setIfNewerOrMissing('userBirthday', p.userBirthday);
      setIfNewerOrMissing('userZodiac', p.userZodiac);
      setIfNewerOrMissing('userMBTI', p.userMBTI);
      setIfNewerOrMissing('userCountry', p.userCountry);
      setIfNewerOrMissing('userFavFood', p.userFavFood);
      setIfNewerOrMissing('userFavMusic', p.userFavMusic);
      setIfNewerOrMissing('userFavColor', p.userFavColor);
      setIfNewerOrMissing('userBio', p.userBio);
      setIfNewerOrMissing('metInPerson', p.metInPerson != null ? String(p.metInPerson) : null);
      // visitStreak 取较大值，防止换设备后连续天数倒退
      if (p.visitStreak) {
        const _localStreak = parseInt(localStorage.getItem('visitStreak') || '0');
        const _cloudStreak = parseInt(p.visitStreak || '0');
        if (_cloudStreak > _localStreak) {
          localStorage.setItem('visitStreak', String(_cloudStreak));
        }
      }
      // vocabStreak + vocabLastDay 必须一起恢复，否则连续天数算不准
      if (p.vocabStreak) {
        const _localVS = parseInt(localStorage.getItem('vocabStreak') || '0');
        const _cloudVS = parseInt(p.vocabStreak || '0');
        if (_cloudVS > _localVS) {
          localStorage.setItem('vocabStreak', String(_cloudVS));
          // 同时恢复 lastDay，否则下次学习时找不到昨天记录会重置
          if (p.vocabLastDay && !localStorage.getItem('vocabLastDay')) {
            localStorage.setItem('vocabLastDay', p.vocabLastDay);
          }
        }
      } else if (p.vocabLastDay && !localStorage.getItem('vocabLastDay')) {
        localStorage.setItem('vocabLastDay', p.vocabLastDay);
      }
      setIfNewerOrMissing('vocabLastDay', p.vocabLastDay);
      setIfNewerOrMissing('lastSalaryAmount', p.lastSalaryAmount);
      setIfNewerOrMissing('lastSalaryMonth', p.lastSalaryMonth);
      // 位置信息：换设备也要恢复
      setIfNewerOrMissing('currentLocation', p.currentLocation);
      setIfNewerOrMissing('currentLocationReason', p.currentLocationReason);
      // 调情记忆：换设备恢复，有新的就合并
      if (p.intimateMemory) {
        const _local = localStorage.getItem('intimateMemory') || '';
        if (!_local) {
          localStorage.setItem('intimateMemory', p.intimateMemory);
        } else if (cloudIsNewer && p.intimateMemory !== _local) {
          const _all = [...(p.intimateMemory.split('\n---\n')), ...(_local.split('\n---\n'))];
          const _deduped = [...new Set(_all)].filter(Boolean).slice(-3);
          localStorage.setItem('intimateMemory', _deduped.join('\n---\n'));
        }
      }
      // 头像：有就用云端（换设备必须恢复）
      if (p.userAvatarBase64 && !localStorage.getItem('userAvatarBase64')) {
        localStorage.setItem('userAvatarBase64', p.userAvatarBase64);
      }
      if (p.coupleCoverBase64 && !localStorage.getItem('coupleCoverBase64')) {
        localStorage.setItem('coupleCoverBase64', p.coupleCoverBase64);
      }
      // 冷战状态：取最新
      if (p.coldWarMode != null && cloudIsNewer) localStorage.setItem('coldWarMode', String(p.coldWarMode));
      // 婚姻模式和Ghost档案
      setIfMissing('marriageType', p.marriageType);
      // Ghost头像URL：云端有值就用云端（换设备必须恢复），本地有值且云端没有就保留本地
      if (p.ghostAvatarUrl) {
        // 云端有头像URL，无论新旧都写入（保证换头像后刷新能恢复）
        localStorage.setItem('ghostAvatarUrl', p.ghostAvatarUrl);
        // 同时更新页面上的头像元素
        document.querySelectorAll('.ghost-avatar-img').forEach(el => {
          el.src = p.ghostAvatarUrl + '?t=' + Date.now();
        });
      }
      setIfMissing('ghostHeight', p.ghostHeight);
      setIfMissing('ghostWeight', p.ghostWeight);
      setIfMissing('ghostBloodType', p.ghostBloodType);
      setIfMissing('ghostHometown', p.ghostHometown);
      setIfMissing('ghostUnlocked_birthday', p.ghostUnlocked_birthday);
      setIfMissing('ghostUnlocked_zodiac', p.ghostUnlocked_zodiac);
      setIfMissing('ghostUnlocked_height', p.ghostUnlocked_height);
      setIfMissing('ghostUnlocked_weight', p.ghostUnlocked_weight);
      setIfMissing('ghostUnlocked_blood_type', p.ghostUnlocked_blood_type);
      setIfMissing('ghostUnlocked_hometown', p.ghostUnlocked_hometown);
    }

    // ── 3. 情绪/关系：云端更新才覆盖，本地操作优先 ────────────
    if (cloudIsNewer) {
      if (data.mood != null) localStorage.setItem('moodLevel', data.mood);
      if (data.affection != null) localStorage.setItem('affection', data.affection);
      if (data.long_term_memory != null) localStorage.setItem('longTermMemory', data.long_term_memory);
    } else {
      // 云端较旧：只恢复本地没有的
      if (data.mood != null && !localStorage.getItem('moodLevel')) localStorage.setItem('moodLevel', data.mood);
      if (data.affection != null && !localStorage.getItem('affection')) localStorage.setItem('affection', data.affection);
      if (data.long_term_memory != null && !localStorage.getItem('longTermMemory')) localStorage.setItem('longTermMemory', data.long_term_memory);
    }

    // ── 3.5 签到记录：恢复历史签到key + 本月里程碑计数 ──────────
    // 这是防止 iOS 清缓存后重复签到的关键
    if (data.profile?.checkinKeys && typeof data.profile.checkinKeys === 'object') {
      Object.keys(data.profile.checkinKeys).forEach(k => {
        if (k.startsWith('checkin_') && !localStorage.getItem(k)) {
          localStorage.setItem(k, '1');
        }
      });
    }
    if (data.profile?.monthlyCheckinKey && data.profile?.monthlyCheckinCount) {
      const localCount = parseInt(localStorage.getItem(data.profile.monthlyCheckinKey) || '0');
      const cloudCount = parseInt(data.profile.monthlyCheckinCount || '0');
      // 取较大值，防止倒退
      if (cloudCount > localCount) {
        localStorage.setItem(data.profile.monthlyCheckinKey, String(cloudCount));
      }
    }

    // ── 4. 钱包迁移标记 + 余额恢复（必须最早执行）────────────
    // 根本原因：walletMigrated_v3 丢失后，getBalance() 一被调用就清空 transactions
    // 必须在任何可能触发 getBalance() 的代码之前恢复这个标记

    // 4a. 恢复迁移标记
    if (data.profile?.walletMigrated_v3) {
      localStorage.setItem('walletMigrated_v3', data.profile.walletMigrated_v3);
    }
    if (data.profile?.weddingGift_v1) {
      localStorage.setItem('weddingGift_v1', data.profile.weddingGift_v1);
    }
    if (data.profile?.maintenanceComp_20260409) {
      localStorage.setItem('maintenanceComp_20260409', data.profile.maintenanceComp_20260409);
    }
    // 恢复今日打工次数（防止换设备后次数重置但钱已到账）
    if (data.profile?.todayWorkKey && data.profile?.todayWorkData) {
      if (!localStorage.getItem(data.profile.todayWorkKey)) {
        localStorage.setItem(data.profile.todayWorkKey, data.profile.todayWorkData);
      }
    }
    if (!data.profile?.walletMigrated_v3) {
      if (data.chat_history?.length > 0 || data.state_snapshot?.transactions?.length > 0) {
      // 云端有聊天记录或交易记录 → 一定是老用户，直接标记已迁移防止清空
      localStorage.setItem('walletMigrated_v3', '1');
    } else if (!localStorage.getItem('walletMigrated_v3')) {
      // 全新用户：标记并给初始礼金
      localStorage.setItem('walletMigrated_v3', '1');
      if (typeof addTransaction === 'function') {
        addTransaction({ icon: '💍', name: '新婚礼金', amount: 200 });
      }
    }
    }

    // 4b. 优先从 state_snapshot.transactions 恢复交易记录
    // 必须在 getBalance() 被调用前完成，防止余额算成0
    // （state_snapshot 在下方第5步才完整处理，这里提前恢复 transactions）
    if (data.state_snapshot?.transactions?.length > 0) {
      const localTxs = JSON.parse(localStorage.getItem('transactions') || '[]');
      if (localTxs.length === 0) {
        // 本地完全没有 → 直接从云端恢复
        localStorage.setItem('transactions', JSON.stringify(data.state_snapshot.transactions.slice(0, 200)));
        console.log('[cloud] 交易记录从云端恢复:', data.state_snapshot.transactions.length, '条');
      }
      // 有本地记录的情况在第5步的合并逻辑里处理
    }

    // 4c. wallet字段作为兜底（transactions为空时才用）
    if (data.balance != null && data.balance > 0) {
      const localTxs = JSON.parse(localStorage.getItem('transactions') || '[]');
      const localBal = localTxs.reduce((s, t) => s + (t.amount || 0), 0);
      if (localBal <= 0) {
        // transactions为空且余额为0，说明数据丢了，用云端balance兜底
        localStorage.setItem('wallet', parseFloat(data.balance).toFixed(2));
      }
    }

    // ── 5. state_snapshot ─────────────────────────────────────
    if (data.state_snapshot != null) {
      const s = data.state_snapshot;

      // 动态状态：云端更新才覆盖
      if (cloudIsNewer) {
        if (s.trustHeat != null) localStorage.setItem('trustHeat', s.trustHeat);
        if (s.attachmentPull != null) localStorage.setItem('attachmentPull', s.attachmentPull);
        if (s.jealousyLevel != null) localStorage.setItem('jealousyLevel', s.jealousyLevel);
        if (s.globalTurnCount != null) { _globalTurnCount = s.globalTurnCount; localStorage.setItem('globalTurnCount', s.globalTurnCount); }
        if (Array.isArray(s.pendingReversePackages)) savePendingReversePackages(s.pendingReversePackages, { markChanged: false });
        if (s.emotionalHurt != null) localStorage.setItem('emotionalHurt', s.emotionalHurt);
        if (s.lastReversePackageTurn != null) localStorage.setItem('lastReversePackageTurn', s.lastReversePackageTurn);
        if (s.relationshipFlags != null) localStorage.setItem('relationshipFlags', JSON.stringify(s.relationshipFlags));
        if (s.coldWarStart != null) localStorage.setItem('coldWarStart', s.coldWarStart);
        if (s.pendingGhostApology != null) localStorage.setItem('pendingGhostApology', String(s.pendingGhostApology));
        if (s.pendingSeriousTalk != null) localStorage.setItem('pendingSeriousTalk', String(s.pendingSeriousTalk));
        if (s.pendingMakeupMoney != null) localStorage.setItem('pendingMakeupMoney', String(s.pendingMakeupMoney));
        if (s.pendingColdWarEndStory != null) localStorage.setItem('pendingColdWarEndStory', String(s.pendingColdWarEndStory));
        if (s.loveResistance != null) localStorage.setItem('loveResistance', String(s.loveResistance));
        if (s.loveResistanceLastDecay != null) localStorage.setItem('loveResistanceLastDecay', s.loveResistanceLastDecay);
        if (s.moneyRefuseCount != null) localStorage.setItem('moneyRefuseCount', String(s.moneyRefuseCount));
        if (s.userDislikesMoney != null) localStorage.setItem('userDislikesMoney', String(s.userDislikesMoney));
        if (s.sassyPost != null) localStorage.setItem('sassyPost', s.sassyPost);
        if (s.marketTriggered != null) localStorage.setItem('marketTriggered', JSON.stringify(s.marketTriggered));
        if (s.coupleFeedDate != null) localStorage.setItem('coupleFeedDate', s.coupleFeedDate);
        if (s.organicFeedCountKey && s.organicFeedCount != null) localStorage.setItem(s.organicFeedCountKey, s.organicFeedCount);
        if (s.lastFeedPostAt != null) localStorage.setItem('lastFeedPostAt', s.lastFeedPostAt);
        if (s.weeklyGiven != null) {
          const key = 'weeklyGiven_' + (typeof getWeekKey === 'function' ? getWeekKey() : '');
          localStorage.setItem(key, s.weeklyGiven);
        }
      } else {
        // 云端较旧：只恢复本地没有的字段
        const restoreIfMissing = (key, val) => { if (val != null && !localStorage.getItem(key)) localStorage.setItem(key, String(val)); };
        restoreIfMissing('trustHeat', s.trustHeat);
        restoreIfMissing('attachmentPull', s.attachmentPull);
        restoreIfMissing('jealousyLevel', s.jealousyLevel);
        restoreIfMissing('emotionalHurt', s.emotionalHurt);
        restoreIfMissing('relationshipFlags', s.relationshipFlags ? JSON.stringify(s.relationshipFlags) : null);
        restoreIfMissing('loveResistance', s.loveResistance);
        restoreIfMissing('moneyRefuseCount', s.moneyRefuseCount);
        restoreIfMissing('userDislikesMoney', s.userDislikesMoney);
        restoreIfMissing('coupleFeedDate', s.coupleFeedDate);
        restoreIfMissing('lastFeedPostAt', s.lastFeedPostAt);
      }

      // ── 合并类：无论新旧都合并 ──────────────────────────────

      // 已购商品：合并去重
      if (Array.isArray(s.purchasedItems)) {
        const local = JSON.parse(localStorage.getItem('purchasedItems') || '[]');
        const merged = [...new Set([...local, ...s.purchasedItems])];
        localStorage.setItem('purchasedItems', JSON.stringify(merged));
      }

      // 购买次数：取最大值（防止倒退）
      if (s.purchaseCounts && typeof s.purchaseCounts === 'object') {
        const local = JSON.parse(localStorage.getItem('purchaseCounts') || '{}');
        const merged = { ...local };
        Object.keys(s.purchaseCounts).forEach(k => {
          merged[k] = Math.max(merged[k] || 0, s.purchaseCounts[k] || 0);
        });
        localStorage.setItem('purchaseCounts', JSON.stringify(merged));
      }

      // 亲密商品触发记录：合并
      if (s.intimateTriggered && typeof s.intimateTriggered === 'object') {
        const local = JSON.parse(localStorage.getItem('intimateTriggered') || '{}');
        const merged = { ...s.intimateTriggered, ...local }; // 本地优先
        localStorage.setItem('intimateTriggered', JSON.stringify(merged));
      }

      // 交易记录：按id合并
      if (Array.isArray(s.transactions)) {
        const local = JSON.parse(localStorage.getItem('transactions') || '[]');
        const merged = [...local];
        s.transactions.forEach(ct => {
          const key = ct.id || (ct.name + '_' + ct.amount + '_' + (ct.time || ct.date || ''));
          if (!merged.find(lt => {
            const lk = lt.id || (lt.name + '_' + lt.amount + '_' + (lt.time || lt.date || ''));
            return lk === key;
          })) merged.push(ct);
        });
        merged.sort((a, b) => (b.time || b.date || '').localeCompare(a.time || a.date || ''));
        localStorage.setItem('transactions', JSON.stringify(merged.slice(0, 200)));
      }

      // 快递：按id合并，取进度更新的
      if (Array.isArray(s.deliveries)) {
        const local = JSON.parse(localStorage.getItem('deliveries') || '[]');
        const merged = [...local];
        s.deliveries.forEach(cd => {
          const idx = merged.findIndex(ld => ld.id === cd.id);
          if (idx === -1) {
            merged.push(cd);
          } else if (cd.currentStage > merged[idx].currentStage || cd.done) {
            merged[idx] = cd;
          }
        });
        localStorage.setItem('deliveries', JSON.stringify(merged.slice(0, 30)));
      }

      // 故事书/相册/朋友圈历史/快递历史：取更多的
      const mergeByLength = (key, arr) => {
        if (!Array.isArray(arr)) return;
        const local = JSON.parse(localStorage.getItem(key) || '[]');
        if (arr.length > local.length) localStorage.setItem(key, JSON.stringify(arr));
      };
      mergeByLength('storyBook', s.storyBook);
      mergeByLength('collections', s.collections);
      mergeByLength('coupleFeedHistory', s.coupleFeedHistory);
      mergeByLength('deliveryHistory', s.deliveryHistory);

      // 外卖历史：取更多的
      mergeByLength('takeoutHistory', s.takeoutHistory);

      // 外卖进行中订单：按id合并，本地有就用本地（进度更新）
      if (Array.isArray(s.takeoutOrders)) {
        const localTk = JSON.parse(localStorage.getItem('takeoutOrders') || '[]');
        const mergedTk = [...localTk];
        s.takeoutOrders.forEach(co => {
          if (!mergedTk.find(lo => lo.id === co.id)) mergedTk.push(co);
        });
        localStorage.setItem('takeoutOrders', JSON.stringify(mergedTk.slice(0, 10)));
      }

      // feedEventPool：合并去重
      if (Array.isArray(s.feedEventPool)) {
        const localPool = (typeof getFeedEventPool === 'function') ? getFeedEventPool() : [];
        const merged = [...s.feedEventPool, ...localPool];
        const seen = new Set();
        const deduped = merged.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
        if (typeof setFeedEventPool === 'function') setFeedEventPool(deduped.slice(0, 30));
      }
    }

    console.log('[cloud] 数据已加载');
    // 如果上次有未同步的本地数据，加载完立刻重新保存
    if (localStorage.getItem('cloudSavePending') === '1') {
      localStorage.removeItem('cloudSavePending');
      setTimeout(() => saveToCloud().catch(console.error), 3000);
    }
  } catch(e) {
    console.log('[cloud] 加载失败，使用本地数据', e);
  }
}
// 保存数据到云端（防抖，3秒内无新变化才存，保证最后一次也能存上）
let _saveTimer = null;
let _lastSyncTime = 0; // 仅记录上次saveToCloud执行时间，不再用于节流控制

// 本地状态变更时间戳——用于跟云端比较谁更新
function touchLocalState() {
  localStorage.setItem('localUpdatedAt', Date.now().toString());
  scheduleCloudSave();
}

function scheduleCloudSave(urgent = false) {
  if (_saveTimer) clearTimeout(_saveTimer);
  // 普通操作5秒防抖；urgent=true时2秒（发消息、充值等重要操作用）
  const delay = urgent ? 2000 : 5000;
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    saveToCloud().catch(console.error);
  }, delay);
}

// 写入锁：防止 saveToCloud 和 saveChatHistoryNow 并发写入互相覆盖
let _saveThrottleTimer = null;
let _savePending = false;
let _isSavingToCloud = false; // 写入锁：同一时间只允许一个完整saveToCloud在跑

// 聊天记录单独写入，绕过节流——每条消息成功后立刻调用
async function saveChatHistoryNow() {
  const sb = getSbClient();
  const userId = getSbUserId();
  if (!sb || !userId) return;
  try {
    const chatHistoryRaw = localStorage.getItem('chatHistory');
    if (!chatHistoryRaw) return;
    const chatHistoryData = JSON.parse(chatHistoryRaw)
      .filter(m => !m._system && !m._recalled)
      .slice(-300)
      .map(m => ({ role: m.role, content: m.content,
        ...(m._transfer ? { _transfer: m._transfer } : {}),
        ...(m._userTransfer ? { _userTransfer: m._userTransfer } : {}) }));
    if (chatHistoryData.length === 0) return;

    const now = new Date().toISOString();
    localStorage.setItem('chatUpdatedAt', now);

    await sb.from('user_data').upsert({
      user_id: userId,
      chat_history: chatHistoryData,
      chat_updated_at: now,
      updated_at: now,
    }, { onConflict: 'user_id' });
  } catch(e) {
    console.warn('[cloud] 聊天记录快速保存失败:', e);
  }
}

async function saveToCloud() {
  const sb = getSbClient();
  const userId = getSbUserId();
  if (!sb || !userId) return;

  // 写入锁：如果当前有完整saveToCloud在执行，等它完成后再调度一次
  if (_isSavingToCloud) {
    scheduleCloudSave(); // 重新调度，不丢数据
    return;
  }

  // 5秒节流：如果距上次写入不足5秒，等到5秒后再写（且只写最后一次）
  const now = Date.now();
  const sinceLastSave = now - _lastSyncTime;
  if (sinceLastSave < 5000 && _lastSyncTime > 0) {
    if (!_saveThrottleTimer) {
      _savePending = true;
      _saveThrottleTimer = setTimeout(async () => {
        _saveThrottleTimer = null;
        _savePending = false;
        await saveToCloud();
      }, 5000 - sinceLastSave);
    }
    return;
  }
  if (_saveThrottleTimer) {
    clearTimeout(_saveThrottleTimer);
    _saveThrottleTimer = null;
  }
  _lastSyncTime = now;
  _isSavingToCloud = true;
  try {
    const profile = {
      userName: localStorage.getItem('userName') || '',
      userBirthday: localStorage.getItem('userBirthday') || '',
      userZodiac: localStorage.getItem('userZodiac') || '',
      userMBTI: localStorage.getItem('userMBTI') || '',
      userCountry: localStorage.getItem('userCountry') || 'CN',
      userFavFood: localStorage.getItem('userFavFood') || '',
      userFavMusic: localStorage.getItem('userFavMusic') || '',
      userFavColor: localStorage.getItem('userFavColor') || '',
      userBio: localStorage.getItem('userBio') || '',
      userAvatarBase64: localStorage.getItem('userAvatarBase64') || '',
      coupleCoverBase64: localStorage.getItem('coupleCoverBase64') || '',
      marriageDate: localStorage.getItem('marriageDate') || '',
      ghostBirthday: localStorage.getItem('ghostBirthday') || '',
      ghostZodiac: localStorage.getItem('ghostZodiac') || '',
      ghostZodiacEn: localStorage.getItem('ghostZodiacEn') || '',
      coldWarMode: localStorage.getItem('coldWarMode') || 'false',
      metInPerson: localStorage.getItem('metInPerson') || 'false',
      meetType: localStorage.getItem('meetType') || '',
      botNickname: localStorage.getItem('botNickname') || '',
      marriageType: localStorage.getItem('marriageType') || 'established',
      ghostAvatarUrl: (() => { const u = localStorage.getItem('ghostAvatarUrl') || ''; return u.startsWith('data:') ? '' : u; })(),
      ghostHeight: localStorage.getItem('ghostHeight') || '',
      ghostWeight: localStorage.getItem('ghostWeight') || '',
      ghostBloodType: localStorage.getItem('ghostBloodType') || '',
      ghostHometown: localStorage.getItem('ghostHometown') || '',
      ghostUnlocked_birthday: localStorage.getItem('ghostUnlocked_birthday') || '',
      ghostUnlocked_zodiac: localStorage.getItem('ghostUnlocked_zodiac') || '',
      ghostUnlocked_height: localStorage.getItem('ghostUnlocked_height') || '',
      ghostUnlocked_weight: localStorage.getItem('ghostUnlocked_weight') || '',
      ghostUnlocked_blood_type: localStorage.getItem('ghostUnlocked_blood_type') || '',
      ghostUnlocked_hometown: localStorage.getItem('ghostUnlocked_hometown') || '',
      visitStreak: localStorage.getItem('visitStreak') || '0',
      vocabStreak: localStorage.getItem('vocabStreak') || '0',
      vocabLastDay: localStorage.getItem('vocabLastDay') || '',
      lastSalaryAmount: localStorage.getItem('lastSalaryAmount') || '',
      lastSalaryMonth: localStorage.getItem('lastSalaryMonth') || '',
      currentLocation: localStorage.getItem('currentLocation') || '',
      currentLocationReason: localStorage.getItem('currentLocationReason') || '',
      intimateMemory: localStorage.getItem('intimateMemory') || '',
      walletMigrated_v3: localStorage.getItem('walletMigrated_v3') || '',
      weddingGift_v1: localStorage.getItem('weddingGift_v1') || '',
      maintenanceComp_20260409: localStorage.getItem('maintenanceComp_20260409') || '',
      todayWorkKey: 'work_' + new Date().toDateString(),
      todayWorkData: localStorage.getItem('work_' + new Date().toDateString()) || '',
      // 签到记录：存最近60天的签到key + 本月里程碑计数
      checkinKeys: (() => {
        const keys = {};
        const now = new Date();
        for (let i = 0; i < 60; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          // 统一用 ISO 格式（2026-04-08），和 checkin.js 保持一致
          const iso = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
          const k = 'checkin_' + iso;
          if (localStorage.getItem(k)) keys[k] = '1';
        }
        return keys;
      })(),
      monthlyCheckinKey: 'monthlyCheckin_' + new Date().getFullYear() + '_' + (new Date().getMonth() + 1),
      monthlyCheckinCount: localStorage.getItem('monthlyCheckin_' + new Date().getFullYear() + '_' + (new Date().getMonth() + 1)) || '0',
    };
    const chatHistoryRaw = localStorage.getItem('chatHistory');
    const chatHistoryData = chatHistoryRaw
      ? JSON.parse(chatHistoryRaw)
          .filter(m => !m._system && !m._recalled)
          .slice(-300)
          .map(m => ({ role: m.role, content: m.content, ...(m._transfer ? {_transfer: m._transfer} : {}), ...(m._userTransfer ? {_userTransfer: m._userTransfer} : {}) }))
      : [];
    const stateSnapshot = {
      trustHeat: getTrustHeat(),
      attachmentPull: getAttachmentPull(),
      jealousyLevel: getJealousyLevel(),
      globalTurnCount: _globalTurnCount,
      pendingReversePackages: getPendingReversePackages(),
      emotionalHurt: parseInt(localStorage.getItem('emotionalHurt') || '0'),
      lastReversePackageTurn: getLastReversePackageTurn(),
      relationshipFlags: getRelationshipFlags(),
      // 钱包和快递数据
      deliveries: JSON.parse(localStorage.getItem('deliveries') || '[]').slice(0, 30),
      transactions: JSON.parse(localStorage.getItem('transactions') || '[]').slice(0, 150), // 提升到150条，防止钱包记录丢失
      purchasedItems: JSON.parse(localStorage.getItem('purchasedItems') || '[]'),
      weeklyGiven: getWeeklyGiven(),
      // 故事书、相册、朋友圈
      // 故事书、相册、朋友圈——只存最近10条，减小体积
      storyBook: JSON.parse(localStorage.getItem('storyBook') || '[]').slice(0, 10),
      collections: JSON.parse(localStorage.getItem('collections') || '[]').slice(0, 50),
      coupleFeedHistory: JSON.parse(localStorage.getItem('coupleFeedHistory') || '[]').slice(0, 25),
      coupleFeedDate: localStorage.getItem('coupleFeedDate') || '',
      organicFeedCount: localStorage.getItem('organicFeedCount_' + getTodayDateStr()) || '0',
      organicFeedCountKey: 'organicFeedCount_' + getTodayDateStr(),
      feedEventPool: (typeof getFeedEventPool === 'function' ? getFeedEventPool() : []).filter(e => !e.consumed).slice(0, 20),
      lastFeedPostAt: localStorage.getItem('lastFeedPostAt') || '',
      deliveryHistory: JSON.parse(localStorage.getItem('deliveryHistory') || '[]').slice(0, 50),
      takeoutOrders:   JSON.parse(localStorage.getItem('takeoutOrders')   || '[]').slice(0, 10),
      takeoutHistory:  JSON.parse(localStorage.getItem('takeoutHistory')  || '[]').slice(0, 50),
      marketTriggered: JSON.parse(localStorage.getItem('marketTriggered') || '{}'),
      purchaseCounts: JSON.parse(localStorage.getItem('purchaseCounts') || '{}'),
      intimateTriggered: JSON.parse(localStorage.getItem('intimateTriggered') || '{}'),
      // 状态标记
      coldWarStart: localStorage.getItem('coldWarStart') || '',
      pendingGhostApology: localStorage.getItem('pendingGhostApology') || '',
      pendingSeriousTalk: localStorage.getItem('pendingSeriousTalk') || '',
      pendingMakeupMoney: localStorage.getItem('pendingMakeupMoney') || '',
      pendingColdWarEndStory: localStorage.getItem('pendingColdWarEndStory') || '',
      loveResistance: localStorage.getItem('loveResistance') || '0',
      loveResistanceLastDecay: localStorage.getItem('loveResistanceLastDecay') || '',
      moneyRefuseCount: localStorage.getItem('moneyRefuseCount') || '0',
      userDislikesMoney: localStorage.getItem('userDislikesMoney') || '',
      sassyPost: localStorage.getItem('sassyPost') || '',
    };
    const nowIso = new Date().toISOString();
    const upsertData = {
      user_id: userId,
      mood: parseInt(localStorage.getItem('moodLevel') || '7'),
      affection: parseInt(localStorage.getItem('affection') || '50'),
      long_term_memory: localStorage.getItem('longTermMemory') || '',
      profile: profile,
      state_snapshot: stateSnapshot,
      updated_at: nowIso,
    };
    // 只在有内容时才存，防止空值覆盖云端已有数据
    if (chatHistoryData.length > 0) upsertData.chat_history = chatHistoryData;
    // 钱包余额从transactions实时计算，确保与本地显示一致
    const _txs = JSON.parse(localStorage.getItem('transactions') || '[]');
    const _walletCalc = Math.max(0, _txs.reduce((s, t) => s + (t.amount || 0), 0));
    const walletVal = _walletCalc || parseFloat(localStorage.getItem('wallet') || '0');
    if (walletVal > 0) upsertData.balance = walletVal;

    // 重试一次，防止偶发网络问题导致数据丢失
    let saveOk = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { error: upsertErr } = await sb.from('user_data').upsert(upsertData, { onConflict: 'user_id' });
        if (!upsertErr) { saveOk = true; break; }
        console.warn('[cloud] 保存失败第', attempt+1, '次:', upsertErr.message);
        if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
      } catch(retryErr) {
        console.warn('[cloud] 保存异常第', attempt+1, '次:', retryErr.message);
        if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
      }
    }
    if (saveOk) {
      localStorage.setItem('chatUpdatedAt', new Date(nowIso).getTime());
      localStorage.setItem('localUpdatedAt', Date.now().toString());
      console.log('[cloud] 保存成功');
    } else {
      console.error('[cloud] 保存最终失败，数据暂存本地');
      localStorage.setItem('cloudSavePending', '1');
    }
  } catch(e) {
    console.error('[cloud] 保存异常:', e);
    localStorage.setItem('cloudSavePending', '1');
  } finally {
    _isSavingToCloud = false; // 无论成功失败都释放锁
  }
}

