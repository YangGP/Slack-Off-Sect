import { WORLD_DEFS, worldNeedsMet, SAMSARA, daoLevel } from '@/data/samsara'
import { WORLD_FACILITIES, WORLD_FACILITY_MAP, WORLD_LIVING_TARGETS } from '@/data/worldFacilities'
import { CONFIG } from '@/data/config'
import { MONEY_INFINITY, ONE, ZERO, money, moneyMax, moneyMin, moneyToRatio } from '../decimal'
import { processingPlan } from './craftingRules'
import { setResourceValue } from '../resourceObservation'

// 段内重算只读取已预算的支援，不能用上一帧或新产流重新申请一次免费效果。
const segments = new WeakMap()
export const worldSegment = state => segments.get(state)

export function facilityRunning(state, id) {
  const f = WORLD_FACILITY_MAP[id], e = state.worlds?.[f?.world]?.facilities?.[id]
  return !!(f && e?.built && state.upgrades[f.research] && worldNeedsMet(state, f.world) && (f.branch ? e.share > 0 : e.on))
}

/** 地面先付；灵能同时满足长段闭式衰减下的非负约束，不把整段毛产量先借给世界。 */
function availableAfterGround(state, derived, res, seconds) {
  const stock = state.resources[res] ?? ZERO
  const net = (derived.rates[res] ?? ZERO).plus(derived.expense[res] ?? ZERO)
  let available = moneyMax(ZERO, stock.plus(net.times(seconds)))
  if (res === 'qiEnergy') {
    const decay = Math.max(SAMSARA.qiDecayFloor, CONFIG.QI_ENERGY_DECAY * Math.pow(0.85, daoLevel(state, 'energyRetention')))
    const lambda = -Math.log(1 - decay), remain = Math.exp(-lambda * seconds)
    const equivalent = net.plus(stock.times(lambda * remain / Math.max(1e-300, 1 - remain))).times(seconds)
    available = moneyMin(available, moneyMax(ZERO, equivalent))
  }
  const cap = derived.max[res] ?? MONEY_INFINITY
  return moneyMin(available, moneyMax(stock, cap))
}

function worldBase(state, seconds) {
  return WORLD_DEFS.flatMap(w => {
    const e = state.worlds?.[w.id]
    const member = state.disciples.members.find(m => m.id === e?.memberId)
    if (!member || !e.level || !worldNeedsMet(state, w.id)) return []
    const n = Math.min(e.level, 1 + e.capacity)
    const hazard = member.realm < w.safe ? 0.02 * 2 ** (w.safe - member.realm - 1) / 3600 : 0
    const duration = hazard > 0 ? Math.min(seconds, e.riskBudget / hazard) : seconds
    const ring = w.id === 'spirit' && facilityRunning(state, 'returnRing')
    return [{ world: w, memberId: member.id, n, hazard, duration,
      energy: money(w.energy).times(n * duration).times(ring ? state.upgrades.returnCalibration ? 0.75 : 0.85 : 1),
      brick: money(w.maintenance).times(n * duration),
      extraBrick: ring ? money(w.maintenance).times(n * duration).times('0.1') : ZERO }]
  })
}

