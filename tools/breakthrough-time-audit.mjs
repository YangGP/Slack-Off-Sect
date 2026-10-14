import { setGameContext } from '../src/game/context.js'
/** Run the same attentive reference player with guaranteed, naked or fully aided breakthroughs.
 * Usage after SSR bundling: node bundle.js [baseline|naked|aided|focus|power|rush|rush-naked|rush-aided] [seed] [hours]
 * Rush modes skip optional development, keeping material prerequisites, storage,
 * housing when full and comfort when crowded. Rush guarantees success;
 * rush-naked and rush-aided use real random breakthrough outcomes.
 * Power mode guarantees breakthroughs and waits for actual stage production at 5/6/8
 * (two complete chains and the first seal at 8);
 * it measures an intentional investment route, not natural random completion time.
 * Full aids start at the golden core; earlier 95% realms use no optional materials.
 * Real engine payments, production, deaths, karma and simulated wall time; no events.
 * Focus mode: node bundle.js focus [seed] [hours] [full|none|pill|equipment|faith] [success|regression|death]
 * Before entering realm 7 it follows the aided player with real random outcomes. After
 * entry, the first attempt at realm 8 has the requested outcome; later attempts succeed
 * to isolate preparation/recovery cost. These forced outcomes are not random samples.
 */
import fs from 'node:fs'
import { createInitialState } from '../src/game/state.js'
import * as E from './engine-fixture.mjs'
import { createBot } from './player-bot.mjs'

const mode = process.argv[2] || 'baseline'
const seed = Number(process.argv[3] || 1)
const hours = Number(process.argv[4] || 72)
const selection = process.argv[5] || 'full'
const outcome = process.argv[6] || 'success'
if (!['baseline', 'naked', 'aided', 'focus', 'power', 'rush', 'rush-naked', 'rush-aided'].includes(mode) || !Number.isInteger(seed) || seed < 1 || !Number.isFinite(hours) || hours <= 0 || hours > 168
  || !['full', 'none', 'pill', 'equipment', 'faith'].includes(selection) || !['success', 'regression', 'death'].includes(outcome)) throw Error('Invalid arguments')
let now = 1791676800000, rngState = seed >>> 0
const random = () => {
  rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0
  return rngState / 4294967296
}
const s = createInitialState(now)
setGameContext(s, { now: () => now, random })
const d = E.createDerived()
E.recompute(s, d)
const options = () => {
  if (!['aided', 'focus', 'rush-aided'].includes(mode) || s.realm < 3) return {}
  const aids = E.breakthroughPreview(s, d).availableAids
  return Object.fromEntries(aids.filter((a, index) => mode !== 'focus' || s.realm !== 7 || selection === 'full'
    || index === { pill: 0, equipment: 1, faith: 2 }[selection]).map(a => [a.id, true]))
}
const need = () => E.breakthroughPreview(s, d, options()).cost
const attempts = Array.from({ length: 11 }, () => ({ tries: 0, success: 0, regression: 0, death: 0, paid: {} }))
const firstReach = {}, transitions = []
const firstFacilities = {}, firstOutput = {}
const observePower = () => {
  for (const id of ['splitArray', 'polarizeArray', 'annihilationFurnace']) {
    if (s.buildings[id]?.count && !firstFacilities[id]) firstFacilities[id] = { hours: +(elapsed / 3600).toFixed(3), realm: s.realm }
  }
  for (const id of ['qiParticle', 'yangParticle', 'yinParticle', 'qiEnergy', 'ascensionSeal']) {
    if (s.resources[id] > 0 && !firstOutput[id]) firstOutput[id] = { hours: +(elapsed / 3600).toFixed(3), realm: s.realm }
  }
}
let elapsed = 0
let lastAttemptAt = -1
const focus = { selection, outcome, start: null, readinessMinutes: {}, shortagesSeconds: {}, capacitySeconds: {}, attempts: [], finished: false }
const snapshot = () => ({ seconds: elapsed, resources: { ...s.resources }, max: { ...d.max },
  production: { ...d.rates }, netQi: d.netQi, buildings: { ...s.buildings }, upgrades: { ...s.upgrades }, karma: s.karma })
