/** P1成对测量：同一产业策略，只按显式参数改变护道、随机、香火或上线频率。 */
import { createInitialState, resetForAscension, resetForReincarnation } from '../../src/game/state.js'
import { setGameContext, runtimeCounters, restoreRuntimeCounters } from '../../src/game/context.js'
import { CRAFTS, craftCost } from '../../src/data/crafts.js'
import { CULTIVATION_MAP, FAITH_UPGRADE_MAP } from '../../src/data/faith.js'
import { EVENT_MAP } from '../../src/data/events.js'
import * as E from '../../src/game/engine.js'
import { createBot } from '../player-bot.mjs'
import { economyAssessment } from './pacing-economy.mjs'
import { createResourceRecorder } from './resource-recorder.mjs'
import { createSeededRandom } from './measurement-state.mjs'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { progressionDiagnostics } from '../progression-diagnostics.mjs'

export const PACING_STRATEGY = 'p1-reincarnation-v9'
const epoch = Date.UTC(2026, 9, 18)
const num = E.moneyToNumber
const numbers = map => Object.fromEntries(Object.entries(map || {}).map(([id, value]) => [id, num(value)]))
const facilities = ['splitArray', 'polarizeArray', 'annihilationFurnace']
const visitIntervals = { active: 120, quarter: 900, hourly: 3600, three: 28800, waking: 86400 }
const argumentNames = {
  wallSeconds: 'wall-seconds', traceLimit: 'trace-limit', decisionSeconds: 'decision-seconds',
  batchActions: 'batch-actions', reincarnateRealm: 'reincarnate-realm',
  reincarnatePreparation: 'reincarnate-preparation', stopRealm: 'stop-realm',
  sampleSeconds: 'sample-seconds', stopAfterReincarnation: 'stop-after-reincarnation',
}
const argumentKeys = Object.fromEntries(Object.entries(argumentNames).map(([key, name]) => [name, key]))

export function pacingOptions(args = []) {
  const result = { hours: 168, seed: 1, outcomes: 'natural', aids: 'full', faith: 'off', visits: 'active',
    events: 0, lives: 1, wallSeconds: 600, traceLimit: 1000, projects: 'stage', labor: 'reference', specialization: 'on', reserve: 'legacy', decisionSeconds: 5, batchActions: 1,
    reincarnations: 0, reincarnateRealm: 6, reincarnatePreparation: 'none', stopRealm: 0, details: 'full', record: false,
    sampleSeconds: 300, stopAfterReincarnation: false }
  for (const arg of args) {
    const match = /^--([a-z-]+)=(.+)$/.exec(arg)
    if (!match) throw Error(`无效测量参数：${arg}`)
    const key = argumentKeys[match[1]] || match[1]
    if (!Object.hasOwn(result, key)) throw Error(`未知测量参数：${match[1]}`)
    if (typeof result[key] === 'boolean' && !['true', 'false', '1', '0'].includes(match[2])) throw Error(`无效布尔参数：${key}`)
    result[key] = typeof result[key] === 'boolean' ? (match[2] === '1' || match[2] === 'true') : typeof result[key] === 'number' ? Number(match[2]) : match[2]
  }
  if (!Number.isFinite(result.hours) || result.hours <= 0 || result.hours > 3024 ||
    !Number.isInteger(result.seed) || result.seed < 1 || result.seed > 0xffffffff ||
    !['natural', 'guaranteed'].includes(result.outcomes) || !['none', 'full'].includes(result.aids) ||
    !['off', 'growth'].includes(result.faith) || !Object.hasOwn(visitIntervals, result.visits) ||
    ![0, 1].includes(result.events) || !Number.isInteger(result.lives) || result.lives < 1 || result.lives > 5 ||
    !Number.isFinite(result.wallSeconds) || result.wallSeconds <= 0 || result.wallSeconds > 7200 ||
    !Number.isInteger(result.traceLimit) || result.traceLimit < 0 || result.traceLimit > 10000 ||
    !['stage', 'none'].includes(result.projects) || !['reference', 'active'].includes(result.labor) ||
    !['on', 'off'].includes(result.specialization) || !['legacy', 'ready'].includes(result.reserve) ||
    !Number.isInteger(result.decisionSeconds) || result.decisionSeconds < 5 || result.decisionSeconds > 3600 ||
    !Number.isInteger(result.batchActions) || result.batchActions < 1 || result.batchActions > 24 ||
    !Number.isInteger(result.reincarnations) || result.reincarnations < 0 || result.reincarnations > 3 ||
    !Number.isInteger(result.reincarnateRealm) || result.reincarnateRealm < 6 || result.reincarnateRealm > 9 ||
    !['none', 'faith'].includes(result.reincarnatePreparation) ||
    !Number.isInteger(result.stopRealm) || result.stopRealm < 0 || result.stopRealm > 10 ||
    result.stopRealm > 0 && (result.reincarnations > 0 || result.lives > 1) ||
    !['full', 'decisions'].includes(result.details) || typeof result.record !== 'boolean' ||
    !Number.isInteger(result.sampleSeconds) || result.sampleSeconds < 60 || result.sampleSeconds > 1800 ||
    result.stopAfterReincarnation && (result.reincarnations < 1 || result.stopRealm > 0)) throw Error('测量参数超出允许范围')
  return result
}

