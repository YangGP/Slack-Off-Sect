import { RESOURCES } from '@/data/resources'
import { CONFIG } from '@/data/config'
import { BUILDINGS, BUILDING_MAP } from '@/data/buildings'
import { ALL_UPGRADES } from '@/data/upgrades'
import { treasureMult, habitabilityEffects, jobOutputs, softCap, calendarAt, isBuildingUnlocked, isJobUnlocked, isUpgradeUnlocked, isCraftUnlocked } from './core'
import { ACHIEVEMENT_REWARD } from '@/data/achievements'
import { JOBS } from '@/data/jobs'
import { gameNow } from '../context'
import { REALMS } from '@/data/realms'
import { floorNumber } from '../numbers'
import { PROCESSING_STATIONS } from '@/data/industry'
import { CRAFTS } from '@/data/crafts'
import { computeAutoCraftDrain } from './craftingRules'
import { discipleFactor, discipleTrainingCost } from '@/data/disciples'
import { talentBonus } from '@/data/talents'

export function applyEffects(ef, mult, targets, src) {
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
  // 比例加仓：这里只累计百分比，等所有定额加仓都算完、在 recompute 收尾处统一放大。
  // 若不这样分两步，上限会随"效果遍历顺序"变化（先加的定额被放大、后加的不被放大）。
  if (ef.storageRatio) {
    if (!acc.storageRatio) acc.storageRatio = {}
    for (const k in ef.storageRatio) acc.storageRatio[k] = (acc.storageRatio[k] || 0) + ef.storageRatio[k] * mult
  }
  if (ef.storageAll) {
    for (const r of RESOURCES) max[r.id] = (max[r.id] || 0) + ef.storageAll * mult * (r.storageWeight ?? 1)
  }
  if (ef.maxDisciples) acc.maxDisciples += ef.maxDisciples * mult
  if (ef.habitability) acc.habitabilityBonus += ef.habitability * mult
  if (ef.habitabilityPerHousing) acc.habitabilityPerHousing += ef.habitabilityPerHousing * mult
  if (ef.consumeRatio) acc.consumeReduction += ef.consumeRatio * mult
  if (ef.craftBonus) acc.craftBonus += ef.craftBonus * mult
  if (ef.craftBonusByResource) {
    for (const [res, value] of Object.entries(ef.craftBonusByResource)) {
      acc.craftBonusByResource[res] = (acc.craftBonusByResource[res] || 0) + value * mult
    }
  }
  for (const field of ['processingCapacityRatio', 'craftSpeedByRecipe', 'craftCostReduction']) {
    if (!ef[field]) continue
    acc[field] ||= {}
    for (const [id, value] of Object.entries(ef[field])) acc[field][id] = (acc[field][id] || 0) + value * mult
  }
  if (ef.disasterGuard) acc.disasterGuard += ef.disasterGuard * mult
  if (ef.disasterGuardByResource) {
    for (const [res, value] of Object.entries(ef.disasterGuardByResource)) {
      acc.disasterGuardByResource[res] = (acc.disasterGuardByResource[res] || 0) + value * mult
    }
  }
  if (ef.ascendBonus) acc.ascendBonus += ef.ascendBonus * mult
  if (ef.arrivalBonus) acc.arrivalBonus += ef.arrivalBonus * mult
  if (ef.breakthroughDiscount) acc.breakthroughDiscount += ef.breakthroughDiscount * mult
  if (ef.offlineHours) acc.offlineHours += ef.offlineHours * mult
  if (ef.karmaRatio) acc.karmaRatio += ef.karmaRatio * mult
  if (ef.autoCraft) acc.autoCraftUnlocked = true
  if (ef.autoCraftSpeedControl) acc.autoCraftSpeedUnlocked = true
  if (ef.autoCondenseLiquid) acc.autoCondenseLiquidUnlocked = true
  if (ef.energyCraft) acc.energyCraftUnlocked = true
  if (ef.discipleTraining) acc.discipleTrainingUnlocked = true
  for (const field of ['processingPowerCapacity', 'processingCoolingRatio']) {
    if (ef[field]) acc[field] = (acc[field] || 0) + ef[field] * mult
  }
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
  if (ef.huntSuccessBonus) acc.huntSuccessBonus += ef.huntSuccessBonus * mult
  if (ef.huntYieldBonus) acc.huntYieldBonus += ef.huntYieldBonus * mult
  if (ef.huntDurationReduction) acc.huntDurationReduction += ef.huntDurationReduction * mult
}

/**
 * 重算所有派生数据：仓储上限、每秒产出、宜居度、解锁列表、价格折扣等。
 * 任何会改变数值的操作之后都应该调用一次。
 */
