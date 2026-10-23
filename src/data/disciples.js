import { REALMS, BREAKTHROUGH, realmProductionBase } from './realms'
import { JOBS } from './jobs'
import { CALENDAR, DAYS_PER_YEAR } from './calendar'
import { birthTalents, talentRandom, normalizeTalents, talentBonus } from './talents'
import { CONFIG } from './config'
import { ZERO, money, moneyNonNegative } from '../game/decimal.js'
import { SAMSARA } from './samsara.js'

export const DISCIPLE_GROWTH = {
  rate: 1,
  // 分段目标3/27/105/230天：三灵根、无传功、仅宗门及时开放下一境。
  // 先反推重修期望，再用固定种子0xdecafbad的一万组几何失败样本校准分段中位。
  // 资源等待、额外宗门指导与整局节奏另测，不是固定倒计时。
  hours: [1, 3, 8, 16, 24, 36, 48, 72, 96, 120].map((weight, index, old) => {
    const group = index < 4 ? [0, 4, 72] : index < 6 ? [4, 6, 648] : index < 8 ? [6, 8, 2520] : [8, 10, 5520]
    const p = realmBaseChance(index + 1) * 0.5
    const medianScale = [1.058, 1.0731, 1.1199, 1.1428][index < 4 ? 0 : index < 6 ? 1 : index < 8 ? 2 : 3]
    return medianScale * group[2] * weight / old.slice(group[0], group[1]).reduce((a, b) => a + b, 0) / (1 + 0.2 * (1 - p) / p)
  }),
  successFactor: 0.5,
  guidance: 0.1,
  costFactor: 0.01,
  failureLoss: 0.2,
  cooldown: 60,
}

/**
 * 手动培养：传功（持续灵气加速本人修炼）与个人护道（预付材料加成下一次突破）。
 * 效果与费用均为试调值，规则见 docs/DISCIPLE-PROGRESSION.md §2.1。
 */
export const DISCIPLE_TRAINING = { speed: 0.75, qiPerSecond: 0.4 }

/** 个人护道：按突破目标境界配置，下标即目标境界；材料与加成为试调值。 */
export const DISCIPLE_AIDS = [
  null,
  { cost: { qi: 60 }, bonus: 0.04 },
  { cost: { herb: 40 }, bonus: 0.04 },
  { cost: { pill: 4 }, bonus: 0.05 },
  { cost: { immortalHerb: 2 }, bonus: 0.06 },
  { cost: { immortalHerb: 5 }, bonus: 0.07 },
  { cost: { nineTurnPill: 1 }, bonus: 0.08 },
  { cost: { nineTurnPill: 2 }, bonus: 0.09 },
  { cost: { mithril: 6 }, bonus: 0.10 },
  { cost: { qiParticle: 20 }, bonus: 0.10 },
  { cost: { spiritTreasure: 1 }, bonus: 0.10 },
]

export const DISCIPLE_DISMISSAL = { yearSeconds: DAYS_PER_YEAR * CALENDAR.DAY_SECONDS }

/**
 * 主动招募：按「礼聘」档位花费资源，立即招募一名弟子（见 docs/DISCIPLE-PROGRESSION.md §2.5）。
 * 档位越高，花费越多、越容易刷出高品级天赋，起点境界也越高。数值均为试调。
 * 礼聘品质改善天赋与普通来客分布；稀有最高境界另受永久招募上限限制。
 */
