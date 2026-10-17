import Decimal from 'decimal.js'

/**
 * 经济数值域的统一 Decimal 层。
 *
 * 精度只在这里配置：40 位有效数字、四舍五入。业务文件不得修改全局配置，
 * 一律通过本模块导出的构造器与助手处理金额。40 位有效数字**不保证任意大库存都能加上 1**
 * （例如 1e40 + 1 会舍回 1e40），这是本层已知的精度边界；需要任意规模整数的逐枚精确累计时
 * 应另行设计方案，不能依赖本层。
 *
 * 类型边界（另见 docs/ENGINEERING.md「数值与存档」）：
 * - **金额 → Decimal**：资源存量与仓容、成本与产量、每秒速率与净额、经济累计、
 *   制作进度与目标、弟子口粮累计、模块奖励与余量、永久货币。
 * - **Number**：时间（时间戳、dt、天数、计时器、冷却、任务进度）、索引与 ID、随机种子、
 *   人数与建筑数、等级与境界、订单数量、次数统计、有界概率与比例、岗位权重与有限倍率。
 * - 时间域的正无穷继续用 Number `Infinity`；金额域的无仓容上限用 `MONEY_INFINITY`，两者不跨域套用。
 */
export const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP })

export const ZERO = new Dec(0)
export const ONE = new Dec(1)
/** 金额域的「无上限」哨兵：只有派生仓容允许出现正无穷金额。 */
export const MONEY_INFINITY = new Dec(Infinity)

/** 十进制语法；显式拒绝 0x / 0b 等写法，运行时构造与存档解析共用同一套判断。 */
const DECIMAL_TEXT = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/

/**
 * 结构识别「另一个 decimal.js 实例」的金额。
 *
 * 打包器或测试入口若同时从不同路径载入本模块（例如 `@/game/decimal` 与相对路径），
 * 会产生两个 `Dec` 构造器：同一个值在两个实例之间 `instanceof` 不成立。
 * 这类值仍然是合法的不可变十进制数，按值复制而不是报错；其余对象一律拒绝。
 */
function isForeignDecimal(value) {
  // null 的 typeof 也是 'object'，必须先排除：金额判定要能安全接住所有输入，
  // 不能靠每个调用方在格式化/读档前自己补空值判断。
  if (value === null || typeof value !== 'object') return false
  return typeof value.s === 'number' && value.d != null && value.e != null
    && typeof value.plus === 'function' && typeof value.times === 'function'
    && typeof value.toString === 'function'
}

export function isMoney(value) {
  return value instanceof Dec || isForeignDecimal(value)
}

/**
 * 构造金额：Decimal 原样返回，有限 Number 与十进制字符串按值构造，null/undefined 视作 0。
 * NaN、±Infinity（哨兵除外）与十进制以外的字符串一律报错，避免把损坏值悄悄变成 0。
 */
export function money(value) {
  if (value instanceof Dec) return value
  if (value === null || value === undefined) return ZERO
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`非法金额：${value}`)
    return new Dec(value)
  }
  if (typeof value === 'string') {
    const text = value.trim()
    if (!DECIMAL_TEXT.test(text)) throw new Error(`非法金额：${value}`)
    const out = new Dec(text)
    if (!out.isFinite()) throw new Error(`非法金额：${value}`)
    return out
  }
  if (isForeignDecimal(value)) return new Dec(value.toString())
  throw new Error(`非法金额：${String(value)}`)
}

/**
 * 存档解码：宽容版本，只接受已清洗过的形状。
 * 拒绝空串、超长串、布尔、数组、对象、十进制以外的语法与 NaN/±Infinity，异常一律回退默认值；
 * 负数由调用方按字段语义处理（金额字段本身不接受负数）。
 */
export function moneyFromSave(value, fallback = ZERO) {
  try {
    if (value instanceof Dec) return value
    if (isForeignDecimal(value)) return new Dec(value.toString())
    if (typeof value === 'number') return Number.isFinite(value) ? new Dec(value) : fallback
    if (typeof value !== 'string') return fallback
    const text = value.trim()
    if (!text || text.length > MONEY_TEXT_LIMIT || !DECIMAL_TEXT.test(text)) return fallback
    const out = new Dec(text)
    return out.isFinite() ? out : fallback
  } catch {
    return fallback
  }
}

