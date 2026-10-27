import { CRAFTS, craftCost } from '@/data/crafts'
import { RESOURCE_MAP } from '@/data/resources'
import { isCraftUnlocked } from './core'
import { autoCraftReserve, craftYield } from './craftingRules'
import { ZERO, money, moneyMax } from '../decimal'
import { withResourceAction } from '../resourceObservation'

const entries = map => Object.entries(map || {}).sort(([a], [b]) => a.localeCompare(b))
  .map(([id, value]) => [id, money(value).toString()])

/** 只在玩家预览／应用时计算；选中的保护值决定中层补货目标。 */
export function craftAdvice(state, derived, reserveIds) {
  const unlocked = CRAFTS.filter(c => isCraftUnlocked(state, c))
  const active = unlocked.filter(c => state.autoCraft[c.id] === true)
  const producers = new Set(unlocked.map(c => c.out))
  const reserves = state.settings.craftReserves || {}
  const targets = state.craftTargets || {}
  const demands = new Map()
  for (const recipe of active) for (const [id, cost] of Object.entries(craftCost(derived, recipe))) {
    // 只为不限仓的可制作中间品建议保护，不自动保护基础采集原料。
    if (!producers.has(id) || RESOURCE_MAP[id]?.baseMax !== Infinity) continue
    const row = demands.get(id) || { id, amount: ZERO, recipes: [] }
    row.amount = moneyMax(row.amount, money(cost).times(5))
    row.recipes.push(recipe.name)
    demands.set(id, row)
  }
  const reserveRows = [...demands.values()].map(row => ({ ...row,
    current: reserves[row.id] ?? ZERO,
    selected: reserveIds === undefined ? !Object.hasOwn(reserves, row.id) : reserveIds.includes(row.id),
  }))
  const merged = { ...reserves }
  for (const row of reserveRows) if (row.selected) merged[row.id] = row.amount
  const previewState = { ...state, settings: { ...state.settings, craftReserves: merged } }
  const targetRows = active.map(c => ({ id: c.id, resource: c.out, name: c.name,
    current: targets[c.id] ?? ZERO, selected: !Object.hasOwn(targets, c.id),
    amount: moneyMax(craftYield(derived, c).times(10), autoCraftReserve(previewState, derived, c.out).plus(craftYield(derived, c))),
  }))
  const signature = JSON.stringify({ ready: derived.craftTargetsUnlocked, dao: derived.daoAutomation,
    auto: derived.autoCraftUnlocked, condense: derived.autoCondenseLiquidUnlocked,
    percent: state.settings.craftReservePercent,
    unlocked: unlocked.map(c => c.id),
    active: active.map(c => [c.id, entries(craftCost(derived, c)), craftYield(derived, c).toString(),
      derived.max[c.out]?.toString()]), reserves: entries(reserves), targets: entries(targets) })
  return { signature, reserves: reserveRows, targets: targetRows }
}

/** 重新核对资格与报价后一次性合并，拒绝过期预览和未知选择。 */
export function applyCraftAdvice(state, derived, selection) {
  if (!derived.craftTargetsUnlocked || !selection || !Array.isArray(selection.reserveIds) || !Array.isArray(selection.targetIds)) return false
  const advice = craftAdvice(state, derived, selection.reserveIds)
  if (selection.signature !== advice.signature ||
    selection.reserveIds.some(id => !advice.reserves.some(row => row.id === id)) ||
    selection.targetIds.some(id => !advice.targets.some(row => row.id === id)) ||
    !(selection.reserveIds.length || selection.targetIds.length)) return false
  return withResourceAction(state, { type: 'applyCraftAdvice' }, () => {
    const reserves = { ...state.settings.craftReserves }, targets = { ...state.craftTargets }
    for (const row of advice.reserves) if (selection.reserveIds.includes(row.id)) reserves[row.id] = row.amount
    for (const row of advice.targets) if (selection.targetIds.includes(row.id)) targets[row.id] = row.amount
    state.settings.craftReserves = reserves
    state.craftTargets = targets
    return true
  })
}
