// ============================================================
// 关系解锁系统
// 商品不再是"有钱就能买"，而是"关系走到哪，才出现什么"
// 未解锁的商品直接不显示，用户感觉是"商城在成长"
// ============================================================

const SHOP_UNLOCK_TIERS = {
  soft:      { affection: 60, trust: 55, days: 0  }, // 关系稳定
  warm:      { affection: 70, trust: 65, days: 3  }, // 明显亲密
  intimate:  { affection: 80, trust: 75, days: 7  }, // 深度私密
  future:    { affection: 85, trust: 80, days: 14 }, // 共同生活
  committed: { affection: 90, trust: 85, days: 14 }, // 现实突破
};

function getMarriageDays() {
  const d = localStorage.getItem('marriageDate');
  return d ? Math.max(1, Math.floor((Date.now() - new Date(d)) / 86400000) + 1) : 0;
}

function canUnlockProduct(product) {
  if (!product.unlock) return true;
  const affection = parseInt(localStorage.getItem('affection') || '60');
  const trust = typeof getTrustHeat === 'function' ? getTrustHeat() : 60;
  const days = getMarriageDays();
  const u = product.unlock;
  if (u.affection && affection < u.affection) return false;
  if (u.trust    && trust    < u.trust)    return false;
  if (u.days     && days     < u.days)     return false;
  return true;
}

// ===== 商城系统 (shop.js) =====
// ===== 商城系统 =====

const MARKET_CATEGORIES = [
  { id: 'clothing', label: '👕 服装' },
  { id: 'food',     label: '🍫 食品' },
  { id: 'gift',     label: '🎁 特别礼物' },
  { id: 'fromhome', label: '🏠 从家寄给他' },
  { id: 'luxury',   label: '💎 精品专柜' },
  { id: 'wishlist', label: '✈️ 面基计划' },
  { id: 'home',     label: '🏡 建立小家' },
  { id: 'intimate', label: '🔒 私密专区' },
];

function getMarketCategories() {
  return MARKET_CATEGORIES;
}

