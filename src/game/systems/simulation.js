import { ACHIEVEMENTS } from '@/data/achievements'
import { pushLog, trackPeak, clamp, idleDisciples, calendarAt } from './core'
import { recompute, canReuseEconomy } from './economy'
import { gameNow, withGameContext, gameRandom, runtimeCounters } from '../context'
import { settleExpiredThreat, fireEvent } from './events'
import { runModuleTicks, nextModuleDeadline } from '@/game/moduleRegistry'
import { cultivateDisciple, discipleFactor, recountDisciples } from '@/data/disciples'
import { RESOURCES, resourceName } from '@/data/resources'
import { CONFIG } from '@/data/config'
import { JOBS } from '@/data/jobs'
import { BUILDINGS } from '@/data/buildings'
import { ALL_UPGRADES } from '@/data/upgrades'
import { runAutoCraft, runAutoCondense } from './crafting'
import { CALENDAR } from '@/data/calendar'
import { recruitArrivals, autoAssignTalentJobs } from './disciples'

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
  const maxSliceMs = seconds > CONFIG.OFFLINE_COARSE_AFTER_SECONDS
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

/** 离线结算：把离线时间切成 1 秒一段推进，避免公式失真 */
export function simulateOffline(state, derived, seconds, opts = {}) {
  const cap = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  if (cap <= 0) return { seconds: 0, gains: {}, disciples: 0 }
  const before = { ...state.resources }
  const disciplesBefore = state.disciples.total
  advanceTicks(state, derived, cap, { ...opts, offline: true, events: false })
  return offlineSummary(state, before, disciplesBefore, cap)
}

function offlineSummary(state, before, disciplesBefore, cap) {
  const gains = {}
  for (const r of RESOURCES) {
    const diff = (state.resources[r.id] || 0) - (before[r.id] || 0)
    if (diff > 0.01) gains[r.id] = diff
  }
  return { seconds: cap, gains, disciples: state.disciples.total - disciplesBefore }
}

export function throwIfSimulationCancelled(opts) {
  if (opts.signal?.aborted || opts.isCancelled?.()) {
    const error = new Error('离线结算已取消')
    error.name = 'AbortError'
    throw error
  }
}

/** 每批最多计算约8ms，随后让出主线程；仍逐秒处理所有游戏结算边界。 */
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
  const runner = createTickRunner(state, derived, cap, { ...opts, offline: true, events: false })
  while (!runner.done) {
    const batchStart = performance.now()
    let steps = 0
    runner.runBatch(() => ++steps >= maxBatchSteps || performance.now() - batchStart >= budget)
    throwIfSimulationCancelled(opts)
    progress(runner.completedSeconds)
    if (!runner.done) await yieldControl()
    throwIfSimulationCancelled(opts)
  }
  return offlineSummary(state, before, disciplesBefore, cap)
}
