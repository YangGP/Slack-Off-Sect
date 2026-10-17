import { atLeast } from '../numbers'
import { ZERO, money, moneyGt, moneyMax, moneyToNumber } from '../decimal'
import { RESOURCES } from '@/data/resources'
import { CRAFTS, craftCost, craftTime, autoCraftTime } from '@/data/crafts'
import { isCraftUnlocked } from './core'
import { craftYield, isProcessingCraft, processingPlan } from './craftingRules'

/**
 * 还差多久才能凑够 need（秒）。返回 0 表示已经够了，Infinity 表示按当前进项永远凑不齐
 * （界面就不显示时间）。
 *
 * 两条路：
 *   1. 有产出的资源（灵气/灵木/玄铁/灵草/灵机/香火）按净额算；
 *   2. **没有产出、但有制作配方的成品**（灵石/丹药/符箓/法器）走「现印」那条路：
 *      先递归算凑齐配方材料要多久，再加上制作这些份数的耗时 ——
 *      只有该配方勾了「自动」才算制作时间，手动点「制作」是瞬发的。
 * 同一成品的直接生产与多个加工配方分别估算，选择等待最短的路线。
 * 这是供料估算，不模拟多种材料共享上游原料时的并发竞争。
 *
 * 缺口是金额、速率也是金额，两者相除得到**秒数（Number）**；秒数超出 Number 范围时得到
 * Infinity，正好是「等不到」的语义。
 */
export function timeToAfford(state, derived, resId, need, depth = 0, path = new Set()) {
  const have = state.resources[resId] ?? ZERO
  const target = money(need)
  if (atLeast(have, target)) return 0
  // 缺口用 Decimal 精确相减再夹到非负；速率取净额（净额为负表示只会更慢）。
  const deficit = moneyMax(ZERO, target.minus(have))
  const rate = derived.net?.[resId] ?? derived.rates?.[resId] ?? ZERO
  let best = moneyGt(rate, ZERO) ? moneyToNumber(deficit.div(rate)) : Infinity
  if (path.has(resId) || depth >= RESOURCES.length) return best
  const next = new Set(path).add(resId)
  for (const recipe of CRAFTS) {
    if (recipe.out !== resId || !isCraftUnlocked(state, recipe) || recipe.cost[resId]) continue
    // 份数是金额：差多少份向上取整后，用**完整份额**估原料预算，不能先截成安全整数。
    const yieldPerCopy = craftYield(derived, recipe)
    if (!yieldPerCopy.isFinite() || !yieldPerCopy.gt(0)) continue
    const copies = deficit.div(yieldPerCopy).ceil()
    let wait = 0
    const costs = craftCost(derived, recipe)
    for (const res in costs) {
      const sub = timeToAfford(state, derived, res, costs[res].times(copies), depth + 1, next)
      wait = Math.max(wait, sub)
    }
    if (isProcessingCraft(state, derived, recipe.id)) {
      const line = processingPlan(state, derived)[recipe.id]
      const speed = line ? line.speed || Math.min(line.capacity, derived.autoCraftSpeeds[recipe.id] || 1) * (1 + (derived.craftSpeedByRecipe[recipe.id] || 0)) : 0
      // 秒数是 Number 域：份数算完后才转，超出范围正好是「等不到」。
      const perCopy = line ? speed > 0 ? craftTime(recipe, derived) / speed : Infinity : autoCraftTime(recipe, derived)
      wait += moneyToNumber(copies.times(perCopy))
    }
    best = Math.min(best, wait)
  }
  return best
}
