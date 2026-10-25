import { withResourceAction, setResourceValue } from '../resourceObservation'
import { BUILDING_MAP } from '@/data/buildings'
import { buildingMeta, PRODUCTION_STAGES, productionStageReady } from '@/data/productionStages'
import { checkNeeds, buildingCost, canAfford, payCost, entryOf, pushLog, buildingCostFrom, buildingBoostAvailable, pricedBuildingMeta, buildingPriceAt } from './core'
import { karmaShopBonuses } from './karmaShop'
import { recompute } from './economy'
import { MONEY_INFINITY, ZERO, money, moneyMin } from '../decimal'

export function buyBuilding(state, derived, id, count = 1) {
  return withResourceAction(state, { type: 'buyBuilding', id: id }, () => {
    const meta = buildingMeta(state, id)
    if (!meta || !Number.isSafeInteger(count) || count <= 0) return 0
    // 注意：这里只判硬条件（needs）。「资源水位到 30% 才露面」是显示层的规则，
    // 不该拦住已经看得到的建造请求。
    if (!checkNeeds(state, meta.needs)) return 0
    const cost = buildingCost(state, id, count)
    if (!canAfford(state, cost)) return 0
    payCost(state, cost)
    const e = entryOf(state, id)
    e.count += count
    if (e.on === undefined || !hasRunningCost(meta)) e.on = true
    state.stats.buildingsBuilt += count
    pushLog(state, `建成 ${meta.name} ×${count}（现有 ${e.count}）`, 'good')
    recompute(state, derived)
    return count

  })
}

/** 拆除建筑，返还最后一次造价的 50% */
export function sellBuilding(state, derived, id, count = 1) {
  return withResourceAction(state, { type: 'sellBuilding', id: id }, () => {
    const meta = pricedBuildingMeta(state, id)
    const e = state.buildings[id]
    if (!meta || !e || !Number.isSafeInteger(count) || count <= 0 || e.count <= 0) return 0
    const n = Math.min(count, e.count)
    const refund = buildingCostFrom(meta, e.count - n, n, karmaShopBonuses(state).buildingDiscount)
    if (id === 'hut' && e.count === n) {
      // 旧档免木料首屋拆除时不返还未支付的木料；新建茅屋不再享受优惠。
      if (state.starterHutStanding) refund.wood = refund.wood.minus(buildingPriceAt(meta, 0, karmaShopBonuses(state).buildingDiscount).wood)
      state.starterHutStanding = false
    }
    for (const k in refund) {
      // 按原价返还一半，小数完整保留。
      const half = refund[k].times('0.5')
      refund[k] = half
    }
    e.count -= n
    if (state.legacyWarehouseCounts?.[id] != null) state.legacyWarehouseCounts[id] = Math.min(state.legacyWarehouseCounts[id], e.count)
    if (state.legacyStorage?.[id]) {
      state.legacyStorage[id].count = Math.min(state.legacyStorage[id].count, e.count)
      if (!state.legacyStorage[id].count) delete state.legacyStorage[id]
    }
    state.stats.buildingsBuilt = Math.max(0, state.stats.buildingsBuilt - n)
    for (const k in refund) {
      const before = state.resources[k] ?? ZERO
      const cap = money(derived.max[k] ?? MONEY_INFINITY)
      setResourceValue(state, k, moneyMin(before.plus(refund[k]), before.gt(cap) ? before : cap), { source: 'systems/buildings.js:sellBuilding' })
    }
    pushLog(state, `拆除 ${meta.name} ×${n}，返还部分材料`, 'info')
    recompute(state, derived)
    return n

  })
}

/** 是否具备运行成本（物料维护或持续供能）——只有它们才允许停用 / 切换供能档 */
function hasRunningCost(meta) {
  return !!(meta.upkeep || meta.upkeepQi != null || meta.upkeepEnergy != null)
}

export function toggleBuilding(state, derived, id) {
  return withResourceAction(state, { type: 'toggleBuilding', id: id }, () => {
    const meta = buildingMeta(state, id)
    // 只有「维持它自己要吃资源」的建筑才能停用：停用即停费，这才是一个真选择。
    // 纯产出/仓储/减耗类建筑没有运行成本，停掉只会白亏，所以不给按钮也不允许停。
    if (!meta || !hasRunningCost(meta)) return null
    const e = entryOf(state, id)
    e.on = !e.on
    pushLog(state, `${meta.name} 已${e.on ? '启用' : '停用'}`, 'info')
    recompute(state, derived)
    return e.on

  })
}

/** 独立的增产开关；关闭只停止耗料和额外增产，不停基础采矿。 */
export function setBuildingBoost(state, derived, id, enabled) {
  if (typeof enabled !== 'boolean' || !buildingBoostAvailable(state, id)) return null
  return withResourceAction(state, { type: 'setBuildingBoost', id }, () => {
    state.buildings[id].boost = enabled
    pushLog(state, `${BUILDING_MAP[id].name} 已${enabled ? '开启灵液注灵' : '关闭灵液注灵，恢复普通采矿'}`, 'info')
    recompute(state, derived)
    return enabled
  })
}

/** 切换持续供能档：'qi'（灵气基础）或 'energy'（灵能高阶，需已掌握《灵能输配》）。 */
export function setBuildingPower(state, derived, id, mode) {
  return withResourceAction(state, { type: 'setBuildingPower', id: id }, () => {
    const meta = buildingMeta(state, id)
    if (!meta || meta.stage === 1 || meta.upkeepEnergy == null || !['qi', 'energy'].includes(mode)) return false
    const next = mode
    if (next === 'energy' && !state.upgrades.energyApplication) return false
    const e = entryOf(state, id)
    if (next === 'energy') e.power = 'energy'
    else delete e.power
    pushLog(state, `${meta.name} 供能改为${next === 'energy' ? '灵能高阶' : '灵气基础'}`, 'info')
    recompute(state, derived)
    return true

  })
}

/** 玩家主动切阶段：清零本类，不执行拆除、不退款、不代为重建。 */
export function setBuildingStage(state, derived, id, stage) {
  if (!Object.hasOwn(PRODUCTION_STAGES, id) || ![0, 1].includes(stage)) return false
  if ((state.buildings[id]?.stage || 0) === stage || stage === 1 && !productionStageReady(state, id)) return false
  return withResourceAction(state, { type: 'setBuildingStage', id }, () => {
    const entry = entryOf(state, id)
    state.stats.buildingsBuilt = Math.max(0, state.stats.buildingsBuilt - entry.count)
    entry.count = 0; entry.on = false; entry.stage = stage
    delete entry.power; delete entry.boost
    if (state.rebuild?.buildings) delete state.rebuild.buildings[id]
    pushLog(state, `${buildingMeta(state, id).name}阶段已切换，原数量清零，请手动重建。`, 'info')
    recompute(state, derived)
    return true
  })
}
