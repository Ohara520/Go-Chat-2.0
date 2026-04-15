// ===================================================
// takeout.js — 外卖系统
//
// 职责：
// - TAKEOUT_MENUS         各城市菜单（11个城市）
// - getTakeoutFee()       时段配送费
// - openTakeoutShop()     主界面（点单/配送中/小票）
// - addTakeoutOrder()     下单（扣余额+云端）
// - checkTakeoutUpdates() 检查送达
// - onGhostReceivedTakeout() Ghost收到外卖的AI反应
// - renderTakeoutTracker() 顶栏小标签
// - checkPendingTakeoutReactions() 离线补触发
//
// 依赖：wallet.js / cloud.js / api.js / persona.js / ui.js
// 每天最多3次，冷战期间不可用
// ===================================================


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 时段配送费（按英国时间）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getTakeoutFee() {
  const h = parseInt(new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hour12: false }));
  if (h >= 2  && h < 6)  return { fee: 7.0,  label: '凌晨配送费', time: '02–06' };
  if (h >= 6  && h < 11) return { fee: 2.0,  label: '早间配送费', time: '06–11' };
  if (h >= 11 && h < 18) return { fee: 2.0,  label: '日常配送费', time: '11–18' };
  if (h >= 18 && h < 22) return { fee: 3.0,  label: '晚高峰配送费', time: '18–22' };
  return                         { fee: 5.5,  label: '深夜配送费',  time: '22–02' };
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 城市识别
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _getTakeoutCity() {
  const loc = (localStorage.getItem('currentLocation') || '').toLowerCase();
  if (/manchester/.test(loc))                  return 'manchester';
  if (/edinburgh/.test(loc))                   return 'edinburgh';
  if (/hereford/.test(loc))                    return 'hereford';
  if (/london/.test(loc))                      return 'london';
  if (/germany|berlin|köln|cologne/.test(loc)) return 'germany';
  if (/norway|oslo/.test(loc))                 return 'norway';
  if (/poland|warsaw/.test(loc))               return 'poland';
  if (/amsterdam|netherlands/.test(loc))       return 'amsterdam';
  if (/paris|france/.test(loc))                return 'paris';
  if (/dublin|ireland/.test(loc))              return 'dublin';
  if (/tokyo|japan|osaka/.test(loc))           return 'tokyo';
  return null;
}

