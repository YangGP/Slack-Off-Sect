import { setResourceValue } from '../resourceObservation'
import { CONFIG } from '@/data/config'
import { JOBS } from '@/data/jobs'
import { BUILDING_MAP } from '@/data/buildings'
import { atLeast } from '../numbers'
import { Dec, MONEY_INFINITY, ONE, ZERO, money, moneyAvailable, moneyMax } from '../decimal'
import { RESOURCE_MAP } from '@/data/resources'
import { DAYS_PER_YEAR, CALENDAR, TERMS, DAYS_PER_SEASON, SEASONS } from '@/data/calendar'
import { REALMS } from '@/data/realms'
import { gameNow } from '../context'
import { getEventLevel } from '@/data/events'
import { UPGRADE_MAP } from '@/data/upgrades'
import { isEntryEnabled } from '@/data/modules'
import { karmaShopBonuses } from './karmaShop'

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v
}

/** 宜居度的三个独立边界：环境、岗位拥挤和人口流失。 */
export function habitabilityEffects(habitability, population) {
  const globalMult = habitability < 0
    ? 1 - Math.min(CONFIG.HABITABILITY_GLOBAL_CAP, -habitability * CONFIG.HABITABILITY_LOSS_PER_POINT)
    : 1 + Math.min(CONFIG.HABITABILITY_GLOBAL_CAP,
      Math.max(0, habitability - population - CONFIG.HABITABILITY_BONUS_MARGIN) * CONFIG.HABITABILITY_GAIN_PER_POINT)
  const discipleMult = population >= CONFIG.HABITABILITY_JOB_MARGIN &&
    habitability < population - CONFIG.HABITABILITY_JOB_MARGIN ? 0.5 : 1
  const leaveDeficit = population - CONFIG.HABITABILITY_LEAVE_MARGIN - habitability
  const leaveChance = population >= CONFIG.HABITABILITY_LEAVE_MARGIN && leaveDeficit > 0
    ? Math.min(CONFIG.HABITABILITY_LEAVE_CHANCE_CAP, leaveDeficit * CONFIG.HABITABILITY_LEAVE_CHANCE_PER_POINT) : 0
  return { globalMult, discipleMult, leaveChance }
}

/**
 * 软上限（通用 idler 形状）：前 75% 原样给，剩下的渐近到 limit 但永远不到。
 *   softCap(x, L)：x ≤ 0.75L 时返回 x；否则 0.75L + 0.25L·(1 − 0.25L/(x − 0.5L))
 * 例：L = 2 时，x = 2 → 1.75，x = 10 → 1.97，x = ∞ → 2.00。
 * 入参可能是随永久货币增长的无界金额，全程在 Decimal 域计算，不先转 Number。
 */
export function softCap(x, limit) {
  const value = money(x)
  const cap = money(limit)
  const free = cap.times('0.75')
  const abs = value.abs()
  if (abs.lte(free)) return value
  const delta = cap.times('0.25')
  const over = abs.minus(free)
  const capped = free.plus(delta).minus(delta.times(delta).div(over.plus(delta)))
  return value.isNegative() ? capped.negated() : capped
}

/** 永久仙缘自身的乘区；不含本世研究提供的额外加成。预览与经济结算共用。 */
export function karmaMultipliers(amount) {
  const karma = moneyMax(ZERO, amount ?? ZERO)
  return {
    karmaMult: ONE.plus(softCap(karma.times(CONFIG.KARMA_BONUS_PER_POINT), CONFIG.KARMA_BONUS_CAP)),
    karmaStorageMult: ONE.plus(softCap(karma.times(CONFIG.KARMA_STORAGE_PER_POINT), CONFIG.KARMA_STORAGE_CAP)),
  }
}

