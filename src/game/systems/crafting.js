import { floorNumber, subtractResource, atLeast, ceilNumber } from '../numbers'
import { maxCraftable, isAutoCrafting, EPS, autoCraftReserve, craftTarget, canAutoCraft, processingPlan, processingFuelReserve, hasCraftOrder, canProcessCraft, clickGain, craftYield, materialCopies } from './craftingRules'
import { CRAFT_MAP, CRAFTS, autoCraftTime, craftCost, craftTime } from '@/data/crafts'
import { RECIPE_STATIONS, PROCESSING_STATIONS, PROCESSING_MODES } from '@/data/industry'
import { recompute } from './economy'
import { addResource, isCraftUnlocked, clamp, payCost, pushLog } from './core'
import { CONFIG } from '@/data/config'
import { RESOURCE_MAP } from '@/data/resources'

/**
 * 按比例立即制作一批，自动加工继续按工位与节拍结算。
 * 界面上的「¼料 / ½料 / 全部」就是它（全部 = frac 1）。
 */
export function craftBatch(state, derived, recipeId, frac = 1) {
  if (!Number.isFinite(frac) || frac <= 0 || frac > 1) return 0
  const n = floorNumber(maxCraftable(state, derived, recipeId) * frac)
  if (n <= 0) return 0
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

/** 把一次制作的产出累进 craftProgress，返回这次凑出的整数产出 */
export function addCraftGain(state, derived, recipe, gain, copies = 1) {
  const acc = (state.craftProgress[recipe.id] || 0) + gain
  const whole = floorNumber(acc)
  state.craftProgress[recipe.id] = subtractResource(acc, whole)
  if (whole > 0) {
    addResource(state, recipe.out, whole, derived.max[recipe.out])
    state.stats.crafted[recipe.out] = (state.stats.crafted[recipe.out] || 0) + whole
  }
  state.stats.craftCount = (state.stats.craftCount || 0) + copies
  return whole
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
  if (!state.craftTimers) state.craftTimers = {}
  let made = false
  const recipes = [...CRAFTS]
  if (derived.autoCraftUnlocked) {
    const priority = state.settings.autoCraftPriority
    recipes.sort((a, b) => Number(b.id === priority) - Number(a.id === priority))
  }
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
        if (cost > 0) copies = Math.min(copies, floorNumber(subtractResource(state.resources[res] || 0, autoCraftReserve(state, derived, res)) / cost))
      }
      const target = craftTarget(state, derived, recipe.id)
      const cap = target > 0 ? Math.min(target, derived.max[recipe.out]) : derived.max[recipe.out]
      const result = canAutoCraft(state, derived, recipe)
        ? settleCraftCopies(state, derived, recipe, copies, cap) : { count: 0 }
      timer.made = (timer.made || 0) + result.count
      timer.t = Math.max(0, timer.t - result.count * step)
      // 未完成的份数只保留一份等待，不积攒成缺料恢复后的突发大量制作。
      if (result.count < due) timer.t = Math.min(timer.t, step)
      made ||= result.count > 0
    }
    state.craftTimers[recipe.id] = timer
  }
  if (derived.industrial) made = runIndustrialCraft(state, derived, dt, recipes) || made
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
      powerDrain[res] = (powerDrain[res] || 0) + rate
    }
    for (const [res, rate] of Object.entries(powerDrain)) if (rate > EPS) {
      next = Math.min(next, Math.max(0, subtractResource(state.resources[res] || 0, processingFuelReserve(state, derived, res))) / rate)
    }
    for (const recipe of active) {
      const timer = state.craftTimers[recipe.id] ||= { t: 0, made: 0 }
      const step = steps[recipe.id]
      timer.t = clamp(Number.isFinite(timer.t) ? timer.t : 0, 0, step)
      next = Math.min(next, Math.max(0, step - timer.t) / plan[recipe.id].speed)
    }
    remaining = Math.max(0, remaining - next)
    for (const [res, rate] of Object.entries(powerDrain)) if (rate > 0 && next > 0) {
      state.resources[res] = subtractResource(state.resources[res] || 0, rate * next)
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
      const cap = !ordered && target > 0 ? Math.min(target, derived.max[recipe.out]) : derived.max[recipe.out]
      const result = canProcessCraft(state, derived, recipe)
        ? settleCraftCopies(state, derived, recipe, 1, cap) : { count: 0 }
      if (ordered && result.count > 0) {
        state.craftOrders[recipe.id].remaining -= result.count
        if (state.craftOrders[recipe.id].remaining <= 0) delete state.craftOrders[recipe.id]
      }
      timer.t = Math.max(0, timer.t - step)
      timer.made += result.count
      made ||= result.count > 0
      completed = true
    }
    if (next <= EPS && !completed) break
  }
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
  const qiMax = derived.max.qi || 0
  const qi = state.resources.qi || 0
  if (!atLeast(qi, qiMax)) return false
  const ratio = clamp(CONFIG.AUTO_CONDENSE_RATIO, 0, 1)
  const recipe = CRAFT_MAP.condenseLiquid
  if (!isCraftUnlocked(state, recipe)) return false
  const times = floorNumber((qi * ratio) / craftCost(derived, recipe).qi)
  let made = false
  for (let i = 0; i < times; i++) {
    // 每份重新检查，批量转换也遵守库存目标、仓储和道果材料保留量。
    if (!canAutoCraft(state, derived, recipe)) break
    if (!craft(state, derived, recipe.id, { times: 1, silent: true })) break
    made = true
  }
  return made
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
  const target = Number(value)
  if (!Number.isFinite(target) || target < 0) return false
  state.craftTargets ||= {}
  state.craftTargets[recipeId] = Math.floor(target)
  return true
}

/** 执行一次「吸取天地灵气」，返回这次吸到多少 */
export function drawQi(state, derived) {
  const gain = clickGain(state, derived)
  addResource(state, 'qi', gain, derived.max.qi)
  state.stats.clicks = (state.stats.clicks || 0) + 1
  return gain
}

/** 手动与自动共用整批结算；自动可将库存目标作为提前停止的上限。 */
export function settleCraftCopies(state, derived, recipe, times, cap = derived.max[recipe.out]) {
  const empty = { made: 0, count: 0 }
  if (!Number.isFinite(times) || times <= 0) return empty
  const have = state.resources[recipe.out] || 0
  const gain = craftYield(derived, recipe)
  const progress = state.craftProgress[recipe.id] || 0
  if (!Number.isFinite(have) || !(cap > have) || atLeast(have, cap) ||
      !Number.isFinite(gain) || gain <= 0 || !Number.isFinite(progress)) return empty
  // 原来逐份扣料、累计小数并在满仓后停下。直接算出触及上限的那一份，
  // 保留最后一份的溢出和进度规则，避免大批制作阻塞浏览器主线程。
  const roomCopies = ceilNumber((ceilNumber(cap - have) - progress) / gain)
  const count = Math.min(floorNumber(times), materialCopies(state, derived, recipe), roomCopies)
  if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(progress + gain * count)) return empty
  payCost(state, craftCost(derived, recipe), count)
  const made = addCraftGain(state, derived, recipe, gain * count, count)
  return { made, count }
}

export function craft(state, derived, recipeId, { silent = false, times = 1 } = {}) {
  const recipe = CRAFTS.find((c) => c.id === recipeId)
  if (!recipe || !isCraftUnlocked(state, recipe)) return 0
  const { made } = settleCraftCopies(state, derived, recipe, times)
  if (made > 0) {
    if (!silent) {
      pushLog(
        state,
        `${recipe.name}：得到 ${RESOURCE_MAP[recipe.out].name} ×${made}`,
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