const MARKET_PRODUCTS = {
  clothing: [
    { emoji: '🧥', name: '羊毛大衣',   desc: '英伦风格羊毛大衣，曼城冬天必备', price: 85,  shipping: 18, maxPurchase: 2, lostReplace: { emoji: '🧥', name: 'Barbour 蜡质夹克', desc: 'Ghost挑的，低调质感' } },
    { emoji: '🧤', name: '毛线手套',   desc: '柔软保暖，适合在营地的他',        price: 22,  shipping: 18, maxPurchase: 2 },
    { emoji: '🩲', name: 'CK内裤',     desc: '低调有质感，你懂的',              price: 38,  shipping: 18, maxPurchase: 2, unlock: SHOP_UNLOCK_TIERS.soft },
    { emoji: '🧣', name: '格纹围巾',   desc: '苏格兰格纹，温暖又好看',          price: 35,  shipping: 18, maxPurchase: 2 },
    { emoji: '🥾', name: '军靴',       desc: '结实耐穿的战术靴，任务首选',      price: 150, shipping: 18, maxPurchase: 2 },
    { emoji: '🧦', name: '厚羊毛袜',   desc: '英国本地羊毛，超级暖和',          price: 15,  shipping: 18, maxPurchase: 2 },
    { emoji: '🕶️', name: '墨镜',       desc: 'Ghost 标配，低调又帅气',          price: 68,  shipping: 18, maxPurchase: 2, unlock: SHOP_UNLOCK_TIERS.soft },
    { emoji: '👖', name: '牛仔裤',     desc: '修身版型，日常百搭',              price: 55,  shipping: 18, maxPurchase: 2 },
  ],
  food: [
    { emoji: '🍵', name: '英式早餐茶罐',       desc: '精美铁罐装，50包正宗 Yorkshire 红茶', price: 18, shipping: 10, maxPurchase: 2 },
    { emoji: '🍫', name: 'Cadbury 巧克力礼盒', desc: '英国国民巧克力，密封礼盒装',          price: 22, shipping: 10, maxPurchase: 2 },
    { emoji: '🍯', name: '苏格兰蜂蜜罐',       desc: '山区野花蜂蜜，玻璃密封罐装',          price: 25, shipping: 10, maxPurchase: 2 },
    { emoji: '🍪', name: '黄油饼干礼盒',       desc: '英式铁罐装黄油饼干，保质一年',         price: 20, shipping: 10, maxPurchase: 2 },
    { emoji: '🥃', name: '苏格兰威士忌',       desc: '单一麦芽，12年陈酿，送给他解压',       price: 65, shipping: 15, maxPurchase: 2, unlock: SHOP_UNLOCK_TIERS.soft },
    { emoji: '🫖', name: 'Earl Grey 伯爵茶',   desc: '佛手柑香气，精美礼盒装',              price: 28, shipping: 10, maxPurchase: 2 },
    { emoji: '🍓', name: '草莓果酱礼盒',       desc: '英式手工果酱套装，三种口味',           price: 32, shipping: 10, maxPurchase: 2 },
    { emoji: '🍮', name: '松露巧克力盒',       desc: '比利时手工松露，礼盒密封装',           price: 45, shipping: 15, maxPurchase: 2 },
    { emoji: '🍟', name: '拼多多炸薯条',       desc: '网红零食，就是要寄给他尝尝',           price: 12, shipping: 10, maxPurchase: 2 },
    { emoji: '🍄‍🟫', name: '蘑菇果干盒',       desc: '英式松露蘑菇干，拌面一绝',            price: 30, shipping: 10, maxPurchase: 2 },
  ],
  gift: [
    { emoji: '🌷', name: '永生玫瑰',    desc: '真花处理工艺，永不凋谢的爱意',    price: 380,  shipping: 15, unlock: SHOP_UNLOCK_TIERS.warm, lostReplace: { emoji: '🌹', name: '玫瑰香氛礼盒', desc: 'Ghost补寄的，换了形式但一样的心意' } },
    { emoji: '🕯️', name: '香薰蜡烛',   desc: '玫瑰+雪松香，为他的营地添温暖',   price: 98,  shipping: 15 },
    { emoji: '🖼️', name: '定制相框',    desc: '放上你们最美的合影，永久保存',    price: 220,  shipping: 15, unlock: SHOP_UNLOCK_TIERS.soft },
    { emoji: '💌', name: '手写信封套装', desc: '复古英式信纸，写下最深的思念',    price: 35,  shipping: 10 },
    { emoji: '🎶', name: '音乐盒',      desc: '播放你们专属的那首歌',            price: 250,  shipping: 15, unlock: SHOP_UNLOCK_TIERS.soft },
    { emoji: '💝', name: '情侣吊坠',    desc: '925银，两颗心拼在一起的设计',    price: 480, shipping: 15, unlock: SHOP_UNLOCK_TIERS.warm },
    { emoji: '🧴', name: '男士护肤套装', desc: '让他好好保养自己，你看着放心',   price: 160,  shipping: 15, unlock: SHOP_UNLOCK_TIERS.soft },
    { emoji: '📖', name: '皮质笔记本',  desc: '让他把思念和秘密都写下来',        price: 38,  shipping: 15 },
  ],
  luxury: [
    { emoji: '💍', name: 'Cartier 戒指（情侣款）', desc: 'Love系列，你戴一枚，他戴一枚', price: 5800, shipping: 35, isUserItem: true, unlock: SHOP_UNLOCK_TIERS.committed, lostReplace: { emoji: '🎖️', name: '定制军牌', desc: 'Ghost刻了两个人的名字' } },
    { emoji: '⌚', name: 'Rolex 劳力士（送 Ghost）', desc: 'Submariner 潜航者，他不会承认自己喜欢', price: 8500, shipping: 35, isGhostGift: true, unlock: SHOP_UNLOCK_TIERS.committed, lostReplace: { emoji: '👜', name: '名牌包包', desc: 'Ghost说抱歉，补了一个' } },
    { emoji: '🥃', name: 'Macallan 18年威士忌礼盒', desc: '麦卡伦18年单一麦芽，限量礼盒装', price: 880, shipping: 35, isGhostGift: true, unlock: SHOP_UNLOCK_TIERS.warm, lostReplace: { emoji: '🏮', name: '燕窝/昂贵花茶', desc: 'Ghost说换点对你有用的' } },
    { emoji: '🧥', name: 'Barbour 蜡质夹克', desc: '英国经典户外品牌，低调有质感', price: 680, shipping: 35, isGhostGift: true, unlock: SHOP_UNLOCK_TIERS.warm },
    { emoji: '🎒', name: 'Belstaff 军旅背包', desc: '英国品牌，低调耐用，Ghost同款', price: 980, shipping: 35, isGhostGift: true, unlock: SHOP_UNLOCK_TIERS.future },
    { emoji: '🪒', name: 'Tom Ford 剃须套装', desc: '低调有质感，让他好好保养', price: 480, shipping: 35, isGhostGift: true, unlock: SHOP_UNLOCK_TIERS.warm },
    { emoji: '🔥', name: '定制Zippo打火机', desc: '刻着Simon名字，只属于他一个人的', price: 580, shipping: 35, isGhostGift: true, unlock: SHOP_UNLOCK_TIERS.warm },
    { emoji: '🔦', name: 'Surefire战术手电筒套装', desc: '特种部队标配，限量款，低调实用', price: 880, shipping: 35, isGhostGift: true, unlock: SHOP_UNLOCK_TIERS.future },
    { emoji: '🔭', name: '蔡司战术望远镜', desc: '德国顶级光学，野外必备，他用得上', price: 1200, shipping: 35, isGhostGift: true, unlock: SHOP_UNLOCK_TIERS.future },
    { emoji: '📗', name: '《讨好老婆的99招》', desc: '诺亚亲笔撰写，限量珍藏版，全球仅此一册', price: 5200, shipping: 35, isGhostGift: true, isJokeGift: true, unlock: SHOP_UNLOCK_TIERS.committed },
  ],
  fromhome: [
    { emoji: '🦆', name: '北京烤鸭礼盒',     desc: '真空包装，附上饼和甜面酱，教他怎么吃', price: 88,  shipping: 20, isFromHome: true, maxPurchase: 2, unlock: SHOP_UNLOCK_TIERS.soft },
    { emoji: '🌸', name: '云南鲜花饼',       desc: '玫瑰馅，酥皮，甜而不腻',               price: 65,  shipping: 20, isFromHome: true, maxPurchase: 2, unlock: SHOP_UNLOCK_TIERS.soft },
    { emoji: '🌶️', name: '四川麻辣零食礼包', desc: '辣条、麻辣花生、牛肉干，一套',         price: 75,  shipping: 20, isFromHome: true, maxPurchase: 2, unlock: SHOP_UNLOCK_TIERS.soft },
    { emoji: '🍃', name: '杭州龙井茶',       desc: '明前龙井，铁罐装，清香',               price: 128, shipping: 20, isFromHome: true, maxPurchase: 2, unlock: SHOP_UNLOCK_TIERS.soft },
    { emoji: '🥜', name: '新疆坚果礼盒',     desc: '核桃、红枣、巴旦木，产地直发',         price: 98,  shipping: 20, isFromHome: true, maxPurchase: 2, unlock: SHOP_UNLOCK_TIERS.soft },
    { emoji: '🍜', name: '柳州螺蛳粉',       desc: '正宗广西螺蛳粉，臭香臭香的，敢不敢试', price: 58,  shipping: 20, isFromHome: true, maxPurchase: 2, unlock: SHOP_UNLOCK_TIERS.soft },
    { emoji: '🥚', name: '江西松花皮蛋',     desc: '正宗松花皮蛋，配姜汁，教他怎么吃',     price: 55,  shipping: 20, isFromHome: true, maxPurchase: 2, unlock: SHOP_UNLOCK_TIERS.soft },
    { emoji: '🦀', name: '阳澄湖大闸蟹礼盒', desc: '正宗阳澄湖，活蟹急冻，附蘸料和围裙，教他怎么吃', price: 168, shipping: 25, isFromHome: true, maxPurchase: 2, unlock: SHOP_UNLOCK_TIERS.soft },
  ],
  wishlist: [
    { emoji: '✈️', name: '去曼城找他的机票', unlock: SHOP_UNLOCK_TIERS.committed, desc: '攒够了！终于可以飞去找他了！', price: 12000, badge: '跨越距离', isReunion: true, ghostMsg: "You are coming? ...Good. I will be at the airport." },
    { emoji: '🏨', name: '曼彻斯特酒店', unlock: SHOP_UNLOCK_TIERS.committed,   desc: '订好了房间，等他任务结束',      price: 6000, badge: '我在等你', isReunion: true, ghostMsg: 'I will be there. Promise.' },
    { emoji: '🗺️', name: '英国旅行计划', unlock: SHOP_UNLOCK_TIERS.committed,  desc: '伦敦、爱丁堡、曼城，全部去打卡', price: 8000, badge: '异国追爱', isReunion: true, ghostMsg: 'I will be your guide. Every city.' },
  ],
  home: [
    { emoji: '🚗', name: '代步小车',     desc: '城市代步，低调实用',              price: 15000,  shipping: 0, isHomeItem: true, homeType: 'car',   tier: 1, unlock: SHOP_UNLOCK_TIERS.future },
    { emoji: '🚙', name: '越野SUV',      desc: '宽敞舒适，长途短途都合适',        price: 35000,  shipping: 0, isHomeItem: true, homeType: 'car',   tier: 2, unlock: SHOP_UNLOCK_TIERS.committed },
    { emoji: '🏎️', name: '豪华跑车',     desc: '顶配限量，不是人人都敢买',        price: 80000,  shipping: 0, isHomeItem: true, homeType: 'car',   tier: 3, unlock: { affection: 92, trust: 88, days: 60 } },
    { emoji: '🏠', name: '曼彻斯特公寓', desc: '靠近市中心，交通方便',            price: 120000, shipping: 0, isHomeItem: true, homeType: 'house', tier: 1, unlock: SHOP_UNLOCK_TIERS.future },
    { emoji: '🏡', name: '赫里福德独栋', desc: '有院子，安静，空间够大',          price: 300000, shipping: 0, isHomeItem: true, homeType: 'house', tier: 2, unlock: SHOP_UNLOCK_TIERS.committed },
    { emoji: '🏰', name: '苏格兰庄园',   desc: '占地广阔，风景绝美',              price: 800000, shipping: 0, isHomeItem: true, homeType: 'house', tier: 3, unlock: { affection: 92, trust: 88, days: 60 } },
    { emoji: '🌿', name: '英国一块地',   desc: '属于自己的一片土地',              price: 500000, shipping: 0, isHomeItem: true, homeType: 'land',  tier: 1, unlock: SHOP_UNLOCK_TIERS.committed },
    { emoji: '🏔️', name: '苏格兰高地',   desc: '远离喧嚣，只有风和你',            price: 1500000,shipping: 0, isHomeItem: true, homeType: 'land',  tier: 2, unlock: { affection: 92, trust: 88, days: 60 } },
    { emoji: '🐾', name: '宠物系统',     desc: '养一只属于你们的小动物',          price: 0,      shipping: 0, isHomeItem: true, homeType: 'pet',   comingSoon: true },
  ],
  intimate: [
    { emoji: '🛡️', name: '超大号避孕套',       desc: '最大号，她特意挑的，他懂',                                price: 58,  shipping: 15, isIntimate: true, tip: "...noted.", unlock: SHOP_UNLOCK_TIERS.intimate },
    { emoji: '🌹', name: '情趣骰子礼盒',     desc: '六面各有惊喜，每一面都是只属于你们的游戏',            price: 58,  shipping: 10, isIntimate: true, ghostReact: 'dry',        tip: "we'll see.", unlock: SHOP_UNLOCK_TIERS.warm },
    { emoji: '🪢', name: '丝绒眼罩套装',     desc: '遮住视线，感官才会更清醒，配柔软绑带',                price: 128, shipping: 12, isIntimate: true, ghostReact: 'controlled', tip: 'noted.', unlock: SHOP_UNLOCK_TIERS.intimate },
    { emoji: '🧴', name: '情侣按摩油礼盒',   desc: '三种香型，分别对应三种心情，你自己选',                price: 158, shipping: 12, isIntimate: true, ghostReact: 'practical', tip: "picked one. don't ask which.", unlock: SHOP_UNLOCK_TIERS.intimate },
    { emoji: '💋', name: '远程震动玩具',     desc: '隔着时区也能在一起，手机连接，他来控制',              price: 388, shipping: 18, isIntimate: true, ghostReact: 'controlled', tip: "i'll figure it out.", badge: '异地专属', unlock: SHOP_UNLOCK_TIERS.committed },
    { emoji: '🎲', name: '亲密挑战卡牌',     desc: '52张，每张都是一个只属于你们的约定',                  price: 78,  shipping: 10, isIntimate: true, ghostReact: 'dry',        tip: "52 cards. we won't need all of them.", unlock: SHOP_UNLOCK_TIERS.warm },
    { emoji: '🍓', name: '可食用身体彩绘套装', desc: '草莓和巧克力两色，画什么由你决定',                  price: 118, shipping: 12, isIntimate: true, ghostReact: 'dry',        tip: 'creative.', unlock: SHOP_UNLOCK_TIERS.warm },
    { emoji: '📱', name: '情趣应用年费会员', desc: '远程互动功能全解锁，异地也能很近',                    price: 328, shipping: 0,  isIntimate: true, ghostReact: 'controlled', tip: 'already downloaded it.', isDigital: true, unlock: SHOP_UNLOCK_TIERS.committed },
  ],
};

