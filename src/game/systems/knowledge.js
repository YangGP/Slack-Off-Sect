import { CONFIG } from '@/data/config'
import { ZERO, money, moneyMax, moneyMin } from '../decimal'

/** 知识加工品不限仓；反馈按固定阈值封顶，不随扩仓增长。 */
export function knowledgeFeedback(state) {
  const held = id => moneyMax(ZERO, money(state.resources?.[id] ?? ZERO))
  return {
    insightRatio: moneyMin(held('daoNote').times(CONFIG.DAONOTE_INSIGHT_RATIO), CONFIG.DAONOTE_INSIGHT_LIMIT).toNumber(),
    buildingDiscount: moneyMin(held('arrayDiagram').times(CONFIG.ARRAYDIAGRAM_BUILD_DISCOUNT), CONFIG.ARRAYDIAGRAM_BUILD_LIMIT).toNumber(),
  }
}
