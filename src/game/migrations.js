import { RESOURCES } from '@/data/resources'
import { JOBS } from '@/data/jobs'
import { CONFIG } from '@/data/config'
import { CRAFT_MAP, DEFAULT_QUICK_CRAFTS, normalizeQuickCrafts } from '@/data/crafts'
import { RECIPE_STATIONS } from '@/data/industry'
import { EVENT_MAP, getEventLevel } from '@/data/events'
import { floorNumber } from './numbers'
import { normalizeDisciples } from '@/data/disciples'


/** 历史字段迁移保持独立，当前结构校验由 saveSchema 负责。 */
export function migrateState(state, fresh, { preferMembers = false } = {}) {
  const merged = { ...fresh, ...state }
  merged.resources = { ...fresh.resources, ...(state.resources || {}) }
  // 整枚计数的资源（灵石/丹药/符箓/法器）在旧档里可能被算成小数（涨价/折扣/祭炼留下的），读档时抹平
  for (const r of RESOURCES) {
    if (r.integer) merged.resources[r.id] = floorNumber(merged.resources[r.id] || 0)
  }
  merged.seen = { ...fresh.seen, ...(state.seen || {}) }
  merged.peak = state.peak || {}
  merged.disciples = {
    ...fresh.disciples,
    ...(state.disciples || {}),
    jobs: { ...fresh.disciples.jobs, ...((state.disciples && state.disciples.jobs) || {}) },
  }
  // 采石工并入矿工，原有分配相加，人口总数保持不变。
  merged.disciples.jobs.miner = (merged.disciples.jobs.miner || 0) + (merged.disciples.jobs.stonecutter || 0)
  delete merged.disciples.jobs.stonecutter
  // 旧档的天赋序列从原灵根种子派生，不随每次读取时的新档时间变化。
  merged.disciples.talentSeed = state.disciples?.talentSeed ?? ((state.disciples?.rootSeed ?? 1) ^ 0x6d2b79f5) >>> 0
  merged.disciples.recruitSeed = state.disciples?.recruitSeed ?? ((state.disciples?.rootSeed ?? 1) ^ 0x1b873593) >>> 0
  normalizeDisciples(merged.disciples, { preferMembers })
  // 老档补「飞升层」与「转世计数」
  merged.dao = state.dao || 0
  merged.stats = { ...(merged.stats || {}) }
  merged.stats.reincarnations = merged.stats.reincarnations || 0
  merged.buildings = Object.fromEntries(Object.entries(state.buildings || {}).map(([id, entry]) => [id, { ...entry }]))
  // 首次拆分藏经阁时，原有书架迁入同数量典籍库，保留旧档的仓容与合计产出。
  if (state.scriptureArchiveVersion !== 1 && !merged.buildings.scriptureArchive) {
    const library = merged.buildings.library
    if (Number.isInteger(library?.count) && library.count > 0) {
      merged.buildings.scriptureArchive = { count: library.count, on: library.on !== false }
    }
  }
  merged.scriptureArchiveVersion = 1
  // 旧档已有人口或建设进度时视为已领取首屋，防止拆屋读档重复免木料。
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
        (state.stats?.crafted?.immortalHerb || 0) > 0 || state.autoCraft?.growImmortalHerb) {
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
  // v0.38：九转炼丹的前置由法宝 alchemyCauldron 改为研究 alchemyEssence + 丹鼎。
  // 为避免已炼成九转丹炉的旧档回锁，补发 alchemyEssence（不重复收费）；无该法宝则不动。
  if (state.alchemyProgressionVersion !== 1 && merged.upgrades.alchemyCauldron) {
    merged.upgrades.alchemyEssence = true
    // 原配方仅需九转丹炉。保留本世解锁资格，不赠送有仓储和增产效果的丹鼎。
    merged.legacyNineTurnPill = true
  }
  merged.alchemyProgressionVersion = 1
  merged.achievements = state.achievements || {}
  merged.craftProgress = state.craftProgress || {}
  merged.autoCraft = state.autoCraft || {}
  if (!Object.hasOwn(state.resources || {}, 'qiParticle') &&
      (merged.autoCraft.condenseCrystal || merged.autoCraft.growImmortalHerb)) {
    merged.autoCraft = { ...merged.autoCraft, condenseLiquid: true }
  }
  merged.craftTargets = { ...fresh.craftTargets, ...(state.craftTargets || {}) }
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
    if (!Number.isFinite(p.herbLoss)) p.herbLoss = 20
    p.herbLoss = Math.max(0, Math.min(80, p.herbLoss))
  }
  merged.log = Array.isArray(state.log) ? state.log.filter(entry => entry && typeof entry === 'object').map(entry => {
    const event = Object.hasOwn(EVENT_MAP, entry.eventId) ? EVENT_MAP[entry.eventId] : null
    return event ? { ...entry, eventLevel: getEventLevel(event).id } : entry
  }) : []
  merged.stats = { ...fresh.stats, ...(state.stats || {}) }
  merged.stats.crafted = { ...(state.stats && state.stats.crafted) }
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
    .filter(([id, value]) => Object.hasOwn(fresh.resources, id) && Number.isFinite(value) && value >= 0))
  for (const key of ['autoCraft', 'craftTargets', 'craftTimers', 'craftProgress']) {
    merged[key] = { ...merged[key] }
    if (Object.hasOwn(merged[key], 'condenseStone') && !Object.hasOwn(merged[key], 'infuseStone')) merged[key].infuseStone = merged[key].condenseStone
    delete merged[key].condenseStone
  }
  if (merged.settings.autoCraftPriority === 'condenseStone') merged.settings.autoCraftPriority = 'infuseStone'
  if (Array.isArray(merged.settings.quickCrafts)) merged.settings.quickCrafts = merged.settings.quickCrafts.map(id => id === 'condenseStone' ? 'infuseStone' : id)
  merged.settings.quickCrafts = normalizeQuickCrafts(merged.settings.quickCrafts)
  merged.ui = { ...fresh.ui, ...(state.ui || {}) }
  retireBeastTaming(merged, state)
  // 读档保留增益，由在线/离线时间轴处理到期。
  return merged
}

