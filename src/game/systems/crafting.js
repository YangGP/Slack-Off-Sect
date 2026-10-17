import { floorNumber, atLeast } from '../numbers'
import { MONEY_INFINITY, ONE, ZERO, ceilMoney, floorMoney, money, moneyAvailable, moneyMax, moneyMin, moneyToCount, moneyToNumber } from '../decimal'
import { maxCraftable, maxCraftableMoney, materialCopiesMoney, isAutoCrafting, EPS, autoCraftReserve, craftTarget, canAutoCraft, processingPlan, processingFuelReserve, hasCraftOrder, canProcessCraft, clickGain, craftYield } from './craftingRules'
import { CRAFT_MAP, CRAFTS, autoCraftTime, craftCost, craftTime } from '@/data/crafts'
import { RECIPE_STATIONS, PROCESSING_STATIONS, PROCESSING_MODES } from '@/data/industry'
import { recompute } from './economy'
import { addResource, isCraftUnlocked, clamp, payCost, pushLog } from './core'
import { CONFIG } from '@/data/config'
import { termCrossings } from '@/data/calendar'
import { RESOURCE_MAP } from '@/data/resources'
import { fmtAmount } from '../format'

/**
 * 按比例立即制作一批，自动加工继续按工位与节拍结算。
 * 界面上的「¼料 / ½料 / 全部」就是它（全部 = frac 1）。份数与返回产量都是 Decimal。
 */
export function craftBatch(state, derived, recipeId, frac = 1) {
  if (!Number.isFinite(frac) || frac <= 0 || frac > 1) return ZERO
  // 份数是金额：按比例取整只在金额域做，不用安全整数封顶。
  const n = floorMoney(maxCraftableMoney(state, derived, recipeId).times(frac))
  if (!n.gt(0)) return ZERO
  return craft(state, derived, recipeId, { times: n })
}

/** 旧版订单兼容入口；当前玩家与模拟的手动制作通过 craft 即时结算。 */
export function requestCraft(state, derived, recipeId, times = 1) {
  if (!Number.isSafeInteger(times) || times <= 0 || !Object.hasOwn(CRAFT_MAP, recipeId)) return 0
  if (!derived.industrial || !RECIPE_STATIONS[recipeId]) return craft(state, derived, recipeId, { times })
  const available = maxCraftable(state, derived, recipeId)
  const current = state.craftOrders?.[recipeId]?.remaining || 0
  const count = Math.max(0, Math.min(times, available - current, CONFIG.CRAFT_ORDER_CAP - current))
  if (!count) return 0
  state.craftOrders ||= {}
  state.craftOrders[recipeId] = { remaining: current + count, paused: state.craftOrders[recipeId]?.paused === true }
  recompute(state, derived)
  return count
}

export function manageCraftOrder(state, derived, recipeId, action) {
  if (!Object.hasOwn(CRAFT_MAP, recipeId) || !state.craftOrders?.[recipeId]) return false
  if (action === 'cancel') delete state.craftOrders[recipeId]
  else if (action === 'pause' || action === 'resume') state.craftOrders[recipeId].paused = action === 'pause'
  else return false
  recompute(state, derived)
  return true
}

/**
 * 把一次制作的产出累进 craftProgress，返回**实际入库金额**（Decimal）。
 * 产出份数是金额，不在这里转安全整数；次数统计仍是 Number，单独按上限累加。
 */
export function addCraftGain(state, derived, recipe, gain, copies = ONE) {
  const acc = (state.craftProgress[recipe.id] ?? ZERO).plus(gain)
  const whole = acc.floor()
  state.craftProgress[recipe.id] = acc.minus(whole)
  let made = ZERO
  if (whole.gt(0)) {
    made = addResource(state, recipe.out, whole, derived.max[recipe.out] ?? MONEY_INFINITY)
    state.stats.crafted[recipe.out] = (state.stats.crafted[recipe.out] ?? ZERO).plus(whole)
  }
  state.stats.craftCount = Math.min(Number.MAX_SAFE_INTEGER,
    (state.stats.craftCount || 0) + moneyToCount(copies))
  return made
}

