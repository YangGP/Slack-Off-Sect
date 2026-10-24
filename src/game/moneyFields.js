import { ZERO, isMoney, moneyFromSave } from './decimal'
import { cloneRuntime } from './clone'

/**
 * 存档里的「金额字段」白名单。
 *
 * 金额域在运行时是 Decimal，写档时按字段显式转成十进制字符串（允许科学计数法），
 * 读档时按同一份清单把字符串/旧 number 还原为 Decimal。清单是显式路径，不做类型嗅探，
 * 也不依赖任意对象的 `toJSON`；时间与计数域不在表内，继续保存 JSON number。
 *
 * 路径语法：`'key'` 取对象字段、`'*'` 遍历映射的全部键、`'[]'` 遍历数组元素。
 * 中间字段缺失时跳过，由状态归一化补齐默认值。
 */
export const MONEY_PATHS = [
  ['karma'],
  ['dao'],
  ['resources', '*'],
  ['peak', '*'],
  ['legacyStorage', '*', 'storage', '*'],
  ['craftProgress', '*'],
  ['craftTargets', '*'],
  ['settings', 'craftReserves', '*'],
  ['stats', 'totalQi'],
  ['stats', 'totalInsight'],
  ['stats', 'totalFaith'],
  ['stats', 'lifeInsight'],
  ['stats', 'offlineGains'],
  ['stats', 'crafted', '*'],
  ['faithProgression', 'totalDaoHeart'],
  ['karmaProgression', 'totalSpent'],
  ['samsara', 'spent'],
  ['disciples', 'members', '[]', 'totalQiConsumed'],
  ['pendingChoice', 'herbLoss'],
  ['hunting', 'yieldRemainders', '*'],
  ['hunting', 'missions', '*', 'baseYield', '*'],
  ['hunting', 'missions', '*', 'advancedYield', '*'],
  ['hunting', 'missions', '*', 'preparationPaid'],
  // 战报里的兽材金额只是显示数据，但同样是经济数量：写档按白名单落地，读档由模块再清洗一次。
  ['hunting', 'lastOutcome', 'gains', '*'],
  ['hunting', 'lastOutcome', 'remainders', '*'],
]

function forEachSlot(target, path, visit) {
  if (!target || typeof target !== 'object') return
  const [step, ...rest] = path
  if (step === '*') {
    for (const key of Object.keys(target)) {
      if (rest.length) forEachSlot(target[key], rest, visit)
      else visit(target, key)
    }
    return
  }
  if (step === '[]') {
    if (!Array.isArray(target)) return
    for (let index = 0; index < target.length; index++) {
      if (rest.length) forEachSlot(target[index], rest, visit)
      else visit(target, index)
    }
    return
  }
  if (!Object.hasOwn(target, step)) return
  if (rest.length) forEachSlot(target[step], rest, visit)
  else visit(target, step)
}

/** 写档：金额就地转十进制字符串；非 Decimal 的残留值按有限数字转写，损坏值写 0。 */
export function encodeMoneyFields(target) {
  for (const path of MONEY_PATHS) {
    forEachSlot(target, path, (holder, key) => {
      const value = holder[key]
      if (isMoney(value)) holder[key] = value.toString()
      else if (typeof value === 'number' && Number.isFinite(value)) holder[key] = String(value)
      else if (value !== undefined) holder[key] = ZERO.toString()
    })
  }
  return target
}

/**
 * 读档：金额就地还原为 Decimal，负数与损坏值回退为 0。
 * 宽容版本只负责「按字段解析」；格式、整数化与字段语义由后续校验负责。
 * **不修改传入的存档对象**：先深拷贝再解析，调用方（含测试夹具）的原始数据保持不变。
 */
export function decodeMoneyFields(target) {
  const copy = cloneRuntime(target)
  for (const path of MONEY_PATHS) {
    forEachSlot(copy, path, (holder, key) => {
      const value = moneyFromSave(holder[key], ZERO)
      holder[key] = value.isNegative() ? ZERO : value
    })
  }
  return copy
}
