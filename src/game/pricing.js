import { timeToAfford } from './engine'
import { fmtCost, fmtStock, fmtTime } from './format'
import { atLeast } from './numbers'
import { ZERO, money } from './decimal'

/**
 * 价格文案：**全项目共用这一套写法**（建筑、参悟表、炼制、破境都用它）。
 *
 *   够用   → 只写需求值，例如 `300`
 *   不够   → `现有 / 需要（还差多久）`，例如 `120 / 300（还差 4 分）`
 *
 * 「还差多久」由 `engine.timeToAfford` 算，算不出来（净额为负、配方未解锁）就只写前两段，
 * 不编造时间。整枚计数的资源（灵石/丹药/符箓/法器）请配合 `fmtCost` 的向上取整一起看。
 *
 * 金额入参可能是 Decimal（引擎报价）或数据层的 Number（静态表字面值），
 * 够用判断一律走 `atLeast` 的 Decimal 精确比较，格式化交给 format.js。
 */
export function costLabel(state, derived, res, amount) {
  const have = state.resources[res] ?? ZERO
  if (atLeast(have, amount)) return fmtCost(amount)
  // 库存不足且费用超过有限仓容：等待也不会凑够，直接给扩仓原因，不显示 ETA。
  if (costCapBlocked(state, derived, res, amount)) return `${fmtStock(have)} / ${fmtCost(amount)}（仓容不足，先扩仓）`
  const wait = timeToAfford(state, derived, res, amount)
  const eta = Number.isFinite(wait) && wait > 0 ? `（还差 ${fmtTime(wait)}）` : ''
  return `${fmtStock(have)} / ${fmtCost(amount)}${eta}`
}

/** 这一项够不够（够的只写需求、不够的标红） */
export function enough(state, res, amount) {
  return atLeast(state.resources[res] ?? ZERO, amount)
}

/** 需求是否超过该资源的仓容上限（无限仓容永不超限）。 */
export function costOverCap(derived, res, amount) {
  const cap = derived?.max?.[res]
  if (cap == null || cap === Infinity) return false
  const capMoney = money(cap)
  return capMoney.isFinite() && !atLeast(capMoney, money(amount))
}

/**
 * 当前支付是否被仓容阻塞：库存不足，且需求超过有限上限。
 * 库存已经足够时即使超过上限（旧档/特殊来源）也正常使用，不算阻塞。
 */
export function costCapBlocked(state, derived, res, amount) {
  return !enough(state, res, amount) && costOverCap(derived, res, amount)
}

/** 整组费用里是否有任何一项被仓容阻塞。 */
export function costBlocked(state, derived, cost) {
  return Object.entries(cost || {}).some(([res, amount]) => costCapBlocked(state, derived, res, amount))
}

/** 费用行的受阻提示文案；未被仓容阻塞时返回空串。 */
export function costCapHint(state, derived, res, amount) {
  if (!costCapBlocked(state, derived, res, amount)) return ''
  return `仓容上限 ${fmtStock(derived.max[res])}，需求 ${fmtCost(amount)}，需先扩仓`
}