function productionBudget(state, derived, seconds, base, support = {}) {
  const total = { qiEnergy: ZERO, heavenBrick: ZERO }
  for (const row of base) {
    total.qiEnergy = total.qiEnergy.plus(row.energy)
    total.heavenBrick = total.heavenBrick.plus(row.brick.times(1 - (support.worldBrickDiscount || 0))).plus(row.extraBrick)
  }
  let supply = ONE
  for (const [res, amount] of Object.entries(total)) if (amount.gt(0)) supply = moneyMin(supply, availableAfterGround(state, derived, res, seconds).div(amount))
  supply = moneyMax(ZERO, moneyMin(ONE, supply))
  const cost = Object.fromEntries(Object.entries(total).map(([r, n]) => [r, n.times(supply)]))
  const rows = base.map(row => {
    const w = row.world
    const grossBase = money(w.rate).times(row.n * row.duration).times(supply)
    let extra = ZERO, poolSupply = 0
    if (w.id === 'marrow' && facilityRunning(state, 'marrowPool')) {
      const units = money(row.n * row.duration).times(supply)
      const needs = { herb: units.times(0.5), spiritLiquid: units.times(0.002) }
      let fraction = ONE
      for (const [res, amount] of Object.entries(needs)) if (amount.gt(0)) fraction = moneyMin(fraction, availableAfterGround(state, derived, res, seconds).div(amount))
      fraction = moneyMax(ZERO, moneyMin(ONE, fraction)); poolSupply = fraction.toNumber()
      for (const [res, amount] of Object.entries(needs)) cost[res] = (cost[res] ?? ZERO).plus(amount.times(fraction))
      extra = grossBase.times(state.upgrades.herbalCirculation ? 0.4 : 0.25).times(fraction)
    }
    const room = moneyMax(ZERO, (derived.max[w.out] ?? MONEY_INFINITY).minus(availableAfterGround(state, derived, w.out, seconds)))
    const gross = moneyMin(grossBase.plus(extra), room)
    return { ...row, grossBase, extra, gross, poolSupply, branches: {}, net: gross,
      energyPaid: row.energy.times(supply), brickPaid: row.brick.times(1 - (support.worldBrickDiscount || 0)).plus(row.extraBrick).times(supply) }
  })
  return { rows, cost, supply: supply.toNumber(), seconds, support }
}

/** 一次保守预预算，支援改善后的额外产出不在本段回灌到分流。 */
export function planWorlds(state, derived, seconds = 1) {
  const dt = Math.max(0.001, seconds), base = worldBase(state, dt)
  const plan = productionBudget(state, derived, dt, base)
  if (!base.length) return { ...plan, branches: {}, base }
  const work = processingPlan(state, derived)
  const positiveWork = id => (work[id]?.speed || 0) > 0
  const condensationDemand = ['condenseLiquid', 'condenseCrystal'].reduce((sum, id) =>
    sum + (positiveWork(id) ? (work[id].requested || 0) / (1 + (derived.craftSpeedByRecipe[id] || 0)) : 0), 0)
  const support = {}, branches = {}
  for (const f of WORLD_FACILITIES.filter(f => f.branch)) {
    const row = plan.rows.find(r => r.world.id === f.world)
    const settings = state.worlds?.[f.world]?.facilities?.[f.id]
    const target = f.id === 'spiritHub' ? condensationDemand > (derived.processingCapacity.condensation || 0) + 1e-9
      : f.id === 'marrowFurnace' ? positiveWork(settings?.recipe)
        : f.id === 'boundaryStele' ? plan.rows.some(r => r.brick.gt(0) && r.duration > 0)
          : WORLD_LIVING_TARGETS.some(id => (derived.expenseSources.qiEnergy || []).some(e => e.id === id && e.value.lt(0)))
    const amount = row && target && facilityRunning(state, f.id) ? row.gross.times(settings.share) : ZERO
    const hourly = amount.times(3600).div(dt)
    const limit = state.upgrades[f.technique] ? f.improved : f.limit
    const effect = amount.gt(0) ? money(limit).times(hourly).div(hourly.plus(f.q50)).toNumber() : 0
    branches[f.id] = { amount, effect, world: f.world, recipe: settings?.recipe || null,
      reason: !facilityRunning(state, f.id) ? '支援关闭' : !row || !row.gross.gt(0) ? '驻守或供给不足'
        : !target ? f.id === 'spiritHub' && condensationDemand > 0 ? '凝聚容量已满足当前速限' : '没有可运行的目标' : '支援就绪' }
    if (f.id === 'spiritHub') support.condensationCapacity = effect
    if (f.id === 'marrowFurnace') { support.alchemySpeed = effect; support.alchemyRecipe = settings?.recipe }
    if (f.id === 'boundaryStele') support.worldBrickDiscount = effect
    if (f.id === 'cooperativeArray') support.livingEnergyDiscount = effect
  }
  return { ...plan, support, branches, base }
}

