import { CONFIG } from '@/data/config'
import { RESOURCES, RESOURCE_MAP } from '@/data/resources'
import { BUILDINGS, BUILDING_MAP } from '@/data/buildings'
import { JOBS } from '@/data/jobs'
import { CULTIVATION, ALL_UPGRADES, UPGRADE_MAP } from '@/data/upgrades'
import { TECHNIQUES } from '@/data/techniques'
import { CRAFTS, CRAFT_MAP, craftTime } from '@/data/crafts'
import { ACHIEVEMENTS, ACHIEVEMENT_REWARD } from '@/data/achievements'
import { REALMS, ASCEND_REALM_INDEX } from '@/data/realms'
import { EVENTS } from '@/data/events'
import { CALENDAR, TERMS, SEASONS, DAYS_PER_SEASON, DAYS_PER_YEAR } from '@/data/calendar'

const EPS = 1e-9

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v
}

/** 派生数据的初始结构（不存档，每帧重算） */
export function createDerived() {
  return {
    max: {},
    rates: {},
    calendar: null,
    seasonRatio: {},
    sources: {},
    sourceFactor: {},
    expenseSources: {},
    prodRaw: {},
    upkeep: 0,
    rawUpkeep: 0,
    /** 每名弟子每秒的口粮（已含境界倍率，未含减耗） */
    discipleUpkeep: 0,
    netQi: 0,
    morale: 100,
    moraleBonus: 0,
    maxDisciples: 0,
    globalMult: 1,
    realmMult: 1,
    karmaMult: 1,
    craftBonus: 0,
    disasterGuard: 0,
    ascendBonus: 0,
    consumeReduction: 0,
    arrivalBonus: 0,
    breakthroughDiscount: 0,
    offlineHours: CONFIG.OFFLINE_CAP_HOURS,
    autoCraftUnlocked: false,
    unlockedBuildings: [],
    unlockedJobs: [],
    availableUpgrades: [],
    availableCrafts: [],
    ratio: {},
    jobRatio: {},
    ratioAll: 0,
  }
}

// ============================================================
// 基础读取
// ============================================================

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

export function idleDisciples(state) {
  let assigned = 0
  for (const j of JOBS) assigned += state.disciples.jobs[j.id] || 0
  return Math.max(0, state.disciples.total - assigned)
}

