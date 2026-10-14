/**
 * 技艺与法宝 —— 通用增益层，对标猫国的「工坊升级」（workshop.js）。
 *
 * 2026-10 两线重组（方案见 docs/RESEARCH.md）后，本页只保留两类条目：
 *   技艺（kind 省略）      ：自己练出来的手艺 —— 通用产量、仓储、灵机、防灾等增益，
 *                           门禁看建筑（藏经阁、药圃…），彼此串成链；
 *                           配方知识在修真页，设备扩产、节料与专业增益在本页。
 *   法宝（kind: 'treasure'）：炼成的器物，**门禁看修真**（`needs.upgrades` 指向修真节点），
 *                            每件给一条明确的加成，是「研究出成果 → 炼成器物」的闭环
 *
 * 两者共用「灵机」货币；技艺之间也会串成链（引气诀 → 阵法精要 → 灵泉灌溉），
 * 这棵树就是猫国工坊升级那种「一层层推」的推进感。
 */
import { insertAfter } from './modules.js'
import { HUNT_TECHNIQUES, HUNT_TECHNIQUE_ANCHOR } from '../modules/hunting/data.js'

const CORE_TECHNIQUES = [
  // 研究成果的应用升级：保留原有 ID、费用和效果，归入工坊式技艺层。
  {
    id: 'breakthroughArt',
    name: '破境心法',
    glyph: '破',
    cost: { insight: 2000, stone: 1500, pill: 30 },
    desc: '破境时少走弯路，花费降低 15%。',
    effectDesc: '因此破境时省下一成半材料，冲关更从容。',
    effects: { breakthroughDiscount: 0.15 },
    needs: { upgrades: ['qiGazing', 'alchemyArt', 'alchemyFire', 'earthArt', 'qiLiquid'] },
  },
  {
    id: 'waterworkshop',
    name: '流水作坊',
    glyph: '流',
    cost: { insight: 900, plank: 30, ore: 600 },
    desc: '引山泉推水轮，锯木与拌料共用木作工位。金丹起木作加工容量 +50%，原料不足时停机待料。',
    effects: { processingCapacityRatio: { woodwork: 0.5 } },
    needs: { upgrades: ['woodworking', 'intuition', 'arrayAssembly'] },
  },
  {
    id: 'spiritSaw',
    name: '灵纹锯阵',
    glyph: '锯',
    cost: { insight: 32000, plank: 80, steel: 20, crystal: 15 },
    desc: '以灵纹驱动锯阵。金丹起木作加工容量 +100%，解板加工效率 +50%；每份木板灵木用量减少15%，扩产仍需稳定供料。',
    effects: { processingCapacityRatio: { woodwork: 1 }, craftSpeedByRecipe: { sawPlank: 0.5 }, craftCostReduction: { sawPlank: 0.15 } },
    // 造价含灵晶，而灵晶要「凝晶原理 → 凝晶工艺」才产得出：列进前置，避免先露面却找不到来源。
    needs: { upgrades: ['timberCraft', 'waterworkshop', 'crystalCraft'] },
  },
  {
    id: 'spiritCultivation',
    name: '百草育灵',
    glyph: '育',
    cost: { insight: 28000, pill: 80, immortalHerb: 15, crystal: 15 },
    desc: '轮作养地，提纯药性。灵草产出 +95%，丹药制作产出 +50%，仙草制作产出 +30%。',
    effects: { ratio: { herb: 0.95 }, craftBonusByResource: { pill: 0.5, immortalHerb: 0.3 } },
    // 造价含灵晶，而灵晶要「凝晶原理 → 凝晶工艺」才产得出：列进前置，避免先露面却找不到来源。
    needs: { upgrades: ['herbRotation', 'alchemyFire', 'crystalCraft'] },
  },
  {
    id: 'swordFlight',
    name: '御剑术',
    glyph: '剑',
    cost: { insight: 12000, ore: 4000, artifact: 18, steel: 6 },
    desc: '御剑运木探矿，剑火淬炼器胚。灵木与玄铁产出 +20%，法器、灵器与灵宝制作产出 +10%。',
    effects: { ratio: { wood: 0.2, ore: 0.2 }, craftBonusByResource: { artifact: 0.1, spiritArtifact: 0.1, spiritTreasure: 0.1 } },
    // 御剑术与灵流要诀分别承接高阶与基础产能投资。
    needs: { upgrades: ['deepShaft', 'steelWorking', 'infuseTheory'], building: { id: 'forge', count: 3 } },
  },
  {
    id: 'spiritSmelting',
    name: '灵火冶炼',
    glyph: '冶',
    cost: { insight: 36000, steel: 25, artifact: 40, crystal: 15 },
    desc: '灵场调节炉温与淬炼节拍。金丹起炼器加工容量 +100%，淬钢加工效率 +50%；玄钢每份耗料减少15%，法器与灵器减少10%。整枚材料向上取整。',
    effects: { processingCapacityRatio: { forge: 1 }, craftSpeedByRecipe: { refineSteel: 0.5 }, craftCostReduction: { refineSteel: 0.15, forgeArtifact: 0.1, forgeSpiritArtifact: 0.1 } },
    needs: { upgrades: ['deepShaft', 'steelWorking', 'swordFlight', 'temperTheory'] },
  },
  {
    id: 'alchemyFire',
    name: '丹火纯青',
    glyph: '火',
    cost: { insight: 270, herb: 900, pill: 6 },
    desc: '火候拿捏到分毫不差，出炉的成色都不一样。丹药与九转丹制作产出 +5%。',
    effects: { craftBonusByResource: { pill: 0.05, nineTurnPill: 0.05 } },
    needs: { upgrades: ['alchemyArt', 'forgeArt'], building: { id: 'alchemyRoom', count: 1 } },
  },
  {
    id: 'flowField',
    name: '灵流要诀',
    glyph: '流',
    cost: { insight: 1800, wood: 200, ore: 120 },
    desc: '把山间灵流理成沟渠，樵夫、采药人与矿工顺着流势干活，原料自己多出一截。灵木、灵草与玄铁产出各 +30%。',
    effects: { ratio: { wood: 0.3, herb: 0.3, ore: 0.3 } },
    // 研究按灵机费用与仓容推进；建筑、配方保留各自条件。
    needs: { upgrades: ['woodworking', 'herbStudy'] },
  },
  {
    id: 'spiritCanal',
    name: '灵渠网络',
    glyph: '渠',
    cost: { insight: 6000, wood: 800, rock: 400 },
    desc: '把山间灵流引成渠网，木、药与矿料顺流而下。灵木、灵草与玄铁产出 +25%。',
    effectDesc: '因此采集顺着流势走：灵木、灵草与玄铁产出各 +25%。',
    effects: { ratio: { wood: 0.25, herb: 0.25, ore: 0.25 } },
    needs: { upgrades: ['flowField'] },
  },
  {
    id: 'liquidIrrigation',
    name: '灵液灌圃',
    glyph: '圃',
    cost: { insight: 9000, spiritLiquid: 8, herb: 800 },
    desc: '以灵液按节气灌圃，药性更足。灵草产出 +40%。',
    effectDesc: '因此圃中灵草更盛：灵草产出 +40%。',
    effects: { ratio: { herb: 0.4 } },
    needs: { upgrades: ['spiritCanal', 'liquidArt'] },
  },
  {
    id: 'veinInfuse',
    name: '矿脉通灵',
    glyph: '脉',
    cost: { insight: 8000, stone: 600, ore: 400 },
    desc: '以灵流疏通矿脉，矿石与灵石更易采出。矿石与灵石产出 +25%。',
    effectDesc: '因此矿脉贯通：矿石与灵石产出各 +25%。',
    effects: { ratio: { ore: 0.25, stone: 0.25 } },
    needs: { upgrades: ['prospectStudy', 'spiritCanal'] },
  },
  {
    id: 'liquidVault',
    name: '液藏之术',
    glyph: '藏',
    cost: { insight: 12000, spiritLiquid: 12, plank: 20 },
    desc: '玉瓶封灵、晶格分藏，灵液与灵晶存得更久更多。灵液、灵晶仓容 +100%。',
    effectDesc: '因此灵液与灵晶存得住：两者仓容 +100%。',
    effects: { storageRatio: { spiritLiquid: 1, crystal: 1 } },
    needs: { upgrades: ['qiPurify'] },
  },
  {
    id: 'runeVault',
    name: '符匣分装',
    glyph: '匣',
    cost: { insight: 16000, talisman: 20, plank: 30 },
    desc: '符匣、阵基与灵符分格收存，互不压损。符箓、灵符与阵基仓容 +100%。',
    effectDesc: '因此符箓、灵符与阵基存得住：三者仓容 +100%。',
    effects: { storageRatio: { talisman: 1, spiritTalisman: 1, arrayBase: 1 } },
    needs: { upgrades: ['arrayAssembly'] },
  },
  {
    id: 'treasureVault',
    name: '器药藏法',
    glyph: '龛',
    cost: { insight: 20000, artifact: 12, pill: 30 },
    desc: '器架设禁、药龛封灵，法器与丹药各得其所。法器、灵器、灵宝、丹药与九转丹仓容 +100%。',
    effectDesc: '因此法器与丹药存得住：相关成品仓容 +100%。',
    effects: { storageRatio: { artifact: 1, spiritArtifact: 1, spiritTreasure: 1, pill: 1, nineTurnPill: 1 } },
    needs: { upgrades: ['forgeArt', 'alchemyFire'] },
  },
  {
    id: 'particleRecover',
    name: '分子回用',
    glyph: '回',
    cost: { insight: 90000, crystal: 20, arrayBase: 8 },
    desc: '优化输运与回收，减少离析出的分子逸散。灵气分子产出 +30%。分子回用不等于耗气降低。',
    effectDesc: '因此分子少逸散：灵气分子产出 +30%。',
    effects: { ratio: { qiParticle: 0.3 } },
    needs: { upgrades: ['yinyangSplit'] },
  },
  {
    id: 'energyDrive',
    name: '灵能引采',
    glyph: '引',
    cost: { insight: 150000, steel: 20, crystal: 30 },
    desc: '以灵能驱动采集法器，灵木、灵草、玄铁、矿石与灵石产出各 +25%；需持续供能，按实际供能缩放，断供停效。',
    effectDesc: '因此采集靠灵能提速：五类原料产出各 +25%，按供能比例生效。',
    effects: { ratio: { wood: 0.25, herb: 0.25, ore: 0.25, rock: 0.25, stone: 0.25 } },
    // 持续用能：接入灵能后消耗 qiEnergy，断供或停用即失效（数值待测）。
    upkeep: { qiEnergy: 0.05 },
    note: '持续用能：断供或停用时失效',
    needs: { upgrades: ['energyApplication'] },
  },

  {
    id: 'heatExchange', name: '冷凝换热', glyph: '冷',
    cost: { insight: 4800, steel: 6, arrayBase: 4, spiritLiquid: 10 },
    desc: '以晶核阵循环冷凝余热。每座运行中的晶核阵提供的冷却容量翻倍；高负荷加工共用冷却回路，散热不足时自动降载。',
    effects: { processingCoolingRatio: 1 },
    needs: { realm: 6, upgrades: ['liquidReflux', 'crystalCraft'], building: { id: 'crystalArray', count: 1 } },
  },
  // ---------- 工程技艺：设备容量、加工效率与单位耗料 ----------
  {
    id: 'arrayStandards', name: '阵基规制', glyph: '规',
    cost: { insight: 600, plank: 6, ore: 150 },
    desc: '统一阵基尺寸与导灵接口，减少装配对位时间。阵基加工效率 +50%；不改变每份用料与收益。',
    effects: { craftSpeedByRecipe: { assembleArrayBase: 0.5 } },
    needs: { realm: 4, upgrades: ['arrayAssembly'], building: { id: 'talismanHall', count: 1 } },
  },
  {
    id: 'liquidReflux', name: '凝液回流', glyph: '回',
    cost: { insight: 1800, steel: 4, arrayBase: 3 },
    desc: '在凝液工位加设回流纹，捕集未凝气流。每份灵液耗气减少15%，手动与自动凝液均适用。',
    effects: { craftCostReduction: { condenseLiquid: 0.15 } },
    needs: { realm: 5, upgrades: ['liquidArt', 'steelWorking'] },
  },
  {
    id: 'runeStamping', name: '定纹模刻', glyph: '模',
    cost: { insight: 2400, steel: 6, arrayBase: 4, crystal: 3 },
    desc: '以预制纹模重复刻制标准构件。符箓与阵基加工效率 +100%；灵符仍需精密刻纹，继续共用符箓堂容量。',
    effects: { craftSpeedByRecipe: { drawTalisman: 1, assembleArrayBase: 1 } },
    // 造价里的灵晶要「凝晶工艺」才产得出：把该工艺列进前置，避免条目先露面却找不到来源。
    needs: { realm: 5, upgrades: ['arrayStandards', 'shapeRune', 'crystalCraft', 'etchTheory'], building: { id: 'talismanHall', count: 2 } },
  },
  // ---------- 单族技艺：由「修真应用·原理」资格承接 ----------
  {
    id: 'runeTools', name: '灵纹器具', glyph: '器',
    cost: { insight: 10000, talisman: 8, plank: 20 },
    desc: '以标准灵纹器具批量刻制符箓与阵基。符箓、阵基制作产出 +20%。',
    effects: { craftBonusByResource: { talisman: 0.2, arrayBase: 0.2 } },
    needs: { upgrades: ['qiRune', 'arrayAssembly', 'etchTheory'] },
  },
  {
    id: 'crystalCalib', name: '晶纹校准', glyph: '校',
    cost: { insight: 12000, crystal: 8, talisman: 20 },
    desc: '校准晶纹间距与灵液配比。灵液、灵晶制作产出 +20%。',
    effects: { craftBonusByResource: { spiritLiquid: 0.2, crystal: 0.2 } },
    needs: { upgrades: ['crystalCraft', 'crystalPolishing', 'precipitateTheory'] },
  },
  {
    id: 'forgeApp', name: '灵火锻采', glyph: '锻',
    cost: { insight: 14000, steel: 6, artifact: 10 },
    desc: '灵火助锻、灵场选矿。玄铁产出 +20%，玄钢制作产出 +20%。',
    effects: { ratio: { ore: 0.2 }, craftBonusByResource: { steel: 0.2 } },
    needs: { upgrades: ['steelWorking', 'spiritSmelting', 'temperTheory'] },
  },
  // 自修真页迁入：阵道精通的成果兑现，灵气主线的增益出口
  {
    id: 'arrayRefine', name: '阵纹精研', glyph: '纹',
    cost: { insight: 80000, talisman: 45, artifact: 20, crystal: 20 },
    desc: '一横一竖都有讲究。灵气产出 +60%，阵基、灵晶与灵符制作产出 +30%，符箓制作产出 +20%。',
    effects: { ratio: { qi: 0.6 }, craftBonusByResource: { arrayBase: 0.3, crystal: 0.3, spiritTalisman: 0.3, talisman: 0.2 } },
    needs: { upgrades: ['arrayMastery'] },
  },
  // ---------- 采集与种植：四条基础线 ----------
  {
    id: 'qiArt',
    name: '引气诀',
    glyph: '引',
    cost: { insight: 6, wood: 120 },
    desc: '最粗浅的吐纳法门，却是一切的开端。灵气产出 +10%。',
    effects: { ratio: { qi: 0.1 } },
    needs: { upgrades: ['qiOrigin'], building: { id: 'library', count: 1 } },
  },
  {
    id: 'forestryArt',
    name: '伐木要术',
    glyph: '伐',
    cost: { insight: 9, wood: 260 },
    desc: '顺纹下斧，省力三成。灵木产出 +20%。',
    effects: { ratio: { wood: 0.2 } },
    needs: { upgrades: ['woodworking'], building: { id: 'lumberYard', count: 1 } },
  },
  {
    id: 'prospectArt',
    name: '矿脉经',
    glyph: '脉',
    cost: { insight: 45, ore: 120, wood: 300 },
    desc: '看石色便知矿脉走向。玄铁产出 +20%。',
    effects: { ratio: { ore: 0.2 } },
    // 修真页另有「探矿术」（开放炼铁炉），这里改名避免同名混淆
    needs: { building: { id: 'ironFurnace', count: 3 } },
  },
  {
    id: 'herbLore',
    name: '百草辨',
    glyph: '辨',
    cost: { insight: 45, herb: 150, wood: 300 },
    desc: '识得三百味灵草，采药不再空手而归。灵草产出 +20%。',
    effects: { ratio: { herb: 0.2 } },
    needs: { building: { id: 'herbGarden', count: 3 } },
  },
  // ---------- 四条线的第二层（链式前置） ----------
  {
    id: 'timberCraft',
    name: '铁木工艺',
    glyph: '铁',
    cost: { insight: 90, wood: 900, ore: 120 },
    desc: '用玄铁加固斧柄锯条，伐木快得不像话。灵木产出 +25%。',
    effects: { ratio: { wood: 0.25 } },
    needs: { upgrades: ['forestryArt'], building: { id: 'ironFurnace', count: 1 } },
  },
  {
    id: 'mountainChant',
    name: '入山谣',
    glyph: '谣',
    cost: { insight: 70, wood: 450 },
    desc: '樵夫的号子顺着山势走，一唱一和，斧子就轻了三分。樵夫产出 +30%。',
    effects: { jobRatio: { woodcutter: 0.3 } },
    needs: { upgrades: ['forestryArt'], building: { id: 'lumberYard', count: 3 } },
  },
  {
    id: 'deepShaft',
    name: '深邃坑道',
    glyph: '深',
    cost: { insight: 190, ore: 700, wood: 300 },
    desc: '顺着矿脉往深处打，玄铁自己往外冒。玄铁产出 +25%。',
    effects: { ratio: { ore: 0.25 } },
    needs: { upgrades: ['prospectArt'], building: { id: 'ironFurnace', count: 6 } },
  },
  {
    id: 'herbRotation',
    name: '药圃轮作',
    glyph: '轮',
    cost: { insight: 160, herb: 700, wood: 240 },
    desc: '四时轮种、地力不竭。灵草产出 +25%。',
    effects: { ratio: { herb: 0.25 } },
    needs: { upgrades: ['herbLore'], building: { id: 'herbGarden', count: 6 } },
  },
  {
    id: 'dewNurtureArt',
    name: '露培法',
    glyph: '培',
    cost: { insight: 220, herb: 800, spiritLiquid: 4 },
    desc: '晨露未干时下圃培土，仙草成活率高出一截。仙草制作产出 +15%。',
    effects: { craftBonusByResource: { immortalHerb: 0.15 } },
    needs: { upgrades: ['herbRotation'], building: { id: 'herbGarden', count: 5 } },
  },
  {
    id: 'spiritIrrigation',
    name: '灵泉灌溉',
    glyph: '泉',
    cost: { insight: 270, stone: 500, wood: 1200 },
    desc: '沿聚灵大阵梳理田间气脉，让引气与灌溉相互滋养。灵气产出 +15%。',
    effects: { ratio: { qi: 0.15 } },
    needs: { upgrades: ['fieldTillage'], building: { id: 'gatheringArray', count: 1 } },
  },

  // ---------- 仓储 ----------
  {
    id: 'caseStackArt',
    name: '叠匣术',
    glyph: '叠',
    cost: { insight: 420, stone: 1500, wood: 900, talisman: 3 },
    desc: '分格装箱、依尺寸码放，减少空隙与搬运损耗。通用仓储 +1200，成品按层级折算。',
    // 灵机仓容百分比：定额给建筑，比例给技艺与研究应用（后者如 upgrades.js 的液藏之术 / 符匣分装），分工明确。
    effects: { storageAll: 1200, storageRatio: { insight: 0.3 } },
    // 造价含符箓，而符箓要「符文入门 → 符箓堂」才产得出：列进前置，避免先露面却找不到来源。
    needs: { building: { id: 'warehouse', count: 1 }, upgrades: ['talismanArt'] },
  },

  // 仓储·加固线（对标猫国 Reinforced/Titanium/Alloy Warehouse 一条线）：
  // 对**已建成的仓储**再乘一遍上限 —— 同样几座库房，越到后期存得越多，
  // 不必靠盖几十座谷仓去顶破境要的那笔灵气。定额给建筑，比例给技艺与研究应用（见 caseStackArt 注）。
  {
    id: 'storeFrameArt',
    name: '加固仓架',
    glyph: '固',
    cost: { insight: 260, wood: 400, rock: 300 },
    desc: '横梁加铁箍、立柱下石础，同样一间仓房能多堆两成。灵气与基础物资上限 +20%。',
    effects: { storageRatio: { qi: 0.2, wood: 0.2, rock: 0.2, stone: 0.2, ore: 0.2, herb: 0.2 } },
    needs: { realm: 3 },
  },
  {
    id: 'storeStoneArt',
    name: '叠石固本',
    glyph: '叠',
    cost: { insight: 1400, stone: 4000, ore: 2000 },
    desc: '以灵石垒基、玄铁锁边。灵气与基础物资上限再 +35%，玄钢、木板、灵液、灵晶另 +50%。',
    effects: {
      storageRatio: { qi: 0.35, wood: 0.35, rock: 0.35, stone: 0.35, ore: 0.35, herb: 0.35, steel: 0.5, plank: 0.5, crystal: 0.5, spiritLiquid: 0.5 },
    },
    needs: { realm: 5, upgrades: ['storeFrameArt'] },
  },
  {
    id: 'storeVoidArt',
    name: '须弥纳芥',
    glyph: '芥',
    cost: { insight: 6000, stone: 12000, plank: 60, crystal: 20 },
    desc: '一芥子可纳须弥。灵气与基础物资上限再 +60%，玄钢/木板/灵液/灵晶/阵基/符箓/法器翻倍。',
    effects: {
      storageRatio: {
        qi: 0.6, wood: 0.6, rock: 0.6, stone: 0.6, ore: 0.6, herb: 0.6,
        steel: 1, plank: 1, crystal: 1, spiritLiquid: 1, arrayBase: 1, talisman: 1, artifact: 1, pill: 1,
      },
    },
    needs: { realm: 7, upgrades: ['storeStoneArt', 'capacityRune'] },
  },

  // ---------- 香火 ----------
  {
    id: 'incensePower',
    name: '香火愿力',
    glyph: '愿',
    cost: { insight: 120, faith: 200, wood: 800 },
    desc: '香客的念力也是力。香火产出 +30%。',
    effects: { ratio: { faith: 0.3 } },
    needs: { building: { id: 'gate', count: 2 } },
  },
  {
    id: 'ancestorIncense',
    name: '祖师香火',
    glyph: '祖',
    cost: { insight: 480, faith: 900, talisman: 12, wood: 1500 },
    desc: '祖师殿里那一炉香，从早到晚没断过。香火产出 +20%。',
    effects: { ratio: { faith: 0.2 } },
    needs: { upgrades: ['incensePower'], building: { id: 'incenseCauldron', count: 2 } },
  },
  {
    id: 'incenseRite',
    name: '迎香礼',
    glyph: '礼',
    cost: { insight: 130, faith: 150, wood: 500 },
    desc: '山门迎香有一套礼数，香客走得顺，香使收得也稳。香使产出 +35%。',
    effects: { jobRatio: { incenseKeeper: 0.35 } },
    needs: { upgrades: ['incensePower'], building: { id: 'gate', count: 3 } },
  },

  // ---------- 宜居度 ----------
  {
    id: 'bondKnot',
    name: '同心结',
    glyph: '结',
    cost: { insight: 90, wood: 400, faith: 100 },
    desc: '同门腰间都佩一枚结，人心齐了，干活也带劲。宜居度 +4。',
    effects: { habitability: 4 },
    // 造价里的香火要「香火愿 → 山门 → 香使」才产得出：列进前置，避免先露面却找不到来源。
    needs: { building: { id: 'logHouse', count: 3 }, upgrades: ['incenseVow'] },
  },

  // ---------- 灵机 ----------
  {
    id: 'oralTeaching',
    name: '口传心授',
    glyph: '授',
    cost: { insight: 35, wood: 400 },
    desc: '当面讲解、抄录归档。灵机产出 +10%，典籍库自身提供的灵机上限 +40%。',
    effects: { ratio: { insight: 0.1 }, buildingStorageRatio: { scriptureArchive: 0.4 } },
    needs: { upgrades: ['qiOrigin'], building: { id: 'library', count: 1 } },
  },
  {
    id: 'starReading',
    name: '星象推演',
    glyph: '象',
    cost: { insight: 110, talisman: 8, herb: 300 },
    desc: '把星轨当算筹，推得比抄书快。灵机产出 +15%。',
    effects: { ratio: { insight: 0.15 }, storageRatio: { insight: 0.5 } },
    needs: { upgrades: ['oralTeaching'], building: { id: 'academy', count: 1 } },
  },
  {
    id: 'zuowangArt',
    name: '坐忘功',
    glyph: '忘',
    cost: { insight: 150, wood: 600, stone: 300 },
    desc: '坐忘则神凝，悟道者一坐便是一昼夜。悟道者产出 +35%。',
    effects: { jobRatio: { scholar: 0.35 }, storageRatio: { insight: 0.6 } },
    needs: { upgrades: ['starReading'], building: { id: 'library', count: 5 } },
  },

  // ============================================================
  // 法宝（kind: 'treasure'）—— 由修真研究解锁，炼成后给一条加成
  // ============================================================

  {
    id: 'spiritBanner',
    name: '聚灵幡',
    glyph: '幡',
    kind: 'treasure',
    cost: { insight: 45, wood: 600, stone: 200 },
    refine: { insight: 150 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花灵机
    desc: '按灵源考的图样缝成的幡，为气田与药圃引来灵气。灵气与灵草产出 +10%。',
    // 原「聚灵幡」的灵气 +15% 并入此处（法宝收窄，效果不丢）
    effects: { ratio: { qi: 0.25, herb: 0.1 } },
    needs: { upgrades: ['qiOrigin'] },
  },
  {
    id: 'alchemyCauldron',
    name: '九转丹炉',
    glyph: '炉',
    kind: 'treasure',
    cost: { insight: 150, pill: 10, herb: 600, stone: 400 },
    refine: { insight: 500, materials: { immortalHerb: 5,  nineTurnPill: 1 }, materialFromLevel: 2 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花灵机
    desc: '炼丹术推演出的炉子，火候不必再靠手感。丹药与九转丹制作产出 +8%。',
    // 原「凝露瓶」的效果并入此处：灵液制作 +15%（法宝数量收窄，效果不丢）
    // 原「凝露瓶」的灵液 +15% 与原「百草葫芦」的灵草 +30% 都并入此处（法宝收窄，效果不丢）
    effects: { craftBonusByResource: { pill: 0.08, nineTurnPill: 0.08, spiritLiquid: 0.15 }, ratio: { herb: 0.3 } },
    needs: { upgrades: ['alchemyArt'], building: { id: 'alchemyRoom', count: 1 } },
  },

  {
    id: 'flyingSword',
    name: '飞剑',
    glyph: '剑',
    kind: 'treasure',
    cost: { insight: 450, artifact: 14, ore: 2000, stone: 1500 },
    refine: { insight: 1500, materials: { steel: 2, spiritArtifact: 1 }, materialFromLevel: 2 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花灵机
    desc: '剑光穿林破岩，也可分割器胚。灵木与玄铁产出 +40%，法器与灵器制作产出 +15%。',
    effects: { ratio: { wood: 0.4, ore: 0.4 }, craftBonusByResource: { artifact: 0.15, spiritArtifact: 0.15 } },
    needs: { upgrades: ['forgeArt'] },
  },


  {
    id: 'wardTalisman',
    name: '镇岳符',
    glyph: '镇',
    kind: 'treasure',
    cost: { insight: 180, talisman: 12, wood: 1000, stone: 500 },
    refine: { insight: 600 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花灵机
    desc: '以镇守纹稳住林木与药圃的气机。灵木、灵草灾损额外减免各15%，与护山大阵合计最多减免80%。',
    effects: { disasterGuardByResource: { wood: 0.15, herb: 0.15 } },
    needs: { upgrades: ['talismanArt', 'talismanLore'] },
  },
  {
    id: 'jadeSlip',
    name: '传音玉简',
    glyph: '简',
    kind: 'treasure',
    cost: { insight: 180, stone: 800, talisman: 6 },
    refine: { insight: 600 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花灵机
    desc: '把讲经堂的道理刻进玉里，弟子各自回去听。灵机产出 +15%。',
    effects: { ratio: { insight: 0.15 } },
    needs: { upgrades: ['preachArt'] },
  },
  {
    id: 'astrolabe',
    name: '观星盘',
    glyph: '盘',
    kind: 'treasure',
    cost: { insight: 330, stone: 1500, artifact: 6 },
    refine: { insight: 1100 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花灵机
    desc: '照着星轨铸成的盘，推演天时不用再抬头。灵机产出 +20%。',
    effects: { ratio: { insight: 0.2 } },
    needs: { upgrades: ['astrologyArt'] },
  },
  {
    id: 'calmMat',
    name: '静心蒲团',
    glyph: '蒲',
    kind: 'treasure',
    cost: { insight: 270, herb: 1400, wood: 1200, stone: 800 },
    refine: { insight: 900 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花灵机
    desc: '坐在上面杂念自消，弟子也不那么爱闹了。宜居度 +5。',
    effects: { habitability: 5 },
    needs: { upgrades: ['calmMind'] },
  },
  {
    id: 'dustBell',
    name: '清尘铃',
    glyph: '尘',
    kind: 'treasure',
    cost: { insight: 120, wood: 300, ore: 80, talisman: 2 },
    refine: { insight: 400, materials: { ore: 25 }, materialFromLevel: 1 },
    desc: '玄铁铃铭刻固形纹，引导尘埃沉降，让居所保持洁净。宜居度 +6，祭炼可提高效果。',
    effects: { habitability: 6 },
    needs: { realm: 4, upgrades: ['forgeArt', 'shapeRune'] },
  },
  {
    id: 'peaceBanner',
    name: '安居灵幡',
    glyph: '安',
    kind: 'treasure',
    cost: { insight: 900, plank: 8, spiritTalisman: 3, spiritLiquid: 6 },
    refine: { insight: 3000, materials: { spiritTalisman: 1 }, materialFromLevel: 1 },
    desc: '灵木幡杆承载复合符文，灵符调节居所气机，静修与日常起居互不相扰。宜居度 +10，祭炼可提高效果。',
    effects: { habitability: 10 },
    needs: { realm: 6, upgrades: ['compositeRune', 'calmMind'] },
  },
  {
    id: 'mountainPlate',
    name: '护山阵盘',
    glyph: '盘',
    kind: 'treasure',
    cost: { insight: 660, ore: 2500, talisman: 10, stone: 2200 },
    refine: { insight: 2200, materials: { arrayBase: 2, spiritTalisman: 1 }, materialFromLevel: 1 },
    desc: '统筹刻纹时的气机流向，让阵材制作更少损耗。阵基制作产出 +20%，灵符制作产出 +15%。',
    effects: { craftBonusByResource: { arrayBase: 0.2, spiritTalisman: 0.15 } },
    needs: { upgrades: ['arrayBasics', 'artifactLore'] },
  },
  {
    id: 'vowCauldron',
    name: '聚愿鼎',
    glyph: '鼎',
    kind: 'treasure',
    cost: { insight: 720, faith: 2000, talisman: 12, stone: 2000 },
    refine: { insight: 2400 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花灵机
    desc: '祖师殿里那口鼎，把香客的愿力收得更干净。香火产出 +40%。',
    effects: { ratio: { faith: 0.4 } },
    needs: { upgrades: ['ancestorArt'] },
  },
  {
    id: 'voidRing',
    name: '纳物戒',
    glyph: '戒',
    kind: 'treasure',
    cost: { insight: 1800, stone: 7000, artifact: 25, wood: 4000 },
    refine: { insight: 6000, materials: { spiritTreasure: 1 }, materialFromLevel: 2 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花灵机
    desc: '洞天福地的小成之作：以纳物戒补足各类仓储。每层通用仓储 +500，成品按层级折算。',
    effects: { storageAll: 500 },
    needs: { upgrades: ['grottoArt'] },
  },
  {
    id: 'zhenyueSeal',
    name: '镇岳印',
    glyph: '印',
    kind: 'treasure',
    cost: { insight: 3600, talisman: 50, artifact: 35, ore: 8000, stone: 11000 },
    refine: { insight: 12000 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花灵机
    desc: '镇住山脉气眼与矿纹。灵气产出 +80%，玄铁与灵石产出 +60%，阵基与灵符制作产出 +40%。',
    effects: { ratio: { qi: 0.8, ore: 0.6, stone: 0.6 }, craftBonusByResource: { arrayBase: 0.4, spiritTalisman: 0.4 } },
    needs: { upgrades: ['arrayMastery'] },
  },

  // ============================================================
  // v0.16 扩充 —— 凝聚／精研的成果器物 + 粒子链法宝
  //（主线「拆解」一章首次有可祭炼器物，解锁段自筑基铺到大乘）
  // ============================================================

  {
    id: 'crystalLamp',
    name: '七宝晶灯',
    glyph: '灯',
    kind: 'treasure',
    cost: { insight: 600, crystal: 4, talisman: 12 },
    refine: { insight: 1800 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花灵机
    desc: '晶纹精修的成品：七枚灵晶为芯，灯焰不摇，晶核成色更匀。灵晶制作产出 +20%。',
    effects: { craftBonusByResource: { crystal: 0.2 } },
    needs: { upgrades: ['crystalPolishing'] },
  },
  {
    id: 'trialBell',
    name: '试炼钟',
    glyph: '钟',
    kind: 'treasure',
    cost: { insight: 950, artifact: 6, steel: 3 },
    refine: { insight: 2900 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花灵机
    desc: '试炼塔的晨钟：钟声一响，闻声而起，塔里塔外宜居度回稳。宜居度 +8。',
    effects: { habitability: 8 },
    needs: { upgrades: ['trialArt'] },
  },
  {
    id: 'starHammer',
    name: '锻星锤',
    glyph: '锤',
    kind: 'treasure',
    cost: { insight: 1300, ore: 3000, steel: 6, artifact: 12 },
    refine: { insight: 4200 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花灵机
    desc: '器道精微的产物：锤面星纹密布，玄钢折叠九次不起一层杂质。玄钢制作产出 +20%，灵器制作产出 +10%。',
    effects: { craftBonusByResource: { steel: 0.2, spiritArtifact: 0.1 } },
    needs: { upgrades: ['artifactLore'] },
  },
  {
    id: 'dipoleChest',
    name: '灵气分子匣',
    glyph: '匣',
    kind: 'treasure',
    cost: { insight: 1500, crystal: 20, arrayBase: 5 },
    refine: { insight: 5000 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花灵机
    desc: '《灵子论》的成果：匣中纹路收集离析出的灵气分子，减少输送逸散、提高有效回收量。灵气分子产出 +25%。',
    effects: { ratio: { qiParticle: 0.25 } },
    needs: { upgrades: ['particleTheory'] },
  },
  {
    id: 'yinyangPendant',
    name: '阴阳双鱼佩',
    glyph: '鱼',
    kind: 'treasure',
    cost: { insight: 1800, spiritArtifact: 3, crystal: 30 },
    refine: { insight: 5600, materials: { qiParticle: 8 }, materialFromLevel: 1 }, // 祭炼追加灵气分子，正合其题
    desc: '一玉双鲤，首尾相衔。两极之势引导解离后的正负灵子分流，减少复合与输送损耗。正灵子与负灵子产出 +20%。',
    effects: { ratio: { yangParticle: 0.2, yinParticle: 0.2 } },
    needs: { upgrades: ['yinyangSplit'] },
  },
  {
    id: 'annihilationLamp',
    name: '湮灭心灯',
    glyph: '焰',
    kind: 'treasure',
    cost: { insight: 2200, spiritArtifact: 4, nineTurnPill: 8 },
    refine: { insight: 6800, materials: { yangParticle: 4, yinParticle: 4 }, materialFromLevel: 1 }, // 灯芯吃的就是一对正负灵子
    desc: '灯芯稳住湮灭之势，持续成对供料才能维持灯焰，提高可回收灵能、减少散失。灵能产出 +30%。',
    effects: { ratio: { qiEnergy: 0.3 } },
    needs: { upgrades: ['annihilationArt'] },
  },
  {
    id: 'energyCore',
    name: '灵能枢',
    glyph: '枢',
    kind: 'treasure',
    cost: { insight: 2600, steel: 12, crystal: 25, spiritArtifact: 3 },
    refine: { insight: 8000 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花灵机
    desc: '持续消耗灵能驱动聚灵与参悟设施，并提供4单位加工供能容量。满供时灵气产出 +50%、灵机产出 +25%；基础维持每秒消耗灵能0.1，加工加速另按实际负荷耗能。效果、供能容量与维持费随祭炼同比增长，断供或停用时失效。',
    effects: { ratio: { qi: 0.5, insight: 0.25 }, processingPowerCapacity: 4 },
    upkeep: { qiEnergy: 0.1 },
    needs: { upgrades: ['energyApplication'] },
  },
  {
    // 玄铁工具一套三件：斧（伐木）、镐（采矿）、百炼（合璧）。
    // 斧与百炼工具使用岗位加成；玄铁镐只增加矿石，避免放大玄铁与天然灵石。
    // 造价里必须有玄铁 —— 于是"烧铁 → 打工具 → 更好的铁"这条环自己转起来。
    id: 'ironAxe',
    name: '玄铁斧',
    glyph: '斧',
    kind: 'treasure',
    cost: { insight: 90, ore: 60, wood: 400 },
    refine: { insight: 300, materials: { ore: 40 }, materialFromLevel: 2 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花灵机
    desc: '玄铁锻的斧头，刃口淬过灵泉，落斧时木纹自己让路。樵夫每人 +30% 灵木。',
    effects: { jobRatio: { woodcutter: 0.3 } },
    needs: { upgrades: ['woodworking'] },
  },
  {
    id: 'ironPick',
    name: '玄铁镐',
    glyph: '镐',
    kind: 'treasure',
    cost: { insight: 90, ore: 80, wood: 200 },
    refine: { insight: 300, materials: { ore: 50 }, materialFromLevel: 2 },
    desc: '镐头是整块玄铁打出来的，一镐下去石屑自己裂。矿石产出 +30%。',
    effects: { ratio: { rock: 0.3 } },
    needs: { upgrades: ['prospectStudy'] },
  },
  {
    id: 'temperedTools',
    name: '百炼工具',
    glyph: '具',
    kind: 'treasure',
    cost: { insight: 600, ore: 300, steel: 3 },
    refine: { insight: 900, materials: { steel: 2, ore: 100 }, materialFromLevel: 2 },
    desc: '斧、镐、锯、凿各一件，按同一炉火反复锻打，彼此咬合得严丝合缝。樵夫与矿工各 +25%。',
    effects: { jobRatio: { woodcutter: 0.25, miner: 0.25 } },
    needs: { upgrades: ['steelWorking'] },
  },
]

/** 核心技艺 + 可选模块（猎杀）贡献的技艺，按锚点插回保持原顺序 */
export const TECHNIQUES = insertAfter(CORE_TECHNIQUES, HUNT_TECHNIQUE_ANCHOR, HUNT_TECHNIQUES)
