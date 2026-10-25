import { moneyIsPositive, moneyLt } from './decimal'
import { eventOutcome, eventEffect } from './engine'
import { resourceName } from '@/data/resources'
import { fmtAmount, fmtTime } from './format'

/** 事件选项预览：纪事面板与事件弹窗共用，避免两份费用/收益算法。 */
export function eventPreview(state, derived, effect) {
  if (effect?.decline) return '不消耗物资，不领取奖励'
  const { rows, recruits, required, affordable } = eventOutcome(state, derived, effect || {})
  if (!affordable) {
    return '材料不足：' + Object.entries(required)
      .filter(([res, amount]) => moneyLt(state.resources[res] ?? 0, amount))
      .map(([res, amount]) => resourceName(res) + ' 需' + fmtAmount(amount)).join('，')
  }
  const parts = []
  for (const row of rows) {
    const name = resourceName(row.res)
    if (moneyIsPositive(row.lost)) parts.push(name + ' −' + fmtAmount(row.lost))
    if (moneyIsPositive(row.gained)) parts.push(name + ' +' + fmtAmount(row.gained))
    if (moneyIsPositive(row.overflow)) parts.push(name + ' ' + fmtAmount(row.overflow) + ' 装不下')
  }
  if (effect?.recruit) parts.push(recruits ? '弟子 +' + recruits : state.challenge?.active ? '全员挑战期间不接收普通来客' : '居所已满，无法收徒')
  const resolved = eventEffect(state, derived, effect || {})
  if (resolved.buff) parts.push(resolved.buff.name + '：灵草产出 −25%，' + fmtTime(resolved.buff.duration))
  if (resolved.peaceSeconds) parts.push('安宁 ' + fmtTime(resolved.peaceSeconds))
  return parts.join('，') || '当前无物资变化'
}
