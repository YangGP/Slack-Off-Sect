import { createInitialState } from '../../src/game/state.js'
import * as E from '../engine-fixture.mjs'

export function newGame() {
  const state = createInitialState()
  const derived = E.createDerived()
  E.recompute(state, derived)
  return { state, derived }
}

/** 已有弟子、住房与初始资源，用于只关注机制本身的检查。 */
export function newGameRunning() {
  const state = createInitialState()
  state.resources.qi = 2000
  state.resources.wood = 2000
  state.resources.stone = 200
  state.buildings.hut = { count: 1, on: true }
  state.buildings.spiritField = { count: 1, on: true }
  state.disciples.total = 4
  E.trackPeak(state)
  const derived = E.createDerived()
  E.recompute(state, derived)
  return { state, derived }
}

export const successfulBreakthrough = (state, derived) => E.breakthrough(state, derived, {}, () => 0)
