/**
 * 修真 —— 研究层，对标猫国的「科学」（science.js）。
 *
 * 2026-10 两线重组（方案与决策见 docs/RESEARCH.md）：
 *   主线「灵气研究」按研究问题分五章 —— 观气 → 凝聚 → 调控 → 拆解 → 归源；
 *   灵气的形态阶梯（气 → 液 → 晶 → 灵气分子 → 正负灵子 → 灵能，设定见 docs/SPIRIT-ENERGY.md）
 *   对应每一章的研究问题。
 *   辅线「材料研究」按材料族分「原理 → 工艺 → 精研」三层，承接来源、配方与专业增益，
 *   配方与能力知识保留修真，16 个纯应用升级归技艺（ID 不变，存档兼容）。
 *   制度、招募、离线等经营节点收进「宗门经营」组。
 *
 * 与 /技艺·法宝/ 的分工：
 *   修真（本文件）：灵气与材料研究、心法支线及宗门经营，承接知识解锁、系统与研究成果；
 *                   知识节点可附带增益；心法线承接心印与修持
 *   技艺           ：通用及专业产量、工位、节料、仓储与破境优惠；法宝由修真解锁后炼成
 *
 * 两者共用「灵机」货币与已学记录，也都用 `needs` 做门禁；`needs.upgrades` 可跨页引用。
 */
import { TECHNIQUES } from './techniques.js'
import { HUNT_UPGRADES } from '../modules/hunting/data.js'

