/** Controlled load experiments; fixtures are not a natural player progression. */
import { createInitialState, normalizeState } from '../src/game/state.js'
import * as E from './engine-fixture.mjs'
import { CRAFT_MAP, craftTime } from '../src/data/crafts.js'
import { PROCESSING_STATIONS } from '../src/data/industry.js'

let checks = 0
function assert(label, condition) {
  if (!condition) throw new Error(label)
  checks++
}
function fixture() {
  const s = createInitialState(), d = E.createDerived()
  s.realm = 9
  for (const id of ['intuition', 'craftTempo', 'woodworking', 'steelWorking', 'arrayAssembly', 'qiLiquid', 'liquidArt', 'crystalCraft', 'energyApplication', 'energyCore', 'yinyangSplit', 'annihilationArt']) s.upgrades[id] = true
  for (const id of ['forge', 'workshop', 'talismanHall', 'alchemyRoom', 'crystalArray']) s.buildings[id] = { count: 1, on: true }
  s.buildings.warehouse = { count: 500, on: true }
  s.buildings.granary = { count: 500, on: true }
  s.buildings.depot = { count: 500, on: true }
  s.buildings.grotto = { count: 1, on: true }
  s.buildings.annihilationFurnace = { count: 4, on: true }
  E.recompute(s, d)
  for (const id of Object.keys(s.resources)) if (Number.isFinite(d.max[id])) s.resources[id] = d.max[id] * 0.8
  s.resources.steel = s.resources.plank = s.resources.talisman = s.resources.pill = s.resources.spiritLiquid = 0
  s.settings.craftReservePercent = 0
  s.autoCraft.refineSteel = true
  s.settings.autoCraftSpeeds.refineSteel = 10
  E.recompute(s, d)
  return { s, d }
}
function run(mode, seconds = 600, adjust = () => {}) {
  const { s, d } = fixture()
  adjust(s, d)
  E.recompute(s, d)
  assert(`valid mode ${mode}`, E.setProcessingMode(s, d, 'forge', mode))
  let chargedQi = 0, chargedEnergy = 0, boostedSeconds = 0
  for (let i = 0; i < seconds; i++) {
    const line = E.processingPlan(s, d).refineSteel
    if (line.boost > 0) boostedSeconds++
    chargedQi += line.powerDrain.qi || 0
    chargedEnergy += line.powerDrain.qiEnergy || 0
    E.tick(s, d, 1, { events: false, offline: true })
    assert('stocks stay finite and nonnegative', Object.values(s.resources).every(n => Number.isFinite(n) && n >= 0))
  }
  const timer = s.craftTimers.refineSteel || { made: 0, t: 0 }
  return { mode, seconds, output: s.resources.steel, processingSeconds: +(timer.made * craftTime(CRAFT_MAP.refineSteel, d) + timer.t).toFixed(4), boostedSeconds,
    estimatedExtraQi: +chargedQi.toFixed(4), estimatedExtraEnergy: +chargedEnergy.toFixed(4), energyLeft: +s.resources.qiEnergy.toFixed(4) }
}

const sustained = ['normal', 'overload', 'energy'].map(mode => run(mode))
assert('overload performs more processing than normal', sustained[1].processingSeconds > sustained[0].processingSeconds * 1.9)
assert('sustained energy performs more processing than normal', sustained[2].processingSeconds > sustained[0].processingSeconds * 1.9)
const noSupply = run('energy', 600, (s) => { s.buildings.annihilationFurnace.on = false; s.resources.qiEnergy = 5 })
assert('fuel-starved line continues normal work', noSupply.processingSeconds >= sustained[0].processingSeconds && noSupply.processingSeconds < sustained[2].processingSeconds)

const { s, d } = fixture()
for (const id of ['sawPlank', 'drawTalisman', 'refinePill', 'condenseLiquid']) {
  s.autoCraft[id] = true
  s.settings.autoCraftSpeeds[id] = 10
}
for (const station of PROCESSING_STATIONS) s.settings.processingModes[station.id] = 'energy'
E.recompute(s, d)
const plan = E.processingPlan(s, d)
const byStation = Object.fromEntries(Object.values(plan).map(line => [line.station, line]))
const coolingUsed = Object.values(byStation).reduce((sum, line) => sum + line.boost, 0)
assert('all stations share one cooling budget', coolingUsed <= d.processingCoolingCapacity + 1e-8)
assert('all energy stations share one power budget', coolingUsed <= d.processingPowerCapacity + 1e-8)
const load = Object.values(byStation).filter(line => Object.values(plan).some(r => r.station === line.station && r.work > 0))
  .map(line => ({ station: line.station, base: line.baseCapacity, boost: +line.boost.toFixed(4), reason: line.powerReason }))
