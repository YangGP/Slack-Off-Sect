import { createInitialState } from '../src/game/state.js'
import * as E from '../src/game/engine.js'
import { createBot } from './player-bot.mjs'
import { trainDisciples } from './disciple-training.mjs'
import { REALMS } from '../src/data/realms.js'
import { cultivationRequired, SPIRITUAL_ROOT_MAP } from '../src/data/disciples.js'

const hours = Number(process.argv[2] || 72)
const seed = Number(process.argv[3] || 12345)
const mode = process.argv[4] || 'protected'
const roots = process.argv[5] || 'calibrated'
if (!(hours > 0 && hours <= 168) || !Number.isInteger(seed) || seed < 0 || seed > 4294967295 ||
  !['off', 'protected', 'greedy'].includes(mode) || !['calibrated', 'triple'].includes(roots)) throw new Error('参数：小时(0,168] 种子(uint32) off/protected/greedy calibrated/triple')
const randomStream = initial => {
  let value = initial
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296)
}
const originalRandom = Math.random, originalNow = Date.now
const epoch = Date.UTC(2026, 9, 11)
const discipleRandom = randomStream(seed ^ 0xa5a5a5a5)
Math.random = randomStream(seed)
Date.now = () => epoch
const state = createInitialState()
state.disciples.rootSeed = seed
const derived = E.createDerived()
E.recompute(state, derived)
const bot = createBot(state, derived)
const report = { hours, seed, mode, roots, events: false, karma: 0, dao: 0, decisionSeconds: 5, trainingSeconds: 60,
  attempts: 0, success: 0, failed: 0, reserved: 0, spent: {}, starvingSeconds: 0, lostDisciples: 0, waitingHours: 0,
  sectMilestones: {}, discipleMilestones: {}, snapshots: [] }
let previousRealm = 0
try {
  for (let t = 1; t <= hours * 3600; t++) {
    Date.now = () => epoch + t * 1000
    const population = state.disciples.total
    const deaths = state.stats.breakthroughDeaths
    E.tick(state, derived, 1, { events: false })
    if (roots === 'triple') for (const member of state.disciples.members) member.spiritualRoot = 'triple'
    if (t % 5 === 0) bot.act()
    if (t % 60 === 0 && mode !== 'off') {
      const result = trainDisciples(state, derived, { mode, random: discipleRandom })
      report.success += result.success
      report.failed += result.failed
      report.attempts += result.success + result.failed
      report.reserved += result.reserved
      for (const [id, amount] of Object.entries(result.spent)) report.spent[id] = (report.spent[id] || 0) + amount
    }
    if (state.resources.qi <= 1 && derived.netQi < 0) report.starvingSeconds++
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
      if (Object.values(state.resources).some(value => !Number.isFinite(value) || value < -1e-8)) throw new Error(`库存异常：${t}s`)
      if (t % 21600 === 0 || t === Math.floor(hours * 3600)) {
        const snapshot = { hours: t / 3600, sect: REALMS[state.realm].name, population: state.disciples.total,
          counts, rootCounts, waiting, upkeep: derived.upkeep, qiIncome: derived.rates.qi, netQi: derived.netQi,
          success: report.success, failed: report.failed, starvingSeconds: report.starvingSeconds, lostDisciples: report.lostDisciples }
        report.snapshots.push(snapshot)
        console.log(JSON.stringify(snapshot))
      }
    }
  }
  report.finalRealm = REALMS[state.realm].name
  report.finalKarma = state.karma
  report.deaths = state.stats.breakthroughDeaths
  console.log(`RESULT ${JSON.stringify(report)}`)
} finally {
  Math.random = originalRandom
  Date.now = originalNow
}
