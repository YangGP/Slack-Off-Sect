/**
 * 数值与时间格式化工具。
 * 中文数量级优先（万/亿/兆…），超过常用单位就退回科学计数法。
 */
import { RESOURCE_MAP } from '@/data/resources'

const UNITS = [
  { v: 1e4, s: '万' },
  { v: 1e8, s: '亿' },
  { v: 1e12, s: '兆' },
  { v: 1e16, s: '京' },
  { v: 1e20, s: '垓' },
  { v: 1e24, s: '秭' },
  { v: 1e28, s: '穰' },
  { v: 1e32, s: '沟' },
  { v: 1e36, s: '涧' },
  { v: 1e40, s: '正' },
  { v: 1e44, s: '载' },
]

function trim(num, digits) {
  const s = num.toFixed(digits)
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s
}

/** 通用数量格式化，例如 12345 -> 1.23万 */
export function fmt(value, digits = 2) {
  if (value === Infinity) return '∞'
  if (value == null || Number.isNaN(value)) return '0'
  const neg = value < 0
  let n = Math.abs(value)
  let out
  if (n === 0) out = '0'
  else if (n < 1) out = n < 0.01 ? (n < 0.0001 ? '≈0' : n.toFixed(4)) : n.toFixed(3)
  else if (n < 1000) out = n < 10 ? trim(n, 2) : n < 100 ? trim(n, 1) : String(Math.round(n))
  else {
    let unit = null
    for (let i = UNITS.length - 1; i >= 0; i--) {
      if (n >= UNITS[i].v) {
        unit = UNITS[i]
        break
      }
    }
    if (unit) {
      const scaled = n / unit.v
      out = trim(scaled, scaled < 100 ? 2 : 0) + unit.s
    } else {
      out = String(Math.round(n))
    }
    if (n >= 1e48) out = n.toExponential(2)
  }
  return neg ? '-' + out : out
}

/**
 * 固定两位小数（资源栏的「当前数值」用）。
 * 与 fmt 的区别：不省略尾随 0，所以 12.5 显示成 12.50、1500 显示成 1500.00，
 * 数字能按小数点对齐；超过 1 万仍走中文数量级，但同样固定两位（12345 → 1.23万）。
 */
export function fmtFixed(value, digits = 2) {
  if (value === Infinity) return '∞'
  if (value == null || Number.isNaN(value)) return (0).toFixed(digits)
  const neg = value < 0
  const n = Math.abs(value)
  let out
  if (n < 1e4) out = n.toFixed(digits)
  else {
    let unit = null
    for (let i = UNITS.length - 1; i >= 0; i--) {
      if (n >= UNITS[i].v) {
        unit = UNITS[i]
        break
      }
    }
    out = unit ? (n / unit.v).toFixed(digits) + unit.s : n.toFixed(digits)
    if (n >= 1e48) out = n.toExponential(digits)
  }
  return neg ? '-' + out : out
}

/**
 * 整数显示的内核：**资源数量在左栏以外一律显示整数**（§14.4）。
 * 一万以内直接写整数（`231`、`8400`），上万才用中文数量级并只留一位（`12.3万`）。
 */
function intCore(n) {
  if (n === Infinity) return '∞'
  if (n == null || Number.isNaN(n)) return '0'
  const abs = Math.abs(n)
  if (abs < 1e4) return String(n)
  let unit = null
  for (let i = UNITS.length - 1; i >= 0; i--) {
    if (abs >= UNITS[i].v) {
      unit = UNITS[i]
      break
    }
  }
  if (!unit) return String(n)
  const scaled = abs / unit.v
  return (n < 0 ? '-' : '') + trim(scaled, scaled < 100 ? 1 : 0) + unit.s
}

/** 以整数形式展示（人数、加成等少量数值） */
export function fmtInt(value) {
  return intCore(Math.round(value || 0))
}

/** 存量：整数（向下取整，不虚报家底）—— 左栏资源表以外的地方都用它 */
export function fmtStock(value) {
  return intCore(Math.floor((value || 0) + 1e-9))
}

/** 花费 / 上限：整数（向上取整）—— 看到的需求一定够用，不会出现「看着够其实不够」 */
export function fmtCost(value) {
  return intCore(Math.ceil((value || 0) - 1e-9))
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
 * 显示整数（§14.4）。引擎保证整枚资源不会真的出现小数（§5.2 的价格取整 + addResource 截断），
 * 这里再兜一层，免得旧存档或异常数据在界面上露出「4.5 枚灵石」。
 */
export function fmtResource(resId, value) {
  return RESOURCE_MAP[resId]?.integer ? fmt(Math.floor((value || 0) + 1e-9)) : fmtFixed(value)
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

/** 相对时间戳（刚刚 / x分钟前） */
export function fmtAgo(timestamp) {
  if (!timestamp) return ''
  const diff = (Date.now() - timestamp) / 1000
  if (diff < 20) return '刚刚'
  return fmtTime(diff) + '前'
}

export function fmtPercent(value, digits = 0) {
  return (value * 100).toFixed(digits) + '%'
}

export function fmtClock(timestamp) {
  const d = new Date(timestamp)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
