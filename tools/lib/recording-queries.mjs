import * as E from '../../src/game/engine.js'
import { craftCost } from '../../src/data/crafts.js'
import { isEntryEnabled } from '../../src/data/modules.js'

/** Same gates as the main lists, before user-selected UI search/category filters. */
export function recordingChoices(state, derived) {
  const buildings = E.BUILDINGS.map(meta => ({ id: meta.id, visible: E.isBuildingUnlocked(state, meta.id),
    available: isEntryEnabled(state, meta) && E.checkNeeds(state, meta.needs),
    affordable: isEntryEnabled(state, meta) && E.checkNeeds(state, meta.needs) && E.canAfford(state, E.buildingCost(state, meta.id, 1)) }))
  const upgrades = E.ALL_UPGRADES.filter(meta => meta.page !== 'faith').map(meta => {
    const learned = !!state.upgrades[meta.id], unlocked = E.isUpgradeUnlocked(state, meta)
    const revealed = E.isCostRevealed(state, meta.cost)
    return { id: meta.id, learned, visible: isEntryEnabled(state, meta) && (learned || revealed && (unlocked || E.isProgressionVisible(state, meta.needs, meta.cost))),
      available: !learned && unlocked, affordable: !learned && unlocked && E.canAfford(state, meta.cost),
      capacityGroup: E.moneyMax(derived.max.insight, state.resources.insight).gte(meta.cost?.insight || 0) ? 'ready' : 'capacity-locked' }
  })
  const crafts = E.CRAFTS.map(meta => {
    const unlocked = E.isCraftUnlocked(state, meta)
    return { id: meta.id, visible: isEntryEnabled(state, meta) && (unlocked && E.isCostRevealed(state, meta.cost) || !unlocked && E.isProgressionVisible(state, meta.needs, meta.cost)),
      available: unlocked, affordable: unlocked && E.maxCraftableMoney(state, derived, meta.id).gte(1) }
  })
  return { buildings, upgrades, crafts }
}

export function recordingProcessing(state, derived) {
  const plan = E.processingPlan(state, derived)
  return E.CRAFTS.filter(meta => E.isCraftUnlocked(state, meta)).map(meta => ({
    id: meta.id, output: meta.out, input: craftCost(derived, meta), yield: E.craftYield(derived, meta),
    status: E.autoCraftStatus(state, derived, meta.id, plan), plan: plan[meta.id] || null,
    bottleneck: E.processingBottleneck(state, derived, meta.id, plan),
  }))
}