export function setProcessingMode(state, derived, stationId, mode) {
  if (!derived.industrial || !PROCESSING_STATIONS.some(s => s.id === stationId) || !PROCESSING_MODES.includes(mode)) return false
  if (mode === 'overload' && !derived.autoCraftSpeedUnlocked || mode === 'energy' && !derived.energyCraftUnlocked) return false
  state.settings.processingModes ||= {}
  state.settings.processingModes[stationId] = mode
  recompute(state, derived)
  return true
}

export function setCraftWeight(state, derived, recipeId, value) {
  if (!derived.industrial || !Object.hasOwn(RECIPE_STATIONS, recipeId) || !isCraftUnlocked(state, CRAFT_MAP[recipeId]) ||
      !Number.isInteger(value) || value < 1 || value > 100) return false
  state.settings.craftWeights ||= {}
  state.settings.craftWeights[recipeId] = value
  recompute(state, derived)
  return true
}

/**
 * 推进自动制作：每个勾了「自动」的配方，每 time 秒一份，材料或仓储不够就停在那儿等
 * （不会取消勾选 —— 材料一恢复就接着做）。
 * 离线也照做：自动制作就是「挂着也一直在做」。
 */
export function runAutoCraft(state, derived, dt) {
  if (!Number.isFinite(dt) || dt < 0) return false
  const recipes = autoCraftOrder(state, derived)
  const made = runAutoCraftTimers(state, derived, dt, recipes)
  if (derived.industrial) return runIndustrialCraft(state, derived, dt, recipes) || made
  return made
}

/** 《心有灵犀》的优先配方排在最前，其余保持数据表顺序。 */
function autoCraftOrder(state, derived) {
  const recipes = [...CRAFTS]
  if (!derived.autoCraftUnlocked) return recipes
  const priority = state.settings.autoCraftPriority
  recipes.sort((a, b) => Number(b.id === priority) - Number(a.id === priority))
  return recipes
}

/**
 * 非工业配方的自动制作：按已攒时间一次算出到点的份数，
 * 再受材料、逐项保留量、库存目标与仓储上限限制（不逐份循环）。
 */
export function runAutoCraftTimers(state, derived, dt, recipes = autoCraftOrder(state, derived)) {
  if (!Number.isFinite(dt) || dt < 0) return false
  if (!state.craftTimers) state.craftTimers = {}
  let made = false
  for (const recipe of recipes) {
    if (!isAutoCrafting(state, derived, recipe.id)) continue
    if (derived.industrial && RECIPE_STATIONS[recipe.id]) continue
    const step = autoCraftTime(recipe, derived)
    const timer = state.craftTimers[recipe.id] || { t: 0, made: 0 }
    timer.t = (Number.isFinite(timer.t) ? Math.max(0, timer.t) : 0) + dt
    if (timer.t + EPS >= step) {
      const due = floorNumber((timer.t + EPS) / step)
      let copies = due
      for (const [res, cost] of Object.entries(craftCost(derived, recipe))) {
        if (cost.gt(0)) {
          copies = Math.min(copies, moneyToCount(moneyAvailable(state.resources[res] ?? ZERO,
            autoCraftReserve(state, derived, res)).div(cost)))
        }
      }
      const target = craftTarget(state, derived, recipe.id)
      const cap = target.gt(0) ? moneyMin(target, derived.max[recipe.out] ?? MONEY_INFINITY) : (derived.max[recipe.out] ?? MONEY_INFINITY)
      const result = canAutoCraft(state, derived, recipe)
        ? settleCraftCopies(state, derived, recipe, copies, cap) : { count: ZERO }
      // 计时与次数是 Number 域：这里的份数由已攒时间封顶，转回计数不丢金额。
      const count = moneyToCount(result.count)
      timer.made = (timer.made || 0) + count
      timer.t = Math.max(0, timer.t - count * step)
      // 未完成的份数只保留一份等待，不积攒成缺料恢复后的突发大量制作。
      if (count < due) timer.t = Math.min(timer.t, step)
      made ||= result.count > 0
    }
    state.craftTimers[recipe.id] = timer
  }
  return made
}

