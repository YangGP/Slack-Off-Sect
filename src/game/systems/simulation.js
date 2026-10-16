import { ACHIEVEMENTS } from '@/data/achievements'
import { pushLog, trackPeak, clamp, idleDisciples, calendarAt } from './core'
import { recompute, canReuseEconomy } from './economy'
import { gameNow, withGameContext, gameRandom, runtimeCounters } from '../context'
import { settleExpiredThreat, fireEvent } from './events'
import { runModuleTicks, nextModuleDeadline, runModuleOfflineTicks } from '@/game/moduleRegistry'
import { cultivateDisciple, discipleFactor, recountDisciples } from '@/data/disciples'
import { RESOURCES, resourceName } from '@/data/resources'
import { CONFIG } from '@/data/config'
import { JOBS } from '@/data/jobs'
import { BUILDINGS } from '@/data/buildings'
import { ALL_UPGRADES } from '@/data/upgrades'
import { runAutoCraft, runAutoCondense, runAutoCraftTimers, runIndustrialCraftBatch, runAutoCondenseBatch } from './crafting'
import { CALENDAR } from '@/data/calendar'
import { recruitArrivals, autoAssignTalentJobs } from './disciples'
import { isLongOffline, offlineSegments, offlineSegmentCount, averageSeasonRatio, BUFF_BOUNDARY_EPS_MS } from './offlinePlan'

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

/**
 * 推进游戏时间。
 * @param {number} dt 经过的秒数
 * @param {{offline?: boolean, events?: boolean}} opts
 */
export function tick(state, derived, dt, opts = {}) {
  if (!Number.isFinite(dt) || dt <= 0) return
  advanceTicks(state, derived, dt, opts)
}

/** 同一时间轴处理所有期限；到期点切步，避免整步套用已过期加成。 */
export function advanceTicks(state, derived, seconds, opts) {
  createTickRunner(state, derived, seconds, opts).runBatch()
}

/** 同步与异步共用同一条时间轴；批次只暂停执行，不额外切分游戏步长。 */
function createTickRunner(state, derived, seconds, opts) {
  let now = opts.startAt ?? gameNow(state)
  const start = now
  const end = now + seconds * 1000
  // 大步长只用于没有人口、维护、加工与灵能逸散的稳定生产。
  // 其余场景逐秒结算，避免步内供给、修炼和加工状态变化被提前或延后。
  recompute(state, derived)
  const stableProduction = state.disciples.members.length === 0 && derived.maxDisciples === 0 &&
    !(state.resources.qiEnergy > 0) && !(derived.rates.qiEnergy > 0) &&
    !Object.values(state.autoCraft).some(Boolean) && Object.keys(state.craftOrders).length === 0 &&
    !BUILDINGS.some(b => b.upkeep && state.buildings[b.id]?.on && state.buildings[b.id]?.count > 0) &&
    !ALL_UPGRADES.some(u => u.upkeep && state.upgrades[u.id] && state.upgradeEnabled?.[u.id] !== false) &&
    (opts.offline || opts.events === false)
  const maxSliceMs = seconds > CONFIG.OFFLINE_EXACT_AFTER_SECONDS
    && stableProduction ? CONFIG.MAX_SLICE_SECONDS * 1000
    : CONFIG.TICK_SLICE_MS
  let reuseEconomy = false
  let finished = false
  return {
    get done() { return end - now <= 1e-6 },
    get completedSeconds() { return end - now <= 1e-6 ? seconds : Math.min(seconds, (now - start) / 1000) },
    runBatch(shouldYield = () => false) {
      return withGameContext(state, { now: () => now, economyDetails: !opts.offline || opts.economyDetails === true }, () => {
        while (end - now > 1e-6) {
          let next = Math.min(end, now + maxSliceMs)
          // 与逐秒参考结算相同：下一次逐秒采样进入新节气时切步。
          const termSeconds = CALENDAR.DAYS_PER_TERM * CALENDAR.DAY_SECONDS
          const calendarSeconds = state.totalDays * CALENDAR.DAY_SECONDS
          const untilTerm = termSeconds - (calendarSeconds % termSeconds)
          const termSteps = Math.max(1, Math.ceil(untilTerm / (CONFIG.TICK_SLICE_MS / 1000) - 1e-9))
          next = Math.min(next, now + termSteps * CONFIG.TICK_SLICE_MS)
          for (const buff of state.buffs) {
            if (buff.until > now && buff.until < next) next = buff.until
          }
          const deadline = state.pendingChoice?.deadline
          if (deadline > now && deadline < next) next = deadline
          // 可选模块的期限（如猎杀任务归队）在到期处切步：在线与离线都在同一边界结算
          const moduleDeadline = nextModuleDeadline(state, now)
          if (moduleDeadline < next) next = moduleDeadline
          tickStep(state, derived, (next - now) / 1000, opts, reuseEconomy)
          reuseEconomy = opts.offline === true && opts.cacheEconomy !== false
          now = next
          if (shouldYield()) break
        }
        if (end - now <= 1e-6 && !finished) {
          state.buffs = state.buffs.filter(buff => buff.until > now)
          settleExpiredThreat(state, derived)
          state.lastTickAt = now
          withGameContext(state, { economyDetails: true }, () => recompute(state, derived))
          finished = true
        }
      })
    }
  }
}

