import { reactive } from 'vue'
import { createInitialState } from '../src/game/state.js'
import * as E from './engine-fixture.mjs'

for (const copies of [1000, 10000, 100000, 1000000000]) {
  const state = reactive(createInitialState()), derived = E.createDerived()
  state.buildings.quarry = { count: 1, on: true }
  E.recompute(state, derived)
  state.resources.qi = copies * 15
  state.resources.rock = copies * 3
  derived.max.stone = copies
  const start = performance.now()
  const made = E.craftBatch(state, derived, 'infuseStone')
  const milliseconds = Math.round(performance.now() - start)
  if (made !== copies || state.resources.stone !== copies || state.resources.qi !== 0 || state.resources.rock !== 0 || state.stats.craftCount !== copies) {
    throw new Error(`批量合成结果错误：${copies}`)
  }
  if (milliseconds > 1000) throw new Error(`批量合成阻塞超过一秒：${copies}`)
  console.log(JSON.stringify({ copies, made, milliseconds }))
}
