/**
 * 数值与时间格式化工具。
 * 数量按千进制缩写为 k / m / b，更大的数值使用科学计数法。
 *
 * 金额入参可能是 Decimal（资源存量、成本、速率、累计），也可能是有界的 Number
 * （比例、时长、人数、倍率）。这里一律**先在 Decimal 域判断数量级**再决定写法，
 * 因此超出 Number 范围的金额（如 1e400）显示成科学计数法而不是 Infinity；
 * 只有金额域的 `MONEY_INFINITY` 哨兵（`isFinite() === false`）显示 `∞`。
 * 时间与百分比仍是 Number 域：百分比入参若来自 Decimal，调用方先转 Number。
 */
import { RESOURCE_MAP } from '@/data/resources'
import { MONEY_INFINITY, ZERO, isMoney, money } from './decimal'

const UNITS = [
  { v: 1e3, s: 'k' },
  { v: 1e6, s: 'm' },
  { v: 1e9, s: 'b' },
]

/**
 * 宽容读入：Decimal 原样返回，有限 Number 与十进制字符串按值构造。
 * 其余（null / NaN / 非十进制字符串）返回 null，交给调用方按「没有这个数」处理 ——
 * 格式化绝不能抛异常，界面上的坏数据只能显示得难看一点。
 */
function amountOf(value) {
  if (isMoney(value)) return value
  if (typeof value === 'number') return Number.isFinite(value) ? money(value) : null
  if (typeof value === 'string') {
    try { return money(value) } catch { return null }
  }
  return null
}

/** 非有限值的文案：Number 的 ±Infinity 与金额域的哨兵共用，返回 null 表示「是有限数」 */
function infiniteText(value) {
  if (value === Infinity) return '∞'
  if (value === -Infinity) return '-∞'
  if (isMoney(value) && !value.isFinite()) return value.isNegative() ? '-∞' : '∞'
  return null
}

/** 去掉小数尾随 0：'3.50' → '3.5'，'3.00' → '3' */
function trim(text) {
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text
}

/** 正数的大数缩写；四舍五入进位后切换单位，避免出现 1000k。 */
function compact(n, digits = 2, fixed = false) {
  if (n.gte(1e12)) return n.toExponential(digits)
  let index = UNITS.length - 1
  while (index > 0 && n.lt(UNITS[index].v)) index--
  let scaled = n.div(UNITS[index].v).toDecimalPlaces(digits)
  if (scaled.gte(1000)) {
    index++
    if (index === UNITS.length) return n.toExponential(digits)
    scaled = n.div(UNITS[index].v).toDecimalPlaces(digits)
  }
  return (fixed ? scaled.toFixed(digits) : trim(scaled.toFixed(digits))) + UNITS[index].s
}

/** 1 以下的连续量：太小只写 ≈0，其余按原口径保留 4 位 / 3 位小数 */
function magnitude(n, digits = 2) {
  if (n.isZero()) return '0'
  if (n.lt(1)) return n.lt(0.0001) ? '≈0' : n.toFixed(n.lt(0.01) ? 4 : 3)
  if (n.lt(1000)) return n.lt(10) ? trim(n.toFixed(2)) : n.lt(100) ? trim(n.toFixed(1)) : n.toFixed(0)
  return compact(n, digits)
}

/** 通用数量格式化，例如 12345 -> 12.35k */
export function fmt(value, digits = 2) {
  const inf = infiniteText(value)
  if (inf) return inf
  const amount = amountOf(value)
  if (!amount) return '0'
  const out = magnitude(amount.abs(), digits)
  return amount.isNegative() ? '-' + out : out
}

/**
 * 固定两位小数（资源栏的「当前数值」用）。
 * 不省略尾随 0：12.5 → 12.50，1500 → 1.50k，12345 → 12.35k。
 */
export function fmtFixed(value, digits = 2) {
  const inf = infiniteText(value)
  if (inf) return inf
  const amount = amountOf(value)
  if (!amount) return (0).toFixed(digits)
  const n = amount.abs()
  const out = n.lt(1e3) ? n.toFixed(digits) : compact(n, digits, true)
  return amount.isNegative() ? '-' + out : out
}

/**
 * 资源计数先取整，再按数量级作紧凑显示。
 * 一千以内直接写整数，较大数量以 k / m / b 缩写，最多两位小数。
 */
function intCore(amount) {
  if (!amount.isFinite()) return amount.isNegative() ? '-∞' : '∞'
  if (amount.isZero()) return '0'
  const abs = amount.abs()
  if (abs.lt(1000)) return amount.toFixed(0)
  return (amount.isNegative() ? '-' : '') + compact(abs)
}

/** 取整前的宽容读入：缺值按 0；Number 的 ±Infinity 与金额哨兵一样显示成 ∞ */
function integerOf(value, round) {
  if (value === Infinity) return MONEY_INFINITY
  if (value === -Infinity) return MONEY_INFINITY.negated()
  const amount = amountOf(value)
  return amount ? round(amount) : ZERO
}

/** 以整数形式展示（人数、加成等少量数值） */
export function fmtInt(value) {
  return intCore(integerOf(value, amount => amount.round()))
}

/** 存量先向下取整，再缩写——左栏资源表以外的地方使用它。 */
export function fmtStock(value) {
  return intCore(integerOf(value, amount => amount.floor()))
}

/** 花费 / 上限先向上取整，再缩写；是否够用由实际整数判定。 */
export function fmtCost(value) {
  return intCore(integerOf(value, amount => amount.ceil()))
}

/** 累计量 / 事件增减：整数（四舍五入） */
export function fmtAmount(value) {
  return intCore(integerOf(value, amount => amount.round()))
}

/**
 * **左栏资源表**里的存量文案：连续资源固定两位小数（`4.00`），
 * 整枚计数的资源（灵石/丹药/符箓/法器，数据里标 `integer: true`）显示成 `4`。
 *
 * 只有左栏用这个函数 —— 需求、存量、累计、纪事等其它地方一律用 `fmtCost` / `fmtStock` / `fmtAmount`
 * 先取整再缩写。引擎保证整枚资源不会真的出现小数（价格取整 + addResource 截断），
 * 这里再兜一层，免得旧存档或异常数据在界面上露出「4.5 枚灵石」。
 */
export function fmtResource(resId, value) {
  return RESOURCE_MAP[resId]?.integer ? fmtStock(value) : fmtFixed(value)
}

/** 每秒速率，带正负号（统一用「/秒」，与效果文案、猫国中文版一致） */
export function fmtRate(value) {
  const inf = infiniteText(value)
  if (inf) return (inf === '-∞' ? '-' : '+') + '∞/秒'
  const amount = amountOf(value)
  if (!amount || amount.isZero()) return '0/秒'
  const sign = amount.isPositive() ? '+' : '-'
  return sign + magnitude(amount.abs()) + '/秒'
}

/** 秒 -> 中文时长（时间域仍是 Number） */
export function fmtTime(seconds) {
  if (!Number.isFinite(seconds)) return '∞'
  const s = Math.max(0, Math.floor(seconds))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}天${h}小时`
  if (h > 0) return `${h}小时${m}分`
  if (m > 0) return `${m}分${sec}秒`
  return `${sec}秒`
}

/** 有界比例 → 百分比文本（入参是 Number：来自 Decimal 的比值请先 moneyToRatio / moneyToNumber） */
export function fmtPercent(value, digits = 0) {
  return (value * 100).toFixed(digits) + '%'
}

export function fmtClock(timestamp) {
  const d = new Date(timestamp)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