export function tickStep(state, derived, dt, opts, reuseEconomy = false) {
  const { offline = false, events = true } = opts
  const cap = dt > CONFIG.MAX_STEP_SECONDS ? CONFIG.MAX_STEP_SECONDS : dt
  const assignmentsChanged = autoAssignTalentJobs(state)
  if (!reuseEconomy || assignmentsChanged || !canReuseEconomy(state, derived, cap)) recompute(state, derived, cap)
  for (const member of state.disciples.members) cultivateDisciple(member, cap, derived.trainingActive)
  if (settleExpiredThreat(state, derived)) recompute(state, derived, cap)

  // 个人口粮按实际有效境界与减耗累计；断供时按口粮、维护共有的供给比例记账。
  const qiDemand = Math.max(0, -(derived.expense?.qi || 0) * cap)
  const qiAvailable = Math.max(0, (state.resources.qi || 0) + (derived.rates.qi || 0) * cap)
  const qiSupply = qiDemand > 0 ? Math.min(1, qiAvailable / qiDemand) : 0
  if (derived.discipleWeight > 0 && derived.upkeep > 0) {
    for (const member of state.disciples.members) {
      const consumed = derived.upkeep * discipleFactor(member, state.realm) / derived.discipleWeight * cap * qiSupply
      member.totalQiConsumed = Math.min(Number.MAX_SAFE_INTEGER, (member.totalQiConsumed || 0) + consumed)
    }
  }

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
    // 扩仓规则调整或拆除建筑后，超额旧库存可消费，但不能继续增加。
    if (next > max && rate > 0) next = Math.max(before, max)
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

  trackPeak(state)

  // 1.2) 可选模块推进（猎杀任务归队会给资源并释放成员，立即重算派生数据）。
  //      离线同样推进；生态关联首轮关闭，不在此抽来袭。
  if (runModuleTicks(state, derived, cap)) recompute(state, derived, cap)

  // 1.5) 灵能逸散：湮灭能不稳定，每秒衰减 QI_ENERGY_DECAY。
  // 于是存量有稳态 —— 稳态 ≈ 产出 ÷ 逸散率（一台湮灭炉 0.06/秒 → 12 灵能）。
  if ((state.resources.qiEnergy || 0) > 0) {
    const left = state.resources.qiEnergy * Math.pow(1 - CONFIG.QI_ENERGY_DECAY, cap)
    state.resources.qiEnergy = left < 1e-9 ? 0 : left
  }

  // 2) 宜居度：灵气断供则下滑，供应正常则回升
  const previousPenalty = state.habitabilityPenalty
  const starving = (state.resources.qi || 0) <= 1 && derived.netQi < 0
  if (starving) {
    state.habitabilityPenalty = clamp(
      state.habitabilityPenalty - CONFIG.HABITABILITY_STARVE_RATE * cap,
      -60,
      0,
    )
  } else {
    state.habitabilityPenalty = clamp(
      state.habitabilityPenalty + CONFIG.HABITABILITY_RECOVER_RATE * cap,
      -60,
      0,
    )
  }

  // 惩罚恢复或断供下滑后立即刷新风险，在线与离线使用相同的60秒检查周期。
  if (state.habitabilityPenalty !== previousPenalty) recompute(state, derived, cap)
  // 3) 长期断粮独立于宜居度；宜居度不足则按固定周期抽取离开概率。
  state.starvationTimer = starving ? (state.starvationTimer || 0) + cap : 0
  state.leaveTimer = derived.leaveChance > 0 ? (state.leaveTimer || 0) + cap : 0
  const hungerLeave = state.starvationTimer >= CONFIG.LEAVE_INTERVAL
  let crowdingLeave = false
  if (state.leaveTimer >= CONFIG.HABITABILITY_LEAVE_INTERVAL) {
    state.leaveTimer %= CONFIG.HABITABILITY_LEAVE_INTERVAL
    crowdingLeave = gameRandom(state) < derived.leaveChance
  }
  if ((hungerLeave || crowdingLeave) && state.disciples.total > 0) {
    if (hungerLeave) state.starvationTimer = 0
    const jobs = state.disciples.jobs
    const jobId = idleDisciples(state) > 0 ? null :
      [...JOBS].sort((a, b) => Number(a.id === 'farmer') - Number(b.id === 'farmer') || (jobs[b.id] || 0) - (jobs[a.id] || 0))
        .find((job) => (jobs[job.id] || 0) > 0)?.id
    const index = state.disciples.members.findIndex(member => member.roleId === jobId && !member.onMission)
    if (index >= 0) state.disciples.members.splice(index, 1)
    recountDisciples(state.disciples)
    pushLog(state, `${hungerLeave ? '灵气长期断供' : '宜居度不足、居所拥挤'}，一名弟子收拾行囊下山了。`, 'bad')
    recompute(state, derived)
  }

  // 4) 增益到期
  const now = gameNow(state)
  if (state.buffs.some((b) => (b.until || 0) <= now)) {
    state.buffs = state.buffs.filter((b) => (b.until || 0) > now)
    recompute(state, derived)
  }

  // 5) 自动制作：勾了「自动」的配方每 time 秒一份，离线也照做（挂着就一直做）
  //    材料消耗可能使维护设施断供，收徒和事件结算前必须刷新宜居度与灾害防护。
  if (runAutoCraft(state, derived, cap) && (!reuseEconomy || !canReuseEconomy(state, derived, cap))) {
    recompute(state, derived, cap)
  }

  // 6) 历法推进：天数累加
  //    一天 3 秒（见 CALENDAR.DAY_SECONDS），所以 1 节气只有 45 秒 —— 节气变化**不写纪事**
  //    （不然纪事会被历法刷满），它只在右栏历法面板/状态行里滚动；只有「入季」和「跨年」值得进纪事。
  const calBefore = calendarAt(state.totalDays)
  state.totalDays = (state.totalDays || 0) + cap / CALENDAR.DAY_SECONDS
  const cal = calendarAt(state.totalDays)
  if (cal.termIndex !== calBefore.termIndex) {
    // 凝灵诀：节气一到，满仓的灵气按比例凝成灵液（不满仓不动手，离线也照做）
    runAutoCondense(state, derived)
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
  if (!starving && derived.leaveChance === 0) recruitArrivals(state, derived, cap, { silent: offline })
  else state.arrivalTimer = 0

  // 8) 成就
  const counters = runtimeCounters(state)
  counters.achievementSeconds += cap
  if (counters.achievementSeconds >= 0.5) {
    counters.achievementSeconds %= 0.5
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
export function seasonEffectText(ratio) {
  const parts = Object.entries(ratio || {}).map(([res, v]) => {
    const name = resourceName(res)
    return `${name} ${v > 0 ? '+' : ''}${Math.round(v * 100)}%`
  })
  return parts.length ? parts.join('、') : '无影响'
}

/**
 * 离线结算入口（同步）。
 *
 * 两条路径（见 docs/ENGINEERING.md「离线结算」）：
 * - 不超过 CONFIG.OFFLINE_EXACT_AFTER_SECONDS：沿用逐秒精确推进，与在线逐 tick 完全一致；
 * - 超过：改走**有界近似**，把整段切成至多 OFFLINE_MAX_SEGMENTS 段批量结算，
 *   计算量与离线时长脱钩，收益为估算值，可能与在线挂机不同。
 */
export function simulateOffline(state, derived, seconds, opts = {}) {
  const cap = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  if (cap <= 0) return { seconds: 0, gains: {}, disciples: 0 }
  const before = { ...state.resources }
  const disciplesBefore = state.disciples.total
  const offline = { ...opts, offline: true, events: false }
  if (isLongOffline(cap)) {
    const runner = createOfflineSegmentRunner(state, derived, cap, offline)
    runner.runBatch()
    return offlineSummary(state, before, disciplesBefore, cap, runner.stats)
  }
  advanceTicks(state, derived, cap, offline)
  return offlineSummary(state, before, disciplesBefore, cap)
}

function offlineSummary(state, before, disciplesBefore, cap, stats = null) {
  const gains = {}
  for (const r of RESOURCES) {
    const diff = (state.resources[r.id] || 0) - (before[r.id] || 0)
    if (diff > 0.01) gains[r.id] = diff
  }
  const summary = { seconds: cap, gains, disciples: state.disciples.total - disciplesBefore }
  // 有界近似额外报告实际工作量，便于基准与回归断言「计算量没有换到内部循环」。
  if (stats) {
    summary.approximate = true
    summary.segments = stats.segments
    summary.baseSegments = stats.baseSegments
    summary.industryRounds = stats.industryRounds
    summary.huntBatches = stats.huntBatches
    summary.discipleDepartures = stats.departures
  }
  return summary
}

export function throwIfSimulationCancelled(opts) {
  if (opts.signal?.aborted || opts.isCancelled?.()) {
    const error = new Error('离线结算已取消')
    error.name = 'AbortError'
    throw error
  }
}

/** 每批最多计算约8ms，随后让出主线程；同步与异步共用同一套推进器与段边界。 */
export async function simulateOfflineAsync(state, derived, seconds, opts = {}) {
  throwIfSimulationCancelled(opts)
  const cap = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  if (cap <= 0) return { seconds: 0, gains: {}, disciples: 0 }
  const before = { ...state.resources }
  const disciplesBefore = state.disciples.total
  const yieldControl = opts.yieldControl || (() => new Promise(resolve => setTimeout(resolve, 0)))
  const budget = Number.isFinite(opts.budgetMs) ? Math.max(1, opts.budgetMs) : 8
  const maxBatchSteps = Number.isInteger(opts.maxBatchSteps) ? Math.max(1, opts.maxBatchSteps) : 256
  const progress = completedSeconds => opts.onProgress?.({ completedSeconds, totalSeconds: cap,
    percent: Math.min(100, completedSeconds / cap * 100) })
  progress(0)
  await yieldControl()
  throwIfSimulationCancelled(opts)
  const offline = { ...opts, offline: true, events: false }
  // 批次只决定让出主线程的时机，不改变段边界与运算顺序：同一输入下同步与异步结果一致。
  const runner = isLongOffline(cap)
    ? createOfflineSegmentRunner(state, derived, cap, offline)
    : createTickRunner(state, derived, cap, offline)
  while (!runner.done) {
    const batchStart = performance.now()
    let steps = 0
    runner.runBatch(() => ++steps >= maxBatchSteps || performance.now() - batchStart >= budget)
    throwIfSimulationCancelled(opts)
    progress(runner.completedSeconds)
    if (!runner.done) await yieldControl()
    throwIfSimulationCancelled(opts)
  }
  return offlineSummary(state, before, disciplesBefore, cap, runner.stats)
}

/**
 * 有界近似的分段推进器：一次规划全部分段，逐段执行，同步与异步共用。
 *
 * 段边界只由「基础分段数的等分点 + 初始有效增益的到期时刻 + 总时长」决定，
 * 因此总步数与离线秒数无关；过程中新生成的任务不会追加边界。
 */
export function createOfflineSegmentRunner(state, derived, seconds, opts = {}) {
  const startAt = opts.startAt ?? gameNow(state)
  const endAt = startAt + seconds * 1000
  const plan = offlineSegments(state, seconds, startAt)
  const stats = {
    baseSegments: offlineSegmentCount(seconds),
    segments: plan.length,
    industryRounds: 0,
    huntBatches: 0,
    departures: 0,
    hungerDepartures: 0,
    crowdingDepartures: 0,
  }
  const details = opts.offline !== true || opts.economyDetails === true
  let index = 0
  let finished = false
  return {
    stats,
    get totalSegments() { return plan.length },
    get done() { return index >= plan.length },
    get completedSeconds() { return index >= plan.length ? seconds : plan[index].fromSeconds },
    runBatch(shouldYield = () => false) {
      while (index < plan.length) {
        const segment = plan[index]
        const segmentStart = startAt + segment.fromSeconds * 1000
        const segmentEnd = index === plan.length - 1 ? endAt : startAt + segment.toSeconds * 1000
        withGameContext(state, { now: () => segmentStart, economyDetails: details }, () => {
          approximateSegment(state, derived, segment, { ...opts, startAt: segmentStart, endAt: segmentEnd, stats })
        })
        index++
        if (shouldYield()) break
      }
      if (index < plan.length || finished) return
      finished = true
      // 收尾与逐秒路径相同：清理到期增益、结算超时威胁、对齐游戏时钟、补齐界面明细。
      withGameContext(state, { now: () => endAt, economyDetails: true }, () => {
        state.buffs = state.buffs.filter(buff => (Number(buff.until) || 0) > endAt)
        settleExpiredThreat(state, derived)
        state.lastTickAt = endAt
        recompute(state, derived)
      })
      logOfflineDepartures(state, stats, endAt)
    },
  }
}

/**
 * 长离线的一段有界近似推进。
 *
 * 每段只做固定次数的经济求解与批量结算：按段首状态与该段时长估算生产、口粮与维护供给，
 * 按速率乘 dt 一次结算，段后再刷新派生数据。历法直接推进完整 dt，跨季节用加权倍率折算。
 * 允许段内供给变化、加工重启与季节轮转带来误差，但不允许负数库存、超仓储增收或欠账。
 */
function approximateSegment(state, derived, segment, opts) {
  const dt = segment.seconds
  const startMs = opts.startAt
  const stats = opts.stats
  // 1) 到期增益在段开始前移除。边界已按到期时刻切分，容差只吸收秒↔毫秒的折算误差。
  if (state.buffs.length) {
    state.buffs = state.buffs.filter(buff => (Number(buff.until) || 0) > startMs + BUFF_BOUNDARY_EPS_MS)
  }
  const dayFrom = state.totalDays || 0
  const dayTo = dayFrom + dt / CALENDAR.DAY_SECONDS
  withGameContext(state, { seasonRatio: averageSeasonRatio(dayFrom, dayTo) }, () => {
    // 2) 自动分工与段首经济求解：供给按本段时长估算，不足者整段按比例降载。
    autoAssignTalentJobs(state)
    recompute(state, derived, dt)

    // 3) 已有弟子按段批量累计修炼、停留与调息；修满停止，离线仍不自动突破。
    for (const member of state.disciples.members) cultivateDisciple(member, dt, derived.trainingActive)
    if (settleExpiredThreat(state, derived)) recompute(state, derived, dt)

    // 4) 个人口粮按实际有效境界与减耗累计；断供时按口粮与维护共有的供给比例记账。
    const qiDemand = Math.max(0, -(derived.expense?.qi || 0) * dt)
    const qiAvailable = Math.max(0, (state.resources.qi || 0) + (derived.rates.qi || 0) * dt)
    const qiSupply = qiDemand > 0 ? Math.min(1, qiAvailable / qiDemand) : 0
    if (derived.discipleWeight > 0 && derived.upkeep > 0) {
      for (const member of state.disciples.members) {
        const consumed = derived.upkeep * discipleFactor(member, state.realm) / derived.discipleWeight * dt * qiSupply
        member.totalQiConsumed = Math.min(Number.MAX_SAFE_INTEGER, (member.totalQiConsumed || 0) + consumed)
      }
    }

    // 5) 资源结算：段首速率乘 dt 一次计入，受实际可用量与仓储限制，不出现负数。
    //    维护与加工共用同一份材料预算：两者都在这里按同一批库存封顶。
    for (const r of RESOURCES) {
      if (r.noProduction || r.id === 'qiEnergy') continue
      let rate = derived.rates[r.id] || 0
      if (derived.expense?.[r.id]) rate += derived.expense[r.id]
      if (rate === 0) continue
      const before = state.resources[r.id] || 0
      let next = before + rate * dt
      const max = derived.max[r.id]
      // 扩仓规则调整或拆除建筑后，超额旧库存可消费，但不能继续增加。
      if (next > max && rate > 0) next = Math.max(before, max)
      if (!Number.isFinite(next) || next < 0) next = 0
      state.resources[r.id] = next
      if (next > 0) state.seen[r.id] = true
      const gained = next - before
      if (gained > 0) {
        if (r.id === 'qi') state.stats.totalQi += gained
        if (r.id === 'insight') {
          state.stats.totalInsight += gained
          state.stats.lifeInsight = (state.stats.lifeInsight || 0) + gained
        }
        if (r.id === 'faith') state.stats.totalFaith += gained
      }
    }

    // 6) 灵能：持续产出与每秒逸散的闭式解，兼顾消耗与仓储。
    //    不能先把整段产出入库、再把全部产出按期初库存衰减 —— 那样稳定产出会长期归零。
    {
      const before = state.resources.qiEnergy || 0
      const net = (derived.rates.qiEnergy || 0) + (derived.expense?.qiEnergy || 0)
      const decay = clamp(CONFIG.QI_ENERGY_DECAY, 0, 1)
      const remain = Math.pow(1 - decay, dt)
      const lambda = decay > 0 && decay < 1 ? -Math.log(1 - decay) : 0
      let next = before * remain + (lambda > 0 ? net / lambda * (1 - remain) : net * dt)
      const max = derived.max.qiEnergy
      if (next > max && net > 0) next = Math.max(before, max)
      if (!Number.isFinite(next) || next < 0) next = 0
      state.resources.qiEnergy = next
      if (next > 0) state.seen.qiEnergy = true
    }
    trackPeak(state)

    // 7) 可选模块的离线快进（猎杀按可完成趟数批量估算；无该钩子的模块不推进）。
    if (runModuleOfflineTicks(state, derived, dt, { startAt: startMs, endAt: opts.endAt, stats })) {
      recompute(state, derived, dt)
    }

    // 8) 宜居度：断供下滑、正常回升，触底即止。
    const previousPenalty = state.habitabilityPenalty
    const starving = (state.resources.qi || 0) <= 1 && derived.netQi < 0
    state.habitabilityPenalty = clamp(
      starving ? state.habitabilityPenalty - CONFIG.HABITABILITY_STARVE_RATE * dt
        : state.habitabilityPenalty + CONFIG.HABITABILITY_RECOVER_RATE * dt,
      -60,
      0,
    )
    if (state.habitabilityPenalty !== previousPenalty) recompute(state, derived, dt)

    // 9) 流失按次数与概率一次估出这段的人数，不逐 25/60 秒抽签，
    //    也不因为长段只走一人而让数小时断粮几乎没有影响。
    state.starvationTimer = starving ? (state.starvationTimer || 0) + dt : 0
    state.leaveTimer = derived.leaveChance > 0 ? (state.leaveTimer || 0) + dt : 0
    let hungerLeaves = 0
    let crowdingLeaves = 0
    if (state.disciples.total > 0) {
      if (state.starvationTimer >= CONFIG.LEAVE_INTERVAL) {
        hungerLeaves = Math.floor(state.starvationTimer / CONFIG.LEAVE_INTERVAL)
        state.starvationTimer -= hungerLeaves * CONFIG.LEAVE_INTERVAL
      }
      if (state.leaveTimer >= CONFIG.HABITABILITY_LEAVE_INTERVAL) {
        const checks = Math.floor(state.leaveTimer / CONFIG.HABITABILITY_LEAVE_INTERVAL)
        state.leaveTimer -= checks * CONFIG.HABITABILITY_LEAVE_INTERVAL
        // 一次抽签的批量期望代替每 60 秒一次抽签：期望值与逐次抽签一致，抽签次数与离线时长无关。
        const expected = checks * derived.leaveChance
        const whole = Math.floor(expected)
        crowdingLeaves = whole + (gameRandom(state) < expected - whole ? 1 : 0)
      }
    }
    const removed = batchRemoveDisciples(state, hungerLeaves + crowdingLeaves)
    if (removed > 0) {
      const hungerRemoved = Math.min(hungerLeaves, removed)
      stats.hungerDepartures += hungerRemoved
      stats.crowdingDepartures += removed - hungerRemoved
      stats.departures += removed
      recompute(state, derived, dt)
    }

    // 10) 自动制作：非工业配方按节拍批量出货，工业配方走有界批量路径（不按成品份数循环）。
    const crafted = runAutoCraftTimers(state, derived, dt)
    const processed = derived.industrial ? runIndustrialCraftBatch(state, derived, dt, stats) : false
    if (crafted || processed) recompute(state, derived, dt)

    // 11) 历法直接推进完整 dt（不穷举节气），凝灵诀按跨过的节气数批量估算。
    state.totalDays = dayTo
    if (runAutoCondenseBatch(state, derived, dayFrom, dayTo, dt)) recompute(state, derived, dt)

    // 12) 弟子自动前来：沿用批量数量计算，新弟子只累计入门后的时间。
    if (!starving && derived.leaveChance === 0) recruitArrivals(state, derived, dt, { silent: true })
    else state.arrivalTimer = 0

    // 13) 成就按段检查一次；离线不新增随机事件。
    const counters = runtimeCounters(state)
    counters.achievementSeconds += dt
    if (counters.achievementSeconds >= 0.5) {
      counters.achievementSeconds %= 0.5
      checkAchievements(state, derived)
    }

    state.stats.playTime += dt
  })
}

/** 有界批量流失：闲散弟子先走，其次是人数最多的岗位，最后才动农夫；不走随机抽签。 */
function batchRemoveDisciples(state, count) {
  if (!(count >= 1)) return 0
  const jobs = state.disciples.jobs || {}
  const pool = state.disciples.members.filter(member => !member.onMission)
  if (!pool.length) return 0
  const rank = member => !member.roleId || !jobs[member.roleId] ? 0 : member.roleId === 'farmer' ? 2 : 1
  pool.sort((a, b) => rank(a) - rank(b) || (jobs[b.roleId] || 0) - (jobs[a.roleId] || 0) || a.id - b.id)
  const removed = new Set(pool.slice(0, Math.min(count, pool.length)).map(member => member.id))
  state.disciples.members = state.disciples.members.filter(member => !removed.has(member.id))
  recountDisciples(state.disciples)
  return removed.size
}

/** 离线流失只在窗口结束时汇总一条纪事，避免每个分段写一行。 */
function logOfflineDepartures(state, stats, at) {
  if (!(stats.departures > 0)) return
  const parts = []
  if (stats.hungerDepartures > 0) parts.push(`灵气长期断供 ${stats.hungerDepartures} 人`)
  if (stats.crowdingDepartures > 0) parts.push(`宜居度不足、居所拥挤 ${stats.crowdingDepartures} 人`)
  withGameContext(state, { now: () => at }, () => {
    pushLog(state, `闭关期间，${parts.join('，')}收拾行囊下山了。`, 'bad')
  })
}
