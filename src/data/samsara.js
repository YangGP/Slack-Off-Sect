import { ZERO, money, moneyNonNegative } from '../game/decimal.js'
import { normalizeWorldFacilities } from './worldFacilities.js'

/** 首版参数集中在此；半年首飞、年度培养仍需整局测量校准。 */
export const SAMSARA = {
  version: 1, daoCoefficient: 0.08, loyaltyFloor: 0.5, loyaltyDays: 30,
  invitationSeconds: 21600, invitationMax: 3, minimumParty: 10,
  failedDaoRatio: 0.25, injurySeconds: 1800, qiDecayFloor: 0.0005,
}

export const DAO_PERKS = [
  { id: 'energyRetention', name: '藏灵', max: 10, cost: 2, growth: 1.7, desc: '每级相对减少灵能自然逸散15%，不减少设施耗能。' },
  { id: 'cultivation', name: '修行沃土', max: 20, cost: 1, growth: 1.35, desc: '每级独立提高全宗弟子修炼速度25%。' },
  { id: 'breakthrough', name: '明心破障', max: 10, cost: 2, growth: 1.6, desc: '每级相对减少弟子突破失败率7%；不降低猎场和驻守死亡率。' },
  { id: 'loyalty', name: '同道相契', max: 10, cost: 1, growth: 1.5, desc: '每级提高同心自然成长与资源培养效果25%。' },
  { id: 'recruitment', name: '高士来归', max: 4, cost: 3, growth: 2, desc: '每级提高稀有来客境界上限一境，最高低宗门一境；最高档概率不超过0.8%。' },
  { id: 'hunt4', name: '灵兽苑图', max: 1, cost: 2, growth: 1, desc: '永久取得灵兽苑出征资格，本世仍需达到境界。' },
  { id: 'hunt5', name: '玄灵谷图', max: 1, cost: 4, growth: 1, desc: '永久取得玄灵谷出征资格，本世仍需达到境界。' },
  { id: 'hunt6', name: '荒古境图', max: 1, cost: 8, growth: 1, desc: '永久取得荒古境出征资格，本世仍需达到境界。' },
  {"id":"measuredNurture","name":"育养有度","cost":1.5,"growth":1.6,"max":5,"desc":"弟子持续灵气口粮每级减少2%，最多10%；不改变逐出赔付。"},
  {"id":"efficientMentoring","name":"传功有方","cost":1,"growth":1.6,"max":5,"desc":"传功实际灵气支出每级减少4%，速度不变。"},
  {"id":"pillAssimilation","name":"丹华入脉","cost":2,"growth":1.8,"max":5,"desc":"内丹、灵髓内丹可补修为每级+5%，仅计实际补入贡献。"},
  {"id":"peacefulRecovery","name":"静养复元","cost":1,"growth":1.6,"max":5,"desc":"新发生猎杀伤病时长每级减少5%；不改变现有倒计时。"},
  {"id":"invitationReserve","name":"礼聘余裕","cost":2,"growth":2,"max":2,"desc":"礼聘机会容量每级+1；不补次数，不加快恢复。"},
  {"id":"personalAidThrift","name":"护道节用","cost":1,"growth":1.6,"max":5,"desc":"个人护道材料每级减少2%，不提高护道效果，不含终极准备。"},
]
export const DAO_PERK_MAP = Object.fromEntries(DAO_PERKS.map(p => [p.id, p]))
export const WORLD_DEFS = [
  { id: 'spirit', name: '聚灵小界', realm: 8, safe: 6, out: 'immortalForce', rate: 0.003, energy: 0.02,
    cost: { heavenBrick: 20, arrayBase: 20 }, maintenance: 0.00001 },
  { id: 'marrow', name: '洗髓小界', realm: 9, safe: 8, out: 'clearMarrow', rate: 0.0006, energy: 0.04,
    cost: { heavenBrick: 50, worldBeam: 10 }, maintenance: 0.00002 },
  { id: 'guard', name: '护道小界', realm: 9, safe: 9, out: 'worldSand', rate: 0.001, energy: 0.06,
    cost: { heavenBrick: 80, worldBeam: 20, worldCore: 5 }, maintenance: 0.00003 },
]
export const WORLD_MAP = Object.fromEntries(WORLD_DEFS.map(w => [w.id, w]))
export const FINAL_PREPARATION_COST = { clearMarrow: 30, spiritTreasure: 2, nineTurnPill: 5 }
export function loyaltyCost(member) { return { pill: 2 * (1 + member.realm), faith: 50 * (1 + member.realm) } }
export function worldNeedsMet(state, id) {
  const world = WORLD_MAP[id]
  return !!world && state.realm >= world.realm && state.buildings.heavenWorkshop?.count > 0 &&
    (id === 'spirit' || state.worlds.spirit.level > 0) && (id !== 'guard' || state.worlds.marrow.level > 0)
}

const count = (n, max = Number.MAX_SAFE_INTEGER) => Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : 0
const finite = n => Number.isFinite(n) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, n)) : 0