const CORE_CULTIVATION = [
  // ============ 主线 · 灵气研究：灵气的科学史 ============

  // ---------- Ⅰ 观气：灵气是什么、在哪、怎么聚 ----------
  {
    id: 'qiOrigin',
    name: '灵源考',
    glyph: '源',
    cost: { insight: 60 },
    desc: '考究灵气从何而来、如何流转，为观气与吐纳立下根基。',
    effects: { unlockBuildings: [] },
    note: '开启参悟：观气法、引气诀',
    effectDesc: '因此懂得气脉的来路，才能继续观气、练习吐纳。',
    needs: { building: { id: 'library', count: 2 } },
  },
  {
    id: 'qiGazing',
    name: '观气法',
    glyph: '观',
    cost: { insight: 150, wood: 300, stone: 60 },
    desc: '静坐三日，看清明堂之上那一缕白气的来路与去向。已有弟子嘀咕：这气莫不是一粒一粒凑成的？——只是谁也拿不出凭据。聚灵之理自此可画。',
    effects: { unlockBuildings: [] },
    note: '开启参悟：灵气测定；承接阵法精要',
    effectDesc: '因此看得懂气脉走向：可继续测定灵气，结合引气诀研习阵法精要。',
    needs: { upgrades: ['qiOrigin'] },
  },
  {
    id: 'qiMeasure',
    name: '灵气测定',
    glyph: '测',
    cost: { insight: 400, rock: 120 },
    desc: '立「一息」之度，把氤氲灵气按单位量出。聚气、凝液自此有据可依，不再全凭手感。',
    effectDesc: '因此量得出灵气的分量，为凝气化液与后续计量立下基准。',
    effects: { unlockBuildings: [] },
    note: '开启参悟：凝气化液',
    needs: { upgrades: ['qiGazing'] },
  },

  // ---------- Ⅱ 凝聚：怎么把灵气存住、存好 ----------
  {
    id: 'qiLiquid',
    name: '凝气化液',
    glyph: '化',
    cost: { insight: 1500, wood: 200, stone: 60 },
    desc: '依「一息」之度，把量准的灵气按份压入玉瓶，凝成十年不散的一瓶灵液。',
    effectDesc: '因此化得出合格灵液：灵气可按标准凝成灵液。',
    effects: { unlockBuildings: [] },
    note: '开启配方：凝气成液',
    needs: { upgrades: ['qiMeasure'] },
  },
  {
    id: 'liquidArt',
    name: '凝液法',
    glyph: '液',
    cost: { insight: 6000, wood: 300, stone: 40 },
    desc: '掌握按份化液后，稳定灵压与玉瓶收取，把凝液整理成可持续运转的工艺。',
    effectDesc: '因此开得出基础凝聚工位：金丹起可自动凝液，后续凝晶配方也共用此工位。',
    effects: { unlockBuildings: [] },
    note: '提供基础凝聚工位',
    // 研究按灵机费用与仓容推进；建筑、配方保留各自条件。
    needs: { upgrades: ['qiLiquid'] },
  },
  {
    id: 'qiPurify',
    name: '灵气纯化',
    glyph: '纯',
    cost: { insight: 3000, stone: 300, plank: 20 },
    desc: '凝液制程稳定后，进一步剔去灵气中的浊杂，纯度既高，气机更稳，一份更抵一份。',
    effectDesc: '因此灵气更纯：灵气产出 +20%。',
    effects: { ratio: { qi: 0.2 } },
    needs: { upgrades: ['liquidArt'] },
  },
  {
    id: 'crystalTheory',
    name: '凝晶原理',
    glyph: '晶',
    cost: { insight: 8000 },
    desc: '气源纯化后，研究用符纹约束稳定灵液，凝成可长期保存的晶核。',
    effectDesc: '开启凝晶工艺与晶核凝炼阵；学会加工灵晶后才能完成建设。',
    effects: { unlockBuildings: ['crystalArray'] },
    needs: { upgrades: ['qiPurify', 'talismanArt'] },
  },

  // ---------- Ⅲ 调控：怎么引导、约束灵气 ----------
  {
    id: 'astrologyArt',
    name: '观星术',
    glyph: '星',
    cost: { insight: 12000, talisman: 6 },
    desc: '讲经讲到尽头，就得抬头看天。解锁观星台。',
    effectDesc: '因此搭得起观星台，从星象里读出资源的走势。',
    effects: { unlockBuildings: ['observatory'] },
    needs: { upgrades: ['preachArt'] },
  },
  {
    id: 'hourArt',
    name: '候时法',
    glyph: '候',
    cost: { insight: 24000, stone: 1200, talisman: 5 },
    desc: '破境要挑时候：灵气潮汐、月相、弟子的心神都有节律。',
    effectDesc: '因此破境再省一成材料 —— 同一炉丹，用在刀刃上。',
    effects: { breakthroughDiscount: 0.1 },
    note: '效果：破境花费 −10%',
    needs: { upgrades: ['buildingCode'] },
  },
  {
    id: 'arrayBasics',
    name: '阵法初解',
    glyph: '阵',
    cost: { insight: 30000, talisman: 12, artifact: 3 },
    desc: '观星知势，方能布阵。解锁护山大阵。',
    effectDesc: '因此布得起护山大阵，天灾来时损失大减。',
    effects: { unlockBuildings: ['mountainArray'] },
    needs: { upgrades: ['astrologyArt'], building: { id: 'academy', count: 2 } },
  },
  {
    id: 'arrayMastery',
    name: '阵道精通',
    glyph: '精',
    cost: { insight: 60000, talisman: 25, spiritTalisman: 4 },
    desc: '一草一木皆可为阵。解锁锁灵阵。',
    effectDesc: '因此锁得住一山之灵：锁灵阵把灵气囤得更紧。',
    effects: { unlockBuildings: ['spiritLockArray'] },
    needs: { upgrades: ['arrayBasics'], building: { id: 'mountainArray', count: 3 } },
  },

  // ---------- Ⅳ 拆解：灵气由什么构成 ----------
  {
    id: 'particleTheory',
    name: '灵子论',
    glyph: '子',
    cost: { insight: 18000, crystal: 40, spiritTalisman: 6 },
    desc: '辨明灵气的分子组成：正负灵子相抱成稳定分子。结丹时内观到的灵荷，如今可以在宗门设施中重复验看、连续离析。',
    effectDesc: '因此布得起分灵阵：把灵气离析成游离的灵气分子，攒着等下一步解离。',
    effects: { unlockBuildings: ['splitArray'] },
    note: '解锁建筑：分灵阵',
    needs: { upgrades: ['crystalTheory', 'astrologyArt'] },
  },
  {
    id: 'yinyangSplit',
    name: '阴阳分灵',
    glyph: '阴',
    cost: { insight: 36000, stone: 12000, spiritArtifact: 6 },
    desc: '输入解离之力打开分子束缚，以两极之势维持分流，避免正负灵子重新复合。',
    effectDesc: '因此布得起偏极阵 —— 把灵气分子解离成正灵子与负灵子。',
    effects: { unlockBuildings: ['polarizeArray'] },
    note: '解锁建筑：偏极阵',
    needs: { upgrades: ['particleTheory', 'compositeRune'] },
  },
  {
    id: 'annihilationArt',
    name: '湮灭法',
    glyph: '湮',
    // 合体首炉由既有观星、试炼与洞天仓储承接，不依赖大乘通天塔。
    cost: { insight: 90000, nineTurnPill: 20, spiritTalisman: 20 },
    desc: '控制供料、灵势与阵形，让正负灵子越过湮灭门槛，成对消耗为可回收的灵能，并排出废热。',
    effectDesc: '因此铸得起湮灭炉：寻常相撞未必湮灭，炉心的受控阵形才使转换持续发生。',
    effects: { unlockBuildings: ['annihilationFurnace'] },
    note: '解锁建筑：湮灭炉',
    needs: { upgrades: ['yinyangSplit'] },
  },
  {
    id: 'energyApplication',
    name: '灵能输配',
    glyph: '用',
    cost: { insight: 120000, crystal: 30, spiritArtifact: 8 },
    desc: '湮灭炉里翻出的灵能，不只用来催产 —— 更要定下灵势、输运与负荷之法，才把灵能稳妥接入宗门。',
    effectDesc: '将灵能接入专业工位。启用灵能驱动后，每单位额外加工容量每秒消耗0.1灵能，受灵能枢供能与冷却回路限制。',
    effects: { energyCraft: true },
    note: '解锁：工位灵能驱动；动力断供自动回落到普通加工',
    needs: { upgrades: ['annihilationArt'] },
  },

  // ---------- Ⅴ 归源：灵气与因果、飞升 ----------
  {
    id: 'karmaSense',
    name: '因果通感',
    glyph: '感',
    cost: { insight: 160000, stone: 40000, pill: 100 },
    desc: '看清因果的人，飞升时能多带走三成仙缘。',
    effectDesc: '因此看得见因果：下一次飞升带走的仙缘更多。',
    effects: { ascendBonus: 0.3, karmaRatio: 0.005 },
    needs: { upgrades: ['greatVehicleSeal', 'ancestorArt'] },
  },
  {
    id: 'towerPlan',
    name: '塔院图',
    glyph: '塔',
    cost: { insight: 180000, stone: 80000, artifact: 30, plank: 60, steel: 15 },
    desc: '塔不怕高，怕的是接不住天风。图样定下九重院墙，塔才立得稳。',
    effectDesc: '因此动得了通天塔的工：塔尖直插云海，看得见飞升的路。',
    effects: { unlockBuildings: ['heavenTower'] },
    note: '解锁建筑：通天塔',
    needs: { upgrades: ['arrayMastery', 'buildingCode', 'compositeRune'] },
  },
  {
    id: 'karmaConcord',
    name: '因果参同契',
    glyph: '契',
    // 进阶品让"最后一步"有了自己的门槛：九转丹与灵符只有后期才炼得出来
    cost: {
      insight: 280000,
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
    needs: { upgrades: ['karmaSense', 'towerPlan'] },
  },

  // ============ 支线 · 心法研究：心印与修持 ============
  {
    id: 'condenseArt',
    name: '凝灵诀',
    glyph: '凝',
    cost: { insight: 120, wood: 150, stone: 20 },
    desc: '掌握灵气纯化后，将稳定灵压与收液的法门化为心诀。节气一至，将满仓盈余灵气自行压入玉瓶。',
    effectDesc: '掌握《凝气化液》且达到凝液配方条件后，每逢节气，灵气满仓时自动凝聚灵液；灵气不足则暂停，遵守库存目标与材料保留量。',
    // 效果由"自动制作灵石"改为"自动凝聚灵液"：灵石可由点石成灵手动补，灵液才是真的耗灵气。
    effects: { autoCondenseLiquid: true },
    needs: { upgrades: ['qiPurify'] },
  },
  {
    id: 'mindSeal',
    name: '心印法',
    glyph: '印',
    cost: { insight: 70000, pill: 120, herb: 6000 },
    desc: '以心印心，不必言语 —— 长老一个念头，弟子便知该如何行气。',
    effectDesc: '因此破境再省一成半材料。',
    effects: { breakthroughDiscount: 0.15 },
    note: '效果：破境花费 −15%',
    needs: { upgrades: ['hourArt'] },
  },
  {
    id: 'greatVehicleSeal',
    name: '大乘心印',
    glyph: '乘',
    cost: { insight: 140000, artifact: 60, talisman: 120, plank: 40, spiritTreasure: 1 },
    desc: '统合历世修持的经验，凝成一道可辨识、可传承的心印结构。',
    effectDesc: '因此参悟得出《大乘心经》—— 全局产出再上一阶。',
    effects: { unlockBuildings: [] },
    note: '开启参悟：大乘心经',
    needs: { upgrades: ['mindSeal'] },
  },
  // 自技艺页迁入：大乘心印的成果兑现，心法修持支线的增益出口
  {
    id: 'mahayanaArt',
    name: '大乘心经',
    glyph: '经',
    cost: { insight: 160000, artifact: 60, talisman: 60, pill: 60, faith: 6000 },
    desc: '以心养药，以愿证道。灵机与香火产出 +120%，灵草产出 +80%，仙草与九转丹制作产出 +50%，灵宝制作产出 +30%。',
    effects: { ratio: { insight: 1.2, faith: 1.2, herb: 0.8 }, craftBonusByResource: { immortalHerb: 0.5, nineTurnPill: 0.5, spiritTreasure: 0.3 } },
    needs: { upgrades: ['greatVehicleSeal'] },
  },

  // ============ 辅线 · 材料研究：按材料族分「原理 → 工艺 → 精研」 ============

  // ---------- 草木族 ----------
  {
    id: 'herbStudy',
    name: '灵植术',
    glyph: '植',
    cost: { insight: 40, wood: 120 },
    desc: '明白灵气来源后，考察草木如何吸纳灵气，辨识药性，才能开圃种药。',
    effects: { unlockBuildings: ['herbGarden'] },
    note: '解锁建筑：药圃',
    effectDesc: '因此敢开圃种药：有了稳定的灵草来源。',
    needs: { upgrades: ['qiOrigin'], building: { id: 'library', count: 1 } },
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
    needs: { upgrades: ['prospectStudy'], buildings: [{ id: 'lumberYard', count: 2 }, { id: 'ironFurnace', count: 1 }] },
  },

  // ---------- 金铁族 ----------
  {
    id: 'prospectStudy',
    name: '探矿术',
    glyph: '探',
    cost: { insight: 60, wood: 80, rock: 120 },
    desc: '考察灵植根系与土层后，沿山势、水脉与岩层追索矿脉，找出玄铁所在；再以矿石与灵木起炉，把矿石烧成玄铁。',
    effects: { unlockBuildings: ['ironFurnace'] },
    note: '解锁建筑：炼铁炉；矿工同时采出玄铁',
    effectDesc: '因此循脉找矿：起一座炼铁炉，矿工采石之余也带出玄铁。',
    // 后移：原来是《灵植术》之后（约 145 分），现在挂到《炼丹术》之后（约 190 分），
    // 并且玄铁不再是"再开一座矿"，而是矿石+灵木烧出来的前中期料。
    needs: { upgrades: ['alchemyArt'] },
  },
  {
    id: 'forgeArt',
    name: '炼器术',
    glyph: '炼',
    cost: { insight: 260, ore: 120, wood: 200 },
    desc: '丹火既通，转入炉锤。解锁炼器坊与「淬炼法器」。',
    effectDesc: '因此淬得出器，法器不再只是纸上谈兵。',
    effects: { unlockBuildings: ['forge'] },
    needs: { upgrades: ['alchemyArt', 'woodworking', 'earthArt'], building: { id: 'ironFurnace', count: 1 } },
  },
  // 自技艺页迁入（工艺）：开放淬玄成钢
  {
    id: 'steelWorking',
    name: '淬玄工艺',
    glyph: '钢',
    cost: { insight: 1500, ore: 160, artifact: 2 },
    desc: '借丹火淬去玄铁杂质，掌握《淬玄成钢》。玄钢用于材料库、试炼塔与高级营造。',
    effects: { craftBonusByResource: { steel: 0.05 } },
    // 淬玄工艺承接材料库的玄钢用料。
    needs: { upgrades: ['forgeArt', 'earthEssence'], building: { id: 'forge', count: 1 } },
  },
  {
    id: 'artifactLore',
    name: '器道精微',
    glyph: '器',
    cost: { insight: 40000, artifact: 25, ore: 4000, plank: 20 },
    desc: '一器之成，差在毫厘。懂得器纹如何引气，法器才算真正入门。',
    effectDesc: '因此炼得出护山阵盘：阵纹落在器物上，比刻在山石上更灵。',
    effects: { unlockBuildings: [] },
    note: '开启参悟：护山阵盘',
    needs: { upgrades: ['steelWorking'] },
  },

  // ---------- 符阵族 ----------
  {
    id: 'talismanArt',
    name: '符文入门',
    glyph: '符',
    cost: { insight: 240, wood: 400, herb: 100 },
    desc: '将灵气固定成特定形状的符号，建立符文原理。符文决定效果，灵木与金属载体决定承载能力；解锁符箓堂与刻制符箓。',
    effectDesc: '因此画得出符，镇妖避劫有了凭据。',
    effects: { unlockBuildings: ['talismanHall'] },
    needs: { upgrades: ['forgeArt', 'qiGazing'], building: { id: 'forge', count: 1 } },
  },
  {
    id: 'qiRune',
    name: '聚气纹',
    glyph: '纹',
    cost: { insight: 800, qi: 600 },
    desc: '将灵气固定为汇聚气机的纹路。灵气产出 +10%，开启导灵纹研究。',
    effects: { ratio: { qi: 0.1 } },
    needs: { upgrades: ['talismanArt'] },
  },
  {
    id: 'shapeRune',
    name: '固形纹',
    glyph: '纹',
    cost: { insight: 1200, qi: 600 },
    desc: '以闭合符文维持灵气结构，防止气机溃散。开启导灵纹、阵基装配与凝晶工艺的研究。',
    effects: { unlockBuildings: [] },
    needs: { upgrades: ['qiRune'] },
  },
  {
    id: 'conductionRune',
    name: '导灵纹',
    glyph: '纹',
    cost: { insight: 2200, ore: 100, qi: 800 },
    desc: '用相连的符文引导灵气流向，使不同材料之间能够传导气机。开启阵基装配、镇守纹与纳灵纹研究。',
    effects: { unlockBuildings: [] },
    needs: { upgrades: ['qiRune', 'shapeRune'] },
  },
  {
    id: 'guardRune',
    name: '镇守纹',
    glyph: '纹',
    cost: { insight: 12000, stone: 200, qi: 1200 },
    desc: '将固形结构向外延伸，抵御外部冲击。为炼虚参悟镇岳符与符法精微建立基础。',
    effects: { unlockBuildings: [] },
    needs: { upgrades: ['conductionRune'] },
  },
  {
    id: 'capacityRune',
    name: '纳灵纹',
    glyph: '纹',
    cost: { insight: 14000, wood: 250, spiritLiquid: 2 },
    desc: '以层叠符文在金属载体内容纳更多灵气。解锁铭刻灵符，开启复合符文与须弥纳芥研究。',
    effects: { unlockBuildings: [] },
    needs: { upgrades: ['conductionRune', 'liquidArt', 'steelWorking'] },
  },
  {
    id: 'compositeRune',
    name: '复合符文',
    glyph: '纹',
    cost: { insight: 24000, crystal: 10, steel: 5 },
    desc: '将导灵与纳灵等符文连接为协作结构，刻入器物内部。解锁铸灵器，为立体符文研究建立基础。',
    effects: { unlockBuildings: [] },
    needs: { upgrades: ['conductionRune', 'capacityRune'] },
  },
  // 符文的材料应用：阵基
  {
    id: 'arrayAssembly',
    name: '阵基装配',
    glyph: '基',
    cost: { insight: 3200, plank: 2, talisman: 2, ore: 40 },
    desc: '将导灵纹与固形纹直接刻入木板和玄铁，注入灵气组装阵基。用于讲经堂、静心池及阵法营造。',
    effects: { craftBonusByResource: { arrayBase: 0.05 } },
    needs: { upgrades: ['earthArt', 'woodworking', 'conductionRune'], building: { id: 'talismanHall', count: 1 } },
  },
  // 自技艺页迁入（工艺）：开放凝气结晶
  {
    id: 'crystalCraft',
    name: '凝晶工艺',
    glyph: '工',
    cost: { insight: 10000, talisman: 6, ore: 80 },
    desc: '以固形纹固定结晶边界，将灵液与灵气凝成灵晶。解锁凝气结晶，灵晶制作产出 +5%。',
    effects: { craftBonusByResource: { crystal: 0.05 } },
    needs: { upgrades: ['crystalTheory', 'shapeRune'], building: { id: 'talismanHall', count: 1 } },
  },
  // 自技艺页迁入（精研）
  {
    id: 'crystalPolishing',
    name: '晶纹精修',
    glyph: '琢',
    cost: { insight: 16000, crystal: 8, talisman: 20 },
    desc: '精修固形纹排列，减少结晶损耗。凝晶每份耗料减少20%（整枚材料向上取整），金丹起凝晶加工效率 +25%。',
    effects: { craftCostReduction: { condenseCrystal: 0.2 }, craftSpeedByRecipe: { condenseCrystal: 0.25 } },
    needs: { upgrades: ['crystalCraft', 'precipitateTheory'] },
  },
  {
    id: 'talismanLore',
    name: '符法精微',
    glyph: '符',
    cost: { insight: 45000, talisman: 120, wood: 6000 },
    desc: '将复合符文发展为立体结构，以镇守纹稳定边界，使符文能够承受更强的气机。',
    effectDesc: '因此画得出镇岳符：一笔落下，山岳为之定。',
    effects: { unlockBuildings: [] },
    note: '开启参悟：镇岳符',
    needs: { upgrades: ['compositeRune', 'guardRune'] },
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

  // ---------- 香火族 ----------
  {
    id: 'incenseVow',
    name: '香火愿',
    glyph: '愿',
    cost: { insight: 200, wood: 160, rock: 200 },
    desc: '营造与工艺渐成，以符箓立愿、设下山门，香客自会寻来。',
    effects: { unlockBuildings: ['gate'] },
    note: '解锁建筑：山门',
    effectDesc: '因此立得起山门，香客自会寻来。',
    needs: { upgrades: ['earthArt', 'talismanArt'], building: { id: 'talismanHall', count: 1 } },
  },
  {
    id: 'incenseStudy',
    name: '香火志',
    glyph: '香',
    cost: { insight: 2800, wood: 800, faith: 200 },
    desc: '香火不是凭空来的：愿力聚于一处，才会结成气数。',
    effectDesc: '因此立得起香火鼎，把念力一炉炉炼成香火。',
    effects: { unlockBuildings: ['incenseCauldron'] },
    note: '解锁建筑：香火鼎',
    needs: { upgrades: ['incenseVow', 'preachArt'] },
  },

  // ---------- 土木族 ----------
  {
    id: 'earthArt',
    name: '土木术',
    glyph: '土',
    cost: { insight: 120, wood: 120, rock: 180, ore: 40 },
    desc: '垒石为基、架木为梁，库房才立得住。',
    effects: { unlockBuildings: ['warehouse'] },
    note: '解锁建筑：库房',
    effectDesc: '因此垒得起库房：基础物资存得住，才谈得上囤积。',
    // 先取得矿料并掌握木作器械，再研究石基木架的营造与扩仓。
    // 门槛从 ×3 降到 ×1：炼铁炉按 1.3 涨价，第 3 座要 304 矿石，而这一阶段矿石上限只有
    // 250（要库房才能抬），库房又在本术之下 —— ×3 等于把土木术锁死。
    needs: { upgrades: ['prospectStudy', 'woodworking'], building: { id: 'ironFurnace', count: 1 } },
  },
  {
    id: 'earthEssence',
    name: '土木精要',
    glyph: '精',
    cost: { insight: 2400, wood: 600, plank: 8 },
    desc: '掏空山腹而不塌，靠的不是蛮力，是懂得岩层怎么受力。',
    effectDesc: '因此挖得出材料库：石殿分格存放营造原料与阵材。',
    effects: { unlockBuildings: ['depot'] },
    note: '解锁建筑：材料库',
    // 研究按灵机费用与仓容推进；建筑、配方保留各自条件。
    needs: { upgrades: ['earthArt'] },
  },
  {
    id: 'buildingCode',
    name: '营造法式',
    glyph: '营',
    cost: { insight: 20000, plank: 20, steel: 4 },
    desc: '材有等第、工有次第。一部法式定下来，殿宇才不只靠匠人手感。',
    effectDesc: '因此盖得起精舍：青石铺地、灵纹引气，十名弟子各有静修之处。',
    effects: { unlockBuildings: ['mansion'] },
    note: '解锁建筑：精舍',
    // 造价含玄钢，而玄钢要「炼器术 → 淬玄工艺」才产得出：列进前置，避免先露面却找不到来源。
    needs: { upgrades: ['earthEssence', 'steelWorking'] },
  },

  // ============ 宗门经营：制度、招募、离线与试炼 ============
  {
    id: 'talentAssignment',
    name: '知人善任',
    glyph: '任',
    cost: { insight: 300, qi: 500 },
    desc: '识别弟子的岗位专长，依其所长安排分工。学会后自动将有岗位专长的弟子调到对应已开放岗位，弟子页可暂停。',
    effectDesc: '新弟子与新领悟的岗位专长也自动匹配；未开放的岗位等待解锁，出征弟子归队后再调配，无岗位专长者保持分工。',
    effects: { autoTalentJobs: true },
    needs: { upgrades: ['qiOrigin', 'homePlanning'], building: { id: 'library', count: 2 } },
  },
  {
    id: 'preachArt',
    name: '讲经法',
    glyph: '讲',
    cost: { insight: 1600 },
    desc: '把玄之又玄的道理，讲成弟子听得懂的人话。解锁讲经堂。',
    effectDesc: '因此长老可以登坛讲经，灵机的来源不再只有藏书。',
    effects: { unlockBuildings: ['academy'] },
    // 符箓入门经炼器术已含木作器械；讲经堂造价又含阵基（要求木作器械与符箓入门）。
    // 直接列《木作器械》属跨线重复，去掉后由符阵链与建筑造价卡进度。
    needs: { building: { id: 'library', count: 3 }, upgrades: ['talismanArt', 'arrayAssembly'] },
  },
  {
    id: 'calmMind',
    name: '静心诀',
    glyph: '静',
    cost: { insight: 6000, herb: 200 },
    desc: '心静则灵气自聚。解锁静心池。',
    effectDesc: '因此弟子坐得住：静心池让心神与仓储都稳下来。',
    effects: { unlockBuildings: ['meditationPool'] },
    // 静心池造价含阵基与仙草；符箓入门经炼器术已含木作器械，仙草要求凝液与育草产业。
    // 去掉直接列出的跨线《木作器械》，由符阵链与建筑造价卡进度。
    needs: { building: { id: 'herbGarden', count: 3 }, upgrades: ['talismanArt'] },
  },
  {
    id: 'recruitDrive',
    name: '广开山门',
    glyph: '广',
    cost: { insight: 500, stone: 300, faith: 150 },
    desc: '下山贴榜、沿途施粥。弟子前来的间隔缩短 30%。',
    effectDesc: '因此山门名声在外，愿意上山的弟子更勤。',
    effects: { arrivalBonus: 0.3 },
    needs: { upgrades: ['incenseStudy'], building: { id: 'gate', count: 3 } },
  },
  {
    id: 'mentorship',
    name: '传功授业',
    glyph: '授',
    cost: { insight: 2400, faith: 400 },
    desc: '把讲经的道理落到人身上：以灵气为人温养经脉，或以天材地宝为一次冲关护法。',
    effectDesc: '因此可以对指定弟子传功加速修炼，或为其下一次突破预付护道材料。',
    effects: { discipleTraining: true },
    // 造价含香火，而香火要「香火愿 → 山门 → 香使」才产得出：列进前置，避免先露面却找不到来源。
    needs: { upgrades: ['preachArt', 'oralTeaching', 'incenseVow'] },
  },
  {
    id: 'intuition',
    name: '心有灵犀',
    glyph: '犀',
    cost: { insight: 900, stone: 600, pill: 10 },
    desc: '丹炉火候、木料下刀，不必盯着也知道。解锁自动制作。',
    effectDesc: '因此配方可以自动连做，并可逐项保留材料、指定优先配方。',
    effects: { autoCraft: true },
    // 自动制作由基础木作、炼丹与炼器知识承接，不要求购买增产技艺。
    needs: { upgrades: ['woodworking', 'alchemyArt', 'forgeArt'] },
  },
  {
    id: 'craftTempo',
    name: '疾炼法',
    glyph: '疾',
    cost: { insight: 1200, arrayBase: 5, spiritLiquid: 10 },
    desc: '以阵纹统筹丹火、器械与刻纹节拍。金丹起木作、炼器、刻纹、丹道与凝聚加工容量 +100%，开放各配方自动速限；提速需要更多持续供料。',
    effectDesc: '各配方可选1×、2×、5×、10×自动速限；金丹起受专业设施共享容量约束，扩建工位才能同时扩产。每份收益不因速限改变。',
    effects: { autoCraftSpeedControl: true, processingCapacityRatio: { woodwork: 1, forge: 1, inscription: 1, alchemy: 1, condensation: 1 } },
    needs: { upgrades: ['intuition', 'arrayAssembly', 'liquidArt'] },
  },
  {
    id: 'ancestorArt',
    name: '祖师遗泽',
    glyph: '泽',
    cost: { insight: 30000, stone: 900, talisman: 8 },
    desc: '翻出祖师手札，字里行间都是捷径。解锁祖师殿。',
    effectDesc: '因此立得起祖师殿，香火更盛、人心更齐。',
    effects: { unlockBuildings: ['ancestorHall'] },
    needs: { upgrades: ['incenseStudy'], building: { id: 'incenseCauldron', count: 2 } },
  },
  {
    id: 'grottoArt',
    name: '洞天福地',
    glyph: '福',
    cost: { insight: 60000, stone: 3500, artifact: 12 },
    desc: '以空间节点锚定与内部折叠，在山上开一方小世界。解锁洞天与洞府。',
    effectDesc: '因此开得出洞天与洞府：一方自成一界，装得下也住得下。',
    effects: { unlockBuildings: ['grotto', 'caveDwelling'] },
    needs: { upgrades: ['buildingCode', 'capacityRune'], building: { id: 'depot', count: 2 } },
  },
  {
    id: 'longBreath',
    name: '龟息功',
    glyph: '龟',
    cost: { insight: 6000, stone: 5000, pill: 40 },
    desc: '闭门即是深山。离线收益上限 +8 小时。',
    effectDesc: '因此离山也在修行：离线八小时照样积攒。',
    effects: { offlineHours: 8 },
    needs: { upgrades: ['condenseArt'] },
  },
  {
    id: 'breathArt',
    name: '定息法',
    glyph: '息',
    cost: { insight: 18000, pill: 40, plank: 20 },
    desc: '把呼吸压到极缓，人在与不在，气机不断。',
    effectDesc: '因此离山也在修行：离线时间再多算八小时。',
    effects: { offlineHours: 8 },
    note: '效果：离线结算 +8 小时',
    needs: { upgrades: ['longBreath'] },
  },
  {
    id: 'trialArt',
    name: '试炼法',
    glyph: '炼',
    cost: { insight: 18000, pill: 60, herb: 2000 },
    desc: '以阵纹模拟雷劫，让弟子在安全处先尝一次天威。',
    effectDesc: '因此立得起试炼塔：弟子在塔中磨砺，出塔便是另一番气象。',
    effects: { unlockBuildings: ['trialTower'] },
    note: '解锁建筑：试炼塔',
    needs: { upgrades: ['buildingCode'] },
  },
  {
    id: 'gateRecord',
    name: '山门志',
    glyph: '志',
    cost: { insight: 30000, faith: 4000, artifact: 10 },
    desc: '把历年上山的弟子名录刻在石上，山门的名声就有了凭据。',
    effectDesc: '因此愿意上山的弟子更勤，宗门扩张更快。',
    effects: { arrivalBonus: 0.3 },
    note: '效果：弟子前来更快',
    needs: { upgrades: ['incenseStudy'] },
  },
  {
    id: 'spiritMortarArt',
    name: '混灵土工艺',
    glyph: '材',
    cost: { insight: 10000, stone: 100, spiritLiquid: 2 },
    desc: '研究灵液与灵石粉末的胶结固化，解锁拌制混灵土。',
    effects: { unlockBuildings: [] },
    needs: { upgrades: ['earthEssence', 'liquidArt'] },
  },
  {
    id: 'ironMortarArt',
    name: '玄铁骨架',
    glyph: '材',
    cost: { insight: 18000, spiritMortar: 4, ore: 100 },
    desc: '以玄铁骨架增强混灵土，解锁浇筑玄铁混灵土。',
    effects: { unlockBuildings: [] },
    needs: { upgrades: ['spiritMortarArt', 'steelWorking'] },
  },
  {
    id: 'mithrilArt',
    name: '秘银提炼',
    glyph: '材',
    cost: { insight: 30000, rock: 1000, qi: 1000 },
    desc: '辨识矿石中的储灵金属，解锁提炼秘银，供高级储灵设施使用。',
    effects: { unlockBuildings: [] },
    needs: { upgrades: ['prospectStudy', 'capacityRune'] },
  },
  {
    id: 'arcaneGoldArt',
    name: '玄金熔炼',
    glyph: '材',
    cost: { insight: 60000, mithril: 4, spiritLiquid: 8 },
    desc: '将秘银与玄铁浸炼为储灵合金，解锁熔炼玄金。',
    effects: { unlockBuildings: [] },
    needs: { upgrades: ['mithrilArt', 'compositeRune'] },
  },
  {
    id: 'crystalSilverArt',
    name: '晶银复合',
    glyph: '材',
    cost: { insight: 100000, crystal: 10, mithril: 5 },
    desc: '研究晶体—金属界面的精密灵场之介，稳定灵晶与秘银的复合，解锁复合晶银，用于顶级建筑的阵场控制之枢。',
    effects: { unlockBuildings: [] },
    needs: { upgrades: ['arcaneGoldArt', 'crystalPolishing'] },
  },


  // ============ 修真应用 · 营造 ============
  // 阵法 / 采石 / 营造的方法性条目：自技艺页迁入 5（id 不变）。
  // 保留境界门槛：境界决定能观察到、能操作的东西。
  {
    id: 'fieldTillage',
    name: '阵法精要',
    glyph: '耕',
    cost: { insight: 45, stone: 60, wood: 400 },
    desc: '阵纹怎么走更省灵气，阵徒心里最有数。掌握后可营造聚灵大阵。',
    effects: { ratio: { qi: 0.1 }, jobRatio: { farmer: 0.25 } },
    needs: { upgrades: ['qiGazing', 'qiArt'], building: { id: 'spiritField', count: 5 } },
  },
  {
    id: 'quarryArt',
    name: '凿石要诀',
    glyph: '凿',
    cost: { insight: 30, rock: 120, wood: 220 },
    desc: '顺纹下凿、量山取料，整块石料运下山也不碎一角。矿石产出 +30%。',
    effects: { ratio: { rock: 0.3 } },
    needs: { upgrades: ['qiOrigin'], building: { id: 'quarry', count: 2 } },
  },
  {
    id: 'homePlanning',
    name: '居所营造',
    glyph: '居',
    cost: { insight: 25, wood: 120, rock: 40 },
    desc: '按入住人数布置通风、采光与排水，掌握后可营造木屋与清风小院。居所每个已入住名额提供1点宜居度，空房不计；超出居所容量的弟子不受益。',
    effects: { habitabilityPerHousing: 1 },
    needs: { upgrades: ['qiOrigin'], buildings: [{ id: 'hut', count: 2 }, { id: 'library', count: 1 }, { id: 'quarry', count: 1 }] },
  },
  {
    id: 'waterSanitation',
    name: '引泉净水',
    glyph: '净',
    cost: { insight: 180, wood: 300, ore: 40 },
    desc: '引泉分流，净水与污水各循其道。宜居度 +6，元婴掌握混灵土后可营造净身灵池。',
    effects: { habitability: 6 },
    needs: { realm: 3, upgrades: ['homePlanning', 'prospectStudy'] },
  },
  {
    id: 'gardenDesign',
    name: '园林营造',
    glyph: '园',
    cost: { insight: 1200, spiritMortar: 4, plank: 10, crystal: 4 },
    desc: '顺山势划分静修与劳作区域，配合灵纹隔声。宜居度 +8，掌握玄铁混灵土后可营造清幽园林。',
    effects: { habitability: 8 },
    needs: { realm: 6, upgrades: ['waterSanitation', 'calmMind'] },
  },

  // ============ 修真应用 · 原理：资格 / 解锁型 ============
  // 自身不直接加数值，只作下游增益条目的资格前置，并附带解锁一座对应建筑。
  // 下游落库复用 needs.upgrades（见 docs/炼虚后变更文档.md 变更 2）；不接入首份产出来源。
  {
    id: 'etchTheory',
    name: '蚀刻原理',
    glyph: '蚀',
    cost: { insight: 8000, wood: 400, ore: 100 },
    desc: '以灵纹在载体上稳定刻蚀，蚀刻台由此立起；后续精修纹路、批量刻纹都以它为前提。',
    effectDesc: '因此刻得稳、刻得准：灵纹器具与定纹模刻可继续精研，并解锁蚀刻台。',
    effects: { unlockBuildings: ['etchTable'] },
    note: '解锁建筑：蚀刻台；作下游前置资格',
    needs: { upgrades: ['talismanArt', 'shapeRune'] },
  },
  {
    id: 'infuseTheory',
    name: '注灵原理',
    glyph: '注',
    cost: { insight: 10000, stone: 500, qi: 800 },
    desc: '把灵气稳定注入器物与金属载体，注灵台由此立起；高阶注灵加工以它为前提。',
    effectDesc: '因此注得进、留得住：御剑术可继续精研，并解锁注灵台。',
    effects: { unlockBuildings: ['infusionAltar'] },
    note: '解锁建筑：注灵台；作下游前置资格',
    needs: { upgrades: ['talismanArt', 'liquidArt'] },
  },
  {
    id: 'precipitateTheory',
    name: '凝析原理',
    glyph: '析',
    cost: { insight: 12000, crystal: 6, spiritLiquid: 6 },
    desc: '控制灵液析出与晶核生长，析晶台由此立起；晶纹精修与校准以它为前提。',
    effectDesc: '因此析得出匀净晶核：晶纹精修可继续精研，并解锁析晶台。',
    effects: { unlockBuildings: ['crystalBench'] },
    note: '解锁建筑：析晶台；作下游前置资格',
    needs: { upgrades: ['crystalCraft'] },
  },
  {
    id: 'temperTheory',
    name: '回火原理',
    glyph: '回',
    cost: { insight: 14000, steel: 6, artifact: 8 },
    desc: '以灵火回火调节器胚与钢料，回火炉由此立起；灵火冶炼等以它为前提。',
    effectDesc: '因此锻得出好器：灵火冶炼可继续精研，并解锁回火炉。',
    effects: { unlockBuildings: ['temperFurnace'] },
    note: '解锁建筑：回火炉；作下游前置资格',
    needs: { upgrades: ['forgeArt', 'steelWorking'] },
  },


]

/** 核心修真 + 可选模块（猎杀）贡献的山野研究（追加在末尾） */
export const CULTIVATION = [...CORE_CULTIVATION, ...HUNT_UPGRADES]

/** 两层合起来的完整列表：产出计算、解锁判定、文案都要用它 */
export const ALL_UPGRADES = [...CULTIVATION, ...TECHNIQUES]

/**
 * 修真页的分组（界面上按它分组显示）：主线五章 + 心法支线 + 材料七族 + 宗门经营。
 * 主线按「灵气的科学史」分章，章节感来自依赖链、灵机仓容与材料产业推进，分组只是导航；
 * 材料研究按族分「原理 → 工艺 → 精研」三层（方案见 docs/RESEARCH.md）。
 */
export const CULTIVATION_STAGES = [
  {
    key: 'qiSense',
    label: '灵气研究 Ⅰ 观气',
    hint: '灵气是什么、在哪、怎么聚',
    ids: ['qiOrigin', 'qiGazing', 'qiMeasure'],
  },
  {
    key: 'qiCondense',
    label: '灵气研究 Ⅱ 凝聚',
    hint: '怎么把灵气存住、存好',
    ids: ['qiLiquid', 'liquidArt', 'qiPurify', 'crystalTheory'],
  },
  {
    key: 'qiControl',
    label: '灵气研究 Ⅲ 调控',
    hint: '怎么引导、约束灵气',
    ids: ['astrologyArt', 'hourArt', 'arrayBasics', 'arrayMastery'],
  },
  {
    key: 'qiSplit',
    label: '灵气研究 Ⅳ 拆解',
    hint: '灵气由什么构成',
    ids: ['particleTheory', 'yinyangSplit', 'annihilationArt', 'energyApplication'],
  },
  {
    key: 'qiSource',
    label: '灵气研究 Ⅴ 归源',
    hint: '灵气与因果、飞升',
    ids: ['karmaSense', 'towerPlan', 'karmaConcord'],
  },
  {
    key: 'heartCultivation',
    label: '心法研究 · 心印与修持',
    hint: '节气凝液、心印承接与修持增益',
    ids: ['condenseArt', 'mindSeal', 'greatVehicleSeal', 'mahayanaArt'],
  },
  {
    key: 'matHerb',
    label: '材料研究 · 草木',
    hint: '原理 → 工艺 → 精研',
    ids: ['herbStudy', 'woodworking'],
  },
  {
    key: 'matOre',
    label: '材料研究 · 金铁',
    hint: '原理 → 工艺 → 精研',
    ids: ['prospectStudy', 'forgeArt', 'steelWorking', 'artifactLore', 'mithrilArt', 'arcaneGoldArt', 'crystalSilverArt'],
  },
  {
    key: 'matTalisman',
    label: '符文研究 · 刻纹与载体',
    hint: '原理 → 工艺 → 精研',
    ids: ['talismanArt', 'qiRune', 'shapeRune', 'conductionRune', 'arrayAssembly', 'guardRune', 'capacityRune', 'crystalCraft', 'crystalPolishing', 'compositeRune', 'talismanLore'],
  },
  {
    key: 'matAlchemy',
    label: '材料研究 · 丹道',
    hint: '原理 → 工艺',
    ids: ['alchemyArt'],
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
    ids: ['earthArt', 'earthEssence', 'spiritMortarArt', 'ironMortarArt', 'buildingCode'],
  },
  {
    key: 'matBeast',
    label: '材料研究 · 山野',
    hint: '原理 → 工艺 → 精研',
    ids: ['wildHunting', 'beastMaterialArt'],
  },
  {
    key: 'appBuild',
    label: '修真应用 · 营造',
    hint: '阵法 / 采石 / 营造的方法性条目',
    ids: ['fieldTillage', 'quarryArt', 'homePlanning', 'waterSanitation', 'gardenDesign'],
  },
  {
    key: 'appPrinciple',
    label: '修真应用 · 原理',
    hint: '蚀刻 / 注灵等科技原理（资格型，附带解锁建筑）',
    ids: ['etchTheory', 'infuseTheory', 'precipitateTheory', 'temperTheory'],
  },
  {
    key: 'sectOps',
    label: '宗门经营',
    hint: '制度、招募、离线与试炼',
    ids: [
      'preachArt',
      'talentAssignment',
      'calmMind',
      'recruitDrive',
      'mentorship',
      'intuition',
      'craftTempo',
      'ancestorArt',
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
