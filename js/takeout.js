// ===================================================
// takeout.js — 外卖系统
//
// 外卖价格倍率（让厨师折扣有体感）
const TAKEOUT_PRICE_MULTIPLIER = 2.5;
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
  if (h >= 2  && h < 6)  return { fee: 18.0, label: '凌晨配送费', time: '02–06' };
  if (h >= 6  && h < 11) return { fee: 8.0,  label: '早间配送费', time: '06–11' };
  if (h >= 11 && h < 18) return { fee: 8.0,  label: '日常配送费', time: '11–18' };
  if (h >= 18 && h < 22) return { fee: 12.0, label: '晚高峰配送费', time: '18–22' };
  return                         { fee: 15.0, label: '深夜配送费',  time: '22–02' };
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
    // ── 外卖翻新：曼城新增普通菜 ──
    { id: 'mcr9',  cat: 'main',  emoji: '🍲', name: '兰开夏火锅',    nameEn: 'Lancashire Hotpot',        price: 12, desc: '羊肉土豆慢炖一整天，北英格兰冬天的命根子，砂锅上桌还咕嘟着' },
    { id: 'mcr10', cat: 'main',  emoji: '🍗', name: '烤鸡卷饼',      nameEn: 'Peri Peri Wrap',            price:  9, desc: '柯利班街的葡式辣鸡，裹进大饼里，辣酱管够' },
    { id: 'mcr11', cat: 'side',  emoji: '🥧', name: '猪肉香肠卷',    nameEn: 'Sausage Roll',              price:  4, desc: '酥皮裹粗颗粒香肠肉，刚出炉最好，垫肚子首选' },
    { id: 'mcr12', cat: 'drink', emoji: '🧋', name: '奶茶',          nameEn: 'Bubble Tea',                price:  5, desc: '中国城新开那家，珍珠煮得软，甜度可调' },
    // ── 厨师专属·家常温情菜（Lv.3 解锁）──
    { id: 'mcr_c1', cat: 'main', emoji: '🍳', name: '他妈妈的周日烤肉', nameEn: "Mum's Sunday Roast",     price: 11, desc: '烤牛肉配约克郡布丁和肉汁——他从小吃到大的味道，只有你能点给他', chefLevel: 3 },
    { id: 'mcr_c2', cat: 'main', emoji: '🥔', name: '芝士焗土豆泥',   nameEn: 'Cheesy Mash Pie',           price:  9, desc: '厚厚一层烤到金黄的芝士盖着奶油土豆泥，家常、扎实、暖胃', chefLevel: 3 },
    // ── 厨师专属·主厨私房菜（Lv.6 解锁）──
    { id: 'mcr_p1', cat: 'main', emoji: '🦞', name: '威灵顿龙虾',     nameEn: 'Lobster Wellington',        price: 26, desc: '酥皮裹龙虾与松露，你亲手做的那种级别，摆盘讲究，只此一份', chefLevel: 6 },
    { id: 'mcr_p2', cat: 'main', emoji: '🥩', name: '慢烤和牛肋',     nameEn: 'Slow-cooked Wagyu Rib',     price: 30, desc: '低温慢烤十二小时，入口即化，配红酒酱汁——米其林厨房出品', chefLevel: 6 },
  ],

  edinburgh: [
    { id: 'edn1', cat: 'main',  emoji: '🥘', name: '肉馅土豆泥',    nameEn: 'Haggis, Neeps & Tatties',  price: 13, desc: '苏格兰国菜，不是旅游版，是真的那种，扎实浓郁', hot: true },
    { id: 'edn2', cat: 'main',  emoji: '🍛', name: '香料鸡肉咖喱',  nameEn: 'Chicken Tikka',             price: 12, desc: '爱丁堡咖喱圈名声不小，这家证明了实力' },
    { id: 'edn3', cat: 'side',  emoji: '🍟', name: '招牌酱薯条',    nameEn: 'Chips & Chippy Sauce',      price:  5, desc: '爱丁堡独有棕酱配薯条，外地买不到这个味' },
    { id: 'edn4', cat: 'side',  emoji: '🥧', name: '苏格兰肉馅饼',  nameEn: 'Scotch Pie',               price:  6, desc: '羊肉馅，硬皮，实在，冷天吃最对' },
    { id: 'edn5', cat: 'drink', emoji: '☕', name: '白咖啡',        nameEn: 'Flat White',                price:  4, desc: '本地烘焙出品，做得认真，不花哨' },
    { id: 'edn6', cat: 'drink', emoji: '🥃', name: '威士忌小样',    nameEn: 'Single Malt Sample',        price:  8, desc: '爱丁堡酒厂出的试饮装，产地直出，别一口闷' },
    { id: 'edn7', cat: 'main',  emoji: '🐟', name: '炸鱼薯条',      nameEn: 'Fish Supper',               price: 11, desc: '苏格兰叫法是fish supper，鳕鱼裹厚面糊现炸，配盐和醋，海边风味', hot: true },
    { id: 'edn8', cat: 'side',  emoji: '🥐', name: '黄油酥饼',      nameEn: 'Shortbread',                price:  4, desc: '苏格兰国民酥饼，纯黄油烤制，一掰就碎，配茶最好' },
    { id: 'edn9', cat: 'side',  emoji: '🍫', name: '油炸玛氏巧克力', nameEn: 'Deep-fried Mars Bar',       price:  5, desc: '苏格兰炸物界的传奇，巧克力棒裹面糊下油锅，甜到上头，你敢试吗' },
    { id: 'edn_c1', cat: 'main', emoji: '🍲', name: '苏格兰浓汤',    nameEn: 'Cullen Skink',              price: 10, desc: '烟熏黑线鳕、土豆和洋葱熬的奶油浓汤，苏格兰渔村家常，他说冷天喝这个最顶事', chefLevel: 3 },
    { id: 'edn_p1', cat: 'main', emoji: '🦌', name: '威士忌炖鹿肉',  nameEn: 'Venison in Whisky',         price: 28, desc: '苏格兰高地鹿肉配单一麦芽慢炖，酒香浸进肉里——他给你露一手的那种', chefLevel: 6 },
  ],

  hereford: [
    { id: 'hfd1', cat: 'main',  emoji: '🥩', name: '烤猪排配薯泥',  nameEn: 'Pork Chop & Mash',         price: 12, desc: '基地附近老馆子，厚切猪排，薯泥奶油味重，管饱', hot: true },
    { id: 'hfd2', cat: 'main',  emoji: '🥧', name: '苹果猪肉派',    nameEn: 'Apple & Pork Pie',          price: 10, desc: 'Hereford苹果产区特色，猪肉配苹果，酸甜解腻' },
    { id: 'hfd3', cat: 'side',  emoji: '🍟', name: '薯条配肉汁',    nameEn: 'Chips & Gravy',             price:  5, desc: '简单不花哨，肉汁是灵魂，一口下去很踏实' },
    { id: 'hfd4', cat: 'side',  emoji: '🧀', name: '奶酪吐司',      nameEn: 'Cheese on Toast',           price:  4, desc: '切达奶酪厚铺，烤到起泡，英式懒人食物代表' },
    { id: 'hfd5', cat: 'drink', emoji: '🍎', name: '苹果酒',        nameEn: 'Hereford Cider',            price:  6, desc: 'Hereford苹果酒产区出品，清甜微酸，这边著名', hot: true },
    { id: 'hfd6', cat: 'drink', emoji: '☕', name: '白咖啡',        nameEn: 'Flat White',                price:  4, desc: '基地周边小咖啡馆，够喝' },
    { id: 'hfd7', cat: 'main',  emoji: '🍖', name: '烤羊排',        nameEn: 'Roast Lamb',                price: 13, desc: '本地牧场羊肉，迷迭香烤制，配薄荷酱，周末小馆子的招牌', hot: true },
    { id: 'hfd8', cat: 'side',  emoji: '🥓', name: '培根卷',        nameEn: 'Bacon Bap',                 price:  4, desc: '厚切培根夹进软面包，挤一圈棕酱，训练完最想来一个' },
    { id: 'hfd9', cat: 'side',  emoji: '🍰', name: '维多利亚海绵蛋糕', nameEn: 'Victoria Sponge',         price:  5, desc: '果酱夹奶油的经典英式下午茶蛋糕，甜得朴实' },
    { id: 'hfd_c1', cat: 'main', emoji: '🥧', name: '牧羊人派',     nameEn: "Shepherd's Pie",            price:  9, desc: '羊肉末炖菜上盖厚土豆泥烤到金黄，军营家常味，他说这是最扛饿的一口', chefLevel: 3 },
    { id: 'hfd_p1', cat: 'main', emoji: '🥩', name: '惠灵顿牛排',   nameEn: 'Beef Wellington',           price: 29, desc: '酥皮裹菲力与蘑菇酱，切开粉嫩多汁——他休假在家给你做过一次的硬菜', chefLevel: 6 },
  ],

  london: [
    { id: 'ldn1', cat: 'main',  emoji: '🥧', name: '派配土豆泥',    nameEn: 'Pie & Mash',               price: 11, desc: '东伦敦传统，绿汁浇头，老伦敦味道，历史超百年' },
    { id: 'ldn2', cat: 'main',  emoji: '🍛', name: '黄油鸡咖喱',    nameEn: 'Chicken Tikka Masala',      price: 14, desc: '砖巷咖喱名店，配烤馕不配饭，浓郁不腻', hot: true },
    { id: 'ldn3', cat: 'main',  emoji: '🍣', name: '综合握寿司',    nameEn: 'Sushi Set',                 price: 18, desc: '车站附近的好店，不是超市那种，新鲜度有保障' },
    { id: 'ldn4', cat: 'main',  emoji: '🌯', name: '盐牛肉贝果',    nameEn: 'Salt Beef Bagel',           price:  9, desc: '贝果烘焙老店，芥末酸黄瓜，任何时间都能吃' },
    { id: 'ldn5', cat: 'side',  emoji: '🐟', name: '炸鱼薯条',      nameEn: 'Fish & Chips',              price: 13, desc: '正宗薯条店，报纸包裹，鳕鱼现炸，经典不出错' },
    { id: 'ldn6', cat: 'drink', emoji: '☕', name: '特调白咖啡',    nameEn: 'Flat White',                price:  5, desc: '精品咖啡馆出品，他喝得快' },
    { id: 'ldn7', cat: 'drink', emoji: '🧃', name: '鲜榨果汁',      nameEn: 'Fresh Juice',               price:  4, desc: '市场现榨，橙汁或苹果汁，看当天' },
    { id: 'ldn8', cat: 'main',  emoji: '🍗', name: '烤鸡主日餐',    nameEn: 'Sunday Roast Chicken',      price: 14, desc: '酒馆周日限定，烤鸡配烤土豆、约克郡布丁和肉汁，一周就等这顿', hot: true },
    { id: 'ldn9', cat: 'side',  emoji: '🥧', name: '康沃尔肉派',    nameEn: 'Cornish Pasty',             price:  5, desc: '厚实酥皮裹牛肉土豆，矿工午餐起家，单手拿着就能吃' },
    { id: 'ldn10', cat: 'side', emoji: '🧁', name: '英式司康',      nameEn: 'Scone & Clotted Cream',     price:  6, desc: '配凝脂奶油和草莓酱，先抹奶油还是先抹酱，伦敦人能吵一整天' },
    { id: 'ldn_c1', cat: 'main', emoji: '🫓', name: '烤芝士三明治', nameEn: 'Toastie',                   price:  8, desc: '厚切面包夹三种奶酪压烤，边角焦脆拉丝，他深夜值班后最想要的那口', chefLevel: 3 },
    { id: 'ldn_p1', cat: 'main', emoji: '🦆', name: '橙汁烤鸭胸',   nameEn: 'Duck à l\'Orange',          price: 27, desc: '鸭胸煎到皮脆，配橙香酱汁，摆盘讲究——他难得正经下厨的水准', chefLevel: 6 },
  ],

  germany: [
    { id: 'deu1', cat: 'main',  emoji: '🌭', name: '纽伦堡香肠拼盘',nameEn: 'Nürnberger Bratwurst',     price: 12, desc: '纽伦堡细香肠，配酸菜和芥末，当地正宗做法', hot: true },
    { id: 'deu2', cat: 'main',  emoji: '🥩', name: '猪肘配酸菜',    nameEn: 'Schweinshaxe',             price: 15, desc: '烤到皮脆肉嫩，配酸白菜，分量极大，一个人能搞定' },
    { id: 'deu3', cat: 'main',  emoji: '🥨', name: '椒盐脆饼',      nameEn: 'Pretzel & Mustard',         price:  7, desc: '大颗粒盐，脆皮，蘸黄芥末，配啤酒绝配' },
    { id: 'deu4', cat: 'side',  emoji: '🥗', name: '德式土豆沙拉',  nameEn: 'Kartoffelsalat',            price:  6, desc: '温热版，培根碎配醋汁，不是美式那种加蛋黄酱的' },
    { id: 'deu5', cat: 'drink', emoji: '☕', name: '黑咖啡',        nameEn: 'Schwarzer Kaffee',          price:  3, desc: '德式滴滤，浓度高，不加奶，直接喝' },
    { id: 'deu6', cat: 'drink', emoji: '🍺', name: '精酿啤酒',      nameEn: 'Craft Beer',                price:  6, desc: '本地小酿酒厂出品，每次口味不一样', hot: true },
    { id: 'deu7', cat: 'main',  emoji: '🌭', name: '咖喱香肠配薯条', nameEn: 'Currywurst & Pommes',       price:  9, desc: '柏林街头之魂，香肠切段浇咖喱番茄酱，撒咖喱粉，配薯条', hot: true },
    { id: 'deu8', cat: 'main',  emoji: '🍖', name: '维也纳炸肉排',  nameEn: 'Schnitzel',                 price: 13, desc: '猪肉锤薄裹面包糠炸金黄，挤柠檬汁，配土豆沙拉，大得盖过盘子' },
    { id: 'deu9', cat: 'side',  emoji: '🍰', name: '黑森林蛋糕',    nameEn: 'Black Forest Cake',         price:  6, desc: '樱桃酒巧克力海绵配奶油和黑樱桃，德国甜品的门面担当' },
    { id: 'deu_c1', cat: 'main', emoji: '🥘', name: '炖牛肉配面疙瘩', nameEn: 'Gulasch & Spätzle',        price: 10, desc: '慢炖牛肉配手工面疙瘩，浓汤裹面，德国冬天的家常暖锅，他驻训时房东常做', chefLevel: 3 },
    { id: 'deu_p1', cat: 'main', emoji: '🦢', name: '烤鹅配红甘蓝',  nameEn: 'Roast Goose',               price: 26, desc: '圣诞级别的烤鹅，皮脆油亮配红甘蓝和团子，一年做不了几回的大菜', chefLevel: 6 },
  ],

  norway: [
    { id: 'nor1', cat: 'main',  emoji: '🐟', name: '三文鱼配土豆',  nameEn: 'Salmon & Potatoes',         price: 16, desc: '挪威本地三文鱼，现烤配水煮土豆，清淡鲜美', hot: true },
    { id: 'nor2', cat: 'main',  emoji: '🍲', name: '驯鹿肉炖菜',    nameEn: 'Reindeer Stew',             price: 18, desc: '北欧传统猎人炖菜，驯鹿肉软烂，根茎菜配衬，暖胃' },
    { id: 'nor3', cat: 'main',  emoji: '🥙', name: '挪威虾三明治',  nameEn: 'Reke Smørbrød',             price: 12, desc: '开放式黑麦面包，堆满北极虾，蛋黄酱柠檬收尾' },
    { id: 'nor4', cat: 'side',  emoji: '🧇', name: '华夫饼配果酱',  nameEn: 'Waffle & Jam',              price:  6, desc: '挪威心形华夫饼，配酸奶油和草莓酱，不像甜品更像主食' },
    { id: 'nor5', cat: 'drink', emoji: '☕', name: '黑咖啡',        nameEn: 'Kaffe',                     price:  4, desc: '挪威人均咖啡消耗量全球前三，这杯说明问题' },
    { id: 'nor6', cat: 'drink', emoji: '🍫', name: '热巧克力',      nameEn: 'Varm Kakao',                price:  5, desc: '冷天标配，浓稠，是真的融化巧克力，不是冲粉' },
    { id: 'nor7', cat: 'main',  emoji: '🌭', name: '挪威热狗',      nameEn: 'Pølse i Lompe',             price:  7, desc: '香肠裹土豆薄饼，加脆洋葱和虾沙拉酱，挪威加油站的国民快餐', hot: true },
    { id: 'nor8', cat: 'side',  emoji: '🍥', name: '肉桂卷',        nameEn: 'Skillingsbolle',            price:  5, desc: '卑尔根招牌大肉桂卷，外脆内软，肉桂糖心流心，配咖啡绝配' },
    { id: 'nor9', cat: 'side',  emoji: '🐟', name: '腌三文鱼',      nameEn: 'Gravlaks',                  price:  9, desc: '莳萝和盐腌渍的生三文鱼薄片，配芥末酱和黑面包，北欧经典冷盘' },
    { id: 'nor_c1', cat: 'main', emoji: '🍲', name: '挪威鱼汤',     nameEn: 'Fiskesuppe',                price: 11, desc: '奶油底海鲜汤，三文鱼鳕鱼和根茎菜，鲜甜暖身，他说极地驻训时最想念这一锅', chefLevel: 3 },
    { id: 'nor_p1', cat: 'main', emoji: '🦌', name: '慢炖驯鹿里脊',  nameEn: 'Reinsdyrfilet',             price: 30, desc: '驯鹿里脊煎到三分，配杜松子酱和棕奶酪，北欧顶级野味——他难得的隆重手艺', chefLevel: 6 },
  ],

  poland: [
    { id: 'pol1', cat: 'main',  emoji: '🥟', name: '波兰饺子',      nameEn: 'Pierogi',                   price: 10, desc: '肉馅或土豆奶酪馅，煮后煎香，配酸奶油，波兰灵魂食物', hot: true },
    { id: 'pol2', cat: 'main',  emoji: '🍲', name: '罗宋汤配黑麦面包',nameEn: 'Barszcz & Bread',        price:  9, desc: '深红色甜菜根汤，酸味平衡，配厚切黑麦面包，暖身' },
    { id: 'pol3', cat: 'main',  emoji: '🥩', name: '烤猪肉卷',      nameEn: 'Roladki',                   price: 13, desc: '薄片猪肉卷入培根和泡菜，烤制，配土豆泥，扎实' },
    { id: 'pol4', cat: 'side',  emoji: '🥐', name: '奶酪酥饼',      nameEn: 'Sernik Slice',              price:  5, desc: '波兰奶酪蛋糕，质地密实，不过甜，配咖啡刚好' },
    { id: 'pol5', cat: 'drink', emoji: '☕', name: '黑咖啡',        nameEn: 'Kawa',                      price:  3, desc: '波兰咖啡文化很认真，这杯不会让你失望' },
    { id: 'pol6', cat: 'drink', emoji: '🍺', name: '本地啤酒',      nameEn: 'Piwo',                      price:  5, desc: 'Żywiec或Tyskie，波兰最常见的两个牌子，随机' },
    { id: 'pol7', cat: 'main',  emoji: '🍖', name: '炸猪排配土豆',  nameEn: 'Kotlet Schabowy',           price: 11, desc: '波兰版炸肉排，猪里脊锤薄裹糠炸，配土豆泥和腌黄瓜，周日午餐标配', hot: true },
    { id: 'pol8', cat: 'main',  emoji: '🥬', name: '猎人炖菜',      nameEn: 'Bigos',                     price: 10, desc: '酸菜、鲜白菜和多种肉一起慢炖，越炖越入味，波兰人过冬的命根子' },
    { id: 'pol9', cat: 'side',  emoji: '🍩', name: '波兰甜甜圈',    nameEn: 'Pączki',                    price:  4, desc: '玫瑰果酱夹心的炸甜甜圈，撒糖霜，肥美星期四人手一个' },
    { id: 'pol_c1', cat: 'main', emoji: '🥟', name: '奶奶的手工饺子', nameEn: "Babcia's Pierogi",         price:  9, desc: '土豆奶酪馅手工饺子，煎到两面金黄配焦洋葱，最费功夫的家常味，他说这个得慢慢包', chefLevel: 3 },
    { id: 'pol_p1', cat: 'main', emoji: '🦆', name: '烤鸭配苹果',   nameEn: 'Kaczka z Jabłkami',         price: 25, desc: '整鸭塞苹果慢烤，皮脆肉嫩配红酒李子酱，波兰节庆大菜，他偶尔郑重其事做一回', chefLevel: 6 },
  ],

  amsterdam: [
    { id: 'ams1', cat: 'main',  emoji: '🐟', name: '荷式炸鱼块',    nameEn: 'Kibbeling',                 price: 12, desc: '荷兰炸鱼块，酥脆，配蒜酱或塔塔酱，港口小吃代表', hot: true },
    { id: 'ams2', cat: 'main',  emoji: '🥩', name: '荷兰肉丸配薯泥',nameEn: 'Gehaktbal & Mash',          price: 13, desc: '荷式大肉丸，汁水足，配奶油薯泥，家常味道' },
    { id: 'ams3', cat: 'main',  emoji: '🌯', name: '土耳其烤肉卷',  nameEn: 'Dürüm',                     price:  9, desc: '阿姆斯特丹街头最多的外卖，烤肉卷饼，蒜酱满溢' },
    { id: 'ams4', cat: 'side',  emoji: '🧇', name: '荷兰小煎饼',    nameEn: 'Poffertjes',                price:  6, desc: '迷你蓬松小煎饼，撒糖粉配黄油，街头摊子上的经典' },
    { id: 'ams5', cat: 'side',  emoji: '🍪', name: '焦糖夹心饼',    nameEn: 'Stroopwafel',               price:  5, desc: '荷兰国民饼干，焦糖糖浆夹心，放热咖啡上化开最好吃' },
    { id: 'ams6', cat: 'drink', emoji: '☕', name: '白咖啡',        nameEn: 'Flat White',                price:  4, desc: '荷兰咖啡文化成熟，这杯水准稳定' },
    { id: 'ams7', cat: 'drink', emoji: '🍺', name: '海尼根生啤',    nameEn: 'Heineken Draft',            price:  6, desc: '发源地喝和其他地方不一样，新鲜度有区别', hot: true },
    { id: 'ams8', cat: 'main',  emoji: '🍟', name: '荷式薯条',      nameEn: 'Patatje Oorlog',            price:  7, desc: '厚切薯条浇蛋黄酱、沙嗲酱和生洋葱，名字直译是"战争薯条"，乱得好吃', hot: true },
    { id: 'ams9', cat: 'side',  emoji: '🧀', name: '陈年高达奶酪',  nameEn: 'Aged Gouda',                price:  6, desc: '奶酪市场现切的老高达，结晶颗粒感，咸香浓郁，配芥末最好' },
    { id: 'ams10', cat: 'main', emoji: '🥞', name: '荷兰厚松饼',    nameEn: 'Pannenkoek',                price:  8, desc: '盘子那么大的荷兰薄煎饼，可甜可咸，培根配糖浆是经典邪道吃法' },
    { id: 'ams_c1', cat: 'main', emoji: '🍲', name: '荷式豌豆汤',   nameEn: 'Snert',                     price:  9, desc: '浓到勺子能立住的豌豆汤，配烟熏香肠和黑麦面包，运河结冰时的家常暖汤', chefLevel: 3 },
    { id: 'ams_p1', cat: 'main', emoji: '🦞', name: '白酒煮青口',   nameEn: 'Mosselen',                  price: 24, desc: '泽兰青口白葡萄酒煮，配薯条和蒜香蛋黄酱，一大锅——他兴致来了才张罗的', chefLevel: 6 },
  ],

  paris: [
    { id: 'par1', cat: 'main',  emoji: '🥐', name: '火腿奶酪可颂',  nameEn: 'Jambon-Fromage Croissant',  price:  9, desc: '巴黎街头最常见的午餐，酥皮可颂夹火腿埃曼塔奶酪' },
    { id: 'par2', cat: 'main',  emoji: '🍲', name: '法式洋葱汤',    nameEn: 'Soupe à l\'Oignon',         price: 10, desc: '慢炒洋葱配牛肉高汤，表面奶酪焗到起泡，暖胃', hot: true },
    { id: 'par3', cat: 'main',  emoji: '🥩', name: '法式煎牛排',    nameEn: 'Steak Frites',              price: 18, desc: '七分熟，配手切薯条，法式芥末酱，经典搭配' },
    { id: 'par4', cat: 'side',  emoji: '🥐', name: '黄油可颂',      nameEn: 'Croissant au Beurre',       price:  4, desc: '巴黎烘焙坊出品，层次分明，奶油味足，早晚都能吃' },
    { id: 'par5', cat: 'side',  emoji: '🧁', name: '马卡龙礼盒',    nameEn: 'Macarons',                  price:  8, desc: '法式杏仁饼，六颗装，口味看当天，不是超甜那种' },
    { id: 'par6', cat: 'drink', emoji: '☕', name: '浓缩咖啡',      nameEn: 'Café Espresso',             price:  3, desc: '法式小杯，站在吧台喝，一口下去，清醒' },
    { id: 'par10', cat: 'main',  emoji: '🥖', name: '火腿黄油三明治', nameEn: 'Jambon-Beurre',            price:  7, desc: '一截长棍面包，抹厚黄油夹火腿，简单到极致，法国人日常的午餐之王', hot: true },
    { id: 'par8', cat: 'main',  emoji: '🧅', name: '法式洋葱汤',    nameEn: 'Soupe à l\'Oignon',         price:  9, desc: '洋葱慢炒到焦糖色熬汤，盖厚面包和格鲁耶尔奶酪烤到融化拉丝，冬夜救赎' },
    { id: 'par9', cat: 'side',  emoji: '🥞', name: '可丽饼',        nameEn: 'Crêpe Sucrée',              price:  5, desc: '街边现摊的薄可丽饼，抹榛子酱或撒糖挤柠檬，边走边吃' },
    { id: 'par_c1', cat: 'main', emoji: '🍳', name: '奶油蘑菇烘蛋', nameEn: 'Omelette aux Champignons',  price:  8, desc: '外层微焦内里流心的法式厚蛋，裹奶油蘑菇，看着简单最考功夫，他学厨时练过千百遍', chefLevel: 3 },
    { id: 'par_p1', cat: 'main', emoji: '🍷', name: '红酒烩牛肉',   nameEn: 'Bœuf Bourguignon',          price: 26, desc: '勃艮第红酒炖牛肉，配培根蘑菇珍珠洋葱，炖足三小时——他给你煮过的那道法式经典', chefLevel: 6 },
    { id: 'par7', cat: 'drink', emoji: '🍷', name: '红酒',          nameEn: 'Vin Rouge',                 price:  8, desc: '餐厅推荐的当日酒款，不贵，但喝得出用心', hot: true },
  ],

  dublin: [
    { id: 'dub1', cat: 'main',  emoji: '🥘', name: '爱尔兰炖羊肉',  nameEn: 'Irish Stew',               price: 13, desc: '羊肉、土豆、胡萝卜慢炖，配棕色苏打面包，暖透', hot: true },
    { id: 'dub2', cat: 'main',  emoji: '🥧', name: '肉馅饼配薯泥',  nameEn: 'Shepherd\'s Pie',          price: 11, desc: '羊肉馅配奶油薯泥烤表层，家常料理，踏实' },
    { id: 'dub3', cat: 'main',  emoji: '🍳', name: '爱尔兰全早餐',  nameEn: 'Full Irish Breakfast',      price: 10, desc: '培根、煎蛋、黑白布丁、炒豆、土司，爱尔兰版全英早餐' },
    { id: 'dub4', cat: 'side',  emoji: '🍟', name: '薯条配醋',      nameEn: 'Chips & Vinegar',           price:  5, desc: '麦芽醋浇薯条，爱尔兰人的固执，不接受其他酱' },
    { id: 'dub5', cat: 'drink', emoji: '🍺', name: '健力士生啤',    nameEn: 'Guinness Draft',            price:  7, desc: '发源地的健力士和其他地方确实不一样，倒法也有讲究', hot: true },
    { id: 'dub10', cat: 'main',  emoji: '🐟', name: '炸鱼薯条',      nameEn: 'Fish & Chips',              price: 11, desc: '都柏林海边老店，新鲜鳕鱼裹脆浆现炸，报纸一包，撒盐和麦芽醋', hot: true },
    { id: 'dub7', cat: 'main',  emoji: '🥔', name: '培根卷心菜配土豆泥', nameEn: 'Bacon & Cabbage',      price: 10, desc: '爱尔兰最家常的一锅，咸培根煮卷心菜配黄油土豆泥，朴实到骨子里' },
    { id: 'dub8', cat: 'side',  emoji: '🍞', name: '苏打面包',      nameEn: 'Soda Bread',                price:  4, desc: '不用酵母的爱尔兰快速面包，外壳硬实内里绵密，抹黄油配汤最好' },
    { id: 'dub9', cat: 'side',  emoji: '🥧', name: '贝利芝士蛋糕',  nameEn: 'Baileys Cheesecake',        price:  6, desc: '掺了贝利甜酒的芝士蛋糕，奶香里透着酒香，爱尔兰式的甜蜜收尾' },
    { id: 'dub_c1', cat: 'main', emoji: '🥣', name: '海鲜杂烩浓汤',  nameEn: 'Seafood Chowder',           price: 10, desc: '奶油底熬鲑鱼、青口和土豆，配苏打面包蘸着吃，西海岸渔村家常，他说阴雨天就该喝这个', chefLevel: 3 },
    { id: 'dub_p1', cat: 'main', emoji: '🥩', name: '黑啤炖牛肉',   nameEn: 'Guinness Beef Stew',        price: 24, desc: '健力士黑啤慢炖牛肋肉，浓稠挂勺配根茎菜，炖到肉一抿就化——他难得下厨的招牌', chefLevel: 6 },
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
    { id: 'tky9', cat: 'main',  emoji: '🍗', name: '日式炸鸡',      nameEn: 'Karaage',                   price:  9, desc: '腌了姜蒜酱油的鸡块裹淀粉炸得外脆多汁，居酒屋头牌，配啤酒绝配', hot: true },
    { id: 'tky10', cat: 'main', emoji: '🥟', name: '煎饺',          nameEn: 'Gyoza',                     price:  7, desc: '底面煎脆的猪肉白菜饺子，配醋和辣油，拉面店的黄金搭档' },
    { id: 'tky11', cat: 'side', emoji: '🐙', name: '章鱼烧',        nameEn: 'Takoyaki',                  price:  6, desc: '外软内嫩的章鱼小丸子，浇酱汁撒木鱼花，刚出炉烫嘴也停不下来' },
    { id: 'tky12', cat: 'side', emoji: '🥮', name: '铜锣烧',        nameEn: 'Dorayaki',                  price:  4, desc: '两片蜂蜜松饼夹红豆馅，甜而不腻，哆啦A梦最爱的那个' },
    { id: 'tky_c1', cat: 'main', emoji: '🍲', name: '关东煮',       nameEn: 'Oden',                      price:  9, desc: '昆布高汤慢煮萝卜、鸡蛋、鱼糕和魔芋，越煮越入味，他驻训时便利店常买的暖胃夜宵', chefLevel: 3 },
    { id: 'tky_p1', cat: 'main', emoji: '🍱', name: '怀石便当',     nameEn: 'Kaiseki Bento',             price: 28, desc: '一格一格精致摆盘的时令怀石，刺身、天妇罗、玉子烧样样讲究——他认真起来的手艺', chefLevel: 6 },
  ],
};


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 统一计价（菜品倍率 + 职业折扣 + 配送费减免）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _calcTakeoutPrice(item) {
  const fee = getTakeoutFee();
  let itemPrice = Math.round(item.price * TAKEOUT_PRICE_MULTIPLIER);
  let deliveryFee = fee.fee;
  const discount = typeof getCareerTakeoutDiscount === 'function' ? getCareerTakeoutDiscount() : 0;
  if (discount > 0) itemPrice = Math.round(itemPrice * (1 - discount / 100) * 100) / 100;
  if (typeof isCareerFreeDeliveryTakeout === 'function' && isCareerFreeDeliveryTakeout()) deliveryFee = 0;
  return { itemPrice, deliveryFee, total: itemPrice + deliveryFee, fee };
}


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
  // 厨师专属菜：非厨师 / 等级不够 → 不显示（chefLevel 字段控制）
  const _isChefTk = typeof getCareer === 'function' && getCareer() === 'chef';
  const _chefLvTk = _isChefTk && typeof getCareerLevel === 'function' ? getCareerLevel() : 0;
  const items = menu.filter(m => {
    if (m.cat !== _menuTab) return false;
    if (m.chefLevel) return _isChefTk && _chefLvTk >= m.chefLevel;
    return true;
  });
  const cats  = { main: '正餐', side: '小食', drink: '饮品' };

  const banner = coldWar
    ? `<div style="background:#fff0f0;border:1px solid #f0b0b0;border-radius:10px;padding:9px 14px;margin-bottom:12px;font-size:12px;color:#b02020;text-align:center;">❄️ 冷战期间无法点外卖</div>`
    : count >= 3
    ? `<div style="background:#fff8e8;border:1px solid #e8d060;border-radius:10px;padding:9px 14px;margin-bottom:12px;font-size:12px;color:#a07020;text-align:center;">今天已点了 ${count} 次，明天再来吧</div>`
    : hasActive
    ? `<div style="background:#fff8e8;border:1px solid #e8d060;border-radius:10px;padding:9px 14px;margin-bottom:12px;font-size:12px;color:#a07020;text-align:center;">🛵 外卖配送中，送达后才能再点</div>`
    : '';

  const cards = items.map(item => {
    const calc      = _calcTakeoutPrice(item);
    const canAfford = bal >= calc.total;
    const hasDiscount = calc.itemPrice < Math.round(item.price * TAKEOUT_PRICE_MULTIPLIER);
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
          ${item.chefLevel ? `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:#f0d0f0;color:#802080;font-weight:600;">👩‍🍳 厨师专属</span>` : ''}
          ${hasDiscount ? `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:#e0f0d0;color:#3a7020;font-weight:600;">厨师折扣</span>` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0;">
        <div style="font-size:16px;font-weight:700;color:#c47010;">${hasDiscount ? `<span style="text-decoration:line-through;font-size:12px;color:#b09060;">£${Math.round(item.price * TAKEOUT_PRICE_MULTIPLIER)}</span> ` : ''}£${calc.itemPrice}</div>
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
  const allOrders = JSON.parse(localStorage.getItem('takeoutOrders') || '[]');
  const active = allOrders.filter(o => !o.done);
  const completed = allOrders.filter(o => o.done).slice(0, 5); // 最近5条已完成

  if (!active.length && !completed.length) {
    body.innerHTML = `<div style="padding:48px 24px;text-align:center;"><div style="font-size:40px;margin-bottom:14px;">🛵</div><div style="font-size:14px;color:#a07020;">暂无配送记录</div></div>`;
    return;
  }

  let html = '';

  // 配送中
  if (active.length) {
    const now = Date.now();
    html += active.map(order => {
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

  // 已送达（最近5条）
  if (completed.length) {
    html += `<div style="padding:12px 16px 4px;"><div style="font-size:12px;font-weight:700;color:#a07020;letter-spacing:1px;">已送达</div></div>`;
    html += completed.map(order => {
      const doneTime = order.doneAt ? new Date(order.doneAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : '';
      const doneDate = order.doneAt ? new Date(order.doneAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '';
      return `<div style="padding:6px 16px;">
        <div style="background:#f8f5ee;border:1px solid #e8dfc0;border-radius:12px;padding:12px;display:flex;align-items:center;gap:10px;">
          <div style="font-size:24px;">${order.emoji}</div>
          <div style="flex:1;">
            <div style="font-size:12px;font-weight:600;color:#3a2000;">${order.name}</div>
            <div style="font-size:10px;color:#a07020;margin-top:2px;">£${(order.price + (order.fee || 0)).toFixed(2)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:10px;color:#5a9a46;font-weight:600;">✅ 已送达</div>
            <div style="font-size:10px;color:#b0a080;margin-top:2px;">${doneDate} ${doneTime}</div>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  body.innerHTML = html;
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
  const calc = _calcTakeoutPrice(item);

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
          <span style="color:#a07020;">菜品</span><span style="color:#3a2000;font-weight:600;">£${calc.itemPrice.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:7px;">
          <span style="color:#a07020;">${calc.fee.label}${calc.deliveryFee === 0 ? ' (免)' : ''}</span><span style="color:#3a2000;font-weight:600;">£${calc.deliveryFee.toFixed(2)}</span>
        </div>
        <div style="border-top:1px dashed #e8c97a;padding-top:8px;display:flex;justify-content:space-between;font-size:14px;">
          <span style="color:#5a3000;font-weight:700;">合计</span><span style="color:#c47010;font-weight:700;">£${calc.total.toFixed(2)}</span>
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

let _isOrdering = false; // 防连点锁

function addTakeoutOrder(city, item) {
  if (_isOrdering) return false;
  _isOrdering = true;
  setTimeout(() => { _isOrdering = false; }, 2000); // 2秒后解锁

  const calc = _calcTakeoutPrice(item);
  const total = calc.total;

  if (typeof showCardSelector === 'function') {
    showCardSelector(total, item.name,
      () => {
        const bal = getBalance();
        if (bal < total) { if (typeof showToast === 'function') showToast('余额不足'); _isOrdering = false; return false; }
        // 修复：加上 setBalance 立刻刷新余额显示
        // 旧版只有 addTransaction 没有 setBalance，用户看到余额没变，以为没扣成功，重复点单导致双倍扣款
        if (typeof setBalance === 'function') setBalance(bal - total);
        addTransaction({ icon: item.emoji, name: `外卖 · ${item.name}`, amount: -total });
        if (typeof showToast === 'function') showToast(`🛵 已下单！· 已扣款 £${total.toFixed(0)}`);
        if (typeof renderWallet === 'function') renderWallet();
        _finishTakeoutOrder(city, item, calc);
      },
      () => {
        if (!spendGhostCard(total, item.name, 'daily')) { if (typeof showToast === 'function') showToast('Ghost Card 额度不足'); _isOrdering = false; return false; }
        _finishTakeoutOrder(city, item, calc);
      }
    );
  } else {
    const bal = getBalance();
    if (bal < total) { if (typeof showToast === 'function') showToast('余额不足'); _isOrdering = false; return false; }
    // 修复：同步补上 setBalance，与选卡路径保持一致
    if (typeof setBalance === 'function') setBalance(bal - total);
    addTransaction({ icon: item.emoji, name: `外卖 · ${item.name}`, amount: -total });
    if (typeof showToast === 'function') showToast(`🛵 已下单！· 已扣款 £${total.toFixed(0)}`);
    if (typeof renderWallet === 'function') renderWallet();
    _finishTakeoutOrder(city, item, calc);
  }
  return true;
}

function _finishTakeoutOrder(city, item, calc) {
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
    price:     calc.itemPrice,       // 实际菜品价（含倍率+折扣）
    fee:       calc.deliveryFee,     // 实际配送费（含减免）
    feeLabel:  calc.fee.label,
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
  _renderTabBar();
  const body = document.getElementById('takeoutBody');
  if (body) _renderTrackingTab(body);

  // 定时自动检查送达（到时间 +3秒 主动触发，不依赖外部轮询）
  setTimeout(() => checkTakeoutUpdates(), deliverInMs + 3000);

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

async function onGhostReceivedTakeout(order, force = false) {
  if (typeof showToast === 'function') showToast(`✅ ${order.emoji} ${order.name} 已送到 Ghost！`);

  // ── 外卖台词防重复池 ────────────────────────────────────
  const _getTakeoutPool = () => JSON.parse(localStorage.getItem('takeoutReplyPool') || '[]');
  const _saveTakeoutPool = (pool) => localStorage.setItem('takeoutReplyPool', JSON.stringify(pool.slice(-5)));
  const _recentTakeoutLines = _getTakeoutPool().map(l => `"${l}"`).join(', ');
  const _noRepeatHint = _recentTakeoutLines
    ? `\n\nDo not reuse or echo these recent lines: ${_recentTakeoutLines}. Vary your phrasing, angle, and reaction completely.`
    : '';

  // 判断用户有没有提前说过要点外卖
  // 关键词收紧：避免 '送'/'点了' 这种日常词误判
  const kw = [(order.nameEn || '').toLowerCase(), '外卖', '点外卖', '给你点', '给你买', '点了吃的', 'takeout', 'ordered food', 'ordered you'];
  const told = (chatHistory || []).filter(m => m.role === 'user' && !m._system).slice(-20)
    .some(m => kw.some(k => k && (m.content || '').toLowerCase().includes(k)));

  const container = document.getElementById('messagesContainer');
  if (!container) {
    // 不在聊天页面，存起来下次触发（不提前写 chatHistory，防止未卜先知）
    const pending = JSON.parse(localStorage.getItem('pendingTakeoutReactions') || '[]');
    pending.push({ order, savedAt: Date.now() });
    localStorage.setItem('pendingTakeoutReactions', JSON.stringify(pending));
    return;
  }

  // 在聊天页面才注入 system 消息，防止用户不在场时 Ghost 已经"知道收到了"
  if (typeof chatHistory !== 'undefined') {
    chatHistory.push({
      role: 'user',
      content: told
        ? `[Her takeout just arrived — 「${order.nameEn || order.name}」. You have it. If she asks, confirm you received it.]`
        : `[A takeout delivery just showed up — 「${order.nameEn || order.name}」. You didn't know she was ordering. You have it now. If she asks, confirm you received it.]`,
      _system: true,
    });
    const _realMsgs = chatHistory.filter(m => !m._system && !m._recalled && m.role && m.content);
    if (_realMsgs.length > 0 && typeof saveHistory === 'function') saveHistory();
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

      // 写进长期记忆（带时间戳，24小时后自动过期）
      try {
        const _ltm  = localStorage.getItem('longTermMemory') || '';
        const _now  = Date.now();
        const _dateStr = new Date(_now).toISOString().split('T')[0];
        const _note = told
          ? `[${_dateStr}] She ordered takeout for you — 「${order.nameEn || order.name}」. It arrived. You have it. Confirm if she asks.`
          : `[${_dateStr}] Takeout showed up — 「${order.nameEn || order.name}」. You didn't know she ordered it. You have it now. Confirm if she asks.`;
        // 清理超过24小时的外卖记录，防止日记/对话一直提到旧外卖
        const _cutoff = new Date(_now - 24 * 3600 * 1000).toISOString().split('T')[0];
        const _cleanedLtm = _ltm.split('\n').filter(line => {
          const _m = line.match(/^\[(\d{4}-\d{2}-\d{2})\]/);
          if (!_m) return true; // 没有日期标记的行保留
          const _isTakeoutLine = /takeout|ordered food|ordered you/i.test(line);
          if (_isTakeoutLine && _m[1] < _cutoff) return false; // 超过24小时的外卖记录删除
          return true;
        }).join('\n');
        if (!_cleanedLtm.includes(order.nameEn || order.name)) {
          localStorage.setItem('longTermMemory', (_cleanedLtm + '\n' + _note).trim().slice(-2000));
          if (typeof touchLocalState === 'function') touchLocalState();
        }
      } catch(e) {}

      // Ghost 用 S 说一句反应（调情中存 pending 不打断）
      // 修复(#23)：从 pendingTakeoutReactions 回放时 force=true，绕过调情判断，
      // 否则 checkPendingTakeoutReactions 又调本函数、又因 _isFlirting 为 true 重新
      // 存回 pending，无限推迟，签收回复永远不出现（外卖显示签收但聊天没反应）。
      const _isFlirting = !force && (sessionStorage.getItem('loveOverride') === 'true'
        || (chatHistory || []).slice(-4).some(m => m._intimate));
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
          // 优先 Sonnet（质量好），超时降级 Haiku（快），都失败走兜底
          let _reply = '';
          try {
            // 修复：_prompt 是系统指令不是用户消息，放进 system 里
            // 用完整人设而不是轻量版，防止模型出戏（"appreciate it, simon"这类）
            const _takeoutSystem = (typeof buildGhostStyleCore === 'function' ? buildGhostStyleCore() : '')
              + '\n' + _prompt;
            const _res = await fetchWithTimeout('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: typeof getMainModel === 'function' ? getMainModel() : 'claude-sonnet-4-6',
                max_tokens: 100,
                system: _takeoutSystem,
                messages: [
                  ...(chatHistory || []).filter(m => !m._system).slice(-6),
                  { role: 'user', content: '[food just arrived. react.]' }
                ]
              })
            }, 25000);
            const _data = await _res.json();
            _reply = (_data.content?.[0]?.text || '').trim();
          } catch(e) {
            console.warn('[外卖] Sonnet超时，降级Haiku:', e.message || e);
          }

          // Sonnet 失败或破防 → Haiku 兜底
          const _bad = ["i'm claude","i am claude","as an ai","can't roleplay","anthropic"];
          if (!_reply || _bad.some(p => _reply.toLowerCase().includes(p))) {
            try {
              const _res2 = await fetchWithTimeout('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'claude-haiku-4-5-20251001',
                  max_tokens: 80,
                  system: _takeoutSystem,
                  messages: [
                    ...(chatHistory || []).filter(m => !m._system).slice(-4),
                    { role: 'user', content: '[food just arrived. react.]' }
                  ]
                })
              }, 10000);
              const _data2 = await _res2.json();
              const _r2 = (_data2.content?.[0]?.text || '').trim();
              if (_r2 && !_bad.some(p => _r2.toLowerCase().includes(p))) _reply = _r2;
            } catch(e2) {
              console.warn('[外卖] Haiku也失败:', e2.message || e2);
            }
          }
          let _line = '';
          if (_reply && !_bad.some(p => _reply.toLowerCase().includes(p))) {
            _line = _reply.split('\n').slice(0, 2).join('\n');
          }
          // API 失败或破防时兜底
          if (!_line) {
            const _fallbacks = [
              `${order.nameEn || order.name} just got here. still warm.\nyou didn't have to. but i'm not complaining.`,
              `it's here — ${order.nameEn || order.name}.\nyou were thinking about me. noted.`,
              `${order.nameEn || order.name} arrived. smells good.\nyou keep doing this. i keep letting you.`,
              `got the ${order.nameEn || order.name}.\ndidn't expect it. sitting down to eat now.`,
              `${order.nameEn || order.name}, still hot.\nyou always know when i haven't eaten.`,
            ];
            _line = _fallbacks[Math.floor(Math.random() * _fallbacks.length)];
          }
          if (typeof appendMessage === 'function') appendMessage('bot', _line);
          // 存入防重复池
          const _pool = _getTakeoutPool(); _pool.push(_line); _saveTakeoutPool(_pool);
          if (typeof chatHistory !== 'undefined') {
            chatHistory.push({ role: 'assistant', content: _line });
            const _realMsgs = chatHistory.filter(m => !m._system && !m._recalled && m.role && m.content);
            if (_realMsgs.length > 0 && typeof saveHistory === 'function') saveHistory();
            if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
          }
        } catch(e) {
          console.warn('[外卖] 回复生成失败:', e);
          // 网络错误也兜底
          const _fb = [`it's here. still warm. you didn't have to.`, `got it — sitting down to eat now. thanks, love.`, `arrived safe. you always know when i'm hungry.`];
          const _fallbackLine = _fb[Math.floor(Math.random() * _fb.length)];
          if (typeof appendMessage === 'function') appendMessage('bot', _fallbackLine);
          if (typeof chatHistory !== 'undefined') {
            chatHistory.push({ role: 'assistant', content: _fallbackLine });
            if (typeof saveHistory === 'function') saveHistory();
          }
        }
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
      setTimeout(() => onGhostReceivedTakeout(item.order, true), idx * 4000);
    });
  } catch(e) {}
}

// 用户切回聊天页时自动触发 pending + 检查送达
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      setTimeout(checkTakeoutUpdates, 500);
      setTimeout(checkPendingTakeoutReactions, 1000);
    }
  });
  // 每60秒检查一次送达（防止setTimeout因页面休眠被吞）
  setInterval(() => {
    const hasActive = JSON.parse(localStorage.getItem('takeoutOrders') || '[]').some(o => !o.done);
    if (hasActive) checkTakeoutUpdates();
  }, 60000);
}
