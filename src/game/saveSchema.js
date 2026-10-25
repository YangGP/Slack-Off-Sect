import { RESOURCE_MAP, RESOURCE_GROUPS } from '@/data/resources'
import { BUILDING_MAP, WAREHOUSE_CAPACITY_VERSION, LEGACY_WAREHOUSE_IDS } from '@/data/buildings'
import { buildingMeta, PRODUCTION_STAGES } from '@/data/productionStages'
import { invitationCapacity } from '@/data/samsara'
import { STORAGE_MERGE_VERSION, STORAGE_MERGE_GROUPS } from '@/data/storage'
import { UPGRADE_MAP } from '@/data/upgrades'
import { CRAFT_MAP } from '@/data/crafts'
import { ACHIEVEMENTS } from '@/data/achievements'
import { EVENT_MAP } from '@/data/events'
import { REALMS } from '@/data/realms'
import { MODULES } from '@/data/modules'
import { moduleSaveKeys, normalizeModuleSlices } from '@/game/moduleRegistry'
import { ZERO, moneyNonNegative } from '@/game/decimal'
import { normalizeAnalytics } from '@/game/analyticsState'
import { D7_RULESET, normalizeFaithProgression } from '@/data/faith'
import { normalizeKarmaProgression } from '@/data/karmaShop'
import { normalizeSamsara, normalizeWorlds, normalizeChallenge } from '@/data/samsara'

/** 存档结构版本：v3 起金额字段以十进制字符串保存（v1/v2 为 JSON number）。 */
export const SAVE_VERSION = 3
/** 核心存档字段；功能模块的切片键（如 hunting）在末尾动态追加 */
const CORE_SAVE_FIELDS = [
  'version', 'createdAt', 'lastTickAt', 'lastSaveAt', 'resources', 'seen', 'peak',
  'disciples', 'arrivalTimer', 'totalDays', 'treasureLevels', 'craftTimers', 'craftOrders',
  'uncappedCraftVersion', 'warehouseCapacityVersion', 'legacyWarehouseCounts', 'warehouseMergeVersion', 'legacyStorage', 'industryVersion', 'qiLiquidVersion', 'alchemyProgressionVersion', 'scriptureArchiveVersion', 'beastRetirementVersion', 'buildings', 'starterHutBuilt', 'starterHutStanding', 'upgrades',
  'upgradeEnabled', 'achievements', 'craftProgress', 'autoCraft', 'craftTargets', 'realm', 'legacyNineTurnPill',
  'karma', 'dao', 'habitabilityPenalty', 'starvationTimer', 'leaveTimer', 'buffs',
  'pendingChoice', 'affairs', 'log', 'logSeq', 'nextEventAt', 'stats', 'settings', 'analytics', 'ui',
  'ruleset', 'faithProgression', 'karmaProgression', 'samsara', 'worlds', 'challenge', 'invitations', 'invitationTimer', 'rebuild',
]
export const SAVE_FIELDS = [...CORE_SAVE_FIELDS, ...moduleSaveKeys()]

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Number 控制域的安全数字：建筑数、时间戳、人数、次数统计继续走这里。
 * **金额不走这里** —— 金额由 moneyValue/moneyMap 处理，不夹到 MAX_SAFE_INTEGER。
 */
export function safeNumber(value, fallback = 0, max = Number.MAX_SAFE_INTEGER) {
  return Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback
}

/** 单个金额字段：损坏或负数回退 ZERO（格式已在读档解码阶段清洗过）。 */
export function moneyValue(value, fallback = ZERO) {
  return moneyNonNegative(value, fallback)
}

/** 金额映射（资源、峰值、制作进度/目标、材料保留量等）：只保留目录内的已知键。 */
export function moneyMap(values, catalog) {
  return Object.fromEntries(Object.entries(values || {})
    .filter(([id]) => Object.hasOwn(catalog, id))
    .map(([id, value]) => [id, moneyValue(value)]))
}

/** 经济累计类统计：这些键是金额，其余统计仍是 Number 计数。 */
const STATS_MONEY_KEYS = ['totalQi', 'totalInsight', 'totalFaith', 'lifeInsight', 'offlineGains']