/** 存档金额字符串长度上限：超过即视为损坏字段。 */
export const MONEY_TEXT_LIMIT = 256

/** 宽容金额：损坏值回退默认值，负数按默认值处理（读档与历史迁移路径使用）。 */
export function moneyNonNegative(value, fallback = ZERO) {
  const out = moneyFromSave(value, fallback)
  return out.isNegative() ? fallback : out
}

/** 金额是否有限（拒绝 NaN 与 ±Infinity）；无上限仓容的哨兵不算有限。 */
export function moneyFinite(value) {
  return isMoney(value) && money(value).isFinite()
}

export function moneyIsZero(value) {
  return money(value).isZero()
}

export function moneyIsPositive(value) {
  return money(value).gt(0)
}

export function moneyGte(a, b) {
  return money(a).gte(money(b))
}

export function moneyGt(a, b) {
  return money(a).gt(money(b))
}

export function moneyLt(a, b) {
  return money(a).lt(money(b))
}

export function moneyLte(a, b) {
  return money(a).lte(money(b))
}

export function moneyEq(a, b) {
  return money(a).eq(money(b))
}

/** 取最小：接受任意多个金额（`moneyMin(a, b, c)`），至少一个。 */
export function moneyMin(...values) {
  if (!values.length) throw new Error('金额比较缺少参数')
  return values.slice(1).reduce((acc, value) => Dec.min(acc, money(value)), money(values[0]))
}

/** 取最大：接受任意多个金额（`moneyMax(a, b, c)`），至少一个。 */
export function moneyMax(...values) {
  if (!values.length) throw new Error('金额比较缺少参数')
  return values.slice(1).reduce((acc, value) => Dec.max(acc, money(value)), money(values[0]))
}

export function moneyClamp(value, min, max) {
  return Dec.min(Dec.max(money(value), money(min)), money(max))
}

/** 求和：`moneySum(list)` 或 `moneySum(list, 起始值)`，全程 Decimal。 */
export function moneySum(values, start = ZERO) {
  let total = money(start)
  for (const value of values || []) total = total.plus(money(value))
  return total
}

/** 精确差值：可能为负（速率、净额等中间量使用）。 */
export function moneySubtract(a, b) {
  return money(a).minus(money(b))
}

/** 扣款后的可用余量：不足时归零。资源存量不得为负，负差在这里被夹掉。 */
export function moneyAvailable(value, cost) {
  const current = money(value)
  const amount = money(cost)
  return current.gte(amount) ? current.minus(amount) : ZERO
}

/** 经济取整：整枚资源入库向下取整、费用向上取整。 */
export function floorMoney(value) {
  return money(value).floor()
}

export function ceilMoney(value) {
  return money(value).ceil()
}

/** 金额转 Number：超出 Number 范围时得到 ±Infinity（供界面与时间估计使用）。 */
export function moneyToNumber(value) {
  return money(value).toNumber()
}

/** 金额转有界计数：供循环、订单与批量上限使用；上限与安全整数双重封顶。 */
export function moneyToCount(value, cap = Number.MAX_SAFE_INTEGER) {
  const amount = money(value)
  const limit = Math.max(0, Math.floor(cap))
  if (amount.lte(0)) return 0
  if (!amount.isFinite() || amount.gte(limit)) return limit
  return Math.min(limit, amount.floor().toNumber())
}

/** 有界比例转 Number：先在 Decimal 域夹到约定范围，再转换。 */
export function moneyToRatio(value, min = 0, max = 1) {
  return moneyClamp(value, min, max).toNumber()
}

/** 金额是否在给定上限内（上限可为 MONEY_INFINITY）。 */
export function moneyWithin(value, limit) {
  return money(value).lte(money(limit))
}

/**
 * 正常游戏运算的守门：金额必须有限，否则明确报错（调用方保留原状态）。
 * 不能因为溢出或异常把库存静默归零 —— 那会把「算不出来」伪装成「资源没了」。
 */
export function requireFiniteMoney(value, what = '金额') {
  const out = money(value)
  if (!out.isFinite()) throw new Error(`${what}出现非有限值`)
  return out
}
