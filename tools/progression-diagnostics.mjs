import * as E from './engine-fixture.mjs'
import { CRAFTS } from '../src/data/crafts.js'
import { REALMS } from '../src/data/realms.js'
import { RESOURCE_MAP } from '../src/data/resources.js'

export function progressionDiagnostics(state, derived) {
  const required = E.realmCost(state, derived, state.realm + 1) || {}
  const missing = Object.entries(required).filter(([res, amount]) => (state.resources[res] || 0) < amount)
    .map(([res, amount]) => {
      const recipe = CRAFTS.find(c => c.out === res)
      const producer = E.BUILDINGS.find(b => (b.effects?.prod?.[res] || 0) > 0)
      const flow = E.resourceFlow(derived, res)
      const expansions = E.BUILDINGS.filter(b => (b.effects?.storage?.[res] || 0) > 0 || (b.effects?.storageAll || 0) > 0)
        .filter(b => b.needs?.realm == null || b.needs.realm <= state.realm)
        .map(b => ({ id: b.id, name: b.name, unlocked: E.checkNeeds(state, b.needs), needs: b.needs,
          shortages: Object.entries(E.buildingCost(state, b.id, 1)).filter(([r, n]) => (state.resources[r] || 0) < n)
            .map(([r, n]) => ({ resource: r, need: n, have: state.resources[r] || 0, capacity: derived.max[r] })) }))
      return { resource: res, name: RESOURCE_MAP[res]?.name, need: amount, have: state.resources[res] || 0,
        capacity: derived.max[res], capacityBlocked: derived.max[res] < amount, netPerMinute: flow.net * 60,
        recipe: recipe?.id, recipeUnlocked: recipe ? E.isCraftUnlocked(state, recipe) : null,
        processing: recipe ? E.processingBottleneck(state, derived, recipe.id) : null,
        producer: producer ? { id: producer.id, count: E.countOf(state, producer.id), unlocked: E.checkNeeds(state, producer.needs),
          needs: producer.needs, supply: derived.buildingSupply[producer.id] ?? 1,
          shortages: Object.entries(E.buildingCost(state, producer.id, 1)).filter(([r, n]) => (state.resources[r] || 0) < n)
            .map(([r, n]) => ({ resource: r, need: n, have: state.resources[r] || 0, capacity: derived.max[r] })) } : null,
        expansions: derived.max[res] < amount ? expansions : [] }
    })
  return { realm: REALMS[state.realm].name, next: REALMS[state.realm + 1]?.name || '可飞升', missing,
    orders: state.craftOrders, powerCapacity: derived.processingPowerCapacity, coolingCapacity: derived.processingCoolingCapacity,
    modes: state.settings.processingModes }
}
