/**
 * 修真 —— 研究层，对标猫国的「科学」（science.js）。
 *
 * 2026-10 两线重组（方案与决策见 docs/RESEARCH.md）：
 *   主线「灵气研究」按境界分五章 —— 观气 → 凝聚 → 调控 → 拆解 → 归源；
 *   灵气的形态阶梯（气 → 液 → 晶 → 灵气分子 → 正负灵子 → 灵能，设定见 docs/SPIRIT-ENERGY.md）
 *   对应每一章的研究问题。
 *   辅线「材料研究」按材料族分「原理 → 工艺 → 精研」三层，承接来源、配方与专业增益，
 *   其中 11 个工艺/精研节点自技艺页迁入（id 不变，存档兼容）。
 *   制度、招募、离线等经营节点收进「宗门经营」组。
 *
 * 与 /技艺·法宝/ 的分工：
 *   修真（本文件）：两条研究线 + 宗门经营；主线与经营节点仍只做解锁与系统开关，
 *                   材料研究线携带专业制作与产业增益
 *   技艺           ：通用产量、仓储、感悟等增益；法宝（kind: 'treasure'）由修真解锁后炼成
 *
 * 两者共用「感悟」货币与已学记录，也都用 `needs` 做门禁；`needs.upgrades` 可跨页引用。
 */
import { TECHNIQUES } from './techniques.js'

