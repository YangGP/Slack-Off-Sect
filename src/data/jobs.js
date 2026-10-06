/**
 * 弟子职位（对应猫国的 jobs）。
 * base 是「每名弟子每秒」的基础产出，最终产出 = base × 人数 × 1(或修真/技艺加成) × 士气 × 全局倍率。
 * needs 决定解锁条件：{ building: {id, count} } 或 { upgrade: 'id' }
 */
export const JOBS = [
  {
    id: 'farmer',
    name: '阵徒',
    glyph: '阵',
    desc: '守着聚灵阵，日夜引气入阵，是宗门最稳的灵气来源。',
    resource: 'qi',
    base: 0.6,
    unlocked: true,
  },
  {
    id: 'woodcutter',
    name: '樵夫',
    glyph: '樵',
    desc: '入后山伐灵木。宗门第一根梁柱，就是他们扛回来的。',
    resource: 'wood',
    base: 0.15,
    unlocked: true,
  },
  {
    id: 'miner',
    name: '矿工',
    glyph: '矿',
    desc: '在玄铁矿脉里刨食，产出炼器所需的玄铁。',
    resource: 'ore',
    base: 0.08,
    needs: { building: { id: 'mine', count: 1 } },
  },
  {
    id: 'herbalist',
    name: '采药人',
    glyph: '药',
    desc: '翻山越岭辨识灵草，为丹房供料。',
    resource: 'herb',
    base: 0.07,
    needs: { building: { id: 'herbGarden', count: 1 } },
  },
  {
    id: 'scholar',
    name: '悟道者',
    glyph: '悟',
    desc: '静坐藏经阁，把万千念头熬成一点感悟。',
    resource: 'insight',
    base: 0.02,
    needs: { building: { id: 'library', count: 1 } },
  },
  {
    id: 'incenseKeeper',
    name: '香使',
    glyph: '香',
    desc: '守着山门香火，把香客的念力收拢回宗门。',
    resource: 'faith',
    base: 0.02,
    needs: { building: { id: 'gate', count: 1 } },
  },
]

export const JOB_MAP = Object.fromEntries(JOBS.map((j) => [j.id, j]))