// 节日限定：从家寄给他（节日前3天解锁，过了消失）
const SEASONAL_FROM_HOME = [
  { month: 4,  day: 5,  emoji: '🍡', name: '青团礼盒',   desc: '清明时节，艾草青团，甜糯',               price: 75, shipping: 20, isFromHome: true, festival: '清明节' },
  { month: 6,  day: 19, emoji: '🎋', name: '粽子礼盒',   desc: '端午五芳斋，红枣蛋黄各半箱',             price: 95, shipping: 20, isFromHome: true, festival: '端午节' },
  { month: 9,  day: 25, emoji: '🥮', name: '月饼礼盒',   desc: '广式莲蓉蛋黄，精装铁盒，中秋限定',       price: 148, shipping: 20, isFromHome: true, festival: '中秋节' },
  { month: 2,  day: 17, emoji: '🧧', name: '年货大礼包', desc: '糖果、坚果、肉干，满满一箱新年味道',       price: 188, shipping: 20, isFromHome: true, festival: '春节' },
  { month: 12, day: 21, emoji: '🥟', name: '冬至饺子/汤圆礼包', desc: '速冻装，跟他说冬至要吃这个',     price: 85, shipping: 20, isFromHome: true, festival: '冬至' },
];

function getSeasonalFromHome() {
  const today = new Date();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  return SEASONAL_FROM_HOME.filter(item => {
    // 节日前3天到节日当天解锁
    const festDate = new Date(today.getFullYear(), item.month - 1, item.day);
    const diff = (festDate - today) / 86400000;
    return diff >= 0 && diff <= 3;
  });
}


