/** 审计夹具仍可按人数设置初始条件；显式同步后才调用只读的派生计算。 */
import * as engine from '../src/game/engine.js'
import { syncDisciples } from '../src/data/disciples.js'

export * from '../src/game/engine.js'

export function recompute(state, derived, seconds) {
  syncDisciples(state.disciples, { legacy: true })
  engine.trackPeak(state)
  return engine.recompute(state, derived, seconds)
}

export function tick(state, derived, seconds, options) {
  syncDisciples(state.disciples, { legacy: true })
  engine.trackPeak(state)
  return engine.tick(state, derived, seconds, options)
}

export function simulateOffline(state, derived, seconds, options) {
  syncDisciples(state.disciples, { legacy: true })
  engine.trackPeak(state)
  return engine.simulateOffline(state, derived, seconds, options)
}
