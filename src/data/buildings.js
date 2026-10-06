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
    cost: { qi: 12 },
    priceRatio: 1.15,
    desc: '在院里刻下一圈聚灵纹，游散的灵气自己就会往阵眼里淌。',
    effects: { prod: { qi: 0.3 } },
  },
  {
    id: 'lumberYard',
    name: '伐木场',
    glyph: '伐',
    group: 'produce',
    cost: { qi: 120, stone: 2 },
    priceRatio: 1.15,
    desc: '斧锯齐备，樵夫不用再徒手掰树。',
    effects: { prod: { wood: 0.12 }, ratio: { wood: 0.05 } },
    needs: { building: { id: 'hut', count: 1 } },
  },
  {
    id: 'mine',
    name: '玄铁矿',
    glyph: '矿',
    group: 'produce',
    cost: { wood: 200, qi: 300 },
    priceRatio: 1.15,
    desc: '顺着灵脉往下挖，便能挖到泛着寒光的玄铁。',
    effects: { prod: { ore: 0.05 } },
    needs: { building: { id: 'lumberYard', count: 1 } },
  },
  {
    id: 'herbGarden',
    name: '药圃',
    glyph: '圃',
    group: 'produce',
    cost: { wood: 150, qi: 250 },
    priceRatio: 1.15,
    desc: '按四时节气轮种，灵草自会一茬茬地长。',
    effects: { prod: { herb: 0.04 } },
    needs: { building: { id: 'lumberYard', count: 2 } },
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
    needs: { building: { id: 'spiritField', count: 10 } },
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

    needs: { building: { id: 'library', count: 1 } },
  },
  {
    id: 'beastGarden',
    name: '灵兽园',
    glyph: '兽',
    group: 'produce',
    cost: { wood: 2000, herb: 800, stone: 1500 },
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
    cost: { qi: 40, stone: 1 },
    priceRatio: 1.55,
    desc: '几根灵木搭起的屋子，能住两名弟子。宗门再小，也得有张床。',
    effects: { maxDisciples: 2, storage: { qi: 60 } },
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
    cost: { stone: 400, wood: 1200, ore: 200 },
    priceRatio: 1.6,
    desc: '青石铺地、灵纹引气，住二十名弟子也不觉拥挤。',
    effects: { maxDisciples: 20, storageAll: 400, morale: 4 },
    needs: { building: { id: 'logHouse', count: 5 } },
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
    cost: { wood: 120 },
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
    cost: { wood: 160, stone: 60 },
    priceRatio: 1.18,
    desc: '石基木梁，专存灵木、灵石、玄铁、灵草这些基础物资 —— 丹药符箓另有去处。',
    // 库房只存**基础物资**：灵木 / 灵石 / 玄铁 / 灵草。
    // 份额按「这种资源平时流得多快」分配（8 小时推演：灵木 72/秒、灵草 11、玄铁 7.5；
    // 灵石没有产出，靠凝气成石现印，按兑换后的灵气量折算）。
    // 灵气上限归「谷仓」，感悟归藏经阁/讲经堂/观星台，丹药/符箓/法器/香火归各自的专属建筑。
    effects: { storage: { wood: 360, stone: 240, ore: 120, herb: 150 } },
    needs: { building: { id: 'lumberYard', count: 3 } },
  },
  {
    id: 'depot',
    name: '石殿',
    glyph: '殿',
    group: 'store',
    cost: { stone: 1500, ore: 400 },
    priceRatio: 1.32,
    desc: '整座山腹都掏空了，堆到天荒地老也放得下。',
    effects: { storageAll: 1200 },
    needs: { building: { id: 'warehouse', count: 5 } },
  },
  {
    id: 'grotto',
    name: '洞天',
    glyph: '天',
    group: 'store',
    cost: { stone: 8000, insight: 4000, artifact: 10 },
    priceRatio: 1.5,
    desc: '一方小世界，装多少东西都不显挤，还自带静心之效。',
    effects: { storageAll: 8000, morale: 5 },
    needs: { upgrades: ['grottoArt'] },
  },

  // ============ 修行 ============
  {
    id: 'library',
    name: '藏经阁',
    glyph: '经',
    group: 'cultivate',
    cost: { wood: 150, qi: 200, herb: 25 },
    priceRatio: 1.18,
    desc: '典籍用灵草汁浸过的纸抄写，千年不蠹；悟道者在这里把念头熬成感悟。',
    effects: { prod: { insight: 0.008 }, ratio: { insight: 0.15 }, storage: { insight: 400 } },
    needs: { building: { id: 'hut', count: 1 } },
  },
  {
    id: 'academy',
    name: '讲经堂',
    glyph: '讲',
    group: 'cultivate',
    cost: { wood: 1200, stone: 300 },
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

    needs: { realm: 4 },
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
    cost: { wood: 1500, stone: 600, ore: 600 },
    priceRatio: 1.3,
    desc: '炼丹、炼器、画符的弟子在此互通有无，出手成色都高一截。',
    effects: { craftBonus: 0.1, ratioAll: 0.02 },
    upkeep: { wood: 0.8 }, // 百工齐开，木料像流水
    needs: { buildings: [{ id: 'forge', count: 1 }, { id: 'alchemyRoom', count: 1 }] },
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
    needs: { building: { id: 'hut', count: 3 } },
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
  },
  {
    id: 'ancestorHall',
    name: '祖师殿',
    glyph: '祖',
    group: 'incense',
    cost: { stone: 3000, insight: 1500, talisman: 5 },
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
    cost: { stone: 5000, insight: 3000, ore: 2000 },
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
    cost: { stone: 80000, ore: 20000, artifact: 50, insight: 50000 },
    priceRatio: 1.6,
    desc: '塔尖直插云海。站在塔顶的人，看得见飞升的路。',
    effects: { ratioAll: 0.15 },
    upkeep: { wood: 10, ore: 3 }, // 通天塔维持不易

    needs: { realm: 6 },
  },
  {
    id: 'karmaPool',
    name: '因果池',
    glyph: '因',
    group: 'wonder',
    cost: { stone: 200000, insight: 150000, pill: 200, talisman: 200 },
    priceRatio: 1.7,
    desc: '池中养着一缕前世因果，飞升时能多带走几分。',
    effects: { ratioAll: 0.25, ascendBonus: 0.25 },
    upkeep: { insight: 4 }, // 养一缕因果要耗感悟

    needs: { realm: 8 },
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
