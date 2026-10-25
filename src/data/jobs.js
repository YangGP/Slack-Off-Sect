/**
 * 弟子职位。
 * base 是「每名弟子每秒」的基础产出；岗位拥挤倍率仅作用于弟子，全局倍率已包含宜居度增减产。
 * needs 决定解锁条件：{ building: {id, count} } 或 { upgrade: 'id' }
 */
import { HUNT_JOBS } from '../modules/hunting/data.js'

const CORE_JOBS = [
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
    desc: '统一开采矿产：采矿场启用时采矿石，探矿术开放玄铁副产出。基础灵石矿每座每名矿工产0.0015灵石/秒，可选灵液注灵；灵能阶段改为0.0045，按真实供电缩放、不叠注灵。同一批矿工提供已开放的矿产。',
    resource: 'rock',
    base: 0.15,
    building: 'quarry',
    // 玄铁是前中期资源：探矿术之后，矿工在主产矿石之外一并采出玄铁（不需要另建矿场）。
    // 单座灵石矿时的基础产出：矿石 0.15 → 玄铁 0.015 → 灵石 0.0015。
    additionalOutputs: [{ resource: 'ore', base: 0.015, upgrade: 'prospectStudy' }],
    // 每座启用的灵石矿叠加固定灵石产量，只增加灵石，不增加矿石或玄铁。
    secondary: { resource: 'stone', base: 0.0015, building: 'spiritQuarry', perBuilding: true },
    needs: { building: { id: 'quarry', count: 1 } },
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
    desc: '静坐藏经阁，把万千念头熬成一点灵机。',
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

/** 核心岗位 + 可选模块（猎杀）贡献的岗位（执符使，追加在末尾） */
export const JOBS = [...CORE_JOBS, ...HUNT_JOBS]

export const JOB_MAP = Object.fromEntries(JOBS.map((j) => [j.id, j]))