export const RECRUIT_TIERS = [
  { id: 'small', name: '薄礼', glyph: '薄', qi: 300, cost: {}, realmWeights: [4, 8, 18, 28, 42],
    tierWeights: { huang: 45, xuan: 35, di: 16, tian: 4 }, countWeights: [70, 25, 5],
    desc: '略备薄礼，聊表诚意。来人天赋随机，起点多在宗门之下数境。' },
  { id: 'thick', name: '厚礼', glyph: '厚', qi: 800, cost: { faith: 150 }, realmWeights: [10, 20, 30, 25, 15],
    tierWeights: { huang: 30, xuan: 35, di: 25, tian: 10 }, countWeights: [60, 30, 10],
    desc: '厚礼相聘，贤才愿来。天赋偏高，起点明显高于薄礼。' },
  { id: 'grand', name: '重金', glyph: '重', qi: 1600, cost: { faith: 400, insight: 300 }, realmWeights: [32, 30, 22, 11, 5],
    tierWeights: { huang: 15, xuan: 30, di: 35, tian: 20 }, countWeights: [40, 40, 20],
    desc: '重金悬赏，高人下山。天赋最优，起点最接近宗门。' },
]
export const RECRUIT_TIER_MAP = Object.fromEntries(RECRUIT_TIERS.map(tier => [tier.id, tier]))

/** 按权重抽取下标（用于起点境界的偏移分布）。 */
function weightedIndex(weights, random) {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (!(total > 0)) return 0
  let roll = random() * total
  for (let index = 0; index < weights.length; index++) {
    if (roll < weights[index]) return index
    roll -= weights[index]
  }
  return weights.length - 1
}

const clampRealm = value => Math.max(0, Math.min(REALMS.length - 1, value))

/** 招募花费：灵气随宗门境界倍率缩放，附加材料为固定值。 */
export function recruitCost(tier, sectRealm) {
  const mult = realmProductionBase(REALMS[sectRealm]?.mult ?? 1)
  const cost = { qi: money(tier.qi || 0).times(mult) }
  for (const [id, amount] of Object.entries(tier.cost || {})) if (amount > 0) cost[id] = amount
  return cost
}

/** 起点境界区间：初始最高低宗门五境，永久购买逐步提升，永远不能招同境。 */
export function recruitRealmRange(tier, sectRealm, upgrade = 0) {
  return { min: 0, max: clampRealm(sectRealm - Math.max(1, 5 - upgrade)) }
}

/** 用存档内独立的招募序列抽取起点境界：宗门越高、档位越高则起点越高。 */
export function rollRecruitRealm(data, tier, sectRealm, upgrade = 0) {
  const max = recruitRealmRange(tier, sectRealm, upgrade).max
  if (!max) return 0
  // 最高档独立稀有事件；普通来人偏低境，不随礼聘无限靠近宗门。
  const rareChance = tier?.id === 'grand' ? 0.008 : tier?.id === 'thick' ? 0.004 : 0.002
  if (recruitRandom(data) < rareChance) return max
  const ordinary = tier?.id === 'grand' ? [20, 35, 30, 15] : tier?.id === 'thick' ? [10, 25, 35, 30] : [5, 15, 30, 50]
  return Math.max(0, max - 1 - weightedIndex(ordinary, () => recruitRandom(data)))
}

export function discipleResidenceYears(member) {
  return Math.floor((member.residenceSeconds || 0) / DISCIPLE_DISMISSAL.yearSeconds)
}

/** 当前一年基础口粮：沿用口粮的境界倍率，不计减耗、供给或其他培养费用。金额为 Decimal。 */
export function discipleAnnualBaseUpkeep(member, sectRealm) {
  const realmMult = realmProductionBase(REALMS[sectRealm]?.mult ?? 1)
  return money(CONFIG.DISCIPLE_UPKEEP)
    .times(money(realmMult).pow(CONFIG.DISCIPLE_UPKEEP_REALM_EXP))
    .times(discipleFactor(member, sectRealm))
    .times(DISCIPLE_DISMISSAL.yearSeconds)
}

/** 逐出费用（灵气）：年基础口粮 ×（已满年数 + 1），小数完整保留。 */
export function discipleDismissalCost(member, sectRealm) {
  return discipleAnnualBaseUpkeep(member, sectRealm).times(discipleResidenceYears(member) + 1)
}

