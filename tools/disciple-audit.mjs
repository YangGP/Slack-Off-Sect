import { setGameContext } from '../src/game/context.js'
import { createInitialState } from '../src/game/state.js'
import * as E from './engine-fixture.mjs'
import { createBot } from './player-bot.mjs'
import { trainDisciples, enrollMentored } from './disciple-training.mjs'
import { REALMS } from '../src/data/realms.js'
import { cultivationRequired, SPIRITUAL_ROOT_MAP } from '../src/data/disciples.js'

const hours = Number(process.argv[2] || 72)
const seeds = String(process.argv[3] || 12345).split(',').map(Number)
const mode = process.argv[4] || 'protected'
const roots = process.argv[5] || 'calibrated'
const trainings = String(process.argv[6] || 'off').split(',')
const TRAININGS = ['off', 'mentor', 'aid', 'both']
if (!(hours > 0 && hours <= 168) || seeds.length === 0 || seeds.some(seed => !Number.isInteger(seed) || seed < 0 || seed > 4294967295) ||
  !['off', 'protected', 'greedy'].includes(mode) || !['calibrated', 'triple'].includes(roots) ||
  trainings.some(training => !TRAININGS.includes(training))) {
  throw new Error('参数：小时(0,168] 种子(逗号分隔的uint32) off/protected/greedy calibrated/triple [off|mentor|aid|both,...]')
}
const randomStream = initial => {
  let value = initial
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296)
}
const epoch = Date.UTC(2026, 9, 11)