export const CULTIVATION = [
  // ============ 主线 · 灵气研究：灵气的科学史 ============

  // ---------- Ⅰ 观气（凡体→筑基）：灵气是什么、在哪、怎么聚 ----------
  {
    id: 'qiOrigin',
    name: '灵源考',
    glyph: '源',
    cost: { insight: 60 },
    desc: '考究灵气从何而来、如何凝结 —— 懂了地脉走向，才谈得上打井引气。',
    effects: { unlockBuildings: ['spiritVein'] },
    note: '解锁建筑：灵脉井',
    effectDesc: '因此知道该在哪里下锄：灵脉井引的是地脉之气。',
    needs: { building: { id: 'library', count: 2 } },
  },
  {
    id: 'qiGazing',
    name: '观气法',
    glyph: '观',
    cost: { insight: 150, wood: 300, stone: 60 },
    desc: '静坐三日，看清明堂之上那一缕白气的来路与去向。已有弟子嘀咕：这气莫不是一粒一粒凑成的？——只是谁也拿不出凭据。聚灵之理自此可画。',
    effects: { unlockBuildings: ['gatheringArray'] },
    note: '解锁建筑：聚灵大阵',
    effectDesc: '因此看得懂气脉走向：聚灵大阵画得出来了。',
    needs: { upgrades: ['qiOrigin'] },
  },
  {
    id: 'condenseArt',
    name: '凝灵诀',
    glyph: '凝',
    cost: { insight: 120, wood: 150, stone: 20 },
    desc: '观清气脉后，掌握向石材稳定灌灵的方法。节气一至，将满仓盈余灵气灌入备好的石材，制成灵石。',
    effectDesc: '每逢节气，灵气满仓且石材充足时自动制作灵石；缺石材则暂停，遵守库存目标与材料保留量。',
    effects: { autoCondense: true },
    needs: { upgrades: ['qiGazing'], building: { id: 'quarry', count: 1 } },
  },
  {
    id: 'breakthroughArt',
    name: '破境心法',
    glyph: '破',
    cost: { insight: 2000, stone: 1500, pill: 30 },
    desc: '破境时少走弯路，花费降低 15%。',
    effectDesc: '因此破境时省下一成半材料，冲关更从容。',
    effects: { breakthroughDiscount: 0.15 },
    needs: { realm: 3, upgrades: ['qiGazing', 'alchemyArt'] },
  },

  // ---------- Ⅱ 凝聚（筑基→金丹）：怎么把灵气存住、存好 ----------
  {
    id: 'liquidArt',
    name: '凝液法',
    glyph: '液',
    cost: { insight: 220, wood: 300, stone: 40 },
    desc: '气可凝为石，也可凝为液 —— 灵液压在玉瓶里，十年不散。',
    effectDesc: '因此掌握《凝气成液》：灵气自此有了存得住的形态。',
    effects: { unlockBuildings: [] },
    note: '开启配方：凝气成液',
    needs: { realm: 3, upgrades: ['condenseArt'] },
  },
  {
    id: 'crystalTheory',
    name: '凝晶原理',
    glyph: '晶',
    cost: { insight: 300 },
    desc: '金丹气机已稳，开始研究用符纹约束灵液，凝成可长期保存的晶核。',
    effectDesc: '开启凝晶工艺与晶核聚灵阵；学会加工灵晶后才能完成建设。',
    effects: { unlockBuildings: ['crystalArray'] },
    needs: { realm: 4, upgrades: ['qiGazing', 'talismanArt', 'liquidArt'] },
  },

  // ---------- Ⅲ 调控（金丹→合体）：怎么引导、约束灵气 ----------
  {
    id: 'astrologyArt',
    name: '观星术',
    glyph: '星',
    cost: { insight: 450, talisman: 6 },
    desc: '讲经讲到尽头，就得抬头看天。解锁观星台。',
    effectDesc: '因此搭得起观星台，从星象里读出资源的走势。',
    effects: { unlockBuildings: ['observatory'] },
    needs: { upgrades: ['preachArt'], realm: 6 },
  },
  {
    id: 'hourArt',
    name: '候时法',
    glyph: '候',
    cost: { insight: 1800, stone: 1200, talisman: 5 },
    desc: '破境要挑时候：灵气潮汐、月相、弟子的心神都有节律。',
    effectDesc: '因此破境再省一成材料 —— 同一炉丹，用在刀刃上。',
    effects: { breakthroughDiscount: 0.1 },
    note: '效果：破境花费 −10%',
    // 前置营造法式实际到化神才开，这里把境界标注与实际门槛对齐（旧档写元婴）
    needs: { upgrades: ['buildingCode'], realm: 6 },
  },
  {
    id: 'arrayBasics',
    name: '阵法初解',
    glyph: '阵',
    cost: { insight: 1500, talisman: 12, artifact: 3 },
    desc: '观星知势，方能布阵。解锁护山大阵。',
    effectDesc: '因此布得起护山大阵，天灾来时损失大减。',
    effects: { unlockBuildings: ['mountainArray'] },
    needs: { upgrades: ['astrologyArt'], building: { id: 'academy', count: 2 }, realm: 7 },
  },
  {
    id: 'arrayMastery',
    name: '阵道精通',
    glyph: '精',
    cost: { insight: 9000, talisman: 25, spiritTalisman: 4 },
    desc: '一草一木皆可为阵。解锁锁灵阵。',
    effectDesc: '因此锁得住一山之灵：锁灵阵把灵气囤得更紧。',
    effects: { unlockBuildings: ['spiritLockArray'] },
    needs: { upgrades: ['arrayBasics'], building: { id: 'mountainArray', count: 3 }, realm: 8 },
  },
  // 自技艺页迁入：阵道精通的成果兑现，主线第Ⅲ章的增益出口
  {
    id: 'arrayRefine',
    name: '阵纹精研',
    glyph: '纹',
    cost: { insight: 3600, talisman: 45, artifact: 20, crystal: 20 },
    desc: '一横一竖都有讲究。灵气产出 +60%，阵基、灵晶与灵符制作产出 +30%，符箓制作产出 +20%。',
    effects: { ratio: { qi: 0.6 }, craftBonusByResource: { arrayBase: 0.3, crystal: 0.3, spiritTalisman: 0.3, talisman: 0.2 } },
    needs: { upgrades: ['arrayMastery'] },
  },

  // ---------- Ⅳ 拆解（合体→大乘）：灵气由什么构成 ----------
  {
    id: 'particleTheory',
    name: '灵子论',
    glyph: '子',
    cost: { insight: 45000, crystal: 40, spiritArtifact: 4 },
    desc: '辨明灵气的分子组成：正负灵子束缚成稳定分子。结丹时内观到的灵荷，如今可以在宗门设施中重复观测、连续离析。',
    effectDesc: '因此布得起分灵阵：把灵气离析成游离的灵气分子，攒着等下一步解离。',
    effects: { unlockBuildings: ['splitArray'] },
    note: '解锁建筑：分灵阵',
    needs: { upgrades: ['arrayMastery'], realm: 8 },
  },
  {
    id: 'mindSeal',
    name: '心印法',
    glyph: '印',
    cost: { insight: 15000, pill: 120, herb: 6000 },
    desc: '以心印心，不必言语 —— 长老一个念头，弟子便知该如何行气。',
    effectDesc: '因此破境再省一成半材料。',
    effects: { breakthroughDiscount: 0.15 },
    note: '效果：破境花费 −15%',
    needs: { upgrades: ['hourArt'], realm: 8 },
  },
  {
    id: 'greatVehicleSeal',
    name: '大乘心印',
    glyph: '乘',
    cost: { insight: 40000, artifact: 60, talisman: 120, plank: 40, spiritTreasure: 1 },
    desc: '把前四境的心法合为一印，才有资格谈大乘。',
    effectDesc: '因此参悟得出《大乘心经》—— 全局产出再上一阶。',
    effects: { unlockBuildings: [] },
    note: '开启参悟：大乘心经',
    needs: { upgrades: ['mindSeal'], realm: 9 },
  },
  // 自技艺页迁入：大乘心印的成果兑现，主线第Ⅳ章的增益出口
  {
    id: 'mahayanaArt',
    name: '大乘心经',
    glyph: '经',
    cost: { insight: 9000, artifact: 60, talisman: 60, pill: 60, faith: 6000 },
    desc: '以心养药，以愿证道。感悟与香火产出 +120%，灵草产出 +80%，仙草与九转丹制作产出 +50%，灵宝制作产出 +30%。',
    effects: { ratio: { insight: 1.2, faith: 1.2, herb: 0.8 }, craftBonusByResource: { immortalHerb: 0.5, nineTurnPill: 0.5, spiritTreasure: 0.3 } },
    // 前置大乘心印到大乘才开，境界标注与实际门槛对齐（旧档写合体）
    needs: { realm: 9, upgrades: ['greatVehicleSeal'] },
  },
  {
    id: 'yinyangSplit',
    name: '阴阳分灵',
    glyph: '阴',
    cost: { insight: 80000, stone: 30000, spiritArtifact: 6 },
    desc: '输入解离能打开分子束缚，以双极场维持分流，避免正负灵子重新复合。',
    effectDesc: '因此布得起偏极阵 —— 把灵气分子解离成正灵子与负灵子。',
    effects: { unlockBuildings: ['polarizeArray'] },
    note: '解锁建筑：偏极阵',
    needs: { upgrades: ['arrayMastery', 'particleTheory'], realm: 9 },
  },
  {
    id: 'annihilationArt',
    name: '湮灭法',
    glyph: '湮',
    // 研究花费同样要落在可达上限内：早先写 30 万感悟，而参照玩家的感悟上限约 26.8 万，
    // 于是《湮灭法》永远参悟不了 —— 分灵阵盖了、粒子堆着、灵能始终为 0。
    cost: { insight: 60000, nineTurnPill: 20, spiritTalisman: 20 },
    desc: '控制供料、相位与场形，让正负灵子越过湮灭门槛，成对消耗为可回收的灵能，并排出废热。',
    effectDesc: '因此铸得起湮灭炉：普通碰撞未必湮灭，炉心的受控场形才使转换持续发生。',
    effects: { unlockBuildings: ['annihilationFurnace'] },
    note: '解锁建筑：湮灭炉',
    needs: { upgrades: ['yinyangSplit'], realm: 9 },
  },
  {
    id: 'energyApplication',
    name: '灵能应用',
    glyph: '用',
    cost: { insight: 65000, crystal: 30, spiritArtifact: 8 },
    desc: '湮灭炉里翻出的能量，不只用来催产 —— 引它入坊，凝石解板的火候都稳了。',
    effectDesc: '因此灵能同时提高灵石（点石成灵）与木板的制作收益。',
    effects: { energyCraft: true },
    note: '效果：灵能加成覆盖灵石与木板的全部制作配方',
    needs: { upgrades: ['annihilationArt'], realm: 9 },
  },

  // ---------- Ⅴ 归源（大乘→渡劫）：灵气与因果、飞升 ----------
  {
    id: 'karmaSense',
    name: '因果通感',
    glyph: '感',
    cost: { insight: 50000, stone: 40000, pill: 100 },
    desc: '看清因果的人，飞升时能多带走三成仙缘。',
    effectDesc: '因此看得见因果：下一次飞升带走的仙缘更多。',
    effects: { ascendBonus: 0.3, karmaRatio: 0.005 },
    needs: { realm: 9 },
  },
  {
    id: 'towerPlan',
    name: '塔院图',
    glyph: '塔',
    cost: { insight: 60000, stone: 80000, artifact: 30, plank: 60, steel: 15 },
    desc: '塔不怕高，怕的是接不住天风。图样定下九重院墙，塔才立得稳。',
    effectDesc: '因此动得了通天塔的工：塔尖直插云海，看得见飞升的路。',
    effects: { unlockBuildings: ['heavenTower'] },
    note: '解锁建筑：通天塔',
    needs: { upgrades: ['arrayMastery'], realm: 9 },
  },
  {
    id: 'karmaConcord',
    name: '因果参同契',
    glyph: '契',
    // 进阶品让"最后一步"有了自己的门槛：九转丹与灵符只有后期才炼得出来
    cost: {
      insight: 200000,
      talisman: 200,
      pill: 300,
      faith: 20000,
      nineTurnPill: 40,
      spiritTalisman: 25,
      spiritTreasure: 2,
    },
    desc: '把历世的因果摊开对照，才知道哪些是债、哪些是缘。',
    effectDesc: '因此开得出因果池，也看得清下一次飞升能带走多少仙缘。',
    effects: { unlockBuildings: ['karmaPool'] },
    note: '解锁建筑：因果池',
    needs: { upgrades: ['karmaSense', 'towerPlan'], realm: 10 },
  },

  // ============ 辅线 · 材料研究：按材料族分「原理 → 工艺 → 精研」 ============

  // ---------- 草木族 ----------
  {
    id: 'herbStudy',
    name: '灵植术',
    glyph: '植',
    cost: { insight: 40, wood: 120 },
    desc: '掌握灌灵之法后，考察草木如何吸纳灵气，辨识药性，才能开圃种药。',
    effects: { unlockBuildings: ['herbGarden'] },
    note: '解锁建筑：药圃',
    effectDesc: '因此敢开圃种药：有了稳定的灵草来源。',
    needs: { upgrades: ['condenseArt'], building: { id: 'library', count: 1 } },
  },
  // 自技艺页迁入（工艺）：木料链第二环，开放刨木成板
  {
    id: 'woodworking',
    name: '木作器械',
    glyph: '作',
    cost: { insight: 120, wood: 400, ore: 80 },
    desc: '刨、凿、墨斗、圆规置办齐了，从此能解板。木板制作产出 +5%，开启《刨木成板》。',
    effects: { craftBonusByResource: { plank: 0.05 } },
    // 它是木料链的第二环：伐木场出原木 → 器械解板 → 木板才是百工坊的料。
    // 所以它**不能**要百工坊，也不能要木板（否则与"百工坊用木板下料"闭环）。
    needs: { upgrades: ['prospectStudy'], buildings: [{ id: 'lumberYard', count: 2 }, { id: 'mine', count: 1 }] },
  },
  // 自技艺页迁入（工艺）
  {
    id: 'waterworkshop',
    name: '流水作坊',
    glyph: '流',
    cost: { insight: 900, plank: 30, ore: 600 },
    desc: '引山泉推水轮，锯木成板昼夜不停。木板与阵基制作产出 +8%。',
    effects: { craftBonusByResource: { plank: 0.08, arrayBase: 0.08 } },
    needs: { upgrades: ['woodworking'] },
  },
  // 自技艺页迁入（精研）：化神产业强化之一
  {
    id: 'spiritSaw',
    name: '灵纹锯阵',
    glyph: '锯',
    cost: { insight: 4500, plank: 80, steel: 20, crystal: 15 },
    desc: '以灵纹驱动锯阵，扩建林场并精切板材。灵木产出 +95%，木板制作产出 +50%。',
    effects: { ratio: { wood: 0.95 }, craftBonusByResource: { plank: 0.5 } },
    needs: { realm: 6, upgrades: ['timberCraft', 'waterworkshop'] },
  },
  // 自技艺页迁入（精研）：化神产业强化之一
  {
    id: 'spiritCultivation',
    name: '百草育灵',
    glyph: '育',
    cost: { insight: 4500, pill: 80, immortalHerb: 15, crystal: 15 },
    desc: '轮作养地，提纯药性。灵草产出 +95%，丹药制作产出 +50%，仙草制作产出 +30%。',
    effects: { ratio: { herb: 0.95 }, craftBonusByResource: { pill: 0.5, immortalHerb: 0.3 } },
    needs: { realm: 6, upgrades: ['herbRotation', 'alchemyFire'] },
  },

  // ---------- 金铁族 ----------
  {
    id: 'prospectStudy',
    name: '探矿术',
    glyph: '探',
    cost: { insight: 60, wood: 200 },
    desc: '考察灵植根系与土层后，沿山势、水脉与岩层追索矿脉，找出玄铁所在。',
    effects: { unlockBuildings: ['mine'] },
    note: '解锁建筑：玄铁矿',
    effectDesc: '因此循脉找矿：玄铁矿挖得下去了。',
    needs: { upgrades: ['herbStudy'] },
  },
  {
    id: 'forgeArt',
    name: '炼器术',
    glyph: '炼',
    cost: { insight: 260, ore: 120, wood: 200 },
    desc: '丹火既通，转入炉锤。解锁炼器坊与「淬炼法器」。',
    effectDesc: '因此淬得出器，法器不再只是纸上谈兵。',
    effects: { unlockBuildings: ['forge'] },
    needs: { upgrades: ['alchemyArt', 'woodworking'], building: { id: 'mine', count: 1 } },
  },
  // 自技艺页迁入（工艺）：开放淬玄成钢
  {
    id: 'steelWorking',
    name: '淬玄工艺',
    glyph: '钢',
    cost: { insight: 180, ore: 160, artifact: 2 },
    desc: '借丹火淬去玄铁杂质，掌握《淬玄成钢》。玄钢用于材料库、试炼塔与高级营造。',
    effects: { craftBonusByResource: { steel: 0.05 } },
    needs: { realm: 4, upgrades: ['forgeArt'], building: { id: 'forge', count: 1 } },
  },
  // 自技艺页迁入（精研）
  {
    id: 'swordFlight',
    name: '御剑术',
    glyph: '剑',
    cost: { insight: 780, ore: 4000, artifact: 18, steel: 6 },
    desc: '御剑运木探矿，剑火淬炼器胚。灵木与玄铁产出 +20%，法器、灵器与灵宝制作产出 +10%。',
    effects: { ratio: { wood: 0.2, ore: 0.2 }, craftBonusByResource: { artifact: 0.1, spiritArtifact: 0.1, spiritTreasure: 0.1 } },
    needs: { upgrades: ['deepShaft'], building: { id: 'forge', count: 3 } },
  },
  // 自技艺页迁入（精研）：化神产业强化之一
  {
    id: 'spiritSmelting',
    name: '灵火冶炼',
    glyph: '冶',
    cost: { insight: 4500, steel: 25, artifact: 40, crystal: 15 },
    desc: '以灵火探脉淬铁，器胚成材更稳。玄铁产出 +95%，玄钢制作产出 +50%，法器与灵器制作产出 +30%。',
    effects: { ratio: { ore: 0.95 }, craftBonusByResource: { steel: 0.5, artifact: 0.3, spiritArtifact: 0.3 } },
    needs: { realm: 6, upgrades: ['deepShaft', 'steelWorking', 'swordFlight'] },
  },
  {
    id: 'artifactLore',
    name: '器道精微',
    glyph: '器',
    cost: { insight: 6400, artifact: 25, ore: 4000, plank: 20 },
    desc: '一器之成，差在毫厘。懂得器纹如何引气，法器才算真正入门。',
    effectDesc: '因此炼得出护山阵盘：阵纹落在器物上，比刻在山石上更灵。',
    effects: { unlockBuildings: [] },
    note: '开启参悟：护山阵盘',
    needs: { upgrades: ['forgeArt'], realm: 7 },
  },

  // ---------- 符阵族 ----------
  {
    id: 'talismanArt',
    name: '符箓入门',
    glyph: '符',
    cost: { insight: 240, wood: 400, herb: 100 },
    desc: '观气识纹、炼器定形之后，学会将引气纹路落在符纸上。解锁符箓堂与「朱砂符箓」。',
    effectDesc: '因此画得出符，镇妖避劫有了凭据。',
    effects: { unlockBuildings: ['talismanHall'] },
    needs: { upgrades: ['forgeArt', 'qiGazing'] },
  },
  // 自技艺页迁入（工艺）：开放组装阵基
  {
    id: 'arrayAssembly',
    name: '阵基装配',
    glyph: '基',
    cost: { insight: 180, plank: 2, talisman: 2, ore: 40 },
    desc: '试接梁骨与符纹，学会把木板、符箓与玄铁装成阵基。用于讲经堂、静心池及阵法营造。',
    effects: { craftBonusByResource: { arrayBase: 0.05 } },
    needs: { realm: 4, upgrades: ['earthArt', 'woodworking', 'talismanArt'], building: { id: 'talismanHall', count: 1 } },
  },
  // 自技艺页迁入（工艺）：开放凝气结晶
  {
    id: 'crystalCraft',
    name: '凝晶工艺',
    glyph: '工',
    cost: { insight: 200, talisman: 6, ore: 80 },
    desc: '以符纹固定结晶边界，掌握《凝气结晶》。灵液与符箓合成灵晶，灵晶制作产出 +5%。',
    effects: { craftBonusByResource: { crystal: 0.05 } },
    needs: { realm: 4, upgrades: ['crystalTheory'], building: { id: 'talismanHall', count: 1 } },
  },
  // 自技艺页迁入（精研）
  {
    id: 'crystalPolishing',
    name: '晶纹精修',
    glyph: '琢',
    cost: { insight: 1200, crystal: 8, talisman: 20 },
    desc: '控制分子排列、减少结晶损耗，让同样的灵液与符箓凝出更多合格晶核。灵晶制作产出 +20%。',
    effects: { craftBonusByResource: { crystal: 0.2 } },
    needs: { realm: 5, upgrades: ['crystalCraft'] },
  },
  {
    id: 'talismanLore',
    name: '符法精微',
    glyph: '符',
    cost: { insight: 7600, talisman: 120, wood: 6000 },
    desc: '符不在笔画繁复，而在落笔时那一线气机是否接得上。',
    effectDesc: '因此画得出镇岳符：一笔落下，山岳为之定。',
    effects: { unlockBuildings: [] },
    note: '开启参悟：镇岳符',
    needs: { upgrades: ['talismanArt'], realm: 7 },
  },

  // ---------- 丹道族 ----------
  {
    id: 'alchemyArt',
    name: '炼丹术',
    glyph: '丹',
    cost: { insight: 200, herb: 120, wood: 120 },
    desc: '识得药性并建成药圃后，研究如何以丹火提炼灵草，方能开炉制丹。解锁炼丹房与「采药制丹」。',
    effectDesc: '因此灵草可以入炉，丹药有了出处。',
    effects: { unlockBuildings: ['alchemyRoom'] },
    needs: { upgrades: ['herbStudy'], buildings: [{ id: 'library', count: 2 }, { id: 'herbGarden', count: 1 }] },
  },
  // 自技艺页迁入（工艺）
  {
    id: 'alchemyFire',
    name: '丹火纯青',
    glyph: '火',
    cost: { insight: 270, herb: 900, pill: 6 },
    desc: '火候拿捏到分毫不差，出炉的成色都不一样。丹药与九转丹制作产出 +5%。',
    effects: { craftBonusByResource: { pill: 0.05, nineTurnPill: 0.05 } },
    needs: { upgrades: ['alchemyArt'], building: { id: 'alchemyRoom', count: 1 } },
  },

  // ---------- 香火族 ----------
  {
    id: 'incenseVow',
    name: '香火愿',
    glyph: '愿',
    cost: { insight: 200, wood: 400 },
    desc: '立下山门，许下一桩愿，香客自会寻来。',
    effects: { unlockBuildings: ['gate'] },
    note: '解锁建筑：山门',
    effectDesc: '因此立得起山门，香客自会寻来。',
    needs: { upgrades: ['earthArt'] },
  },
  {
    id: 'incenseStudy',
    name: '香火志',
    glyph: '香',
    cost: { insight: 700, wood: 800, faith: 200 },
    desc: '香火不是凭空来的：愿力聚于一处，才会结成气数。',
    effectDesc: '因此立得起香火鼎，把念力一炉炉炼成香火。',
    effects: { unlockBuildings: ['incenseCauldron'] },
    note: '解锁建筑：香火鼎',
    needs: { upgrades: ['incenseVow'], realm: 4 },
  },

  // ---------- 土木族 ----------
  {
    id: 'earthArt',
    name: '土木术',
    glyph: '土',
    cost: { insight: 120, wood: 300, ore: 40 },
    desc: '垒石为基、架木为梁，库房才立得住。',
    effects: { unlockBuildings: ['warehouse'] },
    note: '解锁建筑：库房',
    effectDesc: '因此垒得起库房：基础物资存得住，才谈得上囤积。',
    // 先取得矿料并掌握木作器械，再研究石基木架的营造与扩仓。
    needs: { upgrades: ['prospectStudy', 'woodworking'], building: { id: 'mine', count: 3 } },
  },
  {
    id: 'earthEssence',
    name: '土木精要',
    glyph: '精',
    cost: { insight: 800, wood: 1200, plank: 12 },
    desc: '掏空山腹而不塌，靠的不是蛮力，是懂得岩层怎么受力。',
    effectDesc: '因此挖得出材料库：石殿分格存放营造原料与阵材。',
    effects: { unlockBuildings: ['depot'] },
    note: '解锁建筑：材料库',
    needs: { upgrades: ['earthArt'], realm: 5 },
  },
  {
    id: 'buildingCode',
    name: '营造法式',
    glyph: '营',
    cost: { insight: 2600, plank: 20, steel: 4 },
    desc: '材有等第、工有次第。一部法式定下来，殿宇才不只靠匠人手感。',
    effectDesc: '因此盖得起精舍：青石铺地、灵纹引气，十名弟子各有静修之处。',
    effects: { unlockBuildings: ['mansion'] },
    note: '解锁建筑：精舍',
    needs: { upgrades: ['earthEssence'], realm: 6 },
  },

  // ============ 宗门经营：制度、招募、离线与试炼 ============
  {
    id: 'preachArt',
    name: '讲经法',
    glyph: '讲',
    cost: { insight: 320 },
    desc: '把玄之又玄的道理，讲成弟子听得懂的人话。解锁讲经堂。',
    effectDesc: '因此长老可以登坛讲经，感悟的来源不再只有藏书。',
    effects: { unlockBuildings: ['academy'] },
    needs: { building: { id: 'library', count: 3 }, upgrades: ['talismanArt', 'woodworking'], realm: 4 },
  },
  {
    id: 'calmMind',
    name: '静心诀',
    glyph: '静',
    cost: { insight: 400, herb: 200 },
    desc: '心静则灵气自聚。解锁静心池。',
    effectDesc: '因此弟子坐得住：静心池让心神与仓储都稳下来。',
    effects: { unlockBuildings: ['meditationPool'] },
    needs: { building: { id: 'herbGarden', count: 3 }, upgrades: ['talismanArt', 'woodworking'], realm: 4 },
  },
  {
    id: 'recruitDrive',
    name: '广开山门',
    glyph: '广',
    cost: { insight: 500, stone: 300, faith: 150 },
    desc: '下山贴榜、沿途施粥。弟子前来的间隔缩短 30%。',
    effectDesc: '因此山门名声在外，愿意上山的弟子更勤。',
    effects: { arrivalBonus: 0.3 },
    needs: { building: { id: 'gate', count: 3 } },
  },
  {
    id: 'intuition',
    name: '心有灵犀',
    glyph: '犀',
    cost: { insight: 900, stone: 600, pill: 10 },
    desc: '丹炉火候、符纸厚薄，不必盯着也知道。解锁自动制作。',
    effectDesc: '因此配方可以自动连做，双手从重复劳动里解放。',
    effects: { autoCraft: true },
    // 自动制作不该被某一座建筑卡住：器械齐了、手上有一批丹药，就能标准化流程
    needs: { upgrades: ['woodworking'] },
  },
  {
    id: 'ancestorArt',
    name: '祖师遗泽',
    glyph: '泽',
    cost: { insight: 1200, stone: 900, talisman: 8 },
    desc: '翻出祖师手札，字里行间都是捷径。解锁祖师殿。',
    effectDesc: '因此立得起祖师殿，香火更盛、人心更齐。',
    effects: { unlockBuildings: ['ancestorHall'] },
    needs: { building: { id: 'incenseCauldron', count: 2 }, realm: 7 },
  },
  {
    id: 'beastTaming',
    name: '灵兽驯养',
    glyph: '驯',
    cost: { insight: 3200, stone: 2800, herb: 1500 },
    desc: '心静得下来，才听得懂兽语。解锁灵兽园。',
    effectDesc: '因此养得起灵兽，采药驮矿不必弟子亲自跑。',
    effects: { unlockBuildings: ['beastGarden'] },
    needs: { upgrades: ['calmMind'], realm: 8 },
  },
  {
    id: 'grottoArt',
    name: '洞天福地',
    glyph: '福',
    cost: { insight: 4000, stone: 3500, artifact: 12 },
    desc: '在山上开一方小世界。解锁洞天与洞府。',
    effectDesc: '因此开得出洞天与洞府：一方自成一界，装得下也住得下。',
    effects: { unlockBuildings: ['grotto', 'caveDwelling'] },
    needs: { building: { id: 'depot', count: 2 }, realm: 8 },
  },
  {
    id: 'longBreath',
    name: '龟息功',
    glyph: '龟',
    cost: { insight: 6000, stone: 5000, pill: 40 },
    desc: '闭门即是深山。离线收益上限 +8 小时。',
    effectDesc: '因此离山也在修行：离线八小时照样积攒。',
    effects: { offlineHours: 8 },
    needs: { realm: 5 },
  },
  {
    id: 'breathArt',
    name: '定息法',
    glyph: '息',
    cost: { insight: 5200, pill: 40, plank: 20 },
    desc: '把呼吸压到极缓，人在与不在，气机不断。',
    effectDesc: '因此离山也在修行：离线时间再多算八小时。',
    effects: { offlineHours: 8 },
    note: '效果：离线结算 +8 小时',
    needs: { upgrades: ['longBreath'], realm: 6 },
  },
  {
    id: 'trialArt',
    name: '试炼法',
    glyph: '炼',
    cost: { insight: 3600, pill: 60, herb: 2000 },
    desc: '以阵纹模拟雷劫，让弟子在安全处先尝一次天威。',
    effectDesc: '因此立得起试炼塔：弟子在塔中磨砺，出塔便是另一番气象。',
    effects: { unlockBuildings: ['trialTower'] },
    note: '解锁建筑：试炼塔',
    needs: { upgrades: ['buildingCode'], realm: 6 },
  },
  {
    id: 'gateRecord',
    name: '山门志',
    glyph: '志',
    cost: { insight: 9000, faith: 4000, artifact: 10 },
    desc: '把历年上山的弟子名录刻在石上，山门的名声就有了凭据。',
    effectDesc: '因此愿意上山的弟子更勤，宗门扩张更快。',
    effects: { arrivalBonus: 0.3 },
    note: '效果：弟子前来更快',
    needs: { upgrades: ['incenseStudy'], realm: 7 },
  },
]

