import { RESOURCES } from '@/data/resources'
import { JOBS } from '@/data/jobs'
import { CONFIG } from '@/data/config'
import { DEFAULT_QUICK_CRAFTS, normalizeQuickCrafts } from '@/data/crafts'
import { EVENT_MAP, getEventLevel } from '@/data/events'

/**
 * 初始状态。所有可存档数据都在这里定义。
 * 说明：state.buildings 只保存“已建造过”的条目，未建造的按数量 0 处理。
 *
 * **开局真的什么都没有**：0 灵气、0 弟子、没有任何建筑。
 * 第一步只能点「吸取天地灵气」把灵气攒够，然后盖起第一座聚灵阵。
 */
export function createInitialState() {
  const resources = {}
  for (const r of RESOURCES) resources[r.id] = 0

  const jobs = {}
  for (const j of JOBS) jobs[j.id] = 0

  return {
    version: 1,
    createdAt: Date.now(),
    lastTickAt: Date.now(),
    lastSaveAt: Date.now(),

    resources,
    // 曾经拥有过的资源才会显示在左栏
    seen: { qi: true },
    // 各资源的历史最高水位：建筑「渐进露出」用它判定（对标猫国 unlockRatio）
    peak: {},

    disciples: { total: 0, jobs },
    // 弟子自动前来的计时（秒）
    arrivalTimer: 0,
    // 历法：已经过去的天数（小数，1 天 = CALENDAR.DAY_SECONDS 秒）
    totalDays: 0,
    /**
     * 法宝祭炼等级：{ 法宝id: 级数 }
     * 0 或缺失 = 只炼成、未祭炼；每级让该法宝的效果 ×(1 + 0.3×级数)
     */
    treasureLevels: {},
    /**
     * 自动制作的计时：{ 配方id: { t, made } }
     *   t    距离下一份已经攒了多久（秒，最多攒到单件耗时，不会爆发）
     *   made 这一轮自动做了几份（界面显示用）
     */
    craftTimers: {},

    buildings: {},
    starterHutBuilt: false,
    starterHutStanding: false,
    upgrades: {},
    achievements: {},
    craftProgress: {},
    autoCraft: {},
    craftTargets: {},

    realm: 0,
    karma: 0,
    dao: 0,
    moralePenalty: 0,
    starvationTimer: 0,
    leaveTimer: 0,
    buffs: [],
    /** 未决选择（{ id, at }）；妖兽威胁另存 deadline 与 herbLoss。 */
    pendingChoice: null,
    // 金丹周边事务：安宁期与同类威胁冷却，随本世重置。
    affairs: { beastPeaceUntil: 0, beastCooldownUntil: 0 },

    log: [],
    logSeq: 0,
    nextEventAt: Date.now() + 90000,

    stats: {
      totalQi: 0,
      totalInsight: 0,
      totalFaith: 0,
      lifeInsight: 0,
      /** 做过几次选择（选择类事件） */
      choicesMade: 0,
      crafted: {},
      craftCount: 0,
      buildingsBuilt: 0,
      recruits: 0,
      disasters: 0,
      playTime: 0,
      ascensions: 0,
      reincarnations: 0,
      bestRealm: 0,
      offlineGains: 0,
      eventsSeen: 0,
      /** 手动「吸取天地灵气」的次数 */
      clicks: 0,
    },

    settings: {
      autosave: true,
      autoCraftOn: true,
      offlineProgress: true,
      craftReservePercent: 20,
      autoCraftPriority: 'infuseStone',
      quickCrafts: [...DEFAULT_QUICK_CRAFTS],
    },

    ui: {
      tab: 'sect',
      jobBulk: 1,
      // 宗门页筛选：all / affordable / owned / toggle / <建筑分组 id>
      sectFilter: 'all',
      // 技艺页筛选：all / skill / treasure
      skillFilter: 'all',
      craftFilter: 'all',
    },
  }
}