function runOnce(seed, training) {
  const discipleRandom = randomStream(seed ^ 0xa5a5a5a5)
  let now = epoch
  const state = createInitialState(epoch)
  setGameContext(state, { now: () => now, random: randomStream(seed) })
  state.disciples.rootSeed = seed
  const derived = E.createDerived()
  E.recompute(state, derived)
  const bot = createBot(state, derived)
  const mentorOn = training === 'mentor' || training === 'both'
  const aidOn = training === 'aid' || training === 'both'
  const report = { hours, seed, mode, roots, training, events: false, karma: 0, dao: 0, decisionSeconds: 5, trainingSeconds: 60,
    attempts: 0, success: 0, failed: 0, reserved: 0, spent: {}, starvingSeconds: 0, lostDisciples: 0, waitingHours: 0,
    trainingQiSpent: 0, trainingActiveSeconds: 0, qiGained: 0, trainingQiShare: 0, mentoredPeak: 0,
    aidSpent: {}, aidApplied: 0, aidBonusInjected: 0, aidAttempts: 0, aidArmedSuccess: 0, aidInjectedOnArmed: 0,
    sectMilestones: {}, discipleMilestones: {}, snapshots: [] }
  let previousRealm = 0
  const qiStart = E.money(state.stats.totalQi)
  for (let t = 1; t <= hours * 3600; t++) {
    now = epoch + t * 1000
    const population = state.disciples.total
    const deaths = state.stats.breakthroughDeaths
    E.tick(state, derived, 1, { events: false, startAt: now - 1000 })
    if (derived.trainingActive) {
      report.trainingActiveSeconds++
      report.trainingQiSpent = E.money(report.trainingQiSpent).plus(derived.trainingCost)
    }
    if (roots === 'triple') for (const member of state.disciples.members) member.spiritualRoot = 'triple'
    if (t % 5 === 0) bot.act()
    if (t % 60 === 0) {
      if (mentorOn) {
        const enrolled = enrollMentored(state, derived)
        report.mentoredPeak = Math.max(report.mentoredPeak, enrolled.mentored)
      }
      if (mode !== 'off') {
        const result = trainDisciples(state, derived, { mode, random: discipleRandom, aid: aidOn,
          onAttempt: (member, { result: attempt, armed, bonus }) => {
            if (!armed) return
            report.aidAttempts++
            report.aidInjectedOnArmed += bonus
            if (attempt.success) report.aidArmedSuccess++
          } })
        report.success += result.success
        report.failed += result.failed
        report.attempts += result.success + result.failed
        report.reserved += result.reserved
        for (const [id, amount] of Object.entries(result.spent)) report.spent[id] = E.money(report.spent[id]).plus(amount)
        report.aidApplied += result.aidApplied
        report.aidBonusInjected += result.aidBonusInjected
        for (const [id, amount] of Object.entries(result.aidSpent)) report.aidSpent[id] = E.money(report.aidSpent[id]).plus(amount)
      }
    }
    if (E.moneyGte(1, state.resources.qi) && E.moneyLt(derived.netQi, 0)) report.starvingSeconds++
    if (state.stats.breakthroughDeaths === deaths) report.lostDisciples += Math.max(0, population - state.disciples.total)
    if (state.realm !== previousRealm) {
      report.sectMilestones[REALMS[state.realm].name] ??= t / 3600
      previousRealm = state.realm
    }
    if (t % 60 === 0) {
      const counts = Object.fromEntries(REALMS.map(realm => [realm.name, 0]))
      const rootCounts = Object.fromEntries(Object.values(SPIRITUAL_ROOT_MAP).map(root => [root.name, 0]))
      let waiting = 0
      for (const member of state.disciples.members) {
        counts[REALMS[member.realm].name]++
        rootCounts[SPIRITUAL_ROOT_MAP[member.spiritualRoot].name]++
        if (member.realm > 0) report.discipleMilestones[REALMS[member.realm].name] ??= t / 3600
        if (member.realm < REALMS.length - 1 && member.cultivation >= cultivationRequired(member.realm)) waiting++
      }
      report.waitingHours += waiting / 60
      if (Object.values(state.resources).some(value => !E.moneyFinite(value) || E.moneyLt(value, -1e-8))) throw new Error(`库存异常：${t}s`)
      if (t % 21600 === 0 || t === Math.floor(hours * 3600)) {
        const snapshot = { hours: t / 3600, sect: REALMS[state.realm].name, population: state.disciples.total,
          counts, rootCounts, waiting, upkeep: E.moneyToNumber(derived.upkeep),
          qiIncome: E.moneyToNumber(derived.rates.qi), netQi: E.moneyToNumber(derived.netQi),
          trainingCost: E.moneyToNumber(derived.trainingCost), trainingActive: derived.trainingActive,
          mentoredCount: state.disciples.members.filter(member => member.mentored).length,
          aidPending: state.disciples.members.filter(member => (member.aidBonus || 0) > 0).length,
          netQiPerPop: E.moneyToNumber(derived.netQi) / Math.max(1, state.disciples.total),
          success: report.success, failed: report.failed, starvingSeconds: report.starvingSeconds, lostDisciples: report.lostDisciples }
        report.snapshots.push(snapshot)
        console.log(JSON.stringify(snapshot))
      }
    }
  }
  report.finalRealm = REALMS[state.realm].name
  report.finalKarma = E.moneyToNumber(state.karma)
  report.deaths = state.stats.breakthroughDeaths
  report.qiGained = E.moneyToNumber(E.moneySubtract(state.stats.totalQi, qiStart))
  report.trainingQiShare = report.qiGained > 0 ? E.moneyToNumber(report.trainingQiSpent) / report.qiGained : 0
  if (E.moneyLt(report.trainingQiSpent, 0) || Object.values(report.aidSpent).some(value => E.moneyLt(value, 0))) throw new Error('培养开销异常')
  // 报告边界：金额统一降到 Number 再输出。
  report.trainingQiSpent = E.moneyToNumber(report.trainingQiSpent)
  for (const key of ['spent', 'aidSpent']) {
    report[key] = Object.fromEntries(Object.entries(report[key]).map(([id, amount]) => [id, E.moneyToNumber(amount)]))
  }
  console.log(`RESULT ${JSON.stringify(report)}`)
}

for (const seed of seeds) for (const training of trainings) runOnce(seed, training)