export function createDerived() {
  return {
    max: {},
    rates: {},
    calendar: null,
    seasonRatio: {},
    sources: {},
    sourceFactor: {},
    expenseSources: {},
    /** 此刻正在跑的自动制作对材料的每秒消耗（res -> 出项条目）。不计入 expense —— tick 按 expense 结算，自动制作另按份实付，并进去会双扣 */
    autoCraftDrain: {},
    upgradeSupply: {},
    prodRaw: {},
    upkeep: ZERO,
    rawUpkeep: ZERO,
    /** 每名弟子每秒的口粮（已含境界倍率，未含减耗）——金额 */
    discipleUpkeep: ZERO,
    populationUpkeepMult: 1,
    discipleWeight: 0,
    discipleJobWeights: {},
    netQi: ZERO,
    habitability: CONFIG.HABITABILITY_BASE,
    habitabilityBonus: 0,
    housingHabitability: 0,
    habitabilityMult: 1,
    discipleMult: 1,
    leaveChance: 0,
    maxDisciples: 0,
    /** 综合产出倍率：含无界的仙缘/道果层，金额运算全程 Decimal */
    globalMult: ONE,
    realmMult: 1,
    realmBaseProductionMult: 1,
    karmaMult: ONE,
    /** 仙缘对有限资源容量的独立倍率 */
    karmaStorageMult: ONE,
    /** 道果带来的全局产出倍率（飞升层）：随道果数量增长，无上界 */
    daoMult: ONE,
    craftBonus: 0,
    craftSpeed: 1,
    autoCraftSpeeds: {},
    autoCraftSpeedUnlocked: false,
    craftBonusByResource: {},
    industrial: false,
    processingCapacity: {},
    processingCapacityRatio: {},
    processingPowerCapacity: 0,
    processingCoolingCapacity: 0,
    energyCraftUnlocked: false,
    craftSpeedByRecipe: {},
    craftCostReduction: {},
    disasterGuard: 0,
    disasterGuardByResource: {},
    ascendBonus: 0,
    consumeReduction: 0,
    arrivalBonus: 0,
    breakthroughDiscount: 0,
    /** 突破失败后身死概率减免（百分点），由香火线《愿力护道》等累加 */
    tribulationSafety: 0,
    offlineHours: CONFIG.OFFLINE_CAP_HOURS,
    autoCraftUnlocked: false,
    autoCondenseLiquidUnlocked: false,
    discipleTrainingUnlocked: false,
    autoTalentJobsUnlocked: false,
    recruitModeUnlocked: false,
    trainingActive: false,
    trainingCost: ZERO,
    daoAutomation: false,
    craftTargetsUnlocked: false,
    buildingSupply: {},
    unlockedBuildings: [],
    unlockedJobs: [],
    availableUpgrades: [],
    availableCrafts: [],
    ratio: {},
    jobRatio: {},
    ratioAll: 0,
    huntSuccessBonus: 0,
    huntYieldBonus: 0,
    huntCostReduction: 0,
  }
}

export function entryOf(state, id) {
  let e = state.buildings[id]
  if (!e) {
    e = { count: 0, on: true }
    state.buildings[id] = e
  }
  return e
}

export function countOf(state, id) {
  return state.buildings[id]?.count || 0
}

export function activeOf(state, id) {
  const e = state.buildings[id]
  if (!e || !e.count) return 0
  return e.on ? e.count : 0
}

/** 职位基础产出；副产出依赖启用中的专业设施。 */
export function jobOutputs(state, job, buildingSupply = {}) {
  const outputs = !job.building || activeOf(state, job.building) > 0 ? [{ resource: job.resource, base: job.base }] : []
  for (const output of job.additionalOutputs || []) {
    // 副产出可以由建筑开启，也可以由研究节点开启（例如矿工的玄铁挂在「探矿术」上）
    if (output.upgrade && !state.upgrades[output.upgrade]) continue
    if (!output.building || activeOf(state, output.building) > 0) outputs.push(output)
  }
  if (job.secondary) {
    const active = activeOf(state, job.secondary.building)
    const boost = BUILDING_MAP[job.secondary.building]?.boost
    const boostMult = boost && buildingBoostAvailable(state, job.secondary.building) && state.buildings[job.secondary.building].boost === true
      ? 1 + (boost.multiplier - 1) * (buildingSupply[boost.id] ?? 0) : 1
    if (active > 0) outputs.push({
      ...job.secondary,
      base: money(job.secondary.base).times(job.secondary.perBuilding ? active : 1).times(boostMult),
    })
  }
  return outputs
}

