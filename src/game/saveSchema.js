import { RESOURCE_MAP, RESOURCE_GROUPS } from '@/data/resources'
import { BUILDING_MAP } from '@/data/buildings'
import { UPGRADE_MAP } from '@/data/upgrades'
import { CRAFT_MAP } from '@/data/crafts'
import { ACHIEVEMENTS } from '@/data/achievements'
import { EVENT_MAP } from '@/data/events'
import { REALMS } from '@/data/realms'
import { MODULES } from '@/data/modules'
import { moduleSaveKeys, normalizeModuleSlices } from '@/game/moduleRegistry'
import { ZERO, floorMoney, moneyNonNegative } from '@/game/decimal'
import { normalizeAnalytics } from '@/game/analyticsState'
import { D7_RULESET, normalizeFaithProgression } from '@/data/faith'

/** 存档结构版本：v3 起金额字段以十进制字符串保存（v1/v2 为 JSON number）。 */
export const SAVE_VERSION = 3
/** 核心存档字段；可选模块的切片键（如 hunting）在末尾动态追加 */
const CORE_SAVE_FIELDS = [
  'version', 'createdAt', 'lastTickAt', 'lastSaveAt', 'resources', 'seen', 'peak',
  'disciples', 'arrivalTimer', 'totalDays', 'treasureLevels', 'craftTimers', 'craftOrders',
  'industryVersion', 'qiLiquidVersion', 'alchemyProgressionVersion', 'scriptureArchiveVersion', 'beastRetirementVersion', 'buildings', 'starterHutBuilt', 'starterHutStanding', 'upgrades',
  'upgradeEnabled', 'achievements', 'craftProgress', 'autoCraft', 'craftTargets', 'realm', 'legacyNineTurnPill',
  'karma', 'dao', 'habitabilityPenalty', 'starvationTimer', 'leaveTimer', 'buffs',
  'pendingChoice', 'affairs', 'log', 'logSeq', 'nextEventAt', 'stats', 'settings', 'analytics', 'ui',
  'ruleset', 'faithProgression',
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
export function moneyMap(values, catalog, { integer = false } = {}) {
  return Object.fromEntries(Object.entries(values || {})
    .filter(([id]) => Object.hasOwn(catalog, id))
    .map(([id, value]) => [id, integer ? floorMoney(moneyValue(value)) : moneyValue(value)]))
}

/** 经济累计类统计：这些键是金额，其余统计仍是 Number 计数。 */
const STATS_MONEY_KEYS = ['totalQi', 'totalInsight', 'totalFaith', 'lifeInsight', 'offlineGains']

/** 结构冲突与单个数值损坏分开处理；浏览器加载／导入遇结构冲突时保护原档。 */
export function assertSaveShape(data) {
  if (!isRecord(data)) throw new Error('存档必须是对象')
  for (const key of ['resources', 'buildings', 'disciples', 'stats', 'settings', 'ui',
    'peak', 'upgrades', 'upgradeEnabled', 'achievements', 'autoCraft', 'craftTargets',
    'craftTimers', 'craftQueue', 'craftOrders', 'craftProgress', 'treasureLevels', 'affairs', 'faithProgression', ...moduleSaveKeys()]) {
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
  // 防止损坏的人数导致读档生成海量个体；不影响已有成员的正常存取。
  if (data.disciples?.total > 100000) throw new Error('存档人数超出可恢复范围')
}

const numericMap = (values, catalog, integer = false) => Object.fromEntries(
  Object.entries(values || {}).filter(([id]) => Object.hasOwn(catalog, id))
    .map(([id, value]) => [id, integer ? Math.floor(safeNumber(value)) : safeNumber(value)]),
)
const flags = (values, catalog) => Object.fromEntries(Object.entries(values || {})
  .filter(([id, value]) => Object.hasOwn(catalog, id) && value === true))
/** 模块开关：只保留已知模块，非布尔值一律回落到默认 */
const sanitizeModuleFlags = (raw) => Object.fromEntries(
  MODULES.map(m => [m.id, typeof raw?.[m.id] === 'boolean' ? raw[m.id] : m.defaultEnabled]),
)

/** 迁移后校验：仅持久化已知字段；金额为有限非负 Decimal，控制域为有限非负 Number。 */
export function validateState(state, fresh) {
  const result = Object.fromEntries(SAVE_FIELDS.map(key => [key, state[key] ?? fresh[key]]))
  result.version = SAVE_VERSION
  result.legacyNineTurnPill = result.legacyNineTurnPill === true
  // 采集元数据只保留已知形状；旧档缺失时补默认值（读取端另行标注 partial）。
  result.analytics = normalizeAnalytics(result.analytics)
  result.ruleset = D7_RULESET
  result.faithProgression = normalizeFaithProgression(result.faithProgression)
  // 先定下模块开关：模块切片归一化要据此判断「关闭时丢弃活动状态」
  const moduleFlags = sanitizeModuleFlags(state.settings?.modules)
  for (const key of ['createdAt', 'lastTickAt', 'lastSaveAt', 'nextEventAt']) {
    result[key] = safeNumber(result[key], fresh[key])
  }
  for (const key of ['arrivalTimer', 'totalDays', 'starvationTimer', 'leaveTimer', 'logSeq']) {
    result[key] = safeNumber(result[key])
  }
  // 永久货币是金额：顶层字段为权威来源，resources 中的镜像同步为同值；道果仍为整数。
  result.karma = moneyValue(result.karma)
  result.dao = floorMoney(moneyValue(result.dao))
  result.realm = Number.isInteger(result.realm) && result.realm >= 0 && result.realm < REALMS.length ? result.realm : 0
  result.habitabilityPenalty = Number.isFinite(result.habitabilityPenalty) ? Math.max(-60, Math.min(0, result.habitabilityPenalty)) : 0
  result.resources = { ...fresh.resources, ...moneyMap(result.resources, RESOURCE_MAP) }
  for (const [id, meta] of Object.entries(RESOURCE_MAP)) {
    if (meta.integer) result.resources[id] = floorMoney(result.resources[id])
  }
  result.resources.karma = result.karma
  result.resources.dao = result.dao
  result.peak = moneyMap(result.peak, RESOURCE_MAP)
  result.seen = { qi: true, ...flags(result.seen, RESOURCE_MAP) }
  result.buildings = Object.fromEntries(Object.entries(result.buildings)
    .filter(([id, entry]) => Object.hasOwn(BUILDING_MAP, id) && isRecord(entry))
    .map(([id, entry]) => {
      const out = { count: Math.floor(safeNumber(entry.count)), on: entry.on !== false }
      if (entry.power === 'energy') out.power = 'energy'
      return [id, out]
    }))
  result.upgrades = flags(result.upgrades, UPGRADE_MAP)
  result.upgradeEnabled = Object.fromEntries(Object.entries(result.upgradeEnabled)
    .filter(([id, enabled]) => result.upgrades[id] && enabled === false))
  result.achievements = flags(result.achievements, Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a])))
  result.treasureLevels = numericMap(result.treasureLevels, UPGRADE_MAP, true)
  result.craftProgress = moneyMap(result.craftProgress, CRAFT_MAP)
  result.craftTargets = moneyMap(result.craftTargets, CRAFT_MAP, { integer: true })
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
  Object.assign(result, normalizeModuleSlices(state, fresh))
  if (!Object.hasOwn(EVENT_MAP, result.pendingChoice?.id)) result.pendingChoice = null
  // 妖兽威胁的预计损失是金额（灵草数量），按金额域清洗；其余字段是时间戳/标识。
  if (result.pendingChoice?.id === 'beastThreat') {
    result.pendingChoice = { ...result.pendingChoice, herbLoss: moneyValue(result.pendingChoice.herbLoss) }
  }
  result.log = result.log.filter(entry => isRecord(entry) && typeof entry.text === 'string')
    .map(entry => ({ ...entry, id: safeNumber(entry.id), at: safeNumber(entry.at) }))
  for (const key of ['autosave', 'autoCraftOn', 'autoTalentJobs', 'offlineProgress', 'analyticsEnabled']) {
    result.settings[key] = typeof result.settings[key] === 'boolean' ? result.settings[key] : fresh.settings[key]
  }
  result.settings = Object.fromEntries(Object.keys(fresh.settings).map(key => [key, result.settings[key] ?? fresh.settings[key]]))
  // 材料保留量按资源记账，是金额；其余设置项是布尔、比例或 id 列表。
  result.settings.craftReserves = moneyMap(result.settings.craftReserves, RESOURCE_MAP)
  result.settings.recruitMode = result.settings.recruitMode === 'manual' ? 'manual' : 'auto'
  result.settings.modules = moduleFlags
  result.settings.craftReservePercent = safeNumber(result.settings.craftReservePercent, 20, 100)
  result.settings.autoCraftPriority = Object.hasOwn(CRAFT_MAP, result.settings.autoCraftPriority) ? result.settings.autoCraftPriority : fresh.settings.autoCraftPriority
  result.ui = { ...fresh.ui, ...Object.fromEntries(Object.keys(fresh.ui).map(key => [key, result.ui[key] ?? fresh.ui[key]])) }
  result.ui.collapsedResourceGroups = flags(
    isRecord(result.ui.collapsedResourceGroups) ? result.ui.collapsedResourceGroups : {},
    Object.fromEntries(RESOURCE_GROUPS.map(group => [group.id, group])),
  )
  return result
}