export const SPIRITUAL_ROOTS = [
  { id: 'heaven', name: '天灵根', rate: 2, breakthrough: 6, weight: 1 },
  { id: 'variant', name: '异灵根', rate: 1.6, breakthrough: 4, weight: 4 },
  { id: 'dual', name: '双灵根', rate: 1.3, breakthrough: 2, weight: 10 },
  { id: 'triple', name: '三灵根', rate: 1, breakthrough: 0, weight: 25 },
  { id: 'quad', name: '四灵根', rate: 0.9, breakthrough: -1, weight: 30 },
  { id: 'five', name: '五灵根', rate: 0.8, breakthrough: -2, weight: 30 },
]
export const SPIRITUAL_ROOT_MAP = Object.fromEntries(SPIRITUAL_ROOTS.map(root => [root.id, root]))

/** 灵根对个人突破成功率的百分点加成（三灵根为基准 0）：好根骨冲关更稳，差根骨略难。 */
export function rootBreakthroughBonus(member) {
  return SPIRITUAL_ROOT_MAP[member?.spiritualRoot]?.breakthrough ?? 0
}

export function rollSpiritualRoot(random) {
  let roll = random() * SPIRITUAL_ROOTS.reduce((sum, root) => sum + root.weight, 0)
  for (const root of SPIRITUAL_ROOTS) {
    if (roll < root.weight) return root.id
    roll -= root.weight
  }
  return SPIRITUAL_ROOTS.at(-1).id
}

/** 独立存档随机序列，收徒不改变事件及突破的随机序列。 */
function rootRandom(data) {
  data.rootSeed = (Math.imul(data.rootSeed ?? 1, 1664525) + 1013904223) >>> 0
  return data.rootSeed / 4294967296
}

/** 招募起点境界的独立序列，不消耗灵根、天赋及突破的随机序列。 */
function recruitRandom(data) {
  data.recruitSeed = (Math.imul(data.recruitSeed ?? 1, 1664525) + 1013904223) >>> 0
  return data.recruitSeed / 4294967296
}

/** 传功加速：本人受传功、本境未修满，且整批传功处于供给中时生效。 */
export function trainingBonus(member, trainingActive = false) {
  if (!trainingActive || !member.mentored || member.onMission) return 0
  if ((member.cultivation || 0) >= cultivationRequired(member.realm)) return 0
  return DISCIPLE_TRAINING.speed
}

/** 传功每秒灵气：按弟子有效境界递增；未受传功或本境已修满不收费。金额为 Decimal。 */
export function discipleTrainingCost(member, sectRealm) {
  if (member.onMission) return ZERO
  if (!member.mentored) return ZERO
  if ((member.cultivation || 0) >= cultivationRequired(member.realm)) return ZERO
  return money(DISCIPLE_TRAINING.qiPerSecond).times(discipleFactor(member, sectRealm))
}

export function cultivationRate(member, trainingActive = false) {
  return DISCIPLE_GROWTH.rate * (SPIRITUAL_ROOT_MAP[member.spiritualRoot]?.rate ?? 1)
    * (1 + talentBonus(member, 'cultivation')) * (1 + trainingBonus(member, trainingActive))
}

export function sortDisciples(members, order, trainingActive = false) {
  return [...members].sort((a, b) => {
    // 重点名单置顶：先按重点分组，组内沿用现有排序，最后按记录顺序保证可复现。
    const focusFirst = (b.focus === true ? 1 : 0) - (a.focus === true ? 1 : 0)
    if (focusFirst) return focusFirst
    if (order === 'progress') {
      const progress = member => cultivationRequired(member.realm) > 0 ? member.cultivation / cultivationRequired(member.realm) : 1
      return progress(b) - progress(a) || a.id - b.id
    }
    if (order === 'rate') return cultivationRate(b, trainingActive) - cultivationRate(a, trainingActive) || a.id - b.id
    return a.id - b.id
  })
}

export function realmBaseChance(target) {
  const r = BREAKTHROUGH
  return r.lateBaseChances[target] ?? (target > r.tribulationRealm
    ? r.tribulationChance - (target - 1 - r.tribulationRealm) * r.chanceDrop
    : target === r.tribulationRealm ? r.goldenCoreChance : r.earlyChance)
}

export function cultivationRequired(realm) {
  return (DISCIPLE_GROWTH.hours[realm] || 0) * 3600
}

