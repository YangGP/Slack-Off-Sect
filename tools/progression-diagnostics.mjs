import * as E from './engine-fixture.mjs'
import { CRAFTS } from '../src/data/crafts.js'
import { REALMS } from '../src/data/realms.js'
import { RESOURCE_MAP } from '../src/data/resources.js'
import { isEntryEnabled } from '../src/data/modules.js'

/** 只读瓶颈诊断；selectedCost 显式传入时按选定护道/方案计算，缺省保持旧的 base 报价口径。 */
export function progressionDiagnostics(state, derived, { cost: selectedCost = null, moneyAsStrings = false } = {}) {
  const baseCost = E.realmCost(state, derived, state.realm + 1) || {}
  const required = selectedCost || baseCost
  const num = value => moneyAsStrings ? E.money(value).toString() : E.moneyToNumber(value)
  const stock = id => num(state.resources[id])
  const capacityOf = id => derived.max[id]?.isFinite() ? num(derived.max[id]) : null
  const isFull = id => derived.max[id]?.isFinite() && E.moneyGte(state.resources[id] ?? E.ZERO, derived.max[id])

  const expansionCandidates = (resource) => E.BUILDINGS
    .filter(b => isEntryEnabled(state, b) && (b.effects?.storage?.[resource] > 0 || b.effects?.storageAll > 0))
    .map(b => {
      const direct = b.effects?.storage?.[resource] || 0
      const viaAll = (b.effects?.storageAll || 0) * (RESOURCE_MAP[resource]?.storageWeight ?? 1)
      const gain = direct + viaAll
      const cost = E.buildingCost(state, b.id, 1)
      const costCovered = Object.entries(cost).every(([res, amount]) => E.moneyLte(amount, derived.max[res]))
      return { id: b.id, name: b.name, unlocked: E.checkNeeds(state, b.needs), gain,
        costCovered, shortages: Object.entries(cost).filter(([res, amount]) => E.moneyLt(state.resources[res], amount))
          .map(([res, amount]) => ({ resource: res, need: num(amount), have: stock(res), capacity: capacityOf(res) })) }
    })
    .filter(row => row.gain > 0)

  const missing = Object.entries(required).filter(([res, amount]) => E.moneyLt(state.resources[res], amount))
    .map(([res, amount]) => {
      const recipe = CRAFTS.find(c => c.out === res)
      const producer = E.BUILDINGS.find(b => (b.effects?.prod?.[res] || 0) > 0)
      const flow = E.resourceFlow(derived, res)
      const capacityBlocked = E.moneyLt(derived.max[res], amount)
      const candidates = capacityBlocked ? expansionCandidates(res) : []
      const next = candidates.find(row => row.unlocked && row.costCovered) || null
      return { resource: res, name: RESOURCE_MAP[res]?.name, need: num(amount), baseNeed: num(baseCost[res] || 0), have: stock(res),
        capacity: capacityOf(res), full: isFull(res), capacityBlocked,
        grossPerMinute: num(flow.income.times(60)), expensePerMinute: num(flow.expense.times(60)), netPerMinute: num(flow.net.times(60)),
        nextExpansion: next ? { id: next.id, name: next.name, gain: next.gain, costCovered: next.costCovered, shortages: next.shortages } : null,
        nextExpansionReason: capacityBlocked ? (next ? null : 'no-unlocked-affordable-candidate') : 'capacity-sufficient',
        recipe: recipe?.id, recipeUnlocked: recipe ? E.isCraftUnlocked(state, recipe) : null,
        processing: recipe ? E.processingBottleneck(state, derived, recipe.id) : null,
        producer: producer ? { id: producer.id, count: E.countOf(state, producer.id), unlocked: E.checkNeeds(state, producer.needs),
          needs: producer.needs, supply: derived.buildingSupply[producer.id] ?? 1,
          shortages: Object.entries(E.buildingCost(state, producer.id, 1)).filter(([r, n]) => E.moneyLt(state.resources[r], n))
            .map(([r, n]) => ({ resource: r, need: num(n), have: stock(r), capacity: capacityOf(r) })) } : null,
        expansions: candidates }
    })
  return {
    currentRealm: state.realm,
    currentRealmName: REALMS[state.realm]?.name,
    targetRealm: state.realm + 1,
    targetRealmName: REALMS[state.realm + 1]?.name || '可飞升',
    realm: REALMS[state.realm]?.name,
    next: REALMS[state.realm + 1]?.name || '可飞升',
    costMode: selectedCost ? 'selected' : 'base',
    baseCost: Object.fromEntries(Object.entries(baseCost).map(([id, amount]) => [id, num(amount)])),
    selectedCost: Object.fromEntries(Object.entries(required).map(([id, amount]) => [id, num(amount)])),
    missing,
    orders: state.craftOrders,
    powerCapacity: derived.processingPowerCapacity,
    coolingCapacity: derived.processingCoolingCapacity,
    modes: state.settings.processingModes,
  }
}