/** 按下一份完成时刻推进；停线立刻释放容量，批量与小步不会凭空积攒工位时间。 */
export function runIndustrialCraft(state, derived, dt, recipes) {
  let remaining = dt
  let made = false
  // derived 在本函数内不变，单件耗时只与配方和 derived 有关，先算一次复用。
  const steps = Object.fromEntries(recipes.map(recipe => [recipe.id, craftTime(recipe, derived)]))
  while (remaining > EPS) {
    const plan = processingPlan(state, derived)
    const active = recipes.filter(recipe => plan[recipe.id]?.speed > 0)
    if (!active.length) break
    let next = remaining
    const powerDrain = {}
    for (const recipe of active) for (const [res, rate] of Object.entries(plan[recipe.id].powerDrain)) {
      powerDrain[res] = (powerDrain[res] ?? ZERO).plus(rate)
    }
    for (const [res, rate] of Object.entries(powerDrain)) if (rate.gt(EPS)) {
      const usable = moneyMax(ZERO, moneyAvailable(state.resources[res] ?? ZERO, processingFuelReserve(state, derived, res)))
      next = Math.min(next, usable.div(rate).toNumber())
    }
    for (const recipe of active) {
      const timer = state.craftTimers[recipe.id] ||= { t: 0, made: 0 }
      const step = steps[recipe.id]
      timer.t = clamp(Number.isFinite(timer.t) ? timer.t : 0, 0, step)
      next = Math.min(next, Math.max(0, step - timer.t) / plan[recipe.id].speed)
    }
    remaining = Math.max(0, remaining - next)
    for (const [res, rate] of Object.entries(powerDrain)) if (rate.gt(0) && next > 0) {
      state.resources[res] = moneyAvailable(state.resources[res] ?? ZERO, rate.times(next))
      made = true
    }
    let completed = false
    for (const recipe of active) {
      const timer = state.craftTimers[recipe.id]
      const step = steps[recipe.id]
      timer.t += next * plan[recipe.id].speed
      if (timer.t + EPS < step) continue
      const target = craftTarget(state, derived, recipe.id)
      const ordered = hasCraftOrder(state, derived, recipe.id)
      const cap = !ordered && target.gt(0) ? moneyMin(target, derived.max[recipe.out] ?? MONEY_INFINITY)
        : (derived.max[recipe.out] ?? MONEY_INFINITY)
      const result = canProcessCraft(state, derived, recipe)
        ? settleCraftCopies(state, derived, recipe, 1, cap) : { count: ZERO }
      const count = moneyToCount(result.count)
      if (ordered && count > 0) {
        state.craftOrders[recipe.id].remaining -= count
        if (state.craftOrders[recipe.id].remaining <= 0) delete state.craftOrders[recipe.id]
      }
      timer.t = Math.max(0, timer.t - step)
      timer.made += count
      made ||= count > 0
      completed = true
    }
    if (next <= EPS && !completed) break
  }
  return made
}

/**
 * 成品还能装下几份：与 settleCraftCopies 的房量口径一致，供本轮预算估算使用。
 */
function outputRoomCopies(state, derived, recipe, cap) {
  const have = state.resources[recipe.out] ?? ZERO
  const gain = craftYield(derived, recipe)
  const progress = state.craftProgress[recipe.id] ?? ZERO
  if (!gain.isFinite() || gain.lte(0)) return 0
  if (have.gte(cap)) return 0
  return moneyToCount(moneyMax(ZERO, ceilMoney(cap.minus(have)).minus(progress).div(gain).ceil()))
}

