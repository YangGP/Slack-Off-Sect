import { RESOURCES, UNCAPPED_CRAFTED_RESOURCES } from '@/data/resources'
import { JOBS } from '@/data/jobs'
import { CONFIG } from '@/data/config'
import { CRAFT_MAP, DEFAULT_QUICK_CRAFTS, normalizeQuickCrafts } from '@/data/crafts'
import { RECIPE_STATIONS } from '@/data/industry'
import { EVENT_MAP, getEventLevel } from '@/data/events'
import { ZERO, money, moneyClamp, moneyGt, moneyMax, moneyNonNegative } from './decimal'
import { normalizeDisciples } from '@/data/disciples'
import { WAREHOUSE_CAPACITY_VERSION, LEGACY_WAREHOUSE_IDS, LEGACY_STORAGE_DELTA } from '@/data/buildings'
import { STORAGE_MERGE_VERSION, STORAGE_MERGE_GROUPS, PRE_MERGE_STORAGE, PRE_MERGE_STORAGE_ALL } from '@/data/storage'


/** 旧档金额：损坏值回退 0，负数按 0 处理（与读档解码同口径）。 */
const nonNegativeMoney = value => moneyNonNegative(value, ZERO)

/** 历史字段迁移保持独立，当前结构校验由 saveSchema 负责。 */
export function migrateState(state, fresh, { preferMembers = false } = {}) {
  const merged = { ...fresh, ...state }
  merged.resources = { ...fresh.resources, ...(state.resources || {}) }
  // 猎备（huntPreparation）更名为信符（warrant）：旧档存量平移，外交与猎杀自此共用。
  // 新旧数值各自独立校验（有限非负），避免非法旧值把合法新值污染成 NaN 后归零。
  if (Object.hasOwn(merged.resources, 'huntPreparation')) {
    const validNew = nonNegativeMoney(merged.resources.warrant)
    const validOld = nonNegativeMoney(merged.resources.huntPreparation)
    merged.resources.warrant = moneyMax(validNew, validOld)
    delete merged.resources.huntPreparation
  }
  merged.seen = { ...fresh.seen, ...(state.seen || {}) }
  merged.peak = { ...(state.peak || {}) }
  // 旧档的 seen/peak 里可能残留 huntPreparation：迁移到 warrant，只认字面 true 的 seen 标记。
  if (Object.hasOwn(merged.seen, 'huntPreparation')) {
    if (merged.seen.huntPreparation === true) merged.seen.warrant = true
    delete merged.seen.huntPreparation
  }
  if (Object.hasOwn(merged.peak, 'huntPreparation')) {
    const validNew = nonNegativeMoney(merged.peak.warrant)
    const validOld = nonNegativeMoney(merged.peak.huntPreparation)
    merged.peak.warrant = moneyMax(validNew, validOld)
    delete merged.peak.huntPreparation
  }
  merged.disciples = {
    ...fresh.disciples,
    ...(state.disciples || {}),
    jobs: { ...fresh.disciples.jobs, ...((state.disciples && state.disciples.jobs) || {}) },
  }
  // 缺标记必须进入旧年度线换算，不能被 fresh 的新版本默认值提前遮蔽。
  merged.disciples.cultivationVersion = state.disciples?.cultivationVersion ?? 0
  // 采石工并入矿工，原有分配相加，人口总数保持不变。
  merged.disciples.jobs.miner = (merged.disciples.jobs.miner || 0) + (merged.disciples.jobs.stonecutter || 0)
  delete merged.disciples.jobs.stonecutter
  // 旧档的天赋序列从原灵根种子派生，不随每次读取时的新档时间变化。
  merged.disciples.talentSeed = state.disciples?.talentSeed ?? ((state.disciples?.rootSeed ?? 1) ^ 0x6d2b79f5) >>> 0
  merged.disciples.recruitSeed = state.disciples?.recruitSeed ?? ((state.disciples?.rootSeed ?? 1) ^ 0x1b873593) >>> 0
  normalizeDisciples(merged.disciples, { preferMembers })
  // 老档补「飞升层」与「转世计数」
  merged.dao = nonNegativeMoney(state.dao)
  merged.stats = { ...fresh.stats, ...(merged.stats || {}) }
  merged.stats.reincarnations = merged.stats.reincarnations || 0
  merged.buildings = Object.fromEntries(Object.entries(state.buildings || {}).map(([id, entry]) => [id, { ...entry }]))
  const warehouseVersion = state.warehouseCapacityVersion
  const legacyWarehouseVersion = !Object.hasOwn(state, 'warehouseCapacityVersion') || warehouseVersion === 0
  if (!legacyWarehouseVersion && warehouseVersion !== WAREHOUSE_CAPACITY_VERSION) {
    throw new Error('仓库容量标记无法兼容')
  }
  const warehouseCount = id => Number.isFinite(state.buildings?.[id]?.count)
    ? Math.max(0, Math.floor(state.buildings[id].count)) : 0
  merged.warehouseCapacityVersion = WAREHOUSE_CAPACITY_VERSION
  merged.legacyWarehouseCounts = legacyWarehouseVersion
    ? Object.fromEntries(LEGACY_WAREHOUSE_IDS.map(id => [id, warehouseCount(id)]))
    : Object.fromEntries(LEGACY_WAREHOUSE_IDS.map(id => [id, Number.isFinite(state.legacyWarehouseCounts?.[id])
      ? Math.max(0, Math.floor(state.legacyWarehouseCounts[id])) : 0]))
  // 首次拆分藏经阁时，原有书架迁入同数量典籍库，保留旧档的仓容与合计产出。
  if (state.scriptureArchiveVersion !== 1 && !merged.buildings.scriptureArchive) {
    const library = merged.buildings.library
    if (Number.isInteger(library?.count) && library.count > 0) {
      merged.buildings.scriptureArchive = { count: library.count, on: library.on !== false }
    }
  }
  merged.scriptureArchiveVersion = 1
  // 保留旧档首屋历史标记供拆除兼容；这些字段不再影响新建费用或展示。
  merged.starterHutBuilt = typeof state.starterHutBuilt === 'boolean' ? state.starterHutBuilt :
    ((merged.buildings.hut?.count || 0) > 0 || (merged.disciples.total || 0) > 0 || (state.stats?.recruits || 0) > 0 ||
      ['logHouse', 'mansion', 'caveDwelling'].some(id => (merged.buildings[id]?.count || 0) > 0))
  merged.starterHutStanding = !!state.starterHutStanding && merged.starterHutBuilt && (merged.buildings.hut?.count || 0) > 0
  merged.upgrades = { ...(state.upgrades || {}) }
  merged.upgradeEnabled = Object.fromEntries(Object.entries(state.upgradeEnabled || {})
    .filter(([id, enabled]) => merged.upgrades[id] && enabled === false))
  // 已移除的早期空间技艺不再参与研究、统计或容量计算。
  delete merged.upgrades.storageBag
  delete merged.upgrades.voidPouch
  delete merged.upgrades.catalogArt
  // v0.14 及更早的存档没有灵气分子字段；只迁移一次，保留旧分灵设施的正负灵子产线。
  if (!Object.hasOwn(state.resources || {}, 'qiParticle')) {
    const split = merged.buildings.splitArray
    if (split?.count > 0) {
      merged.buildings.polarizeArray = merged.buildings.polarizeArray || { ...split }
      merged.upgrades.particleTheory = true
    }
    // 已使用凝晶／育仙草的旧档应能继续供料，不要求重新解锁上游新配方。
    if (merged.upgrades.crystalTheory || merged.upgrades.crystalCraft ||
        moneyGt(state.stats?.crafted?.immortalHerb ?? ZERO, ZERO) || state.autoCraft?.growImmortalHerb) {
      merged.upgrades.liquidArt = true
    }
  }
  // v2 将凝聚章串成递进链；只为历史已学节点补新增上游，不给新档免费研究。
  if (state.qiLiquidVersion !== 2) {
    if (merged.upgrades.crystalTheory) merged.upgrades.qiPurify = true
    if (merged.upgrades.qiPurify) merged.upgrades.liquidArt = true
    if (merged.upgrades.liquidArt) merged.upgrades.qiLiquid = true
    if (merged.upgrades.qiLiquid) merged.upgrades.qiMeasure = true
  }
  merged.qiLiquidVersion = 2
  // 纸张成为道札与符箓的共同载体：已产出过相关成品、或已开着相关自动产线的旧档补《抄纸法》，
  // 避免新前置把旧档的自动产线回锁。新档不满足条件，不免费发研究。
  if (!merged.upgrades.paperArt) {
    const crafted = state.stats?.crafted || {}
    const usedPaper = ['daoNote', 'daoTreatise', 'arrayDiagram', 'talisman', 'spiritTalisman']
      .some(id => moneyGt(crafted[id] ?? ZERO, ZERO))
    const autoPaper = ['recordDaoNote', 'drawTalisman', 'drawSpiritTalisman'].some(id => state.autoCraft?.[id])
    if (usedPaper || autoPaper) merged.upgrades.paperArt = true
  }
  // v0.38：九转炼丹的前置由法宝 alchemyCauldron 改为研究 alchemyEssence + 丹鼎。
  // 为避免已炼成九转丹炉的旧档回锁，补发 alchemyEssence（不重复收费）；无该法宝则不动。
  if (state.alchemyProgressionVersion !== 1 && merged.upgrades.alchemyCauldron) {
    merged.upgrades.alchemyEssence = true
    // 原配方仅需九转丹炉。保留本世解锁资格，不赠送有仓储和增产效果的丹鼎。
    merged.legacyNineTurnPill = true
  }
  merged.alchemyProgressionVersion = 1
  merged.achievements = state.achievements || {}
  // 旧版未入库的小数收益一次性转入库存；清空余量保证反复读档不重复发放。
  merged.craftProgress = {}
  merged.stats.crafted = { ...(merged.stats.crafted || {}) }
  for (const [id, value] of Object.entries(state.craftProgress || {})) {
    const recipe = CRAFT_MAP[id]
    if (!recipe) continue
    const remainder = nonNegativeMoney(value)
    if (!remainder.gt(0)) continue
    merged.resources[recipe.out] = nonNegativeMoney(merged.resources[recipe.out]).plus(remainder)
    merged.stats.crafted[recipe.out] = nonNegativeMoney(merged.stats.crafted[recipe.out]).plus(remainder)
  }
  if (state.hunting?.yieldRemainders) {
    for (const [id, value] of Object.entries(state.hunting.yieldRemainders)) {
      if (!RESOURCES.some(r => r.id === id)) continue
      merged.resources[id] = nonNegativeMoney(merged.resources[id]).plus(nonNegativeMoney(value))
    }
    merged.hunting = { ...state.hunting, yieldRemainders: {} }
  }
  merged.autoCraft = state.autoCraft || {}
  if (!Object.hasOwn(state.resources || {}, 'qiParticle') &&
      (merged.autoCraft.condenseCrystal || merged.autoCraft.growImmortalHerb)) {
    merged.autoCraft = { ...merged.autoCraft, condenseLiquid: true }
  }
  merged.craftTargets = { ...fresh.craftTargets, ...(state.craftTargets || {}) }
  // 旧催化进度不追缴：今后每份直接扣 0.01 秘银。
  delete merged.catalystProgress
  merged.craftTimers = state.craftTimers || state.craftQueue || {}
  merged.craftOrders = Object.fromEntries(Object.entries(state.craftOrders || {})
    .filter(([id, order]) => Object.hasOwn(RECIPE_STATIONS, id) && Number.isInteger(order?.remaining) && order.remaining > 0 && order.remaining <= 1000000)
    .map(([id, order]) => [id, { remaining: order.remaining, paused: order.paused === true }]))
  merged.treasureLevels = state.treasureLevels || {}
  merged.buffs = Array.isArray(state.buffs) ? state.buffs : []
  merged.affairs = { ...fresh.affairs }
  for (const key of Object.keys(fresh.affairs)) {
    const value = state.affairs?.[key]
    if (Number.isFinite(value) && value >= 0) merged.affairs[key] = value
  }
  merged.pendingChoice = state.pendingChoice?.id ? { ...state.pendingChoice } : null
  if (merged.pendingChoice?.id === 'beastThreat') {
    const p = merged.pendingChoice
    if (!Number.isFinite(p.deadline)) p.deadline = (Number.isFinite(p.at) ? p.at : fresh.createdAt) + 300000
    // 预计损失是灵草数量（金额）：按 0~80 的既有范围夹取，损坏值回退 20。
    p.herbLoss = moneyClamp(nonNegativeMoney(p.herbLoss, money(20)), ZERO, money(80))
  }
  merged.log = Array.isArray(state.log) ? state.log.filter(entry => entry && typeof entry === 'object').map(entry => {
    const event = Object.hasOwn(EVENT_MAP, entry.eventId) ? EVENT_MAP[entry.eventId] : null
    return event ? { ...entry, eventLevel: getEventLevel(event).id } : entry
  }) : []
  merged.settings = { ...fresh.settings, ...(state.settings || {}) }
  const legacySpeed = CONFIG.AUTO_CRAFT_SPEEDS.includes(state.settings?.autoCraftSpeed) ? state.settings.autoCraftSpeed : 1
  merged.settings.autoCraftSpeeds = Object.fromEntries(Object.keys(CRAFT_MAP).map(id => {
    const speed = state.settings?.autoCraftSpeeds?.[id]
    return [id, CONFIG.AUTO_CRAFT_SPEEDS.includes(speed) ? speed : speed === undefined ? legacySpeed : 1]
  }))
  delete merged.settings.autoCraftSpeed
  merged.settings.processingModes = Object.fromEntries(Object.entries(state.settings?.processingModes || {})
    .filter(([id, value]) => Object.values(RECIPE_STATIONS).includes(id) && ['normal', 'overload', 'energy'].includes(value)))
  merged.settings.craftWeights = Object.fromEntries(Object.entries(state.settings?.craftWeights || {})
    .filter(([id, value]) => Object.hasOwn(RECIPE_STATIONS, id) && Number.isInteger(value) && value >= 1 && value <= 100))
  // 旧自动计时按调速后的秒数保存；工业工位改存基础加工秒数，保持一份的完成比例。
  if (!state.industryVersion && merged.realm >= 4) {
    merged.craftTimers = Object.fromEntries(Object.entries(merged.craftTimers).map(([id, timer]) => [id, {
      ...timer, t: (Number.isFinite(timer.t) ? Math.max(0, timer.t) : 0) *
        (RECIPE_STATIONS[id] && merged.upgrades.craftTempo ? merged.settings.autoCraftSpeeds[id] || 1 : 1),
    }]))
  }
  merged.industryVersion = 1
  merged.settings.craftReserves = Object.fromEntries(Object.entries(state.settings?.craftReserves || {})
    .filter(([id]) => Object.hasOwn(fresh.resources, id))
    .map(([id, value]) => [id, nonNegativeMoney(value)]))
  // 无上限加工品不能继续按仓容取百分比。旧道果自动化保守保留全部现有加工品，
  // 高于现有库存的显式定额保持不变；仅迁移一次，玩家可在逐项保留中调整。
  if (state.uncappedCraftVersion !== 1 && merged.dao.gte(1) && Number(merged.settings.craftReservePercent) > 0) {
    for (const id of UNCAPPED_CRAFTED_RESOURCES) {
      merged.settings.craftReserves[id] = moneyMax(merged.settings.craftReserves[id] ?? ZERO, merged.resources[id] ?? ZERO)
    }
    merged.logSeq = Math.min(Number.MAX_SAFE_INTEGER, (Number.isSafeInteger(merged.logSeq) && merged.logSeq >= 0 ? merged.logSeq : 0) + 1)
    merged.log.unshift({ id: merged.logSeq, at: merged.lastSaveAt, kind: 'info',
      text: '加工品已取消仓容：原百分比保留已改为保留当前加工品库存（已有更高定额不变），可在炼制页逐项保留中调整。原料仍按仓容比例保留。' })
  }
  merged.uncappedCraftVersion = 1
  for (const key of ['autoCraft', 'craftTargets', 'craftTimers', 'craftProgress']) {
    merged[key] = { ...merged[key] }
    if (Object.hasOwn(merged[key], 'condenseStone') && !Object.hasOwn(merged[key], 'infuseStone')) merged[key].infuseStone = merged[key].condenseStone
    delete merged[key].condenseStone
  }
  if (merged.settings.autoCraftPriority === 'condenseStone') merged.settings.autoCraftPriority = 'infuseStone'
  if (Array.isArray(merged.settings.quickCrafts)) merged.settings.quickCrafts = merged.settings.quickCrafts.map(id => id === 'condenseStone' ? 'infuseStone' : id)
  merged.settings.quickCrafts = normalizeQuickCrafts(merged.settings.quickCrafts)
  merged.ui = { ...fresh.ui, ...(state.ui || {}) }
  retireInfusionAltar(merged)
  retireBeastTaming(merged, state)
  mergeStorageBuildings(merged, state)
  // 读档保留增益，由在线/离线时间轴处理到期。
  return merged
}