const LOCATION_SPECIALS = {
  'Germany': [
    { emoji: '🔵', name: '妮维雅铁罐', desc: '德国本地买的。比你网购的版本大。', tip: '德国超市随手拿的。用上。' },
    { emoji: '🌭', name: '纽伦堡香肠礼盒', desc: '纽伦堡当地香肠，真空包装。', tip: '纽伦堡的。比英国那边卖的强。' },
    { emoji: '✏️', name: '辉柏嘉彩铅套装', desc: '辉柏嘉产地直购，颜色很全。', tip: '产地买的。比较便宜。' },
  ],
  'Norway': [
    { emoji: '🍫', name: 'Freia巧克力礼盒', desc: '挪威国民巧克力，这边人手一盒。', tip: '挪威人爱吃这个。试试。' },
    { emoji: '🧤', name: '驯鹿毛手套', desc: '本地手工，真的驯鹿毛。', tip: '挪威的冬天很冷。你那边也冷。' },
    { emoji: '🌌', name: '北极光明信片', desc: '当地拍的，不是印刷图。', tip: '没拍到本人。明信片凑合。' },
  ],
  'Edinburgh': [
    { emoji: '🥃', name: '单一麦芽威士忌小样', desc: '爱丁堡酒厂出的，试饮装。', tip: '产地买的。别一口闷。' },
    { emoji: '🧣', name: '苏格兰羊绒围巾', desc: '正经苏格兰格纹，羊绒的。', tip: '苏格兰的。比较软。' },
    { emoji: '🫙', name: '黄油饼干铁罐', desc: '爱丁堡老字号，比超市那种好吃。', tip: '本地买的。配茶。' },
  ],
  'Manchester': [
    { emoji: '🫖', name: 'PG Tips红茶礼盒', desc: '曼彻斯特老牌，家里常喝这个。', tip: '从小喝这个长大的。' },
    { emoji: '🥐', name: 'Eccles蛋糕', desc: '曼彻斯特特产，葡萄干酥皮。', tip: '本地的。不知道你喜不喜欢。' },
    { emoji: '🍯', name: '老字号手工果酱', desc: '曼彻斯特老店，不加防腐剂。', tip: '家附近那家店买的。' },
  ],
  'Poland': [
    { emoji: '🍯', name: '波兰蜂蜜礼盒', desc: '波兰山区蜂蜜，颜色很深，香。', tip: '波兰蜂蜜比英国的好。' },
    { emoji: '🍫', name: 'Wedel巧克力', desc: '波兰百年老牌，黑巧系列。', tip: '这边老牌子。不腻。' },
    { emoji: '🟡', name: '手工琥珀摆件', desc: '波兰琥珀，波罗的海产的。', tip: '波兰特产。放着看吧。' },
  ],
  'Hereford Base': [
    { emoji: '🍵', name: '苹果茶礼盒', desc: 'Hereford苹果产区出的茶，清甜。', tip: '基地附近买的。' },
    { emoji: '🍎', name: '苹果酒礼盒', desc: 'Hereford本地苹果酒，这边著名。', tip: 'Hereford苹果酒产区。别喝太多。' },
  ],
};

// 地点key映射（location字段可能有多种写法）
const LOCATION_KEY_MAP = {
  'Germany': 'Germany', 'german': 'Germany',
  'Norway': 'Norway', 'norwegian': 'Norway',
  'Edinburgh': 'Edinburgh',
  'Manchester': 'Manchester',
  'Poland': 'Poland',
  'Hereford Base': 'Hereford Base', 'Hereford': 'Hereford Base',
};

const GHOST_REVERSE_POOL = {
  '开心':    [
    { emoji: '🍫', name: '精品巧克力礼盒', desc: 'Ghost说，开心就该吃好的' },
    { emoji: '🥂', name: '起泡酒', desc: '庆祝一下' },
    { emoji: '🍰', name: '精品蛋糕卷', desc: 'Ghost挑的，甜的' },
    { emoji: '🎉', name: '小彩带礼包', desc: '无聊寄的' },
  ],
  '难过':    [
    { emoji: '🧸', name: '毛绒玩具', desc: 'Ghost挑的，抱着睡' },
    { emoji: '🍬', name: '零食礼包', desc: '难过就吃甜的' },
    { emoji: '🔖', name: '手写卡片', desc: 'Ghost写了字的' },
    { emoji: '🪔', name: '香薰蜡烛', desc: '点上，安静一下' },
    { emoji: '🌼', name: '干花礼盒', desc: 'Ghost挑的' },
  ],
  '委屈':    [
    { emoji: '🏵️', name: '干花礼盒', desc: 'Ghost说，别委屈自己' },
    { emoji: '🧁', name: '精致甜点礼盒', desc: '吃甜的' },
    { emoji: '🐻', name: '小熊玩偶', desc: 'Ghost挑的，别委屈了' },
    { emoji: '📝', name: '手写便条', desc: 'Ghost写了几个字' },
  ],
  '饥饿':    [
    { emoji: '🍽️', name: '英式下午茶礼盒', desc: 'Ghost寄的，别饿着' },
    { emoji: '🥨', name: '精品饼干礼盒', desc: '先垫垫' },
    { emoji: '🍭', name: '能量巧克力棒', desc: '扛饿的' },
    { emoji: '🥜', name: '坚果零食礼包', desc: '随手寄的' },
  ],
  '劳累':    [
    { emoji: '🕯️', name: '香薰蜡烛套装', desc: '好好休息' },
    { emoji: '🛁', name: '沐浴礼盒', desc: 'Ghost说洗个澡放松一下' },
    { emoji: '💧', name: '精油小样套装', desc: '闻一闻，放松' },
    { emoji: '🧖', name: '面膜礼盒', desc: '敷上躺着' },
  ],
  '压力大':  [
    { emoji: '⚱️', name: '精油套装', desc: '放松用的' },
    { emoji: '🫧', name: '助眠喷雾', desc: '先睡好' },
    { emoji: '🕯️', name: '舒缓神经蜡烛', desc: '点上，深呼吸' },
    { emoji: '☕', name: '咖啡礼盒', desc: '提神用的，别熬太晚' },
    { emoji: '🧘', name: '冥想眼罩套装', desc: '闭上眼' },
  ],
  '生病':    [
    { emoji: '💊', name: '保健品礼盒', desc: 'Ghost寄的，好好吃' },
    { emoji: '🫚', name: '蜂蜜姜茶', desc: '喝了暖身' },
    { emoji: '🎀', name: '保暖礼包', desc: '别冻着' },
    { emoji: '🍋', name: '维C冲剂礼盒', desc: '补一补' },
    { emoji: '🌡️', name: '退烧贴套装', desc: '备着用' },
  ],
  '太冷':    [
    { emoji: '🧣', name: '兔毛围巾耳罩套装', desc: 'Ghost挑的，软的' },
    { emoji: '♨️', name: '暖手包', desc: '揣兜里' },
    { emoji: '🧦', name: '厚袜子礼盒', desc: '从脚暖起来' },
    { emoji: '🧴', name: '除臭喷雾', desc: '备着用' },
    { emoji: '🍵', name: '热可可礼盒', desc: '冲一杯' },
  ],
  '太热':    [
    { emoji: '🧊', name: '冷感毛巾', desc: '敷一下' },
    { emoji: '🌱', name: '薄荷茶礼盒', desc: '喝了凉快' },
    { emoji: '🌊', name: '保湿喷雾套装', desc: '喷一喷' },
  ],
  '思念':    [
    { emoji: '💌', name: '手写信套装', desc: 'Ghost写了信' },
    { emoji: '🖼️', name: '定制相框', desc: '放张照片' },
    { emoji: '🪖', name: '军牌钥匙扣', desc: 'Ghost的备用军牌，给你挂钥匙' },
    { emoji: '📷', name: '拍立得照片', desc: 'Ghost拍的，寄来了' },
    { emoji: '🎵', name: '手写歌单小纸条', desc: 'Ghost随手列的' },
  ],
};