/**
 * 有界近似的工业批量结算（长离线专用）。
 *
 * 与在线 runIndustrialCraft 的区别是**有意为之**的近似（见 docs/ENGINEERING.md「离线结算」）：
 * 在线按「下一份完成时刻」逐步推进，缺料、满仓与达标能在同一时间段内立刻重新分配工位；
 * 离线每段只做固定轮数（CONFIG.OFFLINE_INDUSTRY_ROUNDS）的分配：一轮冻结一次工位分配，
 * 按**本轮剩余的真实时间**算出份数，工位空出后到下一轮或下一段才重新分配，不补算段内所有停线与重启。
 *
 * 三条不因近似而放宽的硬约束：
 * 1. **时间预算**：多轮只是重分配同一段真实时间 —— 每轮从剩余预算里取，扣掉本轮实际用掉的时间，
 *    任一条线累计占用不超过「工位速度 × 本段时长」（`count * step + timer.t - before <= speed * dt`）。
 * 2. **同一份库存预算**：原料与这一份自己的加工动力算作**同一份完整代价**，按配方固定顺序贪心分配，
 *    并额外为本轮留下的小数进度预留一份动力；因此不会先发货后截零，自动保留量也不会被后置动力穿透。
 * 3. **动力按各条线自己的真实加工时间计费**，不用最长线的时间给短线一并收费。
 * 份数由材料、逐项保留量、目标、订单、仓储、时间与动力一次封顶，不按成品份数循环。
 */
export function runIndustrialCraftBatch(state, derived, dt, stats = null) {
  if (!(dt > 0) || !derived.industrial) return false
  const rounds = Math.max(1, CONFIG.OFFLINE_INDUSTRY_ROUNDS)
  let made = false
  let usedRounds = 0
  let budgetLeft = dt
  for (let round = 0; round < rounds && budgetLeft > EPS; round++) {
    const plan = processingPlan(state, derived)
    const active = CRAFTS.filter(recipe => RECIPE_STATIONS[recipe.id] && (plan[recipe.id]?.speed || 0) > EPS)
    if (!active.length) break
    usedRounds++
    let realUsed = 0
    let completed = false
    for (const recipe of active) {
      const info = plan[recipe.id]
      const speed = Math.max(info.speed, EPS)
      const step = craftTime(recipe, derived)
      const timer = state.craftTimers[recipe.id] ||= { t: 0, made: 0 }
      const before = clamp(Number.isFinite(timer.t) ? timer.t : 0, 0, step)
      const ordered = hasCraftOrder(state, derived, recipe.id)
      const target = craftTarget(state, derived, recipe.id)
      const cap = !ordered && target.gt(0) ? moneyMin(target, derived.max[recipe.out] ?? MONEY_INFINITY)
        : (derived.max[recipe.out] ?? MONEY_INFINITY)
      const cost = craftCost(derived, recipe)
      const drain = info.powerDrain || {}
      // 每份的完整代价 = 原料 + 这一份自己的加工动力；再为最多一份「遗留小数进度」预留同样的动力。
      const fuelPer = {}
      for (const [res, rate] of Object.entries(drain)) {
        if (rate.gt(EPS)) fuelPer[res] = rate.times(step).div(speed)
      }
      let copies = Math.max(0, Math.min(
        floorNumber((before + budgetLeft * speed + EPS) / step),
        outputRoomCopies(state, derived, recipe, cap),
      ))
      for (const res of new Set([...Object.keys(cost), ...Object.keys(fuelPer)])) {
        const material = money(cost[res] ?? ZERO)
        const fuel = fuelPer[res] ?? ZERO
        const have = state.resources[res] ?? ZERO
        if (material.plus(fuel).gt(0)) {
          const pool = moneyMax(ZERO, have.minus(autoCraftReserve(state, derived, res)))
          copies = Math.min(copies, moneyToCount(moneyMax(ZERO, pool.minus(fuel)).div(material.plus(fuel))))
        }
        if (fuel.gt(0)) {
          // 动力另有「至少留住一批」的下限：不能把动力预算吃进保留量里。
          const fuelRoom = moneyMax(ZERO, have.minus(processingFuelReserve(state, derived, res)))
          copies = Math.min(copies, moneyToCount(moneyMax(ZERO, fuelRoom.minus(fuel)).div(fuel)))
        }
      }
      const count = copies > 0 && canProcessCraft(state, derived, recipe)
        ? moneyToCount(settleCraftCopies(state, derived, recipe, copies, cap).count) : 0
      if (ordered && count > 0) {
        state.craftOrders[recipe.id].remaining -= count
        if (state.craftOrders[recipe.id].remaining <= 0) delete state.craftOrders[recipe.id]
      }
      // 原料扣除后，新增进度也只能使用剩余库存付得起的动力。
      // copies 为零时同样需要限制，不能先攒满一份进度再截零扣费。
      let grant = budgetLeft * speed
      for (const [res, rate] of Object.entries(drain)) {
        if (!rate.gt(EPS)) continue
        const usable = moneyMax(ZERO, (state.resources[res] ?? ZERO).minus(autoCraftReserve(state, derived, res)))
        grant = Math.min(grant, moneyToNumber(usable.div(rate)) * speed)
      }
      // 缺料与满仓不在段内继续攒进度：小数进度最多保留一份待完成量，
      // 恢复在线后不会倾泻整段欠账（与在线 runIndustrialCraft 的 timer 上限一致）。
      timer.t = clamp(before + grant - count * step, 0, step)
      timer.made += count
      state.craftTimers[recipe.id] = timer
      if (count > 0) { made = true; completed = true }
      const consumed = Math.max(0, count * step + timer.t - before)
      const real = consumed / speed
      realUsed = Math.max(realUsed, real)
      // 动力只为这条线自己的真实加工时间扣除：停料与满仓的工位空转不烧动力。
      for (const [res, rate] of Object.entries(drain)) {
        if (rate.gt(EPS) && real > 0) {
          state.resources[res] = moneyAvailable(state.resources[res] ?? ZERO, rate.times(real))
        }
      }
    }
    budgetLeft = Math.max(0, budgetLeft - realUsed)
    if (!completed) break
  }
  if (stats) stats.industryRounds += usedRounds
  return made
}

