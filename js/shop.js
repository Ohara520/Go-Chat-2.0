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

  // 持久化解锁记录：一旦解锁过就永久记录，不再重新计算
  // 解决：签到乱了导致 affection/trust 下降，商品重新锁上的问题
  const _unlockKey = 'shopUnlocked_' + (product.name || '').replace(/\s+/g, '_');
  if (localStorage.getItem(_unlockKey) === '1') return true;

  const affection = parseInt(localStorage.getItem('affection') || '60');
  const trust = typeof getTrustHeat === 'function' ? getTrustHeat() : 60;
  const days = getMarriageDays();
  const u = product.unlock;
  if (u.affection && affection < u.affection) return false;
  if (u.trust    && trust    < u.trust)    return false;
  if (u.days     && days     < u.days)     return false;

  // 首次满足条件：记录下来，永久解锁
  localStorage.setItem(_unlockKey, '1');
  return true;
}

// ===== 商城系统 (shop.js) =====
// ===== 商城系统 =====

// NOA MARKET V1 分类：7 个新分类。内部 key 保持不变（购买/定价/季节逻辑按 key 分支，改 key 等于动购买逻辑），仅调整 label 与展示顺序。
const MARKET_CATEGORIES = [
  { id: 'food',     label: '食饮' },   // product-001~012
  { id: 'clothing', label: '穿搭' },   // product-013~024
  { id: 'lifecare', label: '家居' },   // product-025~035
  { id: 'luxury',   label: '奢品' },   // product-036~047 + product-061
  { id: 'specialty',label: '特产' },   // product-048~060
  { id: 'home',     label: '资产' },   // product-062~069
  { id: 'wishlist', label: '特殊' },   // product-070~072
];

function getMarketCategories() {
  return MARKET_CATEGORIES;
}

