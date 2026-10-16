import assert from 'node:assert/strict'
import { reactive, toRaw, watch } from 'vue'
import { createGame, createRuntime } from '../src/game/runtime.js'
import { createInitialState, normalizeState } from '../src/game/state.js'
import { runtimeCounters, economyDetailsEnabled } from '../src/game/context.js'
import { powerFixture } from './power-scenarios.mjs'

const startAt = Date.UTC(2026, 9, 15)
const snapshot = value => JSON.parse(JSON.stringify(toRaw(value)))

function makeGame(seed, reactiveState = false) {
  let randomSeed = 1234
  const base = structuredClone(seed)
  const state = reactiveState ? reactive(base) : base
  const game = createGame({ state, snapshotState: snapshot, now: () => startAt + 600000,
    random: () => {
      randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0
      return randomSeed / 4294967296
    } })
  runtimeCounters(state).achievementSeconds = 0.3
  return { game, result: report => ({ state: snapshot(game.state), derived: snapshot(game.derived),
    counters: { ...runtimeCounters(state) }, randomSeed, report }) }
}

export async function runOfflineAsyncChecks(ok) {
  const initial = createInitialState(startAt)
  initial.realm = 4
  initial.dao = 1
  initial.buildings = { hut: { count: 40, on: true }, spiritField: { count: 100, on: true },
    talismanHall: { count: 1, on: true }, incenseCauldron: { count: 1, on: true } }
  initial.disciples.total = 72
  initial.disciples.jobs = { farmer: 30, scholar: 10 }
  initial.upgrades = { intuition: true, talismanArt: true, qiLiquid: true, liquidArt: true, condenseArt: true }
  initial.settings.craftReservePercent = 0
  initial.autoCraft.drawTalisman = true
  initial.resources.wood = 125.5
  initial.resources.qi = 1000
  initial.totalDays = 89.8
  initial.buffs = [{ id: 'short', mult: 0.5, until: startAt + 1500 }]
  const seeds = [normalizeState(initial, { now: startAt }), powerFixture({ chains: 2, core: true }).state]
  for (const [index, seed] of seeds.entries()) {
    const reference = makeGame(seed), asynchronous = makeGame(seed, true)
    const before = snapshot(asynchronous.game.state)
    const reports = []
    let heartbeats = 0, writes = 0
    const stopWatch = watch(() => asynchronous.game.state.stats.playTime, () => writes++, { flush: 'sync' })
    const expected = reference.game.simulateOffline(600.12345, { startAt })
    const actual = await asynchronous.game.simulateOfflineAsync(600.12345, { startAt, maxBatchSteps: 7,
      onProgress: value => reports.push(value),
      yieldControl: () => new Promise(resolve => setTimeout(() => {
        heartbeats++
        assert.deepEqual(snapshot(asynchronous.game.state), before, '批次间不写入部分结果')
        assert.equal(economyDetailsEnabled(asynchronous.game.state), true, '批次间不污染实例上下文')
        resolve()
      }, 0)) })
    stopWatch()
    assert.deepEqual(asynchronous.result(actual), reference.result(expected))
    assert.equal(writes, 1)
    assert.ok(heartbeats > 2)
    assert.equal(reports[0].percent, 0)
    assert.equal(reports.at(-1).percent, 100)
    assert.equal(reports.at(-1).completedSeconds, 600.12345)
    assert.ok(reports.some(value => value.percent > 0 && value.percent < 100))
    assert.ok(reports.every((value, i) => i === 0 || value.percent >= reports[i - 1].percent))
    ok(`异步离线与同步结果完全一致、进度递增且定时器持续执行（场景${index + 1}）`, true)
  }

  // 批次预算只决定让出主线程的时机，不改变段边界与运算顺序。
  {
    const seed = normalizeState(initial, { now: startAt })
    const tight = makeGame(seed), loose = makeGame(seed)
    const one = await tight.game.simulateOfflineAsync(600.12345, { startAt, maxBatchSteps: 1, yieldControl: async () => {} })
    const all = await loose.game.simulateOfflineAsync(600.12345, { startAt, maxBatchSteps: 4096, budgetMs: 1e9, yieldControl: async () => {} })
    assert.deepEqual(tight.result(one), loose.result(all))
    ok('切换异步批次预算不改变离线收益', true)
  }

  for (const operation of ['abort', 'replace']) {
    const { game } = makeGame(seeds[0])
    const controller = new AbortController()
    let expected = snapshot(game.state), changed = false
    await assert.rejects(game.simulateOfflineAsync(600, { startAt, maxBatchSteps: 1,
      signal: controller.signal, yieldControl: async () => {}, onProgress: value => {
        if (!changed && value.percent > 0) {
          changed = true
          if (operation === 'abort') controller.abort()
          else game.reset()
          expected = snapshot(game.state)
        }
      } }), { name: 'AbortError' })
    assert.deepEqual(snapshot(game.state), expected)
    ok(`异步离线中途${operation === 'abort' ? '取消' : '重开'}不覆盖当前存档`, true)
  }

  for (const operation of ['resetClock', 'stop']) {
    let now = startAt, runtime, reports = 0, saves = 0, cancelled = false
    const game = createGame({ state: structuredClone(seeds[0]), now: () => now })
    const before = snapshot(game.state)
    runtime = createRuntime({ game, repository: { loadError: '', save: () => { saves++; return true } },
      schedule: { setInterval: () => 1, clearInterval: () => {} },
      onAdvance: () => reports++, deferAdvance: run => run({ maxBatchSteps: 1,
        yieldControl: async () => {}, onProgress: value => {
          assert.equal(runtime.step(), undefined, '处理中不重复进入结算')
          if (!cancelled && value.percent > 0) { cancelled = true; runtime[operation]() }
        } }) })
    runtime.start()
    now += 60000
    await assert.rejects(runtime.step(), { name: 'AbortError' })
    assert.deepEqual(snapshot(game.state), before)
    assert.equal(reports, 0)
    assert.equal(saves, 0)
    runtime.stop()
    ok(`异步补算中${operation}取消旧任务、不重复推进或自动保存`, true)
  }

  const failed = makeGame(seeds[0]).game
  const beforeFailure = snapshot(failed.state)
  await assert.rejects(failed.simulateOfflineAsync(60, { startAt,
    yieldControl: async () => { throw new Error('scheduler failed') } }), /scheduler failed/)
  assert.deepEqual(snapshot(failed.state), beforeFailure)
  ok('异步调度异常不写回部分收益', true)
}