export function createSamsara() {
  return { version: 1, levels: {}, spent: ZERO, shopOpen: false, automation: false,
    blueprints: {}, records: [], nextRecordId: 1, completions: 0, lastVictory: null, worldSeed: 1 }
}
export function createWorlds() {
  return Object.fromEntries(WORLD_DEFS.map(w => [w.id, { level: 0, capacity: 0, memberId: null, returnJob: null, exposure: 0, riskBudget: 1, facilities: normalizeWorldFacilities(null, w.id) }]))
}
export function createChallenge() { return { active: false, target: 0, protection: 0, completed: false } }
export function daoLevel(state, id) { return count(state.samsara?.levels?.[id], DAO_PERK_MAP[id]?.max || 0) }
export function invitationCapacity(state) { return SAMSARA.invitationMax + daoLevel(state, 'invitationReserve') }
export function huntInjurySeconds(state) { return SAMSARA.injurySeconds * (1 - 0.05 * daoLevel(state, 'peacefulRecovery')) }
export function discipleSpeed(state) { return Math.pow(1.25, daoLevel(state, 'cultivation')) }
export function loyaltyEfficiency(member) { return SAMSARA.loyaltyFloor + (1 - SAMSARA.loyaltyFloor) * (member.loyalty ?? 1) }
export function daoReward(state) {
  const sum = state.disciples.members.reduce((n, m) => n.plus(money(m.lifetimeCultivation || 0).div(3600).times(m.loyalty ?? 1)), ZERO)
  return money(1).plus(sum.sqrt().times(SAMSARA.daoCoefficient))
}
export function daoContributions(state) {
  const rows = state.disciples.members.map(m => ({ id: m.id, name: m.name, lifetime: m.lifetimeCultivation || 0,
    loyalty: m.loyalty ?? 1, weighted: money(m.lifetimeCultivation || 0).times(m.loyalty ?? 1) }))
  const total = rows.reduce((n, r) => n.plus(r.weighted), ZERO)
  const bonus = daoReward(state).minus(1)
  return rows.map(r => ({ ...r, share: total.gt(0) ? bonus.times(r.weighted).div(total) : ZERO }))
}
export function normalizeSamsara(raw, state) {
  const result = createSamsara()
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const p of DAO_PERKS) result.levels[p.id] = count(raw.levels?.[p.id], p.max)
    result.spent = moneyNonNegative(raw.spent)
    result.shopOpen = raw.shopOpen === true
    result.automation = raw.automation === true
    result.blueprints = Object.fromEntries(WORLD_DEFS.filter(w => raw.blueprints?.[w.id] === true).map(w => [w.id, true]))
    const ids = new Set()
    result.records = (Array.isArray(raw.records) ? raw.records : []).filter(r => r && Number.isSafeInteger(r.id) && r.id > 0 && !ids.has(r.id) && ids.add(r.id))
      .map(r => ({ id: r.id, name: String(r.name || '无名弟子').slice(0, 40), life: count(r.life), realm: count(r.realm, 10),
        root: String(r.root || 'triple'), contribution: finite(r.contribution), loyalty: Math.min(1, finite(r.loyalty)),
        outcome: String(r.outcome || '随世而去').slice(0, 40), collectiveAscended: r.collectiveAscended === true }))
    result.nextRecordId = result.records.reduce((next, r) => Math.max(next, r.id + 1), Math.max(1, count(raw.nextRecordId)))
    result.completions = count(raw.completions)
    result.worldSeed = count(raw.worldSeed ?? 1, 4294967295)
    result.lastVictory = raw.lastVictory && typeof raw.lastVictory === 'object'
      ? { target: count(raw.lastVictory.target), life: count(raw.lastVictory.life) } : null
  }
  result.automation ||= moneyNonNegative(state.dao).gte(1) || (state.stats?.ascensions || 0) > 0
  return result
}
export function normalizeWorlds(raw, members) {
  const result = createWorlds(), used = new Set()
  for (const w of WORLD_DEFS) {
    const r = raw?.[w.id]
    if (!r || typeof r !== 'object') continue
    const memberId = members.some(m => m.id === r.memberId) && !used.has(r.memberId) ? r.memberId : null
    result[w.id] = { level: count(r.level, 1000), capacity: count(r.capacity, 1000), memberId, facilities: normalizeWorldFacilities(r.facilities, w.id),
      returnJob: typeof r.returnJob === 'string' ? r.returnJob : null, exposure: finite(r.exposure), riskBudget: Number.isFinite(r.riskBudget) ? Math.max(0, r.riskBudget) : 1 }
    if (memberId) used.add(memberId)
  }
  return result
}
export function normalizeChallenge(raw) {
  const result = createChallenge()
  if (!raw || typeof raw !== 'object') return result
  result.active = raw.active === true
  result.target = count(raw.target, 100000)
  if (result.active) result.target = Math.max(SAMSARA.minimumParty, result.target)
  result.protection = count(raw.protection, 10)
  result.completed = raw.completed === true
  return result
}

/** 离册才定格；在宗记录直接从成员表读取，避免每秒复制名录。 */
export function rememberDisciple(state, member, outcome) {
  const history = state.samsara
  if (!history || !member) return
  history.records.push({ id: history.nextRecordId++, name: member.name, life: (state.stats.reincarnations || 0) + (state.stats.ascensions || 0) + (state.stats.breakthroughDeaths || 0) + 1,
    realm: member.realm, root: member.spiritualRoot, contribution: member.lifetimeCultivation || 0, loyalty: member.loyalty ?? 1, collectiveAscended: member.collectiveAscended === true, outcome })
}
