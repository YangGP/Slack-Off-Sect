/**
 * 资源定义。
 * baseMax 为仓储上限的基数，实际上限 = baseMax + 建筑/修真/技艺提供的仓储。
 * hidden 资源默认不在顶栏显示（例如飞升后才启用的仙缘）。
 */
export const RESOURCES = [
  {
    id: 'qi',
    name: '灵气',
    glyph: '气',
    color: '#8ee6d0',
    baseMax: 500,
    desc: '宗门根基。弟子靠它吐纳修炼，一切营造皆由此起。',
  },
  {
    id: 'wood',
    name: '灵木',
    glyph: '木',
    color: '#9fd98a',
    baseMax: 200,
    desc: '后山灵木，可作屋梁、符纸与阵材。',
  },
  {
    id: 'plank',
    name: '木板',
    glyph: '板',
    color: '#c9a87c',
    baseMax: 50,
    desc: '灵木刨出的精料。原木只配搭棚，正经殿宇的梁柱斗拱都要它。',
    integer: true, // 整枚计数：价格向上取整、数量不出现小数
  },
  {
    id: 'steel',
    name: '玄钢',
    glyph: '钢',
    color: '#b8c4d0',
    baseMax: 50,
    desc: '玄铁反复折叠锻打，杂质尽去 —— 一剑之锋，从此有了骨。',
    integer: true, // 整枚计数：价格向上取整、数量不出现小数
  },
  {
    id: 'stone',
    name: '灵石',
    glyph: '石',
    color: '#9fc7ff',
    baseMax: 150,
    desc: '由灵气凝成的硬通货，山下市集与阵道皆认它。',
    integer: true, // 整枚计数：价格向上取整、数量不出现小数
  },
  {
    id: 'ore',
    name: '玄铁',
    glyph: '铁',
    color: '#c8b7a6',
    baseMax: 150,
    desc: '深山玄铁，炼器之根本。',
  },
  {
    id: 'herb',
    name: '灵草',
    glyph: '草',
    color: '#a8e07a',
    baseMax: 150,
    desc: '药圃所产，炼丹必需。',
  },
  {
    id: 'immortalHerb',
    name: '仙草',
    glyph: '仙',
    color: '#a8e6a1',
    baseMax: 50,
    desc: '以灵泉浇灌百年，草叶上凝着露似的灵光。',
    integer: true, // 整枚计数：价格向上取整、数量不出现小数
  },
  {
    id: 'pill',
    name: '丹药',
    glyph: '丹',
    color: '#ffb46b',
    baseMax: 50,
    desc: '服之安神定气，助弟子破境。',
    integer: true, // 整枚计数：价格向上取整、数量不出现小数
  },
  {
    id: 'nineTurnPill',
    name: '九转丹',
    glyph: '丹',
    color: '#ffb347',
    baseMax: 50,
    desc: '九转九炼，一炉只出数枚，是压箱底的救命物。',
    integer: true, // 整枚计数：价格向上取整、数量不出现小数
  },
  {
    id: 'talisman',
    name: '符箓',
    glyph: '符',
    color: '#ffe08a',
    baseMax: 50,
    desc: '一纸符箓，可镇妖避劫，也能换些香火钱。',
    integer: true, // 整枚计数：价格向上取整、数量不出现小数
  },
  {
    id: 'spiritTalisman',
    name: '灵符',
    glyph: '灵',
    color: '#ffe9b0',
    baseMax: 50,
    desc: '香火为墨、朱砂为骨，一符既成，可镇一山之妖。',
    integer: true, // 整枚计数：价格向上取整、数量不出现小数
  },
  {
    id: 'artifact',
    name: '法器',
    glyph: '器',
    color: '#d7a6ff',
    baseMax: 50,
    desc: '御剑飞行的门面，也是宗门的战力。',
    integer: true, // 整枚计数：价格向上取整、数量不出现小数
  },
  {
    id: 'spiritArtifact',
    name: '灵器',
    glyph: '灵',
    color: '#c9a6ff',
    baseMax: 50,
    desc: '以玄钢为骨、法器为魂，器物开始有了自己的灵性。',
    integer: true, // 整枚计数：价格向上取整、数量不出现小数
  },
  {
    id: 'spiritTreasure',
    name: '灵宝',
    glyph: '宝',
    color: '#ffd6f5',
    baseMax: 50,
    // 它不是"某种材料炼上去"，而是三条进阶支线**合起来**才成的一件东西
    desc: '灵器为骨、九转丹为髓、灵符为纹 —— 三样缺一，都只是半件宝物。',
    integer: true, // 整枚计数：价格向上取整、数量不出现小数
  },
  {
    id: 'yangParticle',
    name: '正灵子',
    glyph: '阳',
    color: '#ffd0a8',
    baseMax: 50,
    desc: '把灵气分子拆开，得其一端正灵子 —— 轻而外扬。',
    // 刻意不设 integer：粒子是"物理量"，本来就该连续
  },
  {
    id: 'yinParticle',
    name: '负灵子',
    glyph: '阴',
    color: '#a8c8ff',
    baseMax: 50,
    desc: '拆分灵气分子得到的另一端，沉而内敛。与正灵子相遇便会湮灭。',
  },
  {
    id: 'qiEnergy',
    name: '灵能',
    glyph: '能',
    color: '#fff2a8',
    baseMax: 1000,
    desc: '正负灵子湮灭时释放的能量。极不稳定，会自己逸散 —— 所以只能靠持续湮灭维持。',
  },
  {
    id: 'insight',
    name: '感悟',
    glyph: '悟',
    color: '#8ab4ff',
    baseMax: 200,
    desc: '弟子悟道所得，用以推演功法、参悟境界。',
  },
  {
    id: 'faith',
    name: '香火',
    glyph: '香',
    color: '#ff9fb0',
    baseMax: 100,
    desc: '山下香客的念力，可安稳人心、招徕门徒。',
  },
  {
    id: 'dao',
    name: '道果',
    glyph: '果',
    color: '#c9a0ff',
    baseMax: Infinity,
    hidden: true,
    noProduction: true,
    desc: '飞升时结下的道果。每颗永久提升全局产出，并让下次转世的仙缘更多。',
  },
  {
    id: 'karma',
    name: '仙缘',
    glyph: '缘',
    color: '#ffd76b',
    baseMax: Infinity,
    hidden: true,
    noProduction: true,
    desc: '飞升时带走的因果。每点仙缘永久提升全局产出。',
  },
]

export const RESOURCE_MAP = Object.fromEntries(RESOURCES.map((r) => [r.id, r]))

/** 顶栏显示顺序（隐藏资源另算） */
export const VISIBLE_RESOURCES = RESOURCES.filter((r) => !r.hidden).map((r) => r.id)