const MARKET_PRODUCTS = {
  // ── NOA MARKET V1 穿搭 ──
  // 旧 clothing-01~14 emoji prototype 已废弃；此处为 V1 正式商品，ID = product-NNN 全局流水号。
  // 图片按 ID 绑定 images/products/<id>.png。emoji 仅作图片加载失败时的 fallback。
  clothing: [
    { id: 'product-013', emoji: '🧦', name: '美利奴羊毛袜（三双装）', nameEn: 'Merino Wool Socks (3-Pack)', price: 32, shipping: 6,
      desc: '美利奴羊毛混纺，米白、灰、橄榄三色一组。质地细软，透气吸湿，长时间穿着保持干爽。',
      features: [
        { label: '材质', value: '美利奴羊毛混纺' },
        { label: '组合', value: '三色三双装' },
        { label: '功能', value: '透气吸湿' },
        { label: '包装', value: '盒装' },
      ] },
    { id: 'product-014', emoji: '🧥', name: '灰褐羊毛大衣', nameEn: 'Taupe Wool Overcoat', price: 280, shipping: 8,
      desc: '中长款羊毛面料大衣，灰褐色，翻领单排扣。面料厚实挺括，版型利落。',
      features: [
        { label: '材质', value: '羊毛面料' },
        { label: '版型', value: '中长款' },
        { label: '设计', value: '翻领单排扣' },
        { label: '颜色', value: '灰褐色' },
      ] },
    { id: 'product-015', emoji: '👟', name: '简约低帮休闲鞋', nameEn: 'Minimal Low-Top Sneakers', price: 95, shipping: 6,
      desc: '米白色低帮休闲鞋，皮质鞋面搭配橡胶大底。鞋型简约，线条干净。',
      features: [
        { label: '材质', value: '皮质鞋面' },
        { label: '鞋底', value: '橡胶大底' },
        { label: '鞋型', value: '低帮' },
        { label: '颜色', value: '米白色' },
      ] },
    { id: 'product-016', emoji: '🥾', name: '切尔西短靴', nameEn: 'Chelsea Boots', price: 160, shipping: 6,
      desc: '真皮切尔西靴，两侧松紧带，无鞋带穿脱。中筒靴型。',
      features: [
        { label: '材质', value: '真皮' },
        { label: '靴型', value: '中筒切尔西' },
        { label: '穿脱', value: '两侧松紧带' },
        { label: '颜色', value: '深棕色' },
      ] },
    { id: 'product-017', emoji: '🧥', name: '羊羔绒领飞行夹克', nameEn: 'Sherpa-Collar Bomber Jacket', price: 185, shipping: 8,
      desc: '飞行夹克版型，领口拼接羊羔绒，袖口与下摆罗纹收口。外层耐磨，内里保暖。',
      features: [
        { label: '材质', value: '羊羔绒拼接' },
        { label: '版型', value: '飞行夹克' },
        { label: '设计', value: '罗纹收口' },
        { label: '颜色', value: '橄榄绿' },
      ] },
    { id: 'product-018', emoji: '🖤', name: '棕色真皮腰带', nameEn: 'Brown Leather Belt', price: 55, shipping: 6,
      desc: '头层牛皮腰带，棕色，金属针扣。质地厚实。',
      features: [
        { label: '材质', value: '头层牛皮' },
        { label: '搭扣', value: '金属针扣' },
        { label: '颜色', value: '棕色' },
        { label: '包装', value: '盒装' },
      ] },
    { id: 'product-019', emoji: '🧣', name: '苏格兰格纹羊毛围巾', nameEn: 'Scottish Wool Tartan Scarf', price: 48, shipping: 6,
      desc: '苏格兰羊毛织造，深红、墨绿、藏蓝格纹，两端流苏收边。质地厚软。',
      features: [
        { label: '材质', value: '苏格兰羊毛' },
        { label: '花纹', value: '格纹' },
        { label: '工艺', value: '流苏收边' },
        { label: '颜色', value: '深红墨绿藏蓝' },
      ] },
    { id: 'product-020', emoji: '🧳', name: '橄榄绿帆布旅行包', nameEn: 'Olive Canvas Weekender Bag', price: 95, shipping: 8,
      desc: '帆布包身，皮革包边与提手，附可拆卸肩带。做旧质感，容量充足。',
      features: [
        { label: '材质', value: '帆布拼皮革' },
        { label: '背法', value: '手提·可拆卸肩带' },
        { label: '工艺', value: '做旧处理' },
        { label: '颜色', value: '橄榄绿' },
      ] },
    { id: 'product-021', emoji: '🧥', name: '鼠尾草绿拉链连帽卫衣', nameEn: 'Sage Green Zip-Up Hoodie', price: 68, shipping: 6,
      desc: '全拉链连帽卫衣，加绒内里，宽松版型。手感厚实柔软。',
      features: [
        { label: '材质', value: '加绒棉质' },
        { label: '版型', value: '宽松' },
        { label: '设计', value: '全拉链连帽' },
        { label: '颜色', value: '鼠尾草绿' },
      ] },
    { id: 'product-022', emoji: '👕', name: '灰褐圆领T恤', nameEn: 'Taupe Crew-Neck Tee', price: 28, shipping: 6,
      desc: '纯棉圆领短袖T恤，灰褐色，暗纹提花。手感柔软。',
      features: [
        { label: '材质', value: '纯棉' },
        { label: '领型', value: '圆领' },
        { label: '工艺', value: '暗纹提花' },
        { label: '颜色', value: '灰褐色' },
      ] },
    { id: 'product-023', emoji: '🖤', name: '印字连帽卫衣', nameEn: 'Printed Hoodie', price: 58, shipping: 6,
      desc: '黑色连帽卫衣，胸前印 "MY WIFE IS THE PRETTIEST" 字样与爱心图案。加绒内里，宽松版型。',
      features: [
        { label: '材质', value: '加绒棉质' },
        { label: '版型', value: '宽松' },
        { label: '印花', value: '胸前字母与爱心' },
        { label: '颜色', value: '黑色' },
      ] },
    { id: 'product-024', emoji: '🧥', name: '做旧腊质工装夹克', nameEn: 'Waxed Field Jacket', price: 220, shipping: 8,
      desc: '腊质涂层工装夹克，橄榄棕做旧色，灯芯绒翻领，多口袋。面料防泼水。',
      features: [
        { label: '材质', value: '腊质涂层棉' },
        { label: '领型', value: '灯芯绒翻领' },
        { label: '设计', value: '多口袋·防泼水' },
        { label: '颜色', value: '橄榄棕' },
      ] },
  ],
  // ── NOA MARKET V1 食饮 ──
  // 旧 food-01~14 emoji prototype 已废弃；此处为 V1 正式商品，ID = product-NNN 全局流水号。
  // 图片按 ID 绑定 images/products/<id>.png。name/desc/price 为占位骨架，后续补充。
  food: [
    { id: 'product-001', emoji: '🍞', name: '黑麦手工面包', nameEn: 'Dark Rye Artisan Bread', price: 6, shipping: 5,
      desc: '以黑麦粉为主、混合小麦粉手工揉制，长时间发酵后烘烤。外皮偏硬，内里紧实有嚼劲，带黑麦特有的微酸和谷物香。',
      features: [
        { label: '类型', value: '面包' },
        { label: '风味', value: '浓郁谷物香气' },
        { label: '配方', value: '黑麦与谷物制作' },
        { label: '包装', value: '袋装' },
      ] },
    { id: 'product-002', emoji: '🍫', name: '比利时手工巧克力', nameEn: 'Belgian Artisan Chocolates', price: 28, shipping: 8,
      desc: '一盒多颗装，含黑巧、牛奶巧与夹心口味，表面手工淋面装饰。入口先苦后甜，可可味明显，夹心部分偏软。',
      features: [
        { label: '类型', value: '巧克力' },
        { label: '风味', value: '可可香气与甜味' },
        { label: '组合', value: '多种巧克力口味' },
        { label: '包装', value: '礼盒装' },
      ] },
    { id: 'product-003', emoji: '☕', name: '高地咖啡豆', nameEn: 'Highland Brew Coffee Beans', price: 18, shipping: 5,
      desc: '整颗咖啡豆，中度烘焙，酸苦平衡。冲煮时香气偏坚果和焦糖调，口感醇厚，尾韵干净。',
      features: [
        { label: '类型', value: '咖啡豆' },
        { label: '风味', value: '烘焙香气' },
        { label: '烘焙', value: '均衡烘焙' },
        { label: '包装', value: '咖啡豆袋装' },
      ] },
    { id: 'product-004', emoji: '🥩', name: '高地牛排', nameEn: 'Highland Reserve Steak', price: 48, shipping: 8,
      desc: '厚切原切牛排，带均匀油花，冷冻锁鲜。煎制后外层焦香、内里多汁，肉味浓。',
      features: [
        { label: '类型', value: '牛排' },
        { label: '风味', value: '浓郁肉香' },
        { label: '保存', value: '冷冻保存' },
        { label: '包装', value: '真空包装' },
      ] },
    { id: 'product-005', emoji: '🥔', name: '魔鬼椒薯片', nameEn: "Devil's Heat Chips", price: 4, shipping: 4,
      desc: '薄切土豆片油炸后裹上魔鬼椒调味粉。咬下去脆，辣味来得直接，尾段带一点焦香。',
      features: [
        { label: '类型', value: '薯片' },
        { label: '风味', value: '香辣口感' },
        { label: '特点', value: '辣味配方' },
        { label: '包装', value: '袋装' },
      ] },
    { id: 'product-006', emoji: '🧃', name: '苏格兰苹果汁', nameEn: 'Scottish Orchard Apple Juice', price: 6, shipping: 6,
      desc: '苹果压榨制成的果汁，颜色偏浅金，果香清爽，甜中带一点酸，冰镇后更明显。玻璃瓶装。',
      features: [
        { label: '类型', value: '果汁饮品' },
        { label: '风味', value: '自然苹果香气' },
        { label: '特点', value: '清爽果味' },
        { label: '包装', value: '玻璃瓶装' },
      ] },
    { id: 'product-007', emoji: '🍟', name: '香脆细薯条', nameEn: 'Crispy Shoestring Fries', price: 4, shipping: 6,
      desc: '细切土豆条，预炸后冷冻。复炸或烘烤后外层酥脆、内里绵软，薯香明显。',
      features: [
        { label: '类型', value: '冷冻食品' },
        { label: '风味', value: '经典薯香' },
        { label: '特点', value: '细切薯条' },
        { label: '包装', value: '冷冻袋装' },
      ] },
    { id: 'product-008', emoji: '🐻', name: '巨型软糖熊', nameEn: 'Giant Gummy Bear', price: 32, shipping: 8,
      desc: '单只约 2kg 的整块水果味软糖，橡皮糖质地，透亮红色。口感偏韧有嚼劲，果味偏甜。',
      features: [
        { label: '类型', value: '软糖' },
        { label: '规格', value: '约 2kg 整块' },
        { label: '风味', value: '水果甜味' },
        { label: '包装', value: '礼盒装' },
      ] },
    { id: 'product-009', emoji: '🥣', name: '枫糖莓果格兰诺拉', nameEn: 'Maple Berry Granola', price: 8, shipping: 5,
      desc: '燕麦为主，混合杏仁、腰果、蔓越莓、蓝莓与南瓜籽，以枫糖调味后低温烘烤成块。口感松脆，坚果和果干味明显。',
      features: [
        { label: '类型', value: '谷物麦片' },
        { label: '配料', value: '燕麦、坚果、莓果干' },
        { label: '风味', value: '枫糖与坚果香' },
        { label: '包装', value: '自封袋装' },
      ] },
    { id: 'product-010', emoji: '🍝', name: '意大利面礼盒', nameEn: "Terre d'Italia Pasta Set", price: 32, shipping: 8,
      desc: '一套意式食材组合，含格拉尼亚诺 IGP 铜模拉制林圭尼面、罗勒番茄酱与初榨橄榄油。面条用 100% 硬粒小麦制作，酱料以意大利番茄为主。',
      features: [
        { label: '类型', value: '意面套装' },
        { label: '组合', value: '意面、番茄酱、橄榄油' },
        { label: '工艺', value: '铜模拉制' },
        { label: '包装', value: '手提礼盒' },
      ] },
    { id: 'product-011', emoji: '🥤', name: '高地可乐', nameEn: 'Highland Cola', price: 10, shipping: 8,
      desc: '玻璃瓶装可乐，每瓶 330ml，深棕色气泡饮料。以天然原料调制，口感偏经典可乐味，气足偏甜。',
      features: [
        { label: '类型', value: '碳酸饮料' },
        { label: '规格', value: '6 × 330ml 玻璃瓶' },
        { label: '风味', value: '经典可乐' },
        { label: '包装', value: '整箱装' },
      ] },
    { id: 'product-012', emoji: '🍬', name: '极酸挑战礼盒', nameEn: 'Extreme Sour Challenge Box', price: 18, shipping: 6,
      desc: '含酸味软糖、酸味糖带、酸味硬糖、酸味软条、酸味豆和爆酸粒共 6 种。表面裹酸味糖粉，入口酸味强烈，之后转甜。',
      features: [
        { label: '类型', value: '混装糖果' },
        { label: '组合', value: '6 种酸味糖果' },
        { label: '风味', value: '强酸后回甜' },
        { label: '包装', value: '铁盒分格装' },
      ] },
  ],
  lifecare: [
    { id: 'product-026', emoji: '🧴', name: '雪松香氛洗护套装', nameEn: 'Cedarwood Shampoo & Conditioner Set', price: 38, shipping: 5,
      desc: '雪松木质香调洗护套装，洗发露 300ml 搭配护发素 200ml。琥珀色压泵瓶与米色软管包装，雪松枝叶图案设计。',
      features: [
        { label: '组成', value: '洗发露 300ml + 护发素 200ml' },
        { label: '香调', value: '雪松木质' },
        { label: '包装', value: '琥珀瓶 + 米色软管' },
        { label: '图案', value: '雪松枝叶印刷' },
      ] },
    { id: 'product-025', emoji: '🪒', name: '剃须护理套装', nameEn: 'Shaving Care Set', price: 65, shipping: 5,
      desc: '剃须护理四件套，含剃须膏 100ml、须后水 100ml、獾毛刷、金属安全剃刀。剃须膏为软管包装，须后水为玻璃瓶，刷柄木质，剃刀金属网纹手柄。',
      features: [
        { label: '组成', value: '膏 + 水 + 刷 + 刀' },
        { label: '包装', value: '软管 + 玻璃瓶' },
        { label: '刷毛', value: '獾毛' },
        { label: '刀柄', value: '金属网纹' },
      ] },
    { id: 'product-029', emoji: '🪥', name: '声波电动牙刷', nameEn: 'Sonic Electric Toothbrush', price: 85, shipping: 5,
      desc: '白色立式电动牙刷，机身标注 Clean / White / Sensitive / Massage 四档模式，配充电底座及两支替换刷头。刷头为蓝白双色刷毛。',
      features: [
        { label: '驱动', value: '声波震动' },
        { label: '模式', value: '四档切换' },
        { label: '配件', value: '充电座 + 2 刷头' },
        { label: '刷毛', value: '蓝白双色' },
      ] },
    { id: 'product-030', emoji: '🤲', name: '无香护手霜', nameEn: 'Fragrance-Free Hand Cream', price: 9, shipping: 5,
      desc: '米白色软管护手霜 75ml，Fragrance Free / Moisturizing / For Everyday Care 标注，黑色螺旋挤压盖。',
      features: [
        { label: '容量', value: '75ml' },
        { label: '香调', value: '无香配方' },
        { label: '质地', value: '霜状' },
        { label: '包装', value: '软管螺旋盖' },
      ] },
    { id: 'product-027', emoji: '🩹', name: '急救护理包', nameEn: 'First Aid Kit', price: 28, shipping: 5,
      desc: '米色帆布手提急救包，红色十字标识，内含创可贴、酒精棉片、医用胶布、不锈钢剪刀、镊子等基础应急物资。红色拉链提手设计。',
      features: [
        { label: '材质', value: '帆布外壳' },
        { label: '组成', value: '创可贴 + 消毒 + 器械' },
        { label: '设计', value: '红十字标识' },
        { label: '提手', value: '红色拉链' },
      ] },
    { id: 'product-028', emoji: '🥒', name: '黄瓜面膜', nameEn: 'Cucumber Face Mask', price: 12, shipping: 5,
      desc: '黄瓜图案包装面膜，5 片装盒 + 单片独立包装。包装印有黄瓜切片与水珠视觉，包装标注 Hydrating / Soothing / Cooling。',
      features: [
        { label: '规格', value: '5 片装' },
        { label: '包装', value: '独立袋装' },
        { label: '视觉', value: '黄瓜切片印刷' },
        { label: '标注', value: 'Hydrating / Soothing / Cooling' },
      ] },
    { id: 'product-031', emoji: '💆', name: '颈肩加热按摩器', nameEn: 'Neck & Shoulder Heating Massager', price: 75, shipping: 8,
      desc: '米灰色织物披肩式按摩器，内嵌加热按摩球，加热 + 按摩结构，三键控制设计，USB 供电，可调节固定带。',
      features: [
        { label: '结构', value: '加热 + 按摩' },
        { label: '控制', value: '三键控制设计' },
        { label: '材质', value: '织物外层' },
        { label: '供电', value: 'USB 供电' },
      ] },
    { id: 'product-034', emoji: '😴', name: '睡眠遮光眼罩', nameEn: 'Sleep Eye Mask', price: 18, shipping: 5,
      desc: '深灰色丝绒眼罩，鼻梁贴合凹槽设计，可调节松紧带，配同色束口收纳袋。包装标注 Soft / Light Blocking / Comfortable Fit。',
      features: [
        { label: '材质', value: '丝绒面料' },
        { label: '设计', value: '鼻梁凹槽贴合' },
        { label: '调节', value: '松紧带' },
        { label: '配件', value: '束口收纳袋' },
      ] },
    { id: 'product-033', emoji: '🧴', name: '按摩精油', nameEn: 'Relaxing Massage Oil', price: 16, shipping: 5,
      desc: '琥珀色玻璃瓶装按摩精油100ml，木质瓶盖，瓶身与包装印有草本枝叶图案。',
      features: [
        { label: '容量', value: '100ml' },
        { label: '瓶身', value: '琥珀玻璃' },
        { label: '瓶盖', value: '木质' },
        { label: '包装', value: '纸盒装' },
      ] },
    { id: 'product-035', emoji: '💋', name: '草莓润唇膏', nameEn: 'Strawberry Lip Balm', price: 6, shipping: 5,
      desc: '粉色旋转管润唇膏 4.5g，草莓图案外壳，膏体呈粉红色。标注 Moisturizing / Softening / Daily Care。',
      features: [
        { label: '容量', value: '4.5g' },
        { label: '形态', value: '旋转管膏体' },
        { label: '香调', value: '草莓' },
        { label: '外壳', value: '草莓印花' },
      ] },
    { id: 'product-032', emoji: '🔥', name: '便携式暖手宝', nameEn: 'Portable Hand Warmer', price: 25, shipping: 5,
      desc: '米粉色鹅卵石造型充电暖手宝，正面三点电量指示灯，底部圆形开关键。包装标注 Fast Heating / Lightweight / Compact Size / Long Lasting Warmth。',
      features: [
        { label: '造型', value: '鹅卵石弧面' },
        { label: '指示', value: '三点电量灯' },
        { label: '开关', value: '底部圆键' },
        { label: '供电', value: '充电式' },
      ] },
  ],

  // ── NOA MARKET V1 精品 ──
  // 旧 luxury-01~23 品牌 prototype 已废弃；此处为 V1 正式商品，ID = product-NNN 全局流水号。
  // 图片按 ID 绑定 images/products/<id>.png。本类邮费统一 35。
  luxury: [
    { id: 'product-036', name: '便携复古音箱', nameEn: 'Portable Retro Speaker', price: 180, shipping: 35,
      desc: '复古造型蓝牙音箱，金属网罩面板配木质外框，顶部旋钮控制音量与频道。内置电池，可提手携带。',
      features: [
        { label: '连接', value: '蓝牙无线' },
        { label: '外框', value: '木质' },
        { label: '面板', value: '金属网罩' },
        { label: '供电', value: '内置电池' },
      ] },
    { id: 'product-037', name: '蜡质防水夹克', nameEn: 'Waxed Waterproof Jacket', price: 320, shipping: 35,
      desc: '蜡质涂层棉夹克，翻领拉链门襟，前身多口袋。表层防水，内里格纹衬布。',
      features: [
        { label: '材质', value: '蜡质涂层棉' },
        { label: '功能', value: '防水' },
        { label: '门襟', value: '拉链' },
        { label: '内里', value: '格纹衬布' },
      ] },
    { id: 'product-038', name: '皮革旅行手提包', nameEn: 'Leather Travel Holdall', price: 480, shipping: 35,
      desc: '头层牛皮旅行包，双提手配可拆卸肩带，顶部拉链开合，两侧金属扣。容量适合短途出行。',
      features: [
        { label: '材质', value: '头层牛皮' },
        { label: '背法', value: '手提·可拆卸肩带' },
        { label: '开合', value: '顶部拉链' },
        { label: '五金', value: '金属扣' },
      ] },
    { id: 'product-039', name: '黑色马术雕塑', nameEn: 'Black Equestrian Sculpture', price: 260, shipping: 35,
      desc: '黑色树脂马匹雕塑，站立姿态，配深色底座。表面哑光处理，可作桌面或书架摆件。',
      features: [
        { label: '材质', value: '树脂' },
        { label: '造型', value: '站立马匹' },
        { label: '表面', value: '哑光' },
        { label: '底座', value: '深色' },
      ] },
    { id: 'product-040', name: '玫瑰金螺钉戒指', nameEn: 'Rose Gold Screw Ring', price: 680, shipping: 35,
      desc: '玫瑰金色金属戒指，环身刻有一圈螺钉纹样，抛光表面。附收纳礼盒。',
      features: [
        { label: '材质', value: '金属' },
        { label: '颜色', value: '玫瑰金色' },
        { label: '纹样', value: '螺钉环刻' },
        { label: '包装', value: '礼盒装' },
      ] },
    { id: 'product-041', name: '棕色皮质德比鞋', nameEn: 'Brown Leather Derby Shoes', price: 240, shipping: 35,
      desc: '棕色真皮德比鞋，开放式系带结构，皮革大底，鞋头翼纹雕花。',
      features: [
        { label: '材质', value: '真皮' },
        { label: '结构', value: '开放式系带' },
        { label: '鞋底', value: '皮革' },
        { label: '鞋头', value: '翼纹雕花' },
      ] },
    { id: 'product-042', name: '黑色机械腕表', nameEn: 'Black Mechanical Watch', price: 1850, shipping: 35,
      desc: '黑色表盘机械腕表，不锈钢表壳，皮质表带，表背透明可见机芯。',
      features: [
        { label: '机芯', value: '机械' },
        { label: '表壳', value: '不锈钢' },
        { label: '表带', value: '皮质' },
        { label: '表背', value: '透明可视' },
      ] },
    { id: 'product-043', name: '圆顶玻璃台灯', nameEn: 'Dome Glass Table Lamp', price: 190, shipping: 35,
      desc: '圆顶玻璃灯罩台灯，黄铜底座与拉链开关，暖光灯泡。灯罩为绿色玻璃。',
      features: [
        { label: '灯罩', value: '绿色玻璃' },
        { label: '底座', value: '黄铜' },
        { label: '开关', value: '拉链式' },
        { label: '光色', value: '暖光' },
      ] },
    { id: 'product-044', name: '智能旅行箱', nameEn: 'Smart Luggage', price: 520, shipping: 35,
      desc: '硬壳拉杆旅行箱，四向万向轮，内置 USB 充电接口与 TSA 密码锁，机身侧面手提把手。',
      features: [
        { label: '箱体', value: '硬壳' },
        { label: '滚轮', value: '四向万向轮' },
        { label: '充电', value: 'USB 接口' },
        { label: '锁具', value: 'TSA 密码锁' },
      ] },
    { id: 'product-045', name: '格纹羊毛围巾', nameEn: 'Checked Wool Scarf', price: 120, shipping: 35,
      desc: '羊毛织造围巾，格纹图案，两端流苏收边。质地厚软。',
      features: [
        { label: '材质', value: '羊毛' },
        { label: '花纹', value: '格纹' },
        { label: '工艺', value: '流苏收边' },
        { label: '手感', value: '厚软' },
      ] },
    { id: 'product-046', name: '黑色钢笔礼盒', nameEn: 'Black Fountain Pen Gift Set', price: 280, shipping: 35,
      desc: '黑色树脂笔杆钢笔，金属笔夹与镀金笔尖，附上墨器与礼盒。',
      features: [
        { label: '笔杆', value: '黑色树脂' },
        { label: '笔尖', value: '镀金' },
        { label: '笔夹', value: '金属' },
        { label: '配件', value: '上墨器 + 礼盒' },
      ] },
    { id: 'product-047', name: '便携投影仪', nameEn: 'Portable Projector', price: 550, shipping: 35,
      desc: '小型便携投影仪，支持无线投屏，内置扬声器，顶部对焦旋钮，配电源适配器。',
      features: [
        { label: '投屏', value: '无线' },
        { label: '音响', value: '内置扬声器' },
        { label: '对焦', value: '顶部旋钮' },
        { label: '配件', value: '电源适配器' },
      ] },
    { id: 'product-061', name: '好丈夫秘籍', nameEn: 'The Good Husband Manual', price: 88, shipping: 35,
      desc: '精装指导手册，收录日常相处、沟通方式、生活习惯与关系维护等主题内容。采用收藏级书盒包装，深红色封面搭配金色压纹设计，打造一本关于成为好丈夫的趣味指南。',
      features: [
        { label: '类型', value: '精装指导手册' },
        { label: '内容', value: '沟通·相处·生活技巧' },
        { label: '装帧', value: '硬壳精装' },
        { label: '包装', value: '礼盒装' },
      ] },
  ],
  // ── NOA MARKET V1 特产 ──
  // 中国地方特产分类。ID = product-NNN 全局流水号，图片按 ID 绑定 images/products/<id>.png。
  // 本类邮费统一 28。
  specialty: [
    { id: 'product-048', name: '金华火腿', nameEn: 'Jinhua Ham', price: 68, shipping: 8,
      desc: '浙江金华后腿腌制风干火腿，经上盐、翻腿、晾晒、发酵长时间制成。肉色暗红，咸香浓郁，切片蒸煮或炖汤取味。',
      features: [
        { label: '产地', value: '浙江金华' },
        { label: '部位', value: '猪后腿' },
        { label: '工艺', value: '腌制风干发酵' },
        { label: '食用', value: '切片蒸煮·炖汤' },
      ] },
    { id: 'product-049', name: '湖南酱板鸭', nameEn: 'Hunan Sauced Duck', price: 22, shipping: 8,
      desc: '整鸭经腌制、卤煮、压平、烘干制成，色泽酱红，肉质紧实。咸辣入味，带卤香，可直接撕食或蒸后切块。',
      features: [
        { label: '产地', value: '湖南' },
        { label: '原料', value: '整鸭' },
        { label: '工艺', value: '腌卤压平烘干' },
        { label: '口味', value: '咸辣' },
      ] },
    { id: 'product-050', name: '潮汕牛肉丸', nameEn: 'Chaoshan Beef Balls', price: 16, shipping: 15,
      desc: '牛后腿肉手工捶打成浆再挤制成丸，冷冻保存。质地弹韧，久煮不散，可下汤或打边炉。',
      features: [
        { label: '产地', value: '广东潮汕' },
        { label: '原料', value: '牛后腿肉' },
        { label: '工艺', value: '手工捶打' },
        { label: '保存', value: '冷冻' },
      ] },
    { id: 'product-051', name: '杭州龙井茶', nameEn: 'Hangzhou Longjing Tea', price: 48, shipping: 8,
      desc: '绿茶，扁平挺直的炒青工艺，汤色浅黄清亮，香气清高，滋味回甘。铁罐密封包装。',
      features: [
        { label: '产地', value: '浙江杭州' },
        { label: '工艺', value: '炒青' },
        { label: '外形', value: '扁平挺直' },
        { label: '包装', value: '铁罐密封' },
      ] },
    { id: 'product-052', name: '贵州老干妈', nameEn: 'Lao Gan Ma Chili Sauce', price: 5, shipping: 8,
      desc: '辣椒配豆豉、菜籽油炒制的下饭酱，玻璃瓶装。香辣带油香，可拌饭拌面或作调料。',
      features: [
        { label: '产地', value: '贵州' },
        { label: '主料', value: '辣椒·豆豉' },
        { label: '口味', value: '香辣' },
        { label: '包装', value: '玻璃瓶' },
      ] },
    { id: 'product-053', name: '柳州螺蛳粉', nameEn: 'Liuzhou Snail Rice Noodles', price: 6, shipping: 8,
      desc: '袋装速食米粉，配螺蛳熬制汤底、酸笋、腐竹、花生等料包。汤味酸辣带发酵气味，煮泡后食用。',
      features: [
        { label: '产地', value: '广西柳州' },
        { label: '配料', value: '米粉·酸笋·腐竹' },
        { label: '汤底', value: '螺蛳熬制' },
        { label: '形态', value: '袋装速食' },
      ] },
    { id: 'product-054', name: '南京活珠子', nameEn: 'Nanjing Balut', price: 12, shipping: 15,
      desc: '孵化中的鸡蛋煮制而成，蛋内含半成形雏形。真空冷藏包装，煮熟后配椒盐食用。',
      features: [
        { label: '产地', value: '江苏南京' },
        { label: '原料', value: '孵化鸡蛋' },
        { label: '食用', value: '配椒盐' },
        { label: '保存', value: '冷藏' },
      ] },
    { id: 'product-055', name: '东北手工水饺', nameEn: 'Northeast Handmade Dumplings', price: 12, shipping: 15,
      desc: '手工包制的猪肉酸菜馅水饺，冷冻保存。皮厚馅足，下锅水煮后食用。',
      features: [
        { label: '产地', value: '东北' },
        { label: '馅料', value: '猪肉酸菜' },
        { label: '工艺', value: '手工包制' },
        { label: '保存', value: '冷冻' },
      ] },
    { id: 'product-056', name: '泉州土笋冻', nameEn: 'Quanzhou Sandworm Jelly', price: 14, shipping: 15,
      desc: '沙虫熬煮后自然凝结成冻，胶质透明。冷藏包装，口感爽滑弹韧，配蒜蓉、酱油或醋食用。',
      features: [
        { label: '产地', value: '福建泉州' },
        { label: '原料', value: '沙虫熬制' },
        { label: '口感', value: '爽滑弹韧' },
        { label: '保存', value: '冷藏' },
      ] },
    { id: 'product-057', name: '四川麻辣零食', nameEn: 'Sichuan Spicy Snack Set', price: 16, shipping: 8,
      desc: '麻辣味零食组合，含辣条、麻辣花生、豆干、牛肉粒等，独立小包分装。麻辣咸香。',
      features: [
        { label: '产地', value: '四川' },
        { label: '组合', value: '辣条·花生·豆干·牛肉粒' },
        { label: '口味', value: '麻辣咸香' },
        { label: '包装', value: '独立小包' },
      ] },
    { id: 'product-058', name: '阳澄湖大闸蟹', nameEn: 'Yangcheng Lake Hairy Crab', price: 68, shipping: 25,
      desc: '阳澄湖出产的河蟹，青壳白肚，蟹黄饱满。附蘸料，活蟹绑扎后冷链发货，蒸制后食用。',
      features: [
        { label: '产地', value: '阳澄湖' },
        { label: '外形', value: '青壳白肚' },
        { label: '食用', value: '蒸制·配蘸料' },
        { label: '配送', value: '冷链' },
      ] },
    { id: 'product-059', name: '云南鲜花饼', nameEn: 'Yunnan Rose Flower Cake', price: 12, shipping: 8,
      desc: '以食用玫瑰花瓣为馅的酥皮点心，饼皮层次分明，花香明显，甜度适中。盒装。',
      features: [
        { label: '产地', value: '云南' },
        { label: '馅料', value: '食用玫瑰花瓣' },
        { label: '饼皮', value: '酥皮' },
        { label: '包装', value: '盒装' },
      ] },
    { id: 'product-060', name: '青岛烤鱼片', nameEn: 'Qingdao Grilled Fish Slices', price: 14, shipping: 8,
      desc: '海鱼去骨压制烘烤成片，即食零食。质地干韧有嚼劲，带海产咸鲜微甜。袋装。',
      features: [
        { label: '产地', value: '山东青岛' },
        { label: '原料', value: '海鱼' },
        { label: '工艺', value: '压制烘烤' },
        { label: '包装', value: '袋装' },
      ] },
  ],
  wishlist: [
    // 面基三件套（剧情资产）：name 为拥有判定键，保持不变以保护旧购买记录；id 改为 product-070/071/072 仅用于绑定新图片；displayName 为展示名。
    { id: 'product-070', emoji: '✈️', name: '去曼城找他的机票', displayName: '跨洋航班邀请函', unlock: SHOP_UNLOCK_TIERS.committed, desc: '一张连接两座城市的航班票据。它记录的不只是出发时间与航班信息，更代表一次跨越距离的旅程开始。在故事里，它是抵达约定地点的重要凭证，也是一次真实相遇前的第一步。', modelContext: '这是她前往曼彻斯特与你见面的航班安排，是面基计划的一部分。', price: 1200, shipping: 0, badge: '跨越距离', isReunion: true, ghostMsg: "You are coming? ...Good. I will be at the airport." },
    { id: 'product-071', emoji: '🏨', name: '曼彻斯特酒店', displayName: '城市入住纪念房卡', unlock: SHOP_UNLOCK_TIERS.committed, desc: '一张属于旅途中的城市入住凭证。它记录抵达后的停留空间，以及两个人在陌生城市中共同留下的时间。不是普通住宿用品，而是一段旅程开始后的纪念物。', modelContext: '这是她来曼彻斯特与你见面期间的酒店住宿，是面基计划的一部分。', price: 900, shipping: 0, badge: '我在等你', isReunion: true, ghostMsg: 'I will be there. Promise.' },
    { id: 'product-072', emoji: '🗺️', name: '英国旅行计划', displayName: '英国旅行典藏指南', unlock: SHOP_UNLOCK_TIERS.committed, desc: '一本记录英国城市、人文景观与旅行路线的收藏指南。包含城市介绍、旅行规划与探索记录，是提前准备旅程的重要资料。它象征着对未来目的地的期待，以及一次完整旅程的开始。', modelContext: '这是她来英国与你见面后、你们一起在英国各地旅行的行程计划，是面基计划的一部分。', price: 1500, shipping: 0, badge: '异国追爱', isReunion: true, ghostMsg: 'I will be your guide. Every city.' },
  ],
  home: [
    // ── NOA MARKET V1 资产（车/房）──
    // 资产不是物品、不收邮费；shipping 字段复用为「手续费」固定 100。无解锁门槛（门槛是旧版遗留）。
    // 图片按 ID 绑定 images/products/<id>.png，加载失败回退 emoji。
    { id: 'product-062', emoji: '🚗', name: 'MINI Cooper 城市通勤座驾', nameEn: 'MINI Cooper', price: 30000, shipping: 100, isHomeItem: true, homeType: 'car',
      desc: '经典城市车型，紧凑车身设计，搭配标志性外观风格，适合日常城市驾驶。' },
    { id: 'product-063', emoji: '🏡', name: 'Cornwall Seaside Cottage 康沃尔海岸小屋', nameEn: 'Cornwall Seaside Cottage', price: 650000, shipping: 100, isHomeItem: true, homeType: 'house',
      desc: '位于海岸附近的石质住宅，拥有海景环境与传统英式建筑外观。' },
    { id: 'product-064', emoji: '🏠', name: 'Herefordshire Country House 英式乡村住宅', nameEn: 'Herefordshire Country House', price: 1250000, shipping: 100, isHomeItem: true, homeType: 'house',
      desc: '英国乡村独栋住宅，拥有庭院、花园以及周围自然景观。' },
    { id: 'product-065', emoji: '🌲', name: 'Woodland Retreat 森林隐居小屋', nameEn: 'Woodland Retreat', price: 550000, shipping: 100, isHomeItem: true, homeType: 'house',
      desc: '隐藏于森林环境中的私人住宅，周围有树林、溪流和自然景观。' },
    { id: 'product-066', emoji: '🚙', name: 'Land Rover Defender 探索型越野车', nameEn: 'Land Rover Defender', price: 75000, shipping: 100, isHomeItem: true, homeType: 'car',
      desc: '经典越野车型，拥有坚固车身设计与户外驾驶风格。' },
    { id: 'product-067', emoji: '🏙️', name: 'Manchester Skyline Residence 曼彻斯特城市景观公寓', nameEn: 'Manchester Skyline Residence', price: 725000, shipping: 100, isHomeItem: true, homeType: 'house',
      desc: '现代城市住宅，拥有落地窗设计与城市天际线景观。' },
    { id: 'product-068', emoji: '🏎️', name: 'Porsche 911 性能跑车收藏', nameEn: 'Porsche 911', price: 120000, shipping: 100, isHomeItem: true, homeType: 'car',
      desc: '经典运动跑车设计，流畅车身比例与驾驶体验结合，作为私人座驾收藏。' },
    { id: 'product-069', emoji: '🏰', name: '苏格兰高地私人庄园', nameEn: 'Scottish Highland Private Estate', price: 6800000, shipping: 100, isHomeItem: true, homeType: 'house',
      desc: '位于苏格兰高地的私人庄园资产。远离城市喧嚣，拥有独立建筑、广阔土地以及自然景观视野。这里不仅是一处住所，更是一片属于自己的私人空间。' },
  ],
};

