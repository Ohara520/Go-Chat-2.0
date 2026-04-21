// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 职业系统 — career.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ===== 职业定义 =====

const CAREER_DATA = {
  chef: {
    id: 'chef',
    icon: '👩‍🍳',
    name: '厨师',
    titles: ['洗碗工','帮厨','三厨','二厨','主厨','高级主厨','行政主厨','餐厅主理人','星级主厨','米其林主厨'],
    salary: [80, 150, 250, 400, 600, 850, 1100, 1400, 1700, 2000],
    perkDesc: '外卖打折 + 每日做饭收入',
    perkDetail: level => {
      const income = [8, 12, 16, 20, 25, 30, 33, 37, 42, 45][level - 1] || 8;
      return `外卖 ${10 + level * 5}% 折扣${level >= 3 ? ' + 免配送费' : ''} + 每日 £${income}`;
    },
    speedMultiplier: 1,  // 正常升级速度
  },
  entertainer: {
    id: 'entertainer',
    icon: '🎤',
    name: '艺人',
    titles: ['练习生','伴舞','替补歌手','驻场歌手','独立歌手','签约艺人','人气艺人','一线艺人','超级巨星','天王巨星'],
    salary: [90, 180, 320, 520, 800, 1200, 1700, 2400, 3200, 4000],
    perkDesc: '代言费 + 每周演出 + 快递加速',
    perkDetail: level => {
      const endorsement = [0, 0, 10, 15, 25, 35, 50, 70, 90, 120][level - 1] || 0;
      const showMax = [50, 70, 100, 150, 200, 300, 450, 600, 700, 800][level - 1] || 50;
      return `${endorsement > 0 ? `代言 £${endorsement}/天 + ` : ''}演出 ≤£${showMax}/周 + 快递加速${10 + level * 5}%`;
    },
    speedMultiplier: 1,
  },
  florist: {
    id: 'florist',
    icon: '🌸',
    name: '花艺师',
    titles: ['店员','花艺学徒','初级花艺师','花艺师','高级花艺师','花艺设计师','花店店长','区域经理','品牌总监','连锁老板'],
    salary: [70, 120, 200, 320, 480, 650, 850, 1100, 1350, 1600],
    perkDesc: '商店打折 + 免运费 + 送礼加好感',
    perkDetail: level => `商店 ${10 + level * 5}% 折扣${level >= 3 ? ' + 免运费' : ' + Lv.3解锁免运费'}${level >= 5 ? ' + 送礼好感度×1.5' : ''}`,
    speedMultiplier: 1,
  },
  barista: {
    id: 'barista',
    icon: '☕',
    name: '咖啡师',
    titles: ['收银员','清洁工','学徒','初级咖啡师','咖啡师','高级咖啡师','店长','区域经理','培训总监','品牌主理人'],
    salary: [70, 130, 210, 340, 500, 700, 900, 1200, 1500, 1800],
    perkDesc: '签到双倍奖励',
    perkDetail: level => `签到奖励 ×${(1 + level * 0.1).toFixed(1)}`,
    speedMultiplier: 1,
  },
  programmer: {
    id: 'programmer',
    icon: '💻',
    name: '程序员',
    titles: ['实习生','初级开发','开发工程师','高级工程师','资深工程师','技术专家','架构师','技术经理','技术副总裁','技术总监'],
    salary: [100, 180, 300, 500, 750, 1050, 1400, 1800, 2400, 3000],
    perkDesc: '每日被动收入',
    perkDetail: level => `每天自动进账 £${5 + level * 5}`,
    speedMultiplier: 1,
  },
  finance: {
    id: 'finance',
    icon: '💰',
    name: '金融师',
    titles: ['柜员','客户专员','理财顾问','高级顾问','投资分析师','基金经理','高级经理','投资副总裁','合伙人','投资总监'],
    salary: [120, 220, 400, 650, 1000, 1500, 2100, 2800, 3800, 5000],
    perkDesc: 'Ghost Card 上限 +1000',
    perkDetail: level => `Ghost Card 上限 +${100 + level * 100}`,
    speedMultiplier: 1.5,  // 升级慢 1.5 倍
  },
  streamer: {
    id: 'streamer',
    icon: '🎙️',
    name: '主播',
    titles: ['小透明','新人主播','百粉主播','千粉主播','万粉主播','小有名气','人气主播','头部主播','超级主播','顶流主播'],
    salary: [50, 100, 180, 300, 480, 700, 1000, 1500, 2200, 3500],
    perkDesc: '粉丝随机打赏',
    perkDetail: level => {
      const fans = [10, 50, 200, 800, 3000, 8000, 20000, 80000, 300000, 1000000][level - 1] || 10;
      return `粉丝 ${fans >= 10000 ? (fans/10000)+'万' : fans}人 · 每日随机打赏`;
    },
    speedMultiplier: 1,
  },
  writer: {
    id: 'writer',
    icon: '✍️',
    name: '作家',
    titles: ['自由撰稿人','专栏写手','签约作者','小说家','畅销作者','知名作家','大神作者','文学奖提名','文学奖得主','畅销作家'],
    salary: [60, 110, 190, 320, 500, 720, 1000, 1400, 1900, 2500],
    perkDesc: '每日额外消息条数',
    perkDetail: level => `每天额外 +${Math.ceil(level / 2)} 条消息`,
    speedMultiplier: 1,
  },
};

