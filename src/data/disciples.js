import { REALMS, BREAKTHROUGH } from './realms'
import { JOBS } from './jobs'
import { CALENDAR, DAYS_PER_YEAR } from './calendar'

export const DISCIPLE_GROWTH = {
  rate: 1,
  hours: [1, 3, 8, 16, 24, 36, 48, 72, 96, 120],
  failureFactor: 0.5,
  guidance: 0.05,
  costFactor: 0.01,
  failureLoss: 0.2,
  cooldown: 60,
}

export const DISCIPLE_DISMISSAL = { yearSeconds: DAYS_PER_YEAR * CALENDAR.DAY_SECONDS }

export function discipleResidenceYears(member) {
  return Math.floor((member.residenceSeconds || 0) / DISCIPLE_DISMISSAL.yearSeconds)
}

export function discipleDismissalCost(member) {
  return Math.ceil((member.totalQiConsumed || 0) * (discipleResidenceYears(member) + 1))
}

export const SPIRITUAL_ROOTS = [
  { id: 'heaven', name: '天灵根', rate: 2, weight: 1 },
  { id: 'variant', name: '异灵根', rate: 1.6, weight: 4 },
  { id: 'dual', name: '双灵根', rate: 1.3, weight: 10 },
  { id: 'triple', name: '三灵根', rate: 1, weight: 25 },
  { id: 'quad', name: '四灵根', rate: 0.9, weight: 30 },
  { id: 'five', name: '五灵根', rate: 0.8, weight: 30 },
]
export const SPIRITUAL_ROOT_MAP = Object.fromEntries(SPIRITUAL_ROOTS.map(root => [root.id, root]))

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

export function cultivationRate(member) {
  return DISCIPLE_GROWTH.rate * (SPIRITUAL_ROOT_MAP[member.spiritualRoot]?.rate ?? 1)
}

export function sortDisciples(members, order) {
  return [...members].sort((a, b) => {
    if (order === 'progress') {
      const progress = member => cultivationRequired(member.realm) > 0 ? member.cultivation / cultivationRequired(member.realm) : 1
      return progress(b) - progress(a) || a.id - b.id
    }
    if (order === 'rate') return cultivationRate(b) - cultivationRate(a) || a.id - b.id
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

export function newDisciple(data, spiritualRoot = null) {
  const id = data.nextId++
  const surnames = ['林', '陈', '沈', '陆', '叶', '苏', '顾', '白', '许', '孟', '谢', '江']
  const names = ['清禾', '云舟', '知秋', '明尘', '望舒', '青岚', '怀瑾', '听雨', '景行', '若水', '星河', '长宁', '松雪']
  return { id, name: surnames[(id * 7) % surnames.length] + names[(id * 11) % names.length],
    realm: 0, cultivation: 0, roleId: null, cooldown: 0, residenceSeconds: 0, totalQiConsumed: 0,
    spiritualRoot: spiritualRoot || rollSpiritualRoot(() => rootRandom(data)) }
}

/** 保留旧的人数接口，个体记录跟随总人口与岗位数量调整。 */
export function syncDisciples(data, { defaultRoot = null } = {}) {
  data.members ||= []
  data.nextId ||= 1
  const total = Number.isSafeInteger(data.total) && data.total > 0 ? data.total : 0
  data.total = total
  while (data.members.length < total) data.members.push(newDisciple(data, defaultRoot))
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
    if (Object.hasOwn(counts, member.roleId) && counts[member.roleId] < data.jobs[member.roleId]) counts[member.roleId]++
    else member.roleId = null
  }
  for (const member of data.members) {
    if (member.roleId) continue
    const job = JOBS.find(job => counts[job.id] < data.jobs[job.id])
    if (!job) break
    member.roleId = job.id
    counts[job.id]++
  }
}

export function normalizeDisciples(data, { preferMembers = false } = {}) {
  const seen = new Set()
  data.members = (Array.isArray(data.members) ? data.members : []).filter(member =>
    member && Number.isSafeInteger(member.id) && member.id > 0 && !seen.has(member.id) && seen.add(member.id))
    .map(member => {
      const realm = Number.isInteger(member.realm) ? Math.max(0, Math.min(REALMS.length - 1, member.realm)) : 0
      return { id: member.id, name: typeof member.name === 'string' && member.name.trim() ? member.name.slice(0, 40) : `弟子${member.id}`,
        realm, roleId: JOBS.some(job => job.id === member.roleId) ? member.roleId : null,
        cultivation: Number.isFinite(member.cultivation) ? Math.max(0, Math.min(cultivationRequired(realm), member.cultivation)) : 0,
        cooldown: Number.isFinite(member.cooldown) ? Math.max(0, Math.min(DISCIPLE_GROWTH.cooldown, member.cooldown)) : 0,
        residenceSeconds: Number.isFinite(member.residenceSeconds) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, member.residenceSeconds)) : 0,
        totalQiConsumed: Number.isFinite(member.totalQiConsumed) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, member.totalQiConsumed)) : 0,
        spiritualRoot: Object.hasOwn(SPIRITUAL_ROOT_MAP, member.spiritualRoot) ? member.spiritualRoot : 'triple' }
    })
  data.nextId = data.members.reduce((next, member) => Math.max(next, member.id + 1),
    Number.isSafeInteger(data.nextId) && data.nextId > 0 ? data.nextId : 1)
  data.rootSeed = Number.isInteger(data.rootSeed) && data.rootSeed >= 0 && data.rootSeed <= 4294967295 ? data.rootSeed : 1
  if (preferMembers) recountDisciples(data)
  else syncDisciples(data, { defaultRoot: 'triple' })
}

export function cultivateDisciple(member, seconds) {
  member.residenceSeconds = Math.min(Number.MAX_SAFE_INTEGER, (member.residenceSeconds || 0) + seconds)
  member.cooldown = Math.max(0, member.cooldown - seconds)
  member.cultivation = Math.min(cultivationRequired(member.realm), member.cultivation + seconds * cultivationRate(member))
}

/** 个体记录是运行时权威状态；总人数和岗位数量仅作兼容视图。 */
export function recountDisciples(data) {
  data.total = data.members.length
  for (const job of JOBS) data.jobs[job.id] = 0
  for (const member of data.members) {
    if (member.roleId && Object.hasOwn(data.jobs, member.roleId)) data.jobs[member.roleId]++
  }
}
