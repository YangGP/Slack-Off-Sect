import assert from 'node:assert/strict'
import { createInitialState } from '../src/game/state.js'
import * as E from './engine-fixture.mjs'
import { progressionDiagnostics } from './progression-diagnostics.mjs'
import { setGameContext } from '../src/game/context.js'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createResourceRecorder } from './lib/resource-recorder.mjs'

const cases = {
  capacity: () => {
    const state = createInitialState(0)
    state.realm = 8
    E.recompute(state, E.createDerived())
    const stateDerived = E.createDerived()
    E.recompute(state, stateDerived)
    state.resources.qiParticle = E.money(0)
    const blocked = progressionDiagnostics(state, stateDerived).missing.find(row => row.resource === 'qiParticle')
    assert.ok(blocked && blocked.capacityBlocked === true && blocked.full === false)
    assert.equal(blocked.capacity, 100)
    state.buildings.grandStore = { count: 1, on: true }
    E.recompute(state, stateDerived)
    const enough = progressionDiagnostics(state, stateDerived).missing.find(row => row.resource === 'qiParticle')
    assert.ok(enough && enough.capacityBlocked === false && enough.nextExpansionReason === 'capacity-sufficient')
    state.realm = 5
    E.recompute(state, stateDerived)
    const infinite = progressionDiagnostics(state, stateDerived).missing.find(row => row.resource === 'spiritLiquid')
    assert.ok(infinite, 'spiritLiquid must be missing')
    assert.equal(infinite.capacity, null)
    assert.equal(blocked.netPerMinute, 0)
  },
  readonly: () => {
    const state = createInitialState(0)
    state.realm = 5
    state.buildings.scriptureArchive = { count: 2, on: true }
    const derived = E.createDerived()
    E.recompute(state, derived)
    const before = JSON.stringify({
      resources: state.resources, buildings: state.buildings, upgrades: state.upgrades,
      orders: state.craftOrders, seed: state.hunting.randomSeed,
      max: Object.fromEntries(Object.entries(derived.max).map(([id, value]) => [id, value.toString()])),
    })
    progressionDiagnostics(state, derived, { cost: E.breakthroughPreview(state, derived).cost })
    const after = JSON.stringify({
      resources: state.resources, buildings: state.buildings, upgrades: state.upgrades,
      orders: state.craftOrders, seed: state.hunting.randomSeed,
      max: Object.fromEntries(Object.entries(derived.max).map(([id, value]) => [id, value.toString()])),
    })
    assert.equal(after, before)
  },
  record: () => {
    const state = createInitialState(0), derived = E.createDerived()
    state.resources.qi = E.money(500)
    E.recompute(state, derived)
    const root = mkdtempSync(join(tmpdir(), 'dsh-record-'))
    const rec = createResourceRecorder({ root, options: { test: true }, runId: 'case-record' })
    rec.open(state, 0, derived)
    setGameContext(state, { now: () => 0, random: () => 0.1, resourceObserver: rec.observer })
    E.addResource(state, 'qi', 80, E.money(1000))
    E.payCost(state, { qi: 80 })
    rec.observe(state, derived, 0, progressionDiagnostics(state, derived))
    const result = rec.finish(state, { completed: false, stopReason: 'horizon', elapsed: 0, derived })
    const report = JSON.parse(readFileSync(join(result.dir, 'report.json'), 'utf8'))
    assert.equal(report.accountingComplete, true)
    assert.ok(report.records > 0)
  },
  trace: () => {
    const make = () => {
      const state = createInitialState(0)
      state.resources.qi = E.money(500)
      const derived = E.createDerived()
      E.recompute(state, derived)
      return { state, derived }
    }
    const a = make(), b = make()
    let nowA = 0, nowB = 0, seedA = 7, seedB = 7
    const rng = () => ((seedA = (Math.imul(seedA, 1664525) + 1013904223) >>> 0) / 4294967296)
    const rngB = () => ((seedB = (Math.imul(seedB, 1664525) + 1013904223) >>> 0) / 4294967296)
    for (let i = 0; i < 20; i++) {
      nowA += 5
      setGameContext(a.state, { now: () => nowA, random: rng })
      E.tick(a.state, a.derived, 5)
      progressionDiagnostics(a.state, a.derived)
      nowB += 5
      setGameContext(b.state, { now: () => nowB, random: rngB })
      E.tick(b.state, b.derived, 5)
    }
    const pick = ({ state, derived }) => JSON.stringify({
      resources: state.resources, buildings: state.buildings, upgrades: state.upgrades,
      total: state.disciples.total, max: Object.fromEntries(Object.entries(derived.max).map(([id, value]) => [id, value.toString()])),
    })
    assert.equal(pick(a), pick(b))
  },
}

const name = process.argv.find(arg => arg.startsWith('--case='))?.slice(7)
if (!name) throw new Error('用法：node bundle.js --case=capacity|readonly|trace|record')
const fn = cases[name]
if (!fn) throw new Error('未知 case')
fn()
console.log('diagnostics case ok:', name)