// ===== 升级天数表 =====
// 正常速度：从L1升到L2要3天，L2到L3要4天…
const BASE_LEVEL_DAYS = [0, 3, 7, 14, 25, 40, 60, 90, 120, 150];
// 金融师 ×1.5：                [0, 5, 11, 21, 38, 60, 90, 135, 180, 225]

function getLevelDays(careerType) {
  const multiplier = CAREER_DATA[careerType]?.speedMultiplier || 1;
  return BASE_LEVEL_DAYS.map(d => Math.round(d * multiplier));
}

// ===== 核心函数 =====

function getCareer() {
  return localStorage.getItem('careerType') || '';
}

function getCareerLevel() {
  return parseInt(localStorage.getItem('careerLevel') || '1');
}

function getCareerStartDate() {
  return localStorage.getItem('careerStartDate') || '';
}

function getCareerDaysWorked() {
  const start = getCareerStartDate();
  if (!start) return 0;
  const diff = Date.now() - new Date(start).getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function getCareerInfo() {
  const type = getCareer();
  if (!type || !CAREER_DATA[type]) return null;
  const data = CAREER_DATA[type];
  const level = getCareerLevel();
  return {
    ...data,
    level,
    title: data.titles[level - 1] || data.titles[0],
    currentSalary: data.salary[level - 1] || data.salary[0],
    daysWorked: getCareerDaysWorked(),
    perk: data.perkDetail(level),
  };
}

// ===== 选择/切换职业 =====

function chooseCareer(careerType) {
  if (!CAREER_DATA[careerType]) return false;
  const oldCareer = getCareer();

  // 已有职业时：检查30天冷却期
  if (oldCareer) {
    const lastSwitch = parseInt(localStorage.getItem('careerLastSwitch') || '0');
    const daysSinceSwitch = (Date.now() - lastSwitch) / (24 * 60 * 60 * 1000);
    if (lastSwitch > 0 && daysSinceSwitch < 30) {
      const daysLeft = Math.ceil(30 - daysSinceSwitch);
      if (typeof _showCareerNotification === 'function') {
        _showCareerNotification(`⏳ 转行冷却中，还需等待 ${daysLeft} 天`);
      }
      return false;
    }
  }

  // 切换职业 → 等级清零
  localStorage.setItem('careerType', careerType);
  localStorage.setItem('careerLevel', '1');
  localStorage.setItem('careerStartDate', new Date().toISOString().split('T')[0]);
  localStorage.setItem('careerLastSwitch', Date.now().toString());
  localStorage.removeItem('careerLastSalaryMonth');
  localStorage.removeItem('streamerTipDate');
  localStorage.removeItem('programmerIncomeDate');
  localStorage.removeItem('writerBonusDate');

  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();

  return true;
}

// ===== 自动升级检查 =====

function checkCareerLevelUp() {
  const type = getCareer();
  if (!type) return false;

  const currentLevel = getCareerLevel();
  if (currentLevel >= 10) return false;

  const days = getCareerDaysWorked();
  const levelDays = getLevelDays(type);

  let newLevel = 1;
  for (let i = 9; i >= 0; i--) {
    if (days >= levelDays[i]) {
      newLevel = i + 1;
      break;
    }
  }

  if (newLevel > currentLevel) {
    localStorage.setItem('careerLevel', newLevel.toString());
    if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
    return { oldLevel: currentLevel, newLevel, career: CAREER_DATA[type] };
  }
  return false;
}

// ===== 工资发放（每月10号）=====

function checkCareerSalary() {
  const type = getCareer();
  if (!type) return;

  const today = new Date();
  if (today.getDate() !== 10) return;

  const monthKey = today.getFullYear() + '_' + (today.getMonth() + 1);
  if (localStorage.getItem('careerLastSalaryMonth') === monthKey) return;

  const info = getCareerInfo();
  if (!info) return;

  const salary = info.currentSalary;

  // 发工资
  if (typeof setBalance === 'function' && typeof getBalance === 'function') {
    setBalance(getBalance() + salary);
  }
  if (typeof addTransaction === 'function') {
    addTransaction({
      icon: info.icon,
      name: `${info.name}工资 · ${info.title}`,
      amount: salary,
    });
  }

  localStorage.setItem('careerLastSalaryMonth', monthKey);
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();

  // 显示通知
  _showCareerNotification(`💰 发薪日！${info.title}月薪 £${salary} 已到账`);

  return salary;
}

// ===== 主播打赏系统 =====

function checkStreamerTip() {
  const type = getCareer();
  if (type !== 'streamer') return 0;

  const today = new Date().toISOString().split('T')[0];
  if (localStorage.getItem('streamerTipDate') === today) return 0;

  const level = getCareerLevel();

  // 打赏概率：L1 50% → L10 95%
  const tipChance = 0.45 + level * 0.05;
  // 打赏范围（高等级大幅提升）
  const tipMin = [0, 2, 5, 8, 15, 25, 35, 50, 70, 80][level - 1] || 0;
  const tipMax = [8, 15, 30, 50, 80, 120, 180, 250, 350, 500][level - 1] || 8;

  let totalTip = 0;

  // 普通打赏
  if (Math.random() < tipChance) {
    totalTip = Math.floor(Math.random() * (tipMax - tipMin + 1)) + tipMin;
  }

  // 大哥刷火箭（5% 概率）
  const rocketChance = 0.05;
  let rocket = false;
  if (Math.random() < rocketChance) {
    const rocketAmount = [20, 30, 50, 80, 120, 180, 250, 350, 500, 800][level - 1] || 20;
    totalTip += rocketAmount;
    rocket = true;
  }

  // 超级大火箭（1% 概率，Lv7+ 才有，最高 £1000）
  let megaRocket = false;
  if (level >= 7 && Math.random() < 0.01) {
    const megaAmount = [0, 0, 0, 0, 0, 0, 500, 600, 800, 1000][level - 1] || 500;
    totalTip += megaAmount;
    megaRocket = true;
    rocket = true;
  }

  if (totalTip > 0) {
    // 根据金额选择礼物名称
    let giftName = '棒棒糖';
    let giftIcon = '🍭';
    if (totalTip >= 200) { giftName = '火箭'; giftIcon = '🚀'; }
    else if (totalTip >= 100) { giftName = '跑车'; giftIcon = '🏎️'; }
    else if (totalTip >= 50) { giftName = '皇冠'; giftIcon = '👑'; }
    else if (totalTip >= 20) { giftName = '小星星'; giftIcon = '⭐'; }
    else if (totalTip >= 10) { giftName = '玫瑰花'; giftIcon = '🌹'; }
    else { giftName = '棒棒糖'; giftIcon = '🍭'; }

    if (typeof setBalance === 'function' && typeof getBalance === 'function') {
      setBalance(getBalance() + totalTip);
    }
    if (typeof addTransaction === 'function') {
      addTransaction({
        icon: megaRocket ? '🚀' : giftIcon,
        name: megaRocket ? '超级大火箭!!!' : (rocket ? `大哥刷了${giftName}` : `粉丝送了${giftName}`),
        amount: totalTip,
      });
    }
    if (rocket) {
      _showCareerNotification(`${megaRocket ? '🚀🚀🚀' : giftIcon} ${megaRocket ? '超级大火箭！！！' : `大哥刷了${giftName}`} +£${totalTip}`);
    } else {
      _showCareerNotification(`${giftIcon} 今日直播收入 £${totalTip}`);
    }
  }

  localStorage.setItem('streamerTipDate', today);
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
  return totalTip;
}

// ===== 程序员被动收入 =====

function checkProgrammerIncome() {
  const type = getCareer();
  if (type !== 'programmer') return 0;

  const today = new Date().toISOString().split('T')[0];
  if (localStorage.getItem('programmerIncomeDate') === today) return 0;

  const level = getCareerLevel();
  const income = 5 + level * 5; // L1: £10, L10: £55

  if (typeof setBalance === 'function' && typeof getBalance === 'function') {
    setBalance(getBalance() + income);
  }
  if (typeof addTransaction === 'function') {
    addTransaction({ icon: '💻', name: '接单收入', amount: income });
  }

  localStorage.setItem('programmerIncomeDate', today);
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
  _showCareerNotification(`💻 今日接单收入 £${income}`);
  return income;
}

// ===== 厨师被动收入 =====

function checkChefIncome() {
  const type = getCareer();
  if (type !== 'chef') return 0;

  const today = new Date().toISOString().split('T')[0];
  if (localStorage.getItem('chefIncomeDate') === today) return 0;

  const level = getCareerLevel();
  const income = [8, 12, 16, 20, 25, 30, 33, 37, 42, 45][level - 1] || 8;
  const jobName = ['摆摊卖煎饼', '食堂帮厨', '私房菜接单', '私房菜接单', '私房菜接单',
    '餐厅值班', '餐厅值班', '主厨接单', '主厨接单', '米其林接单'][level - 1] || '摆摊';

  if (typeof setBalance === 'function' && typeof getBalance === 'function') {
    setBalance(getBalance() + income);
  }
  if (typeof addTransaction === 'function') {
    addTransaction({ icon: '👩‍🍳', name: jobName, amount: income });
  }

  localStorage.setItem('chefIncomeDate', today);
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
  _showCareerNotification(`👩‍🍳 ${jobName}收入 £${income}`);
  return income;
}

// ===== 福利查询（供其他模块调用）=====

// 外卖折扣（厨师）
function getCareerTakeoutDiscount() {
  if (getCareer() !== 'chef') return 0;
  const level = getCareerLevel();
  return 10 + level * 5; // L1: 15%, L10: 60%
}

// 外卖免配送费（厨师 L3+）
function isCareerFreeDeliveryTakeout() {
  return getCareer() === 'chef' && getCareerLevel() >= 3;
}

// 免运费（花艺师 L3+）
function isCareerFreeShipping() {
  return getCareer() === 'florist' && getCareerLevel() >= 3;
}

// 商店折扣（花艺师）
function getCareerShopDiscount() {
  if (getCareer() !== 'florist') return 0;
  return 10 + getCareerLevel() * 5; // L1: 15%, L10: 60%
}

// 快递加速（艺人）— 明星效应，快递优先配送
function getCareerDeliverySpeed() {
  if (getCareer() !== 'entertainer') return 0;
  return 10 + getCareerLevel() * 5; // L1: 15%, L10: 60%
}

// 艺人每日代言费（Lv3+）
function checkEntertainerEndorsement() {
  const type = getCareer();
  if (type !== 'entertainer') return 0;

  const today = new Date().toISOString().split('T')[0];
  if (localStorage.getItem('entertainerEndorsementDate') === today) return 0;

  const level = getCareerLevel();
  const income = [0, 0, 10, 15, 25, 35, 50, 70, 90, 120][level - 1] || 0;
  if (income <= 0) return 0;

  if (typeof setBalance === 'function' && typeof getBalance === 'function') {
    setBalance(getBalance() + income);
  }
  if (typeof addTransaction === 'function') {
    addTransaction({ icon: '🎤', name: '代言费', amount: income });
  }

  localStorage.setItem('entertainerEndorsementDate', today);
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
  _showCareerNotification(`🎤 今日代言费 £${income}`);
  return income;
}

// ===== 艺人每周演出 =====

function checkEntertainerShow() {
  const type = getCareer();
  if (type !== 'entertainer') return 0;

  // 7天内只能触发一次
  const lastShow = parseInt(localStorage.getItem('entertainerLastShow') || '0');
  if (lastShow && Date.now() - lastShow < 7 * 24 * 3600 * 1000) return 0;

  // 每天 15% 概率触发（一周内大概率至少触发一次）
  if (Math.random() > 0.15) return 0;

  const level = getCareerLevel();
  const showMin = [30, 40, 60, 80, 100, 150, 200, 300, 400, 500][level - 1] || 30;
  const showMax = [50, 70, 100, 150, 200, 300, 450, 600, 700, 800][level - 1] || 50;
  let income = Math.floor(Math.random() * (showMax - showMin + 1)) + showMin;

  const showNames = ['商场暖场', '酒吧驻唱', '校园演出', '商业演出', '音乐节', '品牌活动', '跨年演出', '巡回演出', '演唱会', '巨星演唱会'];
  let showName = showNames[level - 1] || '演出';

  // 5% 概率爆红事件
  let viral = false;
  if (Math.random() < 0.05) {
    const viralBonus = [100, 150, 200, 300, 500, 700, 900, 1200, 1500, 2000][level - 1] || 100;
    income += viralBonus;
    viral = true;
  }

  if (typeof setBalance === 'function' && typeof getBalance === 'function') {
    setBalance(getBalance() + income);
  }
  if (typeof addTransaction === 'function') {
    addTransaction({
      icon: viral ? '🌟' : '🎤',
      name: viral ? `爆红！${showName}` : showName,
      amount: income,
    });
  }

  localStorage.setItem('entertainerLastShow', Date.now().toString());
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();

  if (viral) {
    _showCareerNotification(`🌟🌟🌟 爆红了！${showName}收入 £${income}！`);
  } else {
    _showCareerNotification(`🎤 ${showName}收入 £${income}`);
  }
  return income;
}

// 签到倍率（咖啡师）
function getCareerCheckinMultiplier() {
  if (getCareer() !== 'barista') return 1;
  return 1 + getCareerLevel() * 0.1; // L1: 1.1x, L10: 2.0x
}

// Ghost Card 上限加成（金融师）
function getCareerGhostCardBonus() {
  if (getCareer() !== 'finance') return 0;
  return 100 + getCareerLevel() * 100; // L1: +200, L10: +1100
}

// 作家每日额外条数
function checkWriterBonus() {
  const type = getCareer();
  if (type !== 'writer') return 0;

  const today = new Date().toISOString().split('T')[0];
  if (localStorage.getItem('writerBonusDate') === today) return 0;

  const level = getCareerLevel();
  const bonus = Math.ceil(level / 2); // L1: 1, L5: 3, L10: 5

  if (typeof applyCheckinBonusMessages === 'function') {
    applyCheckinBonusMessages(bonus);
  }

  localStorage.setItem('writerBonusDate', today);
  _showCareerNotification(`✍️ 今日稿费到账：+${bonus}条消息`);
  return bonus;
}

// ===== 通知弹窗 =====

function _showCareerNotification(text) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:#4a8c3f;color:white;padding:10px 20px;border-radius:20px;z-index:99999;font-size:14px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.5s;white-space:nowrap;';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }, 3000);
}

