import { PROCESSING_STATIONS, RECIPE_STATIONS, PROCESSING_POWER_COST, allocateProcessing } from '@/data/industry'
import { CRAFTS, craftCost, CRAFT_MAP, autoCraftTime, craftTime } from '@/data/crafts'
import { atLeast } from '../numbers'
import { MONEY_INFINITY, ONE, ZERO, money, moneyAvailable, moneyMax, moneyMin, moneySum, moneyToCount, moneyToNumber } from '../decimal'
import { isCraftUnlocked, canAfford, clamp, countOf } from './core'
import { resourceName } from '@/data/resources'
import { CONFIG } from '@/data/config'

export const EPS = 1e-9

export const PROCESSING_RECIPES = Object.fromEntries(PROCESSING_STATIONS.map(station =>
  [station.id, CRAFTS.filter(recipe => RECIPE_STATIONS[recipe.id] === station.id)]))

/** 制作增产随设施和专业技艺叠加，不对加工品设置统一上限。产出数量是金额。 */
export function craftYield(derived, recipe) {
  const amount = money(recipe.amount)
  if (recipe.fixedYield) return amount
  const bonus = (derived.craftBonus || 0) + (derived.craftBonusByResource?.[recipe.out] || 0)
  return amount.times(ONE.plus(bonus))
}

/**
 * 按当前材料还能做几份（金额域，Decimal，向下取整）。
 * 这是无界的经济数量：材料够就被材料封顶，不能用安全整数截断。
 */
export function materialCopiesMoney(state, derived, recipe) {
  let byMaterial = null
  for (const [res, cost] of Object.entries(craftCost(derived, recipe))) {
    const need = money(cost)
    const have = state.resources[res] ?? ZERO
    if (need.isNegative() || !need.isFinite() || !have.isFinite()) return ZERO
    if (need.gt(0)) {
      const copies = have.div(need).floor()
      byMaterial = byMaterial === null ? copies : moneyMin(byMaterial, copies)
    }
  }
  return byMaterial === null ? ZERO : moneyMax(ZERO, byMaterial)
}

/** 材料可做份数（Number 计数）：只给循环上限、订单与界面展示；公式份数请用 materialCopiesMoney。 */
export function materialCopies(state, derived, recipe) {
  return moneyToCount(materialCopiesMoney(state, derived, recipe))
}

/**
 * 按当前材料与仓储余量，这个配方最多还能做几份（金额域，Decimal）。
 * 手动「¼料 / ½料 / 全部」与批量结算都从这里取完整份数。
 */
export function maxCraftableMoney(state, derived, recipeId) {
  const recipe = CRAFT_MAP[recipeId]
  if (!recipe || !isCraftUnlocked(state, recipe)) return ZERO
  const amount = money(recipe.amount)
  if (!amount.gt(0) || !amount.isFinite()) return ZERO
  const cap = derived.max[recipe.out] ?? MONEY_INFINITY
  const have = state.resources[recipe.out] ?? ZERO
  if (!cap.gt(have)) return ZERO
  const room = cap.minus(have).div(amount).floor()
  return moneyMax(ZERO, moneyMin(materialCopiesMoney(state, derived, recipe), room))
}

/** 最多还能做几份（Number 计数）：界面与循环使用，超出安全整数只影响展示。 */
export function maxCraftable(state, derived, recipeId) {
  return moneyToCount(maxCraftableMoney(state, derived, recipeId))
}

export function hasCraftOrder(state, derived, recipeId) {
  const order = state.craftOrders?.[recipeId]
  return !!(derived.industrial && RECIPE_STATIONS[recipeId] && order?.remaining > 0 && !order.paused && isCraftUnlocked(state, CRAFT_MAP[recipeId]))
}

export function isProcessingCraft(state, derived, recipeId) {
  return hasCraftOrder(state, derived, recipeId) || isAutoCrafting(state, derived, recipeId)
}

export function canProcessCraft(state, derived, recipe) {
  if (!hasCraftOrder(state, derived, recipe.id)) return canAutoCraft(state, derived, recipe)
  return canAfford(state, craftCost(derived, recipe)) && Object.entries(craftCost(derived, recipe)).every(([res, cost]) =>
    atLeast(moneyAvailable(state.resources[res] ?? ZERO, cost), autoCraftReserve(state, derived, res)))
}

