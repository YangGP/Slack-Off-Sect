/** Run the same attentive reference player with guaranteed, naked or fully aided breakthroughs.
 * Usage after SSR bundling: node bundle.js [mode] [seed] [hours]
 * Full aids start at the golden core; earlier 95% realms use no optional materials.
 * Real engine payments, production, deaths, karma and simulated wall time; no events.
 */
import fs from 'node:fs'
import { createInitialState } from '../src/game/state.js'
import * as E from '../src/game/engine.js'
import { createBot } from './player-bot.mjs'

const mode = process.argv[2] || 'baseline'
const seed = Number(process.argv[3] || 1)
const hours = Number(process.argv[4] || 72)
if (!['baseline', 'naked', 'aided'].includes(mode) || !Number.isInteger(seed) || seed < 1 || !Number.isFinite(hours) || hours <= 0 || hours > 168) throw Error('Invalid arguments')
let now = 1791676800000, rngState = seed >>> 0
Date.now = () => now
Math.random = () => {
  rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0
  return rngState / 4294967296
}
const s = createInitialState(), d = E.createDerived()
E.recompute(s, d)
const options = () => mode === 'aided' && s.realm >= 3
  ? Object.fromEntries(E.breakthroughPreview(s, d).availableAids.map(a => [a.id, true])) : {}
const need = () => E.breakthroughPreview(s, d, options()).cost
const attempts = Array.from({ length: 11 }, () => ({ tries: 0, success: 0, regression: 0, death: 0, paid: {} }))
const firstReach = {}, transitions = []
let elapsed = 0
let lastAttemptAt = -1
const attempt = () => {
  const target = s.realm + 1, before = s.realm, cost = need()
  if (lastAttemptAt === elapsed || target > 10 || !E.canAfford(s, cost)) return false
  lastAttemptAt = elapsed
  const record = attempts[target]
  record.tries++
  for (const [res, amount] of Object.entries(cost)) record.paid[res] = (record.paid[res] || 0) + amount
  const deaths = s.stats.breakthroughDeaths
  const ok = E.breakthrough(s, d, options(), mode === 'baseline' ? () => 0 : Math.random)
  if (ok) record.success++
  else if (s.stats.breakthroughDeaths > deaths) record.death++
  else if (s.realm < before) record.regression++
  if (s.realm !== before) {
    transitions.push({ hours: +(elapsed / 3600).toFixed(3), from: before, to: s.realm, karma: s.karma })
    if (ok && firstReach[s.realm] == null) firstReach[s.realm] = +(elapsed / 3600).toFixed(3)
  }
  return ok
}
const bot = createBot(s, d, { realmCost: need, breakthrough: attempt })
const prepare = () => {
  const fill = (id, amount, path = new Set()) => {
    if ((s.resources[id] || 0) >= amount || amount > d.max[id] || path.has(id)) return
    const recipe = E.CRAFTS.find(c => c.out === id && E.isCraftUnlocked(s, c))
    if (!recipe) return
    const copies = Math.ceil((amount - (s.resources[id] || 0)) / E.craftYield(d, recipe))
    const next = new Set(path).add(id)
    for (const [input, count] of Object.entries(recipe.cost)) fill(input, count * copies, next)
    E.craft(s, d, recipe.id, { times: copies })
  }
  for (const [id, amount] of Object.entries(need())) fill(id, amount)
}
// Same active labor policy as pacing-audit.mjs; avoids stockpiling crafted aids without
// assigning enough scholars and incense keepers to actually finance the breakthrough.
const allocateLabor = () => {
  const weights = { woodcutter: 4, miner: 3, herbalist: 2, scholar: 2, incenseKeeper: 1 }
  for (const job of E.JOBS) E.setJob(s, d, job.id, 0)
  const farmer = E.JOBS.find(job => job.id === 'farmer')
  const perFarmer = farmer.base * (1 + (d.jobRatio.farmer || 0)) * d.discipleMult * d.sourceFactor.qi
  const farmers = Math.min(s.disciples.total, Math.ceil(Math.max(0, -d.netQi + d.upkeep * 0.1) / perFarmer))
  E.setJob(s, d, 'farmer', farmers)
  const jobs = Object.entries(weights).filter(([id]) => d.unlockedJobs.includes(id))
  const totalWeight = jobs.reduce((sum, [, weight]) => sum + weight, 0)
  const remaining = E.idleDisciples(s)
  for (const [id, weight] of jobs) E.setJob(s, d, id, Math.floor(remaining * weight / totalWeight))
  for (const [id] of jobs) {
    if (!E.idleDisciples(s)) break
    E.setJob(s, d, id, s.disciples.jobs[id] + 1)
  }
}
for (elapsed = 5; elapsed <= hours * 3600; elapsed += 5) {
  // tick(dt>1) splits into seconds, so advance wall time with each second as well.
  for (let i = 0; i < 5; i++) { now += 1000; E.tick(s, d, 1, { events: false }) }
  if (elapsed % 60 === 0) allocateLabor()
  prepare()
  attempt()
  if (E.canAscend(s)) break
  bot.act()
  if (elapsed % 60 === 0) allocateLabor()
  if (E.canAscend(s)) break
  if (elapsed % 21600 === 0) console.log(`${mode} seed=${seed} t=${elapsed / 3600}h realm=${s.realm} deaths=${s.stats.breakthroughDeaths}`)
}
const result = { mode, seed, strategy: 'rush + active labor', limitHours: hours, ascensionHours: E.canAscend(s) ? +(elapsed / 3600).toFixed(3) : null,
  finalRealm: s.realm, bestRealm: s.stats.bestRealm, karma: s.karma, deaths: s.stats.breakthroughDeaths,
  firstReach, attempts: attempts.slice(1), transitions,
  buildings: s.buildings, upgrades: s.upgrades,
  next: Object.fromEntries(Object.entries(need()).map(([id, amount]) => [id, { need: amount, stock: s.resources[id], max: d.max[id] }])) }
fs.writeFileSync(`.breakthrough-time-${mode}-${seed}.json`, JSON.stringify(result, null, 2))
console.log(JSON.stringify(result))
