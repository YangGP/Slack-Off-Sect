import * as E from '../src/game/engine.js'

/** 仅模拟玩家操作，不是游戏内自动突破。 */
export function trainDisciples(state, derived, { mode = 'protected', random = Math.random, limit = 20 } = {}) {
  const report = { success: 0, failed: 0, reserved: 0, spent: {} }
  const reserve = mode === 'protected' ? E.realmCost(state, derived, state.realm + 1) || {} : {}
  const candidates = state.disciples.members.filter(m => E.discipleBreakthroughPreview(state, m).ready)
  for (const member of candidates.slice(0, limit)) {
    const preview = E.discipleBreakthroughPreview(state, member)
    const floorQi = mode === 'protected' ? Math.min(derived.max.qi, derived.upkeep * 30) : 0
    if (Object.entries(preview.cost).some(([id, cost]) =>
      state.resources[id] - cost < Math.max(reserve[id] || 0, id === 'qi' ? floorQi : 0))) {
      report.reserved++
      continue
    }
    const result = E.breakthroughDisciples(state, derived, [member.id], random)
    report.success += result.success
    report.failed += result.failed
    if (result.success || result.failed) for (const [id, cost] of Object.entries(preview.cost)) report.spent[id] = (report.spent[id] || 0) + cost
  }
  return report
}