export function buildingBoostAvailable(state, id) {
  const boost = BUILDING_MAP[id]?.boost, entry = state.buildings[id]
  return !!boost && entry?.count > 0 && entry.on !== false && state.upgrades[boost.upgrade] === true
}

export function idleDisciples(state) {
  let assigned = 0
  for (const j of JOBS) assigned += state.disciples.jobs[j.id] || 0
  // 出征中的弟子既不在岗位，也不可被重新分配，不能算作闲置。
  let away = 0
  for (const member of state.disciples.members || []) if (member.onMission) away++
  return Math.max(0, state.disciples.total - assigned - away)
}

export function checkNeeds(state, needs) {
  if (!needs) return true
  if (needs.anyBuildings && !needs.anyBuildings.some(b => countOf(state, b.id) >= b.count)) return false
  if (needs.building && countOf(state, needs.building.id) < needs.building.count) return false
  if (needs.buildings) {
    for (const b of needs.buildings) {
      if (countOf(state, b.id) < b.count) return false
    }
  }
  if (needs.upgrade && !state.upgrades[needs.upgrade]) return false
  if (needs.upgrades) {
    for (const u of needs.upgrades) {
      if (!state.upgrades[u]) return false
    }
  }
  if (needs.realm != null && state.realm < needs.realm) return false
  return true
}

/**
 * 建筑是否露面（资源水位阈值 `unlockRatio: 0.3`）：
 *   1. 已经建过 → 一直显示；
 *   2. `needs` 条件满足；
 *   3. 每种花费资源的历史最高水位都达到基础成本的30%。
 * 用历史峰值而不是当前值，是为了避免「把资源花光后建筑又消失」导致列表跳动（§14.4）。
 */
export function isBuildingUnlocked(state, id) {
  const meta = BUILDING_MAP[id]
  if (!meta) return false
  // 关闭的可选模块：其建筑视同未解锁（含已建成的），不展示、不可购买
  if (!isEntryEnabled(state, meta)) return false
  if (countOf(state, id) > 0) return true
  if (!checkNeeds(state, meta.needs)) return false
  return isCostRevealed(state, meta.cost)
}

/** 所有费用资源均达到基础费用的展示水位；花费后沿用峰值，不让条目反复隐藏。 */
export function isCostRevealed(state, cost) {
  for (const res in cost || {}) {
    const seen = moneyMax(state.peak?.[res] ?? ZERO, state.resources[res] ?? ZERO)
    if (!atLeast(seen, money(cost[res]).times(CONFIG.BUILDING_UNLOCK_RATIO))) return false
  }
  return true
}

/** 把资源历史最高水位记下来（渐进露出用，只在 tick 里调） */
export function trackPeak(state) {
  if (!state.peak) state.peak = {}
  for (const res in state.resources) {
    const value = state.resources[res] ?? ZERO
    const peak = state.peak[res]
    if (peak === undefined || value.gt(peak)) state.peak[res] = value
  }
}

export function isJobUnlocked(state, job) {
  if (!isEntryEnabled(state, job)) return false
  if ((state.disciples.jobs[job.id] || 0) > 0) return true
  if (job.unlocked) return true
  return checkNeeds(state, job.needs)
}

export function isUpgradeUnlocked(state, up) {
  if (!isEntryEnabled(state, up)) return false
  if (state.upgrades[up.id]) return true
  return checkNeeds(state, up.needs)
}

