import assert from 'node:assert/strict'
import * as E from '../src/game/engine.js'
import { createInitialState, normalizeState } from '../src/game/state.js'
import { exportJson, parseImport, restoreSave, createSaveRepository, SAVE_KEY } from '../src/game/save.js'
import { withGameContext } from '../src/game/context.js'
import { SAVE_VERSION } from '../src/game/saveSchema.js'
import { createGame, createRuntime } from '../src/game/runtime.js'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

export function runArchitectureChecks() {
  // 依赖约束按实际源码检查，防止拆分后重新出现循环或引擎依赖 Vue。
  const directory = resolve('src/game/systems')
  const graph = new Map()
  for (const name of readdirSync(directory).filter(name => name.endsWith('.js'))) {
    const path = resolve(directory, name)
    const code = readFileSync(path, 'utf8')
    const imports = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1])
    assert.ok(!imports.some(value => value === 'vue' || /\/engine(?:\.js)?$/.test(value)), name)
    graph.set(path, imports.filter(value => value.startsWith('./')).map(value => resolve(dirname(path), value + '.js')))
  }
  function visit(path, chain = []) {
    assert.ok(!chain.includes(path), `循环依赖：${[...chain, path].join(' -> ')}`)
    for (const dependency of graph.get(path) || []) visit(dependency, [...chain, path])
  }
  for (const path of graph.keys()) visit(path)
  const startAt = 1000000
  const make = () => {
    const state = createInitialState()
    state.buildings.spiritField = { count: 1, on: true }
    state.buffs = [{ id: 'short', name: '短期增益', mult: 1, target: null, until: startAt + 2500 }]
    return { state, derived: E.createDerived() }
  }
  const offline = make(), online = make()
  E.simulateOffline(offline.state, offline.derived, 10, { startAt })
  for (let second = 0; second < 10; second++) {
    E.tick(online.state, online.derived, 1, { startAt: startAt + second * 1000, events: false })
  }
  assert.equal(offline.state.buffs.length, 0)
  assert.equal(offline.state.lastTickAt, startAt + 10000)
  assert.ok(Math.abs(offline.state.resources.qi - online.state.resources.qi) < 1e-9)
  const base = make()
  base.state.buffs = []
  E.simulateOffline(base.state, base.derived, 10, { startAt })
  // 加成仅覆盖前 2.5 秒，而非整个十秒结算。
  assert.ok(Math.abs(offline.state.resources.qi / base.state.resources.qi - 1.25) < 1e-9)
  const fractional = make()
  E.simulateOffline(fractional.state, fractional.derived, 0.75, { startAt })
  assert.equal(fractional.state.stats.playTime, 0.75)
  assert.equal(E.simulateOffline(fractional.state, fractional.derived, Infinity).seconds, 0)

  const loaded = normalizeState({ buffs: make().state.buffs, lastSaveAt: startAt })
  assert.equal(loaded.buffs.length, 1)
  const restored = parseImport(exportJson(loaded))
  assert.equal(restored.buffs.length, 1)
  const dirty = normalizeState({ resources: { qi: '100', wood: -5 }, realm: 999, strangeField: true,
    buildings: { spiritField: { count: -1 }, absent: { count: 3 } } })
  assert.equal(dirty.resources.qi, 0)
  assert.equal(dirty.resources.wood, 0)
  assert.equal(dirty.realm, 0)
  assert.equal(dirty.buildings.spiritField.count, 0)
  assert.equal(dirty.buildings.absent, undefined)
  assert.equal(dirty.strangeField, undefined)
  const validLegacy = restoreSave({ version: 1, karma: 12, dao: 3, realm: 4,
    resources: { qi: 123 }, buildings: { spiritField: { count: 2, on: true } } })
  assert.equal(validLegacy.realm, 4)
  assert.equal(validLegacy.resources.qi, 123)
  assert.equal(validLegacy.version, SAVE_VERSION)
  for (const conflict of [{ version: SAVE_VERSION + 1 }, { buildings: [] }]) {
    const recovered = restoreSave({ karma: 12, dao: 3, realm: 4, ...conflict })
    assert.equal(recovered.karma, 12)
    assert.equal(recovered.dao, 3)
    assert.equal(recovered.realm, 0)
    assert.ok(recovered.__recoveryNotice)
  }
  const randomState = createInitialState()
  assert.throws(() => withGameContext(randomState, { now: () => 1 }, () => { throw new Error('test') }), /test/)
  withGameContext(randomState, { now: () => startAt, random: () => 0 }, () => {
    E.fireEvent(randomState, E.createDerived())
    assert.equal(randomState.nextEventAt, startAt + 150000)
  })

  // 派生计算可在冻结的持久状态上运行，也不能偷偷建立成员或内存字段。
  const readonly = normalizeState({ resources: { qi: 100 }, disciples: { total: 2, jobs: { farmer: 1 } } })
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze)
      Object.freeze(value)
    }
  }
  const before = JSON.stringify(readonly)
  freeze(readonly)
  E.recompute(readonly, E.createDerived())
  assert.equal(JSON.stringify(readonly), before)
  assert.equal(readonly.__max, undefined)
  const inconsistent = restoreSave({ version: SAVE_VERSION, disciples: {
    total: 99, jobs: { farmer: 99 }, members: [{ id: 1, roleId: null, realm: 0 }],
  } })
  assert.equal(inconsistent.disciples.total, 1)
  assert.equal(inconsistent.disciples.jobs.farmer, 0)

  // 两个实例的成就检查周期不可交叉累加。
  const a = createGame({ now: () => startAt, random: () => 0 })
  const b = createGame({ now: () => startAt, random: () => 0.9 })
  for (const game of [a, b]) game.state.buildings.hut = { count: 1, on: true }
  a.tick(0.3, { events: false })
  b.tick(0.3, { events: false })
  assert.equal(a.state.achievements.firstHut, undefined)
  assert.equal(b.state.achievements.firstHut, undefined)
  a.tick(0.2, { events: false })
  assert.equal(a.state.achievements.firstHut, true)
  assert.equal(b.state.achievements.firstHut, undefined)
  const timeline = createGame({ now: () => startAt })
  timeline.state.buffs = make().state.buffs
  for (let second = 0; second < 3; second++) timeline.tick(1, { events: false })
  assert.equal(timeline.state.buffs.length, 0)
  assert.equal(timeline.state.lastTickAt, startAt + 3000)
  timeline.restore({ version: 999, karma: 7, dao: 2, realm: 6 })
  assert.equal(timeline.state.realm, 0)
  assert.equal(timeline.state.karma, 7)
  assert.equal(timeline.state.dao, 2)
  E.fireEvent(a.state, a.derived)
  E.fireEvent(b.state, b.derived)
  assert.notEqual(a.state.nextEventAt, b.state.nextEventAt)

  const memory = raw => {
    const values = new Map(raw ? [[SAVE_KEY, raw]] : [])
    return { getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  }
  const brokenStorage = memory('{broken')
  const broken = createSaveRepository({ storage: brokenStorage, warn: () => {} })
  const healthy = createSaveRepository({ storage: memory(), now: () => startAt })
  assert.equal(broken.load(), null)
  assert.equal(broken.save(a.state), false)
  assert.equal(brokenStorage.getItem(SAVE_KEY), '{broken')
  assert.equal(healthy.save(b.state), true)

  let clock = startAt
  const game = createGame({ now: () => clock })
  const timers = new Map()
  const schedule = { setInterval: callback => { const id = timers.size; timers.set(id, callback); return id },
    clearInterval: id => timers.delete(id) }
  const runtime = createRuntime({ game, repository: healthy, schedule })
  assert.equal(runtime.start(), true)
  assert.equal(runtime.start(), false)
  clock += 1000
  runtime.step()
  assert.equal(game.state.stats.playTime, 1)
  clock += 10000
  game.reset()
  runtime.resetClock()
  clock += 1000
  runtime.step()
  assert.equal(game.state.stats.playTime, 1)
  assert.equal(runtime.stop(), true)
  assert.equal(timers.size, 0)
  console.log('架构回归检查通过：时限、结算一致、只读重算、兼容兜底与运行实例隔离')
}
