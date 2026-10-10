/**
 * 建筑数据（对应猫国的 buildings）。
 *
 * 效果字段说明（都会按数量叠加）：
 *   prod        每秒固定产出，按“启用中的数量”叠加
 *   ratio       对某资源产出的百分比加成，按“启用中的数量”叠加
 *   ratioAll    对全部资源产出的百分比加成，按“启用中的数量”叠加
 *   storage     某资源的仓储上限，按“已建造数量”叠加
 *   storageAll  通用仓储，成品按层级折算，按“已建造数量”叠加
 *   maxDisciples 弟子上限
 *   habitability      宜居度（民心）加成
 *   consumeRatio 降低弟子灵气消耗
 *   craftBonus  制作产出加成（小数部分自动累积）
 *   craftBonusByResource 按成品区分的专业制作加成
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
    cost: { qi: 150, wood: 60 },
    priceRatio: 1.15,
    desc: '木架与料场齐备，樵夫采回的灵木在此归整，伐木更有章法。',
    effects: { ratio: { wood: 0.05 } },
    needs: { building: { id: 'hut', count: 1 } },
  },
  {
    id: 'quarry',
    name: '采矿场',
    glyph: '采',
    group: 'produce',
    // 实物建筑用材料计价：钎锤支架都是木匠活，不吃灵气；也不用自己的产出（矿石）当造价
    cost: { wood: 300 },
    priceRatio: 1.15,
    desc: '钎锤齐备，开放矿工职位；派遣弟子后才能从山体上凿下矿石，供垒墙、砌基与点石成灵。',
    effects: {},
    needs: { buildings: [{ id: 'lumberYard', count: 1 }, { id: 'granary', count: 1 }] },
  },
  {
    // 玄铁不再靠"再开一座矿"：矿石入炉、灵木作炭，烧出玄铁。
    // 于是玄铁从"挖出来的矿"变成"烧出来的料"——消耗矿石与灵木，产出玄铁。
    id: 'ironFurnace',
    name: '炼铁炉',
    glyph: '铁',
    group: 'produce',
    // 实物建筑不吃灵气：矿石砌炉、木料烧炭。
    // 造价必须落在**矿石基础上限 250** 之内：早期没有库房，矿石一到 250 就顶住，
    // 定 300 会让这座炉子永远盖不起来，而库房又卡在它的下游 —— 直接死锁（实测 6 小时起全停）。
    cost: { rock: 180, wood: 150 },
    priceRatio: 1.3,
    desc: '矿石入炉、灵木作炭。每座每秒耗矿石 0.3 与灵木 0.15，烧出玄铁 0.15（两石一木换一铁）。',
    effects: { prod: { ore: 0.15 } },
    upkeep: { rock: 0.3, wood: 0.15 },
    needs: { upgrades: ['prospectStudy'] },
  },
  {
    id: 'spiritQuarry',
    name: '灵石矿',
    glyph: '灵',
    group: 'produce',
    // 与炼铁炉同在"寻脉"这一条线上：矿石砌井口、木料搭支架（实物建筑不吃灵气，
    // 也不再用修炼硬通货充当砌石 —— 灵石留给凝灵与交易）
    cost: { wood: 700, rock: 100, ore: 80 },
    // 天然灵石由矿工采出，每座启用矿井叠加固定副产出，不放大矿石或玄铁。
    priceRatio: 1.55,
    desc: '岩层里嵌着天然灵石。每座启用的矿井，让每名矿工额外采出 0.0015 灵石/秒，多座相加；无人采矿时不产出。',
    effects: {},
    needs: { upgrades: ['prospectStudy'] },
  },
  {
    id: 'herbGarden',
    name: '药圃',
    glyph: '圃',
    group: 'produce',
    // 普通药圃用木料营造，灵石留给凝灵与交易。
    cost: { wood: 400, stone: 60 },
    priceRatio: 1.15,
    desc: '按四时节气轮种，开放采药人职位；派遣弟子照料和采收后才能取得灵草。',
    effects: {},
    needs: { upgrades: ['herbStudy'] },
  },
  {
    id: 'gatheringArray',
    name: '聚灵大阵',
    glyph: '叠',
    group: 'produce',
    // 阵基以矿石垒筑、少量灵石研粉描纹：硬通货只占零头，砌筑重活交给矿石
    cost: { rock: 400, stone: 150, insight: 300 },
    priceRatio: 1.4,
    desc: '在小阵之上再叠三重纹路，把方圆百里的灵气都攒进山门。',
    // 大阵攒的是灵气，但"攒住"这件事对整条灵气产线都成立：
    // 灵气本身 +8%；灵木与灵气分子（同为灵气所养）各 +3%；
    // 灵石（点石成灵）、灵液与灵晶（灵气凝成）走制作加成那一层。
    effects: {
      ratio: { qi: 0.08, wood: 0.03, qiParticle: 0.03 },
      craftBonusByResource: { stone: 0.05, spiritLiquid: 0.05, crystal: 0.05 },
    },
    upkeep: { qi: 1.2 }, // 大阵自己在引气，也在漏气

    // 先学会「观气」，才画得出大阵（修真 · 观气法）
    needs: { upgrades: ['qiGazing'] },
  },
  {
    id: 'crystalArray',
    name: '晶核凝炼阵',
    glyph: '晶',
    group: 'craft',
    cost: { crystal: 10, plank: 20, arrayBase: 4, ore: 500 },
    priceRatio: 1.4,
    unlockRatio: 0,
    desc: '晶核稳定凝聚边界，减少凝液与结晶损耗。每座提高灵液、灵晶制作产出各15%，并保存备用晶核。',
    effects: { craftBonusByResource: { spiritLiquid: 0.15, crystal: 0.15 }, storage: { crystal: 15 } },
    upkeep: { qi: 1 },
    needs: { realm: 5, upgrades: ['crystalTheory'] },
  },
  {
    id: 'beastGarden',
    name: '灵兽园',
    glyph: '兽',
    group: 'produce',
    cost: { wood: 6000, plank: 30, herb: 4000, stone: 6000 },
    priceRatio: 1.45,
    desc: '养几只懂事的灵兽，弟子照料时也能舒缓心神，提高宗门宜居度。',
    effects: { habitability: 2 },
    upkeep: { herb: 0.05 }, // 灵兽要喂

    needs: { upgrades: ['beastTaming'] },
  },

  // ============ 居所 ============
  {
    id: 'hut',
    name: '茅屋',
    glyph: '茅',
    group: 'home',
    cost: { qi: 80, wood: 20 },
    priceRatio: 1.55,
    desc: '能住两名弟子。本世第一间以灵气搭起临时居所，不需灵木；后续营造需要灵木与灵气。',
    effects: { maxDisciples: 2, storage: { qi: 60 } },
    needs: { building: { id: 'spiritField', count: 1 } },
  },
  {
    id: 'logHouse',
    name: '木屋',
    glyph: '木',
    group: 'home',
    cost: { wood: 300, stone: 20 },
    priceRatio: 1.55,
    desc: '木梁榫卯相扣，灵石嵌入梁柱引气，冬暖夏凉，可容六名弟子。',
    effects: { maxDisciples: 6, storage: { qi: 200, wood: 120 } },
    needs: { building: { id: 'hut', count: 5 } },
  },
  {
    id: 'mansion',
    name: '精舍',
    glyph: '舍',
    group: 'home',
    cost: { ironMortar: 8, wood: 1000, plank: 10, arrayBase: 4 },
    priceRatio: 1.6,
    desc: '玄铁混灵土筑舍、灵纹引气，十名弟子各有静修之处。',
    effects: { maxDisciples: 10, storage: { qi: 400, wood: 200 }, habitability: 4 },
    needs: { building: { id: 'logHouse', count: 5 }, upgrades: ['buildingCode'] },
  },
  {
    id: 'caveDwelling',
    name: '洞府',
    glyph: '洞',
    group: 'home',
    cost: { ironMortar: 20, arcaneGold: 6, plank: 20, crystal: 30, artifact: 15 },
    priceRatio: 1.7,
    desc: '玄铁混灵土固壁、玄金储灵，凿山为府，聚灵成池。二十四名弟子分室静修，吐纳有得。',
    effects: { maxDisciples: 24, storage: { qi: 3000, wood: 1200 }, habitability: 6 },
    needs: { upgrades: ['grottoArt'] },
  },

  // ============ 宜居 ============
  {
    id: 'livingCourt',
    name: '清风小院',
    glyph: '院',
    group: 'living',
    cost: { wood: 120, rock: 80 },
    priceRatio: 1.3,
    desc: '石径排水，木廊遮荫，同门劳作之后有处歇脚。每座宜居度 +4。',
    effects: { habitability: 4 },
    needs: { buildings: [{ id: 'lumberYard', count: 1 }, { id: 'quarry', count: 1 }] },
  },
  {
    id: 'communalHall',
    name: '膳养堂',
    glyph: '膳',
    group: 'living',
    cost: { wood: 300, rock: 120, herb: 100 },
    priceRatio: 1.32,
    desc: '分灶炊煮、药膳调养，弟子不必各自操持起居。每座宜居度 +8；灵气口粮照常消耗。',
    effects: { habitability: 8 },
    needs: { building: { id: 'herbGarden', count: 1 } },
  },
  {
    id: 'cleansingBath',
    name: '净身灵池',
    glyph: '浴',
    group: 'living',
    cost: { spiritMortar: 4, spiritLiquid: 4, plank: 4 },
    priceRatio: 1.35,
    desc: '混灵土蓄水，灵液温养池水，清洁起居也洗去疲惫。每座宜居度 +10。',
    effects: { habitability: 10 },
    needs: { realm: 5, upgrades: ['waterSanitation', 'spiritMortarArt'] },
  },
  {
    id: 'quietGarden',
    name: '清幽园林',
    glyph: '幽',
    group: 'living',
    cost: { ironMortar: 6, plank: 8, immortalHerb: 10 },
    priceRatio: 1.38,
    desc: '玄铁混灵土隔绝喧声，灵木与仙草分庭栽植，洞府之间也有清幽之地。每座宜居度 +14。',
    effects: { habitability: 14 },
    needs: { realm: 6, upgrades: ['gardenDesign', 'ironMortarArt'] },
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
    effects: { storage: { qi: 800, wood: 300, herb: 120 } },
    needs: { building: { id: 'spiritField', count: 2 } },
  },  {
    // 早期补充仓储：在库房开放前缓解原料与灵石仓容，每项增量低于库房。
    // 库房承担主要扩仓，料场的较高涨价率也避免长期替代库房。
    id: 'materialYard',
    name: '料场',
    glyph: '料',
    group: 'store',
    cost: { wood: 150, rock: 200 },
    priceRatio: 1.35,
    desc: '平整出一片料场，原料按堆码放，另设石匣存放灵石。用于早期补充仓储，大量囤料需建库房。',
    effects: { storage: { rock: 500, ore: 150, wood: 400, herb: 200, stone: 150 } },
    needs: { upgrades: ['quarryArt'] },
  },
  {
    id: 'warehouse',
    name: '库房',
    glyph: '库',
    group: 'store',
    // 石砌墙基、铁箍木架：矿石承重，灵石不掺和
    cost: { wood: 200, rock: 150, ore: 60 },
    priceRatio: 1.18,
    desc: '石基铁箍木架，专存灵木、灵石、矿石、玄铁、灵草这些基础物资 —— 丹药符箓另有去处。',
    // 库房只存**基础物资**：灵木 / 灵石 / 矿石 / 玄铁 / 灵草。
    // 份额按「这种资源平时流得多快」分配（8 小时推演：灵木 72/秒、灵草 11、玄铁 7.5；
    // 灵石没有产出，靠点石成灵现印，按兑换后的灵气量折算）。
    // 灵气上限归「谷仓」，灵机归藏经阁/讲经堂/观星台，丹药/符箓/法器/香火归各自的专属建筑。
    effects: { storage: { wood: 1000, stone: 800, rock: 600, ore: 400, herb: 500 } },
    needs: { upgrades: ['earthArt'] },
  },
  {
    id: 'depot',
    name: '材料库',
    glyph: '殿',
    group: 'store',
    cost: { plank: 12, ore: 700, steel: 4 },
    priceRatio: 1.25,
    desc: '石殿分设料架与阵材格，专存营造原料、木板、玄钢、阵基与后期复合建材。',
    effects: { storage: { wood: 10000, stone: 8000, rock: 6000, ore: 6000, plank: 1500, steel: 120, arrayBase: 100, spiritMortar: 200, ironMortar: 100, mithril: 60, arcaneGold: 40, crystalSilver: 40 } },
    needs: { building: { id: 'warehouse', count: 3 }, upgrades: ['earthEssence'] },
  },
  {
    // 中场仓储：填「材料库（金丹）↔ 洞天（合体）」之间的空档。
    // 洞天要合体才开，而炼虚/合体破境要一大笔灵气与玄钢，光靠谷仓/材料库顶不住。
    id: 'mysticVault',
    name: '玄库',
    glyph: '玄',
    group: 'store',
    cost: { spiritMortar: 20, stone: 2000, plank: 15, ore: 500, insight: 2000 },
    priceRatio: 1.3,
    desc: '混灵土固基、铁箍封边，专存大宗营造料与铸造件，兼收灵气 —— 洞天之前的主力仓。',
    effects: {
      storage: { qi: 15000, wood: 15000, rock: 15000, stone: 15000, ore: 15000, herb: 8000, steel: 400, plank: 1500, arrayBase: 200, talisman: 300, artifact: 300, spiritMortar: 600, ironMortar: 300, mithril: 120, arcaneGold: 80, crystalSilver: 80 },
    },
    needs: { realm: 5, upgrades: ['earthEssence'] },
  },
  {
    id: 'medicineVault',
    name: '药藏',
    glyph: '药',
    group: 'store',
    cost: { spiritMortar: 8, plank: 6, arrayBase: 2, herb: 500 },
    priceRatio: 1.22,
    desc: '药架通风、玉匣封灵，灵草与丹药分格收存。普通药材多存，仙草与九转丹少量精藏。',
    effects: { storage: { herb: 2000, immortalHerb: 80, pill: 1000, nineTurnPill: 100 } },
    // 金丹重排：仙草随凝链后移到元婴，药藏同档开放（金丹档的仓储由材料库前移承接）
    needs: { realm: 5, upgrades: ['alchemyArt', 'woodworking'] },
  },
  {
    id: 'arcaneVault',
    name: '法藏',
    glyph: '藏',
    group: 'store',
    cost: { plank: 12, arrayBase: 2, ore: 500 },
    priceRatio: 1.22,
    desc: '符匣与器架各有禁制，符箓、法器及其进阶成品在此收存，灵液另设玉瓶，灵晶另设晶格，灵宝独占小龛。',
    effects: { storage: { talisman: 1000, spiritTalisman: 200, artifact: 600, spiritArtifact: 100, spiritTreasure: 10, spiritLiquid: 120, crystal: 150 } },
    needs: { realm: 4, upgrades: ['forgeArt', 'talismanArt'] },
  },
  {
    id: 'grotto',
    name: '洞天',
    glyph: '天',
    group: 'store',
    // 洞天以复合建材承重、玄金储灵，避免继续堆基础木板与玄钢。
    cost: { ironMortar: 40, arcaneGold: 10, stone: 12000, insight: 10000, artifact: 30 },
    priceRatio: 1.35,
    desc: '洞天聚气、存放大宗营造原料并留住修行所得，兼有少量通用仓储；大批成品仍需专藏。',
    effects: { storageAll: 12000, storage: { insight: 15000, qi: 75000, wood: 75000, stone: 75000, rock: 75000, ore: 75000, faith: 75000, qiParticle: 75000, yangParticle: 75000, yinParticle: 75000, qiEnergy: 20000 }, habitability: 5 },
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
    desc: '一阁典籍，是宗门最早的学问。弟子在此抄经静坐，念头慢慢熬成灵机。',
    effects: { ratio: { insight: 0.15 }, storage: { insight: 200 } },
    needs: { building: { id: 'spiritField', count: 3 } },
  },
  {
    id: 'academy',
    name: '讲经堂',
    glyph: '讲',
    group: 'cultivate',
    cost: { arrayBase: 4, plank: 25 },
    priceRatio: 1.25,
    desc: '长老登坛讲经，一人讲、百人悟。',
    effects: { ratio: { insight: 0.35 }, storage: { insight: 800 } },
    needs: { upgrades: ['preachArt'] },
    unlockRatio: 0,
  },
  {
    id: 'observatory',
    name: '观星台',
    glyph: '星',
    group: 'cultivate',
    cost: { crystal: 50, plank: 30, ore: 1000 },
    priceRatio: 1.3,
    desc: '夜观天象，把满天星斗读成一部功法。',
    // 后期改"比例 + 定额并存"：比例让仓容随产业一起长，定额保证「首座洞天/通天塔」这类
    // 下游花费仍然买得起（早先只留比例时，渡劫期破境 200000 灵机与通天塔 250000 直接越界）。
    // 灵机仓容分工：**建筑只给定额（压低）**，百分比一律由技艺提供（见 techniques.js 的叠匣术等）。
    effects: { ratio: { insight: 0.5 }, storage: { insight: 3000 } },
    needs: { upgrades: ['astrologyArt'] },
    unlockRatio: 0,
  },
  {
    id: 'meditationPool',
    name: '静心池',
    glyph: '静',
    group: 'cultivate',
    cost: { spiritMortar: 6, herb: 500, immortalHerb: 10, arrayBase: 2 },
    priceRatio: 1.3,
    desc: '池水照心，弟子泡一泡，脾气就小了一圈。',
    effects: { habitability: 6 },
    needs: { upgrades: ['calmMind'] },
    unlockRatio: 0,
  },
  {
    id: 'trialTower',
    name: '试炼塔',
    glyph: '塔',
    group: 'cultivate',
    cost: { ironMortar: 12, steel: 8, arrayBase: 6, artifact: 15 },
    priceRatio: 1.35,
    desc: '层层有险，闯过者心境大进，也练出了辨矿与参悟的本领。灵机产出 +15%，玄铁产出 +10%。',
    effects: { ratio: { insight: 0.15, ore: 0.1 }, habitability: 3 },
    upkeep: { ore: 0.6 }, // 试炼要修机关、耗玄铁

    // 试炼法挂在营造法式（realm 6）下，境界标注与实际门槛对齐
    needs: { realm: 6, upgrades: ['trialArt'] },
  },

  // ============ 炼造 ============
  {
    id: 'alchemyRoom',
    name: '炼丹房',
    glyph: '丹',
    group: 'craft',
    // 不再吃灵草：灵草是炼丹房要消耗的原料，建它时先要 200 灵草等于先有鸡还是先有蛋。
    cost: { wood: 600, stone: 150, ore: 60 },
    priceRatio: 1.25,
    desc: '三足鼎立、文武火候，灵草在这里变成丹药。',
    effects: { craftBonusByResource: { pill: 0.05, nineTurnPill: 0.05 }, ratio: { herb: 0.1 }, storage: { pill: 200 } },
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
    effects: { craftBonusByResource: { artifact: 0.05, steel: 0.05, spiritArtifact: 0.05, spiritTreasure: 0.05 }, ratio: { ore: 0.1 }, storage: { artifact: 120 } },
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
    desc: '以灵木与金属为载体，刻纹注灵，制成符箓、灵符与阵法构件。',
    effects: { craftBonusByResource: { talisman: 0.05, spiritTalisman: 0.05 }, storage: { talisman: 200 } },
    upkeep: { wood: 0.2 }, // 抄符耗纸
    needs: { upgrades: ['talismanArt'] },
  },
  {
    id: 'workshop',
    name: '百工坊',
    glyph: '工',
    group: 'craft',
    cost: { wood: 150, rock: 100 },
    priceRatio: 1.3,
    desc: '灵木搭棚、矿石垒台，采木采矿之后即可开张。匠人在此整料、修具并交流工艺，每座制作产出 +6%（可叠加）。',
    // 它**只是加成建筑**：不锁任何配方或条目（数据里没有一条 needs 指向它），
    // 效果也只留与制作有关的：制作产出 +6%/座、木板上限 +300/座。
    // 无维护费，建成后即可持续提供制作增益。
    effects: { craftBonus: 0.06, storage: { plank: 300 } },
    needs: { buildings: [{ id: 'lumberYard', count: 1 }, { id: 'quarry', count: 1 }] },
  },

  // ============ 香火 ============
  {
    id: 'gate',
    name: '山门',
    glyph: '门',
    group: 'incense',
    cost: { wood: 600, ore: 40 },
    priceRatio: 1.3,
    desc: '山门一立，香客便知此处有仙。开放香使职位，派遣弟子接待香客才能收取香火。',
    effects: { storage: { faith: 80 } },
    needs: { upgrades: ['incenseVow'], building: { id: 'hut', count: 3 } },
  },
  {
    id: 'incenseCauldron',
    name: '香火鼎',
    glyph: '鼎',
    group: 'incense',
    cost: { ore: 300, plank: 4 },
    priceRatio: 1.3,
    desc: '青铜大鼎终日不熄，把念力一炉炉炼成香火。',
    effects: { ratio: { faith: 0.3 }, habitability: 3, storage: { faith: 120 } },
    upkeep: { wood: 0.12 }, // 鼎里得一直添香柴

    needs: { building: { id: 'gate', count: 2 }, upgrades: ['incenseStudy'] },
  },
  {
    id: 'ancestorHall',
    name: '祖师殿',
    glyph: '祖',
    group: 'incense',
    cost: { ironMortar: 20, stone: 3000, plank: 10, insight: 6000, talisman: 25 },
    priceRatio: 1.35,
    desc: '历代祖师的牌位在此，弟子路过都要收一收心思。',
    effects: { ratio: { faith: 0.5, insight: 0.1 }, habitability: 8 },
    needs: { upgrades: ['ancestorArt'] },
  },

  // ============ 阵道 ============
  {
    id: 'mountainArray',
    name: '护山大阵',
    glyph: '护',
    group: 'array',
    // 护山大阵压着山门气脉，每一角都要镇符（可反复盖）
    cost: { ironMortar: 20, mithril: 5, crystal: 60, arrayBase: 15, spiritTalisman: 10 },
    priceRatio: 1.45,
    desc: '阵纹沿山脊铺开，妖兽撞上来只会留下几道白印。',
    effects: { disasterGuard: 0.15, habitability: 2 },
    upkeep: { qi: 3 }, // 护山阵常年引山间灵气

    needs: { upgrades: ['arrayBasics'] },
  },
  {
    id: 'spiritLockArray',
    name: '锁灵阵',
    glyph: '锁',
    group: 'array',
    cost: { mithril: 12, arcaneGold: 4, crystal: 80, arrayBase: 12, spiritTalisman: 10 },
    priceRatio: 1.5,
    desc: '把弟子吐纳时逸散的灵气锁回阵中，一丝也不浪费。',
    effects: { consumeRatio: 0.03, ratio: { qi: 0.15 } },
    needs: { upgrades: ['arrayMastery'] },
  },

  // ============ 奇观 ============
  {
    id: 'heavenTower',
    name: '通天塔',
    glyph: '通',
    group: 'wonder',
    // 复合结构承重，玄金储灵、晶银控气，灵符镇住高塔气机。
    cost: { ironMortar: 100, arcaneGold: 20, crystalSilver: 10, stone: 60000, artifact: 100, insight: 60000, spiritTalisman: 100 },
    priceRatio: 1.6,
    desc: '塔尖直插云海，聚气存念并镇住灵气分子与正负灵子，兼有少量通用仓储。站在塔顶的人，看得见飞升的路。',
    effects: { ratio: { qi: 0.3, insight: 0.3, qiParticle: 0.15, yangParticle: 0.15, yinParticle: 0.15 }, storageAll: 25000, storage: { insight: 40000, qi: 150000, wood: 150000, stone: 150000, rock: 150000, ore: 150000, faith: 150000, qiParticle: 150000, yangParticle: 150000, yinParticle: 150000, qiEnergy: 100000 } },
    upkeep: { wood: 10, ore: 3 }, // 通天塔维持不易

    // 塔院图在 realm 9，境界标注与实际门槛对齐
    needs: { realm: 9, upgrades: ['towerPlan'] },
  },
  {
    id: 'splitArray',
    name: '分灵阵',
    glyph: '分',
    group: 'wonder',
    // 阵要一直烧灵气：把灵气离析成灵气分子，是粒子链的第一步（灵气分子 → 偏极解离 → 正负灵子 → 湮灭）
    // 首座承担大乘破境的产业入门，容量由元婴玄库承接；重复扩建仍按比例涨价。
    cost: { arcaneGold: 8, stone: 12000, insight: 16000, artifact: 40, arrayBase: 8 },
    priceRatio: 1.5,
    desc: '阵法从灵气中离析出相抱的灵气分子 —— 拆得越久，越像在跟天地借火。',
    effects: { prod: { qiParticle: 0.04 } },
    upkeep: { qi: 8 }, // 拆气是要耗气的：这是本作最大的灵气去处
    needs: { upgrades: ['particleTheory'], realm: 8 },
  },
  {
    id: 'polarizeArray',
    name: '偏极阵',
    glyph: '偏',
    group: 'wonder',
    // 粒子链第二步：输入解离能，处理分子；一对一供料仅指基础数据的归一化流量。
    cost: { arcaneGold: 12, mithril: 8, stone: 20000, insight: 24000, artifact: 40, arrayBase: 10, qiParticle: 10 },
    priceRatio: 1.5,
    desc: '输入灵气作为解离能，打开分子束缚；双极场让正负灵子分流，避免重新复合。',
    effects: { prod: { yangParticle: 0.02, yinParticle: 0.02 } },
    upkeep: { qiParticle: 0.04, qi: 1 }, // 物料与解离供能分别结算
    needs: { upgrades: ['yinyangSplit'], realm: 9 },
  },
  {
    id: 'annihilationFurnace',
    name: '湮灭炉',
    glyph: '湮',
    group: 'wonder',
    cost: { arcaneGold: 12, crystalSilver: 6, stone: 30000, artifact: 40, spiritArtifact: 6 },
    priceRatio: 1.6,
    desc: '炉心控制供料、相位与场形，让正负灵子成对湮灭，回收灵能并排散废热；断料即停。',
    effects: { prod: { qiEnergy: 0.06 } },
    upkeep: { yangParticle: 0.02, yinParticle: 0.02 }, // 成对吃掉正负灵子
    needs: { upgrades: ['annihilationArt'], realm: 9 },
  },
  {
    id: 'karmaPool',
    name: '因果池',
    glyph: '因',
    group: 'wonder',
    // 复合池壁与晶银阵眼承托因果，九转丹与灵符持续镇守。
    cost: { ironMortar: 150, crystalSilver: 20, stone: 300000, insight: 140000, pill: 1000, spiritArtifact: 25, spiritTreasure: 10, nineTurnPill: 25, spiritTalisman: 50 },
    priceRatio: 1.7,
    desc: '池中养着一缕前世因果，飞升时能多带走几分。',
    effects: { ratio: { insight: 0.5, faith: 0.5, qiEnergy: 0.25 }, ascendBonus: 0.25 },
    upkeep: { insight: 4 }, // 养一缕因果要耗灵机

    needs: { realm: 8, upgrades: ['karmaConcord'] },
  },
]

export const BUILDING_MAP = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]))

/** 宗门列表的发展顺序：基础营造先出现，后续按产业与境界阶段排列。 */
export const BUILDING_DISPLAY_ORDER = [
  'spiritField', 'hut', 'lumberYard', 'quarry', 'granary', 'workshop', 'livingCourt', 'library', 'logHouse',
  'materialYard', 'ironFurnace', 'spiritQuarry', 'herbGarden', 'warehouse', 'gatheringArray',
  'communalHall', 'alchemyRoom', 'forge', 'talismanHall', 'gate',
  'crystalArray', 'academy', 'cleansingBath', 'meditationPool', 'medicineVault', 'arcaneVault', 'incenseCauldron',
  'depot', 'mysticVault', 'mansion', 'observatory', 'trialTower', 'ancestorHall', 'mountainArray',
  'quietGarden', 'beastGarden', 'caveDwelling', 'grotto', 'spiritLockArray',
  'heavenTower', 'splitArray', 'polarizeArray', 'annihilationFurnace', 'karmaPool',
]

/** 分组标题与顺序 */
export const BUILDING_GROUPS = [
  { id: 'produce', name: '生产', hint: '稳定产出资源' },
  { id: 'home', name: '居所', hint: '决定弟子上限' },
  { id: 'living', name: '宜居', hint: '改善起居，维持宜居度富余' },
  { id: 'store', name: '仓储', hint: '抬高资源上限' },
  { id: 'cultivate', name: '修行', hint: '灵机与宜居度' },
  { id: 'craft', name: '炼造', hint: '制作加成' },
  { id: 'incense', name: '香火', hint: '香火与人心' },
  { id: 'array', name: '阵道', hint: '御敌、锁灵' },
  { id: 'wonder', name: '奇观', hint: '改变宗门格局' },
]
