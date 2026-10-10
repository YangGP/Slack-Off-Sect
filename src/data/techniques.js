/**
 * 技艺与法宝 —— 通用增益层，对标猫国的「工坊升级」（workshop.js）。
 *
 * 2026-10 两线重组（方案见 docs/RESEARCH.md）后，本页只保留两类条目：
 *   技艺（kind 省略）      ：自己练出来的手艺 —— 通用产量、仓储、灵机、防灾等增益，
 *                           门禁看建筑（藏经阁、药圃…），彼此串成链；
 *                           配方开放与专业制作增益已随材料族迁入修真页（upgrades.js）
 *   法宝（kind: 'treasure'）：炼成的器物，**门禁看修真**（`needs.upgrades` 指向修真节点），
 *                            每件给一条明确的加成，是「研究出成果 → 炼成器物」的闭环
 *
 * 两者共用「灵机」货币；技艺之间也会串成链（引气诀 → 阵法精要 → 灵泉灌溉），
 * 这棵树就是猫国工坊升级那种「一层层推」的推进感。
 */
export const TECHNIQUES = [
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
  {
    id: 'quarryArt',
    name: '凿石要诀',
    glyph: '凿',
    cost: { insight: 30, rock: 120, wood: 220 },
    desc: '顺纹下凿、量山取料，整块石料运下山也不碎一角。矿石产出 +30%。',
    effects: { ratio: { rock: 0.3 } },
    needs: { building: { id: 'quarry', count: 2 } },
  },

  // ---------- 四条线的第二层（链式前置） ----------
  {
    id: 'fieldTillage',
    name: '阵法精要',
    glyph: '耕',
    cost: { insight: 45, stone: 60, wood: 400 },
    desc: '阵纹怎么走更省灵气，阵徒心里最有数。',
    effects: { ratio: { qi: 0.1 }, jobRatio: { farmer: 0.25 } },
    needs: { upgrades: ['qiGazing', 'qiArt'], building: { id: 'spiritField', count: 5 } },
  },
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
    // 灵机仓容的百分比一律由技艺提供：定额给建筑，比例给技艺，两者分工明确。
    effects: { storageAll: 1200, storageRatio: { insight: 0.3 } },
    needs: { building: { id: 'warehouse', count: 1 } },
  },

  // 仓储·加固线（对标猫国 Reinforced/Titanium/Alloy Warehouse 一条线）：
  // 对**已建成的仓储**再乘一遍上限 —— 同样几座库房，越到后期存得越多，
  // 不必靠盖几十座谷仓去顶破境要的那笔灵气。定额给建筑，比例给技艺（见 caseStackArt 注）。
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
    needs: { realm: 7, upgrades: ['storeStoneArt'] },
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

  // ---------- 士气 ----------
  {
    id: 'bondKnot',
    name: '同心结',
    glyph: '结',
    cost: { insight: 90, wood: 400, faith: 100 },
    desc: '同门腰间都佩一枚结，人心齐了，干活也带劲。士气 +4。',
    effects: { morale: 4 },
    needs: { building: { id: 'logHouse', count: 3 } },
  },

  // ---------- 灵机 ----------
  {
    id: 'oralTeaching',
    name: '口传心授',
    glyph: '授',
    cost: { insight: 35, wood: 400 },
    desc: '不立文字，当面点破。灵机产出 +10%。',
    effects: { ratio: { insight: 0.1 }, storageRatio: { insight: 0.4 } },
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

  // ---------- 防灾（阵道成果的防护应用） ----------
  {
    id: 'arrayPatterns',
    name: '护山阵纹',
    glyph: '纹',
    cost: { insight: 540, ore: 1800, talisman: 8, crystal: 6 },
    desc: '在阵眼处补上三层锁纹，妖兽撞上来更吃亏。天灾损失 −5%。',
    effects: { disasterGuard: 0.05 },
    needs: { upgrades: ['arrayBasics'] },
  },
  {
    id: 'arrayCompendium',
    name: '护阵纲目',
    glyph: '纲',
    cost: { insight: 900, ore: 3000, talisman: 10, crystal: 8 },
    desc: '护山阵纹之上再立纲目：一处受撞，处处来援。天灾损失 −6%。',
    effects: { disasterGuard: 0.06 },
    needs: { upgrades: ['arrayPatterns'], building: { id: 'mountainArray', count: 1 } },
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
    needs: { upgrades: ['alchemyArt'] },
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
    desc: '符箓一道的镇山之作，妖兽见了绕道走。天灾损失 −8%。',
    effects: { disasterGuard: 0.08 },
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
    desc: '坐在上面杂念自消，弟子也不那么爱闹了。士气 +5。',
    effects: { morale: 5 },
    needs: { upgrades: ['calmMind'] },
  },
  {
    id: 'beastBell',
    name: '驭兽铃',
    glyph: '铃',
    kind: 'treasure',
    cost: { insight: 1200, herb: 5000, pill: 20, stone: 4000 },
    refine: { insight: 4000 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花灵机
    desc: '铃一响，园里的灵兽自己去采药、刨矿。采药人与矿工产出 +30%。',
    effects: { jobRatio: { herbalist: 0.3, miner: 0.3 } },
    needs: { upgrades: ['beastTaming'] },
  },
  {
    id: 'mountainPlate',
    name: '护山阵盘',
    glyph: '盘',
    kind: 'treasure',
    cost: { insight: 660, ore: 2500, talisman: 10, stone: 2200 },
    refine: { insight: 2200, materials: { arrayBase: 2, spiritTalisman: 1 }, materialFromLevel: 1 },
    desc: '阵法初解的实物：一块刻满纹路的石盘，埋在阵眼上。天灾损失 −5%。',
    effects: { disasterGuard: 0.05 },
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
    desc: '试炼塔的晨钟：钟声一响，闻声而起，塔里塔外士气回稳。士气 +8。',
    effects: { morale: 8 },
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
    desc: '一玉双鲤，首尾相衔。双极场引导解离后的正负灵子分流，减少复合与输送损耗。正灵子与负灵子产出 +20%。',
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
    desc: '灯芯稳住湮灭场的相位，持续成对供料才能维持灯焰，提高可回收灵能、减少散失。灵能产出 +30%。',
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
    desc: '持续消耗灵能驱动聚灵与参悟设施。满供时灵气产出 +50%、灵机产出 +25%；每秒消耗灵能 1，效果与耗能随祭炼同比增长，供能不足时按比例运行，无供能则停效。',
    effects: { ratio: { qi: 0.5, insight: 0.25 } },
    upkeep: { qiEnergy: 1 },
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
