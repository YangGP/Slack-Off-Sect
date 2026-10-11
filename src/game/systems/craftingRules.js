import { PROCESSING_STATIONS, RECIPE_STATIONS, PROCESSING_POWER_COST, allocateProcessing } from '@/data/industry'
import { CRAFTS, craftCost, CRAFT_MAP, autoCraftTime, craftTime } from '@/data/crafts'
import { floorNumber, atLeast, subtractResource } from '../numbers'
import { isCraftUnlocked, canAfford, clamp, countOf } from './core'
import { RESOURCE_MAP } from '@/data/resources'
import { CONFIG } from '@/data/config'

export const EPS = 1e-9

export const PROCESSING_RECIPES = Object.fromEntries(PROCESSING_STATIONS.map(station =>
  [station.id, CRAFTS.filter(recipe => RECIPE_STATIONS[recipe.id] === station.id)]))

/** 制作增产随设施和专业技艺叠加，不对加工品设置统一上限。 */
export function craftYield(derived, recipe) {
  if (recipe.fixedYield) return recipe.amount
  const bonus = (derived.craftBonus || 0) + (derived.craftBonusByResource?.[recipe.out] || 0)
  return recipe.amount * (1 + bonus)
}

export function materialCopies(state, derived, recipe) {
  let byMaterial = Infinity
  for (const [res, cost] of Object.entries(craftCost(derived, recipe))) {
    const have = state.resources[res] || 0
    if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(have)) return 0
    if (cost > 0) byMaterial = Math.min(byMaterial, floorNumber(have / cost))
  }
  return Number.isFinite(byMaterial) ? Math.max(0, byMaterial) : 0
}

/** 按当前材料与仓储余量，这个配方最多还能做几份 */
export function maxCraftable(state, derived, recipeId) {
  const recipe = CRAFT_MAP[recipeId]
  if (!recipe || !isCraftUnlocked(state, recipe)) return 0
  const byMaterial = materialCopies(state, derived, recipe)
  const room = floorNumber(
    (derived.max[recipe.out] - (state.resources[recipe.out] || 0)) / recipe.amount,
  )
  return Math.max(0, Math.min(byMaterial, room))
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
    atLeast(subtractResource(state.resources[res] || 0, cost), autoCraftReserve(state, derived, res)))
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
    const fuelAvailable = fuel && subtractResource(state.resources[fuel] || 0, processingFuelReserve(state, derived, fuel)) > EPS
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
          .map(([res, cost]) => [res, used > 0 ? cost * extra * work / used : 0])),
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
  let batch = 0
  for (const recipe of CRAFTS) if (RECIPE_STATIONS[recipe.id] && isProcessingCraft(state, derived, recipe.id) &&
    maxCraftable(state, derived, recipe.id) > 0 && canProcessCraft(state, derived, recipe)) {
    batch = Math.max(batch, craftCost(derived, recipe)[res] || 0)
  }
  return autoCraftReserve(state, derived, res) + batch
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
  out.outputPerMinute = out.perMinute * craftYield(derived, recipe)
  const missing = Object.entries(costs).filter(([res, cost]) => !atLeast(state.resources[res] || 0, cost))
    .map(([res]) => RESOURCE_MAP[res]?.name || res)
  out.reason = !hasCraftOrder(state, derived, recipeId) && out.target > 0 && (state.resources[recipe.out] || 0) >= out.target
    ? '目标已达 · 暂停'
    : atLeast(state.resources[recipe.out] || 0, derived.max[recipe.out]) ? '成品满仓 · 暂停'
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
  if (target > 0 && (state.resources[recipe.out] || 0) >= target) return false
  if (!canAfford(state, craftCost(derived, recipe))) return false
  if (!derived.autoCraftUnlocked) return true
  return Object.entries(craftCost(derived, recipe)).every(([res, cost]) =>
    atLeast(subtractResource(state.resources[res] || 0, cost), autoCraftReserve(state, derived, res)),
  )
}

export function autoCraftReserve(state, derived, res) {
  if (!derived.autoCraftUnlocked) return 0
  const reserve = clamp(Number(state.settings.craftReservePercent) || 0, 0, 90) / 100
  return Math.max(derived.daoAutomation ? (derived.max[res] || 0) * reserve : 0,
    Number(state.settings.craftReserves?.[res]) || 0)
}

/** 目标是成品库存；0 表示不限，消费成品后自动补回。 */
export function craftTarget(state, derived, recipeId) {
  if (!derived.craftTargetsUnlocked) return 0
  const value = Number(state.craftTargets?.[recipeId])
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

/** 界面统一使用此收支快照；不改变 tick 的实际扣料与口粮判断。 */
export function resourceFlow(derived, resId) {
  const expenseItems = [
    ...(derived.expenseSources[resId] || []),
    ...(derived.autoCraftDrain?.[resId] || []),
  ]
  const income = derived.rates[resId] || 0
  const expense = expenseItems.reduce((sum, item) => sum + Math.max(0, -item.value), 0)
  return { income, expense, net: income - expense, expenseItems }
}

/** 当前节拍下的投入缺口与库存缓冲；不是未来产能承诺。 */
export function processingBottleneck(state, derived, recipeId, plan = processingPlan(state, derived)) {
  const recipe = CRAFT_MAP[recipeId]
  if (!recipe) return { reason: '', inputs: [] }
  const status = autoCraftStatus(state, derived, recipeId, plan)
  const inputs = Object.keys(craftCost(derived, recipe)).map(res => {
    const flow = resourceFlow(derived, res)
    const deficit = Math.max(0, -flow.net)
    const usable = Math.max(0, subtractResource(state.resources[res] || 0, autoCraftReserve(state, derived, res)))
    return { res, deficit, seconds: deficit > 0 ? usable / deficit : Infinity }
  }).filter(input => input.deficit > EPS)
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
    if (atLeast(state.resources[recipe.out] || 0, derived.max[recipe.out] || Infinity)) continue
    if (!canProcessCraft(state, derived, recipe)) continue
    const line = plan[recipe.id]
    if (line && line.speed <= 0) continue
    const per = line ? craftTime(recipe, derived) / line.speed : autoCraftTime(recipe, derived)
    const cost = craftCost(derived, recipe)
    for (const [res, rate] of Object.entries(line?.powerDrain || {})) if (rate > 0) {
      drain[res] ||= []
      drain[res].push({ kind: 'autoCraft', id: recipe.id, label: '动力·' + recipe.name, count: 0, value: -rate })
    }
    for (const res in cost) {
      if (!drain[res]) drain[res] = []
      drain[res].push({
        kind: 'autoCraft',
        id: recipe.id,
        label: '加工·' + recipe.name,
        count: 0,
        value: -cost[res] / per,
      })
    }
  }
  return drain
}

/**
 * 手动「吸取天地灵气」：开局什么都没有时唯一的灵气来源。
 * 前20座聚灵阵线性增加点击收益，此后按平方根增长；不乘全局倍率。
 */
export function clickGain(state, derived) {
  void derived
  const fields = countOf(state, 'spiritField')
  const full = CONFIG.CLICK_QI_FULL_FIELDS
  const effective = Math.min(fields, full) + Math.sqrt(Math.max(0, fields - full))
  return CONFIG.CLICK_QI_BASE + CONFIG.CLICK_QI_PER_FIELD * effective
}