/** 移除驯养支线前先补偿旧档；未知条目过滤发生在这之后。 */
function retireBeastTaming(merged, original) {
  const retired = original.beastRetirementVersion !== 1
  const refunds = {}
  const add = (resource, amount) => {
    refunds[resource] = Math.min(Number.MAX_SAFE_INTEGER, (refunds[resource] || 0) + amount)
  }
  const count = value => Number.isSafeInteger(value) && value > 0 ? value : 0
  // 参考历史造价逐项向上取整，溢出或极端数量在有限次迭代内饱和。
  const sum = (base, ratio, times) => {
    let total = 0, next = base
    for (let index = 0; index < times && total < Number.MAX_SAFE_INTEGER; index++) {
      total = Math.min(Number.MAX_SAFE_INTEGER, total + Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(next)))
      next *= ratio
    }
    return total
  }
  if (retired) {
    const gardens = count(original.buildings?.beastGarden?.count)
    for (const [resource, base] of Object.entries({ wood: 6000, plank: 30, herb: 4000, stone: 6000 })) {
      if (gardens) add(resource, Math.floor(sum(base, 1.45, gardens) / 2))
    }
    if (original.upgrades?.beastTaming === true) {
      for (const [resource, amount] of Object.entries({ insight: 60000, stone: 2800, herb: 1500 })) add(resource, amount)
    }
    if (original.upgrades?.beastBell === true) {
      const levels = count(original.treasureLevels?.beastBell)
      for (const [resource, base] of Object.entries({ insight: 1200, herb: 5000, pill: 20, stone: 4000 })) {
        add(resource, base + sum(resource === 'insight' ? 4000 : base, 1.7, levels))
      }
    }
    for (const [resource, amount] of Object.entries(refunds)) {
      const have = Number.isFinite(merged.resources[resource]) ? Math.max(0, merged.resources[resource]) : 0
      // 允许保留超仓补偿库存，正常消费；不让满仓吞掉旧投入。
      merged.resources[resource] = Math.min(Number.MAX_SAFE_INTEGER, have + amount)
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