assert('shared load actually includes multiple stations', load.length >= 4)
for (const station of PROCESSING_STATIONS) s.settings.processingModes[station.id] = 'overload'
E.recompute(s, d)
const coldPlan = E.processingPlan(s, d)
const coldLines = Object.fromEntries(Object.values(coldPlan).map(line => [line.station, line]))
const coldUsed = Object.values(coldLines).reduce((sum, line) => sum + line.boost, 0)
assert('overload saturation respects cooling budget', Math.abs(coldUsed - d.processingCoolingCapacity) < 1e-6)
assert('cooling shortage is explained', Object.values(coldLines).some(line => line.powerReason === '冷却容量限制'))
for (const station of PROCESSING_STATIONS) s.settings.processingModes[station.id] = 'energy'
E.recompute(s, d)

const online = normalizeState(JSON.parse(JSON.stringify(s))), offline = normalizeState(JSON.parse(JSON.stringify(s)))
const od = E.createDerived(), fd = E.createDerived()
E.recompute(online, od); E.recompute(offline, fd)
for (let i = 0; i < 120; i++) E.tick(online, od, 1, { events: false, offline: true })
const longReport = E.simulateOffline(offline, fd, 120)
// 长离线改走有界近似（段内供给与工位重分配按段估算），不再要求与逐秒参考逐位相同；
// 但库存必须有限非负、加工不得积攒欠账，产量与逐秒参考保持同一量级。
assert('long offline keeps powered stations finite and nonnegative',
  Object.keys(s.resources).every(id => Number.isFinite(offline.resources[id]) && offline.resources[id] >= 0))
assert('long offline reports bounded segments and industry rounds',
  longReport.approximate === true && longReport.segments <= longReport.baseSegments &&
  longReport.industryRounds <= longReport.segments * 2)
assert('long offline does not accumulate processing backlog',
  Object.entries(offline.craftTimers).every(([id, timer]) => !CRAFT_MAP[id] || timer.t <= craftTime(CRAFT_MAP[id], fd) + 1e-9))
assert('multiple powered stations approximate the per-second reference within the same order',
  ['steel', 'qi', 'qiEnergy'].every(id => Math.abs(online.resources[id] - offline.resources[id])
    <= Math.max(1, Math.abs(online.resources[id]) * 0.5)))

const polar = fixture()
polar.s.buildings.polarizeArray = { count: 2, on: true }
polar.s.buildings.annihilationFurnace.count = 1
E.recompute(polar.s, polar.d)
polar.s.resources.yangParticle = polar.d.max.yangParticle
polar.s.resources.yinParticle = 0
const initialYang = polar.s.resources.yangParticle
let lowestLoad = 1, highestLoad = 0
for (let i = 0; i < 600; i++) {
  E.tick(polar.s, polar.d, 1, { events: false, offline: true })
  lowestLoad = Math.min(lowestLoad, polar.d.buildingSupply.polarizeArray)
  highestLoad = Math.max(highestLoad, polar.d.buildingSupply.polarizeArray)
  assert('full side stays within storage', polar.s.resources.yangParticle <= initialYang + 1e-6)
}
assert('imbalanced pair can still feed annihilation', polar.d.rates.qiEnergy > 0 && polar.s.resources.yinParticle >= 0)

console.log(JSON.stringify({ checks, sustained, noSupply, shared: { powerCapacity: d.processingPowerCapacity, coolingCapacity: d.processingCoolingCapacity, coolingUsed, load, overloadCoolingUsed: coldUsed },
  paired: { seconds: 600, lowestLoad, highestLoad, initialYang, finalYang: polar.s.resources.yangParticle, finalYin: polar.s.resources.yinParticle, energyRate: polar.d.rates.qiEnergy } }, null, 2))
