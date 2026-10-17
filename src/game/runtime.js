import * as engine from './engine'
import { createInitialState } from './state'
import { setGameContext, resetRuntimeCounters, runtimeCounters } from './context'
import { createSaveRepository, restoreSave } from './save'
import { cloneRuntime } from './clone'
import { CONFIG } from '@/data/config'
import { throwIfSimulationCancelled } from './systems/simulation'

/**
 * 创建无 Vue/DOM 依赖的游戏实例。
 * @param {{state?: object, derived?: object, now?: () => number, random?: () => number}} options
 */
export function createGame({ state, derived = engine.createDerived(), snapshotState = null,
  now = () => Date.now(), random = () => Math.random() } = {}) {
  state ||= createInitialState(now())
  let stateRevision = 0
  setGameContext(state, { now, random })
  engine.recompute(state, derived)

  function replaceState(next) {
    stateRevision++
    for (const key of Object.keys(state)) if (!(key in next)) delete state[key]
    Object.assign(state, next)
    resetRuntimeCounters(state)
    engine.recompute(state, derived)
  }

  // 界面实例可提供普通数据副本：逐秒推演不触发响应式读写，完成后一次同步。
  // 原实例只在推演成功后更新，时钟、随机源及成就周期与直接结算保持一致。
  function simulateOffline(seconds, options = {}) {
    const opts = { startAt: state.lastTickAt, ...options }
    if (!snapshotState || !Number.isFinite(seconds) || seconds <= 0) {
      return engine.simulateOffline(state, derived, seconds, opts)
    }
    const working = snapshotState(state)
    const workingDerived = engine.createDerived()
    setGameContext(working, { now, random })
    Object.assign(runtimeCounters(working), runtimeCounters(state))
    engine.recompute(working, workingDerived)
    const result = engine.simulateOffline(working, workingDerived, seconds, opts)
    Object.assign(state, working)
    Object.assign(runtimeCounters(state), runtimeCounters(working))
    engine.recompute(state, derived)
    return result
  }

  async function simulateOfflineAsync(seconds, options = {}) {
    const revision = stateRevision
    const opts = { startAt: state.lastTickAt, ...options,
      isCancelled: () => revision !== stateRevision || options.isCancelled?.() }
    throwIfSimulationCancelled(opts)
    // 没有外部快照函数时用统一运行时深拷贝：金额在这里必须仍是 Decimal，
    // structuredClone 会丢掉 Decimal 原型，副本将无法继续运算。
    const working = snapshotState ? snapshotState(state) : cloneRuntime(state)
    const workingDerived = engine.createDerived()
    setGameContext(working, { now, random })
    Object.assign(runtimeCounters(working), runtimeCounters(state))
    const result = await engine.simulateOfflineAsync(working, workingDerived, seconds, opts)
    // 读档、重开或停止循环后，旧副本不能覆盖新状态。
    throwIfSimulationCancelled(opts)
    Object.assign(state, working)
    Object.assign(runtimeCounters(state), runtimeCounters(working))
    engine.recompute(state, derived)
    return result
  }

  return {
    state, derived, now,
    recompute: () => engine.recompute(state, derived),
    replaceState,
    restore: data => replaceState(restoreSave(data, { now: now() })),
    reset: () => replaceState(createInitialState(now())),
    tick: (seconds, options = {}) => engine.tick(state, derived, seconds, { startAt: state.lastTickAt, ...options }),
    simulateOffline,
    simulateOfflineAsync,
    async advanceAsync(seconds, options = {}) {
      if (!Number.isFinite(seconds) || seconds <= 0) return null
      const startAt = options.startAt ?? now() - seconds * 1000
      const cap = (derived.offlineHours || CONFIG.OFFLINE_CAP_HOURS) * 3600
      const result = await simulateOfflineAsync(Math.min(seconds, cap), { ...options, startAt })
      state.buffs = state.buffs.filter(buff => buff.until > now())
      engine.settleExpiredThreat(state, derived)
      engine.recompute(state, derived)
      return result
    },
    advance(seconds, { startAt = now() - seconds * 1000 } = {}) {
      if (!Number.isFinite(seconds) || seconds <= 0) return null
      if (seconds <= 3) {
        engine.tick(state, derived, seconds, { startAt })
        return null
      }
      const cap = (derived.offlineHours || CONFIG.OFFLINE_CAP_HOURS) * 3600
      const result = simulateOffline(Math.min(seconds, cap), { startAt })
      // 超过收益上限的现实时间不产出，但现实时限仍到期。
      state.buffs = state.buffs.filter(buff => buff.until > now())
      engine.settleExpiredThreat(state, derived)
      engine.recompute(state, derived)
      return result
    },
  }
}

/** 每个运行实例拥有自己的循环、自动保存计时器和存储故障状态。 */
export function createRuntime({ game = createGame(), repository = createSaveRepository({ now: game.now }),
  schedule = {
    // Window 的原生定时器要求正确的接收对象，不能作为 schedule 的方法直接调用。
    setInterval: (callback, delay) => globalThis.setInterval(callback, delay),
    clearInterval: handle => globalThis.clearInterval(handle),
  }, onSaved = () => {}, onAdvance = () => {}, deferAdvance = null } = {}) {
  let handle = null
  let last = game.now()
  let autosaveSeconds = 0
  let advancing = false
  let revision = 0

  function resetClock() {
    revision++
    last = game.now()
    autosaveSeconds = 0
  }

  function save() {
    const ok = repository.save(game.state)
    if (ok) onSaved(game.state.lastSaveAt)
    return ok
  }

  function step() {
    if (advancing) return
    const now = game.now()
    const seconds = (now - last) / 1000
    const startAt = last
    last = now
    if (seconds <= 0.001 || repository.loadError) return
    const current = revision
    const finish = report => {
      if (current !== revision) return
      onAdvance(seconds, report)
      autosaveSeconds += seconds
      if (game.state.settings.autosave && autosaveSeconds >= CONFIG.AUTOSAVE_MS / 1000) {
        autosaveSeconds = 0
        save()
      }
    }
    const run = (options = {}) => {
      if (current !== revision) return
      if (deferAdvance && seconds > 3) {
        return game.advanceAsync(seconds, { ...options, startAt,
          isCancelled: () => current !== revision || options.isCancelled?.() }).then(finish)
      }
      return finish(game.advance(seconds, { startAt }))
    }
    if (deferAdvance && seconds > 3) {
      advancing = true
      return Promise.resolve(deferAdvance(run)).finally(() => { advancing = false })
    }
    return run()
  }

  return {
    game, repository, step, save, resetClock,
    load() {
      const restored = repository.load()
      if (restored) game.replaceState(restored)
      resetClock()
      return restored
    },
    start() {
      if (handle !== null || repository.loadError) return false
      resetClock()
      handle = schedule.setInterval(step, CONFIG.TICK_MS)
      return true
    },
    stop() {
      revision++
      if (handle === null) return false
      schedule.clearInterval(handle)
      handle = null
      return true
    },
    get running() { return handle !== null },
  }
}
