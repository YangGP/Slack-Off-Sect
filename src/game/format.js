/**
 * 数值与时间格式化工具。
 * 数量按千进制缩写为 k / m / b，更大的数值使用科学计数法。
 */
import { RESOURCE_MAP } from '@/data/resources'
import { floorNumber, ceilNumber } from './numbers'

const UNITS = [
  { v: 1e3, s: 'k' },
  { v: 1e6, s: 'm' },
  { v: 1e9, s: 'b' },
]

function trim(num, digits) {
  const s = num.toFixed(digits)
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s
}

/** 正数的大数缩写；四舍五入进位后切换单位，避免出现 1000k。 */
function compact(n, digits = 2, fixed = false) {
  if (n >= 1e12) return n.toExponential(digits)
  let index = UNITS.length - 1
  while (index > 0 && n < UNITS[index].v) index--
  let scaled = Number((n / UNITS[index].v).toFixed(digits))
  if (scaled >= 1000) {
    index++
    if (index === UNITS.length) return n.toExponential(digits)
    scaled = Number((n / UNITS[index].v).toFixed(digits))
  }
  return (fixed ? scaled.toFixed(digits) : trim(scaled, digits)) + UNITS[index].s
}

/** 通用数量格式化，例如 12345 -> 12.35k */
export function fmt(value, digits = 2) {
  if (value === Infinity) return '∞'
  if (value == null || Number.isNaN(value)) return '0'
  const neg = value < 0
  let n = Math.abs(value)
  let out
  if (n === 0) out = '0'
  else if (n < 1) out = n < 0.01 ? (n < 0.0001 ? '≈0' : n.toFixed(4)) : n.toFixed(3)
  else if (n < 1000) out = n < 10 ? trim(n, 2) : n < 100 ? trim(n, 1) : String(Math.round(n))
  else out = compact(n, digits)
  return neg ? '-' + out : out
}

/**
 * 固定两位小数（资源栏的「当前数值」用）。
 * 不省略尾随 0：12.5 → 12.50，1500 → 1.50k，12345 → 12.35k。
 */
export function fmtFixed(value, digits = 2) {
  if (value === Infinity) return '∞'
  if (value == null || Number.isNaN(value)) return (0).toFixed(digits)
  const neg = value < 0
  const n = Math.abs(value)
  let out
  if (n < 1e3) out = n.toFixed(digits)
  else out = compact(n, digits, true)
  return neg ? '-' + out : out
}

/**
 * 资源计数先取整，再按数量级作紧凑显示。
 * 一千以内直接写整数，较大数量以 k / m / b 缩写，最多两位小数。
 */
function intCore(n) {
  if (n === Infinity) return '∞'
  if (n == null || Number.isNaN(n)) return '0'
  const abs = Math.abs(n)
  if (abs < 1e3) return String(n)
  return (n < 0 ? '-' : '') + compact(abs)
}

/** 以整数形式展示（人数、加成等少量数值） */
export function fmtInt(value) {
  return intCore(Math.round(value || 0))
}

/** 存量先向下取整，再缩写——左栏资源表以外的地方使用它。 */
export function fmtStock(value) {
  return intCore(floorNumber(value || 0))
}

/** 花费 / 上限先向上取整，再缩写；是否够用由实际整数判定。 */
export function fmtCost(value) {
  return intCore(ceilNumber(value || 0))
}

/** 累计量 / 事件增减：整数（四舍五入） */
export function fmtAmount(value) {
  return intCore(Math.round(value || 0))
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
  return RESOURCE_MAP[resId]?.integer ? fmt(floorNumber(value || 0)) : fmtFixed(value)
}

/** 每秒速率，带正负号（统一用「/秒」，与效果文案、猫国中文版一致） */
export function fmtRate(value) {
  if (!value) return '0/秒'
  const sign = value > 0 ? '+' : '-'
  return sign + fmt(Math.abs(value)) + '/秒'
}

/** 秒 -> 中文时长 */
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

export function fmtPercent(value, digits = 0) {
  return (value * 100).toFixed(digits) + '%'
}

export function fmtClock(timestamp) {
  const d = new Date(timestamp)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