/**
 * 《凝灵诀》：每逢节气，若灵气满仓，把仓内一定比例（AUTO_CONDENSE_RATIO）的灵气
 * 一次凝成灵液；需先掌握《凝气化液》，仓库没满时不动手，不要求整节气收支累计。
 * 由 tick 的历法推进在节气变化的那一刻调用（离线模拟同样逐步过 tick，所以离线也照做）。
 * 与《心有灵犀》的常驻自动制作互不冲突：那是照节奏一直做，这只在节气收盈余。
 */
export function runAutoCondense(state, derived) {
  if (!derived.autoCondenseLiquidUnlocked || !state.settings.autoCraftOn) return false
  const qiMax = derived.max.qi ?? MONEY_INFINITY
  const qi = state.resources.qi ?? ZERO
  if (!atLeast(qi, qiMax)) return false
  const ratio = clamp(CONFIG.AUTO_CONDENSE_RATIO, 0, 1)
  const recipe = CRAFT_MAP.condenseLiquid
  if (!isCraftUnlocked(state, recipe)) return false
  const cost = craftCost(derived, recipe)
  const qiCost = cost.qi ?? ONE
  if (!qiCost.gt(0)) return false
  // 一次触发最多凝多少份：仓内比例 ÷ 单份灵气，金额域向下取整。
  // 纯公式结算，不逐份循环 —— 大额超仓库存不能把浏览器卡住。
  let copies = moneyMax(ZERO, qi.times(ratio).div(qiCost)).floor()
  if (!copies.gt(0)) return false
  // 每份的完整代价按可用库存（扣除保留量）封顶，与旧版逐份检查的口径一致。
  for (const [res, amount] of Object.entries(cost)) {
    if (!amount.gt(0)) continue
    copies = moneyMin(copies, moneyMax(ZERO, moneyAvailable(state.resources[res] ?? ZERO,
      autoCraftReserve(state, derived, res)).div(amount).floor()))
  }
  if (!copies.gt(0)) return false
  // 库存目标与成品仓容交给共享结算的 cap；count 是金额，用 Decimal 明确判断成功。
  const target = craftTarget(state, derived, recipe.id)
  const cap = target.gt(0) ? moneyMin(target, derived.max[recipe.out] ?? MONEY_INFINITY)
    : (derived.max[recipe.out] ?? MONEY_INFINITY)
  const { count } = settleCraftCopies(state, derived, recipe, copies, cap)
  if (!count.gt(0)) return false
  recompute(state, derived)
  return true
}