// ===== 异地私密反寄池（触发条件：异地天数 + 亲密度）=====
const GHOST_INTIMATE_REVERSE_POOL = [
  { emoji: '🎀', name: '蕾丝睡衣套装',     desc: 'Ghost悄悄寄来的，什么都没说', tip: "wear it.",         ghostReact: 'flustered' },
  { emoji: '🌙', name: '情趣内衣·军绿款', desc: '军绿配黑色蕾丝，他挑的',       tip: "you'll know why.", ghostReact: 'flustered' },
];

// ===== 意图层：为私密反寄决定 intent =====
function decideIntimateIntent() {
  const affection = parseInt(localStorage.getItem('affection') || '60');
  const trust = typeof getTrustHeat === 'function' ? getTrustHeat() : 60;
  // claim 权重随关系深度提升
  const claimWeight = Math.max(0.1, Math.min(0.5, (affection - 70) / 60));
  const pushWeight  = 0.4;
  const testWeight  = Math.max(0.1, 0.5 - claimWeight);
  const total = testWeight + pushWeight + claimWeight;
  const r = Math.random() * total;
  if (r < testWeight) return 'test';
  if (r < testWeight + pushWeight) return 'push';
  return 'claim';
}

// intent → 系统消息措辞（告知 S 他寄东西的动机）
function intentSystemNote(itemName, intent) {
  const notes = {
    test:  `[System: You quietly sent her "${itemName}". You're not sure why — just wanted to see how she'd react. Said nothing. Let her find out.]`,
    push:  `[System: You quietly sent her "${itemName}". She's been pushing it lately — you decided to take the lead. No explanation. Let it speak for itself.]`,
    claim: `[System: You quietly sent her "${itemName}". No particular reason — you picked it, you sent it. There's a sense of "she's yours" in there. You won't say that out loud.]`,
  };
  return notes[intent] || notes.test;
}

// 异地久了自动触发一次私密反寄
function checkIntimateReverseDelivery() {
  const marriageDate = localStorage.getItem('marriageDate');
  if (!marriageDate) return;
  const days = Math.max(1, Math.floor((Date.now() - new Date(marriageDate)) / 86400000) + 1);
  if (days < 30) return;

  const affection = parseInt(localStorage.getItem('affection') || '60');
  if (affection < 75) return;

  const coldWar = localStorage.getItem('coldWarMode') === 'true';
  if (coldWar) return;

  const doneKey = 'intimateReverseDone';
  if (localStorage.getItem(doneKey)) return;

  if (typeof canTriggerReverseDelivery === 'function' && !canTriggerReverseDelivery()) return;

  const pool = GHOST_INTIMATE_REVERSE_POOL;
  const sentNames = JSON.parse(localStorage.getItem('deliveryHistory') || '[]')
    .filter(d => d.isGhostSend).map(d => d.name);
  const available = pool.filter(p => !sentNames.includes(p.name));
  if (available.length === 0) return;
  const item = available[Math.floor(Math.random() * available.length)];

  // 意图层：异地久了默认偏 claim，但仍走权重
  const intent = decideIntimateIntent();

  localStorage.setItem(doneKey, '1');
  if (typeof markReverseDeliveryTriggered === 'function') markReverseDeliveryTriggered();

  // 说话延迟 30s ~ 3min（让用户觉得"他在想什么"）
  const talkDelay = (Math.floor(Math.random() * 150) + 30) * 1000;
  // 物流延迟 2-4 天
  const deliveryDelay = (Math.floor(Math.random() * 3) + 2) * 24 * 3600 * 1000;

  if (typeof chatHistory !== 'undefined') {
    chatHistory.push({
      role: 'user',
      content: intentSystemNote(item.name, intent),
      _system: true
    });
    if (typeof saveHistory === 'function') saveHistory();
  }

  // 延迟后 Ghost 说一句话（不解释，不提寄东西）
  setTimeout(async () => {
    if (typeof _isSending !== 'undefined' && _isSending) return;
    const intentLines = {
      test:  `[System: You just made a decision but you're not saying anything. Say something unrelated, or go quiet. Do not mention sending anything.]`,
      push:  `[System: You just took the lead back. Say one line — some weight to it, nothing explicit. Do not mention sending anything.]`,
      claim: `[System: You just did something — there's a quiet sense of "she's yours" in it. One casual line, no explanation. Do not mention sending anything.]`,
    };
    try {
      const res = await fetchWithTimeout('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 60,
          system: typeof buildGhostStyleCore === 'function' ? buildGhostStyleCore() : '',
          messages: [...(chatHistory || []).filter(m => !m._system).slice(-6),
            { role: 'user', content: intentLines[intent] || intentLines.test }]
        })
      }, 8000);
      const data = await res.json();
      const line = data.content?.[0]?.text?.trim() || '';
      if (line && typeof appendMessage === 'function') {
        appendMessage('bot', line);
        chatHistory.push({ role: 'assistant', content: line });
        if (typeof saveHistory === 'function') saveHistory();
      }
    } catch(e) {}
  }, talkDelay);

  setTimeout(() => {
    if (typeof addGhostReverseDelivery === 'function') {
      addGhostReverseDelivery({ ...item, isIntimate: true, _secretDelivery: true, intent }, 'intimate');
    }
  }, deliveryDelay);
}

let currentCategory = 'clothing';
let pendingProduct = null;
let pendingCategory = null;

function initMarket() {
  const el = document.getElementById('marketBalanceDisplay');
  if (el) el.textContent = '£' + getBalance().toFixed(2);
  renderDeliveryTracker();
  renderMarket(currentCategory || 'clothing');
  checkDeliveryUpdates();
}