// 商品资格：只有房车地（isHomeItem）与面基三件套（isReunion）才会永久拥有 / 售罄；
// 其余全部商品（含消耗品、普通礼物）一律允许重复购买，maxPurchase 不作为永久拥有信号
// （不改动 purchaseCounts / purchasedItems 记录）
function isUniqueProduct(p) {
  return !!(p && (p.isHomeItem || p.isReunion));
}

// 商品主视觉：有 id 则用 images/products/<id>.png，加载失败自动回退 emoji；
// 无 id（季节/入冬限定）直接用 emoji。不新增数据字段。
function renderProductVisual(p) {
  const emojiHtml = `<div class="product-emoji">${p.emoji || ''}</div>`;
  if (!p || !p.id) return emojiHtml;
  const src = `images/products/${p.id}.png`;
  const fallback = emojiHtml.replace(/"/g, '&quot;');
  return `<img class="product-img" src="${src}" alt="${(p.name || '').replace(/"/g, '&quot;')}" loading="lazy" onerror="this.outerHTML='${fallback}'">`;
}

// 阶段0：稳定商品ID读取助手（只读，不消费；不改动任何 name-keyed 旧逻辑）
function getProductId(product) {
  return product && product.id ? product.id : null;
}
// NOA MARKET V1 商品：id 形如 product-NNN。V1 商品 price 即最终售价，不再套用旧 ×1.8 倍率。
function isV1MarketProduct(product) {
  return !!(product && typeof product.id === 'string' && product.id.startsWith('product-'));
}
function getProductById(id) {
  if (!id) return null;
  for (const cat in MARKET_PRODUCTS) {
    const found = MARKET_PRODUCTS[cat].find(p => p.id === id);
    if (found) return found;
  }
  // 入冬限定商品也可按 ID 查找
  const winter = WINTER_SEASONAL.find(p => p.id === id);
  if (winter) return winter;
  return null;
}

// 特殊企划 Collection 成员配置（唯一事实源，勿扩展成通用 engine）。
// 成员用稳定 productId 声明；拥有判定走 productId → 商品对象 → 中文 name → purchasedItems，
// 以兼容老用户按 name 记账的历史记录，不迁移 localStorage、不改 name、不改历史购买记录。
const SPECIAL_COLLECTIONS = [
  {
    id: 'reunion',
    productIds: ['product-070', 'product-071', 'product-072'],
    rewardFlag: 'metInPerson',
  },
];

// 把某 Collection 的 productIds 解析为中文 name 列表（回查 MARKET_PRODUCTS，保持声明顺序）。
function getCollectionItemNames(collectionId) {
  const col = SPECIAL_COLLECTIONS.find(c => c.id === collectionId);
  if (!col) return [];
  return col.productIds
    .map(pid => { const p = getProductById(pid); return p ? p.name : null; })
    .filter(Boolean);
}

// 阶段1：Purchase Fact 事实层（新实体，与 legacy purchasedItems/purchaseCounts 并写）
// 只写不读——本阶段没有任何消费方，legacy 读取路径完全不变。
// productId 对 MARKET_PRODUCTS 商品是稳定 ID；对季节限定等无 ID 商品记 null，
// 用 name 快照兜底，不给范围外商品池补 ID。
// 每笔 Purchase 的稳定唯一 ID（Phase 2 Purchase↔Delivery 关联锚）。
// 不用 productId 代替：同商品可多次购买。
function _newPurchaseId() {
  return 'pur-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
function getPurchaseFacts() {
  try { return JSON.parse(localStorage.getItem('purchaseFacts') || '[]'); }
  catch(e) { return []; }
}
function addPurchaseFact(product, opts) {
  if (!product) return null;
  opts = opts || {};
  const facts = getPurchaseFacts();
  const fact = {
    purchaseId: _newPurchaseId(),
    productId: getProductId(product) || null,
    name: product.name || '',
    category: opts.category || null,
    total: (opts.total != null) ? opts.total : null,
    // initiator：当前所有 _finishPurchase 均由 user 发起，忠实记录当前事实
    initiator: opts.initiator || 'user',
    // payer：从确定性支付分支传入（user=余额扣款 / ghost=spendGhostCard），不事后猜
    payer: opts.payer || null,
    // recipient：snapshot 当前购买路径已确定的收件方，不重构 isUserItem/isGhostGift
    recipient: opts.recipient || null,
    // Phase 2：deliveryId 在 Purchase 创建时通常还不知道，先置 null，Delivery 建成后回填。
    // wishlist/Reunion 不建 Delivery，因此 null 是合法终态。
    deliveryId: null,
    ts: Date.now(),
  };
  facts.push(fact);
  try { localStorage.setItem('purchaseFacts', JSON.stringify(facts)); } catch(e) {}
  return fact;
}
// Phase 2：Delivery 创建成功后，把 deliveryId 回填到对应 purchaseId 的 Purchase Fact。
// 只补充关联，不改任何其它字段；找不到或参数缺失时静默返回。
function setPurchaseFactDelivery(purchaseId, deliveryId) {
  if (!purchaseId || !deliveryId) return;
  const facts = getPurchaseFacts();
  const fact = facts.find(f => f && f.purchaseId === purchaseId);
  if (!fact || fact.deliveryId === deliveryId) return;
  fact.deliveryId = deliveryId;
  try { localStorage.setItem('purchaseFacts', JSON.stringify(facts)); } catch(e) {}
}

// 节日限定：从家寄给他（节日前3天解锁，过了消失）
// 老 emoji prototype 已退役（用户 2026-09-28 决议删除节日从家寄限定）。
// 保留空数组与 getSeasonalFromHome()，各调用点走 length 判断自然不再上架。
// 老用户存档里已购的 isFromHome 记录按 name 记账，指向已删商品仍静默无害。
const SEASONAL_FROM_HOME = [];

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

// 入冬限定：入冬自动上架，开春自动下架（窗口 9/20–次年 3/1）。
// cat 标明并入哪个商城分类；winterTag 触发商城「入冬限定」角标。
const WINTER_SEASONAL = [
  { id: 'product-073', cat: 'food', winterTag: true, name: '冬季黑巧热可可', nameEn: 'Winter Dark Drinking Chocolate', price: 18, shipping: 5,
    desc: '高可可含量饮用巧克力，以黑巧克力碎与可可粉调配。加入热牛奶加热搅拌即可饮用，口感浓厚顺滑，甜度偏低。',
    features: [
      { label: '类型', value: '饮用巧克力' },
      { label: '风味', value: '浓郁黑巧' },
      { label: '冲调', value: '搭配热牛奶' },
      { label: '包装', value: '250g 金属罐装' },
    ] },
  { id: 'product-074', cat: 'food', winterTag: true, name: '苏格兰黄油酥饼铁盒', nameEn: 'Scottish Butter Shortbread Tin', price: 24, shipping: 5,
    desc: '传统苏格兰风格黄油酥饼，以黄油烘焙，口感酥松厚实，带明显的奶油与烘烤麦香。冷季限定格纹金属铁盒包装。',
    features: [
      { label: '类型', value: '黄油酥饼' },
      { label: '风味', value: '黄油与烘烤麦香' },
      { label: '产地', value: 'Scotland' },
      { label: '包装', value: '限定铁盒装' },
    ] },
  { id: 'product-075', cat: 'food', winterTag: true, name: '烤栗子焦糖爆米花', nameEn: 'Roasted Chestnut Caramel Popcorn', price: 14, shipping: 5,
    desc: '焦糖爆米花混合烤栗子，表层裹有薄脆焦糖，口感酥脆，带栗子的坚果香与焦糖烘烤甜味。',
    features: [
      { label: '类型', value: '焦糖爆米花' },
      { label: '配料', value: '爆米花·栗子·焦糖' },
      { label: '风味', value: '焦糖与烤栗子' },
      { label: '包装', value: '150g 密封罐装' },
    ] },
  { id: 'product-076', cat: 'food', winterTag: true, name: '热红酒套餐', nameEn: 'Mulled Wine Kit', price: 38, shipping: 8,
    desc: '冷季热红酒组合，包含一瓶红葡萄酒、热红酒香料包、肉桂、八角与干燥橙片。将香料与橙片加入红酒中低温加热即可饮用。',
    features: [
      { label: '类型', value: '热红酒组合' },
      { label: '组合', value: '红葡萄酒·香料包·干燥橙片' },
      { label: '香料', value: '肉桂·八角等' },
      { label: '包装', value: '冬季限定套装' },
    ] },
  { id: 'product-077', cat: 'clothing', winterTag: true, emoji: '🧤', name: '黑色羊皮羊绒手套', nameEn: 'Black Leather Cashmere-Lined Gloves', price: 85, shipping: 6,
    desc: '黑色羊皮手套，内里使用羊绒混纺针织衬里。皮质柔软细腻，腕口拼接针织罗纹，搭配皮革搭扣。',
    features: [
      { label: '材质', value: '羊皮' },
      { label: '内里', value: '羊绒混纺' },
      { label: '设计', value: '针织腕口·皮革搭扣' },
      { label: '颜色', value: '黑色' },
    ] },
  { id: 'product-078', cat: 'clothing', winterTag: true, emoji: '👕', name: '炭灰保暖内衣套装', nameEn: 'Charcoal Thermal Base Layer Set', price: 78, shipping: 6,
    desc: '炭灰色男士保暖内衣套装，包含圆领长袖上衣与修身长裤。面料柔软贴身，弹力针织结构，袖口与裤脚收窄。',
    features: [
      { label: '组合', value: '长袖上衣·长裤' },
      { label: '材质', value: '弹力保暖针织' },
      { label: '版型', value: '贴身修身' },
      { label: '颜色', value: '炭灰色' },
    ] },
  { id: 'product-079', cat: 'clothing', winterTag: true, emoji: '🧶', name: '炭灰羊绒高领毛衣', nameEn: 'Charcoal Cashmere Roll-Neck Sweater', price: 165, shipping: 6,
    desc: '炭灰色羊绒高领毛衣，细密针织面料，高领与袖口、下摆采用罗纹收边。版型简洁，质地柔软厚实。',
    features: [
      { label: '材质', value: '羊绒' },
      { label: '领型', value: '高领' },
      { label: '工艺', value: '罗纹收边' },
      { label: '颜色', value: '炭灰色' },
    ] },
  { id: 'product-080', cat: 'lifecare', winterTag: true, emoji: '♨️', name: '长效暖贴（20片装）', nameEn: 'Long-Lasting Heat Pads (20-Pack)', price: 16, shipping: 6,
    desc: '一次性长效暖贴，拆封后接触空气自动发热。单片独立密封包装，轻薄便携，适合冷天通勤、外出或长时间户外活动时使用。',
    features: [
      { label: '类型', value: '一次性暖贴' },
      { label: '数量', value: '20片装' },
      { label: '发热', value: '最长约12小时' },
      { label: '包装', value: '独立密封装' },
    ] },
  { id: 'product-081', cat: 'lifecare', winterTag: true, emoji: '🍱', name: '真空保温餐盒套装', nameEn: 'Vacuum Insulated Lunch Set', price: 89, shipping: 8,
    desc: '多层真空保温餐盒，采用食品级不锈钢内胆与双层隔热结构。独立餐盒可将主食、配菜与汤品分开盛放，配有便携提手、保温收纳袋及专用餐具。',
    features: [
      { label: '材质', value: '食品级不锈钢' },
      { label: '结构', value: '多层真空保温' },
      { label: '配件', value: '餐具·保温收纳袋' },
      { label: '颜色', value: '橄榄灰' },
    ] },
];

// 入冬窗口：9/20 – 次年 3/1（跨年，用 月*100+日 比较）
function isWinterWindow() {
  const today = new Date();
  const md = (today.getMonth() + 1) * 100 + today.getDate();
  return md >= 920 || md <= 301;
}

function getWinterSeasonal(categoryId) {
  if (!isWinterWindow()) return [];
  return categoryId ? WINTER_SEASONAL.filter(p => p.cat === categoryId) : WINTER_SEASONAL;
}


const LOCATION_SPECIALS = {
  'Germany': [
    { emoji: '🔵', name: '妮维雅铁罐', desc: '德国本地买的。比你网购的版本大。', tip: '德国超市随手拿的。用上。' },
    { emoji: '🌭', name: '纽伦堡香肠礼盒', desc: '纽伦堡当地香肠，真空包装。', tip: '纽伦堡的。比英国那边卖的强。' },
    { emoji: '✏️', name: '辉柏嘉彩铅套装', desc: '辉柏嘉产地直购，颜色很全。', tip: '产地买的。比较便宜。' },
    { emoji: '🥨', name: '德国椒盐卷饼', desc: '慕尼黑街头随手买的，脆的。', tip: '这边到处都是。你可能喜欢。' },
    { emoji: '🍺', name: '德国小麦啤酒礼盒', desc: '巴伐利亚正经小麦啤，罐装。', tip: '别一次喝完。' },
  ],
  'Norway': [
    { emoji: '🍫', name: 'Freia巧克力礼盒', desc: '挪威国民巧克力，这边人手一盒。', tip: '挪威人爱吃这个。试试。' },
    { emoji: '🧤', name: '驯鹿毛手套', desc: '本地手工，真的驯鹿毛。', tip: '挪威的冬天很冷。你那边也冷。' },
    { emoji: '🌌', name: '北极光明信片', desc: '当地拍的，不是印刷图。', tip: '没拍到本人。明信片凑合。' },
    { emoji: '🐟', name: '挪威烟熏三文鱼礼盒', desc: '挪威产的，真空冷链，新鲜。', tip: '挪威三文鱼就是不一样。' },
    { emoji: '🫙', name: '挪威鳕鱼松礼盒', desc: '当地特产，配面包吃。', tip: '这边人当早餐吃。你试试。' },
  ],
  'Edinburgh': [
    { emoji: '🥃', name: '单一麦芽威士忌小样', desc: '爱丁堡酒厂出的，试饮装。', tip: '产地买的。别一口闷。' },
    { emoji: '🧣', name: '苏格兰羊绒围巾', desc: '正经苏格兰格纹，羊绒的。', tip: '苏格兰的。比较软。' },
    { emoji: '🫙', name: '黄油饼干铁罐', desc: '爱丁堡老字号，比超市那种好吃。', tip: '本地买的。配茶。' },
    { emoji: '🍮', name: '苏格兰传统布丁礼盒', desc: 'Cranachan风味，覆盆子燕麦，苏格兰甜点。', tip: '苏格兰人过节吃这个。' },
    { emoji: '🐑', name: '苏格兰羊肉干', desc: '高地出产，风干的，有嚼劲。', tip: '行军口粮的感觉。好的那种。' },
  ],
  'Manchester': [
    { emoji: '🫖', name: 'PG Tips红茶礼盒', desc: '曼彻斯特老牌，家里常喝这个。', tip: '从小喝这个长大的。' },
    { emoji: '🥐', name: 'Eccles蛋糕', desc: '曼彻斯特特产，葡萄干酥皮。', tip: '本地的。不知道你喜不喜欢。' },
    { emoji: '🍯', name: '老字号手工果酱', desc: '曼彻斯特老店，不加防腐剂。', tip: '家附近那家店买的。' },
    { emoji: '🍺', name: 'Boddingtons曼城淡啤', desc: '曼城本地啤酒，顺口的那种。', tip: '曼城的。随手带了罐。' },
    { emoji: '🧁', name: 'Manchester Tart小饼', desc: '曼城传统甜点，覆盆子椰子底。', tip: '本地人都认识这个。' },
  ],
  'Poland': [
    { emoji: '🍯', name: '波兰蜂蜜礼盒', desc: '波兰山区蜂蜜，颜色很深，香。', tip: '波兰蜂蜜比英国的好。' },
    { emoji: '🍫', name: 'Wedel巧克力', desc: '波兰百年老牌，黑巧系列。', tip: '这边老牌子。不腻。' },
    { emoji: '🟡', name: '手工琥珀摆件', desc: '波兰琥珀，波罗的海产的。', tip: '波兰特产。放着看吧。' },
    { emoji: '🥟', name: '波兰饺子Pierogi礼盒', desc: '冷冻真空装，土豆奶酪馅，煮后煎一下。', tip: '你问的那个。自己煮。' },
    { emoji: '🍲', name: 'Bigos猎人炖菜礼盒', desc: '波兰国民菜，酸菜肉炖的，暖胃。', tip: '波兰人冬天吃这个。重口但暖。' },
    { emoji: '🥒', name: '波兰酸黄瓜罐', desc: '波兰式腌制，比普通酸黄瓜酸得多。', tip: '这边人当零食吃。你试试。' },
  ],
  'Hereford Base': [
    { emoji: '🍵', name: '苹果茶礼盒', desc: 'Hereford苹果产区出的茶，清甜。', tip: '基地附近买的。' },
    { emoji: '🍎', name: '苹果酒礼盒', desc: 'Hereford本地苹果酒，这边著名。', tip: 'Hereford苹果酒产区。别喝太多。' },
    { emoji: '🧀', name: 'Hereford牛奶芝士', desc: '本地农场出的，新鲜的。', tip: '基地附近农场买的。' },
  ],
  'London': [
    { emoji: '🎶', name: '百年唱片店黑胶', desc: '伦敦老店，随手挑的，不知道你喜不喜欢。', tip: '伦敦那边的老店，随手买的。' },
    { emoji: '🧁', name: 'Fortnum & Mason 饼干礼盒', desc: '百年老铺出品，精装铁盒。', tip: '百年老铺，随便挑了一个。' },
    { emoji: '☕', name: 'Monmouth 精品咖啡豆', desc: '科芬园老字号，本地人喝这个。', tip: 'Monmouth的，本地人喝这个。' },
    { emoji: '🥧', name: 'Borough Market 鲜制果塔', desc: '伦敦最老的市集，现做的，当天吃。', tip: 'Borough Market买的。新鲜的。' },
    { emoji: '🍵', name: 'Whittard 调味茶礼盒', desc: '伦敦老茶铺，口味多，好喝。', tip: '挑了几种你可能喜欢的。' },
  ],
  'Amsterdam': [
    { emoji: '🧀', name: '荷兰老熟高达奶酪', desc: '阿姆斯特丹市场直买，切片配面包。', tip: '这边市场买的，切片配面包。' },
    { emoji: '🌷', name: '郁金香球根礼盒', desc: '阿姆斯特丹到处卖这个，真的种得出来。', tip: '阿姆斯特丹就是到处卖这个。' },
    { emoji: '🍪', name: 'Stroopwafel 礼盒', desc: '荷兰国民饼干，放热咖啡上先烤一下再吃。', tip: '荷兰饼干，放热咖啡上先烤一下。' },
    { emoji: '🐟', name: '荷兰腌鲱鱼礼盒', desc: '阿姆斯特丹街边小摊，当地人直接整条吃。', tip: '荷兰人配洋葱生吃的。你可能吃不惯。' },
    { emoji: '🍩', name: '荷兰炸油球Oliebollen', desc: '荷兰式甜甜圈，撒糖粉，软的。', tip: '过节才有。碰上了买了几个。' },
  ],
  'Paris': [
    { emoji: '🥐', name: 'Pierre Hermé 马卡龙礼盒', desc: '巴黎最好的那家，没什么别的原因。', tip: '巴黎最好的那家，没什么别的原因。' },
    { emoji: '🍷', name: '波尔多红酒小样', desc: '随便选了一瓶，喝不喝随你。', tip: '随便选了一瓶，喝不喝随你。' },
    { emoji: '🧴', name: "L'Occitane 护手霜套装", desc: '法国本地买的，比免税店便宜。', tip: '法国本地买的比免税店便宜。' },
    { emoji: '🥖', name: '法国黄油饼干礼盒', desc: '布列塔尼出产，正经法式黄油饼干。', tip: '法国人当早餐吃的那种。' },
    { emoji: '🧇', name: '法国松露巧克力礼盒', desc: '巴黎老店手制，可可粉裹的，不甜腻。', tip: '随手买了盒。不知道你喜不喜欢甜的。' },
  ],
  'Dublin': [
    { emoji: '🍺', name: '健力士周边杯套装', desc: '发源地的纪念品，他们自己也觉得好笑。', tip: '发源地的纪念品，他们自己也觉得好笑。' },
    { emoji: '🧶', name: '爱尔兰羊毛毯', desc: 'Aran岛手织的，重得很，暖。', tip: 'Aran岛手织的，重得很。' },
    { emoji: '🥃', name: '爱尔兰单一麦芽威士忌', desc: '和苏格兰的不一样，试试看。', tip: '和苏格兰的不一样，试试。' },
    { emoji: '🍘', name: '爱尔兰燕麦饼干', desc: 'Dublin本地老牌，香酥，配茶吃。', tip: '爱尔兰人配茶必备。' },
    { emoji: '🫙', name: '爱尔兰苹果酱礼盒', desc: '本地农场出品，不加防腐剂，酸甜。', tip: '随手买了罐。配面包。' },
  ],
  'Tokyo': [
    { emoji: '🍡', name: '虎屋和菓子礼盒', desc: '东京老字号，甜但不腻，精致。', tip: '虎屋的，老字号，甜但不腻。' },
    { emoji: '🍵', name: '宇治抹茶礼盒', desc: '产地直送，不是超市那种，认真做的。', tip: '产地直送，不是超市那种。' },
    { emoji: '📦', name: '东京限定零食礼盒', desc: '逛了几家随手买的，日本这边什么都精致。', tip: '随便逛逛买的，日本这边什么都精致。' },
    { emoji: '🍜', name: '东京限定拉面礼盒', desc: '新宿老店，限定口味，干脆面版本。', tip: '排队买的。你可以在家煮。' },
    { emoji: '🍣', name: '筑地海苔礼盒', desc: '筑地市场出的，厚的那种，烤过。', tip: '日本的海苔和其他地方不一样。' },
    { emoji: '🍫', name: 'Royce生巧克力礼盒', desc: '北海道产，冷链寄的，入口即化。', tip: '日本这边限定的。别放太久。' },
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
  'London': 'London', 'london': 'London',
  'Amsterdam': 'Amsterdam', 'amsterdam': 'Amsterdam', 'Netherlands': 'Amsterdam',
  'Paris': 'Paris', 'paris': 'Paris', 'France': 'Paris',
  'Dublin': 'Dublin', 'dublin': 'Dublin', 'Ireland': 'Dublin',
  'Tokyo': 'Tokyo', 'tokyo': 'Tokyo', 'Japan': 'Tokyo',
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

let currentCategory = 'clothing';
let pendingProduct = null;
let pendingCategory = null;
// Checkout 批量结算时置真：_finishPurchase 跳过逐件 showToast，改由结算流程统一弹一次「下单成功」。
let _suppressPurchaseToast = false;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 自愈：修复"买了但快递对象从没创建"导致的礼物消失（历史遗留 + 兜底）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Migration B：历史 Asset / Reunion Delivery Cleanup（assetDeliveryCleanup_v1）
// 资产(isHomeItem)与特殊(isReunion)从产品语义上就不属于 Delivery domain，
// 但旧 _finishPurchase 无差别建了快递。这里把这些历史快递作废，使其不再进入
// 物流 UI / 物流推进 / 签收通知 / 丢件投诉。
// 只清物流，绝不改 ownership / purchaseFacts.payer / purchasedItems /
// purchaseCounts / metInPerson / hasHouse，不退款。
// 识别以 delivery.productId → getProductById() 为主，purchaseId → fact.productId 为辅助校验；
// 不用 delivery.productData.isHomeItem/isReunion（历史 productData 从未保存这两个字段，读取无效）。
// 用 voided 墓碑而非硬删：硬删会被 cloud union 复活；voided 在 merge 时压过旧 active。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function _deliveryIsAssetOrReunion(d) {
  if (!d) return false;
  // 主：直接用 delivery.productId 解析商品
  let prod = (d.productId && typeof getProductById === 'function') ? getProductById(d.productId) : null;
  // 辅助校验：无 productId 时，用 purchaseId 回查 fact 的 productId
  if (!prod && d.purchaseId && typeof getPurchaseFacts === 'function') {
    try {
      const f = getPurchaseFacts().find(x => x && x.purchaseId === d.purchaseId);
      if (f && f.productId && typeof getProductById === 'function') prod = getProductById(f.productId);
    } catch(e) {}
  }
  return !!(prod && (prod.isHomeItem || prod.isReunion));
}

function _voidAssetDeliveriesInKey(key) {
  let list;
  try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) { return 0; }
  if (!Array.isArray(list)) return 0;
  let n = 0;
  for (const d of list) {
    if (!d || d.voided) continue;
    if (_deliveryIsAssetOrReunion(d)) {
      d.voided = true;
      d.voidReason = 'asset_reunion_no_delivery';
      d.voidedAt = Date.now();
      n++;
    }
  }
  if (n > 0) localStorage.setItem(key, JSON.stringify(list));
  return n;
}

function migrateAssetDeliveryCleanup_v1() {
  if (localStorage.getItem('assetDeliveryCleanup_v1')) return;
  try {
    const a = _voidAssetDeliveriesInKey('deliveries');
    const b = _voidAssetDeliveriesInKey('deliveryHistory');
    if ((a + b) > 0) {
      console.log('[migration B] 作废历史资产/特殊物流:', a, 'active +', b, 'history');
      if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
    }
    localStorage.setItem('assetDeliveryCleanup_v1', '1');
  } catch(e) {
    console.warn('[migration B] assetDeliveryCleanup_v1 失败:', e);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Migration A：Ghost Pay House Rollback（ghostPayHouseRollback_v1）
// 仅收回"修复前通过 Ghost Pay 漏洞获得的房产"。命中条件全部满足才处理：
//   fact.payer === 'ghost_pay' 且 productId 有效且商品 isHomeItem 且 homeType==='house'
// 对命中 fact 打持久化墓碑（rolledBack:true / rollbackReason / rolledBackAt），不删除历史。
// 再基于 rolledBack !== true 的有效 fact 重算命中房产的 purchaseCounts / purchasedItems，
// 最后按剩余有效 house 事实重算 relationshipFlags.hasHouse。
// 缺 payer/productId/fact 的老历史一律跳过（不猜测）。不退款、不碰 car、不碰普通商品、
// 不碰 payer:'user'/'ghost'。House Delivery 不在此处理，统一交给 Migration B。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function _factResolvesToHouse(f) {
  if (!f || !f.productId || typeof getProductById !== 'function') return false;
  const prod = getProductById(f.productId);
  return !!(prod && prod.isHomeItem && prod.homeType === 'house');
}

function migrateGhostPayHouseRollback_v1() {
  if (localStorage.getItem('ghostPayHouseRollback_v1')) return;
  try {
    let facts;
    try { facts = JSON.parse(localStorage.getItem('purchaseFacts') || '[]'); } catch(e) { facts = []; }
    if (!Array.isArray(facts)) facts = [];

    // 1. 命中并打墓碑（幂等：已 rolledBack 的不再处理）
    const hitNames = new Set();
    let hits = 0;
    for (const f of facts) {
      if (!f || f.rolledBack === true) continue;
      if (f.payer === 'ghost_pay' && _factResolvesToHouse(f)) {
        f.rolledBack = true;
        f.rollbackReason = 'ghost_pay_house_bug';
        f.rolledBackAt = Date.now();
        if (f.name) hitNames.add(f.name);
        hits++;
      }
    }

    if (hits === 0) { localStorage.setItem('ghostPayHouseRollback_v1', '1'); return; }

    localStorage.setItem('purchaseFacts', JSON.stringify(facts));

    // 2. 基于剩余有效 fact 重算命中房产的 purchaseCounts / purchasedItems
    let counts;   try { counts = JSON.parse(localStorage.getItem('purchaseCounts') || '{}'); } catch(e) { counts = {}; }
    let purchased; try { purchased = JSON.parse(localStorage.getItem('purchasedItems') || '[]'); } catch(e) { purchased = []; }
    if (!counts || typeof counts !== 'object') counts = {};
    if (!Array.isArray(purchased)) purchased = [];

    hitNames.forEach(name => {
      const validCount = facts.filter(f => f && f.rolledBack !== true && f.name === name).length;
      if (validCount > 0) counts[name] = validCount;
      else {
        delete counts[name];
        purchased = purchased.filter(n => n !== name);
      }
    });
    localStorage.setItem('purchaseCounts', JSON.stringify(counts));
    localStorage.setItem('purchasedItems', JSON.stringify(purchased));

    // 3. 按剩余有效 house 事实重算 hasHouse：
    //    仅当不存在任何 rolledBack !== true 且解析为 house 的 fact 时，才清 hasHouse。
    const stillOwnsHouse = facts.some(f => f && f.rolledBack !== true && _factResolvesToHouse(f));
    if (!stillOwnsHouse && typeof setRelationshipFlag === 'function') {
      setRelationshipFlag('hasHouse', false);
    }

    console.log('[migration A] 回滚 Ghost Pay 房产:', hits, '笔；hasHouse 保留 =', stillOwnsHouse);
    localStorage.setItem('ghostPayHouseRollback_v1', '1');
    if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
  } catch(e) {
    console.warn('[migration A] ghostPayHouseRollback_v1 失败:', e);
  }
}

// 症状：售罄 + 故事书有记录，但物流/礼物架/丢件三处都查无此包裹
// 做法：已购买、但既不在途也不在礼物架的实物商品 → 补一张"不会再丢"的快递，正常送达上架
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function _healOrphanPurchases() {
  try {
    const purchased = JSON.parse(localStorage.getItem('purchasedItems') || '[]');
    if (!purchased.length) return;

    const healed      = JSON.parse(localStorage.getItem('orphanHealed') || '[]');
    const deliveries  = JSON.parse(localStorage.getItem('deliveries') || '[]');
    const history     = JSON.parse(localStorage.getItem('deliveryHistory') || '[]');
    const inTransit   = new Set(deliveries.map(d => d.name));
    const inHistory   = new Set(history.map(d => d.name));

    const allProducts = [];
    try {
      Object.values(MARKET_PRODUCTS || {}).forEach(arr => {
        if (Array.isArray(arr)) allProducts.push(...arr);
      });
    } catch(e) {}

    let changed = false;
    purchased.forEach(name => {
      if (healed.includes(name)) return;
      if (inTransit.has(name) || inHistory.has(name)) return;
      const prod = allProducts.find(p => p.name === name);
      if (!prod) return;
      const shippable = (prod.isUserItem || prod.isGhostGift) && !prod.isHomeItem && !prod.isReunion;
      if (!shippable) return;
      if (typeof addDelivery === 'function') {
        addDelivery({ ...prod, noLost: true }, false, !!prod.unlock);
        healed.push(name);
        changed = true;
        console.log('[shop] 自愈补发孤儿快递:', name);
      }
    });

    if (changed) {
      localStorage.setItem('orphanHealed', JSON.stringify(healed));
      if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
    }
  } catch(e) {
    console.warn('[shop] 孤儿快递自愈失败:', e);
  }
}

function initMarket() {
  const el = document.getElementById('marketBalanceDisplay');
  if (el) el.textContent = '£' + Math.round(getBalance()).toLocaleString('en-GB');
  // 先跑 B（作废资产/特殊错误物流，无经济副作用），再跑 A（Ghost Pay 房产回滚）。
  // House Delivery 只由 B 负责，A 不重复处理。两者各自幂等、flag 独立。
  migrateAssetDeliveryCleanup_v1();
  migrateGhostPayHouseRollback_v1();
  _healOrphanPurchases();   // 自愈：救回"买了但快递从没创建"的孤儿礼物
  renderDeliveryTracker();
  renderMarket(currentCategory || 'clothing');
  checkDeliveryUpdates();
  // 检查包裹通知，延迟一点让页面先渲染
  setTimeout(() => {
    if (typeof checkAndShowDeliveryNotices === 'function') checkAndShowDeliveryNotices();
    if (typeof _updateMarketCardBadge === 'function') _updateMarketCardBadge();
  }, 400);
  updateCartBadge();
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

  // 修改：全部显示，未解锁的显示锁定状态
  const isFromHome = categoryId === 'fromhome';
  let products = MARKET_PRODUCTS[categoryId] || [];
  if (isFromHome) {
    try { const seasonal = getSeasonalFromHome(); products = [...products, ...seasonal]; } catch(e) {}
  }
  // 入冬限定：并入对应分类，排在最前面
  try {
    const winter = getWinterSeasonal(categoryId);
    if (winter.length) products = [...winter, ...products];
  } catch(e) {}
  const gridEl = document.getElementById('productsGrid');
  if (!gridEl) return;

  try {
  const isWishlist = categoryId === 'wishlist';
  const isLuxury = categoryId === 'luxury';
  const isHome = categoryId === 'home';
  const purchased = _safeGet('purchasedItems', []);
  const purchaseCounts = _safeGet('purchaseCounts', {});
  let weeklySale = null;
  try { weeklySale = isLuxury ? getWeeklySale() : null; } catch(e) { console.warn('[shop] getWeeklySale失败:', e); }

  // 修复：wishlist分类顶部加三件套进度条（避免嵌套模板字符串，防止浏览器解析崩溃）
  if (isWishlist) {
    const _reunionItems = getCollectionItemNames('reunion');
    const _reunionBought = _reunionItems.map(function(n) { return purchased.includes(n); });
    const _reunionCount = _reunionBought.filter(Boolean).length;
    const _allDone = _reunionCount === 3;

    document.getElementById('_reunionProgress')?.remove();
    const _progEl = document.createElement('div');
    _progEl.id = '_reunionProgress';

    // Collection Card：0/3~2/3 与 3/3 共用同一张卡（背景/尺寸/排版/字体不变），仅 Reward 区域随完成态切换
    _progEl.style.cssText = 'position:relative;margin:0 0 16px;border-radius:18px;overflow:hidden;background:#f2ede3;box-shadow:0 4px 16px rgba(60,50,35,0.08);';

    const _dotsHtml = [0,1,2].map(function(idx) {
      const bought = _reunionBought[idx];
      const _dot = '<div style="width:13px;height:13px;border-radius:50%;border:1.5px solid ' + (bought ? '#5a7048' : '#b7ad98') + ';background:' + (bought ? '#5a7048' : 'transparent') + ';flex:0 0 auto;"></div>';
      const _line = idx < 2 ? '<div style="flex:1;height:1.5px;background:' + (_reunionBought[idx] && _reunionBought[idx+1] ? '#5a7048' : (_reunionBought[idx] ? 'linear-gradient(90deg,#5a7048,#c9bfa8)' : '#c9bfa8')) + ';"></div>' : '';
      return _dot + _line;
    }).join('');

    const _rewardHtml = _allDone
      ? '<div style="display:flex;align-items:center;gap:10px;">'
          + '<div style="width:30px;height:30px;border-radius:50%;background:#5a7048;display:flex;align-items:center;justify-content:center;flex:0 0 auto;">'
            + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
          + '</div>'
          + '<div style="flex:1;">'
            + '<div style="font-size:9px;letter-spacing:2px;color:#5a7048;font-weight:600;">COLLECTION COMPLETE</div>'
            + '<div style="font-size:14px;color:#4a4436;font-weight:600;margin-top:2px;">声之匣 ·《面基》已解锁</div>'
          + '</div>'
          + '<button onclick="openScreen(\'shelfScreen\');setTimeout(()=>{if(typeof renderGiftShelf===\'function\')renderGiftShelf();},80);" style="flex:0 0 auto;font-size:12px;font-weight:600;color:#fff;background:#5a7048;border:none;border-radius:16px;padding:8px 16px;cursor:pointer;letter-spacing:0.5px;">去收听 →</button>'
        + '</div>'
      : '<div style="display:flex;align-items:center;gap:10px;">'
          + '<div style="width:30px;height:30px;border-radius:50%;border:1.5px solid #b7ad98;display:flex;align-items:center;justify-content:center;flex:0 0 auto;">'
            + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8a7f68" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'
          + '</div>'
          + '<div>'
            + '<div style="font-size:9px;letter-spacing:2px;color:#8a7f68;font-weight:600;">UNLOCKS</div>'
            + '<div style="font-size:14px;color:#4a4436;font-weight:600;margin-top:2px;">集齐三件套，解锁共同生活的门槛</div>'
          + '</div>'
        + '</div>';

    _progEl.innerHTML =
      '<div style="position:absolute;inset:0;background:url(\'images/ui-backgrounds/collections/reunion-bg.webp\') right center / cover no-repeat;"></div>'
      + '<div style="position:absolute;inset:0;background:linear-gradient(90deg,#f2ede3 42%,rgba(242,237,227,0.85) 58%,rgba(242,237,227,0.15) 78%,transparent 100%);"></div>'
      + '<div style="position:relative;padding:18px 20px;">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;">'
          + '<div>'
            + '<div style="font-size:10px;letter-spacing:2.5px;color:#8a7f68;font-weight:600;margin-bottom:6px;">SPECIAL COLLECTION</div>'
            + '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:26px;line-height:1.05;color:#4a4436;letter-spacing:0.5px;">MEET IN PERSON</div>'
            + '<div style="font-size:13px;color:#6b6350;margin-top:3px;letter-spacing:1px;">面基计划</div>'
          + '</div>'
          + '<div style="text-align:right;flex:0 0 auto;padding-left:12px;">'
            + '<div style="font-family:Georgia,serif;font-size:30px;line-height:1;color:#4a4436;">' + _reunionCount + ' <span style="color:#b7ad98;">/</span> 3</div>'
            + '<div style="font-size:9px;letter-spacing:2px;color:#8a7f68;font-weight:600;margin-top:4px;">COLLECTED</div>'
          + '</div>'
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:6px;margin:18px 0 16px;max-width:230px;">' + _dotsHtml + '</div>'
        + _rewardHtml
      + '</div>';

    if (gridEl.parentNode) gridEl.parentNode.insertBefore(_progEl, gridEl);
  } else {
    document.getElementById('_reunionProgress')?.remove();
  }

  gridEl.innerHTML = products.map((p, i) => {
    try {
    // 特殊三件套（wishlist）取消关系门槛：从一开始即可查看/购买，直接走新版实拍卡而非绿色锁定卡。
    // 不改商品数据，也不影响 isReunion/unique/购买进度/metInPerson/《面基》解锁链。
    const isUnlocked = canUnlockProduct(p) || categoryId === 'wishlist';  // 关系是否满足解锁条件
    const maxBuy = p.maxPurchase || 1;
    const buyCount = purchaseCounts[p.name] || (purchased.includes(p.name) ? 1 : 0);
    // 普通商品允许无限复购；仅一次性商品沿用 buyCount>=maxBuy 售罄
    const owned = isUniqueProduct(p) && buyCount >= maxBuy;
    const onSale = weeklySale && weeklySale.name === p.name;
    let displayPrice = onSale ? Math.round(p.price * weeklySale.discount) : p.price;
    const _isBigTicket = p.isReunion || p.isHomeItem;
    if (!isLuxury && !_isBigTicket && !isV1MarketProduct(p)) displayPrice = Math.round(displayPrice * 1.8);
    const triggerReason = isUnlocked && typeof getProductTrigger === 'function' ? getProductTrigger(p.name) : null;
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
      // NOA MARKET V1：奢品不再用金色系锁定样式，与其他分类统一
      const tipStyle = `background:rgba(80,130,55,0.1);border:1px solid rgba(90,150,60,0.28);color:#4a7a30;`;
      const btnStyle = `background:rgba(80,130,55,0.1);border:1px solid rgba(90,150,60,0.28);color:#5a8a40;cursor:not-allowed;`;
      const cardStyle = `background:#f4f9f0;border:1px solid rgba(140,190,100,0.22);`;
      return `
        <div class="product-card ${isWishlist?'wishlist-card':''} ${isFromHome?'fromhome-card':''} ${isHome?'home-card':''}"
             style="${cardStyle}opacity:0.82;cursor:pointer;"
             onclick="showToast('继续和 Ghost 相处，解锁更多商品 ✨')">
          <div class="ghost-mentioned-tag" style="${tipStyle}font-size:9px;font-weight:700;padding:2px 9px;border-radius:20px;white-space:nowrap;">🔒 继续相处后解锁</div>
          <div class="product-emoji">${p.emoji}</div>
          <div class="product-name">${p.displayName || p.name}</div>
          <div class="product-desc">继续和他相处，慢慢解锁</div>
          <div class="product-price">£${(p.isReunion || p.isHomeItem || isV1MarketProduct(p) ? p.price : Math.round(p.price * 1.8)).toLocaleString()}</div>
          <button class="product-buy-btn" disabled style="${btnStyle}display:flex;align-items:center;justify-content:center;">🔒 未解锁</button>
        </div>`;
    }

    return `
      <div class="product-card ${isWishlist?'wishlist-card':''} ${isFromHome?'fromhome-card':''} ${isHome?'home-card':''} ${owned?'owned-card':''} ${triggerReason&&!owned?'ghost-mentioned':''} ${onSale&&!owned?'on-sale-card':''}"
           data-pname="${p.name.replace(/"/g,'__DQUOTE__')}" data-pcat="${categoryId}"
           onclick="${owned||isLocked?'':'(function(el){openProductDetail(el.dataset.pname.replace(/__DQUOTE__/g,String.fromCharCode(34)),el.dataset.pcat)})(this)'}">
        ${onSale&&!owned ? '<div class="sale-corner-text">TODAY<br>ONLY</div>' : ''}
        ${p.festival&&!owned ? `<div class="ghost-mentioned-tag" style="background:rgba(255,200,100,0.15);border-color:rgba(255,180,50,0.4);color:#b45309;">🎋 ${p.festival}限定</div>` : ''}
        ${triggerReason&&!owned ? `<div class="ghost-mentioned-tag">💡 ${triggerReason}</div>` : ''}
        ${isLocked ? '<div class="ghost-mentioned-tag" style="background:#9ca3af">🔒 需先买机票</div>' : ''}
        <div class="product-media" style="position:relative;">
          ${p.winterTag&&!owned ? `<div style="position:absolute;top:8px;left:8px;z-index:10;background:rgba(250,248,245,0.92);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);color:#5a7a48;font-size:9px;font-weight:600;padding:4px 10px;border-radius:999px;white-space:nowrap;letter-spacing:0.5px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">❄ 入冬限定</div>` : ''}
          ${renderProductVisual(p)}
        </div>
        ${onSale&&!owned ? `<div class="sale-discount-badge">✦ TODAY ONLY · ${discountLabel}</div>` : ''}
        <div class="product-info">
          <div class="product-name">${p.displayName || p.name}</div>
          ${p.nameEn ? `<div class="product-name-en">${p.nameEn}</div>` : ''}
          ${isWishlist&&p.badge ? `<div class="product-badge-preview">🏅 ${p.badge}</div>` : ''}
          <div class="product-foot">
            <div class="product-price ${isWishlist?'wishlist-price':''}">
              ${onSale ? `<span class="sale-original-price">£${((isLuxury || p.isReunion || p.isHomeItem || isV1MarketProduct(p)) ? p.price : Math.round(p.price * 1.8)).toLocaleString()}</span>` : ''}
              £${displayPrice.toLocaleString()}
            </div>
            ${owned
              ? `<div class="product-owned-tag">${isHome?'已购置':'已售罄'}</div>`
              : `<button class="product-buy-btn ${isWishlist?'wishlist-buy-btn':''} ${isFromHome?'fromhome-buy-btn':''} ${isHome?'home-buy-btn':''}" aria-label="加入购物车" data-pid="${(p.id||'').replace(/"/g,'&quot;')}" onclick="event.stopPropagation();(function(el){var id=el.dataset.pid;if(!id)return;addToCart(id);if(typeof showToast==='function')showToast('🛒 已加入购物车');})(this)">
                  <span class="add-label">ADD</span><span class="add-plus">+</span>
                  ${showCount ? `<span class="buy-count">${buyCount}/${maxBuy}</span>` : ''}
                </button>`
            }
          </div>
        </div>
      </div>`;
    } catch(e) { console.warn('[shop] 商品渲染失败:', e, p?.name); return ''; }
  }).join('');

  } catch(outerErr) {
    console.error('[shop] 商城渲染崩溃:', outerErr);
    gridEl.innerHTML = `<div style="padding:48px 24px;text-align:center;">
      <div style="font-size:40px;margin-bottom:12px;">🛠️</div>
      <div style="font-size:14px;color:#a07020;margin-bottom:8px;">商城加载失败</div>
      <div style="font-size:12px;color:#c0b090;">请刷新页面重试</div>
      <button onclick="renderMarket('${categoryId}')" style="margin-top:12px;padding:8px 20px;border-radius:12px;border:1px solid #c0b090;background:transparent;color:#a07020;cursor:pointer;">重试</button>
    </div>`;
  }
}

