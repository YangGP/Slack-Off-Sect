import assert from 'node:assert/strict'
import * as E from '../src/game/engine.js'
import { createInitialState, normalizeState } from '../src/game/state.js'
import { exportJson, parseImport, restoreSave, createSaveRepository, SAVE_KEY } from '../src/game/save.js'
import { withGameContext } from '../src/game/context.js'
import { SAVE_VERSION } from '../src/game/saveSchema.js'
import { createGame, createRuntime } from '../src/game/runtime.js'
import { runtimeCounters } from '../src/game/context.js'
import { reactive, toRaw, watch } from 'vue'
import { ACHIEVEMENTS } from '../src/data/achievements.js'
import { EVENTS } from '../src/data/events.js'
import { eventEligible } from '../src/game/systems/events.js'
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

  // 超过粗步长门槛的离线结算必须与逐秒参考一致，包括跨季节与库存边界。
  for (const withHousing of [false, true]) {
    const coarse = createInitialState(startAt)
    coarse.buildings.spiritField = { count: 1, on: true }
    coarse.totalDays = 89
    if (withHousing) coarse.buildings.hut = { count: 1, on: true }
    const fine = normalizeState(JSON.parse(JSON.stringify(coarse)), { now: startAt })
    const cd = E.createDerived(), fd = E.createDerived()
    E.simulateOffline(coarse, cd, 70, { startAt })
    for (let i = 0; i < 70; i++) E.tick(fine, fd, 1, { offline: true, events: false, startAt: startAt + i * 1000 })
    for (const id of Object.keys(coarse.resources)) assert.ok(Math.abs(coarse.resources[id] - fine.resources[id]) < 1e-8, `长离线资源 ${id}, 居所=${withHousing}`)
    assert.deepEqual(coarse.disciples, fine.disciples)
  }

  // 凝聚迁移只补历史能力的新增上游，标记独立于灵气分子字段并随存档持久化。
  for (const hasParticle of [false, true]) {
    const legacy = createInitialState(startAt)
    delete legacy.qiLiquidVersion
    if (!hasParticle) delete legacy.resources.qiParticle
    legacy.upgrades.liquidArt = true
    legacy.autoCraft.condenseLiquid = true
    const migrated = normalizeState(legacy)
    assert.ok(migrated.upgrades.qiMeasure && migrated.upgrades.qiLiquid)
    assert.ok(E.isCraftUnlocked(migrated, E.CRAFT_MAP.condenseLiquid))
    assert.equal(migrated.autoCraft.condenseLiquid, true)
    assert.equal(legacy.upgrades.qiLiquid, undefined)
    assert.equal(legacy.qiLiquidVersion, undefined)
    const reloaded = parseImport(exportJson(migrated))
    assert.equal(reloaded.qiLiquidVersion, 2)
    assert.deepEqual(reloaded.upgrades, migrated.upgrades)
  }
  for (const liquidArt of [false, true]) {
    const current = createInitialState(startAt)
    current.upgrades.liquidArt = liquidArt
    const reloaded = parseImport(exportJson(current))
    assert.equal(reloaded.qiLiquidVersion, 2)
    assert.equal(reloaded.upgrades.qiMeasure, undefined)
    assert.equal(reloaded.upgrades.qiLiquid, undefined)
    assert.equal(E.isCraftUnlocked(reloaded, E.CRAFT_MAP.condenseLiquid), false)
  }
  const earlyLegacy = createInitialState(startAt)
  delete earlyLegacy.qiLiquidVersion
  assert.equal(normalizeState(earlyLegacy).upgrades.qiLiquid, undefined)

  const condenseChain = ['qiLiquid', 'liquidArt', 'qiPurify', 'crystalTheory']
  for (const version of [undefined, 1, 2]) {
    const earlyCondense = createInitialState(startAt)
    earlyCondense.qiLiquidVersion = version
    earlyCondense.upgrades.condenseArt = true
    const restored = normalizeState(earlyCondense)
    assert.equal(restored.upgrades.condenseArt, true)
    assert.ok(condenseChain.every(id => !restored.upgrades[id]))
    const restoredDerived = E.createDerived()
    E.recompute(restored, restoredDerived)
    assert.equal(restoredDerived.autoCondenseLiquidUnlocked, true)
    assert.deepEqual(parseImport(exportJson(restored)).upgrades, restored.upgrades)
  }
  for (const [index, highest] of condenseChain.entries()) {
    const previousChain = createInitialState(startAt)
    previousChain.qiLiquidVersion = 1
    previousChain.upgrades[highest] = true
    const originalChain = JSON.stringify(previousChain)
    const migrated = normalizeState(previousChain)
    assert.ok(migrated.upgrades.qiMeasure)
    assert.ok(condenseChain.slice(0, index + 1).every(id => migrated.upgrades[id]))
    assert.ok(condenseChain.slice(index + 1).every(id => !migrated.upgrades[id]))
    assert.equal(JSON.stringify(previousChain), originalChain)
    const twice = parseImport(exportJson(migrated))
    assert.equal(twice.qiLiquidVersion, 2)
    assert.deepEqual(twice.upgrades, migrated.upgrades)
  }

  // 先补偿已移除的驯养投入，再过滤旧条目；重复读档与重修不能重复发放。
  assert.equal(E.BUILDING_MAP.beastGarden, undefined)
  assert.equal(E.UPGRADE_MAP.beastTaming, undefined)
  assert.equal(E.UPGRADE_MAP.beastBell, undefined)
  const beastLegacy = createInitialState(startAt)
  delete beastLegacy.beastRetirementVersion
  beastLegacy.buildings.beastGarden = { count: 1, on: false }
  beastLegacy.upgrades.beastTaming = true
  beastLegacy.upgrades.beastBell = true
  beastLegacy.treasureLevels.beastBell = 1
  const originalBeastSave = JSON.stringify(beastLegacy)
  const retiredBeasts = normalizeState(beastLegacy)
  assert.equal(JSON.stringify(beastLegacy), originalBeastSave)
  assert.equal(retiredBeasts.beastRetirementVersion, 1)
  assert.equal(retiredBeasts.buildings.beastGarden, undefined)
  assert.equal(retiredBeasts.upgrades.beastTaming, undefined)
  assert.equal(retiredBeasts.upgrades.beastBell, undefined)
  assert.equal(retiredBeasts.treasureLevels.beastBell, undefined)
  for (const [resource, amount] of Object.entries({ wood: 3000, plank: 15, herb: 13500,
    stone: 13800, insight: 65200, pill: 40 })) assert.equal(retiredBeasts.resources[resource], amount)
  const beastReloaded = parseImport(exportJson(retiredBeasts))
  assert.deepEqual(beastReloaded.resources, retiredBeasts.resources)
  assert.equal(beastReloaded.log.length, retiredBeasts.log.length)
  const extremeBeasts = createInitialState(startAt)
  delete extremeBeasts.beastRetirementVersion
  extremeBeasts.buildings.beastGarden = { count: Number.MAX_SAFE_INTEGER, on: true }
  extremeBeasts.upgrades.beastBell = true
  extremeBeasts.treasureLevels.beastBell = Number.MAX_SAFE_INTEGER
  assert.ok(Object.values(normalizeState(extremeBeasts).resources).every(Number.isFinite))
  const unownedBell = createInitialState(startAt)
  delete unownedBell.beastRetirementVersion
  unownedBell.treasureLevels.beastBell = 5
  assert.equal(normalizeState(unownedBell).resources.insight, 0)

  // 加工耗尽维护材料后，收徒与事件必须读取刷新后的供给，不能沿用加工前的设施效果。
  const markAchievements = state => {
    state.achievements = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, true]))
  }
  for (const offlineMode of [false, true]) {
    const seed = createInitialState(startAt)
    seed.dao = 1
    seed.settings.craftReservePercent = 0
    seed.buildings = { hut: { count: 40, on: true }, incenseCauldron: { count: 1, on: true },
      talismanHall: { count: 1, on: true } }
    seed.disciples.total = 72
    Object.assign(seed.resources, { qi: 1000, wood: 125.32 })
    seed.arrivalTimer = 14
    seed.autoCraft.drawTalisman = true
    seed.craftTimers.drawTalisman = { t: 1, made: 0 }
    markAchievements(seed)
    const state = normalizeState(seed), derived = E.createDerived()
    withGameContext(state, { now: () => startAt, random: () => 0.9 }, () => {
      E.recompute(state, derived)
      assert.equal(derived.leaveChance, 0)
      if (offlineMode) E.simulateOffline(state, derived, 1, { startAt })
      else E.tick(state, derived, 1, { startAt, events: false })
    })
    assert.equal(state.resources.talisman, 1)
    assert.equal(state.resources.wood, 0)
    assert.equal(state.disciples.total, 72)
    assert.equal(state.stats.recruits, 0)
    assert.equal(derived.leaveChance, 0.04)
  }
  const disasterState = createInitialState(startAt), disasterDerived = E.createDerived()
  disasterState.dao = 1
  disasterState.settings.craftReservePercent = 0
  disasterState.buildings.mountainArray = { count: 1, on: true }
  Object.assign(disasterState.resources, { qi: 8, wood: 100, herb: 100, ore: 100 })
  disasterState.autoCraft.growWood = true
  disasterState.nextEventAt = startAt
  markAchievements(disasterState)
  const pool = EVENTS.filter(event => eventEligible(disasterState, event))
  const disaster = pool.find(event => event.id === 'beastRaid')
  assert.ok(disaster)
  const preceding = pool.slice(0, pool.indexOf(disaster)).reduce((sum, event) => sum + event.weight, 0)
  const roll = (preceding + disaster.weight / 2) / pool.reduce((sum, event) => sum + event.weight, 0)
  let draws = 0
  withGameContext(disasterState, { now: () => startAt, random: () => draws++ === 0 ? roll : 0 }, () => {
    E.recompute(disasterState, disasterDerived)
    assert.equal(disasterDerived.disasterGuard, 0.15)
    E.tick(disasterState, disasterDerived, 1, { startAt })
  })
  assert.equal(disasterState.resources.qi, 0)
  assert.equal(disasterDerived.disasterGuard, 0)
  assert.equal(disasterState.stats.disasters, 1)
  assert.equal(disasterState.resources.ore, 94)
  assert.ok(!disasterState.log.some(entry => entry.text.includes('大阵挡下')))

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

  // 页面恢复使用普通副本逐秒补算；验证收益、个人成长、期限、加工与随机调用不变。
  const catchupSeed = createInitialState(startAt)
  catchupSeed.realm = 4
  catchupSeed.dao = 1
  catchupSeed.settings.craftReservePercent = 0
  catchupSeed.buildings = { spiritField: { count: 100, on: true }, hut: { count: 40, on: true },
    library: { count: 3, on: true }, granary: { count: 10, on: true },
    incenseCauldron: { count: 1, on: true }, talismanHall: { count: 1, on: true } }
  catchupSeed.disciples.total = 72
  catchupSeed.disciples.jobs = { farmer: 30, scholar: 10 }
  catchupSeed.upgrades = { qiOrigin: true, qiGazing: true, qiMeasure: true, qiLiquid: true,
    liquidArt: true, condenseArt: true, talismanArt: true, intuition: true }
  Object.assign(catchupSeed.resources, { qi: 1000, wood: 5000, stone: 100 })
  catchupSeed.autoCraft.drawTalisman = true
  catchupSeed.buffs = make().state.buffs
  const catchupResults = []
  for (const snapshot of [false, true]) {
    const base = normalizeState(JSON.parse(JSON.stringify(catchupSeed)))
    const state = snapshot ? reactive(base) : base
    const derived = snapshot ? reactive(E.createDerived()) : E.createDerived()
    let randomCalls = 0, resourceChanges = 0
    const game = createGame({ state, derived, now: () => startAt + 600100,
      random: () => { randomCalls++; return 0.9 },
      snapshotState: snapshot ? value => JSON.parse(JSON.stringify(toRaw(value))) : null })
    runtimeCounters(state).achievementSeconds = 0.3
    const unwatch = snapshot ? watch(() => state.resources.qi, () => resourceChanges++, { flush: 'sync' }) : () => {}
    const report = game.advance(600.1, { startAt })
    unwatch()
    if (snapshot) assert.equal(resourceChanges, 1, '离线资源一次同步，不逐秒触发响应式更新')
    catchupResults.push({ state: JSON.parse(JSON.stringify(toRaw(state))),
      derived: JSON.parse(JSON.stringify(toRaw(derived))), report, randomCalls,
      counters: { ...runtimeCounters(state) } })
  }
  assert.deepEqual(catchupResults[1], catchupResults[0])
  // 副本失败不能将已推进一半的收益写回界面。
  const failedCatchup = createGame({ now: () => startAt,
    snapshotState: () => { throw new Error('snapshot failed') } })
  const unchanged = JSON.stringify(failedCatchup.state)
  assert.throws(() => failedCatchup.advance(60), /snapshot failed/)
  assert.equal(JSON.stringify(failedCatchup.state), unchanged)
  // 加载提示等待绘制时不重复推进；读档或停止循环会取消尚未执行的旧任务。
  for (const cancel of ['resetClock', 'stop']) {
    let resume, finish
    const deferredGame = createGame({ now: () => clock })
    const deferred = createRuntime({ game: deferredGame, repository: healthy, schedule,
      deferAdvance: run => {
        resume = run
        return new Promise(resolve => { finish = resolve })
      } })
    deferred.start()
    clock += 60000
    const completion = deferred.step()
    assert.ok(completion instanceof Promise)
    assert.equal(deferred.step(), undefined)
    assert.equal(deferredGame.state.stats.playTime, 0)
    deferred[cancel]()
    resume()
    finish()
    assert.equal(deferredGame.state.stats.playTime, 0)
    deferred.stop()
  }
  console.log('架构回归检查通过：时限、结算一致、只读重算、兼容兜底与运行实例隔离')
}