/** 只预告当前分支的下一步，不在开局列出整棵研究和工艺树。 */
export function isProgressionVisible(state, needs, cost) {
  if (!isCostRevealed(state, cost)) return false
  if (!needs) return true
  if (needs.realm != null && state.realm < needs.realm) return false
  const upgrades = [...(needs.upgrades || []), ...(needs.upgrade ? [needs.upgrade] : [])]
  if (upgrades.some(id => !state.upgrades[id])) return false
  // 研究前置已掌握时可预告待建的专业建筑；基础技艺则先建立对应产业。
  if (upgrades.length) return true
  const buildings = [...(needs.buildings || []), ...(needs.building ? [needs.building] : [])]
  if (buildings.some(b => countOf(state, b.id) === 0)) return false
  if (needs.anyBuildings && !needs.anyBuildings.some(b => countOf(state, b.id) > 0)) return false
  return true
}

export function isCraftUnlocked(state, craft) {
  if (!isEntryEnabled(state, craft)) return false
  if (craft.unlocked) return true
  // 丹道改版前已开放九转炼丹的旧档，本世继续使用；仍需保有原法宝。
  if (craft.id === 'refineNineTurnPill' && state.legacyNineTurnPill === true && state.upgrades.alchemyCauldron) return true
  return checkNeeds(state, craft.needs)
}

export function canAfford(state, cost, times = 1) {
  for (const k in cost) {
    if (!atLeast(state.resources[k] ?? ZERO, money(cost[k]).times(times))) return false
  }
  return true
}

export function payCost(state, cost, times = 1) {
  trackPeak(state)
  for (const k in cost) {
    setResourceValue(state, k, moneyAvailable(state.resources[k] ?? ZERO, money(cost[k]).times(times)),
      () => ({ source: 'systems/core.js:payCost', requested: money(cost[k]).times(times).toString() }))
  }
}

/**
 * 入库：返回实际增加量（Decimal）。容量为 `MONEY_INFINITY` 时不设上限。
 * 降低仓储后保留旧库存（超过新上限时停止收入，消费仍正常）；小数完整保留。
 */
export function addResource(state, id, amount, capacity = MONEY_INFINITY) {
  const gain = money(amount)
  if (gain.isZero()) return ZERO
  const cap = money(capacity)
  const before = state.resources[id] ?? ZERO
  let next = before.plus(gain)
  if (id !== 'karma' && cap.isFinite()) {
    next = Dec.min(next, Dec.max(before, cap))
  }
  if (next.isNegative()) next = ZERO
  setResourceValue(state, id, next, () => ({ source: 'systems/core.js:addResource', requested: gain.toString(),
    capacity: cap.isFinite() ? cap.toString() : 'unlimited',
    netClipped: gain.gt(0) ? gain.minus(next.minus(before)).toString() : '0',
    roundingLoss: '0' }))
  if (next.gt(0)) state.seen[id] = true
  trackPeak(state)
  return next.minus(before)
}

/** 兼容旧接口名称：费用转换为 Decimal，小数原样保留。 */
export function roundCost(cost) {
  const out = {}
  for (const k in cost) {
    const value = money(cost[k])
    out[k] = value
  }
  return out
}

export function scaleCost(cost, factor) {
  const out = {}
  for (const k in cost) out[k] = money(cost[k]).times(factor)
  return roundCost(out)
}

/**
 * 购买第 n 座（从 0 开始计数）建筑的价格；指数涨价用 Decimal.pow，不先丢精度。
 * discount 是仙缘修持「道基共鸣」的造价折扣（0~1，取自 karmaShopBonuses），乘 (1−discount)；
 * 拆除退款等名义价场景不传折扣，保持原价（买入打折、退款不打折，往返净亏损，无套利）。
 */
