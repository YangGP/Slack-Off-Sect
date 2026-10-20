import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as E from '../src/game/engine.js'
import { createInitialState, resetForReincarnation } from '../src/game/state.js'
import { setGameContext } from '../src/game/context.js'
import { withResourceAction } from '../src/game/resourceObservation.js'
import { createResourceRecorder, rebuildResourceReport, loadMeasurementCheckpoint } from './lib/resource-recorder.mjs'
import { pack } from './lib/measurement-state.mjs'
import { progressionDiagnostics } from './progression-diagnostics.mjs'
import { settleEventOutcome } from '../src/game/systems/events.js'
import { measurePacing } from './lib/pacing-scenario.mjs'

const root = () => mkdtempSync(join(tmpdir(), 'sect-recording-'))
function fixture() {
  const state = createInitialState(0), derived = E.createDerived()
  state.resources.qi = E.money(100); state.resources.wood = E.money(100)
  state.resources.qiEnergy = E.money(50)
  E.recompute(state, derived)
  const recorder = createResourceRecorder({ root: root(), sources: { fixture: '1' } })
  let now = 0
  recorder.setEnvironment(() => ({ lifeId: 1, currentRealm: state.realm, online: true }))
  recorder.open(state, 0, derived)
  setGameContext(state, { now: () => now, random: () => 0.1, resourceObserver: recorder.observer })
  return { state, derived, recorder, time: value => { now = value }, get now() { return now } }
}
const observe = f => f.recorder.observe(f.state, f.derived, f.now, progressionDiagnostics(f.state, f.derived))
const finish = f => f.recorder.finish(f.state, { elapsed: f.now, derived: f.derived })
const cases = {
  ledger() {
    const f = fixture()
    withResourceAction(f.state, { type: 'net-zero', id: 'proof' }, () => {
      E.addResource(f.state, 'qi', 80, E.money(1000)); E.payCost(f.state, { qi: 80 })
    })
    observe(f)
    const { report, dir } = finish(f)
    assert.equal(report.accountingComplete, true)
    assert.equal(report.totals.qi, '0')
    assert.ok(report.flows.some(row => row.resource === 'qi' && row.positive === '80'))
    assert.ok(report.flows.some(row => row.resource === 'qi' && row.negative === '80'))
    assert.equal(rebuildResourceReport(dir).accountingComplete, true)
  },
  missing() {
    const f = fixture()
    f.state.resources.qi = f.state.resources.qi.plus(3) // Deliberately bypass the observation hook.
    assert.throws(() => observe(f), /Unrecorded resource/)
    assert.equal(finish(f).report.accountingComplete, false)
  },
  energy() {
    const f = fixture()
    f.time(1000); E.tick(f.state, f.derived, 1, { events: false, startAt: 0 })
    observe(f)
    const { report } = finish(f)
    assert.equal(report.accountingComplete, true)
    assert.ok(report.flows.some(row => row.source.endsWith('energy-decay') && E.money(row.detail.decayLoss).gt(0)))
    assert.ok(f.state.resources.qiEnergy.lt(50))
  },
  actions() {
    const f = fixture()
    assert.ok(E.craft(f.state, f.derived, 'growWood', { times: 2 }))
    assert.ok(E.buyBuilding(f.state, f.derived, 'spiritField', 1))
    assert.ok(E.sellBuilding(f.state, f.derived, 'spiritField', 1))
    settleEventOutcome(f.state, f.derived, { cost: { wood: 3 } }, 'record-test', 'info', 'fixture')
    observe(f)
    const { report } = finish(f)
    assert.equal(report.accountingComplete, true)
    assert.ok(report.flows.some(row => row.action?.type === 'buyBuilding'))
    assert.ok(report.flows.some(row => row.action?.type === 'sellBuilding'))
    assert.ok(report.flows.some(row => row.action?.type === 'settleEventOutcome'))
    assert.ok(E.money(report.recipeOutputs.growWood).gte(2))
  },
  reset() {
    const f = fixture()
    resetForReincarnation(f.state, E.money(12))
    observe(f)
    const { report } = finish(f)
    assert.equal(report.accountingComplete, true)
    assert.equal(f.state.karma.toString(), '12')
  },
  offline() {
    const f = fixture()
    f.time(120000); E.simulateOffline(f.state, f.derived, 120, { startAt: 0 })
    observe(f)
    assert.equal(finish(f).report.accountingComplete, true)
  },
  approximate() {
    const f = fixture()
    f.state.settings.autoCraftOn = false
    f.time(7200000); E.simulateOffline(f.state, f.derived, 7200, { startAt: 0 })
    observe(f)
    const { report } = finish(f)
    assert.equal(report.accountingComplete, true)
    assert.ok(report.flows.some(row => row.source.includes('approximateSegment') || row.source.endsWith('energy-combined')))
  },
  seal() {
    const state = createInitialState(0), derived = E.createDerived()
    state.realm = 9; state.upgrades.annihilationArt = true
    state.buildings.annihilationFurnace = { count: 1, on: true }
    state.resources.qiEnergy = E.money(200); state.resources.mithril = E.money(10); state.resources.spiritTalisman = E.money(10)
    E.recompute(state, derived)
    const recorder = createResourceRecorder({ root: root() })
    recorder.open(state, 0, derived)
    setGameContext(state, { now: () => 0, random: () => 0.1, resourceObserver: recorder.observer })
    assert.ok(E.craft(state, derived, 'condenseAscensionSeal', { times: 2 }))
    const { report } = recorder.finish(state, { elapsed: 0, derived })
    assert.equal(report.accountingComplete, true)
    assert.equal(report.recipeOutputs.condenseAscensionSeal, '2')
    assert.ok(report.flows.some(f => f.resource === 'qiEnergy' && f.negative === '160'))
  },
  auto() {
    const state = createInitialState(0), derived = E.createDerived()
    state.realm = 4; state.upgrades.woodworking = true
    state.dao = E.money(1); state.resources.dao = E.money(1)
    state.buildings.workshop = { count: 1, on: true }
    state.resources.wood = E.money(2000); state.resources.qi = E.money(2000)
    state.autoCraft.sawPlank = true; state.settings.autoCraftOn = true
    E.recompute(state, derived)
    const recorder = createResourceRecorder({ root: root() })
    recorder.open(state, 0, derived)
    setGameContext(state, { now: () => 20000, random: () => 0.1, resourceObserver: recorder.observer })
    E.tick(state, derived, 20, { events: false, startAt: 0 })
    const { report } = recorder.finish(state, { elapsed: 20000, derived })
    assert.equal(report.accountingComplete, true)
    assert.ok(E.money(report.recipeOutputs.sawPlank).gt(0))
    assert.ok(E.money(report.recipeModes.sawPlank.automatic).gt(0))
    assert.ok(report.flows.some(f => f.resource === 'wood' && E.money(f.negative).gt(0)))
  },
  breakthrough() {
    const f = fixture()
    f.state.resources.insight = E.money(100)
    // This fixture adjustment is deliberately outside the measured run.
    const state = f.state, derived = f.derived
    const recorder = createResourceRecorder({ root: root() })
    recorder.open(state, 0, derived)
    setGameContext(state, { now: () => 0, random: () => 0, resourceObserver: recorder.observer })
    E.addResource(state, 'qi', 1000, E.money(2000))
    assert.equal(E.breakthrough(state, derived, {}, () => 0), true)
    const { report } = recorder.finish(state, { elapsed: 0, derived })
    assert.equal(report.accountingComplete, true)
    assert.ok(report.flows.some(f => f.action?.type === 'breakthrough' && f.resource === 'insight' && f.negative === '40'))
  },
  equivalent() {
    const options = { hours: 0.05, seed: 2, events: 1, visits: 'waking', decisionSeconds: 150, batchActions: 12, details: 'decisions' }
    const a = measurePacing(options, () => {}, { includeRuntime: true })
    const b = measurePacing({ ...options, record: true }, () => {}, { includeRuntime: true, recordRoot: root() })
    assert.deepEqual(pack(a.runtimeState.state), pack(b.runtimeState.state))
    assert.deepEqual(a.runtimeState.eventRng, b.runtimeState.eventRng)
    assert.deepEqual(a.runtimeState.breakthroughRng, b.runtimeState.breakthroughRng)
    assert.equal(b.recording.report.accountingComplete, true)
  },
  resume() {
    const options = { hours: 0.1, seed: 2, events: 1, visits: 'waking', decisionSeconds: 150, batchActions: 12, details: 'decisions', record: true }
    const a = measurePacing(options, () => {}, { includeRuntime: true, recordRoot: root() })
    const b = measurePacing(options, () => {}, { stopAtSeconds: 150, recordRoot: root() })
    assert.equal(b.stopReason, 'interrupted')
    const cp = loadMeasurementCheckpoint(b.checkpointPath)
    const c = measurePacing({}, () => {}, { resume: cp, includeRuntime: true })
    assert.deepEqual(pack(a.runtimeState.state), pack(c.runtimeState.state))
    assert.deepEqual(pack(a.runtimeState.derived), pack(c.runtimeState.derived))
    assert.deepEqual(a.runtimeState.eventRng, c.runtimeState.eventRng)
    assert.deepEqual(a.runtimeState.breakthroughRng, c.runtimeState.breakthroughRng)
    assert.deepEqual(a.attempts, c.attempts)
    assert.deepEqual(a.recording.report.totals, c.recording.report.totals)
    assert.deepEqual(a.recording.report.exposure, c.recording.report.exposure)
    assert.equal(c.recording.report.accountingComplete, true)
  },
  'resume-offline'() {
    const options = { hours: 0.5, seed: 3, visits: 'quarter', events: 1, decisionSeconds: 150, batchActions: 12, details: 'decisions', record: true }
    const a = measurePacing(options, () => {}, { includeRuntime: true, recordRoot: root() })
    const b = measurePacing(options, () => {}, { stopAtSeconds: 900, recordRoot: root() })
    const c = measurePacing({}, () => {}, { resume: loadMeasurementCheckpoint(b.checkpointPath), includeRuntime: true })
    assert.deepEqual(pack(a.runtimeState.state), pack(c.runtimeState.state))
    assert.deepEqual(a.runtimeState.eventRng, c.runtimeState.eventRng)
    assert.deepEqual(a.runtimeState.breakthroughRng, c.runtimeState.breakthroughRng)
    assert.deepEqual(a.recording.report.totals, c.recording.report.totals)
    assert.deepEqual(a.recording.report.exposure, c.recording.report.exposure)
    assert.equal(c.recording.report.accountingComplete, true)
    assert.equal(Object.values(c.recording.report.exposure).reduce((sum, row) => sum + row.durationMs, 0), c.simulatedSeconds * 1000)
    assert.equal(Object.entries(c.recording.report.exposure).filter(([key]) => key.endsWith(':offline')).reduce((sum, [, row]) => sum + row.durationMs, 0), 780000)
  },
  'resume-realm'() {
    const options = { hours: 1.25, seed: 2, visits: 'waking', events: 1, decisionSeconds: 150, batchActions: 12, details: 'decisions', record: true }
    const a = measurePacing(options, () => {}, { includeRuntime: true, recordRoot: root() })
    const b = measurePacing(options, () => {}, { stopAtSeconds: 4000, recordRoot: root() })
    const c = measurePacing({}, () => {}, { resume: loadMeasurementCheckpoint(b.checkpointPath), includeRuntime: true })
    assert.ok(a.attempts.length > 0)
    assert.deepEqual(pack(a.runtimeState.state), pack(c.runtimeState.state))
    assert.deepEqual(a.attempts, c.attempts)
    assert.deepEqual(a.recording.report.totals, c.recording.report.totals)
    assert.deepEqual(a.recording.report.exposure, c.recording.report.exposure)
    assert.equal(c.recording.report.accountingComplete, true)
  },
  budget() {
    const result = measurePacing({ hours: 0.05, record: true }, () => {}, { recordRoot: root(), recorderOptions: { maxBytes: 512 } })
    assert.equal(result.stopReason, 'record-budget')
    assert.equal(result.recording.report.accountingComplete, true)
    assert.ok(loadMeasurementCheckpoint(result.checkpointPath))
  },
  corruption() {
    const f = fixture(); observe(f)
    const path = f.recorder.checkpoint({ proof: 'checkpoint' }, f.state, f.derived, 1000)
    assert.throws(() => loadMeasurementCheckpoint(path, { fixture: 'different' }), /mismatch/)
    const cp = loadMeasurementCheckpoint(path, { fixture: '1' })
    const chunk = join(cp.directory, cp.recorder.files[0].name)
    writeFileSync(chunk, readFileSync(chunk, 'utf8') + '\n')
    assert.throws(() => loadMeasurementCheckpoint(path, { fixture: '1' }), /Corrupt/)
  },
}
const name = process.argv.find(arg => arg.startsWith('--case='))?.slice(7)
if (!cases[name]) throw Error(`Select one case: ${Object.keys(cases).join(', ')}`)
cases[name]()
console.log(`recording case passed: ${name}`)
