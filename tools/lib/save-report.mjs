import { parseImport } from '../../src/game/save.js'
import { createDerived, recompute, RESOURCES, REALMS, BUILDING_MAP, buildingCost, realmCost, craftYield, CRAFT_MAP, ZERO, MONEY_INFINITY, moneyGt, moneyGte, moneyMax, moneySubtract, moneyToNumber } from '../../src/game/engine.js'

/** 报告边界：金额一律降到 Number 再输出，保持原有 JSON 形状（数字，而不是 Decimal 字符串）。 */
const toNumberMap = costs => Object.fromEntries(Object.entries(costs).map(([id, cost]) => [id, moneyToNumber(cost)]))

export function inspectSave(text) {
  const state = parseImport(text)
  if (state.__recoveryNotice) throw new Error(state.__recoveryNotice)
  const derived = createDerived()
  recompute(state, derived)
  const nextCost = state.realm < REALMS.length - 1 ? realmCost(state, derived, state.realm + 1) : {}
  return {
    realm: REALMS[state.realm].name,
    season: derived.calendar.seasonName,
    resources: RESOURCES.filter(r => state.seen[r.id]).map(r => {
      const stock = state.resources[r.id] ?? ZERO
      const max = derived.max[r.id] ?? MONEY_INFINITY
      const net = derived.net[r.id] ?? ZERO
      return {
        id: r.id, name: r.name, stock: moneyToNumber(stock), max: moneyToNumber(max), net: moneyToNumber(net),
        // Empty-to-full at current seasonal net production; excludes crafting and spending.
        fillMinutes: moneyGt(net, 0) ? moneyToNumber(max.div(net).div(60)) : null,
        aboveCap: moneyToNumber(moneyMax(ZERO, moneySubtract(stock, max))),
      }
    }),
    warehouse: { storage: BUILDING_MAP.warehouse.effects.storage, nextCost: toNumberMap(buildingCost(state, 'warehouse', 1)) },
    craftYields: Object.fromEntries(['refinePill', 'drawTalisman', 'forgeArtifact']
      .map(id => [id, moneyToNumber(craftYield(derived, CRAFT_MAP[id]))])),
    nextRealm: Object.entries(nextCost).map(([id, cost]) => ({
      id,
      cost: moneyToNumber(cost),
      fitsCapacity: moneyGte(derived.max[id] ?? MONEY_INFINITY, cost),
      affordable: moneyGte(state.resources[id] ?? ZERO, cost),
    })),
  }
}
