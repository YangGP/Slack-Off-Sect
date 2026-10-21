import { RESOURCES } from '@/data/resources'
import { CONFIG } from '@/data/config'
import { BUILDINGS, BUILDING_MAP, LEGACY_WAREHOUSE_IDS, LEGACY_STORAGE_DELTA } from '@/data/buildings'
import { ALL_UPGRADES, UPGRADE_MAP } from '@/data/upgrades'
import { treasureMult, habitabilityEffects, jobOutputs, karmaMultipliers, calendarAt, isBuildingUnlocked, isJobUnlocked, isUpgradeUnlocked, isCraftUnlocked } from './core'
import { ACHIEVEMENT_REWARD } from '@/data/achievements'
import { JOBS } from '@/data/jobs'
import { gameNow, economyDetailsEnabled, seasonRatioOverride } from '../context'
import { REALMS, realmProductionBase } from '@/data/realms'
import { MONEY_INFINITY, ONE, ZERO, money, moneyMax, moneyMin, moneySum, moneyToRatio } from '../decimal'
import { PROCESSING_STATIONS } from '@/data/industry'
import { CRAFTS } from '@/data/crafts'
import { computeAutoCraftDrain } from './craftingRules'
import { discipleFactor, discipleTrainingCost } from '@/data/disciples'
import { talentBonus } from '@/data/talents'
import { isEntryEnabled } from '@/data/modules'
import { faithRatioBonus, faithStorageRatio, realmProductionMultiplier, ritualLevel } from './faith'
import { karmaShopBonuses } from './karmaShop'
import { registerStaticMoneyCache } from '../staticMoneyCache'

/** 两类仓库的有效定额：新容量×N + 旧制差额×min(N,旧数量)。 */
export function effectiveBuildingStorage(state, id) {
  const meta = BUILDING_MAP[id]
  if (!meta?.effects?.storage) return {}
  const count = Math.max(0, Math.floor(state.buildings?.[id]?.count || 0))
  const legacy = LEGACY_WAREHOUSE_IDS.includes(id)
    ? Math.min(count, Math.max(0, Math.floor(state.legacyWarehouseCounts?.[id] || 0)))
    : 0
  const delta = LEGACY_STORAGE_DELTA[id] || {}
  return Object.fromEntries(Object.entries(meta.effects.storage).map(([res, amount]) => [res,
    money(amount).times(count).plus(delta[res] ? money(delta[res]).times(legacy) : ZERO)]))
}

/**
 * 湮灭炉增产（变更 6）不作用的资源：粒子链（灵气分子／正负灵子／灵能）。
 * 它们互为燃料与产物，属能源产业闭环；排除后粒子链保持一对一配比，也不会出现燃料自增。
 */
export const REACTOR_EXCLUDED = new Set(['qiParticle', 'yangParticle', 'yinParticle', 'qiEnergy'])

/** 湮灭炉增产是否作用于该资源；香火由香火页条目独立提供，不吃湮灭炉。 */
export function reactorAppliesTo(res) {
  return !REACTOR_EXCLUDED.has(res) && res !== 'faith'
}

// 非持续产出的物料（如兽皮）耗尽后，只会由制作或模块结算补回。
// 这些动作仍检查库存并重算，因此单独缺此类物料的停机设施可以保留零供给。
const CONTINUOUS_OUTPUTS = new Set([
  ...BUILDINGS.flatMap(meta => Object.keys(meta.effects?.prod || {})),
  ...ALL_UPGRADES.flatMap(meta => Object.keys(meta.effects?.prod || {})),
  ...JOBS.flatMap(job => [job.resource, job.secondary?.resource,
    ...(job.additionalOutputs || []).map(output => output.resource)]),
].filter(Boolean))

/**
 * 静态数据里的金额字面值仍是 Number：进入热路径前预构造 Decimal 常量。
 * 缓存按「效果对象」身份挂在 WeakMap 上，正常情况下数据表是只读常量，可以长期复用；
 * 这样每次重算就不会重复构造上千个 Decimal（这是离线分段的主要开销之一）。
 *
 * 但工具会原地改表（`audit-lib` 的 craftQi / prods 补丁），同一对象身份下数值已经变化，
 * 所以这里登记了失效入口：改表与回滚后都要调用 `invalidateStaticMoneyCaches()`。
 */
let moneyMapCache = new WeakMap()
function cachedMoneyMap(values) {
  if (!values) return null
  let cached = moneyMapCache.get(values)
  if (!cached) {
    cached = {}
    for (const key in values) cached[key] = money(values[key])
    moneyMapCache.set(values, cached)
  }
  return cached
}