export function discipleFactor(member, sectRealm) {
  return REALMS[Math.min(member.realm, sectRealm)]?.mult ?? 1
}

export function newDisciple(data, spiritualRoot = null, { legacy = false, realm = 0, quality = null, includeHunting = true } = {}) {
  const id = data.nextId++
  const surnames = ['林', '陈', '沈', '陆', '叶', '苏', '顾', '白', '许', '孟', '谢', '江']
  const names = ['清禾', '云舟', '知秋', '明尘', '望舒', '青岚', '怀瑾', '听雨', '景行', '若水', '星河', '长宁', '松雪']
  return { id, name: surnames[(id * 7) % surnames.length] + names[(id * 11) % names.length],
    realm: clampRealm(realm | 0), cultivation: 0, roleId: null, cooldown: 0,
    residenceSeconds: 0, totalQiConsumed: ZERO, mentored: false, aidBonus: 0, focus: false,
    lifetimeCultivation: 0, loyalty: legacy ? 1 : realm > 0 ? Math.max(0.15, 0.6 - realm * 0.04) : 0.7,
    injury: 0, finalReady: false, collectiveAscended: false,
    spiritualRoot: spiritualRoot || rollSpiritualRoot(() => rootRandom(data)),
    talents: legacy ? [] : birthTalents(() => talentRandom(data), quality, { includeHunting }) }
}

/** 保留旧的人数接口，个体记录跟随总人口与岗位数量调整。 */
export function syncDisciples(data, { defaultRoot = null, legacy = false } = {}) {
  data.members ||= []
  data.nextId ||= 1
  const total = Number.isSafeInteger(data.total) && data.total > 0 ? data.total : 0
  data.total = total
  while (data.members.length < total) data.members.push(newDisciple(data, defaultRoot, { legacy }))
  if (data.members.length > total) data.members.splice(total)
  let remaining = total
  const counts = {}
  for (const job of JOBS) {
    const requested = data.jobs[job.id]
    data.jobs[job.id] = Math.min(remaining, Number.isFinite(requested) ? Math.max(0, Math.floor(requested)) : 0)
    remaining -= data.jobs[job.id]
    counts[job.id] = 0
  }
  for (const member of data.members) {
    // 出征中的弟子让出岗位，但保留在成员表里，不能被自动补位或重新分配。
    if (member.onMission) { member.roleId = null; continue }
    if (Object.hasOwn(counts, member.roleId) && counts[member.roleId] < data.jobs[member.roleId]) counts[member.roleId]++
    else member.roleId = null
  }
  for (const member of data.members) {
    if (member.roleId || member.onMission) continue
    const job = JOBS.find(job => counts[job.id] < data.jobs[job.id])
    if (!job) break
    member.roleId = job.id
    counts[job.id]++
  }
}

