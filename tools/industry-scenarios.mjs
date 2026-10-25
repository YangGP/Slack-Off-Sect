/** Controlled load experiments; fixtures are not a natural player progression. */
import { createInitialState, normalizeState } from '../src/game/state.js'
import * as E from './engine-fixture.mjs'
import { CRAFT_MAP, craftTime } from '../src/data/crafts.js'
import { PROCESSING_STATIONS } from '../src/data/industry.js'

let checks = 0
// 固定供料的负荷回归默认观察一分钟；十分钟稳态测量按需显式运行。
const duration = process.argv.includes('--full') ? 600 : 60
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
  s.buildings.warehouse = { count: 2500, on: true }
  s.buildings.grotto = { count: 1, on: true }
  s.buildings.annihilationFurnace = { count: 4, on: true }
  E.recompute(s, d)
  for (const id of Object.keys(s.resources)) if (d.max[id].isFinite()) s.resources[id] = d.max[id].times('0.8')
  for (const id of ['steel', 'plank', 'talisman', 'pill', 'spiritLiquid']) s.resources[id] = E.money(0)
  s.settings.craftReservePercent = 0
  s.autoCraft.refineSteel = true
  s.settings.autoCraftSpeeds.refineSteel = 10
  E.recompute(s, d)
  return { s, d }
}
function run(mode, seconds = duration, adjust = () => {}) {
  const { s, d } = fixture()
  adjust(s, d)
  E.recompute(s, d)
  assert(`valid mode ${mode}`, E.setProcessingMode(s, d, 'forge', mode))
  let chargedQi = E.money(0), chargedEnergy = E.money(0), boostedSeconds = 0
  let validStocks = true
  for (let i = 0; i < seconds; i++) {
    const line = E.processingPlan(s, d).refineSteel
    if (line.boost > 0) boostedSeconds++
    chargedQi = chargedQi.plus(line.powerDrain.qi ?? E.ZERO)
    chargedEnergy = chargedEnergy.plus(line.powerDrain.qiEnergy ?? E.ZERO)
    E.tick(s, d, 1, { events: false, offline: true })
    validStocks &&= Object.values(s.resources).every(n => E.moneyFinite(n) && !n.isNegative())
  }
  assert('stocks stay finite and nonnegative throughout the scenario', validStocks)
  const timer = s.craftTimers.refineSteel || { made: 0, t: 0 }
  return { mode, seconds, output: E.moneyToNumber(s.resources.steel), processingSeconds: +(timer.made * craftTime(CRAFT_MAP.refineSteel, d) + timer.t).toFixed(4), boostedSeconds,
    estimatedExtraQi: +E.moneyToNumber(chargedQi).toFixed(4), estimatedExtraEnergy: +E.moneyToNumber(chargedEnergy).toFixed(4), energyLeft: +E.moneyToNumber(s.resources.qiEnergy).toFixed(4) }
}

const sustained = ['normal', 'overload', 'energy'].map(mode => run(mode))
assert('overload performs more processing than normal', sustained[1].processingSeconds > sustained[0].processingSeconds * 1.9)
assert('sustained energy performs more processing than normal', sustained[2].processingSeconds > sustained[0].processingSeconds * 1.9)
const noSupply = run('energy', duration, (s) => { s.buildings.annihilationFurnace.on = false; s.resources.qiEnergy = E.money(5) })
assert('fuel-starved line boosts first and then continues normal work', noSupply.processingSeconds > sustained[0].processingSeconds &&
  noSupply.processingSeconds < sustained[2].processingSeconds && noSupply.boostedSeconds < duration)

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
  Object.keys(s.resources).every(id => E.moneyFinite(offline.resources[id]) && !offline.resources[id].isNegative()))
assert('long offline reports bounded segments and industry rounds',
  longReport.approximate === true && longReport.segments <= longReport.baseSegments &&
  longReport.industryRounds <= longReport.segments * 2)
assert('long offline does not accumulate processing backlog',
  Object.entries(offline.craftTimers).every(([id, timer]) => !CRAFT_MAP[id] || timer.t <= craftTime(CRAFT_MAP[id], fd) + 1e-9))
assert('multiple powered stations approximate the per-second reference within the same order',
  ['steel', 'qi', 'qiEnergy'].every(id => online.resources[id].minus(offline.resources[id]).abs()
    .lte(E.moneyMax(E.money(1), online.resources[id].abs().times('0.5')))))

const polar = fixture()
polar.s.buildings.polarizeArray = { count: 2, on: true }
polar.s.buildings.annihilationFurnace.count = 1
E.recompute(polar.s, polar.d)
polar.s.resources.yangParticle = polar.d.max.yangParticle
polar.s.resources.yinParticle = E.money(0)
const initialYang = polar.s.resources.yangParticle
let lowestLoad = 1, highestLoad = 0
let withinStorage = true
for (let i = 0; i < duration; i++) {
  E.tick(polar.s, polar.d, 1, { events: false, offline: true })
  lowestLoad = Math.min(lowestLoad, polar.d.buildingSupply.polarizeArray)
  highestLoad = Math.max(highestLoad, polar.d.buildingSupply.polarizeArray)
  withinStorage &&= polar.s.resources.yangParticle.lte(initialYang.plus('1e-6'))
}
assert('full side stays within storage throughout the scenario', withinStorage)
assert('imbalanced pair can still feed annihilation', polar.d.rates.qiEnergy.gt(0) && !polar.s.resources.yinParticle.isNegative())

console.log(JSON.stringify({ checks, sustained, noSupply, shared: { powerCapacity: d.processingPowerCapacity, coolingCapacity: d.processingCoolingCapacity, coolingUsed, load, overloadCoolingUsed: coldUsed },
  paired: { seconds: duration, lowestLoad, highestLoad, initialYang: E.moneyToNumber(initialYang), finalYang: E.moneyToNumber(polar.s.resources.yangParticle), finalYin: E.moneyToNumber(polar.s.resources.yinParticle), energyRate: E.moneyToNumber(polar.d.rates.qiEnergy) } }, null, 2))
