/**
 * 技艺与法宝 —— 数值修饰层，对标猫国的「工坊升级」（workshop.js）。
 *
 * 与 /修真/ 的分工：
 *   修真（upgrades.js）：研究本源，解锁高级建筑、系统与**法宝**，本身不给加成
 *   本文件            ：掌握加工配方，并强化对应产业的产出、仓储与制作效率
 *
 * 这一层里有两类条目：
 *   技艺（kind 省略）      ：自己练出来的手艺，门禁看建筑（藏经阁、药圃…），彼此串成线
 *   法宝（kind: 'treasure'）：炼成的器物，**门禁看修真**（`needs.upgrades` 指向修真节点），
 *                            每件给一条明确的加成，是「研究出成果 → 炼成器物」的闭环
 *
 * 两者共用「感悟」货币；技艺之间也会串成链（引气诀 → 阵法精要 → 灵泉灌溉），
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
    needs: { building: { id: 'library', count: 1 } },
  },
  {
    id: 'forestryArt',
    name: '伐木要术',
    glyph: '伐',
    cost: { insight: 9, wood: 260 },
    desc: '顺纹下斧，省力三成。灵木产出 +20%。',
    effects: { ratio: { wood: 0.2 } },
    needs: { building: { id: 'lumberYard', count: 1 } },
  },
  {
    id: 'prospectArt',
    name: '探矿术',
    glyph: '探',
    cost: { insight: 45, ore: 120, wood: 300 },
    desc: '看石色便知矿脉走向。玄铁产出 +20%。',
    effects: { ratio: { ore: 0.2 } },
    needs: { building: { id: 'mine', count: 3 } },
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
    id: 'fieldTillage',
    name: '阵法精要',
    glyph: '耕',
    cost: { insight: 45, stone: 60, wood: 400 },
    desc: '阵纹怎么走更省灵气，阵徒心里最有数。',
    effects: { ratio: { qi: 0.1 }, jobRatio: { farmer: 0.25 } },
    needs: { upgrades: ['qiArt'], building: { id: 'spiritField', count: 5 } },
  },
  {
    id: 'timberCraft',
    name: '铁木工艺',
    glyph: '铁',
    cost: { insight: 90, wood: 900, ore: 120 },
    desc: '用玄铁加固斧柄锯条，伐木快得不像话。灵木产出 +25%。',
    effects: { ratio: { wood: 0.25 } },
    needs: { upgrades: ['forestryArt'], building: { id: 'mine', count: 1 } },
  },
  {
    id: 'woodworking',
    name: '木作器械',
    glyph: '作',
    cost: { insight: 120, wood: 400, ore: 80 },
    desc: '刨、凿、墨斗、圆规置办齐了，从此能解板。木板制作产出 +5%，开启《刨木成板》。',
    effects: { craftBonusByResource: { plank: 0.05 } },
    // 它是木料链的第二环：伐木场出原木 → 器械解板 → 木板才是百工坊的料。
    // 所以它**不能**要百工坊，也不能要木板（否则与"百工坊用木板下料"闭环）。
    needs: { building: { id: 'lumberYard', count: 2 } },
  },
  {
    id: 'waterworkshop',
    name: '流水作坊',
    glyph: '流',
    cost: { insight: 900, plank: 30, ore: 600 },
    desc: '引山泉推水轮，锯木成板昼夜不停。木板与阵基制作产出 +8%。',
    effects: { craftBonusByResource: { plank: 0.08, arrayBase: 0.08 } },
    needs: { upgrades: ['woodworking'] },
  },
  {
    id: 'arrayAssembly',
    name: '阵基装配',
    glyph: '基',
    cost: { insight: 180, plank: 2, talisman: 2, ore: 40 },
    desc: '试接梁骨与符纹，学会把木板、符箓与玄铁装成阵基。用于讲经堂、静心池及阵法营造。',
    effects: { craftBonusByResource: { arrayBase: 0.05 } },
    needs: { realm: 4, upgrades: ['earthArt', 'woodworking', 'talismanArt'], building: { id: 'talismanHall', count: 1 } },
  },
  {
    id: 'steelWorking',
    name: '淬玄工艺',
    glyph: '钢',
    cost: { insight: 180, ore: 160, artifact: 2 },
    desc: '借丹火淬去玄铁杂质，掌握《淬玄成钢》。玄钢用于材料库、试炼塔与高级营造。',
    effects: { craftBonusByResource: { steel: 0.05 } },
    needs: { realm: 4, upgrades: ['forgeArt'], building: { id: 'forge', count: 1 } },
  },
  {
    id: 'crystalCraft',
    name: '凝晶工艺',
    glyph: '晶',
    cost: { insight: 200, talisman: 6, ore: 80 },
    desc: '以符纹固定结晶边界，掌握《凝气结晶》。灵气与符箓合成灵晶，灵晶制作产出 +5%。',
    effects: { craftBonusByResource: { crystal: 0.05 } },
    needs: { realm: 4, upgrades: ['crystalTheory'], building: { id: 'talismanHall', count: 1 } },
  },
  {
    id: 'crystalPolishing',
    name: '晶纹精修',
    glyph: '琢',
    cost: { insight: 1200, crystal: 8, talisman: 20 },
    desc: '磨去晶核杂纹，让同样的气与符凝出更多晶核。灵晶制作产出 +20%。',
    effects: { craftBonusByResource: { crystal: 0.2 } },
    needs: { realm: 5, upgrades: ['crystalCraft'] },
  },
  {
    id: 'deepShaft',
    name: '深邃坑道',
    glyph: '深',
    cost: { insight: 190, ore: 700, wood: 300 },
    desc: '顺着矿脉往深处打，玄铁自己往外冒。玄铁产出 +25%。',
    effects: { ratio: { ore: 0.25 } },
    needs: { upgrades: ['prospectArt'], building: { id: 'mine', count: 6 } },
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
    id: 'spiritIrrigation',
    name: '灵泉灌溉',
    glyph: '泉',
    cost: { insight: 270, stone: 500, wood: 1200 },
    desc: '把灵脉井的水引到每一块田里。灵气产出 +15%。',
    effects: { ratio: { qi: 0.15 } },
    needs: { upgrades: ['fieldTillage'], building: { id: 'spiritVein', count: 1 } },
  },

  // ---------- 仓储 ----------
  {
    id: 'storageBag',
    name: '储物袋',
    glyph: '袋',
    cost: { insight: 35, wood: 500, herb: 200 },
    desc: '随身收纳少量物资。通用仓储 +400，成品按层级折算。',
    effects: { storageAll: 400 },
    needs: { building: { id: 'granary', count: 2 } },
  },
  {
    id: 'voidPouch',
    name: '纳物诀',
    glyph: '纳',
    cost: { insight: 750, stone: 2600, herb: 1200, talisman: 4 },
    desc: '袖里乾坤，补足各处仓储周转。通用仓储 +750，成品按层级折算。',
    effects: { storageAll: 750 },
    needs: { upgrades: ['storageBag'] },
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

  // ---------- 感悟 ----------
  {
    id: 'oralTeaching',
    name: '口传心授',
    glyph: '授',
    cost: { insight: 35, wood: 400 },
    desc: '不立文字，当面点破。感悟产出 +10%。',
    effects: { ratio: { insight: 0.1 } },
    needs: { building: { id: 'library', count: 1 } },
  },
  {
    id: 'starReading',
    name: '星象推演',
    glyph: '象',
    cost: { insight: 110, talisman: 8, herb: 300 },
    desc: '把星轨当算筹，推得比抄书快。感悟产出 +15%。',
    effects: { ratio: { insight: 0.15 } },
    needs: { upgrades: ['oralTeaching'], building: { id: 'academy', count: 1 } },
  },

  // ---------- 炼造 ----------
  {
    id: 'alchemyFire',
    name: '丹火纯青',
    glyph: '火',
    cost: { insight: 270, herb: 900, pill: 6 },
    desc: '火候拿捏到分毫不差，出炉的成色都不一样。丹药与九转丹制作产出 +5%。',
    effects: { craftBonusByResource: { pill: 0.05, nineTurnPill: 0.05 } },
    needs: { building: { id: 'alchemyRoom', count: 1 } },
  },
  {
    id: 'swordFlight',
    name: '御剑术',
    glyph: '剑',
    cost: { insight: 780, ore: 4000, artifact: 18, steel: 6 },
    desc: '剑光起处，弟子办事快了一倍。全局产出 +6%，法器、灵器与灵宝制作产出 +5%。',
    effects: { ratioAll: 0.06, craftBonusByResource: { artifact: 0.05, spiritArtifact: 0.05, spiritTreasure: 0.05 } },
    needs: { upgrades: ['deepShaft'], building: { id: 'forge', count: 3 } },
  },

  // ---------- 阵道（跨层链：修真 → 技艺） ----------
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
    id: 'arrayRefine',
    name: '阵纹精研',
    glyph: '精',
    cost: { insight: 3600, talisman: 45, artifact: 20, crystal: 20 },
    desc: '一横一竖都有讲究，整座山的灵气都顺了。全局产出 +3%。',
    effects: { ratioAll: 0.03 },
    needs: { upgrades: ['arrayMastery'] },
  },

  // ---------- 顶阶 ----------
  {
    id: 'mahayanaArt',
    name: '大乘心经',
    glyph: '乘',
    cost: { insight: 9000, artifact: 60, talisman: 60, pill: 60, faith: 6000 },
    desc: '读懂了这一卷，山下山上再无分别。全局产出 +12%。',
    effects: { ratioAll: 0.12 },
    needs: { realm: 8, upgrades: ['greatVehicleSeal'] },
  },

  // ============================================================
  // 法宝（kind: 'treasure'）—— 由修真研究解锁，炼成后给一条加成
  // ============================================================
  {
    id: 'spiritPearl',
    name: '聚灵珠',
    glyph: '珠',
    kind: 'treasure',
    cost: { insight: 20, stone: 90, wood: 200 },
    refine: { insight: 60 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花感悟
    desc: '《灵源考》的成果：一枚能自己拢住游散灵气的珠子。灵气产出 +15%。',
    effects: { ratio: { qi: 0.15 } },
    needs: { upgrades: ['qiOrigin'] },
  },
  {
    id: 'spiritBanner',
    name: '聚灵幡',
    glyph: '幡',
    cost: { insight: 45, wood: 600, stone: 200 },
    refine: { insight: 150 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花感悟
    desc: '按灵源考的图样缝成的幡，插在院里，诸般产出都顺一点。全局产出 +2%。',
    kind: 'treasure',
    effects: { ratioAll: 0.02 },
    needs: { upgrades: ['qiOrigin'] },
  },
  {
    id: 'alchemyCauldron',
    name: '九转丹炉',
    glyph: '炉',
    cost: { insight: 150, pill: 10, herb: 600, stone: 400 },
    refine: { insight: 500, materials: { nineTurnPill: 1 }, materialFromLevel: 2 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花感悟
    desc: '炼丹术推演出的炉子，火候不必再靠手感。丹药与九转丹制作产出 +8%。',
    kind: 'treasure',
    effects: { craftBonusByResource: { pill: 0.08, nineTurnPill: 0.08 } },
    needs: { upgrades: ['alchemyArt'] },
  },
  {
    id: 'herbGourd',
    name: '百草葫芦',
    glyph: '葫',
    cost: { insight: 90, herb: 700, stone: 260 },
    refine: { insight: 300, materials: { immortalHerb: 2 }, materialFromLevel: 0 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花感悟
    desc: '葫芦里自成一方小圃，采下的灵草越存越旺。灵草产出 +30%。',
    kind: 'treasure',
    effects: { ratio: { herb: 0.3 } },
    needs: { upgrades: ['alchemyArt'] },
  },
  {
    id: 'flyingSword',
    name: '飞剑',
    glyph: '剑',
    cost: { insight: 450, artifact: 14, ore: 2000, stone: 1500 },
    refine: { insight: 1500, materials: { steel: 2, spiritArtifact: 1 }, materialFromLevel: 2 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花感悟
    desc: '炼器术的顶点之作。剑光起处，弟子办事快了一倍。全局产出 +8%。',
    kind: 'treasure',
    effects: { ratioAll: 0.08 },
    needs: { upgrades: ['forgeArt'] },
  },
  {
    id: 'greenwoodAxe',
    name: '青木斧',
    glyph: '斧',
    cost: { insight: 95, wood: 1400, stone: 300 },
    refine: { insight: 320 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花感悟
    desc: '斧刃上刻着聚灵纹，砍树时树自己往刃上靠。灵木产出 +30%。',
    kind: 'treasure',
    effects: { ratio: { wood: 0.3 } },
    needs: { upgrades: ['forgeArt'] },
  },
  {
    id: 'mountainPick',
    name: '穿山凿',
    glyph: '凿',
    cost: { insight: 140, ore: 900, stone: 400 },
    refine: { insight: 480 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花感悟
    desc: '凿头一点，石脉自己裂开。玄铁产出 +30%。',
    kind: 'treasure',
    effects: { ratio: { ore: 0.3 } },
    needs: { upgrades: ['forgeArt'] },
  },
  {
    id: 'wardTalisman',
    name: '镇岳符',
    glyph: '镇',
    cost: { insight: 180, talisman: 12, wood: 1000, stone: 500 },
    refine: { insight: 600 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花感悟
    desc: '符箓一道的镇山之作，妖兽见了绕道走。天灾损失 −8%。',
    kind: 'treasure',
    effects: { disasterGuard: 0.08 },
    needs: { upgrades: ['talismanArt', 'talismanLore'] },
  },
  {
    id: 'jadeSlip',
    name: '传音玉简',
    glyph: '简',
    cost: { insight: 180, stone: 800, talisman: 6 },
    refine: { insight: 600 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花感悟
    desc: '把讲经堂的道理刻进玉里，弟子各自回去听。感悟产出 +15%。',
    effects: { ratio: { insight: 0.15 } },
    kind: 'treasure',
    needs: { upgrades: ['preachArt'] },
  },
  {
    id: 'astrolabe',
    name: '观星盘',
    glyph: '盘',
    cost: { insight: 330, stone: 1500, artifact: 6 },
    refine: { insight: 1100 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花感悟
    desc: '照着星轨铸成的盘，推演天时不用再抬头。感悟产出 +20%。',
    effects: { ratio: { insight: 0.2 } },
    kind: 'treasure',
    needs: { upgrades: ['astrologyArt'] },
  },
  {
    id: 'calmMat',
    name: '静心蒲团',
    glyph: '蒲',
    cost: { insight: 270, herb: 1400, wood: 1200, stone: 800 },
    refine: { insight: 900 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花感悟
    desc: '坐在上面杂念自消，弟子也不那么爱闹了。士气 +5。',
    effects: { morale: 5 },
    kind: 'treasure',
    needs: { upgrades: ['calmMind'] },
  },
  {
    id: 'beastBell',
    name: '驭兽铃',
    glyph: '铃',
    cost: { insight: 1200, herb: 5000, pill: 20, stone: 4000 },
    refine: { insight: 4000 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花感悟
    desc: '铃一响，园里的灵兽自己去采药、刨矿。采药人与矿工产出 +30%。',
    effects: { jobRatio: { herbalist: 0.3, miner: 0.3 } },
    kind: 'treasure',
    needs: { upgrades: ['beastTaming'] },
  },
  {
    id: 'mountainPlate',
    name: '护山阵盘',
    glyph: '盘',
    cost: { insight: 660, ore: 2500, talisman: 10, stone: 2200 },
    refine: { insight: 2200, materials: { arrayBase: 2, spiritTalisman: 1 }, materialFromLevel: 1 },
    desc: '阵法初解的实物：一块刻满纹路的石盘，埋在阵眼上。天灾损失 −5%。',
    effects: { disasterGuard: 0.05 },
    kind: 'treasure',
    needs: { upgrades: ['arrayBasics', 'artifactLore'] },
  },
  {
    id: 'vowCauldron',
    name: '聚愿鼎',
    glyph: '鼎',
    cost: { insight: 720, faith: 2000, talisman: 12, stone: 2000 },
    refine: { insight: 2400 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花感悟
    desc: '祖师殿里那口鼎，把香客的愿力收得更干净。香火产出 +40%。',
    effects: { ratio: { faith: 0.4 } },
    kind: 'treasure',
    needs: { upgrades: ['ancestorArt'] },
  },
  {
    id: 'voidRing',
    name: '纳物戒',
    glyph: '戒',
    cost: { insight: 1800, stone: 7000, artifact: 25, wood: 4000 },
    refine: { insight: 6000, materials: { spiritTreasure: 1 }, materialFromLevel: 2 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花感悟
    desc: '洞天福地的小成之作：以纳物戒补足各类仓储。每层通用仓储 +500，成品按层级折算。',
    effects: { storageAll: 500 },
    kind: 'treasure',
    needs: { upgrades: ['grottoArt'] },
  },
  {
    id: 'zhenyueSeal',
    name: '镇岳印',
    glyph: '印',
    cost: { insight: 3600, talisman: 50, artifact: 35, ore: 8000, stone: 11000 },
    refine: { insight: 12000 }, // 祭炼要打坐参悟：炼成只花材料，祭炼才花感悟
    desc: '阵道精通之后才敢动手刻的印，压在山门上，满山灵气都听话。全局产出 +5%。',
    effects: { ratioAll: 0.05 },
    kind: 'treasure',
    needs: { upgrades: ['arrayMastery'] },
  },
]