/** 旧仓库合并为实体数量与每座保留定额；不发材料、不补研究，不反复累加。 */
function mergeStorageBuildings(merged, original) {
  if (original.warehouseMergeVersion === STORAGE_MERGE_VERSION) return
  merged.legacyStorage = {}
  const countOf = entry => Number.isFinite(entry?.count) ? Math.max(0, Math.floor(entry.count)) : 0
  for (const [target, ids] of Object.entries(STORAGE_MERGE_GROUPS)) {
    const count = Math.min(Number.MAX_SAFE_INTEGER, ids.reduce((sum, id) => sum + countOf(merged.buildings[id]), 0))
    if (count > 0) {
      const storage = {}
      for (const id of ids) {
        const n = countOf(merged.buildings[id])
        const legacy = Math.min(n, merged.legacyWarehouseCounts[id] || 0)
        for (const resource of RESOURCES) {
          if (!Number.isFinite(resource.baseMax) || resource.isolatedStorage) continue
          const base = (PRE_MERGE_STORAGE[id]?.[resource.id] || 0) + (PRE_MERGE_STORAGE_ALL[id] || 0) * (resource.storageWeight ?? 1)
          const amount = money(base).times(n).plus(money(LEGACY_STORAGE_DELTA[id]?.[resource.id] || 0).times(legacy))
          if (amount.gt(0)) storage[resource.id] = (storage[resource.id] || ZERO).plus(amount)
        }
      }
      // 平均后向上取整，避免小数除不尽导致旧容量减少；保留量只绑定现有旧建筑。
      merged.legacyStorage[target] = { count, storage: Object.fromEntries(Object.entries(storage).map(([id, total]) => [id, total.div(count).ceil()])) }
      const previous = merged.buildings[target]
      merged.buildings[target] = { ...(previous || {}), count, on: previous ? previous.on !== false : target !== 'grotto' }
    }
    for (const id of ids) if (id !== target) delete merged.buildings[id]
  }
  if (merged.rebuild?.buildings) {
    const buildings = { ...merged.rebuild.buildings }
    for (const [target, ids] of Object.entries(STORAGE_MERGE_GROUPS)) {
      const total = ids.reduce((sum, id) => sum + countOf({ count: buildings[id] }), 0)
      if (total) buildings[target] = Math.min(total, Number.MAX_SAFE_INTEGER)
      for (const id of ids) if (id !== target) delete buildings[id]
    }
    merged.rebuild = { ...merged.rebuild, buildings }
  }
  merged.legacyWarehouseCounts = Object.fromEntries(LEGACY_WAREHOUSE_IDS.map(id => [id, 0]))
  merged.warehouseMergeVersion = STORAGE_MERGE_VERSION
}

