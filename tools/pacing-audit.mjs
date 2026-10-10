/** Diagnose first ascension with real costs and actions, without changing game data.
 * Usage: npm run audit:pacing -- [hours] [karma] [refineLevel] [eventSeed] [rush] [dao] [labor]
 * Uses the reference bot; optional refining adds one affordable production refine per decision.
 * eventSeed enables reproducible events with a simulated wall clock; rush prioritizes realm crafting.
 * Later manual qi clicks are excluded. Stops when ascension becomes available.
 */
import { createInitialState } from '../src/game/state.js'
import * as E from '../src/game/engine.js'
import { createBot } from './player-bot.mjs'
import { EVENT_MAP } from '../src/data/events.js'

const hours = Number(process.argv[2] || 72)
const karma = Number(process.argv[3] || 0)
const refineLevel = Number(process.argv[4] || 0)
const eventSeed = Number(process.argv[5] || 0)
const rush = process.argv[6] === 'rush'
const dao = Number(process.argv[7] || 0)
const labor = process.argv[8] === 'labor'
if (!Number.isFinite(hours) || hours <= 0 || hours > 168 ||
    !Number.isInteger(karma) || karma < 0 || !Number.isInteger(refineLevel) || refineLevel < 0 || refineLevel > 10 ||
    !Number.isInteger(eventSeed) || eventSeed < 0 || eventSeed > 0xffffffff || !Number.isInteger(dao) || dao < 0) {
  throw new Error('参数：小时数 0~168，仙缘非负整数，祭炼等级 0~10')
}
let simulatedNow = Date.now()
if (eventSeed) {
  Date.now = () => simulatedNow
  let randomState = eventSeed >>> 0
  Math.random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0
    return randomState / 4294967296
  }
}
const state = createInitialState()
state.karma = karma
state.dao = dao
const derived = E.createDerived()
E.recompute(state, derived)
const bot = createBot(state, derived)
const milestones = []
let previousRealm = state.realm
let elapsed = 0
let at24h = null
const firstBuildings = {}, firstProduction = {}, firstResearch = {}
const checkpoints = []
const comfortTime = { total: 0, below: 0, target: 0, above: 0, crowded: 0 }

function snapshot() {
  const cost = E.realmCost(state, derived, state.realm + 1)
  return {
    hours: +(elapsed / 3600).toFixed(2), realm: E.REALMS[state.realm].name,
    disciples: state.disciples.total, globalMult: +derived.globalMult.toFixed(2),
    discount: derived.breakthroughDiscount,
    jobs: { ...state.disciples.jobs }, idle: E.idleDisciples(state),
    habitability: +derived.habitability.toFixed(1), habitabilityMult: derived.habitabilityMult,
    discipleMult: derived.discipleMult, leaveChance: derived.leaveChance, netQi: +derived.netQi.toFixed(2),
    materials: Object.fromEntries(['wood', 'rock', 'ore', 'herb', 'insight', 'faith'].map(id => [id, {
      stock: +(state.resources[id] || 0).toFixed(2), cap: derived.max[id],
      production: +(derived.rates[id] || 0).toFixed(3), net: +(derived.net[id] || 0).toFixed(3),
    }])),
    buildings: Object.fromEntries(Object.entries(state.buildings).map(([id, entry]) => [id, entry.count])),
    nextRealm: cost ? Object.entries(cost).map(([id, amount]) => ({
      resource: id, cost: amount, stock: Math.floor(state.resources[id] || 0),
      cap: Math.floor(derived.max[id]), rate: +(derived.rates[id] || 0).toFixed(2),
    })) : null,
    wonders: Object.fromEntries(E.BUILDINGS.filter(b => b.group === 'wonder')
      .map(b => [b.id, state.buildings[b.id]?.count || 0])),
    refines: { ...state.treasureLevels },
  }
}

// A more attentive player crafts missing realm materials before investing elsewhere.
// Use only unlocked recipes, available inputs and actual engine actions; no free resources.
function prepareRealm() {
  const fill = (id, need, path = new Set()) => {
    if ((state.resources[id] || 0) >= need || path.has(id) || need > derived.max[id]) return
    const recipe = E.CRAFTS.find(c => c.out === id && E.isCraftUnlocked(state, c))
    if (!recipe) return
    const copies = Math.ceil((need - (state.resources[id] || 0)) / E.craftYield(derived, recipe))
    const next = new Set(path).add(id)
    for (const [input, amount] of Object.entries(recipe.cost)) fill(input, amount * copies, next)
    E.craft(state, derived, recipe.id, { times: copies })
  }
  const cost = E.realmCost(state, derived, state.realm + 1)
  if (!cost) return
  for (const [id, need] of Object.entries(cost)) fill(id, need)
  E.breakthrough(state, derived)
}

