import { SAVE_VERSION, assertSaveShape, validateState } from './saveSchema'
import { gameNow, resetRuntimeCounters } from './context'
import { RESOURCES } from '@/data/resources'
import { JOBS } from '@/data/jobs'
import { DEFAULT_QUICK_CRAFTS } from '@/data/crafts'
import { defaultModules } from '@/data/modules'
import { migrateState } from './migrations'
import { initialModuleState, rehydrateModules, resetModules } from './moduleRegistry'
import { ZERO, moneyIsPositive, moneyMax } from './decimal'
import { D7_RULESET, createFaithProgression, normalizeFaithProgression } from '@/data/faith'
import { decodeMoneyFields } from './moneyFields'
import { createAnalyticsState } from './analyticsState'

/**
 * 初始状态。所有可存档数据都在这里定义。
 * 说明：state.buildings 只保存“已建造过”的条目，未建造的按数量 0 处理。
 *
 * **开局真的什么都没有**：0 灵气、0 弟子、没有任何建筑。
 * 第一步只能点「吸取天地灵气」把灵气攒够，然后盖起第一座聚灵阵。
 *
 * 金额字段（资源、仓容、经济累计、制作进度与目标、口粮累计）一律初始化成 Decimal；
 * ZERO 是不可变值，允许在多个字段间共享引用。时间与计数域仍为 Number。
 */
export function createInitialState(now = Date.now()) {
  const resources = {}
  for (const r of RESOURCES) resources[r.id] = ZERO

  const jobs = {}
  for (const j of JOBS) jobs[j.id] = 0

  return {
    version: SAVE_VERSION,
    ruleset: D7_RULESET,
    createdAt: now,
    lastTickAt: now,
    lastSaveAt: now,

    resources,
    // 曾经拥有过的资源才会显示在左栏
    seen: { qi: true },
    // 各资源的历史最高水位：建筑「渐进露出」用它判定（对标猫国 unlockRatio）
    peak: {},

    disciples: { total: 0, jobs, members: [], nextId: 1, rootSeed: now >>> 0,
      talentSeed: (now ^ 0x6d2b79f5) >>> 0, recruitSeed: (now ^ 0x1b873593) >>> 0, talentVersion: 2 },
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
    craftOrders: {},
    industryVersion: 1,
    qiLiquidVersion: 2,
    alchemyProgressionVersion: 1,
    legacyNineTurnPill: false,
    scriptureArchiveVersion: 1,
    beastRetirementVersion: 1,
    uncappedCraftVersion: 1,

    buildings: {},
    // 兼容旧档免费首屋的拆除记录；新建首屋同样支付木料。
    starterHutBuilt: false,
    starterHutStanding: false,
    upgrades: {},
    upgradeEnabled: {},
    achievements: {},
    craftProgress: {},
    autoCraft: {},
    craftTargets: {},

    // 可选模块的状态切片（如猎杀任务的 state.hunting）；随本世重置
    ...initialModuleState(),

    realm: 0,
    karma: ZERO,
    dao: ZERO,
    habitabilityPenalty: 0,
    starvationTimer: 0,
    leaveTimer: 0,
    buffs: [],
    /** 未决选择（{ id, at }）；妖兽威胁另存 deadline 与 herbLoss。 */
    pendingChoice: null,
    // 金丹周边事务：安宁期与同类威胁冷却，随本世重置。
    affairs: { beastPeaceUntil: 0, beastCooldownUntil: 0 },

    // GA4 平衡采集的持久元数据：世身份、本世时钟、首次到达表与上一世摘要。
    analytics: createAnalyticsState(),
    // D7 香火修持：本世仪轨等级、永久道心修持等级与累计道心。
    faithProgression: createFaithProgression(),

    log: [],
    logSeq: 0,
    nextEventAt: now + 90000,

    stats: {
      totalQi: ZERO,
      totalInsight: ZERO,
      totalFaith: ZERO,
      lifeInsight: ZERO,
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
      breakthroughDeaths: 0,
      bestRealm: 0,
      offlineGains: ZERO,
      eventsSeen: 0,
      /** 手动「吸取天地灵气」的次数 */
      clicks: 0,
    },

    settings: {
      autosave: true,
      autoCraftOn: true,
      autoTalentJobs: true,
      // 招募模式：'auto' 弟子自动前来（默认）／'manual' 主动招募（需《招贤纳士》解锁）
      recruitMode: 'auto',
      autoCraftSpeeds: {},
      craftWeights: {},
      processingModes: {},
      offlineProgress: true,
      // 匿名平衡统计：关闭后立即停止发送，不补发。
      analyticsEnabled: false,
      craftReservePercent: 20,
      craftReserves: {},
      autoCraftPriority: 'infuseStone',
      quickCrafts: [...DEFAULT_QUICK_CRAFTS],
      // 可选模块开关（默认值与清单见 @/data/modules）
      modules: defaultModules(),
    },

    ui: {
      tab: 'sect',
      jobBulk: 1,
      // 宗门页筛选：all / affordable / owned / toggle / <建筑分组 id>
      sectFilter: 'all',
      // 技艺页筛选：all / skill / treasure
      skillFilter: 'all',
      craftFilter: 'all',
      collapsedResourceGroups: {},
    },
  }
}

