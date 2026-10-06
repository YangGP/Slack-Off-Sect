import { timeToAfford } from './engine'
import { fmtCost, fmtStock, fmtTime } from './format'

/**
 * 价格文案：**全项目共用这一套写法**（建筑、参悟表、炼制、破境都用它）。
 *
 *   够用   → 只写需求值，例如 `300`
 *   不够   → `现有 / 需要（还差多久）`，例如 `120 / 300（还差 4 分）`
 *
 * 「还差多久」由 `engine.timeToAfford` 算，算不出来（净额为负、配方未解锁）就只写前两段，
 * 不编造时间。整枚计数的资源（灵石/丹药/符箓/法器）请配合 `fmtCost` 的向上取整一起看。
 */
export function costLabel(state, derived, res, amount) {
  const have = state.resources[res] || 0
  if (have >= amount - 1e-9) return fmtCost(amount)
  const wait = timeToAfford(state, derived, res, amount)
  const eta = Number.isFinite(wait) && wait > 0 ? `（还差 ${fmtTime(wait)}）` : ''
  return `${fmtStock(have)} / ${fmtCost(amount)}${eta}`
}

/** 这一项够不够（够的只写需求、不够的标红） */
export function enough(state, res, amount) {
  return (state.resources[res] || 0) >= amount - 1e-9
}