/** 结构冲突与单个数值损坏分开处理；浏览器加载／导入遇结构冲突时保护原档。 */
export function assertSaveShape(data) {
  if (!isRecord(data)) throw new Error('存档必须是对象')
  if (data.warehouseMergeVersion != null && ![0, STORAGE_MERGE_VERSION].includes(data.warehouseMergeVersion)) throw new Error('仓储合并标记无法兼容')
  if (Object.hasOwn(data, 'warehouseCapacityVersion') &&
      (!Number.isInteger(data.warehouseCapacityVersion) || data.warehouseCapacityVersion < 0)) {
    throw new Error('仓库容量标记无效')
  }
  for (const key of ['resources', 'buildings', 'disciples', 'stats', 'settings', 'ui',
    'peak', 'upgrades', 'upgradeEnabled', 'achievements', 'autoCraft', 'craftTargets', 'legacyStorage',
    'craftTimers', 'craftQueue', 'craftOrders', 'craftProgress', 'treasureLevels', 'affairs', 'faithProgression', 'karmaProgression', 'samsara', 'worlds', 'challenge', 'rebuild', 'legacyWarehouseCounts', ...moduleSaveKeys()]) {
    if (data[key] != null && !isRecord(data[key])) throw new Error(`存档结构冲突：${key}`)
  }
  for (const key of ['jobs']) {
    if (data.disciples?.[key] != null && !isRecord(data.disciples[key])) throw new Error(`存档结构冲突：disciples.${key}`)
  }
  // 缺失切片／子映射沿用默认值；已有字段结构损坏不能静默清空永久修持。
  for (const key of ['rituals', 'cultivation']) {
    if (data.faithProgression?.[key] != null && !isRecord(data.faithProgression[key])) {
      throw new Error(`存档结构冲突：faithProgression.${key}`)
    }
  }
  for (const key of ['levels']) {
    if (data.karmaProgression?.[key] != null && !isRecord(data.karmaProgression[key])) {
      throw new Error(`存档结构冲突：karmaProgression.${key}`)
    }
    if (data.samsara?.[key] != null && !isRecord(data.samsara[key])) throw new Error(`存档结构冲突：samsara.${key}`)
  }
  if (data.samsara?.version != null && data.samsara.version !== 1) throw new Error('轮回规则版本无法兼容')
  if (data.samsara?.records != null && !Array.isArray(data.samsara.records)) throw new Error('存档结构冲突：samsara.records')
  if (data.disciples?.cultivationVersion != null && ![0, 1].includes(data.disciples.cultivationVersion)) throw new Error('弟子培养规则版本无法兼容')
  // 防止损坏的人数导致读档生成海量个体；不影响已有成员的正常存取。
  if (data.disciples?.total > 100000) throw new Error('存档人数超出可恢复范围')
}

const numericMap = (values, catalog, integer = false) => Object.fromEntries(
  Object.entries(values || {}).filter(([id]) => Object.hasOwn(catalog, id))
    .map(([id, value]) => [id, integer ? Math.floor(safeNumber(value)) : safeNumber(value)]),
)
const flags = (values, catalog) => Object.fromEntries(Object.entries(values || {})
  .filter(([id, value]) => Object.hasOwn(catalog, id) && value === true))
/** 模块始终启用，旧档关闭标记统一归一为 true。 */
const sanitizeModuleFlags = () => Object.fromEntries(MODULES.map(m => [m.id, true]))