/**
 * 《凝灵诀》的离线批量估算（有界近似）。
 *
 * 触发次数直接用历法差算出，不逐节气、更不逐份执行：每次触发都把仓内固定比例的灵气
 * 凝成灵液，所以「本段可凝份数」由两件事封顶 ——
 *   1. 本段跨过的节气数（triggers）；
 *   2. 现有灵气 + 段内净产能够支撑几次「满仓凝一次」（heads / 每次掉的灵气）。
 * 仍然只在**能满仓**时才动手（heads 不足一仓则不动）。实际扣料、出货与仓储截断交给
 * settleCraftCopies，与普通凝液配方共享同一份材料预算，并遵守解锁、总开关、保留量与目标。
 */
export function runAutoCondenseBatch(state, derived, dayFrom, dayTo, dt) {
  if (!derived.autoCondenseLiquidUnlocked || !state.settings.autoCraftOn) return false
  const triggers = termCrossings(dayFrom, dayTo)
  if (triggers <= 0) return false
  const recipe = CRAFT_MAP.condenseLiquid
  if (!isCraftUnlocked(state, recipe)) return false
  const cost = craftCost(derived, recipe)
  const qiCost = cost.qi ?? ZERO
  const cap = derived.max.qi ?? ZERO
  if (!qiCost.gt(0) || !cap.gt(0)) return false
  const ratio = clamp(CONFIG.AUTO_CONDENSE_RATIO, 0, 1)
  // 份数是金额：每次触发能凝多少份由满仓比例决定，与节气数相乘后仍不转 Number。
  const perTrigger = moneyMax(ZERO, cap.times(ratio).div(qiCost)).floor()
  if (!perTrigger.gt(0)) return false
  const netRate = (derived.rates.qi ?? ZERO).plus(derived.expense?.qi ?? ZERO)
  const heads = moneyMax(ZERO, (state.resources.qi ?? ZERO).plus(moneyMax(ZERO, netRate).times(dt)))
  if (heads.lt(cap)) return false // 段内到不了满仓，凝灵诀不动手
  const sustainable = moneyMax(ZERO, heads.div(qiCost.times(perTrigger))).floor()
  let copies = perTrigger.times(moneyMin(money(triggers), sustainable))
  if (!copies.gt(0)) return false
  const target = craftTarget(state, derived, recipe.id)
  if (target.gt(0) && (state.resources[recipe.out] ?? ZERO).gte(target)) return false
  const capOut = target.gt(0) ? moneyMin(target, derived.max[recipe.out] ?? MONEY_INFINITY)
    : (derived.max[recipe.out] ?? MONEY_INFINITY)
  for (const [res, amount] of Object.entries(cost)) {
    if (amount.gt(0)) {
      copies = moneyMin(copies, moneyAvailable(state.resources[res] ?? ZERO,
        autoCraftReserve(state, derived, res)).div(amount).floor())
    }
  }
  if (!copies.gt(0)) return false
  return settleCraftCopies(state, derived, recipe, copies, capOut).count.gt(0)
}

export function setAutoCraftSpeed(state, derived, recipeId, speed) {
  if (!Object.hasOwn(CRAFT_MAP, recipeId)) return false
  const recipe = CRAFT_MAP[recipeId]
  if (!derived.autoCraftSpeedUnlocked || !recipe || !isCraftUnlocked(state, recipe) || !CONFIG.AUTO_CRAFT_SPEEDS.includes(speed)) return false
  const fraction = clamp((state.craftTimers[recipeId]?.t || 0) / autoCraftTime(recipe, derived), 0, 1)
  state.settings.autoCraftSpeeds ||= {}
  state.settings.autoCraftSpeeds[recipeId] = speed
  recompute(state, derived)
  // 工位计时保存已完成的基础加工秒数，调速与改分配无需改写进度。
  if (state.craftTimers[recipeId] && !(derived.industrial && RECIPE_STATIONS[recipeId])) state.craftTimers[recipeId].t = fraction * autoCraftTime(recipe, derived)
  return true
}

