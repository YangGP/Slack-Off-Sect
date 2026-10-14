import { BUILDING_MAP } from '@/data/buildings'
import { checkNeeds, buildingCost, canAfford, payCost, countOf, entryOf, pushLog, buildingCostFrom } from './core'
import { recompute } from './economy'
import { RESOURCE_MAP } from '@/data/resources'
import { floorNumber } from '../numbers'

export function buyBuilding(state, derived, id, count = 1) {
  const meta = BUILDING_MAP[id]
  if (!meta || count <= 0) return 0
  // 注意：这里只判硬条件（needs）。「资源水位到 30% 才露面」是显示层的规则，
  // 不该拦住已经看得到的建造请求（猫国的 unlockRatio 同样只管显示）。
  if (!checkNeeds(state, meta.needs)) return 0
  const cost = buildingCost(state, id, count)
  if (!canAfford(state, cost)) return 0
  payCost(state, cost)
  if (id === 'hut') {
    if (!state.starterHutBuilt && countOf(state, id) === 0) state.starterHutStanding = true
    state.starterHutBuilt = true
  }
  const e = entryOf(state, id)
  e.count += count
  if (e.on === undefined) e.on = true
  state.stats.buildingsBuilt += count
  pushLog(state, `建成 ${meta.name} ×${count}（现有 ${e.count}）`, 'good')
  recompute(state, derived)
  return count
}

/** 拆除建筑，返还最后一次造价的 50% */
export function sellBuilding(state, derived, id, count = 1) {
  const meta = BUILDING_MAP[id]
  const e = state.buildings[id]
  if (!meta || !e || e.count <= 0) return 0
  const n = Math.min(count, e.count)
  const refund = buildingCostFrom(meta, e.count - n, n, !!state.starterHutStanding)
  if (id === 'hut' && e.count === n) state.starterHutStanding = false
  for (const k in refund) {
    // 返还一半；整枚计数的资源（灵石/丹药/符箓/法器）向下取整，免得返还出「半枚」
    refund[k] = RESOURCE_MAP[k]?.integer ? floorNumber(refund[k] * 0.5) : refund[k] * 0.5
  }
  e.count -= n
  state.stats.buildingsBuilt = Math.max(0, state.stats.buildingsBuilt - n)
  for (const k in refund) {
    const before = state.resources[k] || 0
    const cap = derived.max[k] ?? Infinity
    state.resources[k] = Math.min(before + refund[k], cap)
  }
  pushLog(state, `拆除 ${meta.name} ×${n}，返还部分材料`, 'info')
  recompute(state, derived)
  return n
}

/** 是否具备运行成本（物料维护或持续供能）——只有它们才允许停用 / 切换供能档 */
function hasRunningCost(meta) {
  return !!(meta.upkeep || meta.upkeepQi != null || meta.upkeepEnergy != null)
}

export function toggleBuilding(state, derived, id) {
  const meta = BUILDING_MAP[id]
  // 只有「维持它自己要吃资源」的建筑才能停用：停用即停费，这才是一个真选择。
  // 纯产出/仓储/减耗类建筑没有运行成本，停掉只会白亏，所以不给按钮也不允许停。
  if (!meta || !hasRunningCost(meta)) return null
  const e = entryOf(state, id)
  e.on = !e.on
  pushLog(state, `${meta.name} 已${e.on ? '启用' : '停用'}`, 'info')
  recompute(state, derived)
  return e.on
}

/** 切换持续供能档：'qi'（灵气基础）或 'energy'（灵能高阶，需已掌握《灵能输配》）。 */
export function setBuildingPower(state, derived, id, mode) {
  const meta = BUILDING_MAP[id]
  if (!meta || meta.upkeepEnergy == null || !['qi', 'energy'].includes(mode)) return false
  const next = mode
  if (next === 'energy' && !state.upgrades.energyApplication) return false
  const e = entryOf(state, id)
  if (next === 'energy') e.power = 'energy'
  else delete e.power
  pushLog(state, `${meta.name} 供能改为${next === 'energy' ? '灵能高阶' : '灵气基础'}`, 'info')
  recompute(state, derived)
  return true
}