// ===== 升级通知 =====

function _showLevelUpNotification(result) {
  const data = result.career;
  const newTitle = data.titles[result.newLevel - 1];
  const newSalary = data.salary[result.newLevel - 1];

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:white;border-radius:16px;padding:30px;text-align:center;max-width:280px;box-shadow:0 8px 30px rgba(0,0,0,0.2);">
      <div style="font-size:48px;margin-bottom:10px;">🎉</div>
      <div style="font-size:18px;font-weight:700;color:#2d6028;margin-bottom:6px;">升职啦！</div>
      <div style="font-size:14px;color:#666;margin-bottom:12px;">
        ${data.icon} ${data.titles[result.oldLevel - 1]} → <strong>${newTitle}</strong>
      </div>
      <div style="font-size:13px;color:#888;margin-bottom:16px;">月薪 £${newSalary}</div>
      <button onclick="this.closest('div[style*=fixed]').remove()" 
        style="background:#5a9a46;color:white;border:none;padding:8px 30px;border-radius:20px;font-size:14px;cursor:pointer;">
        好的！
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
}

// ===== 职业选择页面 =====

function renderCareerSelection() {
  const container = document.getElementById('careerSelectionContainer');
  if (!container) return;

  const current = getCareer();

  let html = '<div style="padding:16px;">';

  if (current && CAREER_DATA[current]) {
    const info = getCareerInfo();
    const levelDays = getLevelDays(current);
    const nextLevelDays = info.level < 10 ? levelDays[info.level] : null;
    const progressPct = nextLevelDays ? Math.min(100, (info.daysWorked / nextLevelDays) * 100) : 100;

    html += `
      <div style="background:linear-gradient(135deg,#e8f5e2,#f0f7ec);border-radius:14px;padding:18px;margin-bottom:20px;box-shadow:0 2px 8px rgba(90,154,70,0.15);">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <span style="font-size:36px;">${info.icon}</span>
          <div>
            <div style="font-size:16px;font-weight:700;color:#2d6028;">${info.title}</div>
            <div style="font-size:12px;color:#888;">Lv.${info.level} · ${info.name} · 已工作${info.daysWorked}天</div>
          </div>
        </div>
        <div style="font-size:13px;color:#555;margin-bottom:8px;">
          💰 月薪 £${info.currentSalary}（每月10号发放）
        </div>
        <div style="font-size:13px;color:#555;margin-bottom:12px;">
          🎁 ${info.perk}
        </div>
        ${info.level < 10 ? `
          <div style="font-size:12px;color:#999;margin-bottom:4px;">
            升级进度：${info.daysWorked} / ${nextLevelDays} 天
          </div>
          <div style="background:rgba(90,154,70,0.15);border-radius:4px;height:6px;overflow:hidden;">
            <div style="width:${progressPct}%;height:100%;background:linear-gradient(90deg,#5a9a46,#7dba5a);border-radius:4px;transition:width 0.3s;"></div>
          </div>
        ` : `<div style="font-size:12px;color:#5a9a46;font-weight:600;">✨ 满级！</div>`}
        ${(() => {
          const _ls = parseInt(localStorage.getItem('careerLastSwitch') || '0');
          const _ds = _ls > 0 ? (Date.now() - _ls) / (86400000) : 999;
          const _ok = _ds >= 30;
          const _dl = Math.ceil(30 - _ds);
          return `<button onclick="${_ok ? `_confirmSwitchCareer()` : ``}" style="margin-top:14px;background:none;border:1px solid #ccc;color:#999;padding:6px 16px;border-radius:16px;font-size:12px;cursor:${_ok ? 'pointer' : 'default'};opacity:${_ok ? '1' : '0.5'};">${_ok ? '转行（等级清零）' : `转行冷却中（${_dl}天后）`}</button>`;
        })()}
      </div>
    `;
  }

  html += `<div style="font-size:15px;font-weight:700;color:#2d6028;margin-bottom:12px;">${current ? '其他职业' : '选择你的职业'}</div>`;
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';

  Object.values(CAREER_DATA).forEach(career => {
    const isCurrent = career.id === current;
    const perkLv1 = career.perkDetail(1);
    const perkLv10 = career.perkDetail(10);
    html += `
      <div onclick="${isCurrent ? '' : `_selectCareer('${career.id}')`}" 
        style="background:${isCurrent ? '#f0f7ec' : 'white'};border:1px solid ${isCurrent ? '#5a9a46' : '#e8e8e8'};border-radius:12px;padding:14px;cursor:${isCurrent ? 'default' : 'pointer'};opacity:${isCurrent ? '0.6' : '1'};transition:transform 0.15s;">
        <div style="font-size:28px;margin-bottom:6px;">${career.icon}</div>
        <div style="font-size:14px;font-weight:600;color:#333;margin-bottom:3px;">${career.name}</div>
        <div style="font-size:11px;color:#999;margin-bottom:6px;">${career.titles[0]} → ${career.titles[9]}</div>
        <div style="font-size:11px;color:#5a9a46;margin-bottom:2px;">🎁 ${career.perkDesc}</div>
        <div style="font-size:10px;color:#78a86a;margin-bottom:3px;">Lv1: ${perkLv1}</div>
        <div style="font-size:10px;color:#78a86a;margin-bottom:3px;">Lv10: ${perkLv10}</div>
        <div style="font-size:11px;color:#888;margin-top:3px;">💰 £${career.salary[0]} → £${career.salary[9]}/月</div>
        ${career.speedMultiplier > 1 ? `<div style="font-size:10px;color:#d4880f;margin-top:3px;">⚠️ 升级较慢</div>` : ''}
        ${isCurrent ? '<div style="font-size:10px;color:#5a9a46;margin-top:3px;">✅ 当前职业</div>' : ''}
      </div>
    `;
  });

  html += '</div></div>';
  container.innerHTML = html;
}