let lastFocusObservation = -1
const observeFocus = () => {
  if (mode !== 'focus' || s.realm !== 7) return
  if (!focus.start) focus.start = snapshot()
  if (lastFocusObservation === elapsed || focus.attempts.length) return
  const dt = lastFocusObservation < 0 ? 0 : elapsed - lastFocusObservation
  lastFocusObservation = elapsed
  const preview = E.breakthroughPreview(s, d)
  const cost = need()
  for (const [id, amount] of Object.entries(cost)) {
    if (s.resources[id] < amount) focus.shortagesSeconds[id] = (focus.shortagesSeconds[id] || 0) + dt
    if (d.max[id] < amount) focus.capacitySeconds[id] = (focus.capacitySeconds[id] || 0) + dt
  }
  for (const [label, cost] of [['base', preview.cost], ...preview.availableAids.map(a => [a.name, a.cost]), ['selected', need()],
    ...Object.entries(need()).map(([id, amount]) => [`resource:${id}`, { [id]: amount }])]) {
    if (focus.readinessMinutes[label] == null && E.canAfford(s, cost)) focus.readinessMinutes[label] = +((elapsed - focus.start.seconds) / 60).toFixed(2)
  }
}
const attempt = () => {
  const target = s.realm + 1, before = s.realm, cost = need()
  if (mode === 'power' && ((s.realm === 5 && !firstOutput.qiParticle) ||
    (s.realm === 6 && (!firstOutput.yangParticle || !firstOutput.yinParticle)) ||
    (s.realm === 8 && !firstOutput.ascensionSeal))) return false
  if (lastAttemptAt === elapsed || target > 10 || !E.canAfford(s, cost)) return false
  lastAttemptAt = elapsed
  const record = attempts[target]
  record.tries++
  for (const [res, amount] of Object.entries(cost)) record.paid[res] = (record.paid[res] || 0) + amount
  const deaths = s.stats.breakthroughDeaths
  const beforeSnapshot = mode === 'focus' && target === 8 ? snapshot() : null
  let forced = []
  if (mode === 'focus' && focus.start) forced = target === 8 && !focus.attempts.length
    ? { success: [0], regression: [0.99, 0.99], death: [0.99, 0] }[outcome] : [0]
  const ok = E.breakthrough(s, d, options(), ['baseline', 'power', 'rush'].includes(mode) ? () => 0 : forced.length ? () => forced.shift() ?? 0 : random)
  if (beforeSnapshot) {
    focus.attempts.push({ minutesFromStart: +((elapsed - focus.start.seconds) / 60).toFixed(2), before: beforeSnapshot,
      afterRealm: s.realm, karma: s.karma, cost, success: ok })
    if (ok) focus.finished = true
  }
  if (ok) record.success++
  else if (s.stats.breakthroughDeaths > deaths) record.death++
  else if (s.realm < before) record.regression++
  if (s.realm !== before) {
    transitions.push({ hours: +(elapsed / 3600).toFixed(3), from: before, to: s.realm, karma: s.karma })
    if (ok && firstReach[s.realm] == null) firstReach[s.realm] = +(elapsed / 3600).toFixed(3)
  }
  return ok
}
const bot = createBot(s, d, { realmCost: need, breakthrough: attempt,
  onlyBreakthrough: mode.startsWith('rush'),
  focusProjects: () => mode === 'power' && [5, 6, 8].includes(s.realm),
  projects: () => mode === 'power' ? ({ 5: ['splitArray'], 6: ['polarizeArray'],
    8: ['splitArray', 'polarizeArray', 'annihilationFurnace'].map(id => ({ id, count: 2 })) }[s.realm] || [])
    : mode.startsWith('rush') && s.realm >= 9
      ? ['splitArray', 'polarizeArray', 'annihilationFurnace'].map(id => ({ id, count: 2 })) : [] })
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
  for (let i = 0; i < 5; i++) { now += 1000; E.tick(s, d, 1, { events: false, startAt: now - 1000 }) }
  if (elapsed % 60 === 0) allocateLabor()
  prepare()
  observePower()
  observeFocus()
  attempt()
  if (focus.finished) break
  if (E.canAscend(s)) break
  bot.act()
  observePower()
  if (focus.finished) break
  observeFocus()
  if (elapsed % 60 === 0) allocateLabor()
  if (E.canAscend(s)) break
  if (elapsed % 21600 === 0) {
    console.log(`${mode} seed=${seed} t=${elapsed / 3600}h realm=${s.realm} deaths=${s.stats.breakthroughDeaths}`)
    if (mode === 'power') console.log(JSON.stringify({ pending: [...bot.prerequisites().upgrades].filter(id => d.availableUpgrades.includes(id))
      .map(id => ({ id, cost: E.UPGRADE_MAP[id].cost, stock: Object.fromEntries(Object.keys(E.UPGRADE_MAP[id].cost).map(r => [r, s.resources[r]])) })),
      facilities: firstFacilities, output: firstOutput }))
  }
}
const result = { mode, seed, strategy: mode === 'power' ? 'stage investment + active labor + guaranteed breakthroughs'
  : mode.startsWith('rush') ? 'breakthrough prerequisites only + active labor' : 'rush + active labor', limitHours: hours, ascensionHours: E.canAscend(s) ? +(elapsed / 3600).toFixed(3) : null,
  finalRealm: s.realm, bestRealm: s.stats.bestRealm, karma: s.karma, deaths: s.stats.breakthroughDeaths,
  firstReach, firstFacilities, firstOutput, attempts: attempts.slice(1), transitions,
  buildings: s.buildings, upgrades: s.upgrades,
  pendingResearch: [...bot.prerequisites().upgrades].filter(id => d.availableUpgrades.includes(id)).map(id => ({ id,
    cost: E.UPGRADE_MAP[id].cost, stock: Object.fromEntries(Object.keys(E.UPGRADE_MAP[id].cost).map(r => [r, s.resources[r]])) })),
  next: Object.fromEntries(Object.entries(need()).map(([id, amount]) => [id, { need: amount, stock: s.resources[id], max: d.max[id] }])),
  ...(mode === 'focus' ? { focus } : {}) }
fs.mkdirSync('.smoke-breakthrough-time', { recursive: true })
fs.writeFileSync(`.smoke-breakthrough-time/result-${mode}-${seed}${mode === 'focus' ? `-${selection}-${outcome}` : ''}.json`, JSON.stringify(result, null, 2))
console.log(mode === 'focus' ? JSON.stringify({ seed, selection, outcome, finished: focus.finished, readiness: focus.readinessMinutes,
  attempts: focus.attempts.map(a => ({ minutes: a.minutesFromStart, afterRealm: a.afterRealm, karma: a.karma })), finalRealm: s.realm }) : JSON.stringify(result))