function renderMarket(categoryId) {
  currentCategory = categoryId;
  const tabsEl = document.getElementById('categoryTabs');
  if (tabsEl) {
    tabsEl.innerHTML = getMarketCategories().map(cat => `
      <div class="category-tab ${cat.id === categoryId ? 'active' : ''}" onclick="renderMarket('${cat.id}')">${cat.label}</div>
    `).join('');
  }
  // 安全解析 localStorage，防止数据损坏导致商城空白
  const _safeGet = (key, def) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(def)); } catch(e) { return def; } };

  // 私密专区
  if (categoryId === 'intimate') {
    const gridEl3 = document.getElementById('productsGrid');
    if (!gridEl3) return;
    const purchased = _safeGet('purchasedItems', []);
    const purchaseCounts = _safeGet('purchaseCounts', {});
    // 修改：全部显示，未解锁的显示锁定状态，不再隐藏
    const allIntimateProducts = MARKET_PRODUCTS.intimate || [];
    const intimateTriggered = _safeGet('intimateTriggered', {});
    const now = Date.now();
    let intimateHtml = '';
    allIntimateProducts.forEach((p, i) => {
      const isUnlocked = canUnlockProduct(p);
      const maxBuy = p.maxPurchase || 1;
      const buyCount = purchaseCounts[p.name] || (purchased.includes(p.name) ? 1 : 0);
      const owned = buyCount >= maxBuy;
      const btnLabel = p.isUserItem ? '🛍️ 为自己购买' : '📦 寄给 Ghost';

      const iTrigger = intimateTriggered[p.name];
      const isHighlighted = isUnlocked && !owned && iTrigger && (now - iTrigger.timestamp < 2 * 24 * 3600 * 1000);

      const lockIconSvg = `<svg width="9" height="11" viewBox="0 0 12 14" fill="none" style="vertical-align:middle;margin-right:3px;"><rect x="1.5" y="6" width="9" height="7" rx="1.5" fill="#5a8a40" opacity=".85"/><path d="M3.5 6V4.5a2.5 2.5 0 0 1 5 0V6" stroke="#5a8a40" stroke-width="1.4" stroke-linecap="round"/><circle cx="6" cy="9.5" r="1" fill="white"/></svg>`;
      const badgeHtml = !isUnlocked
        ? `<div class="ghost-mentioned-tag" style="background:rgba(80,130,55,0.1);border:1px solid rgba(90,150,60,0.28);color:#4a7a30;font-size:9px;font-weight:700;padding:2px 9px;border-radius:20px;white-space:nowrap;display:flex;align-items:center;">${lockIconSvg}继续相处后解锁</div>`
        : isHighlighted
          ? `<div class="ghost-mentioned-tag" style="background:linear-gradient(135deg,rgba(236,72,153,0.15),rgba(192,132,252,0.15));border:1px solid rgba(236,72,153,0.5);color:#be185d;font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;white-space:nowrap;">💡 也许正合时机</div>`
          : p.badge
            ? `<div class="ghost-mentioned-tag" style="background:rgba(236,72,153,0.12);border-color:rgba(236,72,153,0.4);color:#be185d;">💕 ${p.badge}</div>`
            : '';

      const lockBtnSvg = `<svg width="10" height="11" viewBox="0 0 12 14" fill="none" style="vertical-align:middle;margin-right:4px;"><rect x="1.5" y="6" width="9" height="7" rx="1.5" fill="#5a8a40"/><path d="M3.5 6V4.5a2.5 2.5 0 0 1 5 0V6" stroke="#5a8a40" stroke-width="1.4" stroke-linecap="round"/></svg>`;
      const actionHtml = !isUnlocked
        ? `<button class="product-buy-btn intimate-buy-btn" disabled style="background:rgba(80,130,55,0.1);border:1px solid rgba(90,150,60,0.28);color:#5a8a40;cursor:not-allowed;display:flex;align-items:center;justify-content:center;">${lockBtnSvg}未解锁</button>`
        : owned
          ? `<div class="product-owned-tag">✅ 已购买</div>`
          : `<button class="product-buy-btn intimate-buy-btn" onclick="openBuyModal(${i})">${btnLabel}</button>`;

      intimateHtml += `<div class="product-card intimate-card ${owned ? 'owned-card' : ''} ${isHighlighted ? 'ghost-mentioned' : ''}" style="${!isUnlocked ? 'background:rgba(30,10,20,0.7);opacity:0.82;' : ''}">
        ${badgeHtml}
        <div class="product-emoji">${p.emoji}</div>
        <div class="product-name">${p.name}</div>
        <div class="product-desc">${!isUnlocked ? '继续和他相处，慢慢解锁' : p.desc}</div>
        <div class="product-price" style="${!isUnlocked ? 'color:#c08090;display:flex;align-items:center;gap:4px;' : ''}">
          ${!isUnlocked ? `<svg width="10" height="11" viewBox="0 0 12 14" fill="none" style="opacity:.6"><rect x="1.5" y="6" width="9" height="7" rx="1.5" fill="#c08090"/><path d="M3.5 6V4.5a2.5 2.5 0 0 1 5 0V6" stroke="#c08090" stroke-width="1.4" stroke-linecap="round"/></svg>£${p.price.toLocaleString()}` : '£' + p.price.toLocaleString()}
        </div>
        ${actionHtml}
      </div>`;
    });
    gridEl3.innerHTML = intimateHtml;
    return;
  }

  // 修改：全部显示，未解锁的显示锁定状态
  const isFromHome = categoryId === 'fromhome';
  let products = MARKET_PRODUCTS[categoryId] || [];
  if (isFromHome) {
    const seasonal = getSeasonalFromHome();
    products = [...products, ...seasonal];
  }
  const gridEl = document.getElementById('productsGrid');
  if (!gridEl) return;
  const isWishlist = categoryId === 'wishlist';
  const isLuxury = categoryId === 'luxury';
  const isHome = categoryId === 'home';
  const purchased = _safeGet('purchasedItems', []);
  const purchaseCounts = _safeGet('purchaseCounts', {});
  const weeklySale = isLuxury ? getWeeklySale() : null;

  gridEl.innerHTML = products.map((p, i) => {
    const isUnlocked = canUnlockProduct(p);  // 关系是否满足解锁条件
    const maxBuy = p.maxPurchase || 1;
    const buyCount = purchaseCounts[p.name] || (purchased.includes(p.name) ? 1 : 0);
    const owned = buyCount >= maxBuy;
    const onSale = weeklySale && weeklySale.name === p.name;
    const displayPrice = onSale ? Math.round(p.price * weeklySale.discount) : p.price;
    const triggerReason = isUnlocked ? getProductTrigger(p.name) : null;
    const isLocked = p.requiresItem && !purchased.includes(p.requiresItem);
    const discountPct = onSale ? Math.round((1 - weeklySale.discount) * 100) : 0;
    const discountLabel = discountPct >= 30 ? `${discountPct}% OFF · 限时${discountPct}折`
      : discountPct >= 20 ? `${discountPct}% OFF · 限时优惠`
      : `${discountPct}% OFF · 今日特惠`;
    const showCount = maxBuy > 1 && buyCount > 0 && !owned;

    // 宠物占位特殊渲染
    if (p.comingSoon) {
      return `
        <div class="product-card" style="opacity:0.7;cursor:pointer;" onclick="showToast('🐾 宠物系统即将开放，敬请期待！')">
          <div class="product-emoji">${p.emoji}</div>
          <div class="product-name">${p.name}</div>
          <div class="product-desc">${p.desc}</div>
          <div class="ghost-mentioned-tag" style="position:relative;transform:none;margin:8px auto 0;display:inline-block;">🔒 后续开放</div>
        </div>`;
    }

    // 未解锁：显示锁定卡片
    if (!isUnlocked) {
      const lockIconSvg = `<svg width="9" height="11" viewBox="0 0 12 14" fill="none" style="vertical-align:middle;margin-right:3px;"><rect x="1.5" y="6" width="9" height="7" rx="1.5" fill="#5a8a40" opacity=".85"/><path d="M3.5 6V4.5a2.5 2.5 0 0 1 5 0V6" stroke="#5a8a40" stroke-width="1.4" stroke-linecap="round"/><circle cx="6" cy="9.5" r="1" fill="white"/></svg>`;
      const lockBtnSvg = `<svg width="10" height="11" viewBox="0 0 12 14" fill="none" style="vertical-align:middle;margin-right:4px;"><rect x="1.5" y="6" width="9" height="7" rx="1.5" fill="#5a8a40"/><path d="M3.5 6V4.5a2.5 2.5 0 0 1 5 0V6" stroke="#5a8a40" stroke-width="1.4" stroke-linecap="round"/></svg>`;
      const lockPriceSvg = `<svg width="10" height="11" viewBox="0 0 12 14" fill="none" style="vertical-align:middle;margin-right:3px;opacity:.6;"><rect x="1.5" y="6" width="9" height="7" rx="1.5" fill="#6a9a58"/><path d="M3.5 6V4.5a2.5 2.5 0 0 1 5 0V6" stroke="#6a9a58" stroke-width="1.4" stroke-linecap="round"/></svg>`;
      return `
        <div class="product-card ${isWishlist?'wishlist-card':''} ${isLuxury?'luxury-card':''} ${isFromHome?'fromhome-card':''} ${isHome?'home-card':''}"
             style="background:#f4f9f0;border:1px solid rgba(140,190,100,0.22);opacity:0.88;"
             onclick="showToast('继续和 Ghost 相处，解锁更多商品 🌿')">
          <div class="ghost-mentioned-tag" style="background:rgba(80,130,55,0.1);border:1px solid rgba(90,150,60,0.28);color:#4a7a30;font-size:9px;font-weight:700;padding:2px 9px;border-radius:20px;white-space:nowrap;display:flex;align-items:center;">${lockIconSvg}继续相处后解锁</div>
          <div class="product-emoji">${p.emoji}</div>
          <div class="product-name" style="color:#6a9a58;">${p.name}</div>
          <div class="product-desc" style="color:#9aba88;">继续和他相处，慢慢解锁</div>
          <div class="product-price" style="color:#6a9a58;display:flex;align-items:center;justify-content:center;">${lockPriceSvg}£${p.price.toLocaleString()}</div>
          <button class="product-buy-btn" disabled style="background:rgba(80,130,55,0.1);border:1px solid rgba(90,150,60,0.28);color:#5a8a40;cursor:not-allowed;display:flex;align-items:center;justify-content:center;">${lockBtnSvg}未解锁</button>
        </div>`;
    }

    return `
      <div class="product-card ${isWishlist?'wishlist-card':''} ${isLuxury?'luxury-card':''} ${isFromHome?'fromhome-card':''} ${isHome?'home-card':''} ${owned?'owned-card':''} ${triggerReason&&!owned?'ghost-mentioned':''} ${onSale&&!owned?'on-sale-card':''}"
           onclick="${owned||isLocked?'':'openBuyModal('+i+')'  }">
        ${onSale&&!owned ? '<div class="sale-corner-text">TODAY<br>ONLY</div>' : ''}
        ${p.festival&&!owned ? `<div class="ghost-mentioned-tag" style="background:rgba(255,200,100,0.15);border-color:rgba(255,180,50,0.4);color:#b45309;">🎋 ${p.festival}限定</div>` : ''}
        ${triggerReason&&!owned ? `<div class="ghost-mentioned-tag">💡 ${triggerReason}</div>` : ''}
        ${isLocked ? '<div class="ghost-mentioned-tag" style="background:#9ca3af">🔒 需先买机票</div>' : ''}
        <div class="product-emoji">${p.emoji}</div>
        ${onSale&&!owned ? `<div class="sale-discount-badge">✦ TODAY ONLY · ${discountLabel}</div>` : ''}
        <div class="product-name">${p.name}</div>
        ${isWishlist&&p.badge ? `<div class="product-badge-preview">🏅 ${p.badge}</div>` : ''}
        ${p.desc ? `<div class="product-desc">${p.desc}</div>` : ''}
        <div class="product-price ${isWishlist?'wishlist-price':''}">
          ${onSale ? `<span class="sale-original-price">£${p.price.toLocaleString()}</span>` : ''}
          £${displayPrice.toLocaleString()}
        </div>
        ${owned
          ? `<div class="product-owned-tag">${isHome?'✅ 已购置':'🔴 已售罄'}</div>`
          : `<button class="product-buy-btn ${isWishlist?'wishlist-buy-btn':''} ${isFromHome?'fromhome-buy-btn':''} ${isHome?'home-buy-btn':''}">${isWishlist?'💝 加入宝贝':isFromHome?'📦 寄给他':isHome?'🏡 购置':'🛒 购买'}${showCount ? ` (${buyCount}/${maxBuy})` : ''}</button>`
        }
      </div>`;
  }).join('');
}