// 比较会主动分配劳动力的玩家：先覆盖口粮，其余按木4、矿3、药2、悟2、香1分配。
// 只调用正常职位操作，费用、产出与建筑数据不变。
function allocateLabor() {
  const weights = { woodcutter: 4, miner: 3, herbalist: 2, scholar: 2, incenseKeeper: 1 }
  for (const job of E.JOBS) E.setJob(state, derived, job.id, 0)
  const farmer = E.JOBS.find(job => job.id === 'farmer')
  const perFarmer = farmer.base * (1 + (derived.jobRatio.farmer || 0)) * derived.discipleMult * derived.sourceFactor.qi
  const farmers = Math.min(state.disciples.total, Math.ceil(Math.max(0, -derived.netQi + derived.upkeep * 0.1) / perFarmer))
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

for (elapsed = 1; elapsed <= hours * 3600; elapsed++) {
  simulatedNow += 1000
  E.tick(state, derived, 1, { events: !!eventSeed })
  if (elapsed % 5 === 0) {
    if (state.pendingChoice) {
      const event = EVENT_MAP[state.pendingChoice.id]
      const choices = event.options.map((option, index) => {
        const spec = E.eventEffect(state, derived, option.effect || {})
        const outcome = E.eventOutcome(state, derived, spec)
        const score = outcome.rows.reduce((sum, row) => sum +
          (row.gained - row.lost) / Math.max(0.001, E.eventResourceRate(state, derived, row.res)), 0)
        return { index, score, affordable: outcome.affordable }
      }).filter(option => option.affordable).sort((a, b) => b.score - a.score)
      if (choices.length) E.resolveChoice(state, derived, choices[0].index)
    }
    if (rush) prepareRealm()
    if (labor && elapsed % 60 === 0) allocateLabor()
    bot.act()
    if (labor && elapsed % 60 === 0) allocateLabor()
    if (rush) prepareRealm()
    if (refineLevel) {
      const candidates = E.ALL_UPGRADES.filter(u => u.kind === 'treasure' && state.upgrades[u.id] &&
        (u.effects?.ratio || u.effects?.jobRatio || u.effects?.craftBonus || u.effects?.craftBonusByResource) &&
        E.treasureLevel(state, u.id) < refineLevel)
        .map(u => ({ id: u.id, cost: E.refineCost(state, u.id) }))
        .filter(u => E.canAfford(state, u.cost))
        .sort((a, b) => (a.cost.insight || 0) - (b.cost.insight || 0) || a.id.localeCompare(b.id))
      if (candidates.length) E.refineTreasure(state, derived, candidates[0].id)
    }
  }
  if (state.realm !== previousRealm) {
    milestones.push({ realm: E.REALMS[state.realm].name, hours: +(elapsed / 3600).toFixed(2), disciples: state.disciples.total,
      habitability: derived.habitability, habitabilityMult: derived.habitabilityMult, discipleMult: derived.discipleMult })
    previousRealm = state.realm
  }
  for (const [id, entry] of Object.entries(state.buildings)) {
    if (entry.count > 0 && firstBuildings[id] == null) firstBuildings[id] = +(elapsed / 60).toFixed(1)
  }
  for (const [id, rate] of Object.entries(derived.rates)) {
    if (rate > 0 && firstProduction[id] == null) firstProduction[id] = +(elapsed / 60).toFixed(1)
  }
  for (const [id, learned] of Object.entries(state.upgrades)) {
    if (learned && firstResearch[id] == null) firstResearch[id] = +(elapsed / 60).toFixed(1)
  }
  if ([3600, 7200, 14400, 28800, 43200, 86400, 172800, 259200].includes(elapsed)) checkpoints.push(snapshot())
  if (elapsed === 86400) at24h = snapshot()
  if (state.upgrades.homePlanning && state.disciples.total > 0) {
    comfortTime.total += 1
    comfortTime[derived.habitabilityMult < 1.1 - 1e-9 ? 'below' : derived.habitabilityMult > 1.2 + 1e-9 ? 'above' : 'target'] += 1
    if (derived.discipleMult < 1) comfortTime.crowded += 1
  }
  if (E.canAscend(state)) break
}
elapsed = Math.min(elapsed, hours * 3600)
console.log(JSON.stringify({ karma, dao, labor, refineLevel, eventSeed, rush, events: !!eventSeed, eventsSeen: state.stats.eventsSeen,
  ascensionHours: E.canAscend(state) ? +(elapsed / 3600).toFixed(2) : null,
  milestones, comfortTime, firstBuildingsMinutes: firstBuildings, firstProductionMinutes: firstProduction,
  firstResearchMinutes: firstResearch, checkpoints, at24h, final: snapshot() }, null, 2))