/** 阶段项目不依赖突破结果，成对样本共用；这里只表达玩家投资，不改游戏数据。 */
export function stageProjects(realm, enabled = true) {
  if (!enabled) return []
  if (realm === 5) return [{ id: 'splitArray', count: 1 }]
  if (realm === 6 || realm === 7) return facilities.map(id => ({ id, count: 1 }))
  if (realm >= 8) return facilities.map(id => ({ id, count: 2 }))
  return []
}

/** 审计与回归共用真实转世结算，不赠送资源、不模拟获得道果。 */
export function reincarnatePacingState(state, derived) {
  if (!E.canReincarnate(state)) return null
  const gain = E.reincarnationGain(state, derived)
  resetForReincarnation(state, gain)
  E.recompute(state, derived)
  return gain
}

export function measurePacing(input = {}, progress = () => {}, control = {}) {
  const saved = control.resume?.simulator
  input = control.resume?.options || input
  const options = pacingOptions(Object.entries(input).map(([key, value]) =>
    `--${argumentNames[key] || key}=${value}`))
  const started = performance.now()
  let elapsed = 0, now = epoch, lastAttempt = -1, activeSeconds = 0, cappedSeconds = 0
  let life = 1, lifeStart = 0, stopReason = 'horizon'
  let previousObservation = null, previousTraceKey = null, nextDecisionAt = 0, interactionCount = 0
  const state = saved?.state || createInitialState(now), derived = saved?.derived || E.createDerived()
  const recorder = options.record ? createResourceRecorder({ options, root: control.recordRoot, resume: control.resume, ...control.recorderOptions }) : null
  // 事件和突破使用独立随机流，不让事件抽签改变成对样本的突破随机序列。
  const eventRandom = createSeededRandom((options.seed ^ 0x9e3779b9) >>> 0, saved?.eventRng), breakthroughRandom = createSeededRandom(options.seed, saved?.breakthroughRng)
  let mode = 'online'
  setGameContext(state, { now: () => now, random: eventRandom, resourceObserver: recorder?.observer })
  if (!saved) E.recompute(state, derived)
  const firstReach = {}, firstReadiness = {}, attempts = [], ascensions = [], reincarnations = [], deaths = [], checkpoints = [], trace = []
  const exposure = {}, firstFacilities = {}, firstOutput = {}, faithActions = []
  const lastResourceReady = {}
  const continuousReady = {}
  const decisionSummary = { reserveCounts: {}, researchSpending: {}, buildingSpending: {}, breakthroughSpending: {}, buildingsBought: {} }
  const addSpending = (target, cost) => {
    for (const [id, amount] of Object.entries(cost || {})) target[id] = E.money(target[id]).plus(amount)
  }
  let traceDropped = 0, decisionCount = 0, buildDecision = null, decision = null
  let lastProgressAt = 0, maxActionGapSeconds = 0, pendingStorageMilestone = null
  const firstAcquired = { upgrades: {}, buildings: {} }
  const storageMilestones = {}
  let firstDaoHeart = null, spentFaith = E.ZERO, spentVow = E.ZERO, spentDaoHeart = E.ZERO
  const nextOptions = () => options.aids === 'full' && state.realm >= 3
    ? Object.fromEntries(E.breakthroughPreview(state, derived).availableAids.map(aid => [aid.id, true])) : {}
  const need = () => E.breakthroughPreview(state, derived, nextOptions()).cost
  const projects = () => stageProjects(state.realm, options.projects === 'stage')
  const resourceGoals = () => options.projects === 'stage' && state.realm === 8 ? { ascensionSeal: 1 } : null
  const projectReady = () => projects().every(p => E.countOf(state, p.id) >= p.count) &&
    (options.projects === 'none' || state.realm < 5 || num(state.peak.qiParticle) > 0) &&
    (options.projects === 'none' || state.realm < 6 || num(state.peak.yangParticle) > 0 && num(state.peak.yinParticle) > 0) &&
    (options.projects === 'none' || state.realm < 8 || num(state.peak.ascensionSeal) > 0)
  const snapshot = () => ({ seconds: elapsed, life, realm: state.realm, population: state.disciples.total,
    jobs: { ...state.disciples.jobs }, upkeep: num(derived.upkeep), netQi: num(derived.netQi),
    resources: numbers(state.resources), capacity: numbers(derived.max), unlimitedCapacity: Object.keys(derived.max).filter(id => !derived.max[id].isFinite()), rates: numbers(derived.rates), net: numbers(derived.net),
    buildings: Object.fromEntries(Object.entries(state.buildings).map(([id, entry]) => [id, { ...entry }])),
    upgrades: { ...state.upgrades }, karma: num(state.karma), dao: num(state.dao), lifeInsight: num(E.lifeInsightOf(state)),
    karmaMult: num(derived.karmaMult), karmaStorageMult: num(derived.karmaStorageMult),
    rebirthStats: { reincarnations: state.stats.reincarnations, ascensions: state.stats.ascensions, deaths: state.stats.breakthroughDeaths },
    faith: { rituals: { ...state.faithProgression.rituals }, cultivation: { ...state.faithProgression.cultivation },
      totalDaoHeart: num(E.totalDaoHeart(state)) }, next: numbers(need()),
    processing: E.processingPlan(state, derived), diagnostics: progressionDiagnostics(state, derived, { cost: need() }) })
  const appendTrace = entry => {
    if (trace.length < options.traceLimit) trace.push(entry)
    else {
      traceDropped++
      // 保留前半开局与后半最新记录，不让长局只剩开局诊断。
      if (options.traceLimit > 1) {
        trace.splice(Math.floor(options.traceLimit / 2), 1)
        trace.push(entry)
      }
    }
  }
  const recordReadiness = () => {
    const ready = need()
    const readyKey = `${life}:${state.realm}`
    lastResourceReady[readyKey] ||= {}
    continuousReady[readyKey] ||= {}
    for (const [id, amount] of Object.entries(ready)) {
      const ok = E.moneyGte(state.resources[id] ?? E.ZERO, amount)
      if (ok && !continuousReady[readyKey][id]) lastResourceReady[readyKey][id] = elapsed
      if (!ok) delete lastResourceReady[readyKey][id]
      continuousReady[readyKey][id] = ok
    }
  }
  const observe = (kind, span = 0) => {
    if (recorder) {
      recorder.observe(state, derived, now, progressionDiagnostics(state, derived, { cost: need(), moneyAsStrings: true }), { precision: kind === 'offline' ? 'approximate-boundaries' : 'sampled-5s', projectsReady: projectReady() })
    }
    recordReadiness()
    const cost = need()
    const missing = Object.keys(cost).filter(id => E.moneyLt(state.resources[id], cost[id]))
    const capacity = Object.keys(cost).filter(id => E.moneyLt(derived.max[id], cost[id]))
    if (previousObservation && span > 0) {
      const key = `${previousObservation.life}:${previousObservation.realm}:${kind}`
      const bucket = exposure[key] ||= { seconds: 0, shortagesSeconds: {}, capacitySeconds: {}, projectSeconds: 0 }
      bucket.seconds += span
      for (const id of previousObservation.missing) bucket.shortagesSeconds[id] = (bucket.shortagesSeconds[id] || 0) + span
      for (const id of previousObservation.capacity) bucket.capacitySeconds[id] = (bucket.capacitySeconds[id] || 0) + span
      if (previousObservation.insightOnly) bucket.insightOnlySeconds = (bucket.insightOnlySeconds || 0) + span
      if (!previousObservation.projectsReady) bucket.projectSeconds += span
    }
    for (const id of Object.keys(state.upgrades || {})) if (state.upgrades[id] && firstAcquired.upgrades[id] == null) firstAcquired.upgrades[id] = elapsed
    for (const [id, entry] of Object.entries(state.buildings || {})) if (entry?.count > 0 && firstAcquired.buildings[id] == null) firstAcquired.buildings[id] = elapsed
    maxActionGapSeconds = Math.max(maxActionGapSeconds, elapsed - lastProgressAt)
    previousObservation = { life, realm: state.realm, missing, capacity, projectsReady: projectReady(), insightOnly: missing.includes('insight') && missing.every(id => id === 'insight'), at: elapsed }
    const key = `${life}:${state.realm}`
    firstReach[key] ??= { seconds: elapsed, population: state.disciples.total }
    for (const id of facilities) if (E.countOf(state, id)) firstFacilities[`${life}:${id}`] ??= elapsed
    for (const id of ['qiParticle', 'yangParticle', 'yinParticle', 'qiEnergy', 'ascensionSeal']) {
      if (E.moneyIsPositive(state.resources[id])) firstOutput[`${life}:${id}`] ??= elapsed
    }
    if (firstDaoHeart == null && E.totalDaoHeart(state).gte(1)) firstDaoHeart = elapsed
  }
  const attempt = () => {
    const readiness = firstReadiness[`${life}:${state.realm}`] ||= {}
    if (E.canAfford(state, E.realmCost(state, derived, state.realm + 1) || {})) readiness.baseSeconds ??= elapsed
    if (E.canAfford(state, need())) readiness.selectedSeconds ??= elapsed
    if (projectReady()) readiness.projectsSeconds ??= elapsed
    if (lastAttempt === elapsed || E.canAscend(state) || !projectReady() || !E.canAfford(state, need())) return false
    lastAttempt = elapsed
    const beforeRealm = state.realm, beforeDeaths = state.stats.breakthroughDeaths
    const preview = E.breakthroughPreview(state, derived, nextOptions())
    recordReadiness()
    if (recorder) recorder.observe(state, derived, now, progressionDiagnostics(state, derived, { cost: need(), moneyAsStrings: true }))
    const before = { seconds: elapsed, life, realm: beforeRealm, target: beforeRealm + 1, cost: numbers(preview.cost),
      chance: preview.chance, deathRisk: preview.deathRisk, population: state.disciples.total, upkeep: num(derived.upkeep),
      resourceReadiness: recorder?.readiness || null }
    const success = E.breakthrough(state, derived, nextOptions(), options.outcomes === 'guaranteed' ? () => 0 : breakthroughRandom)
    const death = state.stats.breakthroughDeaths > beforeDeaths
    addSpending(decisionSummary.breakthroughSpending, preview.cost)
    lastProgressAt = elapsed
    attempts.push({ ...before, success, result: death ? 'death' : success ? 'success' : state.realm < beforeRealm ? 'regression' : 'preserved' })
    if (death) { deaths.push({ ...before, karmaAfter: num(state.karma) }); life++; lifeStart = elapsed }
    if (success || death) checkpoints.push(snapshot())
    return success
  }
  const bot = createBot(state, derived, { realmCost: need, breakthrough: attempt,
    protectBreakthrough: options.reserve === 'ready',
    projects, resourceGoals, focusProjects: () => projects().some(p => E.countOf(state, p.id) < p.count),
    upgrades: () => options.faith === 'growth' && state.realm >= 4 ? ['vowPower'] : [],
    allowUpgrade: u => (options.faith === 'growth' || !FAITH_UPGRADE_MAP[u.id]) &&
      (options.specialization === 'on' || !['steelBatching', 'artifactBatching', 'spiritArtifactBatching',
        'pillBatching', 'condensePillBatching', 'nineTurnBatching'].includes(u.id)),
    onDecision: value => {
      decision = value
      const source = value.reserveSource
      const key = source ? `${source.kind}:${source.id || source.target}` : 'none'
      decisionSummary.reserveCounts[key] = (decisionSummary.reserveCounts[key] || 0) + 1
      if (value.research?.purchased) { addSpending(decisionSummary.researchSpending, value.research.cost); lastProgressAt = elapsed }
    },
    onBuildDecision: value => {
      buildDecision = value
      pendingStorageMilestone = ['depot', 'mysticVault'].includes(value.selected) && !storageMilestones[value.selected]
        ? { id: value.selected, seconds: elapsed, before: snapshot() }
        : null
    },
    onBuildResult: ({ id, cost, bought }) => {
      if (bought) {
        decisionSummary.buildingsBought[id] = (decisionSummary.buildingsBought[id] || 0) + 1
        addSpending(decisionSummary.buildingSpending, cost)
        lastProgressAt = elapsed
        if (pendingStorageMilestone?.id === id) {
          storageMilestones[id] = { seconds: pendingStorageMilestone.seconds, before: pendingStorageMilestone.before, after: snapshot() }
          pendingStorageMilestone = null
        }
      } else if (pendingStorageMilestone?.id === id) {
        pendingStorageMilestone = null
      }
    } })

  const fill = (id, amount, path = new Set()) => {
    const have = E.money(state.resources[id])
    if (have.gte(amount) || E.moneyLt(derived.max[id], amount) || path.has(id)) return
    const recipe = CRAFTS.find(c => c.out === id && E.isCraftUnlocked(state, c))
    if (!recipe) return
    const copies = E.moneyToCount(E.money(amount).minus(have).div(E.craftYield(derived, recipe)).ceil())
    const next = new Set(path).add(id)
    for (const [input, count] of Object.entries(craftCost(derived, recipe))) fill(input, E.money(count).times(copies), next)
    E.craft(state, derived, recipe.id, { times: copies })
  }
  const faithStep = () => {
    if (options.faith !== 'growth' || !E.canCondense(state)) return
    // 保留直接护道、近期研究和已请求成品的完整香火上游投入；剩余才凝愿。
    let reserve = E.money(need().faith || 0)
    const addInputs = (id, amount, path = new Set()) => {
      if (path.has(id)) return
      const missing = E.moneyMax(0, E.money(amount).minus(state.resources[id] || 0))
      const recipe = CRAFTS.find(c => c.out === id && E.isCraftUnlocked(state, c))
      if (!recipe || missing.isZero()) return
      const copies = missing.div(E.craftYield(derived, recipe)).ceil()
      for (const [input, cost] of Object.entries(craftCost(derived, recipe))) {
        const total = E.money(cost).times(copies)
        if (input === 'faith') reserve = reserve.plus(total)
        else addInputs(input, total, new Set(path).add(id))
      }
    }
    for (const [id, amount] of Object.entries(need())) addInputs(id, amount)
    reserve = E.moneyMax(reserve, decision?.reserveCost?.faith || 0, state.settings.craftReserves?.faith || 0)
    const spare = E.moneyMax(0, state.resources.faith.minus(reserve))
    let changed = false
    if (spare.gte(200) && E.moneyLt(state.resources.vow, 10000)) {
      const spent = E.moneyMin(spare, E.money(10000).minus(state.resources.vow).div(E.ONE.plus(E.vowGainFactor(state))))
      const result = E.condenseVow(state, spent)
      if (result.ok) { spentFaith = spentFaith.plus(result.spent); changed = true }
    }
    const buy = (kind, id) => {
      const cost = kind === 'ritual' ? E.ritualCost(state, id) : kind === 'cultivation' ? E.cultivationCost(state, id) : E.money(FAITH_UPGRADE_MAP[id].cost.vow || 0)
      const ok = kind === 'ritual' ? E.buyRitual(state, id) : kind === 'cultivation' ? E.buyCultivation(state, id) : E.buyFaithUpgrade(state, id)
      if (ok) {
        if (kind === 'cultivation') spentDaoHeart = spentDaoHeart.plus(cost); else spentVow = spentVow.plus(cost)
        faithActions.push({ seconds: elapsed, life, kind, id, cost: num(cost) }); changed = true
      }
      return ok
    }
    // 首版有限投资：聚香5级、收愿1级、迎香礼；其后优先完整道心，避免无限购仪轨。
    if (E.ritualLevel(state, 'gatherIncense') < 5) buy('ritual', 'gatherIncense')
    if (!state.upgrades.incenseRite) buy('upgrade', 'incenseRite')
    if (E.ritualLevel(state, 'holdVows') < 1) buy('ritual', 'holdVows')
    if (!state.upgrades.greatVowScripture) buy('upgrade', 'greatVowScripture')
    if (E.canAttest(state) && state.resources.vow.gte(10000)) {
      E.attestDaoHeart(state, 10000); changed = true
      if (firstDaoHeart == null && E.totalDaoHeart(state).gte(1)) firstDaoHeart = elapsed
    }
    for (const id of ['realmDevotion', 'tribulationVow', 'vowInsight', 'deathInsight', 'realmStability']) {
      if (E.cultivationLevel(state, id) < CULTIVATION_MAP[id].max && buy('cultivation', id)) break
    }
    if (changed) E.recompute(state, derived)
  }
  const chooseEvent = () => {
    if (!state.pendingChoice) return
    const event = EVENT_MAP[state.pendingChoice.id]
    const choices = (event?.options || []).map((option, index) => {
      const outcome = E.eventOutcome(state, derived, E.eventEffect(state, derived, option.effect || {}))
      const score = outcome.rows.reduce((sum, row) => sum + num(E.moneySubtract(row.gained, row.lost)) /
        Math.max(0.001, num(E.eventResourceRate(state, derived, row.res))), 0)
      return { index, score, affordable: outcome.affordable }
    }).filter(c => c.affordable).sort((a, b) => b.score - a.score || a.index - b.index)
    if (choices.length) E.resolveChoice(state, derived, choices[0].index)
  }
  const reincarnate = () => {
    if (reincarnations.length >= options.reincarnations || state.realm < options.reincarnateRealm || !E.canReincarnate(state)) return false
    // 可选在同一操作内先按原有有限策略兑现现成道心；不赠料、不额外等待。
    if (options.reincarnatePreparation === 'faith') faithStep()
    // 随后立即结算，不购下一境项目或再突破。
    observe('online')
    const before = snapshot(), beforeLife = life, lifeSeconds = elapsed - lifeStart
    const gain = reincarnatePacingState(state, derived)
    life++; lifeStart = elapsed
    previousObservation = null; previousTraceKey = null; decision = null; buildDecision = null
    const record = { seconds: elapsed, lifeSeconds, life: beforeLife, gain: num(gain), before, after: snapshot() }
    reincarnations.push(record)
    observe('online')
    progress({ elapsed, realm: state.realm, life, reincarnation: reincarnations.length, gain: num(gain), snapshot: record.after })
    return true
  }
  const act = () => {
    if (reincarnate()) return
    chooseEvent()
    for (const [id, amount] of Object.entries(need())) fill(id, amount)
    for (const [id, amount] of Object.entries(resourceGoals() || {})) fill(id, amount)
    attempt()
    if (reincarnate()) return
    if (E.canAscend(state)) return
    if (options.labor === 'active' && elapsed % 60 === 0) allocateLabor()
    bot.act()
    if (reincarnate()) return
    if (options.labor === 'active' && elapsed % 60 === 0) allocateLabor()
    faithStep()
    decisionCount++
    const signature = JSON.stringify([life, state.realm, decision?.reserveSource, decision?.shortRes,
      decision?.research?.id, decision?.research?.purchased, buildDecision?.selected])
    if (signature !== previousTraceKey || elapsed % 3600 === 0) {
      appendTrace({ seconds: elapsed, life, realm: state.realm, ready: E.canAfford(state, need()), projectsReady: projectReady(),
        resources: numbers(state.resources), capacity: numbers(derived.max), unlimitedCapacity: Object.keys(derived.max).filter(id => !derived.max[id].isFinite()), decision, buildDecision })
      previousTraceKey = signature
    }
  }
  const allocateLabor = () => {
    const weights = { woodcutter: 4, miner: 3, herbalist: 2, scholar: 2, incenseKeeper: 1 }
    for (const job of E.JOBS) E.setJob(state, derived, job.id, 0)
    const farmer = E.JOBS.find(job => job.id === 'farmer')
    const perFarmer = farmer.base * (1 + (derived.jobRatio.farmer || 0)) * derived.discipleMult * num(derived.sourceFactor.qi)
    const deficit = E.moneyMax(0, derived.upkeep.times(0.1).minus(derived.netQi))
    const farmers = Math.min(state.disciples.total, Math.ceil(num(deficit) / Math.max(1e-9, perFarmer)))
    E.setJob(state, derived, 'farmer', farmers)
    const jobs = Object.entries(weights).filter(([id]) => derived.unlockedJobs.includes(id))
    const totalWeight = jobs.reduce((sum, [, weight]) => sum + weight, 0)
    const remaining = E.idleDisciples(state)
    for (const [id, weight] of jobs) E.setJob(state, derived, id, Math.floor(remaining * weight / totalWeight))
    for (const [id] of jobs) {
      if (!E.idleDisciples(state)) break
      E.setJob(state, derived, id, state.disciples.jobs[id] + 1)
    }
  }
  const ascend = () => {
    if (!E.canAscend(state)) return false
    const gain = E.ascensionGain(state, derived)
    const expectedKarma = state.karma.plus(gain), expectedDao = state.dao.plus(1)
    const expectedCount = state.stats.ascensions + 1
    const settlement = { seconds: elapsed, lifeSeconds: elapsed - lifeStart, life, gain: num(gain), before: snapshot(),
      economy: economyAssessment(state, derived) }
    resetForAscension(state, gain)
    E.recompute(state, derived)
    settlement.verified = state.karma.eq(expectedKarma) && state.dao.eq(expectedDao) &&
      state.resources.karma.eq(state.karma) && state.resources.dao.eq(state.dao) &&
      state.stats.ascensions === expectedCount && state.realm === 0 && E.lifeInsightOf(state).isZero()
    if (!settlement.verified) throw Error('飞升结算状态不一致，不能标记完成')
    life++; lifeStart = elapsed; previousObservation = null
    settlement.after = snapshot()
    ascensions.push(settlement)
    observe('online')
    if (ascensions.length >= options.lives) { stopReason = 'ascensions'; return true }
    return false
  }
  const interact = () => {
    recorder?.choices(state, derived, now)
    interactionCount++
    for (let i = 0; i < options.batchActions; i++) {
      const beforeReincarnations = reincarnations.length
      act()
      if (E.canAscend(state) || reincarnations.length > beforeReincarnations) break
    }
    recorder?.choices(state, derived, now)
    nextDecisionAt = elapsed + options.decisionSeconds
  }
  let checkpointPath = null, nextCheckpoint = 21600, checkpointRealm = state.realm
  let stopRequested = false
  const requestStop = () => { stopRequested = true }
  const complete = () => stopReason === 'ascensions' || stopReason === 'reincarnations'
  const capture = () => ({ state, derived, terminal: complete() || elapsed >= Math.floor(options.hours * 3600) || options.stopRealm > 0 && state.realm >= options.stopRealm, counters: { ...runtimeCounters(state) },
    wallSpent: (saved?.wallSpent || 0) + (performance.now() - started) / 1000,
    eventRng: eventRandom.snapshot(), breakthroughRng: breakthroughRandom.snapshot(),
    nextCheckpoint, checkpointRealm,
    firstReach, firstReadiness, attempts, ascensions, reincarnations, deaths, checkpoints, trace, exposure, firstFacilities, firstOutput, faithActions, lastResourceReady, continuousReady, decisionSummary, firstAcquired, storageMilestones, elapsed, now, lastAttempt, activeSeconds, cappedSeconds, life, lifeStart, previousObservation, previousTraceKey, nextDecisionAt, interactionCount, traceDropped, decisionCount, buildDecision, decision, lastProgressAt, maxActionGapSeconds, pendingStorageMilestone, firstDaoHeart, spentFaith, spentVow, spentDaoHeart })
  if (saved) {
    ;({ elapsed, now, lastAttempt, activeSeconds, cappedSeconds, life, lifeStart, previousObservation, previousTraceKey, nextDecisionAt, interactionCount, traceDropped, decisionCount, buildDecision, decision, lastProgressAt, maxActionGapSeconds, pendingStorageMilestone, firstDaoHeart, spentFaith, spentVow, spentDaoHeart } = saved)
    Object.assign(firstReach, saved.firstReach)
    Object.assign(firstReadiness, saved.firstReadiness)
    Object.assign(attempts, saved.attempts)
    Object.assign(ascensions, saved.ascensions)
    Object.assign(reincarnations, saved.reincarnations)
    Object.assign(deaths, saved.deaths)
    Object.assign(checkpoints, saved.checkpoints)
    Object.assign(trace, saved.trace)
    Object.assign(exposure, saved.exposure)
    Object.assign(firstFacilities, saved.firstFacilities)
    Object.assign(firstOutput, saved.firstOutput)
    Object.assign(faithActions, saved.faithActions)
    Object.assign(lastResourceReady, saved.lastResourceReady)
    Object.assign(continuousReady, saved.continuousReady)
    Object.assign(decisionSummary, saved.decisionSummary)
    Object.assign(firstAcquired, saved.firstAcquired)
    Object.assign(storageMilestones, saved.storageMilestones)
    nextCheckpoint = saved.nextCheckpoint; checkpointRealm = saved.checkpointRealm
    restoreRuntimeCounters(state, saved.counters)
  }
  recorder?.setEnvironment(() => ({ lifeId: 1 + state.stats.breakthroughDeaths + state.stats.reincarnations + state.stats.ascensions,
    currentRealm: state.realm, targetRealm: state.realm + 1,
    online: mode === 'online', simulatedMs: elapsed * 1000 }))
  recorder?.open(state, now, derived)
  const saveCheckpoint = () => recorder?.checkpoint(capture(), state, derived, now) || null
  const saveCheckpointIfNeeded = () => {
    if (recorder && (elapsed >= nextCheckpoint || checkpointRealm !== state.realm)) {
      nextCheckpoint = Math.floor(elapsed / 21600 + 1) * 21600; checkpointRealm = state.realm
      checkpointPath = saveCheckpoint()
    }
  }
  const shouldStop = () => {
    if (options.stopAfterReincarnation && reincarnations.length >= options.reincarnations) {
      stopReason = 'reincarnations'; return true
    }
    if (stopRequested || recorder && existsSync(join(recorder.dir, 'STOP')) || control.stopAtSeconds != null && elapsed >= control.stopAtSeconds) {
      stopReason = 'interrupted'; return true
    }
    if (recorder?.recordBudget) { stopReason = 'record-budget'; return true }
    recorder?.check()
    return false
  }
  if (!saved) { observe('online'); interact(); checkpointPath = saveCheckpoint() }
  process.on('SIGINT', requestStop); process.on('SIGTERM', requestStop)

  const total = Math.floor(options.hours * 3600), interval = visitIntervals[options.visits]
  try {
  while (elapsed < total) {
    if (shouldStop()) break
    if ((saved?.wallSpent || 0) + (performance.now() - started) / 1000 >= options.wallSeconds) { stopReason = 'wall-budget'; break }
    // 共同开局15分钟；后续每次上线2分钟，间隔从该共同开局结束起计算。
    const waking = options.visits === 'waking'
    const phase = waking ? elapsed % 86400 : elapsed < 900 ? 0 : (elapsed - 900 + 120) % interval
    const onlineEnd = waking ? 57600 : 120
    if ((waking || elapsed >= 900) && phase >= onlineEnd) {
      const away = Math.min(interval - phase, total - elapsed)
      const simulated = Math.min(away, Math.floor(derived.offlineHours * 3600))
      const startAt = now
      mode = 'offline'
      if (recorder) recorder.observe(state, derived, now, progressionDiagnostics(state, derived, { cost: need(), moneyAsStrings: true }))
      E.simulateOffline(state, derived, simulated, { startAt })
      cappedSeconds += away - simulated
      elapsed += away; now = epoch + elapsed * 1000
      // 与运行层一样，超上限时间也使现实到期增益／威胁到期。
      state.buffs = state.buffs.filter(buff => buff.until > now)
      E.settleExpiredThreat(state, derived)
      state.lastTickAt = now
      E.recompute(state, derived)
      observe('offline', away)
      nextDecisionAt = elapsed
      mode = 'online'
      if (recorder) recorder.observe(state, derived, now, progressionDiagnostics(state, derived, { cost: need(), moneyAsStrings: true }))
      saveCheckpointIfNeeded()
      continue
    }
    // 醒来立即操作；其余时间仅到指定决策时点才集中处理，不在等待期偷跑决策。
    if (elapsed >= nextDecisionAt) {
      interact()
      if (shouldStop()) break
      if (options.stopRealm && state.realm >= options.stopRealm) { stopReason = 'realm-target'; break }
      if (ascend()) break
    }
    const seconds = Math.min(5, total - elapsed, waking ? onlineEnd - phase : elapsed < 900 ? 900 - elapsed : 120 - phase,
      nextDecisionAt - elapsed)
    const startAt = now
    now += seconds * 1000; elapsed += seconds; activeSeconds += seconds
    // tick内部仍按引擎逐秒边界推进；批次仅减少夹具和报告开销。
    E.tick(state, derived, seconds, { events: !!options.events, startAt, cacheEconomy: true, economyDetails: false,
      finalEconomyDetails: options.details === 'full' || elapsed >= nextDecisionAt })
    if (elapsed >= nextDecisionAt && (!waking || elapsed % 86400 < 57600)) interact()
    observe('online', seconds)
    if (options.stopAfterReincarnation && reincarnations.length >= options.reincarnations) { stopReason = 'reincarnations'; break }
    if (options.stopRealm && state.realm >= options.stopRealm) { stopReason = 'realm-target'; break }
    if (ascend()) break
    saveCheckpointIfNeeded()
    if (elapsed % 21600 === 0) {
      const checkpoint = snapshot()
      checkpoints.push(checkpoint)
      progress({ elapsed, realm: state.realm, life, ascensions: ascensions.length, snapshot: checkpoint })
    }
  }
  } catch (error) {
    recorder?.abort(error)
    throw error
  } finally {
    process.removeListener('SIGINT', requestStop); process.removeListener('SIGTERM', requestStop)
  }
  if (options.details === 'decisions') E.recompute(state, derived)
  if (recorder) checkpointPath = saveCheckpoint()
  const recording = recorder ? recorder.finish(state, { completed: complete(), stopReason, elapsed: now, derived }) : null
  return { strategy: PACING_STRATEGY, options, completed: complete(), stopReason,
    simulatedSeconds: elapsed, wallSeconds: (performance.now() - started) / 1000,
    cumulativeWallSeconds: (saved?.wallSpent || 0) + (performance.now() - started) / 1000,
    activeSeconds, cappedSeconds, firstReach, firstReadiness, attempts, ascensions, reincarnations, deaths, checkpoints,
    firstFacilities, firstOutput, firstAcquired, storageMilestones, exposure, lastResourceReady, maxActionGapSeconds, firstDaoHeartSeconds: firstDaoHeart,
    faith: { spentFaith: num(spentFaith), spentVow: num(spentVow), spentDaoHeart: num(spentDaoHeart), actions: faithActions },
    interactionCount, decisionCount, decisionSummary, trace, traceDropped, final: snapshot(), economy: economyAssessment(state, derived), recording, checkpointPath,
    runtimeState: control.includeRuntime ? capture() : undefined,
    boundaries: [`每${options.decisionSeconds}秒集中执行至多${options.batchActions}步；玩家即时制作；阶段项目按真实动作建设`,
      options.visits === 'waking' ? '每日前16小时在线、后8小时离线；不模拟工作等额外离开' : '共同开局15分钟，后续按指定上线窗口',
      'offline为有界近似；缺料／仓容时长按区间左端采样，不作精确因果分解',
      '只在真实飞升动作结算后记录ascensions；死亡与截止样本保留',
      `全程主动转世至多${options.reincarnations}次，到达境界${options.reincarnateRealm}立即结算；作息不重启、随机流不重置、累计时间不清零`,
      `转世前香火准备=${options.reincarnatePreparation}；faith仅执行一次原有香火策略，不等待额外资源`,
      '在线tick批次仍为5秒；目标境界截止不计为飞升完成',
      `经济提示明细=${options.details}；decisions仅省略等待期提示计算，动作前及最终恢复完整派生`,
      '固定有限D7投资策略，不代表香火最优解；不以工具预算截止视为游戏不可达'] }
}