let effectMoneyCache = new WeakMap()
registerStaticMoneyCache(() => {
  moneyMapCache = new WeakMap()
  effectMoneyCache = new WeakMap()
})
function effectMoney(ef) {
  let cached = effectMoneyCache.get(ef)
  if (!cached) {
    cached = {
      storage: cachedMoneyMap(ef.storage),
      storageAll: ef.storageAll == null ? null : money(ef.storageAll),
      prod: cachedMoneyMap(ef.prod),
    }
    effectMoneyCache.set(ef, cached)
  }
  return cached
}

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
    const storage = effectMoney(ef).storage
    for (const k in storage) max[k] = (max[k] ?? ZERO).plus(storage[k].times(mult))
  }
  // 比例加仓：这里只累计百分比，等所有定额加仓都算完、在 recompute 收尾处统一放大。
  // 若不这样分两步，上限会随"效果遍历顺序"变化（先加的定额被放大、后加的不被放大）。
  if (ef.storageRatio) {
    if (!acc.storageRatio) acc.storageRatio = {}
    for (const k in ef.storageRatio) acc.storageRatio[k] = (acc.storageRatio[k] || 0) + ef.storageRatio[k] * mult
  }
  if (ef.buildingStorageRatio) {
    acc.buildingStorageRatio ||= {}
    for (const [id, value] of Object.entries(ef.buildingStorageRatio)) {
      acc.buildingStorageRatio[id] = (acc.buildingStorageRatio[id] || 0) + value * mult
    }
  }
  if (ef.storageAll) {
    const storageAll = effectMoney(ef).storageAll
    for (const r of RESOURCES) {
      max[r.id] = (max[r.id] ?? ZERO).plus(storageAll.times(mult).times(r.storageWeight ?? 1))
    }
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
  // 突破失败后身死减免（香火线《愿力护道》等）：累加为百分点，progression 结算身死概率时扣减。
  if (ef.tribulationSafety) acc.tribulationSafety += ef.tribulationSafety * mult
  if (ef.offlineHours) acc.offlineHours += ef.offlineHours * mult
  if (ef.karmaRatio) acc.karmaRatio += ef.karmaRatio * mult
  if (ef.autoCraft) acc.autoCraftUnlocked = true
  if (ef.autoCraftSpeedControl) acc.autoCraftSpeedUnlocked = true
  if (ef.autoCondenseLiquid) acc.autoCondenseLiquidUnlocked = true
  if (ef.energyCraft) acc.energyCraftUnlocked = true
  if (ef.discipleTraining) acc.discipleTrainingUnlocked = true
  if (ef.autoTalentJobs) acc.autoTalentJobsUnlocked = true
  if (ef.recruitMode) acc.recruitModeUnlocked = true
  if (ef.autoDiscipleBreakthrough) acc.autoDiscipleBreakthroughUnlocked = true
  for (const field of ['processingPowerCapacity', 'processingCoolingRatio']) {
    if (ef[field]) acc[field] = (acc[field] || 0) + ef[field] * mult
  }
  if (ef.prod) {
    const prodMap = effectMoney(ef).prod
    for (const k in prodMap) prod[k] = (prod[k] ?? ZERO).plus(prodMap[k].times(mult))
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
  // 湮灭炉增产（变更 6）：每座运行给一层全局产出倍率，多座相加；单独成层，便于对灵能燃料跳过。
  if (ef.ratioReactor) {
    const value = ef.ratioReactor * mult
    acc.reactorRatio += value
    if (src) {
      bonus.reactorRatio.push({ kind: src.kind, id: src.id, label: src.label, count: src.count || 0, value })
    }
  }
  if (ef.jobRatio) {
    for (const k in ef.jobRatio) jobRatio[k] = (jobRatio[k] || 0) + ef.jobRatio[k] * mult
  }
  if (ef.huntSuccessBonus) acc.huntSuccessBonus += ef.huntSuccessBonus * mult
  if (ef.huntYieldBonus) acc.huntYieldBonus += ef.huntYieldBonus * mult
  if (ef.huntCostReduction) acc.huntCostReduction += ef.huntCostReduction * mult
}

/**
 * 建筑的持续供能档（变更 4）：返回 { res, amount, mult }，无动力字段则 null。
 * 默认走灵气基础；仅当建筑选「灵能高阶」且已掌握《灵能输配》(energyApplication) 时改用灵能，效果 ×mult。
 */
function buildingPowerDraw(state, meta) {
  if (meta.upkeepQi == null && meta.upkeepEnergy == null) return null
  const entry = state.buildings[meta.id]
  const energyMode = meta.upkeepEnergy != null && entry?.power === 'energy' && !!state.upgrades.energyApplication
  if (energyMode) return { res: 'qiEnergy', amount: meta.upkeepEnergy, mult: meta.powerMult ?? 1 }
  if (meta.upkeepQi != null) return { res: 'qi', amount: meta.upkeepQi, mult: 1 }
  return { res: 'qiEnergy', amount: meta.upkeepEnergy, mult: meta.powerMult ?? 1 }
}

/**
 * 重算所有派生数据：仓储上限、每秒产出、宜居度、解锁列表、价格折扣等。
 * 任何会改变数值的操作之后都应该调用一次。
 */
export function recomputeRaw(state, derived, supply, seconds = 1) {
  const details = economyDetailsEnabled(state)
  const max = {}
  // 无仓容上限（仙缘 / 道果）用金额域的正无穷哨兵，时间域的 Number Infinity 不跨域套用。
  for (const r of RESOURCES) max[r.id] = Number.isFinite(r.baseMax) ? money(r.baseMax) : MONEY_INFINITY
  const prod = {}
  const ratio = {}
  const jobRatio = {}
  // 进项来源明细：res -> [{ kind, id, label, count, raw }]
  const sources = {}
  const polarizeRaw = {}
  // 维护费：res -> 每秒总消耗；expenseRaw 是逐条明细（弟子口粮稍后并进来）
  const maint = {}
  const expenseRaw = {}
  const addSource = (res, entry) => {
    // 来源明细是金额：零值判断走 Decimal，不能用对象真假判断（Decimal 恒为真）。
    if (!details || !entry.raw || money(entry.raw).isZero()) return
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
    tribulationSafety: 0,
    offlineHours: CONFIG.OFFLINE_CAP_HOURS,
    karmaRatio: 0,
    autoCraftUnlocked: false,
    autoCraftSpeedUnlocked: false,
    autoCondenseLiquidUnlocked: false,
    discipleTrainingUnlocked: false,
    autoTalentJobsUnlocked: false,
    recruitModeUnlocked: false,
    autoDiscipleBreakthroughUnlocked: false,
    ratioAll: 0,
    reactorRatio: 0,
    huntSuccessBonus: 0,
    huntYieldBonus: 0,
    huntCostReduction: 0,
  }
  // bonus 是加成倍率的「逐项拆分账」：{ ratio: {res:[条目]}, ratioAll: [条目], reactorRatio: [条目] }
  const bonus = { ratio: {}, ratioAll: [], reactorRatio: [] }
  const targets = { max, prod, ratio, jobRatio, acc, bonus }

  // 建筑：仓储类按“已建成数量”，产出类按“启用中的数量”
  for (const meta of BUILDINGS) {
    // 关闭的可选模块：其建筑的效果与维护费一并失效（已建成的也停用）
    if (!isEntryEnabled(state, meta)) continue
    const e = state.buildings[meta.id]
    if (!e || !e.count) continue
    const on = e.on ? e.count * (supply[meta.id] ?? 1) : 0
    const ef = meta.effects
    if (!ef) continue
    // 与数量无关的效果（缩放用 count），先把 storage 类用 count 单独处理。
    // 例外：**带维护费或持续供能的建筑，主动效果按「启用数」算** —— 停用 / 断供即停，
    // 效果跟着停，否则「停用」会变成纯赚（保住效果还省下费用）。实体容量（仓储 / 住房）仍按已建数保留。
    const power = buildingPowerDraw(state, meta)
    const counted = !!(meta.upkeep || power)
    const powMult = power ? power.mult : 1
    const countOnly = {}
    if (ef.storage) {
      if (LEGACY_WAREHOUSE_IDS.includes(meta.id)) applyEffects({ storage: effectiveBuildingStorage(state, meta.id) }, 1, targets)
      else countOnly.storage = ef.storage
    }
    if (ef.storageRatio) countOnly.storageRatio = ef.storageRatio
    if (ef.buildingStorageRatio) countOnly.buildingStorageRatio = ef.buildingStorageRatio
    if (ef.storageAll) countOnly.storageAll = ef.storageAll
    if (ef.maxDisciples) countOnly.maxDisciples = ef.maxDisciples
    if (ef.habitability && !counted) countOnly.habitability = ef.habitability
    if (ef.disasterGuard && !counted) countOnly.disasterGuard = ef.disasterGuard
    if (ef.ascendBonus && !counted) countOnly.ascendBonus = ef.ascendBonus
    if (Object.keys(countOnly).length) applyEffects(countOnly, e.count, targets)
    const activeOnly = { ...ef }
    delete activeOnly.storage
    delete activeOnly.storageRatio
    delete activeOnly.buildingStorageRatio
    delete activeOnly.storageAll
    delete activeOnly.maxDisciples
    if (!counted) {
      delete activeOnly.habitability
      delete activeOnly.disasterGuard
      delete activeOnly.ascendBonus
    }
    applyEffects(activeOnly, on * powMult, targets, details ? { kind: 'building', id: meta.id, label: meta.name, count: on } : null)
    if (ef.prod) {
      const prodMap = cachedMoneyMap(ef.prod)
      const selfUseMap = cachedMoneyMap(meta.selfUse)
      for (const k in prodMap) {
        // 炉内自用能（变更 4）：从毛输出扣减，得出净供能；不参与供能门禁，故零库存也能首启。
        const gross = prodMap[k].times(on).times(powMult)
        const net = moneyMax(ZERO, gross.minus((selfUseMap?.[k] ?? ZERO).times(on)))
        if (meta.id === 'polarizeArray') polarizeRaw[k] = net
        addSource(k, { kind: 'building', id: meta.id, label: meta.name, count: on, raw: net })
      }
    }
    // 自用能同样要从实际产出里扣掉（applyEffects 已把毛产出写进 prod）
    if (meta.selfUse) {
      const selfUseMap = cachedMoneyMap(meta.selfUse)
      for (const k in selfUseMap) {
        prod[k] = moneyMax(ZERO, (prod[k] ?? ZERO).minus(selfUseMap[k].times(on)))
      }
    }
    // 维护费：按“启用中的数量”消耗资源（停用即停费 —— 这是「停用」按钮唯一的存在理由）
    if (meta.upkeep && on > 0) {
      const upkeepMap = cachedMoneyMap(meta.upkeep)
      for (const k in upkeepMap) {
        const amount = upkeepMap[k].times(on)
        maint[k] = (maint[k] ?? ZERO).plus(amount)
        if (!expenseRaw[k]) expenseRaw[k] = []
        expenseRaw[k].push({
          kind: 'upkeep',
          id: meta.id,
          label: meta.name,
          count: on,
          value: amount.negated(),
        })
      }
    }
    // 持续供能：动力与物料维护分开记账，同一资源不重复结算。
    if (power && on > 0) {
      const amount = money(power.amount).times(on)
      maint[power.res] = (maint[power.res] ?? ZERO).plus(amount)
      if (!expenseRaw[power.res]) expenseRaw[power.res] = []
      expenseRaw[power.res].push({ kind: 'upkeep', id: meta.id, label: meta.name, count: on, value: amount.negated() })
    }
  }

  // 修真 / 技艺 / 法宝（法宝按祭炼等级放大效果）
  for (const up of ALL_UPGRADES) {
    if (!isEntryEnabled(state, up)) continue
    if (!state.upgrades[up.id]) continue
    const enabled = !up.upkeep || state.upgradeEnabled?.[up.id] !== false
    const mult = treasureMult(state, up) * (supply[up.id] ?? 1) * Number(enabled)
    applyEffects(up.effects, mult, targets, details ? { kind: 'upgrade', id: up.id, label: up.name, count: 1 } : null)
    if (up.effects?.prod) {
      const prodMap = cachedMoneyMap(up.effects.prod)
      for (const k in prodMap) {
        addSource(k, {
          kind: 'upgrade',
          id: up.id,
          label: up.name,
          count: 1,
          raw: prodMap[k].times(mult),
        })
      }
    }
    if (up.upkeep && mult > 0) {
      const upkeepMap = cachedMoneyMap(up.upkeep)
      for (const [res, unit] of Object.entries(upkeepMap)) {
        const amount = unit.times(mult)
        maint[res] = (maint[res] ?? ZERO).plus(amount)
        if (!expenseRaw[res]) expenseRaw[res] = []
        expenseRaw[res].push({ kind: 'upkeep', id: up.id, label: up.name, count: 1, value: amount.negated() })
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
  // 4.8：宜居度只减不加，且独立于锁灵阵等阵法减耗；低于基准不额外加耗。
  const habitabilityUpkeepReduction = Math.min(CONFIG.HABITABILITY_UPKEEP_CAP,
    Math.max(0, habitability - CONFIG.HABITABILITY_BASE) * CONFIG.HABITABILITY_UPKEEP_PER_POINT)

  // 宜居度拥挤惩罚只作用于弟子岗位，建筑和法宝的基础产出不受此项影响。
  for (const job of JOBS) {
    if (!isEntryEnabled(state, job)) continue
    const n = state.disciples.jobs[job.id] || 0
    if (n > 0) {
      for (const output of jobOutputs(state, job)) {
        const raw = money(output.base).times(derived.discipleJobWeights[job.id])
          .times(ONE.plus(jobRatio[job.id] || 0)).times(discipleMult)
        prod[output.resource] = (prod[output.resource] ?? ZERO).plus(raw)
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
  /** D7 万民归心：只强化“境界生产奖励”，不改口粮、加工节拍与单份产量。 */
  const realmProductionMult = realmProductionMultiplier(state, realmMult)
  derived.craftSpeed = Math.max(1, Math.sqrt(realmMult / CONFIG.CRAFT_SPEED_REALM_BASE))
  /**
   * 仙缘加成：先线性给到软上限的 75%，之后渐近到上限（最多 +KARMA_BONUS_CAP，即 +200%）。
   * 这是通用 idler 的 soft cap 形状：early 不打折、late 不膨胀。
   * 仙缘本身是随进度无界的金额，全程在 Decimal 域计算，不先转 Number。
   * 仙缘修持在此接入：宿慧/梦息/轮回契并入 acc 累加器（与因果通感同路，L708/L714 的派生
   * 消费点在后面，天然吃到）；因果田乘在仙缘仓储乘区之上。修持效果只看等级——
   * 已修持花掉的仙缘不计入余额乘区（karmaMultipliers 只吃余额）。
   */
  const karma = moneyMax(ZERO, state.karma ?? ZERO)
  const permanentKarma = karmaMultipliers(karma)
  const karmaPerks = karmaShopBonuses(state)
  acc.karmaRatio += karmaPerks.karmaRatio
  acc.offlineHours += karmaPerks.offlineHours
  acc.ascendBonus += karmaPerks.ascendBonus
  const karmaMult = permanentKarma.karmaMult.plus(acc.karmaRatio)
  const karmaStorageMult = permanentKarma.karmaStorageMult.times(ONE.plus(karmaPerks.storageRatio))
  /** 道果（飞升层）：每颗提供配置中的永久产出加成；首飞耗时随策略及版本变化。道果无上界，倍率走 Decimal。 */
  const daoMult = ONE.plus(moneyMax(ZERO, state.dao ?? ZERO).times(CONFIG.DAO_PRODUCTION_BONUS))
  // DEBUG 专属独立乘区；运行时字段不进存档，离线快照仍保留本次会话的开关。
  const debugProductionMult = state.__debugProductionBoost === true ? 10 : 1
  const globalMult = money(realmProductionMult).times(karmaMult).times(habitabilityMult).times(daoMult)
    .times(ONE.plus(buffAll)).times(debugProductionMult)

  // 工业提速同时扩大进料与出料；专业资源增益另外提高转化收益。
  for (const [res, entries] of Object.entries(expenseRaw)) {
    for (const entry of entries) {
      if (entry.kind !== 'upkeep' || !BUILDING_MAP[entry.id]?.throughput) continue
      const extra = entry.value.negated().times(globalMult.minus(1))
      entry.value = entry.value.times(globalMult)
      maint[res] = (maint[res] ?? ZERO).plus(extra)
    }
  }

  // 历法：季节直接乘进对应资源的产出（与建筑 / 修真的 ratio 同一层）。
  // 有界近似的离线长段用「段内按覆盖时长加权的季节倍率」，在线与短离线用当前节气。
  const calendar = calendarAt(state.totalDays)
  const seasonRatio = seasonRatioOverride(state) || calendar.seasonRatio

  // 兼容旧派生字段；灵能改为实际供能，不再凭库存获得免费倍率。
  derived.energyBonus = 0

  // D7 香火修持：聚香法每级 +30%、大乘愿典 +120%，与既有 ratio 同层相加。
  const faithBonusRatio = faithRatioBonus(state)
  if (faithBonusRatio) {
    ratio.faith = (ratio.faith || 0) + faithBonusRatio
    if (!bonus.ratio.faith) bonus.ratio.faith = []
    bonus.ratio.faith.push({
      kind: 'ritual', id: 'gatherIncense', label: '聚香法',
      count: ritualLevel(state, 'gatherIncense'), value: faithBonusRatio,
    })
  }

  const rates = {}
  for (const r of RESOURCES) {
    if (r.noProduction) {
      rates[r.id] = ZERO
      continue
    }
    const base =
      (prod[r.id] ?? ZERO)
        .times(ONE.plus(ratio[r.id] || 0))
        .times(ONE.plus(acc.ratioAll))
        .times(ONE.plus(seasonRatio[r.id] || 0))
    // 湮灭炉增产：作用于持续产出，唯独不作用于粒子链（分子 / 正负灵子 / 灵能），保持一对一配比与燃料自洽。
    // 湮灭炉的全局增产不作用于香火：香火成长只来自香火页条目。
    const reactor = reactorAppliesTo(r.id) ? ONE.plus(acc.reactorRatio) : ONE
    rates[r.id] = base.times(globalMult).times(ONE.plus(buffRes[r.id] || 0)).times(reactor)
  }

  /**
   * 弟子口粮：**随境界倍率一起上涨**（DISCIPLE_UPKEEP_REALM_EXP）。
   *
   * 产出被 realmMult 放大，口粮若保持常数，一名阵徒的「毛产出 ÷ 口粮」就会从
   * 凡体的 2.4:1 涨到渡劫期的 48:1 —— 弟子越到后期越接近免费，人口只剩盖房子一道闸门。
   * 基准口粮随境界倍率上涨，实际费用另受人口规模与减耗影响。
   */
  const population = state.disciples.members.length
  const populationUpkeepMult = 1 + Math.min(CONFIG.POPULATION_UPKEEP_EXTRA_CAP,
    Math.max(0, population - CONFIG.POPULATION_UPKEEP_FREE) * CONFIG.POPULATION_UPKEEP_PER_DISCIPLE)
  const baseDiscipleUpkeep = money(CONFIG.DISCIPLE_UPKEEP).times(money(realmProductionBase(realmMult)).pow(CONFIG.DISCIPLE_UPKEEP_REALM_EXP))
  const discipleUpkeep = baseDiscipleUpkeep.times(populationUpkeepMult)
  const baseRawUpkeep = baseDiscipleUpkeep.times(derived.discipleWeight)
  const rawUpkeep = baseRawUpkeep.times(populationUpkeepMult)
  const reduction = rawUpkeep.times(Math.min(CONFIG.UPKEEP_REDUCTION_CAP, acc.consumeReduction))
  const afterConsume = rawUpkeep.minus(reduction)
  // 宜居度减耗单独记账：必须进入 expenseList，否则界面/净流量与实际库存不一致。
  const habitabilityReduction = afterConsume.times(habitabilityUpkeepReduction)
  const upkeep = afterConsume.minus(habitabilityReduction)

  // 把来源折算成最终数值（所有来源共享同一组乘区，所以按比例缩放即可对上总额）
  const sourceFactor = {}
  const sourceList = {}
  for (const res in sources) {
    const raw = prod[res] ?? ZERO
    const factor = raw.gt(0) ? (rates[res] ?? ZERO).div(raw) : ZERO
    sourceFactor[res] = factor
    sourceList[res] = sources[res]
      .map((s) => ({ ...s, value: money(s.raw).times(factor) }))
  }
  // 出项明细：弟子口粮（灵气）+ 各建筑的维护费
  const expenseList = { ...expenseRaw }
  if (rawUpkeep.gt(0)) {
    const items = expenseList.qi || []
    items.unshift({
      kind: 'upkeep',
      id: 'disciples',
      label: '弟子',
      count: state.disciples.total,
      value: baseRawUpkeep.negated(),
    })
    if (rawUpkeep.gt(baseRawUpkeep)) {
      items.splice(1, 0, {
        kind: 'upkeep', id: 'population', label: '宗门规模口粮',
        count: population, value: rawUpkeep.minus(baseRawUpkeep).negated(),
      })
    }
    if (reduction.gt(0)) {
      items.splice(1, 0, {
        kind: 'reduce',
        id: 'consumeRatio',
        label: '减耗（锁灵阵等）',
        count: 0,
        value: reduction,
      })
    }
    if (habitabilityReduction.gt(0)) {
      items.push({
        kind: 'reduce',
        id: 'habitabilityUpkeep',
        label: '减耗（宜居度）',
        count: 0,
        value: habitabilityReduction,
      })
    }
    expenseList.qi = items
  }
  // 逐资源的每秒出项总额（灵气 = 弟子口粮 + 维护费）
  const expense = {}
  for (const res in expenseList) {
    expense[res] = moneySum(expenseList[res].map(item => item.value))
  }
  for (const res in maint) if (expense[res] === undefined) expense[res] = maint[res].negated()
  // 传功：按弟子有效境界的持续灵气开销；修为已满不收费，灵气不足（口粮与维护优先）整批暂停、不欠账。
  let trainingCost = ZERO
  {
    let raw = ZERO
    let count = 0
    for (const member of state.disciples.members) {
      const cost = discipleTrainingCost(member, state.realm)
      if (money(cost).gt(0)) { raw = raw.plus(cost); count++ }
    }
    // 可用灵气按本段时长折算；金额精确比较，不再用相对容差放行「差一点点」的支付。
    // 灵气底线：预留 upkeep × trainingQiFloorSeconds 的口粮库存，传功不得击穿（0 关闭，设置见 docs/DISCIPLE-PROGRESSION.md §2.2.2）。
    const qiFloor = money(upkeep).times(state.settings?.trainingQiFloorSeconds || 0)
    const available = moneyMax(ZERO, (state.resources.qi ?? ZERO).div(seconds)
      .plus(rates.qi ?? ZERO).plus(expense.qi ?? ZERO))
    if (acc.discipleTrainingUnlocked && raw.gt(0) && available.gte(raw.plus(qiFloor.div(seconds)))) {
      trainingCost = raw
      if (!expenseList.qi) expenseList.qi = []
      expenseList.qi.push({ kind: 'upkeep', id: 'training', label: '传功', count, value: raw.negated() })
      expense.qi = (expense.qi ?? ZERO).minus(raw)
    }
  }
  derived.trainingActive = trainingCost.gt(0)
  derived.trainingCost = trainingCost
  // 净额：产出 − 出项（界面左栏与状态行显示的都是它）
  const net = {}
  for (const r of RESOURCES) {
    const out = (expense[r.id] ?? ZERO).negated()
    net[r.id] = (rates[r.id] ?? ZERO).minus(out)
  }

  // 专项扩容仅增加指定建筑自身的定额仓储，基础仓容和其他来源不参与。
  for (const [id, value] of Object.entries(acc.buildingStorageRatio || {})) {
    const meta = BUILDING_MAP[id]
    if (!meta || !isEntryEnabled(state, meta)) continue
    const storage = effectiveBuildingStorage(state, id)
    for (const [res, amount] of Object.entries(storage)) {
      max[res] = (max[res] ?? ZERO).plus(amount.times(value))
    }
  }
  for (const r of RESOURCES) {
    // 信符仓容完全独立：不乘仙缘仓储倍率（isolatedStorage），也不套通用扩仓（storageWeight 0）。
    if (max[r.id].isFinite() && !r.isolatedStorage) max[r.id] = max[r.id].times(karmaStorageMult)
  }
  derived.karmaStorageMult = karmaStorageMult
  // 比例加仓在此统一生效：上限 =（基础 + 定额）×（1 + 比例）
  if (acc.storageRatio) {
    for (const k in acc.storageRatio) {
      if (acc.storageRatio[k] > 0) max[k] = (max[k] ?? ZERO).times(ONE.plus(acc.storageRatio[k]))
    }
  }
  // 4.3：持有的道论按卷提供临时灵机仓容，只作尾款缓冲；加成不超过基础上限的 100%。
  const treatiseHeld = state.resources?.daoTreatise ?? ZERO
  if (treatiseHeld.gt(0)) {
    const baseInsightCap = max.insight ?? ZERO
    const treatiseBonus = moneyMin(treatiseHeld.times(CONFIG.DAOTREATISE_INSIGHT_CAP), baseInsightCap)
    max.insight = baseInsightCap.plus(treatiseBonus)
  }
  // D7 收愿仪：只放大香火仓容，放在定额与比例加仓之后，不重复计入 storageRatio。
  const holdVowRatio = faithStorageRatio(state)
  if (holdVowRatio > 0) max.faith = (max.faith ?? ZERO).times(ONE.plus(holdVowRatio))
  derived.max = max
  derived.rates = rates
  derived.calendar = calendar
  derived.seasonRatio = seasonRatio
  // 加成倍率的拆分账：悬停提示用它把 ×1.20 拆成「谁加了多少」
  derived.bonus = {
    ratio: bonus.ratio,
    ratioAll: bonus.ratioAll,
    reactorRatio: bonus.reactorRatio,
    buffAll: bonusBuffAll,
    buffRes: bonusBuffRes,
    realmMult: realmProductionBase(realmMult),
    realmProductionMult,
    debugProductionMult,
    karmaMult,
    habitabilityMult,
    buffAllTotal: buffAll,
    globalMult,
  }
  derived.sources = sourceList
  // 供给求解只依赖偏极阵实际流量，不依赖为 tooltip 构造的来源列表。
  derived.polarizeOutput = Object.fromEntries(Object.entries(polarizeRaw)
    .map(([res, raw]) => [res, (prod[res] ?? ZERO).gt(0) ? raw.times((rates[res] ?? ZERO).div(prod[res])) : ZERO]))
  derived.sourceFactor = sourceFactor
  derived.expenseSources = expenseList
  derived.expense = expense
  derived.maintenance = maint
  derived.net = net
  derived.prodRaw = prod
  derived.upkeep = upkeep
  derived.rawUpkeep = rawUpkeep
  derived.habitabilityUpkeepAmount = habitabilityReduction
  derived.discipleUpkeep = discipleUpkeep
  derived.habitabilityUpkeepReduction = habitabilityUpkeepReduction
  derived.populationUpkeepMult = populationUpkeepMult
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
  derived.realmBaseProductionMult = realmProductionBase(realmMult)
  derived.realmProductionMult = realmProductionMult
  derived.faithRatioBonus = faithBonusRatio
  derived.faithStorageRatio = holdVowRatio
  derived.daoMult = daoMult
  derived.karmaMult = karmaMult
  derived.ratioAll = acc.ratioAll
  derived.reactorRatio = acc.reactorRatio
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
  derived.huntCostReduction = acc.huntCostReduction
  derived.disasterGuard = Math.min(CONFIG.DISASTER_GUARD_CAP, acc.disasterGuard)
  derived.disasterGuardByResource = acc.disasterGuardByResource
  derived.ascendBonus = acc.ascendBonus
  derived.consumeReduction = acc.consumeReduction
  derived.arrivalBonus = acc.arrivalBonus
  derived.breakthroughDiscount = acc.breakthroughDiscount
  // 暴露给 progression：突破失败后身死减免（预览 / 结算同源）。
  derived.tribulationSafety = acc.tribulationSafety
  derived.offlineHours = acc.offlineHours
  derived.daoAutomation = money(state.dao ?? ZERO).gte(1)
  derived.autoCraftUnlocked = acc.autoCraftUnlocked || derived.daoAutomation
  derived.autoCraftSpeedUnlocked = acc.autoCraftSpeedUnlocked
  derived.autoCraftSpeeds = Object.fromEntries(CRAFTS.map(recipe => {
    const speed = state.settings.autoCraftSpeeds?.[recipe.id]
    return [recipe.id, derived.autoCraftSpeedUnlocked && CONFIG.AUTO_CRAFT_SPEEDS.includes(speed) ? speed : 1]
  }))
  derived.autoCondenseLiquidUnlocked = acc.autoCondenseLiquidUnlocked
  derived.discipleTrainingUnlocked = !!acc.discipleTrainingUnlocked
  derived.autoTalentJobsUnlocked = !!acc.autoTalentJobsUnlocked
  derived.recruitModeUnlocked = !!acc.recruitModeUnlocked
  derived.autoDiscipleBreakthroughUnlocked = !!acc.autoDiscipleBreakthroughUnlocked
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
  // 香火专属条目只在香火页购买，不进入普通参悟列表。
  derived.availableUpgrades = ALL_UPGRADES.filter(
    (u) => u.page !== 'faith' && !state.upgrades[u.id] && isUpgradeUnlocked(state, u),
  ).map((u) => u.id)
  derived.availableCrafts = CRAFTS.filter((c) => isCraftUnlocked(state, c)).map((c) => c.id)
  for (const rows of Object.values(derived.sources)) rows.sort((a, b) => b.value.cmp(a.value))
  derived.bonus.ratioAll.sort((a, b) => b.value - a.value)
  return derived
}

/**
 * 离线逐秒推进期间，只有供给仍充足（或无来源物料持续断供）、传功状态不变时才复用经济数据。
 * 人口、岗位、历法、增益与模块结算仍由 simulation 在各自边界重算；这里检查库存变化。
 * 只供同一次逐秒推演的相邻步骤使用（默认离线，审计可显式启用在线复用），不能跳过玩家操作后的重算。
 */
export function canReuseEconomy(state, derived, seconds) {
  if (state.buffs.some(buff => (buff.until || 0) <= gameNow(state))) return false
  const missingMaterial = meta => Object.keys(meta?.upkeep || {}).some(res =>
    !CONTINUOUS_OUTPUTS.has(res) && !(state.resources[res] ?? ZERO).gt(0))
  for (const [id, value] of Object.entries(derived.buildingSupply)) {
    if (value !== 1 && !(value === 0 && missingMaterial(BUILDING_MAP[id]))) return false
  }
  for (const [id, value] of Object.entries(derived.upgradeSupply)) {
    if (state.upgradeEnabled?.[id] !== false && value !== 1 &&
      !(value === 0 && missingMaterial(UPGRADE_MAP[id]))) return false
  }
  const dt = Math.max(0.001, seconds)
  for (const [res, demand] of Object.entries(derived.maintenance)) {
    const available = moneyMax(ZERO, (state.resources[res] ?? ZERO).div(dt)
      .plus(derived.rates[res] ?? ZERO)
      .minus(res === 'qi' ? derived.upkeep : ZERO))
    if (demand.gt(available)) return false
  }
  // 偏极阵任一侧接近满仓时须重新求负荷，不能沿用满供产出而浪费上游物料。
  if (derived.buildingSupply.polarizeArray > 0) {
    for (const res of ['yangParticle', 'yinParticle']) {
      const output = derived.polarizeOutput[res] ?? ZERO
      const room = moneyMax(ZERO, (derived.max[res] ?? MONEY_INFINITY).minus(state.resources[res] ?? ZERO)).div(dt)
      const sink = moneyMax(ZERO, (derived.expense[res] ?? ZERO).negated())
      const other = moneyMax(ZERO, (derived.rates[res] ?? ZERO).minus(output))
      if (output.gt(room.plus(sink).minus(other))) return false
    }
  }
  if (derived.discipleTrainingUnlocked) {
    let training = ZERO
    for (const member of state.disciples.members) training = training.plus(discipleTrainingCost(member, state.realm))
    // expense 已含上一轮的传功费，先加回，再按当前库存判断能否继续传功；底线口径与重算门控保持一致。
    const available = moneyMax(ZERO, (state.resources.qi ?? ZERO).div(dt)
      .plus(derived.rates.qi ?? ZERO).plus(derived.expense.qi ?? ZERO).plus(derived.trainingCost))
    const qiFloor = money(derived.upkeep).times(state.settings?.trainingQiFloorSeconds || 0)
    const cost = training.gt(0) && available.gte(training.plus(qiFloor.div(dt))) ? training : ZERO
    if (!cost.eq(derived.trainingCost)) return false
  }
  return true
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
  const buildingConsumers = BUILDINGS.filter((b) => (b.upkeep || b.upkeepQi != null || b.upkeepEnergy != null)
    && state.buildings[b.id]?.on && state.buildings[b.id]?.count > 0)
  const upgradeConsumers = ALL_UPGRADES.filter((u) => u.upkeep && state.upgrades[u.id] && state.upgradeEnabled?.[u.id] !== false)
  const consumers = [...buildingConsumers, ...upgradeConsumers]
  for (const b of consumers) supply[b.id] = 1
  recomputeRaw(state, derived, supply, dt)
  for (let pass = 0; pass < CONFIG.SUPPLY_ITERATION_MAX; pass++) {
    let changed = false
    // 双极分流同时产生两种灵子；任一侧满仓时，只为下游实际消耗补料。
    if (supply.polarizeArray > 0) {
      let factor = ONE
      for (const res of ['yangParticle', 'yinParticle']) {
        const output = derived.polarizeOutput[res] ?? ZERO
        if (output.lte(0)) continue
        const room = moneyMax(ZERO, (derived.max[res] ?? MONEY_INFINITY).minus(state.resources[res] ?? ZERO)).div(dt)
        const sink = moneyMax(ZERO, (derived.expense[res] ?? ZERO).negated())
        const other = moneyMax(ZERO, (derived.rates[res] ?? ZERO).minus(output))
        factor = moneyMin(factor, moneyMax(ZERO, room.plus(sink).minus(other)).div(output))
      }
      // 供给比例是有界量：先在 Decimal 域夹到 [0,1]，再转 Number 参与供给迭代。
      const ratio = moneyToRatio(factor)
      if (ratio < 1 - 1e-10) {
        supply.polarizeArray *= ratio
        if (supply.polarizeArray < 1e-10) supply.polarizeArray = 0
        recomputeRaw(state, derived, supply, dt)
        changed = true
      }
    }
    const shares = {}
    for (const res in derived.maintenance) {
      const demand = derived.maintenance[res]
      const available = moneyMax(ZERO, (state.resources[res] ?? ZERO).div(dt)
        .plus(derived.rates[res] ?? ZERO)
        .minus(res === 'qi' ? derived.upkeep : ZERO))
      shares[res] = demand.gt(0) ? moneyToRatio(available.div(demand)) : 1
    }
    for (const b of consumers) {
      const drawRes = Object.keys(b.upkeep || {})
      const p = buildingPowerDraw(state, b)
      if (p) drawRes.push(p.res)
      const factor = Math.min(...drawRes.map((res) => shares[res] ?? 1))
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
  if (economyDetailsEnabled(state)) finishDerived(state, derived)
  Object.assign(output, derived)
  return output
}