export function checkNeeds(state, needs) {
  if (!needs) return true
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
 * 建筑是否露面（对标猫国的 `unlockRatio: 0.3`）：
 *   1. 已经建过 → 一直显示；
 *   2. `needs` 条件满足；
 *   3. 花费「见到了」：每种花费资源的**历史最高水位**达到成本的 unlockRatio（默认 0.3）。
 * 用历史峰值而不是当前值，是为了避免「把资源花光后建筑又消失」导致列表跳动（§14.4）。
 */
export function isBuildingUnlocked(state, id) {
  const meta = BUILDING_MAP[id]
  if (!meta) return false
  if (countOf(state, id) > 0) return true
  if (!checkNeeds(state, meta.needs)) return false
  const ratio = meta.unlockRatio == null ? 0.3 : meta.unlockRatio
  if (ratio <= 0) return true
  for (const res in meta.cost || {}) {
    const seen = (state.peak && state.peak[res]) || 0
    if (seen < meta.cost[res] * ratio - 1e-9) return false
  }
  return true
}

/** 把资源历史最高水位记下来（渐进露出用，只在 tick 里调） */
export function trackPeak(state) {
  if (!state.peak) state.peak = {}
  for (const res in state.resources) {
    const v = state.resources[res] || 0
    if (v > (state.peak[res] || 0)) state.peak[res] = v
  }
}

export function isJobUnlocked(state, job) {
  if ((state.disciples.jobs[job.id] || 0) > 0) return true
  if (job.unlocked) return true
  return checkNeeds(state, job.needs)
}

export function isUpgradeUnlocked(state, up) {
  if (state.upgrades[up.id]) return true
  return checkNeeds(state, up.needs)
}

export function isCraftUnlocked(state, craft) {
  if (craft.unlocked) return true
  return checkNeeds(state, craft.needs)
}

// ============================================================
// 资源 / 花费
// ============================================================

export function canAfford(state, cost, times = 1) {
  for (const k in cost) {
    if ((state.resources[k] || 0) + EPS < cost[k] * times) return false
  }
  return true
}

export function payCost(state, cost, times = 1) {
  for (const k in cost) {
    state.resources[k] = Math.max(0, (state.resources[k] || 0) - cost[k] * times)
  }
}

export function addResource(state, id, amount) {
  if (!amount) return 0
  const meta = RESOURCE_MAP[id]
  const cap = meta && meta.baseMax === Infinity ? Infinity : amount + (state.resources[id] || 0)
  const before = state.resources[id] || 0
  let next = before + amount
  if (id !== 'karma' && state.__max && state.__max[id] != null) {
    next = Math.min(next, state.__max[id])
  }
  next = Math.max(0, next)
  // 整枚计数的资源（灵石/丹药/符箓/法器）不留小数：事件按百分比增减、旧存档都可能带小数
  if (meta?.integer) next = Math.floor(next + 1e-9)
  state.resources[id] = next
  if (next > 0) state.seen[id] = true
  return next - before
}

/**
 * 花费取整：**整枚计数的资源**（灵石 / 丹药 / 符箓 / 法器）向上取整。
 *
 * 涨价（×1.55^n）、破境折扣（×0.85）、法宝祭炼（×1.7^n）都会算出小数，
 * 而「半枚灵石」既没法付、也会让界面出现「现有 4 / 需要 4.0000001」这种
 * 看着够其实不够的死角。所以这类资源的价格一律向上取整：
 * 玩家看到的需求就是真正要凑齐的数目（§5.2）。
 */
export function roundCost(cost) {
  const out = {}
  for (const k in cost) {
    const v = cost[k]
    out[k] = RESOURCE_MAP[k]?.integer ? Math.ceil(v - 1e-9) : v
  }
  return out
}

export function scaleCost(cost, factor) {
  const out = {}
  for (const k in cost) out[k] = cost[k] * factor
  return roundCost(out)
}

/** 购买第 n 座（从 0 开始计数）建筑的价格 */
export function buildingPriceAt(meta, index) {
  const factor = Math.pow(meta.priceRatio || 1.15, index)
  return scaleCost(meta.cost, factor)
}

/** 购买 count 座建筑从 from 开始的总价 */
export function buildingCostFrom(meta, from, count) {
  const total = {}
  for (let i = 0; i < count; i++) {
    const price = buildingPriceAt(meta, from + i)
    for (const k in price) total[k] = (total[k] || 0) + price[k]
  }
  return total
}

export function buildingCost(state, id, count = 1) {
  const meta = BUILDING_MAP[id]
  if (!meta) return {}
  return buildingCostFrom(meta, countOf(state, id), count)
}

/** 在现有资源下最多能买几座（上限 cap 防止死循环） */
export function maxAffordable(state, id, cap = 500) {
  const meta = BUILDING_MAP[id]
  if (!meta) return 0
  const from = countOf(state, id)
  const running = {}
  let n = 0
  for (; n < cap; n++) {
    const price = buildingPriceAt(meta, from + n)
    let ok = true
    for (const k in price) {
      const have = state.resources[k] || 0
      const used = running[k] || 0
      if (have + EPS < used + price[k]) {
        ok = false
        break
      }
      running[k] = used + price[k]
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
  const days = Math.max(0, totalDays || 0)
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

/** 弟子前来的间隔（秒）。有空房时每过这么久就来一名，不用手动招募。
 * 《广开山门》可以缩短这个间隔。
 */export function arrivalInterval(derived) {
  const speedup = Math.min(0.8, derived.arrivalBonus || 0)
  return CONFIG.DISCIPLE_ARRIVAL_SECONDS * (1 - speedup)
}

/** 距离下一名弟子的到来还有多少秒（没有空房时返回 null） */
export function nextArrivalIn(state, derived) {
  if (state.disciples.total >= derived.maxDisciples) return null
  return Math.max(0, arrivalInterval(derived) - (state.arrivalTimer || 0))
}

/**
 * 还差多久才能凑够 need（秒）。返回 0 表示已经够了，Infinity 表示按当前进项永远凑不齐
 * （界面就不显示时间）。
 *
 * 两条路：
 *   1. 有产出的资源（灵气/灵木/玄铁/灵草/感悟/香火）按净额算；
 *   2. **没有产出、但有制作配方的成品**（灵石/丹药/符箓/法器）走「现印」那条路：
 *      先递归算凑齐配方材料要多久，再加上制作这些份数的耗时 ——
 *      只有该配方勾了「自动」才算制作时间，手动点「制作」是瞬发的。
 * 灵石尤其需要这条路：它没有产出，全靠凝气成石（灵气 45 → 1 枚），
 * 所以以前所有灵石花费都显示不出「还差多久」。
 */
export function timeToAfford(state, derived, resId, need, depth = 0) {
  const have = state.resources[resId] || 0
  if (have >= need) return 0
  const rate = resId === 'qi' ? derived.netQi : derived.rates[resId] || 0
  if (rate > 0) return (need - have) / rate
  if (depth >= 2) return Infinity // 防「配方互相喂」导致的死循环
  const recipe = CRAFTS.find((c) => c.out === resId && isCraftUnlocked(state, c) && !c.cost[resId])
  if (!recipe) return Infinity
  const per = recipe.amount || 1
  const copies = Math.ceil((need - have) / per)
  let wait = 0
  for (const res in recipe.cost) {
    if (res === resId) continue
    const sub = timeToAfford(state, derived, res, recipe.cost[res] * copies, depth + 1)
    if (!Number.isFinite(sub)) return Infinity
    if (sub > wait) wait = sub
  }
  if (isAutoCrafting(state, derived, recipe.id)) wait += copies * craftTime(recipe)
  return wait
}

/** 全部境界的当前花费（含折扣），供 UI 展示 */
export function realmCost(state, derived, index) {
  const meta = REALMS[index]
  if (!meta || !meta.cost) return null
  const factor = 1 - Math.min(0.9, derived.breakthroughDiscount || 0)
  return scaleCost(meta.cost, factor)
}

// ============================================================
// 派生数据重算
// ============================================================

function applyEffects(ef, mult, targets, src) {
  if (!ef) return
  const {
    max,
    prod,
    ratio,
    jobRatio,
    acc,
    bonus,
  } = targets
  /** 记账：把这一项的加成写进拆分表（供悬停提示逐项展示加成来源） */
  const note = (value) => {
    if (!src || !value) return
    bonus.ratioAll.push({
      kind: src.kind,
      id: src.id,
      label: src.label,
      count: src.count || 0,
      value,
    })
  }
  if (ef.storage) {
    for (const k in ef.storage) max[k] = (max[k] || 0) + ef.storage[k] * mult
  }
  if (ef.storageAll) {
    for (const r of RESOURCES) max[r.id] = (max[r.id] || 0) + ef.storageAll * mult
  }
  if (ef.maxDisciples) acc.maxDisciples += ef.maxDisciples * mult
  if (ef.morale) acc.moraleBonus += ef.morale * mult
  if (ef.consumeRatio) acc.consumeReduction += ef.consumeRatio * mult
  if (ef.craftBonus) acc.craftBonus += ef.craftBonus * mult
  if (ef.disasterGuard) acc.disasterGuard += ef.disasterGuard * mult
  if (ef.ascendBonus) acc.ascendBonus += ef.ascendBonus * mult
  if (ef.arrivalBonus) acc.arrivalBonus += ef.arrivalBonus * mult
  if (ef.breakthroughDiscount) acc.breakthroughDiscount += ef.breakthroughDiscount * mult
  if (ef.offlineHours) acc.offlineHours += ef.offlineHours * mult
  if (ef.karmaRatio) acc.karmaRatio += ef.karmaRatio * mult
  if (ef.autoCraft) acc.autoCraftUnlocked = true
  if (ef.prod) {
    for (const k in ef.prod) prod[k] = (prod[k] || 0) + ef.prod[k] * mult
  }
  if (ef.ratio) {
    for (const k in ef.ratio) {
      const value = ef.ratio[k] * mult
      ratio[k] = (ratio[k] || 0) + value
      if (src) {
        if (!bonus.ratio[k]) bonus.ratio[k] = []
        bonus.ratio[k].push({
          kind: src.kind,
          id: src.id,
          label: src.label,
          count: src.count || 0,
          value,
        })
      }
    }
  }
  if (ef.ratioAll) {
    const value = ef.ratioAll * mult
    acc.ratioAll += value
    note(value)
  }
  if (ef.jobRatio) {
    for (const k in ef.jobRatio) jobRatio[k] = (jobRatio[k] || 0) + ef.jobRatio[k] * mult
  }
}

/**
 * 重算所有派生数据：仓储上限、每秒产出、士气、解锁列表、价格折扣等。
 * 任何会改变数值的操作之后都应该调用一次。
 */
export function recompute(state, derived) {
  // 资源历史最高水位：建筑「渐进露出」用它判定，所以每次重算都刷新一遍
  trackPeak(state)
  const max = {}
  for (const r of RESOURCES) max[r.id] = r.baseMax
  const prod = {}
  const ratio = {}
  const jobRatio = {}
  // 进项来源明细：res -> [{ kind, id, label, count, raw }]
  const sources = {}
  // 维护费：res -> 每秒总消耗；expenseRaw 是逐条明细（弟子口粮稍后并进来）
  const maint = {}
  const expenseRaw = {}
  const addSource = (res, entry) => {
    if (!entry.raw) return
    if (!sources[res]) sources[res] = []
    sources[res].push(entry)
  }
  const acc = {
    // 开局没有任何居所 —— 弟子上限完全由建筑给（茅屋 +2 起）
    maxDisciples: 0,
    moraleBonus: 0,
    consumeReduction: 0,
    craftBonus: 0,
    disasterGuard: 0,
    ascendBonus: 0,
    arrivalBonus: 0,
    breakthroughDiscount: 0,
    offlineHours: CONFIG.OFFLINE_CAP_HOURS,
    karmaRatio: 0,
    autoCraftUnlocked: false,
    ratioAll: 0,
  }
  // bonus 是加成倍率的「逐项拆分账」：{ ratio: {res:[条目]}, ratioAll: [条目] }
  const bonus = { ratio: {}, ratioAll: [] }
  const targets = { max, prod, ratio, jobRatio, acc, bonus }

  // 建筑：仓储类按“已建成数量”，产出类按“启用中的数量”
  for (const meta of BUILDINGS) {
    const e = state.buildings[meta.id]
    if (!e || !e.count) continue
    const on = e.on ? e.count : 0
    const ef = meta.effects
    if (!ef) continue
    // 与数量无关的效果（缩放用 count），先把 storage 类用 count 单独处理。
    // 例外：**带维护费的建筑一切都按「启用数」算** —— 停用即停费，效果也得跟着停，
    // 否则「停用」会变成纯赚（保住效果还省下维护费）。
    const counted = !!meta.upkeep
    const countOnly = {}
    if (ef.storage) countOnly.storage = ef.storage
    if (ef.storageAll) countOnly.storageAll = ef.storageAll
    if (ef.maxDisciples) countOnly.maxDisciples = ef.maxDisciples
    if (ef.morale && !counted) countOnly.morale = ef.morale
    if (ef.disasterGuard && !counted) countOnly.disasterGuard = ef.disasterGuard
    if (ef.ascendBonus && !counted) countOnly.ascendBonus = ef.ascendBonus
    if (Object.keys(countOnly).length) applyEffects(countOnly, e.count, targets)
    const activeOnly = { ...ef }
    delete activeOnly.storage
    delete activeOnly.storageAll
    delete activeOnly.maxDisciples
    if (!counted) {
      delete activeOnly.morale
      delete activeOnly.disasterGuard
      delete activeOnly.ascendBonus
    }
    applyEffects(activeOnly, on, targets, { kind: 'building', id: meta.id, label: meta.name, count: on })
    if (ef.prod) {
      for (const k in ef.prod) {
        addSource(k, { kind: 'building', id: meta.id, label: meta.name, count: on, raw: ef.prod[k] * on })
      }
    }
    // 维护费：按“启用中的数量”消耗资源（停用即停费 —— 这是「停用」按钮唯一的存在理由）
    if (meta.upkeep && on > 0) {
      for (const k in meta.upkeep) {
        const amount = meta.upkeep[k] * on
        maint[k] = (maint[k] || 0) + amount
        if (!expenseRaw[k]) expenseRaw[k] = []
        expenseRaw[k].push({
          kind: 'upkeep',
          id: meta.id,
          label: meta.name,
          count: on,
          value: -amount,
        })
      }
    }
  }

  // 修真 / 技艺 / 法宝（法宝按祭炼等级放大效果）
  for (const up of ALL_UPGRADES) {
    if (!state.upgrades[up.id]) continue
    const mult = treasureMult(state, up)
    applyEffects(up.effects, mult, targets, { kind: 'upgrade', id: up.id, label: up.name, count: 1 })
    if (up.effects?.prod) {
      for (const k in up.effects.prod) {
        addSource(k, {
          kind: 'upgrade',
          id: up.id,
          label: up.name,
          count: 1,
          raw: up.effects.prod[k] * mult,
        })
      }
    }
  }

  // 成就：每条 +2% 全局
  const achCount = Object.keys(state.achievements).length
  acc.ratioAll += achCount * ACHIEVEMENT_REWARD
  if (achCount > 0) {
    bonus.ratioAll.push({
      kind: 'achievement',
      id: 'achievements',
      label: '成就',
      count: achCount,
      value: achCount * ACHIEVEMENT_REWARD,
    })
  }

  // 弟子职位产出
  for (const job of JOBS) {
    const n = state.disciples.jobs[job.id] || 0
    if (n > 0) {
      const raw = job.base * n * (1 + (jobRatio[job.id] || 0))
      prod[job.resource] = (prod[job.resource] || 0) + raw
      addSource(job.resource, { kind: 'job', id: job.id, label: job.name, count: n, raw })
    }
  }

  // 士气
  const morale = clamp(100 + acc.moraleBonus + state.moralePenalty, CONFIG.MORALE_MIN, CONFIG.MORALE_MAX)
  const moraleMult = morale / 100

  // 增益 / 减益（也记进拆分账，悬停提示要能逐项列出）
  let buffAll = 0
  const buffRes = {}
  const bonusBuffAll = []
  const bonusBuffRes = {}
  const now = Date.now()
  for (const b of state.buffs) {
    if ((b.until || 0) <= now) continue
    if (b.target) {
      buffRes[b.target] = (buffRes[b.target] || 0) + b.mult
      if (!bonusBuffRes[b.target]) bonusBuffRes[b.target] = []
      bonusBuffRes[b.target].push({ label: b.name || b.id, value: b.mult })
    } else {
      buffAll += b.mult
      bonusBuffAll.push({ label: b.name || b.id, value: b.mult })
    }
  }

  const realmMult = REALMS[state.realm]?.mult ?? 1
  const karmaMult = 1 + state.karma * (0.02 + acc.karmaRatio)
  const globalMult = realmMult * karmaMult * moraleMult * (1 + buffAll)

  // 历法：季节直接乘进对应资源的产出（与建筑 / 修真的 ratio 同一层）
  const calendar = calendarAt(state.totalDays)
  const seasonRatio = calendar.seasonRatio

  const rates = {}
  for (const r of RESOURCES) {
    if (r.noProduction) {
      rates[r.id] = 0
      continue
    }
    const base =
      (prod[r.id] || 0) *
      (1 + (ratio[r.id] || 0)) *
      (1 + acc.ratioAll) *
      (1 + (seasonRatio[r.id] || 0))
    rates[r.id] = base * globalMult * (1 + (buffRes[r.id] || 0))
  }

  /**
   * 弟子口粮：**随境界倍率一起上涨**（DISCIPLE_UPKEEP_REALM_EXP）。
   *
   * 产出被 realmMult 放大，口粮若保持常数，一名阵徒的「毛产出 ÷ 口粮」就会从
   * 凡体的 2.4:1 涨到渡劫期的 48:1 —— 弟子越到后期越接近免费，人口只剩盖房子一道闸门。
   * 指数取 1 时口粮与境界倍率同倍上涨，这个比值在任何境界都固定在 0.25/0.6 ≈ 42%。
   */
  const discipleUpkeep = CONFIG.DISCIPLE_UPKEEP * Math.pow(realmMult, CONFIG.DISCIPLE_UPKEEP_REALM_EXP)
  const rawUpkeep = state.disciples.total * discipleUpkeep
  const reduction = rawUpkeep * Math.min(0.85, acc.consumeReduction)
  const upkeep = rawUpkeep - reduction

  // 把来源折算成最终数值（所有来源共享同一组乘区，所以按比例缩放即可对上总额）
  const sourceFactor = {}
  const sourceList = {}
  for (const res in sources) {
    const raw = prod[res] || 0
    const factor = raw > 0 ? (rates[res] || 0) / raw : 0
    sourceFactor[res] = factor
    sourceList[res] = sources[res]
      .map((s) => ({ ...s, value: s.raw * factor }))
      .sort((a, b) => b.value - a.value)
  }
  // 出项明细：弟子口粮（灵气）+ 各建筑的维护费
  const expenseList = { ...expenseRaw }
  if (rawUpkeep > 0) {
    const items = expenseList.qi || []
    items.unshift({
      kind: 'upkeep',
      id: 'disciples',
      label: '弟子',
      count: state.disciples.total,
      value: -rawUpkeep,
    })
    if (reduction > 0) {
      items.splice(1, 0, {
        kind: 'reduce',
        id: 'consumeRatio',
        label: '减耗（锁灵阵等）',
        count: 0,
        value: reduction,
      })
    }
    expenseList.qi = items
  }
  // 逐资源的每秒出项总额（灵气 = 弟子口粮 + 维护费）
  const expense = {}
  for (const res in expenseList) {
    expense[res] = expenseList[res].reduce((s, x) => s + x.value, 0)
  }
  for (const res in maint) if (expense[res] === undefined) expense[res] = -maint[res]
  // 净额：产出 − 出项（界面左栏与状态行显示的都是它）
  const net = {}
  for (const r of RESOURCES) {
    const out = -(expense[r.id] || 0)
    net[r.id] = (rates[r.id] || 0) - out
  }

  derived.max = max
  state.__max = max // 供 addResource 使用（不参与存档序列化，仅内存）
  derived.rates = rates
  derived.calendar = calendar
  derived.seasonRatio = seasonRatio
  // 加成倍率的拆分账：悬停提示用它把 ×1.20 拆成「谁加了多少」
  derived.bonus = {
    ratio: bonus.ratio,
    ratioAll: bonus.ratioAll.slice().sort((a, b) => b.value - a.value),
    buffAll: bonusBuffAll,
    buffRes: bonusBuffRes,
    realmMult,
    karmaMult,
    moraleMult,
    buffAllTotal: buffAll,
    globalMult,
  }
  derived.sources = sourceList
  derived.sourceFactor = sourceFactor
  derived.expenseSources = expenseList
  derived.expense = expense
  derived.maintenance = maint
  derived.net = net
  derived.prodRaw = prod
  derived.upkeep = upkeep
  derived.rawUpkeep = rawUpkeep
  derived.discipleUpkeep = discipleUpkeep
  derived.netQi = net.qi
  derived.morale = morale
  derived.moraleBonus = acc.moraleBonus
  derived.maxDisciples = Math.floor(acc.maxDisciples)
  derived.globalMult = globalMult
  derived.realmMult = realmMult
  derived.karmaMult = karmaMult
  derived.ratioAll = acc.ratioAll
  derived.craftBonus = acc.craftBonus
  derived.disasterGuard = Math.min(0.8, acc.disasterGuard)
  derived.ascendBonus = acc.ascendBonus
  derived.consumeReduction = acc.consumeReduction
  derived.arrivalBonus = acc.arrivalBonus
  derived.breakthroughDiscount = acc.breakthroughDiscount
  derived.offlineHours = acc.offlineHours
  derived.autoCraftUnlocked = acc.autoCraftUnlocked
  derived.ratio = ratio
  derived.jobRatio = jobRatio

  // 解锁列表
  derived.unlockedBuildings = BUILDINGS.filter((b) => isBuildingUnlocked(state, b.id)).map((b) => b.id)
  derived.unlockedJobs = JOBS.filter((j) => isJobUnlocked(state, j)).map((j) => j.id)
  derived.availableUpgrades = ALL_UPGRADES.filter(
    (u) => !state.upgrades[u.id] && isUpgradeUnlocked(state, u),
  ).map((u) => u.id)
  derived.availableCrafts = CRAFTS.filter((c) => isCraftUnlocked(state, c)).map((c) => c.id)
  return derived
}

// ============================================================
// 日志
// ============================================================

export function pushLog(state, text, kind = 'info') {
  state.logSeq = (state.logSeq || 0) + 1
  state.log.unshift({ id: state.logSeq, at: Date.now(), text, kind })
  if (state.log.length > CONFIG.LOG_LIMIT) state.log.length = CONFIG.LOG_LIMIT
  return state.logSeq
}

// ============================================================
// 操作：建筑 / 弟子 / 修真 / 技艺 / 制作 / 境界
// ============================================================

export function buyBuilding(state, derived, id, count = 1) {
  const meta = BUILDING_MAP[id]
  if (!meta || count <= 0) return 0
  // 注意：这里只判硬条件（needs）。「资源水位到 30% 才露面」是显示层的规则，
  // 不该拦住已经看得到的建造请求（猫国的 unlockRatio 同样只管显示）。
  if (!checkNeeds(state, meta.needs)) return 0
  const cost = buildingCost(state, id, count)
  if (!canAfford(state, cost)) return 0
  payCost(state, cost)
  const e = entryOf(state, id)
  e.count += count
  if (e.on === undefined) e.on = true
  state.stats.buildingsBuilt += count
  pushLog(state, `建成 ${meta.name} ×${count}（现有 ${e.count}）`, 'good')
  recompute(state, derived)
  return count
}

/** 拆除建筑，返还最后一次造价的 50% */
export function sellBuilding(state, derived, id, count = 1) {
  const meta = BUILDING_MAP[id]
  const e = state.buildings[id]
  if (!meta || !e || e.count <= 0) return 0
  const n = Math.min(count, e.count)
  const refund = buildingCostFrom(meta, e.count - n, n)
  for (const k in refund) {
    // 返还一半；整枚计数的资源（灵石/丹药/符箓/法器）向下取整，免得返还出「半枚」
    refund[k] = RESOURCE_MAP[k]?.integer ? Math.floor(refund[k] * 0.5 + 1e-9) : refund[k] * 0.5
  }
  e.count -= n
  state.stats.buildingsBuilt = Math.max(0, state.stats.buildingsBuilt - n)
  for (const k in refund) {
    const before = state.resources[k] || 0
    const cap = derived.max[k] ?? Infinity
    state.resources[k] = Math.min(before + refund[k], cap)
  }
  pushLog(state, `拆除 ${meta.name} ×${n}，返还部分材料`, 'info')
  recompute(state, derived)
  return n
}

export function toggleBuilding(state, derived, id) {
  const meta = BUILDING_MAP[id]
  // 只有「维持它自己要吃资源」的建筑才能停用：停用即停费，这才是一个真选择。
  // 纯产出/仓储/减耗类建筑没有运行成本，停掉只会白亏，所以不给按钮也不允许停。
  if (!meta || !meta.upkeep) return null
  const e = entryOf(state, id)
  e.on = !e.on
  pushLog(state, `${meta.name} 已${e.on ? '启用' : '停用'}`, 'info')
  recompute(state, derived)
  return e.on
}

export function setJob(state, derived, jobId, value) {
  const job = JOBS.find((j) => j.id === jobId)
  if (!job || !isJobUnlocked(state, job)) return
  const jobs = state.disciples.jobs
  const current = jobs[jobId] || 0
  let target = Math.max(0, Math.floor(value))
  const others = JOBS.reduce((sum, j) => (j.id === jobId ? sum : sum + (jobs[j.id] || 0)), 0)
  const free = state.disciples.total - others
  target = Math.min(target, free)
  jobs[jobId] = target
  if (target !== current) {
    pushLog(state, `${job.name} 人数调整为 ${target}`, 'info')
  }
  recompute(state, derived)
}

export function shiftJob(state, derived, jobId, delta) {
  const current = state.disciples.jobs[jobId] || 0
  setJob(state, derived, jobId, current + delta)
}

/** 一键把闲散弟子填进某个职位 */
export function fillJob(state, derived, jobId) {
  const idle = idleDisciples(state)
  if (idle <= 0) return
  setJob(state, derived, jobId, (state.disciples.jobs[jobId] || 0) + idle)
}

/**
 * 弟子自动前来：有空房就会陆续来人，不需要手动招募。
 * 每 arrivalInterval(derived) 秒来一名；住满则清零计时，扩建后重新开始算。
 * 离线推演时只计数不写日志，由 simulateOffline 汇总一条。
 * @returns {number} 本次来了几名
 */
export function recruitArrivals(state, derived, dt, { silent = false } = {}) {
  if (dt <= 0) return 0
  if (state.disciples.total >= derived.maxDisciples) {
    state.arrivalTimer = 0
    return 0
  }
  state.arrivalTimer = (state.arrivalTimer || 0) + dt
  const interval = arrivalInterval(derived)
  let arrived = 0
  while (state.arrivalTimer >= interval && state.disciples.total < derived.maxDisciples) {
    state.arrivalTimer -= interval
    state.disciples.total += 1
    state.stats.recruits += 1
    arrived += 1
  }
  if (arrived > 0) {
    if (!silent) {
      pushLog(state, `一名弟子慕名而来（门中现有 ${state.disciples.total} 人）`, 'good')
    }
    recompute(state, derived)
  }
  // 住满了就把计时清零：扩建之后重新开始算，不会立刻蹦出一个人
  if (state.disciples.total >= derived.maxDisciples) state.arrivalTimer = 0
  return arrived
}

export function research(state, derived, id) {
  const up = UPGRADE_MAP[id]
  if (!up || state.upgrades[id] || !isUpgradeUnlocked(state, up)) return false
  if (!canAfford(state, up.cost)) {
    pushLog(state, `推演《${up.name}》的材料不足。`, 'bad')
    return false
  }
  payCost(state, up.cost)
  state.upgrades[id] = true
  pushLog(state, `参悟《${up.name}》`, 'good')
  recompute(state, derived)
  return true
}

/** 做一份（内部用：不改 derived、不写日志），返回实际得到几个 */
function craftUnit(state, derived, recipe) {
  if (!canAfford(state, recipe.cost)) return 0
  const cap = derived.max[recipe.out]
  if ((state.resources[recipe.out] || 0) >= cap - EPS) return 0
  payCost(state, recipe.cost)
  return addCraftGain(state, derived, recipe, recipe.amount * (1 + derived.craftBonus))
}

/** 按当前材料与仓储余量，这个配方最多还能做几份 */
export function maxCraftable(state, derived, recipeId) {
  const recipe = CRAFT_MAP[recipeId]
  if (!recipe || !isCraftUnlocked(state, recipe)) return 0
  let byMaterial = Infinity
  for (const res in recipe.cost) {
    byMaterial = Math.min(byMaterial, Math.floor((state.resources[res] || 0) / recipe.cost[res]))
  }
  if (!Number.isFinite(byMaterial)) byMaterial = 0
  const room = Math.floor(
    (derived.max[recipe.out] - (state.resources[recipe.out] || 0)) / recipe.amount,
  )
  return Math.max(0, Math.min(byMaterial, room))
}

/**
 * 按比例做一批：把「当前材料能做出来的份数」取 frac 份，一次性做掉。
 * 界面上的「¼料 / ½料 / 全部」就是它（全部 = frac 1）。
 */
export function craftBatch(state, derived, recipeId, frac = 1) {
  const n = Math.floor(maxCraftable(state, derived, recipeId) * frac + EPS)
  if (n <= 0) return 0
  return craft(state, derived, recipeId, { times: n })
}

/** 把一次制作的产出累进 craftProgress，返回这次凑出的整数产出 */
function addCraftGain(state, derived, recipe, gain) {
  const acc = (state.craftProgress[recipe.id] || 0) + gain
  const whole = Math.floor(acc + EPS)
  state.craftProgress[recipe.id] = acc - whole
  if (whole > 0) {
    addResource(state, recipe.out, whole)
    state.stats.crafted[recipe.out] = (state.stats.crafted[recipe.out] || 0) + whole
  }
  state.stats.craftCount = (state.stats.craftCount || 0) + 1
  return whole
}

/** 这个配方现在是否在自动制作（常驻：每 time 秒一份） */
export function isAutoCrafting(state, derived, recipeId) {
  return !!(
    derived.autoCraftUnlocked &&
    state.settings.autoCraftOn &&
    state.autoCraft[recipeId]
  )
}

/**
 * 自动制作的进度与余量（界面用）：
 *   on      是否在自动做
 *   step    单件耗时（秒）
 *   wait    距离下一件还有多少秒
 *   made    本轮已经做了几份
 *   canMake 按当前材料与仓储余量还能做几份
 */
export function autoCraftStatus(state, derived, recipeId) {
  const recipe = CRAFT_MAP[recipeId]
  const timer = (state.craftTimers && state.craftTimers[recipeId]) || null
  const step = craftTime(recipe)
  const out = {
    on: isAutoCrafting(state, derived, recipeId),
    step,
    wait: 0,
    made: (timer && timer.made) || 0,
    canMake: 0,
  }
  if (!recipe) return out
  if (out.on) out.wait = Math.max(0, step - ((timer && timer.t) || 0))
  out.canMake = maxCraftable(state, derived, recipeId)
  return out
}

/**
 * 推进自动制作：每个勾了「自动」的配方，每 time 秒一份，材料或仓储不够就停在那儿等
 * （不会取消勾选 —— 材料一恢复就接着做）。
 * 离线也照做：自动制作就是「挂着也一直在做」。
 */
export function runAutoCraft(state, derived, dt) {
  if (!state.craftTimers) state.craftTimers = {}
  let made = false
  for (const recipe of CRAFTS) {
    if (!isAutoCrafting(state, derived, recipe.id)) continue
    const step = craftTime(recipe)
    const timer = state.craftTimers[recipe.id] || { t: 0, made: 0 }
    timer.t = (timer.t || 0) + dt
    while (timer.t >= step) {
      const full = (state.resources[recipe.out] || 0) >= derived.max[recipe.out] - EPS
      if (!canAfford(state, recipe.cost) || full) {
        // 材料/仓储不够：最多攒一份，材料一恢复就接着做，但不会攒成一波爆发
        timer.t = Math.min(timer.t, step)
        break
      }
      craftUnit(state, derived, recipe)
      timer.made = (timer.made || 0) + 1
      timer.t -= step
      made = true
    }
    state.craftTimers[recipe.id] = timer
  }
  return made
}

/**
 * 手动「吸取天地灵气」：开局什么都没有时唯一的灵气来源。
 * 每次点击 +CLICK_QI_BASE，每座聚灵阵再 +CLICK_QI_PER_FIELD（后期点着也不至于像挠痒）。
 */
export function clickGain(state, derived) {
  void derived
  const fields = countOf(state, 'spiritField')
  return CONFIG.CLICK_QI_BASE + CONFIG.CLICK_QI_PER_FIELD * fields
}

/** 执行一次「吸取天地灵气」，返回这次吸到多少 */
export function drawQi(state, derived) {
  const gain = clickGain(state, derived)
  addResource(state, 'qi', gain)
  state.stats.clicks = (state.stats.clicks || 0) + 1
  return gain
}

export function craft(state, derived, recipeId, { silent = false, times = 1 } = {}) {
  const recipe = CRAFTS.find((c) => c.id === recipeId)
  if (!recipe || !isCraftUnlocked(state, recipe)) return 0
  let made = 0
  const count = Math.max(0, Math.floor(times + EPS))
  for (let i = 0; i < count; i++) {
    if (!canAfford(state, recipe.cost)) break
    const cap = derived.max[recipe.out]
    if ((state.resources[recipe.out] || 0) >= cap - EPS) break
    made += craftUnit(state, derived, recipe)
  }
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
 * 法宝祭炼的花费：**材料价 × 1.7^k + 感悟 × 1.7^k**。
 *
 * 技艺层的炼成花费里只有「打了三折的感悟」（手艺主要靠材料练，§12.12），
 * 而**祭炼仍然按原来的感悟量收**（`refine.insight`）—— 它本来就是「打坐参悟、把法宝温养出灵性」，
 * 也是后期感悟的主要去处。炼成价里那点感悟**不重复计入**祭炼，所以祭炼的感悟部分 =
 * `refine.insight × 1.7^k`，与 §12.6 那张累计表一致。
 */
export function refineCost(state, id) {
  const meta = UPGRADE_MAP[id]
  if (!meta || meta.kind !== 'treasure') return null
  const k = Math.pow(CONFIG.TREASURE_REFINE_RATIO, treasureLevel(state, id))
  const out = {}
  for (const res in meta.cost) {
    if (res === 'insight') continue // 炼成价里的感悟不参与祭炼，改用下面的 refine.insight
    out[res] = meta.cost[res] * k
  }
  const insight = meta.refine?.insight || 0
  if (insight) out.insight = insight * k
  return roundCost(out)
}

/** 已炼成、且还付得起下一次祭炼的法宝列表（界面用） */
export function isTreasureForged(state, id) {
  const meta = UPGRADE_MAP[id]
  return !!(meta && meta.kind === 'treasure' && state.upgrades[id])
}

/** 祭炼一次：付钱、等级 +1、重算 */
export function refineTreasure(state, derived, id) {
  if (!isTreasureForged(state, id)) return 0
  const cost = refineCost(state, id)
  if (!cost || !canAfford(state, cost)) return 0
  payCost(state, cost)
  if (!state.treasureLevels) state.treasureLevels = {}
  state.treasureLevels[id] = treasureLevel(state, id) + 1
  recompute(state, derived)
  pushLog(
    state,
    `${UPGRADE_MAP[id].name} 祭炼至 ${state.treasureLevels[id]} 级（效果 ×${treasureMult(state, UPGRADE_MAP[id]).toFixed(2)}）`,
    'good',
  )
  return state.treasureLevels[id]
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

export function breakthrough(state, derived) {
  const next = REALMS[state.realm + 1]
  if (!next) return false
  const cost = realmCost(state, derived, state.realm + 1)
  if (!canAfford(state, cost)) {
    pushLog(state, '破境所需资源不足，强冲只会伤及道基。', 'bad')
    return false
  }
  payCost(state, cost)
  state.realm += 1
  state.stats.bestRealm = Math.max(state.stats.bestRealm, state.realm)
  pushLog(state, `天地异象，成功突破至【${next.name}】`, 'realm')
  recompute(state, derived)
  return true
}

export function canAscend(state) {
  return state.realm >= ASCEND_REALM_INDEX
}

export function ascensionGain(state, derived) {
  const insight = Math.max(0, state.stats.lifeInsight || 0)
  const base = Math.sqrt(insight / 2000)
  const realmFactor = 1 + state.realm * 0.3
  const gain = base * realmFactor * (1 + derived.ascendBonus)
  return Math.max(canAscend(state) ? 1 : 0, Math.floor(gain))
}

// ============================================================
// 随机事件
// ============================================================

function pickEvent(state) {
  const pool = EVENTS.filter((e) => (e.minRealm || 0) <= state.realm)
  if (!pool.length) return null
  const total = pool.reduce((s, e) => s + e.weight, 0)
  let roll = Math.random() * total
  for (const e of pool) {
    roll -= e.weight
    if (roll <= 0) return e
  }
  return pool[pool.length - 1]
}

export function fireEvent(state, derived, ev = null) {
  const event = ev || pickEvent(state)
  if (!event) return null
  state.stats.eventsSeen = (state.stats.eventsSeen || 0) + 1

  if (event.buff) {
    const b = event.buff
    const until = Date.now() + (b.duration || 60) * 1000
    const existing = state.buffs.find((x) => x.id === b.id)
    if (existing) {
      existing.until = until
      existing.mult = b.mult
    } else {
      state.buffs.push({ id: b.id, name: b.name || event.name, mult: b.mult, target: b.target || null, until })
    }
  }

  if (event.lootRate) {
    const parts = []
    for (const res in event.lootRate) {
      const floor = (event.floor && event.floor[res]) || 0
      const rate = derived.rates[res] || 0
      const gain = Math.max(floor, rate * event.lootRate[res])
      const real = addResource(state, res, gain)
      if (real > 0) parts.push(`${RESOURCE_MAP[res].name} +${Math.round(real)}`)
    }
    if (parts.length) pushLog(state, `${event.text}（${parts.join('，')}）`, event.kind)
    else pushLog(state, event.text, event.kind)
  } else if (event.disaster) {
    const lossPct = event.disaster.lossPercent
    const pct = lossPct[0] + Math.random() * (lossPct[1] - lossPct[0])
    const guard = derived.disasterGuard || 0
    const parts = []
    let total = 0
    for (const res of event.disaster.resources) {
      const have = state.resources[res] || 0
      // 整枚计数的资源（灵石/丹药/符箓/法器）按整数扣，别扣出「半枚」
      const lost = RESOURCE_MAP[res]?.integer
        ? Math.floor(have * pct * (1 - guard) + 1e-9)
        : have * pct * (1 - guard)
      if (lost > (RESOURCE_MAP[res]?.integer ? 0 : 0.5)) {
        state.resources[res] = have - lost
        total += lost
        parts.push(`${RESOURCE_MAP[res].name} -${Math.round(lost)}`)
      }
    }
    state.stats.disasters += 1
    const suffix = parts.length ? `（${parts.join('，')}）` : '（库中空空，妖兽愤而离去）'
    pushLog(
      state,
      `${event.text}${suffix}${guard > 0 ? `【大阵挡下 ${Math.round(guard * 100)}%】` : ''}`,
      event.kind,
    )
  } else {
    pushLog(state, event.text, event.kind)
  }

  if (event.recruit) {
    const room = derived.maxDisciples - state.disciples.total
    if (room > 0) {
      const n = Math.min(room, event.recruit)
      state.disciples.total += n
      state.stats.recruits += n
      pushLog(state, `弟子 +${n}`, 'good')
    }
  }

  state.nextEventAt =
    Date.now() +
    (CONFIG.EVENT_MIN_GAP + Math.random() * (CONFIG.EVENT_MAX_GAP - CONFIG.EVENT_MIN_GAP)) * 1000
  return event
}

// ============================================================
// 主循环
// ============================================================

export function checkAchievements(state, derived) {
  const newly = []
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id]) continue
    let ok = false
    try {
      ok = !!a.check(state)
    } catch (err) {
      ok = false
    }
    if (ok) {
      state.achievements[a.id] = true
      newly.push(a)
    }
  }
  if (newly.length) {
    for (const a of newly) pushLog(state, `达成成就【${a.name}】：${a.desc}`, 'event')
    recompute(state, derived)
  }
  return newly
}

let achievementTimer = 0
let leaveTimer = 0

/**
 * 推进游戏时间。
 * @param {number} dt 经过的秒数
 * @param {{offline?: boolean, events?: boolean}} opts
 */
export function tick(state, derived, dt, opts = {}) {
  if (dt <= 0) return
  const { offline = false, events = true } = opts
  const cap = dt > 60 ? 60 : dt

  // 1) 资源结算（灵气先算净产出）
  for (const r of RESOURCES) {
    if (r.noProduction) continue
    let rate = derived.rates[r.id] || 0
    // 出项：弟子的灵气口粮 + 带维护费建筑的持续消耗（停用即停费）
    if (derived.expense?.[r.id]) rate += derived.expense[r.id] // expense 里是负数
    if (rate === 0) continue
    const before = state.resources[r.id] || 0
    let next = before + rate * cap
    const max = derived.max[r.id]
    if (next > max) next = max
    if (next < 0) next = 0
    state.resources[r.id] = next
    if (next > 0) state.seen[r.id] = true
    const gained = next - before
    if (r.id === 'qi' && gained > 0) state.stats.totalQi += gained
    if (r.id === 'insight' && gained > 0) {
      state.stats.totalInsight += gained
      state.stats.lifeInsight = (state.stats.lifeInsight || 0) + gained
    }
    if (r.id === 'faith' && gained > 0) state.stats.totalFaith += gained
  }

  // 2) 士气：灵气断供则下滑，供应正常则回升
  const starving = (state.resources.qi || 0) <= 1 && derived.netQi < 0
  if (starving) {
    state.moralePenalty = clamp(
      state.moralePenalty - CONFIG.MORALE_STARVE_RATE * cap,
      -60,
      0,
    )
  } else {
    state.moralePenalty = clamp(
      state.moralePenalty + CONFIG.MORALE_RECOVER_RATE * cap,
      -60,
      0,
    )
  }

  // 3) 士气过低会走人
  if (derived.morale < 45 && state.disciples.total > 0) {
    leaveTimer += cap
    if (leaveTimer >= CONFIG.LEAVE_INTERVAL) {
      leaveTimer = 0
      const jobs = state.disciples.jobs
      const jobId = JOBS.map((j) => j.id).find((id) => (jobs[id] || 0) > 0)
      if (jobId) jobs[jobId] -= 1
      state.disciples.total -= 1
      pushLog(state, `士气低落，一名弟子收拾行囊下山了。`, 'bad')
      recompute(state, derived)
    }
  } else {
    leaveTimer = 0
  }

  // 4) 增益到期
  const now = Date.now()
  if (state.buffs.some((b) => (b.until || 0) <= now)) {
    state.buffs = state.buffs.filter((b) => (b.until || 0) > now)
    recompute(state, derived)
  }

  // 5) 自动制作：勾了「自动」的配方每 time 秒一份，离线也照做（挂着就一直做）
  if (runAutoCraft(state, derived, cap)) recompute(state, derived)

  // 6) 历法推进：天数累加
  //    一天 3 秒（见 CALENDAR.DAY_SECONDS），所以 1 节气只有 45 秒 —— 节气变化**不写纪事**
  //    （不然纪事会被历法刷满），它只在右栏历法面板/状态行里滚动；只有「入季」和「跨年」值得进纪事。
  const calBefore = calendarAt(state.totalDays)
  state.totalDays = (state.totalDays || 0) + cap / CALENDAR.DAY_SECONDS
  const cal = calendarAt(state.totalDays)
  if (cal.termIndex !== calBefore.termIndex) {
    if (!offline && cal.seasonIndex !== calBefore.seasonIndex) {
      pushLog(
        state,
        `入${cal.seasonName}：${cal.seasonDesc}（${seasonEffectText(cal.seasonRatio)}）`,
        'event',
      )
    }
    recompute(state, derived)
  }

  // 7) 弟子自动前来（有空房就来人，不用手动招募）
  recruitArrivals(state, derived, cap, { silent: offline })

  // 8) 成就
  achievementTimer += cap
  if (achievementTimer >= 0.5) {
    achievementTimer = 0
    checkAchievements(state, derived)
  }

  // 9) 统计
  state.stats.playTime += cap

  // 10) 随机事件
  if (events && !offline && now >= (state.nextEventAt || 0)) {
    fireEvent(state, derived)
  }
}

/** 把季节影响写成人话（纪事里用） */
function seasonEffectText(ratio) {
  const parts = Object.entries(ratio || {}).map(([res, v]) => {
    const name = RESOURCE_MAP[res]?.name || res
    return `${name} ${v > 0 ? '+' : ''}${Math.round(v * 100)}%`
  })
  return parts.length ? parts.join('、') : '无影响'
}

/** 离线结算：把离线时间切成 1 秒一段推进，避免公式失真 */
export function simulateOffline(state, derived, seconds, opts = {}) {
  const cap = Math.max(0, Math.floor(seconds))
  if (cap <= 0) return { seconds: 0, gains: {}, disciples: 0 }
  const before = { ...state.resources }
  const disciplesBefore = state.disciples.total
  const step = 1
  let left = cap
  while (left > 0) {
    const dt = Math.min(step, left)
    tick(state, derived, dt, { offline: true, events: false })
    left -= dt
  }
  const gains = {}
  for (const r of RESOURCES) {
    const diff = (state.resources[r.id] || 0) - (before[r.id] || 0)
    if (diff > 0.01) gains[r.id] = diff
  }
  return { seconds: cap, gains, disciples: state.disciples.total - disciplesBefore }
}

export {
  BUILDINGS,
  BUILDING_MAP,
  JOBS,
  CULTIVATION,
  TECHNIQUES,
  ALL_UPGRADES,
  UPGRADE_MAP,
  CRAFTS,
  CRAFT_MAP,
  craftTime,
  REALMS,
  RESOURCES,
  RESOURCE_MAP,
}
