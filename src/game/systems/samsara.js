import { SAMSARA, DAO_PERK_MAP, WORLD_DEFS, WORLD_MAP, FINAL_PREPARATION_COST, loyaltyCost, daoLevel, daoReward, rememberDisciple } from '@/data/samsara'
import { cultivationRequired, newDisciple, recountDisciples } from '@/data/disciples'
import { JOBS } from '@/data/jobs'
import { ZERO, money, moneyMin } from '../decimal'
import { gameRandom } from '../context'
import { withResourceAction } from '../resourceObservation'
import { addResource, canAfford, payCost, pushLog, checkNeeds } from './core'
import { recompute } from './economy'
import { resetForRebirth } from '../state'
import { settleKarma } from './progression'
import { buyBuilding } from './buildings'
import { research } from './progression'
import { BUILDING_MAP } from '@/data/buildings'
import { UPGRADE_MAP } from '@/data/upgrades'
import { worldNeedsMet } from '@/data/samsara'

export function daoPerkCost(state, id) {
  const p = DAO_PERK_MAP[id]
  return p ? money(p.cost).times(money(p.growth).pow(daoLevel(state, id))) : ZERO
}
export function buyDaoPerk(state, derived, id) {
  const p = DAO_PERK_MAP[id]
  if (!p || !state.samsara.shopOpen || daoLevel(state, id) >= p.max) return false
  const cost = daoPerkCost(state, id)
  if (!money(state.dao).gte(cost)) return false
  return withResourceAction(state, { type: 'buyDaoPerk', id }, () => {
    if (money(state.dao).gte(1)) state.samsara.automation = true
    state.dao = money(state.dao).minus(cost)
    state.resources.dao = state.dao
    state.samsara.spent = money(state.samsara.spent).plus(cost)
    state.samsara.levels[id] = daoLevel(state, id) + 1
    recompute(state, derived)
    return true
  })
}
export function openDaoShop(state, derived) {
  if (state.samsara.shopOpen || !state.samsara.automation || !canAfford(state, { daoHeart: 1 })) return false
  payCost(state, { daoHeart: 1 })
  state.samsara.shopOpen = true
  pushLog(state, '发愿开启仙途，道果修持永久开放。', 'good')
  recompute(state, derived)
  return true
}
export function cultivateLoyalty(state, derived, id) {
  const member = state.disciples.members.find(m => m.id === id)
  if (!member) return false
  const cost = loyaltyCost(member)
  if (member.loyalty >= 1 || !canAfford(state, cost)) return false
  payCost(state, cost)
  member.loyalty = Math.min(1, member.loyalty + 0.05 * (1 + daoLevel(state, 'loyalty') * 0.25) / (1 + member.realm * 0.1))
  recompute(state, derived)
  return true
}
export function useCultivationItem(state, derived, id, resource = 'innerCore') {
  const member = state.disciples.members.find(m => m.id === id)
  const value = resource === 'innerCore' ? 1800 : resource === 'spiritCore' ? 43200 : 0
  if (!member || !value || member.realm > state.realm || member.cultivation >= cultivationRequired(member.realm) || !canAfford(state, { [resource]: 1 })) return false
  const gain = Math.min(value, cultivationRequired(member.realm) - member.cultivation)
  payCost(state, { [resource]: 1 })
  member.cultivation += gain
  member.lifetimeCultivation = Math.min(Number.MAX_SAFE_INTEGER, (member.lifetimeCultivation || 0) + gain)
  recompute(state, derived)
  return true
}