function openBuyModal(idx) {
  let productList = MARKET_PRODUCTS[currentCategory] || [];
  if (currentCategory === 'fromhome') {
    productList = [...productList, ...getSeasonalFromHome()];
  }
  const p = productList[idx];
  if (!p) return;
  pendingProduct = p;
  pendingCategory = currentCategory;
  const isLuxury = currentCategory === 'luxury';
  const weeklySale = isLuxury ? getWeeklySale() : null;
  const onSale = weeklySale && weeklySale.name === p.name;
  const displayPrice = onSale ? Math.round(p.price * weeklySale.discount) : p.price;
  const shipping = p.shipping !== undefined ? p.shipping : (isLuxury ? 35 : 15);
  const total = displayPrice + shipping;
  const bal = getBalance();
  const triggerReason = getProductTrigger(p.name);
  const isWishlist = currentCategory === 'wishlist';

  document.getElementById('buyModalEmoji').textContent = p.emoji;
  document.getElementById('buyModalName').textContent = p.name;
  document.getElementById('buyModalDesc').textContent = p.desc || '';
  document.getElementById('buyModalPrice').innerHTML = `£${displayPrice.toLocaleString()}<span style="font-size:12px;color:#a07bc0;font-weight:500"> + £${shipping} 运费</span>`;
  document.getElementById('buyModalBalance').innerHTML = `余额：£${bal.toFixed(2)}&nbsp;&nbsp;合计：<b style="color:#7c3fa0">£${total.toLocaleString()}</b>`;

  const reasonEl = document.getElementById('buyModalReason');
  if (reasonEl) {
    if (triggerReason) { reasonEl.textContent = triggerReason; reasonEl.style.display = 'block'; }
    else reasonEl.style.display = 'none';
  }

  const btn = document.getElementById('buyConfirmBtn');
  const purchased = JSON.parse(localStorage.getItem('purchasedItems') || '[]');
  const purchaseCounts = JSON.parse(localStorage.getItem('purchaseCounts') || '{}');
  const isGhostGift = !!p.isGhostGift;
  const isUserItem = !!p.isUserItem;
  // 按钮文案：送Ghost / 自己买 / 心愿单
  const btnLabel = isWishlist ? '💝 放进我的宝贝'
    : isGhostGift ? '🎁 寄给 Ghost'
    : isUserItem ? '🛍️ 购买'
    : '📦 寄给 Ghost';

  // 修复：第一次买完后 purchased 里有这个名字，但不代表已达购买上限
  // 必须用 buyCount >= maxBuy 判断，和 renderMarket 保持一致
  const maxBuy = p.maxPurchase || 1;
  const buyCount = purchaseCounts[p.name] || (purchased.includes(p.name) ? 1 : 0);
  const isOwned = buyCount >= maxBuy;

  if (isOwned) {
    btn.disabled = true; btn.textContent = isUserItem ? '✅ 已购买' : '🔴 已售罄';
  } else if (bal < total) {
    btn.disabled = true; btn.textContent = '💔 余额不足';
  } else {
    btn.disabled = false;
    // 已买过一次但还能买：显示剩余次数
    const remaining = maxBuy - buyCount;
    btn.textContent = maxBuy > 1 && buyCount > 0
      ? btnLabel + ` (还可买${remaining}次)`
      : btnLabel;
  }
  const overlay2 = document.getElementById('buyModalOverlay');
  if (overlay2) overlay2.style.display = 'flex';
}

