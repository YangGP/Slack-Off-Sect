import fs from 'node:fs'
import { createInitialState } from '../src/game/state.js'
import { setGameContext } from '../src/game/context.js'
import * as E from './engine-fixture.mjs'
import { createBot } from './player-bot.mjs'
import { progressionDiagnostics } from './progression-diagnostics.mjs'
import { REALMS } from '../src/data/realms.js'
import { RESOURCES } from '../src/data/resources.js'
import { discipleDismissalCost, discipleAnnualBaseUpkeep } from '../src/data/disciples.js'

const hours = Number(process.argv[2] || 72)
const seed = Number(process.argv[3] || 12345)
if (!Number.isFinite(hours) || hours <= 0 || hours > 168 ||
    !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff ||
    (process.argv[4] && !['guaranteed', 'natural'].includes(process.argv[4])) ||
    (process.argv[5] && !['on', 'off'].includes(process.argv[5]))) {
  throw new Error('参数：小时数0~168、32位无符号种子、guaranteed/natural、on/off')
}
const guaranteed = process.argv[4] !== 'natural'
const auto = process.argv[5] !== 'off'
let now = Date.UTC(2026, 9, 11), rng = seed >>> 0
const random = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 4294967296)
const state = createInitialState(now)
state.disciples.rootSeed = seed >>> 0
state.disciples.talentSeed = (seed ^ 0x6d2b79f5) >>> 0
state.settings.autoTalentJobs = auto
setGameContext(state, { now: () => now, random })
const derived = E.createDerived()
E.recompute(state, derived)
const attempts = { success: 0, failed: 0, death: 0, regression: 0 }
const bot = createBot(state, derived, { breakthrough(s, d) {
  if (!REALMS[s.realm + 1] || !E.canAfford(s, E.breakthroughPreview(s, d).cost)) return false
  const before = s.realm
  const result = guaranteed ? E.breakthrough(s, d, {}, () => 0) : E.breakthrough(s, d)
  if (result) attempts.success++
  else {
    attempts.failed++
    if (s.realm === 0 && before >= 4) attempts.death++
    else if (s.realm < before) attempts.regression++
  }
  return result
} })
const milestones = [], research = {}, buildings = {}, snapshots = []
const metrics = { sampledMinutes: 0, starvingMinutes: 0, crowdedMinutes: 0, negativeQiMinutes: 0, invalidResources: [] }
const materialIds = ['qi', 'wood', 'rock', 'ore', 'herb', 'stone', 'insight', 'faith']
let previousRealm = state.realm, elapsed = 0
function snapshot() {
  const fees = state.disciples.members.map(m => discipleDismissalCost(m, state.realm)).sort((a, b) => a - b)
  return {
    hours: +(elapsed / 3600).toFixed(3), realm: REALMS[state.realm].name,
    disciples: state.disciples.total, jobs: { ...state.disciples.jobs }, idle: E.idleDisciples(state),
    habitability: derived.habitability, habitabilityMult: derived.habitabilityMult,
    discipleMult: derived.discipleMult,
    materials: Object.fromEntries(materialIds.map(id => [id, {
      have: +(state.resources[id] || 0).toFixed(2), cap: derived.max[id],
      income: +(derived.rates[id] || 0).toFixed(3), upkeep: +(derived.expense[id] || 0).toFixed(3),
      net: +(derived.net[id] || 0).toFixed(3),
    }])),
    dismissal: { min: fees[0], median: fees[Math.floor(fees.length / 2)], max: fees.at(-1),
      affordable: fees.filter(fee => fee <= state.resources.qi).length,
      firstAnnualBase: state.disciples.members[0] ? discipleAnnualBaseUpkeep(state.disciples.members[0], state.realm) : null },
    diagnostics: progressionDiagnostics(state, derived),
  }
}
for (elapsed = 1; elapsed <= hours * 3600; elapsed++) {
  now += 1000
  E.tick(state, derived, 1, { events: false, startAt: now - 1000 })
  if (elapsed % 5 === 0) bot.act()
  if (elapsed % 60 === 0) {
    metrics.sampledMinutes++
    if (state.starvationTimer > 0) metrics.starvingMinutes++
    if (derived.discipleMult < 1) metrics.crowdedMinutes++
    if (derived.netQi < 0) metrics.negativeQiMinutes++
    for (const r of RESOURCES) if (!Number.isFinite(state.resources[r.id]) || state.resources[r.id] < 0) metrics.invalidResources.push({ second: elapsed, id: r.id })
  }
  for (const [id, learned] of Object.entries(state.upgrades)) if (learned && research[id] == null) research[id] = +(elapsed / 3600).toFixed(3)
  for (const [id, entry] of Object.entries(state.buildings)) if (entry.count > 0 && buildings[id] == null) buildings[id] = +(elapsed / 3600).toFixed(3)
  if (state.realm !== previousRealm) {
    milestones.push({ hours: +(elapsed / 3600).toFixed(3), realm: REALMS[state.realm].name })
    previousRealm = state.realm
  }
  if ([1, 2, 4, 8, 12, 24, 48, 72].includes(elapsed / 3600)) {
    snapshots.push(snapshot())
    console.log(JSON.stringify({ seed, guaranteed, auto, checkpoint: elapsed / 3600, realm: REALMS[state.realm].name, nextMissing: snapshots.at(-1).diagnostics.missing.map(x => x.resource), jobs: state.disciples.jobs }))
  }
  if (E.canAscend(state)) break
}
elapsed = Math.min(elapsed, hours * 3600)
const result = { seed, guaranteed, auto, hours, strategy: 'reference bot, decisions every 5 seconds, no random events', ascensionHours: E.canAscend(state) ? +(elapsed / 3600).toFixed(3) : null,
  attempts, metrics, milestones, firstResearchHours: research, firstBuildingsHours: buildings, snapshots, final: snapshot() }
fs.mkdirSync('.smoke-balance-review', { recursive: true })
const file = `.smoke-balance-review/${seed}-${guaranteed ? 'guaranteed' : 'natural'}-${auto ? 'on' : 'off'}.json`
fs.writeFileSync(file, JSON.stringify(result, null, 2))
console.log(JSON.stringify({ file, ascensionHours: result.ascensionHours, milestones, metrics, attempts, final: result.final }))