export function worldUnlocked(state, id) {
  return worldNeedsMet(state, id)
}
export function worldCost(state, id, capacity = false) {
  const w = WORLD_MAP[id], entry = state.worlds[id]
  if (!w || !entry) return {}
  const scale = money(1.35).pow(capacity ? entry.capacity : entry.level).times(capacity ? 0.5 : 1)
  return Object.fromEntries(Object.entries(w.cost).map(([r, n]) => [r, scale.times(n)]))
}
export function buildWorld(state, derived, id, capacity = false) {
  if (!worldUnlocked(state, id)) return false
  const cost = worldCost(state, id, capacity)
  if (!canAfford(state, cost)) return false
  payCost(state, cost)
  state.worlds[id][capacity ? 'capacity' : 'level']++
  state.samsara.blueprints[id] = true
  recompute(state, derived)
  return true
}
export function stationDisciple(state, derived, id, memberId) {
  const entry = state.worlds[id]
  if (!entry) return false
  const current = state.disciples.members.find(m => m.id === entry.memberId)
  const member = memberId == null ? null : state.disciples.members.find(m => m.id === memberId)
  if (memberId != null && (!member || member.onMission || !entry.level || !worldUnlocked(state, id))) return false
  if (current) {
    current.onMission = false
    current.roleId = JOBS.some(j => j.id === entry.returnJob) ? entry.returnJob : null
  }
  entry.memberId = member?.id ?? null
  entry.returnJob = member?.roleId ?? null
  entry.exposure = 0
  if (member) {
    member.roleId = null; member.onMission = true
    state.samsara.worldSeed = (Math.imul(state.samsara.worldSeed, 1664525) + 1013904223) >>> 0
    entry.riskBudget = -Math.log(1 - state.samsara.worldSeed / 4294967296)
  }
  recountDisciples(state.disciples)
  recompute(state, derived)
  return true
}

/** 共用库存先算全部驻守的可供比例，再一次扣款，避免同一库存重复支付。 */
export function advanceWorlds(state, derived, seconds) {
  const active = WORLD_DEFS.filter(w => worldUnlocked(state, w.id) && state.worlds[w.id].level > 0 && state.disciples.members.some(m => m.id === state.worlds[w.id].memberId))
  if (!active.length) return false
  const cost = { qiEnergy: ZERO, heavenBrick: ZERO }
  for (const w of active) {
    const n = Math.min(state.worlds[w.id].level, 1 + state.worlds[w.id].capacity)
    const member = state.disciples.members.find(m => m.id === state.worlds[w.id].memberId)
    const hazardRate = member.realm < w.safe ? 0.02 * Math.pow(2, w.safe - member.realm - 1) / 3600 : 0
    const duration = hazardRate > 0 ? Math.min(seconds, state.worlds[w.id].riskBudget / hazardRate) : seconds
    cost.qiEnergy = cost.qiEnergy.plus(w.energy * n * duration)
    cost.heavenBrick = cost.heavenBrick.plus(w.maintenance * n * duration)
  }
  let supply = money(1)
  for (const [r, n] of Object.entries(cost)) if (n.gt(0)) supply = moneyMin(supply, money(state.resources[r] || ZERO).div(n))
  const fraction = Math.max(0, supply.toNumber())
  payCost(state, Object.fromEntries(Object.entries(cost).map(([r, n]) => [r, n.times(fraction)])))
  for (const w of active) {
    const entry = state.worlds[w.id]
    const member = state.disciples.members.find(m => m.id === entry.memberId)
    const n = Math.min(entry.level, 1 + entry.capacity)
    // 低境每小时2%基础风险，差一境再翻倍；安全境界完全无死亡风险。
    const hazardRate = member.realm < w.safe ? 0.02 * Math.pow(2, w.safe - member.realm - 1) / 3600 : 0
    const workingSeconds = hazardRate > 0 ? Math.min(seconds, entry.riskBudget / hazardRate) : seconds
    entry.riskBudget = Math.max(0, entry.riskBudget - hazardRate * seconds)
    entry.exposure += seconds
    addResource(state, w.out, money(w.rate).times(n * workingSeconds * fraction), derived.max[w.out])
    if (hazardRate > 0 && entry.riskBudget <= 0) {
      rememberDisciple(state, member, '殒命·驻守')
      state.disciples.members = state.disciples.members.filter(m => m.id !== member.id)
      entry.memberId = null; entry.returnJob = null
      pushLog(state, `${member.name}在${w.name}冒险驻守中殒命。`, 'bad')
    }
  }
  if (active.length) recountDisciples(state.disciples)
  return active.length > 0
}

