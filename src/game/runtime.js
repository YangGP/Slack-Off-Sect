import * as engine from './engine'
import { createInitialState } from './state'
import { setGameContext, resetRuntimeCounters } from './context'
import { createSaveRepository, restoreSave } from './save'
import { CONFIG } from '@/data/config'

/**
 * 创建无 Vue/DOM 依赖的游戏实例。
 * @param {{state?: object, derived?: object, now?: () => number, random?: () => number}} options
 */
export function createGame({ state, derived = engine.createDerived(),
  now = () => Date.now(), random = () => Math.random() } = {}) {
  state ||= createInitialState(now())
  setGameContext(state, { now, random })
  engine.recompute(state, derived)

  function replaceState(next) {
    for (const key of Object.keys(state)) if (!(key in next)) delete state[key]
    Object.assign(state, next)
    resetRuntimeCounters(state)
    engine.recompute(state, derived)
  }

  return {
    state, derived, now,
    recompute: () => engine.recompute(state, derived),
    replaceState,
    restore: data => replaceState(restoreSave(data, { now: now() })),
    reset: () => replaceState(createInitialState(now())),
    tick: (seconds, options = {}) => engine.tick(state, derived, seconds, { startAt: state.lastTickAt, ...options }),
    simulateOffline: (seconds, options = {}) => engine.simulateOffline(state, derived, seconds, { startAt: state.lastTickAt, ...options }),
    advance(seconds, { startAt = now() - seconds * 1000 } = {}) {
      if (!Number.isFinite(seconds) || seconds <= 0) return null
      if (seconds <= 3) {
        engine.tick(state, derived, seconds, { startAt })
        return null
      }
      const cap = (derived.offlineHours || CONFIG.OFFLINE_CAP_HOURS) * 3600
      const result = engine.simulateOffline(state, derived, Math.min(seconds, cap), { startAt })
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
  }, onSaved = () => {}, onAdvance = () => {} } = {}) {
  let handle = null
  let last = game.now()
  let autosaveSeconds = 0

  function resetClock() {
    last = game.now()
    autosaveSeconds = 0
  }

  function save() {
    const ok = repository.save(game.state)
    if (ok) onSaved(game.state.lastSaveAt)
    return ok
  }

  function step() {
    const now = game.now()
    const seconds = (now - last) / 1000
    const startAt = last
    last = now
    if (seconds <= 0.001 || repository.loadError) return
    const report = game.advance(seconds, { startAt })
    onAdvance(seconds, report)
    autosaveSeconds += seconds
    if (game.state.settings.autosave && autosaveSeconds >= CONFIG.AUTOSAVE_MS / 1000) {
      autosaveSeconds = 0
      save()
    }
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
      if (handle === null) return false
      schedule.clearInterval(handle)
      handle = null
      return true
    },
    get running() { return handle !== null },
  }
}