/** 这个配方现在是否在自动制作（常驻：每 time 秒一份） */
export function isAutoCrafting(state, derived, recipeId) {
  return !!(
    derived.autoCraftUnlocked &&
    state.settings.autoCraftOn &&
    state.autoCraft[recipeId]
    && isCraftUnlocked(state, CRAFT_MAP[recipeId])
  )
}

/** 自动产线的容量分配快照；缺料、满仓、达标的配方不占工位。 */
export function processingPlan(state, derived) {
  const plan = {}
  if (!derived.industrial) return plan
  const groups = PROCESSING_STATIONS.map(station => {
    const recipes = PROCESSING_RECIPES[station.id]
    const capacity = derived.processingCapacity[station.id] || 0
    const requests = recipes.map(recipe => ({
      id: recipe.id,
      weight: processingWeight(state, recipe.id),
      demand: isProcessingCraft(state, derived, recipe.id) && maxCraftable(state, derived, recipe.id) > 0 && canProcessCraft(state, derived, recipe)
        ? derived.autoCraftSpeeds[recipe.id] || 1 : 0,
    }))
    const selected = state.settings.processingModes?.[station.id] || 'normal'
    const mode = selected === 'energy' && derived.energyCraftUnlocked ? 'energy'
      : selected === 'overload' && derived.autoCraftSpeedUnlocked ? 'overload' : 'normal'
    const cost = PROCESSING_POWER_COST[mode]
    const fuel = cost && Object.keys(cost)[0]
    const fuelAvailable = fuel && moneyAvailable(state.resources[fuel] ?? ZERO,
      processingFuelReserve(state, derived, fuel)).gt(EPS)
    const demand = Math.max(0, Math.min(capacity, requests.reduce((sum, r) => sum + r.demand, 0) - capacity))
    return { station, recipes, capacity, requests, mode, wanted: demand, fuelAvailable, demand: mode !== 'normal' && fuelAvailable ? demand : 0 }
  })
  const power = allocateProcessing(derived.processingPowerCapacity, groups.filter(g => g.mode === 'energy')
    .map(g => ({ id: g.station.id, demand: g.demand, weight: 1 })))
  const cooling = allocateProcessing(derived.processingCoolingCapacity, groups.map(g => ({
    id: g.station.id, demand: g.mode === 'energy' ? power[g.station.id] || 0 : g.demand, weight: 1,
  })))
  for (const group of groups) {
    const { station, recipes, requests, mode, capacity: baseCapacity } = group
    const boost = cooling[station.id] || 0
    const capacity = baseCapacity + boost
    const allocation = allocateProcessing(capacity, requests)
    const used = Object.values(allocation).reduce((sum, n) => sum + n, 0)
    const extra = Math.max(0, used - baseCapacity)
    for (const recipe of recipes) {
      const work = allocation[recipe.id]
      const efficiency = 1 + (derived.craftSpeedByRecipe[recipe.id] || 0)
      plan[recipe.id] = { station: station.id, name: station.name, capacity, baseCapacity, boost, mode, work,
        powerReason: mode === 'normal' ? '普通加工' : group.wanted <= EPS ? '无需额外负荷'
          : !group.fuelAvailable ? '动力不足或已到保留量'
          : mode === 'energy' && (power[station.id] || 0) + EPS < group.demand ? '供能容量限制'
          : boost + EPS < group.demand ? '冷却容量限制' : '驱动就绪',
        powerDrain: Object.fromEntries(Object.entries(PROCESSING_POWER_COST[mode] || {})
          .map(([res, cost]) => [res, used > 0 ? money(cost).times(extra).times(work).div(used) : ZERO])),
        share: capacity > 0 ? work / capacity : 0,
        speed: work * efficiency,
        requested: (derived.autoCraftSpeeds[recipe.id] || 1) * efficiency,
        weight: processingWeight(state, recipe.id),
      }
    }
  }
  return plan
}

export function processingFuelReserve(state, derived, res) {
  let batch = ZERO
  for (const recipe of CRAFTS) if (RECIPE_STATIONS[recipe.id] && isProcessingCraft(state, derived, recipe.id) &&
    maxCraftable(state, derived, recipe.id) > 0 && canProcessCraft(state, derived, recipe)) {
    batch = moneyMax(batch, craftCost(derived, recipe)[res] ?? ZERO)
  }
  return autoCraftReserve(state, derived, res).plus(batch)
}

