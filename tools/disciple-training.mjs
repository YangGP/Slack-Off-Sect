import * as E from './engine-fixture.mjs'
import { REALMS } from '../src/data/realms.js'
import { cultivationRequired } from '../src/data/disciples.js'

/** 仅模拟玩家操作，不是游戏内自动突破。 */
export function trainDisciples(state, derived, { mode = 'protected', random = Math.random, limit = 20, aid = false, onAttempt } = {}) {
  const report = { success: 0, failed: 0, reserved: 0, spent: {}, aidSpent: {}, aidApplied: 0, aidBonusInjected: 0 }
  const reserve = mode === 'protected' ? E.realmCost(state, derived, state.realm + 1) || {} : {}
  const candidates = state.disciples.members.filter(m => E.discipleBreakthroughPreview(state, m).ready)
  for (const member of candidates.slice(0, limit)) {
    const preview = E.discipleBreakthroughPreview(state, member)
    const floorQi = mode === 'protected' ? E.moneyMin(derived.max.qi, E.money(derived.upkeep).times(30)) : E.ZERO
    // 余量与保留量都是金额：扣完这次之后必须仍留有「下一境材料」和「30 秒口粮」。
    if (Object.entries(preview.cost).some(([id, cost]) =>
      E.moneyLt(E.moneySubtract(state.resources[id], cost), E.moneyMax(reserve[id], id === 'qi' ? floorQi : E.ZERO)))) {
      report.reserved++
      continue
    }
    // 本轮实际要打的人先预付护道，保证付款不早于执行。
    if (aid) {
      const aidPreview = E.discipleAidPreview(state, member)
      if (aidPreview.available && !aidPreview.pending && aidPreview.affordable) {
        const applied = E.applyDiscipleAid(state, derived, [member.id])
        if (applied.applied) {
          report.aidApplied++
          report.aidBonusInjected += aidPreview.bonus
          for (const [id, amount] of Object.entries(aidPreview.cost)) report.aidSpent[id] = E.money(report.aidSpent[id]).plus(amount)
        }
      }
    }
    // 突破会清除护道，先记下本次是否受护道加成。
    const bonus = member.aidBonus || 0
    const result = E.breakthroughDisciples(state, derived, [member.id], random)
    report.success += result.success
    report.failed += result.failed
    if (result.success || result.failed) {
      for (const [id, cost] of Object.entries(preview.cost)) report.spent[id] = E.money(report.spent[id]).plus(cost)
      onAttempt?.(member, { result, armed: bonus > 0, bonus })
    }
  }
  return report
}

/** 传功登记：按入门顺序取前 limit 名仍可成长的成员受传功，其余关闭。 */
export function enrollMentored(state, derived, { limit = 20 } = {}) {
  const eligible = state.disciples.members
    .filter(member => member.realm < REALMS.length - 1 && (member.cultivation || 0) < cultivationRequired(member.realm))
    .sort((a, b) => a.id - b.id)
    .slice(0, limit)
  const ids = new Set(eligible.map(member => member.id))
  const on = state.disciples.members.filter(member => ids.has(member.id) && !member.mentored).map(member => member.id)
  const off = state.disciples.members.filter(member => !ids.has(member.id) && member.mentored).map(member => member.id)
  if (off.length) E.setMentored(state, derived, off, false)
  if (on.length) E.setMentored(state, derived, on, true)
  return { mentored: ids.size, toggledOn: on.length, toggledOff: off.length }
}
