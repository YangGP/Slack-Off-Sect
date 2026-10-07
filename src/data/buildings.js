/**
 * 建筑数据（对应猫国的 buildings）。
 *
 * 效果字段说明（都会按数量叠加）：
 *   prod        每秒固定产出，按“启用中的数量”叠加
 *   ratio       对某资源产出的百分比加成，按“启用中的数量”叠加
 *   ratioAll    对全部资源产出的百分比加成，按“启用中的数量”叠加
 *   storage     某资源的仓储上限，按“已建造数量”叠加
 *   storageAll  全部资源的仓储上限，按“已建造数量”叠加
 *   maxDisciples 弟子上限
 *   morale      士气（民心）加成
 *   consumeRatio 降低弟子灵气消耗
 *   craftBonus  制作产出加成（小数部分自动累积）
 *   disasterGuard 妖兽侵袭的损失减免（最多 80%）
 *   ascendBonus 飞升时获得的仙缘加成
 *   arrivalBonus 弟子前来速度加成（缩短自动前来的间隔）
 *
 * needs 为解锁条件，可组合：building / buildings[] / upgrade / upgrades[] / realm
 */
export const BUILDINGS = [
  // ============ 生产 ============
  {
    id: 'spiritField',
    name: '聚灵阵',
    glyph: '阵',
    group: 'produce',
    cost: { qi: 25 },
    priceRatio: 1.15,
    desc: '在院里刻下一圈聚灵纹，游散的灵气自己就会往阵眼里淌。',
    effects: { prod: { qi: 0.3 } },
  },
  {
    id: 'lumberYard',
    name: '伐木场',
    glyph: '伐',
    group: 'produce',
    cost: { qi: 150, stone: 6 },
    priceRatio: 1.15,
    desc: '斧锯齐备，樵夫不用再徒手掰树。',
    effects: { prod: { wood: 0.12 }, ratio: { wood: 0.05 } },
    needs: { building: { id: 'spiritField', count: 2 } },
  },
  {
    id: 'mine',
    name: '玄铁矿',
    glyph: '矿',
    group: 'produce',
    // 实物建筑吃材料：木料做支架、石头砌井口（灵气是气脉的东西，不该拿来砌矿）。
    // 石头的量要小：这个阶段石料比灵气稀缺得多（灵气 500 只值 30 秒产出，石料 150 要挖好几分钟），
    // 写大了会把前期卡住 —— 这里要的是"要用料"的语义，不是真加价。
    cost: { wood: 450, stone: 20 },
    priceRatio: 1.15,
    desc: '顺着灵脉往下挖，便能挖到泛着寒光的玄铁。',
    effects: { prod: { ore: 0.05 } },
    needs: { upgrades: ['prospectStudy'] },
  },
  {
    id: 'spiritQuarry',
    name: '灵石矿',
    glyph: '灵',
    group: 'produce',
    // 与玄铁矿同在"寻脉"这一条线上：石料砌井口、木料搭支架（实物建筑不吃灵气）
    cost: { wood: 700, stone: 60, ore: 80 },
    // 叠加重税：灵石是全局硬通货（研究 / 建筑 / 破境都吃它），
    // 天然来源必须是"细水长流"，不能变成替代整条"以气凝石"的瓶颈。
    // 实测教训：0.12/秒 × 可无限叠，24 小时就能冲到渡劫期（原本 72 小时）。
    priceRatio: 1.55,
    desc: '顺着灵脉再往深处走，岩层里嵌着天然灵石 —— 凿下来就能用，不必再以气凝石。',
    effects: { prod: { stone: 0.03 } },
    needs: { upgrades: ['prospectStudy'] },
  },
  {
    id: 'herbGarden',
    name: '药圃',
    glyph: '圃',
    group: 'produce',
    // 同理：药圃是地里的活，用木料与石头，不用灵气（同样只取象征性的石料）
    cost: { wood: 400, stone: 20 },
    priceRatio: 1.15,
    desc: '按四时节气轮种，灵草自会一茬茬地长。',
    effects: { prod: { herb: 0.04 } },
    needs: { upgrades: ['herbStudy'] },
  },
  {
    id: 'spiritVein',
    name: '灵脉井',
    glyph: '脉',
    group: 'produce',
    cost: { stone: 1200, qi: 5000 },
    priceRatio: 1.35,
    desc: '在灵脉上打一口井，整个宗门的呼吸都顺畅了。',
    effects: { ratio: { qi: 0.1, wood: 0.05 } },
    // 先懂「灵气从哪来」，才谈得上打井引脉（修真 · 灵源考）
    // 先懂「灵气从哪来」，才谈得上打井引脉（修真 · 灵源考）
    needs: { upgrades: ['qiOrigin'], building: { id: 'spiritField', count: 6 } },
  },
  {
    id: 'gatheringArray',
    name: '聚灵大阵',
    glyph: '叠',
    group: 'produce',
    cost: { stone: 600, insight: 300 },
    priceRatio: 1.4,
    desc: '在小阵之上再叠三重纹路，把方圆百里的灵气都攒进山门。',
    effects: { ratioAll: 0.03, prod: { qi: 0.5 } },
    upkeep: { qi: 1.2 }, // 大阵自己在引气，也在漏气

    // 先学会「观气」，才画得出大阵（修真 · 观气法）
    needs: { upgrades: ['qiGazing'] },
  },
  {
    id: 'beastGarden',
    name: '灵兽园',
    glyph: '兽',
    group: 'produce',
    cost: { wood: 1500, plank: 6, herb: 800, stone: 1500 },
    priceRatio: 1.45,
    desc: '养几只懂事的灵兽，采药驮矿都不必弟子亲自跑。',
    effects: { prod: { herb: 0.15, ore: 0.1 }, morale: 2 },
    upkeep: { herb: 0.05 }, // 灵兽要喂

    needs: { upgrades: ['beastTaming'] },
  },

  // ============ 居所 ============
  {
    id: 'hut',
    name: '茅屋',
    glyph: '茅',
    group: 'home',
    cost: { qi: 80, stone: 4 },
    priceRatio: 1.55,
    desc: '几根灵木搭起的屋子，能住两名弟子。宗门再小，也得有张床。',
    effects: { maxDisciples: 2, storage: { qi: 60 } },
    needs: { building: { id: 'spiritField', count: 1 } },
  },
  {
    id: 'logHouse',
    name: '木屋',
    glyph: '木',
    group: 'home',
    cost: { wood: 200, stone: 30, ore: 15 },
    priceRatio: 1.55,
    desc: '梁柱规整、铁箍咬合，冬暖夏凉，可容六名弟子。',
    effects: { maxDisciples: 6, storage: { qi: 200, wood: 120 } },
    needs: { building: { id: 'hut', count: 5 } },
  },
  {
    id: 'mansion',
    name: '精舍',
    glyph: '舍',
    group: 'home',
    cost: { stone: 400, wood: 900, plank: 4, ore: 200 },
    priceRatio: 1.6,
    desc: '青石铺地、灵纹引气，住二十名弟子也不觉拥挤。',
    effects: { maxDisciples: 20, storageAll: 400, morale: 4 },
    needs: { building: { id: 'logHouse', count: 5 } },
    needs: { upgrades: ['buildingCode'] },
  },
  {
    id: 'caveDwelling',
    name: '洞府',
    glyph: '洞',
    group: 'home',
    cost: { stone: 2500, insight: 1200, artifact: 5 },
    priceRatio: 1.7,
    desc: '凿山为府，聚灵成池。能住六十人，且人人吐纳有得。',
    effects: { maxDisciples: 60, storageAll: 3000, morale: 6 },
    needs: { upgrades: ['grottoArt'] },
  },

  // ============ 仓储 ============
  {
    id: 'granary',
    name: '谷仓',
    glyph: '仓',
    group: 'store',
    cost: { wood: 180 },
    priceRatio: 1.18,
    desc: '囤灵气如囤粮，也堆得下木料与草药 —— 荒年不至于饿着弟子。',
    // 灵木也在这里囤：早期灵木产量几天内涨几十倍，只靠基础上限 200 会一直在「0 ↔ 满仓」之间跳
    effects: { storage: { qi: 400, wood: 150, herb: 60 } },
    needs: { building: { id: 'spiritField', count: 2 } },
  },
  {
    id: 'warehouse',
    name: '库房',
    glyph: '库',
    group: 'store',
    cost: { wood: 200, stone: 120 },
    priceRatio: 1.18,
    desc: '石基木梁，专存灵木、灵石、玄铁、灵草这些基础物资 —— 丹药符箓另有去处。',
    // 库房只存**基础物资**：灵木 / 灵石 / 玄铁 / 灵草。
    // 份额按「这种资源平时流得多快」分配（8 小时推演：灵木 72/秒、灵草 11、玄铁 7.5；
    // 灵石没有产出，靠凝气成石现印，按兑换后的灵气量折算）。
    // 灵气上限归「谷仓」，感悟归藏经阁/讲经堂/观星台，丹药/符箓/法器/香火归各自的专属建筑。
    effects: { storage: { wood: 360, stone: 240, ore: 120, herb: 150 } },
    needs: { upgrades: ['earthArt'] },
  },
  {
    id: 'depot',
    name: '石殿',
    glyph: '殿',
    group: 'store',
    cost: { stone: 1500, plank: 3, ore: 400 },
    priceRatio: 1.25,
    desc: '整座山腹都掏空了，堆到天荒地老也放得下。',
    effects: { storageAll: 2000 },
    needs: { building: { id: 'warehouse', count: 5 } },
    needs: { upgrades: ['earthEssence'] },
  },
  {
    id: 'grotto',
    name: '洞天',
    glyph: '天',
    group: 'store',
    // 洞天以玄钢为骨：撑开一方小世界，梁架全用钢（可反复盖）
    cost: { stone: 8000, plank: 20, insight: 4000, artifact: 10, steel: 20 },
    priceRatio: 1.35,
    desc: '一方小世界，装多少东西都不显挤，还自带静心之效。',
    effects: { storageAll: 12000, morale: 5 },
    needs: { upgrades: ['grottoArt'] },
  },

  // ============ 修行 ============
  {
    id: 'library',
    name: '藏经阁',
    glyph: '经',
    group: 'cultivate',
    cost: { qi: 200, wood: 60 },
    priceRatio: 1.18,
    desc: '一阁典籍，是宗门最早的学问。弟子在此抄经静坐，念头慢慢熬成感悟。',
    effects: { prod: { insight: 0.03 }, ratio: { insight: 0.15 }, storage: { insight: 400 } },
    needs: { building: { id: 'spiritField', count: 3 } },
  },
  {
    id: 'academy',
    name: '讲经堂',
    glyph: '讲',
    group: 'cultivate',
    cost: { wood: 900, plank: 4, stone: 300 },
    priceRatio: 1.25,
    desc: '长老登坛讲经，一人讲、百人悟。',
    effects: { ratio: { insight: 0.35 }, storage: { insight: 800 } },
    needs: { upgrades: ['preachArt'] },
  },
  {
    id: 'observatory',
    name: '观星台',
    glyph: '星',
    group: 'cultivate',
    cost: { stone: 2000, insight: 800 },
    priceRatio: 1.3,
    desc: '夜观天象，把满天星斗读成一部功法。',
    effects: { ratio: { insight: 0.5 }, storage: { insight: 600 } },
    needs: { upgrades: ['astrologyArt'] },
  },
  {
    id: 'meditationPool',
    name: '静心池',
    glyph: '静',
    group: 'cultivate',
    cost: { herb: 400, stone: 600 },
    priceRatio: 1.3,
    desc: '池水照心，弟子泡一泡，脾气就小了一圈。',
    effects: { morale: 6 },
    needs: { upgrades: ['calmMind'] },
  },
  {
    id: 'trialTower',
    name: '试炼塔',
    glyph: '塔',
    group: 'cultivate',
    cost: { ore: 1200, insight: 2500, artifact: 6 },
    priceRatio: 1.35,
    desc: '层层有险，闯过者心境大进，宗门气运也随之上扬。',
    effects: { ratioAll: 0.05, morale: 3 },
    upkeep: { ore: 0.6 }, // 试炼要修机关、耗玄铁

    needs: { realm: 4, upgrades: ['trialArt'] },
  },

  // ============ 炼造 ============
  {
    id: 'alchemyRoom',
    name: '炼丹房',
    glyph: '丹',
    group: 'craft',
    cost: { wood: 600, herb: 200 },
    priceRatio: 1.25,
    desc: '三足鼎立、文武火候，灵草在这里变成丹药。',
    effects: { craftBonus: 0.05, ratio: { herb: 0.1 }, storage: { pill: 200 } },
    upkeep: { wood: 0.25 }, // 丹炉要一直添柴
    needs: { upgrades: ['alchemyArt'] },
  },
  {
    id: 'forge',
    name: '炼器坊',
    glyph: '器',
    group: 'craft',
    cost: { ore: 400, wood: 800 },
    priceRatio: 1.25,
    desc: '风箱一响，玄铁就有了骨气。',
    effects: { craftBonus: 0.05, ratio: { ore: 0.1 }, storage: { artifact: 120 } },
    upkeep: { wood: 0.5 }, // 风箱炭火不熄
    needs: { upgrades: ['forgeArt'] },
  },
  {
    id: 'talismanHall',
    name: '符箓堂',
    glyph: '符',
    group: 'craft',
    cost: { wood: 700, herb: 300 },
    priceRatio: 1.25,
    desc: '朱砂、黄纸、凝神一笔，符成则妖退。',
    effects: { craftBonus: 0.05, storage: { talisman: 200 } },
    upkeep: { wood: 0.2 }, // 抄符耗纸
    needs: { upgrades: ['talismanArt'] },
  },
  {
    id: 'workshop',
    name: '百工坊',
    glyph: '工',
    group: 'craft',
    cost: { plank: 6, stone: 400, ore: 400 },
    priceRatio: 1.3,
    desc: '炼丹、炼器、画符、木作的弟子在此互通有无。梁柱、案台、炉架全用板材 —— 同样的料，出手成色更高：每座制作产出 +15%（可叠加）。少了它只是慢，不会缺货。',
    // 它**只是加成建筑**：不锁任何配方或条目（数据里没有一条 needs 指向它），
    // 效果也只留与制作有关的：制作产出 +15%/座、木板上限 +300/座。
    // 「按启用数量叠加」—— 停用一座就少一份加成，所以它值得一个 停/启 的取舍。
    effects: { craftBonus: 0.15, storage: { plank: 300 } },
    upkeep: { wood: 0.8 }, // 百工齐开，木料像流水
    // 只要有第一座工坊（炼丹房）就能开张 —— 不必等炼器坊，木板与自动制作因此提前到手
    needs: { buildings: [{ id: 'alchemyRoom', count: 1 }] },
  },

  // ============ 香火 ============
  {
    id: 'gate',
    name: '山门',
    glyph: '门',
    group: 'incense',
    cost: { wood: 400, stone: 100 },
    priceRatio: 1.3,
    desc: '山门一立，香客便知此处有仙。',
    effects: { prod: { faith: 0.015 }, storage: { faith: 80 } },
    needs: { upgrades: ['incenseVow'], building: { id: 'hut', count: 3 } },
  },
  {
    id: 'incenseCauldron',
    name: '香火鼎',
    glyph: '鼎',
    group: 'incense',
    cost: { stone: 900, ore: 300 },
    priceRatio: 1.3,
    desc: '青铜大鼎终日不熄，把念力一炉炉炼成香火。',
    effects: { ratio: { faith: 0.3 }, morale: 3, storage: { faith: 120 } },
    upkeep: { wood: 0.12 }, // 鼎里得一直添香柴

    needs: { building: { id: 'gate', count: 2 } },
    needs: { upgrades: ['incenseStudy'] },
  },
  {
    id: 'ancestorHall',
    name: '祖师殿',
    glyph: '祖',
    group: 'incense',
    cost: { stone: 3000, plank: 8, insight: 1500, talisman: 5 },
    priceRatio: 1.35,
    desc: '历代祖师的牌位在此，弟子路过都要收一收心思。',
    effects: { ratio: { faith: 0.5 }, morale: 8, ratioAll: 0.03 },
    needs: { upgrades: ['ancestorArt'] },
  },

  // ============ 阵道 ============
  {
    id: 'mountainArray',
    name: '护山大阵',
    glyph: '护',
    group: 'array',
    // 护山大阵压着山门气脉，每一角都要镇符（可反复盖）
    cost: { stone: 5000, insight: 3000, ore: 2000, spiritTalisman: 8 },
    priceRatio: 1.45,
    desc: '阵纹沿山脊铺开，妖兽撞上来只会留下几道白印。',
    effects: { disasterGuard: 0.08, morale: 2 },
    upkeep: { qi: 3 }, // 护山阵常年引山间灵气

    needs: { upgrades: ['arrayBasics'] },
  },
  {
    id: 'spiritLockArray',
    name: '锁灵阵',
    glyph: '锁',
    group: 'array',
    cost: { stone: 20000, insight: 12000, talisman: 20 },
    priceRatio: 1.5,
    desc: '把弟子吐纳时逸散的灵气锁回阵中，一丝也不浪费。',
    effects: { consumeRatio: 0.03, ratioAll: 0.05 },
    needs: { upgrades: ['arrayMastery'] },
  },

  // ============ 奇观 ============
  {
    id: 'heavenTower',
    name: '通天塔',
    glyph: '通',
    group: 'wonder',
    // 塔身越高越吃风：每一重都要贴镇风灵符（可反复盖 → 灵符的持续去处）
    // 塔是玄钢与灵符最大的去处：一重塔身一段钢、一重飞檐一道符（可反复盖）
    cost: { stone: 80000, plank: 60, ore: 20000, artifact: 50, insight: 50000, steel: 80, spiritTalisman: 40 },
    priceRatio: 1.6,
    desc: '塔尖直插云海。站在塔顶的人，看得见飞升的路。',
    effects: { ratioAll: 0.15, storageAll: 20000 },
    upkeep: { wood: 10, ore: 3 }, // 通天塔维持不易

    needs: { realm: 6, upgrades: ['towerPlan'] },
  },
  {
    id: 'splitArray',
    name: '阴阳分灵阵',
    glyph: '阴',
    group: 'wonder',
    // 阵要一直烧灵气：拆开一个灵气分子，才得到一对正负灵子
    // 造价必须落在玩家"实际能达到的仓储上限"之内：早先写 25 万灵石，
    // 而参照玩家在渡劫期的灵石上限只有约 22.8 万 —— 于是这两座永远盖不出来（推演曲线一字不差）。
    cost: { stone: 150000, insight: 60000, artifact: 60 },
    priceRatio: 1.5,
    desc: '阵法把灵气分子拆成正负两半 —— 拆得越久，越像在跟天地借火。',
    effects: { prod: { yangParticle: 0.02, yinParticle: 0.02 } },
    upkeep: { qi: 8 }, // 拆分子是要耗气的：这是本作最大的灵气去处
    needs: { upgrades: ['yinyangSplit'], realm: 9 },
  },
  {
    id: 'annihilationFurnace',
    name: '湮灭炉',
    glyph: '湮',
    group: 'wonder',
    cost: { wood: 120000, stone: 180000, artifact: 60 },
    priceRatio: 1.6,
    desc: '正负灵子在炉心相遇，归于虚无，只留下滚烫的灵能。',
    effects: { prod: { qiEnergy: 0.06 } },
    upkeep: { yangParticle: 0.02, yinParticle: 0.02 }, // 成对吃掉正负灵子
    needs: { upgrades: ['annihilationArt'], realm: 10 },
  },
  {
    id: 'karmaPool',
    name: '因果池',
    glyph: '因',
    group: 'wonder',
    // 池里要投九转丹镇住因果（同上：可反复盖）
    // 池口封符、池底投丹（都可反复盖）
    cost: { stone: 200000, insight: 150000, pill: 200, talisman: 200, spiritArtifact: 10, spiritTreasure: 2, nineTurnPill: 5, spiritTalisman: 15 },
    priceRatio: 1.7,
    desc: '池中养着一缕前世因果，飞升时能多带走几分。',
    effects: { ratioAll: 0.25, ascendBonus: 0.25 },
    upkeep: { insight: 4 }, // 养一缕因果要耗感悟

    needs: { realm: 8, upgrades: ['karmaConcord'] },
  },
]

export const BUILDING_MAP = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]))

/** 分组标题与顺序 */
export const BUILDING_GROUPS = [
  { id: 'produce', name: '生产', hint: '稳定产出资源' },
  { id: 'home', name: '居所', hint: '决定弟子上限' },
  { id: 'store', name: '仓储', hint: '抬高资源上限' },
  { id: 'cultivate', name: '修行', hint: '感悟与士气' },
  { id: 'craft', name: '炼造', hint: '制作加成' },
  { id: 'incense', name: '香火', hint: '香火与人心' },
  { id: 'array', name: '阵道', hint: '御敌、锁灵' },
  { id: 'wonder', name: '奇观', hint: '改变宗门格局' },
]
