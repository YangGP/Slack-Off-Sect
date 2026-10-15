import { parseImport } from '../../src/game/save.js'
import { createDerived, recompute, RESOURCES, REALMS, BUILDING_MAP, buildingCost, realmCost, craftYield, CRAFT_MAP } from '../../src/game/engine.js'

export function inspectSave(text) {
  const state = parseImport(text)
  if (state.__recoveryNotice) throw new Error(state.__recoveryNotice)
  const derived = createDerived()
  recompute(state, derived)
  const nextCost = state.realm < REALMS.length - 1 ? realmCost(state, derived, state.realm + 1) : {}
  return {
    realm: REALMS[state.realm].name,
    season: derived.calendar.seasonName,
    resources: RESOURCES.filter(r => state.seen[r.id]).map(r => ({
      id: r.id, name: r.name, stock: state.resources[r.id], max: derived.max[r.id], net: derived.net[r.id],
      // Empty-to-full at current seasonal net production; excludes crafting and spending.
      fillMinutes: derived.net[r.id] > 0 ? derived.max[r.id] / derived.net[r.id] / 60 : null,
      aboveCap: Math.max(0, state.resources[r.id] - derived.max[r.id]),
    })),
    warehouse: { storage: BUILDING_MAP.warehouse.effects.storage, nextCost: buildingCost(state, 'warehouse', 1) },
    craftYields: Object.fromEntries(['refinePill', 'drawTalisman', 'forgeArtifact'].map(id => [id, craftYield(derived, CRAFT_MAP[id])])),
    nextRealm: Object.entries(nextCost).map(([id, cost]) => ({ id, cost, fitsCapacity: derived.max[id] >= cost, affordable: state.resources[id] >= cost })),
  }
}
