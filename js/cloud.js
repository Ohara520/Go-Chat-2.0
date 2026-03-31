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
    const cloudIsNewer = cloudTs > localTs;

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
        const localContents = new Set(localHistory.map(m => m.role + '|' + (m.content || '').slice(0, 50)));
        const toAdd = data.chat_history.filter(m => !localContents.has(m.role + '|' + (m.content || '').slice(0, 50)));
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
      setIfMissing('ghostBirthday', p.ghostBirthday);
      setIfMissing('ghostZodiac', p.ghostZodiac);
      setIfMissing('meetType', p.meetType);
      setIfMissing('botNickname', p.botNickname);
      // 用户设置：云端更新才覆盖
      setIfNewer('userBirthday', p.userBirthday);
      setIfNewer('userZodiac', p.userZodiac);
      setIfNewer('userMBTI', p.userMBTI);
      setIfNewer('userCountry', p.userCountry);
      setIfNewer('userFavFood', p.userFavFood);
      setIfNewer('userFavMusic', p.userFavMusic);
      setIfNewer('userFavColor', p.userFavColor);
      setIfNewer('userBio', p.userBio);
      setIfNewer('metInPerson', p.metInPerson != null ? String(p.metInPerson) : null);
      setIfNewer('visitStreak', p.visitStreak);
      setIfNewer('vocabStreak', p.vocabStreak);
      setIfNewer('vocabLastDay', p.vocabLastDay);
      setIfNewer('lastSalaryAmount', p.lastSalaryAmount);
      setIfNewer('lastSalaryMonth', p.lastSalaryMonth);
      // 头像：有就用云端（换设备必须恢复）
      if (p.userAvatarBase64 && !localStorage.getItem('userAvatarBase64')) {
        localStorage.setItem('userAvatarBase64', p.userAvatarBase64);
      }
      // 冷战状态：取最新
      if (p.coldWarMode != null && cloudIsNewer) localStorage.setItem('coldWarMode', String(p.coldWarMode));
      // 婚姻模式和Ghost档案
      setIfMissing('marriageType', p.marriageType);
      setIfMissing('ghostAvatarUrl', p.ghostAvatarUrl);
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

    // ── 4. 余额：本地没有才从云端恢复，有就保留本地 ──────────
    if (data.balance != null && data.balance > 0 && !localStorage.getItem('wallet')) {
      localStorage.setItem('wallet', parseFloat(data.balance).toFixed(2));
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

      // feedEventPool：合并去重
      if (Array.isArray(s.feedEventPool)) {
        const localPool = (typeof getFeedEventPool === 'function') ? getFeedEventPool() : [];
        const merged = [...s.feedEventPool, ...localPool];
        const seen = new Set();
        const deduped = merged.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
        if (typeof setFeedEventPool === 'function') setFeedEventPool(deduped.slice(0, 30));
      }
    }

    console.log('云端数据已加载');
  } catch(e) {
    console.log('云端加载失败，使用本地数据', e);
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

function scheduleCloudSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    saveToCloud().catch(console.error);
  }, 3000);
}

async function saveToCloud() {
  const sb = getSbClient();
  const userId = getSbUserId();
  if (!sb || !userId) return;
  const now = Date.now();
  _lastSyncTime = now;
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
      marriageDate: localStorage.getItem('marriageDate') || '',
      ghostBirthday: localStorage.getItem('ghostBirthday') || '',
      ghostZodiac: localStorage.getItem('ghostZodiac') || '',
      coldWarMode: localStorage.getItem('coldWarMode') || 'false',
      metInPerson: localStorage.getItem('metInPerson') || 'false',
      meetType: localStorage.getItem('meetType') || '',
      botNickname: localStorage.getItem('botNickname') || '',
      marriageType: localStorage.getItem('marriageType') || 'established',
      ghostAvatarUrl: localStorage.getItem('ghostAvatarUrl') || '',
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
      transactions: JSON.parse(localStorage.getItem('transactions') || '[]').slice(0, 50),
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
      marketTriggered: JSON.parse(localStorage.getItem('marketTriggered') || '{}'),
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
    const walletVal = parseFloat(localStorage.getItem('wallet') || '0');
    if (walletVal > 0) upsertData.balance = walletVal;

    await sb.from('user_data').upsert(upsertData, { onConflict: 'user_id' });
    localStorage.setItem('chatUpdatedAt', new Date(nowIso).getTime());
  } catch(e) {
    console.log('云端保存失败', e);
  }
}