/** 迁移后校验：仅持久化已知字段；金额为有限非负 Decimal，控制域为有限非负 Number。 */
export function validateState(state, fresh) {
  const result = Object.fromEntries(SAVE_FIELDS.map(key => [key, state[key] ?? fresh[key]]))
  result.version = SAVE_VERSION
  result.legacyNineTurnPill = result.legacyNineTurnPill === true
  // 采集元数据只保留已知形状；旧档缺失时补默认值（读取端另行标注 partial）。
  result.analytics = normalizeAnalytics(result.analytics)
  result.ruleset = D7_RULESET
  result.faithProgression = normalizeFaithProgression(result.faithProgression)
  result.karmaProgression = normalizeKarmaProgression(result.karmaProgression)
  result.samsara = normalizeSamsara(result.samsara, result)
  result.worlds = normalizeWorlds(result.worlds, result.disciples.members)
  result.challenge = normalizeChallenge(result.challenge)
  result.invitations = Math.floor(safeNumber(result.invitations, 3, invitationCapacity(result)))
  result.invitationTimer = safeNumber(result.invitationTimer, 0, 21600)
  const plan = isRecord(result.rebuild) ? result.rebuild : fresh.rebuild
  result.rebuild = { active: plan.active === true, buildings: numericMap(plan.buildings, BUILDING_MAP, true),
    upgrades: (Array.isArray(plan.upgrades) ? plan.upgrades : []).filter(id => Object.hasOwn(UPGRADE_MAP, id)), crafts: flags(plan.crafts, CRAFT_MAP) }
  // 兼容旧档模块字段：已注册模块统一启用
  const moduleFlags = sanitizeModuleFlags(state.settings?.modules)
  for (const key of ['createdAt', 'lastTickAt', 'lastSaveAt', 'nextEventAt']) {
    result[key] = safeNumber(result[key], fresh[key])
  }
  for (const key of ['arrivalTimer', 'totalDays', 'starvationTimer', 'leaveTimer', 'logSeq']) {
    result[key] = safeNumber(result[key])
  }
  // 永久货币保留小数，顶层字段为权威来源，resources 中的镜像同步为同值。
  result.karma = moneyValue(result.karma)
  result.dao = moneyValue(result.dao)
  result.realm = Number.isInteger(result.realm) && result.realm >= 0 && result.realm < REALMS.length ? result.realm : 0
  result.habitabilityPenalty = Number.isFinite(result.habitabilityPenalty) ? Math.max(-60, Math.min(0, result.habitabilityPenalty)) : 0
  result.resources = { ...fresh.resources, ...moneyMap(result.resources, RESOURCE_MAP) }
  result.resources.karma = result.karma
  result.resources.dao = result.dao
  result.peak = moneyMap(result.peak, RESOURCE_MAP)
  result.seen = { qi: true, ...flags(result.seen, RESOURCE_MAP) }
  result.buildings = Object.fromEntries(Object.entries(result.buildings)
    .filter(([id, entry]) => Object.hasOwn(BUILDING_MAP, id) && isRecord(entry))
    .map(([id, entry]) => {
      // 无运行成本（无物料维护且无持续供能）的建筑不允许停用：
      // 旧档停用后若该建筑的维护费被移除（如加工链），会永久卡在停用且无启用按钮，载入时统一归一为启用。
      const stage = PRODUCTION_STAGES[id] && entry.stage === 1 ? 1 : 0
      const meta = buildingMeta({ buildings: { [id]: { stage } } }, id)
      const hasCost = !!(meta.upkeep || meta.upkeepQi != null || meta.upkeepEnergy != null)
      const out = { count: Math.floor(safeNumber(entry.count)), on: hasCost ? entry.on !== false : true }
      if (PRODUCTION_STAGES[id]) out.stage = stage
      if (!stage && entry.power === 'energy') out.power = 'energy'
      if (meta.boost) out.boost = entry.boost === true
      return [id, out]
    }))
  result.warehouseCapacityVersion = WAREHOUSE_CAPACITY_VERSION
  result.warehouseMergeVersion = STORAGE_MERGE_VERSION
  result.legacyStorage = Object.fromEntries(Object.keys(STORAGE_MERGE_GROUPS).flatMap(id => {
    const entry = state.legacyStorage?.[id]
    if (!isRecord(entry) || !isRecord(entry.storage)) return []
    const count = Math.min(result.buildings[id]?.count || 0, Math.floor(safeNumber(entry.count)))
    return count > 0 ? [[id, { count, storage: moneyMap(entry.storage, RESOURCE_MAP) }]] : []
  }))
  result.legacyWarehouseCounts = Object.fromEntries(LEGACY_WAREHOUSE_IDS.map(id => [id,
    Math.min(result.buildings[id]?.count || 0, Math.floor(safeNumber(result.legacyWarehouseCounts?.[id])))]))
  result.upgrades = flags(result.upgrades, UPGRADE_MAP)
  result.upgradeEnabled = Object.fromEntries(Object.entries(result.upgradeEnabled)
    .filter(([id, enabled]) => result.upgrades[id] && enabled === false))
  result.achievements = flags(result.achievements, Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a])))
  result.treasureLevels = numericMap(result.treasureLevels, UPGRADE_MAP, true)
  result.craftProgress = moneyMap(result.craftProgress, CRAFT_MAP)
  result.craftTargets = moneyMap(result.craftTargets, CRAFT_MAP)
  result.autoCraft = flags(result.autoCraft, CRAFT_MAP)
  result.craftTimers = Object.fromEntries(Object.entries(result.craftTimers)
    .filter(([id, timer]) => Object.hasOwn(CRAFT_MAP, id) && isRecord(timer))
    .map(([id, timer]) => [id, { t: safeNumber(timer.t), made: Math.floor(safeNumber(timer.made)) }]))
  result.stats = Object.fromEntries(Object.entries(fresh.stats).map(([key]) => {
    if (key === 'crafted') return [key, moneyMap(result.stats.crafted, RESOURCE_MAP)]
    if (STATS_MONEY_KEYS.includes(key)) return [key, moneyValue(result.stats[key])]
    return [key, safeNumber(result.stats[key])]
  }))
  result.buffs = result.buffs.filter(buff => isRecord(buff) && typeof buff.id === 'string' &&
    Number.isFinite(buff.mult) && Number.isFinite(buff.until) && buff.until >= 0 &&
    (!buff.target || Object.hasOwn(RESOURCE_MAP, buff.target)))
    .map(buff => ({ id: buff.id, name: typeof buff.name === 'string' ? buff.name : buff.id,
      mult: buff.mult, target: buff.target || null, until: buff.until }))
  Object.assign(result, normalizeModuleSlices(result, fresh))
  // 猎场旧在途任务先迁移；世界驻守占用在 state.normalizeState 的最后统一重建。
  if (!Object.hasOwn(EVENT_MAP, result.pendingChoice?.id)) result.pendingChoice = null
  // 妖兽威胁的预计损失是金额（灵草数量），按金额域清洗；其余字段是时间戳/标识。
  if (result.pendingChoice?.id === 'beastThreat') {
    result.pendingChoice = { ...result.pendingChoice, herbLoss: moneyValue(result.pendingChoice.herbLoss) }
  }
  result.log = result.log.filter(entry => isRecord(entry) && typeof entry.text === 'string')
    .map(entry => ({ ...entry, id: safeNumber(entry.id), at: safeNumber(entry.at) }))
  for (const key of ['autosave', 'autoCraftOn', 'autoTalentJobs', 'offlineProgress', 'analyticsEnabled', 'sectBreakthroughReserve', 'autoBreakthrough']) {
    result.settings[key] = typeof result.settings[key] === 'boolean' ? result.settings[key] : fresh.settings[key]
  }
  result.settings = Object.fromEntries(Object.keys(fresh.settings).map(key => [key, result.settings[key] ?? fresh.settings[key]]))
  // 材料保留量按资源记账，是金额；其余设置项是布尔、比例或 id 列表。
  result.settings.craftReserves = moneyMap(result.settings.craftReserves, RESOURCE_MAP)
  result.settings.recruitMode = result.settings.recruitMode === 'manual' ? 'manual' : 'auto'
  result.settings.modules = moduleFlags
  result.settings.craftReservePercent = safeNumber(result.settings.craftReservePercent, 20, 100)
  result.settings.trainingQiFloorSeconds = safeNumber(result.settings.trainingQiFloorSeconds, 30, 300)
  result.settings.mentorLimit = Math.floor(safeNumber(result.settings.mentorLimit, 20, 999))
  // 自动突破的目标上限与适用人选：非法值回默认（'sect'／'focus'），开关本身随布尔清单归一化。
  result.settings.autoBreakthroughCap = Number.isInteger(result.settings.autoBreakthroughCap) &&
    result.settings.autoBreakthroughCap >= 1 && result.settings.autoBreakthroughCap < REALMS.length
    ? result.settings.autoBreakthroughCap : 'sect'
  result.settings.autoBreakthroughScope = result.settings.autoBreakthroughScope === 'all' ? 'all' : 'focus'
  result.settings.autoCraftPriority = Object.hasOwn(CRAFT_MAP, result.settings.autoCraftPriority) ? result.settings.autoCraftPriority : fresh.settings.autoCraftPriority
  result.ui = { ...fresh.ui, ...Object.fromEntries(Object.keys(fresh.ui).map(key => [key, result.ui[key] ?? fresh.ui[key]])) }
  result.ui.collapsedResourceGroups = flags(
    isRecord(result.ui.collapsedResourceGroups) ? result.ui.collapsedResourceGroups : {},
    Object.fromEntries(RESOURCE_GROUPS.map(group => [group.id, group])),
  )
  return result
}