export function finalPreparation(state, derived, id) {
  const ids = new Set(Array.isArray(id) ? id : [id])
  let prepared = 0
  for (const member of state.disciples.members) {
    if (!ids.has(member.id) || member.realm < 10 || member.finalReady) continue
    if (!canAfford(state, FINAL_PREPARATION_COST)) break
    payCost(state, FINAL_PREPARATION_COST); member.finalReady = true; prepared++
  }
  if (!prepared) return false
  recompute(state, derived)
  return true
}
export function beginChallenge(state, derived) {
  if (state.realm < 10 || state.challenge.active || state.challenge.completed) return false
  state.challenge.active = true
  state.challenge.target = Math.max(SAMSARA.minimumParty, state.disciples.peak || 0, state.disciples.members.length)
  replenishChallenge(state, derived)
  recompute(state, derived)
  return true
}
export function replenishChallenge(state, derived) {
  if (!state.challenge.active) return 0
  const count = Math.max(0, Math.min(state.challenge.target, Math.floor(derived.maxDisciples)) - state.disciples.members.length)
  for (let i = 0; i < count; i++) {
    const member = newDisciple(state.disciples, 'triple', { legacy: true })
    member.loyalty = 0.7
    state.disciples.members.push(member)
    state.stats.recruits++
  }
  if (count) recountDisciples(state.disciples)
  return count
}
export function challengeQuote(state) {
  const c = state.challenge, next = c.protection + 1
  const cost = { worldSand: money(5).times(c.target).times(next), daoHeart: money(0.1).times(next) }
  const ready = c.active && state.realm >= 10 && state.disciples.members.length === c.target && state.disciples.members.every(m => m.realm >= 10 && m.finalReady)
  return { ready, cost, chance: Math.min(1, 0.5 + c.protection * 0.05), blockedHousing: state.disciples.members.length < c.target }
}
export function prepareChallenge(state, derived) {
  const q = challengeQuote(state)
  if (!state.challenge.active || state.challenge.protection >= 10 || !canAfford(state, q.cost)) return false
  payCost(state, q.cost); state.challenge.protection++
  recompute(state, derived)
  return true
}
export function resolveChallenge(state, derived, reset = false) {
  if (!state.challenge.active) return false
  const q = challengeQuote(state)
  if (!reset && (!q.ready || state.challenge.protection < 1)) return false
  if (!reset && gameRandom(state) < q.chance) {
    state.challenge.active = false; state.challenge.completed = true
    for (const member of state.disciples.members) member.collectiveAscended = true
    state.samsara.completions++
    state.samsara.lastVictory = { target: state.challenge.target, life: (state.stats.ascensions || 0) + (state.stats.reincarnations || 0) + (state.stats.breakthroughDeaths || 0) + 1 }
    pushLog(state, `全宗${state.challenge.target}名弟子飞升圆满。愿无一人被遗忘。`, 'good')
    return { success: true }
  }
  const karma = settleKarma(state, derived, true)
  const dao = reset ? ZERO : daoReward(state).times(SAMSARA.failedDaoRatio)
  resetForRebirth(state, karma, reset ? 'challengeReset' : 'challengeFailure', { daoGain: dao })
  recompute(state, derived)
  return { success: false, reset, karma, dao }
}

/** 有界重建：每次最多买一座并研究一个条目，不免费恢复、不重新分配岗位。 */
export function advanceRebuild(state, derived) {
  const plan = state.rebuild
  if (!plan?.active || state.challenge.active) return false
  let changed = false
  for (const [id, count] of Object.entries(plan.buildings)) {
    if ((state.buildings[id]?.count || 0) >= count || !checkNeeds(state, BUILDING_MAP[id]?.needs)) continue
    if (buyBuilding(state, derived, id, 1)) { changed = true; break }
  }
  for (const id of plan.upgrades) {
    if (state.upgrades[id] || !UPGRADE_MAP[id] || !checkNeeds(state, UPGRADE_MAP[id].needs)) continue
    if (research(state, derived, id)) { changed = true; break }
  }
  for (const id of Object.keys(plan.crafts)) state.autoCraft[id] = true
  return changed
}