/** 两层合起来的完整列表：产出计算、解锁判定、文案都要用它 */
export const ALL_UPGRADES = [...CULTIVATION, ...TECHNIQUES]

/**
 * 修真页的分组（界面上按它分组显示）：主线五章 + 材料六族 + 宗门经营。
 * 主线按「灵气的科学史」分章，章节感来自依赖链与境界耦合，分组只是导航；
 * 材料研究按族分「原理 → 工艺 → 精研」三层（方案见 docs/RESEARCH.md）。
 */
export const CULTIVATION_STAGES = [
  {
    key: 'qiSense',
    label: '灵气研究 Ⅰ 观气',
    hint: '灵气是什么、在哪、怎么聚（凡体→筑基）',
    ids: ['qiOrigin', 'qiGazing', 'condenseArt', 'breakthroughArt'],
  },
  {
    key: 'qiCondense',
    label: '灵气研究 Ⅱ 凝聚',
    hint: '怎么把灵气存住、存好（筑基→金丹）',
    ids: ['liquidArt', 'crystalTheory'],
  },
  {
    key: 'qiControl',
    label: '灵气研究 Ⅲ 调控',
    hint: '怎么引导、约束灵气（金丹→合体）',
    ids: ['astrologyArt', 'hourArt', 'arrayBasics', 'arrayMastery', 'arrayRefine'],
  },
  {
    key: 'qiSplit',
    label: '灵气研究 Ⅳ 拆解',
    hint: '灵气由什么构成（合体→大乘）',
    ids: ['particleTheory', 'mindSeal', 'greatVehicleSeal', 'mahayanaArt', 'yinyangSplit', 'annihilationArt', 'energyApplication'],
  },
  {
    key: 'qiSource',
    label: '灵气研究 Ⅴ 归源',
    hint: '灵气与因果、飞升（大乘→渡劫）',
    ids: ['karmaSense', 'towerPlan', 'karmaConcord'],
  },
  {
    key: 'matHerb',
    label: '材料研究 · 草木',
    hint: '原理 → 工艺 → 精研',
    ids: ['herbStudy', 'woodworking', 'waterworkshop', 'spiritSaw', 'spiritCultivation'],
  },
  {
    key: 'matOre',
    label: '材料研究 · 金铁',
    hint: '原理 → 工艺 → 精研',
    ids: ['prospectStudy', 'forgeArt', 'steelWorking', 'swordFlight', 'spiritSmelting', 'artifactLore'],
  },
  {
    key: 'matTalisman',
    label: '材料研究 · 符阵',
    hint: '原理 → 工艺 → 精研',
    ids: ['talismanArt', 'arrayAssembly', 'crystalCraft', 'crystalPolishing', 'talismanLore'],
  },
  {
    key: 'matAlchemy',
    label: '材料研究 · 丹道',
    hint: '原理 → 工艺',
    ids: ['alchemyArt', 'alchemyFire'],
  },
  {
    key: 'matIncense',
    label: '材料研究 · 香火',
    hint: '原理 → 精研',
    ids: ['incenseVow', 'incenseStudy'],
  },
  {
    key: 'matEarth',
    label: '材料研究 · 土木',
    hint: '原理 → 精研（工艺与草木族共用木作器械）',
    ids: ['earthArt', 'earthEssence', 'buildingCode'],
  },
  {
    key: 'sectOps',
    label: '宗门经营',
    hint: '制度、招募、离线与试炼',
    ids: [
      'preachArt',
      'calmMind',
      'recruitDrive',
      'intuition',
      'ancestorArt',
      'beastTaming',
      'grottoArt',
      'longBreath',
      'breathArt',
      'trialArt',
      'gateRecord',
    ],
  },
]

/** 节点 id → 所属段（给界面用） */
export const CULTIVATION_STAGE_OF = (() => {
  const map = {}
  CULTIVATION_STAGES.forEach((s, i) => {
    for (const id of s.ids) map[id] = { ...s, index: i }
  })
  return map
})()

/** id -> 条目（跨层引用依赖时用，例如修真节点 needs 里写一条技艺） */
export const UPGRADE_MAP = Object.fromEntries(ALL_UPGRADES.map((u) => [u.id, u]))