export function buildingPriceAt(meta, index, discount = 0) {
  const factor = money(meta.priceRatio || 1.15).pow(index).times(ONE.minus(money(discount)))
  const cost = scaleCost(meta.cost, factor)
  return cost
}

/** 购买 count 座建筑从 from 开始的总价：逐座按精确报价求和。 */
export function buildingCostFrom(meta, from, count, discount = 0) {
  const total = {}
  for (let i = 0; i < count; i++) {
    const price = buildingPriceAt(meta, from + i, discount)
    for (const k in price) total[k] = (total[k] ?? ZERO).plus(price[k])
  }
  return total
}

export function buildingCost(state, id, count = 1) {
  const meta = BUILDING_MAP[id]
  if (!meta) return {}
  return buildingCostFrom(meta, countOf(state, id), count, karmaShopBonuses(state).buildingDiscount)
}

/** 在现有资源下最多能买几座（上限 cap 防止死循环） */
export function maxAffordable(state, id, cap = 500) {
  const meta = BUILDING_MAP[id]
  if (!meta) return 0
  const from = countOf(state, id)
  const discount = karmaShopBonuses(state).buildingDiscount
  const running = {}
  let n = 0
  for (; n < cap; n++) {
    const price = buildingPriceAt(meta, from + n, discount)
    let ok = true
    for (const k in price) {
      const have = state.resources[k] ?? ZERO
      const used = running[k] ?? ZERO
      if (!atLeast(have, used.plus(price[k]))) {
        ok = false
        break
      }
      running[k] = used.plus(price[k])
    }
    if (!ok) break
  }
  return n
}

/**
 * 由「已经过去的天数」算出历法：第几年、哪一季、哪个节气、第几天。
 * 纯函数，方便测试；recompute 与 tick 都用它。
 */
export function calendarAt(totalDays) {
  const rawDays = Math.max(0, totalDays || 0)
  // 逐秒累加 1/3 天可能落在 89.99999999999999，不能因此延迟换季。
  const nearestDay = Math.round(rawDays)
  const days = Math.abs(rawDays - nearestDay) < 1e-9 ? nearestDay : rawDays
  const dayInYear = days % DAYS_PER_YEAR
  const termIndex = Math.floor(dayInYear / CALENDAR.DAYS_PER_TERM) % TERMS.length
  const seasonIndex = Math.floor(dayInYear / DAYS_PER_SEASON) % SEASONS.length
  const dayInSeason = dayInYear % DAYS_PER_SEASON
  const dayInTerm = dayInYear % CALENDAR.DAYS_PER_TERM
  const season = SEASONS[seasonIndex]
  return {
    year: Math.floor(days / DAYS_PER_YEAR) + 1,
    day: Math.floor(dayInYear) + 1,
    dayInYear,
    seasonIndex,
    seasonName: season.name,
    seasonDesc: season.desc,
    seasonRatio: season.ratio || {},
    termIndex,
    termName: TERMS[termIndex],
    dayInTerm,
    dayInSeason,
    /** 当前节气还剩多少天 / 多少秒 */
    daysLeftInTerm: CALENDAR.DAYS_PER_TERM - dayInTerm,
    secondsLeftInTerm: (CALENDAR.DAYS_PER_TERM - dayInTerm) * CALENDAR.DAY_SECONDS,
    daysLeftInSeason: DAYS_PER_SEASON - dayInSeason,
    secondsLeftInSeason: (DAYS_PER_SEASON - dayInSeason) * CALENDAR.DAY_SECONDS,
  }
}

/** 弟子前来的间隔（秒）。默认自动模式下，有空房时每过这么久就来一名；主动礼聘模式另行处理。
 * 《广开山门》可以缩短这个间隔。
 */
export function arrivalInterval(derived) {
  const speedup = Math.min(0.8, derived.arrivalBonus || 0)
  return CONFIG.DISCIPLE_ARRIVAL_SECONDS * (1 - speedup)
}