// 修复：按名字定位商品，避免下标不同步导致购买没反应
function openBuyModal_byName(name, categoryId) {
  const _cat = categoryId || currentCategory;
  let _list = MARKET_PRODUCTS[_cat] || [];
  if (_cat === 'fromhome') _list = [..._list, ...getSeasonalFromHome()];
  try { const w = getWinterSeasonal(_cat); if (w.length) _list = [..._list, ...w]; } catch(e) {}
  const _idx = _list.findIndex(p => p.name === name);
  if (_idx === -1) return;
  currentCategory = _cat;
  openBuyModal(_idx);
}

function openBuyModal(idx) {
  let productList = MARKET_PRODUCTS[currentCategory] || [];
  if (currentCategory === 'fromhome') {
    productList = [...productList, ...getSeasonalFromHome()];
  }
  try { const w = getWinterSeasonal(currentCategory); if (w.length) productList = [...productList, ...w]; } catch(e) {}
  const p = productList[idx];
  if (!p) return;
  pendingProduct = p;
  pendingCategory = currentCategory;
  const isLuxury = currentCategory === 'luxury';
  const weeklySale = isLuxury ? getWeeklySale() : null;
  const onSale = weeklySale && weeklySale.name === p.name;
  let displayPrice = onSale ? Math.round(p.price * weeklySale.discount) : p.price;
  // 非奢侈品涨价（经济系统平衡），机票/酒店/车/房直接显示原价
  const _isBigTicketModal = p.isReunion || p.isHomeItem;
  if (!isLuxury && !_isBigTicketModal && !isV1MarketProduct(p)) displayPrice = Math.round(displayPrice * 1.8);
  // 花艺师职业福利：商店打折（奢侈品除外）
  const _shopDiscount = (typeof getCareerShopDiscount === 'function') ? getCareerShopDiscount() : 0;
  if (_shopDiscount > 0) displayPrice = Math.round(displayPrice * (1 - _shopDiscount / 100));
  let shipping = p.isUserItem ? (isLuxury ? 45 : 25) : (p.shipping !== undefined ? p.shipping : (isLuxury ? 45 : 28));
  // 快递员职业福利：免运费
  if (typeof isCareerFreeShipping === 'function' && isCareerFreeShipping()) shipping = 0;
  const total = displayPrice + shipping;
  const bal = getBalance();
  const triggerReason = getProductTrigger(p.name);
  const isWishlist = currentCategory === 'wishlist';

  document.getElementById('buyModalEmoji').textContent = p.emoji;
  document.getElementById('buyModalName').textContent = p.displayName || p.name;
  document.getElementById('buyModalDesc').textContent = p.desc || '';
  const _isBigTicketBase = p.isReunion || p.isHomeItem;
  const _basePrice = (isLuxury || _isBigTicketBase || isV1MarketProduct(p)) ? p.price : Math.round(p.price * 1.8);
  const _hasDiscount = _shopDiscount > 0 && displayPrice < _basePrice;
  const _shippingFree = shipping === 0 && (p.shipping > 0 || !p.isUserItem);
  // 资产（车/房）不是物品、不收邮费：费用叫「手续费」；其余商品仍叫「运费」
  const _feeWord = p.isHomeItem ? '手续费' : '运费';
  document.getElementById('buyModalPrice').innerHTML = _hasDiscount
    ? `<span style="text-decoration:line-through;color:#ccc;font-size:12px;">£${_basePrice}</span> £${displayPrice.toLocaleString()}<span style="font-size:11px;color:#5a9a46;"> (-${_shopDiscount}%)</span><span style="font-size:12px;color:#a07bc0;font-weight:500">${_shippingFree ? ` · 免${_feeWord}` : ` + £${shipping} ${_feeWord}`}</span>`
    : `£${displayPrice.toLocaleString()}<span style="font-size:12px;color:#a07bc0;font-weight:500">${_shippingFree ? ` · 免${_feeWord}` : ` + £${shipping} ${_feeWord}`}</span>`;
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
  // 与 renderMarket 保持一致：普通商品允许复购，仅一次性商品售罄
  const isOwned = isUniqueProduct(p) && buyCount >= maxBuy;

  const ghostBal = typeof getGhostCardBalance === 'function' ? getGhostCardBalance() : 0;
  const canAfford = bal >= total || ghostBal >= total;
  if (isOwned) {
    btn.disabled = true; btn.textContent = isUserItem ? '✅ 已购买' : '🔴 已售罄';
  } else if (!canAfford) {
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

// ===== NOA MARKET 商品详情页（全屏）=====
// 只负责展示 + 把动作转发给既有函数：
// 发给他看 → shareProductToChat；立即购买 → openBuyModal_byName（进原购买弹窗，
// 最终仍走未改动的 confirmPurchase）。不碰钱包/购买记录/物流/图片管线。
let _pdetailProduct = null;
let _pdetailCategory = null;

// 只读：与 openBuyModal 相同的展示价规则（不改 openBuyModal，避免影响原购买流程）
function _pdetailDisplayPrice(p, categoryId) {
  const isLuxury = categoryId === 'luxury';
  const weeklySale = isLuxury && typeof getWeeklySale === 'function' ? getWeeklySale() : null;
  const onSale = weeklySale && weeklySale.name === p.name;
  let price = onSale ? Math.round(p.price * weeklySale.discount) : p.price;
  const isBigTicket = p.isReunion || p.isHomeItem;
  if (!isLuxury && !isBigTicket && !isV1MarketProduct(p)) price = Math.round(price * 1.8);
  const shopDiscount = (typeof getCareerShopDiscount === 'function') ? getCareerShopDiscount() : 0;
  if (shopDiscount > 0) price = Math.round(price * (1 - shopDiscount / 100));
  return price;
}

function openProductDetail(name, categoryId) {
  const cat = categoryId || currentCategory;
  let list = MARKET_PRODUCTS[cat] || [];
  if (cat === 'fromhome' && typeof getSeasonalFromHome === 'function') list = [...list, ...getSeasonalFromHome()];
  try { const w = getWinterSeasonal(cat); if (w.length) list = [...list, ...w]; } catch(e) {}
  const p = list.find(x => x.name === name);
  if (!p) return;

  _pdetailProduct = p;
  _pdetailCategory = cat;

  const heroEl = document.getElementById('pdetailHero');
  if (heroEl) heroEl.innerHTML = typeof renderProductVisual === 'function'
    ? renderProductVisual(p)
    : `<div class="product-emoji">${p.emoji || ''}</div>`;

  document.getElementById('pdetailNameCn').textContent = p.displayName || p.name || '';
  document.getElementById('pdetailNameEn').textContent = p.nameEn || '';
  document.getElementById('pdetailDesc').textContent = p.desc || '';
  document.getElementById('pdetailPrice').textContent = '£' + _pdetailDisplayPrice(p, cat).toLocaleString();

  const attrsEl = document.getElementById('pdetailAttrs');
  if (attrsEl) {
    let rows = [];
    if (Array.isArray(p.features)) {
      rows = p.features.filter(f => f && (f.label || (f.value != null && f.value !== '')));
    } else if (Array.isArray(p.attributes)) {
      rows = p.attributes.filter(a => a && a.label).map(a => ({ label: a.label, value: '' }));
    }
    attrsEl.innerHTML = rows.map(f => `
      <div class="pdetail-attr-item">
        <div class="pdetail-attr-name">${f.label || ''}</div>
        <div class="pdetail-attr-value">${f.value != null ? f.value : ''}</div>
      </div>`).join('');
  }

  const buyBtn = document.getElementById('pdetailBuyBtn');
  if (buyBtn) buyBtn.textContent = '£' + _pdetailDisplayPrice(p, cat).toLocaleString() + ' · 立即购买';

  const overlay = document.getElementById('productDetailOverlay');
  if (overlay) overlay.classList.add('show');
}

function closeProductDetail() {
  const overlay = document.getElementById('productDetailOverlay');
  if (overlay) overlay.classList.remove('show');
}

// ===== NOA MARKET 购物车（UI 层）=====
// 只读展示 + 数量/删除的本地状态维护，不触碰购买流程/钱包/好感。
// noaCart: [{ id, qty }]，商品数据一律回查 MARKET_PRODUCTS（getProductById），购物车不存价格快照。
function getNoaCart() {
  try { return JSON.parse(localStorage.getItem('noaCart') || '[]'); }
  catch(e) { return []; }
}
function saveNoaCart(cart) {
  try { localStorage.setItem('noaCart', JSON.stringify(cart)); } catch(e) {}
}
function _cartResolveItems() {
  return getNoaCart().map(row => {
    const p = getProductById(row.id);
    if (!p) return null;
    return { p, qty: Math.max(1, row.qty | 0 || 1) };
  }).filter(Boolean);
}

// ── Cart Core V1：购物车基础状态（只存 productId + quantity，价格一律回查）──
// 加入购物车：不存在则 qty=1，已存在则 +1。
function addToCart(productId) {
  if (!productId || !getProductById(productId)) return;
  const cart = getNoaCart();
  const row = cart.find(r => String(r.id) === String(productId));
  if (row) row.qty = (row.qty | 0 || 1) + 1;
  else cart.push({ id: productId, qty: 1 });
  saveNoaCart(cart);
  updateCartBadge();
}
// 修改数量（绝对值语义）：quantity <= 0 时移除。
function updateCartQuantity(productId, quantity) {
  const q = quantity | 0;
  if (q <= 0) { removeFromCart(productId); return; }
  const cart = getNoaCart();
  const row = cart.find(r => String(r.id) === String(productId));
  if (!row) return;
  row.qty = q;
  saveNoaCart(cart);
  updateCartBadge();
}
// 删除商品。
function removeFromCart(productId) {
  saveNoaCart(getNoaCart().filter(r => String(r.id) !== String(productId)));
  updateCartBadge();
}
// 给 UI 的合并结构：从商品数据源取 name/nameEn/image/实际单价，再合并 quantity。
function getCartItems() {
  return _cartResolveItems().map(({ p, qty }) => {
    const price = _pdetailDisplayPrice(p, _cartCategoryOf(p));
    return {
      productId: p.id,
      name: p.displayName || p.name || '',
      nameEn: p.nameEn || '',
      image: p.id ? ('images/products/' + p.id + '.png') : '',
      emoji: p.emoji || '',
      price,
      quantity: qty,
    };
  });
}
// 总价：复用商城实际价格逻辑（_pdetailDisplayPrice），不含运费（Checkout 阶段再算）。
function getCartTotal() {
  return getCartItems().reduce((sum, it) => sum + it.price * it.quantity, 0);
}
// Header / 详情页购物车角标：显示所有 quantity 总和，为空时隐藏。
function updateCartBadge() {
  const total = getNoaCart().reduce((n, r) => n + Math.max(0, r.qty | 0), 0);
  ['cartBadge', 'pdetailCartBadge'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (total > 0) { el.textContent = total > 99 ? '99+' : String(total); el.style.display = 'flex'; }
    else { el.textContent = ''; el.style.display = 'none'; }
  });
}
function openCart() {
  renderCart();
  const overlay = document.getElementById('cartOverlay');
  if (overlay) overlay.classList.add('show');
}
function closeCart() {
  const overlay = document.getElementById('cartOverlay');
  if (overlay) overlay.classList.remove('show');
}
function renderCart() {
  const items = _cartResolveItems();
  const listEl = document.getElementById('cartList');
  const emptyEl = document.getElementById('cartEmpty');
  const footerEl = document.getElementById('cartFooter');
  const receiptEl = document.getElementById('cartReceipt');
  const actionbarEl = document.getElementById('cartActionbar');
  const countEl = document.getElementById('cartCount');
  const isEmpty = items.length === 0;

  if (countEl) countEl.textContent = isEmpty ? '' : items.reduce((n, it) => n + it.qty, 0) + ' 件商品';
  if (emptyEl) emptyEl.style.display = isEmpty ? 'flex' : 'none';
  if (receiptEl) receiptEl.style.display = isEmpty ? 'none' : 'block';
  if (footerEl) footerEl.style.display = isEmpty ? 'none' : 'block';
  if (actionbarEl) actionbarEl.style.display = isEmpty ? 'none' : 'block';
  if (listEl) listEl.style.display = isEmpty ? 'none' : 'block';
  if (isEmpty) { if (listEl) listEl.innerHTML = ''; return; }

  let subtotal = 0;
  listEl.innerHTML = items.map(({ p, qty }) => {
    const price = _pdetailDisplayPrice(p, _cartCategoryOf(p));
    subtotal += price * qty;
    const visual = (typeof renderProductVisual === 'function') ? renderProductVisual(p) : `<div class="product-emoji">${p.emoji || ''}</div>`;
    const idAttr = String(p.id).replace(/"/g, '&quot;');
    return `
      <div class="cart-item">
        <div class="cart-item-thumb">${visual}</div>
        <div class="cart-item-main">
          <div class="cart-item-name-cn">${p.displayName || p.name || ''}</div>
          <div class="cart-item-name-en">${p.nameEn || ''}</div>
          <div class="cart-item-row">
            <span class="cart-item-price">£${price.toLocaleString()}</span>
            <div class="cart-qty">
              <button class="cart-qty-btn" onclick="cartSetQty('${idAttr}', -1)" aria-label="减少">−</button>
              <span class="cart-qty-num">${qty}</span>
              <button class="cart-qty-btn" onclick="cartSetQty('${idAttr}', 1)" aria-label="增加">+</button>
            </div>
          </div>
        </div>
        <button class="cart-item-del" onclick="cartRemove('${idAttr}')" aria-label="删除">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>`;
  }).join('');

  const subEl = document.getElementById('cartSubtotal');
  const totalEl = document.getElementById('cartTotal');
  const checkoutBtn = document.getElementById('cartCheckoutBtn');
  const totalQty = items.reduce((n, it) => n + it.qty, 0);
  if (subEl) subEl.textContent = '£' + subtotal.toLocaleString();
  if (totalEl) totalEl.textContent = '£' + subtotal.toLocaleString();
  if (checkoutBtn) checkoutBtn.textContent = '去结算 (' + totalQty + ')';
  updateCartBadge();
}
function _cartCategoryOf(p) {
  for (const cat in MARKET_PRODUCTS) {
    if (MARKET_PRODUCTS[cat].some(x => x.id === p.id)) return cat;
  }
  return currentCategory;
}
function cartSetQty(id, delta) {
  const cart = getNoaCart();
  const row = cart.find(r => String(r.id) === String(id));
  if (!row) return;
  // +/- 按钮下限锁 1；删除交给垃圾桶按钮（removeFromCart），不在这里触发移除。
  updateCartQuantity(id, Math.max(1, (row.qty | 0 || 1) + delta));
  renderCart();
}
function cartRemove(id) {
  removeFromCart(id);
  renderCart();
}
// 购物车「去结算」：把购物车整理成 { productId, quantity } 交给统一 Checkout。
function _cartCheckout() {
  const items = getNoaCart().map(r => ({ productId: r.id, quantity: Math.max(1, r.qty | 0 || 1) }));
  if (!items.length) { if (typeof showToast === 'function') showToast('🛒 购物车还是空的'); return; }
  closeCart();
  openCheckout(items);
}

// ===== NOA MARKET Checkout（结算页，UI 骨架）=====
// 本阶段只做入口统一 + 展示：_checkoutItems 只存 { productId, quantity }，
// 名称/图片/价格一律回查 MARKET_PRODUCTS（getProductById）。不接支付/运费/Purchase/Delivery。
let _checkoutItems = [];
let _checkoutPay = 'user'; // user | ghost | ghost_pay，仅 UI 选择状态，不触发扣款

function openCheckout(items) {
  _checkoutItems = (items || [])
    .filter(it => it && it.productId && getProductById(it.productId))
    .map(it => ({ productId: it.productId, quantity: Math.max(1, it.quantity | 0 || 1) }));
  _checkoutPay = 'user';
  renderCheckout();
  const overlay = document.getElementById('checkoutOverlay');
  if (overlay) overlay.classList.add('show');
}

function closeCheckout() {
  const overlay = document.getElementById('checkoutOverlay');
  if (overlay) overlay.classList.remove('show');
}

function renderCheckout() {
  const listEl = document.getElementById('checkoutList');
  if (!listEl) return;
  const countEl = document.getElementById('checkoutCount');
  const subEl = document.getElementById('checkoutSubtotal');
  const shipEl = document.getElementById('checkoutShipping');
  const totalEl = document.getElementById('checkoutTotal');
  const btn = document.getElementById('checkoutConfirmBtn');

  let subtotal = 0;
  let totalQty = 0;
  let shipping = 0;  // 按不同 productId 各收一次，不随 quantity 重复
  let hasAsset = false;     // 资产（房/车）：£100 为「资产办理费」，非运费
  let allReunion = true;    // 面基三件套：无物流、结算页完全隐藏费用行
  const _careerFree = typeof isCareerFreeShipping === 'function' && isCareerFreeShipping();
  listEl.innerHTML = _checkoutItems.map(it => {
    const p = getProductById(it.productId);
    if (!p) return '';
    if (p.isHomeItem) hasAsset = true;
    if (!p.isReunion) allReunion = false;
    const price = _pdetailDisplayPrice(p, _cartCategoryOf(p));
    subtotal += price * it.quantity;
    totalQty += it.quantity;
    if (!_careerFree) {
      const isLuxury = _cartCategoryOf(p) === 'luxury';
      shipping += (p.shipping !== undefined ? p.shipping : (isLuxury ? 45 : 28));
    }
    const visual = (typeof renderProductVisual === 'function') ? renderProductVisual(p) : `<div class="product-emoji">${p.emoji || ''}</div>`;
    return `
      <div class="checkout-item">
        <div class="checkout-item-thumb">${visual}</div>
        <div class="checkout-item-main">
          <div class="checkout-item-name-cn">${p.displayName || p.name || ''}</div>
          <div class="checkout-item-name-en">${p.nameEn || ''}</div>
          <div class="checkout-item-qty">数量 × ${it.quantity}</div>
        </div>
        <div class="checkout-item-price">£${price.toLocaleString()}</div>
      </div>`;
  }).join('');

  const total = subtotal + shipping;
  if (countEl) countEl.textContent = totalQty > 0 ? '(' + totalQty + ')' : '';
  const headCountEl = document.getElementById('checkoutHeadingCount');
  if (headCountEl) headCountEl.textContent = totalQty > 0 ? totalQty + '件商品' : '';
  if (subEl) subEl.textContent = '£' + subtotal.toLocaleString();
  // 费用行：面基三件套完全隐藏；资产改为「资产办理费 / Processing Fee」；其余为配送费用。
  const shipRow = document.getElementById('checkoutShippingRow');
  const shipLabel = document.getElementById('checkoutShippingLabel');
  const _feeRowHidden = totalQty > 0 && allReunion;
  if (shipRow) shipRow.style.display = _feeRowHidden ? 'none' : '';
  if (shipLabel) shipLabel.textContent = hasAsset ? '资产办理费 / Processing Fee' : '配送费用';
  if (shipEl) shipEl.textContent = shipping === 0 ? '免运费' : '£' + shipping.toLocaleString();
  if (totalEl) totalEl.textContent = '£' + total.toLocaleString();

  // 付款方式：两个余额仅展示，不改动任何算法
  const userBalEl = document.getElementById('checkoutPayUserBal');
  if (userBalEl) {
    const bal = typeof getBalance === 'function' ? getBalance() : 0;
    userBalEl.textContent = '£' + Math.round(bal).toLocaleString('en-GB');
  }
  const ghostBalEl = document.getElementById('checkoutPayGhostBal');
  if (ghostBalEl) {
    const gbal = typeof getGhostCardBalance === 'function' ? getGhostCardBalance() : 0;
    ghostBalEl.textContent = '£' + Math.round(gbal).toLocaleString('en-GB');
  }
  // 房产订单：隐藏「让他代付」选项；若当前正选着它，回退到用户余额。
  // 只影响 Ghost Pay 选项的可见性，不动 user / ghost 分支与任何扣款算法。
  const _hasHouse = typeof _checkoutCartHasHouse === 'function' && _checkoutCartHasHouse();
  const _ghostPayOpt = document.querySelector('.checkout-pay-opt[data-pay="ghost_pay"]');
  if (_ghostPayOpt) _ghostPayOpt.style.display = _hasHouse ? 'none' : '';
  if (_hasHouse && _checkoutPay === 'ghost_pay') _checkoutPay = 'user';

  document.querySelectorAll('.checkout-pay-opt').forEach(el => {
    el.classList.toggle('selected', el.getAttribute('data-pay') === _checkoutPay);
  });

  if (btn) {
    const label = _checkoutPay === 'ghost_pay' ? '发给他  £' : '确认购买  £';
    btn.textContent = label + total.toLocaleString();
  }
}

// 切换付款方式：仅更新 UI 选择状态与按钮文案，不执行任何扣款。
function _checkoutSelectPay(pay) {
  if (pay !== 'user' && pay !== 'ghost' && pay !== 'ghost_pay') return;
  _checkoutPay = pay;
  renderCheckout();
}

// 结算成功后把本轮商品移出购物车（只删本次结算的 productId，不整车清空——
// "立即购买"可能带一件不在车里的商品，整车 wipe 会误删用户还想留着的东西）。
function _clearCheckedOutFromCart(orderItems) {
  if (!orderItems || !orderItems.length) return;
  const ids = new Set(orderItems.map(it => String(it.productId)));
  saveNoaCart(getNoaCart().filter(r => !ids.has(String(r.id))));
  if (typeof updateCartBadge === 'function') updateCartBadge();
}

// 下单成功确认卡：一单只弹一次（替代批量结算时互相覆盖的逐件 toast）。
// 纯文字、商场同款奶油/衬线/墨绿质感，无 emoji/图标。点任意处或 3.2s 后淡出。
function showOrderConfirm(lines, total, payer) {
  const count = (lines || []).reduce((s, ln) => s + (ln.qty || 1), 0);
  const shipCount = (lines || []).reduce((s, ln) => {
    const p = ln.p || {};
    return s + ((!p.isHomeItem && !p.isReunion) ? (ln.qty || 1) : 0);
  }, 0);

  let payLine;
  if (payer === 'ghost_pay') payLine = '已由他代付';
  else if (payer === 'ghost') payLine = '已用 Ghost Card 结算';
  else payLine = '已从余额结算';
  const amt = total ? ` · £${total}` : '';

  const shipLine = shipCount > 0
    ? `${shipCount} 件已发出，可在物流追踪查看`
    : '已记入你的收藏';

  const old = document.getElementById('orderConfirmOverlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'orderConfirmOverlay';
  overlay.className = 'order-confirm-overlay';
  overlay.innerHTML =
    '<div class="order-confirm-card">' +
      '<div class="order-confirm-rule"></div>' +
      '<div class="order-confirm-label">ORDER CONFIRMED</div>' +
      '<div class="order-confirm-title">下单成功</div>' +
      '<div class="order-confirm-meta">共 ' + count + ' 件 · ' + payLine + amt + '</div>' +
      '<div class="order-confirm-sub">' + shipLine + '</div>' +
    '</div>';

  const dismiss = () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 320);
  };
  overlay.addEventListener('click', dismiss);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  setTimeout(dismiss, 3200);
}

// 确认购买：本轮只接通 user / ghost 两种现有支付方式，ghost_pay 保持占位。
// 支付成功后一律汇入唯一的 _finishPurchase()，不重建 Purchase / Delivery。
function _checkoutConfirm() {
  if (_checkoutPay === 'ghost_pay') { _checkoutConfirmGhostPay(); return; }
  if (_checkoutPay !== 'user' && _checkoutPay !== 'ghost') return;
  if (!_checkoutItems.length) { if (typeof showToast === 'function') showToast('🛒 购物车还是空的'); return; }

  // 复用 renderCheckout 的同一套价格/运费口径，逐件算出 lineTotal（含各自运费）。
  const _careerFree = typeof isCareerFreeShipping === 'function' && isCareerFreeShipping();
  const lines = [];
  let total = 0;
  for (const it of _checkoutItems) {
    const p = getProductById(it.productId);
    if (!p) continue;
    const cat = _cartCategoryOf(p);
    const isLuxury = cat === 'luxury';
    const price = _pdetailDisplayPrice(p, cat);
    const ship = _careerFree ? 0 : (p.shipping !== undefined ? p.shipping : (isLuxury ? 45 : 28));
    const lineTotal = price * it.quantity + ship;
    total += lineTotal;
    lines.push({ p, cat, isLuxury, qty: it.quantity, lineTotal });
  }
  if (!lines.length || total <= 0) return;

  // 扣款：额度不足则保持 Checkout，不建 Purchase / Delivery。
  if (_checkoutPay === 'user') {
    const bal = getBalance();
    if (bal < total) { if (typeof showToast === 'function') showToast('💔 余额不足！'); return; }
    setBalance(bal - total);
    addTransaction({ icon: '🛍️', name: 'NOA MARKET 结算', amount: -total });
    if (typeof renderWallet === 'function') renderWallet();
  } else {
    // ghost：spendGhostCard 自带额度检查/扣款/交易/reaction，成功才继续。
    const _ghostCat = lines.every(ln => ln.p.isUserItem) ? 'self' : 'for_him';
    if (!spendGhostCard(total, 'NOA MARKET 结算', _ghostCat)) { if (typeof showToast === 'function') showToast('💔 Ghost Card 额度不足！'); return; }
  }

  // 汇入唯一的 _finishPurchase：逐件建 Purchase / Delivery，用各自 lineTotal 与类别。
  // 结算前先把本轮商品/数量记下，供收尾统一确认卡使用；随后清出购物车。
  const _orderItems = _checkoutItems.slice();
  closeCheckout();
  const _payer = _checkoutPay;
  _suppressPurchaseToast = true;
  try {
    for (const ln of lines) {
      pendingCategory = ln.cat;
      _finishPurchase(ln.p, false, ln.isLuxury, ln.lineTotal, _payer);
    }
  } finally {
    _suppressPurchaseToast = false;
  }
  _clearCheckedOutFromCart(_orderItems);
  showOrderConfirm(lines, total, _payer);
}

// ===== ghost_pay 接线：把现有 Checkout / decidePayOrder / _finishPurchase 串起来 =====
// 锁跟随真实请求生命周期，不用固定 2 秒锁。approve 进入 _finishPurchase 前确认未 consumed。
let _payInFlight = false;

// 当前 Checkout 是否含房产（homeType==='house'）。房产禁走普通代付。
function _checkoutCartHasHouse() {
  return (_checkoutItems || []).some(it => {
    const p = (it && it.productId && typeof getProductById === 'function') ? getProductById(it.productId) : null;
    return !!(p && p.isHomeItem && p.homeType === 'house');
  });
}

// 用现有 Checkout 口径逐件算出 lines（与 user/ghost 分支一致），返回 { lines, total }。
function _buildCheckoutLines() {
  const _careerFree = typeof isCareerFreeShipping === 'function' && isCareerFreeShipping();
  const lines = [];
  let total = 0;
  for (const it of _checkoutItems) {
    const p = getProductById(it.productId);
    if (!p) continue;
    const cat = _cartCategoryOf(p);
    const isLuxury = cat === 'luxury';
    const price = _pdetailDisplayPrice(p, cat);
    const ship = _careerFree ? 0 : (p.shipping !== undefined ? p.shipping : (isLuxury ? 45 : 28));
    const lineTotal = price * it.quantity + ship;
    total += lineTotal;
    lines.push({ p, cat, isLuxury, price, qty: it.quantity, ship, lineTotal });
  }
  return { lines, total };
}

// 隐藏代付历史：只做 decidePayOrder 的事实上下文，不展示给用户。仅记 approve / decline。
function _loadPayHistory() {
  try { return JSON.parse(localStorage.getItem('payOrderHistory') || '[]'); } catch (e) { return []; }
}
function _recordPayHistory(entry) {
  const hist = _loadPayHistory();
  hist.push(entry);
  // 只留最近 50 条，防止 localStorage 膨胀。
  localStorage.setItem('payOrderHistory', JSON.stringify(hist.slice(-50)));
}
// 给模型的事实上下文：最近 5 次 + 24h 摘要。不写任何"该拒绝"的规则。
function _buildPayHistoryContext() {
  const hist = _loadPayHistory();
  if (!hist.length) return '';
  const recent = hist.slice(-5).map(h => {
    const when = new Date(h.timestamp).toISOString().slice(0, 16).replace('T', ' ');
    return `- ${when} · ${h.name} · £${h.total} · ${String(h.decision).toUpperCase()}`;
  });
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const last24 = hist.filter(h => h.timestamp >= dayAgo);
  const reqCount = last24.length;
  const approveCount = last24.filter(h => h.decision === 'approve').length;
  const coveredTotal = last24.filter(h => h.decision === 'approve').reduce((s, h) => s + (h.total || 0), 0);
  return [
    '[For your context only — factual record of recent pay-order requests. Not a rule; you still decide freely:',
    'Recent (up to 5):',
    ...recent,
    `Last 24h: ${reqCount} request(s), ${approveCount} approved, you covered £${coveredTotal} so far.]`,
  ].join('\n');
}

// 代付历史条目里的简要商品名：首件名 +（多件时）「等 N 件」。
function _payOrderBriefName(snapshotItems) {
  const items = Array.isArray(snapshotItems) ? snapshotItems : [];
  if (!items.length) return '(空订单)';
  const first = items[0].name || items[0].displayName || '商品';
  return items.length > 1 ? `${first} 等 ${items.length} 件` : first;
}

// 聊天里插入一张代付卡（存进 chatHistory，可被后续状态更新命中）。
function _insertPayCard(order) {
  chatHistory.push({ role: 'user', content: `[代付请求] ${_payOrderBriefName(order.items)} · £${order.total}`, _payCard: order, _time: Date.now() });
  if (typeof saveHistory === 'function') saveHistory();
  if (typeof openScreen === 'function') openScreen('chatScreen');
}

// 按 requestId 更新代付卡状态：改 chatHistory 数据 + 就地重渲 DOM 节点，不生成第二张卡。
function _updatePayCardStatus(requestId, status) {
  const rec = chatHistory.find(m => m._payCard && m._payCard.requestId === requestId);
  if (rec) {
    rec._payCard.status = status;
    if (typeof saveHistory === 'function') saveHistory();
  }
  const el = document.querySelector('[data-pay-request-id="' + String(requestId).replace(/"/g, '') + '"]');
  if (el && rec) {
    const wrap = document.createElement('div');
    wrap.innerHTML = renderPayRequestCard(rec._payCard);
    const fresh = wrap.firstElementChild;
    if (fresh) el.replaceWith(fresh);
  }
}

// 移除某张代付卡（fail 恢复 Checkout 时用，避免留下永久 waiting 卡）。
function _removePayCard(requestId) {
  const idx = chatHistory.findIndex(m => m._payCard && m._payCard.requestId === requestId);
  if (idx !== -1) { chatHistory.splice(idx, 1); if (typeof saveHistory === 'function') saveHistory(); }
  const el = document.querySelector('[data-pay-request-id="' + String(requestId).replace(/"/g, '') + '"]');
  if (el) { const p = el.closest('.message'); (p || el).remove(); }
}

function _reopenCheckout() {
  const overlay = document.getElementById('checkoutOverlay');
  if (overlay) overlay.classList.add('show');
  renderCheckout();
}

async function _checkoutConfirmGhostPay() {
  if (_payInFlight) return; // 慢响应期间重复点击不产生第二次请求
  if (!_checkoutItems.length) { if (typeof showToast === 'function') showToast('🛒 购物车还是空的'); return; }

  // 底层 guard：房产（homeType==='house'）不允许走普通代付，防止绕过 UI 直接调用。
  // 只拦 Ghost Pay，不影响用户余额购买 / Ghost Card / Purchase / Delivery。car 不在此列。
  if (_checkoutCartHasHouse()) {
    if (typeof showToast === 'function') showToast('🏠 这样的东西不能让他顺手代付');
    return;
  }

  // 1. 冻结当前订单：商品语义走现有 _freezePayOrderItem，不另组商品数据。
  const frozenItems = _checkoutItems.map(_freezePayOrderItem).filter(Boolean);
  if (!frozenItems.length) return;

  // 展示口径 lines（与 user/ghost 完全一致），用于卡片显示与最终建单。
  const { lines, total } = _buildCheckoutLines();
  if (!lines.length || total <= 0) return;
  const subtotal = lines.reduce((s, ln) => s + ln.price * ln.qty, 0);
  const shipping = lines.reduce((s, ln) => s + ln.ship, 0);

  const snapshot = { items: frozenItems, subtotal, shipping, total };
  const requestId = 'pay_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

  // 2. 上锁 + 禁止重复提交。
  _payInFlight = true;

  // 3. 插入 Payment Request 卡（waiting）。卡片显示用 lines（含图片/中文名/英文名/数量）。
  const displayItems = lines.map(ln => ({
    id: ln.p.id, name: ln.p.displayName || ln.p.name || '', nameEn: ln.p.nameEn || '',
    price: ln.price, qty: ln.qty,
  }));
  const cardOrder = { requestId, items: displayItems, shipping, total, status: 'waiting' };
  closeCheckout();
  _insertPayCard(cardOrder);

  // 4. 调用现有 decidePayOrder（附带隐藏历史摘要作事实上下文）。
  let result;
  try {
    result = await decidePayOrder(snapshot, { historyContext: _buildPayHistoryContext() });
  } catch (e) {
    result = { decision: 'fail', reply: '', reason: 'exception' };
  }

  const decision = result && result.decision;
  const reply = (result && result.reply || '').trim();

  // 5a. approve
  if (decision === 'approve') {
    // 防重复：进入建单前确认未 consumed；一旦开始立即标记。
    if (cardOrder._consumed) { _payInFlight = false; return; }
    cardOrder._consumed = true;

    // approve 的行动结果就是 PAID BY HIM 卡片本身，不再向聊天追加付款确认话术，
    // 避免"卡片已付 + 又说一遍我来付"的重复感。
    _updatePayCardStatus(requestId, 'approved');
    // 不扣用户余额、不调用 spendGhostCard。逐件进现有 _finishPurchase(..., 'ghost_pay')。
    // 结算前记下本轮商品，收尾统一清购物车 + 弹一次确认卡（代付东西也别留在车里）。
    const _orderItems = _checkoutItems.slice();
    _suppressPurchaseToast = true;
    try {
      for (const ln of lines) {
        pendingCategory = ln.cat;
        _finishPurchase(ln.p, false, ln.isLuxury, ln.lineTotal, 'ghost_pay');
      }
    } finally {
      _suppressPurchaseToast = false;
    }
    _clearCheckedOutFromCart(_orderItems);
    showOrderConfirm(lines, total, 'ghost_pay');
    _recordPayHistory({ timestamp: Date.now(), name: _payOrderBriefName(frozenItems), total, decision: 'approve' });
    _payInFlight = false;
    return;
  }

  // 5b. decline
  if (decision === 'decline') {
    _updatePayCardStatus(requestId, 'declined');
    if (reply && typeof appendMessage === 'function') {
      appendMessage('assistant', reply);
      chatHistory.push({ role: 'assistant', content: reply, _time: Date.now() });
      if (typeof saveHistory === 'function') saveHistory();
    }
    // 不扣款、不建 Purchase/Delivery。Checkout 仍可继续选别的付款方式。
    _recordPayHistory({ timestamp: Date.now(), name: _payOrderBriefName(frozenItems), total, decision: 'decline' });
    _reopenCheckout();
    _payInFlight = false;
    return;
  }

  // 5c. fail / timeout / API error / 无合法 decision：不 decline 也不 approve。
  // 卡只有三态，不临时造第四态——撤掉这张 waiting 卡并恢复 Checkout，给轻提示，允许重试。
  // fail 不计入 approve/decline 消费历史。
  _removePayCard(requestId);
  if (typeof showToast === 'function') showToast('💫 没送出去，再试一次');
  _reopenCheckout();
  _payInFlight = false;
}

// ===== 代付：Ghost 本人看到具体订单后自主决定是否替用户付款 =====
// 本轮只实现模型决策函数：独立、可测试，不接 Checkout / 不扣款 / 不建 Purchase / Delivery。
// 语义：ghost_pay ≠ 现金转账，不复用 _transfer，不扣用户余额/Ghost Card。
// 沿用 SEND_GIFT 的「自然回复 + 隐藏 token」模式：PAY_ORDER:APPROVE / PAY_ORDER:DECLINE。
// 决定必须来自 Ghost 人格与关系上下文，禁止 Math.random / 前端价格阈值。
// 失败（API/超时/空回复/无合法 token/token 冲突）→ decision:'fail'，绝不默认 approve。

// 冻结订单单件语义（唯一读 MARKET_PRODUCTS 的地方）：从 {productId, quantity} 提取
// 给模型看的安全字段。只带 name / enName / productCategory / desc(短) / price / quantity，
// 不带 productId / image / badge / unlock / isReunion / features 明细 / CSS / maxPurchase 等内部字段。
// 不带 recipient：NOA MARKET 已有既定购买语境，特殊商品（机票/酒店/资产等）的真实用途
// 由 name + productCategory + desc 表达，而非归类成"买给 User/Ghost"。
function _freezePayOrderItem(rawItem) {
  const p = (rawItem && rawItem.productId && typeof getProductById === 'function')
    ? getProductById(rawItem.productId) : null;
  if (!p) return null;
  const catId = typeof _cartCategoryOf === 'function' ? _cartCategoryOf(p) : '';
  const catLabel = (typeof MARKET_CATEGORIES !== 'undefined'
    ? (MARKET_CATEGORIES.find(c => c.id === catId) || {}).label : '') || catId || '';
  // 简介取 desc 的短版本（约 100–150 字符），不传完整详情。
  let brief = (p.desc || '').trim().replace(/\s+/g, ' ');
  if (brief.length > 140) brief = brief.slice(0, 140).trim() + '…';
  const out = {
    name: p.displayName || p.name || '',
    enName: p.nameEn || '',
    productCategory: catLabel,
    desc: brief,
    price: typeof p.price === 'number' ? p.price : 0,
    quantity: Math.max(1, (rawItem.quantity | 0) || 1),
  };
  // 语义歧义商品可选隐藏字段：只给模型看，不进 UI，不替换 desc。
  // 仅按字段存在与否判断，不硬编码 isReunion / 商品 ID。
  if (p.modelContext) out.modelContext = String(p.modelContext).trim();
  // 大额资产语义：房/车属重大财务决定。房产已在入口禁代付，这里到达的房产字段仅为兜底；
  // 车辆(car)保留代付，但必须让模型明确知道这是 major asset，而非普通礼物。
  if (p.isHomeItem) {
    out.assetClass = 'major_asset';
    if (p.homeType) out.assetType = String(p.homeType).trim(); // 'car' | 'house'
  }
  return out;
}

// 从冻结订单 snapshot 生成给模型看的订单描述。纯渲染，只读 snapshot，不依赖全局商品表。
function _payOrderSnapshotText(snapshot) {
  const items = Array.isArray(snapshot && snapshot.items) ? snapshot.items : [];
  const blocks = items.map(it => {
    const name = it.name || it.displayName || '(未命名商品)';
    const en = it.enName || it.nameEn || '';
    const qty = Math.max(1, it.quantity | 0 || 1);
    const price = typeof it.price === 'number' ? it.price : 0;
    const cat = it.productCategory || it.category || '';
    const desc = (it.desc || '').trim();
    const mctx = (it.modelContext || '').trim();
    const isMajor = it.assetClass === 'major_asset';
    const assetType = (it.assetType || '').trim();
    const head = `- ${name}${en ? ` (${en})` : ''} ×${qty} @ £${price}`;
    const lines = [head];
    if (cat) lines.push(`  类别: ${cat}`);
    if (desc) lines.push(`  简介: ${desc}`);
    if (isMajor) lines.push(`  ⚠ MAJOR ASSET${assetType ? ` (${assetType})` : ''}: this is a significant purchase, not a small gift — weigh it as a real financial decision.`);
    if (mctx) lines.push(`  背景（仅你知道）: ${mctx}`);
    return lines.join('\n');
  });
  const subtotal = typeof snapshot.subtotal === 'number' ? snapshot.subtotal : 0;
  const shipping = typeof snapshot.shipping === 'number' ? snapshot.shipping : 0;
  const total = typeof snapshot.total === 'number' ? snapshot.total : (subtotal + shipping);
  return [
    'ORDER (frozen snapshot):',
    blocks.join('\n') || '(no items)',
    `Subtotal: £${subtotal}`,
    `Shipping: £${shipping}`,
    `Total: £${total}`,
  ].join('\n');
}

// 解析模型输出：抽出 PAY_ORDER token，从展示 reply 中彻底清除。
// 返回 { decision:'approve'|'decline'|'fail', reply } ；无合法/冲突 token → fail。
function _parsePayOrderReply(rawReply) {
  if (!rawReply || !String(rawReply).trim()) return { decision: 'fail', reply: '', reason: 'empty' };
  let reply = String(rawReply)
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  const matches = reply.match(/PAY_ORDER:\s*(APPROVE|DECLINE)/ig) || [];
  // token 一律从展示 reply 中清除（无论是否合法）。
  reply = reply.replace(/PAY_ORDER:\s*\w*/ig, '').replace(/\n{3,}/g, '\n').trim();

  if (matches.length === 0) return { decision: 'fail', reply, reason: 'no_token' };

  const decisions = matches.map(m => (m.split(':')[1] || '').trim().toUpperCase());
  const uniq = [...new Set(decisions)];
  if (uniq.length !== 1) return { decision: 'fail', reply, reason: 'token_conflict' };
  if (uniq[0] !== 'APPROVE' && uniq[0] !== 'DECLINE') return { decision: 'fail', reply, reason: 'token_invalid' };

  return { decision: uniq[0].toLowerCase(), reply, reason: null };
}

// 代付模型决策：输入冻结订单 snapshot，返回 { decision, reply }。
// 复用现有最小模型调用 (/api/chat) 与 persona 上下文 (buildSystemPrompt)。
async function decidePayOrder(snapshot, opts) {
  opts = opts || {};
  if (!snapshot || !Array.isArray(snapshot.items) || !snapshot.items.length) {
    return { decision: 'fail', reply: '', reason: 'bad_snapshot' };
  }

  const orderText = _payOrderSnapshotText(snapshot);
  const instruction = [
    '[System: She is checking out a specific order and is asking YOU to pay for it — to cover this exact basket for her.',
    'This is NOT a cash request. "Asking for cash" and "asking you to pay one specific order you can see" are different scenarios — this is the latter.',
    'You can see the exact items and the total below, so you decide for yourself, in character, whether you cover this order for her. You may say yes or no; a husband is free to do either.',
    'This does NOT change the existing rule that you never hand her raw cash — the Ghost Card is still how her own spending works. This is about you paying one order you can see, not transferring money.',
    '',
    'Money has real weight. Loving her does not make the amount stop mattering, and "she wants it" is not on its own a reason to pay. An everyday gift you can approve or decline freely, on feeling. But anything flagged MAJOR ASSET below (a car, and other big-ticket things) is a serious financial decision — do not auto-approve it just because you love her or she wants it; treat it like a real one you would actually think about. There is no fixed price limit and no fixed answer — weigh it honestly as yourself.',
    '',
    orderText,
    '',
    'Decide for yourself whether you cover this order, then output exactly one hidden control token as described below.',
    '',
    'If you DECLINE: first reply naturally to her in your own voice (one short, in-character line — she needs to hear why you are not covering it this time), then on the very last line output:',
    'PAY_ORDER:DECLINE',
    '',
    'If you APPROVE: do NOT write any reply. Paying the order IS your answer — she sees it settled on the payment card. Output only the token, nothing else:',
    'PAY_ORDER:APPROVE',
    '',
    'Output the token exactly once. Do not explain the token. Base the decision on who you are and where things stand between you, not on the number alone.]',
  ];
  // 事实性上下文：最近代付摘要（可选）。只是事实，不含任何"该拒绝"的规则。
  if (opts.historyContext) {
    instruction.splice(instruction.length - 1, 0, '', opts.historyContext);
  }
  const instructionText = instruction.join('\n');

  // 独立一次性调用：不写入 chatHistory，不污染主聊天流程。
  const sys = typeof buildSystemPrompt === 'function' ? buildSystemPrompt() : '';
  const ctx = (typeof chatHistory !== 'undefined' && Array.isArray(chatHistory))
    ? chatHistory.filter(m => !m._system && !m._recalled && m.role && m.content).slice(-10).map(m => ({ role: m.role, content: m.content }))
    : [];
  const messages = [...ctx, { role: 'user', content: instructionText }];

  let rawReply = '';
  try {
    const _fetch = typeof fetchWithTimeout === 'function' ? fetchWithTimeout : fetch;
    const res = await _fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: typeof getMainModel === 'function' ? getMainModel() : undefined,
        max_tokens: 400,
        system: sys,
        messages,
      }),
    }, opts.timeoutMs || 15000);
    if (!res || !res.ok) return { decision: 'fail', reply: '', reason: 'http_' + (res && res.status) };
    const data = await res.json();
    rawReply = (data && data.content && data.content[0] && data.content[0].text) || '';
  } catch (e) {
    return { decision: 'fail', reply: '', reason: (e && e.name === 'AbortError') ? 'timeout' : 'network' };
  }

  // 破防检测：模型跳出人格时按 fail 处理，绝不默认 approve。
  if (typeof isBreakout === 'function' && isBreakout(rawReply)) {
    return { decision: 'fail', reply: '', reason: 'breakout' };
  }

  return _parsePayOrderReply(rawReply);
}