export function processingWeight(state, recipeId) {
  const value = state.settings.craftWeights?.[recipeId]
  return Number.isFinite(value) ? clamp(value, 1, 100) : 1
}

/**
 * 自动制作的进度与余量（界面用）：
 *   on      是否在自动做
 *   step    单件耗时（秒）
 *   wait    距离下一件还有多少秒
 *   made    本轮已经做了几份
 *   canMake 按当前材料与仓储余量还能做几份
 */
export function autoCraftStatus(state, derived, recipeId, plan = processingPlan(state, derived)) {
  const recipe = CRAFT_MAP[recipeId]
  const timer = (state.craftTimers && state.craftTimers[recipeId]) || null
  const step = autoCraftTime(recipe, derived)
  const out = {
    on: isProcessingCraft(state, derived, recipeId),
    orderRemaining: state.craftOrders?.[recipeId]?.remaining || 0,
    orderPaused: state.craftOrders?.[recipeId]?.paused === true,
    step,
    wait: 0,
    made: (timer && timer.made) || 0,
    canMake: 0,
  }
  if (!recipe) return out
  const line = plan[recipeId]
  out.line = line || null
  const nominalSpeed = line?.requested || 1
  if (line) out.step = craftTime(recipe, derived) / (line.speed || nominalSpeed)
  if (out.on) out.wait = line
    ? Math.max(0, craftTime(recipe, derived) - (timer?.t || 0)) / (line.speed || nominalSpeed)
    : Math.max(0, step - ((timer && timer.t) || 0))
  out.canMake = maxCraftable(state, derived, recipeId)
  out.ready = out.canMake > 0 && canProcessCraft(state, derived, recipe) && (!line || line.speed > 0)
  out.target = craftTarget(state, derived, recipeId)
  const costs = craftCost(derived, recipe)
  out.cost = costs
  out.perMinute = out.on && out.ready ? 60 / out.step : 0
  out.outputPerMinute = money(out.perMinute).times(craftYield(derived, recipe))
  const missing = Object.entries(costs).filter(([res, cost]) => !atLeast(state.resources[res] ?? ZERO, cost))
    .map(([res]) => resourceName(res))
  out.reason = !hasCraftOrder(state, derived, recipeId) && out.target.gt(0) &&
      (state.resources[recipe.out] ?? ZERO).gte(out.target)
    ? '目标已达 · 暂停'
    : atLeast(state.resources[recipe.out] ?? ZERO, derived.max[recipe.out] ?? MONEY_INFINITY) ? '成品满仓 · 暂停'
    : missing.length ? `缺${missing.join('、')} · 等待供料`
    : !canProcessCraft(state, derived, recipe) ? '保留材料 · 暂停'
    : line && line.capacity <= 0 ? '工位停用或维护断供'
    : line && line.speed <= 0 ? '等待加工容量'
    : '可运行'
  return out
}

export function canAutoCraft(state, derived, recipe) {
  if (!isCraftUnlocked(state, recipe)) return false
  const target = craftTarget(state, derived, recipe.id)
  if (target.gt(0) && (state.resources[recipe.out] ?? ZERO).gte(target)) return false
  if (!canAfford(state, craftCost(derived, recipe))) return false
  if (!derived.autoCraftUnlocked) return true
  return Object.entries(craftCost(derived, recipe)).every(([res, cost]) =>
    atLeast(moneyAvailable(state.resources[res] ?? ZERO, cost), autoCraftReserve(state, derived, res)),
  )
}

/**
 * 材料 / 成品的保留量（金额）：比例保留按仓容折算，另有逐项定额保留。
 * 自动制作与凝灵诀都未解锁时没有保留量。
 */
export function autoCraftReserve(state, derived, res) {
  if (!derived.autoCraftUnlocked && !derived.autoCondenseLiquidUnlocked) return ZERO
  const reserve = clamp(Number(state.settings.craftReservePercent) || 0, 0, 90) / 100
  const cap = derived.max[res] ?? ZERO
  const byPercent = derived.daoAutomation && cap.isFinite() ? cap.times(reserve) : ZERO
  return moneyMax(byPercent, state.settings.craftReserves?.[res] ?? ZERO)
}