/**
 * 修正旧存档里缺失的字段，保证结构完整。
 *
 * 三段顺序固定：**先按字段解析/清洗金额**（v3 字符串或旧 number → Decimal），
 * 再执行涉及金额算术的历史迁移，最后做目标状态校验。v1/v2 的金额若已丢失精度不再补偿。
 */
export function normalizeState(state, { now = Date.now(), preferMembers = false } = {}) {
  assertSaveShape(state)
  const decoded = decodeMoneyFields(state)
  const fresh = createInitialState(now)
  const normalized = validateState(migrateState(decoded, fresh, { preferMembers }), fresh)
  // 成员占用等属于运行时字段：读档后按活动任务重新标记（仅启用的模块）。
  rehydrateModules(normalized)
  return normalized
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
  const fresh = createInitialState(gameNow(state))
  resetRuntimeCounters(state)

  // 道心与永久修持跨轮回保留；愿力、仪轨与一次性专属研究随本世清空。
  const keptFaith = normalizeFaithProgression(state.faithProgression)
  const keptDaoHeart = moneyMax(ZERO, state.resources?.daoHeart ?? ZERO)
  const keptPeakDaoHeart = moneyMax(keptDaoHeart, state.peak?.daoHeart ?? ZERO)
  state.resources = { ...fresh.resources, daoHeart: keptDaoHeart }
  // 飞升是「转世重修」：连开局那点家底也没有，跟第一次开山一样从点击起步（§3.4）
  state.seen = { qi: true, ...(moneyIsPositive(keptDaoHeart) ? { daoHeart: true } : {}) }
  state.peak = moneyIsPositive(keptPeakDaoHeart) ? { daoHeart: keptPeakDaoHeart } : {}
  state.faithProgression = { ...createFaithProgression(), cultivation: { ...keptFaith.cultivation }, totalDaoHeart: keptFaith.totalDaoHeart }
  state.disciples = { ...fresh.disciples, jobs: { ...fresh.disciples.jobs }, members: [] }
  state.arrivalTimer = 0
  state.buildings = {}
  state.starterHutBuilt = false
  state.starterHutStanding = false
  state.upgrades = {}
  state.upgradeEnabled = {}
  state.treasureLevels = {}
  state.craftProgress = {}
  state.craftTimers = {}
  state.craftOrders = {}
  state.industryVersion = 1
  state.alchemyProgressionVersion = 1
  state.legacyNineTurnPill = false
  state.scriptureArchiveVersion = 1
  state.autoCraft = {}
  state.craftTargets = {}
  state.realm = 0
  // 仙缘与道果是金额：加法走 Decimal，不能原生相加（会把数值拼成字符串）。
  state.karma = moneyMax(ZERO, state.karma ?? ZERO).plus(karmaGain ?? ZERO)
  // 飞升额外结一颗道果（更高一层货币）；转世不给 —— 见 docs/DESIGN.md §8.2 / §8.3
  if (kind === 'ascension') state.dao = moneyMax(ZERO, state.dao ?? ZERO).plus(1).floor()
  // 永久货币镜像立即同步：转世/飞升后 resources.karma/dao 必须与顶层字段同值，
  // 否则界面与下一次写档会出现两套金额（旧实现只在读档校验里补镜像）。
  state.resources.karma = state.karma
  state.resources.dao = state.dao
  state.habitabilityPenalty = 0
  state.starvationTimer = 0
  state.leaveTimer = 0
  state.buffs = []
  state.pendingChoice = null
  state.affairs = { ...fresh.affairs }
  resetModules(state, fresh)
  state.stats.lifeInsight = ZERO
  if (kind === 'reincarnation') state.stats.reincarnations = (state.stats.reincarnations || 0) + 1
  else if (kind === 'death') state.stats.breakthroughDeaths = (state.stats.breakthroughDeaths || 0) + 1
  else state.stats.ascensions += 1
  state.nextEventAt = gameNow(state) + 90000
  state.lastTickAt = gameNow(state)
  return state
}