/**
 * 移除驯养支线前先补偿旧档；未知条目过滤发生在这之后。
 * 补偿金额全程 Decimal：旧档补偿不再受 Number.MAX_SAFE_INTEGER 截断，但迭代次数仍有上限，
 * 免得损坏的极端建筑数把读档卡死（正常存档的家园数远低于此）。
 */
const REFUND_ITERATION_CAP = 4096

/** 注灵台退役：先按原参考造价返还，再移除旧条目；重复读档不再补偿。 */
function retireInfusionAltar(state) {
  const entry = state.buildings.infusionAltar
  const count = Number.isSafeInteger(entry?.count) && entry.count > 0 ? Math.min(entry.count, REFUND_ITERATION_CAP) : 0
  if (count > 0) {
    let scale = money(1), total = ZERO
    for (let i = 0; i < count; i++) { total = total.plus(scale); scale = scale.times('1.3') }
    for (const [res, unit] of Object.entries({ stone: 500, spiritLiquid: 4, insight: 800 })) {
      state.resources[res] = nonNegativeMoney(state.resources[res]).plus(total.times(unit))
      state.seen[res] = true
      state.peak[res] = moneyMax(nonNegativeMoney(state.peak[res]), state.resources[res])
    }
    state.logSeq = Math.min(Number.MAX_SAFE_INTEGER, (Number.isSafeInteger(state.logSeq) ? state.logSeq : 0) + 1)
    state.log.unshift({ id: state.logSeq, at: state.lastSaveAt, kind: 'info', text: '注灵台已移除，按原参考造价返还建造材料。学会《注灵原理》后，可在灵石矿旁手动开启灵液增产，默认关闭。' })
  }
  delete state.buildings.infusionAltar
}