/** 库存目标是成品数量（金额，允许小数）：0 表示不限，消费成品后自动补回。 */
export function craftTarget(state, derived, recipeId) {
  if (!derived.craftTargetsUnlocked) return ZERO
  const value = money(state.craftTargets?.[recipeId] ?? ZERO)
  return moneyMax(ZERO, value)
}

/** 界面统一使用此收支快照；不改变 tick 的实际扣料与口粮判断。 */
export function resourceFlow(derived, resId) {
  const expenseItems = [
    ...(derived.expenseSources[resId] || []),
    ...(derived.autoCraftDrain?.[resId] || []),
  ]
  const income = derived.rates[resId] ?? ZERO
  // 减耗是正向抵扣项，先合并所有出项再取负，不能逐项截掉抵扣。
  const expense = moneyMax(ZERO, moneySum(expenseItems.map(item => item.value)).negated())
  return { income, expense, net: income.minus(expense), expenseItems }
}

/** 当前节拍下的投入缺口与库存缓冲；不是未来产能承诺。缺口是金额，缓冲时长转 Number。 */
export function processingBottleneck(state, derived, recipeId, plan = processingPlan(state, derived), status = autoCraftStatus(state, derived, recipeId, plan)) {
  const recipe = CRAFT_MAP[recipeId]
  if (!recipe) return { reason: '', inputs: [] }
  const inputs = Object.keys(craftCost(derived, recipe)).map(res => {
    const flow = resourceFlow(derived, res)
    const deficit = moneyMax(ZERO, flow.net.negated())
    const usable = moneyMax(ZERO, moneyAvailable(state.resources[res] ?? ZERO, autoCraftReserve(state, derived, res)))
    return { res, deficit, seconds: deficit.gt(0) ? moneyToNumber(usable.div(deficit)) : Infinity }
  }).filter(input => input.deficit.gt(EPS))
  const line = plan[recipeId]
  const reason = !status.on ? '待启用自动' : !status.ready ? status.reason
    : line?.speed + EPS < line?.requested ? line.mode !== 'normal' && line.powerReason !== '驱动就绪' ? line.powerReason : '工位容量限制'
    : inputs.length ? '上游供料不足，正在消耗库存' : '按当前速限运行'
  return { reason, inputs }
}

/**
 * 当前可运行的自动配方按节拍估算耗料，暂停配方不计入。
 * 供界面净额和趋势展示，不并入 expense，避免按份制作与持续费用双扣。
 */
export function computeAutoCraftDrain(state, derived) {
  const drain = {}
  const plan = processingPlan(state, derived)
  for (const recipe of CRAFTS) {
    if (!isProcessingCraft(state, derived, recipe.id)) continue
    if (atLeast(state.resources[recipe.out] ?? ZERO, derived.max[recipe.out] ?? MONEY_INFINITY)) continue
    if (!canProcessCraft(state, derived, recipe)) continue
    const line = plan[recipe.id]
    if (line && line.speed <= 0) continue
    const per = line ? craftTime(recipe, derived) / line.speed : autoCraftTime(recipe, derived)
    const cost = craftCost(derived, recipe)
    for (const [res, rate] of Object.entries(line?.powerDrain || {})) if (rate.gt(0)) {
      drain[res] ||= []
      drain[res].push({ kind: 'autoCraft', id: recipe.id, label: '动力·' + recipe.name, count: 0, value: rate.negated() })
    }
    for (const res in cost) {
      if (!drain[res]) drain[res] = []
      drain[res].push({
        kind: 'autoCraft',
        id: recipe.id,
        label: '加工·' + recipe.name,
        count: 0,
        value: money(cost[res]).div(per).negated(),
      })
    }
  }
  return drain
}

/**
 * 手动「吸取天地灵气」：开局什么都没有时唯一的灵气来源。
 * 前20座聚灵阵线性增加点击收益，此后按平方根增长；不乘全局倍率。金额为 Decimal。
 */
export function clickGain(state, derived) {
  void derived
  const fields = countOf(state, 'spiritField')
  const full = CONFIG.CLICK_QI_FULL_FIELDS
  const effective = Math.min(fields, full) + Math.sqrt(Math.max(0, fields - full))
  return money(CONFIG.CLICK_QI_BASE).plus(money(CONFIG.CLICK_QI_PER_FIELD).times(effective))
}
