import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as E from '../src/game/engine.js'
import { createInitialState, resetForReincarnation } from '../src/game/state.js'
import { setGameContext } from '../src/game/context.js'
import { withResourceAction } from '../src/game/resourceObservation.js'
import { createResourceRecorder, rebuildResourceReport, loadMeasurementCheckpoint, readResourceRecords } from './lib/resource-recorder.mjs'
import { pack } from './lib/measurement-state.mjs'
import { progressionDiagnostics } from './progression-diagnostics.mjs'
import { settleEventOutcome } from '../src/game/systems/events.js'
import { measurePacing, configurePacingResume } from './lib/pacing-scenario.mjs'

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
  'dao-purchase'() {
    const state = createInitialState(0), derived = E.createDerived()
    state.dao = state.resources.dao = E.money('2.5')
    state.samsara.shopOpen = true
    E.recompute(state, derived)
    const recorder = createResourceRecorder({ root: root(), sources: { fixture: 'dao-purchase' } })
    recorder.setEnvironment(() => ({ lifeId: 1, currentRealm: state.realm, online: true }))
    recorder.open(state, 0, derived)
    setGameContext(state, { now: () => 0, resourceObserver: recorder.observer })
    assert.equal(E.buyDaoPerk(state, derived, 'cultivation'), true)
    assert.equal(state.dao.toString(), '1.5')
    assert.ok(state.resources.dao.eq(state.dao))
    assert.equal(state.samsara.spent.toString(), '1')
    assert.equal(state.samsara.levels.cultivation, 1)
    const { report } = recorder.finish(state, { elapsed: 0, derived })
    assert.equal(report.accountingComplete, true)
    assert.equal(report.totals.dao, '-1')
    assert.ok(report.flows.some(row => row.resource === 'dao' && row.action?.type === 'buyDaoPerk' && row.negative === '1'))
  },
  compact() {
    const f = fixture()
    for (let i = 0; i < 100; i++) assert.equal(E.setCraftTarget(f.state, f.derived, 'sawPlank', 25), false)
    f.derived.craftTargetsUnlocked = true
    assert.equal(E.setCraftTarget(f.state, f.derived, 'sawPlank', 25), true)
    for (let i = 0; i < 100; i++) assert.equal(E.setCraftTarget(f.state, f.derived, 'sawPlank', 25), true)
    assert.throws(() => withResourceAction(f.state, { type: 'setCraftTarget', id: 'sawPlank' }, () => {
      throw Error('configuration failure')
    }), /configuration failure/)
    E.addResource(f.state, 'insight', 100)
    E.addResource(f.state, 'qi', 500, E.money(1000))
    assert.ok(E.canAfford(f.state, E.breakthroughPreview(f.state, f.derived).cost))
    assert.equal(E.breakthrough(f.state, f.derived, {}, () => 1), false)
    assert.ok(E.money(E.craft(f.state, f.derived, 'growWood', { times: 2 })).gt(0))
    observe(f)
    const { report, dir } = finish(f), rows = [...readResourceRecords(dir)]
    assert.equal(report.accountingComplete, true)
    assert.equal(rows.filter(row => ['action-start', 'action-end', 'action-summary', 'mutation'].includes(row.kind)).length, 0)
    assert.ok(rows.some(row => row.kind === 'action-error' && row.type === 'setCraftTarget'))
    assert.ok(rows.some(row => row.kind === 'transition' && row.type === 'breakthrough' && row.result === false))
    assert.ok(report.flows.some(row => row.action?.type === 'breakthrough' && E.money(row.negative).gt(0)))
    assert.ok(rows.some(row => row.kind === 'window' && row.flows.some(flow => flow.action?.type === 'addCraftGain')))
    assert.ok(rows.filter(row => row.kind === 'window').every(row => row.flows.every(flow => flow.action?.actionId === undefined)))
    assert.ok(E.money(report.recipeOutputs.growWood).gt(0))
    assert.deepEqual(rebuildResourceReport(dir).totals, report.totals)
    console.log('pacing recording: ordinary actions omitted; grouped flows, failed breakthrough and error retained')
  },
  ledger() {
    const f = fixture()
    for (let i = 0; i < 100; i++) withResourceAction(f.state, { type: 'net-zero', id: 'proof' }, () => {
      E.addResource(f.state, 'qi', 80, E.money(1000)); E.payCost(f.state, { qi: 80 })
      E.addResource(f.state, 'wood', 10, E.money(1000)); E.payCost(f.state, { wood: 10 })
    })
    observe(f)
    const { report, dir } = finish(f)
    assert.equal(report.accountingComplete, true)
    assert.equal(report.totals.qi, '0')
    assert.ok(report.flows.some(row => row.resource === 'qi' && row.positive === '8000'))
    assert.ok(report.flows.some(row => row.resource === 'qi' && row.negative === '8000'))
    assert.equal(rebuildResourceReport(dir).accountingComplete, true)
    const batches = [...readResourceRecords(dir)].filter(row => row.kind === 'window')
    assert.equal(report.recordsByKind.window, 1)
    assert.equal(batches[0].flows.length, 4)
    assert.equal(report.totals.wood, '0')
    assert.equal(report.recordsByKind.mutation, undefined)
  },
  'pacing-window'() {
    const f = fixture()
    // Alternate every five game seconds without changing inventories.
    for (let i = 0; i <= 360; i++) {
      f.time(i * 5000)
      const missing = i % 2 === 0
      f.recorder.observe(f.state, f.derived, f.now, {
        selectedCost: { qi: '100' }, targetRealmName: '引气',
        missing: missing ? [{ resource: 'qi', capacityBlocked: true,
          recipe: 'growWood', recipeUnlocked: true, processing: { reason: 'fixture' } }] : [],
      }, { projectsReady: !missing })
    }
    const { report, dir } = finish(f)
    const rows = [...readResourceRecords(dir)], windows = rows.filter(row => row.kind === 'window')
    assert.equal(windows.length, 1)
    assert.equal(rows.some(row => row.kind === 'interval'), false)
    const stats = windows[0].pacing, stage = report.stages[0]
    assert.equal(stats.sampledMs, 1800000)
    assert.equal(stats.shortageMs.qi, 900000)
    assert.equal(stats.capacityMs.qi, 900000)
    assert.equal(stats.processingMs['qi:growWood:fixture'], 900000)
    assert.equal(stage.materialsReadyMs, 900000)
    assert.equal(stage.projectBlockedMs, 900000)
    assert.equal(stage.firstMaterialsReadySeconds, 5)
    assert.equal(stage.lastMissingSeconds, 1795)
    assert.equal(stage.readySinceSeconds, 1795)
    assert.equal(stage.secondsAfterLastReadiness, 5)
    assert.deepEqual(rebuildResourceReport(dir).stages, report.stages)
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
    const extended = configurePacingResume(cp, ['--total-wall-seconds=1200'])
    const c = measurePacing({}, () => {}, { resume: extended, includeRuntime: true })
    assert.ok(cp.simulator.wallSpent > 0)
    assert.ok(c.cumulativeWallSeconds >= cp.simulator.wallSpent + c.wallSeconds)
    assert.equal(cp.options.totalWallSeconds, 600)
    assert.deepEqual(c.wallBudgetChanges.at(-1), extended.budgetChange)
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
    assert.deepEqual(a.recording.report.actionSummary, c.recording.report.actionSummary)
    const timing = report => report.stages.map(s => Object.fromEntries([
      'sampledMs', 'insightOnlyMs', 'materialsReadyMs', 'projectBlockedMs', 'shortageMs',
      'capacityMs', 'fullMs', 'processingMs', 'buildingBlockedMs', 'firstMaterialsReadySeconds',
      'readySinceSeconds', 'lastMissingSeconds', 'lastReadiness',
    ].map(key => [key, s[key]])))
    assert.deepEqual(timing(a.recording.report), timing(c.recording.report))
    assert.equal(c.recording.report.accountingComplete, true)
    assert.equal(Object.values(c.recording.report.exposure).reduce((sum, row) => sum + row.durationMs, 0), c.simulatedSeconds * 1000)
    assert.equal(Object.entries(c.recording.report.exposure).filter(([key]) => key.endsWith(':offline')).reduce((sum, [, row]) => sum + row.durationMs, 0), 780000)
  },
  'resume-realm'() {
    // 用真实突破构造确定的阶段边界，避免依赖自动玩家随平衡变化的突破时刻。
    const run = resume => {
      const f = fixture()
      E.addResource(f.state, 'qi', 1000, E.money(2000))
      E.addResource(f.state, 'insight', 100)
      f.time(1000); observe(f)
      if (resume) {
        const path = f.recorder.checkpoint({ state: f.state, derived: f.derived }, f.state, f.derived, f.now)
        const cp = loadMeasurementCheckpoint(path, { fixture: '1' })
        f.state = cp.simulator.state; f.derived = cp.simulator.derived
        f.recorder = createResourceRecorder({ resume: cp, sources: { fixture: '1' } })
        f.recorder.setEnvironment(() => ({ lifeId: 1, currentRealm: f.state.realm, online: true }))
        f.recorder.open(f.state, f.now, f.derived)
        setGameContext(f.state, { now: () => f.now, random: () => 0.1, resourceObserver: f.recorder.observer })
      }
      f.time(2000)
      assert.equal(E.breakthrough(f.state, f.derived, {}, () => 0), true)
      observe(f)
      f.time(3000); observe(f)
      const { report, dir } = finish(f)
      assert.equal(f.state.realm, 1)
      assert.equal(report.accountingComplete, true)
      assert.equal(report.stages.length, 2)
      assert.equal([...readResourceRecords(dir)].filter(row => row.kind === 'transition' && row.type === 'breakthrough').length, 1)
      return { state: pack(f.state), report }
    }
    const a = run(false), b = run(true)
    assert.deepEqual(a.state, b.state)
    for (const key of ['totals', 'exposure', 'stages', 'actionSummary']) assert.deepEqual(a.report[key], b.report[key])
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
