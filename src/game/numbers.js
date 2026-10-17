import { money, moneyAvailable } from './decimal'

/**
 * 数值边界。
 *
 * - 经济金额（资源、成本、速率、仓容、累计、制作进度等）走 `./decimal`：**Decimal 精确比较与运算**，
 *   不再用 Number.EPSILON 的相对容差给支付放水。
 * - 时间与计数继续走本文件的 Number 助手：它们只吸收浮点舍入误差，不承担金额语义。
 */
export * from './decimal'

/** 时间/比例域的浮点容差：只吸收舍入误差，不得用于经济支付授权。 */
export function nearlyEqual(a, b) {
  if (a === b) return true
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return Math.abs(a - b) <= Number.EPSILON * 4 * Math.max(Math.abs(a), Math.abs(b))
}

/** 金额是否够用：Decimal 精确比较（完全相等视为够用）。 */
export function atLeast(value, required) {
  return money(value).gte(money(required))
}

/** 金额扣减后的余量：不足时归零。 */
export function subtractResource(value, cost) {
  return moneyAvailable(value, cost)
}

function snapInteger(value) {
  const rounded = Math.round(value)
  return nearlyEqual(value, rounded) ? rounded : value
}

/** Number 域向下取整：人数、索引、循环次数与时间估算使用。 */
export function floorNumber(value) {
  return Math.floor(snapInteger(value))
}

/** Number 域向上取整：人数、索引与订单数量使用。 */
export function ceilNumber(value) {
  return Math.ceil(snapInteger(value))
}