export function recomputeRaw(state, derived, supply, seconds = 1) {
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
    habitabilityBonus: 0,
    habitabilityPerHousing: 0,
    consumeReduction: 0,
    craftBonus: 0,
    craftBonusByResource: {},
    disasterGuard: 0,
    disasterGuardByResource: {},
    ascendBonus: 0,
    arrivalBonus: 0,
    breakthroughDiscount: 0,
    offlineHours: CONFIG.OFFLINE_CAP_HOURS,
    karmaRatio: 0,
    autoCraftUnlocked: false,
    autoCraftSpeedUnlocked: false,
    autoCondenseLiquidUnlocked: false,
    discipleTrainingUnlocked: false,
    ratioAll: 0,
    huntSuccessBonus: 0,
    huntYieldBonus: 0,
    huntDurationReduction: 0,
  }
  // bonus 是加成倍率的「逐项拆分账」：{ ratio: {res:[条目]}, ratioAll: [条目] }
  const bonus = { ratio: {}, ratioAll: [] }
  const targets = { max, prod, ratio, jobRatio, acc, bonus }

  // 建筑：仓储类按“已建成数量”，产出类按“启用中的数量”
  for (const meta of BUILDINGS) {
    const e = state.buildings[meta.id]
    if (!e || !e.count) continue
    const on = e.on ? e.count * (supply[meta.id] ?? 1) : 0
    const ef = meta.effects
    if (!ef) continue
    // 与数量无关的效果（缩放用 count），先把 storage 类用 count 单独处理。
    // 例外：**带维护费的建筑一切都按「启用数」算** —— 停用即停费，效果也得跟着停，
    // 否则「停用」会变成纯赚（保住效果还省下维护费）。
    const counted = !!meta.upkeep
    const countOnly = {}
    if (ef.storage) countOnly.storage = ef.storage
    if (ef.storageRatio) countOnly.storageRatio = ef.storageRatio
    if (ef.storageAll) countOnly.storageAll = ef.storageAll
    if (ef.maxDisciples) countOnly.maxDisciples = ef.maxDisciples
    if (ef.habitability && !counted) countOnly.habitability = ef.habitability
    if (ef.disasterGuard && !counted) countOnly.disasterGuard = ef.disasterGuard
    if (ef.ascendBonus && !counted) countOnly.ascendBonus = ef.ascendBonus
    if (Object.keys(countOnly).length) applyEffects(countOnly, e.count, targets)
    const activeOnly = { ...ef }
    delete activeOnly.storage
    delete activeOnly.storageRatio
    delete activeOnly.storageAll
    delete activeOnly.maxDisciples
    if (!counted) {
      delete activeOnly.habitability
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
    const enabled = !up.upkeep || state.upgradeEnabled?.[up.id] !== false
    const mult = treasureMult(state, up) * (supply[up.id] ?? 1) * Number(enabled)
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
    if (up.upkeep && mult > 0) {
      for (const [res, unit] of Object.entries(up.upkeep)) {
        const amount = unit * mult
        maint[res] = (maint[res] || 0) + amount
        if (!expenseRaw[res]) expenseRaw[res] = []
        expenseRaw[res].push({ kind: 'upkeep', id: up.id, label: up.name, count: 1, value: -amount })
      }
    }
  }

  // 成就：加成倍率见 ACHIEVEMENT_REWARD（当前为 0，奖励待重新设计）
  const achCount = Object.keys(state.achievements).length
  acc.ratioAll += achCount * ACHIEVEMENT_REWARD
  if (achCount > 0 && ACHIEVEMENT_REWARD > 0) {
    bonus.ratioAll.push({
      kind: 'achievement',
      id: 'achievements',
      label: '成就',
      count: achCount,
      value: achCount * ACHIEVEMENT_REWARD,
    })
  }

  const housingHabitability = Math.min(state.disciples.total, Math.floor(acc.maxDisciples)) * acc.habitabilityPerHousing
  const habitabilityBonus = acc.habitabilityBonus + housingHabitability
  const habitability = CONFIG.HABITABILITY_BASE + habitabilityBonus + (state.habitabilityPenalty || 0)
  const { globalMult: habitabilityMult, discipleMult, leaveChance } = habitabilityEffects(habitability, state.disciples.total)

  // 宜居度拥挤惩罚只作用于弟子岗位，建筑和法宝的基础产出不受此项影响。
  for (const job of JOBS) {
    const n = state.disciples.jobs[job.id] || 0
    if (n > 0) {
      for (const output of jobOutputs(state, job)) {
        const raw = output.base * derived.discipleJobWeights[job.id] * (1 + (jobRatio[job.id] || 0)) * discipleMult
        prod[output.resource] = (prod[output.resource] || 0) + raw
        addSource(output.resource, { kind: 'job', id: job.id, label: job.name, count: n, raw })
      }
    }
  }

  // 增益 / 减益（也记进拆分账，悬停提示要能逐项列出）
  let buffAll = 0
  const buffRes = {}
  const bonusBuffAll = []
  const bonusBuffRes = {}
  const now = gameNow(state)
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
  derived.craftSpeed = Math.max(1, Math.sqrt(realmMult / CONFIG.CRAFT_SPEED_REALM_BASE))
  /**
   * 仙缘加成：先线性给到软上限的 75%，之后渐近到上限（最多 +KARMA_BONUS_CAP，即 +200%）。
   * 这是通用 idler 的 soft cap 形状：early 不打折、late 不膨胀。
   */
  const karmaRaw = Math.max(0, state.karma || 0) * CONFIG.KARMA_BONUS_PER_POINT
  const karmaBonus = softCap(karmaRaw, CONFIG.KARMA_BONUS_CAP)
  const karmaMult = 1 + karmaBonus + acc.karmaRatio
  const karmaStorageMult = 1 + softCap(Math.max(0, state.karma || 0) * CONFIG.KARMA_STORAGE_PER_POINT, CONFIG.KARMA_STORAGE_CAP)
  /** 道果（飞升层）：每颗 +5% 全局产出，不设上限 —— 因为拿到它的成本极高（一次飞升约 90 小时） */
  const daoMult = 1 + Math.max(0, state.dao || 0) * CONFIG.DAO_PRODUCTION_BONUS
  const globalMult = realmMult * karmaMult * habitabilityMult * daoMult * (1 + buffAll)

  // 工业提速同时扩大进料与出料；专业资源增益另外提高转化收益。
  for (const [res, entries] of Object.entries(expenseRaw)) {
    for (const entry of entries) {
      if (entry.kind !== 'upkeep' || !BUILDING_MAP[entry.id]?.throughput) continue
      const extra = -entry.value * (globalMult - 1)
      entry.value *= globalMult
      maint[res] += extra
    }
  }

  // 历法：季节直接乘进对应资源的产出（与建筑 / 修真的 ratio 同一层）
  const calendar = calendarAt(state.totalDays)
  const seasonRatio = calendar.seasonRatio

  // 兼容旧派生字段；灵能改为实际供能，不再凭库存获得免费倍率。
  derived.energyBonus = 0

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
  const rawUpkeep = derived.discipleWeight * discipleUpkeep
  const reduction = rawUpkeep * Math.min(CONFIG.UPKEEP_REDUCTION_CAP, acc.consumeReduction)
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
  // 传功：按弟子有效境界的持续灵气开销；修为已满不收费，灵气不足（口粮与维护优先）整批暂停、不欠账。
  let trainingCost = 0
  {
    let raw = 0
    let count = 0
    for (const member of state.disciples.members) {
      const cost = discipleTrainingCost(member, state.realm)
      if (cost > 0) { raw += cost; count++ }
    }
    const available = Math.max(0, (state.resources.qi || 0) / seconds + (rates.qi || 0) + (expense.qi || 0))
    if (acc.discipleTrainingUnlocked && raw > 0 && available + 1e-10 >= raw) {
      trainingCost = raw
      if (!expenseList.qi) expenseList.qi = []
      expenseList.qi.push({ kind: 'upkeep', id: 'training', label: '传功', count, value: -raw })
      expense.qi = (expense.qi || 0) - raw
    }
  }
  derived.trainingActive = trainingCost > 0
  derived.trainingCost = trainingCost
  // 净额：产出 − 出项（界面左栏与状态行显示的都是它）
  const net = {}
  for (const r of RESOURCES) {
    const out = -(expense[r.id] || 0)
    net[r.id] = (rates[r.id] || 0) - out
  }

  for (const r of RESOURCES) {
    // 猎备仓容完全独立：不乘仙缘仓储倍率（isolatedStorage），也不套通用扩仓（storageWeight 0）。
    if (Number.isFinite(max[r.id]) && !r.isolatedStorage) max[r.id] *= karmaStorageMult
    if (r.integer) max[r.id] = floorNumber(max[r.id])
  }
  derived.karmaStorageMult = karmaStorageMult
  // 比例加仓在此统一生效：上限 =（基础 + 定额）×（1 + 比例）
  if (acc.storageRatio) {
    for (const k in acc.storageRatio) {
      if (acc.storageRatio[k] > 0) max[k] = (max[k] || 0) * (1 + acc.storageRatio[k])
    }
  }
  derived.max = max
  derived.rates = rates
  derived.calendar = calendar
  derived.seasonRatio = seasonRatio
  // 加成倍率的拆分账：悬停提示用它把 ×1.20 拆成「谁加了多少」
  derived.bonus = {
    ratio: bonus.ratio,
    ratioAll: bonus.ratioAll,
    buffAll: bonusBuffAll,
    buffRes: bonusBuffRes,
    realmMult,
    karmaMult,
    habitabilityMult,
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
  derived.habitability = habitability
  derived.habitabilityBonus = habitabilityBonus
  derived.housingHabitability = housingHabitability
  derived.habitabilityMult = habitabilityMult
  derived.discipleMult = discipleMult
  derived.leaveChance = leaveChance
  derived.maxDisciples = Math.floor(acc.maxDisciples)
  derived.globalMult = globalMult
  derived.realmMult = realmMult
  derived.daoMult = daoMult
  derived.karmaMult = karmaMult
  derived.ratioAll = acc.ratioAll
  derived.craftBonus = acc.craftBonus
  derived.craftBonusByResource = acc.craftBonusByResource
  derived.industrial = state.realm >= 4
  derived.processingCapacityRatio = acc.processingCapacityRatio || {}
  derived.craftSpeedByRecipe = acc.craftSpeedByRecipe || {}
  derived.craftCostReduction = acc.craftCostReduction || {}
  derived.processingCapacity = Object.fromEntries(PROCESSING_STATIONS.map(station => {
    let capacity = station.baseUpgrade && state.upgrades[station.baseUpgrade] ? 1 : 0
    for (const [id, perBuilding] of Object.entries(station.buildings)) {
      const entry = state.buildings[id]
      if (entry?.on) capacity += entry.count * (supply[id] ?? 1) * perBuilding
    }
    return [station.id, capacity * (1 + (derived.processingCapacityRatio[station.id] || 0))]
  }))
  derived.energyCraftUnlocked = !!acc.energyCraftUnlocked
  derived.processingPowerCapacity = acc.processingPowerCapacity || 0
  const crystalArray = state.buildings.crystalArray
  const coolingArrays = crystalArray?.on ? crystalArray.count * (supply.crystalArray ?? 1) : 0
  derived.processingCoolingCapacity = Object.values(derived.processingCapacity).reduce((sum, n) => sum + n, 0) * CONFIG.PROCESSING_COOLING_CAPACITY_RATIO
    + coolingArrays * 2 * (1 + (acc.processingCoolingRatio || 0))
  derived.huntSuccessBonus = acc.huntSuccessBonus
  derived.huntYieldBonus = acc.huntYieldBonus
  derived.huntDurationReduction = acc.huntDurationReduction
  derived.disasterGuard = Math.min(CONFIG.DISASTER_GUARD_CAP, acc.disasterGuard)
  derived.disasterGuardByResource = acc.disasterGuardByResource
  derived.ascendBonus = acc.ascendBonus
  derived.consumeReduction = acc.consumeReduction
  derived.arrivalBonus = acc.arrivalBonus
  derived.breakthroughDiscount = acc.breakthroughDiscount
  derived.offlineHours = acc.offlineHours
  derived.daoAutomation = (state.dao || 0) >= 1
  derived.autoCraftUnlocked = acc.autoCraftUnlocked || derived.daoAutomation
  derived.autoCraftSpeedUnlocked = acc.autoCraftSpeedUnlocked
  derived.autoCraftSpeeds = Object.fromEntries(CRAFTS.map(recipe => {
    const speed = state.settings.autoCraftSpeeds?.[recipe.id]
    return [recipe.id, derived.autoCraftSpeedUnlocked && CONFIG.AUTO_CRAFT_SPEEDS.includes(speed) ? speed : 1]
  }))
  derived.autoCondenseLiquidUnlocked = acc.autoCondenseLiquidUnlocked
  derived.discipleTrainingUnlocked = !!acc.discipleTrainingUnlocked
  // 满仓凝液与常驻自动都需要库存目标，避免前期没有控制成品库存的入口。
  derived.craftTargetsUnlocked = derived.autoCraftUnlocked || derived.autoCondenseLiquidUnlocked
  derived.ratio = ratio
  derived.jobRatio = jobRatio
  return derived
}

export function finishDerived(state, derived) {
  // 此刻正在跑的自动制作对材料的每秒消耗（悬停明细的出项口径，见 computeAutoCraftDrain 的说明）
  derived.autoCraftDrain = computeAutoCraftDrain(state, derived)

  // 解锁列表
  derived.unlockedBuildings = BUILDINGS.filter((b) => isBuildingUnlocked(state, b.id)).map((b) => b.id)
  derived.unlockedJobs = JOBS.filter((j) => isJobUnlocked(state, j)).map((j) => j.id)
  derived.availableUpgrades = ALL_UPGRADES.filter(
    (u) => !state.upgrades[u.id] && isUpgradeUnlocked(state, u),
  ).map((u) => u.id)
  derived.availableCrafts = CRAFTS.filter((c) => isCraftUnlocked(state, c)).map((c) => c.id)
  for (const rows of Object.values(derived.sources)) rows.sort((a, b) => b.value - a.value)
  derived.bonus.ratioAll.sort((a, b) => b.value - a.value)
  return derived
}

/** Supply is shared proportionally; disciple food is reserved before building upkeep.
 * Start at full capacity and only reduce it, so a missing input cannot fund its own output.
 * Storage and housing remain available even when production is starved.
 */
export function recompute(state, derived, seconds = 1) {
  const output = derived
  derived = { ...derived } // 供给迭代使用普通对象，只向 Vue 提交最终结果
  derived.discipleJobWeights = Object.fromEntries(JOBS.map(job => [job.id, 0]))
  derived.discipleWeight = 0
  for (const member of state.disciples.members) {
    const factor = discipleFactor(member, state.realm)
    derived.discipleWeight += factor
    if (member.roleId) derived.discipleJobWeights[member.roleId] += factor * (1 + talentBonus(member, 'job'))
  }
  const dt = Math.max(0.001, seconds)
  const supply = {}
  const buildingConsumers = BUILDINGS.filter((b) => b.upkeep && state.buildings[b.id]?.on && state.buildings[b.id]?.count > 0)
  const upgradeConsumers = ALL_UPGRADES.filter((u) => u.upkeep && state.upgrades[u.id] && state.upgradeEnabled?.[u.id] !== false)
  const consumers = [...buildingConsumers, ...upgradeConsumers]
  for (const b of consumers) supply[b.id] = 1
  recomputeRaw(state, derived, supply, dt)
  for (let pass = 0; pass < CONFIG.SUPPLY_ITERATION_MAX; pass++) {
    let changed = false
    // 双极分流同时产生两种灵子；任一侧满仓时，只为下游实际消耗补料。
    if (supply.polarizeArray > 0) {
      let factor = 1
      for (const res of ['yangParticle', 'yinParticle']) {
        const output = (derived.sources[res] || []).filter(s => s.id === 'polarizeArray').reduce((sum, s) => sum + s.value, 0)
        if (output <= 0) continue
        const room = Math.max(0, (derived.max[res] || 0) - (state.resources[res] || 0)) / dt
        const sink = Math.max(0, -(derived.expense[res] || 0))
        const other = Math.max(0, (derived.rates[res] || 0) - output)
        factor = Math.min(factor, Math.max(0, room + sink - other) / output)
      }
      if (factor < 1 - 1e-10) {
        supply.polarizeArray *= factor
        if (supply.polarizeArray < 1e-10) supply.polarizeArray = 0
        recomputeRaw(state, derived, supply, dt)
        changed = true
      }
    }
    const shares = {}
    for (const res in derived.maintenance) {
      const demand = derived.maintenance[res]
      const available = Math.max(0, (state.resources[res] || 0) / dt + (derived.rates[res] || 0) - (res === 'qi' ? derived.upkeep : 0))
      shares[res] = demand > 0 ? Math.min(1, available / demand) : 1
    }
    for (const b of consumers) {
      const factor = Math.min(...Object.keys(b.upkeep).map((res) => shares[res] ?? 1))
      if (factor < 1 - 1e-10 && supply[b.id] > 0) {
        supply[b.id] *= factor
        if (supply[b.id] < 1e-10) supply[b.id] = 0
        changed = true
      }
    }
    if (!changed) break
    recomputeRaw(state, derived, supply, dt)
  }
  derived.buildingSupply = Object.fromEntries(buildingConsumers.map(b => [b.id, supply[b.id]]))
  derived.upgradeSupply = Object.fromEntries(ALL_UPGRADES.filter(u => u.upkeep && state.upgrades[u.id])
    .map(u => [u.id, state.upgradeEnabled?.[u.id] === false ? 0 : supply[u.id]]))
  finishDerived(state, derived)
  Object.assign(output, derived)
  return output
}