function closeBuyModal() {
  const overlay = document.getElementById('buyModalOverlay');
  if (overlay) overlay.style.display = 'none';
  pendingProduct = null;
}

function confirmPurchase() {
  if (!pendingProduct) return;
  const p = pendingProduct;
  const isWishlist = pendingCategory === 'wishlist';
  const isLuxury = pendingCategory === 'luxury';
  const weeklySale = isLuxury ? getWeeklySale() : null;
  const onSale = weeklySale && weeklySale.name === p.name;
  const displayPrice = onSale ? Math.round(p.price * weeklySale.discount) : p.price;
  const shipping = p.shipping !== undefined ? p.shipping : (isLuxury ? 35 : 15);
  const total = displayPrice + shipping;
  const bal = getBalance();
  if (bal < total) { showToast('💔 余额不足！'); closeBuyModal(); return; }

  setBalance(bal - total);
  const txLabel = isWishlist ? '心愿 · '
    : p.isGhostGift ? '寄给Ghost · '
    : p.isUserItem ? '购买 · '
    : '寄给Ghost · ';
  addTransaction({ icon: p.emoji, name: txLabel + p.name, amount: -total });
  renderWallet();

  const purchased = JSON.parse(localStorage.getItem('purchasedItems') || '[]');
  if (!purchased.includes(p.name)) { purchased.push(p.name); localStorage.setItem('purchasedItems', JSON.stringify(purchased)); }
  // 记录购买次数
  const purchaseCounts = JSON.parse(localStorage.getItem('purchaseCounts') || '{}');
  purchaseCounts[p.name] = (purchaseCounts[p.name] || 0) + 1;
  localStorage.setItem('purchaseCounts', JSON.stringify(purchaseCounts));

  // 检查面基三件套是否集齐
  const reunionItems = ['去曼城找他的机票','曼彻斯特酒店','英国旅行计划'];
  if (reunionItems.every(n => purchased.includes(n)) && !localStorage.getItem('metInPerson')) {
    localStorage.setItem('metInPerson', 'true');
    setTimeout(() => showToast('✈️ 三件套集齐了！见面模式已解锁'), 1500);
  }

  clearProductTrigger(p.name);
  // 购买后清掉私密高亮
  if (pendingCategory === 'intimate') {
    const _iT = JSON.parse(localStorage.getItem('intimateTriggered') || '{}');
    delete _iT[p.name];
    localStorage.setItem('intimateTriggered', JSON.stringify(_iT));
  }

  closeBuyModal();
  if (isWishlist) showToast('💝 已加入心愿单！');
  else if (p.isUserItem) showToast('🛍️ 购买成功！快递正在准备中～');
  else showToast('📦 已寄出！Ghost 会收到的～');

  // 启动快递（不是心愿单才走快递）
  if (!isWishlist) {
    addDelivery(p, false, isLuxury);
  } else {
    // 心愿单：Ghost收到消息后说话
    if (p.ghostMsg) {
      setTimeout(() => {
        if (typeof appendMessage === 'function') {
          appendMessage('bot', p.ghostMsg);
          chatHistory.push({ role: 'assistant', content: p.ghostMsg });
          saveHistory();
        }
      }, 2000);
    }
  }

  // 奢侈品是寄给 Ghost 的礼物，等快递真正签收后才触发朋友圈，不在购买时发

  // 建立小家道具购买处理
  if (p.isHomeItem && !p.comingSoon) {
    setTimeout(() => triggerHomeItemMoment(p), 2000);
  }

  renderMarket(currentCategory);
  // 购买是重要操作，立即写云端，不走防抖
  if (typeof saveToCloud === 'function') saveToCloud().catch(()=>{});
}

// ===== 每周折扣 =====
function getDayKey() {
  const now = new Date();
  return now.getFullYear() + '-' + (now.getMonth()+1) + '-' + now.getDate();
}

function getWeeklySale() {
  const dayKey = 'dailySale_' + getDayKey();
  let sale = JSON.parse(localStorage.getItem(dayKey) || 'null');
  if (!sale) {
    // 清除昨天的key（可选，防止localStorage堆积）
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
    const yKey = 'dailySale_' + yesterday.getFullYear() + '-' + (yesterday.getMonth()+1) + '-' + yesterday.getDate();
    localStorage.removeItem(yKey);
    // 只从未购买的商品里选打折
    const purchased = JSON.parse(localStorage.getItem('purchasedItems') || '[]');
    const items = MARKET_PRODUCTS.luxury.filter(p => !purchased.includes(p.name));
    if (items.length === 0) return null; // 全买完了就没有打折
    const pick = items[Math.floor(Math.random() * items.length)];
    const discounts = [0.7, 0.75, 0.8, 0.85];
    sale = { name: pick.name, discount: discounts[Math.floor(Math.random() * discounts.length)] };
    localStorage.setItem(dayKey, JSON.stringify(sale));
  }
  return sale;
}

// ===== 商城+情绪触发（合并Haiku调用）=====
// ===== 钱相关意图并行判断（不阻塞主回复）=====