function _getCityLabel() {
  return localStorage.getItem('currentLocation') || '';
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 菜单数据
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// cat: 'main'=正餐  'side'=小食  'drink'=饮品
// hot: true → 显示「常点」标签

const TAKEOUT_MENUS = {

  manchester: [
    { id: 'mcr1', cat: 'main',  emoji: '🍛', name: '咖喱羊腿',      nameEn: 'Lamb Balti',               price: 13, desc: '咖喱一条街招牌，慢火炖煮，肉烂入味，配烤馕饼', hot: true },
    { id: 'mcr2', cat: 'main',  emoji: '🥧', name: '牛腰馅饼',      nameEn: 'Steak & Kidney Pie',        price: 10, desc: '正宗英式酥皮馅饼，牛肉腰子慢炖，分量足，顶饿' },
    { id: 'mcr3', cat: 'main',  emoji: '🍜', name: '星洲炒米',      nameEn: 'Singapore Noodles',         price: 11, desc: '唐人街出品，咖喱粉炒细米粉，虾仁叉烧，辣度偏高' },
    { id: 'mcr4', cat: 'main',  emoji: '🌯', name: '烤肉卷饼',      nameEn: 'Doner Kebab',               price:  8, desc: '深夜救星，蒜酱加量，简单管饱' },
    { id: 'mcr5', cat: 'side',  emoji: '🥖', name: '薯条夹饼',      nameEn: 'Chip Barm',                 price:  4, desc: '北方国民小吃，炸薯条夹进软面包，朴实无华' },
    { id: 'mcr6', cat: 'side',  emoji: '🍮', name: '曼彻斯特挞',    nameEn: 'Manchester Tart',           price:  5, desc: '覆盆子酱配卡仕达酱，椰蓉收尾，本地经典甜品' },
    { id: 'mcr7', cat: 'drink', emoji: '☕', name: '白咖啡+糕点',   nameEn: 'Flat White + Pastry',       price:  7, desc: '北角区咖啡店出品，浓缩加奶，配当日现烤糕点', hot: true },
    { id: 'mcr8', cat: 'drink', emoji: '🍺', name: '本地生啤',      nameEn: 'Local Ale',                 price:  5, desc: '曼彻斯特精酿，麦香浓，不甜腻，下班标配' },
  ],

  edinburgh: [
    { id: 'edn1', cat: 'main',  emoji: '🥘', name: '肉馅土豆泥',    nameEn: 'Haggis, Neeps & Tatties',  price: 13, desc: '苏格兰国菜，不是旅游版，是真的那种，扎实浓郁', hot: true },
    { id: 'edn2', cat: 'main',  emoji: '🍛', name: '香料鸡肉咖喱',  nameEn: 'Chicken Tikka',             price: 12, desc: '爱丁堡咖喱圈名声不小，这家证明了实力' },
    { id: 'edn3', cat: 'side',  emoji: '🍟', name: '招牌酱薯条',    nameEn: 'Chips & Chippy Sauce',      price:  5, desc: '爱丁堡独有棕酱配薯条，外地买不到这个味' },
    { id: 'edn4', cat: 'side',  emoji: '🥧', name: '苏格兰肉馅饼',  nameEn: 'Scotch Pie',               price:  6, desc: '羊肉馅，硬皮，实在，冷天吃最对' },
    { id: 'edn5', cat: 'drink', emoji: '☕', name: '白咖啡',        nameEn: 'Flat White',                price:  4, desc: '本地烘焙出品，做得认真，不花哨' },
    { id: 'edn6', cat: 'drink', emoji: '🥃', name: '威士忌小样',    nameEn: 'Single Malt Sample',        price:  8, desc: '爱丁堡酒厂出的试饮装，产地直出，别一口闷' },
  ],

  hereford: [
    { id: 'hfd1', cat: 'main',  emoji: '🥩', name: '烤猪排配薯泥',  nameEn: 'Pork Chop & Mash',         price: 12, desc: '基地附近老馆子，厚切猪排，薯泥奶油味重，管饱', hot: true },
    { id: 'hfd2', cat: 'main',  emoji: '🥧', name: '苹果猪肉派',    nameEn: 'Apple & Pork Pie',          price: 10, desc: 'Hereford苹果产区特色，猪肉配苹果，酸甜解腻' },
    { id: 'hfd3', cat: 'side',  emoji: '🍟', name: '薯条配肉汁',    nameEn: 'Chips & Gravy',             price:  5, desc: '简单不花哨，肉汁是灵魂，一口下去很踏实' },
    { id: 'hfd4', cat: 'side',  emoji: '🧀', name: '奶酪吐司',      nameEn: 'Cheese on Toast',           price:  4, desc: '切达奶酪厚铺，烤到起泡，英式懒人食物代表' },
    { id: 'hfd5', cat: 'drink', emoji: '🍎', name: '苹果酒',        nameEn: 'Hereford Cider',            price:  6, desc: 'Hereford苹果酒产区出品，清甜微酸，这边著名', hot: true },
    { id: 'hfd6', cat: 'drink', emoji: '☕', name: '白咖啡',        nameEn: 'Flat White',                price:  4, desc: '基地周边小咖啡馆，够喝' },
  ],

  london: [
    { id: 'ldn1', cat: 'main',  emoji: '🥧', name: '派配土豆泥',    nameEn: 'Pie & Mash',               price: 11, desc: '东伦敦传统，绿汁浇头，老伦敦味道，历史超百年' },
    { id: 'ldn2', cat: 'main',  emoji: '🍛', name: '黄油鸡咖喱',    nameEn: 'Chicken Tikka Masala',      price: 14, desc: '砖巷咖喱名店，配烤馕不配饭，浓郁不腻', hot: true },
    { id: 'ldn3', cat: 'main',  emoji: '🍣', name: '综合握寿司',    nameEn: 'Sushi Set',                 price: 18, desc: '车站附近的好店，不是超市那种，新鲜度有保障' },
    { id: 'ldn4', cat: 'main',  emoji: '🌯', name: '盐牛肉贝果',    nameEn: 'Salt Beef Bagel',           price:  9, desc: '贝果烘焙老店，芥末酸黄瓜，任何时间都能吃' },
    { id: 'ldn5', cat: 'side',  emoji: '🐟', name: '炸鱼薯条',      nameEn: 'Fish & Chips',              price: 13, desc: '正宗薯条店，报纸包裹，鳕鱼现炸，经典不出错' },
    { id: 'ldn6', cat: 'drink', emoji: '☕', name: '特调白咖啡',    nameEn: 'Flat White',                price:  5, desc: '精品咖啡馆出品，他喝得快' },
    { id: 'ldn7', cat: 'drink', emoji: '🧃', name: '鲜榨果汁',      nameEn: 'Fresh Juice',               price:  4, desc: '市场现榨，橙汁或苹果汁，看当天' },
  ],

  germany: [
    { id: 'deu1', cat: 'main',  emoji: '🌭', name: '纽伦堡香肠拼盘',nameEn: 'Nürnberger Bratwurst',     price: 12, desc: '纽伦堡细香肠，配酸菜和芥末，当地正宗做法', hot: true },
    { id: 'deu2', cat: 'main',  emoji: '🥩', name: '猪肘配酸菜',    nameEn: 'Schweinshaxe',             price: 15, desc: '烤到皮脆肉嫩，配酸白菜，分量极大，一个人能搞定' },
    { id: 'deu3', cat: 'main',  emoji: '🥨', name: '椒盐脆饼',      nameEn: 'Pretzel & Mustard',         price:  7, desc: '大颗粒盐，脆皮，蘸黄芥末，配啤酒绝配' },
    { id: 'deu4', cat: 'side',  emoji: '🥗', name: '德式土豆沙拉',  nameEn: 'Kartoffelsalat',            price:  6, desc: '温热版，培根碎配醋汁，不是美式那种加蛋黄酱的' },
    { id: 'deu5', cat: 'drink', emoji: '☕', name: '黑咖啡',        nameEn: 'Schwarzer Kaffee',          price:  3, desc: '德式滴滤，浓度高，不加奶，直接喝' },
    { id: 'deu6', cat: 'drink', emoji: '🍺', name: '精酿啤酒',      nameEn: 'Craft Beer',                price:  6, desc: '本地小酿酒厂出品，每次口味不一样', hot: true },
  ],

  norway: [
    { id: 'nor1', cat: 'main',  emoji: '🐟', name: '三文鱼配土豆',  nameEn: 'Salmon & Potatoes',         price: 16, desc: '挪威本地三文鱼，现烤配水煮土豆，清淡鲜美', hot: true },
    { id: 'nor2', cat: 'main',  emoji: '🍲', name: '驯鹿肉炖菜',    nameEn: 'Reindeer Stew',             price: 18, desc: '北欧传统猎人炖菜，驯鹿肉软烂，根茎菜配衬，暖胃' },
    { id: 'nor3', cat: 'main',  emoji: '🥙', name: '挪威虾三明治',  nameEn: 'Reke Smørbrød',             price: 12, desc: '开放式黑麦面包，堆满北极虾，蛋黄酱柠檬收尾' },
    { id: 'nor4', cat: 'side',  emoji: '🧇', name: '华夫饼配果酱',  nameEn: 'Waffle & Jam',              price:  6, desc: '挪威心形华夫饼，配酸奶油和草莓酱，不像甜品更像主食' },
    { id: 'nor5', cat: 'drink', emoji: '☕', name: '黑咖啡',        nameEn: 'Kaffe',                     price:  4, desc: '挪威人均咖啡消耗量全球前三，这杯说明问题' },
    { id: 'nor6', cat: 'drink', emoji: '🍫', name: '热巧克力',      nameEn: 'Varm Kakao',                price:  5, desc: '冷天标配，浓稠，是真的融化巧克力，不是冲粉' },
  ],

  poland: [
    { id: 'pol1', cat: 'main',  emoji: '🥟', name: '波兰饺子',      nameEn: 'Pierogi',                   price: 10, desc: '肉馅或土豆奶酪馅，煮后煎香，配酸奶油，波兰灵魂食物', hot: true },
    { id: 'pol2', cat: 'main',  emoji: '🍲', name: '罗宋汤配黑麦面包',nameEn: 'Barszcz & Bread',        price:  9, desc: '深红色甜菜根汤，酸味平衡，配厚切黑麦面包，暖身' },
    { id: 'pol3', cat: 'main',  emoji: '🥩', name: '烤猪肉卷',      nameEn: 'Roladki',                   price: 13, desc: '薄片猪肉卷入培根和泡菜，烤制，配土豆泥，扎实' },
    { id: 'pol4', cat: 'side',  emoji: '🥐', name: '奶酪酥饼',      nameEn: 'Sernik Slice',              price:  5, desc: '波兰奶酪蛋糕，质地密实，不过甜，配咖啡刚好' },
    { id: 'pol5', cat: 'drink', emoji: '☕', name: '黑咖啡',        nameEn: 'Kawa',                      price:  3, desc: '波兰咖啡文化很认真，这杯不会让你失望' },
    { id: 'pol6', cat: 'drink', emoji: '🍺', name: '本地啤酒',      nameEn: 'Piwo',                      price:  5, desc: 'Żywiec或Tyskie，波兰最常见的两个牌子，随机' },
  ],

  amsterdam: [
    { id: 'ams1', cat: 'main',  emoji: '🐟', name: '荷式炸鱼块',    nameEn: 'Kibbeling',                 price: 12, desc: '荷兰炸鱼块，酥脆，配蒜酱或塔塔酱，港口小吃代表', hot: true },
    { id: 'ams2', cat: 'main',  emoji: '🥩', name: '荷兰肉丸配薯泥',nameEn: 'Gehaktbal & Mash',          price: 13, desc: '荷式大肉丸，汁水足，配奶油薯泥，家常味道' },
    { id: 'ams3', cat: 'main',  emoji: '🌯', name: '土耳其烤肉卷',  nameEn: 'Dürüm',                     price:  9, desc: '阿姆斯特丹街头最多的外卖，烤肉卷饼，蒜酱满溢' },
    { id: 'ams4', cat: 'side',  emoji: '🧇', name: '荷兰小煎饼',    nameEn: 'Poffertjes',                price:  6, desc: '迷你蓬松小煎饼，撒糖粉配黄油，街头摊子上的经典' },
    { id: 'ams5', cat: 'side',  emoji: '🍪', name: '焦糖夹心饼',    nameEn: 'Stroopwafel',               price:  5, desc: '荷兰国民饼干，焦糖糖浆夹心，放热咖啡上化开最好吃' },
    { id: 'ams6', cat: 'drink', emoji: '☕', name: '白咖啡',        nameEn: 'Flat White',                price:  4, desc: '荷兰咖啡文化成熟，这杯水准稳定' },
    { id: 'ams7', cat: 'drink', emoji: '🍺', name: '海尼根生啤',    nameEn: 'Heineken Draft',            price:  6, desc: '发源地喝和其他地方不一样，新鲜度有区别', hot: true },
  ],

  paris: [
    { id: 'par1', cat: 'main',  emoji: '🥐', name: '火腿奶酪可颂',  nameEn: 'Jambon-Fromage Croissant',  price:  9, desc: '巴黎街头最常见的午餐，酥皮可颂夹火腿埃曼塔奶酪' },
    { id: 'par2', cat: 'main',  emoji: '🍲', name: '法式洋葱汤',    nameEn: 'Soupe à l\'Oignon',         price: 10, desc: '慢炒洋葱配牛肉高汤，表面奶酪焗到起泡，暖胃', hot: true },
    { id: 'par3', cat: 'main',  emoji: '🥩', name: '法式煎牛排',    nameEn: 'Steak Frites',              price: 18, desc: '七分熟，配手切薯条，法式芥末酱，经典搭配' },
    { id: 'par4', cat: 'side',  emoji: '🥐', name: '黄油可颂',      nameEn: 'Croissant au Beurre',       price:  4, desc: '巴黎烘焙坊出品，层次分明，奶油味足，早晚都能吃' },
    { id: 'par5', cat: 'side',  emoji: '🧁', name: '马卡龙礼盒',    nameEn: 'Macarons',                  price:  8, desc: '法式杏仁饼，六颗装，口味看当天，不是超甜那种' },
    { id: 'par6', cat: 'drink', emoji: '☕', name: '浓缩咖啡',      nameEn: 'Café Espresso',             price:  3, desc: '法式小杯，站在吧台喝，一口下去，清醒' },
    { id: 'par7', cat: 'drink', emoji: '🍷', name: '红酒',          nameEn: 'Vin Rouge',                 price:  8, desc: '餐厅推荐的当日酒款，不贵，但喝得出用心', hot: true },
  ],

  dublin: [
    { id: 'dub1', cat: 'main',  emoji: '🥘', name: '爱尔兰炖羊肉',  nameEn: 'Irish Stew',               price: 13, desc: '羊肉、土豆、胡萝卜慢炖，配棕色苏打面包，暖透', hot: true },
    { id: 'dub2', cat: 'main',  emoji: '🥧', name: '肉馅饼配薯泥',  nameEn: 'Shepherd\'s Pie',          price: 11, desc: '羊肉馅配奶油薯泥烤表层，家常料理，踏实' },
    { id: 'dub3', cat: 'main',  emoji: '🍳', name: '爱尔兰全早餐',  nameEn: 'Full Irish Breakfast',      price: 10, desc: '培根、煎蛋、黑白布丁、炒豆、土司，爱尔兰版全英早餐' },
    { id: 'dub4', cat: 'side',  emoji: '🍟', name: '薯条配醋',      nameEn: 'Chips & Vinegar',           price:  5, desc: '麦芽醋浇薯条，爱尔兰人的固执，不接受其他酱' },
    { id: 'dub5', cat: 'drink', emoji: '🍺', name: '健力士生啤',    nameEn: 'Guinness Draft',            price:  7, desc: '发源地的健力士和其他地方确实不一样，倒法也有讲究', hot: true },
    { id: 'dub6', cat: 'drink', emoji: '☕', name: '爱尔兰咖啡',    nameEn: 'Irish Coffee',              price:  6, desc: '热咖啡加威士忌，顶部浮鲜奶油，不是甜品是饮品' },
  ],

  tokyo: [
    { id: 'tky1', cat: 'main',  emoji: '🍜', name: '豚骨拉面',      nameEn: 'Tonkotsu Ramen',            price: 14, desc: '猪骨汤底熬十二小时，浓白汤，叉烧溏心蛋，正统', hot: true },
    { id: 'tky2', cat: 'main',  emoji: '🍱', name: '鳗鱼饭',        nameEn: 'Unaju',                     price: 16, desc: '蒲烧鳗鱼铺在米饭上，甜酱汁渗进去，东京老字号做法' },
    { id: 'tky3', cat: 'main',  emoji: '🍣', name: '综合握寿司',    nameEn: 'Nigiri Set',                price: 18, desc: '鱼市直送，十贯装，当天时令鱼，师傅手捏' },
    { id: 'tky4', cat: 'main',  emoji: '🍛', name: '日式咖喱猪排',  nameEn: 'Katsu Curry',               price: 13, desc: '炸猪排配日式咖喱汁，日本人自己也常吃的那种咖喱' },
    { id: 'tky5', cat: 'side',  emoji: '🍡', name: '串团子',        nameEn: 'Mitarashi Dango',           price:  5, desc: '糯米团子串，刷酱油甜酱，烤到微焦，街头小食' },
    { id: 'tky6', cat: 'side',  emoji: '🍙', name: '饭团',          nameEn: 'Onigiri',                   price:  4, desc: '便利店级别但是真的好吃，海苔包裹，口味随机' },
    { id: 'tky7', cat: 'drink', emoji: '🍵', name: '抹茶拿铁',      nameEn: 'Matcha Latte',              price:  5, desc: '宇治抹茶粉，不苦不腻，比星巴克那种正宗很多', hot: true },
    { id: 'tky8', cat: 'drink', emoji: '🥤', name: '日本啤酒',      nameEn: 'Asahi / Sapporo',           price:  5, desc: '朝日或札幌，罐装，冰镇，配什么都行' },
  ],
};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 每日次数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getTodayTakeoutCount() {
  return parseInt(localStorage.getItem('takeoutCount_' + new Date().toDateString()) || '0');
}

function _incrementTakeoutCount() {
  const key = 'takeoutCount_' + new Date().toDateString();
  localStorage.setItem(key, getTodayTakeoutCount() + 1);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tab 状态
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let _takeoutTab = 'shop';   // 'shop' | 'tracking' | 'history'
let _menuTab    = 'main';   // 'main' | 'side' | 'drink'


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 初始化（由 openScreen('takeoutScreen') 触发）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function initTakeoutScreen() {
  _takeoutTab = 'shop';
  _menuTab    = 'main';
  const balEl = document.getElementById('takeoutBalanceDisplay');
  if (balEl) balEl.textContent = '£' + getBalance().toFixed(0);
  _renderInfoBar();
  _renderTabBar();
  _renderCatBar();
  _renderBody(_getTakeoutCity());
}

function _renderInfoBar() {
  const bar = document.getElementById('takeoutInfoBar');
  if (!bar) return;
  const fee  = getTakeoutFee();
  const city = _getTakeoutCity();
  bar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 16px 10px;background:rgba(255,248,220,0.85);border-bottom:1px solid rgba(212,168,64,0.2);flex-shrink:0;';
  bar.innerHTML = city
    ? `<span style="font-size:12px;color:#6a3800;font-weight:600;">📍 ${_getCityLabel()}</span>
       <span style="font-size:11px;background:#f0c030;color:#4a2000;padding:3px 10px;border-radius:6px;font-weight:700;">${fee.label} &nbsp;£${fee.fee.toFixed(2)}</span>`
    : `<span style="font-size:12px;color:#b02020;font-weight:600;">🚫 当前位置无法配送</span>`;
}

function _renderTabBar() {
  const bar = document.getElementById('takeoutTabBar');
  if (!bar) return;
  const active = JSON.parse(localStorage.getItem('takeoutOrders') || '[]').filter(o => !o.done);
  const dot = active.length
    ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#c47010;margin-left:4px;vertical-align:middle;"></span>`
    : '';
  bar.innerHTML = [
    { id: 'shop',     label: '点单' },
    { id: 'tracking', label: `配送中${dot}` },
    { id: 'history',  label: '小票' },
  ].map(t => {
    const on = _takeoutTab === t.id;
    return `<button onclick="_switchTakeoutTab('${t.id}')"
      style="flex:1;padding:12px 0;border:none;background:transparent;font-size:14px;cursor:pointer;
        color:${on ? '#7a4a00' : '#b8860b'};font-weight:${on ? 700 : 400};
        border-bottom:${on ? '2.5px solid #c47010' : '2.5px solid transparent'};">
      ${t.label}
    </button>`;
  }).join('');
}

function _renderCatBar() {
  const bar = document.getElementById('takeoutCatBar');
  if (!bar) return;
  if (_takeoutTab !== 'shop') { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  const cats = { main: '🍽 正餐', side: '🥨 小食', drink: '☕ 饮品' };
  bar.innerHTML = Object.entries(cats).map(([id, label]) => {
    const on = _menuTab === id;
    return `<button onclick="_switchMenuTab('${id}')"
      style="flex:1;padding:8px 4px;border-radius:22px;border:1.5px solid ${on ? '#c47010' : '#e8c050'};
        background:${on ? '#c47010' : 'rgba(255,252,240,0.9)'};color:${on ? '#fff' : '#8a5800'};
        font-size:13px;font-weight:700;cursor:pointer;">
      ${label}
    </button>`;
  }).join('');
}

function _switchTakeoutTab(tab) {
  _takeoutTab = tab;
  _renderTabBar();
  _renderCatBar();
  _renderBody(_getTakeoutCity());
}

function _renderBody(city) {
  const body = document.getElementById('takeoutBody');
  if (!body) return;
  if (_takeoutTab === 'shop')     _renderShopTab(body, city);
  if (_takeoutTab === 'tracking') _renderTrackingTab(body);
  if (_takeoutTab === 'history')  _renderHistoryTab(body);
}



// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 点单 Tab
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _renderShopTab(body, city) {
  const fee     = getTakeoutFee();
  const bal     = getBalance();
  const count   = getTodayTakeoutCount();
  const coldWar = localStorage.getItem('coldWarMode') === 'true';
  const hasActive = JSON.parse(localStorage.getItem('takeoutOrders') || '[]').some(o => !o.done);
  const canOrder  = !coldWar && count < 3 && !hasActive;

  if (!city) {
    body.innerHTML = `
      <div style="padding:48px 24px;text-align:center;">
        <div style="font-size:40px;margin-bottom:14px;">🚫</div>
        <div style="font-size:15px;font-weight:700;color:#3a2000;margin-bottom:8px;">当前位置无法配送</div>
        <div style="font-size:12px;color:#a07020;line-height:1.7;">Ghost 正在执行任务<br>任务期间外卖无法送达</div>
      </div>`;
    return;
  }

  const menu  = TAKEOUT_MENUS[city] || [];
  const items = menu.filter(m => m.cat === _menuTab);
  const cats  = { main: '正餐', side: '小食', drink: '饮品' };

  const banner = coldWar
    ? `<div style="background:#fff0f0;border:1px solid #f0b0b0;border-radius:10px;padding:9px 14px;margin-bottom:12px;font-size:12px;color:#b02020;text-align:center;">❄️ 冷战期间无法点外卖</div>`
    : count >= 3
    ? `<div style="background:#fff8e8;border:1px solid #e8d060;border-radius:10px;padding:9px 14px;margin-bottom:12px;font-size:12px;color:#a07020;text-align:center;">今天已点了 ${count} 次，明天再来吧</div>`
    : hasActive
    ? `<div style="background:#fff8e8;border:1px solid #e8d060;border-radius:10px;padding:9px 14px;margin-bottom:12px;font-size:12px;color:#a07020;text-align:center;">🛵 外卖配送中，送达后才能再点</div>`
    : '';

  const cards = items.map(item => {
    const total     = item.price + fee.fee;
    const canAfford = bal >= total;
    const disabled  = !canOrder || !canAfford;
    return `
    <div style="background:#fff;border-radius:16px;padding:12px;margin-bottom:10px;display:flex;align-items:center;gap:12px;box-shadow:0 1px 6px rgba(180,120,0,0.08);">
      <div style="width:64px;height:64px;border-radius:12px;background:#fff8e8;display:flex;align-items:center;justify-content:center;font-size:34px;flex-shrink:0;border:1px solid #f0e0a0;">${item.emoji}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:700;color:#2a1400;">${item.name}</div>
        <div style="font-size:11px;color:#7a5020;margin-top:3px;line-height:1.4;">${item.desc}</div>
        <div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap;">
          <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:#fde8c0;color:#8a4800;font-weight:600;">${cats[item.cat]}</span>
          ${item.hot ? `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:#ffe0c0;color:#b03000;font-weight:600;">常点</span>` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0;">
        <div style="font-size:16px;font-weight:700;color:#c47010;">£${item.price}</div>
        <button onclick="_confirmTakeout('${city}','${item.id}')" ${disabled ? 'disabled' : ''}
          style="background:${disabled ? '#e8d8b0' : '#c47010'};color:${disabled ? '#a08050' : '#fff'};
            border:none;border-radius:20px;padding:8px 16px;font-size:12px;font-weight:700;
            cursor:${disabled ? 'default' : 'pointer'};">
          ${!canAfford ? '余额不足' : '点单 →'}
        </button>
      </div>
    </div>`;
  }).join('');

  body.innerHTML = `
    <div style="padding:14px 16px 28px;">
      ${banner}
      ${cards || `<div style="text-align:center;padding:48px 24px;color:#a07020;font-size:13px;">暂无${cats[_menuTab]}</div>`}
      <div style="text-align:center;font-size:10px;color:#b09060;margin-top:10px;">每天最多点3次 · 冷战期间不可用</div>
    </div>`;
}

function _switchMenuTab(tab) {
  _menuTab = tab;
  _renderCatBar();
  _renderBody(_getTakeoutCity());
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 配送中 Tab
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _renderTrackingTab(body) {
  const orders = JSON.parse(localStorage.getItem('takeoutOrders') || '[]').filter(o => !o.done);
  if (!orders.length) {
    body.innerHTML = `<div style="padding:48px 24px;text-align:center;"><div style="font-size:40px;margin-bottom:14px;">🛵</div><div style="font-size:14px;color:#a07020;">暂无配送中的外卖</div></div>`;
    return;
  }

  const now = Date.now();
  body.innerHTML = orders.map(order => {
    const remaining = Math.max(0, Math.ceil((order.deliverAt - now) / 60000));
    const pct       = Math.min(100, Math.round(((now - order.orderedAt) / (order.deliverAt - order.orderedAt)) * 100));
    const step      = pct < 15 ? 0 : pct < 40 ? 1 : pct < 85 ? 2 : 3;

    const fmt = (ts) => new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
    const t1  = fmt(order.orderedAt);
    const t2  = fmt(order.orderedAt + 2 * 60 * 1000);
    const t3  = fmt(order.orderedAt + Math.round((order.deliverAt - order.orderedAt) * 0.45));
    const t4  = fmt(order.deliverAt);

    const stepData = [
      { name: '已接单',     sub: `${t1} · 餐厅确认` },
      { name: '备餐中',     sub: `${t2} · 制作你点的` },
      { name: '骑手已取餐', sub: `${t3} · 配送中` },
      { name: '送达 Ghost', sub: `预计 ${t4}` },
    ];

    const dotHtml = (idx) => {
      const done = idx < step;
      const cur  = idx === step;
      return `<div style="width:12px;height:12px;border-radius:50%;flex-shrink:0;margin-top:3px;
        border:2px solid ${done || cur ? '#c47010' : '#e8d070'};
        background:${done ? '#c47010' : cur ? '#fff8e8' : '#fffbf0'};
        ${cur ? 'box-shadow:0 0 0 4px rgba(196,112,16,0.18);' : ''}"></div>`;
    };

    return `
    <div style="padding:16px;">
      <div style="background:#fff3cc;border:1px solid #e8d060;border-radius:12px;padding:12px;text-align:center;margin-bottom:14px;">
        <div style="font-size:26px;font-weight:700;color:#7a4a00;">${remaining} 分钟</div>
        <div style="font-size:11px;color:#a07020;margin-top:3px;">预计送达 · ${t4}</div>
      </div>
      <div style="background:#fff;border-radius:14px;padding:14px;margin-bottom:12px;box-shadow:0 1px 6px rgba(180,120,0,0.08);">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
          <div style="font-size:28px;">${order.emoji}</div>
          <div>
            <div style="font-size:13px;font-weight:700;color:#2a1400;">${order.name}</div>
            <div style="font-size:10px;color:#a07020;margin-top:2px;">📍 ${order.cityLabel || ''}</div>
          </div>
        </div>
        <div style="position:relative;">
          <div style="position:absolute;left:5px;top:14px;bottom:14px;width:2px;background:#f0e0a0;"></div>
          <div style="position:absolute;left:5px;top:14px;width:2px;background:#c47010;height:${Math.min(pct * 0.72, 72)}%;"></div>
          ${stepData.map((s, idx) => `
            <div style="display:flex;align-items:flex-start;gap:12px;${idx < 3 ? 'margin-bottom:16px;' : ''}position:relative;">
              ${dotHtml(idx)}
              <div>
                <div style="font-size:11px;font-weight:${idx <= step ? 600 : 400};color:${idx <= step ? '#3a2000' : '#b09050'};">${s.name}</div>
                <div style="font-size:10px;color:${idx <= step ? '#a07020' : '#d0c090'};margin-top:2px;">${idx <= step ? s.sub.split(' · ')[0] : s.sub}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>
      <div style="background:#fffbf0;border:1px solid #e0c070;border-radius:12px;padding:11px;">
        <div style="font-size:10px;color:#a07020;font-weight:700;margin-bottom:7px;">本次订单</div>
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;">
          <span style="color:#3a2000;font-weight:500;">${order.name}</span>
          <span style="color:#7a4a00;font-weight:600;">£${order.price.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;">
          <span style="color:#a07020;">${order.feeLabel || '配送费'}</span>
          <span style="color:#7a4a00;font-weight:600;">£${(order.fee || 0).toFixed(2)}</span>
        </div>
        <div style="height:1px;background:#e8d070;margin:6px 0;"></div>
        <div style="display:flex;justify-content:space-between;font-size:13px;">
          <span style="color:#5a3000;font-weight:700;">合计</span>
          <span style="color:#7a4a00;font-weight:700;">£${(order.price + (order.fee || 0)).toFixed(2)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 小票 Tab
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _renderHistoryTab(body) {
  const history = JSON.parse(localStorage.getItem('takeoutHistory') || '[]');
  if (!history.length) {
    body.innerHTML = `<div style="padding:48px 24px;text-align:center;"><div style="font-size:40px;margin-bottom:14px;">🧾</div><div style="font-size:14px;color:#a07020;">还没有小票记录</div></div>`;
    return;
  }

  body.innerHTML = `<div style="padding:14px 16px 28px;">` + history.map((order, idx) => {
    const opacity = Math.max(0.45, 1 - idx * 0.15);
    const ts = new Date(order.doneAt || order.orderedAt).toLocaleString('zh-CN', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
    });
    return `
    <div style="background:#fffbf0;border:1px solid #e0c070;border-radius:14px;padding:12px;margin-bottom:10px;opacity:${opacity};">
      <div style="display:flex;align-items:center;gap:9px;margin-bottom:9px;">
        <div style="font-size:22px;line-height:1;">${order.emoji}</div>
        <div>
          <div style="font-size:13px;font-weight:700;color:#3a2000;">${order.name}</div>
          <div style="font-size:10px;color:#a07020;margin-top:1px;">${ts} · ${order.cityLabel || ''}</div>
        </div>
      </div>
      <div style="border-top:1px dashed #d4b040;padding-top:8px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">
          <span style="color:#a07020;">菜品</span><span style="color:#3a2000;font-weight:600;">£${order.price.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px;">
          <span style="color:#a07020;">${order.feeLabel || '配送费'}</span><span style="color:#3a2000;font-weight:600;">£${(order.fee || 0).toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;border-top:1px solid #f0e0a0;padding-top:5px;">
          <span style="color:#5a3000;font-weight:700;">合计</span><span style="color:#7a4a00;font-weight:700;">£${(order.price + (order.fee || 0)).toFixed(2)}</span>
        </div>
      </div>
      <div style="margin-top:8px;text-align:center;font-size:10px;font-weight:600;color:#fff;background:#5a9a46;border-radius:6px;padding:4px 0;">已送达 · Ghost 收到了</div>
    </div>`;
  }).join('') + `</div>`;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 确认弹窗
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _confirmTakeout(city, itemId) {
  const item = (TAKEOUT_MENUS[city] || []).find(m => m.id === itemId);
  if (!item) return;
  const fee   = getTakeoutFee();
  const total = item.price + fee.fee;

  document.getElementById('_takeoutConfirm')?.remove();
  const conf = document.createElement('div');
  conf.id = '_takeoutConfirm';
  conf.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9999;display:flex;align-items:center;justify-content:center;';
  conf.innerHTML = `
    <div style="background:#fffdf5;border-radius:20px;padding:24px 20px;max-width:300px;width:88%;text-align:center;border:1px solid #e8c97a;">
      <div style="font-size:44px;margin-bottom:10px;">${item.emoji}</div>
      <div style="font-size:15px;font-weight:700;color:#2a1400;margin-bottom:4px;">${item.name}</div>
      <div style="font-size:11px;color:#a07020;margin-bottom:14px;line-height:1.5;">${item.desc}</div>
      <div style="background:#fff8e8;border-radius:10px;padding:10px;margin-bottom:18px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px;">
          <span style="color:#a07020;">菜品</span><span style="color:#3a2000;font-weight:600;">£${item.price.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:7px;">
          <span style="color:#a07020;">${fee.label}</span><span style="color:#3a2000;font-weight:600;">£${fee.fee.toFixed(2)}</span>
        </div>
        <div style="border-top:1px dashed #e8c97a;padding-top:8px;display:flex;justify-content:space-between;font-size:14px;">
          <span style="color:#5a3000;font-weight:700;">合计</span><span style="color:#c47010;font-weight:700;">£${total.toFixed(2)}</span>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="document.getElementById('_takeoutConfirm').remove()"
          style="flex:1;padding:11px;border-radius:12px;border:1px solid #e8c97a;background:transparent;color:#a07020;font-size:13px;cursor:pointer;">取消</button>
        <button onclick="_doTakeoutOrder('${city}','${itemId}')"
          style="flex:1;padding:11px;border-radius:12px;border:none;background:#c47010;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">确认点单</button>
      </div>
    </div>`;
  document.body.appendChild(conf);
  conf.addEventListener('click', e => { if (e.target === conf) conf.remove(); });
}

function _doTakeoutOrder(city, itemId) {
  document.getElementById('_takeoutConfirm')?.remove();
  const item = (TAKEOUT_MENUS[city] || []).find(m => m.id === itemId);
  if (item) addTakeoutOrder(city, item);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 下单
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function addTakeoutOrder(city, item) {
  const fee   = getTakeoutFee();
  const total = item.price + fee.fee;

  if (typeof showCardSelector === 'function') {
    showCardSelector(total, item.name,
      () => {
        const bal = getBalance();
        if (bal < total) { if (typeof showToast === 'function') showToast('余额不足'); return false; }
        addTransaction({ icon: item.emoji, name: `外卖 · ${item.name}`, amount: -total });
        if (typeof renderWallet === 'function') renderWallet();
        if (typeof showGhostCardReceipt === 'function') showGhostCardReceipt(total, item.name, true);
        _finishTakeoutOrder(city, item, fee);
      },
      () => {
        if (!spendGhostCard(total, item.name, 'daily')) { if (typeof showToast === 'function') showToast('Ghost Card 额度不足'); return false; }
        if (typeof showGhostCardReceipt === 'function') showGhostCardReceipt(total, item.name, false);
        _finishTakeoutOrder(city, item, fee);
      }
    );
  } else {
    const bal = getBalance();
    if (bal < total) { if (typeof showToast === 'function') showToast('余额不足'); return false; }
    addTransaction({ icon: item.emoji, name: `外卖 · ${item.name}`, amount: -total });
    if (typeof renderWallet === 'function') renderWallet();
    _finishTakeoutOrder(city, item, fee);
  }
  return true;
}

function _finishTakeoutOrder(city, item, fee) {
  // 配送时间按品类区分
  const deliverMins = item.cat === 'drink' ? 15 + Math.floor(Math.random() * 11)
                    : item.cat === 'side'  ? 20 + Math.floor(Math.random() * 16)
                    :                       35 + Math.floor(Math.random() * 26);
  const deliverInMs = deliverMins * 60 * 1000;
  const now = Date.now();

  const order = {
    id:        now,
    name:      item.name,
    nameEn:    item.nameEn || item.name,
    emoji:     item.emoji,
    price:     item.price,
    fee:       fee.fee,
    feeLabel:  fee.label,
    desc:      item.desc || '',
    city,
    cityLabel: _getCityLabel(),
    orderedAt: now,
    deliverAt: now + deliverInMs,
    done:      false,
  };

  const orders = JSON.parse(localStorage.getItem('takeoutOrders') || '[]');
  orders.unshift(order);
  localStorage.setItem('takeoutOrders', JSON.stringify(orders.slice(0, 10)));

  _incrementTakeoutCount();
  if (typeof saveToCloud === 'function') saveToCloud().catch(() => {});

  const mins = Math.round(deliverInMs / 60000);
  if (typeof showToast === 'function') showToast(`${item.emoji} 已下单！约 ${mins} 分钟后送达`);

  renderTakeoutTracker();

  // 跳到配送中 tab
  _takeoutTab = 'tracking';
  _renderNav();
  const body = document.getElementById('takeoutBody');
  if (body) _renderTrackingTab(body);

  return true;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 检查送达
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function checkTakeoutUpdates() {
  const orders = JSON.parse(localStorage.getItem('takeoutOrders') || '[]');
  if (!orders.length) return;

  const now = Date.now();
  let updated = false;

  orders.forEach(order => {
    if (order.done || now < order.deliverAt) return;
    order.done  = true;
    order.doneAt = now;
    updated = true;

    const hist = JSON.parse(localStorage.getItem('takeoutHistory') || '[]');
    if (!hist.find(h => h.id === order.id)) {
      hist.unshift(order);
      localStorage.setItem('takeoutHistory', JSON.stringify(hist.slice(0, 50)));
    }
    onGhostReceivedTakeout(order);
  });

  if (updated) {
    localStorage.setItem('takeoutOrders', JSON.stringify(orders));
    if (typeof saveToCloud === 'function') saveToCloud().catch(() => {});
    renderTakeoutTracker();
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Ghost 收到外卖
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function onGhostReceivedTakeout(order) {
  if (typeof showToast === 'function') showToast(`✅ ${order.emoji} ${order.name} 已送到 Ghost！`);

  // ── 外卖台词防重复池 ────────────────────────────────────
  const _getTakeoutPool = () => JSON.parse(localStorage.getItem('takeoutReplyPool') || '[]');
  const _saveTakeoutPool = (pool) => localStorage.setItem('takeoutReplyPool', JSON.stringify(pool.slice(-5)));
  const _recentTakeoutLines = _getTakeoutPool().map(l => `"${l}"`).join(', ');
  const _noRepeatHint = _recentTakeoutLines
    ? `\n\nDo not reuse or echo these recent lines: ${_recentTakeoutLines}. Vary your phrasing, angle, and reaction completely.`
    : '';

  // 判断用户有没有提前说过
  const kw = [order.name.toLowerCase(), (order.nameEn || '').toLowerCase(), 'takeout', 'food', 'ordered', '外卖', '点了', '送'];
  const told = (chatHistory || []).filter(m => m.role === 'user' && !m._system).slice(-20)
    .some(m => kw.some(k => (m.content || '').toLowerCase().includes(k)));

  if (typeof chatHistory !== 'undefined') {
    chatHistory.push({
      role: 'user',
      content: told
        ? `[Her takeout just arrived — 「${order.nameEn || order.name}」. You have it. If she asks, confirm you received it.]`
        : `[A takeout delivery just showed up — 「${order.nameEn || order.name}」. You didn't know she was ordering. You have it now. If she asks, confirm you received it.]`,
      _system: true,
    });
    // 只在有真实聊天记录时才保存，防止空 chatHistory 覆盖本地历史
    const _realMsgs = chatHistory.filter(m => !m._system && !m._recalled && m.role && m.content);
    if (_realMsgs.length > 0 && typeof saveHistory === 'function') saveHistory();
  }

  const container = document.getElementById('messagesContainer');
  if (!container) {
    const pending = JSON.parse(localStorage.getItem('pendingTakeoutReactions') || '[]');
    pending.push({ order, savedAt: Date.now() });
    localStorage.setItem('pendingTakeoutReactions', JSON.stringify(pending));
    return;
  }

  // 正在发消息就等一会儿，不干扰用户输入
  const delay = typeof _isSending !== 'undefined' && _isSending ? 6000 : 0;
  setTimeout(async () => {
    try {
      // ── 情绪变化 ─────────────────────────────────────────
      const _feeHour     = parseInt(new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hour12: false }));
      const _isLateNight = _feeHour >= 2 && _feeHour < 6;
      const _wasHungry   = _detectMealStatus() === 'hungry';
      const _todayCount  = getTodayTakeoutCount();

      let _affDelta   = 1;
      let _trustDelta = 1;
      if (_isLateNight)     { _affDelta += 1; }
      if (_wasHungry)       { _affDelta += 1; _trustDelta += 1; }
      if (_todayCount >= 2) { _affDelta += 1; }

      if (typeof changeAffection === 'function') changeAffection(_affDelta);
      if (typeof changeTrustHeat === 'function') changeTrustHeat(_trustDelta);

      // 写进长期记忆
      try {
        const _ltm  = localStorage.getItem('longTermMemory') || '';
        const _note = told
          ? `She ordered takeout for you — 「${order.nameEn || order.name}」. It arrived. You have it. Confirm if she asks.`
          : `Takeout showed up — 「${order.nameEn || order.name}」. You didn't know she ordered it. You have it now. Confirm if she asks.`;
        if (!_ltm.includes(order.nameEn || order.name)) {
          localStorage.setItem('longTermMemory', (_ltm + '\n' + _note).trim().slice(-2000));
          if (typeof touchLocalState === 'function') touchLocalState();
        }
      } catch(e) {}

      // Ghost 用 S 说一句反应（调情中存 pending 不打断）
      const _isFlirting = sessionStorage.getItem('loveOverride') === 'true'
        || (chatHistory || []).slice(-4).some(m => m._intimate);
      if (_isFlirting) {
        const _pt = JSON.parse(localStorage.getItem('pendingTakeoutReactions') || '[]');
        _pt.push({ order, savedAt: Date.now() });
        localStorage.setItem('pendingTakeoutReactions', JSON.stringify(_pt));
      } else {
        try {
          const _descHint = order.desc ? `\nWhat it is: ${order.desc}` : '';
          const _prompt = told
            ? `[Her takeout just arrived — 「${order.nameEn || order.name}」. You have it now.${_descHint}

She ordered this for you. That matters — regardless of what the food is.
React to it honestly: what you notice about it, how it smells, what you think.
You may be dry about it. You may underplay it. But underneath — you received it, and you received what she meant by it.
Do not dismiss it. Do not make her feel the gesture was wasted.
Lowercase. English only. Two to three lines.${_noRepeatHint}]`
            : `[A delivery just showed up — 「${order.nameEn || order.name}」. You didn't know she was ordering.${_descHint}

She did this without telling you. She was thinking of you.
React to the food and to what just happened — dry, real, a little caught off guard.
You don't perform gratitude. But you don't act like it means nothing.
The fact she did this — that stays with you.
Lowercase. English only. Two to three lines.${_noRepeatHint}]`;
          const _res = await fetchWithTimeout('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: typeof getMainModel === 'function' ? getMainModel() : 'claude-sonnet-4-20250514',
              max_tokens: 100,
              system: typeof buildGhostStyleCore === 'function' ? buildGhostStyleCore() : '',
              messages: [
                ...(chatHistory || []).filter(m => !m._system).slice(-6),
                { role: 'user', content: _prompt }
              ]
            })
          }, 15000);
          const _data = await _res.json();
          const _reply = (_data.content?.[0]?.text || '').trim();
          const _bad = ["i'm claude","i am claude","as an ai","can't roleplay","anthropic"];
          if (_reply && !_bad.some(p => _reply.toLowerCase().includes(p))) {
            const _line = _reply.split('\n').slice(0, 2).join('\n');
            if (typeof appendMessage === 'function') appendMessage('bot', _line);
            // 存入防重复池
            const _pool = _getTakeoutPool(); _pool.push(_line); _saveTakeoutPool(_pool);
            if (typeof chatHistory !== 'undefined') {
              chatHistory.push({ role: 'assistant', content: _line });
              const _realMsgs = chatHistory.filter(m => !m._system && !m._recalled && m.role && m.content);
              if (_realMsgs.length > 0 && typeof saveHistory === 'function') saveHistory();
              if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
            }
          }
        } catch(e) { console.warn('[外卖] 回复生成失败:', e); }
      }

      if (typeof scheduleCloudSave === 'function') scheduleCloudSave();

    } catch(e) { console.warn('[外卖] 送达处理失败:', e); }
  }, delay);
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 用餐状态检测
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 扫描Ghost最近10条消息（3小时内），判断用餐状态
// 返回：'ate' | 'hungry' | null
function _detectMealStatus() {
  if (typeof chatHistory === 'undefined') return null;

  // 只取最近10条bot消息，_time字段不稳定不做时间过滤
  const recentBot = (chatHistory || [])
    .filter(m => m.role === 'assistant' && !m._system && !m._recalled)
    .slice(-10);

  if (!recentBot.length) return null;

  const ateKw    = /just ate|just had|had lunch|had dinner|had breakfast|finished eating|ate already|not hungry|just eaten|吃完|吃了|吃过|不饿/i;
  const hungryKw = /haven't eaten|not eaten|skipped|no food|didn't eat|starving|hungry|nothing to eat|没吃|还没吃|饿了|饿着/i;

  // 取最后一条命中的（最新状态优先）
  for (let i = recentBot.length - 1; i >= 0; i--) {
    const txt = recentBot[i].content || '';
    if (ateKw.test(txt))    return 'ate';
    if (hungryKw.test(txt)) return 'hungry';
  }
  return null;
}

// 当前英国时间是否是饭点，返回提示文字或 null
function _getMealTimeHint() {
  const h = parseInt(new Date().toLocaleString('en-GB', {
    timeZone: 'Europe/London', hour: 'numeric', hour12: false
  }));
  if (h >= 7  && h < 9)  return '早餐时间到了';
  if (h >= 12 && h < 14) return '该吃午饭了';
  if (h >= 18 && h < 20) return '晚餐时间到了';
  return null;
}

// 综合判断：返回要显示的卡片提示文字，或 null（不显示）
function getMealHint() {
  // 已有外卖在配送中 → 不显示用餐提示（已经点了）
  const hasActive = JSON.parse(localStorage.getItem('takeoutOrders') || '[]').some(o => !o.done);
  if (hasActive) return null;

  // 冷战期间不提示
  if (localStorage.getItem('coldWarMode') === 'true') return null;

  const status = _detectMealStatus();
  if (status === 'ate')    return null;           // 他吃了，不提示
  if (status === 'hungry') return '他好像还没吃'; // 对话触发，优先

  // 对话无信号，走时间触发
  return _getMealTimeHint();
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 顶栏标签
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderTakeoutTracker() {
  // 只更新主页外卖卡片提示
  updateTakeoutCardHint();
}

function updateTakeoutCardHint() {
  const desc = document.getElementById('takeoutCardDesc');
  if (!desc) return;
  const hint = getMealHint();
  desc.textContent = hint || '给Ghost点外卖';
  desc.style.color = hint ? '#c47010' : '';
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 离线补触发
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function checkPendingTakeoutReactions() {
  try {
    const pending = JSON.parse(localStorage.getItem('pendingTakeoutReactions') || '[]');
    if (!pending.length) return;
    localStorage.removeItem('pendingTakeoutReactions');
    pending.forEach((item, idx) => {
      setTimeout(() => onGhostReceivedTakeout(item.order), idx * 4000);
    });
  } catch(e) {}
}

// 用户切回聊天页时自动触发 pending
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(checkPendingTakeoutReactions, 1000);
  });
}