// 测试钩子：暴露纯解析函数，便于用 mock snapshot 验证，不触发任何网络/扣款。
if (typeof window !== 'undefined') {
  window.decidePayOrder = decidePayOrder;
  window._parsePayOrderReply = _parsePayOrderReply;
  window._payOrderSnapshotText = _payOrderSnapshotText;
  window._freezePayOrderItem = _freezePayOrderItem;
}

// 返回购物车：关闭 Checkout，回到购物车。
function _checkoutBackToCart() {
  closeCheckout();
  if (typeof openCart === 'function') openCart();
}

function _pdetailShare() {
  const p = _pdetailProduct;
  if (!p) return;
  closeProductDetail();
  if (typeof shareProductToChat === 'function') {
    shareProductToChat({ id: p.id, emoji: p.emoji, name: p.name, displayName: p.displayName || '', nameEn: p.nameEn || '', desc: p.desc || '', price: p.price });
  }
}

// 商品详情「立即购买」：进入统一 Checkout（只带 { productId, quantity }）。
function _pdetailBuyNow() {
  const p = _pdetailProduct;
  if (!p || !p.id) return;
  closeProductDetail();
  openCheckout([{ productId: p.id, quantity: 1 }]);
}

// 详情页「加入购物车」：只入购物车状态，不进购买/支付流程。
function _pdetailAddToCart() {
  const p = _pdetailProduct;
  if (!p || !p.id) return;
  addToCart(p.id);
  if (typeof showToast === 'function') showToast('🛒 已加入购物车');
}

