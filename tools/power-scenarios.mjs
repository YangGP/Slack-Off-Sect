/** Controlled complete supply chains; no stockpiled particles or energy. */
import { createInitialState } from '../src/game/state.js'
import { setGameContext } from '../src/game/context.js'
import * as E from './engine-fixture.mjs'

export function powerFixture({ chains = 1, mode = 'qi', core = false, gathering = false, homes = false } = {}) {
  let now = Date.UTC(2026, 9, 14)
  const state = createInitialState(now), derived = E.createDerived()
  setGameContext(state, { now: () => now, random: () => 0.5 })
  state.realm = 8
  state.resources.qi = 1000000 // isolate energy allocation from qi supply; never supply fuel/energy directly
  for (const id of ['particleTheory', 'yinyangSplit', 'annihilationArt', 'energyApplication']) state.upgrades[id] = true
  for (const id of ['splitArray', 'polarizeArray', 'annihilationFurnace']) state.buildings[id] = { count: chains, on: true, power: 'qi' }
  if (core) state.upgrades.energyCore = true
  if (gathering) state.upgrades.energyDrive = true
  if (homes) {
    for (const id of ['mansion', 'caveDwelling', 'quietGarden', 'trialTower', 'ancestorHall', 'grotto', 'spiritLockArray', 'heavenTower', 'karmaPool']) {
      state.buildings[id] = { count: 1, on: true, power: mode }
    }
    // Material maintenance is deliberately financed; only energy is under test.
    for (const id of ['wood', 'ore', 'insight']) state.resources[id] = 1000000
  }
  E.recompute(state, derived)
  return { state, derived, advance(seconds = 1) {
    const startAt = now
    now += seconds * 1000
    E.tick(state, derived, seconds, { events: false, offline: true, startAt })
  } }
}

export function measurePower(options = {}, seconds = 600) {
  const f = powerFixture(options), { state: s, derived: d } = f
  // First start the base chain, then switch. Zero-start is measured separately in checks.
  for (let i = 0; i < 60; i++) f.advance()
  if (options.mode === 'energy') {
    for (const id of ['splitArray', 'polarizeArray']) E.setBuildingPower(s, d, id, 'energy')
  }
  const energyBefore = s.resources.qiEnergy
  let fullSeconds = 0, minSupply = 1
  for (let i = 0; i < seconds; i++) {
    f.advance()
    const supply = Math.min(...['splitArray', 'polarizeArray', 'annihilationFurnace'].map(id => d.buildingSupply[id] ?? 1))
    minSupply = Math.min(minSupply, supply)
    if (supply > 0.999) fullSeconds++
    if (Object.values(s.resources).some(n => !Number.isFinite(n) || n < 0)) throw Error('Invalid resource stock')
  }
  return { ...options, seconds, energyBefore, energy: s.resources.qiEnergy, fullSeconds, minSupply,
    output: d.rates.qiEnergy, maintenance: d.maintenance.qiEnergy || 0, qiDraw: d.maintenance.qi || 0,
    capacity: d.processingPowerCapacity, coreSupply: d.upgradeSupply.energyCore ?? null,
    gatheringSupply: d.upgradeSupply.energyDrive ?? null,
    housing: d.maxDisciples, energyDecay: s.resources.qiEnergy * 0.005 }
}