export function setCraftTarget(state, derived, recipeId, value) {
  if (!derived.craftTargetsUnlocked || !CRAFT_MAP[recipeId]) return false
  // 库存目标是金额（整数库存），不是循环次数：字符串直接按金额域解析，不先转 Number、
  // 也不套安全整数上限。非法值 / 负数 / 非有限值拒绝，不污染旧目标。
  let target
  try { target = money(value) } catch { return false }
  if (!target.isFinite() || target.isNegative()) return false
  state.craftTargets ||= {}
  state.craftTargets[recipeId] = floorMoney(target)
  return true
}

/** 执行一次「吸取天地灵气」，返回这次吸到多少（金额） */
export function drawQi(state, derived) {
  const gain = clickGain(state, derived)
  addResource(state, 'qi', gain, derived.max.qi ?? MONEY_INFINITY)
  state.stats.clicks = (state.stats.clicks || 0) + 1
  return gain
}

/**
 * 手动与自动共用整批结算；自动可将库存目标作为提前停止的上限。
 * 份数（times/count）是**金额**：纯公式结算，不逐份循环，也不截成安全整数。
 */
export function settleCraftCopies(state, derived, recipe, times, cap = derived.max[recipe.out] ?? MONEY_INFINITY) {
  const empty = { made: ZERO, count: ZERO }
  let want
  try { want = money(times) } catch { return empty }
  if (!want.isFinite() || !want.gt(0)) return empty
  const have = state.resources[recipe.out] ?? ZERO
  const gain = craftYield(derived, recipe)
  const progress = state.craftProgress[recipe.id] ?? ZERO
  const limit = money(cap)
  if (!have.isFinite() || !limit.gt(have) || have.gte(limit) ||
      !gain.isFinite() || gain.lte(0) || !progress.isFinite()) return empty
  // 原来逐份扣料、累计小数并在满仓后停下。直接算出触及上限的那一份，
  // 保留最后一份的溢出和进度规则，避免大批制作阻塞浏览器主线程。
  const roomCopies = moneyMax(ZERO, ceilMoney(limit.minus(have)).minus(progress).div(gain).ceil())
  const count = moneyMin(floorMoney(want), materialCopiesMoney(state, derived, recipe), roomCopies)
  if (!count.isFinite() || !count.gt(0)) return empty
  payCost(state, craftCost(derived, recipe), count)
  const made = addCraftGain(state, derived, recipe, gain.times(count), count)
  return { made, count }
}

export function craft(state, derived, recipeId, { silent = false, times = 1 } = {}) {
  const recipe = CRAFTS.find((c) => c.id === recipeId)
  if (!recipe || !isCraftUnlocked(state, recipe)) return ZERO
  const { made } = settleCraftCopies(state, derived, recipe, times)
  if (made.gt(0)) {
    if (!silent) {
      pushLog(
        state,
        `${recipe.name}：得到 ${RESOURCE_MAP[recipe.out].name} ×${fmtAmount(made)}`,
        'good',
      )
    }
    recompute(state, derived)
  }
  return made
}

/** 批量切换全部已解锁配方，不受界面筛选影响，总开关保持不变。 */
export function setAllAutoCraft(state, derived, enabled) {
  if (enabled && !derived.autoCraftUnlocked) return false
  if (enabled) {
    for (const recipe of CRAFTS) {
      if (isCraftUnlocked(state, recipe)) state.autoCraft[recipe.id] = true
    }
  } else {
    for (const id of Object.keys(state.autoCraft)) state.autoCraft[id] = false
  }
  pushLog(state, enabled ? '全部已解锁配方自动制作已开启' : '全部自动制作已取消', 'info')
  return true
}

export function toggleAutoCraft(state, derived, recipeId) {
  if (!derived.autoCraftUnlocked) return false
  state.autoCraft[recipeId] = !state.autoCraft[recipeId]
  pushLog(
    state,
    `${CRAFTS.find((c) => c.id === recipeId)?.name || recipeId} 自动制作已${
      state.autoCraft[recipeId] ? '开启' : '关闭'
    }`,
    'info',
  )
  return state.autoCraft[recipeId]
}