// 把当前弹窗里的商品「发给他看」——只进正常聊天主链，不碰购买/钱包/好感/独立reaction
function shareCurrentProduct() {
  const p = pendingProduct;
  if (!p) return;
  const product = { id: p.id, emoji: p.emoji, name: p.name, displayName: p.displayName || '', nameEn: p.nameEn || '', desc: p.desc || '', price: p.price };
  closeBuyModal();
  shareProductToChat(product);
}

function shareProductToChat(product) {
  if (!product || !product.name) return;
  const priceStr = (typeof product.price === 'number') ? `£${product.price}` : (product.price || '');
  const content = `[分享了一个商品给你看] ${product.emoji || ''} ${product.displayName || product.name}${priceStr ? ` · ${priceStr}` : ''}${product.desc ? ` — ${product.desc}` : ''}`.trim();

  chatHistory.push({ role: 'user', content, _product: product, _time: Date.now() });
  if (typeof saveHistory === 'function') saveHistory();

  if (typeof openScreen === 'function') openScreen('chatScreen');

  if (typeof _processMergedMessage === 'function') _processMergedMessage(content);
}

// 住宅分享卡：复用商品分享主链，只增加独立 house 类型。携带稳定房源 ID，不触发租赁/AA/付款。
function shareHouseToChat(house) {
  if (!house || !house.id) return;
  const name = house.titleZh || house.titleEn || '';
  const rentStr = (typeof house.rent === 'number') ? `£${house.rent.toLocaleString()}/月` : (house.rent || '');
  const parts = [house.layout, house.area].filter(Boolean).join(' · ');
  const content = `[分享了一套住宅给你看] 🏠 ${house.titleEn || ''}${name ? ` ${name}` : ''}｜${house.loc || 'Manchester, UK'}${parts ? `｜${parts}` : ''}${rentStr ? `｜${rentStr}` : ''} (房源ID: ${house.id})`.trim();

  chatHistory.push({ role: 'user', content, _house: house, _time: Date.now() });
  if (typeof saveHistory === 'function') saveHistory();

  if (typeof openScreen === 'function') openScreen('chatScreen');

  if (typeof _processMergedMessage === 'function') _processMergedMessage(content);
}