/** 是否处于主动招募模式：需已解锁《招贤纳士》，避免转世清空研究后被动锁死。 */
export function isManualRecruit(state, derived) {
  return !!derived.recruitModeUnlocked && state.settings?.recruitMode === 'manual'
}

/** 距离下一名弟子的到来还有多少秒（没有空房、离开风险或已切到主动招募时返回 null） */
export function nextArrivalIn(state, derived) {
  if (state.challenge?.active) return null
  if (isManualRecruit(state, derived)) return null
  if (derived.leaveChance > 0 || state.disciples.total >= derived.maxDisciples) return null
  return Math.max(0, arrivalInterval(derived) - (state.arrivalTimer || 0))
}

/** 全部境界的当前花费（含折扣），供 UI 展示 */
export function realmCost(state, derived, index) {
  const meta = REALMS[index]
  if (!meta || !meta.cost) return null
  const factor = 1 - Math.min(0.9, derived.breakthroughDiscount || 0)
  return scaleCost(meta.cost, factor)
}

export function pushLog(state, text, kind = 'info', event = null) {
  state.logSeq = (state.logSeq || 0) + 1
  const entry = { id: state.logSeq, at: gameNow(state), text, kind }
  if (event) {
    entry.eventId = event.id
    entry.eventLevel = getEventLevel(event).id
  }
  state.log.unshift(entry)
  if (state.log.length > CONFIG.LOG_LIMIT) state.log.length = CONFIG.LOG_LIMIT
  return state.logSeq
}

/** 某条目的祭炼等级（非法宝恒为 0） */
export function treasureLevel(state, id) {
  return (state.treasureLevels && state.treasureLevels[id]) || 0
}

/** 法宝的效果倍率：每祭炼一级 +30%；修真与技艺恒为 1 */
export function treasureMult(state, entry) {
  if (!entry || entry.kind !== 'treasure') return 1
  return 1 + CONFIG.TREASURE_REFINE_STEP * treasureLevel(state, entry.id)
}

/** 这件法宝下一次祭炼要花多少（基础花费 × 1.7^当前等级） */
/**
 * 法宝祭炼的花费：**材料价 × 1.7^k + 灵机 × 1.7^k**。
 *
 * 技艺层的炼成花费里只有「打了三折的灵机」（手艺主要靠材料练，§12.12），
 * 而**祭炼仍然按原来的灵机量收**（`refine.insight`）—— 它本来就是「打坐参悟、把法宝温养出灵性」，
 * 也是后期灵机的主要去处。炼成价里那点灵机**不重复计入**祭炼，所以祭炼的灵机部分 =
 * `refine.insight × 1.7^k`，与 §12.6 那张累计表一致。
 */
export function refineCost(state, id) {
  const meta = UPGRADE_MAP[id]
  if (!meta || meta.kind !== 'treasure') return null
  const level = treasureLevel(state, id)
  const k = money(CONFIG.TREASURE_REFINE_RATIO).pow(level)
  const out = {}
  for (const res in meta.cost) {
    if (res === 'insight') continue // 炼成价里的灵机不参与祭炼，改用下面的 refine.insight
    out[res] = money(meta.cost[res]).times(k)
  }
  const insight = meta.refine?.insight || 0
  if (insight) out.insight = money(insight).times(k)
  const from = meta.refine?.materialFromLevel || 0
  if (level >= from) {
    const materialRatio = money(CONFIG.TREASURE_REFINE_RATIO).pow(level - from)
    for (const [res, amount] of Object.entries(meta.refine?.materials || {})) {
      out[res] = (out[res] ?? ZERO).plus(money(amount).times(materialRatio))
    }
  }
  return roundCost(out)
}

/** 已炼成、且还付得起下一次祭炼的法宝列表（界面用） */
export function isTreasureForged(state, id) {
  const meta = UPGRADE_MAP[id]
  return !!(meta && meta.kind === 'treasure' && state.upgrades[id])
}