function retireBeastTaming(merged, original) {
  const retired = original.beastRetirementVersion !== 1
  const refunds = {}
  const add = (resource, amount) => {
    refunds[resource] = (refunds[resource] || ZERO).plus(money(amount))
  }
  const count = value => Number.isSafeInteger(value) && value > 0 ? value : 0
  // 参考历史造价逐项向上取整；超出迭代上限后按已完成的部分结算。
  const sum = (base, ratio, times) => {
    let total = ZERO, next = money(base)
    const steps = Math.min(times, REFUND_ITERATION_CAP)
    for (let index = 0; index < steps; index++) {
      total = total.plus(next)
      next = next.times(ratio)
    }
    return total
  }
  if (retired) {
    const gardens = count(original.buildings?.beastGarden?.count)
    for (const [resource, base] of Object.entries({ wood: 6000, plank: 30, herb: 4000, stone: 6000 })) {
      if (gardens) add(resource, sum(base, 1.45, gardens).div(2))
    }
    if (original.upgrades?.beastTaming === true) {
      for (const [resource, amount] of Object.entries({ insight: 60000, stone: 2800, herb: 1500 })) add(resource, amount)
    }
    if (original.upgrades?.beastBell === true) {
      const levels = count(original.treasureLevels?.beastBell)
      for (const [resource, base] of Object.entries({ insight: 1200, herb: 5000, pill: 20, stone: 4000 })) {
        add(resource, money(base).plus(sum(resource === 'insight' ? 4000 : base, 1.7, levels)))
      }
    }
    for (const [resource, amount] of Object.entries(refunds)) {
      // 允许保留超仓补偿库存，正常消费；不让满仓吞掉旧投入。
      merged.resources[resource] = nonNegativeMoney(merged.resources[resource]).plus(amount)
    }
    if (Object.keys(refunds).length) {
      const sequence = Number.isSafeInteger(merged.logSeq) && merged.logSeq >= 0 ? merged.logSeq : 0
      merged.logSeq = Math.min(Number.MAX_SAFE_INTEGER, sequence + 1)
      merged.log.unshift({ id: merged.logSeq, at: merged.lastSaveAt,
        text: '驯养支线已移除：灵兽园按参考建造费用返还一半，灵兽驯养与驭兽铃按参考研究、炼成及祭炼费用补偿；超仓材料可正常消费。', kind: 'info' })
    }
  }
  delete merged.buildings.beastGarden
  delete merged.upgrades.beastTaming
  delete merged.upgrades.beastBell
  delete merged.upgradeEnabled.beastBell
  merged.treasureLevels = { ...merged.treasureLevels }
  delete merged.treasureLevels.beastBell
  merged.beastRetirementVersion = 1
}