export function normalizeDisciples(data, { preferMembers = false } = {}) {
  const legacyGrowth = data.cultivationVersion !== 1
  const seen = new Set()
  data.members = (Array.isArray(data.members) ? data.members : []).filter(member =>
    member && Number.isSafeInteger(member.id) && member.id > 0 && !seen.has(member.id) && seen.add(member.id))
    .map(member => {
      const realm = Number.isInteger(member.realm) ? Math.max(0, Math.min(REALMS.length - 1, member.realm)) : 0
      const oldNeed = ([1, 3, 8, 16, 24, 36, 48, 72, 96, 120][realm] || 0) * 3600
      const current = Number.isFinite(member.cultivation) ? Math.max(0, member.cultivation) : 0
      const cultivation = Math.min(cultivationRequired(realm), legacyGrowth && oldNeed > 0 ? current / oldNeed * cultivationRequired(realm) : current)
      const legacyLifetime = DISCIPLE_GROWTH.hours.slice(0, realm).reduce((a, b) => a + b * 3600, 0) + cultivation
      return { id: member.id, name: typeof member.name === 'string' && member.name.trim() ? member.name.slice(0, 40) : `弟子${member.id}`,
        realm, roleId: JOBS.some(job => job.id === member.roleId) ? member.roleId : null,
        cultivation,
        cooldown: Number.isFinite(member.cooldown) ? Math.max(0, Math.min(DISCIPLE_GROWTH.cooldown, member.cooldown)) : 0,
        residenceSeconds: Number.isFinite(member.residenceSeconds) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, member.residenceSeconds)) : 0,
        // 个人口粮累计是金额：损坏值回退 0，按 Decimal 归一化，不再截断到 MAX_SAFE_INTEGER。
        totalQiConsumed: moneyNonNegative(member.totalQiConsumed, ZERO),
        spiritualRoot: Object.hasOwn(SPIRITUAL_ROOT_MAP, member.spiritualRoot) ? member.spiritualRoot : 'triple',
        mentored: member.mentored === true,
        aidBonus: Number.isFinite(member.aidBonus) ? Math.max(0, Math.min(0.2, member.aidBonus)) : 0,
        focus: member.focus === true,
        lifetimeCultivation: legacyGrowth ? legacyLifetime : Number.isFinite(member.lifetimeCultivation) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, member.lifetimeCultivation)) : 0,
        loyalty: Number.isFinite(member.loyalty) ? Math.max(0, Math.min(1, member.loyalty)) : 1,
        injury: Number.isFinite(member.injury) ? Math.max(0, Math.min(86400, member.injury)) : 0,
        finalReady: realm === 10 && member.finalReady === true,
        collectiveAscended: realm === 10 && member.collectiveAscended === true,
        talents: normalizeTalents(member.talents) }
    })
  data.nextId = data.members.reduce((next, member) => Math.max(next, member.id + 1),
    Number.isSafeInteger(data.nextId) && data.nextId > 0 ? data.nextId : 1)
  data.rootSeed = Number.isInteger(data.rootSeed) && data.rootSeed >= 0 && data.rootSeed <= 4294967295 ? data.rootSeed : 1
  data.talentSeed = Number.isInteger(data.talentSeed) && data.talentSeed >= 0 && data.talentSeed <= 4294967295
    ? data.talentSeed : (data.rootSeed ^ 0x6d2b79f5) >>> 0
  data.recruitSeed = Number.isInteger(data.recruitSeed) && data.recruitSeed >= 0 && data.recruitSeed <= 4294967295
    ? data.recruitSeed : (data.rootSeed ^ 0x1b873593) >>> 0
  data.talentVersion = 2
  data.cultivationVersion = 1
  if (preferMembers) recountDisciples(data)
  else syncDisciples(data, { defaultRoot: 'triple', legacy: true })
  data.peak = Math.max(Number.isSafeInteger(data.peak) ? Math.min(100000, Math.max(0, data.peak)) : 0, data.members.length)
}

export function cultivateDisciple(member, seconds, trainingActive = false, speed = 1, loyaltySpeed = 1) {
  member.residenceSeconds = Math.min(Number.MAX_SAFE_INTEGER, (member.residenceSeconds || 0) + seconds)
  member.cooldown = Math.max(0, member.cooldown - seconds)
  member.injury = Math.max(0, (member.injury || 0) - seconds)
  member.loyalty = Math.min(1, (member.loyalty ?? 1) + seconds * loyaltySpeed / (SAMSARA.loyaltyDays * 86400 * (1 + member.realm * 0.2)))
  const before = member.cultivation || 0
  member.cultivation = Math.min(cultivationRequired(member.realm), before + seconds * cultivationRate(member, trainingActive) * speed)
  member.lifetimeCultivation = Math.min(Number.MAX_SAFE_INTEGER, (member.lifetimeCultivation || 0) + Math.max(0, member.cultivation - before))
}

/** 个体记录是运行时权威状态；总人数和岗位数量仅作兼容视图。 */
export function recountDisciples(data) {
  data.total = data.members.length
  data.peak = Math.max(data.peak || 0, data.total)
  for (const job of JOBS) data.jobs[job.id] = 0
  for (const member of data.members) {
    if (member.roleId && Object.hasOwn(data.jobs, member.roleId)) data.jobs[member.roleId]++
  }
}