/** 地面按同一支援重算后，只重算最终可付运行量，不能再提高支援Q。 */
export function finishWorldPlan(state, derived, preview) {
  const result = productionBudget(state, derived, preview.seconds, preview.base, preview.support)
  result.branches = preview.branches
  for (const row of result.rows) {
    let diverted = ZERO
    for (const [id, branch] of Object.entries(preview.branches)) if (branch.world === row.world.id) {
      // 最终供给若因其他合法变化缩小，宁可减少分流，绝不交付超过真实产量。
      const fraction = preview.rows.find(r => r.world.id === row.world.id)?.gross
      const amount = fraction?.gt(0) ? branch.amount.times(moneyMin(ONE, row.gross.div(fraction))) : ZERO
      row.branches[id] = amount; diverted = diverted.plus(amount)
    }
    row.net = moneyMax(ZERO, row.gross.minus(diverted))
  }
  return result
}

export function attachWorldPlan(derived, plan, charge = true) {
  derived.worldPlan = plan
  const rates = {}, sources = {}, expenses = {}
  for (const row of plan.rows) {
    rates[row.world.out] = row.net.div(plan.seconds)
    derived.net[row.world.out] = (derived.net[row.world.out] ?? ZERO).plus(rates[row.world.out])
    sources[row.world.out] = [{ kind: 'world', id: row.world.id, label: row.world.name, value: rates[row.world.out] }]
  }
  for (const [res, amount] of Object.entries(plan.cost)) if (amount.gt(0)) {
    const value = amount.div(plan.seconds).negated()
    expenses[res] = [{ kind: 'world', id: 'worlds', label: '小界维护', value }]
    if (charge) {
      derived.expense[res] = (derived.expense[res] ?? ZERO).plus(value)
      derived.expenseSources[res] = [...(derived.expenseSources[res] || []), ...expenses[res]]
      derived.net[res] = (derived.net[res] ?? ZERO).plus(value)
    }
  }
  derived.worldFlow = { rates, sources, expenses: charge ? {} : expenses, supply: plan.supply }
}

export function beginWorldSegment(state, derived, seconds) {
  segments.delete(state)
  const plan = derived.worldPlan
  if (!plan?.rows.length) return
  segments.set(state, { plan, support: plan.support, seconds, paid: false, work: { spiritHub: 0, marrowFurnace: 0 } })
}

/** 记录真实工位运行时长；只用于返还未使用的分流，不能生成额外物资。 */
export function recordWorldWork(state, seconds, plan) {
  const frame = segments.get(state)
  if (!frame || !(seconds > 0)) return
  if (['condenseLiquid', 'condenseCrystal'].some(id => plan[id]?.speed > 0)) frame.work.spiritHub += seconds
  const recipe = frame.support.alchemyRecipe
  if (recipe && plan[recipe]?.speed > 0) frame.work.marrowFurnace += seconds
}

export function recordWorldBatchWork(state, times) {
  const frame = segments.get(state)
  if (!frame) return
  frame.work.spiritHub += Math.max(times.condenseLiquid || 0, times.condenseCrystal || 0)
  frame.work.marrowFurnace += times[frame.support.alchemyRecipe] || 0
}

export function endWorldSegment(state, derived) {
  const frame = segments.get(state)
  if (!frame) return false
  if (frame.paid) for (const row of frame.plan.rows) {
    for (const id of ['spiritHub', 'marrowFurnace']) {
      const reserved = row.branches[id] ?? ZERO
      const unused = reserved.times(1 - Math.min(1, frame.work[id] / frame.seconds))
      if (!unused.gt(0)) continue
      const res = row.world.out, before = state.resources[res] ?? ZERO, cap = derived.max[res] ?? MONEY_INFINITY
      setResourceValue(state, res, moneyMin(before.plus(unused), moneyMax(before, cap)), { source: 'worlds:unusedSupport' })
    }
  }
  segments.delete(state)
  return true
}