function confirmPurchase() {
  if (!pendingProduct) return;
  const p = pendingProduct;
  const isWishlist = pendingCategory === 'wishlist';
  const isLuxury = pendingCategory === 'luxury';
  const weeklySale = isLuxury ? getWeeklySale() : null;
  const onSale = weeklySale && weeklySale.name === p.name;
  let displayPrice = onSale ? Math.round(p.price * weeklySale.discount) : p.price;
  // 修复：大件商品（机票/酒店/车/房）不乘1.8，与openBuyModal保持一致
  const _isBigTicketConfirm = p.isReunion || p.isHomeItem;
  if (!isLuxury && !_isBigTicketConfirm && !isV1MarketProduct(p)) displayPrice = Math.round(displayPrice * 1.8);
  const _shopDiscount2 = (typeof getCareerShopDiscount === 'function') ? getCareerShopDiscount() : 0;
  if (_shopDiscount2 > 0) displayPrice = Math.round(displayPrice * (1 - _shopDiscount2 / 100));
  let shipping = p.isUserItem ? (isLuxury ? 45 : 25) : (p.shipping !== undefined ? p.shipping : (isLuxury ? 45 : 28));
  if (typeof isCareerFreeShipping === 'function' && isCareerFreeShipping()) shipping = 0;
  const total = displayPrice + shipping;
  const txLabel = isWishlist ? '心愿 · ' : p.isGhostGift ? '寄给Ghost · ' : p.isUserItem ? '购买 · ' : '寄给Ghost · ';
  const itemLabel = txLabel + p.name;
  const category = p.isUserItem ? 'self' : 'for_him';

  // 心愿单：也提供黑卡选项（机票等大件商品）
  if (isWishlist) {
    if (typeof showCardSelector === 'function') {
      showCardSelector(total, p.name,
        () => {
          const bal = getBalance();
          if (bal < total) { showToast('💔 余额不足！'); closeBuyModal(); return; }
          setBalance(bal - total);
          addTransaction({ icon: p.emoji, name: itemLabel, amount: -total });
          renderWallet();
          _finishPurchase(p, isWishlist, isLuxury, total, 'user');
        },
        () => {
          if (!spendGhostCard(total, p.name, 'self')) { showToast('💔 Ghost Card 额度不足！'); return; }
          _finishPurchase(p, isWishlist, isLuxury, total, 'ghost');
        }
      );
    } else {
      const bal = getBalance();
      if (bal < total) { showToast('💔 余额不足！'); closeBuyModal(); return; }
      setBalance(bal - total);
      addTransaction({ icon: p.emoji, name: itemLabel, amount: -total });
      renderWallet();
      _finishPurchase(p, isWishlist, isLuxury, total, 'user');
    }
    return;
  }

  closeBuyModal();

  if (typeof showCardSelector === 'function') {
    showCardSelector(total, p.name,
      () => {
        const bal = getBalance();
        if (bal < total) { showToast('💔 余额不足！'); return; }
        setBalance(bal - total);
        addTransaction({ icon: p.emoji, name: itemLabel, amount: -total });
        renderWallet();
        _finishPurchase(p, isWishlist, isLuxury, total, 'user');
      },
      () => {
        if (!spendGhostCard(total, p.name, category)) { showToast('💔 Ghost Card 额度不足！'); return; }
        _finishPurchase(p, isWishlist, isLuxury, total, 'ghost');
      }
    );
  } else {
    const bal = getBalance();
    if (bal < total) { showToast('💔 余额不足！'); return; }
    setBalance(bal - total);
    addTransaction({ icon: p.emoji, name: itemLabel, amount: -total });
    renderWallet();
    _finishPurchase(p, isWishlist, isLuxury, total, 'user');
  }
}

