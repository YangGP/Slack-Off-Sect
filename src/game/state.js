import { RESOURCES } from '@/data/resources'
import { JOBS } from '@/data/jobs'
import { CONFIG } from '@/data/config'

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
    upgrades: {},
    achievements: {},
    craftProgress: {},
    autoCraft: {},

    realm: 0,
    karma: 0,
    dao: 0,
    moralePenalty: 0,
    buffs: [],
  /** 未决的选择类事件（{ id, at }），为空表示没有待决 */
  pendingChoice: null,

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
    },

    ui: {
      tab: 'sect',
      jobBulk: 1,
      // 宗门页筛选：all / affordable / owned / toggle / <建筑分组 id>
      sectFilter: 'all',
      // 技艺页筛选：all / skill / treasure
      skillFilter: 'all',
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
  // 老档补「飞升层」与「转世计数」
  merged.dao = state.dao || 0
  merged.stats = merged.stats || {}
  merged.stats.reincarnations = merged.stats.reincarnations || 0
  merged.buildings = state.buildings || {}
  merged.upgrades = state.upgrades || {}
  merged.achievements = state.achievements || {}
  merged.craftProgress = state.craftProgress || {}
  merged.autoCraft = state.autoCraft || {}
  merged.craftTimers = state.craftTimers || state.craftQueue || {}
  merged.treasureLevels = state.treasureLevels || {}
  merged.buffs = Array.isArray(state.buffs) ? state.buffs : []
  merged.log = Array.isArray(state.log) ? state.log : []
  merged.stats = { ...fresh.stats, ...(state.stats || {}) }
  merged.stats.crafted = { ...(state.stats && state.stats.crafted) }
  merged.settings = { ...fresh.settings, ...(state.settings || {}) }
  merged.ui = { ...fresh.ui, ...(state.ui || {}) }
  // 去掉已经过期的 buff
  const now = Date.now()
  merged.buffs = merged.buffs.filter((b) => (b.until || 0) > now)
  return merged
  if (state.pendingChoice && !state.pendingChoice.id) state.pendingChoice = null
}

/**
 * 飞升：重置本世进度，把本世积累折算成仙缘带走。
 *
 * 有意不给「资源礼包」——开局仓储上限只有灵气 500 / 灵木 200，
 * 发再多资源也会被上限吃掉；飞升的收益体现在永久倍率（仙缘）与保留的成就上。
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
  state.upgrades = {}
  state.treasureLevels = {}
  state.craftProgress = {}
  state.craftTimers = {}
  state.autoCraft = {}
  state.realm = 0
  state.karma = state.karma + karmaGain
  // 飞升额外结一颗道果（更高一层货币）；转世不给 —— 见 docs/DESIGN.md §8.2 / §8.3
  if (kind === 'ascension') state.dao = (state.dao || 0) + 1
  state.moralePenalty = 0
  state.buffs = []
  state.pendingChoice = null
  state.stats.lifeInsight = 0
  if (kind === 'reincarnation') state.stats.reincarnations = (state.stats.reincarnations || 0) + 1
  else state.stats.ascensions += 1
  state.nextEventAt = Date.now() + 90000
  state.lastTickAt = Date.now()
  return state
}