function _selectCareer(id) {
  const career = CAREER_DATA[id];
  if (!career) return;
  const current = getCareer();

  if (current) {
    if (!confirm(`确定要转行做${career.name}吗？当前职业等级将清零！`)) return;
  }

  chooseCareer(id);
  renderCareerSelection();
  if (typeof renderWallet === 'function') renderWallet();
  _showCareerNotification(`${career.icon} 成为了${career.titles[0]}！加油升级吧！`);
}

function _confirmSwitchCareer() {
  const container = document.getElementById('careerSelectionContainer');
  if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
}

// ===== 每日检查（在 app.js 的 window.onload 里调用）=====

function dailyCareerCheck() {
  if (!getCareer()) return;

  // 1. 检查升级
  const levelUp = checkCareerLevelUp();
  if (levelUp) _showLevelUpNotification(levelUp);

  // 2. 检查工资
  checkCareerSalary();

  // 3. 程序员被动收入
  checkProgrammerIncome();

  // 4. 厨师被动收入
  checkChefIncome();

  // 5. 主播打赏
  checkStreamerTip();

  // 6. 艺人代言费
  checkEntertainerEndorsement();

  // 7. 艺人每周演出
  checkEntertainerShow();

  // 8. 作家每日额外条数
  checkWriterBonus();
}

// ===== 升级进度文字（供 profile 等模块显示）=====

function getCareerSummary() {
  const info = getCareerInfo();
  if (!info) return '暂未选择职业';
  return `${info.icon} ${info.title}（Lv.${info.level}）· 月薪 £${info.currentSalary}`;
}