function _finishPurchase(p, isWishlist, isLuxury, total, payer) {
  const purchased = JSON.parse(localStorage.getItem('purchasedItems') || '[]');
  if (!purchased.includes(p.name)) { purchased.push(p.name); localStorage.setItem('purchasedItems', JSON.stringify(purchased)); }
  const purchaseCounts = JSON.parse(localStorage.getItem('purchaseCounts') || '{}');
  purchaseCounts[p.name] = (purchaseCounts[p.name] || 0) + 1;
  localStorage.setItem('purchaseCounts', JSON.stringify(purchaseCounts));

  // 阶段1：并写 Purchase Fact（不替代上面的 legacy 写入，仅追加事实记录）
  // recipient：wishlist（面基心愿=用户自己的宝贝）与 isUserItem 归 user，其余寄给 ghost。
  // 这只是 snapshot 当前 flag 已确定的收件方，不改动 isUserItem/isGhostGift 语义。
  const _recipient = (isWishlist || p.isUserItem) ? 'user' : 'ghost';
  let _fact = null;
  try { _fact = addPurchaseFact(p, { category: pendingCategory, total: total, payer: payer || null, recipient: _recipient }); } catch(e) {}
  const _purchaseId = _fact && _fact.purchaseId || null;

  const _reunionCol = SPECIAL_COLLECTIONS.find(c => c.id === 'reunion');
  const reunionItems = getCollectionItemNames('reunion');
  if (reunionItems.length && reunionItems.every(n => purchased.includes(n)) && !localStorage.getItem(_reunionCol.rewardFlag)) {
    localStorage.setItem(_reunionCol.rewardFlag, 'true');
    setTimeout(() => showToast('🎧 三件套集齐！独家音频剧场《面基》已解锁，去声之匣收听'), 1500);
  }

  // 修复(#24)：clearProductTrigger 定义在 triggers.js，是这里唯一没加 typeof 守卫的
  // 外部调用。一旦它抛错，_finishPurchase 会在 addDelivery 之前中断——钱已扣，
  // 但快递对象从没创建，于是"正在邮寄/礼物架/丢件投诉"三处都查无此包裹（礼物消失）。
  if (typeof clearProductTrigger === 'function') {
    try { clearProductTrigger(p.name); } catch(e) { console.warn('[shop] clearProductTrigger 失败:', e); }
  }
  // 商品购买后的世界规则分三类，用结构字段判定，不靠价格/名字：
  //   资产 isHomeItem（车/房/地）→ Ownership，不建 Delivery，反馈"已拥有"
  //   特殊 isReunion（面基三件套）→ Obtained / metInPerson，不建 Delivery，反馈"已获得"
  //   普通实物（其余）→ Purchase → Delivery，保留"已寄出"
  // shippable 显式用 !isHomeItem && !isReunion，不复用 isUniqueProduct()，
  // 以免将来出现"唯一但仍需物流"的实物商品被误判为不发货。
  const _shippable = !p.isHomeItem && !p.isReunion;

  // 修复：加上扣款金额，防止用户看不到扣款反馈以为没成功而重复购买
  // 批量结算（_suppressPurchaseToast）时跳过逐件 toast——多件会互相覆盖，
  // 改由结算流程收尾统一弹一次「下单成功」确认卡（showOrderConfirm）。
  const _amtStr = total ? ` · 已扣款 £${total}` : '';
  if (!_suppressPurchaseToast) {
    if (p.isHomeItem) showToast('🏠 已拥有' + _amtStr);
    else if (p.isReunion) showToast('✓ 已获得' + _amtStr);
    else if (isWishlist) showToast('💝 已加入心愿单！');
    else if (p.isUserItem) {
      showToast('🛍️ 购买成功' + _amtStr);
    }
    else showToast('📦 已寄出！Ghost 会收到的～' + _amtStr);
  }

  // 资产 / 特殊商品不进入 Delivery domain：只有可寄送的普通实物才建快递。
  if (!isWishlist && _shippable) {
    const _d = addDelivery(p, false, isLuxury, _purchaseId); // isUserItem 自购与寄给 ghost 一致处理
    if (_d && _d.id) try { setPurchaseFactDelivery(_purchaseId, _d.id); } catch(e) {}
  } else if (isWishlist && p.ghostMsg) {
    setTimeout(() => {
      if (typeof appendMessage === 'function') {
        appendMessage('bot', p.ghostMsg);
        chatHistory.push({ role: 'assistant', content: p.ghostMsg, _time: Date.now() });
        saveHistory();
      }
    }, 2000);
  }

  if (p.isHomeItem && !p.comingSoon) setTimeout(() => triggerHomeItemMoment(p), 2000);

  renderMarket(currentCategory);
  // 修复：购买完成后刷新物流追踪器，确保新快递立即显示
  if (typeof renderDeliveryTracker === 'function') {
    setTimeout(() => renderDeliveryTracker(), 300);
  }
  // 修复：改用scheduleCloudSave，网络抖动时会自动重试，防止快递记录丢失
  if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
}

// ===== 每周折扣 =====
function getDayKey() {
  const now = new Date();
  return now.getFullYear() + '-' + (now.getMonth()+1) + '-' + now.getDate();
}

function getWeeklySale() {
  // NOA MARKET V1：奢品取消促销机制（TODAY ONLY / 折扣角标 / 划线价）。
  // 奢品高级感靠图片、留白、字体、价格层级体现，不靠打折。
  return null;
  /* eslint-disable no-unreachable */
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 快递投诉系统（已退役）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 旧的 openDeliveryComplaint / _runComplaintSearch / _showComplaintResult
// 三个函数已整体删除：随机 10/40/50 赔付、×1.8 显示价、3天候选窗、
// 投诉后双删包裹、统一退 User Balance 全部退役。按钮早已从 index.html 摘除。
// 新的「申请理赔」在 delivery.js 独立实现（原路退款、processing→paid），不复用此处代码。