/** 修正旧存档里缺失的字段，保证结构完整 */
export function normalizeState(state) {
  const fresh = createInitialState()
  const merged = { ...fresh, ...state }
  merged.resources = { ...fresh.resources, ...(state.resources || {}) }
  // 整枚计数的资源（灵石/丹药/符箓/法器）在旧档里可能被算成小数（涨价/折扣/祭炼留下的），读档时抹平
  for (const r of RESOURCES) {
    if (r.integer) merged.resources[r.id] = Math.floor(merged.resources[r.id] || 0)
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
  // 老档补「飞升层」与「转世计数」
  merged.dao = state.dao || 0
  merged.stats = merged.stats || {}
  merged.stats.reincarnations = merged.stats.reincarnations || 0
  merged.buildings = Object.fromEntries(Object.entries(state.buildings || {}).map(([id, entry]) => [id, { ...entry }]))
  // 旧档已有人口或建设进度时视为已领取首屋，防止拆屋读档重复免木料。
  merged.starterHutBuilt = typeof state.starterHutBuilt === 'boolean' ? state.starterHutBuilt :
    ((merged.buildings.hut?.count || 0) > 0 || (merged.disciples.total || 0) > 0 || (state.stats?.recruits || 0) > 0 ||
      ['logHouse', 'mansion', 'caveDwelling'].some(id => (merged.buildings[id]?.count || 0) > 0))
  merged.starterHutStanding = !!state.starterHutStanding && merged.starterHutBuilt && (merged.buildings.hut?.count || 0) > 0
  merged.upgrades = { ...(state.upgrades || {}) }
  // 已移除的早期空间技艺不再参与研究、统计或容量计算。
  delete merged.upgrades.storageBag
  delete merged.upgrades.voidPouch
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
  merged.achievements = state.achievements || {}
  merged.craftProgress = state.craftProgress || {}
  merged.autoCraft = state.autoCraft || {}
  if (!Object.hasOwn(state.resources || {}, 'qiParticle') &&
      (merged.autoCraft.condenseCrystal || merged.autoCraft.growImmortalHerb)) {
    merged.autoCraft = { ...merged.autoCraft, condenseLiquid: true }
  }
  merged.craftTargets = { ...fresh.craftTargets, ...(state.craftTargets || {}) }
  merged.craftTimers = state.craftTimers || state.craftQueue || {}
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
    if (!Number.isFinite(p.deadline)) p.deadline = (Number.isFinite(p.at) ? p.at : Date.now()) + 300000
    if (!Number.isFinite(p.herbLoss)) p.herbLoss = 20
    p.herbLoss = Math.max(0, Math.min(80, p.herbLoss))
  }
  merged.log = Array.isArray(state.log) ? state.log.map(entry => {
    const event = Object.hasOwn(EVENT_MAP, entry.eventId) ? EVENT_MAP[entry.eventId] : null
    return event ? { ...entry, eventLevel: getEventLevel(event).id } : entry
  }) : []
  merged.stats = { ...fresh.stats, ...(state.stats || {}) }
  merged.stats.crafted = { ...(state.stats && state.stats.crafted) }
  merged.settings = { ...fresh.settings, ...(state.settings || {}) }
  for (const key of ['autoCraft', 'craftTargets', 'craftTimers', 'craftProgress']) {
    merged[key] = { ...merged[key] }
    if (Object.hasOwn(merged[key], 'condenseStone') && !Object.hasOwn(merged[key], 'infuseStone')) merged[key].infuseStone = merged[key].condenseStone
    delete merged[key].condenseStone
  }
  if (merged.settings.autoCraftPriority === 'condenseStone') merged.settings.autoCraftPriority = 'infuseStone'
  if (Array.isArray(merged.settings.quickCrafts)) merged.settings.quickCrafts = merged.settings.quickCrafts.map(id => id === 'condenseStone' ? 'infuseStone' : id)
  merged.settings.quickCrafts = normalizeQuickCrafts(merged.settings.quickCrafts)
  merged.ui = { ...fresh.ui, ...(state.ui || {}) }
  // 去掉已经过期的 buff
  const now = Date.now()
  merged.buffs = merged.buffs.filter((b) => (b.until || 0) > now)
  return merged
}

/**
 * 飞升：重置本世进度，把本世积累折算成仙缘带走。
 *
 * 有意不给「资源礼包」——开局仓储上限只有灵气 500 / 灵木 200，
 * 发再多资源也会被上限吃掉；飞升的收益体现在永久产出与仓储加成（仙缘）及保留的成就上。
 */
/** 转世：与飞升清空的东西完全一样，只记在转世计数上 */
export function resetForReincarnation(state, karmaGain) {
  return resetForRebirth(state, karmaGain, 'reincarnation')
}

/** 飞升：清空一切（含修真 / 技艺·法宝），记在 ascensions 上 */
export function resetForAscension(state, karmaGain) {
  return resetForRebirth(state, karmaGain, 'ascension')
}

/**
 * 转世重修（飞升与转世共用的重置）：
 * 清空 资源 / 弟子 / 建筑 / 修真 / 技艺·法宝 / 境界 / 制作进度；
 * 保留 成就 / 统计 / 仙缘（karma）。
 * 区别只有两处：门槛（化神期 vs 渡劫期）与统计里记哪一个计数。
 */
export function resetForRebirth(state, karmaGain, kind = 'ascension') {
  const fresh = createInitialState()

  state.resources = { ...fresh.resources }
  // 飞升是「转世重修」：连开局那点家底也没有，跟第一次开山一样从点击起步（§3.4）
  state.seen = { qi: true }
  state.peak = {}
  state.disciples = { total: 0, jobs: { ...fresh.disciples.jobs } }
  state.arrivalTimer = 0
  state.buildings = {}
  state.starterHutBuilt = false
  state.starterHutStanding = false
  state.upgrades = {}
  state.treasureLevels = {}
  state.craftProgress = {}
  state.craftTimers = {}
  state.autoCraft = {}
  state.craftTargets = {}
  state.realm = 0
  state.karma = state.karma + karmaGain
  // 飞升额外结一颗道果（更高一层货币）；转世不给 —— 见 docs/DESIGN.md §8.2 / §8.3
  if (kind === 'ascension') state.dao = (state.dao || 0) + 1
  state.moralePenalty = 0
  state.starvationTimer = 0
  state.leaveTimer = 0
  state.buffs = []
  state.pendingChoice = null
  state.affairs = { ...fresh.affairs }
  state.stats.lifeInsight = 0
  if (kind === 'reincarnation') state.stats.reincarnations = (state.stats.reincarnations || 0) + 1
  else state.stats.ascensions += 1
  state.nextEventAt = Date.now() + 90000
  state.lastTickAt = Date.now()
  return state
}
